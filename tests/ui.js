export async function openPanel(page, name) {
  if (!await page.locator(`#panel-${name}`).isVisible()) await page.locator(`#tab-${name}`).click();
}
export async function settings(page, i, selector) {
  const target = page.locator(`[data-select="${i}"]`);
  if (await target.isVisible()) await target.click();
  if(selector==='.clip-speed') return transport(page,'speed',i);
  await openPanel(page, 'video');
  return page.locator(`[data-settings-slot="${i}"] ${selector}`);
}
export async function closePanel(page) {
  if (await page.locator('#analysisPanel').isVisible()) await page.locator('#closePanel').click();
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
