import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const card=(page,i)=>page.locator(`[data-slot="${i}"]`);
const fixture=new URL('./fixtures/portrait.mp4',import.meta.url).pathname;
async function load(page,i) {
  await card(page,i).locator('input[type=file]').setInputFiles(fixture);
  await expect(card(page,i).locator('video')).toBeVisible();
}
test('PDF comparison includes annotated frames and all moments, preserves views, and stays local',async({page})=>{
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r));
  await page.goto('/');await page.locator('#compareMode').click();await load(page,0);
  await card(page,1).locator('input[type=file]').setInputFiles({name:'参考挥杆 - a long reference filename for the report layout.mp4',mimeType:'video/mp4',buffer:await fs.readFile(fixture)});
  await expect(card(page,1).locator('video')).toBeVisible();await page.locator('#independent').click();
  for(const i of [0,1]) {
    for(const [key,time] of [['address',.2],['top',1.1],['impact',1.4],['finish',2]]) {
      await card(page,i).locator('.clip-timeline').fill(String(time));await page.locator(`#mark-${key}`).click();
    }
    await card(page,i).locator('.zoom-slider').fill('1.5');
    await page.locator('[data-tool=line]').click();
    const box=await card(page,i).locator('.annotation-canvas').boundingBox();
    await page.mouse.move(box.x+box.width*.3,box.y+box.height*.3);await page.mouse.down();
    await page.mouse.move(box.x+box.width*.7,box.y+box.height*.7,{steps:5});await page.mouse.up();
  }
  const before=await page.locator('video').evaluateAll(vs=>vs.map(v=>v.currentTime));
  const download=page.waitForEvent('download');await page.locator('#export').click();const result=await download;
  expect(result.suggestedFilename()).toBe('swing-comparison-report.pdf');await result.saveAs('/tmp/swing-comparison-report.pdf');
  const bytes=await fs.readFile(await result.path()),pdf=bytes.toString('latin1');
  expect(pdf.startsWith('%PDF-')).toBe(true);expect(pdf).toContain('(Swing review)');
  expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(3);
  expect(pdf).toContain('Measurements at your marked frames');expect(pdf).toContain('Real seconds');
  expect(pdf.match(/\/Subtype \/Image\b/g).length).toBeGreaterThanOrEqual(10);
  await expect(page.locator('#reportDialog')).toBeHidden();await expect(page.locator('#export')).toBeEnabled();
  expect(await page.locator('video').evaluateAll(vs=>vs.map(v=>v.currentTime))).toEqual(before);
  for(const i of [0,1])await expect(card(page,i).locator('.zoom-value')).toHaveText('1.50×');
  expect(requests.filter(r=>r.method()!=='GET')).toEqual([]);expect(errors).toEqual([]);
});
test('a PDF can be saved before analysis or marking, and a failed library load can be retried',async({page})=>{
  await page.route('**/vendor/jspdf.umd.min.js',r=>r.abort());
  await page.goto('/');await load(page,0);await expect(page.locator('#export')).toBeEnabled();
  await page.locator('#export').click();await expect(page.locator('#toast')).toContainText('PDF could not be created');
  await expect(page.locator('#reportDialog')).toBeHidden();await expect(page.locator('#export')).toBeEnabled();
  await page.unroute('**/vendor/jspdf.umd.min.js');
  const download=page.waitForEvent('download');await page.locator('#export').click();const result=await download;
  expect(result.suggestedFilename()).toBe('swing-a-report.pdf');await result.saveAs('/tmp/swing-empty-report.pdf');
  const pdf=(await fs.readFile(await result.path())).toString('latin1');expect(pdf).toContain('Not marked');expect(pdf).toContain('Not analyzed');
});
test('canceling PDF export restores the playhead and controls',async({page})=>{
  await page.route('**/vendor/jspdf.umd.min.js',async r=>{await new Promise(resolve=>setTimeout(resolve,500));await r.continue();});
  await page.goto('/');await load(page,0);await page.locator('#timeline').fill('1.5');await page.locator('#mark-impact').click();
  await page.locator('#timeline').fill('0.5');
  let downloads=0;page.on('download',()=>downloads++);
  await page.locator('#export').click();await expect(page.locator('#reportDialog')).toBeVisible();
  await page.locator('#reportDialog button').click();await expect(page.locator('#reportDialog')).toBeHidden();
  await expect(page.locator('#export')).toBeEnabled();expect(await card(page,0).locator('video').evaluate(v=>v.currentTime)).toBe(.5);
  expect(downloads).toBe(0);
});
