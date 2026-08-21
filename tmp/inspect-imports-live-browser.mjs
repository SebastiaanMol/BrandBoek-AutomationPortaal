import { chromium } from '@playwright/test';
import fs from 'node:fs';

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).map((line) => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  return match ? [match[1], match[2].replace(/^['"]|['"]$/g, '')] : null;
}).filter(Boolean));

const baseURL = 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: fs.existsSync('tmp/playwright-auth-state-live.json') ? 'tmp/playwright-auth-state-live.json' : undefined, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
await page.goto(`${baseURL}/imports`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
const text = await page.locator('body').innerText({ timeout: 15000 });
const login = /Log in om verder te gaan|Inloggen/i.test(text) && !text.includes('Bronwijzigingen uit synchronisaties');
if (login) {
  console.log(JSON.stringify({ ok: false, reason: 'login_required', url: page.url(), body: text.slice(0, 300) }, null, 2));
  await browser.close();
  process.exit(0);
}

const result = await page.evaluate(async ({ supabaseUrl, anonKey }) => {
  const projectRef = 'icvrrpxtycwgaxcajwdf';
  const key = Object.keys(localStorage).find((candidate) => candidate.includes(projectRef) && candidate.includes('auth-token'));
  const raw = key ? localStorage.getItem(key) : null;
  const parsed = raw ? JSON.parse(raw) : null;
  const token = parsed?.access_token;
  if (!token) return { ok: false, reason: 'no_token', key, localStorageKeys: Object.keys(localStorage) };

  async function rest(path) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        Prefer: 'count=exact',
      },
    });
    const json = await response.json().catch(() => null);
    return { status: response.status, contentRange: response.headers.get('content-range'), json };
  }

  const page1 = await rest('source_sync_change_items?select=id,source,external_id,automation_id,change_type,status,review_key,title,summary,old_value_sanitized,new_value_sanitized,created_at,sync_run_id&status=eq.pending&order=created_at.desc&limit=100');
  const rows = Array.isArray(page1.json) ? page1.json : [];
  const bySource = {};
  const byType = {};
  const byReview = {};
  const fieldCounts = {};
  for (const row of rows) {
    bySource[row.source] = (bySource[row.source] || 0) + 1;
    byType[row.change_type] = (byType[row.change_type] || 0) + 1;
    byReview[row.review_key || 'null'] = (byReview[row.review_key || 'null'] || 0) + 1;
    const meta = [...(row.old_value_sanitized?.metadata || []), ...(row.new_value_sanitized?.metadata || [])];
    for (const item of meta) if (item?.field) fieldCounts[item.field] = (fieldCounts[item.field] || 0) + 1;
  }
  return {
    ok: true,
    status: page1.status,
    contentRange: page1.contentRange,
    fetched: rows.length,
    bySource,
    byType,
    byReview,
    fieldCounts,
    samples: rows.slice(0, 15).map((row) => ({
      id: row.id,
      source: row.source,
      external_id: row.external_id,
      type: row.change_type,
      review_key: row.review_key,
      title: row.title,
      created_at: row.created_at,
      fields: [...new Set([...(row.old_value_sanitized?.metadata || []), ...(row.new_value_sanitized?.metadata || [])].map((item) => item?.field).filter(Boolean))],
      oldValue: row.old_value_sanitized,
      newValue: row.new_value_sanitized,
    })),
  };
}, { supabaseUrl: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_PUBLISHABLE_KEY });

console.log(JSON.stringify({ url: page.url(), pageTextTotalMention: text.match(/\d+\s+open bronwijzigingen/)?.[0] ?? null, result }, null, 2));
await browser.close();
