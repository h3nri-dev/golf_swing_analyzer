import {test,expect} from '@playwright/test';
import {focusVideos,discardIfAsked} from './ui.js';
const fixture=file=>new URL(`./fixtures/${file}`,import.meta.url).pathname;
const card=(page,i)=>page.locator(`[data-slot="${i}"]`);
async function setup(page,{compare=false,empty=false}={}) {
 await page.route('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs',route=>route.fulfill({contentType:'text/javascript',body:`export const FilesetResolver={forVisionTasks:async()=>({})};export const PoseLandmarker={createFromOptions:async()=>({close(){},detectForVideo(canvas,t){if(window.failNextAnalysis)throw new Error('Test detector failure');${empty?'return {landmarks:[]};':`const nodes=[[0,.72],[300,.72],[1300,.2],[1700,.74],[3400,.2],[4000,.2]];let i=1;while(i<nodes.length-1&&nodes[i][0]<t)i++;const a=nodes[i-1],b=nodes[i],y=a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]);const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));p[11].y=p[12].y=.35;p[23].y=p[24].y=.65;p[15].y=p[16].y=y;return {landmarks:[p]};`}}})};`}));
 await page.goto('/');if(compare)await page.locator('#compareMode').click();
 for(const i of compare?[0,1]:[0]){await card(page,i).locator('input[type=file]').setInputFiles(fixture(i?'timing-slow.mp4':'portrait.mp4'));await expect(card(page,i).locator('video')).toBeVisible();}
}
async function analyze(page,index=0){const target=page.locator(`[data-select="${index}"]`);if(await target.isVisible())await target.click();await page.locator('#analyze').click();await expect(page.locator('#status')).toContainText(/Analysis ready|No clear pose/,{timeout:20000});await expect(page.locator(`.key-frame[data-preview-slot="${index}"] canvas`).first()).toBeVisible();}
test('analysis replaces edited markers with seven new estimates and cancellation preserves later edits',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);
 await page.locator('.zoom-slider').first().fill('2');await page.locator('#timeline').fill('0.7');await analyze(page);
 await expect(page.locator('#keyMomentStrip')).toBeVisible();await expect(page.locator('.key-card')).toHaveCount(7);
 for(const canvas of await page.locator('.key-frame[data-preview-slot="0"] canvas').all())await expect(canvas).toBeVisible();
 expect(await card(page,0).locator('video').evaluate(v=>v.currentTime)).toBeCloseTo(.7,3);await expect(page.locator('.zoom-value').first()).toHaveText('2.00×');
 await page.locator('.key-card[data-key="top"] .key-frame').first().click();expect(await card(page,0).locator('video').evaluate(v=>v.currentTime)).toBeCloseTo(1.3,1);await expect(card(page,0).locator('.clip-time')).toContainText('F38');
 await page.locator('.key-card[data-key="impact"] .key-card-title').click();await expect(page.locator('#keyMomentDialog')).toBeVisible();
 const field=page.getByRole('spinbutton',{name:'Key moment frame',exact:true});await field.fill('54');await field.press('Tab');
 await expect(page.locator('[data-review-slot="0"] .key-source')).toHaveText('Your mark');await expect(page.locator('[data-review-slot="0"] .key-detail-time')).toContainText('1.800 s · F54');
 await page.locator('[data-review-slot="0"] .key-frame-next').click();await expect(field).toHaveValue('55');
 await expect(page.locator('[data-review-slot="0"] canvas')).toBeVisible();await page.screenshot({path:'/tmp/keyframes-large.png'});await page.keyboard.press('Escape');
 const edited=await page.evaluate(async()=>(await import('/app.js')).reportData());expect(edited.marks.impact).toBe(55/30);
 await analyze(page);
 const model=await page.evaluate(async()=>(await import('/app.js')).reportData());expect(model.marks).toEqual({});
 expect(model.keyMoments.every(e=>e.source==='estimated')).toBe(true);expect(model.phaseTimes.impact).not.toBe(55/30);
 await expect(page.locator('.key-card[data-key=impact] .key-slot-badge').first()).toHaveText('Auto estimate');
 await page.locator('#timeline').fill('1.834');await page.getByRole('button',{name:'Set Impact here',exact:true}).click();
 await page.locator('#analyze').click();await page.locator('#cancel').click();await expect(page.locator('#status')).toContainText('cancelled');
 await expect(page.locator('.key-card')).toHaveCount(7);expect((await page.evaluate(async()=>(await import('/app.js')).reportData())).marks.impact).toBe(55/30);
 await focusVideos(page);await page.screenshot({path:'/tmp/keyframes-single.png'});const download=page.waitForEvent('download');await page.locator('#export').click();const pdf=await download;await pdf.saveAs('/tmp/swing-key-moments-report.pdf');await expect(page.locator('#reportDialog')).toBeHidden();expect((await page.evaluate(async()=>(await import('/app.js')).reportData())).keyMoments.every(e=>!e.image)).toBe(true);expect(errors).toEqual([]);
});
test('paired previews and slow-motion edits leave independent playback and common controller alone',async({page})=>{
 await setup(page,{compare:true});await analyze(page,0);await analyze(page,1);
 await card(page,1).locator('.shot-fps').selectOption('120');await page.locator('#independent').click();
 const snapshot=await page.locator('#time').textContent();await card(page,0).locator('.clip-speed').selectOption('0.25');
 await card(page,0).locator('.clip-play').click();
 await page.locator('.key-card[data-key="impact"] .key-card-title').click();
 const field=page.getByRole('spinbutton',{name:'Key moment frame in swing B'});await field.fill('120');await field.press('Tab');
 await expect(page.locator('[data-review-slot="1"] .key-detail-time')).toContainText('1.000 s · F120');
 await expect(page.locator('[data-review-slot="1"] canvas')).toBeVisible();await page.screenshot({path:'/tmp/keyframes-compare-large.png'});
 await page.locator('[data-review-slot="1"] .key-play-from').click();
 expect(await card(page,0).locator('video').evaluate(v=>v.paused)).toBe(false);expect(await card(page,1).locator('video').evaluate(v=>v.currentTime)).toBeGreaterThanOrEqual(4);
 await expect(page.locator('#time')).toHaveText(snapshot);
 await card(page,1).locator('.clip-play').click();await card(page,0).locator('.clip-play').click();
 await focusVideos(page);await page.screenshot({path:'/tmp/keyframes-compare.png'});
 await card(page,1).locator('.remove').click();await discardIfAsked(page);for(const canvas of await page.locator('.key-frame[data-preview-slot="1"] canvas').all())await expect(canvas).toBeHidden();
});
for(const [width,height] of [[1440,900],[2560,1440],[320,568],[844,390]])test(`range thumbnails and enlarged view fit ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await setup(page,{empty:true});await analyze(page);
 await expect(page.locator('.key-strip-note')).toContainText('phases are uncertain');await expect(page.locator('.key-card-title').first()).toHaveText('Preview 1 ↗');
 await focusVideos(page);await page.screenshot({path:`/tmp/keyframes-${width}.png`});const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth && e.getBoundingClientRect().width).map(e=>[e.tagName,e.className,e.getBoundingClientRect().right]));expect(await page.evaluate(()=>document.documentElement.scrollWidth),JSON.stringify(overflow)).toBeLessThanOrEqual(width);
 if(width>900){const studio=await page.locator('#studio').boundingBox(),strip=await page.locator('#keyMomentStrip').boundingBox();expect(strip.y+strip.height).toBeLessThan(studio.y+studio.height);expect((await card(page,0).locator('.stage').boundingBox()).height).toBeGreaterThan(200);}
 await page.screenshot({path:`/tmp/keyframes-${width}.png`});await page.locator('.key-enlarge').click();
 await expect(page.locator('[data-review-slot="0"] canvas')).toBeVisible();
 expect(await page.locator('#keyMomentDialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.getByRole('button',{name:'Close key moment view'}).click();
});
test('thumbnail drawings update immediately and unchanged previews do not repaint during playback',async({page})=>{
 await setup(page);await analyze(page);
 const thumb=page.locator('.key-card[data-key="address"] .key-frame[data-preview-slot="0"] canvas');
 await expect(thumb).toBeVisible();const raw=await thumb.evaluate(c=>c.toDataURL());
 await page.locator('[data-tool="line"]').click();
 const box=await card(page,0).locator('.annotation-canvas').boundingBox();
 await page.mouse.move(box.x+box.width*.25,box.y+box.height*.3);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.7,{steps:4});await page.mouse.up();
 await expect(page.locator('#drawingCount')).toHaveText('1 drawing');
 await expect.poll(()=>thumb.evaluate(c=>c.toDataURL())).not.toBe(raw);
 const drawn=await thumb.evaluate(c=>c.toDataURL());
 await page.locator('#drawingVisibility').click();await expect.poll(()=>thumb.evaluate(c=>c.toDataURL())).toBe(raw);
 await page.locator('#drawingVisibility').click();await expect.poll(()=>thumb.evaluate(c=>c.toDataURL())).toBe(drawn);
 await page.locator('#play').click();const stamp=await thumb.getAttribute('data-paint');await page.waitForTimeout(200);await expect(thumb).toHaveAttribute('data-paint',stamp);
});

test('automatic detection fills the editor and tempo; a correction resets to its estimate',async({page})=>{
 await setup(page);await analyze(page);
 const before=await page.evaluate(async()=>(await import('/app.js')).reportData());
 expect(before.keyMoments.every(e=>e.source==='estimated')).toBe(true);expect(before.marks).toEqual({});expect(before.tempo).toBeGreaterThan(0);
 await expect(page.locator('#tempo')).not.toHaveText('—');await expect(page.locator('#tempoNote')).toContainText('auto estimates');
 await page.locator('[data-edit-slot="0"]').click();
 const row=page.locator('.moment-edit-row').filter({hasText:'Impact'});
 await expect(row.locator('input')).toHaveValue(String(Math.round(before.phaseTimes.impact*30)));
 await row.locator('input').fill('60');await row.locator('input').press('Tab');
 await expect(row.getByRole('button',{name:'Reset Impact moment'})).toBeEnabled();
 await row.getByRole('button',{name:'Reset Impact moment'}).click();
 await expect(row.locator('input')).toHaveValue(String(Math.round(before.phaseTimes.impact*30)));
 await page.keyboard.press('Escape');
 const after=await page.evaluate(async()=>(await import('/app.js')).reportData());expect(after.phaseTimes).toEqual(before.phaseTimes);expect(after.marks).toEqual({});
 await expect(page.locator('.key-card[data-key=impact] .key-slot-badge').first()).toContainText('Auto estimate');
});


test('new analysis replaces every marker only on the analyzed video',async({page})=>{
 await setup(page,{compare:true});await page.locator('#independent').click();
 await card(page,0).locator('.clip-timeline').fill('3.5');
 for(const mark of await page.locator('.moment-cell[data-moment-slot="0"] .moment-mark').all())await mark.click();
 await card(page,1).locator('.clip-timeline').fill('1');
 await page.getByRole('button',{name:'Set Impact here in swing B',exact:true}).click();
 const before=await page.evaluate(async()=>{const app=await import('/app.js');return [app.reportData(0),app.reportData(1)];});
 expect(Object.keys(before[0].marks)).toHaveLength(7);expect(before[1].marks.impact).toBe(1);
 await analyze(page,0);
 const after=await page.evaluate(async()=>{const app=await import('/app.js');return [app.reportData(0),app.reportData(1)];});
 expect(after[0].marks).toEqual({});expect(after[0].keyMoments.every(e=>e.source==='estimated')).toBe(true);
 expect(after[1].marks).toEqual(before[1].marks);expect(after[1].keyMoments).toEqual(before[1].keyMoments);
 await expect(page.locator('.key-card[data-key=impact] [data-preview-slot="0"] .key-slot-badge')).toHaveText('A · Auto');
 await expect(page.locator('.key-card[data-key=impact] [data-preview-slot="1"] .key-slot-badge')).toHaveText('B · Marked');
 await expect(page.locator('#tempoNote')).toContainText('auto estimates');
 await page.locator('[data-edit-slot="0"]').click();
 await expect(page.getByRole('spinbutton',{name:'Impact frame in swing A',exact:true})).toHaveValue(String(Math.round(after[0].phaseTimes.impact*30)));
 await expect(page.locator('.moment-reset-all')).toBeDisabled();await page.keyboard.press('Escape');
 await page.screenshot({path:'/tmp/reanalysis-markers-compare.png'});
});

test('completed analysis without a detectable pose replaces old marks with honest range previews',async({page})=>{
 await setup(page,{empty:true});await page.locator('#timeline').fill('3.5');
 await page.getByRole('button',{name:'Set Impact here',exact:true}).click();
 await page.locator('#timeline').fill('1');await analyze(page);
 const report=await page.evaluate(async()=>(await import('/app.js')).reportData());
 expect(report.marks).toEqual({});expect(report.keyMoments.every(e=>e.source==='sampled'&&e.time>=0&&e.time<=4)).toBe(true);
 expect(report.phaseTimes).toEqual({});expect(report.tempo).toBeNull();
 await expect(page.locator('#commonPlayer .timeline-moments button')).toHaveCount(0);
 await expect(page.locator('.key-card-title').first()).toHaveText('Preview 1 ↗');
});

test('failed reanalysis keeps the previous estimates and manual markers',async({page})=>{
 await setup(page);await analyze(page);await page.locator('#timeline').fill('1.8');
 await page.getByRole('button',{name:'Set Impact here',exact:true}).click();
 const before=await page.evaluate(async()=>(await import('/app.js')).reportData());
 await page.evaluate(()=>{window.failNextAnalysis=true;});await page.locator('#analyze').click();
 await expect(page.locator('#status')).toContainText('Analysis unavailable');await expect(page.locator('#analyze')).toBeEnabled();
 const after=await page.evaluate(async()=>(await import('/app.js')).reportData());
 for(const key of ['marks','keyMoments','phaseTimes','measurements','analyzedRange'])expect(after[key]).toEqual(before[key]);
 await expect(page.locator('.key-card[data-key=impact] .key-slot-badge').first()).toHaveText('Your mark');
});
