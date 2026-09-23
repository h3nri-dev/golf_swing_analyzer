import {test,expect} from '@playwright/test';

const clip=(page,i=0)=>page.locator(`[data-slot="${i}"]`);
const report=(page,i=0)=>page.evaluate(async i=>(await import('/app.js')).reportData(i),i);
async function setup(page,compare=false){
  await page.route('**/vision_bundle.mjs',r=>r.fulfill({contentType:'text/javascript',body:`
    export const FilesetResolver={forVisionTasks:async()=>({})};
    export const PoseLandmarker={createFromOptions:async()=>{
      const run=[];(window.analysisRuns??=[]).push(run);
      return {close(){},detectForVideo(){
        run.push([...document.querySelectorAll('#videoGrid video')].map(v=>v.currentTime));
        if(window.failAnalysis)throw new Error('Test analysis failure');
        return {landmarks:[]};
      }};
    }};`}));
  await page.goto('/');await page.getByRole('button',{name:'No thanks',exact:true}).click();
  if(compare)await page.locator('#compareMode').click();
  for(const i of compare?[0,1]:[0]){
    await clip(page,i).locator('input[type=file]').setInputFiles(new URL('./fixtures/window-60s.mp4',import.meta.url).pathname);
    await expect(clip(page,i).locator('.clip-play')).toBeEnabled();
  }
  if(compare)await page.locator('#independent').click();
}
async function offsets(page,before,after){
  for(const [id,value] of [['analysisBefore',before],['analysisAfter',after]]){
    await page.locator(`#${id}`).fill(String(value));await page.locator(`#${id}`).press('Tab');
  }
}
async function analyze(page,button=page.locator('#analyze')){
  await button.click();await expect(page.locator('#cancel')).toBeVisible();
  await expect(page.locator('#cancel')).toBeHidden({timeout:25000});
  await expect(page.locator('#status')).toContainText('No clear pose');
}
async function scanned(page,i,range){
  expect((await report(page,i)).analyzedRange).toEqual(range);
  // Inspect actual video positions passed to inference, not just stored bounds.
  const times=await page.evaluate(i=>window.analysisRuns.at(-1).map(row=>row[i]),i);
  expect(times.length).toBeGreaterThan(1);expect(times.length).toBeLessThanOrEqual(240);
  expect(times[0]).toBeCloseTo(range[0],5);
  const interval=(range[1]-range[0])/times.length;
  for(const [n,time] of times.entries())expect(time).toBeCloseTo(range[0]+n*interval,5);
}

test('reanalyze holds the saved range despite seeking, settings and FPS changes; Full video selects a new range',async({page})=>{
  test.setTimeout(60000);await setup(page);
  await page.locator('#timeline').fill('20');await analyze(page);
  const saved=[19.7,23.2];await scanned(page,0,saved);
  await page.locator('#timeline').fill('22');await offsets(page,.1,.5);
  await clip(page).locator('.fps').selectOption('60');await clip(page).locator('.shot-fps').selectOption('120');
  await expect(page.locator('#analyze')).toHaveAttribute('title',/Reanalyze.*9\.850–11\.600/);
  await page.locator('#play').click();await expect.poll(()=>clip(page).locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(22);
  await analyze(page);await scanned(page,0,saved);
  expect(await clip(page).locator('video').evaluate(v=>v.paused)).toBe(true);
  const band=await page.locator('#commonPlayer .timeline-window').boundingBox(),rail=await page.locator('#commonPlayer .timeline-rail').boundingBox();
  expect(band.x).toBeCloseTo(rail.x,1);expect(band.width).toBeCloseTo(rail.width,1);
  // Switching scopes while paused immediately updates the action's explanation.
  await page.locator('#commonPlayer .timeline-full').click();await expect(page.locator('#analyze')).toHaveAttribute('title',/^Analyze ·/);
  await page.locator('#timeline').fill('20');await analyze(page);await scanned(page,0,[39.8,41]);
  await page.screenshot({path:'/tmp/reanalysis-single.png'});
});

test('individual and common Analyze use their own view even when the other controller has a different scope or clock',async({page})=>{
  test.setTimeout(60000);await setup(page,true);await offsets(page,.1,.5);
  const a=clip(page,0),b=clip(page,1),common=page.locator('#commonPlayer');
  await a.locator('.clip-timeline').fill('10');await analyze(page,a.locator('.clip-analyze'));await scanned(page,0,[9.9,10.5]);
  await b.locator('.clip-timeline').fill('30');await analyze(page,b.locator('.clip-analyze'));await scanned(page,1,[29.9,30.5]);
  const savedB=await report(page,1);
  // Common remains on B's analyzed clock. A's local Full video selects new A bounds.
  await a.locator('.timeline-full').click();await a.locator('.clip-timeline').fill('20');
  await expect(common.locator('.timeline-range')).toHaveAttribute('aria-pressed','true');
  await expect(a.locator('.clip-analyze')).toHaveAttribute('title',/^Analyze swing A/);
  await analyze(page,a.locator('.clip-analyze'));await scanned(page,0,[19.9,20.5]);
  expect((await report(page,1)).analyzedRange).toEqual(savedB.analyzedRange);
  // Local A remains in Analyzed range while the common controller uses Full video.
  await common.locator('.timeline-full').click();await a.locator('.clip-timeline').fill('20.4');
  await expect(a.locator('.clip-analyze')).toHaveAttribute('title',/^Reanalyze swing A/);
  await expect(page.locator('#analyze')).toHaveAttribute('title',/^Analyze swing A/);
  await analyze(page,a.locator('.clip-analyze'));await scanned(page,0,[19.9,20.5]);
  await common.locator('.timeline-full').click();await page.locator('#timeline').fill('25');
  await analyze(page);await scanned(page,0,[24.9,25.5]);
  // Common Analyzed range uses the selected target's own saved bounds, even
  // when local B is at another position and the common clock is still A.
  await b.locator('.timeline-full').click();await b.locator('.clip-timeline').fill('40');
  await expect(page.locator('#time')).toContainText('A ');
  await expect(page.locator('#analyze')).toHaveAttribute('title',/Reanalyze swing B.*29\.900–30\.500/);
  await expect(page.locator('#analyzedRangeNote')).toBeHidden();
  await analyze(page);await scanned(page,1,savedB.analyzedRange);
  expect((await report(page,0)).analyzedRange).toEqual([24.9,25.5]);
  await page.screenshot({path:'/tmp/reanalysis-compare.png'});
});

test('retimed saved ranges remain analyzable and failed or cancelled reanalysis preserves results',async({page})=>{
  test.setTimeout(60000);await setup(page);await clip(page).locator('.shot-fps').selectOption('240');
  await page.locator('#timeline').fill('1');await analyze(page);
  const saved=(await report(page)).analyzedRange;
  expect(saved[1]-saved[0]).toBeCloseTo(28,5);
  await clip(page).locator('.shot-fps').selectOption('same');
  await page.locator('#timeline').fill('25');await offsets(page,.1,.3);
  await expect(page.locator('#analyze')).toBeEnabled();await analyze(page);await scanned(page,0,saved);
  await page.getByRole('button',{name:'Set Impact here',exact:true}).click();
  const previous=await report(page);
  await page.locator('#analyze').click();await page.locator('#cancel').click();
  await expect(page.locator('#cancel')).toBeHidden({timeout:15000});
  await expect(page.locator('#status')).toContainText('cancelled');
  let current=await report(page);expect(current.analyzedRange).toEqual(saved);expect(current.keyMoments).toEqual(previous.keyMoments);
  await page.evaluate(()=>window.failAnalysis=true);await page.locator('#analyze').click();
  await expect(page.locator('#status')).toContainText('Analysis unavailable');await expect(page.locator('#cancel')).toBeHidden();
  current=await report(page);expect(current.analyzedRange).toEqual(saved);expect(current.marks).toEqual(previous.marks);expect(current.keyMoments).toEqual(previous.keyMoments);
});
