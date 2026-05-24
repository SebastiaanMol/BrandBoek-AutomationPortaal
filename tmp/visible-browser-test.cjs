const { chromium } = require('@playwright/test');
(async () => {
  const userDataDir = 'C:/Users/SebastiaanMol/AppData/Local/Temp/automation-navigator-visible-test-profile';
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--start-maximized'],
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto('http://127.0.0.1:5173/alle', { waitUntil: 'domcontentloaded' });
  console.log('VISIBLE_BROWSER_READY ' + page.url());
  // Keep browser open for interactive login/check. Do not close automatically.
  await page.waitForTimeout(30 * 60 * 1000);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
