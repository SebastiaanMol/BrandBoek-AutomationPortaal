import { chromium } from "@playwright/test";
import fs from "node:fs";

const resultPath = "tmp/browser-hubspot-webhook-visibility-result.json";
const screenshotCatalog = "tmp/browser-hubspot-webhook-catalog-expanded.png";
const screenshotDetail = "tmp/browser-hubspot-webhook-detail.png";
const webhookUrl = "https://composed-month-production.up.railway.app/operations/hubspot/create_new_deal";

async function writeResult(result) {
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
}

try {
  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const context = await browser.newContext({
    storageState: fs.existsSync("tmp/playwright-auth-state.json") ? "tmp/playwright-auth-state.json" : undefined,
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  const consoleMessages = [];
  page.on("console", (msg) => consoleMessages.push(`${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (error) => consoleMessages.push(`pageerror: ${error.message}`));

  await page.goto("http://localhost:5173/alle", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
  if (/login|auth/i.test(page.url())) {
    await writeResult({ ok: false, reason: `login-required:${page.url()}` });
    await new Promise(() => {});
  }

  const search = page.getByPlaceholder("Zoek op naam, bron, trigger of beschrijving...");
  await search.waitFor({ timeout: 30000 });
  await page.getByRole("tab", { name: /HubSpot/i }).click();
  await search.fill("Create new deal");

  const row = page.locator('[role="row"]').filter({ hasText: /^Create new deal\b/i }).first();
  await row.waitFor({ state: "visible", timeout: 30000 });
  await row.click();
  await page.getByText(webhookUrl).waitFor({ timeout: 30000 });
  const catalogText = await page.locator("body").innerText();
  await page.screenshot({ path: screenshotCatalog, fullPage: true });

  await row.getByRole("link", { name: /Open/i }).click();
  await page.waitForURL(/\/automations\/[^/]+$/, { timeout: 30000 });
  await page.getByText("Webhook Action").waitFor({ timeout: 30000 });
  await page.getByText(webhookUrl).waitFor({ timeout: 30000 });
  const detailText = await page.locator("body").innerText();
  await page.screenshot({ path: screenshotDetail, fullPage: true });

  await writeResult({
    ok: true,
    url: page.url(),
    catalogShowsWebhookUrl: catalogText.includes(webhookUrl),
    detailShowsWebhookUrl: detailText.includes(webhookUrl),
    screenshots: [screenshotCatalog, screenshotDetail],
    consoleMessages: consoleMessages
      .filter((line) => !line.includes("React Router Future Flag Warning"))
      .slice(0, 10),
  });

  await new Promise(() => {});
} catch (error) {
  await writeResult({
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  });
  await new Promise(() => {});
}
