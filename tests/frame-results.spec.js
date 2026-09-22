import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const card=(p,i=0)=>p.locator(`[data-slot="${i}"]`);
const data=(p,i=0)=>p.evaluate(async i=>(await import('/app.js')).reportData(i),i);
async function setup(page,compare=false) {
 await page.route('**/vision_bundle.mjs',r=>r.fulfill({contentType:'text/javascript',body:`export const FilesetResolver={forVisionTasks:async()=>({})};export const PoseLandmarker={createFromOptions:async()=>({close(){},detectForVideo(canvas,t){
 const nodes=[[0,.72],[300,.72],[1300,.2],[1700,.74],[3400,.2],[4000,.2]];let i=1;while(i<nodes.length-1&&nodes[i][0]<t)i++;const a=nodes[i-1],b=nodes[i],y=a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]);
 const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
 for(const [j,x,v] of [[11,.38,.35],[12,.62,.35],[13,.25,.5],[14,.72,.48],[15,.4,y],[16,.6,y],[19,.43,y+.03],[20,.63,y+.03],[23,.43,.65],[24,.59,.65],[25,.4,.78],[26,.6,.78],[27,.38,.92],[28,.62,.92]])p[j]={x,y:v,visibility:1};return {landmarks:[p]};}})};`}));
 await page.goto('/');if(compare)await page.locator('#compareMode').click();
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
  expect(content).toContain('What to review');
 }
 for(const [i,clip] of before.entries())expect((await data(page,i)).keyMoments).toEqual(clip.keyMoments);
});
