import {test,expect} from '@playwright/test';
const clip=(page,i=0)=>page.locator(`[data-slot="${i}"]`);
const model=(page,i=0)=>page.evaluate(async i=>(await import('/app.js')).reportData(i),i);
async function load(page,i=0){await clip(page,i).locator('input[type=file]').setInputFiles(new URL('./fixtures/window-60s.mp4',import.meta.url).pathname);await expect(clip(page,i).locator('video')).toBeVisible();}
async function setup(page){
 await page.route('**/vision_bundle.mjs',r=>r.fulfill({contentType:'text/javascript',body:`export const FilesetResolver={forVisionTasks:async()=>({})};export const PoseLandmarker={createFromOptions:async()=>({close(){},detectForVideo(canvas,t){const nodes=[[0,.72],[300,.72],[1300,.2],[1700,.74],[3400,.2],[20000,.2]];let i=1;while(i<nodes.length-1&&nodes[i][0]<t)i++;const a=nodes[i-1],b=nodes[i],y=a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]);const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));p[11].y=p[12].y=.35;p[23].y=p[24].y=.65;p[15].y=p[16].y=y;return{landmarks:[p]}}})};`}));
 await page.goto('/');await load(page);
}
async function analyze(page){await page.locator('#analyze').click();await expect(page.locator('#status')).toContainText('Analysis ready',{timeout:20000});}
async function bounds(track,start,end){await expect(track).toHaveAttribute('min',String(start));await expect(track).toHaveAttribute('max',String(end));}

test('analysis expands the timeline and separated markers seek exact frames without moving the review window',async({page})=>{
 await setup(page);await page.locator('#timeline').fill('30');await clip(page).locator('.zoom-slider').fill('2');await analyze(page);
 const common=page.locator('#commonPlayer'),track=page.locator('#timeline');await bounds(track,25,35);
 await expect(common.locator('.timeline-bounds')).toHaveText('25.000–35.000 s · 6×');
 await expect(common.locator('.timeline-moments button')).toHaveCount(7);
 const boxes=await common.locator('.timeline-moments button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}}));
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)expect(boxes[i].x+boxes[i].w<=boxes[j].x||boxes[j].x+boxes[j].w<=boxes[i].x||boxes[i].y+boxes[i].h<=boxes[j].y||boxes[j].y+boxes[j].h<=boxes[i].y).toBe(true);
 const report=await model(page);await common.locator('[data-key=impact]').click();
 expect(await clip(page).locator('video').evaluate(v=>v.currentTime)).toBeCloseTo(report.phaseTimes.impact,4);await bounds(track,25,35);
 await page.locator('#play').click();await expect.poll(async()=>await clip(page).locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(report.phaseTimes.impact+.05);await page.locator('#play').click();await bounds(track,25,35);
 const before=await clip(page).locator('video').evaluate(v=>v.currentTime);await common.locator('.timeline-full').click();await bounds(track,0,60);expect(await clip(page).locator('video').evaluate(v=>v.currentTime)).toBe(before);
 await common.locator('.timeline-range').click();await bounds(track,25,35);await expect(clip(page).locator('.zoom-value')).toHaveText('2.00×');
 expect((await track.boundingBox()).width).toBeGreaterThan((await common.boundingBox()).width*.75);
 await page.screenshot({path:'/tmp/timeline-expanded-single.png'});
 await page.setViewportSize({width:1280,height:720});await expect(common.locator('.timeline-range')).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);await page.screenshot({path:'/tmp/timeline-expanded-single-1280.png'});
});

test('local expanded timelines remain independent and common marker seeks honor slow-motion timing',async({page})=>{
 await setup(page);await page.locator('#compareMode').click();await load(page,1);await page.locator('#independent').click();
 await clip(page,0).locator('.clip-timeline').fill('25');await analyze(page);
 await clip(page,1).locator('.shot-fps').selectOption('120');await clip(page,1).locator('.clip-timeline').fill('5');await analyze(page);
 await bounds(clip(page,0).locator('.clip-timeline'),20,30);await bounds(clip(page,1).locator('.clip-timeline'),0,10);await bounds(page.locator('#timeline'),0,10);
 const clock=await page.locator('#time').textContent(),value=await page.locator('#timeline').inputValue();
 await clip(page,1).locator('.clip-play').click();await clip(page,0).locator('.timeline-moments [data-key=top]').click();
 expect(await clip(page,1).locator('video').evaluate(v=>v.paused)).toBe(false);await expect(page.locator('#time')).toHaveText(clock);await expect(page.locator('#timeline')).toHaveValue(value);
 await clip(page,1).locator('.clip-play').click();
 const before=await page.locator('.video-card video').evaluateAll(v=>v.map(x=>x.currentTime)),b=await model(page,1);
 await page.locator('#commonPlayer .timeline-moments [data-key=impact]').click();
  const after=await page.locator('.video-card video').evaluateAll(v=>v.map(x=>x.currentTime));expect(after[1]).toBeCloseTo(b.phaseTimes.impact,4);expect(after[0]).toBeCloseTo(before[0]+(after[1]-before[1])/4,4);
 await page.locator('#linked').click();await page.locator('#commonPlayer .timeline-moments [data-key=top]').click();await expect(page.locator('#linked')).toHaveAttribute('aria-pressed','true');
 const synced=await page.locator('.video-card video').evaluateAll(v=>v.map(x=>x.currentTime));expect(synced[1]).toBeCloseTo(b.phaseTimes.top,4);expect(synced[0]).toBeCloseTo(synced[1]/4,4);
 for(const [width,height] of [[1440,900],[1280,720],[2560,1440],[390,844]]){
  await page.setViewportSize({width,height});await page.locator('#studio').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:`/tmp/timeline-expanded-compare-${width}.png`,fullPage:width<901});
  if(width>900){await expect(page.locator('#commonPlayer .timeline-full')).toBeInViewport();expect((await clip(page).locator('.stage').boundingBox()).height).toBeGreaterThan(90);}
  if(width>900&&height<=900){
   for(const i of [0,1]){
    const dots=await clip(page,i).locator('.timeline-moments button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return {left:r.left,right:r.right}}).sort((a,b)=>a.left-b.left));
    for(let j=1;j<dots.length;j++)expect(dots[j].left).toBeGreaterThanOrEqual(dots[j-1].right);
   }
   const current=await clip(page,0).locator('video').evaluate(v=>v.currentTime);
   await clip(page,0).locator('.timeline-toggle').click();await bounds(clip(page,0).locator('.clip-timeline'),0,60);await bounds(page.locator('#timeline'),0,10);
   await clip(page,0).locator('.timeline-toggle').click();await bounds(clip(page,0).locator('.clip-timeline'),20,30);expect(await clip(page,0).locator('video').evaluate(v=>v.currentTime)).toBe(current);await expect(page.locator('#linked')).toHaveAttribute('aria-pressed','true');
  }
 }
});

test('cancellation preserves the review window and FPS calibration changes clocks without changing its saved frames',async({page})=>{
 await setup(page);await page.locator('#timeline').fill('30');await analyze(page);await bounds(page.locator('#timeline'),25,35);
 await page.locator('#rangeStart').fill('40');await page.locator('#rangeEnd').fill('45');await page.locator('#analyze').click();await page.locator('#cancel').click();await expect(page.locator('#status')).toContainText('cancelled');await bounds(page.locator('#timeline'),25,35);
 await clip(page).locator('.shot-fps').selectOption('120');await bounds(page.locator('#timeline'),6.25,8.75);expect((await model(page)).analyzedRange).toEqual([25,35]);
 await page.locator('#commonPlayer .timeline-full').click();await bounds(page.locator('#timeline'),0,15);
 await page.locator('#rangeStart').fill('8');await page.locator('#rangeEnd').fill('13');await analyze(page);await bounds(page.locator('#timeline'),8,13);
});
