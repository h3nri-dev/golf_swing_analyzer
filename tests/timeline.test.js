import test from 'node:test';
import assert from 'node:assert/strict';
import {timelineBounds,markerLayout,linkedLoopBounds} from '../deploy/timeline.js';
import {synchronization} from '../deploy/timing.js';
const slot={ready:true,video:{duration:600},fps:30,analyzedRange:[295,305]};
test('timeline expands completed analysis without following a moving selection or retiming saved frames',()=>{
  assert.deepEqual(timelineBounds({...slot,start:500,end:510,shotFps:120},true),{start:295,end:305,available:true,focused:true});
  assert.deepEqual(timelineBounds(slot,false),{start:0,end:600,available:true,focused:false});
  assert.equal(timelineBounds({...slot,analyzedRange:[0,600]},true).focused,true);
  assert.equal(timelineBounds({...slot,analyzedRange:[305,295]},true).available,false);
  assert.equal(timelineBounds({...slot,ready:false},true).available,false);
});
test('linked playback intersects file ranges using FPS calibration and alignment without changing them',()=>{
  const clips=[{duration:60,fps:60},{duration:60,fps:30,shotFps:120}];
  const model=synchronization(clips,2),ranges=[[5,10],[32,48]];
  assert.deepEqual(linkedLoopBounds(model,ranges),{start:6,end:10});
  assert.deepEqual(model.mediaTimes(6),[6,32]);
  assert.deepEqual(ranges,[[5,10],[32,48]]);
  assert.equal(linkedLoopBounds(model,[[1,3],[32,48]]),null);
  assert.deepEqual(linkedLoopBounds(model,[null,[32,48]]),{start:6,end:10});
  assert.deepEqual(linkedLoopBounds(model,[null,null]),model.bounds);
  assert.equal(linkedLoopBounds(null,ranges),null);
});
test('dense timeline moments have distinct click targets while retaining their actual time positions',()=>{
  const entries=[{key:'outside',time:294},{key:'a',time:295},{key:'b',time:295.01},{key:'c',time:295.02},{key:'d',time:300},{key:'e',time:305}];
  const layout=markerLayout(entries,{start:295,end:305},300);
  assert.equal(layout.length,5);
  assert.equal(layout[0].anchor,7);assert.equal(layout.at(-1).anchor,293);
  for(let i=0;i<layout.length;i++)for(let j=i+1;j<layout.length;j++){
    if(layout[i].lane===layout[j].lane)assert.ok(Math.abs(layout[i].center-layout[j].center)>=28);
  }
  assert.equal(layout.find(x=>x.key==='d').center,150);
});
