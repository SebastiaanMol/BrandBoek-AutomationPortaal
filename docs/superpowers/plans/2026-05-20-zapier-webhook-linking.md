# Zapier Webhook Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Zapier Zaps linkable to backend automations through webhook-match suggestions that users must confirm before they affect process journeys.

**Architecture:** Reuse the existing `detect-flow-links` edge function and existing `automatisering_ai_flows` suggestion table. Add explicit Zapier webhook reasoning on top of the existing `webhook_paths -> endpoints` matcher, keep suggestions unconfirmed, and rely on existing confirmed-link process journey logic after review.

**Tech Stack:** Supabase Edge Functions, TypeScript/Deno, Vitest source-guard tests, existing React portal for viewing suggestions.

---

## Files

- Modify: `supabase/functions/detect-flow-links/index.ts`
  - Add explicit Zapier source detection.
  - Normalize displayed endpoint paths in webhook reasoning.
  - Emit `Webhook-match: Zapier roept endpoint ... aan.` for Zapier -> backend matches.
  - Keep suggestions `confirmed: false` and `rejected: false`.
- Create: `src/test/zapierWebhookLinkingSource.test.ts`
  - Source-level regression tests for the edge function behavior and guardrails.

## Task 1: Add Regression Tests

- [ ] **Step 1: Write failing source tests**

Create `src/test/zapierWebhookLinkingSource.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "supabase/functions/detect-flow-links/index.ts"), "utf8");

describe("Zapier webhook link detection", () => {
  it("treats Zapier webhook matches as explicit review suggestions", () => {
    expect(source).toContain("isZapierAutomation");
    expect(source).toContain("buildWebhookMatchReason");
    expect(source).toContain("Webhook-match: Zapier roept endpoint");
  });

  it("keeps Zapier webhook suggestions unconfirmed for user review", () => {
    expect(source).toContain("confirmed: false");
    expect(source).toContain("rejected: false");
  });

  it("matches webhook paths against normalized endpoint paths", () => {
    expect(source).toContain("normalizeEndpointPath");
    expect(source).toContain("endpointMatches(webhookPath, endpoint)");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
npx vitest run src/test/zapierWebhookLinkingSource.test.ts
```

Expected: fails because `isZapierAutomation`, `buildWebhookMatchReason`, and `normalizeEndpointPath` do not exist yet.

## Task 2: Implement Zapier Webhook Reasoning

- [ ] **Step 1: Add endpoint normalization and Zapier detection**

In `supabase/functions/detect-flow-links/index.ts`, add:

```ts
function normalizeEndpointPath(value: string): string {
  return value
    .trim()
    .replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "");
}

function isZapierAutomation(auto: Automation): boolean {
  return auto.source === "zapier";
}
```

- [ ] **Step 2: Update `endpointMatches`**

Use normalized paths:

```ts
function endpointMatches(webhookPath: string, endpoint: string): boolean {
  const normalizedWebhook = normalizeEndpointPath(webhookPath);
  const normalizedEndpoint = normalizeEndpointPath(endpoint);
  if (!normalizedWebhook || !normalizedEndpoint) return false;
  return normalizedWebhook === normalizedEndpoint || normalizedWebhook.endsWith(normalizedEndpoint);
}
```

- [ ] **Step 3: Add user-facing reasoning helper**

Add:

```ts
function buildWebhookMatchReason(source: Automation, endpoint: string): string {
  const normalizedEndpoint = normalizeEndpointPath(endpoint) || endpoint;
  if (isZapierAutomation(source)) {
    return `Webhook-match: Zapier roept endpoint ${normalizedEndpoint} aan.`;
  }
  return `Webhook-match: automation roept endpoint ${normalizedEndpoint} aan.`;
}
```

- [ ] **Step 4: Use the reasoning helper in `detectWebhookSuggestions`**

Replace:

```ts
reasoning: endpoint,
```

with:

```ts
reasoning: buildWebhookMatchReason(source, endpoint),
```

- [ ] **Step 5: Run the focused test**

Run:

```powershell
npx vitest run src/test/zapierWebhookLinkingSource.test.ts
```

Expected: passes.

## Task 3: Verify and Deploy

- [ ] **Step 1: Run focused detection tests**

Run:

```powershell
npx vitest run src/test/zapierWebhookLinkingSource.test.ts src/test/zapierJsonExportMapping.test.ts src/test/zapierAutomationsVisibility.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm test
npm run build
npm run lint
```

Expected:

- Tests pass.
- Build passes.
- Lint has no errors. Existing warnings are acceptable if unchanged.

- [ ] **Step 3: Deploy detect-flow-links**

Run:

```powershell
npx supabase functions deploy detect-flow-links
```

Expected: deployment succeeds.

- [ ] **Step 4: Live detection check**

Call the deployed `detect-flow-links` edge function with `{ "mode": "webhook" }` from an authenticated browser/session.

Expected:

- Function returns `200`.
- Response includes webhook suggestions.
- At least one suggestion has a Zapier source when webhook endpoints match.
- Saved Zapier suggestions remain `confirmed = false`.

## Self-Review

- Spec coverage: covers Zapier webhook matching, review-first behavior, reasoning labels, no auto-confirmation.
- Placeholder scan: no TBD/TODO placeholders.
- Scope: limited to detection and suggestion creation; process journeys continue to use existing confirmed links.
