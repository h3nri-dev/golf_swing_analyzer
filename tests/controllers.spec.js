import {test, expect} from '@playwright/test';
const card=(page,i)=>page.locator(`[data-slot="${i}"]`);
const states=page=>page.locator('video').evaluateAll(vs=>vs.map(v=>({time:v.currentTime,paused:v.paused,rate:v.playbackRate})));
async function setup(page) {
  await page.goto('/');await page.locator('#compareMode').click();
  for(const i of [0,1]) {
    await card(page,i).locator('input[type=file]').setInputFiles(new URL(`./fixtures/${i?'landscape':'portrait'}.mp4`,import.meta.url).pathname);
    await expect(card(page,i).locator('video')).toBeVisible();
  }
}
test('both local player sets and the common controller remain visible in either sync mode',async({page})=>{
  await setup(page);
  for(const sync of ['linked','independent']) {
    await page.locator(`#${sync}`).click();
    for(const i of [0,1]) {
      for(const selector of ['.clip-play','.clip-previous','.clip-next','.clip-timeline','.clip-speed','.clip-duration','.clip-restart']) await expect(card(page,i).locator(selector)).toBeVisible();
      await expect(card(page,i).locator('.clip-play')).toHaveAttribute('aria-label',`Play swing ${i?'B':'A'}`);
    }
    for(const id of ['play','previous','next','timeline','speed','restart']) await expect(page.locator(`#${id}`)).toBeVisible();
    await expect(page.locator('#play')).toHaveAttribute('aria-label','Play both swings');
  }
});
test('an individual action releases sync and affects only its own video',async({page})=>{
  await setup(page);await page.locator('#speed').selectOption('0.25');await page.locator('#play').click();
  await card(page,0).locator('.clip-play').click();
  await expect(page.locator('#independent')).toHaveAttribute('aria-pressed','true');
  let s=await states(page);expect(s[0].paused).toBe(true);expect(s[1].paused).toBe(false);
  await card(page,0).locator('.clip-timeline').fill('1');await card(page,0).locator('.clip-next').click();
  s=await states(page);expect(s[0].time).toBeCloseTo(1+1/30,3);expect(s[1].paused).toBe(false);
  await card(page,0).locator('.clip-speed').selectOption('0.5');
  await expect(page.locator('#speed')).toHaveValue('mixed');
  await card(page,0).locator('.clip-restart').click();
  s=await states(page);expect(s[0].time).toBe(0);expect(s[1].paused).toBe(false);expect(s.map(v=>v.rate)).toEqual([.5,.25]);
});
test('common controls act on both independent clips without discarding their speeds or relative positions',async({page})=>{
  await setup(page);await card(page,0).locator('.clip-timeline').fill('0.5');await card(page,1).locator('.clip-timeline').fill('1');
  await card(page,0).locator('.clip-speed').selectOption('0.25');await card(page,1).locator('.clip-speed').selectOption('0.5');
  await page.locator('#play').click();let s=await states(page);expect(s.every(v=>!v.paused)).toBe(true);expect(s.map(v=>v.rate)).toEqual([.25,.5]);
  await page.locator('#play').click();expect((await states(page)).every(v=>v.paused)).toBe(true);
  await card(page,0).locator('.clip-timeline').fill('0.5');await card(page,1).locator('.clip-timeline').fill('1');
  await page.locator('#timeline').fill('1.5');s=await states(page);expect(s.map(v=>v.time)).toEqual([1,1.5]);
  await page.locator('#next').click();s=await states(page);expect(s[0].time).toBeCloseTo(1+1/30,3);expect(s[1].time).toBeCloseTo(1.5+1/30,3);
  await page.locator('#previous').click();s=await states(page);expect(s[0].time).toBeCloseTo(1,3);expect(s[1].time).toBeCloseTo(1.5,3);
  await page.locator('#speed').selectOption('0.25');expect((await states(page)).map(v=>v.rate)).toEqual([.25,.25]);
  await page.locator('#restart').click();expect((await states(page)).map(v=>v.time)).toEqual([0,0]);
  await expect(page.locator('#independent')).toHaveAttribute('aria-pressed','true');
});
test('local controls work with one file while common controls wait for both files',async({page})=>{
  await page.goto('/');await page.locator('#compareMode').click();
  await card(page,0).locator('input[type=file]').setInputFiles(new URL('./fixtures/portrait.mp4',import.meta.url).pathname);
  await expect(card(page,0).locator('.clip-play')).toBeEnabled();await expect(page.locator('#play')).toBeDisabled();
  await card(page,0).locator('.clip-play').click();expect((await states(page))[0].paused).toBe(false);
  await expect(card(page,1).locator('.clip-play')).toBeDisabled();
});
