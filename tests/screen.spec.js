import {test, expect} from '@playwright/test';
import {focusSection, focusVideos, transport} from './ui.js';
const sections=['draw','video','range','pose','moments'];
for(const [width,height] of [[1440,900],[1280,720],[2560,1440],[390,844],[320,568],[844,390]]) {
  test(`expanded controls remain available at ${width}×${height}`,async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize({width,height});await page.goto('/');await page.locator('#compareMode').click();
    for(let i=0;i<2;i++){
      await page.locator(`[data-slot="${i}"] input[type=file]`).setInputFiles(new URL('./fixtures/portrait.mp4',import.meta.url).pathname);
      await expect(page.locator(`[data-slot="${i}"] video`)).toBeVisible();
    }
    await expect(page.getByRole('tab')).toHaveCount(0);
    await focusSection(page,'draw');await page.locator('#drawingScope').selectOption('frame');await focusVideos(page);
    await page.locator('[data-tool="line"]').click();
    const canvas=await page.locator('[data-slot="1"] .annotation-canvas').boundingBox();
    await page.mouse.move(canvas.x+canvas.width*.3,canvas.y+canvas.height*.3);await page.mouse.down();
    await page.mouse.move(canvas.x+canvas.width*.7,canvas.y+canvas.height*.7,{steps:4});await page.mouse.up();
    await expect(page.locator('#drawingCount')).toHaveText('1 drawing on B');
    const top=await page.evaluate(()=>scrollY);
    for(const name of sections){
      await focusSection(page,name);
      for(const other of sections) await expect(page.locator(other==='range'?'#commonPlayer':`#panel-${other}`)).toBeVisible();
      const size=await page.locator(name==='range'?'#commonPlayer':`#panel-${name}`).evaluate(e=>({w:e.clientWidth,sw:e.scrollWidth}));
      expect(size.sw,`${name} stays within its card`).toBeLessThanOrEqual(size.w+1);
      if(width>900) expect(await page.evaluate(()=>scrollY)).toBeCloseTo(top,0);
    }
    await focusVideos(page);
    await expect(page.locator('#workspaceBrand')).toBeInViewport();
    await expect(page.locator('.video-brand').first()).toBeVisible();
    const brand=await page.locator('#workspaceBrand').evaluate(e=>({w:e.clientWidth,sw:e.scrollWidth}));
    expect(brand.sw,'branding fits without squeezing the mode buttons').toBeLessThanOrEqual(brand.w+1);
    const side=await page.locator('#analysisPanel').boundingBox(),review=await page.locator('#workspace').boundingBox();
    if(width>900) {
      expect(review.y,'video starts at the top without a title row').toBeLessThan(2);
      await expect(page.locator('#analysisPanel .mode-switch')).toBeInViewport();
      expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThanOrEqual(height+1);
      expect(side.x).toBeGreaterThanOrEqual(review.x+review.width-1);
      if(width>=1440 && height>=900) {
        const size=await page.locator('#analysisPanel').evaluate(e=>({h:e.clientHeight,sh:e.scrollHeight}));
        expect(size.sh,'full desktop sidebar needs no scrolling').toBeLessThanOrEqual(size.h+1);
      }
    } else expect(side.y).toBeGreaterThanOrEqual(review.y+review.height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    for(const controls of await page.locator('.zoom-controls').all()) {
      const size=await controls.evaluate(e=>({w:e.clientWidth,sw:e.scrollWidth}));expect(size.sw).toBeLessThanOrEqual(size.w+1);
    }
    await page.screenshot({path:`/tmp/sidebar-screen-${width}.png`});
    const stage=await page.locator('.stage').first().boundingBox();expect(stage.height).toBeGreaterThan(height<500?50:100);
    expect(errors).toEqual([]);
  });
}
test('desktop scrolling ends at the workspace and preserves playback, zoom and legal access',async({page})=>{
  await page.goto('/');await page.mouse.wheel(0,170);await page.waitForTimeout(700);
  expect(Math.abs((await page.locator('#studio').boundingBox()).y)).toBeLessThan(1);
  await page.locator('input[type=file]').first().setInputFiles(new URL('./fixtures/portrait.mp4',import.meta.url).pathname);
  await expect(page.locator('video').first()).toBeVisible();
  await (await transport(page,'speed')).selectOption('0.25');await page.locator('.zoom-slider').first().fill('2');await (await transport(page,'play')).click();
  const top=await page.evaluate(()=>scrollY);
  for(const name of sections) await focusSection(page,name);
  expect(await page.locator('video').first().evaluate(v=>v.paused)).toBe(false);
  await expect(page.locator('.zoom-value').first()).toHaveText('2.00×');
  expect(await page.evaluate(()=>scrollY)).toBeCloseTo(top,0);
  await page.keyboard.press('Escape');await expect(page.locator('#analysisPanel')).toBeVisible();
  await page.mouse.move(30,20);await page.mouse.wheel(0,1200);await page.waitForTimeout(700);
  expect(Math.abs((await page.locator('#studio').boundingBox()).y)).toBeLessThan(1);
  await expect(page.locator('#workspaceBrand')).toBeInViewport();
  await expect(page.locator('#play')).toBeInViewport();
  await expect(page.locator('#studioFooter a[href="privacy.html"]')).toBeInViewport();
  await expect(page.locator('#studioFooter a[href="terms.html"]')).toBeInViewport();
  await expect(page.locator('#studioFooter [data-cookie-settings]')).toBeInViewport();
  // Scrolling past the end of the inspector must not move the video workspace.
  await page.locator('#analysisPanel').evaluate(e=>{e.scrollTop=e.scrollHeight;});
  const inspector=await page.locator('#analysisPanel').boundingBox();
  await page.mouse.move(inspector.x+40,inspector.y+40);await page.mouse.wheel(0,1600);await page.waitForTimeout(300);
  expect(Math.abs((await page.locator('#studio').boundingBox()).y)).toBeLessThan(1);
});

for(const [width,height] of [[1440,900],[390,844]]) {
  test(`About holds the former guide without losing the video session at ${width}×${height}`,async({page})=>{
    await page.setViewportSize({width,height});await page.goto('/');
    await page.locator('input[type=file]').first().setInputFiles(new URL('./fixtures/portrait.mp4',import.meta.url).pathname);
    await expect(page.locator('video').first()).toBeVisible();
    await page.locator('.zoom-slider').first().fill('2');await focusVideos(page);
    const before=await page.locator('video').first().evaluate(v=>({src:v.src,time:v.currentTime}));
    const scroll=await page.evaluate(()=>scrollY);
    await page.locator('#workspaceBrand').click();
    await expect(page.getByRole('dialog',{name:'About FreeGolfSwingAnalyzer.com'})).toBeVisible();
    await expect(page.locator('#aboutDialog article')).toHaveCount(3);
    await expect(page.locator('main > .guide')).toHaveCount(0);
    await expect(page.locator('#closeAbout')).toBeFocused();
    await page.locator('#aboutDialog').evaluate(e=>{e.scrollTop=e.scrollHeight;});
    await expect(page.locator('#aboutDialog [data-cookie-settings]')).toBeInViewport();
    await expect(page.locator('#closeAbout')).toBeInViewport();
    const size=await page.locator('#aboutDialog').evaluate(e=>({w:e.clientWidth,sw:e.scrollWidth}));
    expect(size.sw).toBeLessThanOrEqual(size.w+1);
    await page.screenshot({path:`/tmp/studio-about-${width}.png`});
    await page.keyboard.press('Escape');
    await expect(page.locator('#workspaceBrand')).toBeFocused();
    expect(await page.evaluate(()=>scrollY)).toBeCloseTo(scroll,0);
    expect(await page.locator('video').first().evaluate(v=>({src:v.src,time:v.currentTime}))).toEqual(before);
    await expect(page.locator('.zoom-value').first()).toHaveText('2.00×');
    await page.locator('#workspaceBrand').click();
    await page.locator('#aboutDialog [data-cookie-settings]').click();
    await expect(page.locator('#aboutDialog')).toBeHidden();
    await expect(page.locator('#cookieDialog')).toBeVisible();
    await page.keyboard.press('Escape');await expect(page.locator('#workspaceBrand')).toBeFocused();
  });
}
