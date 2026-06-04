const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: path.resolve('tmp/playwright-auth-state.json') });
  const page = await context.newPage();
  const hrefs = ['/automations/AUTO-079', '/automations/AUTO-085'];
  const summaries = [];
  for (const href of hrefs) {
    await page.goto(`http://127.0.0.1:5173${href}`, { waitUntil: 'networkidle', timeout: 45000 });
    const summary = await page.getByRole('heading', { name: 'Wat doet deze automation?' }).locator('xpath=..').innerText();
    summaries.push({ href, summary });
  }
  console.log(JSON.stringify(summaries, null, 2));
  await browser.close();
})();
