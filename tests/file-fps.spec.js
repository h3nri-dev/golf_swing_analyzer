import { test, expect } from '@playwright/test';
const card = (page, i = 0) => page.locator(`[data-slot="${i}"]`);
const fixture = name => new URL(`./fixtures/${name}`, import.meta.url).pathname;
async function load(page, name, i = 0) {
  await card(page, i).locator('input[type=file]').setInputFiles(fixture(name));
  await expect(card(page, i).locator('video')).toBeVisible();
  await expect(card(page, i).locator('.fps')).toBeEnabled();
}

test('real MP4, MOV and WebM metadata sets standard, fractional and unusual FPS locally', async ({ page }) => {
  const network = [];
  page.on('request', request => network.push({ url: request.url(), method: request.method() }));
  await page.goto('/');
  for (const [name, fps] of [['timing-60.mp4', 60], ['fps-29.97.mov', 29.97], ['fps-48.webm', 48], ['fps-240.mp4', 240], ['timing-slow.mp4', 30]]) {
    await load(page, name);
    await expect(card(page).locator('.fps')).toHaveValue(String(fps));
    await expect(card(page).locator('.fps-status')).toHaveText('Auto-detected');
    await expect(card(page).locator('.shot-fps')).toHaveValue('same');
    const report = await page.evaluate(async () => (await import('/app.js')).reportData());
    expect(report.frameRate).toBe(fps); expect(report.recordingFrameRate).toBe(fps);
    await expect.poll(() => card(page).locator('video').evaluate(v => v.playbackRate)).toBe(1);
    await page.locator('#next').click();
    expect(await card(page).locator('video').evaluate(v => v.currentTime)).toBeCloseTo(1 / fps, 5);
  }
  expect(network.some(r => r.url.endsWith('/MediaInfoModule.wasm'))).toBe(true);
  expect(network.filter(r => !r.url.startsWith('http://127.0.0.1:8080/') && !r.url.startsWith('blob:'))).toEqual([]);
  expect(network.every(r => r.method === 'GET')).toBe(true);
});

test('variable-rate video shows its detected average and explains approximate stepping', async ({ page }) => {
  await page.goto('/'); await load(page, 'fps-variable.mp4');
  await expect(card(page).locator('.fps-status')).toHaveText('Variable FPS');
  const fps = Number(await card(page).locator('.fps').inputValue());
  expect(fps).toBeGreaterThan(40); expect(fps).toBeLessThan(50);
  await expect(card(page).locator('.fps')).toHaveAttribute('title', /average.*approximate/);
  await expect(card(page).locator('.shot-fps')).toHaveValue('same');
});

test('manual corrections remain in effect; replacement and removal reset detection per file', async ({ page }) => {
  await page.goto('/'); await load(page, 'fps-48.webm');
  await card(page).locator('.fps').selectOption('60');
  await expect(card(page).locator('.fps-status')).toHaveText('Manual FPS');
  await card(page).locator('.shot-fps').selectOption('120');
  await page.locator('#next').click();
  expect(await card(page).locator('video').evaluate(v => v.currentTime)).toBeCloseTo(1 / 60, 5);
  await expect(card(page).locator('.fps')).toHaveValue('60');
  await expect(card(page).locator('video')).toHaveJSProperty('playbackRate', 2);
  await load(page, 'timing-30.mp4');
  await expect(card(page).locator('.fps')).toHaveValue('30');
  await expect(card(page).locator('.fps option[value="48"]')).toHaveCount(0);
  await expect(card(page).locator('.shot-fps')).toHaveValue('same');
  await expect(card(page).locator('.fps-status')).toHaveText('Auto-detected');
  await card(page).locator('.remove').click();
  await expect(card(page).locator('.fps-status')).toBeHidden();
});

test('both players detect independently, and a replaced file cannot apply a late result', async ({ page }) => {
  await page.route('**/file-fps-worker.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    self.onmessage = ({data:file}) => setTimeout(() => self.postMessage({fps:file.name.includes('60')?60:30,variable:false,average:false}), file.name.includes('60')?1200:20);
  ` }));
  await page.goto('/'); await page.locator('#compareMode').click();
  await card(page).locator('input[type=file]').setInputFiles(fixture('timing-60.mp4'));
  await expect(card(page).locator('.fps-status')).toHaveText('Detecting FPS…');
  await expect(card(page).locator('.fps')).toBeDisabled();
  await card(page, 1).locator('input[type=file]').setInputFiles(fixture('timing-60.mp4'));
  await load(page, 'timing-30.mp4');
  await expect(card(page, 1).locator('.fps')).toHaveValue('60');
  await card(page).locator('.fps').selectOption('25');
  await page.waitForTimeout(1300);
  await expect(card(page).locator('.fps')).toHaveValue('25');
  await expect(card(page).locator('.fps-status')).toHaveText('Manual FPS');
  await expect(card(page, 1).locator('.fps-status')).toHaveText('Auto-detected');
});

test('metadata loader failure leaves playback usable and clearly requests manual FPS', async ({ page }) => {
  await page.route('**/MediaInfoModule.wasm', route => route.abort());
  await page.goto('/'); await load(page, 'timing-60.mp4');
  await expect(card(page).locator('.fps-status')).toHaveText('Choose File FPS');
  await expect(card(page).locator('.fps')).toHaveAttribute('title', /Could not detect.*30 temporarily/);
  await card(page).locator('.fps').selectOption('60');
  await expect(card(page).locator('.fps-status')).toHaveText('Manual FPS');
  await page.locator('#play').click();
  await expect(card(page).locator('video')).toHaveJSProperty('paused', false);
});

test('stalled metadata parsing times out and cancellation resolves without a result', async ({ page }) => {
  await page.route('**/file-fps-worker.js', route => route.fulfill({ contentType: 'text/javascript', body: 'self.onmessage=()=>{};' }));
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const { detectFileFrameRate } = await import('/file-fps.js');
    const file = new File(['not a video'], 'test.mp4');
    const timeout = await detectFileFrameRate(file, { timeout: 100 });
    const controller = new AbortController();
    const cancelled = detectFileFrameRate(file, { signal: controller.signal });
    controller.abort();
    return [timeout, await cancelled, await detectFileFrameRate(file, { signal: controller.signal })];
  });
  expect(results).toEqual([null, null, null]);
});
