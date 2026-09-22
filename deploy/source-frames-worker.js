import {Input,CustomSource,MP4,QTFF,MATROSKA,WEBM,EncodedPacketSink} from './vendor/mediabunny/mediabunny.mjs';

self.onmessage=async({data:file})=>{
  let input,bytesRead=0;
  try{
    input=new Input({formats:[MP4,QTFF,MATROSKA,WEBM],source:new CustomSource({
      getSize:()=>file.size,maxCacheSize:8*1024*1024,prefetchProfile:'fileSystem',
      read:async(start,end)=>{
        bytesRead+=end-start;if(bytesRead>32*1024*1024)throw new Error('Frame index read limit');
        return new Uint8Array(await file.slice(start,end).arrayBuffer());
      },
    })});
    const track=await input.getPrimaryVideoTrack();if(!track)throw new Error('No video track');
    const format=await input.getFormat();
    const tick=format===WEBM||format===MATROSKA?1/await track.getTimeResolution():0;
    const sink=new EncodedPacketSink(track),packets=[];
    for await(const packet of sink.packets(undefined,undefined,{metadataOnly:true})){
      if(packets.length>=500000)throw new Error('Frame index size limit');
      if(Number.isFinite(packet.timestamp)&&packet.timestamp+packet.duration>0)packets.push({time:Math.max(0,packet.timestamp),end:packet.timestamp+packet.duration});
    }
    // B-frames arrive in decode order. Navigation needs presentation order.
    packets.sort((a,b)=>a.time-b.time);
    const frames=packets.filter((p,i)=>!i||p.time>packets[i-1].time);
    const times=Float64Array.from(frames,p=>p.time);
    // WebM's quantized PTS can overlap the previous frame's browser duration.
    // Move one container tick inside the frame, bounded by its midpoint. Keep
    // canonical PTS separately for frame numbers and markers; never skip frames.
    const seeks=Float64Array.from(frames,(p,i)=>p.time===0?0:Math.min(Math.max(p.time+tick,frames[i-1]?.end??p.time),p.time+((frames[i+1]?.time??p.end)-p.time)/2));
    self.postMessage({times,seeks},[times.buffer,seeks.buffer]);
  }catch{self.postMessage(null);}finally{input?.dispose();}
};
