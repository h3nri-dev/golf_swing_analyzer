import {test,expect} from '@playwright/test';
const clip=(p,i=0)=>p.locator(`[data-slot="${i}"]`);
const report=p=>p.evaluate(async()=>(await import('/app.js')).reportData());
test('short-video windows clip safely at both edges and removal disables analysis',async({page})=>{
 await page.goto('/');await expect(page.locator('#analyze')).toBeDisabled();
 await clip(page).locator('input[type=file]').setInputFiles(new URL('./fixtures/portrait.mp4',import.meta.url).pathname);await expect(clip(page).locator('video')).toBeVisible();
 for(const [time,expected] of [['0',[0,2.5]],['2',[0,4]],['4',[1.5,4]]]){await page.locator('#timeline').fill(time);expect((await report(page)).selectedRange).toEqual(expected);await expect(page.locator('#analyze')).toBeEnabled();}
 await clip(page).locator('.remove').click();await expect(page.locator('#analyze')).toBeDisabled();
});
test('merged playback and analysis scrubber accepts touch dragging on a phone',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();await page.goto('/');
 await clip(page).locator('input[type=file]').setInputFiles(new URL('./fixtures/window-60s.mp4',import.meta.url).pathname);await expect(clip(page).locator('video')).toBeVisible();
 await page.locator('#timeline').scrollIntoViewIfNeeded();const b=await page.locator('#timeline').boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);
 const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+7,y:b.y+24,id:0}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width/2,y:b.y+24,id:0}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const at=await clip(page).locator('video').evaluate(v=>v.currentTime),range=(await report(page)).selectedRange;expect(at).toBeCloseTo(30,0);expect(range[0]).toBeCloseTo(at-2.5,3);expect(range[1]).toBeCloseTo(at+2.5,3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:'/tmp/merged-timeline-phone.png'});await context.close();
});
