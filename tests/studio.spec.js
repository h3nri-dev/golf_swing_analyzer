import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const fixture = new URL('./fixtures/portrait.mp4', import.meta.url).pathname;
const clip = (page,i) => page.locator(`[data-slot="${i}"]`);
async function load(page,i) { await clip(page,i).locator('input[type=file]').setInputFiles(fixture); await expect(clip(page,i).locator('video')).toBeVisible(); await expect(page.locator('#analyze')).toBeEnabled(); }
async function seek(page,t) { await page.locator('#timeline').fill(String(t)); await page.waitForTimeout(120); }
async function times(page) { return page.locator('video').evaluateAll(videos => videos.map(v => v.currentTime)); }
test('single mode loads local video, steps, marks tempo and exports', async ({ page }) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/'); await expect(clip(page,1)).toBeHidden(); await load(page,0);
  await page.locator('#next').click(); expect((await times(page))[0]).toBeCloseTo(1/30,3);
  await clip(page,0).locator('.fps').selectOption('60'); await seek(page,0); await page.locator('#next').click(); expect((await times(page))[0]).toBeCloseTo(1/60,3);
  await seek(page,.2); await page.locator('#mark-address').click(); await seek(page,1.1); await page.locator('#mark-top').click(); await seek(page,1.4); await page.locator('#mark-impact').click(); await expect(page.locator('#tempo')).toHaveText('3.00 : 1');
  const download = page.waitForEvent('download'); await page.locator('#export').click(); expect((await download).suggestedFilename()).toBe('swing-a-analysis.json');
  await page.screenshot({path:'/tmp/swing-single.png',fullPage:true});
  await clip(page,0).locator('.remove').click(); await expect(page.locator('#play')).toBeDisabled(); expect(errors).toEqual([]);
});
test('comparison aligns offsets, steps together, plays independently and pauses on mode change', async ({page})=>{
  await page.goto('/'); await load(page,0); await page.locator('#compareMode').click(); await load(page,1);
  await page.locator('#independent').click(); await page.locator('[data-select="0"]').click(); await seek(page,.5); await clip(page,0).locator('.sync-mark').click();
  await page.locator('[data-select="1"]').click(); await seek(page,1.2); await clip(page,1).locator('.sync-mark').click(); await page.locator('#align').click();
  let ts = await times(page); expect(ts[1]-ts[0]).toBeCloseTo(.7,2);
  await page.locator('#next').click(); ts=await times(page); expect(ts[1]-ts[0]).toBeCloseTo(.7,2);
  await page.locator('#play').click(); await page.waitForTimeout(400); ts=await times(page); expect(Math.abs(ts[1]-ts[0]-.7)).toBeLessThan(.09);
  await page.locator('#independent').click(); expect(await page.locator('video').evaluateAll(v=>v.every(x=>!x.paused))).toBe(true);
  await clip(page,1).locator('.clip-play').click(); const before=await times(page); await page.waitForTimeout(250); ts=await times(page); expect(ts[0]).toBeGreaterThan(before[0]); expect(ts[1]).toBeCloseTo(before[1],2);
  await page.locator('#singleMode').click(); expect(await page.locator('video').evaluateAll(v=>v.every(x=>x.paused))).toBe(true);
  await page.locator('#compareMode').click(); await page.screenshot({path:'/tmp/swing-compare.png',fullPage:true});
});
test('mobile keeps comparison visible without horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844}); await page.goto('/'); await page.locator('#compareMode').click();
  await expect(clip(page,0)).toBeVisible(); await expect(clip(page,1)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/swing-mobile.png',fullPage:true});
});
test('failed model download preserves usable playback',async({page})=>{
  await page.route('https://cdn.jsdelivr.net/**',route=>route.abort());
  await page.goto('/'); await load(page,0); await page.locator('#analyze').click(); await expect(page.locator('#status')).toContainText('Analysis unavailable'); await expect(page.locator('#play')).toBeEnabled();
});
test('cancelling a stalled model download immediately restores the workspace',async({page})=>{
  await page.route('https://cdn.jsdelivr.net/**',async route=>{ await new Promise(r=>setTimeout(r,3000)); await route.abort(); });
  await page.goto('/'); await load(page,0); await page.locator('#analyze').click(); await page.locator('#cancel').click(); await expect(page.locator('#status')).toContainText('Analysis cancelled'); await expect(page.locator('#play')).toBeEnabled();
});
test('real MediaPipe model detects a pose locally',async({page})=>{
  test.skip(!process.env.POSE_FIXTURE, 'Optional real-inference check: set POSE_FIXTURE to a video showing a person.');
  test.setTimeout(120000);
  const requests=[]; page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
  await page.goto('/'); await clip(page,0).locator('input[type=file]').setInputFiles(process.env.POSE_FIXTURE); await expect(page.locator('#analyze')).toBeEnabled();
  await clip(page,0).locator('.zoom-slider').fill('2');
  await page.locator('#timeline').fill('0.2');
  await page.locator('#rangeStart').fill('0.1'); await page.locator('#rangeEnd').fill('0.4'); await page.locator('#analyze').click();
  await expect(page.locator('#status')).toContainText('Analysis ready',{timeout:100000});
  await expect(clip(page,0).locator('.zoom-value')).toHaveText('2.00×');
  await expect(page.locator('#coverage')).not.toContainText('—');
  await expect(page.locator('#elbow')).not.toContainText('—');
  expect(requests.filter(r=>r.method!=='GET')).toEqual([]);
  const download = page.waitForEvent('download'); await page.locator('#export').click();
  const data = JSON.parse(await fs.readFile(await (await download).path(), 'utf8'));
  expect(data.analyzedRange).toEqual([0.1, 0.4]);
  expect(data.measurements.length).toBeGreaterThan(0);
  expect(data.measurements.every(sample => sample.time >= 0.1 && sample.time < 0.4)).toBe(true);
  await page.screenshot({path:'/tmp/swing-analysis.png',fullPage:true});
});
test('negative sync offsets respect overlap with unequal clip lengths',async({page})=>{
  await page.goto('/'); await load(page,0); await page.locator('#compareMode').click();
  await clip(page,1).locator('input[type=file]').setInputFiles(new URL('./fixtures/landscape.mp4',import.meta.url).pathname); await expect(clip(page,1).locator('video')).toBeVisible();
  await page.locator('#independent').click(); await page.locator('[data-select="0"]').click(); await seek(page,1); await clip(page,0).locator('.sync-mark').click();
  await page.locator('[data-select="1"]').click(); await seek(page,.2); await clip(page,1).locator('.sync-mark').click(); await page.locator('#align').click();
  await page.locator('[data-select="0"]').click(); await page.locator('#restart').click(); let ts=await times(page); expect(ts[0]).toBeCloseTo(.8,2); expect(ts[1]).toBeCloseTo(0,2);
  await seek(page,2.7); await page.locator('#play').click(); await page.waitForTimeout(500);
  expect(await page.locator('video').evaluateAll(v=>v.every(x=>x.paused))).toBe(true);
  ts=await times(page); expect(ts[0]).toBeLessThan(2.85); expect(ts[1]).toBeLessThanOrEqual(2);
});
test('independent videos can both play and replacement clears only its own marks',async({page})=>{
  await page.goto('/'); await load(page,0); await page.locator('#compareMode').click(); await load(page,1); await page.locator('#independent').click();
  await clip(page,0).locator('.clip-speed').selectOption('0.25');
  await clip(page,0).locator('.clip-play').click(); await clip(page,1).locator('.clip-play').click(); expect(await page.locator('video').evaluateAll(v=>v.every(x=>!x.paused))).toBe(true);
  await page.locator('#mark-address').click(); await expect(page.locator('#phase-address')).not.toHaveText('—'); await load(page,1); await expect(page.locator('#phase-address')).toHaveText('—');
  expect(await clip(page,0).locator('video').evaluate(v=>v.paused)).toBe(false);
  await page.locator('#rangeStart').fill('3'); await page.locator('#rangeEnd').fill('1'); await expect(page.locator('#rangeError')).toContainText('End must be after start'); await expect(page.locator('#analyze')).toBeDisabled(); await expect(page.locator('#play')).toBeEnabled();
});
