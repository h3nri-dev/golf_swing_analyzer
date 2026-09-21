import {test,expect} from '@playwright/test';
const card=(page,i)=>page.locator(`[data-slot="${i}"]`);
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
  for(const i of [0,1]) expect(await card(page,i).locator('.clip-play').evaluate(e=>e.nextElementSibling.classList.contains('clip-moments'))).toBe(true);
  await card(page,0).locator('.clip-speed').selectOption('0.25');await card(page,0).locator('.clip-play').click();
  await card(page,1).locator('.clip-timeline').fill('0.5');
  await card(page,1).locator('.clip-moments').selectOption('impact');
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
  await card(page,1).locator('.clip-moments').selectOption('impact');
  expect((await state(page))[1].time).toBeCloseTo(4,4);expect((await state(page))[0].paused).toBe(false);
  await expect(card(page,1).locator('.clip-time')).toHaveText('1.000 s · F120');
  await card(page,1).locator('.clip-moments').selectOption('edit');
  await row.getByRole('button',{name:'Delete Impact moment'}).click();await page.keyboard.press('Escape');
  await expect(page.locator('#phase-impact')).toHaveText('—');
  await expect(card(page,1).locator('.clip-moments')).toHaveValue('');
});
test('frame-aware clocks, range inputs and retiming use real seconds without moving saved frames',async({page})=>{
  await setup(page);await card(page,1).locator('.clip-next').click();
  await expect(card(page,1).locator('.clip-time')).toHaveText('0.008 s · F1');
  await expect(card(page,1).locator('.clip-duration')).toHaveText('0.008 / 2.000 s');
  await card(page,1).locator('.clip-timeline').fill('0.5');await page.locator('#mark-impact').click();
  await page.locator('#rangeStart').fill('0.25');await page.locator('#rangeEnd').fill('1.5');
  let data=await page.evaluate(async()=>(await import('/app.js')).reportData());
  expect(data.selectedRange).toEqual([1,6]);expect(data.marks.impact).toBe(2);
  await expect(page.locator('#rangeSummary')).toHaveText('1.250 s selected');
  await card(page,1).locator('.fps').selectOption('60');
  await expect(page.locator('#phase-impact')).toHaveText('1.000 s');
  await expect(page.locator('#rangeStart')).toHaveValue('0.500');await expect(page.locator('#rangeEnd')).toHaveValue('3.000');
  data=await page.evaluate(async()=>(await import('/app.js')).reportData());expect(data.marks.impact).toBe(2);
  await card(page,1).locator('.clip-moments').selectOption('impact');
  await expect(card(page,1).locator('.clip-time')).toHaveText('1.000 s · F120');
});
test('single-video moments stay beside Play and return to each player when comparing',async({page})=>{
  await page.goto('/');await page.locator('input[type=file]').first().setInputFiles(new URL('./fixtures/portrait.mp4',import.meta.url).pathname);
  const moments=page.getByRole('combobox',{name:'Moments for swing A'});await expect(moments).toBeVisible();
  expect(await page.locator('#play').evaluate(e=>e.nextElementSibling.classList.contains('clip-moments'))).toBe(true);
  await moments.selectOption('address');await page.locator('.moment-edit-row').first().getByRole('button',{name:'Set here'}).click();
  await page.keyboard.press('Escape');await page.locator('#compareMode').click();
  await expect(card(page,0).locator('.clip-moments')).toBeVisible();
  await expect(card(page,0).locator('.clip-moments').locator('option[value=address]')).toHaveText('Address · 0.000 s · F0');
});
for(const [width,height] of [[320,568],[844,390]]) {
  test(`moment editor stays reachable at ${width}x${height}`,async({page})=>{
    await page.setViewportSize({width,height});await setup(page);
    await card(page,1).locator('.clip-moments').selectOption('edit');
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
