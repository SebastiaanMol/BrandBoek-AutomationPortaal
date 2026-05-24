const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.newPage();
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  const text = await page.locator("body").innerText();
  const url = page.url();
  await page.screenshot({ path: "tmp/open-process-journey-review.png", fullPage: true });
  fs.writeFileSync("tmp/open-process-journey-review.txt", `url=${url}\n\n${text}`);
  console.log(`url=${url}`);
  console.log(text.replace(/\s+/g, " ").slice(0, 4500));
  await browser.close();
})().catch((err) => { console.error(err); process.exit(1); });
