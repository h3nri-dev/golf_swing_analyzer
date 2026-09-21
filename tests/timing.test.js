import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mediaRate, synchronization, realTime, fileTime, frameNumber, frameStamp, markedFrame, lastFrame} from '../deploy/timing.js';
import {analysisRangeError} from '../deploy/range.js';
const clip = (fps, duration = 4, shotFps = fps) => ({fps, duration, shotFps});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);

test('displayed seconds, frame labels and marker positions use file and recording FPS',()=>{
  const slow={fps:30,shotFps:120,video:{duration:8}};
  assert.equal(realTime(2,slow),.5);assert.equal(fileTime(.5,slow),2);
  assert.equal(frameStamp(2,slow),'0.500 s · F60');
  assert.equal(frameStamp(1/30,slow),'0.008 s · F1');
  assert.equal(frameStamp(8,slow),'2.000 s · F239');
  assert.equal(markedFrame(2.02,slow),2);assert.equal(lastFrame(8,30),239);
  near(markedFrame(8,slow),239/30);
  assert.equal(frameNumber(100/29.97,29.97),100);
  assert.equal(analysisRangeError(0,80,100,4),'');
  assert.match(analysisRangeError(0,81,100,4),/20 seconds/);
});

test('ordinary different-FPS files keep the same real-time playback speed', () => {
  assert.equal(mediaRate(30), 1); assert.equal(mediaRate(60), 1);
  const model = synchronization([clip(30), clip(60)], .5);
  const next = model.step([.5, 1], 1);
  near(next[0], .5 + 1/30); near(next[1], 1 + 2/60);
  near(next[1] - next[0], .5);
  const back = model.step(next, -1); near(back[0], .5); near(back[1], 1);
});

test('shared stepping uses the lower recording FPS regardless of which side it is on', () => {
  const model = synchronization([clip(60), clip(30)], -.5);
  assert.equal(model.reference, 1);
  const next = model.step([1, .5], 1);
  near(next[0], 1 + 2/60); near(next[1], .5 + 1/30);
});

test('slow-motion export maps real time, seeks, steps and bounds around the aligned event', () => {
  assert.equal(mediaRate(30, 120), 4);
  const model = synchronization([clip(30, 2), clip(30, 8, 120)], .25);
  assert.deepEqual(model.bounds, {start:0, end:1.75});
  assert.deepEqual(model.mediaTimes(.5), [.5, 3]);
  near(model.commonTime(3, 1), .5);
  const next = model.step([.5, 3], 1);
  near(next[0], .5 + 1/30); near(next[1], 3 + 4/30);
  assert.deepEqual(model.mediaTimes(99), [1.75, 8]);
});

test('negative origins and two slow-motion clips retain the correct common interval', () => {
  const model = synchronization([clip(30, 8, 120), clip(60, 4, 120)], -.25);
  assert.deepEqual(model.bounds, {start:.25, end:2});
  assert.deepEqual(model.mediaTimes(-99), [1, 0]);
  const next = model.step([2, .5], 1);
  near(next[0], 2 + 1/30); near(next[1], .5 + 1/60);
  assert.equal(synchronization([clip(30, 2), clip(30, 8, 120)], 2), null);
});

test('fractional and non-divisible frame rates do not accumulate alignment drift', () => {
  const model = synchronization([clip(25, 60), clip(59.94, 60)], .137);
  let times = [0, .137];
  for (let i=0; i<1000; i++) times = model.step(times, 1);
  near(times[0], 40); near(times[1], 40.137);
  for (let i=0; i<1000; i++) times = model.step(times, -1);
  near(times[0], 0); near(times[1], .137);
});
