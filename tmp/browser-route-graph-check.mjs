import { chromium } from "@playwright/test";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
const context = browser.contexts()[0];
const page = context.pages()[0] ?? await context.newPage();

await page.goto("http://127.0.0.1:5173/flows#concepten", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const conceptTab = page.getByRole("tab", { name: /Conceptprocesreizen|Concepten/i });
if (await conceptTab.count()) await conceptTab.first().click();
await page.waitForTimeout(1000);

async function searchConcepts(query) {
  const input = page.getByLabel(/Zoek conceptreizen/i);
  if (await input.count()) {
    await input.fill(query);
    await page.waitForTimeout(500);
  }
  return page.locator("article").evaluateAll((articles) => (
    articles.map((article) => article.textContent?.replace(/\s+/g, " ").trim() ?? "")
  ));
}

const createNewDealArticles = await searchConcepts("Create new deal");
const trustooArticles = await searchConcepts("Trustoo");
const typeformArticles = await searchConcepts("typeform onboarding");

const result = {
  url: page.url(),
  createNewDeal: {
    count: createNewDealArticles.length,
    hasSpecificEndpoint: createNewDealArticles.some((text) => /New create deal|AUTO-GL-88cf40e9|create_new_deal/i.test(text)),
    hasGenericOperationsApi: createNewDealArticles.some((text) => /HubSpot Operations API/i.test(text)),
    sample: createNewDealArticles[0] ?? "",
  },
  trustoo: {
    count: trustooArticles.length,
    hasTrustooEndpoint: trustooArticles.some((text) => /Leads trustoo|\/sales\/leads\/hubspot\/trustoo/i.test(text)),
    sample: trustooArticles[0] ?? "",
  },
  typeform: {
    count: typeformArticles.length,
    hasOnboardingEndpoint: typeformArticles.some((text) => /Typeform onboarding|\/typeform\/onboarding/i.test(text)),
    sample: typeformArticles[0] ?? "",
  },
};

await page.screenshot({ path: "tmp/browser-route-graph-check.png", fullPage: true });
console.log(JSON.stringify(result, null, 2));
process.exit(0);
