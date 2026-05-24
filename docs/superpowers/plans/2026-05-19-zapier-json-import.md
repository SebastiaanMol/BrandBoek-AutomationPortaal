# Zapier JSON Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import `zapfile.json` as separate read-only Zapier automation records, so each Zap can appear in the portal and participate in process journeys when evidence matches.

**Architecture:** Extend the existing Zapier read-only mapping layer to understand Zapier GDPR/export JSON with `zaps[].nodes`. The `zapier-sync` edge function will keep its API mode but also accept a JSON export upload mode from the portal. The settings page gets a Zapier JSON upload action that calls the edge function while the user is logged in.

**Tech Stack:** TypeScript, Supabase Edge Functions, React/Vite, TanStack Query, Vitest.

---

### Task 1: Add Zapier Export Mapping Tests

**Files:**
- Create: `src/test/zapierJsonExportMapping.test.ts`
- Modify: `supabase/functions/_shared/zapier-readonly.ts`

- [ ] **Step 1: Write failing tests for GDPR/export JSON**

Create `src/test/zapierJsonExportMapping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  mapZapierExportToAutomationPayloads,
  sanitizeZapierValue,
} from "../../supabase/functions/_shared/zapier-readonly";

const exportedZap = {
  metadata: { version: "gdpr_v1" },
  zaps: [{
    id: 216329292,
    title: "Trustoo Leads - Rotterdam",
    status: "on",
    nodes: {
      "216329292": {
        id: 216329292,
        parent_id: null,
        root_id: null,
        type_of: "read",
        action: "lead",
        selected_api: "App187957CLIAPI@1.1.1",
        title: "Trustoo Leads - Rotterdam",
        params: {},
        meta: { timezone: "Europe/Amsterdam" },
      },
      "216329293": {
        id: 216329293,
        parent_id: 216329292,
        root_id: 216329292,
        type_of: "write",
        action: "post",
        selected_api: "WebHookCLIAPI@1.0.29",
        title: null,
        params: {
          url: "https://composed-month-production.up.railway.app/sales/leads/hubspot/trustoo",
          headers: { "X-API-Key": "secret-value" },
        },
        meta: { stepTitle: "POST in Webhooks by Zapier" },
      },
    },
  }],
};

describe("Zapier JSON export mapping", () => {
  it("maps each exported Zap to a separate read-only automation payload", () => {
    const payloads = mapZapierExportToAutomationPayloads(exportedZap, "2026-05-19T10:00:00.000Z");

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      source: "zapier",
      categorie: "Zapier Zap",
      external_id: "216329292",
      naam: "Trustoo Leads - Rotterdam",
      status: "Actief",
    });
    expect(payloads[0].systemen).toEqual(["Zapier", "Trustoo", "Webhooks by Zapier"]);
    expect(payloads[0].webhook_paths).toEqual(["/sales/leads/hubspot/trustoo"]);
    expect(payloads[0].import_proposal.read_only).toBe(true);
  });

  it("does not expose secrets in mapped payloads", () => {
    const [payload] = mapZapierExportToAutomationPayloads(exportedZap, "2026-05-19T10:00:00.000Z");
    const text = JSON.stringify(payload);

    expect(text).not.toContain("secret-value");
    expect(text).not.toContain("X-API-Key");
    expect(text).not.toContain("headers");
  });

  it("keeps raw CLI/API names out of main user-facing fields", () => {
    const [payload] = mapZapierExportToAutomationPayloads(exportedZap, "2026-05-19T10:00:00.000Z");
    const visibleText = [payload.doel, payload.trigger_beschrijving, ...payload.stappen].join("\\n");

    expect(visibleText).not.toMatch(/CLIAPI@/);
    expect(visibleText).not.toContain("POST");
    expect(visibleText).toContain("Webhooks by Zapier");
  });

  it("recursively redacts sensitive keys", () => {
    expect(sanitizeZapierValue({
      token: "abc",
      nested: { password: "def", safe: "ok" },
      list: [{ Authorization: "Bearer secret" }],
    })).toEqual({
      token: "[redacted]",
      nested: { password: "[redacted]", safe: "ok" },
      list: [{ Authorization: "[redacted]" }],
    });
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npx vitest run src/test/zapierJsonExportMapping.test.ts
```

Expected: FAIL because `mapZapierExportToAutomationPayloads` and `sanitizeZapierValue` are not exported yet.

### Task 2: Extend Zapier Mapping Layer

**Files:**
- Modify: `supabase/functions/_shared/zapier-readonly.ts`
- Test: `src/test/zapierJsonExportMapping.test.ts`

- [ ] **Step 1: Add export-shape helpers**

Add exported functions:

```ts
export function mapZapierExportToAutomationPayloads(exportBody: unknown, now: string): ZapierAutomationPayload[] {
  return normalizeZapierExportZaps(exportBody).map((zap) => mapZapierZapToAutomationPayload(zap, now));
}

export function sanitizeZapierValue(value: unknown, depth = 0): unknown {
  // Redact secret-like keys and preserve safe summary values.
}
```

Also add non-exported helpers:

```ts
function normalizeZapierExportZaps(exportBody: unknown): unknown[] {
  const record = asRecord(exportBody);
  return Array.isArray(record?.zaps) ? record.zaps : [];
}

function readZapSteps(record: Record<string, unknown>): unknown[] {
  // Keep existing steps/actions support.
  // Add support for nodes object by sorting the node chain using parent_id/root_id.
}
```

- [ ] **Step 2: Map app names to readable systems**

Add display mapping inside `readAppName`:

```ts
const appDisplayNames: Array<[RegExp, string]> = [
  [/HubSpotCLIAPI/i, "HubSpot"],
  [/TypeformCLIAPI/i, "Typeform"],
  [/MicrosoftOutlookCLIAPI/i, "Outlook"],
  [/WebHookCLIAPI/i, "Webhooks by Zapier"],
  [/BranchingAPI/i, "Zapier"],
  [/FilterAPI/i, "Zapier"],
  [/DelayCLIAPI/i, "Zapier"],
  [/CodeCLIAPI/i, "Code by Zapier"],
  [/ZapierFormatterCLIAPI/i, "Formatter by Zapier"],
  [/ZapierLoopingCLIAPI/i, "Looping by Zapier"],
  [/AICLIAPI/i, "AI by Zapier"],
  [/FacebookLeadsCLIAPI/i, "Facebook Lead Ads"],
  [/GoogleAdsCLIAPI/i, "Google Ads"],
  [/FirefliesCLIAPI/i, "Fireflies"],
  [/App187957CLIAPI/i, "Trustoo"],
];
```

- [ ] **Step 3: Improve step titles for export nodes**

In `summarizeStep`, prefer:

```ts
readString(asRecord(record.meta), ["stepTitle"])
```

Then strip overly technical words from visible titles:

```ts
function toUserFacingStepTitle(title: string, appName: string, action: string, type: string): string
```

Rules:
- Webhook `post` becomes `Geeft gegevens door via webhook`.
- Branch/filter nodes use their title or `Controleert een voorwaarde`.
- HubSpot `updated_deal_stage` becomes `Start bij wijziging van HubSpot-dealfase`.
- Outlook `send_email` becomes `Verstuurt of maakt een e-mail`.

- [ ] **Step 4: Store safe technical evidence in import proposal**

Update `import_proposal` to include:

```ts
webhookPaths: webhookPaths,
zapier_export: {
  read_only: true,
  node_count: steps.length,
  sanitized_nodes: sanitizeZapierValue(record.nodes ?? null),
}
```

Do not store raw headers, tokens, auth, passwords, API keys, or full sensitive values.

- [ ] **Step 5: Run mapping tests**

Run:

```bash
npx vitest run src/test/zapierJsonExportMapping.test.ts src/test/zapierReadOnlyMapping.test.ts
```

Expected: PASS.

### Task 3: Add JSON Export Mode to Zapier Edge Sync

**Files:**
- Modify: `supabase/functions/zapier-sync/index.ts`
- Create: `src/test/zapierJsonImportEdgeSource.test.ts`

- [ ] **Step 1: Write failing source test**

Create `src/test/zapierJsonImportEdgeSource.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "supabase/functions/zapier-sync/index.ts"), "utf8");

describe("zapier-sync JSON export mode", () => {
  it("supports importing uploaded Zapier export JSON without Zapier OAuth", () => {
    expect(source).toContain('mode === "json_export"');
    expect(source).toContain("mapZapierExportToAutomationPayloads");
    expect(source).toContain("syncZapierPayloads");
  });

  it("keeps API mode and JSON export mode separated", () => {
    const exportModeIndex = source.indexOf('mode === "json_export"');
    const integrationLookupIndex = source.indexOf('.eq("type", "zapier")');

    expect(exportModeIndex).toBeGreaterThan(-1);
    expect(integrationLookupIndex).toBeGreaterThan(-1);
    expect(exportModeIndex).toBeLessThan(integrationLookupIndex);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npx vitest run src/test/zapierJsonImportEdgeSource.test.ts
```

Expected: FAIL because JSON export mode is not implemented yet.

- [ ] **Step 3: Refactor `zapier-sync`**

At the start of the handler, parse request JSON:

```ts
const requestBody = await readJsonBody(req);
const mode = typeof requestBody?.mode === "string" ? requestBody.mode : "api";

if (mode === "json_export") {
  const now = new Date().toISOString();
  const payloads = mapZapierExportToAutomationPayloads(requestBody.export, now);
  const result = await syncZapierPayloads(db, payloads, { deactivateMissing: requestBody.deactivateMissing === true, now });
  return jsonResponse({ success: true, ...result });
}
```

Move shared DB upsert logic into:

```ts
async function syncZapierPayloads(
  db: ReturnType<typeof createClient>,
  payloads: ZapierAutomationPayload[],
  options: { deactivateMissing: boolean; now: string },
): Promise<{ inserted: number; updated: number; deactivated: number; total: number }> {
  // Existing source zapier lookup, upsert by external_id, optional deactivation.
}
```

API mode keeps using Zapier OAuth/Bearer token and calls:

```ts
await syncZapierPayloads(db, payloads, { deactivateMissing: true, now });
```

JSON export mode defaults to `deactivateMissing: false` unless the caller explicitly sends true.

- [ ] **Step 4: Run edge source tests**

Run:

```bash
npx vitest run src/test/zapierJsonImportEdgeSource.test.ts src/test/zapierSyncSource.test.ts
```

Expected: PASS.

### Task 4: Add Portal JSON Upload Action

**Files:**
- Modify: `src/lib/storage/edgeFunctions.ts`
- Modify: `src/lib/queryHooks/integrations.ts`
- Modify: `src/pages/Instellingen.tsx`
- Create: `src/test/zapierJsonImportUiSource.test.ts`

- [ ] **Step 1: Write failing UI source test**

Create `src/test/zapierJsonImportUiSource.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npx vitest run src/test/zapierJsonImportUiSource.test.ts
```

Expected: FAIL because the UI import action is not present yet.

- [ ] **Step 3: Add edge invocation helper**

In `src/lib/storage/edgeFunctions.ts`, add:

```ts
export async function triggerZapierJsonImport(exportBody: unknown): Promise<SyncResult> {
  return invokeEdgeFunction("zapier-sync", {
    mode: "json_export",
    export: exportBody as Record<string, unknown>,
  });
}
```

- [ ] **Step 4: Add query hook**

In `src/lib/queryHooks/integrations.ts`, add:

```ts
export function useZapierJsonImport(): UseMutationResult<SyncResult, Error, unknown> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerZapierJsonImport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
      queryClient.invalidateQueries({ queryKey: ["integration", "zapier"] });
    },
  });
}
```

- [ ] **Step 5: Add extra action support to `IntegrationCard`**

Extend `IntegrationCardProps`:

```ts
renderExtraActions?: () => React.ReactNode;
```

Render it below the connect/sync controls:

```tsx
{renderExtraActions && (
  <div className="border-t border-border pt-4">
    {renderExtraActions()}
  </div>
)}
```

- [ ] **Step 6: Add Zapier JSON import form**

In `src/pages/Instellingen.tsx`, create:

```tsx
function ZapierJsonImportForm(): React.ReactNode {
  const importMutation = useZapierJsonImport();

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      const result = await importMutation.mutateAsync(parsed);
      toast.success(`Zapier import voltooid - ${result.inserted} nieuw, ${result.updated} bijgewerkt`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Zapier JSON import mislukt");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">Zapier export importeren</p>
      <p className="text-xs text-muted-foreground">
        Importeer een Zapier JSON-export read-only. Secrets en headers worden gestript voordat automations worden opgeslagen.
      </p>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary transition-colors">
        <RefreshCw className={`h-3.5 w-3.5 ${importMutation.isPending ? "animate-spin" : ""}`} />
        {importMutation.isPending ? "Importeren..." : "Importeer Zapier JSON"}
        <input
          type="file"
          accept=".json,application/json"
          className="sr-only"
          disabled={importMutation.isPending}
          onChange={handleFileChange}
        />
      </label>
    </div>
  );
}
```

Pass it to the Zapier card:

```tsx
renderExtraActions={() => <ZapierJsonImportForm />}
```

- [ ] **Step 7: Run UI source test**

Run:

```bash
npx vitest run src/test/zapierJsonImportUiSource.test.ts
```

Expected: PASS.

### Task 5: Verify Import Against Local `zapfile.json`

**Files:**
- No code files unless a test fixture is needed.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npx vitest run src/test/zapierJsonExportMapping.test.ts src/test/zapierJsonImportEdgeSource.test.ts src/test/zapierJsonImportUiSource.test.ts src/test/zapierReadOnlyMapping.test.ts src/test/zapierSyncSource.test.ts src/test/zapierSettingsCopy.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run a local dry-run summary without writing to Supabase**

Run:

```bash
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('C:/Users/SebastiaanMol/Desktop/zapfile.json','utf8')); console.log({zaps:data.zaps.length, first:data.zaps[0].title});"
```

Expected:

```text
{ zaps: 62, first: 'Trustoo Leads - Rotterdam' }
```

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: PASS. Existing Vite chunk-size warning is acceptable.

### Task 6: Manual Browser Check

**Files:**
- No code files.

- [ ] **Step 1: Open settings page**

Open:

```text
http://localhost:8080/instellingen
```

Expected:
- Zapier card still says read-only.
- Zapier card has `Importeer Zapier JSON`.
- Upload accepts `.json`.

- [ ] **Step 2: Import the local file**

Choose:

```text
C:\Users\SebastiaanMol\Desktop\zapfile.json
```

Expected:
- Toast reports inserted/updated counts.
- Automations list contains separate Zapier records such as `Trustoo Leads - Rotterdam` and `Geen gehoor 1: Telefonische mail`.

- [ ] **Step 3: Inspect representative records**

Check:
- A Trustoo lead Zap shows a webhook path but no API key/header.
- A Geen gehoor Zap shows HubSpot, Zapier/branch/filter, and Outlook as systems/steps.
- Technical CLI names do not dominate the main visible fields.
- No process journey is linked unless existing evidence detection proves it.
