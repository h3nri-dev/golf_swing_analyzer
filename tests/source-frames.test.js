import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stepSourceFrame,sourceFrameNumber,sourceFrameTime,lastSourceFrame,frameSeekTime} from '../deploy/source-frames.js';
import {synchronization,markedFrame,frameStamp} from '../deploy/timing.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≈ ${b}`);

test('native frame steps ignore both editable FPS values, pause offsets and file endpoints',()=>{
 for(const fps of [24,30,60,240])for(const shotFps of [fps,240]){
  const clip={sourceFps:60,fps,shotFps,duration:2};
  near(stepSourceFrame(.503,1,clip),31/60);near(stepSourceFrame(.503,-1,clip),29/60);
  assert.equal(stepSourceFrame(0,-1,clip),0);near(stepSourceFrame(2,1,clip),119/60);
  near(stepSourceFrame(Math.floor(31/60*1e6)/1e6,-1,clip),.5);
 }
 assert.equal(sourceFrameNumber(0,{video:{duration:NaN}}),0);
});
test('variable-rate frames, marks and labels follow actual timestamps instead of average FPS',()=>{
 const clip={fps:240,shotFps:240,sourceFps:45,sourceFrames:Float64Array.from([0,.033,.067,.1,.117,.134,.151]),duration:.168};
 near(stepSourceFrame(.1,1,clip),.117);near(stepSourceFrame(.1,-1,clip),.067);
 near(stepSourceFrame(.12,-1,clip),.1);assert.equal(sourceFrameNumber(.134,clip),5);
 assert.equal(lastSourceFrame(clip),6);near(sourceFrameTime(6,clip),.151);
 near(markedFrame(.134,clip),.134);assert.equal(frameStamp(.134,clip),'0.134 s · F5');
});
test('linked steps visit every frame boundary, including variable gaps and slow motion',()=>{
 const a={duration:1,fps:30,sourceFps:30,sourceFrames:[0,.033,.067,.1,.117,.134,.151,.2]},b={duration:1,fps:60,sourceFps:60};
 const model=synchronization([a,b]);let times=[0,0],previous=0;
 for(const expected of [1/60,.033,2/60,.05,4/60,.067]){times=model.step(times,1);near(times[0],expected);near(times[1],expected);assert.ok(times[0]>previous);previous=times[0];}
 times=model.step(times,-1);near(times[0],4/60);
 const slow=synchronization([{duration:3,fps:24,sourceFps:60},{duration:8,fps:30,shotFps:120,sourceFps:30}],.25);
 const next=slow.step([.5,3],1);near(next[0],.5+1/120);near(next[1],3+1/30);
});
test('seek targets avoid browser truncation and container overlap without changing marker timestamps',()=>{
 assert.equal(frameSeekTime(0),0);assert.equal(frameSeekTime(1/60),.016667);
 const clip={duration:1,sourceFrames:[0,.021,.042,.063,.083,.104],sourceSeeks:[0,.022,.043,.064,.084,.105]};
 assert.equal(frameSeekTime(stepSourceFrame(.064,1,clip),clip),.084);
 assert.equal(markedFrame(.084,clip),.083);assert.equal(sourceFrameNumber(.084,clip),4);
});
