const { chromium } = require("playwright");

const url = "http://127.0.0.1:5173/flows/f8164cda-51b2-4f80-ae49-cf58a4c9eda8";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 350 });
  const context = await browser.newContext({
    storageState: "tmp/playwright-auth-state.json",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.bringToFront();
  await sleep(1500);

  await page.mouse.wheel(0, 550);
  await sleep(1200);
  await page.mouse.wheel(0, 850);
  await sleep(1200);

  const logicButtons = page.getByText("Logica");
  if (await logicButtons.count()) {
    await logicButtons.first().click();
    await sleep(1200);
  }

  await page.bringToFront();

  // Keep the browser open for manual review.
  await new Promise(() => {});
})();
