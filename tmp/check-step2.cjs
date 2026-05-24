const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
  const page = browser.contexts()[0].pages()[0];
  await page.goto("http://127.0.0.1:5173/flows/suggesties/AUTO-HS-1692171427__AUTO-076", { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const start = text.indexOf("2. HUBSPOT WORKFLOW");
  console.log(text.slice(start, start + 900));
  await browser.close();
})();
