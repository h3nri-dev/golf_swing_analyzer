import {test, expect} from '@playwright/test';
import {focusSection, focusVideos} from './ui.js';
const fixture = new URL('./fixtures/portrait.mp4',import.meta.url).pathname;
const slot=(page,i)=>page.locator(`[data-slot="${i}"]`);
async function load(page,i) {
  await slot(page,i).locator('input[type=file]').setInputFiles(fixture);
  await expect(slot(page,i).locator('video')).toBeVisible();
}
async function draw(page,i) {
  await focusVideos(page);await page.locator('[data-tool="line"]').click();
  const b=await slot(page,i).locator('.annotation-canvas').boundingBox();
  await page.mouse.move(b.x+b.width*.3,b.y+b.height*.3);await page.mouse.down();
  await page.mouse.move(b.x+b.width*.7,b.y+b.height*.7,{steps:8});await page.mouse.up();
}
test('first use provides task help and one playback control per scope',async({page})=>{
  await page.goto('/');await expect(page.locator('#analysisPanel')).toBeVisible();
  await page.locator('#workspaceHelp').click();await expect(page.locator('#helpDialog')).toBeVisible();
  await page.locator('[data-help-task="compare"]').click();await expect(slot(page,1)).toBeVisible();
  await load(page,0);await load(page,1);
  await expect(page.getByRole('button',{name:'Play both swings',exact:true})).toHaveCount(1);
  await expect(page.locator('.clip-transport').first()).toBeVisible();
  await page.locator('#independent').click();
  await expect(page.locator('#play')).toBeVisible();
  await expect(page.getByRole('button',{name:'Play swing A',exact:true})).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Play swing B',exact:true})).toHaveCount(1);
  await expect(slot(page,0).locator('.clip-speed')).toBeVisible();
  await expect(slot(page,1).locator('.clip-speed')).toBeVisible();
});
test('Sync Videos aligns the displayed frames in one click from either sync state',async({page})=>{
  await page.goto('/');await page.locator('#compareMode').click();await load(page,0);await load(page,1);
  await expect(page.getByRole('button',{name:'Sync Videos',exact:true})).toBeEnabled();
  await page.locator('#independent').click();
  await slot(page,0).locator('.clip-timeline').fill('0.7');await slot(page,1).locator('.clip-timeline').fill('1.2');
  await page.locator('#align').click();await expect(page.locator('#linked')).toHaveAttribute('aria-pressed','true');
  await page.locator('#next').click();
  const times=await page.locator('video').evaluateAll(v=>v.map(x=>x.currentTime));expect(times[1]-times[0]).toBeCloseTo(.5,2);
  await expect(page.locator('#syncHint')).toContainText('Aligned');
  await page.locator('#align').click();await expect(page.locator('#linked')).toHaveAttribute('aria-pressed','true');
  const alignedTimes=await page.locator('video').evaluateAll(v=>v.map(x=>x.currentTime));expect(alignedTimes[1]-alignedTimes[0]).toBeCloseTo(.5,2);
});
test('expanded sections have natural keyboard access and help focuses the requested controls',async({page})=>{
  await page.goto('/');await load(page,0);
  await expect(page.getByRole('tab')).toHaveCount(0);
  for(const name of ['draw','video','range','pose','moments']) await expect(page.locator(`#panel-${name}`)).toBeVisible();
  await page.locator('#workspaceHelp').click();await page.locator('[data-help-task="draw"]').click();
  await expect(page.locator('#panel-draw')).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('.drawing-colors button').first()).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.locator('#panel-draw')).toBeVisible();
  await expect(page.locator('#resultsEmpty')).toBeVisible();await expect(page.locator('#metrics')).toBeHidden();
  await page.locator('#workspaceHelp').click();const time=await slot(page,0).locator('video').evaluate(v=>v.currentTime);
  await page.keyboard.press('ArrowRight');expect(await slot(page,0).locator('video').evaluate(v=>v.currentTime)).toBe(time);
  await page.keyboard.press('Escape');await expect(page.locator('#workspaceHelp')).toBeFocused();
});
test('cancelling removal or replacement preserves drawings, range and video',async({page})=>{
  await page.goto('/');await load(page,0);await draw(page,0);
  await focusSection(page,'range');await page.locator('#rangeStart').fill('0.5');
  const src=await slot(page,0).locator('video').getAttribute('src');
  await slot(page,0).locator('.remove').click();await expect(page.locator('#discardDialog')).toBeVisible();await expect(page.locator('#discardCancel')).toBeFocused();
  await page.locator('#discardCancel').click();await expect(slot(page,0).locator('video')).toHaveAttribute('src',src);
  await expect(page.locator('#drawingCount')).toHaveText('1 drawing on A');await expect(page.locator('#rangeStart')).toHaveValue('0.5');
  await slot(page,0).locator('input[type=file]').setInputFiles(new URL('./fixtures/landscape.mp4',import.meta.url).pathname);
  await expect(page.locator('#discardDialog')).toBeVisible();await page.keyboard.press('Escape');
  await expect(slot(page,0).locator('video')).toHaveAttribute('src',src);await expect(page.locator('#drawingCount')).toHaveText('1 drawing on A');
  await slot(page,0).locator('.remove').click();await page.locator('#discardConfirm').click();
  await expect(slot(page,0).locator('.dropzone')).toBeVisible();await expect(page.locator('#drawingCount')).toHaveText('0 drawings on A');
});
test('selected clip and interval are explicit and completed analysis has a results action',async({page})=>{
  await page.route('https://cdn.jsdelivr.net/**/vision_bundle.mjs',r=>r.fulfill({contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:'export const FilesetResolver={forVisionTasks:async()=>({})};export const PoseLandmarker={createFromOptions:async()=>({close(){},detectForVideo(){return {landmarks:[]}}})};'}));
  await page.goto('/');await page.locator('#compareMode').click();await load(page,0);await load(page,1);
  await focusSection(page,'range');await page.locator('#rangeStart').fill('1');await page.locator('#rangeEnd').fill('1.2');
  await expect(page.locator('#reviewContext')).toHaveText('Swing B · 1.00–1.20 s');await expect(page.locator('#analyze')).toHaveText('Analyze B');
  await page.locator('#analyze').click();await expect(page.locator('#status')).toContainText('No clear pose found');
  await expect(page.locator('#viewResults')).toBeVisible();await page.locator('#viewResults').click();
  await expect(page.locator('#panel-pose')).toBeFocused();await expect(page.locator('#resultsEmpty')).toBeHidden();
  await page.locator('[data-select="0"]').click();await expect(page.locator('#resultsEmpty')).toBeVisible();await expect(page.locator('#analyze')).toHaveText('Analyze A');
});
for(const [width,height] of [[390,844],[320,568],[844,390]]) {
  test(`independent playback and alignment stay usable at ${width}×${height}`,async({page})=>{
    await page.setViewportSize({width,height});await page.goto('/');await page.locator('#compareMode').click();await load(page,0);await load(page,1);
    await page.locator('#independent').click();
    for(const i of [0,1]){
      const b=await slot(page,i).locator('.stage').boundingBox();expect(b.height).toBeGreaterThan(70);
      await slot(page,i).locator('.clip-speed').selectOption('0.25');await slot(page,i).locator('.clip-next').click();
      const bounds=await slot(page,i).locator('.clip-transport').evaluate(e=>({w:e.clientWidth,sw:e.scrollWidth}));expect(bounds.sw).toBeLessThanOrEqual(bounds.w+1);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const footer=await page.locator('.screen-transport').boundingBox();expect(footer.y+footer.height).toBeLessThanOrEqual(height+1);
    await page.screenshot({path:`/tmp/ux-after-independent-${width}.png`});
  });
}
