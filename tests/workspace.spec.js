import {openPanel, settings, closePanel, discardIfAsked, transport} from './ui.js';
import {test, expect} from '@playwright/test';
const clip = (page, i) => page.locator(`[data-slot="${i}"]`);
async function load(page, i) {
  await clip(page, i).locator('input[type=file]').setInputFiles(new URL('./fixtures/portrait.mp4', import.meta.url).pathname);
  await discardIfAsked(page);await expect(clip(page, i).locator('video')).toBeVisible();
}
async function drawLine(page, i) {
  const surface = clip(page, i).locator('.annotation-canvas');
  await surface.scrollIntoViewIfNeeded(); const b = await surface.boundingBox();
  await page.mouse.move(b.x+b.width*.3,b.y+b.height*.3); await page.mouse.down();
  await page.mouse.move(b.x+b.width*.7,b.y+b.height*.7,{steps:6}); await page.mouse.up();
}

test('drawing rail stays beside the video while switching tools and undoing', async ({page}) => {
  await page.goto('/'); await load(page,0);
  await clip(page,0).locator('.stage').evaluate(e => e.scrollIntoView({block:'start'}));
  const stage=await clip(page,0).locator('.stage').boundingBox();
  const buttons=await page.locator('[data-tool]').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right};}));
  for(let i=0;i<buttons.length;i++) {
    expect(buttons[i].right).toBeLessThan(stage.x);
    expect(buttons[i].x).toBeCloseTo(buttons[0].x,1);
    if(i) expect(buttons[i].y).toBeGreaterThan(buttons[i-1].y);
  }
  const before=await page.evaluate(()=>scrollY);
  await page.locator('[data-tool="line"]').click();
  expect(await page.evaluate(()=>scrollY)).toBeCloseTo(before,0);
  await drawLine(page,0); await expect(page.locator('#drawingCount')).toHaveText('1 drawing on A');
  await page.locator('#drawingUndo').click(); await expect(page.locator('#drawingCount')).toHaveText('0 drawings on A');
  await page.locator('#drawingRedo').click(); await expect(page.locator('#drawingCount')).toHaveText('1 drawing on A');
  await page.locator('#videoEditor').screenshot({path:'/tmp/swing-side-tools-desktop.png'});
});

test('hiding insights expands videos without interrupting playback or changing zoom', async ({page}) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/'); await load(page,0); await page.locator('#compareMode').click(); await load(page,1);
  await expect(clip(page,0).locator('.clip-play')).toHaveText('▶ Play A');
  await (await transport(page,'speed')).selectOption('0.25'); await clip(page,0).locator('.zoom-slider').fill('2');
  await openPanel(page,'range');const before=await clip(page,0).locator('.stage').boundingBox();
  await (await transport(page,'play',0)).click(); await closePanel(page);
  await expect(page.locator('#analysisPanel')).toBeHidden(); await expect(page.locator('#toggleInsights')).toHaveAttribute('aria-expanded','false');
  expect((await clip(page,0).locator('.stage').boundingBox()).width).toBeGreaterThan(before.width+100);
  expect(await page.locator('video').evaluateAll(v=>v.every(x=>!x.paused))).toBe(true);
  await expect(clip(page,0).locator('.zoom-value')).toHaveText('2.00×');
  const boxes=await clip(page,0).locator('.video-plane > video, .pose-canvas, .annotation-canvas').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};}));
  for(const b of boxes) { expect(b.x).toBeCloseTo(boxes[0].x,0); expect(b.y).toBeCloseTo(boxes[0].y,0); expect(b.w).toBeCloseTo(boxes[0].w,0); expect(b.h).toBeCloseTo(boxes[0].h,0); }
  await openPanel(page,'range'); await expect(page.locator('#analysisPanel')).toBeVisible();
  expect(await page.locator('video').evaluateAll(v=>v.every(x=>!x.paused))).toBe(true); expect(errors).toEqual([]);
});

test('phone rail stays vertical and drawing on A leaves independent B playing', async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/'); await load(page,0); await page.locator('#compareMode').click(); await load(page,1);
  await page.locator('#independent').click(); await (await settings(page,1,'.clip-speed')).selectOption('0.25'); await closePanel(page); await (await transport(page,'play',1)).click();
  await page.locator('[data-select="0"]').click(); await page.locator('[data-tool="line"]').click(); await drawLine(page,0);
  await expect(page.locator('#drawingCount')).toHaveText('1 drawing on A');
  expect(await clip(page,1).locator('video').evaluate(v=>v.paused)).toBe(false);
  const rail=await page.locator('#drawingToolbar').boundingBox(), stage=await clip(page,0).locator('.stage').boundingBox();
  expect(rail.x+rail.width).toBeLessThan(stage.x);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#videoEditor').screenshot({path:'/tmp/swing-side-tools-phone.png'});
});
