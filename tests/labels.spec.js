import {test, expect} from '@playwright/test';

const card=(page,i)=>page.locator(`[data-slot="${i}"]`);
const fixture=new URL('./fixtures/portrait.mp4',import.meta.url).pathname;
async function load(page,i) {
  await card(page,i).locator('input[type=file]').setInputFiles(fixture);
  await expect(card(page,i).locator('video')).toBeVisible();
}
async function expectSingleLabels(page) {
  const labels=await page.locator('body :visible').evaluateAll(elements=>elements.flatMap(e=>[
    ...['aria-label','title'].map(a=>e.getAttribute(a)||''),
    ...[...e.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent),
  ]));
  expect(labels.filter(text=>/\b(?:swing|play|pause|set|edit|on)\s+[AB]\b|\b[AB]\s*·/i.test(text))).toEqual([]);
  await expect(page.locator('.drawing-target')).toBeHidden();
  await expect(card(page,0).locator('.slot-badge')).toBeHidden();
}

for(const [width,height] of [[1440,900],[390,844]]) test(`single-video labels stay clear through marking and mode changes at ${width}px`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width,height});await page.goto('/');await expectSingleLabels(page);
  await load(page,0);await card(page,0).locator('.fps').selectOption('60');await card(page,0).locator('.shot-fps').selectOption('120');
  await card(page,0).locator('.zoom-slider').fill('1.5');await page.locator('#timeline').fill('0.4');
  await page.getByRole('button',{name:'Set Impact here',exact:true}).click();
  await expect(page.locator('.key-card[data-key=impact] .key-slot-badge').first()).toHaveText('Your mark');
  await page.getByRole('button',{name:'Edit frames',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Swing moments',exact:true})).toBeVisible();
  await expectSingleLabels(page);
  const frame=page.getByRole('spinbutton',{name:'Impact frame',exact:true});await frame.fill('54');await frame.press('Tab');await page.keyboard.press('Escape');
  await page.locator('.key-card[data-key=impact] .key-card-title').click();
  await expect(page.getByRole('spinbutton',{name:'Key moment frame',exact:true})).toHaveValue('54');
  await expectSingleLabels(page);await page.keyboard.press('Escape');
  await card(page,0).locator('.remove').click();await expect(page.getByRole('dialog',{name:'Remove video?',exact:true})).toBeVisible();
  await expectSingleLabels(page);await page.locator('#discardCancel').click();
  await page.locator('#play').click();await expect(page.locator('#play .play-word')).toHaveText('Pause');
  await expectSingleLabels(page);await page.locator('#play').click();await expect(page.locator('#play .play-word')).toHaveText('Play');
  await page.locator('#studio').scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/single-labels-${width}.png`,fullPage:width<900});
  const before=await page.evaluate(async()=>(await import('/app.js')).reportData(0));
  await page.locator('#compareMode').click();await load(page,1);await page.locator('#independent').click();
  for(const i of [0,1]) {
    const name=i?'B':'A';
    await expect(card(page,i).locator('.slot-badge')).toHaveText(name);
    await expect(card(page,i).locator('.clip-play')).toHaveText(`▶ Play ${name}`);
    await expect(page.locator(`[data-edit-slot="${i}"]`)).toHaveText(`Edit ${name}`);
    await expect(page.getByRole('button',{name:`Set Impact here in swing ${name}`,exact:true})).toBeVisible();
  }
  await expect(page.locator('#play .play-word')).toHaveText('Play both');
  await card(page,1).locator('.clip-timeline').fill('1.25');
  await page.getByRole('button',{name:'Set Top of backswing here in swing B',exact:true}).click();
  const reference=await page.evaluate(async()=>(await import('/app.js')).reportData(1));
  await page.locator('#singleMode').click();await expectSingleLabels(page);
  const after=await page.evaluate(async()=>(await import('/app.js')).reportData(0));
  for(const key of ['marks','frameRate','recordingFrameRate','viewport'])expect(after[key]).toEqual(before[key]);
  await expect(page.locator('[data-edit-slot="0"]')).toHaveText('Edit frames');
  await page.locator('#compareMode').click();
  expect((await page.evaluate(async()=>(await import('/app.js')).reportData(1))).marks).toEqual(reference.marks);
  await expect(card(page,1).locator('.clip-play')).toHaveAttribute('aria-label','Play swing B');expect(errors).toEqual([]);
});
