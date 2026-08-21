const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = "http://127.0.0.1:5180";
const AUTH_STATE = path.join(__dirname, "playwright-auth-state-live.json");
const RESULT = path.join(__dirname, "live-process-canvas-line-reorder-result.json");
const SCREENSHOT = path.join(__dirname, "live-process-canvas-line-reorder-final.png");
const AUTH_KEY = "sb-icvrrpxtycwgaxcajwdf-auth-token";

const now = new Date().toISOString();
const authToken = JSON.parse(fs.readFileSync(AUTH_STATE, "utf8"))
  .origins
  .flatMap((origin) => origin.localStorage)
  .find((item) => item.name === AUTH_KEY)?.value;

if (!authToken) throw new Error(`Missing ${AUTH_KEY} in ${AUTH_STATE}`);

let lastSavedState = null;
let processStateRow = {
  id: "pipe-live-line-reorder-test",
  steps: [
    { id: "intake", label: "Intake", team: "sales", column: 0, row: 0 },
    { id: "controle", label: "Controle", team: "sales", column: 1, row: 0 },
  ],
  connections: [
    { id: "route", fromStepId: "intake", toStepId: "controle" },
  ],
  auto_links: {
    "auto-1": { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 0, position: 0.25 },
    "auto-2": { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 1, position: 0.45 },
  },
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
    pipeline_id: "pipe-live-line-reorder-test",
    naam: "Live lijn volgorde test",
    stages: [
      { stage_id: "intake", label: "Intake", display_order: 0, metadata: {} },
      { stage_id: "controle", label: "Controle", display_order: 1, metadata: {} },
    ],
    synced_at: now,
    updated_at: now,
    beschrijving: "Live smoke voor volgorde op lijn",
    is_active: true,
    source: "custom",
  },
];

const automationRows = [
  {
    id: "auto-1",
    naam: "Eerste automation",
    categorie: "Data beheer",
    doel: "Test 1",
    trigger_beschrijving: "Handmatige test",
    systemen: ["HubSpot"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeen: "",
    mermaid_diagram: "",
    fasen: [],
    created_at: now,
    laatst_geverifieerd: now,
    geverifieerd_door: "Playwright",
    external_id: "live-line-auto-1",
    source: "hubspot",
    import_status: "approved",
    import_proposal: null,
  },
  {
    id: "auto-2",
    naam: "Tweede automation",
    categorie: "Data beheer",
    doel: "Test 2",
    trigger_beschrijving: "Handmatige test",
    systemen: ["HubSpot"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeen: "",
    mermaid_diagram: "",
    fasen: [],
    created_at: now,
    laatst_geverifieerd: now,
    geverifieerd_door: "Playwright",
    external_id: "live-line-auto-2",
    source: "hubspot",
    import_status: "approved",
    import_proposal: null,
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
  const match = url.pathname.match(/\/rest\/v1\/([^/?]+)/);
  return match?.[1] ?? "";
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
    if (method === "PATCH" || method === "POST") {
      if (table === "process_state") {
        try {
          const payload = request.postDataJSON();
          processStateRow = { ...processStateRow, ...payload };
          lastSavedState = processStateRow;
        } catch {}
      }
      return route.fulfill(json([processStateRow]));
    }

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

  await page.goto(`${BASE_URL}/procesviewer`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {});

  await page.getByText("Live lijn volgorde test").first().click();
  await page.locator("aside").getByRole("button", { name: /Bewerken/i }).click();
  await page.waitForSelector('g[aria-label="Automation Tweede automation op lijn Intake naar Controle"]', { timeout: 20_000 });

  const secondDot = page.locator('g[aria-label="Automation Tweede automation op lijn Intake naar Controle"] foreignObject div[draggable="true"]').first();
  const routePath = page.locator('[data-route-id="route"] path[stroke="transparent"]').first();
  const routeBox = await routePath.boundingBox();
  const dotBox = await secondDot.boundingBox();
  if (!routeBox || !dotBox) throw new Error("Missing route or second automation dot bounding box");

  const dropFurtherRight = {
    x: routeBox.x + routeBox.width - 14,
    y: routeBox.y + routeBox.height / 2,
  };
  await page.mouse.move(dotBox.x + dotBox.width / 2, dotBox.y + dotBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dropFurtherRight.x, dropFurtherRight.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(800);

  await page.getByRole("button", { name: /Opslaan/i }).click();
  await page.waitForTimeout(800);

  await page.screenshot({ path: SCREENSHOT, fullPage: false });
  const auto1Order = lastSavedState?.auto_links?.["auto-1"]?.order;
  const auto2Order = lastSavedState?.auto_links?.["auto-2"]?.order;
  const auto2Position = lastSavedState?.auto_links?.["auto-2"]?.position;
  const result = {
    ok: auto1Order === 0 && auto2Order === 1 && typeof auto2Position === "number" && auto2Position > 0.65,
    auto1Order,
    auto2Order,
    auto2Position,
    autoLinks: lastSavedState?.auto_links ?? null,
    routeBox,
    screenshot: SCREENSHOT,
    issues: issues.slice(0, 20),
  };
  fs.writeFileSync(RESULT, JSON.stringify(result, null, 2));
  await browser.close();
  if (!result.ok) process.exit(1);
}

main().catch(async (err) => {
  fs.writeFileSync(RESULT, JSON.stringify({ ok: false, error: err.stack || err.message }, null, 2));
  process.exit(1);
});
