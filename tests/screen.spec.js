import {test, expect} from '@playwright/test';
import {openPanel, closePanel, transport} from './ui.js';
for(const [width,height] of [[1440,900],[1280,720],[2560,1440],[390,844],[320,568],[844,390]]) {
  test(`workspace and controls stay within ${width}×${height}`,async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize({width,height});await page.goto('/');
    await page.locator('#compareMode').click();
    for(let i=0;i<2;i++){
      await page.locator(`[data-slot="${i}"] input[type=file]`).setInputFiles(new URL('./fixtures/portrait.mp4',import.meta.url).pathname);
      await expect(page.locator(`[data-slot="${i}"] video`)).toBeVisible();
    }
    await page.waitForTimeout(200);
    await openPanel(page,'draw');await page.locator('#drawingScope').selectOption('frame');
    if(width<=1000) await closePanel(page);
    await page.locator('[data-tool="line"]').click();
    const canvas=await page.locator('[data-slot="1"] .annotation-canvas').boundingBox();
    await page.mouse.move(canvas.x+canvas.width*.3,canvas.y+canvas.height*.3);await page.mouse.down();
    await page.mouse.move(canvas.x+canvas.width*.7,canvas.y+canvas.height*.7,{steps:4});await page.mouse.up();
    await expect(page.locator('#drawingCount')).toHaveText('1 drawing on B');
    const top=await page.evaluate(()=>scrollY);
    for(const name of ['range','draw','video','pose','moments']){
      await openPanel(page,name);
      await page.screenshot({path:`/tmp/screen-${width}-${name}.png`});
      const bounds=await page.locator('#analysisPanel').evaluate(e=>({h:e.clientHeight,sh:e.scrollHeight,w:e.clientWidth,sw:e.scrollWidth}));
      expect(bounds.sh,`${name} vertical overflow`).toBeLessThanOrEqual(bounds.h+1);
      expect(bounds.sw,`${name} horizontal overflow`).toBeLessThanOrEqual(bounds.w+1);
      expect(await page.evaluate(()=>scrollY)).toBeCloseTo(top,0);
    }
    await closePanel(page);
    const rail=await page.locator('#drawingToolbar').evaluate(e=>({h:e.clientHeight,sh:e.scrollHeight}));
    expect(rail.sh,'drawing tools need no scrolling').toBeLessThanOrEqual(rail.h+1);
    for(const controls of await page.locator('.zoom-controls').all()) {
      const size=await controls.evaluate(e=>({w:e.clientWidth,sw:e.scrollWidth}));
      expect(size.sw,'zoom controls stay inside their clip').toBeLessThanOrEqual(size.w+1);
    }
    const outside=await page.locator('#studio button, #studio input, #studio select').evaluateAll(es=>es.filter(e=>{
      if(!e.getClientRects().length)return false;
      const b=e.getBoundingClientRect();return b.left < -1 || b.top < -1 || b.right>innerWidth+1 || b.bottom>innerHeight+1;
    }).map(e=>e.id||e.className));
    expect(outside).toEqual([]);
    const stage=await page.locator('.stage').first().boundingBox();expect(stage.height).toBeGreaterThan(height<500?50:100);
    await page.screenshot({path:`/tmp/screen-${width}-video.png`});expect(errors).toEqual([]);
  });
}
test('scroll snaps to studio and panels preserve playback and zoom',async({page})=>{
  await page.goto('/');await page.mouse.wheel(0,170);await page.waitForTimeout(700);
  expect(Math.abs((await page.locator('#studio').boundingBox()).y)).toBeLessThan(1);
  await page.locator('input[type=file]').first().setInputFiles(new URL('./fixtures/portrait.mp4',import.meta.url).pathname);
  await expect(page.locator('video').first()).toBeVisible();
  await (await transport(page,'speed')).selectOption('0.25');await page.locator('.zoom-slider').first().fill('2');await (await transport(page,'play')).click();
  const top=await page.evaluate(()=>scrollY);
  for(const name of ['draw','range','pose','moments','video']) await openPanel(page,name);
  expect(await page.locator('video').first().evaluate(v=>v.paused)).toBe(false);
  await expect(page.locator('.zoom-value').first()).toHaveText('2.00×');
  expect(await page.evaluate(()=>scrollY)).toBeCloseTo(top,0);
  await page.locator('#tab-video').focus();await page.keyboard.press('ArrowRight');await expect(page.locator('#tab-range')).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.locator('#analysisPanel')).toBeHidden();
  // Scrolling can still leave the editor for the guide.
  await page.mouse.move(30,20);await page.mouse.wheel(0,1200);await page.waitForTimeout(700);
  expect((await page.locator('#studio').boundingBox()).y).toBeLessThan(-500);
});
