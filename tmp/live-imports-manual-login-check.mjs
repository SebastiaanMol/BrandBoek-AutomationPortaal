import { chromium } from '@playwright/test';
import fs from 'node:fs';

const baseURL = 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: false, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const logs = [];
page.on('console', (msg) => { if (['error', 'warning'].includes(msg.type())) logs.push(`${msg.type()}: ${msg.text()}`); });
page.on('pageerror', (err) => logs.push(`pageerror: ${err.message}`));

await page.goto(`${baseURL}/imports`, { waitUntil: 'domcontentloaded', timeout: 45000 });
console.log('Chrome staat open. Log nu in als je het login-scherm ziet. Ik wacht maximaal 10 minuten.');

await page.waitForFunction(() => {
  const text = document.body?.innerText || '';
  return !location.pathname.includes('/login') && text.includes('Bronwijzigingen uit synchronisaties');
}, null, { timeout: 600000 });

await context.storageState({ path: 'tmp/playwright-auth-state-live.json' });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
await page.screenshot({ path: 'tmp/imports-stage-id-live-manual-before-search.png', fullPage: true });

const search = page.getByLabel('Zoeken in bronwijzigingen');
await search.fill('1697577818');
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2500);
await page.screenshot({ path: 'tmp/imports-stage-id-live-manual-after-search.png', fullPage: true });

const rows = await page.locator('[data-sync-review-row]').evaluateAll((els) => els.map((el, index) => {
  const allText = (el.textContent || '').replace(/\s+/g, ' ').trim();
  const diffTables = [...el.querySelectorAll('.rounded-lg.border')].map((table) => {
    const spans = [...table.querySelectorAll('span')].map((span) => (span.textContent || '').trim());
    const gridRows = [...table.querySelectorAll('.grid')].map((row) => [...row.querySelectorAll('span')].map((span) => (span.textContent || '').trim()));
    return { spans, gridRows, text: (table.textContent || '').replace(/\s+/g, ' ').trim() };
  });
  return { index, allText, diffTables };
}));

const body = await page.locator('body').innerText();
const result = {
  url: page.url(),
  rowCount: rows.length,
  rows,
  bodyPreview: body.replace(/\s+/g, ' ').slice(0, 3000),
  screenshots: [
    'tmp/imports-stage-id-live-manual-before-search.png',
    'tmp/imports-stage-id-live-manual-after-search.png',
  ],
  logs,
};
fs.writeFileSync('tmp/imports-stage-id-live-manual-result.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

console.log('Ik laat het venster nog 20 seconden open zodat je het resultaat kunt zien.');
await page.waitForTimeout(20000);
await browser.close();
