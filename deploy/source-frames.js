// Encoded presentation times are independent of the editable timing calibration.
// Browsers round seeks to microseconds; tolerate that rounding, not a whole frame.
const EPSILON = 0.000002;
const durationOf = clip => {const value=clip.video?.duration??clip.duration??Infinity;return Number.isNaN(value)?0:value;};
export const sourceRate = clip => clip.sourceFps || clip.fps || 30;
function upperBound(times, time) {
  let low=0,high=times.length;
  while(low<high){const mid=(low+high)>>>1;if(times[mid]<=time)low=mid+1;else high=mid;}
  return low;
}
export function lastSourceFrame(clip) {
  const duration=durationOf(clip),times=clip.sourceFrames;
  if(times?.length)return Math.max(0,upperBound(times,duration-EPSILON)-1);
  return Math.max(0,Math.ceil(duration*sourceRate(clip)-.00001)-1);
}
export function sourceFrameNumber(time,clip) {
  const times=clip.sourceFrames;
  const index=times?.length?upperBound(times,time+EPSILON)-1:Math.floor((time+EPSILON)*sourceRate(clip));
  return Math.max(0,Math.min(lastSourceFrame(clip),index));
}
export function sourceFrameTime(index,clip) {
  const frame=Math.max(0,Math.min(lastSourceFrame(clip),index));
  return clip.sourceFrames?.length?clip.sourceFrames[frame]:frame/sourceRate(clip);
}
export function stepSourceFrame(time,direction,clip) {
  return sourceFrameTime(sourceFrameNumber(time,clip)+direction,clip);
}
// Chromium truncates currentTime to microseconds. Round a target UP by at most
// one microsecond so a frame boundary cannot decode the preceding picture.
export function frameSeekTime(time,clip) {
  if(clip?.sourceSeeks?.length){const index=sourceFrameNumber(time,clip);if(Math.abs(time-sourceFrameTime(index,clip))<EPSILON)time=clip.sourceSeeks[index];}
  return Math.max(0,Math.ceil(time*1e6-1e-7)/1e6);
}
// Shared transport visits the union of both calibrated frame boundaries. A
// slower clip can hold its picture for a step; no faster clip loses a frame.
export function adjacentSourceBoundary(time,direction,clip) {
  let index=sourceFrameNumber(time,clip);
  if(direction>0)index++;
  else if(sourceFrameTime(index,clip)>=time-EPSILON)index--;
  if(index<0||index>lastSourceFrame(clip))return null;
  return sourceFrameTime(index,clip);
}

export function readSourceFrames(file,{signal,timeout=10000}={}) {
  return new Promise(resolve=>{
    if(signal?.aborted)return resolve(null);
    let worker,timer,finished=false;
    const finish=result=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();resolve(result);};
    const abort=()=>finish(null);
    try{
      worker=new Worker(new URL('./source-frames-worker.js',import.meta.url),{type:'module'});
      signal?.addEventListener('abort',abort,{once:true});
      worker.onmessage=({data})=>finish(data?.times instanceof Float64Array&&data.times.length&&data.seeks instanceof Float64Array&&data.times.length===data.seeks.length?data:null);
      worker.onerror=event=>{event.preventDefault();finish(null);};
      worker.onmessageerror=()=>finish(null);timer=setTimeout(()=>finish(null),timeout);worker.postMessage(file);
    }catch{finish(null);}
  });
}
