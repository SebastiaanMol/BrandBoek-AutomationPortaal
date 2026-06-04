import fs from "node:fs";
import { chromium } from "@playwright/test";

const resultPath = "tmp/browser-conceptjourneys-result.json";
const screenshotPath = "tmp/browser-conceptjourneys-cards.png";
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
  reviewListVisible: false,
  searchVisible: false,
  cardCount: 0,
  firstCardText: "",
  screenshotPath,
  error: "",
};

try {
  await page.goto("http://localhost:5173/flows", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Conceptprocesreizen/i }).click();
  await page.waitForTimeout(1000);

  const reviewList = page.getByRole("region", { name: "Conceptprocesreizen reviewlijst" });
  result.reviewListVisible = await reviewList.isVisible().catch(() => false);
  result.searchVisible = await page.getByLabel("Zoek conceptreizen").isVisible().catch(() => false);
  result.cardCount = await page.locator('article[aria-label^="Conceptprocesreis"]').count();
  result.firstCardText = result.cardCount > 0
    ? (await page.locator('article[aria-label^="Conceptprocesreis"]').first().innerText()).slice(0, 1200)
    : "";
  result.url = page.url();
  result.ok = result.reviewListVisible && result.searchVisible;

  await page.screenshot({ path: screenshotPath, fullPage: true });
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error);
}

fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

await new Promise(() => {});
