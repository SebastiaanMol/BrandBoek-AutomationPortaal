import fs from "node:fs";
import { chromium } from "@playwright/test";

const resultPath = "tmp/browser-conceptjourneys-chain-result.json";
const screenshotPath = "tmp/browser-conceptjourneys-chain.png";
const storageState = fs.existsSync("tmp/playwright-auth-state.json")
  ? "tmp/playwright-auth-state.json"
  : undefined;

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  storageState,
});
const page = await context.newPage();

const result = {
  ok: false,
  url: "",
  cardCount: 0,
  automationCountDistribution: {},
  maxAutomationCount: 0,
  examplesOverTwo: [],
  screenshotPath,
  error: "",
};

function parseAutomationCount(text) {
  const match = text.match(/(\d+)\s+automations/);
  return match ? Number(match[1]) : 0;
}

try {
  await page.goto("http://localhost:5173/flows", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Conceptprocesreizen/i }).click();
  await page.waitForTimeout(1500);

  const cards = page.locator('article[aria-label^="Conceptprocesreis"]');
  result.cardCount = await cards.count();
  const distribution = {};
  for (let i = 0; i < result.cardCount; i += 1) {
    const text = await cards.nth(i).innerText();
    const count = parseAutomationCount(text);
    distribution[count] = (distribution[count] ?? 0) + 1;
    result.maxAutomationCount = Math.max(result.maxAutomationCount, count);
    if (count > 2 && result.examplesOverTwo.length < 3) {
      result.examplesOverTwo.push(text.slice(0, 1200));
    }
  }
  result.automationCountDistribution = distribution;
  result.url = page.url();
  result.ok = result.cardCount > 0;
  await page.screenshot({ path: screenshotPath, fullPage: true });
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error);
}

fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

await new Promise(() => {});
