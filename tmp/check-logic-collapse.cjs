const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
  const page = browser.contexts()[0].pages()[0];
  await page.goto("http://127.0.0.1:5173/flows/suggesties/AUTO-HS-1692171427__AUTO-076", { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  const body = await page.locator("body").innerText();
  console.log(`hasBewijs=${body.includes("Bewijs:")}`);
  console.log(`logicButtons=${await page.getByRole("button", { name: "Logica" }).count()}`);
  const hiddenLogicTextVisible = await page.locator('text=Trigger: dezelfde triggercriteria als het startsignaal').count();
  console.log(`logicTextNodes=${hiddenLogicTextVisible}`);
  await page.getByRole("button", { name: "Logica" }).nth(1).click();
  await page.waitForTimeout(250);
  const after = await page.locator("body").innerText();
  console.log(`afterOpenHasTriggerLogic=${after.includes("Trigger: dezelfde triggercriteria als het startsignaal")}`);
  await browser.close();
})();
