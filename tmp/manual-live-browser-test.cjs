const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const out = [];
  const browser = await chromium.launch({ headless: false, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const issues = [];
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) issues.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => issues.push(`pageerror: ${err.message}`));

  await page.goto("http://127.0.0.1:5173/flows", { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForFunction(() => !location.pathname.includes("/login"), null, { timeout: 300_000 });
  await page.goto("http://127.0.0.1:5173/flows", { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {});
  await page.getByRole("tab", { name: "Procesreizen", exact: true }).waitFor({ timeout: 45_000 });
  await page.screenshot({ path: "tmp/manual-live-flows-after-login.png", fullPage: true });

  const conceptTab = page.getByRole("tab", { name: /Conceptprocesreizen/i });
  await conceptTab.click({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "tmp/manual-live-conceptprocesreizen.png", fullPage: true });

  const rows = page.locator("tbody tr");
  const rowCount = await rows.count();
  out.push(`conceptRows=${rowCount}`);
  if (rowCount > 0) {
    const rowText = (await rows.first().innerText()).replace(/\s+/g, " ");
    out.push(`firstRow=${rowText}`);
    await rows.first().click();
    await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "tmp/manual-live-conceptprocesreis-detail.png", fullPage: true });
    const detailText = await page.locator("body").innerText();
    out.push(`detailUrl=${page.url()}`);
    out.push(`hasGenericOldCopy=${detailText.includes("HubSpot ziet dit signaal en kan daardoor")}`);
    out.push(`hasWebhookPath=${/\/[a-z0-9_/-]+/.test(detailText)}`);
    out.push(`hasConcreteTrigger=${/eigenschap|dealstage|pipeline|formulier|lijst|trigger/i.test(detailText)}`);
    out.push(`hasGitLabHandler=${/handler [a-z0-9_]+/i.test(detailText)}`);
    out.push(`detailExcerpt=${detailText.replace(/\s+/g, " ").slice(0, 2500)}`);
  }

  out.push(`consoleIssues=${issues.length}`);
  issues.slice(0, 20).forEach((issue, index) => out.push(`console[${index}]=${issue.slice(0, 500)}`));
  fs.writeFileSync("tmp/manual-live-browser-test.txt", out.join("\n"));
  // Keep the headed browser open after the check so the logged-in session remains available.
  await new Promise(() => {});
})().catch((err) => {
  fs.writeFileSync("tmp/manual-live-browser-test.txt", `FAILED\n${err.stack || err.message}`);
  process.exit(1);
});
