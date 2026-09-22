import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const card=(page,i)=>page.locator(`[data-slot="${i}"]`);
const fixture=new URL('./fixtures/portrait.mp4',import.meta.url).pathname;
function pageContents(pdf) {
  return [...pdf.matchAll(/\/Type \/Page\b[\s\S]*?\/Contents (\d+) 0 R/g)].map(([,id])=>{
    const start=pdf.indexOf(`\n${id} 0 obj\n`),stream=pdf.indexOf('stream\n',start)+7;
    return pdf.slice(stream,pdf.indexOf('endstream',stream));
  });
}
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
      await card(page,i).locator('.clip-timeline').fill(String(time));await page.locator(`.moment-cell.is-active[data-moment=${key}] .moment-mark`).click();
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
  expect(pdf.startsWith('%PDF-')).toBe(true);expect(pdf.includes('(Swing A / Current frame)')).toBe(true);
  expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(10);
  expect(pdf.includes('Frame measurements')).toBe(true);expect(pdf.includes('real s')).toBe(true);
  expect(pdf.match(/\(FreeGolfSwingAnalyzer\.com\) Tj/g)).toHaveLength(20);
  expect(pdf.match(/\(Frame measurements\) Tj/g)).toHaveLength(10);
  // Identical frame images may share an embedded resource. Check what each
  // page actually draws, including the Unicode filename image on B's pages.
  const pages=pageContents(pdf);expect(pages).toHaveLength(10);
  pages.forEach((content,i)=>{
    expect(content.match(/\/I\d+ Do/g)).toHaveLength(i<5?1:2);
    expect(content.includes('(Frame measurements)')).toBe(true);
    expect(content.match(/\(FreeGolfSwingAnalyzer\.com\) Tj/g)).toHaveLength(2);
  });
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
  expect(result.suggestedFilename()).toBe('swing-report.pdf');await result.saveAs('/tmp/swing-empty-report.pdf');
  const pdf=(await fs.readFile(await result.path())).toString('latin1');expect(pdf.includes('Not analyzed')).toBe(true);
  expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(1);
  expect(pdf.includes('(Your swing / Current frame)')).toBe(true);
  expect(pdf.match(/\(FreeGolfSwingAnalyzer\.com\) Tj/g)).toHaveLength(2);
  expect(/\(SWING [AB]\)|\(Swing [AB] \//.test(pdf)).toBe(false);
});
test('canceling PDF export restores the playhead and controls',async({page})=>{
  await page.route('**/vendor/jspdf.umd.min.js',async r=>{await new Promise(resolve=>setTimeout(resolve,500));await r.continue();});
  await page.goto('/');await load(page,0);await page.locator('#timeline').fill('1.5');await page.locator('.moment-cell.is-active[data-moment=impact] .moment-mark').click();
  await page.locator('#timeline').fill('0.5');
  let downloads=0;page.on('download',()=>downloads++);
  await page.locator('#export').click();await expect(page.locator('#reportDialog')).toBeVisible();
  await page.locator('#reportDialog button').click();await expect(page.locator('#reportDialog')).toBeHidden();
  await expect(page.locator('#export')).toBeEnabled();expect(await card(page,0).locator('video').evaluate(v=>v.currentTime)).toBe(.5);
  expect(downloads).toBe(0);
});

test('full-page images retain portrait and landscape proportions, including crop and mirror',async({page})=>{
  await page.goto('/');await page.locator('#compareMode').click();await load(page,0);
  await card(page,1).locator('input[type=file]').setInputFiles(new URL('./fixtures/landscape.mp4',import.meta.url).pathname);
  await expect(card(page,1).locator('video')).toBeVisible();
  const dimensions=await page.locator('.video-card video').evaluateAll(videos=>videos.map(v=>({w:v.videoWidth,h:v.videoHeight})));
  async function save(path) {
    const download=page.waitForEvent('download');await page.locator('#export').click();const result=await download;await result.saveAs(path);
    await expect(page.locator('#reportDialog')).toBeHidden();return (await fs.readFile(await result.path())).toString('latin1');
  }
  const pdf=await save('/tmp/golf-mixed-aspects-report.pdf'),pages=pageContents(pdf);
  expect(pages).toHaveLength(2);
  const boxes=[...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map(([,w,h])=>({w:Number(w),h:Number(h)}));
  expect(boxes[0].h).toBeGreaterThan(boxes[0].w);expect(boxes[1].w).toBeGreaterThan(boxes[1].h);
  const images=[...pdf.matchAll(/\/Subtype \/Image\s+\/Width (\d+)\s+\/Height (\d+)/g)].map(([,w,h])=>({w:Number(w),h:Number(h)}));
  expect(images).toHaveLength(2);
  images.forEach((image,i)=>{expect(Math.max(image.w,image.h)).toBe(2000);expect(image.w/image.h).toBeCloseTo(dimensions[i].w/dimensions[i].h,2);});
  for(const content of pages){expect(content.match(/\/I\d+ Do/g)).toHaveLength(1);expect(content.includes('Frame measurements')).toBe(true);}
  await page.locator('[data-select="1"]').click();await page.locator('[data-settings-slot="1"] .video-crop').selectOption('right');
  await page.locator('[data-settings-slot="1"] .mirror').click();
  await page.locator('[data-tool=rect]').click();
  const box=await card(page,1).locator('.annotation-canvas').boundingBox();
  await page.mouse.move(box.x+box.width*.1,box.y+box.height*.2);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.4,box.y+box.height*.7,{steps:4});await page.mouse.up();
  const before=await page.evaluate(async()=>(await import('/app.js')).reportData(1));
  const cropped=await save('/tmp/golf-cropped-report.pdf');
  expect(pageContents(cropped)[1].includes('Area: Right half')).toBe(true);expect(pageContents(cropped)[1].includes('Mirrored')).toBe(true);
  const after=await page.evaluate(async()=>(await import('/app.js')).reportData(1));
  for(const key of ['drawings','viewport','mirrored','crop','currentTime'])expect(after[key]).toEqual(before[key]);
  await page.screenshot({path:'/tmp/golf-cropped-report-view.png'});
});
