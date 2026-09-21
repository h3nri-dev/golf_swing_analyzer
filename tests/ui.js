export async function openPanel(page, name) {
  if (!await page.locator(`#panel-${name}`).isVisible()) await page.locator(`#tab-${name}`).click();
}
export async function settings(page, i, selector) {
  const target = page.locator(`[data-select="${i}"]`);
  if (await target.isVisible()) await target.click();
  await openPanel(page, 'video');
  return page.locator(`[data-settings-slot="${i}"] ${selector}`);
}
