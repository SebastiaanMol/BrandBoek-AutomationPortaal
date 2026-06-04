import fs from "node:fs";
import { chromium } from "@playwright/test";

const resultPath = "tmp/browser-conceptjourneys-open-result.json";
const screenshotPath = "tmp/browser-conceptjourneys-open-detail.png";
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
  detailUrl: "",
  detailHasReview: false,
  detailHasNotFound: false,
  text: "",
  screenshotPath,
  error: "",
};

try {
  await page.goto("http://localhost:5173/flows", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Conceptprocesreizen/i }).click();
  await page.waitForTimeout(1500);
  await page.locator('article[aria-label^="Conceptprocesreis"]').first().getByRole("button", { name: /Bekijk procesreis/i }).click();
  await page.waitForTimeout(2000);

  result.detailUrl = page.url();
  result.text = (await page.locator("body").innerText()).slice(0, 2000);
  result.detailHasReview = /Klaar voor review|Concept-procesreis|Wat gebeurt er in deze procesreis/i.test(result.text);
  result.detailHasNotFound = /niet gevonden|onvoldoende data/i.test(result.text);
  result.ok = result.detailUrl.includes("/flows/suggesties/") && result.detailHasReview && !result.detailHasNotFound;
  await page.screenshot({ path: screenshotPath, fullPage: true });
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error);
}

fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

await new Promise(() => {});
