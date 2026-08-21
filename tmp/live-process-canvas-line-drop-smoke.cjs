const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = "http://127.0.0.1:5180";
const AUTH_STATE = path.join(__dirname, "playwright-auth-state-live.json");
const RESULT = path.join(__dirname, "live-process-canvas-line-drop-result.json");
const SCREENSHOT = path.join(__dirname, "live-process-canvas-line-drop-final.png");
const AUTH_KEY = "sb-icvrrpxtycwgaxcajwdf-auth-token";

const now = new Date().toISOString();
const authToken = JSON.parse(fs.readFileSync(AUTH_STATE, "utf8"))
  .origins
  .flatMap((origin) => origin.localStorage)
  .find((item) => item.name === AUTH_KEY)?.value;

if (!authToken) throw new Error(`Missing ${AUTH_KEY} in ${AUTH_STATE}`);

let processStateRow = {
  id: "pipe-live-line-test",
  steps: [
    { id: "intake", label: "Intake", team: "sales", column: 0, row: 0 },
    { id: "controle", label: "Controle", team: "sales", column: 1, row: 0 },
  ],
  connections: [
    { id: "route", fromStepId: "intake", toStepId: "controle" },
  ],
  auto_links: {
    "auto-live": { kind: "step", stepId: "intake", order: 0 },
  },
  parked_steps: [],
  active_lanes: ["sales"],
  custom_lanes: [],
  flow_links: {
    "flow-live": { kind: "step", stepId: "intake", order: 1 },
  },
  attachments: [],
  artifacts: [],
  updated_at: now,
};

const pipelineRows = [
  {
    pipeline_id: "pipe-live-line-test",
    naam: "Live lijn sleep test",
    stages: [
      { stage_id: "intake", label: "Intake", display_order: 0, metadata: {} },
      { stage_id: "controle", label: "Controle", display_order: 1, metadata: {} },
    ],
    synced_at: now,
    updated_at: now,
    beschrijving: "Live smoke voor lijnplaatsing",
    is_active: true,
    source: "custom",
  },
];

const automationRows = [
  {
    id: "auto-live",
    naam: "Live automation",
    categorie: "Data beheer",
    doel: "Test",
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
    external_id: "live-line-auto",
    source: "hubspot",
    import_status: "approved",
    import_proposal: null,
  },
];

const flowRows = [
  {
    id: "flow-live",
    naam: "Live procesreis",
    beschrijving: "Test procesreis",
    systemen: ["HubSpot"],
    automation_ids: [],
    created_at: now,
    updated_at: now,
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
        } catch {}
      }
      return route.fulfill(json([processStateRow]));
    }

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

  await page.getByText("Live lijn sleep test").first().click();
  await page.locator("aside").getByRole("button", { name: /Bewerken/i }).click();
  await page.waitForSelector('g[aria-label="Automation Live automation op stap Intake"]', { timeout: 20_000 });

  const linkedAutomationRow = page.getByTestId("linked-automation-auto-live");
  const routePath = page.locator('[data-route-id="route"] path[stroke="transparent"]').first();
  const routeBox = await routePath.boundingBox();
  const linkedRowBox = await linkedAutomationRow.boundingBox();
  if (!routeBox || !linkedRowBox) throw new Error("Missing route or linked automation row bounding box");

  const routePoint = {
    x: routeBox.x + routeBox.width / 2,
    y: routeBox.y + routeBox.height / 2,
  };
  await page.mouse.move(linkedRowBox.x + linkedRowBox.width / 2, linkedRowBox.y + linkedRowBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(routePoint.x, routePoint.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);

  const attachedToLine = await page.locator('g[aria-label="Automation Live automation op lijn Intake naar Controle"]').count();
  await page.getByRole("button", { name: "Automation Live automation loskoppelen" }).click();
  await page.waitForTimeout(300);
  const detachedAfterListButton = await page.locator('g[aria-label="Automation Live automation op lijn Intake naar Controle"]').count() === 0
    && await page.getByText("Geen losse automations").count() === 0;

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {});
  await page.getByText("Live lijn sleep test").first().click();
  await page.locator("aside").getByRole("button", { name: /Bewerken/i }).click();
  await page.waitForSelector('g[aria-label="Automation Live automation op stap Intake"]', { timeout: 20_000 });

  const stepDotAgain = page.locator('g[aria-label="Automation Live automation op stap Intake"] foreignObject div[draggable="true"]').first();
  const routePathAgain = page.locator('[data-route-id="route"] path[stroke="transparent"]').first();
  const routeBoxAgain = await routePathAgain.boundingBox();
  const dotBoxAgain = await stepDotAgain.boundingBox();
  if (!routeBoxAgain || !dotBoxAgain) throw new Error("Missing route or automation dot bounding box on second run");

  const offLinePoint = {
    x: routeBoxAgain.x + routeBoxAgain.width / 2,
    y: routeBoxAgain.y + routeBoxAgain.height + 40,
  };
  await page.mouse.move(dotBoxAgain.x + dotBoxAgain.width / 2, dotBoxAgain.y + dotBoxAgain.height / 2);
  await page.mouse.down();
  await page.mouse.move(offLinePoint.x, offLinePoint.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);

  const stillOnStepAfterOffLineDrop = await page.locator('g[aria-label="Automation Live automation op stap Intake"]').count();
  const lineCountAfterOffLineDrop = await page.locator('g[aria-label="Automation Live automation op lijn Intake naar Controle"]').count();
  const automationRadius = await page.locator('g[aria-label="Automation Live automation op stap Intake"] circle').nth(1).getAttribute("r").catch(() => null);
  const flowRadius = await page.locator('g[aria-label="Procesreis Live procesreis op stap Intake"] circle').nth(1).getAttribute("r").catch(() => null);

  await page.screenshot({ path: SCREENSHOT, fullPage: false });
  const result = {
    ok: attachedToLine === 1 && detachedAfterListButton && stillOnStepAfterOffLineDrop === 1 && lineCountAfterOffLineDrop === 0 && automationRadius === flowRadius,
    attachedToLine,
    detachedAfterListButton,
    stillOnStepAfterOffLineDrop,
    lineCountAfterOffLineDrop,
    automationRadius,
    flowRadius,
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
