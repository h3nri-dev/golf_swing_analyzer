import {focusSection, settings, discardIfAsked, transport} from './ui.js';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const fixture = new URL('./fixtures/portrait.mp4',import.meta.url).pathname;
const clip=(page,i)=>page.locator(`[data-slot="${i}"]`);
const surface=(page,i)=>clip(page,i).locator('.annotation-canvas');
async function load(page,i){await clip(page,i).locator('input[type=file]').setInputFiles(fixture);await discardIfAsked(page);await expect(clip(page,i).locator('video')).toBeVisible();}
async function line(page,i,from={x:.2,y:.3},to={x:.8,y:.7}){
  await surface(page,i).scrollIntoViewIfNeeded(); const b=await surface(page,i).boundingBox();
  await page.mouse.move(b.x+b.width*from.x,b.y+b.height*from.y);await page.mouse.down();await page.mouse.move(b.x+b.width*to.x,b.y+b.height*to.y,{steps:10});await page.mouse.up();
}
async function reportModel(page) { return page.evaluate(async()=> (await import('/app.js')).reportData()); }

test('draw, adjust, undo, copy, hide, and export side-by-side annotations',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await load(page,0);await page.locator('#compareMode').click();await load(page,1);
  await page.locator('[data-select="0"]').click();await page.locator('[data-tool="line"]').click();await line(page,0);
  await expect(page.locator('#drawingCount')).toHaveText('1 drawing on A');
  let data=await reportModel(page);expect(data.drawings[0].points[0].x).toBeCloseTo(.2,2);
  await page.locator('[data-tool="select"]').click();await surface(page,0).scrollIntoViewIfNeeded();let b=await surface(page,0).boundingBox();
  await page.mouse.click(b.x+b.width*.5,b.y+b.height*.5);
  await expect(page.locator('#drawingDelete')).toBeEnabled();
  await line(page,0,{x:.2,y:.3},{x:.1,y:.2});
  data=await reportModel(page);expect(data.drawings[0].points[0].x).toBeCloseTo(.1,2);
  await page.locator('#drawingUndo').click();data=await reportModel(page);expect(data.drawings[0].points[0].x).toBeCloseTo(.2,2);
  await page.locator('#drawingRedo').click();
  await focusSection(page,'draw');await page.locator('#drawingCopy').click();await page.locator('[data-select="1"]').click();await expect(page.locator('#drawingCount')).toHaveText('1 drawing on B');
  await page.locator('#drawingVisibility').click();await expect(surface(page,1)).toHaveAttribute('data-visible-drawings','0');await page.locator('#drawingVisibility').click();
  const download=page.waitForEvent('download');await focusSection(page,'draw');await page.locator('#drawingSnapshot').click();const image=await download;expect(image.suggestedFilename()).toBe('swing-comparison.png');
  const png=await fs.readFile(await image.path());expect(png.readUInt32BE(16)).toBe(1456);expect(png.readUInt32BE(20)).toBe(825);
  await image.saveAs('/tmp/swing-drawn-comparison.png');
  await page.screenshot({path:'/tmp/swing-drawing-desktop.png',fullPage:true});
  expect(errors).toEqual([]);
});
test('frame annotations return at their marked time and survive responsive resizing and mirror',async({page})=>{
  await page.goto('/');await load(page,0);await focusSection(page,'draw');await page.locator('#drawingScope').selectOption('frame');
  await page.locator('[data-tool="arrow"]').click();await line(page,0);await expect(surface(page,0)).toHaveAttribute('data-visible-drawings','1');
  await (await transport(page,'next')).click();await expect(surface(page,0)).toHaveAttribute('data-visible-drawings','0');await page.locator('#drawingFrames select').selectOption({index:1});await expect(surface(page,0)).toHaveAttribute('data-visible-drawings','1');
  const original=await reportModel(page);await (await settings(page,0,'.mirror')).click();await focusSection(page,'draw');await page.locator('#drawingScope').selectOption('clip');await page.locator('[data-tool="line"]').click();await line(page,0,{x:.1,y:.2},{x:.4,y:.5});
  const mirrored=await reportModel(page);expect(mirrored.drawings[1].points[0].x).toBeCloseTo(.9,2);expect(mirrored.drawings[0]).toEqual(original.drawings[0]);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const resized=await reportModel(page);expect(resized.drawings).toEqual(mirrored.drawings);
  await page.screenshot({path:'/tmp/swing-drawing-mobile.png',fullPage:true});
});
test('angle tool measures in image space, and reset clears only the replaced video',async({page})=>{
  await page.goto('/');await load(page,0);await page.locator('[data-tool="angle"]').click();await surface(page,0).scrollIntoViewIfNeeded();const b=await surface(page,0).boundingBox();
  for(const [x,y] of [[.2,.5],[.5,.5],[.5,.2]])await page.mouse.click(b.x+b.width*x,b.y+b.height*y);
  let data=await reportModel(page);expect(data.drawings[0].angle).toBeCloseTo(90,1);
  await focusSection(page,'draw');await page.locator('#drawingClear').click();await expect(page.locator('#drawingCount')).toHaveText('0 drawings');await page.locator('#drawingUndo').click();await expect(page.locator('#drawingCount')).toHaveText('1 drawing');
  await page.locator('#compareMode').click();await load(page,1);await page.locator('[data-tool="pen"]').click();await line(page,1);
  await load(page,1);await expect(page.locator('#drawingCount')).toHaveText('0 drawings on B');await page.locator('[data-select="0"]').click();await expect(page.locator('#drawingCount')).toHaveText('1 drawing on A');
});
test('touch drawing works and readable comparison controls fit a phone',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();
  await page.goto('/');await load(page,0);await page.locator('#compareMode').click();await load(page,1);
  await page.locator('[data-tool="angle"]').click();await surface(page,1).scrollIntoViewIfNeeded();let b=await surface(page,1).boundingBox();
  for(const [x,y] of [[.2,.5],[.5,.5],[.5,.2]])await page.touchscreen.tap(b.x+b.width*x,b.y+b.height*y);
  await expect(page.locator('#drawingCount')).toHaveText('1 drawing on B');
  let data=await reportModel(page);expect(data.drawings[0].angle).toBeCloseTo(90,0);
  await page.locator('[data-tool="line"]').click();await surface(page,1).scrollIntoViewIfNeeded();b=await surface(page,1).boundingBox();
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width*.2,y:b.y+b.height*.2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width*.8,y:b.y+b.height*.8}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.locator('#drawingCount')).toHaveText('2 drawings on B');
  expect(await page.locator('#analyze').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  expect(await page.locator('#drawingHint').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/swing-drawing-phone-compare.png',fullPage:true});await context.close();
});
test('larger controls fit small phones, tablets, and laptop widths',async({page})=>{
  await page.goto('/');await page.locator('#compareMode').click();
  for(const width of [320,375,768,1024,1280]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no overflow at ${width}px`).toBe(true);
  }
});
