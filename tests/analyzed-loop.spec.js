import {test,expect} from '@playwright/test';
const clip=(p,i=0)=>p.locator(`[data-slot="${i}"]`);
const data=(p,i=0)=>p.evaluate(async i=>(await import('/app.js')).reportData(i),i);
async function load(page,i=0,file='window-60s.mp4'){
 await clip(page,i).locator('input[type=file]').setInputFiles(new URL(`./fixtures/${file}`,import.meta.url).pathname);
 await expect(clip(page,i).locator('.clip-play')).toBeEnabled();
}
async function settings(page,before,after){
 for(const [id,value] of [['analysisBefore',before],['analysisAfter',after]]){const input=page.locator(`#${id}`);await input.fill(String(value));await input.press('Tab');}
}
async function setup(page,compare=false){
 await page.route('**/vision_bundle.mjs',r=>r.fulfill({contentType:'text/javascript',body:'export const FilesetResolver={forVisionTasks:async()=>({})};export const PoseLandmarker={createFromOptions:async()=>({close(){},detectForVideo(){return {landmarks:[]}}})};'}));
 await page.goto('/');await page.getByRole('button',{name:'No thanks',exact:true}).click();
 if(compare)await page.locator('#compareMode').click();
 await load(page);if(compare){await load(page,1);await page.locator('#independent').click();}
}
async function analyze(page,i,time){
 const local=await page.locator('#compareMode').getAttribute('aria-pressed')==='true';
 await (local?clip(page,i).locator('.clip-timeline'):page.locator('#timeline')).fill(String(time));
 await (local?clip(page,i).locator('.clip-analyze'):page.locator('#analyze')).click();
 await expect(page.locator('#status')).toContainText('No clear pose',{timeout:20000});await expect(page.locator('#analyze')).toBeEnabled();
}
async function trace(page,milliseconds){
 return page.evaluate(ms=>new Promise(resolve=>{
  const end=performance.now()+ms,frames=[];
  function tick(){const videos=[...document.querySelectorAll('#videoGrid video')];if(videos.every(v=>!v.seeking))frames.push(videos.map(v=>v.currentTime));if(performance.now()<end)requestAnimationFrame(tick);else resolve(frames);}
  requestAnimationFrame(tick);
 }),milliseconds);
}
function expectLoops(frames,index,start,end){
 const times=frames.map(f=>f[index]);expect(times.length).toBeGreaterThan(10);
 expect(Math.min(...times)).toBeGreaterThanOrEqual(start-.04);expect(Math.max(...times)).toBeLessThanOrEqual(end+.04);
 expect(times.some((t,i)=>i&&t<times[i-1]-.2)).toBe(true);
}

test('asymmetric adjustments are beside the timeline, apply in real time and survive reload',async({page})=>{
 await setup(page);await expect(page.locator('#analysisBefore')).toHaveValue('0.3');await expect(page.locator('#analysisAfter')).toHaveValue('3.2');
 await page.locator('#timeline').fill('30');expect((await data(page)).selectedRange).toEqual([29.7,33.2]);
 await settings(page,1.2,4.8);expect((await data(page)).selectedRange).toEqual([28.8,34.8]);
 expect(await page.locator('#commonPlayer .timeline-rail').getAttribute('data-start')).toBe('28.8');
 expect(await clip(page).locator('video').evaluate(v=>v.currentTime)).toBe(30);
 await page.reload();await expect(page.locator('#analysisBefore')).toHaveValue('1.2');await expect(page.locator('#analysisAfter')).toHaveValue('4.8');
 await load(page);await page.locator('#timeline').fill('30');await clip(page).locator('.shot-fps').selectOption('120');
 expect((await data(page)).selectedRange).toEqual([25.2,49.2]);
 const input=page.locator('#analysisBefore');await input.fill('19');await input.press('Tab');await expect(input).toHaveValue('1.2');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('golf_analysis_window')))).toEqual({before:1.2,after:4.8});
 await page.screenshot({path:'/tmp/analysis-window-settings.png'});
});

test('analyzed-range playback loops its fixed bounds and Full video resumes normal playback',async({page})=>{
 await setup(page);await settings(page,.1,.4);await analyze(page,0,20);
 const saved=(await data(page)).analyzedRange;expect(saved).toEqual([19.9,20.4]);
 await expect(page.locator('#loopRange')).toHaveText('Looping range');
 await clip(page).locator('video').evaluate(v=>v.currentTime=30);await page.locator('#play').click();
 const frames=await trace(page,1300);expectLoops(frames,0,...saved);
 await settings(page,.2,.8);expect(await clip(page).locator('video').evaluate(v=>v.paused)).toBe(false);
 expectLoops(await trace(page,700),0,...saved);
 await page.locator('#play').click();expect((await data(page)).analyzedRange).toEqual(saved);
 await page.locator('#restart').click();expect(await clip(page).locator('video').evaluate(v=>v.currentTime)).toBe(saved[0]);
 await page.locator('#commonPlayer .timeline-full').click();await page.locator('#timeline').fill('20.3');await page.locator('#play').click();
 await expect.poll(()=>clip(page).locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(20.5);await page.locator('#play').click();
 await page.locator('#commonPlayer .timeline-range').click();await settings(page,.2,.8);
 expect((await data(page)).analyzedRange).toEqual(saved);await expect(page.locator('#timeline')).toHaveAttribute('min','19.9');
 await page.locator('#loopRange').click();await expect(page.locator('#commonPlayer .timeline-full')).toHaveAttribute('aria-pressed','true');
});

test('local and common unsynced playback loop each video independently without sharing controller state',async({page})=>{
 await setup(page,true);await settings(page,.1,.4);await analyze(page,0,20);await analyze(page,1,40);
 const saved=await page.locator('#commonPlayer .timeline-rail').evaluate(e=>({...e.dataset}));
 await clip(page,0).locator('.clip-play').click();expectLoops(await trace(page,1150),0,19.9,20.4);
 expect(await clip(page,1).locator('video').evaluate(v=>v.paused)).toBe(true);
 expect(await page.locator('#commonPlayer .timeline-rail').evaluate(e=>({...e.dataset}))).toEqual(saved);
 await clip(page,0).locator('.clip-play').click();await page.locator('#play').click();
 let frames=await trace(page,1150);expectLoops(frames,0,19.9,20.4);expectLoops(frames,1,39.9,40.4);
 await page.locator('#play').click();
 await clip(page,0).locator('.timeline-full').click();await clip(page,0).locator('.clip-timeline').fill('20.3');await clip(page,0).locator('.clip-play').click();
 await expect.poll(()=>clip(page,0).locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(20.5);
 await expect(clip(page,1).locator('.timeline-range')).toHaveAttribute('aria-pressed','true');
});

test('linked loops preserve FPS and slow-motion alignment, and disjoint ranges cannot start playback',async({page})=>{
 await setup(page,true);await settings(page,.1,.4);await clip(page,1).locator('.shot-fps').selectOption('120');
 await analyze(page,0,5);await analyze(page,1,7);await page.locator('#align').click();
 await page.locator('#play').click();const frames=await trace(page,1300);
 expectLoops(frames,0,4.9,5.4);expectLoops(frames,1,27.6,29.6);
 for(const frame of frames)expect(Math.abs(frame[1]/4-frame[0]-2)).toBeLessThan(.09);
 await page.locator('#play').click();await page.locator('#independent').click();
 await clip(page,0).locator('.timeline-full').click();await analyze(page,0,12);
 await page.locator('#linked').click();await page.locator('#play').click();
 await expect(page.locator('#toast')).toContainText('do not overlap');
 for(const i of [0,1])expect(await clip(page,i).locator('video').evaluate(v=>v.paused)).toBe(true);
});

test('a range ending at the actual file end loops and storage failure leaves adjustment usable',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new Error('Blocked storage');};});
 await setup(page);await load(page,0,'portrait.mp4');await settings(page,4,4);await analyze(page,0,2);
 expect((await data(page)).analyzedRange).toEqual([0,4]);await expect(page.locator('#commonPlayer .timeline-range')).toHaveAttribute('aria-pressed','true');
 await page.locator('#timeline').fill('3.94');await page.locator('#play').click();
 await expect.poll(()=>clip(page).locator('video').evaluate(v=>v.currentTime)).toBeLessThan(.5);
 expect(await clip(page).locator('video').evaluate(v=>v.paused)).toBe(false);
 await page.locator('#play').click();await settings(page,.2,.5);await expect(page.locator('#toast')).toContainText('session');
 await page.reload();await expect(page.locator('#analysisBefore')).toHaveValue('0.3');
});
