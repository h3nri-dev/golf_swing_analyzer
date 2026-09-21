import {test,expect} from '@playwright/test';
const fixture=new URL('./fixtures/window-60s.mp4',import.meta.url).pathname;
const card=(page,i=0)=>page.locator(`[data-slot="${i}"]`);
const data=page=>page.evaluate(async()=>(await import('/app.js')).reportData());
async function load(page,i=0) {
  await card(page,i).locator('input[type=file]').setInputFiles(fixture);
  await expect(card(page,i).locator('video')).toBeVisible();
}
async function bounds(page,start,end) {
  await expect(page.locator('#rangeStart')).toHaveValue(start.toFixed(3));
  await expect(page.locator('#rangeEnd')).toHaveValue(end.toFixed(3));
}
async function stub(page) {
  await page.route('**/vision_bundle.mjs',r=>r.fulfill({contentType:'text/javascript',body:`
    export const FilesetResolver={forVisionTasks:async()=>({})};
    export const PoseLandmarker={createFromOptions:async()=>({close(){},detectForVideo(){
      (window.scans??=[]).push(document.querySelector('.video-card.selected video').currentTime);
      return {landmarks:[]};
    }})};`}));
}
test('Analyze captures ±5s at the current frame, keeps that window while scanning, and restores the playhead',async({page})=>{
  await stub(page);await page.goto('/');await load(page);
  await bounds(page,0,5);await expect(page.locator('#rangeReset')).toHaveAttribute('aria-pressed','true');
  await page.locator('#timeline').fill('30');await bounds(page,25,35);
  // No timeupdate/render between this seek and click: Analyze must read the
  // current media time itself instead of capturing the old displayed range.
  await page.evaluate(()=>{document.querySelector('video').currentTime=32;document.getElementById('analyze').click();});
  await expect(page.locator('#rangeWindow')).toBeDisabled();
  await bounds(page,27,37);await expect(page.locator('#rangeReset')).toBeDisabled();
  await expect(page.locator('#status')).toContainText('No clear pose',{timeout:15000});
  const report=await data(page);expect(report.analyzedRange).toEqual([27,37]);
  const scanned=await page.evaluate(()=>window.scans);expect(scanned.length).toBe(240);
  expect(Math.min(...scanned)).toBe(27);expect(Math.max(...scanned)).toBeLessThan(37);
  expect(await card(page).locator('video').evaluate(v=>v.currentTime)).toBe(32);
  await bounds(page,27,37);
  await page.locator('#timeline').fill('59');await bounds(page,54,60);
  await expect(page.locator('#analyzedRangeNote')).toContainText('Analyze again');
  await page.locator('#speed').selectOption('0.25');await page.locator('#play').click();
  await expect.poll(async()=>Number(await page.locator('#rangeStart').inputValue())).toBeGreaterThan(54.05);
  await page.locator('#analyze').click();const frozen=(await data(page)).selectedRange;
  await page.locator('#cancel').click();
  await expect(page.locator('#status')).toContainText('Analysis cancelled');
  expect((await data(page)).analyzedRange).toEqual([27,37]);
  const restored=await card(page).locator('video').evaluate(v=>v.currentTime);
  expect(frozen[0]).toBeCloseTo(restored-5,5);expect(frozen[1]).toBe(60);
  await bounds(page,restored-5,60);
});
test('sliding pins both boundaries, preserves the playhead and zoom, and Follow restores automatic selection',async({page})=>{
  await page.goto('/');await load(page);await page.locator('#timeline').fill('30');
  await card(page).locator('.zoom-slider').fill('2');
  const b=await page.locator('#rangeWindow').boundingBox();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
  await page.mouse.move(b.x+24+(b.width-48)*.65,b.y+b.height/2,{steps:8});await page.mouse.up();
  const start=Number(await page.locator('#rangeStart').inputValue()),end=Number(await page.locator('#rangeEnd').inputValue());
  expect(start).toBeCloseTo(34,0);expect(end-start).toBeCloseTo(10,3);
  await expect(page.locator('#rangeReset')).toHaveAttribute('aria-pressed','false');
  expect(await card(page).locator('video').evaluate(v=>v.currentTime)).toBe(30);
  await page.locator('#timeline').fill('20');await bounds(page,start,end);
  await page.locator('#rangeReset').click();await bounds(page,15,25);
  await page.locator('#play').click();
  await expect.poll(async()=>Number(await page.locator('#rangeStart').inputValue())).toBeGreaterThan(15.05);
  await page.locator('#play').click();await page.locator('#timeline').fill('20');await bounds(page,15,25);
  await card(page).locator('.zoom-value').evaluate(e=>e.scrollIntoView({block:'nearest'}));
  await expect(card(page).locator('.zoom-value')).toHaveText('2.00×');
  await page.locator('#rangeGoStart').click();await bounds(page,15,25);
  expect(await card(page).locator('video').evaluate(v=>v.currentTime)).toBe(15);
  await page.locator('#rangeStart').fill('16');await page.locator('#rangeEnd').fill('18');
  await page.locator('#rangeWindow').fill('30');await bounds(page,29,31);
  await page.locator('#rangeWindow').focus();await page.keyboard.press('ArrowRight');await bounds(page,30,32);
  await page.keyboard.press('Shift+ArrowRight');
  expect((await data(page)).selectedRange[0]).toBeCloseTo(30+1/30,5);
});
test('A/B windows are separate, automatic seconds honor slow motion, and manual ranges retain their file frames',async({page})=>{
  await page.goto('/');await page.locator('#compareMode').click();await load(page,0);await load(page,1);
  await page.locator('#independent').click();await card(page,0).locator('.clip-timeline').fill('20');await bounds(page,15,25);
  await card(page,1).locator('.clip-timeline').fill('40');await bounds(page,35,45);
  await card(page,1).locator('.shot-fps').selectOption('120');await bounds(page,5,15);
  expect((await data(page)).selectedRange).toEqual([20,60]);
  await page.locator('#rangeStart').fill('7');await page.locator('#rangeEnd').fill('9');
  await card(page,1).locator('.shot-fps').selectOption('same');await bounds(page,28,36);
  const common=await page.locator('#time').textContent();
  await card(page,1).locator('.clip-speed').selectOption('0.25');await card(page,1).locator('.clip-play').click();
  await page.locator('[data-range-slot="0"]').click();await bounds(page,15,25);
  await page.locator('#rangeWindow').fill('30');await bounds(page,25,35);
  expect(await card(page,1).locator('video').evaluate(v=>v.paused)).toBe(false);
  await expect(page.locator('#time')).toHaveText(common);
  await page.locator('[data-range-slot="1"]').click();await bounds(page,28,36);
});

test('analysis started during playback restores its exact anchor without a false stale-results warning',async({page})=>{
  await stub(page);await page.goto('/');await load(page);
  await page.locator('#timeline').fill('25');await page.locator('#play').click();
  await expect.poll(async()=>Number(await page.locator('#rangeStart').inputValue())).toBeGreaterThan(20.1);
  await page.locator('#analyze').click();
  await expect(page.locator('#status')).toContainText('No clear pose',{timeout:15000});
  const report=await data(page),at=await card(page).locator('video').evaluate(v=>v.currentTime);
  expect(report.analyzedRange[0]).toBeCloseTo(at-5,5);expect(report.analyzedRange[1]).toBeCloseTo(at+5,5);
  await expect(page.locator('#analyzedRangeNote')).toBeHidden();
});
