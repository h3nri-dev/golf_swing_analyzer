import {test,expect} from '@playwright/test';
const card=(p,i=0)=>p.locator(`[data-slot="${i}"]`);
const data=(p,i=0)=>p.evaluate(async i=>(await import('/app.js')).reportData(i),i);
async function load(p,i=0){await card(p,i).locator('input[type=file]').setInputFiles(new URL('./fixtures/window-60s.mp4',import.meta.url).pathname);await expect(card(p,i).locator('video')).toBeVisible();}
async function bounds(p,start,end,i=0){await expect.poll(async()=>(await data(p,i)).selectedRange.map(n=>Math.round(n*1000)/1000)).toEqual([start,end].map(n=>Math.round(n*1000)/1000));}
async function stub(p){await p.route('**/vision_bundle.mjs',r=>r.fulfill({contentType:'text/javascript',body:`export const FilesetResolver={forVisionTasks:async()=>({})};export const PoseLandmarker={createFromOptions:async()=>({close(){},detectForVideo(){(window.scans??=[]).push(document.querySelector('.video-card.selected video').currentTime);return {landmarks:[]}}})};`}));}

test('Analyze captures the live ±2.5s window, freezes scanning, and preserves previous results on cancellation',async({page})=>{
 await stub(page);await page.goto('/');await load(page);await bounds(page,0,2.5);
 await page.locator('#timeline').fill('30');await bounds(page,27.5,32.5);
 await page.evaluate(()=>{document.querySelector('video').currentTime=32;document.getElementById('analyze').click();});
 await expect(page.locator('#timeline')).toBeDisabled();await bounds(page,29.5,34.5);
 await expect(page.locator('#status')).toContainText('No clear pose',{timeout:15000});
 expect((await data(page)).analyzedRange).toEqual([29.5,34.5]);
 const scanned=await page.evaluate(()=>window.scans);expect(scanned).toHaveLength(150);expect(Math.min(...scanned)).toBe(29.5);expect(Math.max(...scanned)).toBeLessThan(34.5);
 expect(await card(page).locator('video').evaluate(v=>v.currentTime)).toBe(32);
 await page.locator('#commonPlayer .timeline-full').click();await page.locator('#timeline').fill('59');await bounds(page,56.5,60);
 await expect(page.locator('#analyzedRangeNote')).toContainText('Analyze again');
 await page.locator('#speed').selectOption('0.25');await page.locator('#play').click();
 await expect.poll(async()=>(await data(page)).selectedRange[0]).toBeGreaterThan(56.55);
 await page.locator('#analyze').click();const frozen=(await data(page)).selectedRange;
 await page.locator('#cancel').click();await expect(page.locator('#status')).toContainText('Analysis cancelled');
 expect((await data(page)).analyzedRange).toEqual([29.5,34.5]);
 const at=await card(page).locator('video').evaluate(v=>v.currentTime);expect(frozen[0]).toBeCloseTo(at-2.5,5);expect(frozen[1]).toBe(60);
});

test('a single tall scrubber moves both the playhead and window, including keyboard frames, without losing zoom',async({page})=>{
 await page.goto('/');await load(page);await card(page).locator('.zoom-slider').fill('2');
 await expect(page.locator('#rangeStart,#rangeEnd,#rangeWindow,#rangeSelection')).toHaveCount(0);
 const track=page.locator('#timeline'),b=await track.boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);
 await page.mouse.move(b.x+7,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+7+(b.width-14)*.5,b.y+b.height/2,{steps:8});await page.mouse.up();
 const at=await card(page).locator('video').evaluate(v=>v.currentTime);expect(at).toBeCloseTo(30,0);await bounds(page,at-2.5,at+2.5);
 const rail=page.locator('#commonPlayer .timeline-rail');await expect(rail).toHaveAttribute('data-time',String(at));
 await track.focus();await page.keyboard.press('ArrowRight');expect(await card(page).locator('video').evaluate(v=>v.currentTime)).toBeCloseTo(at+1/30,3);
 await page.keyboard.press('Shift+ArrowRight');expect(await card(page).locator('video').evaluate(v=>v.currentTime)).toBeCloseTo(at+1+1/30,3);
 await page.locator('#play').click();await expect.poll(async()=>(await data(page)).selectedRange[0]).toBeGreaterThan(at-2.5+1.1);await page.locator('#play').click();
 await expect(card(page).locator('.zoom-value')).toHaveText('2.00×');
});

test('each unsynced player owns its FPS-aware window and local playback leaves the common window unchanged',async({page})=>{
 await stub(page);await page.goto('/');await page.locator('#compareMode').click();await load(page);await load(page,1);await page.locator('#independent').click();
 const commonRail=page.locator('#commonPlayer .timeline-rail');
 await card(page,0).locator('.clip-timeline').fill('20');await bounds(page,17.5,22.5);
 await card(page,1).locator('.clip-timeline').fill('40');await bounds(page,37.5,42.5,1);
 await card(page,1).locator('.shot-fps').selectOption('120');await bounds(page,30,50,1);
 // Explicit calibration updates the common clock's scale at its saved frame.
 await expect(commonRail).toHaveAttribute('data-time','0');await expect(commonRail).toHaveAttribute('data-end','10');
 const common=await commonRail.evaluate(e=>({...e.dataset}));
 const band=card(page,1).locator('.timeline-window');expect(parseFloat(await band.evaluate(e=>e.style.width))).toBeCloseTo(100/3,3);
 await card(page,1).locator('.clip-speed').selectOption('0.25');await card(page,1).locator('.clip-play').click();
 await expect.poll(async()=>(await data(page,1)).selectedRange[0]).toBeGreaterThan(30.1);
 expect(await page.locator('#commonPlayer .timeline-rail').evaluate(e=>({...e.dataset}))).toEqual(common);
 await card(page,1).locator('.clip-play').click();await card(page,0).locator('.clip-analyze').click();
 await expect(page.locator('#status')).toContainText('No clear pose',{timeout:15000});expect((await data(page)).analyzedRange).toEqual([17.5,22.5]);expect((await data(page,1)).analyzedRange).toBeNull();
 await page.screenshot({path:'/tmp/fps-window-compare-analyzed.png'});
});

test('analysis from playback restores the exact anchor without a false stale-results warning',async({page})=>{
 await stub(page);await page.goto('/');await load(page);await page.locator('#timeline').fill('25');await page.locator('#play').click();
 await expect.poll(async()=>(await data(page)).selectedRange[0]).toBeGreaterThan(22.6);
 await page.locator('#analyze').click();await expect(page.locator('#status')).toContainText('No clear pose',{timeout:15000});
 const report=await data(page),at=await card(page).locator('video').evaluate(v=>v.currentTime);expect(report.analyzedRange[0]).toBeCloseTo(at-2.5,5);expect(report.analyzedRange[1]).toBeCloseTo(at+2.5,5);await expect(page.locator('#analyzedRangeNote')).toBeHidden();
});
