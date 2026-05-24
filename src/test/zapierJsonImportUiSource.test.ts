import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const settingsSource = readFileSync(resolve(process.cwd(), "src/pages/Instellingen.tsx"), "utf8");
const hookSource = readFileSync(resolve(process.cwd(), "src/lib/queryHooks/integrations.ts"), "utf8");
const edgeSource = readFileSync(resolve(process.cwd(), "src/lib/storage/edgeFunctions.ts"), "utf8");

describe("Zapier JSON import UI source", () => {
  it("adds a JSON upload action to the Zapier card", () => {
    expect(settingsSource).toContain("ZapierJsonImportForm");
    expect(settingsSource).toContain('accept=".json,application/json"');
    expect(settingsSource).toContain("Importeer Zapier JSON");
  });

  it("calls zapier-sync in json_export mode", () => {
    expect(edgeSource).toContain("triggerZapierJsonImport");
    expect(edgeSource).toContain('mode: "json_export"');
    expect(hookSource).toContain("useZapierJsonImport");
  });
});
