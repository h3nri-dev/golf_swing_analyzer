import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitVideo, constrainView, zoomAt, viewOffset } from '../deploy/viewport.js';

test('video fit preserves portrait and landscape proportions',()=>{
  assert.deepEqual(fitVideo(360,640,600,480),{width:270,height:480});
  assert.deepEqual(fitVideo(640,360,600,480),{width:600,height:338});
});
test('pan bounds do not expose empty space and fit always recenters',()=>{
  const image={width:300,height:500},stage={width:500,height:500};
  assert.deepEqual(constrainView({zoom:2,x:-1,y:9},image,stage),{zoom:2,x:5/12,y:.75});
  assert.deepEqual(constrainView({zoom:1,x:.2,y:.8},image,stage),{zoom:1,x:.5,y:.5});
  assert.equal(constrainView({zoom:99,x:.5,y:.5},image,stage).zoom,4);
});
test('cursor-anchored zoom keeps the same image point under the pointer',()=>{
  const image={width:500,height:500},stage={width:500,height:500},anchor={x:350,y:300};
  const start={zoom:1,x:.5,y:.5},end=zoomAt(start,2,anchor,image,stage);
  assert.deepEqual(end,{zoom:2,x:.6,y:.55});
  assert.ok(Math.abs(start.x+(anchor.x-250)/(image.width*start.zoom)-end.x-(anchor.x-250)/(image.width*end.zoom))<1e-8);
  const offset=viewOffset(end,image);assert.ok(Math.abs(offset.x+100)<1e-8);assert.ok(Math.abs(offset.y+50)<1e-8);
});
test('zooming back out bounds the pan position on both axes',()=>{
  const image={width:500,height:500},stage={width:500,height:500};
  assert.deepEqual(zoomAt({zoom:4,x:.8,y:.8},1,{x:250,y:250},image,stage),{zoom:1,x:.5,y:.5});
});
