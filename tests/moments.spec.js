import {test,expect} from '@playwright/test';
const card=(page,i)=>page.locator(`[data-slot="${i}"]`);
const moment=(page,i,key)=>page.locator(`.moment-cell[data-moment-slot="${i}"][data-moment="${key}"]`);
const state=page=>page.locator('video').evaluateAll(vs=>vs.map(v=>({time:v.currentTime,paused:v.paused})));
async function setup(page) {
  await page.goto('/');await page.locator('#compareMode').click();
  for(const [i,file] of ['portrait.mp4','timing-slow.mp4'].entries()) {
    await card(page,i).locator('input[type=file]').setInputFiles(new URL(`./fixtures/${file}`,import.meta.url).pathname);
    await expect(card(page,i).locator('video')).toBeVisible();
  }
  await card(page,1).locator('.shot-fps').selectOption('120');await page.locator('#independent').click();
}
test('each player has adjacent moments with frame editing, jump, deletion and independent playback',async({page})=>{
  await setup(page);
  for(const i of [0,1]) await expect(page.locator(`.moment-cell[data-moment-slot="${i}"]`)).toHaveCount(7);
  await card(page,0).locator('.clip-speed').selectOption('0.25');await card(page,0).locator('.clip-play').click();
  await card(page,1).locator('.clip-timeline').fill('0.5');
  const common=await page.locator('#time').textContent();
  await moment(page,1,'impact').locator('.moment-mark').click();
  await expect(page.locator('#momentDialog')).toBeHidden();
  await expect(page.locator('#time')).toHaveText(common);
  await page.locator('[data-edit-slot="1"]').click();
  const row=page.locator('.moment-edit-row').filter({hasText:'Impact'});
  await expect(page.locator('#momentDialog')).toBeVisible();
  await row.getByRole('button',{name:'Set here',exact:true}).click();
  await expect(row.locator('input')).toHaveValue('60');await expect(row.locator('span')).toHaveText('0.500 s · F60');
  expect((await state(page))[0].paused).toBe(false);
  await row.locator('input').fill('120');await row.locator('input').press('Tab');
  await expect(row.locator('span')).toHaveText('1.000 s · F120');
  await row.locator('input').fill('10000');await row.locator('input').press('Tab');
  await expect(page.locator('.moment-error')).toBeVisible();
  await page.getByRole('button',{name:'Close moment editor'}).click();
  await moment(page,1,'impact').locator('.key-frame').click();
  await expect(page.locator('#time')).toHaveText(common);
  expect((await state(page))[1].time).toBeCloseTo(4,4);expect((await state(page))[0].paused).toBe(false);
  await expect(card(page,1).locator('.clip-time')).toHaveText('1.000 s · F120');
  await page.locator('[data-edit-slot="1"]').click();
  await row.getByRole('button',{name:'Reset Impact moment'}).click();await page.keyboard.press('Escape');
  await expect(moment(page,1,'impact').locator('.key-frame-time')).toContainText('Not set');
});
test('frame-aware clocks, analysis windows and retiming use real seconds without moving saved frames',async({page})=>{
  await setup(page);await card(page,1).locator('.clip-next').click();
  await expect(card(page,1).locator('.clip-time')).toHaveText('0.008 s · F1');
  await expect(card(page,1).locator('.clip-duration')).toHaveText('0.008 / 2.000 s');
  await card(page,1).locator('.clip-timeline').fill('0.5');await moment(page,1,'impact').locator('.moment-mark').click();
  let data=await page.evaluate(async()=>(await import('/app.js')).reportData());
  expect(data.selectedRange).toEqual([0,8]);expect(data.marks.impact).toBe(2);
  await card(page,1).locator('.fps').selectOption('60');
  await expect(moment(page,1,'impact').locator('.key-frame-time')).toContainText('1.000 s');
  expect(await card(page,1).locator('.timeline-rail').getAttribute('data-end')).toBe('7');
  data=await page.evaluate(async()=>(await import('/app.js')).reportData());expect(data.marks.impact).toBe(2);
  await moment(page,1,'impact').locator('.key-frame').click();
  await expect(card(page,1).locator('.clip-time')).toHaveText('1.000 s · F120');
});
test('single-video direct moments preserve marks when switching to compare',async({page})=>{
  await page.goto('/');await page.locator('input[type=file]').first().setInputFiles(new URL('./fixtures/portrait.mp4',import.meta.url).pathname);
  await expect(page.locator('#keyMomentStrip')).toBeVisible();
  await expect(page.locator('.moment-cell[data-moment-slot="0"]')).toHaveCount(7);
  await moment(page,0,'address').locator('.moment-mark').click();
  await expect(page.locator('#momentDialog')).toBeHidden();
  await page.locator('#compareMode').click();
  await expect(moment(page,0,'address')).toBeVisible();
  await expect(moment(page,0,'address').locator('.key-frame-time')).toHaveText('0.000 s F0');
});
for(const [width,height] of [[320,568],[844,390]]) {
  test(`moment editor stays reachable at ${width}x${height}`,async({page})=>{
    await page.setViewportSize({width,height});await setup(page);
    await page.locator('[data-edit-slot="1"]').click();
    const dialog=page.locator('#momentDialog'),box=await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
    expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(height);
    expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    await page.screenshot({path:`/tmp/moment-editor-${width}.png`});expect(await dialog.evaluate(e=>e.scrollHeight<=e.clientHeight),JSON.stringify(await dialog.evaluate(e=>({h:e.clientHeight,sh:e.scrollHeight})))).toBe(true);
    await page.screenshot({path:`/tmp/moment-editor-${width}.png`});
    await dialog.locator('.moment-edit-row').last().getByRole('button',{name:'Set here'}).click();
    await page.getByRole('button',{name:'Close moment editor'}).click();
    await expect(dialog).toBeHidden();
  });
}

for(const [width,height] of [[1440,900],[2560,1440]])test(`all seven direct marker actions stay with their previews at ${width}`,async({page})=>{
 await page.setViewportSize({width,height});await setup(page);
 await expect(page.locator('#analysisPanel .moment-mark')).toHaveCount(0);
 await expect(page.getByRole('combobox',{name:/Moments for swing/})).toHaveCount(0);
 for(const key of ['address','backswing','top','downswing','impact','follow','finish'])for(const i of [0,1]){
  const cell=moment(page,i,key),button=cell.locator('.moment-mark');await expect(button).toBeInViewport();
  const box=await button.boundingBox(),preview=await cell.locator('.key-frame').boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(28);expect(box.height).toBeGreaterThanOrEqual(28);
  expect(box.y-preview.y-preview.height).toBeLessThanOrEqual(2);
 }
 const colors=await page.locator('.key-card').evaluateAll(cards=>cards.map(c=>getComputedStyle(c).borderTopColor));expect(new Set(colors).size).toBe(7);
});
