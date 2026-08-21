const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5181";
const AUTH_STATE = path.join(__dirname, "playwright-auth-state-live.json");
const RESULT = path.join(__dirname, "live-unassigned-active-filter-result.json");
const SCREENSHOT = path.join(__dirname, "live-unassigned-active-filter-final.png");
const AUTH_KEY = "sb-icvrrpxtycwgaxcajwdf-auth-token";

const now = new Date().toISOString();
const authToken = JSON.parse(fs.readFileSync(AUTH_STATE, "utf8"))
  .origins
  .flatMap((origin) => origin.localStorage)
  .find((item) => item.name === AUTH_KEY)?.value;

if (!authToken) throw new Error(`Missing ${AUTH_KEY} in ${AUTH_STATE}`);

const processStateRow = {
  id: "pipe-live-active-filter-test",
  steps: [
    { id: "start", label: "Start", team: "sales", column: 0, row: 0 },
    { id: "done", label: "Klaar", team: "sales", column: 1, row: 0 },
  ],
  connections: [
    { id: "route", fromStepId: "start", toStepId: "done" },
  ],
  auto_links: {},
  parked_steps: [],
  active_lanes: ["sales"],
  custom_lanes: [],
  flow_links: {},
  attachments: [],
  artifacts: [],
  updated_at: now,
};

const pipelineRows = [
  {
    pipeline_id: "pipe-live-active-filter-test",
    naam: "Live actieve workflow filter test",
    stages: [
      { stage_id: "start", label: "Start", display_order: 0, metadata: {} },
      { stage_id: "done", label: "Klaar", display_order: 1, metadata: {} },
    ],
    synced_at: now,
    updated_at: now,
    beschrijving: "Live smoke voor losse actieve workflows",
    is_active: true,
    source: "custom",
  },
];

const automationRows = [
  {
    id: "auto-active-live",
    naam: "Actieve losse workflow",
    status: "Actief",
    fasen: ["Sales"],
    systemen: ["HubSpot"],
    doel: "Moet zichtbaar zijn",
  },
  {
    id: "auto-disabled-live",
    naam: "Uitgeschakelde losse workflow",
    status: "Uitgeschakeld",
    fasen: ["Sales"],
    systemen: ["HubSpot"],
    doel: "Mag niet zichtbaar zijn",
  },
];

function json(body) {
  return {
    status: 200,
    headers: {
      "access-control-allow-origin": "*",
      "content-type": "application/json",
      "content-range": `0-${Array.isArray(body) ? Math.max(0, body.length - 1) : 0}/${Array.isArray(body) ? body.length : 1}`,
    },
    body: JSON.stringify(body),
  };
}

function tableFromUrl(url) {
  return url.pathname.match(/\/rest\/v1\/([^/?]+)/)?.[1] ?? "";
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, value);
  }, { key: AUTH_KEY, value: authToken });

  const page = await context.newPage();
  const issues = [];
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) issues.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => issues.push(`pageerror: ${err.message}`));

  await page.route("**/auth/v1/user**", (route) => route.fulfill(json({
    id: "33b526bc-fb88-4247-b6d3-479948f2aa28",
    aud: "authenticated",
    role: "authenticated",
    email: "sebastiaan.mol@brandboekhouders.nl",
  })));

  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = tableFromUrl(url);
    const method = request.method();

    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    if (method === "PATCH" || method === "POST") return route.fulfill(json([processStateRow]));

    if (table === "pipelines") return route.fulfill(json(pipelineRows));
    if (table === "automatiseringen") return route.fulfill(json(automationRows));
    if (table === "koppelingen") return route.fulfill(json([]));
    if (table === "automation_source_findings") return route.fulfill(json([]));
    if (table === "flows") return route.fulfill(json([]));
    if (table === "process_state") {
      const wantsSingle = request.headers()["accept"]?.includes("application/vnd.pgrst.object+json");
      return route.fulfill(json(wantsSingle ? processStateRow : [processStateRow]));
    }

    return route.fulfill(json([]));
  });

  await page.goto(`${BASE_URL}/`, { waitUntil: "commit", timeout: 45_000 });
  await page.evaluate(() => {
    window.history.pushState({}, "", "/procesviewer");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {});

  await page.getByText("Live actieve workflow filter test").first().click();
  await page.locator("aside").getByRole("button", { name: /Bewerken/i }).click();
  await page.getByRole("button", { name: /Losse automations/i }).click();

  const looseSection = page.getByRole("region", { name: /Losse automations/i });
  await looseSection.getByText("Actieve losse workflow").waitFor({ timeout: 10_000 });
  const disabledCount = await looseSection.getByText("Uitgeschakelde losse workflow").count();
  await page.screenshot({ path: SCREENSHOT, fullPage: false });

  const result = {
    ok: disabledCount === 0,
    disabledCount,
    screenshot: SCREENSHOT,
    issues: issues.slice(0, 20),
  };
  fs.writeFileSync(RESULT, JSON.stringify(result, null, 2));
  await browser.close();
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  fs.writeFileSync(RESULT, JSON.stringify({ ok: false, error: err.stack || err.message }, null, 2));
  process.exit(1);
});
