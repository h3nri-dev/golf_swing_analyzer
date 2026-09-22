import { test, expect } from '@playwright/test';

const key = 'golf_cookie_consent';
const id = 'G-MG3PW4FRFM';
const fixture = new URL('./fixtures/portrait.mp4', import.meta.url).pathname;
const tagURL = '**/www.googletagmanager.com/gtag/js*';

async function stubAnalytics(page) {
  const requests = [];
  await page.route(tagURL, async route => {
    requests.push(route.request().url());
    await route.fulfill({ contentType: 'application/javascript', body: 'window.__analyticsTagLoaded = true;' });
  });
  return requests;
}

async function commands(page) {
  return page.evaluate(() => window.dataLayer.map(command => Array.from(command)));
}

async function settingsFromStudio(page) {
  await page.locator('#workspaceHelp').click();
  await page.locator('#helpDialog [data-cookie-settings]').click();
  await expect(page.locator('#cookieDialog')).toBeVisible();
  await expect(page.locator('#helpDialog')).not.toBeVisible();
}

test('fresh visitors and declined choices make no Google requests; video tools still work', async ({ page }) => {
  const requests = await stubAnalytics(page);
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Optional analytics' })).toBeVisible();
  await page.locator('input[type=file]').first().setInputFiles(fixture);
  await expect(page.locator('video').first()).toBeVisible();
  await page.waitForTimeout(200);
  expect(requests).toEqual([]);
  expect(await page.evaluate(id => window[`ga-disable-${id}`], id)).toBe(true);
  await page.getByRole('button', { name: 'No thanks', exact: true }).click();
  await expect(page.locator('[data-consent-banner]')).toBeHidden();
  await page.reload();
  await expect(page.locator('[data-consent-banner]')).toBeHidden();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).analytics, key)).toBe(false);
  expect(requests).toEqual([]);
  expect((await page.context().cookies()).filter(c => c.name.startsWith('_ga'))).toEqual([]);
});

test('opt-in uses the original property once, keeps ads off and excludes URL query and fragment', async ({ page }) => {
  const requests = await stubAnalytics(page);
  await page.goto('/?private=not-for-analytics#private');
  await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
  await expect.poll(async () => (await commands(page)).filter(c => c[0] === 'event').length).toBe(1);
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).searchParams.get('id')).toBe(id);
  const queue = await commands(page);
  expect(queue[0]).toEqual(['consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }]);
  const grant = queue.findIndex(c => c[0] === 'consent' && c[2].analytics_storage === 'granted');
  const config = queue.findIndex(c => c[0] === 'config');
  expect(grant).toBeLessThan(config);
  expect(queue[config]).toEqual(['config', id, {
    page_location: 'http://127.0.0.1:8080/', page_title: 'Free Golf Swing Analyzer — Swing Studio', page_referrer: '',
    send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
  }]);
  expect(queue.filter(c => c[0] === 'consent').every(c => c[2].ad_storage === 'denied' && c[2].ad_user_data === 'denied' && c[2].ad_personalization === 'denied')).toBe(true);
  await settingsFromStudio(page);
  await page.locator('#cookieDialog [data-analytics-choice="true"]').click();
  expect((await commands(page)).filter(c => c[0] === 'event')).toHaveLength(1);
  expect(requests).toHaveLength(1);
});

for (const analytics of [true, false]) {
  test(`original saved analytics=${analytics} preference is retained`, async ({ page }) => {
    const requests = await stubAnalytics(page);
    await page.addInitScript(({ key, analytics }) => localStorage.setItem(key, JSON.stringify({ essential: true, analytics, marketing: true, timestamp: '2026-04-01T12:00:00Z' })), { key, analytics });
    await page.goto('/');
    await expect(page.locator('[data-consent-banner]')).toBeHidden();
    await expect.poll(() => page.evaluate(id => window[`ga-disable-${id}`], id)).toBe(!analytics);
    if (analytics) await expect.poll(() => requests.length).toBe(1);
    else expect(requests).toHaveLength(0);
    expect((await commands(page)).filter(c => c[0] === 'consent').every(c => c[2].ad_storage === 'denied')).toBe(true);
  });
}

test('withdrawal from another tab removes GA cookies and preserves video, zoom and drawings', async ({ page, context }) => {
  await context.route(tagURL, route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
  await expect.poll(async () => (await commands(page)).some(c => c[0] === 'config')).toBe(true);
  await context.addCookies([{ name: '_ga', value: 'existing-id', url: 'http://127.0.0.1:8080' }, { name: '_ga_MG3PW4FRFM', value: 'existing-session', url: 'http://127.0.0.1:8080' }]);
  await page.locator('input[type=file]').first().setInputFiles(fixture);
  await expect(page.locator('video').first()).toBeVisible();
  await page.locator('.zoom-slider').first().fill('2');
  await page.locator('[data-tool="line"]').click();
  const canvas = await page.locator('.annotation-canvas').first().boundingBox();
  await page.mouse.move(canvas.x + canvas.width * .3, canvas.y + canvas.height * .3);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * .7, canvas.y + canvas.height * .7);
  await page.mouse.up();
  await expect(page.locator('#drawingCount')).toHaveText('1 drawing');
  const src = await page.locator('video').first().evaluate(v => v.src);
  const policy = await context.newPage();
  await policy.goto('/privacy.html');
  await policy.locator('footer [data-cookie-settings]').click();
  await policy.getByRole('button', { name: 'Turn analytics off', exact: true }).click();
  await expect.poll(() => page.evaluate(id => window[`ga-disable-${id}`], id)).toBe(true);
  expect((await context.cookies()).filter(c => c.name.startsWith('_ga'))).toEqual([]);
  expect((await commands(page)).filter(c => c[0] === 'consent').at(-1)[2].analytics_storage).toBe('denied');
  expect(await page.locator('video').first().evaluate(v => v.src)).toBe(src);
  await expect(page.locator('.zoom-value').first()).toHaveText('2.00×');
  await expect(page.locator('#drawingCount')).toHaveText('1 drawing');
  await settingsFromStudio(page);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('#workspaceHelp')).toBeFocused();
});

test('withdrawing during a slow tag download prevents configuration and page views', async ({ page }) => {
  let finishDownload;
  await page.route(tagURL, async route => {
    await new Promise(resolve => { finishDownload = resolve; });
    await route.fulfill({ contentType: 'application/javascript', body: '' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
  await expect.poll(() => Boolean(finishDownload)).toBe(true);
  await settingsFromStudio(page);
  await page.getByRole('button', { name: 'Turn analytics off', exact: true }).click();
  finishDownload();
  await page.waitForLoadState('networkidle');
  expect((await commands(page)).filter(c => ['config', 'event'].includes(c[0]))).toEqual([]);
  expect(await page.evaluate(id => window[`ga-disable-${id}`], id)).toBe(true);
});

test('malformed storage, blocked storage and a blocked tag do not break the studio', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(tagURL, route => route.abort());
  await page.addInitScript(key => localStorage.setItem(key, '{broken'), key);
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Optional analytics' })).toBeVisible();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); }; });
  await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
  await expect(page.locator('#consentNotice')).toContainText('this choice applies to this page only');
  await page.locator('input[type=file]').first().setInputFiles(fixture);
  await expect(page.locator('video').first()).toBeVisible();
  await settingsFromStudio(page);
  await page.getByRole('button', { name: 'Turn analytics off', exact: true }).click();
  expect(errors).toEqual([]);
});

test('full policies are accessible from the footer and help without leaving the swing session', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/');
  for (const name of ['footer', '#helpDialog']) {
    if (name === '#helpDialog') await page.locator('#workspaceHelp').click();
    await expect(page.locator(`${name} a[href="privacy.html"]`)).toHaveAttribute('target', '_blank');
    await expect(page.locator(`${name} a[href="terms.html"]`)).toHaveAttribute('target', '_blank');
    await expect(page.locator(`${name} [data-cookie-settings]`)).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await page.screenshot({ path: '/tmp/consent-studio-desktop.png', fullPage: true });
});

for (const path of ['privacy.html', 'terms.html']) {
  for (const width of [1440, 390]) {
    test(`${path} is readable and cookie settings work at ${width}px`, async ({ page }) => {
      const requests = await stubAnalytics(page);
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(`/${path}`);
      expect(response.status()).toBe(200);
      await expect(page.locator('article h1')).toBeVisible();
      expect(await page.locator('article').getByRole('heading', { level: 2 }).count()).toBeGreaterThanOrEqual(10);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(await page.locator('article p').first().evaluate(p => parseFloat(getComputedStyle(p).fontSize))).toBeGreaterThanOrEqual(15);
      await page.screenshot({ path: `/tmp/${path}-${width}.png`, fullPage: true });
      await page.locator('footer [data-cookie-settings]').click();
      await expect(page.getByRole('dialog', { name: 'Cookie settings' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `/tmp/cookie-settings-${width}.png` });
      await page.keyboard.press('Escape');
      await expect(page.locator('footer [data-cookie-settings]')).toBeFocused();
      expect(requests).toEqual([]);
    });
  }
}

test('restored usage events are consent-gated and omit private video information',async({page})=>{
 await stubAnalytics(page);await page.goto('/');
 await page.evaluate(async()=>{const {trackUsage}=await import('/consent.js');trackUsage('video_loaded','single');trackUsage('analysis_complete','single');});
 expect((await commands(page)).filter(c=>c[0]==='event')).toEqual([]);
 await page.getByRole('button',{name:'Allow analytics',exact:true}).click();await expect.poll(async()=>(await commands(page)).some(c=>c[0]==='config')).toBe(true);
 await page.locator('input[type=file]').first().setInputFiles(fixture);await expect(page.locator('video').first()).toBeVisible();
 const event=(await commands(page)).find(c=>c[1]==='video_loaded');expect(event).toEqual(['event','video_loaded',{send_to:id,mode:'single'}]);
 await page.evaluate(async()=>{const {trackUsage}=await import('/consent.js');trackUsage('analysis_complete','compare');trackUsage('private_filename.mp4','single');});
 expect((await commands(page)).filter(c=>c[1]==='analysis_complete')).toEqual([['event','analysis_complete',{send_to:id,mode:'compare'}]]);
 await settingsFromStudio(page);await page.locator('#cookieDialog [data-analytics-choice="false"]').click();const before=(await commands(page)).filter(c=>c[0]==='event');
 await page.evaluate(async()=>(await import('/consent.js')).trackUsage('analysis_complete','single'));expect((await commands(page)).filter(c=>c[0]==='event')).toEqual(before);
});
