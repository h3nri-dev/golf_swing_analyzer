import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestKeyMoments,keyMomentEntries} from '../deploy/keyframes.js';
import {smoothSamples} from '../deploy/analysis.js';
function pose(y,visibility=1){const p=Array.from({length:33},()=>({x:.5,y:.5,visibility}));p[11].y=p[12].y=.35;p[23].y=p[24].y=.65;p[15].y=p[16].y=y;return p;}
const trajectory=[.72,.72,.71,.65,.5,.35,.2,.3,.55,.74,.66,.5,.35,.22,.2,.2];
const samples=trajectory.map((y,i)=>({time:i/30,points:pose(y)}));
test('seven ordered pose suggestions follow a rise, impact-region drop and follow-through',()=>{
 const picks=suggestKeyMoments(samples,0,16/30,30);assert.equal(picks.length,7);assert.ok(picks.every(e=>e.source==='estimated'));
 assert.equal(picks.find(e=>e.key==='top').time,6/30);assert.equal(picks.find(e=>e.key==='impact').time,9/30);
 assert.ok(picks.every((p,i)=>p.time>=0&&p.time<16/30&&(!i||p.time>picks[i-1].time)));
});
test('static, occluded, partial and short footage gets honest range previews',()=>{
 for(const points of [samples.map(p=>({...p,points:pose(.5)})),samples.map(p=>({...p,points:pose(.5,.2)})),samples.slice(0,8),samples.map((p,i)=>i>4&&i<12?{...p,points:null}:p)]){
  const picks=suggestKeyMoments(points,0,16/30,30);assert.ok(picks.every(e=>e.source==='sampled' && e.label.startsWith('Range frame')));
 }
});
test('manual corrections override suggestions without losing frame identity after retiming',()=>{
 const keyMoments=suggestKeyMoments(samples,0,16/30,30),slot={keyMoments,marks:{impact:.31,follow:.4},fps:30};
 assert.equal(keyMomentEntries(slot).find(e=>e.key==='impact').time,.31);assert.equal(keyMomentEntries(slot).find(e=>e.key==='impact').source,'marked');
 slot.fps=60;assert.equal(keyMomentEntries(slot).find(e=>e.key==='impact').time,.31);assert.equal(keyMomentEntries(slot).find(e=>e.key==='top').source,'estimated');
});

test('report copies cannot add exported images to live suggestions',()=>{
 const slot={marks:{},keyMoments:suggestKeyMoments(samples,0,16/30,30)};keyMomentEntries(slot)[0].image='report-only';assert.equal(slot.keyMoments[0].image,undefined);
});

test('a complete swing survives unrelated occluded lead-in and tail footage',()=>{
 const before=Array.from({length:90},(_,i)=>({time:i/30,points:null}));
 const swing=samples.map(s=>({...s,time:s.time+3}));
 const after=Array.from({length:90},(_,i)=>({time:(i+106)/30,points:null}));
 const picks=suggestKeyMoments([...before,...swing,...after],0,196/30,30,{anchor:3.3});
 assert.ok(picks.every(e=>e.source==='estimated'));assert.equal(picks.find(e=>e.key==='top').time,3.2);assert.equal(picks.find(e=>e.key==='impact').time,3.3);
});
test('a briefly hidden wrist and a two-frame pose gap do not discard the swing',()=>{
 const oneWrist=samples.map(s=>({time:s.time,points:s.points.map((p,i)=>({...p,visibility:i===16?.1:1}))}));
 for(const points of [oneWrist,samples.map((s,i)=>i===3||i===4?{...s,points:null}:s)]){
  const picks=suggestKeyMoments(points,0,16/30,30);assert.ok(picks.every(e=>e.source==='estimated'));assert.equal(picks.find(e=>e.key==='impact').time,9/30);
 }
});
test('slow-motion calibration preserves event frames and handles ordinary FPS differences',()=>{
 const regular=suggestKeyMoments(samples,0,16/30,30);
 const slow=suggestKeyMoments(samples.map(s=>({...s,time:s.time*4})),0,64/30,30,{rate:4});
 assert.ok(slow.every((e,i)=>e.source==='estimated'&&e.time===regular[i].time*4));
 const sixty=suggestKeyMoments(samples,0,16/30,60);assert.ok(sixty.every(e=>e.source==='estimated'));assert.equal(sixty.find(e=>e.key==='impact').time,regular.find(e=>e.key==='impact').time);
});
test('multiple complete swings prefer the swing nearest the analysis playhead',()=>{
 const multiple=[...samples,...Array.from({length:30},(_,i)=>({time:(i+16)/30,points:pose(.72)})),...samples.map(s=>({...s,time:s.time+46/30}))];
 const first=suggestKeyMoments(multiple,0,62/30,30,{anchor:.3});
 const second=suggestKeyMoments(multiple,0,62/30,30,{anchor:55/30});
 assert.equal(first.find(e=>e.key==='impact').time,.3);assert.equal(second.find(e=>e.key==='impact').time,55/30);
});
test('only detected phases and manual corrections contribute to tempo',async()=>{
 const {phaseTimes}=await import('../deploy/keyframes.js');
 assert.deepEqual(phaseTimes({marks:{impact:.3},keyMoments:suggestKeyMoments([],0,1,30)}),{impact:.3});
 const slot={marks:{impact:.32},keyMoments:suggestKeyMoments(samples,0,16/30,30)};
 const times=phaseTimes(slot);assert.equal(times.impact,.32);assert.equal(times.top,.2);assert.equal(Object.keys(times).length,7);
});

// A sideways takeaway keeps the hands low long after the golfer leaves setup.
// The Address frame must be inside the stationary setup, not on that takeaway.
function lowTakeaway({fps=30,rate=1,mirror=false,aspect=1,noise=false,waggle=false,occlusion=false}={}) {
 const nodes=waggle
  ? [[0,.5,.72],[.6,.5,.72],[.8,.58,.7],[1,.5,.72],[1.5,.5,.72]]
  : [[0,.5,.72],[.8,.5,.72]];
 const takeaway=nodes.at(-1)[0];
 nodes.push([takeaway+.4,.7,.72],[takeaway+1,.8,.2],[takeaway+1.3,.5,.74],[takeaway+2,.25,.2],[takeaway+2.4,.25,.2]);
 const end=nodes.at(-1)[0];
 const frames=Array.from({length:Math.ceil(end*fps*rate)},(_,i)=>{
  const time=i/fps,t=time/rate;
  let n=1;while(n<nodes.length-1&&nodes[n][0]<t)n++;
  const a=nodes[n-1],b=nodes[n],f=(t-a[0])/(b[0]-a[0]);
  const p=pose(a[2]+(b[2]-a[2])*f);
  for(const wrist of [15,16]) {
   const x=a[1]+(b[1]-a[1])*f+(wrist===15?-.015:.015);
   p[wrist].x=.5+(mirror?-1:1)*(x-.5)/aspect;
   if(noise){p[wrist].x+=.0006*Math.sin(t*57)/aspect;p[wrist].y+=.0006*Math.cos(t*43);}
  }
  if(occlusion&&t>.2&&t<.35)p[16].visibility=.1;
  return {time,points:p};
 });
 return {samples:frames,end:end*rate,setup:[waggle?1:.1,takeaway],takeaway,top:takeaway+1,impact:takeaway+1.3};
}
test('Address uses the held setup before a low horizontal takeaway',()=>{
 const clip=lowTakeaway();
 const picks=suggestKeyMoments(smoothSamples(clip.samples),0,clip.end,30);
 assert.ok(picks.every(p=>p.source==='estimated'));
 const address=picks[0].time;
 assert.ok(address>=clip.setup[0]&&address<clip.setup[1],`Address ${address} must be in setup ${clip.setup}`);
 assert.ok(Math.abs(picks.find(p=>p.key==='top').time-clip.top)<=1/30+1e-8);
 assert.ok(Math.abs(picks.find(p=>p.key==='impact').time-clip.impact)<=1/30+1e-8);
});
test('Address finds the settled setup after a waggle, despite jitter and one hidden wrist',()=>{
 const clip=lowTakeaway({waggle:true,noise:true,occlusion:true});
 const picks=suggestKeyMoments(smoothSamples(clip.samples),0,clip.end,30);
 assert.ok(picks.every(p=>p.source==='estimated'));
 assert.ok(picks[0].time>clip.setup[0]&&picks[0].time<clip.setup[1],`Address ${picks[0].time} should follow the waggle and precede takeaway`);
});
test('Address stillness is calibrated for normal/slow motion, mirroring and video aspect ratio',()=>{
 for(const options of [{fps:30,rate:1,aspect:9/16},{fps:60,rate:1,aspect:16/9,mirror:true},{fps:30,rate:4,aspect:16/9}]){
  const clip=lowTakeaway(options);
  const picks=suggestKeyMoments(smoothSamples(clip.samples),0,clip.end,options.fps,options);
  assert.ok(picks.every(p=>p.source==='estimated'));
  const time=picks[0].time/options.rate;
  assert.ok(time>=clip.setup[0]&&time<clip.setup[1],`Address ${time} must precede takeaway for ${JSON.stringify(options)}`);
 }
});
