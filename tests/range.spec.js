import {focusSection, settings, discardIfAsked, transport} from './ui.js';
import { test, expect } from '@playwright/test';
const clip = (page, i) => page.locator(`[data-slot="${i}"]`);
async function load(page, i) {
  await clip(page, i).locator('input[type=file]').setInputFiles(new URL('./fixtures/portrait.mp4', import.meta.url).pathname);
  await discardIfAsked(page);await expect(clip(page, i).locator('video')).toBeVisible();await focusSection(page,'range');
}
async function reportModel(page) { return page.evaluate(async()=> (await import('/app.js')).reportData()); }
async function modelStub(page) {
  await page.route('https://cdn.jsdelivr.net/**/vision_bundle.mjs', route => route.fulfill({
    contentType: 'application/javascript', headers: {'access-control-allow-origin': '*'},
    body: `export const FilesetResolver={forVisionTasks:async()=>({})};
      export const PoseLandmarker={createFromOptions:async()=>({close(){},detectForVideo(){
        const video=document.querySelector('.video-card.selected video');
        (window.scannedTimes??=[]).push(video.currentTime);return {landmarks:[]};
      }})};`,
  }));
}

test('choose boundaries by handles and current frame without losing zoom', async ({page}) => {
  await page.goto('/'); await load(page, 0); await clip(page, 0).locator('.zoom-slider').fill('2');
  await focusSection(page,'range');await page.locator('#rangeStartHandle').fill('0.5'); await page.locator('#rangeEndHandle').fill('1.5');
  await expect(page.locator('#rangeStart')).toHaveValue('0.500'); await expect(page.locator('#rangeSummary')).toHaveText('1.000 s selected');
  expect(await clip(page, 0).locator('video').evaluate(v => v.currentTime)).toBeCloseTo(1.5, 3);
  await page.locator('#rangeGoStart').click(); expect(await clip(page, 0).locator('video').evaluate(v => v.currentTime)).toBeCloseTo(0.5, 3);
  await (await transport(page,'timeline')).fill('0.75'); await focusSection(page,'range'); await page.locator('#rangeSetStart').click();
  await (await transport(page,'timeline')).fill('2'); await focusSection(page,'range'); await page.locator('#rangeSetEnd').click();
  await expect(page.locator('#rangeStart')).toHaveValue('0.750'); await expect(page.locator('#rangeEnd')).toHaveValue('2.000');
  await expect(clip(page, 0).locator('.zoom-value')).toHaveText('2.00×');
  await focusSection(page,'range');await page.locator('#rangeSelection').screenshot({path:'/tmp/swing-range-desktop.png'});
  await page.locator('#rangeReset').click(); await expect(page.locator('#rangeStart')).toHaveValue('0.000'); await expect(page.locator('#rangeEnd')).toHaveValue('4.000');
});

test('invalid and empty ranges cannot start analysis', async ({page}) => {
  await page.goto('/'); await load(page, 0);
  await focusSection(page,'range');await page.locator('#rangeEnd').fill('1'); await focusSection(page,'range');await page.locator('#rangeStart').fill('2');
  await expect(page.locator('#rangeError')).toHaveText('End must be after start.');
  await expect(page.locator('#analyze')).toBeDisabled(); await expect(page.locator('#analyze')).toBeDisabled();
  await focusSection(page,'range');await page.locator('#rangeEnd').fill('5'); await expect(page.locator('#rangeError')).toContainText('within the video');
  await focusSection(page,'range');await page.locator('#rangeStart').fill(''); await expect(page.locator('#rangeError')).toHaveText('Enter a start and end time.');
  await page.locator('#rangeReset').click(); await expect(page.locator('#analyze')).toBeEnabled(); await expect(page.locator('#rangeError')).toBeHidden();
});

test('comparison ranges remain separate and unsynced boundary previews leave the other clip playing', async ({page}) => {
  await page.goto('/'); await load(page, 0); await focusSection(page,'range');await page.locator('#rangeEnd').fill('1');
  await page.locator('#compareMode').click(); await load(page, 1); await page.locator('#independent').click();
  await focusSection(page,'range');await page.locator('#rangeStart').fill('2'); await focusSection(page,'range');await page.locator('#rangeEnd').fill('3');
  await (await settings(page,1,'.clip-speed')).selectOption('0.25'); await (await transport(page,'play',1)).click();
  await page.locator('[data-select="0"]').click(); await expect(page.locator('#rangeEnd')).toHaveValue('1.000');
  await focusSection(page,'range');await page.locator('#rangeStartHandle').fill('0.5'); expect(await clip(page, 1).locator('video').evaluate(v => v.paused)).toBe(false);
  await page.locator('[data-select="1"]').click(); await expect(page.locator('#rangeStart')).toHaveValue('2.000'); await expect(page.locator('#rangeEnd')).toHaveValue('3.000');
  await load(page, 1); await expect(page.locator('#rangeStart')).toHaveValue('0.000');
  await page.locator('[data-select="0"]').click(); await expect(page.locator('#rangeStart')).toHaveValue('0.500');
});

test('analysis scans only the selected interval and exports the result range after edits or cancellation', async ({page}) => {
  await modelStub(page); await page.goto('/'); await load(page, 0);
  await (await transport(page,'timeline')).fill('2.5'); await focusSection(page,'range');await page.locator('#rangeStart').fill('1'); await focusSection(page,'range');await page.locator('#rangeEnd').fill('1.3');
  await page.locator('#analyze').click(); await expect(page.locator('#status')).toContainText('No clear pose found');
  const times = await page.evaluate(() => window.scannedTimes);
  expect(times.length).toBeGreaterThan(0); expect(times.every(t => t >= 1 && t < 1.3)).toBe(true);
  expect(await clip(page, 0).locator('video').evaluate(v => v.currentTime)).toBeCloseTo(2.5, 3);
  let data = await reportModel(page); expect(data.analyzedRange).toEqual([1,1.3]);
  await focusSection(page,'range');await page.locator('#rangeEnd').fill('3'); await expect(page.locator('#analyzedRangeNote')).toContainText('Analyze again');
  data = await reportModel(page); expect(data.range).toEqual([1,1.3]); expect(data.selectedRange).toEqual([1,3]);
  await page.locator('#analyze').click(); await expect(page.locator('#rangeStart')).toBeDisabled();
  await expect(page.locator('#status')).toBeVisible();
  await page.locator('#cancel').click(); await expect(page.locator('#status')).toContainText('Analysis cancelled');
  data = await reportModel(page); expect(data.analyzedRange).toEqual([1,1.3]); expect(data.measurements.length).toBe(times.length);
});

test('range handles support touch and keyboard on a phone without overflow', async ({browser}) => {
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page = await context.newPage(); await page.goto('/'); await load(page, 0);
  await focusSection(page,'range');await page.locator('#rangeSelection').scrollIntoViewIfNeeded();
  const b = await page.locator('.range-track').boundingBox(); const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+14,y:b.y+22,id:0}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+14+(b.width-28)*0.25,y:b.y+22,id:0}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  expect(Number(await page.locator('#rangeStart').inputValue())).toBeCloseTo(1,1);
  await page.locator('#rangeEndHandle').focus(); await page.keyboard.press('ArrowLeft'); await expect(page.locator('#rangeEnd')).toHaveValue('3.999');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await focusSection(page,'range');await page.locator('#rangeSelection').screenshot({path:'/tmp/swing-range-phone.png'}); await context.close();
});
