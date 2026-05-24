const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  await page.goto('http://localhost:8080/instellingen', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  const url = page.url();
  const body = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  if (!body.includes('Zapier') && (url.includes('login') || body.toLowerCase().includes('inloggen') || body.toLowerCase().includes('login'))) {
    console.log(JSON.stringify({ url, authenticated: false, bodySample: body.slice(0, 500) }, null, 2));
    return;
  }
  const koppelingen = page.getByRole('tab', { name: /Externe systemen/i });
  if (await koppelingen.count()) await koppelingen.click();
  await page.waitForTimeout(1000);
  const visibleText = await page.locator('body').innerText();
  const fileInput = page.locator('input[type="file"][accept=".json,application/json"]');
  const result = {
    url: page.url(),
    authenticated: true,
    hasZapier: visibleText.includes('Zapier'),
    hasReadOnlyCopy: visibleText.includes('Lees bestaande Zaps read-only uit via de Zapier API'),
    hasImportButton: visibleText.includes('Importeer Zapier JSON'),
    hasStripCopy: visibleText.includes('Secrets en headers worden gestript'),
    fileInputCount: await fileInput.count(),
  };
  await page.screenshot({ path: 'tmp/zapier-json-import-settings-check.png', fullPage: true });
  console.log(JSON.stringify(result, null, 2));
  // Keep visible browser open briefly for manual observation, then close this test window.
  await page.waitForTimeout(3000);
  await browser.close();
})();
