import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analysisRangeError, analysisWindow, DEFAULT_WINDOW_SECONDS } from '../deploy/range.js';
import {fileTime} from '../deploy/timing.js';

test('default window covers 2.5 seconds either side and clips at both edges',()=>{
  assert.deepEqual(analysisWindow(30,60),[27.5,32.5]);
  assert.deepEqual(analysisWindow(0,60),[0,2.5]);
  assert.deepEqual(analysisWindow(59,60),[56.5,60]);
  assert.deepEqual(analysisWindow(2,4),[0,4]);
  assert.deepEqual(analysisWindow(60,60),[57.5,60]);
  assert.deepEqual(analysisWindow(NaN,60),[0,0]);
  assert.deepEqual(analysisWindow(0,0),[0,0]);
});
test('window sizes use real seconds across ordinary and slow-motion frame rates',()=>{
  for(const [fps,shotFps] of [[30,30],[60,60],[30,120],[29.97,119.88]]) {
    const clip={fps,shotFps},scale=shotFps/fps;
    assert.deepEqual(analysisWindow(fileTime(7,clip),fileTime(15,clip),fileTime(DEFAULT_WINDOW_SECONDS,clip)),[4.5*scale,9.5*scale]);
  }
  assert.deepEqual(analysisWindow(30,60,2),[29,31]);
});

test('analysis accepts sections anywhere in a long video, up to 20 seconds', () => {
  assert.equal(analysisRangeError(31.2, 51.2, 120), '');
  assert.equal(analysisRangeError(0, 0.2, 0.2), '');
  assert.match(analysisRangeError(30, 50.01, 120), /20 seconds/);
});
test('analysis rejects missing, reversed, empty and out-of-bounds selections', () => {
  assert.match(analysisRangeError(NaN, 2, 4), /Load/);
  assert.match(analysisRangeError(0, Infinity, 4), /Load/);
  assert.match(analysisRangeError(3, 2, 4), /after start/);
  assert.match(analysisRangeError(1, 1, 4), /after start/);
  assert.match(analysisRangeError(-1, 2, 4), /within/);
  assert.match(analysisRangeError(0, 4.001, 4), /within/);
});
test('millisecond-rounded duration is allowed without extending the scan', () => {
  assert.equal(analysisRangeError(0, 4.005, 4.0047), '');
  assert.match(analysisRangeError(0, 4.006, 4.0047), /within/);
  assert.match(analysisRangeError(4.0048, 4.005, 4.0047), /within/);
});
