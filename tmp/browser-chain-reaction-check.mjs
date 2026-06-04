import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const resultPath = "tmp/browser-chain-reaction-result.json";
const screenshotPath = "tmp/browser-chain-reaction-create-new-deal.png";
const baseUrl = "http://localhost:5173";
const webhookUrl = "https://composed-month-production.up.railway.app/operations/hubspot/create_new_deal";

function writeResult(result) {
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
}

const useLiveProfile = process.env.LIVE_PROFILE === "1";
const browser = useLiveProfile ? null : await chromium.launch({ headless: true });
const context = useLiveProfile
  ? await chromium.launchPersistentContext(path.resolve("tmp/playwright-live-profile"), {
    headless: true,
    viewport: { width: 1440, height: 1100 },
  })
  : await browser.newContext({
    storageState: fs.existsSync("tmp/playwright-auth-state.json") ? "tmp/playwright-auth-state.json" : undefined,
    viewport: { width: 1440, height: 1100 },
  });
const page = await context.newPage();
const consoleMessages = [];
page.on("console", (msg) => consoleMessages.push(`${msg.type()}: ${msg.text()}`));
page.on("pageerror", (error) => consoleMessages.push(`pageerror: ${error.message}`));

try {
  await page.goto(`${baseUrl}/alle`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

  if (/login|auth/i.test(page.url()) || await page.getByRole("button", { name: /inloggen|login/i }).count()) {
    writeResult({ ok: false, reason: `login-required:${page.url()}` });
    await context.close();
    await browser?.close();
    process.exit(0);
  }

  const search = page.getByPlaceholder(/zoek/i).first();
  await search.waitFor({ state: "visible", timeout: 30_000 });
  await search.fill("Create new deal");
  await page.waitForTimeout(750);

  const href = await page.evaluate(() => {
    const containers = [...document.querySelectorAll("tr,[role='row'],article,section,div")];
    for (const container of containers) {
      const text = container.textContent ?? "";
      if (!/\bCreate new deal\b/i.test(text)) continue;
      const link = container.querySelector("a[href^='/automations/'],a[href*='/automations/']");
      if (link) return link.getAttribute("href");
    }
    return null;
  });

  if (!href) {
    writeResult({ ok: false, reason: "create-new-deal-link-not-found", url: page.url() });
    await context.close();
    await browser?.close();
    process.exit(0);
  }

  await page.goto(new URL(href, baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page.getByLabel("Kettingreactie vanaf deze automation").waitFor({ state: "visible", timeout: 30_000 });
  const bodyText = await page.locator("body").innerText();
  await page.screenshot({ path: screenshotPath, fullPage: true });

  writeResult({
    ok: true,
    url: page.url(),
    showsChainCard: bodyText.includes("Kettingreactie vanaf deze automation"),
    showsWebhookUrl: bodyText.includes(webhookUrl),
    showsBackendStep: bodyText.includes("New create deal"),
    showsHubSpotWriteNode: bodyText.includes("HubSpot vervolgdeals"),
    showsStopGap: bodyText.includes("Hier stopt het bewijs"),
    screenshot: screenshotPath,
    consoleMessages: consoleMessages
      .filter((line) => !line.includes("React Router Future Flag Warning"))
      .slice(0, 10),
  });
} catch (error) {
  writeResult({
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
    url: page.url(),
  });
} finally {
  await context.close().catch(() => undefined);
  await browser?.close();
}
