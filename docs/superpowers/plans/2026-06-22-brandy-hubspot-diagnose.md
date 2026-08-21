# Brandy HubSpot Diagnose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only Brandy HubSpot diagnosis flow that recognizes natural language, checks bounded HubSpot deal/owner evidence, and returns a clear diagnosis.

**Architecture:** The frontend detects HubSpot diagnosis prompts before `brandy-ask` and calls a dedicated `hubspot-diagnose` Supabase Edge Function. The Edge Function uses the existing connected HubSpot integration token, performs only whitelisted GET requests, sanitizes all results, and returns a structured result for Brandy to format.

**Tech Stack:** React/Vite TypeScript frontend, Supabase Edge Functions on Deno, Vitest, existing Supabase client and `integrations` token storage.

---

## File Structure

- Create `src/lib/brandyHubspotDiagnosis.ts`
  - Pure parser, request builder, diagnosis response formatter, and small helper types.
- Create `src/lib/storage/hubspotDiagnosis.ts`
  - Frontend storage wrapper around `supabase.functions.invoke("hubspot-diagnose")`.
- Modify `src/lib/brandy.ts`
  - Route HubSpot diagnosis prompts before the existing owner lookup and before `brandy-ask`.
- Create `supabase/functions/hubspot-diagnose/sanitize.ts`
  - Request validation, URL builders, HubSpot response sanitizers, suspected-owner reference detection.
- Create `supabase/functions/hubspot-diagnose/index.ts`
  - Read-only Edge Function that fetches deals, associations, associated records, and owner active/archived lookups.
- Create `src/test/brandyHubspotDiagnosis.test.ts`
  - Parser, request building, Brandy response formatting, and Brandy routing tests.
- Create `src/test/hubspotDiagnosisStorage.test.ts`
  - Frontend storage wrapper tests.
- Create `src/test/hubspotDiagnosisEdgeSource.test.ts`
  - Edge Function source and sanitizer tests.

Do not change the Brandy chat UI in V1. The output stays a normal `BrandyResponse`.

---

### Task 1: Frontend Diagnosis Parser And Request Builder

**Files:**
- Create: `src/lib/brandyHubspotDiagnosis.ts`
- Test: `src/test/brandyHubspotDiagnosis.test.ts`

- [ ] **Step 1: Write the failing parser tests**

Add this test file:

```ts
import { describe, expect, it } from "vitest";

describe("Brandy HubSpot diagnosis parser", () => {
  it("extracts deal ids, owner ids, properties, and role hints from free text", async () => {
    const { parseHubSpotDiagnosisQuestion } = await import("@/lib/brandyHubspotDiagnosis");

    const result = parseHubSpotDiagnosisQuestion(`
      Check eerst de IB deal 61165856536.
      Check daarna de Jaarrekening deal ID 61186289939.
      Zoek property jaarrekeningen_klaar_om_ib_te_maken.
      De fout gaat over owner ID 223935335.
    `);

    expect(result).toEqual({
      dealIds: [
        { id: "61165856536", roleHint: "IB deal" },
        { id: "61186289939", roleHint: "Jaarrekening deal" },
      ],
      ownerIds: ["223935335"],
      propertyNames: ["jaarrekeningen_klaar_om_ib_te_maken"],
      expectedStageHints: [],
    });
  });

  it("extracts an expected Jaarrekening stage when the text mentions one", async () => {
    const { parseHubSpotDiagnosisQuestion } = await import("@/lib/brandyHubspotDiagnosis");

    const result = parseHubSpotDiagnosisQuestion(`
      Zoek Jaarrekening deal 61186289939 en controleer stage Gecontroleerd & Gefactureerd.
      Owner 223935335 lijkt kapot.
    `);

    expect(result?.expectedStageHints).toEqual(["Gecontroleerd & Gefactureerd"]);
  });

  it("rejects unrelated text and owner-only lookups without deal context", async () => {
    const { parseHubSpotDiagnosisQuestion } = await import("@/lib/brandyHubspotDiagnosis");

    expect(parseHubSpotDiagnosisQuestion("wat betekent automation 61165856536?")).toBeNull();
    expect(parseHubSpotDiagnosisQuestion("zoek HubSpot owner 223935335 op")).toBeNull();
  });

  it("enforces V1 limits deterministically", async () => {
    const { parseHubSpotDiagnosisQuestion } = await import("@/lib/brandyHubspotDiagnosis");

    const result = parseHubSpotDiagnosisQuestion(`
      HubSpot diagnose deal 111 deal 222 deal 333
      owner 444 owner 555 owner 666 owner 777
      property a_b property c_d property e_f property g_h property i_j property k_l
    `);

    expect(result).toEqual({
      dealIds: [
        { id: "111", roleHint: "deal" },
        { id: "222", roleHint: "deal" },
      ],
      ownerIds: ["444", "555", "666"],
      propertyNames: ["a_b", "c_d", "e_f", "g_h", "i_j"],
      expectedStageHints: [],
    });
  });
});
```

- [ ] **Step 2: Run parser tests and verify they fail**

Run:

```bash
npm test -- src/test/brandyHubspotDiagnosis.test.ts
```

Expected: FAIL because `@/lib/brandyHubspotDiagnosis` does not exist.

- [ ] **Step 3: Implement the minimal parser and request types**

Create `src/lib/brandyHubspotDiagnosis.ts`:

```ts
import type { BrandyResponse } from "@/lib/brandy";
import type { HubSpotDiagnosisResult } from "@/lib/storage/hubspotDiagnosis";

export interface HubSpotDiagnosisDealInput {
  id: string;
  roleHint: string;
}

export interface HubSpotDiagnosisRequest {
  dealIds: HubSpotDiagnosisDealInput[];
  ownerIds: string[];
  propertyNames: string[];
  expectedStageHints: string[];
}

const MAX_DEALS = 2;
const MAX_OWNERS = 3;
const MAX_PROPERTIES = 5;
const HUBSPOT_CONTEXT_RE = /\bhubspot\b|\bIB deal\b|\bJaarrekening deal\b|\bowner\b|\beigenaar\b/i;
const DEAL_RE = /\b(?:(IB deal|Jaarrekening deal|deal(?: ID)?)\s*:?\s*)(\d{3,32})\b/gi;
const OWNER_RE = /\b(?:owner ID|owner|eigenaar|kapotte owner)\s*:?\s*(\d{3,32})\b/gi;
const PROPERTY_RE = /\b(?:property|properties|eigenschap)\s*:?\s*([a-z][a-z0-9_]{2,80})\b/gi;
const STAGE_RE = /\bstage\s+([A-Za-zÀ-ÿ0-9 &/_-]{3,80})/gi;

export function parseHubSpotDiagnosisQuestion(question: string): HubSpotDiagnosisRequest | null {
  const text = question.trim();
  if (!text || !HUBSPOT_CONTEXT_RE.test(text)) return null;

  const dealIds = uniqueDealInputs([...text.matchAll(DEAL_RE)]
    .map((match) => ({
      roleHint: normalizeDealRole(match[1]),
      id: match[2],
    })))
    .slice(0, MAX_DEALS);

  const ownerIds = uniqueStrings([...text.matchAll(OWNER_RE)].map((match) => match[1]))
    .slice(0, MAX_OWNERS);
  const propertyNames = uniqueStrings([...text.matchAll(PROPERTY_RE)].map((match) => match[1]))
    .slice(0, MAX_PROPERTIES);
  const expectedStageHints = uniqueStrings([...text.matchAll(STAGE_RE)].map((match) => cleanStageHint(match[1])))
    .filter(Boolean);

  if (dealIds.length === 0 || ownerIds.length === 0) return null;

  return {
    dealIds,
    ownerIds,
    propertyNames,
    expectedStageHints,
  };
}

function uniqueDealInputs(items: HubSpotDiagnosisDealInput[]): HubSpotDiagnosisDealInput[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function normalizeDealRole(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes("ib")) return "IB deal";
  if (lower.includes("jaarrekening")) return "Jaarrekening deal";
  return "deal";
}

function cleanStageHint(value: string): string {
  return value.replace(/[.。]+$/g, "").trim();
}

export function buildHubSpotDiagnosisBrandyResponse(result: HubSpotDiagnosisResult): BrandyResponse {
  return {
    antwoord: [
      "HubSpot diagnose uitgevoerd.",
      "",
      ...result.summaryLines,
      "",
      "Verdachte plekken:",
      ...(result.suspectedOwnerReferences.length
        ? result.suspectedOwnerReferences.map((ref) => `- Gevonden: owner ${ref.ownerId} op ${ref.recordType} ${ref.recordId} (${ref.propertyName})`)
        : ["- Geen exacte owner-reference gevonden in de gecontroleerde records."]),
      "",
      "Handmatige checks:",
      ...(result.warnings.length ? result.warnings.map((warning) => `- ${warning}`) : ["- Geen extra handmatige checks nodig op basis van de API-response."]),
    ].join("\n"),
    bronnen: ["HubSpot diagnosis API"],
    entiteiten: [
      ...result.deals.map((deal) => deal.id),
      ...result.owners.map((owner) => owner.id),
    ],
    zekerheid: result.suspectedOwnerReferences.length ? "hoog" : "gemiddeld",
  };
}
```

- [ ] **Step 4: Run parser tests and verify they pass**

Run:

```bash
npm test -- src/test/brandyHubspotDiagnosis.test.ts
```

Expected: PASS for parser tests. Later tests in this same file may be added and fail until later tasks.

- [ ] **Step 5: Commit parser work**

```bash
git add src/lib/brandyHubspotDiagnosis.ts src/test/brandyHubspotDiagnosis.test.ts
git commit -m "feat: parse Brandy HubSpot diagnosis prompts"
```

---

### Task 2: Edge Function Sanitizer And URL Builders

**Files:**
- Create: `supabase/functions/hubspot-diagnose/sanitize.ts`
- Test: `src/test/hubspotDiagnosisEdgeSource.test.ts`

- [ ] **Step 1: Write failing sanitizer/source tests**

Create `src/test/hubspotDiagnosisEdgeSource.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDealUrl,
  buildAssociationUrl,
  buildOwnerUrl,
  sanitizeCrmObject,
  findOwnerReferences,
  validateHubSpotDiagnosisRequest,
} from "../../supabase/functions/hubspot-diagnose/sanitize";

const sourcePath = resolve(process.cwd(), "supabase/functions/hubspot-diagnose/index.ts");
const source = readFileSync(sourcePath, "utf8");

describe("hubspot-diagnose edge function", () => {
  it("allows CORS preflight and POST requests only", () => {
    expect(source).toContain('"Access-Control-Allow-Methods": "POST, OPTIONS"');
    expect(source).toContain('if (req.method === "OPTIONS")');
    expect(source).toContain('if (req.method !== "POST")');
  });

  it("uses the existing HubSpot integration token and no browser env token", () => {
    expect(source).toContain('Deno.env.get("SUPABASE_URL")');
    expect(source).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(source).toContain('.eq("type", "hubspot")');
    expect(source).toContain('.eq("status", "connected")');
    expect(source).toContain("integration.token");
    expect(source).not.toContain("VITE_");
  });

  it("does not send mutation requests to HubSpot", () => {
    expect(source).not.toMatch(/\bmethod:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
    expect(source).toContain('method: "GET"');
  });

  it("validates bounded diagnosis requests", () => {
    expect(validateHubSpotDiagnosisRequest({
      dealIds: [{ id: "61165856536", roleHint: "IB deal" }],
      ownerIds: ["223935335"],
      propertyNames: ["jaarrekeningen_klaar_om_ib_te_maken"],
      expectedStageHints: ["Gecontroleerd & Gefactureerd"],
    })).toEqual({
      ok: true,
      value: {
        dealIds: [{ id: "61165856536", roleHint: "IB deal" }],
        ownerIds: ["223935335"],
        propertyNames: ["jaarrekeningen_klaar_om_ib_te_maken"],
        expectedStageHints: ["Gecontroleerd & Gefactureerd"],
      },
    });

    expect(validateHubSpotDiagnosisRequest({ dealIds: [], ownerIds: ["1"], propertyNames: [], expectedStageHints: [] }).ok).toBe(false);
    expect(validateHubSpotDiagnosisRequest({ dealIds: [{ id: "abc" }], ownerIds: ["1"], propertyNames: [], expectedStageHints: [] }).ok).toBe(false);
    expect(validateHubSpotDiagnosisRequest({ dealIds: [{ id: "1" }], ownerIds: ["owner"], propertyNames: [], expectedStageHints: [] }).ok).toBe(false);
    expect(validateHubSpotDiagnosisRequest({ dealIds: [{ id: "1" }], ownerIds: ["2"], propertyNames: ["bad-name"], expectedStageHints: [] }).ok).toBe(false);
  });

  it("builds only whitelisted read URLs", () => {
    expect(buildDealUrl("61165856536", ["jaarrekeningen_klaar_om_ib_te_maken"]).toString()).toContain("/crm/v3/objects/deals/61165856536?");
    expect(buildDealUrl("61165856536", ["jaarrekeningen_klaar_om_ib_te_maken"]).searchParams.get("propertiesWithHistory")).toContain("jaarrekeningen_klaar_om_ib_te_maken");
    expect(buildAssociationUrl("deals", "61165856536", "contacts")).toBe("https://api.hubapi.com/crm/v4/objects/deals/61165856536/associations/contacts");
    expect(buildOwnerUrl("223935335", false)).toBe("https://api.hubapi.com/crm/v3/owners/223935335?idProperty=id&archived=false");
    expect(buildOwnerUrl("223935335", true)).toBe("https://api.hubapi.com/crm/v3/owners/223935335?idProperty=id&archived=true");
  });

  it("sanitizes CRM objects and detects target owner references", () => {
    const record = sanitizeCrmObject("deal", {
      id: "61165856536",
      archived: false,
      properties: {
        dealstage: "closedwon",
        hubspot_owner_id: "223935335",
        custom_owner_property: "999",
        token: "secret",
      },
      propertiesWithHistory: {
        jaarrekeningen_klaar_om_ib_te_maken: [
          { value: "true", timestamp: "2026-06-20T10:00:00.000Z", sourceType: "AUTOMATION" },
        ],
      },
    }, ["jaarrekeningen_klaar_om_ib_te_maken"]);

    expect(record).toEqual({
      recordType: "deal",
      id: "61165856536",
      archived: false,
      properties: {
        dealstage: "closedwon",
        hubspot_owner_id: "223935335",
        custom_owner_property: "999",
        jaarrekeningen_klaar_om_ib_te_maken: undefined,
      },
      propertyHistory: {
        jaarrekeningen_klaar_om_ib_te_maken: [
          { value: "true", timestamp: "2026-06-20T10:00:00.000Z", sourceType: "AUTOMATION" },
        ],
      },
      ownerProperties: {
        hubspot_owner_id: "223935335",
        custom_owner_property: "999",
      },
    });
    expect(JSON.stringify(record)).not.toContain("secret");
    expect(findOwnerReferences(record, ["223935335"])).toEqual([
      {
        ownerId: "223935335",
        recordType: "deal",
        recordId: "61165856536",
        propertyName: "hubspot_owner_id",
      },
    ]);
  });
});
```

- [ ] **Step 2: Run sanitizer/source tests and verify they fail**

Run:

```bash
npm test -- src/test/hubspotDiagnosisEdgeSource.test.ts
```

Expected: FAIL because `supabase/functions/hubspot-diagnose/sanitize.ts` and `index.ts` do not exist.

- [ ] **Step 3: Implement sanitizer and URL builders**

Create `supabase/functions/hubspot-diagnose/sanitize.ts`:

```ts
export type HubSpotRecordType = "deal" | "contact" | "company";

export interface DiagnosisDealInput {
  id: string;
  roleHint: string;
}

export interface DiagnosisRequest {
  dealIds: DiagnosisDealInput[];
  ownerIds: string[];
  propertyNames: string[];
  expectedStageHints: string[];
}

export type DiagnosisValidation =
  | { ok: true; value: DiagnosisRequest }
  | { ok: false; error: string };

export interface SanitizedCrmObject {
  recordType: HubSpotRecordType;
  id: string;
  archived: boolean;
  properties: Record<string, string | undefined>;
  propertyHistory: Record<string, SanitizedPropertyHistoryEntry[]>;
  ownerProperties: Record<string, string>;
}

export interface SanitizedPropertyHistoryEntry {
  value?: string;
  timestamp?: string;
  sourceType?: string;
  sourceId?: string;
}

export interface OwnerReference {
  ownerId: string;
  recordType: HubSpotRecordType;
  recordId: string;
  propertyName: string;
}

const MAX_DEALS = 2;
const MAX_OWNERS = 3;
const MAX_PROPERTIES = 5;
const OWNER_PROPERTY_RE = /owner|eigenaar|user/i;

export function validateHubSpotDiagnosisRequest(input: unknown): DiagnosisValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Ongeldige HubSpot diagnose aanvraag" };
  }

  const record = input as Record<string, unknown>;
  const dealIds = Array.isArray(record.dealIds) ? record.dealIds.slice(0, MAX_DEALS).map(validateDealInput).filter(Boolean) as DiagnosisDealInput[] : [];
  const ownerIds = Array.isArray(record.ownerIds) ? record.ownerIds.map(toCleanString).filter(isNumericId).slice(0, MAX_OWNERS) : [];
  const propertyNames = Array.isArray(record.propertyNames) ? record.propertyNames.map(toCleanString).filter(isPropertyName).slice(0, MAX_PROPERTIES) : [];
  const expectedStageHints = Array.isArray(record.expectedStageHints) ? record.expectedStageHints.map(toCleanString).filter(Boolean).slice(0, 3) : [];

  if (dealIds.length === 0) return { ok: false, error: "Minimaal één geldige HubSpot deal id is vereist" };
  if (ownerIds.length === 0) return { ok: false, error: "Minimaal één geldige HubSpot owner id is vereist" };

  return {
    ok: true,
    value: {
      dealIds,
      ownerIds,
      propertyNames,
      expectedStageHints,
    },
  };
}

export function buildDealUrl(dealId: string, propertyNames: string[]): URL {
  const url = new URL(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(dealId)}`);
  const properties = uniqueStrings(["dealstage", "hubspot_owner_id", ...propertyNames]);
  url.searchParams.set("properties", properties.join(","));
  if (propertyNames.length > 0) {
    url.searchParams.set("propertiesWithHistory", propertyNames.join(","));
  }
  url.searchParams.set("archived", "false");
  return url;
}

export function buildCrmObjectUrl(recordType: HubSpotRecordType, id: string): URL {
  const plural = recordType === "company" ? "companies" : `${recordType}s`;
  const url = new URL(`https://api.hubapi.com/crm/v3/objects/${plural}/${encodeURIComponent(id)}`);
  url.searchParams.set("properties", "hubspot_owner_id");
  url.searchParams.set("archived", "false");
  return url;
}

export function buildAssociationUrl(fromType: "deals", fromId: string, toType: "contacts" | "companies" | "deals"): string {
  return `https://api.hubapi.com/crm/v4/objects/${fromType}/${encodeURIComponent(fromId)}/associations/${toType}`;
}

export function buildOwnerUrl(ownerId: string, archived: boolean): string {
  const url = new URL(`https://api.hubapi.com/crm/v3/owners/${encodeURIComponent(ownerId)}`);
  url.searchParams.set("idProperty", "id");
  url.searchParams.set("archived", archived ? "true" : "false");
  return url.toString();
}

export function sanitizeCrmObject(recordType: HubSpotRecordType, input: unknown, propertyNames: string[]): SanitizedCrmObject {
  const record = asRecord(input);
  const properties = asRecord(record.properties);
  const propertyHistoryRaw = asRecord(record.propertiesWithHistory);
  const safeProperties: Record<string, string | undefined> = {
    dealstage: optionalString(properties.dealstage),
    hubspot_owner_id: optionalString(properties.hubspot_owner_id),
  };

  for (const [key, value] of Object.entries(properties)) {
    if (OWNER_PROPERTY_RE.test(key) && isSafePropertyKey(key)) {
      safeProperties[key] = optionalString(value);
    }
  }

  for (const propertyName of propertyNames) {
    safeProperties[propertyName] = optionalString(properties[propertyName]);
  }

  const propertyHistory: Record<string, SanitizedPropertyHistoryEntry[]> = {};
  for (const propertyName of propertyNames) {
    const entries = propertyHistoryRaw[propertyName];
    propertyHistory[propertyName] = Array.isArray(entries)
      ? entries.map(sanitizeHistoryEntry).filter((entry) => Object.keys(entry).length > 0)
      : [];
  }

  const ownerProperties = Object.fromEntries(
    Object.entries(safeProperties).filter(([key, value]) => OWNER_PROPERTY_RE.test(key) && typeof value === "string" && value.trim()),
  ) as Record<string, string>;

  return {
    recordType,
    id: optionalString(record.id) ?? "",
    archived: record.archived === true,
    properties: safeProperties,
    propertyHistory,
    ownerProperties,
  };
}

export function findOwnerReferences(record: SanitizedCrmObject, ownerIds: string[]): OwnerReference[] {
  return Object.entries(record.ownerProperties)
    .filter(([, value]) => ownerIds.includes(value))
    .map(([propertyName, ownerId]) => ({
      ownerId,
      recordType: record.recordType,
      recordId: record.id,
      propertyName,
    }));
}

function validateDealInput(input: unknown): DiagnosisDealInput | null {
  const record = asRecord(input);
  const id = toCleanString(record.id);
  if (!isNumericId(id)) return null;
  return {
    id,
    roleHint: toCleanString(record.roleHint) || "deal",
  };
}

function sanitizeHistoryEntry(input: unknown): SanitizedPropertyHistoryEntry {
  const record = asRecord(input);
  return {
    value: optionalString(record.value),
    timestamp: optionalString(record.timestamp),
    sourceType: optionalString(record.sourceType),
    sourceId: optionalString(record.sourceId),
  };
}

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function toCleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown): string | undefined {
  const stringValue = typeof value === "number" && Number.isFinite(value) ? String(value) : toCleanString(value);
  return stringValue || undefined;
}

function isNumericId(value: string): boolean {
  return /^\d{1,32}$/.test(value);
}

function isPropertyName(value: string): boolean {
  return /^[a-z][a-z0-9_]{2,80}$/.test(value);
}

function isSafePropertyKey(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]{1,100}$/.test(value) && !/token|secret|password|authorization|cookie/i.test(value);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
```

- [ ] **Step 4: Add temporary minimal Edge Function shell for source tests**

Create `supabase/functions/hubspot-diagnose/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateHubSpotDiagnosisRequest } from "./sanitize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: integration } = await db
    .from("integrations")
    .select("token")
    .eq("type", "hubspot")
    .eq("status", "connected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const token = integration.token;
  const validation = validateHubSpotDiagnosisRequest(await req.json().catch(() => ({})));
  if (!validation.ok) return json({ error: validation.error }, 400);

  await fetch("https://api.hubapi.com/crm/v3/owners/0?idProperty=id&archived=false", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  return json({ deals: [], associatedRecords: [], owners: [], suspectedOwnerReferences: [], warnings: [], summaryLines: [], fetchedAt: new Date().toISOString() });
});

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 5: Run sanitizer/source tests and verify they pass**

Run:

```bash
npm test -- src/test/hubspotDiagnosisEdgeSource.test.ts
```

Expected: PASS. This verifies validation and source safety before the real Edge Function implementation.

- [ ] **Step 6: Commit sanitizer work**

```bash
git add supabase/functions/hubspot-diagnose src/test/hubspotDiagnosisEdgeSource.test.ts
git commit -m "feat: add HubSpot diagnosis sanitizers"
```

---

### Task 3: Edge Function Diagnosis Fetching

**Files:**
- Modify: `supabase/functions/hubspot-diagnose/index.ts`
- Modify: `supabase/functions/hubspot-diagnose/sanitize.ts`
- Test: `src/test/hubspotDiagnosisEdgeSource.test.ts`

- [ ] **Step 1: Extend sanitizer tests for owner active/archived summaries and partial failures**

Append to `src/test/hubspotDiagnosisEdgeSource.test.ts`:

```ts
import { sanitizeOwner, buildDiagnosisSummaryLines } from "../../supabase/functions/hubspot-diagnose/sanitize";

it("sanitizes owner lookups without raw payload fields", () => {
  expect(sanitizeOwner("223935335", {
    id: "223935335",
    email: "owner@example.com",
    firstName: "Old",
    lastName: "Owner",
    archived: true,
    teams: [{ id: "1", name: "Sales", primary: true, token: "secret" }],
    token: "secret",
  }, "archived")).toEqual({
    id: "223935335",
    lookup: "archived",
    found: true,
    archived: true,
    email: "owner@example.com",
    firstName: "Old",
    lastName: "Owner",
    teams: [{ id: "1", name: "Sales", primary: true }],
  });
});

it("builds summary lines from evidence and warnings", () => {
  expect(buildDiagnosisSummaryLines({
    deals: [{ id: "61165856536", roleHint: "IB deal", fetchStatus: "ok", archived: false, dealstage: "closedwon", ownerProperties: { hubspot_owner_id: "223935335" }, propertyValues: {}, propertyHistory: {}, associationCounts: {} }],
    associatedRecords: [],
    owners: [{ id: "223935335", lookup: "archived", found: true, archived: true, teams: [] }],
    suspectedOwnerReferences: [{ ownerId: "223935335", recordType: "deal", recordId: "61165856536", propertyName: "hubspot_owner_id" }],
    warnings: ["Property history niet beschikbaar."],
  })).toEqual([
    "Gevonden: owner 223935335 staat op deal 61165856536 via hubspot_owner_id.",
    "Waarschijnlijk: owner 223935335 is alleen als archived owner gevonden.",
    "Niet gecontroleerd: Property history niet beschikbaar.",
  ]);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npm test -- src/test/hubspotDiagnosisEdgeSource.test.ts
```

Expected: FAIL because `sanitizeOwner` and `buildDiagnosisSummaryLines` do not exist.

- [ ] **Step 3: Add owner sanitizer and summary builder**

Add to `supabase/functions/hubspot-diagnose/sanitize.ts`:

```ts
export type OwnerLookup = "active" | "archived" | "missing";

export interface SanitizedOwner {
  id: string;
  lookup: OwnerLookup;
  found: boolean;
  archived?: boolean;
  email?: string;
  firstName?: string;
  lastName?: string;
  teams: Array<{ id: string; name: string; primary: boolean }>;
}

export interface DiagnosisSummaryInput {
  deals: Array<{ id: string; roleHint: string; fetchStatus: string; archived?: boolean; dealstage?: string; ownerProperties: Record<string, string>; propertyValues: Record<string, string | undefined>; propertyHistory: Record<string, SanitizedPropertyHistoryEntry[]>; associationCounts: Record<string, number> }>;
  associatedRecords: SanitizedCrmObject[];
  owners: SanitizedOwner[];
  suspectedOwnerReferences: OwnerReference[];
  warnings: string[];
}

export function sanitizeOwner(ownerId: string, input: unknown, lookup: OwnerLookup): SanitizedOwner {
  const record = asRecord(input);
  return {
    id: optionalString(record.id) ?? ownerId,
    lookup,
    found: lookup !== "missing",
    archived: typeof record.archived === "boolean" ? record.archived : undefined,
    email: optionalString(record.email),
    firstName: optionalString(record.firstName),
    lastName: optionalString(record.lastName),
    teams: Array.isArray(record.teams)
      ? record.teams.map((team) => {
          const teamRecord = asRecord(team);
          const id = optionalString(teamRecord.id);
          const name = optionalString(teamRecord.name);
          return id && name ? { id, name, primary: teamRecord.primary === true } : null;
        }).filter((team): team is { id: string; name: string; primary: boolean } => Boolean(team))
      : [],
  };
}

export function buildDiagnosisSummaryLines(input: DiagnosisSummaryInput): string[] {
  const lines: string[] = [];
  for (const ref of input.suspectedOwnerReferences) {
    lines.push(`Gevonden: owner ${ref.ownerId} staat op ${ref.recordType} ${ref.recordId} via ${ref.propertyName}.`);
  }
  for (const owner of input.owners) {
    if (owner.lookup === "archived" && owner.found) {
      lines.push(`Waarschijnlijk: owner ${owner.id} is alleen als archived owner gevonden.`);
    }
    if (owner.lookup === "missing") {
      lines.push(`Niet gevonden: owner ${owner.id} bestaat niet als actieve of gearchiveerde HubSpot owner.`);
    }
  }
  for (const warning of input.warnings) {
    lines.push(`Niet gecontroleerd: ${warning}`);
  }
  return lines;
}
```

- [ ] **Step 4: Replace the Edge Function shell with real bounded fetching**

Modify `supabase/functions/hubspot-diagnose/index.ts` to:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildAssociationUrl,
  buildCrmObjectUrl,
  buildDealUrl,
  buildDiagnosisSummaryLines,
  buildOwnerUrl,
  findOwnerReferences,
  sanitizeCrmObject,
  sanitizeOwner,
  validateHubSpotDiagnosisRequest,
  type HubSpotRecordType,
} from "./sanitize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const validation = validateHubSpotDiagnosisRequest(await req.json().catch(() => ({})));
    if (!validation.ok) return json({ error: validation.error }, 400);

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: integration, error: integrationError } = await db
      .from("integrations")
      .select("token")
      .eq("type", "hubspot")
      .eq("status", "connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const token = typeof integration?.token === "string" ? stripBearerPrefix(integration.token) : "";
    if (integrationError || !token) {
      return json({ error: "Geen HubSpot-integratie gevonden. Sla eerst een HubSpot token op via Instellingen." }, 404);
    }

    const request = validation.value;
    const deals = [];
    const associatedRecords = [];
    const suspectedOwnerReferences = [];
    const warnings: string[] = [];

    for (const dealInput of request.dealIds) {
      const dealFetch = await getJson(token, buildDealUrl(dealInput.id, request.propertyNames).toString());
      if (!dealFetch.ok) {
        deals.push({ id: dealInput.id, roleHint: dealInput.roleHint, fetchStatus: dealFetch.status === 404 ? "not_found" : "error", ownerProperties: {}, propertyValues: {}, propertyHistory: {}, associationCounts: {} });
        warnings.push(`${dealInput.roleHint} ${dealInput.id} kon niet worden opgehaald (${dealFetch.status}).`);
        continue;
      }

      const dealObject = sanitizeCrmObject("deal", dealFetch.data, request.propertyNames);
      suspectedOwnerReferences.push(...findOwnerReferences(dealObject, request.ownerIds));

      const associationCounts: Record<string, number> = {};
      for (const association of [
        { toType: "contacts" as const, recordType: "contact" as HubSpotRecordType },
        { toType: "companies" as const, recordType: "company" as HubSpotRecordType },
        { toType: "deals" as const, recordType: "deal" as HubSpotRecordType },
      ]) {
        const associationFetch = await getJson(token, buildAssociationUrl("deals", dealInput.id, association.toType));
        const results = associationFetch.ok && Array.isArray(associationFetch.data?.results) ? associationFetch.data.results.slice(0, 10) : [];
        associationCounts[association.toType] = results.length;
        for (const item of results) {
          const targetId = typeof item.toObjectId === "number" ? String(item.toObjectId) : String(item.toObjectId ?? "");
          if (!targetId) continue;
          const recordFetch = await getJson(token, buildCrmObjectUrl(association.recordType, targetId).toString());
          if (!recordFetch.ok) {
            warnings.push(`Gekoppelde ${association.recordType} ${targetId} kon niet worden opgehaald (${recordFetch.status}).`);
            continue;
          }
          const record = sanitizeCrmObject(association.recordType, recordFetch.data, []);
          associatedRecords.push(record);
          suspectedOwnerReferences.push(...findOwnerReferences(record, request.ownerIds));
        }
      }

      deals.push({
        id: dealObject.id || dealInput.id,
        roleHint: dealInput.roleHint,
        fetchStatus: "ok",
        archived: dealObject.archived,
        dealstage: dealObject.properties.dealstage,
        ownerProperties: dealObject.ownerProperties,
        propertyValues: Object.fromEntries(request.propertyNames.map((name) => [name, dealObject.properties[name]])),
        propertyHistory: dealObject.propertyHistory,
        associationCounts,
      });
    }

    const owners = [];
    for (const ownerId of request.ownerIds) {
      const active = await getJson(token, buildOwnerUrl(ownerId, false));
      if (active.ok) {
        owners.push(sanitizeOwner(ownerId, active.data, "active"));
        continue;
      }

      const archived = await getJson(token, buildOwnerUrl(ownerId, true));
      owners.push(archived.ok
        ? sanitizeOwner(ownerId, archived.data, "archived")
        : sanitizeOwner(ownerId, { id: ownerId }, "missing"));
    }

    const summaryLines = buildDiagnosisSummaryLines({
      deals,
      associatedRecords,
      owners,
      suspectedOwnerReferences,
      warnings,
    });

    return json({
      deals,
      associatedRecords,
      owners,
      suspectedOwnerReferences,
      warnings,
      summaryLines,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("hubspot-diagnose error:", error);
    return json({ error: "HubSpot diagnose is mislukt" }, 500);
  }
});

async function getJson(token: string, url: string): Promise<{ ok: true; data: any } | { ok: false; status: number }> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, data: await response.json() };
}

function stripBearerPrefix(token: string): string {
  return token.replace(/^Bearer\s+/i, "").trim();
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 5: Run Edge Function tests**

Run:

```bash
npm test -- src/test/hubspotDiagnosisEdgeSource.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Edge Function implementation**

```bash
git add supabase/functions/hubspot-diagnose src/test/hubspotDiagnosisEdgeSource.test.ts
git commit -m "feat: fetch read-only HubSpot diagnosis evidence"
```

---

### Task 4: Frontend Storage Wrapper

**Files:**
- Create: `src/lib/storage/hubspotDiagnosis.ts`
- Test: `src/test/hubspotDiagnosisStorage.test.ts`

- [ ] **Step 1: Write failing storage tests**

Create `src/test/hubspotDiagnosisStorage.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

describe("hubspot diagnosis storage", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.resetModules();
  });

  it("invokes the hubspot-diagnose function with the structured request", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        deals: [],
        associatedRecords: [],
        owners: [],
        suspectedOwnerReferences: [],
        warnings: [],
        summaryLines: [],
        fetchedAt: "2026-06-22T10:00:00.000Z",
      },
      error: null,
    });
    const { fetchHubSpotDiagnosis } = await import("@/lib/storage/hubspotDiagnosis");

    const result = await fetchHubSpotDiagnosis({
      dealIds: [{ id: "61165856536", roleHint: "IB deal" }],
      ownerIds: ["223935335"],
      propertyNames: ["jaarrekeningen_klaar_om_ib_te_maken"],
      expectedStageHints: [],
    });

    expect(invokeMock).toHaveBeenCalledWith("hubspot-diagnose", {
      body: {
        dealIds: [{ id: "61165856536", roleHint: "IB deal" }],
        ownerIds: ["223935335"],
        propertyNames: ["jaarrekeningen_klaar_om_ib_te_maken"],
        expectedStageHints: [],
      },
    });
    expect(result.fetchedAt).toBe("2026-06-22T10:00:00.000Z");
  });

  it("throws readable function errors", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { error: "Geen HubSpot-integratie gevonden" },
      },
    });
    const { fetchHubSpotDiagnosis } = await import("@/lib/storage/hubspotDiagnosis");

    await expect(fetchHubSpotDiagnosis({
      dealIds: [{ id: "1", roleHint: "deal" }],
      ownerIds: ["2"],
      propertyNames: [],
      expectedStageHints: [],
    })).rejects.toThrow("Geen HubSpot-integratie gevonden");
  });
});
```

- [ ] **Step 2: Run storage tests and verify they fail**

Run:

```bash
npm test -- src/test/hubspotDiagnosisStorage.test.ts
```

Expected: FAIL because `@/lib/storage/hubspotDiagnosis` does not exist.

- [ ] **Step 3: Implement storage wrapper and public types**

Create `src/lib/storage/hubspotDiagnosis.ts`:

```ts
import { supabase } from "@/integrations/supabase/client";
import type { HubSpotDiagnosisRequest } from "@/lib/brandyHubspotDiagnosis";

export interface HubSpotDiagnosisDeal {
  id: string;
  roleHint: string;
  fetchStatus: string;
  archived?: boolean;
  dealstage?: string;
  ownerProperties: Record<string, string>;
  propertyValues: Record<string, string | undefined>;
  propertyHistory: Record<string, Array<{ value?: string; timestamp?: string; sourceType?: string; sourceId?: string }>>;
  associationCounts: Record<string, number>;
}

export interface HubSpotDiagnosisAssociatedRecord {
  recordType: "deal" | "contact" | "company";
  id: string;
  archived: boolean;
  ownerProperties: Record<string, string>;
}

export interface HubSpotDiagnosisOwner {
  id: string;
  lookup: "active" | "archived" | "missing";
  found: boolean;
  archived?: boolean;
  email?: string;
  firstName?: string;
  lastName?: string;
  teams: Array<{ id: string; name: string; primary: boolean }>;
}

export interface HubSpotOwnerReference {
  ownerId: string;
  recordType: "deal" | "contact" | "company";
  recordId: string;
  propertyName: string;
}

export interface HubSpotDiagnosisResult {
  deals: HubSpotDiagnosisDeal[];
  associatedRecords: HubSpotDiagnosisAssociatedRecord[];
  owners: HubSpotDiagnosisOwner[];
  suspectedOwnerReferences: HubSpotOwnerReference[];
  warnings: string[];
  summaryLines: string[];
  fetchedAt: string;
}

export async function fetchHubSpotDiagnosis(request: HubSpotDiagnosisRequest): Promise<HubSpotDiagnosisResult> {
  const { data, error } = await supabase.functions.invoke("hubspot-diagnose", {
    body: request,
  });

  if (error) {
    throw await toReadableFunctionError(error);
  }

  return normalizeDiagnosisResult(data);
}

async function toReadableFunctionError(error: unknown): Promise<Error> {
  const fallback = "HubSpot diagnose ophalen is mislukt";
  if (!error || typeof error !== "object") return new Error(fallback);
  const maybeError = error as { message?: string; context?: unknown };
  const context = maybeError.context;
  if (context && typeof context === "object") {
    const maybeContext = context as { error?: unknown; json?: unknown };
    if (typeof maybeContext.error === "string" && maybeContext.error.trim()) {
      return new Error(maybeContext.error);
    }
    if (typeof maybeContext.json === "function") {
      try {
        const body = await (maybeContext as { json: () => Promise<Record<string, unknown>> }).json();
        if (typeof body.error === "string" && body.error.trim()) return new Error(body.error);
      } catch (contextError) {
        if (contextError instanceof Error && contextError.message !== maybeError.message) return contextError;
      }
    }
  }
  return new Error(maybeError.message || fallback);
}

function normalizeDiagnosisResult(data: unknown): HubSpotDiagnosisResult {
  const record = data && typeof data === "object" && !Array.isArray(data) ? data as Partial<HubSpotDiagnosisResult> : {};
  return {
    deals: Array.isArray(record.deals) ? record.deals : [],
    associatedRecords: Array.isArray(record.associatedRecords) ? record.associatedRecords : [],
    owners: Array.isArray(record.owners) ? record.owners : [],
    suspectedOwnerReferences: Array.isArray(record.suspectedOwnerReferences) ? record.suspectedOwnerReferences : [],
    warnings: Array.isArray(record.warnings) ? record.warnings.filter((item): item is string => typeof item === "string") : [],
    summaryLines: Array.isArray(record.summaryLines) ? record.summaryLines.filter((item): item is string => typeof item === "string") : [],
    fetchedAt: typeof record.fetchedAt === "string" && record.fetchedAt.trim() ? record.fetchedAt : new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run storage tests and verify they pass**

Run:

```bash
npm test -- src/test/hubspotDiagnosisStorage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit storage wrapper**

```bash
git add src/lib/storage/hubspotDiagnosis.ts src/test/hubspotDiagnosisStorage.test.ts
git commit -m "feat: add HubSpot diagnosis storage client"
```

---

### Task 5: Brandy Routing And Diagnosis Answer Formatting

**Files:**
- Modify: `src/lib/brandy.ts`
- Modify: `src/lib/brandyHubspotDiagnosis.ts`
- Test: `src/test/brandyHubspotDiagnosis.test.ts`

- [ ] **Step 1: Add failing Brandy routing and formatter tests**

Append to `src/test/brandyHubspotDiagnosis.test.ts`:

```ts
import { beforeEach, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

describe("Brandy HubSpot diagnosis routing", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.resetModules();
  });

  it("routes diagnosis prompts through hubspot-diagnose before brandy-ask", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        deals: [{ id: "61165856536", roleHint: "IB deal", fetchStatus: "ok", ownerProperties: { hubspot_owner_id: "223935335" }, propertyValues: {}, propertyHistory: {}, associationCounts: {} }],
        associatedRecords: [],
        owners: [{ id: "223935335", lookup: "archived", found: true, archived: true, teams: [] }],
        suspectedOwnerReferences: [{ ownerId: "223935335", recordType: "deal", recordId: "61165856536", propertyName: "hubspot_owner_id" }],
        warnings: ["Property history niet beschikbaar."],
        summaryLines: [
          "Gevonden: owner 223935335 staat op deal 61165856536 via hubspot_owner_id.",
          "Waarschijnlijk: owner 223935335 is alleen als archived owner gevonden.",
        ],
        fetchedAt: "2026-06-22T10:00:00.000Z",
      },
      error: null,
    });
    const { askBrandy } = await import("@/lib/brandy");

    const response = await askBrandy(`
      HubSpot diagnose IB deal 61165856536 property jaarrekeningen_klaar_om_ib_te_maken owner 223935335
    `, []);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("hubspot-diagnose", {
      body: {
        dealIds: [{ id: "61165856536", roleHint: "IB deal" }],
        ownerIds: ["223935335"],
        propertyNames: ["jaarrekeningen_klaar_om_ib_te_maken"],
        expectedStageHints: [],
      },
    });
    expect(response.antwoord).toContain("HubSpot diagnose uitgevoerd.");
    expect(response.antwoord).toContain("Gevonden: owner 223935335 staat op deal 61165856536");
    expect(response.antwoord).toContain("Waarschijnlijk: owner 223935335 is alleen als archived owner gevonden.");
    expect(response.antwoord).toContain("Property history niet beschikbaar.");
    expect(response.zekerheid).toBe("hoog");
  });
});
```

- [ ] **Step 2: Run Brandy diagnosis tests and verify they fail**

Run:

```bash
npm test -- src/test/brandyHubspotDiagnosis.test.ts
```

Expected: FAIL because `askBrandy` does not route diagnosis requests yet or imports are missing.

- [ ] **Step 3: Wire Brandy routing**

Modify `src/lib/brandy.ts`:

```ts
import {
  buildHubSpotDiagnosisBrandyResponse,
  parseHubSpotDiagnosisQuestion,
} from "@/lib/brandyHubspotDiagnosis";
import { fetchHubSpotDiagnosis } from "@/lib/storage/hubspotDiagnosis";
```

Then update `askBrandy` before the existing owner lookup block:

```ts
  const hubSpotDiagnosis = parseHubSpotDiagnosisQuestion(vraag);
  if (hubSpotDiagnosis) {
    const diagnosisResult = await fetchHubSpotDiagnosis(hubSpotDiagnosis);
    return buildHubSpotDiagnosisBrandyResponse(diagnosisResult);
  }
```

Keep the existing owner lookup after this block so a simple owner lookup still works.

- [ ] **Step 4: Refine response builder if needed**

Ensure `buildHubSpotDiagnosisBrandyResponse` in `src/lib/brandyHubspotDiagnosis.ts` includes:

```ts
    bronnen: ["HubSpot diagnosis API"],
    entiteiten: [
      ...result.deals.map((deal) => deal.id),
      ...result.owners.map((owner) => owner.id),
    ],
```

and uses `zekerheid: "hoog"` only when `suspectedOwnerReferences.length > 0`.

- [ ] **Step 5: Run Brandy diagnosis tests and verify they pass**

Run:

```bash
npm test -- src/test/brandyHubspotDiagnosis.test.ts src/test/hubspotDiagnosisStorage.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Brandy routing**

```bash
git add src/lib/brandy.ts src/lib/brandyHubspotDiagnosis.ts src/test/brandyHubspotDiagnosis.test.ts
git commit -m "feat: route Brandy HubSpot diagnosis prompts"
```

---

### Task 6: Final Verification And Deploy

**Files:**
- Verify only unless deployment metadata changes.

- [ ] **Step 1: Run the full targeted test set**

Run:

```bash
npm test -- src/test/brandyHubspotDiagnosis.test.ts src/test/hubspotDiagnosisStorage.test.ts src/test/hubspotDiagnosisEdgeSource.test.ts src/test/brandyHubspotOwnerLookup.test.ts src/test/hubspotOwnerLookupEdgeSource.test.ts
```

Expected: all listed test files pass.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: build exits 0. Existing Vite chunk-size warnings are acceptable if there are no errors.

- [ ] **Step 3: Deploy the new Edge Function**

Run:

```bash
npm exec -- supabase functions deploy hubspot-diagnose
```

Expected: output includes `Deployed Functions` and `hubspot-diagnose`.

- [ ] **Step 4: Manually test in Brandy**

Open the portal and ask Brandy:

```text
Check eerst de IB deal 61165856536.
Check daarna de Jaarrekening deal 61186289939.
Zoek property jaarrekeningen_klaar_om_ib_te_maken.
De fout gaat over owner ID 223935335.
```

Expected:

- Brandy does not call `brandy-ask`.
- Brandy returns a HubSpot diagnosis answer.
- The answer includes checked deals, checked owner, suspected owner references if found, warnings if property history or records are unavailable.
- No raw HubSpot token, raw response body, or arbitrary endpoint appears in the UI.

- [ ] **Step 5: Commit final verification notes if any docs changed**

If no docs changed, skip commit. If a deployment note is added, run:

```bash
git add docs/superpowers/plans/2026-06-22-brandy-hubspot-diagnose.md
git commit -m "docs: record HubSpot diagnosis verification"
```

---

## Self-Review Checklist

- Spec coverage:
  - Free-text recognition: Task 1 and Task 5.
  - Bounded read-only Edge Function: Task 2 and Task 3.
  - Existing HubSpot token source: Task 2 and Task 3.
  - Deals, associations, associated records, owners active/archived: Task 3.
  - Brandy answer with evidence/inference/manual checks: Task 1 and Task 5.
  - Tests and build/deploy: Task 6.
- Placeholder scan:
  - No unfinished markers or unspecified test steps.
- Type consistency:
  - `HubSpotDiagnosisRequest` is created in `src/lib/brandyHubspotDiagnosis.ts`.
  - `fetchHubSpotDiagnosis` accepts that request.
  - Edge Function validation expects the same `dealIds`, `ownerIds`, `propertyNames`, and `expectedStageHints` fields.
