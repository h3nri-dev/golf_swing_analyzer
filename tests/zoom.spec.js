import {openPanel, settings} from './ui.js';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const clip=(page,i)=>page.locator(`[data-slot="${i}"]`);
async function load(page,i,file='portrait.mp4'){
  await clip(page,i).locator('input[type=file]').setInputFiles(new URL(`./fixtures/${file}`,import.meta.url).pathname);
  await expect(clip(page,i).locator('video')).toBeVisible();
}
const transform=(page,i)=>clip(page,i).locator('.video-plane').evaluate(e=>e.style.transform);
async function pan(page,i,dx,dy){
  const stage=clip(page,i).locator('.stage');await stage.scrollIntoViewIfNeeded();const b=await stage.boundingBox();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:8});await page.mouse.up();
}
async function exported(page){const wait=page.waitForEvent('download');await openPanel(page,'moments');await page.locator('#export').click();return JSON.parse(await fs.readFile(await(await wait).path(),'utf8'));}

test('zoom and pan persist during playback, seeking, stepping, resizing and mode changes',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await load(page,0);
  await clip(page,0).locator('.clip-play').click();
  await clip(page,0).locator('.zoom-slider').fill('2');
  await pan(page,0,0,70);
  expect(await clip(page,0).locator('video').evaluate(v=>v.paused)).toBe(false);
  const before=await transform(page,0);await page.waitForTimeout(200);expect(await transform(page,0)).toBe(before);
  await clip(page,0).locator('.clip-play').click();await page.locator('#timeline').fill('1');await page.locator('#next').click();expect(await transform(page,0)).toBe(before);
  await page.locator('#compareMode').click();await page.locator('#singleMode').click();await expect(clip(page,0).locator('.zoom-value')).toHaveText('2.00×');
  await page.setViewportSize({width:390,height:844});await expect(clip(page,0).locator('.zoom-value')).toHaveText('2.00×');
  await (await settings(page,0,'.zoom-fit')).click();await expect(clip(page,0).locator('.zoom-value')).toHaveText('1.00×');expect(await transform(page,0)).toBe('translate(0px, 0px) scale(1)');
  await page.locator('#closePanel').click();await clip(page,0).locator('.zoom-in').click();await expect(clip(page,0).locator('.zoom-value')).toHaveText('1.25×');
  await clip(page,0).locator('.zoom-out').click();await expect(clip(page,0).locator('.zoom-out')).toBeDisabled();
  expect(errors).toEqual([]);
});
test('comparison keeps independent zoom while linked playback stays synchronized',async({page})=>{
  await page.goto('/');await load(page,0);await page.locator('#compareMode').click();await load(page,1);
  await clip(page,0).locator('.zoom-slider').fill('2');await clip(page,1).locator('.zoom-slider').fill('3');
  await page.locator('#play').click();await page.waitForTimeout(250);
  const times=await page.locator('video').evaluateAll(v=>v.map(x=>x.currentTime));expect(Math.abs(times[1]-times[0])).toBeLessThan(.09);
  expect(await page.locator('video').evaluateAll(v=>v.every(x=>!x.paused))).toBe(true);
  await expect(clip(page,0).locator('.zoom-value')).toHaveText('2.00×');await expect(clip(page,1).locator('.zoom-value')).toHaveText('3.00×');
  await (await settings(page,0,'.zoom-fit')).click();await expect(clip(page,1).locator('.zoom-value')).toHaveText('3.00×');
  await load(page,1);await expect(clip(page,1).locator('.zoom-value')).toHaveText('1.00×');
});
test('drawing coordinates, editing and mirrored overlays remain correct when zoomed',async({page})=>{
  await page.goto('/');await load(page,0);await clip(page,0).locator('.zoom-slider').fill('2');await pan(page,0,0,50);
  await (await settings(page,0,'.mirror')).click();await page.locator('[data-tool="line"]').click();
  const surface=clip(page,0).locator('.annotation-canvas');const stage=clip(page,0).locator('.stage');await stage.scrollIntoViewIfNeeded();const sb=await stage.boundingBox(),cb=await surface.boundingBox();
  const start={x:sb.x+sb.width*.45,y:sb.y+sb.height*.45},end={x:sb.x+sb.width*.55,y:sb.y+sb.height*.55};
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:6});await page.mouse.up();
  await expect(page.locator('#drawingCount')).toHaveText('1 drawing on A');
  let data=await exported(page);expect(data.viewport.zoom).toBe(2);expect(data.drawings[0].points[0].x).toBeCloseTo(1-(start.x-cb.x)/cb.width,3);expect(data.drawings[0].points[0].y).toBeCloseTo((start.y-cb.y)/cb.height,3);
  await page.locator('[data-tool="select"]').click();await stage.scrollIntoViewIfNeeded();const updated=await surface.boundingBox(),shape=data.drawings[0];
  const midpoint={x:updated.x+updated.width*(1-(shape.points[0].x+shape.points[1].x)/2),y:updated.y+updated.height*(shape.points[0].y+shape.points[1].y)/2};
  await page.mouse.click(midpoint.x,midpoint.y);await expect(page.locator('#drawingDelete')).toBeEnabled();
  await (await settings(page,0,'.zoom-fit')).click();const after=await exported(page);expect(after.drawings).toEqual(data.drawings);
  const boxes=await clip(page,0).locator('.video-plane > video, .pose-canvas, .annotation-canvas').evaluateAll(es=>es.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})));
  for(const b of boxes){expect(b.w).toBeCloseTo(boxes[0].w,0);expect(b.h).toBeCloseTo(boxes[0].h,0);expect(b.x).toBeCloseTo(boxes[0].x,0);expect(b.y).toBeCloseTo(boxes[0].y,0);}
});
test('touch pan and pinch preserve playback and zoom controls fit a phone',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();
  await page.goto('/');await load(page,0);await page.locator('#compareMode').click();await load(page,1);
  await clip(page,1).locator('.zoom-slider').fill('2');await clip(page,1).locator('.clip-play').click();
  const stage=clip(page,1).locator('.stage');await stage.scrollIntoViewIfNeeded();const b=await stage.boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:y-30,id:0},{x,y:y+30,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-45,id:0},{x,y:y+45,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  expect(Number(await clip(page,1).locator('.zoom-slider').inputValue())).toBeGreaterThan(2.5);
  expect(await clip(page,1).locator('video').evaluate(v=>v.paused)).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/swing-zoom-mobile.png',fullPage:true});await context.close();
});
test('zoomed image export includes the crop and controls do not hijack ordinary scroll',async({page})=>{
  await page.goto('/');await load(page,0,'landscape.mp4');await clip(page,0).locator('.zoom-slider').fill('2');await pan(page,0,60,40);
  const before=await transform(page,0);await page.mouse.wheel(0,100);expect(await transform(page,0)).toBe(before);
  const download=page.waitForEvent('download');await openPanel(page,'draw');await page.locator('#drawingSnapshot').click();const result=await download;await result.saveAs('/tmp/swing-zoom-export.png');
  const png=await fs.readFile(await result.path());expect(png.readUInt32BE(16)).toBe(720);
  await page.screenshot({path:'/tmp/swing-zoom-desktop.png',fullPage:true});
});
