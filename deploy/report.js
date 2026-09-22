import { MOMENT_COLORS, momentSource } from './keyframes.js';
import { seconds, frameNumber } from './timing.js';
import { MEASUREMENTS } from './analysis.js';

let library;
function pdfLibrary() {
  if (!library) library = new Promise((resolve,reject) => {
    const script = document.createElement('script'); script.src = new URL('./vendor/jspdf.umd.min.js',import.meta.url).href;
    const timer = setTimeout(()=>fail(),15000);
    function fail() { clearTimeout(timer); script.remove(); library = null; reject(new Error('The PDF tools could not load. Please try again.')); }
    script.onerror = fail;
    script.onload = () => { clearTimeout(timer); resolve(window.jspdf.jsPDF); };
    document.head.append(script);
  });
  return library;
}

const BRAND = 'FreeGolfSwingAnalyzer.com';
const real = (time,clip) => time / clip.mediaSecondsPerRealSecond;
const stamp = (time,clip) => `${seconds(real(time,clip))} real s  |  Frame ${frameNumber(time,clip.frameRate,clip.duration)}`;
const interval = (range,clip) => range ? `${seconds(real(range[0],clip))} - ${seconds(real(range[1],clip))} s` : 'Not analyzed';
const angle = value => Number.isFinite(value) ? `${value.toFixed(1)}°` : '-';

export async function createPdfReport(report) {
  const jsPDF = await pdfLibrary();
  const doc = new jsPDF({unit:'mm',format:'a4',compress:false,putOnlyUsedFonts:true});
  doc.setProperties({title:`${BRAND} - Swing review`,subject:'Golf swing frames, moments and analysis',creator:BRAND});
  const green='#203D2F',muted='#55675B',pale='#F0F4EA';
  function text(value,x,y,size=10,color=green,bold=false,options={}) {
    doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(color);doc.text(String(value),x,y,options);
  }
  function wrap(value,x,y,width,size=10,color=muted) {
    doc.setFont('helvetica','normal');doc.setFontSize(size);
    const lines=doc.splitTextToSize(String(value),width);
    doc.setTextColor(color);doc.text(lines,x,y,{lineHeightFactor:1.25});
    return lines.length*size*.3528*1.25;
  }
  function rect(x,y,w,h,color) { doc.setFillColor(color);doc.rect(x,y,w,h,'F'); }
  // Keep ordinary filenames searchable; browser fonts also preserve Unicode
  // filenames without uploading them or fetching a font during export.
  function filename(value,x,y,width) {
    if(/^[\x20-\x7e]*$/.test(value)) {
      doc.setFont('helvetica','normal');doc.setFontSize(9);
      let label=value;
      while(label.length&&doc.getTextWidth(label)>width)label=label.slice(0,-1);
      text(label===value?label:label.slice(0,-3)+'...',x,y,9,muted);return;
    }
    const canvas=document.createElement('canvas');canvas.width=Math.round(width*10);canvas.height=48;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.font='32px sans-serif';ctx.fillStyle=muted;
    const chars=Array.from(value);while(chars.length&&ctx.measureText(chars.join('')).width>canvas.width-10)chars.pop();
    let label=chars.join('');if(label!==value)label=Array.from(label).slice(0,-3).join('')+'...';
    ctx.fillText(label,0,34);doc.addImage(canvas.toDataURL('image/png'),'PNG',x,y-3.4,width,4.8);
  }
  let pageNumber=0;
  for(const clip of report.clips) {
    const frames=[{label:'Current frame',time:clip.currentTime,image:clip.currentImage,measurements:clip.currentMeasurements,observations:clip.observations},...(clip.visualMoments||[])];
    for(const frame of frames) {
      if(!frame.image)continue;
      const properties=doc.getImageProperties(frame.image),ratio=properties.width/properties.height;
      const landscape=ratio>=1,orientation=landscape?'landscape':'portrait';
      if(pageNumber++)doc.addPage('a4',orientation);
      else {doc.deletePage(1);doc.addPage('a4',orientation);}
      const width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight();
      const margin=12,contentWidth=width-24,statsWidth=landscape?70:60;
      const imageAreaWidth=contentWidth-statsWidth-8,imageAreaHeight=landscape?106:height-64;
      const imageWidth=Math.min(imageAreaWidth,imageAreaHeight*ratio),imageHeight=imageWidth/ratio;
      const imageX=margin+(imageAreaWidth-imageWidth)/2,imageY=42;
      const statsX=width-margin-statsWidth;
      const source=frame.source?momentSource(frame.source):'Your current view';
      const accent=frame.source==='sampled'?muted:MOMENT_COLORS[frame.key]||green;
      text(BRAND,margin,11,11,green,true);
      text(report.created,width-margin,11,9,muted,false,{align:'right'});
      text(`${report.clips.length===2?`Swing ${clip.name}`:'Your swing'} / ${frame.label}`,margin,23,landscape?21:18,green,true);
      filename(clip.file,margin,30,contentWidth);
      text(`${stamp(frame.time,clip)}  /  ${source}`,margin,37,10,accent,true);
      rect(imageX,imageY,imageWidth,imageHeight,green);
      doc.addImage(frame.image,'JPEG',imageX,imageY,imageWidth,imageHeight);
      // A print-safe watermark is placed ON each frame, independently of the
      // page footer, and remains legible on light or dark footage.
      const watermarkSize=Math.min(12,imageWidth/5.8);
      doc.saveGraphicsState();doc.setGState(new doc.GState({opacity:.8}));
      rect(imageX,imageY+imageHeight-9,imageWidth,9,green);doc.restoreGraphicsState();
      text(BRAND,imageX+imageWidth/2,imageY+imageHeight-3,watermarkSize,'#FFFFFF',true,{align:'center'});
      rect(imageX,imageY,imageWidth,1.4,accent);
      text('Frame measurements',statsX,46,11,green,true);
      MEASUREMENTS.forEach(([key,label],i)=>{
        const y=50+i*8;rect(statsX,y,statsWidth,8,i%2?'#FFFFFF':pale);
        text(label,statsX+2,y+5.5,10);
        text(angle(frame.measurements?.[key]),statsX+statsWidth-2,y+5.5,11,green,true,{align:'right'});
      });
      const autoTempo=['address','top','impact'].some(key=>!Number.isFinite(clip.marks[key]));
      text('Swing tempo',statsX,123,11,green,true);
      if(Number.isFinite(clip.tempo)) {
        text(`${clip.tempo.toFixed(2)} : 1${autoTempo?' (estimated)':''}`,statsX,130,12,green,true);
        text(`Back ${seconds(real(clip.phaseTimes.top-clip.phaseTimes.address,clip))} s / Down ${seconds(real(clip.phaseTimes.impact-clip.phaseTimes.top,clip))} s`,statsX,136,9,muted);
      } else text('Needs address, top and impact.',statsX,131,9,muted);
      text('Video & analysis',statsX,146,11,green,true);
      text(`File ${clip.frameRate} FPS / Shot ${clip.recordingFrameRate} FPS`,statsX,153,10);
      text(`${clip.viewport.zoom.toFixed(2)}x zoom${clip.mirrored?' / Mirrored':''} / ${clip.hand==='left'?'Left':'Right'}-handed`,statsX,160,9,muted);
      text(`Area: ${clip.crop==='left'?'Left half':clip.crop==='right'?'Right half':'Full frame'}`,statsX,167,9,muted);
      text(`Selected: ${interval(clip.selectedRange,clip)}`,statsX,174,9,muted);
      text(`Analyzed: ${interval(clip.analyzedRange,clip)}`,statsX,181,9,muted);
      if(clip.analyzedRange)text(`${clip.quality==='detailed'?'Detailed':'Fast'} / ${clip.measurements.length} samples / ${clip.coverage}% tracked`,statsX,188,8.5,muted);
      const notes=[...(frame.observations||[])];
      if(frame.source==='sampled')notes.unshift('Range preview: a sampled frame, not a detected swing phase.');
      else if(frame.source==='estimated')notes.unshift('Automatic phase estimate. Verify the event in your video.');
      if(!frame.source&&report.clips.length===2)notes.unshift(report.linked?'Videos synchronized at the selected event.':'Videos positioned independently.');
      // Landscape footage leaves room below the image; portrait footage uses
      // the remaining statistics column. Notes always belong to this frame.
      const notesX=landscape?margin:statsX,notesWidth=landscape?imageAreaWidth:statsWidth;
      let notesY=landscape?imageY+imageHeight+8:201;
      const notesLimit=height-19;
      if(notes.length&&notesY+8<notesLimit) {
        text('What to review',notesX,notesY,11,green,true);notesY+=6;
        for(const note of notes) {
          doc.setFont('helvetica','normal');doc.setFontSize(9);
          const lineHeight=9*.3528*1.25,lines=doc.splitTextToSize(note,notesWidth);
          const available=Math.floor((notesLimit-notesY)/lineHeight);
          if(available<=0)break;
          if(lines.length>available) {lines.length=available;lines[available-1]=lines[available-1].replace(/.{3}$/,'...');}
          notesY+=wrap(lines.join(' '),notesX,notesY,notesWidth,9)+3;
        }
      }
    }
  }
  const count=doc.getNumberOfPages();
  for(let page=1;page<=count;page++) {
    doc.setPage(page);const width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight();
    doc.setDrawColor('#CCD8C7');doc.line(12,height-14,width-12,height-14);
    text('2D image angles, not 3D rotation. Camera and visibility affect accuracy. A dash means unavailable.',12,height-9,8,muted);
    text(`${BRAND} / Created locally / Frames start at 0`,12,height-4,8,muted);
    text(`${page} / ${count}`,width-12,height-4,8,muted,false,{align:'right'});
  }
  return doc.output('blob');
}
