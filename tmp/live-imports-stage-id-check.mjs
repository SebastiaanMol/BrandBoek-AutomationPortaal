import { chromium } from '@playwright/test';
import fs from 'node:fs';

const baseURL = 'http://localhost:5173';
const storageState = fs.existsSync('tmp/playwright-auth-state.json') ? 'tmp/playwright-auth-state.json' : undefined;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const logs = [];
page.on('console', msg => { if (['error','warning'].includes(msg.type())) logs.push(`${msg.type()}: ${msg.text()}`); });
page.on('pageerror', err => logs.push(`pageerror: ${err.message}`));
await page.goto(`${baseURL}/imports`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
await page.screenshot({ path: 'tmp/imports-stage-id-live-initial-5173.png', fullPage: true });

const bodyText = await page.locator('body').innerText({ timeout: 15000 });
const isLogin = /inloggen|login|email|wachtwoord/i.test(bodyText) && !/Bronwijzigingen uit synchronisaties/i.test(bodyText);
if (isLogin) {
  console.log(JSON.stringify({ ok: false, reason: 'login_required', url: page.url(), bodyPreview: bodyText.slice(0, 500), logs }, null, 2));
  await browser.close();
  process.exit(0);
}

await page.getByLabel('Zoeken in bronwijzigingen').fill('1697577818');
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2000);
await page.screenshot({ path: 'tmp/imports-stage-id-live-search-5173.png', fullPage: true });

const rows = await page.locator('[data-sync-review-row]').evaluateAll((els) => els.map((el) => {
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  const diffText = [...el.querySelectorAll('.rounded-lg.border')].map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim());
  return { text, diffText };
}));

console.log(JSON.stringify({ ok: true, url: page.url(), bodyPreview: bodyText.slice(0, 500), rowCount: rows.length, rows, logs }, null, 2));
await browser.close();
