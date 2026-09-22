import {test,expect} from '@playwright/test';
const slot=(p,i)=>p.locator(`[data-slot="${i}"]`);
const data=(p,i=0)=>p.evaluate(async i=>(await import('/app.js')).reportData(i),i);
async function load(page,i=0,file='timing-30.mp4'){
 await slot(page,i).locator('input[type=file]').setInputFiles(new URL(`./fixtures/${file}`,import.meta.url).pathname);await expect(slot(page,i).locator('video')).toBeVisible();
}
async function mock(page){
 await page.route('**/vision_bundle.mjs',r=>r.fulfill({contentType:'text/javascript',body:`export const FilesetResolver={forVisionTasks:async()=>({})};export const PoseLandmarker={createFromOptions:async(_,options)=>{window.modelOptions=options;window.modelFrames=[];return{close(){},detectForVideo(canvas,t){window.modelFrames.push({w:canvas.width,h:canvas.height,t});const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));p[11]={x:.3,y:.2,visibility:1};p[12]={x:.6,y:.2,visibility:1};p[13]={x:.3,y:.4,visibility:1};p[14]={x:.6,y:.4,visibility:1};p[15]={x:.4,y:.4,visibility:1};p[16]={x:.6,y:.6,visibility:1};p[23]={x:.4,y:.6,visibility:1};p[24]={x:.6,y:.6,visibility:1};return{landmarks:[p]}}}}};`}));
}
async function analyze(page){await page.locator('#analyze').click();await expect(page.locator('#status')).toContainText('Analysis ready',{timeout:25000});}
async function seek(page,i,time){await slot(page,i).locator('.clip-timeline').fill(String(time));}
async function line(page,tool='rect',i=0){await page.locator(`[data-tool=${tool}]`).click();const b=await slot(page,i).locator('.annotation-canvas').boundingBox();await page.mouse.move(b.x+b.width*.25,b.y+b.height*.3);await page.mouse.down();await page.mouse.move(b.x+b.width*.7,b.y+b.height*.7,{steps:5});await page.mouse.up();return b;}

test('restored measurement, overlay and crop controls preserve per-video work',async({page})=>{
 await mock(page);await page.goto('/');await page.locator('#compareMode').click();await load(page);await load(page,1);await page.locator('[data-select="0"]').click();await analyze(page);
 await expect(page.locator('[data-metric]')).toHaveCount(8);await expect(page.locator('#trailElbow')).toHaveText('180°');
 await page.locator('#headPath').check();await page.locator('#trailPath').check();await page.locator('#poseAngles').check();await page.locator('#overlaySize').fill('3');
 await page.locator('[data-select="1"]').click();await expect(page.locator('#headPath')).not.toBeChecked();await analyze(page);
 await expect(page.locator('[data-metric=elbow] [data-value=delta]')).toHaveText('+0°');
 const canvas=slot(page,0).locator('.pose-canvas'),before=await canvas.evaluate(c=>c.toDataURL());await page.locator('#ghostOverlay').check();await expect.poll(()=>canvas.evaluate(c=>c.toDataURL())).not.toBe(before);
 await page.locator('[data-select="0"]').click();await line(page);await page.locator('[data-moment=impact][data-moment-slot="0"] .moment-mark').click();
 const saved=await data(page);await page.locator('[data-settings-slot="0"] .video-crop').selectOption('left');
 expect((await data(page)).measurements).toHaveLength(0);await analyze(page);expect((await data(page)).currentMeasurements.elbow).toBeCloseTo(90,4);
 expect(await page.evaluate(()=>window.modelFrames[0].w)).toBe(64);
 await page.locator('[data-settings-slot="0"] .video-crop').selectOption('full');const restored=await data(page);
 expect(restored.marks).toEqual(saved.marks);expect(restored.drawings).toEqual(saved.drawings);expect(restored.measurements).toEqual(saved.measurements);
 await page.screenshot({path:'/tmp/restoration-compare.png'});const download=page.waitForEvent('download');await page.locator('#export').click();await (await download).saveAs('/tmp/restoration-compare-report.pdf');await expect(page.locator('#reportDialog')).toBeHidden();await expect(page.locator('#ghostOverlay')).toBeChecked();expect((await data(page)).drawings).toEqual(saved.drawings);
});

test('detailed analysis uses the larger model and selected file-frame rate',async({page})=>{
 await mock(page);await page.goto('/');await load(page,0,'timing-60.mp4');await page.locator('.fps').first().selectOption('60');
 await page.locator('#rangeEnd').fill('0.5');await page.locator('.analysis-quality').first().selectOption('detailed');await analyze(page);
 const report=await data(page);expect(report.measurements).toHaveLength(30);expect(report.measurements[1].time).toBeCloseTo(1/60,6);
 expect(await page.evaluate(()=>window.modelOptions.baseOptions.modelAssetPath)).toContain('pose_landmarker_heavy');
 await page.locator('.video-crop').first().selectOption('right');await slot(page,0).locator('.remove').click();await expect(page.locator('#discardDialog')).toBeVisible();await page.locator('#discardCancel').click();expect((await data(page)).crop).toBe('right');
});

test('label, box, transforms and copying are editable beside the video without copying twice',async({page})=>{
 await page.goto('/');await page.locator('#compareMode').click();await load(page);await load(page,1);await page.locator('[data-select="0"]').click();await page.locator('#drawingLink').check();
 const b=await line(page);expect((await data(page,1)).drawings).toHaveLength(1);
 await page.locator('[data-tool=select]').click();await page.mouse.click(b.x+b.width*.25,b.y+b.height*.3);await slot(page,0).locator('.drawing-edit-float').click();
 await page.locator('[data-rotate="15"]').click();await page.locator('[data-scale="1.15"]').click();await page.locator('#drawingEditor').getByRole('button',{name:'Done',exact:true}).click();
 expect((await data(page)).drawings[0].rotation).toBe(15);
 await page.locator('[data-tool=label]').click();await page.mouse.click(b.x+b.width*.4,b.y+b.height*.5);await page.locator('#drawingLabel').fill('Keep head steady');await page.locator('#drawingEditor').getByRole('button',{name:'Done',exact:true}).click();
 expect((await data(page,1)).drawings).toHaveLength(2);expect((await data(page,1)).drawings[1].label).toBe('Keep head steady');
 await page.locator('#drawingCopy').click();expect((await data(page)).drawings).toHaveLength(2);expect((await data(page,1)).drawings).toHaveLength(3);
 await page.locator('#drawingCustomColor').fill('#e12345');expect((await data(page)).drawings[1].color).toBe('#e12345');
 await page.screenshot({path:'/tmp/restoration-drawing.png'});
});

test('phase alignment considers shot FPS, and markers plus reset remain local with sync off',async({page})=>{
 await page.goto('/');await page.locator('#compareMode').click();await load(page);await load(page,1,'timing-slow.mp4');await slot(page,1).locator('.shot-fps').selectOption('120');
 await seek(page,0,.5);await page.locator('[data-moment=impact][data-moment-slot="0"] .moment-mark').click();
 await seek(page,1,1);await page.locator('[data-moment=impact][data-moment-slot="1"] .moment-mark').click();await page.locator('.key-card[data-key=impact] .key-sync').click();
 await expect(page.locator('#linked')).toHaveAttribute('aria-pressed','true');await page.locator('#next').click();
 expect(await slot(page,0).locator('video').evaluate(v=>v.currentTime)).toBeCloseTo(.5+1/30,3);expect(await slot(page,1).locator('video').evaluate(v=>v.currentTime)).toBeCloseTo(4+4/30,3);
 await page.locator('#independent').click();const clock=await page.locator('#time').textContent();await slot(page,1).locator('.clip-play').click();
 await page.locator('[data-slot="0"] .timeline-moments button').click();expect(await slot(page,1).locator('video').evaluate(v=>v.paused)).toBe(false);await expect(page.locator('#time')).toHaveText(clock);
 await page.locator('[data-edit-slot="0"]').click();await page.locator('.moment-reset-all').click();expect((await data(page)).marks).toEqual({});await page.locator('.moment-reset-all').click();expect((await data(page)).marks.impact).toBe(.5);
});

test('loop window repeats independently and Follow turns looping off',async({page})=>{
 await page.goto('/');await page.locator('#compareMode').click();await load(page);await load(page,1);await page.locator('#independent').click();await page.locator('[data-select="0"]').click();
 await page.locator('#rangeStart').fill('0.3');await page.locator('#rangeEnd').fill('0.6');await page.locator('#loopRange').click();await expect(page.locator('#loopRange')).toHaveAttribute('aria-pressed','true');
 const clock=await page.locator('#time').textContent();await slot(page,1).locator('.clip-play').click();await slot(page,0).locator('.clip-play').click();await page.waitForTimeout(900);
 const time=await slot(page,0).locator('video').evaluate(v=>v.currentTime);expect(time).toBeGreaterThanOrEqual(.3);expect(time).toBeLessThan(.65);expect(await slot(page,1).locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(.7);await expect(page.locator('#time')).toHaveText(clock);
 await page.locator('#rangeReset').click();await expect(page.locator('#loopRange')).toHaveAttribute('aria-pressed','false');await page.locator('#rangeStart').fill('3');await expect(page.locator('#loopRange')).toBeDisabled();
});

for(const [width,height] of [[1440,900],[1280,720],[2560,1440],[390,844]])test(`analyzed workspace retains readable, visible tools at ${width}x${height}`,async({page})=>{
 await mock(page);await page.setViewportSize({width,height});await page.goto('/');await page.locator('#compareMode').click();await load(page);await load(page,1);await analyze(page);
 const errors=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().right>innerWidth+1).map(e=>e.id||e.className));expect(errors).toEqual([]);
 if(width>=1440){const size=await page.locator('#analysisPanel').evaluate(e=>({h:e.clientHeight,sh:e.scrollHeight}));expect(size.sh).toBeLessThanOrEqual(size.h+1);}
 await page.screenshot({path:`/tmp/restoration-layout-${width}.png`,fullPage:width<901});
});

test('linked looping respects calibrated overlap and loops through the natural clip end',async({page})=>{
 await page.goto('/');await page.locator('#compareMode').click();await load(page);await load(page,1,'timing-slow.mp4');await slot(page,1).locator('.shot-fps').selectOption('120');
 await page.locator('[data-select="0"]').click();await page.locator('#rangeStart').fill('1.5');await page.locator('#rangeEnd').fill('2');await page.locator('#loopRange').click();await page.locator('#play').click();
 await page.waitForTimeout(900);let times=await page.locator('.video-card video').evaluateAll(v=>v.map(x=>x.currentTime));expect(times[0]).toBeGreaterThanOrEqual(1.5);expect(times[0]).toBeLessThan(2);expect(Math.abs(times[1]/4-times[0])).toBeLessThan(.1);
 await expect(page.locator('#play')).toContainText('Pause');await page.locator('#independent').click();await page.locator('[data-select="0"]').click();await page.waitForTimeout(650);
 expect(await slot(page,0).locator('video').evaluate(v=>v.paused)).toBe(false);expect(await slot(page,0).locator('video').evaluate(v=>v.currentTime)).toBeGreaterThanOrEqual(1.5);
});

test('cropped mirrored views keep drawings and exported images aligned',async({page})=>{
 await page.goto('/');await load(page,0,'landscape.mp4');await page.locator('.video-crop').first().selectOption('right');await page.locator('[data-settings-slot="0"] .mirror').click();
 await page.locator('[data-tool=rect]').click();const b=await slot(page,0).locator('.annotation-canvas').boundingBox();await page.mouse.move(b.x+b.width*.1,b.y+b.height*.3);await page.mouse.down();await page.mouse.move(b.x+b.width*.4,b.y+b.height*.7,{steps:5});await page.mouse.up();const shapes=(await data(page)).drawings;expect(shapes).toHaveLength(1);expect(shapes[0].points.every(p=>p.x>=.5&&p.x<=1)).toBe(true);
 await page.locator('.zoom-slider').first().fill('2');await page.locator('[data-tool=view]').click();const download=page.waitForEvent('download');await page.locator('#drawingSnapshot').click();await (await download).saveAs('/tmp/restoration-crop.png');
 await page.screenshot({path:'/tmp/restoration-crop-view.png'});expect((await data(page)).drawings).toEqual(shapes);
});
