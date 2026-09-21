import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestKeyMoments,keyMomentEntries} from '../deploy/keyframes.js';
function pose(y,visibility=1){const p=Array.from({length:33},()=>({x:.5,y:.5,visibility}));p[11].y=p[12].y=.35;p[23].y=p[24].y=.65;p[15].y=p[16].y=y;return p;}
const trajectory=[.72,.72,.71,.65,.5,.35,.2,.3,.55,.74,.66,.5,.35,.22,.2,.2];
const samples=trajectory.map((y,i)=>({time:i/30,points:pose(y)}));
test('six ordered pose suggestions follow a rise, impact-region drop and follow-through',()=>{
 const picks=suggestKeyMoments(samples,0,16/30,30);assert.equal(picks.length,6);assert.ok(picks.every(e=>e.source==='estimated'));
 assert.equal(picks[1].time,6/30);assert.equal(picks[3].time,9/30);
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
