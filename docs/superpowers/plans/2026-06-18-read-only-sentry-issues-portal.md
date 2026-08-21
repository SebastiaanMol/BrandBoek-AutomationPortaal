# Read-Only Sentry Issues Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show unresolved Sentry issues inside the automation portal, linked to matching automations, without sending portal telemetry or source maps to Sentry.

**Architecture:** Remove/disable the earlier browser-side Sentry capture path, then add a read-only Supabase Edge Function that calls Sentry's REST API with server-side secrets. The frontend calls that Edge Function through the existing Supabase client, matches issues to automations with deterministic scoring, and renders badges in the automation overview plus a read-only issue card on the automation detail page.

**Tech Stack:** React 18, Vite, TypeScript, React Query, Supabase Edge Functions, Sentry REST API, Vitest, Testing Library.

---

## Scope Check

This plan implements one feature: read-only Sentry issue visibility inside the automation portal. It intentionally does not implement Sentry event capture, source-map upload, issue mutation, issue triage, or a global observability dashboard.

## File Structure

Create:

- `supabase/functions/sentry-issues/index.ts`
  Edge Function that reads Sentry issues using server-side secrets and returns sanitized issue summaries.

- `src/lib/sentryIssueMatching.ts`
  Pure matching utilities. Given portal automations and sanitized Sentry issues, returns issue matches by automation id with confidence.

- `src/lib/storage/sentryIssues.ts`
  Frontend storage client for invoking the `sentry-issues` Edge Function.

- `src/lib/queryHooks/sentryIssues.ts`
  React Query hooks for overview and detail Sentry issue reads.

- `src/components/SentryIssuesCard.tsx`
  Read-only issue card for `AutomationDetailPage`.

- `src/test/sentryIssueMatching.test.ts`
  Unit tests for exact, strong, possible, and unmatched linking.

- `src/test/sentryIssuesStorage.test.ts`
  Frontend storage tests for invoking the Edge Function and surfacing errors.

- `src/test/sentryIssuesUi.test.tsx`
  UI tests for overview badge and detail card states.

Modify:

- `src/lib/hooks.ts`
  Export the Sentry issue hooks.

- `src/pages/AutomationsPage.tsx`
  Add aggregate Sentry issue stat pill.

- `src/pages/AlleAutomatiseringen.tsx`
  Add Sentry issue badges in rows.

- `src/pages/AutomationDetailPage.tsx`
  Add `SentryIssuesCard`.

- `src/App.tsx`, `src/main.tsx`, `src/lib/sentry.ts`, `vite.config.ts`, `package.json`, `.env.example`, `.github/workflows/sentry-observability.yml`
  Remove/disable browser Sentry event capture and source-map upload behavior from the earlier observability direction.

Do not modify:

- Supabase database schema. V1 is live read-through with short frontend caching.
- Sentry issue state. No resolve/archive/update endpoints.

---

## Task 1: Remove Browser-Side Sentry Capture

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Delete: `src/lib/sentry.ts`
- Modify: `vite.config.ts`
- Modify: `package.json`
- Modify: `.env.example`
- Modify or delete: `.github/workflows/sentry-observability.yml`
- Test: `src/test/sentryConfig.test.ts`
- Test: `src/test/sentryAutomationContext.test.ts`
- Test: `src/test/sentryProcessContext.test.tsx`

- [ ] **Step 1: Remove Sentry imports from app startup**

In `src/main.tsx`, remove this import:

```ts
import "./lib/sentry";
```

In `src/App.tsx`, replace:

```ts
import { Sentry, createInstrumentedBrowserRouter } from "@/lib/sentry";
```

with no Sentry import. Replace the router factory:

```ts
const router = createInstrumentedBrowserRouter([
```

with:

```ts
const router = createBrowserRouter([
```

Remove the `Sentry.ErrorBoundary` wrapper. The app should render the router provider directly:

```tsx
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Remove manual Sentry captures**

Search:

```bash
rg -n "Sentry|captureAutomationException|buildAutomationSentryContext|@/lib/sentry" src
```

Remove imports and `Sentry.captureException(...)` calls from pages/components that were added only for portal telemetry. If the catch block currently only captured to Sentry, keep existing user-facing behavior and existing `console.error` or toast behavior. Do not add new telemetry.

Example replacement:

```ts
try {
  await saveProcessState(...);
} catch (err) {
  console.error("Kon processtatus niet opslaan", err);
  toast.error("Kon proces niet opslaan");
}
```

- [ ] **Step 3: Remove Sentry Vite upload plugin**

In `vite.config.ts`, remove imports and plugin config for `@sentry/vite-plugin`.

The plugin list should not reference `sentryVitePlugin`. Keep the normal React/Vite plugins unchanged:

```ts
plugins: [
  react(),
  mode === "development" && componentTagger(),
].filter(Boolean),
```

- [ ] **Step 4: Remove frontend Sentry dependencies**

Run:

```bash
npm uninstall @sentry/react @sentry/vite-plugin
```

Expected: `package.json` and `package-lock.json` no longer list `@sentry/react` or `@sentry/vite-plugin`.

- [ ] **Step 5: Remove Sentry telemetry env variables**

In `.env.example`, remove variables that enable frontend capture or source-map uploads:

```text
VITE_SENTRY_DSN=
VITE_SENTRY_ENVIRONMENT=
VITE_SENTRY_RELEASE=
VITE_SENTRY_TRACES_SAMPLE_RATE=
VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=
SENTRY_UPLOAD_SOURCE_MAPS=
```

Keep read-only Sentry variables out of Vite env. Document them under server-side Supabase secrets only:

```text
# Supabase Edge Function secrets, not browser env:
# SENTRY_AUTH_TOKEN=
# SENTRY_ORG=brand-boekhouders
# SENTRY_PROJECT=automations
```

- [ ] **Step 6: Remove obsolete Sentry telemetry tests**

Delete tests that only validate browser-side capture:

```bash
git rm src/test/sentryConfig.test.ts src/test/sentryAutomationContext.test.ts src/test/sentryProcessContext.test.tsx
```

If one of these tests has been repurposed locally, remove only assertions that depend on `src/lib/sentry.ts`.

- [ ] **Step 7: Run focused no-Sentry import check**

Run:

```bash
rg -n "Sentry|@sentry|sentryVitePlugin|VITE_SENTRY_DSN|captureAutomationException|createInstrumentedBrowserRouter" src vite.config.ts package.json .env.example .github
```

Expected: no matches for browser capture or upload code. Matches in docs/plans/specs are acceptable and should not be removed.

- [ ] **Step 8: Verify build still works**

Run:

```bash
npm test -- src/test/zapierAutomationDetailTemplate.test.tsx src/test/processenEditorEditMode.test.tsx
npm run build
```

Expected: tests pass and production build exits 0.

- [ ] **Step 9: Commit cleanup**

```bash
git add src package.json package-lock.json vite.config.ts .env.example .github
git commit -m "chore: remove browser sentry telemetry"
```

---

## Task 2: Add Pure Sentry Issue Matching

**Files:**
- Create: `src/lib/sentryIssueMatching.ts`
- Test: `src/test/sentryIssueMatching.test.ts`

- [ ] **Step 1: Write matching tests**

Create `src/test/sentryIssueMatching.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildSentryIssueSummary,
  matchSentryIssuesToAutomations,
  type PortalSentryIssue,
} from "@/lib/sentryIssueMatching";
import type { Automatisering } from "@/lib/types";

function makeAutomation(overrides: Partial<Automatisering>): Automatisering {
  return {
    id: "AUTO-1",
    naam: "BTW aangifte webhook",
    categorie: "Backend Script",
    doel: "",
    trigger: "",
    systemen: ["Backend"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  };
}

function makeIssue(overrides: Partial<PortalSentryIssue>): PortalSentryIssue {
  return {
    id: "123",
    shortId: "AUTO-1",
    title: "Unhandled error",
    culprit: "",
    level: "error",
    status: "unresolved",
    count: 3,
    firstSeen: "2026-06-17T10:00:00.000Z",
    lastSeen: "2026-06-18T10:00:00.000Z",
    permalink: "https://brand-boekhouders.sentry.io/issues/123/",
    metadataText: "",
    tags: {},
    ...overrides,
  };
}

describe("sentry issue matching", () => {
  it("matches exact automation_id tags", () => {
    const automation = makeAutomation({ id: "AUTO-BTW" });
    const issue = makeIssue({ tags: { automation_id: "AUTO-BTW" } });

    const result = matchSentryIssuesToAutomations([issue], [automation]);

    expect(result.byAutomationId["AUTO-BTW"][0]).toMatchObject({
      issueId: "123",
      confidence: "exact",
      reason: "automation_id tag",
    });
  });

  it("matches strong source identifiers", () => {
    const automation = makeAutomation({
      id: "AUTO-ZAP",
      externalId: "235361233",
      importProposal: { zap: { id: "235361233", title: "Zap" } },
    });
    const issue = makeIssue({
      title: "Zap 235361233 failed",
      metadataText: "request for zap_id=235361233 failed",
    });

    const result = matchSentryIssuesToAutomations([issue], [automation]);

    expect(result.byAutomationId["AUTO-ZAP"][0]).toMatchObject({
      confidence: "strong",
      reason: "source identifier",
    });
  });

  it("keeps text-only matches possible", () => {
    const automation = makeAutomation({ id: "AUTO-BTW", naam: "BTW aangifte webhook" });
    const issue = makeIssue({ title: "BTW aangifte webhook failed" });

    const result = matchSentryIssuesToAutomations([issue], [automation]);

    expect(result.byAutomationId["AUTO-BTW"][0]).toMatchObject({
      confidence: "possible",
      reason: "automation name",
    });
  });

  it("does not attach low confidence issues", () => {
    const automation = makeAutomation({ id: "AUTO-BTW", naam: "BTW aangifte webhook" });
    const issue = makeIssue({ title: "Unrelated timeout" });

    const result = matchSentryIssuesToAutomations([issue], [automation]);

    expect(result.byAutomationId["AUTO-BTW"]).toEqual([]);
    expect(result.unmatched[0].id).toBe("123");
  });

  it("builds overview summaries from exact and strong matches only", () => {
    const summary = buildSentryIssueSummary([
      { issueId: "1", confidence: "exact", reason: "automation_id tag", issue: makeIssue({ id: "1", count: 2 }) },
      { issueId: "2", confidence: "strong", reason: "source identifier", issue: makeIssue({ id: "2", count: 5 }) },
      { issueId: "3", confidence: "possible", reason: "automation name", issue: makeIssue({ id: "3", count: 9 }) },
    ]);

    expect(summary).toEqual({
      linkedIssueCount: 2,
      possibleIssueCount: 1,
      eventCount: 7,
      latestSeen: "2026-06-18T10:00:00.000Z",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/test/sentryIssueMatching.test.ts
```

Expected: fail because `src/lib/sentryIssueMatching.ts` does not exist.

- [ ] **Step 3: Implement matching utilities**

Create `src/lib/sentryIssueMatching.ts`:

```ts
import type { Automatisering } from "@/lib/types";

export type SentryIssueMatchConfidence = "exact" | "strong" | "possible" | "unmatched";

export interface PortalSentryIssue {
  id: string;
  shortId?: string;
  title: string;
  culprit?: string;
  level?: string;
  status: string;
  count: number;
  userCount?: number;
  firstSeen?: string;
  lastSeen?: string;
  permalink: string;
  metadataText?: string;
  tags?: Record<string, string>;
}

export interface SentryIssueMatch {
  issueId: string;
  issue: PortalSentryIssue;
  confidence: Exclude<SentryIssueMatchConfidence, "unmatched">;
  reason: string;
}

export interface AutomationSentryIssueSummary {
  linkedIssueCount: number;
  possibleIssueCount: number;
  eventCount: number;
  latestSeen: string | null;
}

export interface SentryIssueMatchResult {
  byAutomationId: Record<string, SentryIssueMatch[]>;
  summariesByAutomationId: Record<string, AutomationSentryIssueSummary>;
  unmatched: PortalSentryIssue[];
}

export function matchSentryIssuesToAutomations(
  issues: PortalSentryIssue[],
  automations: Automatisering[],
): SentryIssueMatchResult {
  const byAutomationId: Record<string, SentryIssueMatch[]> = Object.fromEntries(
    automations.map((automation) => [automation.id, []]),
  );
  const unmatched: PortalSentryIssue[] = [];

  for (const issue of issues) {
    const match = findBestAutomationMatch(issue, automations);
    if (!match) {
      unmatched.push(issue);
      continue;
    }
    byAutomationId[match.automationId].push({
      issueId: issue.id,
      issue,
      confidence: match.confidence,
      reason: match.reason,
    });
  }

  return {
    byAutomationId,
    summariesByAutomationId: Object.fromEntries(
      automations.map((automation) => [
        automation.id,
        buildSentryIssueSummary(byAutomationId[automation.id] ?? []),
      ]),
    ),
    unmatched,
  };
}

export function buildSentryIssueSummary(matches: SentryIssueMatch[]): AutomationSentryIssueSummary {
  const linked = matches.filter((match) => match.confidence === "exact" || match.confidence === "strong");
  const possible = matches.filter((match) => match.confidence === "possible");
  const latestSeen = matches
    .map((match) => match.issue.lastSeen)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    linkedIssueCount: linked.length,
    possibleIssueCount: possible.length,
    eventCount: linked.reduce((total, match) => total + Math.max(0, match.issue.count || 0), 0),
    latestSeen,
  };
}

function findBestAutomationMatch(issue: PortalSentryIssue, automations: Automatisering[]) {
  const exactTag = normalizeToken(issue.tags?.automation_id);
  if (exactTag) {
    const automation = automations.find((item) => normalizeToken(item.id) === exactTag);
    if (automation) {
      return { automationId: automation.id, confidence: "exact" as const, reason: "automation_id tag" };
    }
  }

  const searchableIssueText = normalizeSearchText([
    issue.title,
    issue.culprit,
    issue.shortId,
    issue.metadataText,
    Object.entries(issue.tags ?? {}).map(([key, value]) => `${key} ${value}`).join(" "),
  ].filter(Boolean).join(" "));

  for (const automation of automations) {
    const identifiers = getAutomationStrongIdentifiers(automation);
    if (identifiers.some((identifier) => searchableIssueText.includes(identifier))) {
      return { automationId: automation.id, confidence: "strong" as const, reason: "source identifier" };
    }
  }

  for (const automation of automations) {
    const name = normalizeSearchText(automation.naam);
    if (name.length >= 8 && searchableIssueText.includes(name)) {
      return { automationId: automation.id, confidence: "possible" as const, reason: "automation name" };
    }
  }

  return null;
}

function getAutomationStrongIdentifiers(automation: Automatisering): string[] {
  const proposal = automation.importProposal ?? {};
  const zap = typeof proposal.zap === "object" && proposal.zap ? proposal.zap : {};
  const typeform = typeof proposal.typeform === "object" && proposal.typeform ? proposal.typeform : {};
  const typeformForm = "form" in typeform && typeof typeform.form === "object" && typeform.form ? typeform.form : {};
  const gitlabEndpoint = automation.gitlabEndpoint ?? {};
  const hubspotWorkflowId = automation.hubspotWorkflow?.workflowId;

  return [
    automation.id,
    automation.externalId,
    hubspotWorkflowId,
    typeof zap.id === "string" ? zap.id : undefined,
    typeof typeformForm.id === "string" ? typeformForm.id : undefined,
    automation.gitlabFilePath,
    gitlabEndpoint.endpoint,
    gitlabEndpoint.handler,
    ...(automation.webhookPaths ?? []),
  ]
    .map((value) => normalizeSearchText(value ?? ""))
    .filter((value) => value.length >= 4);
}

function normalizeToken(value: string | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
```

- [ ] **Step 4: Run test to verify matching passes**

Run:

```bash
npm test -- src/test/sentryIssueMatching.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit matching utilities**

```bash
git add src/lib/sentryIssueMatching.ts src/test/sentryIssueMatching.test.ts
git commit -m "feat: add sentry issue matching"
```

---

## Task 3: Add Read-Only Sentry Edge Function

**Files:**
- Create: `supabase/functions/sentry-issues/index.ts`
- Test: `src/test/sentryIssuesEdgeSource.test.ts`

- [ ] **Step 1: Write source-level Edge Function tests**

Create `src/test/sentryIssuesEdgeSource.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "supabase/functions/sentry-issues/index.ts"), "utf8");

describe("sentry-issues edge function source", () => {
  it("uses server-side Sentry secrets only", () => {
    expect(source).toContain('Deno.env.get("SENTRY_AUTH_TOKEN")');
    expect(source).toContain('Deno.env.get("SENTRY_ORG")');
    expect(source).toContain('Deno.env.get("SENTRY_PROJECT")');
    expect(source).not.toContain("VITE_SENTRY");
  });

  it("calls the organization issues API without mutation endpoints", () => {
    expect(source).toContain("/api/0/organizations/");
    expect(source).toContain("/issues/");
    expect(source).not.toMatch(/PUT|PATCH|DELETE/);
    expect(source).not.toContain("/resolve");
  });

  it("sanitizes issue fields instead of returning raw Sentry payloads", () => {
    expect(source).toContain("sanitizeSentryIssue");
    expect(source).toContain("metadataText");
    expect(source).not.toContain("entries");
    expect(source).not.toContain("stacktrace");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/test/sentryIssuesEdgeSource.test.ts
```

Expected: fail because the function file does not exist.

- [ ] **Step 3: Implement the Edge Function**

Create `supabase/functions/sentry-issues/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestMode = "overview" | "detail";

interface SentryIssuesRequest {
  mode?: RequestMode;
  automationId?: string;
  limit?: number;
}

interface RawSentryIssue {
  id?: string;
  shortId?: string;
  title?: string;
  culprit?: string;
  level?: string;
  status?: string;
  count?: string | number;
  userCount?: string | number;
  firstSeen?: string;
  lastSeen?: string;
  permalink?: string;
  metadata?: Record<string, unknown>;
  tags?: Array<{ key?: string; value?: string }> | Record<string, string>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await readRequestBody(req);
    const limit = clampLimit(body.limit, body.mode === "detail" ? 25 : 100);
    const token = requiredEnv("SENTRY_AUTH_TOKEN");
    const org = requiredEnv("SENTRY_ORG");
    const project = requiredEnv("SENTRY_PROJECT");

    const issues = await fetchSentryIssues({ token, org, project, limit });

    return json({
      mode: body.mode ?? "overview",
      automationId: body.automationId ?? null,
      issues: issues.map(sanitizeSentryIssue),
      limited: issues.length >= limit,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interne fout";
    const status = message.includes("missing") ? 500 : 502;
    console.error("sentry-issues read failed:", message);
    return json({ error: "Kon Sentry issues niet ophalen" }, status);
  }
});

async function readRequestBody(req: Request): Promise<SentryIssuesRequest> {
  const raw = await req.text();
  if (!raw.trim()) return { mode: "overview" };
  const parsed = JSON.parse(raw) as SentryIssuesRequest;
  if (parsed.mode && parsed.mode !== "overview" && parsed.mode !== "detail") {
    throw new Error("invalid mode");
  }
  return parsed;
}

async function fetchSentryIssues({
  token,
  org,
  project,
  limit,
}: {
  token: string;
  org: string;
  project: string;
  limit: number;
}): Promise<RawSentryIssue[]> {
  const url = new URL(`https://sentry.io/api/0/organizations/${encodeURIComponent(org)}/issues/`);
  url.searchParams.set("project", project);
  url.searchParams.set("query", "is:unresolved");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "date");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`sentry read failed: ${response.status}`);
  }

  const json = await response.json();
  return Array.isArray(json) ? json as RawSentryIssue[] : [];
}

function sanitizeSentryIssue(issue: RawSentryIssue) {
  const tags = normalizeTags(issue.tags);
  const metadataText = [
    issue.title,
    issue.culprit,
    issue.shortId,
    Object.entries(tags).map(([key, value]) => `${key}:${value}`).join(" "),
    safeMetadataText(issue.metadata),
  ].filter(Boolean).join(" ");

  return {
    id: String(issue.id ?? ""),
    shortId: issue.shortId ? String(issue.shortId) : undefined,
    title: String(issue.title ?? "Sentry issue"),
    culprit: issue.culprit ? String(issue.culprit) : undefined,
    level: issue.level ? String(issue.level) : undefined,
    status: String(issue.status ?? "unknown"),
    count: toNumber(issue.count),
    userCount: toNumber(issue.userCount),
    firstSeen: issue.firstSeen,
    lastSeen: issue.lastSeen,
    permalink: String(issue.permalink ?? ""),
    metadataText,
    tags,
  };
}

function normalizeTags(tags: RawSentryIssue["tags"]): Record<string, string> {
  if (!tags) return {};
  if (Array.isArray(tags)) {
    return Object.fromEntries(
      tags
        .filter((tag) => tag.key && tag.value)
        .map((tag) => [String(tag.key), String(tag.value)]),
    );
  }
  return tags;
}

function safeMetadataText(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) return "";
  return Object.entries(metadata)
    .filter(([key]) => !/token|secret|password|cookie|authorization|email/i.test(key))
    .map(([key, value]) => `${key}:${String(value).slice(0, 160)}`)
    .join(" ");
}

function toNumber(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampLimit(value: number | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(1, Math.floor(parsed)));
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} missing`);
  return value;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}
```

- [ ] **Step 4: Run Edge Function source tests**

Run:

```bash
npm test -- src/test/sentryIssuesEdgeSource.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Edge Function**

```bash
git add supabase/functions/sentry-issues/index.ts src/test/sentryIssuesEdgeSource.test.ts
git commit -m "feat: add read-only sentry issues function"
```

---

## Task 4: Add Frontend Sentry Issue Storage and Hooks

**Files:**
- Create: `src/lib/storage/sentryIssues.ts`
- Create: `src/lib/queryHooks/sentryIssues.ts`
- Modify: `src/lib/hooks.ts`
- Test: `src/test/sentryIssuesStorage.test.ts`

- [ ] **Step 1: Write storage tests**

Create `src/test/sentryIssuesStorage.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSentryIssues } from "@/lib/storage/sentryIssues";

const invoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke },
  },
}));

describe("sentry issue storage", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("invokes sentry-issues in overview mode", async () => {
    invoke.mockResolvedValue({
      data: { issues: [], limited: false, fetchedAt: "2026-06-18T10:00:00.000Z" },
      error: null,
    });

    await fetchSentryIssues({ mode: "overview" });

    expect(invoke).toHaveBeenCalledWith("sentry-issues", {
      body: { mode: "overview", limit: 100 },
    });
  });

  it("invokes sentry-issues in detail mode", async () => {
    invoke.mockResolvedValue({
      data: { issues: [], limited: false, fetchedAt: "2026-06-18T10:00:00.000Z" },
      error: null,
    });

    await fetchSentryIssues({ mode: "detail", automationId: "AUTO-1" });

    expect(invoke).toHaveBeenCalledWith("sentry-issues", {
      body: { mode: "detail", automationId: "AUTO-1", limit: 25 },
    });
  });

  it("throws readable edge function errors", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: "FunctionsHttpError" },
    });

    await expect(fetchSentryIssues({ mode: "overview" })).rejects.toThrow("FunctionsHttpError");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/test/sentryIssuesStorage.test.ts
```

Expected: fail because storage module does not exist.

- [ ] **Step 3: Implement storage client**

Create `src/lib/storage/sentryIssues.ts`:

```ts
import { supabase } from "@/integrations/supabase/client";
import type { PortalSentryIssue } from "@/lib/sentryIssueMatching";

export type SentryIssuesMode = "overview" | "detail";

export interface FetchSentryIssuesInput {
  mode: SentryIssuesMode;
  automationId?: string;
  limit?: number;
}

export interface FetchSentryIssuesResult {
  issues: PortalSentryIssue[];
  limited: boolean;
  fetchedAt: string;
}

export async function fetchSentryIssues(input: FetchSentryIssuesInput): Promise<FetchSentryIssuesResult> {
  const limit = input.limit ?? (input.mode === "detail" ? 25 : 100);
  const body = input.mode === "detail"
    ? { mode: input.mode, automationId: input.automationId, limit }
    : { mode: input.mode, limit };

  const { data, error } = await supabase.functions.invoke("sentry-issues", { body });

  if (error) throw new Error(error.message);

  const result = data as Partial<FetchSentryIssuesResult> | null;
  return {
    issues: Array.isArray(result?.issues) ? result.issues : [],
    limited: Boolean(result?.limited),
    fetchedAt: typeof result?.fetchedAt === "string" ? result.fetchedAt : new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Implement React Query hooks**

Create `src/lib/queryHooks/sentryIssues.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { fetchSentryIssues } from "@/lib/storage/sentryIssues";
import { matchSentryIssuesToAutomations } from "@/lib/sentryIssueMatching";
import type { Automatisering } from "@/lib/types";

const SENTRY_STALE_TIME_MS = 60_000;

export function useAutomationSentryIssueOverview(automations: Automatisering[]) {
  return useQuery({
    queryKey: ["sentryIssues", "overview", automations.map((automation) => automation.id).join("|")],
    queryFn: async () => {
      const result = await fetchSentryIssues({ mode: "overview" });
      return {
        ...result,
        matches: matchSentryIssuesToAutomations(result.issues, automations),
      };
    },
    enabled: automations.length > 0,
    staleTime: SENTRY_STALE_TIME_MS,
    retry: 1,
  });
}

export function useAutomationSentryIssues(automation: Automatisering | null, automations: Automatisering[]) {
  return useQuery({
    queryKey: ["sentryIssues", "detail", automation?.id ?? "none"],
    queryFn: async () => {
      const result = await fetchSentryIssues({
        mode: "detail",
        automationId: automation?.id,
      });
      const matches = matchSentryIssuesToAutomations(result.issues, automations);
      return {
        ...result,
        matches: automation ? matches.byAutomationId[automation.id] ?? [] : [],
        summary: automation ? matches.summariesByAutomationId[automation.id] : undefined,
      };
    },
    enabled: Boolean(automation),
    staleTime: SENTRY_STALE_TIME_MS,
    retry: 1,
  });
}
```

Modify `src/lib/hooks.ts`:

```ts
export * from "./queryHooks/sentryIssues";
```

- [ ] **Step 5: Run storage tests**

Run:

```bash
npm test -- src/test/sentryIssuesStorage.test.ts src/test/sentryIssueMatching.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit storage and hooks**

```bash
git add src/lib/storage/sentryIssues.ts src/lib/queryHooks/sentryIssues.ts src/lib/hooks.ts src/test/sentryIssuesStorage.test.ts
git commit -m "feat: add sentry issue query hooks"
```

---

## Task 5: Add Detail Page Sentry Issues Card

**Files:**
- Create: `src/components/SentryIssuesCard.tsx`
- Modify: `src/pages/AutomationDetailPage.tsx`
- Test: `src/test/sentryIssuesUi.test.tsx`

- [ ] **Step 1: Write detail card UI tests**

Create `src/test/sentryIssuesUi.test.tsx` with the detail-card tests first:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SentryIssuesCard } from "@/components/SentryIssuesCard";
import type { SentryIssueMatch } from "@/lib/sentryIssueMatching";

function makeMatch(overrides: Partial<SentryIssueMatch> = {}): SentryIssueMatch {
  return {
    issueId: "123",
    confidence: "strong",
    reason: "source identifier",
    issue: {
      id: "123",
      shortId: "AUTOMATIONS-1",
      title: "BTW pipeline failed",
      culprit: "btw_pipeline.py",
      level: "error",
      status: "unresolved",
      count: 4,
      lastSeen: "2026-06-18T10:00:00.000Z",
      firstSeen: "2026-06-17T10:00:00.000Z",
      permalink: "https://brand-boekhouders.sentry.io/issues/123/",
      tags: {},
    },
    ...overrides,
  };
}

describe("SentryIssuesCard", () => {
  it("shows empty read-only state", () => {
    render(<SentryIssuesCard isLoading={false} error={null} matches={[]} limited={false} />);

    expect(screen.getByText("Geen gekoppelde Sentry issues")).toBeInTheDocument();
  });

  it("shows linked issues with external links", () => {
    render(<SentryIssuesCard isLoading={false} error={null} matches={[makeMatch()]} limited={false} />);

    expect(screen.getByText("BTW pipeline failed")).toBeInTheDocument();
    expect(screen.getByText("4 events")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open in sentry/i })).toHaveAttribute(
      "href",
      "https://brand-boekhouders.sentry.io/issues/123/",
    );
  });

  it("shows possible matches separately", () => {
    render(
      <SentryIssuesCard
        isLoading={false}
        error={null}
        matches={[makeMatch({ confidence: "possible", reason: "automation name" })]}
        limited={false}
      />,
    );

    expect(screen.getByText("Mogelijke matches")).toBeInTheDocument();
    expect(screen.getByText("automation name")).toBeInTheDocument();
  });

  it("shows a non-blocking error", () => {
    render(<SentryIssuesCard isLoading={false} error={new Error("Kon Sentry issues niet ophalen")} matches={[]} limited={false} />);

    expect(screen.getByText("Sentry issues niet beschikbaar")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/test/sentryIssuesUi.test.tsx
```

Expected: fail because `SentryIssuesCard` does not exist.

- [ ] **Step 3: Implement `SentryIssuesCard`**

Create `src/components/SentryIssuesCard.tsx`:

```tsx
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import type { SentryIssueMatch } from "@/lib/sentryIssueMatching";

interface SentryIssuesCardProps {
  isLoading: boolean;
  error: Error | null;
  matches: SentryIssueMatch[];
  limited: boolean;
}

export function SentryIssuesCard({
  isLoading,
  error,
  matches,
  limited,
}: SentryIssuesCardProps): React.ReactNode {
  const linked = matches.filter((match) => match.confidence === "exact" || match.confidence === "strong");
  const possible = matches.filter((match) => match.confidence === "possible");

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">Sentry issues</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Read-only foutsignalen</h2>
        </div>
        {isLoading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Sentry issues niet beschikbaar
          </div>
          <p className="mt-1 text-amber-800">De automation blijft normaal bruikbaar. Alleen de read-only Sentry koppeling kon niet worden gelezen.</p>
        </div>
      )}

      {!isLoading && !error && matches.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Geen gekoppelde Sentry issues
        </div>
      )}

      {linked.length > 0 && (
        <IssueList title="Gekoppelde issues" matches={linked} />
      )}

      {possible.length > 0 && (
        <IssueList title="Mogelijke matches" matches={possible} muted />
      )}

      {limited && (
        <p className="mt-3 text-xs text-slate-500">Resultaat beperkt door de Sentry API limiet.</p>
      )}
    </section>
  );
}

function IssueList({
  title,
  matches,
  muted = false,
}: {
  title: string;
  matches: SentryIssueMatch[];
  muted?: boolean;
}) {
  return (
    <div className="mt-4 space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {matches.map((match) => (
        <article
          key={match.issue.id}
          className={`rounded-xl border px-4 py-3 ${
            muted ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"
          }`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-slate-950">{match.issue.title}</p>
              <p className="mt-1 text-sm text-slate-600">
                {formatCount(match.issue.count)} events · {match.issue.level ?? "level onbekend"} · {match.issue.status}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Match: {match.reason}{match.issue.lastSeen ? ` · Laatst gezien ${formatDate(match.issue.lastSeen)}` : ""}
              </p>
            </div>
            {match.issue.permalink && (
              <a
                href={match.issue.permalink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-950 shadow-sm transition-colors hover:bg-slate-50"
              >
                Open in Sentry
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("nl-NL").format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "onbekend";
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
```

- [ ] **Step 4: Attach card to automation detail page**

In `src/pages/AutomationDetailPage.tsx`, add imports:

```ts
import { SentryIssuesCard } from "@/components/SentryIssuesCard";
import { useAutomationSentryIssues } from "@/lib/hooks";
```

After `const sourceQuality = ...`, add:

```ts
const sentryIssuesQuery = useAutomationSentryIssues(automation ?? null, automations);
```

After `<SourceQualityCard presentation={sourceQuality} />`, add:

```tsx
<SentryIssuesCard
  isLoading={sentryIssuesQuery.isLoading}
  error={sentryIssuesQuery.error instanceof Error ? sentryIssuesQuery.error : null}
  matches={sentryIssuesQuery.data?.matches ?? []}
  limited={Boolean(sentryIssuesQuery.data?.limited)}
/>
```

- [ ] **Step 5: Run detail UI tests**

Run:

```bash
npm test -- src/test/sentryIssuesUi.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit detail card**

```bash
git add src/components/SentryIssuesCard.tsx src/pages/AutomationDetailPage.tsx src/test/sentryIssuesUi.test.tsx
git commit -m "feat: show sentry issues on automation detail"
```

---

## Task 6: Add Overview Sentry Badges

**Files:**
- Modify: `src/pages/AutomationsPage.tsx`
- Modify: `src/pages/AlleAutomatiseringen.tsx`
- Test: `src/test/sentryIssuesUi.test.tsx`

- [ ] **Step 1: Extend UI tests for overview badges**

Append to `src/test/sentryIssuesUi.test.tsx`:

```tsx
import { SentryIssueBadge } from "@/pages/AlleAutomatiseringen";

describe("SentryIssueBadge", () => {
  it("shows linked issue count", () => {
    render(<SentryIssueBadge linkedIssueCount={2} possibleIssueCount={0} />);

    expect(screen.getByText("2 Sentry")).toBeInTheDocument();
  });

  it("shows possible match count when no linked issues exist", () => {
    render(<SentryIssueBadge linkedIssueCount={0} possibleIssueCount={1} />);

    expect(screen.getByText("Mogelijke Sentry match")).toBeInTheDocument();
  });

  it("renders nothing when no issues exist", () => {
    const { container } = render(<SentryIssueBadge linkedIssueCount={0} possibleIssueCount={0} />);

    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/test/sentryIssuesUi.test.tsx
```

Expected: fail because `SentryIssueBadge` is not exported.

- [ ] **Step 3: Add overview query to `AutomationsPage`**

In `src/pages/AutomationsPage.tsx`, import:

```ts
import { useAutomationSentryIssueOverview } from "@/lib/hooks";
```

After `const warningCount = ...`, add:

```ts
const sentryOverviewQuery = useAutomationSentryIssueOverview(automations);
const sentryIssueCount = Object.values(
  sentryOverviewQuery.data?.matches.summariesByAutomationId ?? {},
).reduce((total, summary) => total + summary.linkedIssueCount, 0);
```

Add a stat pill:

```tsx
<StatPill value={sentryIssueCount} label="Sentry issues" />
```

Pass summaries into `AlleAutomatiseringen`:

```tsx
<AlleAutomatiseringen
  sourceFilter={sourceFilter}
  sourceTabs={sourceTabs}
  onSourceFilterChange={setSourceFilter}
  sentrySummaries={sentryOverviewQuery.data?.matches.summariesByAutomationId ?? {}}
/>
```

- [ ] **Step 4: Add row badge support to `AlleAutomatiseringen`**

In `src/pages/AlleAutomatiseringen.tsx`, import type:

```ts
import type { AutomationSentryIssueSummary } from "@/lib/sentryIssueMatching";
```

Extend props:

```ts
interface AlleAutomatiseringenProps {
  sourceFilter?: SourceFilter;
  sourceTabs?: Array<{ value: SourceFilter; label: string; count: number }>;
  onSourceFilterChange?: (value: SourceFilter) => void;
  sentrySummaries?: Record<string, AutomationSentryIssueSummary>;
}
```

Default the prop:

```ts
export default function AlleAutomatiseringen({
  sourceFilter = "alle",
  sourceTabs = [],
  onSourceFilterChange,
  sentrySummaries = {},
}: AlleAutomatiseringenProps) {
```

When rendering `AutomationCatalogRow`, pass:

```tsx
sentrySummary={sentrySummaries[a.id]}
```

Extend row props:

```ts
sentrySummary?: AutomationSentryIssueSummary;
```

Render near the source warning badge:

```tsx
<SentryIssueBadge
  linkedIssueCount={sentrySummary?.linkedIssueCount ?? 0}
  possibleIssueCount={sentrySummary?.possibleIssueCount ?? 0}
/>
```

Add and export the badge component:

```tsx
export function SentryIssueBadge({
  linkedIssueCount,
  possibleIssueCount,
}: {
  linkedIssueCount: number;
  possibleIssueCount: number;
}) {
  if (linkedIssueCount > 0) {
    return (
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
        <AlertTriangle className="h-3 w-3" />
        {new Intl.NumberFormat("nl-NL").format(linkedIssueCount)} Sentry
      </span>
    );
  }

  if (possibleIssueCount > 0) {
    return (
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
        <AlertTriangle className="h-3 w-3" />
        Mogelijke Sentry match
      </span>
    );
  }

  return null;
}
```

- [ ] **Step 5: Run overview UI tests**

Run:

```bash
npm test -- src/test/sentryIssuesUi.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit overview badges**

```bash
git add src/pages/AutomationsPage.tsx src/pages/AlleAutomatiseringen.tsx src/test/sentryIssuesUi.test.tsx
git commit -m "feat: show sentry issue badges in automation overview"
```

---

## Task 7: Final Verification and Deployment Notes

**Files:**
- Modify: `docs/superpowers/plans/2026-06-18-sentry-portal-observability.md`
- Modify: `docs/superpowers/specs/2026-06-18-read-only-sentry-issues-portal-design.md`

- [ ] **Step 1: Update old observability plan status**

In `docs/superpowers/plans/2026-06-18-sentry-portal-observability.md`, add a clear note near the top:

```md
> Superseded for the current Sentry use case by `docs/superpowers/specs/2026-06-18-read-only-sentry-issues-portal-design.md`.
> The accepted direction is read-only issue import into the portal. Browser-side portal telemetry, replay, tracing, and source-map uploads are not part of the active implementation.
```

- [ ] **Step 2: Run all focused Sentry issue tests**

Run:

```bash
npm test -- src/test/sentryIssueMatching.test.ts src/test/sentryIssuesStorage.test.ts src/test/sentryIssuesEdgeSource.test.ts src/test/sentryIssuesUi.test.tsx
```

Expected: all pass.

- [ ] **Step 3: Run impacted automation page tests**

Run:

```bash
npm test -- src/test/zapierAutomationDetailTemplate.test.tsx src/test/typeformAutomationDetailTemplate.test.tsx src/test/hubspotAutomationDetailTemplate.test.tsx src/test/zapierAutomationsVisibility.test.ts
```

Expected: all pass.

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: build exits 0. Existing Vite chunk-size warnings are acceptable.

- [ ] **Step 5: Confirm no browser Sentry capture remains**

Run:

```bash
rg -n "Sentry.init|@sentry/react|@sentry/vite-plugin|VITE_SENTRY_DSN|SENTRY_UPLOAD_SOURCE_MAPS|captureException" src package.json vite.config.ts .env.example .github
```

Expected: no matches. If a match is in a test fixture that explicitly checks absence, it is acceptable.

- [ ] **Step 6: Document Supabase secret expectation**

Add this note to the read-only Sentry spec rollout section:

```md
Runtime requires these Supabase Edge Function secrets:

- `SENTRY_AUTH_TOKEN`: read-only token.
- `SENTRY_ORG`: `brand-boekhouders`.
- `SENTRY_PROJECT`: `automations`.

Do not add these as Vite/browser variables.
```

- [ ] **Step 7: Commit final docs and verification cleanup**

```bash
git add docs/superpowers/plans/2026-06-18-sentry-portal-observability.md docs/superpowers/specs/2026-06-18-read-only-sentry-issues-portal-design.md
git commit -m "docs: mark sentry issue reader rollout"
```

---

## Execution Notes

- The existing local dirty file `supabase/.temp/cli-latest` is unrelated and should not be included in commits.
- Do not use GitHub Actions secrets for the runtime read-only token unless a workflow also needs to read Sentry. The portal runtime path uses Supabase Edge Function secrets.
- Deploy the Edge Function after implementation with:

```bash
supabase functions deploy sentry-issues --project-ref icvrrpxtycwgaxcajwdf
```

- Verify Supabase secrets before live testing:

```bash
supabase secrets list --project-ref icvrrpxtycwgaxcajwdf
```

Expected secret names:

```text
SENTRY_AUTH_TOKEN
SENTRY_ORG
SENTRY_PROJECT
```

Do not print secret values.

## Self-Review

- Spec coverage: read-only token handling, no browser capture, overview badges, detail card, matching fallback, sanitized Edge Function, and non-blocking error states are covered.
- Placeholder scan: no `TBD`, `TODO`, or unspecified "add handling" steps remain.
- Type consistency: `PortalSentryIssue`, `SentryIssueMatch`, `AutomationSentryIssueSummary`, hook names, and component props are defined before they are consumed.
