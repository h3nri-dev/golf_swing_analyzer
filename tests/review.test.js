import test from 'node:test';
import assert from 'node:assert/strict';
import {measurements} from '../deploy/analysis.js';
import {cropRegion,mapCropPoints,currentMoment,postureNotes,drawReview,defaultReview} from '../deploy/review.js';
import {hitShape,scaleShape} from '../deploy/drawing.js';
const point=(x,y)=>({x,y,visibility:1});
function pose(){const p=Array.from({length:33},()=>point(.5,.5));
 p[11]=point(.2,.2);p[13]=point(.2,.4);p[15]=point(.4,.4);p[19]=point(.5,.4);
 p[12]=point(.6,.2);p[14]=point(.6,.4);p[16]=point(.6,.6);p[20]=point(.7,.6);
 p[23]=point(.3,.5);p[25]=point(.3,.7);p[27]=point(.3,.9);
 p[24]=point(.6,.5);p[26]=point(.6,.7);p[28]=point(.8,.7);return p;}
test('eight measurements use visible image geometry and swap both limbs with handedness',()=>{
 const p=pose(),r=measurements(p,200,400),l=measurements(p,200,400,'left');
 assert.equal(r.elbow,90);assert.equal(r.trailElbow,180);assert.equal(r.knee,180);assert.equal(r.trailKnee,90);assert.equal(r.wrist,180);
 assert.equal(r.shoulderLine,0);assert.equal(r.hipLine,0);assert.equal(l.elbow,r.trailElbow);assert.equal(l.knee,r.trailKnee);
 p[14].visibility=.1;assert.equal(measurements(p,200,400).trailElbow,null);assert.equal(measurements(p,200,400).elbow,90);
});
test('crop inference maps back to original coordinates without distorting pixel angles',()=>{
 const original=pose(),cropped=original.map(p=>({...p,x:(p.x-.5)*2}));
 const mapped=mapCropPoints(cropped,'right');assert.deepEqual(cropRegion('right'),{x:.5,width:.5});
 for(let i=0;i<original.length;i++)assert.ok(Math.abs(mapped[i].x-original[i].x)<1e-8);
 for(const [key,value] of Object.entries(measurements(mapped,400,200)))assert.ok(Math.abs(value-measurements(cropped,200,200)[key])<1e-10);assert.equal(mapCropPoints(null,'left'),null);
});
test('current phase uses actual edits in time order and never range placeholders',()=>{
 const slot={keyMoments:[{key:'address',time:0,source:'sampled'}],marks:{},tolerance:.05,video:{currentTime:0}};
 assert.equal(currentMoment(slot),null);slot.marks={address:.3,top:.1,impact:.2};
 assert.equal(currentMoment(slot,.1).key,'top');assert.equal(currentMoment(slot,.8),null);
});
test('observations describe measured change and stay unavailable across pose gaps',()=>{
 const p=pose(),p2=pose();p2[15]=point(.2,.6);
 const slot={samples:[{time:0,points:p},{time:.2,points:p2},{time:.4,points:null}],tolerance:.05,fps:30,hand:'right',marks:{address:0,top:.2},keyMoments:[],video:{videoWidth:200,videoHeight:400}};
 assert.match(postureNotes(slot,.2).join(' '),/Lead elbow \+90° vs address/);
 assert.match(postureNotes(slot,.4)[0],/No reliable pose/);assert.match(postureNotes(slot,.8)[0],/No reliable pose/);
});
test('head and both hand trajectories break across missing samples',()=>{
 const operations=[],ctx={save(){},restore(){},beginPath(){},stroke(){},moveTo(...a){operations.push(['move',...a]);},lineTo(...a){operations.push(['line',...a]);}};
 const slot={samples:[{time:0,points:pose()},{time:.1,points:pose()},{time:.2,points:null},{time:.3,points:pose()}],tolerance:.06,hand:'right',analyzedRange:[0,.4],review:{...defaultReview(),head:true,trail:true,skeleton:false,landmarks:false}};
 drawReview(ctx,slot,.3,200,400);assert.equal(operations.filter(v=>v[0]==='move').length,6);assert.equal(operations.filter(v=>v[0]==='line').length,3);
 slot.review.visible=false;operations.length=0;drawReview(ctx,slot,.3,200,400);assert.deepEqual(operations,[]);
});
test('rotated boxes remain selectable and scaling keeps source coordinates bounded',()=>{
 const box={tool:'rect',points:[point(.2,.3),point(.8,.7)],rotation:90};
 assert.ok(hitShape(box,point(.5,.8),200,200,2));assert.ok(!hitShape(box,point(.5,.5),200,200,2));
 const scaled=scaleShape(box,10);assert.ok(scaled.points.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1));
 assert.equal(scaleShape({tool:'label',points:[point(.5,.5)]},1.5).labelScale,1.5);
});

test('mirrored labels stay selectable on the side where their readable text is drawn',()=>{
 const label={tool:'label',label:'Head position',points:[point(.5,.5)]};
 assert.ok(hitShape(label,point(.3,.5),400,300,5,true));assert.ok(!hitShape(label,point(.7,.5),400,300,5,true));
 assert.ok(hitShape(label,point(.7,.5),400,300,5,false));
});
