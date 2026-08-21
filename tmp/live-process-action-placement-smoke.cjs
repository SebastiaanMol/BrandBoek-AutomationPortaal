const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5181";
const AUTH_STATE = path.join(__dirname, "playwright-auth-state-live.json");
const RESULT = path.join(__dirname, "live-process-action-placement-result.json");
const SCREENSHOT = path.join(__dirname, "live-process-action-placement-final.png");
const AUTH_KEY = "sb-icvrrpxtycwgaxcajwdf-auth-token";

const now = new Date().toISOString();
const authToken = JSON.parse(fs.readFileSync(AUTH_STATE, "utf8"))
  .origins
  .flatMap((origin) => origin.localStorage)
  .find((item) => item.name === AUTH_KEY)?.value;

if (!authToken) throw new Error(`Missing ${AUTH_KEY} in ${AUTH_STATE}`);

let lastSavedState = null;
let processStateRow = {
  id: "pipe-live-process-action-test",
  steps: [
    { id: "intake", label: "Intake", team: "sales", column: 0, row: 0 },
    { id: "controle", label: "Controle", team: "sales", column: 1, row: 0 },
  ],
  connections: [
    { id: "route", fromStepId: "intake", toStepId: "controle" },
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
    pipeline_id: "pipe-live-process-action-test",
    naam: "Live procesactie test",
    stages: [
      { stage_id: "intake", label: "Intake", display_order: 0, metadata: {} },
      { stage_id: "controle", label: "Controle", display_order: 1, metadata: {} },
    ],
    synced_at: now,
    updated_at: now,
    beschrijving: "Live smoke voor procesacties",
    is_active: true,
    source: "custom",
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
        const payload = request.postDataJSON();
        processStateRow = { ...processStateRow, ...payload };
        lastSavedState = processStateRow;
      }
      return route.fulfill(json([processStateRow]));
    }

    if (table === "pipelines") return route.fulfill(json(pipelineRows));
    if (table === "automatiseringen") return route.fulfill(json([]));
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

  await page.getByText("Live procesactie test").first().click();
  await page.locator("aside").getByRole("button", { name: /Bewerken/i }).click();
  await page.waitForSelector('[data-route-id="route"] path[stroke="transparent"]', { state: "attached", timeout: 20_000 });

  const template = page.getByText("Wachtstap").locator("xpath=ancestor::div[@draggable='true']").first();
  const routePath = page.locator('[data-route-id="route"] path[stroke="transparent"]').first();
  const routeBox = await routePath.boundingBox();
  const templateBox = await template.boundingBox();
  if (!routeBox || !templateBox) throw new Error("Missing route or process action template bounding box");

  await page.mouse.move(templateBox.x + templateBox.width / 2, templateBox.y + templateBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(routeBox.x + routeBox.width * 0.72, routeBox.y + routeBox.height / 2, { steps: 16 });
  await page.mouse.up();

  await page.waitForSelector('g[aria-label="Procesactie Wachtstap op lijn Intake naar Controle"]', { timeout: 10_000 });
  const actionDot = page.locator('g[aria-label="Procesactie Wachtstap op lijn Intake naar Controle"]').first();
  const actionBox = await actionDot.boundingBox();
  if (!actionBox) throw new Error("Missing placed process action dot bounding box");

  await actionDot.click();
  await page.getByText("Procesactie").first().waitFor({ timeout: 10_000 });
  await page.getByLabel("Procesactie beschrijving").fill("Wacht 3 dagen voordat de volgende stap start");

  await page.getByRole("button", { name: /Opslaan/i }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: SCREENSHOT, fullPage: false });

  const actionArtifacts = (lastSavedState?.artifacts ?? []).filter((item) => item.type === "processAction");
  const savedAction = actionArtifacts[0];
  const result = {
    ok: actionArtifacts.length === 1
      && savedAction?.actionType === "wait"
      && savedAction?.detail === "Wacht 3 dagen voordat de volgende stap start"
      && savedAction?.placement?.kind === "connection"
      && typeof savedAction?.placement?.position === "number",
    savedAction,
    actionBox,
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
