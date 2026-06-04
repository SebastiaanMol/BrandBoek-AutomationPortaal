const { chromium } = require('@playwright/test');
const path = require('path');

const requiredHeadings = [
  'Wat doet deze automation?',
  'Dataflow',
  'Startvoorwaarden',
  'Webhook Action',
  'Automation Ownership',
  'Gebruikte properties',
  'Gekoppelde objecten / bronnen',
  'Field mappings',
  'Issues & Risks',
];

async function inspectDetail(page, href, index) {
  const messages = [];
  const onConsole = (msg) => {
    if (['error', 'warning'].includes(msg.type())) messages.push(`${msg.type()}: ${msg.text()}`);
  };
  const onError = (error) => messages.push(`pageerror: ${error.message}`);
  page.on('console', onConsole);
  page.on('pageerror', onError);

  await page.goto(`http://127.0.0.1:5173${href}`, { waitUntil: 'networkidle', timeout: 45000 });
  const text = await page.locator('body').innerText({ timeout: 15000 });
  const screenshotPath = index === 0 ? path.resolve('tmp/browser-test-hubspot-detail-desktop-deep.png') : null;
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });

  const headingCounts = {};
  for (const heading of requiredHeadings) {
    headingCounts[heading] = await page.getByRole('heading', { name: heading }).count().catch(() => 0);
  }

  page.off('console', onConsole);
  page.off('pageerror', onError);

  return {
    href,
    url: page.url(),
    title: (await page.locator('h1').first().innerText().catch(() => 'NO_H1')).trim(),
    hasUnexpectedError: text.includes('Unexpected Application Error'),
    hasTemplate: await page.getByLabel('HubSpot automation detail').count().catch(() => 0),
    headingCounts,
    hasObjectObject: text.includes('[object Object]'),
    hasRecordRecords: text.includes('record-records'),
    hasRawTechnicalSummary: /Samenvatting[\s\S]{0,400}(https?:\/\/|Webhook ->|\bPOST\b|een van deze waarden is ['"]?\d+)/i.test(text),
    hasFieldMappingUnavailable: text.includes('Field mappings niet beschikbaar in HubSpot workflowdata'),
    hasRuntimeMetric: text.includes('RUNTIME METRICS'),
    textPreview: text.slice(0, 900),
    consoleMessages: messages.filter((m) => !m.includes('React Router Future Flag')).slice(0, 10),
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    storageState: path.resolve('tmp/playwright-auth-state.json'),
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5173/alle', { waitUntil: 'networkidle', timeout: 45000 });

  const hubspotHrefs = await page.locator('tr, [role="row"]').evaluateAll((rows) => {
    return rows
      .map((row) => ({ text: row.textContent || '', href: row.querySelector('a[href^="/automations/"]')?.getAttribute('href') || '' }))
      .filter((row) => row.href && /HUBSPOT|HubSpot/i.test(row.text))
      .map((row) => row.href);
  });

  const fallbackHrefs = await page.locator('a[href^="/automations/"]').evaluateAll((links) => links.map((link) => link.getAttribute('href')).filter(Boolean));
  const uniqueHrefs = Array.from(new Set(hubspotHrefs.length ? hubspotHrefs : fallbackHrefs)).slice(0, 15);
  const results = [];
  for (let i = 0; i < uniqueHrefs.length; i += 1) {
    results.push(await inspectDetail(page, uniqueHrefs[i], i));
  }

  await page.setViewportSize({ width: 390, height: 1100 });
  await page.goto(`http://127.0.0.1:5173${uniqueHrefs[0]}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.screenshot({ path: path.resolve('tmp/browser-test-hubspot-detail-mobile-deep.png'), fullPage: true });
  const mobileText = await page.locator('body').innerText();
  const mobile = {
    href: uniqueHrefs[0],
    hasTemplate: await page.getByLabel('HubSpot automation detail').count().catch(() => 0),
    hasHorizontalBodyOverflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2),
    hasUnexpectedError: mobileText.includes('Unexpected Application Error'),
  };

  const failures = results.filter((result) => (
    result.hasUnexpectedError ||
    result.hasTemplate !== 1 ||
    result.hasObjectObject ||
    result.hasRecordRecords ||
    Object.values(result.headingCounts).some((count) => count < 1) ||
    !result.hasFieldMappingUnavailable
  ));

  console.log(JSON.stringify({
    inspectedCount: results.length,
    inspectedHrefs: uniqueHrefs,
    failures,
    suspiciousSummaries: results.filter((result) => result.hasRawTechnicalSummary).map((result) => ({ href: result.href, title: result.title })),
    mobile,
    sample: results[0],
  }, null, 2));

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
