#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const technicalTerms = [
  /POST\s+\//i,
  /\bendpoint\b/i,
  /\bhandler\b/i,
  /\bpayload\b/i,
  /\bruntime\b/i,
  /\bcall graph\b/i,
  /\bAPI\b/,
  /\bwebhook\b/i,
];

const englishAnalysisTerms = [
  /\bdepends on\b/i,
  /\bcan update\b/i,
  /\bmatching\b/i,
  /\bpayload\b/i,
  /\bruntime state\b/i,
  /\bworker analysis\b/i,
  /\bcall graph\b/i,
];

const businessOutcomeTerms = [
  /\bHubSpot\b.*\b(bijgewerkt|zichtbaar|status|eigenschap|dealgegevens|informatie)\b/i,
  /\bWeFact\b.*\b(bijgewerkt|aangemaakt|debiteur|facturatie)\b/i,
  /\bportaal\b.*\b(bijgewerkt|zichtbaar|klaar|informatie)\b/i,
  /\bmedewerker\b.*\b(ziet|merkt|weet|kan)\b/i,
  /\bklant\b.*\b(dossier|deal|gegevens|status)\b/i,
  /\bdossier\b.*\b(status|informatie|bijgewerkt|klaar)\b/i,
];

function readEnv() {
  if (!existsSync(".env")) {
    throw new Error("Geen .env gevonden. Dit script heeft VITE_SUPABASE_URL en VITE_SUPABASE_PUBLISHABLE_KEY nodig.");
  }

  return Object.fromEntries(
    readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [
          line.slice(0, index),
          line.slice(index + 1).trim().replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
}

function readSessionAccessToken() {
  const statePath = "tmp/playwright-auth-state.json";
  if (!existsSync(statePath)) {
    throw new Error("Geen tmp/playwright-auth-state.json gevonden. Log eerst lokaal in of maak een Playwright storageState.");
  }

  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const storedSession = state.origins?.[0]?.localStorage?.find((entry) =>
    entry.name.includes("auth-token")
  )?.value;
  if (!storedSession) throw new Error("Geen Supabase auth-token gevonden in tmp/playwright-auth-state.json.");

  return JSON.parse(storedSession).access_token;
}

export function scoreFlowCopy(flow) {
  const description = flow.beschrijving ?? "";
  const issues = [];
  const matchedTechnicalTerms = technicalTerms
    .filter((pattern) => pattern.test(description))
    .map((pattern) => pattern.source);
  const matchedEnglishTerms = englishAnalysisTerms
    .filter((pattern) => pattern.test(description))
    .map((pattern) => pattern.source);
  const hasOutcome = businessOutcomeTerms.some((pattern) => pattern.test(description));

  if (/Controleer voor het opslaan/i.test(description)) {
    issues.push("Bevat review-placeholdertekst: Controleer voor het opslaan...");
  }
  if (matchedTechnicalTerms.length > 0) {
    issues.push("Hoofdtekst bevat technische termen die naar bewijs/trace horen.");
  }
  if (matchedEnglishTerms.length > 0) {
    issues.push("Hoofdtekst bevat Engelse analyse-output.");
  }
  if (!hasOutcome) {
    issues.push("Zichtbaar resultaat voor medewerker ontbreekt.");
  }
  if (description.split(/\s+/).filter(Boolean).length < 35) {
    issues.push("Beschrijving is waarschijnlijk te kort voor niet-technische uitleg.");
  }

  return {
    issues,
    hasOutcome,
    matchedTechnicalTerms,
    matchedEnglishTerms,
    wordCount: description.split(/\s+/).filter(Boolean).length,
    status: issues.length === 0 ? "ok" : "needs_rewrite",
  };
}

async function fetchConfirmedFlows() {
  const env = readEnv();
  const token = readSessionAccessToken();
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/flows?select=*&order=created_at.desc`, {
    headers: {
      apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase flows ophalen mislukt (${res.status}): ${text}`);
  return JSON.parse(text);
}

function buildAudit(flows) {
  const results = flows.map((flow) => ({
    id: flow.id,
    naam: flow.naam,
    beschrijving: flow.beschrijving ?? "",
    score: scoreFlowCopy(flow),
  }));

  return {
    generatedAt: new Date().toISOString(),
    total: results.length,
    ok: results.filter((result) => result.score.status === "ok").length,
    needsRewrite: results.filter((result) => result.score.status === "needs_rewrite").length,
    results,
  };
}

function writeAudit(audit) {
  mkdirSync("tmp", { recursive: true });
  const jsonPath = join("tmp", "confirmed-flows-copy-audit.json");
  const markdownPath = join("tmp", "confirmed-flows-copy-audit.md");

  writeFileSync(jsonPath, JSON.stringify(audit, null, 2), "utf8");
  writeFileSync(
    markdownPath,
    [
      "# Confirmed Process Journey Copy Audit",
      "",
      `Generated: ${audit.generatedAt}`,
      `Total: ${audit.total}`,
      `OK: ${audit.ok}`,
      `Needs rewrite: ${audit.needsRewrite}`,
      "",
      ...audit.results.map((result) => [
        `## ${result.naam}`,
        "",
        `ID: \`${result.id}\``,
        `Status: \`${result.score.status}\``,
        "",
        result.beschrijving,
        "",
        result.score.issues.length
          ? result.score.issues.map((issue) => `- ${issue}`).join("\n")
          : "- Geen issues gevonden.",
        "",
      ].join("\n")),
    ].join("\n"),
    "utf8",
  );

  return { jsonPath, markdownPath };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const flows = await fetchConfirmedFlows();
  const audit = buildAudit(flows);
  const output = writeAudit(audit);
  console.log(JSON.stringify({ ...output, total: audit.total, ok: audit.ok, needsRewrite: audit.needsRewrite }, null, 2));
}
