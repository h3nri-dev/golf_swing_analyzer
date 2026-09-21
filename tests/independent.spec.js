import {settings, transport} from './ui.js';
import { test, expect } from '@playwright/test';
const fixture = name => new URL(`./fixtures/${name}.mp4`, import.meta.url).pathname;
const clip = (page, i) => page.locator(`[data-slot="${i}"]`);
const video = (page, i) => clip(page, i).locator('video');
const state = page => page.locator('video').evaluateAll(videos => videos.map(v => ({time: v.currentTime, paused: v.paused, rate: v.playbackRate})));
async function setup(page) {
  await page.goto('/'); await page.locator('#compareMode').click();
  for (const i of [0, 1]) {
    await clip(page, i).locator('input[type=file]').setInputFiles(fixture(i ? 'landscape' : 'portrait'));
    await expect(video(page, i)).toBeVisible();
  }
  await page.getByRole('button', {name: 'Sync off', exact: true}).click();
}

test('separate controls leave the other video playing during pause, seek, stepping and speed changes', async ({page}) => {
  await setup(page);
  await (await settings(page,1,'.clip-speed')).selectOption('0.25');
  await (await transport(page,'play',0)).click();
  await (await transport(page,'play',1)).click();
  expect((await state(page)).every(v => !v.paused)).toBe(true);
  await (await transport(page,'play',0)).click();
  let states = await state(page);
  expect(states[0].paused).toBe(true); expect(states[1].paused).toBe(false);
  const beforeB = states[1].time;
  await clip(page, 0).locator('.clip-timeline').fill('1');
  await clip(page, 0).locator('.clip-next').click();
  states = await state(page);
  expect(states[0].time).toBeCloseTo(1 + 1/30, 3); expect(states[1].paused).toBe(false);
  await clip(page, 0).locator('.clip-previous').click();
  await (await settings(page,0,'.clip-speed')).selectOption('0.5');
  await (await transport(page,'play',0)).click();
  await expect((await transport(page,'speed'))).toHaveValue('0.5');
  await (await transport(page,'speed')).selectOption('1.5');
  states = await state(page);
  expect(states.map(v => v.rate)).toEqual([1.5, 0.25]); expect(states.every(v => !v.paused)).toBe(true);
  await (await transport(page,'timeline')).fill('1.5');
  await (await transport(page,'next')).click();
  states = await state(page);
  expect(states[0].time).toBeCloseTo(1.5 + 1/30, 3); expect(states[1].paused).toBe(false); expect(states[1].time).toBeGreaterThan(beforeB);
  await page.locator('[data-select="1"]').click(); await expect((await transport(page,'speed'))).toHaveValue('0.25');
  await (await transport(page,'play')).click(); expect((await state(page)).every(v => v.paused)).toBe(true);
});

test('unsync preserves playback and zoom; resync restores the offset and common speed', async ({page}) => {
  await setup(page);
  await clip(page, 0).locator('.clip-timeline').fill('0.5');
  await clip(page, 1).locator('.clip-timeline').fill('0.2');
  await page.locator('#align').click(); await (await transport(page,'speed')).selectOption('0.25');
  await clip(page, 0).locator('.zoom-slider').fill('2');
  await (await transport(page,'play')).click(); await page.locator('#independent').click();
  expect((await state(page)).every(v => !v.paused)).toBe(true);
  await expect(clip(page, 0).locator('.clip-transport')).toBeVisible();
  await clip(page, 0).locator('.clip-timeline').fill('1.2');
  await (await settings(page,0,'.clip-speed')).selectOption('0.5');
  await page.locator('#linked').click();
  let states = await state(page);
  expect(states.every(v => v.paused)).toBe(true); expect(states.map(v => v.rate)).toEqual([0.5, 0.5]);
  expect(states[1].time - states[0].time).toBeCloseTo(-0.3, 2);
  await expect(clip(page, 0).locator('.clip-play')).toHaveText('▶ Play both');
  await expect(clip(page, 0).locator('.zoom-value')).toHaveText('2.00×');
  await (await transport(page,'play')).click(); await page.waitForTimeout(300);
  states = await state(page); expect(states.every(v => !v.paused)).toBe(true);
  expect(Math.abs(states[1].time - states[0].time + 0.3)).toBeLessThan(0.09);
});

test('ending or removing one independent clip does not stop the other', async ({page}) => {
  await setup(page);
  await (await settings(page,0,'.clip-speed')).selectOption('0.25'); await (await transport(page,'play',0)).click();
  await clip(page, 1).locator('.clip-timeline').fill('1.8'); await (await transport(page,'play',1)).click();
  await expect.poll(() => video(page, 1).evaluate(v => v.ended)).toBe(true);
  expect(await video(page, 0).evaluate(v => v.paused)).toBe(false);
  await clip(page, 1).locator('.remove').click(); expect(await video(page, 0).evaluate(v => v.paused)).toBe(false);
});

test('independent controls fit narrow screens and remain keyboard accessible', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844}); await setup(page);
  await expect(page.getByRole('button', {name: 'Sync off', exact: true})).toHaveAttribute('aria-pressed', 'true');
  for (const i of [0, 1]) {
    await expect(clip(page, i).locator('.clip-transport')).toBeVisible();
    await clip(page, i).locator('.clip-timeline').focus(); await page.keyboard.press('ArrowRight');
    await expect.poll(() => video(page, i).evaluate(v => v.currentTime)).toBeGreaterThan(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path: '/tmp/swing-unsynced-mobile.png', fullPage: true});
});
