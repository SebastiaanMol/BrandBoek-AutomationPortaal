import { chromium } from "@playwright/test";
import fs from "node:fs";

const resultPath = "tmp/browser-breadcrumb-return-result.json";
const debugPath = "tmp/browser-breadcrumb-return-debug.log";

function log(message) {
  fs.appendFileSync(debugPath, `${new Date().toISOString()} ${message}\n`);
}

async function writeResult(result) {
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
}

try {
  try { fs.unlinkSync(resultPath); } catch {}
  try { fs.unlinkSync(debugPath); } catch {}
  log("starting");

  const storageState = fs.existsSync("tmp/playwright-auth-state.json")
    ? "tmp/playwright-auth-state.json"
    : undefined;
  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const context = await browser.newContext({
    storageState,
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  const consoleMessages = [];
  page.on("console", (msg) => consoleMessages.push(`${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (error) => consoleMessages.push(`pageerror: ${error.message}`));

  log("goto /alle");
  await page.goto("http://localhost:5173/alle", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
  if (/login|auth/i.test(page.url())) {
    log(`login required: ${page.url()}`);
    await writeResult({ ok: false, reason: `login-required:${page.url()}` });
    await new Promise(() => {});
  }

  const search = page.getByPlaceholder("Zoek op naam, bron, trigger of beschrijving...");
  await search.waitFor({ timeout: 30000 });
  log("catalog ready");

  await page.getByRole("tab", { name: /HubSpot/i }).click();
  await search.fill("whatsapp");

  let row = page.locator('[role="row"]').filter({ hasText: /whatsapp/i }).first();
  if ((await row.count()) === 0) {
    log("whatsapp row not found, falling back to first hubspot row");
    await search.fill("");
    row = page.locator('[role="row"]').filter({ hasText: /HubSpot/i }).nth(1);
  }
  await row.waitFor({ state: "visible", timeout: 30000 });
  const rowText = await row.innerText();
  const rememberedQuery = await search.inputValue();
  await page.evaluate(() => window.scrollTo(0, 480));
  await page.screenshot({ path: "tmp/browser-breadcrumb-automation-context-before.png", fullPage: true });

  log("open detail");
  const openLink = row.getByRole("link", { name: /^Open / }).first();
  await openLink.click();
  await page.waitForURL(/\/automations\/[^/]+$/, { timeout: 30000 });
  await page.getByRole("navigation", { name: "breadcrumb" }).waitFor({ timeout: 30000 });
  const breadcrumbText = await page.getByRole("navigation", { name: "breadcrumb" }).innerText();
  await page.screenshot({ path: "tmp/browser-breadcrumb-automation-detail.png", fullPage: true });

  log("breadcrumb back");
  await page
    .getByRole("navigation", { name: "breadcrumb" })
    .getByRole("link", { name: "Automations" })
    .click();
  await page.waitForURL(/\/alle/, { timeout: 30000 });
  await search.waitFor({ timeout: 30000 });
  const restoredQuery = await search.inputValue();
  const restoredHubspotSelected = await page.getByRole("tab", { name: /HubSpot/i }).getAttribute("aria-selected");
  await page.screenshot({ path: "tmp/browser-breadcrumb-automation-context-restored.png", fullPage: true });

  await writeResult({
    ok: true,
    url: page.url(),
    rowText: rowText.slice(0, 200),
    rememberedQuery,
    restoredQuery,
    restoredHubspotSelected,
    breadcrumbText,
    queryRestored: rememberedQuery === restoredQuery,
    sourceTabRestored: restoredHubspotSelected === "true",
    consoleMessages: consoleMessages
      .filter((line) => !line.includes("React Router Future Flag Warning"))
      .slice(0, 10),
  });
  log("done; keeping browser open");
  await new Promise(() => {});
} catch (error) {
  log(`error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  await writeResult({
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  });
  await new Promise(() => {});
}
