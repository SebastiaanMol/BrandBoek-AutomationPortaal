import { chromium } from '@playwright/test';
const baseURL = 'http://127.0.0.1:5173';
const context = await chromium.launchPersistentContext('tmp/playwright-live-profile', {
  headless: true,
  viewport: { width: 1440, height: 1000 },
  args: ['--disable-extensions'],
});
const page = await context.newPage();
const logs = [];
page.on('console', msg => { if (['error','warning'].includes(msg.type())) logs.push(`${msg.type()}: ${msg.text()}`); });
page.on('pageerror', err => logs.push(`pageerror: ${err.message}`));
try {
  await page.goto(`${baseURL}/imports`, { waitUntil: 'commit', timeout: 20000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'tmp/imports-stage-id-live-profile-127.png', fullPage: true });
  const bodyText = await page.locator('body').innerText({ timeout: 10000 });
  console.log(JSON.stringify({ ok: true, url: page.url(), bodyPreview: bodyText.slice(0, 1000), logs }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: String(error), url: page.url(), logs }, null, 2));
}
await context.close();
