const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) errors.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  await page.goto('http://127.0.0.1:5173/alle', { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: path.resolve('tmp/browser-test-alle.png'), fullPage: true });
  const title = await page.title();
  const bodyText = await page.locator('body').innerText({ timeout: 10000 }).catch((error) => `BODY_READ_ERROR: ${error.message}`);
  const links = await page.locator('a[href^="/automations/"]').evaluateAll((els) => els.slice(0, 10).map((el) => ({ text: el.textContent?.trim(), href: el.getAttribute('href') })));

  console.log(JSON.stringify({
    url: page.url(),
    title,
    bodyPreview: bodyText.slice(0, 1200),
    automationLinks: links,
    consoleMessages: errors.slice(0, 20),
  }, null, 2));

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
