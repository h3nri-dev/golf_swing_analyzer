import { test, expect } from '@playwright/test';
const card = (page, i) => page.locator(`[data-slot="${i}"]`);
const states = page => page.locator('#videoGrid video').evaluateAll(videos => videos.map(v => ({ time: v.currentTime, paused: v.paused, rate: v.playbackRate })));
const reports = page => page.evaluate(async () => { const { reportData } = await import('/app.js'); return [reportData(0), reportData(1)]; });
async function setup(page, files = ['timing-30.mp4', 'timing-60.mp4']) {
  await page.goto('/');
  const consent = page.getByRole('button', { name: 'No thanks', exact: true });
  if (await consent.isVisible()) await consent.click();
  await page.locator('#compareMode').click();
  for (const [i, file] of files.entries()) {
    await card(page, i).locator('input[type=file]').setInputFiles(new URL(`./fixtures/${file}`, import.meta.url).pathname);
    await expect(card(page, i).locator('video')).toBeVisible();
  }
}
async function mark(page, i, key, realTime) {
  await card(page, i).locator('.clip-timeline').fill(String(realTime));
  await page.locator(`.moment-cell[data-moment-slot="${i}"][data-moment="${key}"] .moment-mark`).click();
}

test('Sync on aligns first shared marker, retains edits/zoom and keeps different-FPS playback aligned', async ({ page }) => {
  await setup(page);
  // Mark a later moment first: insertion order and current playheads must not win.
  await mark(page, 0, 'impact', .8); await mark(page, 1, 'impact', 1.2);
  await mark(page, 0, 'address', 0); await mark(page, 1, 'address', .4);
  await card(page, 0).locator('.zoom-in').click();
  const zoom = await card(page, 0).locator('.zoom-value').textContent();
  const before = (await reports(page)).map(r => r.marks);
  await card(page, 0).locator('.clip-timeline').fill('1');
  await card(page, 1).locator('.clip-timeline').fill('1.5');
  await page.locator('#linked').click();
  expect((await states(page)).map(v => v.time)).toEqual([0, .4]);
  expect((await states(page)).every(v => v.paused)).toBe(true);
  await expect(page.locator('#syncHint')).toContainText('Aligned at Address');
  await expect(card(page, 0).locator('.zoom-value')).toHaveText(zoom);
  expect((await reports(page)).map(r => r.marks)).toEqual(before);
  await page.locator('#next').click();
  let s = await states(page); expect(s[0].time).toBeCloseTo(1 / 60, 5); expect(s[1].time).toBeCloseTo(.4 + 1 / 60, 5);
  await page.locator('#play').click(); await page.waitForTimeout(150);
  s = await states(page); expect(s.every(v => !v.paused)).toBe(true); expect(s[1].time - s[0].time).toBeCloseTo(.4, 1);
  await page.locator('#play').click();
  await page.screenshot({ path: '/tmp/sync-first-marker.png' });
});

test('first shared marker handles negative offsets and slow motion; Sync off does not seek', async ({ page }) => {
  await setup(page, ['timing-slow.mp4', 'timing-30.mp4']);
  await card(page, 0).locator('.shot-fps').selectOption('120');
  await mark(page, 0, 'address', .1); // Not shared: skip to Top.
  await mark(page, 0, 'top', .5); await mark(page, 1, 'top', .2);
  await page.locator('#linked').click();
  expect((await states(page)).map(v => v.time)).toEqual([2, .2]);
  expect((await states(page)).map(v => v.rate)).toEqual([4, 1]);
  await expect(page.locator('#syncHint')).toContainText('Top of backswing');
  await expect(page.locator('#syncHint')).toContainText('-0.30 real s');
  await page.locator('#next').click();
  const s = await states(page); expect(s[0].time).toBeCloseTo(2 + 1 / 30, 5); expect(s[1].time).toBeCloseTo(.2 + 1 / 120, 5);
  await page.locator('#independent').click(); expect(await states(page)).toEqual(s);
  await card(page, 1).locator('.fps').selectOption('60');
  await page.locator('#linked').click(); expect((await states(page)).map(v => v.time)).toEqual([2, .2]);
});

test('Sync Videos still aligns displayed frames and missing shared markers retain existing alignment', async ({ page }) => {
  await setup(page);
  await mark(page, 0, 'address', .1); await mark(page, 1, 'address', .5);
  await card(page, 0).locator('.clip-timeline').fill('0.7'); await card(page, 1).locator('.clip-timeline').fill('1.1');
  await page.locator('#align').click(); expect((await states(page)).map(v => v.time)).toEqual([.7, 1.1]);
  // Removing A's only marker leaves no shared pair. Keep the current sync offset.
  await page.locator('[data-edit-slot="0"]').click();
  await page.getByRole('button', { name: 'Reset Address moment', exact: true }).click();
  await page.getByRole('button', { name: 'Close moment editor', exact: true }).click();
  await card(page, 0).locator('.clip-timeline').fill('0.3');
  await page.locator('#linked').click();
  let s = await states(page); expect(s[0].time).toBeCloseTo(.3, 5); expect(s[1].time).toBeCloseTo(.7, 5);
  await expect(page.locator('#syncHint')).not.toContainText('at Address');
  await page.locator('#independent').click();
  await mark(page, 0, 'address', .2);
  await page.locator('#linked').click(); expect((await states(page)).map(v => v.time)).toEqual([.2, .5]);
  await page.locator('#timeline').fill('1');
  // An explicit click reapplies markers even if Sync on is already selected.
  await page.locator('#linked').click(); expect((await states(page)).map(v => v.time)).toEqual([.2, .5]);
});

test('automatic moments align on Sync on while sampled range previews do not', async ({ page }) => {
  await page.route('**/vision_bundle.mjs', r => r.fulfill({ contentType: 'text/javascript', body: `
    export const FilesetResolver={forVisionTasks:async()=>({})};
    export const PoseLandmarker={createFromOptions:async()=>({close(){},detectForVideo(canvas,t){
      const nodes=[[0,.72],[300,.72],[1300,.2],[1700,.74],[3400,.2],[4000,.2]];let i=1;
      while(i<nodes.length-1&&nodes[i][0]<t)i++;const a=nodes[i-1],b=nodes[i],y=a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]);
      const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
      p[11].y=p[12].y=.35;p[23].y=p[24].y=.65;p[15].y=p[16].y=y;
      return {landmarks:[p]};
    }})};
  ` }));
  await setup(page, ['portrait.mp4', 'portrait.mp4']);
  for (const i of [0, 1]) {
    await page.locator(`[data-select="${i}"]`).click(); await page.locator('#analyze').click();
    await expect(page.locator('#status')).toContainText('Analysis ready', { timeout: 20000 });
  }
  const expected = (await reports(page)).map(r => r.keyMoments.find(e => e.key === 'address' && e.source === 'estimated').time);
  await page.locator('#timeline').fill('2'); await expect(page.locator('#linked')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#linked').click();
  for (const [i, state] of (await states(page)).entries()) expect(state.time).toBeCloseTo(expected[i], 5);
  await expect(page.locator('#toast')).toContainText('first shared marker');
  await page.screenshot({ path: '/tmp/sync-automatic-marker.png' });
  // Untracked footage produces range previews, which are not phase markers.
  await page.route('**/vision_bundle.mjs', r => r.fulfill({ contentType: 'text/javascript', body: 'export const FilesetResolver={forVisionTasks:async()=>({})};export const PoseLandmarker={createFromOptions:async()=>({close(){},detectForVideo(){return {landmarks:[]}}})};' }));
  await setup(page, ['portrait.mp4', 'portrait.mp4']);
  for (const i of [0, 1]) {
    await page.locator(`[data-select="${i}"]`).click(); await page.locator('#analyze').click();
    await expect(page.locator('#status')).toContainText('No clear pose', { timeout: 20000 });
  }
  await page.locator('#independent').click(); await card(page, 1).locator('.clip-timeline').fill('1');
  await page.locator('#linked').click(); expect((await states(page)).map(v => v.time)).toEqual([1, 1]);
  await expect(page.locator('#syncHint')).not.toContainText('Aligned at');
});
