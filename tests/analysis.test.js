import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angle, MEASUREMENTS, measurements, syncBounds, frameTime, tempo, nearestSample, smoothSamples } from '../deploy/analysis.js';
const p = (x,y,visibility=1) => ({x,y,visibility});
test('angles account for video aspect ratio', () => {
  // Pixel vectors (-100, 100) and (100, 100) form 90 degrees.
  assert.ok(Math.abs(angle(p(0,0.5),p(0.5,0),p(1,0.5),200,200)-90)<1e-6);
  assert.ok(Math.abs(angle(p(0,0.25),p(0.5,0),p(1,0.25),200,400)-90)<1e-6);
});
test('occluded and degenerate joints yield no measurement', () => {
  assert.equal(angle(p(0,0,.2),p(0,1),p(1,1),100,100),null);
  assert.equal(angle(p(0,0),p(0,0),p(1,1),100,100),null);
  assert.deepEqual(measurements(null,100,100),Object.fromEntries(MEASUREMENTS.map(([key])=>[key,null])));
});
test('positive and negative offsets constrain both videos to their overlap', () => {
  assert.deepEqual(syncBounds(10,8,2),{start:0,end:6});
  assert.deepEqual(syncBounds(10,8,-2),{start:2,end:10});
  assert.equal(syncBounds(10,8,8),null);
});
test('frame stepping snaps to selected fps and clamps to media bounds', () => {
  assert.equal(frameTime(0,1,60,0,4),1/60);
  assert.equal(frameTime(0,-1,30,0,4),0);
  assert.equal(frameTime(4,1,30,0,4),4);
  assert.equal(frameTime(.039,1,30,0,4),2/30);
});
test('tempo requires ordered, user-marked moments', () => {
  assert.ok(Math.abs(tempo({address:0,top:.9,impact:1.2})-3)<1e-9);
  assert.equal(tempo({address:1,top:.5,impact:2}),null);
  assert.equal(tempo({address:0,top:1,impact:1}),null);
  assert.equal(tempo({}),null);
});
test('nearest pose never fills missing observations or distant times', () => {
  const samples = [{time:0,points:[p(0,0)]},{time:.1,points:null},{time:.2,points:[p(1,1)]}];
  assert.equal(nearestSample(samples,.11,.06).points,null);
  assert.equal(nearestSample(samples,.5,.06),null);
  assert.equal(nearestSample([],0,.06),null);
});
test('median removes isolated jitter but preserves missing frames', () => {
  const smoothed = smoothSamples([{time:0,points:[p(.1,.1)]},{time:.1,points:[p(.9,.9)]},{time:.2,points:[p(.2,.2)]},{time:.3,points:null}]);
  assert.equal(smoothed[1].points[0].x,.2);
  assert.equal(smoothed[3].points,null);
});
