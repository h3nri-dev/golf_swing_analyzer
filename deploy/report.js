import { PRIMARY_MOMENTS as MOMENTS, MOMENT_COLORS, momentSource } from './keyframes.js';
import { seconds, frameNumber } from './timing.js';

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

const real = (time,clip) => time / clip.mediaSecondsPerRealSecond;
const stamp = (time,clip) => `${seconds(real(time,clip))} s  |  Frame ${frameNumber(time,clip.frameRate,clip.duration)}`;
const interval = (range,clip) => range ? `${seconds(real(range[0],clip))} - ${seconds(real(range[1],clip))} s` : 'Not analyzed';
const angle = value => Number.isFinite(value) ? `${value.toFixed(1)}°` : '-';

export async function createPdfReport(report) {
  const jsPDF = await pdfLibrary();
  const doc = new jsPDF({unit:'mm',format:'a4',compress:false,putOnlyUsedFonts:true});
  doc.setProperties({title:'Swing Studio - Swing review',subject:'Golf swing frames, moments and analysis',creator:'Swing Studio / freegolfswinganalyzer.com'});
  const green = '#203D2F', muted = '#55675B', pale = '#F0F4EA', lime = '#D7EDAD';
  function text(value,x,y,size=10,color=green,bold=false) {
    doc.setFont('helvetica',bold?'bold':'normal'); doc.setFontSize(size); doc.setTextColor(color); doc.text(String(value),x,y);
  }
  function wrap(value,x,y,width,size=10,color=muted,maxLines=3) {
    doc.setFont('helvetica','normal'); doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(value),width);
    if (lines.length > maxLines) { lines.length=maxLines; lines[maxLines-1]=lines[maxLines-1].replace(/.{3}$/,'...'); }
    doc.setTextColor(color);doc.text(lines,x,y,{lineHeightFactor:1.25});
  }
  function rect(x,y,w,h,color) { doc.setFillColor(color); doc.rect(x,y,w,h,'F'); }
  function header(title,subtitle) {
    rect(0,0,210,42,green);text('SWING STUDIO',16,13,10,lime,true);
    text(title,16,27,24,'#FFFFFF',true);text(subtitle,16,35,9,'#D9E4D7');
  }
  // Browser text rendering preserves non-Latin filenames without uploading
  // them or depending on an external font. Body text remains searchable.
  function filename(value,x,y,width) {
    const canvas=document.createElement('canvas');canvas.width=Math.round(width*8);canvas.height=70;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.font='28px sans-serif';ctx.fillStyle=green;
    const chars=Array.from(value);while(chars.length && ctx.measureText(chars.join('')).width>canvas.width-10) chars.pop();
    let label=chars.join('');if(label!==value)label=Array.from(label).slice(0,-3).join('')+'...';
    ctx.fillText(label,0,36);doc.addImage(canvas.toDataURL('image/png'),'PNG',x,y,width,8.75);
  }
  function image(data,x,y,w,h) { rect(x,y,w,h,green); if(data)doc.addImage(data,'JPEG',x,y,w,h); }
  function metrics(values,x,y,w) {
    [['Lead elbow','elbow'],['Lead knee','knee'],['Torso lean','lean']].forEach(([label,key],i)=>{
      text(label,x+i*w/3,y,8,muted);text(angle(values?.[key]),x+i*w/3,y+8,15,green,true);
    });
  }
  header('Swing review',`${report.clips.length===2?'Side-by-side comparison':'Single swing'}  /  ${report.created}`);
  text('Your current view',16,55,14,green,true);
  text(report.clips.length===2 ? (report.linked?'Synchronized at the selected event':'Independent video positions') : 'Annotated frame and session summary',16,62,10,muted);
  const gap=8,w=(178-gap*(report.clips.length-1))/report.clips.length;
  report.clips.forEach((clip,index)=>{
    const x=16+index*(w+gap);
    text(`SWING ${clip.name}`,x,73,11,green,true);filename(clip.file,x,76,w);
    image(clip.currentImage,x,87,w,100);
    text(stamp(clip.currentTime,clip),x,195,9,green,true);
    text(`File ${clip.frameRate} FPS  /  Shot ${clip.recordingFrameRate} FPS`,x,202,9,muted);
    text(`${clip.viewport.zoom.toFixed(2)}x zoom${clip.mirrored?'  /  Mirrored':''}`,x,208,9,muted);
    metrics(clip.currentMeasurements,x,218,w);
    text(`Selected: ${interval(clip.selectedRange,clip)}`,x,239,9,muted);
    text(`Analyzed: ${interval(clip.analyzedRange,clip)}`,x,245,9,muted);
    const autoTempo=['address','top','impact'].some(k=>!Number.isFinite(clip.marks[k]));
    text(`Tempo: ${clip.tempo===null?'Set address, top and impact':`${clip.tempo.toFixed(2)} : 1${autoTempo?' (estimated)':''}`}`,x,253,9,green,true);
  });
  rect(16,261,178,18,pale);
  wrap('All times are real elapsed seconds, calibrated with File FPS and Shot FPS. Frame numbers start at 0. Frames include the visible drawings, pose overlays, zoom and mirror settings.',20,268,170,9,muted,2);
  for(const clip of report.clips) {
    doc.addPage();header(`Swing ${clip.name} / Key moments`,'Frames, timing and measurements');filename(clip.file,16,47,178);
    text(`${clip.hand==='left'?'Left':'Right'}-handed  |  File ${clip.frameRate} FPS  |  Shot ${clip.recordingFrameRate} FPS`,16,61,10);
    const analysis = clip.analyzedRange ? `${clip.measurements.length} samples  /  ${clip.coverage}% pose coverage  /  ${interval(clip.analyzedRange,clip)}` : 'Not analyzed. Review and mark moments without running analysis.';
    text(analysis,16,68,9,muted);
    MOMENTS.forEach(([key,label],i)=>{
      const x=16+(i%2)*93,y=76+Math.floor(i/2)*73,time=clip.phaseTimes[key],exists=Number.isFinite(time);
      if(exists) image(clip.momentImages[key],x,y,85,55);
      else {rect(x,y,85,55,pale);text('Not marked',x+28,y+29,11,muted);}
      rect(x,y,85,1.5,MOMENT_COLORS[key]);
      text(`${label}${Number.isFinite(clip.marks[key])?' / Your mark':exists?' / Auto estimate':''}`,x,y+61,10,green,true);
      text(exists?stamp(time,clip):'Add this moment beside the Play button.',x,y+67,8.5,muted);
    });
    text('Measurements at your key frames',16,226,12,green,true);
    rect(16,230,178,8,green);
    const columns=[18,70,97,130,163];
    ['Moment','Real seconds','Elbow','Knee','Torso lean'].forEach((label,i)=>text(label,columns[i],235.5,9,'#FFFFFF',true));
    MOMENTS.forEach(([key,label],i)=>{
      const y=238+i*8,values=clip.momentMeasurements[key];rect(16,y,178,8,i%2?pale:'#FFFFFF');
      [label,Number.isFinite(clip.phaseTimes[key])?seconds(real(clip.phaseTimes[key],clip)):'-',angle(values?.elbow),angle(values?.knee),angle(values?.lean)].forEach((value,j)=>text(value,columns[j],y+5.5,9));
    });
    text(clip.tempo===null?'Tempo requires ordered address, top and impact marks.':`Tempo ${clip.tempo.toFixed(2)} : 1  |  Backswing ${seconds(real(clip.phaseTimes.top-clip.phaseTimes.address,clip))} s  /  Downswing ${seconds(real(clip.phaseTimes.impact-clip.phaseTimes.top,clip))} s`,16,278,9,green,true);
  }
  for(const clip of report.clips) {
    if(!clip.visualMoments?.length)continue;
    doc.addPage();header(`Swing ${clip.name} / Visual moments`,'A closer look, frame by frame');filename(clip.file,16,47,178);
    text('Your marks take priority. Estimates use hand motion; verify impact in the video.',16,61,9,muted);
    text('Range previews are sampled frames when swing phases could not be identified.',16,67,9,muted);
    clip.visualMoments.forEach((entry,i)=>{
      const x=16+(i%2)*93,y=76+Math.floor(i/2)*66;
      image(entry.image,x,y,85,50);
      rect(x,y,85,1.5,entry.source==='sampled'?muted:MOMENT_COLORS[entry.key]);
      text(entry.label,x,y+56,10,green,true);
      const source=momentSource(entry.source);
      text(`${stamp(entry.time,clip)}  /  ${source}`,x,y+62,8,muted);
    });
    rect(16,274,178,6,pale);text('Open Key moments on the site to enlarge, edit, play or draw on these frames.',19,278,8,muted);
  }
  const count=doc.getNumberOfPages();
  for(let page=1;page<=count;page++) {
    doc.setPage(page);doc.setDrawColor('#CCD8C7');doc.line(16,284,194,284);
    text('2D estimates. Camera angle and visibility affect measurements. A dash means unavailable.',16,289,8,muted);
    text('freegolfswinganalyzer.com  /  Created locally on your device',16,294,8,muted);
    doc.setFontSize(8);doc.text(`${page} / ${count}`,194,294,{align:'right'});
  }
  return doc.output('blob');
}
