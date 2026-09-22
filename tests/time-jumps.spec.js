import {test,expect} from '@playwright/test';
const card=(p,i=0)=>p.locator(`[data-slot="${i}"]`);
const states=p=>p.locator('.video-card video').evaluateAll(vs=>vs.map(v=>({time:v.currentTime,paused:v.paused,speed:v.playbackRate})));
const common=p=>p.evaluate(()=>['play','timeline','time','speed'].map(id=>{const e=document.getElementById(id);return [e.getAttribute('aria-label'),e.value,e.textContent];}));
async function load(p,i,file){await card(p,i).locator('input[type=file]').setInputFiles(new URL(`./fixtures/${file}`,import.meta.url).pathname);await expect(card(p,i).locator('video')).toBeVisible();}
async function setup(p,compare=false){await p.goto('/');await p.getByRole('button',{name:'No thanks',exact:true}).click();if(compare)await p.locator('#compareMode').click();await load(p,0,compare?'timing-30.mp4':'portrait.mp4');if(compare){await load(p,1,'timing-slow.mp4');await card(p,1).locator('.shot-fps').selectOption('120');}}
async function expectTimes(p,expected){const s=await states(p);expected.forEach((t,i)=>expect(s[i].time).toBeCloseTo(t,4));}

test('single-video second jumps clamp at boundaries and preserve playback and zoom',async({page})=>{
 await page.goto('/');await expect(page.locator('#backSecond')).toBeDisabled();await expect(page.locator('#forwardSecond')).toBeDisabled();
 await load(page,0,'portrait.mp4');await expect(page.locator('#backSecond')).toHaveAccessibleName('Back 1 second');
 await card(page).locator('.fps').selectOption('60');await page.locator('#timeline').fill('1.25');await card(page).locator('.zoom-slider').fill('1.5');
 await page.locator('#forwardSecond').click();await expectTimes(page,[2.25]);expect((await states(page))[0].paused).toBe(true);
 await page.locator('#backSecond').click();await expectTimes(page,[1.25]);
 await page.locator('#timeline').fill('0.2');await page.locator('#backSecond').click();await expectTimes(page,[0]);
 await page.locator('#timeline').fill('3.75');await page.locator('#forwardSecond').click();await expectTimes(page,[4]);
 await page.locator('#timeline').fill('1.5');await page.locator('#speed').selectOption('0.1');await page.locator('#play').click();
 for(const [id,delta] of [['forwardSecond',1],['backSecond',-1]]){
  const before=(await states(page))[0].time;await page.locator(`#${id}`).click();const after=(await states(page))[0];
  expect(after.time-before).toBeGreaterThan(delta-.02);expect(after.time-before).toBeLessThan(delta+.15);expect(after.paused).toBe(false);expect(after.speed).toBe(.1);
 }
 await expect(card(page).locator('.zoom-value')).toHaveText('1.50×');
});

test('shared second jumps preserve alignment across different FPS and slow motion, including overlap edges',async({page})=>{
 await setup(page,true);await card(page,0).locator('.clip-timeline').fill('0.3');await card(page,1).locator('.clip-timeline').fill('0.5');await page.locator('#align').click();
 await page.locator('#forwardSecond').click();await expectTimes(page,[1.3,6]);
 await page.locator('#backSecond').click();await expectTimes(page,[.3,2]);
 await page.locator('#backSecond').click();await expectTimes(page,[0,.8]);
 await page.locator('#forwardSecond').click();await page.locator('#forwardSecond').click();await expectTimes(page,[1.8,8]);
 await expect(page.locator('#linked')).toHaveAttribute('aria-pressed','true');
 expect((await states(page)).map(s=>s.speed)).toEqual([1,4]);
 // Ordinary 30/60 FPS footage still advances by one second in each file.
 await card(page,1).locator('.shot-fps').selectOption('same');await card(page,1).locator('.fps').selectOption('60');
 await card(page,0).locator('.clip-timeline').fill('0.2');await card(page,1).locator('.clip-timeline').fill('0.4');await page.locator('#align').click();
 await page.locator('#forwardSecond').click();await expectTimes(page,[1.2,1.4]);
});

test('individual jumps leave the other player and common controller alone; shared jumps work with sync off',async({page})=>{
 await setup(page,true);await page.locator('#speed').selectOption('0.25');await page.locator('#play').click();
 // An individual jump releases sync while leaving both videos playing.
 const a=(await states(page))[0].time;await card(page,0).locator('.clip-forward-second').click();
 let s=await states(page);expect(s[0].time-a).toBeGreaterThan(.98);expect(s[0].time-a).toBeLessThan(1.15);expect(s.every(v=>!v.paused)).toBe(true);
 await expect(page.locator('#independent')).toHaveAttribute('aria-pressed','true');
 await card(page,0).locator('.clip-play').click();const frozen=await common(page),beforeB=(await states(page))[1].time;
 await card(page,0).locator('.clip-back-second').click();s=await states(page);
 expect(s[0].paused).toBe(true);expect(s[1].paused).toBe(false);expect(s[1].time).toBeGreaterThanOrEqual(beforeB);expect(s[1].time-beforeB).toBeLessThan(.5);expect(await common(page)).toEqual(frozen);
 await card(page,1).locator('.clip-play').click();await card(page,0).locator('.clip-timeline').fill('0.1');await card(page,1).locator('.clip-timeline').fill('0.3');
 await card(page,1).locator('.clip-forward-second').click();await expectTimes(page,[.1,5.2]);expect(await common(page)).toEqual(frozen);
 await card(page,1).locator('.clip-back-second').click();await expectTimes(page,[.1,1.2]);
 await page.locator('#forwardSecond').click();await expectTimes(page,[1.1,5.2]);
 await page.locator('#backSecond').click();await expectTimes(page,[.1,1.2]);
 expect((await states(page)).every(v=>v.paused)).toBe(true);expect((await states(page)).map(v=>v.speed)).toEqual([.25,1]);
 await expect(page.locator('#independent')).toHaveAttribute('aria-pressed','true');
});

test('second jumps stay beside frame controls at desktop and phone sizes',async({page})=>{
 await setup(page,true);
 for(const [width,height] of [[2560,1440],[1440,900],[1280,720],[390,844],[320,740]]){
  await page.setViewportSize({width,height});
  for(const compare of [false,true]){
   await page.locator(compare?'#compareMode':'#singleMode').click();
   const groups=[page.locator('.play-buttons'),...(compare?[card(page,0).locator('.clip-frame-controls'),card(page,1).locator('.clip-frame-controls')]:[])];
   for(const group of groups){
    const back=group.locator('.time-jump').first(),forward=group.locator('.time-jump').last();await expect(back).toBeVisible();await expect(forward).toBeVisible();
    const b=await back.boundingBox(),f=await forward.boundingBox();expect(Math.abs(b.y-f.y),`${width}px ${compare?'compare':'single'} ${await group.getAttribute('class')}`).toBeLessThan(1);expect(f.x).toBeGreaterThan(b.x);expect(b.width).toBeGreaterThanOrEqual(40);
    expect(await group.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
   if(width>=901){const stage=await card(page).locator('.stage').boundingBox();expect(stage.height).toBeGreaterThan(100);const end=await page.locator('.screen-transport').boundingBox();expect(end.y+end.height).toBeLessThanOrEqual(height);}
   if(width===1280||width===390)await page.screenshot({path:`/tmp/second-jumps-${compare?'compare':'single'}-${width}.png`,fullPage:width<901});
  }
 }
});
