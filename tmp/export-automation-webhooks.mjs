import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "exports");
const STAGING_DIR = path.join(ROOT, "tmp", "automation-webhooks-xlsx");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "automation-webhooks-endpoints-2026-05-29.xlsx");
const SOURCES = ["hubspot", "zapier", "typeform", "gitlab"];

function readEnv() {
  const envPath = path.join(ROOT, ".env");
  const pairs = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf("=");
      const key = line.slice(0, index);
      const value = line.slice(index + 1).replace(/^"|"$/g, "");
      return [key, value];
    });
  return Object.fromEntries(pairs);
}

async function getAccessTokenFromLiveBrowser() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto("http://127.0.0.1:5173/alle", { waitUntil: "domcontentloaded" });

  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => (
      item.startsWith("sb-") && item.endsWith("-auth-token")
    ));
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw).access_token ?? null;
  });
}

async function fetchAutomations() {
  const env = readEnv();
  const accessToken = await getAccessTokenFromLiveBrowser();
  if (!accessToken) {
    throw new Error("Geen ingelogde Supabase sessie gevonden in de live browser.");
  }

  const select = [
    "id",
    "naam",
    "source",
    "categorie",
    "status",
    "trigger_beschrijving",
    "stappen",
    "import_status",
    "import_proposal",
    "endpoints",
    "external_id",
    "gitlab_file_path",
    "gitlab_last_commit",
    "last_synced_at",
    "hubspot_last_run_at",
    "hubspot_run_count_365d",
    "created_at",
  ].join(",");

  const url = `${env.VITE_SUPABASE_URL}/rest/v1/automatiseringen?select=${encodeURIComponent(select)}&order=created_at.asc`;
  const response = await fetch(url, {
    headers: {
      apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase export fetch failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

function getSource(row) {
  const source = String(row.source ?? "").toLowerCase();
  if (source === "hubspot" || row.categorie === "HubSpot Workflow") return "hubspot";
  if (source === "zapier" || row.categorie === "Zapier Zap") return "zapier";
  if (source === "typeform" || row.categorie === "Typeform") return "typeform";
  if (source === "gitlab" || row.gitlab_file_path || row.import_proposal?.gitlab_endpoint) return "gitlab";
  return null;
}

function normalizeWebhookRoute(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";

  const withoutMethod = trimmed.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "");
  let route = withoutMethod;
  try {
    if (/^https?:\/\//i.test(withoutMethod)) {
      route = new URL(withoutMethod).pathname;
    }
  } catch {
    route = withoutMethod.replace(/^https?:\/\/[^/]+/i, "");
  }

  return route
    .replace(/^https?:\/\/[^/]+/i, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/g, "")
    .trim()
    .toLowerCase();
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function addRoute(routes, input) {
  const route = String(input.route ?? "").trim();
  if (!route) return;
  routes.push({
    type: input.type,
    direction: input.direction,
    method: input.method ?? "",
    route,
    normalized: normalizeWebhookRoute(route),
    active: input.active ?? "",
    origin: input.origin ?? "",
    detail: input.detail ?? "",
  });
}

function extractWebhookRoutesFromText(values) {
  return values.flatMap((value) => {
    const text = String(value ?? "").trim();
    if (!text || !/(webhook|endpoint|\bGET\b|\bPOST\b|\bPUT\b|\bPATCH\b|\bDELETE\b)/i.test(text)) return [];
    const urls = text.match(/https?:\/\/[^\s'"<>]+/gi) ?? [];
    if (urls.length > 0) return urls.map(cleanRouteCandidate);
    return (text.match(/\/[a-z0-9][a-z0-9/_{}:-]+/gi) ?? []).map(cleanRouteCandidate);
  });
}

function cleanRouteCandidate(value) {
  return String(value ?? "").trim().replace(/[.,;:)\]}]+$/g, "");
}

function collectRowsForAutomation(row) {
  const importProposal = row.import_proposal ?? {};
  const source = getSource(row);
  const routes = [];

  for (const route of importProposal.webhookPaths ?? []) {
    addRoute(routes, {
      type: "Webhook",
      direction: source === "gitlab" ? "Onbekend" : "Uitgaand",
      route,
      origin: "import_proposal.webhookPaths",
    });
  }

  for (const route of extractWebhookRoutesFromText([
    ...(Array.isArray(row.stappen) ? row.stappen : []),
    ...(Array.isArray(importProposal.stappen) ? importProposal.stappen : []),
    ...(Array.isArray(importProposal.beschrijving_in_simpele_taal)
      ? importProposal.beschrijving_in_simpele_taal
      : []),
  ])) {
    addRoute(routes, {
      type: "Webhook/endpoint uit tekst",
      direction: source === "gitlab" ? "Onbekend" : "Uitgaand",
      route,
      origin: "stappen/beschrijving",
    });
  }

  collectHubSpotRoutes(importProposal, routes);
  collectZapierRoutes(importProposal, routes);
  collectTypeformRoutes(importProposal, routes);
  collectGitLabRoutes(row, importProposal, routes);

  const dedupedRoutes = uniqueBy(
    routes,
    (route) => `${route.type}|${route.direction}|${route.method}|${route.route}|${route.origin}`,
  );

  const base = {
    "Automation ID": row.id,
    "Naam": row.naam,
    "Bron": sourceLabel(source),
    "Status": row.status ?? "",
    "Categorie": row.categorie ?? "",
    "External ID": row.external_id ?? "",
    "Import status": row.import_status ?? "",
    "Trigger": row.trigger_beschrijving ?? "",
    "Laatste sync": formatDate(row.last_synced_at),
  };

  if (dedupedRoutes.length === 0) {
    return [{
      ...base,
      "Route type": "Geen",
      "Richting": "",
      "Methode": "",
      "Webhook/endpoint": "Geen webhook/endpoint gevonden",
      "Genormaliseerd path": "",
      "Actief": "",
      "Bronveld": "",
      "Detail": "",
    }];
  }

  return dedupedRoutes.map((route, index) => ({
    ...base,
    "Route nr.": String(index + 1),
    "Route type": route.type,
    "Richting": route.direction,
    "Methode": route.method,
    "Webhook/endpoint": route.route,
    "Genormaliseerd path": route.normalized,
    "Actief": route.active,
    "Bronveld": route.origin,
    "Detail": route.detail,
  }));
}

function collectHubSpotRoutes(importProposal, routes) {
  const workflow = importProposal.hubspot_workflow ?? {};
  const actions = [
    ...(Array.isArray(workflow.actions) ? workflow.actions : []),
    ...(Array.isArray(workflow.branches)
      ? workflow.branches.flatMap((branch) => Array.isArray(branch.actions) ? branch.actions : [])
      : []),
  ];

  for (const action of actions) {
    addRoute(routes, {
      type: "HubSpot webhook action",
      direction: "Uitgaand",
      method: action.webhookMethod ?? "",
      route: action.webhookPath || action.webhookUrl,
      active: "",
      origin: "hubspot_workflow.actions",
      detail: action.label ?? action.type ?? "",
    });
  }
}

function collectZapierRoutes(importProposal, routes) {
  const zap = importProposal.zap ?? {};
  const process = zap.process ?? {};
  for (const handoff of process.webhookHandoffs ?? []) {
    addRoute(routes, {
      type: "Zapier webhook handoff",
      direction: "Uitgaand",
      method: handoff.method ?? "",
      route: handoff.path,
      active: "",
      origin: "zap.process.webhookHandoffs",
      detail: handoff.host ? `Host: ${handoff.host}` : "",
    });
  }

  const steps = [
    ...(Array.isArray(process.steps) ? process.steps : []),
    ...(Array.isArray(zap.steps) ? zap.steps : []),
  ];
  for (const step of steps) {
    for (const route of step.webhookPaths ?? []) {
      addRoute(routes, {
        type: "Zapier step webhook",
        direction: "Uitgaand",
        method: "",
        route,
        active: "",
        origin: "zap.process.steps[].webhookPaths",
        detail: [step.appName, step.title].filter(Boolean).join(" - "),
      });
    }
    for (const handoff of step.webhookHandoffs ?? []) {
      addRoute(routes, {
        type: "Zapier step webhook",
        direction: "Uitgaand",
        method: handoff.method ?? "",
        route: handoff.path,
        active: "",
        origin: "zap.process.steps[].webhookHandoffs",
        detail: [step.appName, step.title, handoff.host].filter(Boolean).join(" - "),
      });
    }
  }
}

function collectTypeformRoutes(importProposal, routes) {
  const typeform = importProposal.typeform ?? {};
  for (const webhook of typeform.webhooks ?? []) {
    addRoute(routes, {
      type: "Typeform webhook",
      direction: "Uitgaand",
      method: "POST",
      route: webhook.path,
      active: webhook.enabled === true ? "Ja" : webhook.enabled === false ? "Nee" : "",
      origin: "typeform.webhooks",
      detail: [webhook.tag, webhook.host, ...(webhook.eventTypes ?? [])].filter(Boolean).join(" | "),
    });
  }
  for (const handoff of typeform.process?.webhookHandoffs ?? []) {
    addRoute(routes, {
      type: "Typeform webhook handoff",
      direction: "Uitgaand",
      method: handoff.method ?? "",
      route: handoff.path,
      active: "",
      origin: "typeform.process.webhookHandoffs",
      detail: handoff.host ? `Host: ${handoff.host}` : "",
    });
  }
  for (const step of typeform.process?.steps ?? []) {
    for (const route of step.webhookPaths ?? []) {
      addRoute(routes, {
        type: "Typeform step webhook",
        direction: "Uitgaand",
        method: "",
        route,
        active: "",
        origin: "typeform.process.steps[].webhookPaths",
        detail: step.title ?? "",
      });
    }
  }
}

function collectGitLabRoutes(row, importProposal, routes) {
  const endpoint = importProposal.gitlab_endpoint ?? importProposal.gitlab?.endpoint ?? {};
  addRoute(routes, {
    type: "GitLab/API endpoint",
    direction: "Ontvangend",
    method: endpoint.method ?? "",
    route: endpoint.endpoint ?? endpoint.path,
    origin: "gitlab_endpoint",
    detail: [endpoint.handler, endpoint.api_file].filter(Boolean).join(" | "),
  });

  for (const route of row.endpoints ?? []) {
    addRoute(routes, {
      type: "GitLab/API endpoint",
      direction: "Ontvangend",
      method: "",
      route,
      origin: "automatiseringen.endpoints",
      detail: row.gitlab_file_path ?? row.external_id ?? "",
    });
  }

  const externalId = String(row.external_id ?? "");
  if (externalId.includes("::")) {
    const possibleRoute = externalId.split("::").at(-1);
    if (possibleRoute?.startsWith("/")) {
      addRoute(routes, {
        type: "GitLab/API endpoint",
        direction: "Ontvangend",
        method: "",
        route: possibleRoute,
        origin: "external_id",
        detail: row.gitlab_file_path ?? "",
      });
    }
  }
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

function sourceLabel(source) {
  if (source === "hubspot") return "HubSpot";
  if (source === "zapier") return "Zapier";
  if (source === "typeform") return "Typeform";
  if (source === "gitlab") return "GitLab";
  return "";
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellRef(columnIndex, rowIndex) {
  let n = columnIndex + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return `${name}${rowIndex}`;
}

function worksheetXml(rows) {
  const headers = [
    "Automation ID",
    "Naam",
    "Bron",
    "Status",
    "Categorie",
    "External ID",
    "Import status",
    "Trigger",
    "Laatste sync",
    "Route nr.",
    "Route type",
    "Richting",
    "Methode",
    "Webhook/endpoint",
    "Genormaliseerd path",
    "Actief",
    "Bronveld",
    "Detail",
  ];
  const allRows = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))];
  const sheetRows = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => (
      `<c r="${cellRef(columnIndex, rowIndex + 1)}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`
    )).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:R${allRows.length}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>
    <col min="1" max="1" width="18" customWidth="1"/>
    <col min="2" max="2" width="42" customWidth="1"/>
    <col min="3" max="9" width="18" customWidth="1"/>
    <col min="10" max="10" width="10" customWidth="1"/>
    <col min="11" max="13" width="22" customWidth="1"/>
    <col min="14" max="15" width="52" customWidth="1"/>
    <col min="16" max="18" width="26" customWidth="1"/>
  </cols>
  <sheetData>${sheetRows}</sheetData>
  <autoFilter ref="A1:R${allRows.length}"/>
</worksheet>`;
}

function writeXlsx(sheets) {
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(STAGING_DIR, "_rels"), { recursive: true });
  fs.mkdirSync(path.join(STAGING_DIR, "xl", "_rels"), { recursive: true });
  fs.mkdirSync(path.join(STAGING_DIR, "xl", "worksheets"), { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  fs.writeFileSync(path.join(STAGING_DIR, "[Content_Types].xml"), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n  ")}
</Types>`);

  fs.writeFileSync(path.join(STAGING_DIR, "_rels", ".rels"), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);

  fs.writeFileSync(path.join(STAGING_DIR, "xl", "workbook.xml"), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("\n    ")}
  </sheets>
</workbook>`);

  fs.writeFileSync(path.join(STAGING_DIR, "xl", "_rels", "workbook.xml.rels"), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("\n  ")}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

  fs.writeFileSync(path.join(STAGING_DIR, "xl", "styles.xml"), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`);

  sheets.forEach((sheet, index) => {
    fs.writeFileSync(
      path.join(STAGING_DIR, "xl", "worksheets", `sheet${index + 1}.xml`),
      worksheetXml(sheet.rows),
    );
  });

  const zipPath = `${OUTPUT_FILE}.zip`;
  fs.rmSync(OUTPUT_FILE, { force: true });
  fs.rmSync(zipPath, { force: true });
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    [
      "Add-Type -AssemblyName System.IO.Compression",
      "Add-Type -AssemblyName System.IO.Compression.FileSystem",
      `$zip = [System.IO.Compression.ZipFile]::Open('${zipPath.replace(/'/g, "''")}', [IO.Compression.ZipArchiveMode]::Create)`,
      "try {",
      `  $root = '${STAGING_DIR.replace(/'/g, "''")}'`,
      "  Get-ChildItem -LiteralPath $root -Recurse -File | ForEach-Object {",
      "    $entryName = $_.FullName.Substring($root.Length + 1).Replace('\\', '/')",
      "    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null",
      "  }",
      "} finally {",
      "  $zip.Dispose()",
      "}",
    ].join("; "),
  ], { stdio: "inherit" });
  fs.renameSync(zipPath, OUTPUT_FILE);
}

const automations = await fetchAutomations();
const sourceRows = Object.fromEntries(SOURCES.map((source) => [source, []]));

for (const row of automations) {
  const source = getSource(row);
  if (!sourceRows[source]) continue;
  sourceRows[source].push(...collectRowsForAutomation(row));
}

const sheets = [
  { name: "HubSpot", rows: sourceRows.hubspot },
  { name: "Zapier", rows: sourceRows.zapier },
  { name: "Typeform", rows: sourceRows.typeform },
  { name: "GitLab", rows: sourceRows.gitlab },
];

writeXlsx(sheets);

console.log(JSON.stringify({
  output: OUTPUT_FILE,
  automationCounts: Object.fromEntries(SOURCES.map((source) => [
    source,
    automations.filter((row) => getSource(row) === source).length,
  ])),
  rowCounts: Object.fromEntries(sheets.map((sheet) => [sheet.name, sheet.rows.length])),
}, null, 2));
process.exit(0);
