# Zapier Read-Only Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Zapier as a read-only source in the portal so existing Zaps can be imported, described, and linked without ever modifying Zapier.

**Architecture:** Keep Zapier-specific interpretation in a small shared mapping layer and let the edge function only fetch, upsert, and deactivate records. The portal settings screen must present Zapier as read-only and the synced automations must carry enough functional context for later process journey rendering.

**Tech Stack:** Supabase Edge Functions, TypeScript, Zapier REST API v2, React/Vite, Vitest.

---

### Task 1: Add Zapier Read-Only Mapping Tests

**Files:**
- Create: `src/test/zapierReadOnlyMapping.test.ts`
- Create later: `supabase/functions/_shared/zapier-readonly.ts`

- [ ] **Step 1: Write failing mapping tests**

```ts
import { describe, expect, it } from "vitest";
import {
  mapZapierZapToAutomationPayload,
  normalizeZapierApiResponse,
  zapierReadOnlyHeaders,
} from "../../supabase/functions/_shared/zapier-readonly";

describe("Zapier read-only mapping", () => {
  it("maps a Zap into a read-only automation payload", () => {
    const payload = mapZapierZapToAutomationPayload({
      id: "123",
      title: "Nieuwe lead naar HubSpot deal",
      is_enabled: true,
      steps: [
        { title: "Catch Hook", app: { name: "Webhooks by Zapier" }, params: { url: "https://example.test/wefact/hubspot/upsert_debtor" } },
        { title: "Find company", app: { name: "HubSpot" } },
      ],
    }, "2026-05-19T10:00:00.000Z");

    expect(payload.source).toBe("zapier");
    expect(payload.categorie).toBe("Zapier Zap");
    expect(payload.status).toBe("Actief");
    expect(payload.systemen).toEqual(["Zapier", "Webhooks by Zapier", "HubSpot"]);
    expect(payload.webhook_paths).toEqual(["/wefact/hubspot/upsert_debtor"]);
    expect(payload.import_proposal.read_only).toBe(true);
    expect(payload.doel).toContain("alleen uitgelezen");
  });

  it("normalizes common Zapier list response shapes", () => {
    expect(normalizeZapierApiResponse({ zaps: [{ id: 1 }] })).toHaveLength(1);
    expect(normalizeZapierApiResponse({ results: [{ id: 2 }] })).toHaveLength(1);
    expect(normalizeZapierApiResponse({ data: [{ id: 3 }] })).toHaveLength(1);
  });

  it("uses bearer auth instead of API-key write style headers", () => {
    expect(zapierReadOnlyHeaders("token")).toEqual({
      Accept: "application/json",
      Authorization: "Bearer token",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/zapierReadOnlyMapping.test.ts`

Expected: FAIL because `supabase/functions/_shared/zapier-readonly.ts` does not exist yet.

### Task 2: Implement Shared Zapier Mapping

**Files:**
- Create: `supabase/functions/_shared/zapier-readonly.ts`

- [ ] **Step 1: Add pure helper functions**

Implement:
- `normalizeZapierApiResponse(body)`
- `zapierReadOnlyHeaders(token)`
- `buildZapierZapsUrl()`
- `getNextZapierPageUrl(body)`
- `mapZapierZapToAutomationPayload(zap, now)`

The payload must set `source: "zapier"`, `categorie: "Zapier Zap"`, include `read_only: true` in `import_proposal`, and avoid any Zapier write/control wording.

- [ ] **Step 2: Run mapping tests**

Run: `npx vitest run src/test/zapierReadOnlyMapping.test.ts`

Expected: PASS.

### Task 3: Refactor Zapier Sync Edge Function

**Files:**
- Modify: `supabase/functions/zapier-sync/index.ts`
- Test: `src/test/zapierSyncSource.test.ts`

- [ ] **Step 1: Write failing source test**

Create a source-level test that confirms:
- the function uses `https://api.zapier.com/v2/zaps`
- auth is delegated to `zapierReadOnlyHeaders`
- the old `X-API-Key` and `/v1/zaps` path are gone
- no Zapier fetch uses `POST`, `PUT`, `PATCH`, or `DELETE`

- [ ] **Step 2: Run source test to verify it fails**

Run: `npx vitest run src/test/zapierSyncSource.test.ts`

Expected: FAIL against the current v1/API-key implementation.

- [ ] **Step 3: Refactor edge function**

Use the shared helpers, fetch Zapier v2 with bearer auth, page through results where Zapier provides a next URL, upsert mapped automation payloads, deactivate missing records, and keep integration status/error handling clear.

- [ ] **Step 4: Run source and mapping tests**

Run: `npx vitest run src/test/zapierReadOnlyMapping.test.ts src/test/zapierSyncSource.test.ts`

Expected: PASS.

### Task 4: Update Settings Copy

**Files:**
- Modify: `src/pages/Instellingen.tsx`

- [ ] **Step 1: Update Zapier card copy**

Change Zapier from an API-key import card to read-only wording:
- Description: `Lees bestaande Zaps read-only uit via de Zapier API`
- Token label: `Zapier OAuth/Bearer token`
- Hint: mention read-only scopes and existing Zaps, not API-key control.

- [ ] **Step 2: Run a focused source check**

Run: `npx vitest run src/test/zapierReadOnlyMapping.test.ts src/test/zapierSyncSource.test.ts`

Expected: PASS.

### Task 5: Verify Build

**Files:**
- No new files.

- [ ] **Step 1: Run focused tests**

Run: `npx vitest run src/test/zapierReadOnlyMapping.test.ts src/test/zapierSyncSource.test.ts`

Expected: PASS.

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: PASS. Existing Vite chunk-size warnings are acceptable if no errors occur.
