const { chromium } = require("playwright");
const fs = require("fs");

const port = Number(process.env.LIVE_BROWSER_PORT || 9333);

(async () => {
  const issues = [];
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.newPage();

  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) issues.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => issues.push(`pageerror: ${err.message}`));

  const out = [];
  await page.goto("http://127.0.0.1:5173/flows", { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {});

  if (page.url().includes("/login")) {
    out.push(`status=needs-login`);
    out.push(`url=${page.url()}`);
    fs.writeFileSync("tmp/manual-live-browser-test.txt", out.join("\n"));
    await browser.close();
    return;
  }

  await page.getByRole("tab", { name: "Procesreizen", exact: true }).waitFor({ timeout: 45_000 });
  await page.screenshot({ path: "tmp/manual-live-flows-after-login.png", fullPage: true });

  const conceptTab = page.getByRole("tab", { name: /Conceptprocesreizen/i });
  await conceptTab.click({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "tmp/manual-live-conceptprocesreizen.png", fullPage: true });

  const rows = page.locator("tbody tr");
  const rowCount = await rows.count();
  out.push(`status=ok`);
  out.push(`conceptRows=${rowCount}`);

  if (rowCount > 0) {
    const rowText = (await rows.first().innerText()).replace(/\s+/g, " ");
    out.push(`firstRow=${rowText}`);
    await rows.first().click();
    await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "tmp/manual-live-conceptprocesreis-detail.png", fullPage: true });
    const detailText = await page.locator("body").innerText();
    out.push(`detailUrl=${page.url()}`);
    out.push(`hasGenericOldCopy=${detailText.includes("HubSpot ziet dit signaal en kan daardoor")}`);
    out.push(`hasWrongAssignCorrectStage=${detailText.includes("GitLab verwerkt dit als /properties/assign_correct_stage")}`);
    out.push(`hasWebhookPath=${/\/[a-z0-9_/-]+/.test(detailText)}`);
    out.push(`hasConcreteTrigger=${/eigenschap|dealstage|pipeline|formulier|lijst|trigger/i.test(detailText)}`);
    out.push(`hasGitLabHandler=${/handler [a-z0-9_]+/i.test(detailText)}`);
    out.push(`detailExcerpt=${detailText.replace(/\s+/g, " ").slice(0, 2500)}`);
  }

  out.push(`consoleIssues=${issues.length}`);
  issues.slice(0, 20).forEach((issue, index) => out.push(`console[${index}]=${issue.slice(0, 500)}`));
  fs.writeFileSync("tmp/manual-live-browser-test.txt", out.join("\n"));
  await browser.close();
})().catch((err) => {
  fs.writeFileSync("tmp/manual-live-browser-test.txt", `FAILED\n${err.stack || err.message}`);
  process.exit(1);
});
