import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DrawingHistory, toVideoPoint, angleDegrees, movePoints, hitShape, isDrawingVisible } from '../deploy/drawing.js';
test('pointer coordinates account for video bounds and mirroring',()=>{
  const rect={left:100,top:50,width:200,height:400};
  assert.deepEqual(toVideoPoint(150,250,rect),{x:.25,y:.5});
  assert.deepEqual(toVideoPoint(150,250,rect,true),{x:.75,y:.5});
  assert.deepEqual(toVideoPoint(50,600,rect),{x:0,y:1});
});
test('hand-drawn angles use image geometry in portrait and landscape',()=>{
  assert.ok(Math.abs(angleDegrees([{x:0,y:.25},{x:.5,y:0},{x:1,y:.25}],200,400)-90)<1e-8);
  assert.equal(angleDegrees([{x:0,y:0},{x:0,y:0},{x:1,y:1}],200,400),null);
});
test('moving drawings at image boundaries preserves their geometry',()=>{
  assert.deepEqual(movePoints([{x:.2,y:.1},{x:.5,y:.8}],1,-1),[{x:.7,y:0},{x:1,y:.7000000000000001}]);
});
test('hit-testing selects strokes rather than blank space',()=>{
  const line={tool:'line',points:[{x:.2,y:.2},{x:.8,y:.8}]};
  assert.ok(hitShape(line,{x:.5,y:.5},200,400));
  assert.ok(!hitShape(line,{x:.9,y:.1},200,400));
  const circle={tool:'circle',points:[{x:.2,y:.2},{x:.8,y:.8}]};
  assert.ok(hitShape(circle,{x:.8,y:.5},200,200));
  assert.ok(!hitShape(circle,{x:.5,y:.5},200,200));
});
test('frame drawings disappear after stepping and full-clip drawings persist',()=>{
  const shape={scope:'frame',time:1,frameDuration:1/30};
  assert.ok(isDrawingVisible(shape,1));
  assert.ok(!isDrawingVisible(shape,1+1/30));
  assert.ok(isDrawingVisible({...shape,scope:'clip'},300));
});
test('independent bounded histories support undo, redo, branch and clear',()=>{
  const a=new DrawingHistory(),b=new DrawingHistory();
  a.commit([{id:1}]);a.commit([{id:2}]);a.undo();assert.deepEqual(a.items,[{id:1}]);a.redo();assert.deepEqual(a.items,[{id:2}]);
  a.undo();a.commit([]);assert.equal(a.future.length,0);a.undo();assert.deepEqual(a.items,[{id:1}]);
  assert.deepEqual(b.items,[]);
  for(let i=0;i<60;i++)a.commit([{id:i}]);assert.equal(a.past.length,50);
  a.reset();assert.deepEqual(a.items,[]);assert.deepEqual(a.past,[]);
});
