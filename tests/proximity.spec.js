import {test, expect} from '@playwright/test';
const fixture = new URL('./fixtures/portrait.mp4', import.meta.url).pathname;
const slot = (page, i) => page.locator(`[data-slot="${i}"]`);
async function load(page, i) {
  await slot(page, i).locator('input[type=file]').setInputFiles(fixture);
  await expect(slot(page, i).locator('video')).toBeVisible();
}

for (const [width, height] of [[1440,900],[1280,720],[2560,1440],[390,844],[320,568],[844,390]]) {
  test(`related review controls stay together at ${width}×${height}`, async ({page}) => {
    await page.setViewportSize({width,height}); await page.goto('/'); await load(page,0);
    for (const compare of [false,true]) {
      if(compare) { await page.locator('#compareMode').click(); await load(page,1); }
      const player=page.locator('#commonPlayer');
      await expect(player.locator('#analyze')).toBeVisible();
      await expect(page.locator('#rangeSelection,#rangeStart,#rangeEnd')).toHaveCount(0);
      await expect(player.locator('.range-targets')).toBeVisible({visible:compare});
      expect(await page.locator('#speed').evaluate(e=>e.closest('label').nextElementSibling.id)).toBe('analyze');
      expect((await page.locator('#timeline').boundingBox()).height).toBeGreaterThanOrEqual(44);
      for(const i of compare?[0,1]:[0]) {
        if(compare){
          expect(await slot(page,i).locator('.clip-speed').evaluate(e=>e.closest('label').nextElementSibling.className)).toBe('clip-analyze');
          const action=await slot(page,i).locator('.clip-analyze').evaluate(e=>({w:e.clientWidth,sw:e.scrollWidth,h:e.offsetHeight}));
          expect(action.sw).toBeLessThanOrEqual(action.w+1);expect(action.h).toBeLessThanOrEqual(44);
        }
        await expect(slot(page,i).locator('.zoom-controls .zoom-fit')).toBeVisible();
        const zoom=await slot(page,i).locator('.zoom-controls').evaluate(e=>({w:e.clientWidth,sw:e.scrollWidth}));
        expect(zoom.sw).toBeLessThanOrEqual(zoom.w+1);
        if(width>900)expect(zoom.w).toBeLessThanOrEqual(240);
      }
      const tools=await page.locator('.drawing-tools').boundingBox(), history=await page.locator('.drawing-history').boundingBox();
      expect(history.y-tools.y-tools.height).toBeGreaterThanOrEqual(0);
      expect(history.y-tools.y-tools.height).toBeLessThanOrEqual(12);
      if(compare) {
        const off=await page.locator('#independent').boundingBox(), align=await page.locator('#align').boundingBox();
        expect(Math.abs(off.y-align.y)).toBeLessThan(8);
        expect(align.x-off.x-off.width).toBeLessThan(20);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  });
}

test('the nearby range target preserves per-clip ranges, independent playback and usable visual results',async({page})=>{
  await page.route('**/vision_bundle.mjs',r=>r.fulfill({contentType:'text/javascript',body:'export const FilesetResolver={forVisionTasks:async()=>({})};export const PoseLandmarker={createFromOptions:async()=>({close(){},detectForVideo(){return{landmarks:[]}}})};'}));
  await page.goto('/');
  // Measure the review workspace after its first-visit privacy choice, as in
  // the analyzed-frame layout checks. Consent itself has separate coverage.
  await page.getByRole('button',{name:'No thanks',exact:true}).click();
  await page.locator('#compareMode').click(); await load(page,0); await load(page,1);
  await page.locator('#independent').click();
  await page.locator('[data-range-slot="0"]').click(); await slot(page,0).locator('.clip-timeline').fill('0.5');
  await page.locator('[data-range-slot="1"]').click(); await slot(page,1).locator('.clip-timeline').fill('1.5');
  await slot(page,1).locator('.clip-speed').selectOption('0.25'); await slot(page,1).locator('.clip-play').click();
  const common=await page.locator('#time').textContent();
  await page.locator('[data-range-slot="0"]').click();
  expect(await slot(page,0).locator('video').evaluate(v=>v.currentTime)).toBe(.5); await expect(page.locator('#analyze')).toHaveText('Analyze A');
  expect(await slot(page,1).locator('video').evaluate(v=>v.paused)).toBe(false);
  await expect(page.locator('#time')).toHaveText(common);
  await slot(page,1).locator('.clip-play').click(); await page.locator('[data-range-slot="0"]').click();
  await page.locator('#analyze').click(); await expect(page.locator('#status')).toContainText('No clear pose');
  await page.locator('[data-range-slot="1"]').click();
  expect(await slot(page,1).locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(1.5);
  await page.locator('#analyze').click(); await expect(page.locator('#status')).toContainText('No clear pose');
  await expect(page.locator('.key-card')).toHaveCount(7);
  for(const [width,height,minStage] of [[1440,900,200],[1280,720,100],[2560,1440,500]]) {
    await page.setViewportSize({width,height}); await page.locator('#studio').evaluate(e=>e.scrollIntoView({block:'start'}));
    await page.screenshot({path:`/tmp/range-reviewed-${width}.png`});
    await expect.poll(async()=>(await slot(page,0).locator('.stage').boundingBox()).height).toBeGreaterThan(minStage);
    await expect(page.locator('#analyze')).toBeInViewport(); await expect(page.locator('.key-card').last()).toBeInViewport();
    await expect(page.locator('#studioFooter a[href="privacy.html"]')).toBeInViewport();
    const footer=await page.locator('.screen-transport').boundingBox(); expect(footer.y+footer.height).toBeLessThanOrEqual(height+1);
  }
});
