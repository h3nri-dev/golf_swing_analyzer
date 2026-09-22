// Sections are always expanded; only scroll their controls into reach.
export async function focusSection(page, name) {
  await page.locator(name==='range'?'#commonPlayer':`#panel-${name}`).scrollIntoViewIfNeeded();
}
export async function settings(page, i, selector) {
  const target = page.locator(`[data-select="${i}"]`);
  if (await target.isVisible()) await target.click();
  if(selector==='.zoom-fit' || selector==='.fps' || selector==='.shot-fps') return page.locator(`[data-slot="${i}"] ${selector}`);
  if(selector==='.clip-speed') return transport(page,'speed',i);
  await focusSection(page, 'video');
  return page.locator(`[data-settings-slot="${i}"] ${selector}`);
}
export async function focusVideos(page) {
  await page.locator('#studio').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));
}
export async function discardIfAsked(page) {
  if (await page.locator('#discardDialog').isVisible()) await page.locator('#discardConfirm').click();
}
export async function transport(page, control, index) {
  if (index !== undefined) {
    const target = page.locator(`[data-select="${index}"]`);
    if (await target.isVisible()) await target.click();
  }
  const independent = await page.locator('#studio').evaluate(e=>e.classList.contains('independent-playback'));
  if (!independent) return page.locator(`#${control}`);
  const i = await page.locator('.video-card.selected').getAttribute('data-slot');
  const name = {timeline:'clip-timeline',speed:'clip-speed',play:'clip-play',next:'clip-next',previous:'clip-previous'}[control];
  return page.locator(`[data-slot="${i}"] .${name}`);
}
