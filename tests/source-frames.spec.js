import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const card=(page,i=0)=>page.locator(`[data-slot="${i}"]`);
const time=(page,i=0)=>card(page,i).locator('video').evaluate(v=>v.currentTime);
async function load(page,file='timing-60.mp4',i=0){await card(page,i).locator('input[type=file]').setInputFiles(new URL(`./fixtures/${file}`,import.meta.url).pathname);await expect(card(page,i).locator('.clip-play')).toBeEnabled();}
async function data(page,i=0){return page.evaluate(async i=>(await import('/app.js')).reportData(i),i);}
async function decodedStep(page,selector,expected,i=0){
 await page.locator(selector).evaluate((button,{i,expected})=>button.addEventListener('click',()=>{const v=document.querySelector(`[data-slot="${i}"] video`);window.frameDelivered=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('No decoded frame at '+v.currentTime)),3000);const observed=(_,meta)=>{if(Math.abs(meta.mediaTime-expected)<.00001){clearTimeout(timer);resolve(meta.mediaTime);}else v.requestVideoFrameCallback(observed);};v.requestVideoFrameCallback(observed);});},{once:true,capture:true}),{i,expected});
 await page.locator(selector).click();return page.evaluate(()=>window.frameDelivered);
}

test('single steps and arrow keys use encoded frames despite FPS, speed and zoom changes',async({page})=>{
 await page.goto('/');await load(page);await page.locator('.zoom-slider').first().fill('2');
 let frame=0;
 for(const fps of ['24','240','30']){
  await card(page).locator('.fps').selectOption(fps);await card(page).locator('.shot-fps').selectOption('240');
  await page.locator('#speed').selectOption('0.25');
  for(let i=0;i<3;i++){frame++;const decoded=await decodedStep(page,'#next',frame/60);expect(decoded).toBeCloseTo(frame/60,5);expect(await time(page)).toBeCloseTo(frame/60,5);}
 }
 expect(await decodedStep(page,'#previous',--frame/60)).toBeCloseTo(frame/60,5);
 await page.locator('#timeline').focus();await page.keyboard.press('ArrowLeft');expect(await time(page)).toBeCloseTo(--frame/60,5);
 await expect(card(page).locator('.zoom-value')).toHaveText('2.00×');
 await page.getByRole('button',{name:'Set Impact here',exact:true}).click();expect((await data(page)).marks.impact).toBeCloseTo(frame/60,8);
 await page.locator('.key-card[data-key=impact] .key-card-title').click();const input=page.getByRole('spinbutton',{name:'Key moment frame',exact:true});await expect(input).toHaveValue(String(frame));
 await page.locator('.key-frame-next').first().click();expect((await data(page)).marks.impact).toBeCloseTo(++frame/60,8);
 await page.keyboard.press('Escape');const download=page.waitForEvent('download');await page.locator('#export').click();
 const pdf=await download,content=(await fs.readFile(await pdf.path())).toString('latin1');
 expect([...content.matchAll(/Frame (\d+)  \/ /g)].map(match=>Number(match[1]))).toContain(frame);
});

test('VFR and WebM use actual uneven presentation times, including reverse and endpoints',async({page})=>{
 await page.goto('/');await load(page,'fps-variable.mp4');await card(page).locator('.fps').selectOption('240');
 expect((await data(page)).exactFrameTimes).toBe(true);
 await page.locator('#timeline').fill('0.933');
 for(const expected of [28/30,29/30,1,61/60,62/60]){ // 0.933 is inside frame 27, before the 30→60 FPS transition.
  expect(await decodedStep(page,'#next',expected)).toBeCloseTo(expected,5);
 }
 expect(await decodedStep(page,'#previous',61/60)).toBeCloseTo(61/60,5);
 await page.locator('#timeline').fill('0');await page.locator('#previous').click();expect(await time(page)).toBe(0);
 await page.locator('#timeline').fill('2');await page.locator('#next').click();expect(await time(page)).toBeCloseTo(119/60,5);
 await load(page,'fps-48.webm');await card(page).locator('.fps').selectOption('30');
 for(const expected of [.021,.042,.063,.083])expect(await decodedStep(page,'#next',expected)).toBeCloseTo(expected,5);
});

test('independent frames stay local and common sync uses the smallest source-frame boundary',async({page})=>{
 await page.goto('/');await page.locator('#compareMode').click();await load(page,'timing-30.mp4');await load(page,'timing-60.mp4',1);
 await card(page,0).locator('.fps').selectOption('240');await card(page,1).locator('.fps').selectOption('24');
 await page.locator('#independent').click();const clock=await page.locator('#time').textContent();
 await card(page,1).locator('.clip-next').click();expect(await time(page,1)).toBeCloseTo(1/60,5);expect(await time(page,0)).toBe(0);await expect(page.locator('#time')).toHaveText(clock);
 await card(page,0).locator('.clip-next').click();expect(await time(page,0)).toBeCloseTo(1/30,5);
 await page.locator('#next').click();expect(await time(page,0)).toBeCloseTo(2/30,5);expect(await time(page,1)).toBeCloseTo(2/60,5);
 for(const i of [0,1])await card(page,i).locator('.clip-timeline').fill('0');await page.locator('#align').click();
 for(const expected of [1/60,2/60,3/60]){await page.locator('#next').click();expect(await time(page,0)).toBeCloseTo(expected,5);expect(await time(page,1)).toBeCloseTo(expected,5);}
 await page.locator('#previous').click();expect(await time(page,0)).toBeCloseTo(2/60,5);
 await card(page,1).locator('.shot-fps').selectOption('120');await page.locator('#restart').click();await page.locator('#next').click();
 expect(await time(page,0)).toBeCloseTo(1/300,5);expect(await time(page,1)).toBeCloseTo(1/60,5);
});

test('timestamp failures use immutable detected rate and cancelling an index cannot affect a replacement',async({page})=>{
 await page.route('**/source-frames-worker.js',r=>r.fulfill({contentType:'text/javascript',body:'self.onmessage=()=>self.postMessage(null);'}));
 await page.goto('/');await load(page);await card(page).locator('.fps').selectOption('24');
 await page.locator('#next').click();expect(await time(page)).toBeCloseTo(1/60,5);await expect(page.locator('#next')).toHaveAttribute('title',/approximate/);
 const result=await page.evaluate(async()=>{const {readSourceFrames}=await import('/source-frames.js');const controller=new AbortController();const pending=readSourceFrames(new File(['x'],'x.mp4'),{signal:controller.signal});controller.abort();return await pending;});expect(result).toBeNull();
 await load(page,'timing-30.mp4');await card(page).locator('.fps').selectOption('240');await page.locator('#next').click();expect(await time(page)).toBeCloseTo(1/30,5);
});

test('late frame indexes are discarded on replacement, and stalled parsing is cancellable and bounded',async({page})=>{
 await page.route('**/source-frames-worker.js',r=>r.fulfill({contentType:'text/javascript',body:`self.onmessage=({data:file})=>{if(file.name==='stalled.mp4')return;setTimeout(()=>{const fps=file.name.includes('60')?60:30,times=Float64Array.from({length:fps*2},(_,i)=>i/fps),seeks=times.slice();self.postMessage({times,seeks});},file.name.includes('60')?1200:20);};`}));
 await page.goto('/');await card(page).locator('input[type=file]').setInputFiles(new URL('./fixtures/timing-60.mp4',import.meta.url).pathname);
 await expect(card(page).locator('.clip-play')).toBeDisabled();await load(page,'timing-30.mp4');await card(page).locator('.fps').selectOption('240');await page.waitForTimeout(1300);
 await page.locator('#next').click();expect(await time(page)).toBeCloseTo(1/30,5);expect((await data(page)).currentFrame).toBe(1);
 const results=await page.evaluate(async()=>{const {readSourceFrames}=await import('/source-frames.js');const file=new File(['x'],'stalled.mp4'),controller=new AbortController();const cancelled=readSourceFrames(file,{signal:controller.signal});controller.abort();return [await cancelled,await readSourceFrames(file,{timeout:50}),await readSourceFrames(file,{signal:controller.signal})];});expect(results).toEqual([null,null,null]);
});
