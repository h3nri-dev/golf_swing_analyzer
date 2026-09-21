import {test, expect} from '@playwright/test';
import fs from 'node:fs/promises';
const card = (page, i) => page.locator(`[data-slot="${i}"]`);
const state = page => page.locator('video').evaluateAll(vs => vs.map(v => ({time:v.currentTime, rate:v.playbackRate, paused:v.paused})));
async function setup(page, second = 'timing-60.mp4') {
  await page.goto('/'); await page.locator('#compareMode').click();
  for (const [i,file] of ['timing-30.mp4', second].entries()) {
    await card(page,i).locator('input[type=file]').setInputFiles(new URL(`./fixtures/${file}`,import.meta.url).pathname);
    await expect(card(page,i).locator('video')).toBeVisible();
  }
}
async function align(page, a, b) {
  await card(page,0).locator('.clip-timeline').fill(String(a));
  await card(page,1).locator('.clip-timeline').fill(String(b));
  await page.getByRole('button',{name:'Sync Videos',exact:true}).click();
}

test('30/60 FPS files use equal elapsed time and shared steps ignore selected-video changes', async ({page}) => {
  await setup(page);
  await card(page,1).locator('.fps').selectOption('60');
  for (const i of [0,1]) for (const cls of ['.fps','.shot-fps']) await expect(card(page,i).locator(cls)).toBeVisible();
  await align(page,.3,.5);
  for (const selected of [0,1,0,1]) {
    await card(page,selected).locator('[data-select]').click();
    await page.locator('#next').click();
  }
  let s = await state(page);
  expect(s[0].time).toBeCloseTo(.3+4/30,4); expect(s[1].time).toBeCloseTo(.5+8/60,4);
  expect(s.map(v=>v.rate)).toEqual([1,1]);
  await page.locator('#play').click(); await page.waitForTimeout(300);
  s = await state(page); expect(s.every(v=>!v.paused)).toBe(true); expect(s[1].time-s[0].time).toBeCloseTo(.2,1);
  await page.locator('#play').click();
  await card(page,1).locator('.clip-timeline').fill('1');
  s = await state(page);
  await card(page,1).locator('.clip-next').click();
  const after = await state(page); expect(after[1].time).toBeCloseTo(1+1/60,4); expect(after[0].time).toBe(s[0].time);
  await expect(page.locator('#independent')).toHaveAttribute('aria-pressed','true');
});

test('120 FPS footage saved at 30 FPS stays aligned through playback, seek, step, speed and restart', async ({page}) => {
  await setup(page,'timing-slow.mp4');
  await card(page,1).locator('.shot-fps').selectOption('120');
  await align(page,.3,2);
  await page.locator('#next').click();
  let s = await state(page); expect(s[0].time).toBeCloseTo(.3+1/30,4); expect(s[1].time).toBeCloseTo(2+4/30,4);
  expect(s.map(v=>v.rate)).toEqual([1,4]);
  await page.locator('#timeline').fill('3');
  s = await state(page); expect(s.map(v=>v.time)).toEqual([.55,3]);
  await page.locator('#speed').selectOption('0.5'); expect((await state(page)).map(v=>v.rate)).toEqual([.5,2]);
  await page.locator('#play').click(); await page.waitForTimeout(350);
  s = await state(page); expect(s.every(v=>!v.paused)).toBe(true); expect(Math.abs(s[1].time/4-s[0].time-.2)).toBeLessThan(.07);
  await page.locator('#play').click(); await page.locator('#restart').click();
  s = await state(page); expect(s[0].time).toBe(0); expect(s[1].time).toBeCloseTo(.8,4);
  await page.locator('#timeline').fill('7.9'); await page.locator('#play').click();
  await expect.poll(async()=> (await state(page)).every(v=>v.paused)).toBe(true);
});

test('retiming retains aligned file frames and moment marks, corrects tempo durations and exports timing', async ({page}) => {
  await setup(page,'timing-slow.mp4');
  await card(page,1).locator('.clip-timeline').fill('0');await page.locator('#mark-address').click();
  await card(page,1).locator('.clip-timeline').fill('1.5');await page.locator('#mark-top').click();
  await align(page,.5,2);
  await page.locator('#mark-impact').click();
  await card(page,1).locator('.shot-fps').selectOption('120');
  await page.locator('#next').click();
  let s=await state(page);expect(s[0].time).toBeCloseTo(.5+1/30,4);expect(s[1].time).toBeCloseTo(2+4/30,4);
  await expect(page.locator('#phase-impact')).toHaveText('2.00 s');
  await expect(page.locator('#tempo')).toHaveText('3.00 : 1');
  await expect(page.locator('#tempoNote')).toHaveText('0.38 s backswing / 0.13 s downswing. Real time from your marks.');
  const download=page.waitForEvent('download');await page.locator('#export').click();
  const data=JSON.parse(await fs.readFile(await (await download).path(),'utf8'));
  expect(data.frameRate).toBe(30);expect(data.recordingFrameRate).toBe(120);expect(data.mediaSecondsPerRealSecond).toBe(4);expect(data.marks.impact).toBe(2);
  await page.locator('#independent').click();await card(page,0).locator('.clip-play').click();
  await card(page,1).locator('.fps').selectOption('60');
  s=await state(page);expect(s[0].paused).toBe(false);expect(s[1].rate).toBe(2);
  await card(page,1).locator('input[type=file]').setInputFiles(new URL('./fixtures/timing-60.mp4',import.meta.url).pathname);
  await page.locator('#discardConfirm').click();await expect(card(page,1).locator('.shot-fps')).toHaveValue('same');
  await expect(card(page,0).locator('.fps')).toHaveValue('30');
});
