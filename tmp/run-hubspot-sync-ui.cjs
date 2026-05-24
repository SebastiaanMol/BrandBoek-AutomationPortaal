const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.newPage();
  const lines = [];
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) lines.push(`console:${msg.type()}:${msg.text()}`);
  });
  await page.goto("http://127.0.0.1:5173/imports", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
  lines.push(`url=${page.url()}`);
  if (page.url().includes("/login")) {
    lines.push("status=needs-login");
  } else {
    const button = page.getByRole("button", { name: /HubSpot synchroniseren/i });
    await button.waitFor({ timeout: 45000 });
    lines.push(`buttonText=${(await button.innerText()).replace(/\s+/g, " ")}`);
    await button.click();
    await page.waitForTimeout(3000);
    lines.push(`afterClick=${(await button.innerText()).replace(/\s+/g, " ")}`);
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const b = buttons.find((el) => /HubSpot synchroniseren|Bezig/.test(el.textContent || ""));
      return b && !/Bezig/.test(b.textContent || "");
    }, null, { timeout: 300000 }).catch((e) => lines.push(`waitResult=${e.message}`));
    await page.waitForTimeout(1500);
    lines.push(`finalButton=${(await button.innerText()).replace(/\s+/g, " ")}`);
    lines.push(`bodyExcerpt=${(await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 2000)}`);
    await page.screenshot({ path: "tmp/hubspot-sync-after-click.png", fullPage: true });
  }
  fs.writeFileSync("tmp/hubspot-sync-ui-result.txt", lines.join("\n"));
  await browser.close();
})().catch((err) => {
  fs.writeFileSync("tmp/hubspot-sync-ui-result.txt", `FAILED\n${err.stack || err.message}`);
  process.exit(1);
});
