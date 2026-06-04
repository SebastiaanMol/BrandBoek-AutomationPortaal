const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    storageState: path.resolve('tmp/playwright-auth-state.json'),
  });
  const page = await context.newPage();
  const messages = [];
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) messages.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));

  await page.goto('http://127.0.0.1:5173/alle', { waitUntil: 'networkidle', timeout: 45000 });
  await page.screenshot({ path: path.resolve('tmp/browser-test-auth-alle.png'), fullPage: true });
  const body = await page.locator('body').innerText({ timeout: 15000 });
  const links = await page.locator('a[href^="/automations/"]').evaluateAll((els) => els.map((el) => ({ text: el.textContent?.trim() || '', href: el.getAttribute('href') || '' })));
  const hubspotLink = links.find((link) => /hubspot/i.test(link.text)) || links[0];
  const result = { startUrl: page.url(), bodyPreview: body.slice(0, 1000), linkCount: links.length, selectedLink: hubspotLink, detail: null, consoleMessages: messages.slice(0, 30) };

  if (hubspotLink) {
    await page.goto(`http://127.0.0.1:5173${hubspotLink.href}`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.screenshot({ path: path.resolve('tmp/browser-test-hubspot-detail.png'), fullPage: true });
    const detailText = await page.locator('body').innerText({ timeout: 15000 });
    result.detail = {
      url: page.url(),
      hasHubSpotTemplate: await page.getByLabel('HubSpot automation detail').count(),
      hasSummary: await page.getByRole('heading', { name: 'Wat doet deze automation?' }).count(),
      hasDataflow: await page.getByRole('heading', { name: 'Dataflow' }).count(),
      hasStartConditions: await page.getByRole('heading', { name: 'Startvoorwaarden' }).count(),
      hasFieldMappingUnavailable: detailText.includes('Field mappings niet beschikbaar in HubSpot workflowdata'),
      textPreview: detailText.slice(0, 1600),
    };
  }

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
