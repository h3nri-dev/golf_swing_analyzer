import test from 'node:test';
import assert from 'node:assert/strict';
import {frameAnalysis} from '../deploy/review.js';

function pose(lead=170,trail=90){
 const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
 for(const [side,angle] of [[0,lead],[1,trail]]){
  const x=side?.65:.35,radians=angle*Math.PI/180;
  p[11+side]={x,y:.2,visibility:1};p[13+side]={x,y:.4,visibility:1};
  p[15+side]={x:x+.2*Math.sin(radians),y:.4-.2*Math.cos(radians),visibility:1};
 }
 p[23]={x:.4,y:.55,visibility:1};p[24]={x:.6,y:.55,visibility:1};return p;
}
function slot(lead=170,trail=90,rate=1){return {
 fps:30,shotFps:30*rate,hand:'right',tolerance:rate/30,
 video:{videoWidth:1000,videoHeight:1000},marks:{address:.2*rate,top:.8*rate,impact:1.2*rate},keyMoments:[],
 samples:Array.from({length:49},(_,i)=>({time:i/30*rate,points:pose(i<15?170:lead,i<30?90:trail)}))
};}
const report=(s,key='top',time=.8)=>frameAnalysis(s,time,{key,source:'marked'});
const measured=a=>a.coaching.findings.filter(f=>['good','check'].includes(f.kind));
const checkpoint=(a,key)=>a.coaching.findings.find(f=>f.key===key);

test('plain-language coaching distinguishes consistent lead arm from folding and gives a usable rehearsal',()=>{
 const good=report(slot(165)),folded=report(slot(105));
 assert.equal(measured(good)[0].kind,'good');assert.match(measured(good)[0].body,/similar shape to setup/);
 assert.equal(measured(folded)[0].kind,'check');assert.match(measured(folded)[0].body,/bends more than at setup/);
 assert.match(folded.coaching.practice,/shorter backswing/);assert.match(folded.coaching.practice,/without forcing/);
 assert.ok(good.observations.every(s=>!s.includes('°')));assert.ok(Math.abs(good.measurements.elbow-165)<1e-8);
});
test('impact and follow-through explain trail-arm release using their own reference phases',()=>{
 const s=slot(140,150),impact=report(s,'impact',1.2);
 // A strength in one arm must not hide a potential issue in the other.
 assert.equal(checkpoint(impact,'leadArm').kind,'check');assert.equal(checkpoint(impact,'trailArm').kind,'good');
 s.samples.forEach((sample,i)=>{sample.points=pose(i<15?170:155,i<30?90:150);});
 const release=report(s,'impact',1.2);assert.match(checkpoint(release,'trailArm').body,/trail arm opens/);
 assert.match(impact.coaching.practice,/Verify the contact frame/);
 s.samples.forEach((sample,i)=>{sample.points=pose(155,i<40?90:150);});
 assert.match(report(s,'follow',1.5).coaching.findings[0].body,/after impact/);
});
test('sparse, noisy, occluded or missing reference data never produces a measured judgment',()=>{
 const cases=[slot(105),slot(105),slot(105),slot(105),slot(105)];
 cases[0].samples=cases[0].samples.filter((s,i)=>i%6===0);
 cases[1].samples.forEach((s,i)=>{if(i>15)s.points=pose(i%2?160:100);});
 cases[2].samples.forEach(s=>{s.points[13].visibility=.2;});
 cases[3].marks.address=null;
 cases[4].marks.address=1.1;
 for(const s of cases){const a=report(s);assert.equal(measured(a).length,0);assert.ok(a.coaching.practice);}
});
test('feedback respects handedness and real-time slow-motion calibration',()=>{
 const right=slot(105),slow=slot(105,90,4);
 assert.deepEqual(report(right).coaching,report(slow,'top',3.2).coaching);
 right.hand='left';assert.equal(checkpoint(report(right),'leadArm').kind,'good');
});
test('range previews and missing poses explain how to get feedback without inventing technique faults',()=>{
 const s=slot(105),preview=frameAnalysis(s,.8,{key:'top',source:'sampled'});
 assert.equal(preview.coaching.findings[0].kind,'info');assert.match(preview.coaching.practice,/complete swing/);
 assert.equal(measured(preview).length,0);s.samples.forEach(s=>{s.points=null;});
 const missing=report(s);assert.match(missing.observations.join(' '),/No reliable body tracking/);
 assert.match(missing.coaching.practice,/brighter light/);assert.equal(measured(missing).length,0);
 s.samples=[];assert.match(report(s).coaching.practice,/choose Analyze beside Speed/);
});
test('all seven moments provide an understandable checkpoint and next step without hiding measurements',()=>{
 const s=slot();
 for(const phase of ['address','backswing','top','downswing','impact','follow','finish']){
  const a=report(s,phase);assert.ok(a.coaching.findings.length>=3);assert.ok(a.coaching.findings.some(f=>f.kind==='info'||f.kind==='unavailable'));
  assert.ok(a.coaching.practice.length>30);assert.equal(Object.keys(a.measurements).length,8);
  assert.ok(a.observations.some(s=>s.startsWith('Try next:')));
 }
 assert.match(report(s,'finish').coaching.practice,/count of three/);
});
test('setup and finish praise requires a continuous hold, not just a single still frame',()=>{
 const s=slot(),address=report(s,'address',.4),finish=report(s,'finish',.8);
 assert.equal(checkpoint(address,'settled').kind,'good');
 assert.equal(checkpoint(finish,'balance').kind,'good');
 assert.equal(measured(report(s,'finish',1.5)).length,0);
 s.samples[30].points=null;assert.equal(measured(report(s,'finish',.8)).length,0);
 const moving=slot();moving.samples.forEach((sample,i)=>{sample.points[27].x+=i*.02;});
 assert.equal(measured(report(moving,'finish',.8)).length,0);
});


test('every original checkpoint remains visible, with separate uncertainty instead of false failures',()=>{
 const s=slot(105,150),expected={
  address:['posture','leadArm','knees','wrist','alignment'],
  backswing:['leadArm','shoulderTurn','separation','wrist'],
  top:['shoulderTurn','hipTurn','separation','hinge','trailFold','leadKnee'],
  downswing:['sequence','hinge','separation','leadArm'],
  impact:['leadArm','wrist','hipTurn','posture','knees'],
  follow:['trailArm','shoulderTurn','posture'],
  finish:['finishTurn','balance','posture','leadLeg']
 };
 for(const [phase,keys] of Object.entries(expected)){
  const a=report(s,phase);
  for(const key of keys){assert.ok(checkpoint(a,key),`${phase}: ${key}`);assert.ok(checkpoint(a,key).body.length>25);}
  for(const key of ['alignment','shoulderTurn','hipTurn','separation','hinge','sequence']){
   if(checkpoint(a,key))assert.equal(checkpoint(a,key).kind,'info',`${key} cannot be graded from image slopes`);
  }
 }
 s.samples=[];const missing=report(s);
 assert.equal(missing.coaching.findings.length,7);assert.ok(missing.coaching.findings.every(f=>f.kind==='unavailable'));
});

test('posture observations require reliable own-setup comparisons and never infer 3D faults',()=>{
 const s=slot(170,150),stable=report(s,'impact',1.2);
 assert.equal(checkpoint(stable,'posture').kind,'good');
 s.samples.forEach((sample,i)=>{if(i>15){sample.points[11].x+=.3;sample.points[12].x+=.3;}});
 const changed=report(s,'impact',1.2);assert.equal(checkpoint(changed,'posture').kind,'check');
 assert.match(checkpoint(changed,'posture').body,/perspective/);
 s.marks.address=null;assert.equal(checkpoint(report(s,'impact',1.2),'posture').kind,'unavailable');
});
