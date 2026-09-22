import {visible, measurements, nearestSample} from './analysis.js';
import {fileTime} from './timing.js';
import {keyMomentEntries} from './keyframes.js';
import {coachingFeedback, coachingObservations} from './coaching.js';

export const CONNECTIONS=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[15,19],[16,20],[27,29],[29,31],[28,30],[30,32]];
export const defaultReview=()=>({visible:true,skeleton:true,landmarks:true,angles:false,lead:true,trail:false,head:false,grid:false,size:2,path:'swing'});
export const cropRegion=(crop='full')=>({x:crop==='right'?.5:0,width:crop==='full'?1:.5});
export function mapCropPoints(points,crop) {
  const region=cropRegion(crop);
  return points?.map(p=>({...p,x:region.x+p.x*region.width,z:Number.isFinite(p.z)?p.z*region.width:p.z}))??null;
}
export function currentMoment(slot,time=slot.video.currentTime) {
  const entries=keyMomentEntries(slot).filter(e=>Number.isFinite(e.time)&&e.source!=='sampled').sort((a,b)=>a.time-b.time);
  if(!entries.length || time<entries[0].time-slot.tolerance || time>entries.at(-1).time+slot.tolerance)return null;
  return entries.reduce((a,b)=>Math.abs(a.time-time)<Math.abs(b.time-time)?a:b);
}
export const PHASE_GUIDES={address:'Use this setup frame as your reference.',backswing:'Compare the takeaway with your setup.',top:'Review hand height and the trail elbow at the top.',downswing:'Step toward impact to inspect how the arms unfold.',impact:'Verify ball contact visually before comparing impact.',follow:'Compare arm extension after impact.',finish:'Review your finish and balance in the video.'};
// Each phase emphasizes two useful observations; the full eight measurements
// remain available in the enlarged view and on that frame's report page.
export const PHASE_METRICS={address:['lean','knee'],backswing:['elbow','wrist'],top:['trailElbow','lean'],downswing:['trailElbow','elbow'],impact:['elbow','wrist'],follow:['elbow','trailElbow'],finish:['lean','knee']};
export function frameAnalysis(slot,time,entry=currentMoment(slot,time)) {
  const points=Number.isFinite(time)?nearestSample(slot.samples,time,slot.tolerance)?.points:null;
  const values=measurements(points,slot.video.videoWidth,slot.video.videoHeight,slot.hand);
  const address=keyMomentEntries(slot).find(e=>e.key==='address'&&['marked','estimated'].includes(e.source)&&Number.isFinite(e.time));
  const base=measurements(address?nearestSample(slot.samples,address.time,slot.tolerance)?.points:null,slot.video.videoWidth,slot.video.videoHeight,slot.hand);
  const changes=Object.fromEntries(Object.keys(values).map(key=>[key,Number.isFinite(values[key])&&Number.isFinite(base[key])?values[key]-base[key]:null]));
  const tracked=Object.values(values).some(Number.isFinite),phase=entry?.source==='sampled'?null:entry?.key;
  const keys=PHASE_METRICS[phase]||['elbow','lean'];
  const labels={elbow:'Lead elbow',trailElbow:'Trail elbow',knee:'Lead knee',lean:'Torso lean',wrist:'Lead wrist'};
  const highlights=keys.map(key=>({key,label:labels[key],value:values[key],change:changes[key]}));
  const guide=tracked&&phase?PHASE_GUIDES[phase]:null;
  const coaching=coachingFeedback(slot,time,entry,{tracked});
  return {measurements:values,changes,highlights,guide,observations:coachingObservations(coaching),coaching,tracked};
}
export function postureNotes(slot,time) {
  const points=nearestSample(slot.samples,time,slot.tolerance)?.points;
  const values=measurements(points,slot.video.videoWidth,slot.video.videoHeight,slot.hand);
  const moment=currentMoment(slot,time),notes=[];
  if(!Object.values(values).some(Number.isFinite))return ['No reliable pose at this frame. Step to a tracked frame or measure with Angle.'];
  if(moment)notes.push(PHASE_GUIDES[moment.key]);
  const address=keyMomentEntries(slot).find(e=>e.key==='address'&&['marked','estimated'].includes(e.source)&&Number.isFinite(e.time));
  const base=measurements(address?nearestSample(slot.samples,address.time,slot.tolerance)?.points:null,slot.video.videoWidth,slot.video.videoHeight,slot.hand);
  const changes=[['elbow','Lead elbow'],['lean','Torso lean']].filter(([key])=>Number.isFinite(values[key])&&Number.isFinite(base[key])&&Math.abs(time-address.time)>1/slot.fps);
  if(changes.length)notes.push(changes.map(([key,label])=>`${label} ${values[key]-base[key]>=0?'+':''}${Math.round(values[key]-base[key])}° vs address`).join(' · ')+'.');
  else notes.push([['elbow','Lead elbow'],['trailElbow','Trail elbow'],['lean','Torso lean']].filter(([key])=>Number.isFinite(values[key])).map(([key,label])=>`${label} ${Math.round(values[key])}°`).join(' · ')+'.');
  return notes.filter(Boolean);
}
export function drawPose(ctx,points,w,h,{skeleton=true,landmarks=true,angles=false,size=2,color='#d6ee9c',hand='right',mirrorText=false}={}) {
  if(!points)return;
  ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=size;ctx.lineCap='round';
  if(skeleton)for(const [a,b] of CONNECTIONS){if(!visible(points[a])||!visible(points[b]))continue;ctx.beginPath();ctx.moveTo(points[a].x*w,points[a].y*h);ctx.lineTo(points[b].x*w,points[b].y*h);ctx.stroke();}
  if(landmarks)for(const p of points.filter(visible)){ctx.beginPath();ctx.arc(p.x*w,p.y*h,size*1.4,0,Math.PI*2);ctx.fill();}
  if(angles){
    const values=measurements(points,w,h,hand),side=hand==='right'?0:1;
    for(const [key,joint] of [['elbow',13+side],['trailElbow',14-side],['knee',25+side],['trailKnee',26-side]]){
      if(!Number.isFinite(values[key]))continue;
      const p=points[joint],label=`${Math.round(values[key])}°`;ctx.save();ctx.translate(p.x*w,p.y*h-12);if(mirrorText)ctx.scale(-1,1);
      ctx.font=`600 ${Math.max(14,size*5)}px sans-serif`;const tw=ctx.measureText(label).width;
      ctx.fillStyle='#17251fed';ctx.fillRect(-tw/2-4,-18,tw+8,23);ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(label,0,0);ctx.restore();
    }
  }
  ctx.restore();
}
export function drawReview(ctx,slot,time,w,h,{color='#d6ee9c',mirrorText=false}={}) {
  const options=slot.review||defaultReview();
  if(!options.visible)return;
  if(options.grid){ctx.save();ctx.strokeStyle='#ffffff44';ctx.lineWidth=1;for(const f of [1/3,2/3]){ctx.beginPath();ctx.moveTo(w*f,0);ctx.lineTo(w*f,h);ctx.moveTo(0,h*f);ctx.lineTo(w,h*f);ctx.stroke();}ctx.restore();}
  const start=options.path==='recent'?time-fileTime(1.5,slot):(slot.analyzedRange?.[0]??0);
  const paths=[['head',0,'#ff9b94'],['lead',slot.hand==='right'?15:16,'#d6ee9c'],['trail',slot.hand==='right'?16:15,'#7edbff']];
  for(const [key,index,pathColor] of paths){
    if(!options[key])continue;ctx.save();ctx.strokeStyle=pathColor;ctx.lineWidth=options.size;ctx.beginPath();let pen=false,previous;
    for(const sample of slot.samples){
      if(sample.time<start||sample.time>time)continue;
      const p=sample.points?.[index];if(!visible(p)){pen=false;continue;}
      if(!pen || sample.time-previous>slot.tolerance*2.5)ctx.moveTo(p.x*w,p.y*h);else ctx.lineTo(p.x*w,p.y*h);
      pen=true;previous=sample.time;
    }
    ctx.stroke();ctx.restore();
  }
  drawPose(ctx,nearestSample(slot.samples,time,slot.tolerance)?.points,w,h,{...options,color,hand:slot.hand,mirrorText});
}
