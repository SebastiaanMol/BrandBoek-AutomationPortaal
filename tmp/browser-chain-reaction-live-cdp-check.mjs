import { chromium } from "@playwright/test";
import fs from "node:fs";

const resultPath = "tmp/browser-chain-reaction-live-result.json";
const screenshotPath = "tmp/browser-chain-reaction-live-create-new-deal.png";
const baseUrl = "http://127.0.0.1:5173";
const webhookUrl = "https://composed-month-production.up.railway.app/operations/hubspot/create_new_deal";

function finish(result) {
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  process.exit(0);
}

try {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
  const context = browser.contexts()[0];
  if (!context) finish({ ok: false, reason: "no-browser-context" });

  const page = context.pages()[0] ?? await context.newPage();
  const consoleMessages = [];
  page.on("console", (msg) => consoleMessages.push(`${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (error) => consoleMessages.push(`pageerror: ${error.message}`));

  await page.goto(`${baseUrl}/alle`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page.bringToFront().catch(() => undefined);

  if (/login|auth/i.test(page.url())) {
    finish({ ok: false, reason: `login-required:${page.url()}` });
  }

  const search = page.getByPlaceholder(/zoek/i).first();
  await search.waitFor({ state: "visible", timeout: 30_000 });
  await search.fill("Create new deal");
  await page.waitForTimeout(900);

  const href = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll("tr,[role='row'],article,section,div")];
    for (const candidate of candidates) {
      const text = candidate.textContent ?? "";
      if (!/\bCreate new deal\b/i.test(text)) continue;
      const link = candidate.querySelector("a[href^='/automations/'],a[href*='/automations/']");
      if (link) return link.getAttribute("href");
    }
    return null;
  });

  if (!href) {
    finish({ ok: false, reason: "create-new-deal-link-not-found", url: page.url() });
  }

  await page.goto(new URL(href, baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page.bringToFront().catch(() => undefined);

  const chainCard = page.getByLabel("Kettingreactie vanaf deze automation");
  await chainCard.waitFor({ state: "visible", timeout: 30_000 });

  const text = await page.locator("body").innerText();
  await page.screenshot({ path: screenshotPath, fullPage: true });

  finish({
    ok: true,
    url: page.url(),
    showsChainCard: text.includes("Kettingreactie vanaf deze automation"),
    showsWebhookUrl: text.includes(webhookUrl),
    showsBackendStep: text.includes("New create deal"),
    showsHubSpotWriteNode: text.includes("HubSpot vervolgdeals"),
    showsStopGap: text.includes("Hier stopt het bewijs"),
    screenshot: screenshotPath,
    consoleMessages: consoleMessages
      .filter((line) => !line.includes("React Router Future Flag Warning"))
      .slice(0, 10),
  });
} catch (error) {
  finish({
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  });
}
