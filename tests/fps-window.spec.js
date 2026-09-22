import {test,expect} from '@playwright/test';
const clip=(p,i=0)=>p.locator(`[data-slot="${i}"]`);
const data=(p,i=0)=>p.evaluate(async i=>(await import('/app.js')).reportData(i),i);
async function load(p,i=0){await clip(p,i).locator('input[type=file]').setInputFiles(new URL('./fixtures/window-60s.mp4',import.meta.url).pathname);await expect(clip(p,i).locator('video')).toBeVisible();}
async function windowAt(rail,start,end){await expect(rail).toHaveAttribute('data-start',String(start));await expect(rail).toHaveAttribute('data-end',String(end));}
async function width(rail){return rail.locator('.timeline-window').evaluate(e=>parseFloat(e.style.width));}

test('single-mode window and scan selection resize immediately for recording and file FPS',async({page})=>{
 await page.route('**/vision_bundle.mjs',r=>r.fulfill({contentType:'text/javascript',body:'export const FilesetResolver={forVisionTasks:async()=>({})};export const PoseLandmarker={createFromOptions:async()=>({close(){},detectForVideo(){return {landmarks:[]}}})};'}));
 await page.goto('/');await load(page);await page.locator('#timeline').fill('30');
 const rail=page.locator('#commonPlayer .timeline-rail');await windowAt(rail,25,35);const original=await width(rail);
 // Normal-speed files retain ten real seconds regardless of encoded FPS.
 await clip(page).locator('.fps').selectOption('60');await windowAt(rail,25,35);expect(await width(rail)).toBe(original);
 await clip(page).locator('.fps').selectOption('30');
 for(const [shot,start,end,factor] of [['60',20,40,2],['120',10,50,4]]){
  await clip(page).locator('.shot-fps').selectOption(shot);await windowAt(rail,start,end);expect((await data(page)).selectedRange).toEqual([start,end]);expect(await width(rail)).toBeCloseTo(original*factor,3);
 }
 await clip(page).locator('.fps').selectOption('60');await windowAt(rail,20,40);expect((await data(page)).selectedRange).toEqual([20,40]);
 expect(await clip(page).locator('video').evaluate(v=>v.currentTime)).toBe(30);await expect(page.locator('#timeline')).toHaveValue('15');
 await page.screenshot({path:'/tmp/fps-window-single.png'});
 await page.locator('#analyze').click();await expect(page.locator('#status')).toContainText('No clear pose',{timeout:15000});
 expect((await data(page)).analyzedRange).toEqual([20,40]);expect(await width(rail)).toBe(100);
 await clip(page).locator('.shot-fps').selectOption('same');await windowAt(rail,25,35);await expect(page.locator('#timeline')).toHaveValue('30');
 expect(await width(rail)).toBe(50);expect((await data(page)).analyzedRange).toEqual([20,40]);
 await page.screenshot({path:'/tmp/fps-window-single-analyzed.png'});
});

for(const clock of [0,1])test(`Sync off refreshes swing ${clock?'B':'A'} calibration without adopting its independently moved playhead`,async({page})=>{
 await page.goto('/');await page.locator('#compareMode').click();await load(page);await load(page,1);
 await page.locator(`[data-select="${clock}"]`).click();await page.locator('#timeline').fill('30');await page.locator('#independent').click();
 const common=page.locator('#commonPlayer .timeline-rail'),local=clip(page,clock).locator('.timeline-rail');
 await clip(page,clock).locator('.clip-timeline').fill('35');await windowAt(common,25,35);await windowAt(local,30,40);
 const commonPlay=await page.locator('#play').getAttribute('aria-label'),commonSpeed=await page.locator('#speed').inputValue();
 await clip(page,1-clock).locator('.clip-play').click();
 await clip(page,clock).locator('.shot-fps').selectOption('120');
 await windowAt(common,10,50);await windowAt(local,15,55);expect((await data(page,clock)).selectedRange).toEqual([15,55]);
 await expect(common).toHaveAttribute('data-time','30');await expect(page.locator('#timeline')).toHaveValue('7.5');await expect(page.locator('#play')).toHaveAttribute('aria-label',commonPlay);await expect(page.locator('#speed')).toHaveValue(commonSpeed);
 expect(await clip(page,1-clock).locator('video').evaluate(v=>v.paused)).toBe(false);
 await clip(page,clock).locator('.fps').selectOption('60');await windowAt(common,20,40);await windowAt(local,25,45);expect((await data(page,clock)).selectedRange).toEqual([25,45]);
 await clip(page,1-clock).locator('.clip-play').click();await page.screenshot({path:`/tmp/fps-window-independent-${clock}.png`});
 // Retiming the other video must not recalibrate the common clock.
 const saved=await common.evaluate(e=>({...e.dataset}));await clip(page,1-clock).locator('.shot-fps').selectOption('240');expect(await common.evaluate(e=>({...e.dataset}))).toEqual(saved);
 await clip(page,clock).locator('.shot-fps').selectOption('same');await windowAt(common,25,35);await windowAt(local,30,40);
});

test('linked comparison resizes both windows in each clip calibration and changes back without drift',async({page})=>{
 await page.goto('/');await page.locator('#compareMode').click();await load(page);await load(page,1);
 await clip(page,0).locator('.shot-fps').selectOption('60');await clip(page,1).locator('.shot-fps').selectOption('120');
 await page.locator('[data-select="1"]').click();await page.locator('#timeline').fill('7.5');
 await windowAt(clip(page,0).locator('.timeline-rail'),5,25);await windowAt(clip(page,1).locator('.timeline-rail'),10,50);await windowAt(page.locator('#commonPlayer .timeline-rail'),10,50);
 await clip(page,1).locator('.fps').selectOption('60');
 await windowAt(clip(page,0).locator('.timeline-rail'),20,40);await windowAt(clip(page,1).locator('.timeline-rail'),20,40);await windowAt(page.locator('#commonPlayer .timeline-rail'),20,40);
 await expect(page.locator('#linked')).toHaveAttribute('aria-pressed','true');await page.screenshot({path:'/tmp/fps-window-linked.png'});
});
