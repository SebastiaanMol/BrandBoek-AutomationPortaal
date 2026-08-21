const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = "http://127.0.0.1:5180";
const AUTH_STATE = path.join(__dirname, "playwright-auth-state-live.json");
const RESULT = path.join(__dirname, "live-process-canvas-step-overflow-result.json");
const SCREENSHOT = path.join(__dirname, "live-process-canvas-step-overflow-final.png");
const AUTH_KEY = "sb-icvrrpxtycwgaxcajwdf-auth-token";

const now = new Date().toISOString();
const authToken = JSON.parse(fs.readFileSync(AUTH_STATE, "utf8"))
  .origins
  .flatMap((origin) => origin.localStorage)
  .find((item) => item.name === AUTH_KEY)?.value;

if (!authToken) throw new Error(`Missing ${AUTH_KEY} in ${AUTH_STATE}`);

const automationRows = Array.from({ length: 3 }, (_, index) => ({
  id: `auto-${index + 1}`,
  naam: `Automation ${index + 1}`,
  categorie: "Data beheer",
  doel: `Test ${index + 1}`,
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
  external_id: `live-step-overflow-auto-${index + 1}`,
  source: "hubspot",
  import_status: "approved",
  import_proposal: null,
}));
automationRows[0].status = "Uitgeschakeld";

const processStateRow = {
  id: "pipe-live-step-overflow-test",
  steps: [
    { id: "intake", label: "Intake", team: "sales", column: 0, row: 0 },
    { id: "controle", label: "Controle", team: "sales", column: 1, row: 0 },
  ],
  connections: [
    { id: "route", fromStepId: "intake", toStepId: "controle" },
  ],
  auto_links: {
    "auto-1": { kind: "step", stepId: "intake", order: 0 },
    "auto-2": { kind: "step", stepId: "intake", order: 2 },
    "auto-3": { kind: "step", stepId: "intake", order: 3 },
  },
  parked_steps: [],
  active_lanes: ["sales"],
  custom_lanes: [],
  flow_links: {
    "flow-1": { kind: "step", stepId: "intake", order: 1 },
  },
  attachments: [],
  artifacts: [],
  updated_at: now,
};

const pipelineRows = [
  {
    pipeline_id: "pipe-live-step-overflow-test",
    naam: "Live stap overflow test",
    stages: [
      { stage_id: "intake", label: "Intake", display_order: 0, metadata: {} },
      { stage_id: "controle", label: "Controle", display_order: 1, metadata: {} },
    ],
    synced_at: now,
    updated_at: now,
    beschrijving: "Live smoke voor stap overflow",
    is_active: true,
    source: "custom",
  },
];

const flowRows = [
  {
    id: "flow-1",
    naam: "Procesreis 1",
    beschrijving: "Live smoke procesreis",
    automationIds: ["auto-1"],
    automation_ids: ["auto-1"],
    systemen: ["HubSpot"],
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
    if (method === "PATCH" || method === "POST") return route.fulfill(json([processStateRow]));
    if (table === "pipelines") return route.fulfill(json(pipelineRows));
    if (table === "automatiseringen") return route.fulfill(json(automationRows));
    if (table === "koppelingen") return route.fulfill(json([]));
    if (table === "automation_source_findings") return route.fulfill(json([]));
    if (table === "flows") return route.fulfill(json(flowRows));
    if (table === "process_state") {
      const wantsSingle = request.headers()["accept"]?.includes("application/vnd.pgrst.object+json");
      return route.fulfill(json(wantsSingle ? processStateRow : [processStateRow]));
    }
    return route.fulfill(json([]));
  });

  await page.goto(`${BASE_URL}/procesviewer`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {});
  await page.getByText("Live stap overflow test").first().click();
  await page.locator("aside").getByRole("button", { name: /Bewerken/i }).click();
  await page.waitForSelector('g[aria-label="Automation Automation 1 op stap Intake"]', { timeout: 20_000 });

  const bottomPortCx = await page.locator('circle[aria-label="Verbindingspoort Intake onder"]').getAttribute("cx");
  const automationDot = page.locator('g[aria-label="Automation Automation 1 op stap Intake"] circle[fill="#fecaca"]').first();
  const flowDot = page.locator('g[aria-label="Procesreis Procesreis 1 op stap Intake"] circle[fill="#fecaca"]').first();
  const automationCx = await automationDot.getAttribute("cx");
  const hasRedAutomation = await automationDot.count();
  const hasRedFlow = await flowDot.count();

  await page.getByRole("button", { name: "1 extra plaatsing op stap Intake" }).click();
  await page.getByRole("button", { name: "Automation Automation 3 openen" }).click();
  await page.waitForTimeout(300);
  const selectedTextVisible = await page.getByText("Automation 3").count();

  await page.screenshot({ path: SCREENSHOT, fullPage: false });
  const result = {
    ok: bottomPortCx !== automationCx && hasRedAutomation > 0 && hasRedFlow > 0 && selectedTextVisible > 0,
    bottomPortCx,
    automationCx,
    hasRedAutomation,
    hasRedFlow,
    selectedTextVisible,
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
