import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const card=(p,i=0)=>p.locator(`[data-slot="${i}"]`);
const data=(p,i=0)=>p.evaluate(async i=>(await import('/app.js')).reportData(i),i);
async function setup(page,compare=false) {
 await page.route('**/vision_bundle.mjs',r=>r.fulfill({contentType:'text/javascript',body:`export const FilesetResolver={forVisionTasks:async()=>({})};export const PoseLandmarker={createFromOptions:async()=>({close(){},detectForVideo(canvas,t){
 const nodes=[[0,.72],[300,.72],[1300,.2],[1700,.74],[3400,.2],[4000,.2]];let i=1;while(i<nodes.length-1&&nodes[i][0]<t)i++;const a=nodes[i-1],b=nodes[i],y=a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]);
 const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
 for(const [j,x,v] of [[11,.38,.35],[12,.62,.35],[13,.25,.5],[14,.72,.48],[15,.4,y],[16,.6,y],[19,.43,y+.03],[20,.63,y+.03],[23,.43,.65],[24,.59,.65],[25,.4,.78],[26,.6,.78],[27,.38,.92],[28,.62,.92]])p[j]={x,y:v,visibility:1};return {landmarks:[p]};}})};`}));
 await page.goto('/');
 // Complete the first-visit privacy choice before measuring the review workspace.
 await page.getByRole('button',{name:'No thanks',exact:true}).click();
 if(compare)await page.locator('#compareMode').click();
 for(const i of compare?[0,1]:[0]){await card(page,i).locator('input[type=file]').setInputFiles(new URL(`./fixtures/${i?'landscape':'portrait'}.mp4`,import.meta.url).pathname);await expect(card(page,i).locator('video')).toBeVisible();}
}
async function analyze(page,i=0){if(await page.locator(`[data-select="${i}"]`).isVisible())await page.locator(`[data-select="${i}"]`).click();await page.locator('#analyze').click();await expect(page.locator('#status')).toContainText('Analysis ready',{timeout:20000});}
const angle=v=>Number.isFinite(v)?`${Math.round(v)}°`:'—';
async function checkCards(page,index=0){
 const report=await data(page,index);
 for(const frame of report.keyMoments){
  for(const {key} of frame.analysis.highlights) {
   const result=page.locator(`.key-card[data-key="${frame.key}"] [data-result-slot="${index}"][data-result-metric="${key}"]`);
   // Paired range previews share the named phase's measurement columns.
   if(await result.count()){await expect(result).toBeVisible();await expect(result).toHaveText(angle(frame.analysis.measurements[key]));}
  }
 }
}
async function exportPdf(page,path){const download=page.waitForEvent('download');await page.locator('#export').click();const result=await download;await result.saveAs(path);await expect(page.locator('#reportDialog')).toBeHidden();return(await fs.readFile(await result.path())).toString('latin1');}
function pageContents(pdf){return [...pdf.matchAll(/\/Type \/Page\b[\s\S]*?\/Contents (\d+) 0 R/g)].map(([,id])=>{const start=pdf.indexOf(`\n${id} 0 obj\n`),stream=pdf.indexOf('stream\n',start)+7;return pdf.slice(stream,pdf.indexOf('endstream',stream));});}
const text=content=>[...content.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map(([,s])=>s.replace(/\\([()\\])/g,'$1')).join(' ');

test('each keyframe shows results immediately; edits, handedness and PDF use the same frame analysis',async({page})=>{
 await setup(page);await analyze(page);await expect(page.locator('.key-notes')).toHaveCount(0);await checkCards(page);
 const original=await data(page);expect(original.keyMoments.every(e=>e.source==='estimated')).toBe(true);
 await page.getByRole('button',{name:'Full Impact analysis',exact:true}).click();
 const panel=page.locator('[data-review-slot="0"]');await expect(panel.locator('[data-frame-metric]')).toHaveCount(8);await expect(panel.locator('.key-phase-guide')).toContainText('ball contact');
 await expect(panel.locator('.key-feedback-practice')).toContainText('Try next:');
 await expect(panel.locator('.key-feedback-check')).toContainText('Check actual contact');
 const frame=page.getByRole('spinbutton',{name:'Key moment frame',exact:true});await frame.fill('20');await frame.press('Tab');
 const edited=(await data(page)).keyMoments.find(e=>e.key==='impact');await expect(panel.locator('[data-frame-metric=elbow] td').first()).toHaveText(angle(edited.analysis.measurements.elbow));
 await page.screenshot({path:'/tmp/frame-results-detail.png'});await page.keyboard.press('Escape');await checkCards(page);
 const preview=page.locator('.key-card[data-key=address] canvas').first(),paint=await preview.getAttribute('data-paint');
 await page.locator('#hand').selectOption('left');await checkCards(page);await expect(preview).not.toHaveAttribute('data-paint',paint);
 const before=await data(page);const pdf=await exportPdf(page,'/tmp/frame-results-single.pdf');const pages=pageContents(pdf);expect(pages).toHaveLength(8);
 for(const [i,moment] of before.keyMoments.entries()){
  expect(text(pages[i+1])).toContain('vs address');expect(text(pages[i+1])).toContain(moment.analysis.guide);
  for(const observation of moment.analysis.observations)expect(text(pages[i+1])).toContain(observation);
  for(const {key} of moment.analysis.highlights)expect(pages[i+1]).toContain(moment.analysis.measurements[key].toFixed(1));
 }
 expect((await data(page)).keyMoments).toEqual(before.keyMoments);
});

test('single and paired results stay readable beside the videos across screen sizes and in PDF',async({page})=>{
 await setup(page,true);await analyze(page,0);await analyze(page,1);
 for(const [width,height] of [[2560,1440],[1440,900],[1280,720],[390,844]]){
  await page.setViewportSize({width,height});
  for(const compare of [false,true]){
   await page.locator(compare?'#compareMode':'#singleMode').click();await checkCards(page);if(compare)await checkCards(page,1);
   await page.screenshot({path:`/tmp/frame-results-${compare?'compare':'single'}-${width}.png`,fullPage:width<901});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
   if(width>900){
    const stage=await card(page).locator('.stage').boundingBox();expect(stage.height,`${width}x${height} ${compare?'compare':'single'}`).toBeGreaterThan(width===1280?100:130);
    for(const result of await page.locator('.key-frame-results').all())expect(await result.evaluate(e=>e.scrollHeight<=e.clientHeight+1)).toBe(true);
    const strip=await page.locator('#keyMomentStrip').boundingBox();expect(strip.y+strip.height).toBeLessThanOrEqual(height);
   }
   await page.screenshot({path:`/tmp/frame-results-${compare?'compare':'single'}-${width}.png`,fullPage:width<901});
  }
 }
 await page.setViewportSize({width:1440,height:1100});const before=[await data(page),await data(page,1)];
 const pdf=await exportPdf(page,'/tmp/frame-results-compare.pdf'),pages=pageContents(pdf);expect(pages).toHaveLength(16);
 for(const [i,clip] of before.entries())for(const [j,frame] of clip.keyMoments.entries()){
  const content=pages[i*8+j+1];expect(content).toContain(`(Swing ${i?'B':'A'} / ${frame.label})`);expect(content).toContain('vs address');
  if(frame.analysis.guide)expect(text(content)).toContain(frame.analysis.guide);
  for(const observation of frame.analysis.observations)expect(text(content)).toContain(observation);
  expect(content).toContain('Coaching suggestions');
 }
 for(const [i,clip] of before.entries())expect((await data(page,i)).keyMoments).toEqual(clip.keyMoments);
});

test('inline analysis toggles beside Set, stays frame-specific and leaves playback alone',async({page})=>{
 await setup(page,true);await analyze(page,0);await analyze(page,1);
 const moment=page.locator('.key-card[data-key=impact]');
 const toggleA=moment.locator('[data-moment-slot="0"] .moment-analysis-toggle'),toggleB=moment.locator('[data-moment-slot="1"] .moment-analysis-toggle');
 const reportA=page.locator('#frame-analysis-0-impact'),reportB=page.locator('#frame-analysis-1-impact');
 const before=await data(page);const common=await page.locator('#play').textContent();
 const positions=await page.locator('.video-card video').evaluateAll(v=>v.map(v=>v.currentTime));
 await expect(reportA).toBeHidden();await expect(toggleA).toHaveAttribute('aria-expanded','false');
 for(const index of [0,1]){
  const actions=moment.locator(`[data-moment-slot="${index}"] .moment-actions`),set=await actions.locator('.moment-mark').boundingBox(),toggle=await actions.locator('.moment-analysis-toggle').boundingBox();
  expect(Math.abs(set.y-toggle.y)).toBeLessThan(1);expect(toggle.x-(set.x+set.width)).toBeLessThan(2);
 }
 await toggleA.click();await expect(reportA).toBeVisible();await expect(reportB).toBeHidden();await expect(toggleA).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('#keyMomentDialog')).toBeHidden();
 const impact=before.keyMoments.find(e=>e.key==='impact');
 await expect(reportA.locator('[data-frame-metric]')).toHaveCount(8);
 for(const [key,value] of Object.entries(impact.analysis.measurements))await expect(reportA.locator(`[data-frame-metric="${key}"] td`).first()).toHaveText(angle(value));
 await expect(reportA.locator('.key-phase-guide')).toHaveText(impact.analysis.guide);
 for(const note of impact.analysis.observations)await expect(reportA).toContainText(note);
 const advice=await reportA.locator('.key-coaching').boundingBox(),numbers=await reportA.locator('.key-detail-metrics').boundingBox();
 expect(advice.y+advice.height).toBeLessThan(numbers.y);
 await expect(reportA.locator('.key-feedback-practice')).toContainText(impact.analysis.coaching.practice);
 await toggleB.click();await expect(reportB).toBeVisible();await expect(reportA).toBeVisible();
 await toggleA.click();await expect(reportA).toBeHidden();await expect(reportB).toBeVisible();
 await toggleA.click();await page.locator('#hand').selectOption('left');
 const changed=await data(page);for(const [key,value] of Object.entries(changed.keyMoments.find(e=>e.key==='impact').analysis.measurements))await expect(reportA.locator(`[data-frame-metric="${key}"] td`).first()).toHaveText(angle(value));
 expect(positions).toHaveLength(2);
 const marks=report=>report.keyMoments.map(({key,time,source})=>({key,time,source}));
 expect(marks(await data(page))).toEqual(marks(before));
 expect(await page.locator('.video-card video').evaluateAll(v=>v.map(v=>v.currentTime))).toEqual(positions);
 await expect(page.locator('#play')).toHaveText(common);
 await page.locator('#singleMode').click();await expect(reportB).toBeHidden();await expect(reportA).toBeVisible();await expect(toggleA).toHaveAccessibleName('Analysis for Impact');
 const singlePlay=await page.locator('#play').textContent();
 await reportA.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');
 expect(await page.locator('.video-card video').evaluateAll(v=>v.map(v=>v.currentTime))).toEqual(positions);
 await expect(page.locator('#play')).toHaveText(singlePlay);
 await page.keyboard.press('Escape');await expect(reportA).toBeHidden();await expect(toggleA).toBeFocused();await expect(page.locator('#keyMomentStrip')).not.toHaveClass(/has-inline-analysis/);
});

test('expanded inline reports preserve video space and reachable toggles on desktop and phone',async({page})=>{
 await setup(page,true);await analyze(page,0);await analyze(page,1);
 for(const [width,height] of [[2560,1440],[1440,900],[1280,720],[390,844]]){
  await page.setViewportSize({width,height});
  for(const compare of [false,true]){
   await page.locator(compare?'#compareMode':'#singleMode').click();
   const moment=page.locator('.key-card[data-key=impact]'),toggle=moment.locator('[data-moment-slot="0"] .moment-analysis-toggle');
   const stageBefore=await card(page).locator('.stage').boundingBox();
   await toggle.click();if(compare)await moment.locator('[data-moment-slot="1"] .moment-analysis-toggle').click();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
   if(width>900){
    const stageAfter=await card(page).locator('.stage').boundingBox();expect(Math.abs(stageAfter.height-stageBefore.height)).toBeLessThan(2);
    const button=await toggle.boundingBox();expect(button.y).toBeGreaterThanOrEqual(0);expect(button.y+button.height).toBeLessThan(height);
    const report=page.locator('#frame-analysis-0-impact');expect(await report.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
   }
   await page.screenshot({path:`/tmp/inline-analysis-${compare?'compare':'single'}-${width}.png`,fullPage:width<901});
   if(compare)await moment.locator('[data-moment-slot="1"] .moment-analysis-toggle').click();await toggle.click();
  }
 }
});

test('open reports adapt to mode and size changes, refresh after analysis and explain missing tracking',async({page})=>{
 await setup(page,true);await analyze(page,0);
 const moment=page.locator('.key-card[data-key=impact]'),toggle=moment.locator('[data-moment-slot="0"] .moment-analysis-toggle'),report=page.locator('#frame-analysis-0-impact');
 await moment.locator('[data-moment-slot="1"] .moment-mark').click();await moment.locator('[data-moment-slot="1"] .moment-analysis-toggle').click();
 await expect(page.locator('#frame-analysis-1-impact')).toContainText('Analyze this video to get feedback');
 await expect(page.locator('#frame-analysis-1-impact .key-phase-guide')).toBeHidden();
 await toggle.click();
 for(const [width,height,mode] of [[1280,720,'single'],[1440,900,'compare'],[390,844,'single'],[1280,720,'compare']]){
  await page.setViewportSize({width,height});await page.locator(`#${mode}Mode`).click();await expect(report).toBeVisible();
  if(width>900){
   await expect.poll(async()=>{const b=await toggle.boundingBox(),s=await card(page).locator('.stage').boundingBox();return b.y+b.height<height&&s.height>100;},{message:`Expanded report fits ${mode} at ${width}x${height}`}).toBe(true);
   const g=await page.locator('#keyMomentStrip').boundingBox();expect(g.y+g.height).toBeLessThanOrEqual(height);
  }
 }
 await moment.locator('[data-moment-slot="0"] .moment-mark').click();expect((await data(page)).keyMoments.find(e=>e.key==='impact').source).toBe('marked');
 await analyze(page,0);await expect(report).toBeVisible();const renewed=(await data(page)).keyMoments.find(e=>e.key==='impact');expect(renewed.source).toBe('estimated');
 for(const [key,value] of Object.entries(renewed.analysis.measurements))await expect(report.locator(`[data-frame-metric="${key}"] td`).first()).toHaveText(angle(value));
 expect((await data(page,1)).keyMoments.find(e=>e.key==='impact').source).toBe('marked');
});
