import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "supabase/functions/zapier-sync/index.ts"), "utf8");
const helperSource = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/portal-owned-sync.ts"), "utf8");

describe("zapier-sync JSON export mode", () => {
  it("supports importing uploaded Zapier export JSON without Zapier OAuth", () => {
    expect(source).toContain('mode === "json_export"');
    expect(source).toContain("mapZapierExportToAutomationPayloads");
    expect(source).toContain("previewPortalOwnedSync");
  });

  it("keeps API mode and JSON export mode separated", () => {
    const exportModeIndex = source.indexOf('mode === "json_export"');
    const integrationLookupIndex = source.indexOf('.eq("type", "zapier")');

    expect(exportModeIndex).toBeGreaterThan(-1);
    expect(integrationLookupIndex).toBeGreaterThan(-1);
    expect(exportModeIndex).toBeLessThan(integrationLookupIndex);
  });

  it("rejects empty Zapier payloads before creating source_missing findings", () => {
    expect(source).toContain("payloads.length === 0");
    expect(source).toContain("Geen Zaps gevonden in Zapier JSON-export.");
    expect(source).toContain("Zapier API gaf geen Zaps terug.");
  });

  it("rejects invalid or unknown request bodies instead of silently using API mode", () => {
    expect(source).toContain("parseZapierSyncRequestBody");
    expect(source).toContain("Onbekende Zapier sync modus");
    expect(source).toContain("Ongeldige JSON-body voor Zapier sync.");
    expect(source).toContain("Zapier sync body moet een JSON-object zijn.");
  });

  it("records portal-owned findings and proposals instead of mutating existing automations", () => {
    expect(helperSource).toContain("automation_import_proposals");
    expect(helperSource).toContain("automation_source_findings");
    expect(helperSource).toContain("source_sync_runs");
    expect(source).not.toMatch(/\.from\(["']automatiseringen["']\)\s*\.\s*update/s);
    expect(source).not.toMatch(/\.from\(["']automatiseringen["']\)\s*\.\s*delete/s);
  });

  it("deduplicates Zapier import proposals before writing to proposal storage", () => {
    expect(helperSource).toContain("dedupe_key");
    expect(helperSource).toContain("upsertImportProposal");
  });

  it("stores imported Zapier automations as import proposals before they enter the portal list", () => {
    expect(source).toContain("previewPortalOwnedSync");
    expect(helperSource).toContain("automation_import_proposals");
    expect(source).not.toContain('import_status: "approved"');
  });

  it("supports preview and apply modes for sync review", () => {
    expect(source).toContain("previewPortalOwnedSync");
    expect(source).toContain("applyPortalOwnedSyncChanges");
    expect(source).toContain('mode === "preview"');
    expect(source).toContain('mode === "apply"');
  });
});
