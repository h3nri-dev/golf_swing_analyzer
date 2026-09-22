import test from 'node:test';
import assert from 'node:assert/strict';
import {timelineBounds,markerLayout} from '../deploy/timeline.js';
const slot={ready:true,video:{duration:600},fps:30,analyzedRange:[295,305]};
test('timeline expands completed analysis without following a moving selection or retiming saved frames',()=>{
  assert.deepEqual(timelineBounds({...slot,start:500,end:510,shotFps:120},true),{start:295,end:305,available:true,focused:true});
  assert.deepEqual(timelineBounds(slot,false),{start:0,end:600,available:true,focused:false});
  assert.equal(timelineBounds({...slot,analyzedRange:[0,600]},true).available,false);
  assert.equal(timelineBounds({...slot,analyzedRange:[305,295]},true).available,false);
  assert.equal(timelineBounds({...slot,ready:false},true).available,false);
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
