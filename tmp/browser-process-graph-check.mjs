import { chromium } from "@playwright/test";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
const context = browser.contexts()[0] ?? await browser.newContext();
const page = context.pages()[0] ?? await context.newPage();

await page.goto("http://127.0.0.1:5173/flows#concepten", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const conceptTab = page.getByRole("tab", { name: /Conceptprocesreizen/i });
if (await conceptTab.count()) {
  await conceptTab.click();
}
await page.waitForTimeout(2000);

const listText = await page.locator("body").innerText();
const articleCount = await page.locator('article[aria-label^="Conceptprocesreis"]').count();
const firstArticle = page.locator('article[aria-label^="Conceptprocesreis"]').first();
const firstArticleText = articleCount > 0 ? await firstArticle.innerText() : "";
await page.screenshot({ path: "tmp/browser-process-graph-concepts-after-fix.png", fullPage: true });

let detailText = "";
let detailUrl = page.url();
if (articleCount > 0) {
  await firstArticle.getByRole("button", { name: /Bekijk procesreis/i }).click();
  await page.waitForTimeout(2000);
  detailUrl = page.url();
  detailText = await page.locator("body").innerText();
  await page.screenshot({ path: "tmp/browser-process-graph-detail-after-fix.png", fullPage: true });
}

console.log(JSON.stringify({
  ok: articleCount > 0,
  articleCount,
  listUrl: "http://127.0.0.1:5173/flows#concepten",
  detailUrl,
  listHasGitLabBackendBlock: /GitLab backendblok/i.test(listText),
  detailHasGitLabBackendBlock: /GitLab backendblok/i.test(detailText),
  firstArticleHasAutomationCount: /\d+\s+automations/i.test(firstArticleText),
  firstArticleHasWebhookProof: /100%\s+webhook-match/i.test(firstArticleText),
  detailHasReview: /Klaar voor review|Bewijsstatus|100%\s+webhook-match/i.test(detailText),
  detailHasProbabilityLanguage: /88%|95%|waarschijnlijk|probability|likely/i.test(detailText),
  screenshots: [
    "tmp/browser-process-graph-concepts-after-fix.png",
    "tmp/browser-process-graph-detail-after-fix.png",
  ],
}, null, 2));

process.exit(0);
