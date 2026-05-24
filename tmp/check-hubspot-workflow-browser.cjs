const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto("http://127.0.0.1:5173/flows", { waitUntil: "domcontentloaded", timeout: 45000 });
  const result = await page.evaluate(async () => {
    const keys = Object.keys(localStorage).filter((k) => k.includes("supabase") || k.includes("auth"));
    const auth = keys.map((key) => [key, localStorage.getItem(key)]);
    const supabaseMod = await import('/src/integrations/supabase/client.ts');
    const { data, error } = await supabaseMod.supabase
      .from('automatiseringen')
      .select('id,naam,source,external_id,trigger_beschrijving,import_proposal,last_synced_at')
      .or('naam.ilike.%BTW 2 maanden geboekt%,naam.ilike.%btw%')
      .limit(10);
    return { keys, authPreview: auth.map(([k,v]) => [k, v?.slice(0,80)]), error: error?.message, count: data?.length ?? 0, data };
  });
  fs.writeFileSync("tmp/check-hubspot-workflow-browser.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((err) => { console.error(err); process.exit(1); });
