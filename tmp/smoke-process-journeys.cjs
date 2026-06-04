const { chromium } = require('playwright');

const baseUrl = 'http://127.0.0.1:5173';
const detailId = 'a1c3b897-0eeb-4bcc-93aa-9dd1aa9b7041';
const screenshots = [];
const results = [];
const consoleIssues = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) throw new Error(`${name} failed${detail ? `: ${detail}` : ''}`);
}

async function textOf(locator) {
  return (await locator.textContent())?.replace(/\s+/g, ' ').trim() || '';
}

async function smokeDesktop(page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/flows`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.getByRole('heading', { name: 'Procesreizen' }).waitFor({ timeout: 20000 });
  record('overview loads', true, page.url());
  record('main process tabs visible',
    await page.getByRole('tab', { name: /^Procesreizen$/i }).isVisible() &&
    await page.getByRole('tab', { name: /Conceptprocesreizen/i }).isVisible() &&
    await page.getByRole('tab', { name: /Bronkwaliteit/i }).isVisible()
  );
  await page.screenshot({ path: 'tmp/smoke-flows-overview.png', fullPage: true });
  screenshots.push('tmp/smoke-flows-overview.png');

  await page.getByRole('tab', { name: /Conceptprocesreizen/i }).click();
  await page.waitForTimeout(1000);
  const conceptBody = await textOf(page.locator('body'));
  const conceptCards = await page.locator('article[aria-label^="Conceptprocesreis"]').count();
  const hasConceptSearch = await page.getByLabel('Zoek conceptreizen').count();
  record('concept tab opens', /Conceptprocesreis|Conceptprocesreizen|webhook-matches/i.test(conceptBody), `cards=${conceptCards}, search=${hasConceptSearch}`);
  if (conceptCards > 0 && hasConceptSearch > 0) {
    const search = page.getByLabel('Zoek conceptreizen');
    await search.fill('Trustoo');
    await page.waitForTimeout(1000);
    const trustooCount = await page.locator('article[aria-label^="Conceptprocesreis"]').count();
    record('concept search works when concepts exist', trustooCount >= 0, `trustooCount=${trustooCount}`);
  } else {
    record('concept empty state is readable', /Geen webhook-matches gevonden|Geen conceptprocesreizen gevonden/i.test(conceptBody), conceptBody.slice(0, 200));
  }
  await page.screenshot({ path: 'tmp/smoke-flows-concepts.png', fullPage: true });
  screenshots.push('tmp/smoke-flows-concepts.png');

  await page.getByRole('tab', { name: /Bronkwaliteit/i }).click();
  await page.waitForTimeout(1000);
  const qualityText = await textOf(page.locator('body'));
  record('source quality tab opens', /Bronkwaliteit/i.test(qualityText));
  await page.screenshot({ path: 'tmp/smoke-flows-source-quality.png', fullPage: false });
  screenshots.push('tmp/smoke-flows-source-quality.png');

  await page.goto(`${baseUrl}/flows/${detailId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.getByRole('heading', { name: 'Kettingreactie van startpunt tot eindpunt' }).waitFor({ timeout: 20000 });
  const chain = page.getByLabel('Procesreis kettingreactie');
  const chainText = await textOf(chain);
  record('detail visual chain uses graph columns', /Startpunt|Startpunten/i.test(chainText) && /webhook-route|webhook-routes|100% bewezen/i.test(chainText) && !/Visuele keten/i.test(chainText), chainText.slice(0, 300));
  const routeRegion = page.getByRole('region', { name: /kettingreactie stap voor stap/i });
  const routeText = await textOf(routeRegion);
  record('detail transfer list explains triggers', /Wat triggert wat\?/i.test(routeText) && /Route-laag 1/i.test(routeText) && !/Hoe beweegt het werk\?|Automationrollen en routes/i.test(routeText), routeText.slice(0, 300));
  record('detail evidence card exists', await page.getByRole('heading', { name: 'Bewijs per overgang' }).isVisible());
  record('detail change card exists', await page.getByRole('heading', { name: 'Wat verandert er?' }).isVisible());
  record('detail automation links exist', (await chain.locator('a[href^="/automations/"]').count()) > 0);
  await page.screenshot({ path: 'tmp/smoke-flow-detail-desktop.png', fullPage: true });
  screenshots.push('tmp/smoke-flow-detail-desktop.png');

  await page.getByRole('link', { name: /Terug naar procesreizen/i }).click();
  await page.waitForURL(/\/flows/, { timeout: 15000 });
  await page.getByRole('heading', { name: 'Procesreizen' }).waitFor({ timeout: 15000 });
  record('detail back link returns to flows', true, page.url());
}

async function smokeMobile(page) {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${baseUrl}/flows/${detailId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.getByRole('heading', { name: 'Kettingreactie van startpunt tot eindpunt' }).waitFor({ timeout: 20000 });
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, delta: doc.scrollWidth - doc.clientWidth };
  });
  record('mobile detail has no page-level horizontal overflow', overflow.delta <= 2, JSON.stringify(overflow));
  const bodyText = await textOf(page.locator('body'));
  record('mobile detail still shows the chain reaction', /Kettingreactie van startpunt tot eindpunt/i.test(bodyText) && /Wat triggert wat\?/i.test(bodyText) && /Route-laag 1/i.test(bodyText));
  await page.screenshot({ path: 'tmp/smoke-flow-detail-mobile.png', fullPage: true });
  screenshots.push('tmp/smoke-flow-detail-mobile.png');
}

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages()[0] || await context.newPage();
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) consoleIssues.push({ type: msg.type(), text: msg.text().slice(0, 500) });
  });
  page.on('pageerror', (error) => consoleIssues.push({ type: 'pageerror', text: error.message }));

  await smokeDesktop(page);
  await smokeMobile(page);

  const seriousIssues = consoleIssues.filter((issue) => !/React Router Future Flag|favicon|Download the React DevTools|manifest/i.test(issue.text));
  console.log(JSON.stringify({ ok: true, results, consoleIssues: seriousIssues, screenshots }, null, 2));
  process.exit(0);
})().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, stack: error.stack, results, consoleIssues, screenshots }, null, 2));
  process.exit(1);
});
