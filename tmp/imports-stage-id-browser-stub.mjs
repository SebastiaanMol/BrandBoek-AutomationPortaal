import { chromium } from '@playwright/test';

const baseURL = 'http://127.0.0.1:5173';
const projectRef = 'icvrrpxtycwgaxcajwdf';
const authKey = `sb-${projectRef}-auth-token`;
const future = Math.floor(Date.now() / 1000) + 3600;
const fakeSession = {
  access_token: 'test-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: future,
  refresh_token: 'test-refresh-token',
  user: {
    id: 'browser-smoke-user',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'browser-smoke@example.test',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
  },
};

const reviewItem = {
  id: 'review-stage-id-test',
  sync_run_id: 'sync-run-test',
  source: 'hubspot',
  external_id: '1697577818',
  automation_id: 'AUTO-HS-1697577818',
  change_type: 'metadata_changed',
  status: 'pending',
  title: 'Set Software/Portaal/Pakket/CSV based on dealstage',
  summary: 'Broninformatie wijzigt.',
  impact: 'Werkt bestaande automation bij.',
  selected_by_default: true,
  old_value_sanitized: {
    metadata: [
      { field: 'doel', value: null },
      { field: 'stage_id', value: null },
    ],
  },
  new_value_sanitized: {
    metadata: [
      { field: 'doel', value: "Automatisch gegenereerd op basis van naam: 'Set Software/Portaal/Pakket/CSV based on dealstage'" },
      { field: 'stage_id', value: '1176430505, 1044124012, 1189168762, 1176430501, 1176430502' },
    ],
  },
  payload_sanitized: {},
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(({ authKey, fakeSession }) => {
  window.localStorage.setItem(authKey, JSON.stringify(fakeSession));
}, { authKey, fakeSession });
const page = await context.newPage();
const logs = [];
page.on('console', msg => { if (['error','warning'].includes(msg.type())) logs.push(`${msg.type()}: ${msg.text()}`); });
page.on('pageerror', err => logs.push(`pageerror: ${err.message}`));

await page.route('**/auth/v1/**', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: fakeSession.user }) });
});
await page.route('**/rest/v1/source_sync_change_items**', async (route) => {
  const url = new URL(route.request().url());
  const search = url.searchParams.toString();
  const shouldReturn = search.includes('1697577818') || !search.includes('or=');
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'content-range': shouldReturn ? '0-0/1' : '0-0/0' },
    body: JSON.stringify(shouldReturn ? [reviewItem] : []),
  });
});
await page.route('**/rest/v1/**', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: JSON.stringify([]) });
});
await page.route('**/functions/v1/**', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ inserted: 0, updated: 1, applied: 1, failed: 0, skipped: 0, total: 1 }) });
});

await page.goto(`${baseURL}/imports`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForSelector('[data-sync-review-row]', { timeout: 30000 });
await page.screenshot({ path: 'tmp/imports-stage-id-browser-stub.png', fullPage: true });

const result = await page.locator('[data-sync-review-row]').first().evaluate((el) => {
  const rowText = (el.textContent || '').replace(/\s+/g, ' ').trim();
  const table = el.querySelector('.rounded-lg.border');
  const cells = table ? [...table.querySelectorAll('span')].map((span) => (span.textContent || '').trim()) : [];
  return { rowText, cells };
});
console.log(JSON.stringify({ ok: true, url: page.url(), result, logs }, null, 2));
await browser.close();
