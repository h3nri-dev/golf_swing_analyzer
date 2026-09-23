import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analysisRangeError, analysisWindow, DEFAULT_WINDOW, validWindow, readWindowSettings } from '../deploy/range.js';
import {fileTime} from '../deploy/timing.js';

test('default window covers 0.3 seconds before and 3.2 after, clipped at file edges',()=>{
  assert.deepEqual(analysisWindow(30,60),[29.7,33.2]);
  assert.deepEqual(analysisWindow(0,60),[0,3.2]);
  assert.deepEqual(analysisWindow(59,60),[58.7,60]);
  assert.deepEqual(analysisWindow(2,4),[1.7,4]);
  assert.deepEqual(analysisWindow(60,60),[59.7,60]);
  assert.deepEqual(analysisWindow(NaN,60),[0,0]);
  assert.deepEqual(analysisWindow(0,0),[0,0]);
});
test('window sizes use real seconds across ordinary and slow-motion frame rates',()=>{
  for(const [fps,shotFps] of [[30,30],[60,60],[30,120],[29.97,119.88]]) {
    const clip={fps,shotFps},scale=shotFps/fps;
    assert.deepEqual(analysisWindow(fileTime(7,clip),fileTime(15,clip),DEFAULT_WINDOW,scale),[6.7*scale,10.2*scale]);
  }
  assert.deepEqual(analysisWindow(30,60,{before:1,after:1}),[29,31]);
});
test('window preferences validate both offsets and recover safely from blocked or corrupt storage',()=>{
  for(const value of [null,{before:0,after:0},{before:-1,after:3},{before:1,after:20},{before:'0.3',after:3.2},{before:NaN,after:3.2}])assert.equal(validWindow(value),false);
  for(const value of [{before:0,after:.1},{before:20,after:0},{before:1.2,after:4.8}]){
    assert.equal(validWindow(value),true);assert.deepEqual(readWindowSettings({getItem:()=>JSON.stringify(value)}),value);
  }
  for(const storage of [undefined,{getItem:()=>'{bad'}, {getItem:()=>'{"before":0,"after":0}'},{getItem(){throw new Error('Blocked');}}])assert.deepEqual(readWindowSettings(storage),DEFAULT_WINDOW);
});

test('analysis accepts sections anywhere in a long video, up to 20 seconds', () => {
  assert.equal(analysisRangeError(31.2, 51.2, 120), '');
  assert.equal(analysisRangeError(0, 0.2, 0.2), '');
  assert.match(analysisRangeError(30, 50.01, 120), /20 seconds/);
});
test('reanalysis retains valid saved file bounds after FPS recalibration changes their real duration', () => {
  assert.equal(analysisRangeError(5.6,33.6,60,8),'');
  assert.match(analysisRangeError(5.6,33.6,60,1),/20 seconds/);
  assert.equal(analysisRangeError(5.6,33.6,60,1,true),'');
  for(const [start,end,duration] of [[NaN,2,4],[0,Infinity,4],[3,2,4],[1,1,4],[-1,2,4],[0,4.001,4]]){
    assert.ok(analysisRangeError(start,end,duration,1,true));
  }
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
