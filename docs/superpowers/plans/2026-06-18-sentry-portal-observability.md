# Sentry Portal Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Superseded for current implementation:** For the active read-only Sentry issue portal use case, use `docs/superpowers/specs/2026-06-18-read-only-sentry-issues-portal-design.md` instead of this browser observability plan. Browser telemetry, replay, tracing, `captureException` instrumentation, and source-map uploads are not part of the active implementation.

**Goal:** Add Sentry to the automation portal so production frontend crashes, process-canvas failures, automation-specific failures, Supabase call failures, and hard-to-reproduce user sessions become diagnosable.

**Architecture:** Use Sentry as a client-side observability layer, not as a replacement for the existing domain runtime telemetry. Initialize Sentry before app render, wrap the React 18 tree with `Sentry.ErrorBoundary`, instrument React Router v6 navigation, upload production source maps from Vite, and manually capture high-value failures where the app currently only shows a toast or writes `console.error`.

**Tech Stack:** React 18, Vite 8, TypeScript, React Router v6, React Query, Supabase, `@sentry/react`, `@sentry/vite-plugin`, Vitest.

**Current status:** Local code implementation and verification are complete. A GitHub Actions workflow now runs the relevant regression tests and a normal production build. Source-map upload is prepared but explicitly disabled unless `SENTRY_UPLOAD_SOURCE_MAPS=true` is configured together with a release-capable token. The current rollout policy is read-only/runtime observability: use the DSN for event capture and read-scoped Sentry token for inspection, without granting upload/write permissions.

---

## Research Summary

Sentry is a good fit for this portal because the current app has complex browser-only state and interactions: BPMN/process canvas editing, route drawing, imports, exports, sync controls, Supabase persistence, and AI/edge-function calls. These are exactly the kinds of flows where a user can say "it did not load" or "the line jumped" while the developer has no stack trace, browser context, or reproducible state.

Useful portal-specific purposes:

- Capture uncaught React and browser errors in production, including minified stack traces mapped back through source maps.
- Add context to process viewer/editor bugs, such as selected pipeline id, active route mode, lane count, zoom level, and whether the user was in viewer or editor mode.
- Capture save/import/export failures where users currently only see a toast and developers may only get a local console line.
- Show which automation was involved in a failure, including automation id, name, source, status, systems, pipeline/stage link, and the action being performed.
- Distinguish failures in automation fetch/save/delete/verify, AI extraction, import approval, sync actions, source quality review, and process journey linking.
- Use replay-on-error sampling for canvas and process bugs that are difficult to reproduce from a screenshot.
- Track frontend navigation and page-load performance for heavy pages like `/procesviewer`, `/imports`, `/runtime`, and `/flows`.
- Correlate user-visible "BTW pipeline laadt niet" style reports with the actual failing request, route, browser, release, and stack trace.

Recommended initial scope:

- Enable Errors, React ErrorBoundary, React Router v6 tracing, source maps, and replay-on-error only.
- Keep normal session replay off at first: `replaysSessionSampleRate: 0`.
- Set replay on error to a limited rate, for example `0.25`, then raise only if needed.
- Keep `sendDefaultPii: false`.
- Scrub event data for emails, access tokens, HubSpot/Zapier/GitLab tokens, and large process payloads.
- Add explicit context and `captureException` only in high-value failure paths, not everywhere.
- Add an automation-specific capture helper so events are searchable by action, source, status, and automation id without leaking full payloads.

Out of scope for the first rollout:

- Backend/Edge Function Sentry SDKs.
- Always-on logs.
- Profiling.
- User feedback widget.
- Replacing existing `runtimeTelemetry` and `runtimeObservability` modules.

## Automation-Level Insight

The main product value should be: when someone says "automation X heeft een error" or "deze sync/import werkt niet", Sentry should answer:

- Which automation was involved: `automation.id`, `automation.naam`, `source`, `externalId`, `status`, `systemen`, `pipelineId`, `stageId`.
- Which user action failed: `fetch`, `create`, `update`, `archive`, `verify`, `ai_extract`, `import_approve`, `sync_hubspot`, `sync_gitlab`, `sync_typeform`, `sync_zapier`, `process_link`, `flow_save`.
- Which page/route failed: `/alle`, `/automations/:id`, `/imports`, `/instellingen`, `/flows/:id`, `/procesviewer`.
- Whether the automation already had source-quality findings, stale sync data, missing webhook paths, or inactive status.
- Whether the failure was a database/RLS/schema problem, network/edge-function problem, parsing/import problem, or UI render problem.

Use Sentry tags for fields that should be searchable and relatively compact:

```text
area=automation
automation_action=update
automation_source=hubspot
automation_status=Actief
automation_id=AUTO-123
```

Use Sentry context/extra for richer but sanitized detail:

```ts
automation: {
  id: "AUTO-123",
  name: "Deal stage workflow",
  source: "hubspot",
  externalId: "123456",
  systems: ["HubSpot"],
  pipelineId: "pipe-1",
  stageId: "stage-2",
  sourceFindings: 2,
  webhookPaths: 1,
}
```

Do not send full automation descriptions, tokens, raw import payloads, webhook bodies, CSV rows, AI prompt text, or Supabase response bodies.

## Source Notes

- Sentry's React guide supports client-side React SPAs built with tools like Vite, and lists Errors, Tracing, Session Replay, Logs, and User Feedback as configurable features.
- Sentry requires initialization to be imported before other application imports in the entry point.
- For React 18 and below, Sentry recommends `Sentry.ErrorBoundary` for render errors.
- Source maps are explicitly called out as essential for readable production stack traces.
- React Router v6 has a dedicated Sentry integration and `wrapCreateBrowserRouterV6` for `createBrowserRouter`.

Reference URLs:

- https://docs.sentry.io/platforms/javascript/guides/react/
- https://docs.sentry.io/platforms/javascript/guides/react/features/error-boundary/
- https://docs.sentry.io/platforms/javascript/guides/react/features/react-router/v6/
- https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/vite/
- https://docs.sentry.io/platforms/javascript/guides/react/data-management/data-collected/

---

## File Structure

Modify:

- `package.json`
  Add `@sentry/react` and `@sentry/vite-plugin`.

- `src/lib/sentry.ts`
  New Sentry initialization module. Owns DSN/env checks, integrations, privacy filtering, router wrapping, exported capture helpers, and automation-specific event context.

- `src/main.tsx`
  Import `src/lib/sentry.ts` before `App`.

- `src/App.tsx`
  Replace raw `createBrowserRouter` with the Sentry-wrapped router factory and wrap the app with `Sentry.ErrorBoundary`.

- `vite.config.ts`
  Add the Sentry Vite plugin behind build-time environment checks and enable production source maps only when Sentry upload credentials are present.

- `src/vite-env.d.ts`
  Type the new `VITE_SENTRY_*` variables.

- `src/components/process/ProcessenEditor.tsx`
  Add targeted `captureException` calls around save/import/export failures with process-specific tags.

- `src/pages/Procesviewer.tsx`
  Add Sentry context for selected pipeline/viewer mode so process-canvas crashes include useful state.

- `src/lib/storage/automations.ts`
  Add automation-specific capture calls in storage operations that know the automation id or receive a full `Automatisering`.

- `src/pages/AIUpload.tsx`
  Capture AI extraction and batch-save failures with sanitized row/batch context.

- `src/pages/Imports.tsx`
  Capture import approval/rejection/sync failures with proposal id, source, external id, and created automation id when available.

- `src/pages/Instellingen.tsx`
  Capture source sync failures for HubSpot, GitLab, Typeform, and Zapier with sync action tags.

- `src/pages/FlowDetail.tsx`
  Capture process journey linking/save failures with flow id and involved automation ids.

Create tests:

- `src/test/sentryConfig.test.ts`
  Verifies privacy defaults and env-gated initialization behavior.

- `src/test/sentryProcessContext.test.tsx`
  Verifies process viewer/editor context tagging without sending real network events.

- `src/test/sentryAutomationContext.test.ts`
  Verifies automation event context is compact, searchable, and sanitized.

---

### Task 1: Add Dependencies and Environment Types

**Files:**
- Modify: `package.json`
- Modify: `src/vite-env.d.ts`

- [x] **Step 1: Install Sentry packages**

Run:

```bash
npm install @sentry/react
npm install -D @sentry/vite-plugin
```

Expected:

```text
package.json and package-lock.json include @sentry/react and @sentry/vite-plugin.
```

- [x] **Step 2: Add environment variable types**

Modify `src/vite-env.d.ts` to:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_SENTRY_RELEASE?: string;
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
  readonly VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [x] **Step 3: Document required deployment secrets**

Add these to the deployment environment, not to committed `.env` files:

```text
VITE_SENTRY_DSN=<public browser DSN>
VITE_SENTRY_ENVIRONMENT=production
VITE_SENTRY_RELEASE=<git sha or release version>
SENTRY_AUTH_TOKEN=<Sentry source-map upload token>
SENTRY_ORG=<sentry org slug>
SENTRY_PROJECT=<sentry frontend project slug>
```

- [x] **Step 4: Verify install**

Run:

```bash
npm test -- src/test/example.test.ts
```

Expected:

```text
Test Files  1 passed
```

---

### Task 2: Create Sentry Initialization Module

**Files:**
- Create: `src/lib/sentry.ts`
- Test: `src/test/sentryConfig.test.ts`

- [x] **Step 1: Write the failing config test**

Create `src/test/sentryConfig.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "@/lib/sentry";

describe("sentry config", () => {
  it("scrubs likely secrets and email addresses from event extras", () => {
    const event = scrubSentryEvent({
      message: "save failed",
      extra: {
        email: "person@example.com",
        token: "pat-secret-token",
        pipelineId: "pipe-1",
      },
    });

    expect(event.extra).toEqual({
      email: "[Filtered]",
      token: "[Filtered]",
      pipelineId: "pipe-1",
    });
  });
});
```

- [x] **Step 2: Run the test and confirm it fails**

Run:

```bash
npm test -- src/test/sentryConfig.test.ts
```

Expected:

```text
FAIL  src/test/sentryConfig.test.ts
Cannot find module "@/lib/sentry"
```

- [x] **Step 3: Create minimal Sentry module**

Create `src/lib/sentry.ts`:

```ts
import React from "react";
import * as Sentry from "@sentry/react";
import {
  createBrowserRouter,
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
const sentryEnabled = Boolean(sentryDsn) && import.meta.env.PROD;

function parseRate(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

const filteredKeys = [/email/i, /token/i, /secret/i, /password/i, /authorization/i];

export function scrubSentryEvent<T extends { extra?: Record<string, unknown> }>(event: T): T {
  if (!event.extra) return event;
  return {
    ...event,
    extra: Object.fromEntries(
      Object.entries(event.extra).map(([key, value]) => [
        key,
        filteredKeys.some(pattern => pattern.test(key)) ? "[Filtered]" : value,
      ]),
    ),
  };
}

Sentry.init({
  dsn: sentryDsn,
  enabled: sentryEnabled,
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
  release: import.meta.env.VITE_SENTRY_RELEASE,
  sendDefaultPii: false,
  integrations: [
    Sentry.reactRouterV6BrowserTracingIntegration({
      useEffect: React.useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  tracesSampleRate: parseRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0.05),
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: parseRate(import.meta.env.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE, 0.25),
  tracePropagationTargets: [/^\//, /^https:\/\/.*\.supabase\.co/i],
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
});

export const createInstrumentedBrowserRouter = Sentry.wrapCreateBrowserRouterV6(createBrowserRouter);

export { Sentry };
```

- [x] **Step 4: Run the config test**

Run:

```bash
npm test -- src/test/sentryConfig.test.ts
```

Expected:

```text
Test Files  1 passed
```

---

### Task 3: Add Automation-Specific Capture Helpers

**Files:**
- Modify: `src/lib/sentry.ts`
- Test: `src/test/sentryAutomationContext.test.ts`

- [x] **Step 1: Write the failing automation context test**

Create `src/test/sentryAutomationContext.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAutomationSentryContext } from "@/lib/sentry";
import type { Automatisering } from "@/lib/types";

const automation: Automatisering = {
  id: "AUTO-123",
  naam: "HubSpot deal sync",
  categorie: "Trigger",
  doel: "Sync deal stage",
  trigger: "Deal stage changed",
  systemen: ["HubSpot"],
  stappen: ["Read deal", "Update portal"],
  afhankelijkheden: "HubSpot token",
  owner: "Sales",
  status: "Actief",
  verbeterideeën: "",
  mermaidDiagram: "",
  koppelingen: [],
  fasen: ["Sales"],
  source: "hubspot",
  externalId: "workflow-456",
  pipelineId: "pipe-1",
  stageId: "stage-2",
  webhookPaths: ["/webhook/deal"],
  sourceFindings: [
    {
      id: "finding-1",
      automationId: "AUTO-123",
      source: "hubspot",
      type: "missing_trigger",
      severity: "blocking",
      message: "Trigger ontbreekt",
      firstSeenAt: "2026-06-18T00:00:00.000Z",
      lastSeenAt: "2026-06-18T00:00:00.000Z",
    },
  ],
};

describe("automation Sentry context", () => {
  it("keeps automation diagnostics searchable without sending full payloads", () => {
    expect(buildAutomationSentryContext(automation, "update")).toEqual({
      tags: {
        area: "automation",
        automation_action: "update",
        automation_id: "AUTO-123",
        automation_source: "hubspot",
        automation_status: "Actief",
      },
      contexts: {
        automation: {
          id: "AUTO-123",
          name: "HubSpot deal sync",
          source: "hubspot",
          externalId: "workflow-456",
          status: "Actief",
          systems: ["HubSpot"],
          pipelineId: "pipe-1",
          stageId: "stage-2",
          sourceFindings: 1,
          webhookPaths: 1,
        },
      },
    });
  });
});
```

- [x] **Step 2: Run the test and confirm it fails**

Run:

```bash
npm test -- src/test/sentryAutomationContext.test.ts
```

Expected:

```text
FAIL  src/test/sentryAutomationContext.test.ts
buildAutomationSentryContext is not exported
```

- [x] **Step 3: Add automation helper types and builder**

Append to `src/lib/sentry.ts`:

```ts
import type { Automatisering } from "@/lib/types";

export type AutomationSentryAction =
  | "fetch"
  | "create"
  | "update"
  | "archive"
  | "verify"
  | "ai_extract"
  | "batch_save"
  | "import_approve"
  | "import_reject"
  | "sync_hubspot"
  | "sync_gitlab"
  | "sync_typeform"
  | "sync_zapier"
  | "process_link"
  | "flow_save";

export function buildAutomationSentryContext(
  automation: Pick<
    Automatisering,
    | "id"
    | "naam"
    | "source"
    | "externalId"
    | "status"
    | "systemen"
    | "pipelineId"
    | "stageId"
    | "sourceFindings"
    | "webhookPaths"
  >,
  action: AutomationSentryAction,
) {
  return {
    tags: {
      area: "automation",
      automation_action: action,
      automation_id: automation.id,
      automation_source: automation.source ?? "manual",
      automation_status: automation.status,
    },
    contexts: {
      automation: {
        id: automation.id,
        name: automation.naam,
        source: automation.source ?? "manual",
        externalId: automation.externalId ?? null,
        status: automation.status,
        systems: automation.systemen,
        pipelineId: automation.pipelineId ?? null,
        stageId: automation.stageId ?? null,
        sourceFindings: automation.sourceFindings?.length ?? 0,
        webhookPaths: automation.webhookPaths?.length ?? 0,
      },
    },
  };
}

export function captureAutomationException(
  error: unknown,
  automation: Parameters<typeof buildAutomationSentryContext>[0],
  action: AutomationSentryAction,
  extra?: Record<string, unknown>,
) {
  const context = buildAutomationSentryContext(automation, action);
  Sentry.captureException(error, {
    ...context,
    extra,
  });
}
```

- [x] **Step 4: Run automation context test**

Run:

```bash
npm test -- src/test/sentryAutomationContext.test.ts
```

Expected:

```text
Test Files  1 passed
```

---

### Task 4: Initialize Sentry Before App Render and Wrap React 18 Errors

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Test: `src/test/appSentryBoundary.test.tsx`

- [x] **Step 1: Import Sentry first in `main.tsx`**

Change `src/main.tsx` to:

```ts
import "./lib/sentry";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
```

- [x] **Step 2: Use the instrumented router factory in `App.tsx`**

Change the router imports in `src/App.tsx`:

```ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, Route, Routes, Navigate, Outlet } from "react-router-dom";
import { Sentry, createInstrumentedBrowserRouter } from "@/lib/sentry";
```

Then change:

```ts
const router = createBrowserRouter([
```

to:

```ts
const router = createInstrumentedBrowserRouter([
```

- [x] **Step 3: Wrap the app with `Sentry.ErrorBoundary`**

Change the `App` component to:

```tsx
const App = () => (
  <Sentry.ErrorBoundary
    fallback={
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-md border border-border bg-card p-4 text-sm">
          <h1 className="mb-2 font-semibold text-foreground">Er ging iets mis</h1>
          <p className="text-muted-foreground">
            Herlaad de pagina. De fout is automatisch vastgelegd voor analyse.
          </p>
        </div>
      </div>
    }
  >
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  </Sentry.ErrorBoundary>
);
```

- [x] **Step 4: Run app tests**

Run:

```bash
npm test -- src/test/appBreadcrumbs.test.tsx src/test/navigationMemory.test.ts src/test/procesviewerSharedCanvas.test.tsx
```

Expected:

```text
All selected test files pass.
```

---

### Task 5: Add Vite Source Map Uploads

**Files:**
- Modify: `vite.config.ts`

- [x] **Step 1: Update Vite config imports**

Change the top of `vite.config.ts` to:

```ts
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { sentryVitePlugin } from "@sentry/vite-plugin";
```

- [x] **Step 2: Gate plugin by Sentry build secrets**

Replace the export with:

```ts
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const sentrySourceMapsEnabled = Boolean(
    env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT,
  );

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      proxy: {
        "/hubspot-api": {
          target: "https://api.hubapi.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/hubspot-api/, ""),
        },
        "/zapier-api": {
          target: "https://api.zapier.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/zapier-api/, ""),
        },
        "/typeform-api": {
          target: "https://api.typeform.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/typeform-api/, ""),
        },
        "/gitlab-api": {
          target: "https://gitlab.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/gitlab-api/, ""),
        },
      },
    },
    build: {
      sourcemap: sentrySourceMapsEnabled ? "hidden" : false,
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      sentrySourceMapsEnabled && sentryVitePlugin({
        org: env.SENTRY_ORG,
        project: env.SENTRY_PROJECT,
        authToken: env.SENTRY_AUTH_TOKEN,
        telemetry: false,
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
```

- [x] **Step 3: Verify normal local build still works without Sentry secrets**

Run:

```bash
npm run build
```

Expected:

```text
vite build exits 0 and does not require SENTRY_AUTH_TOKEN.
```

---

### Task 6: Add Process Viewer and Editor Context

**Files:**
- Modify: `src/pages/Procesviewer.tsx`
- Modify: `src/components/process/ProcessenEditor.tsx`
- Test: `src/test/sentryProcessContext.test.tsx`

- [x] **Step 1: Add context in `Procesviewer.tsx`**

Import:

```ts
import { Sentry } from "@/lib/sentry";
```

Add an effect near the selected pipeline/process state effects:

```ts
useEffect(() => {
  Sentry.setContext("process_viewer", {
    selectedProcessId,
    selectedProcessName: selectedProcess?.naam ?? null,
    steps: processState.steps.length,
    connections: processState.connections.length,
    activeLanes: processState.activeLanes?.length ?? null,
    mode: isEditing ? "editor" : "viewer",
  });
}, [
  selectedProcessId,
  selectedProcess?.naam,
  processState.steps.length,
  processState.connections.length,
  processState.activeLanes?.length,
  isEditing,
]);
```

- [x] **Step 2: Add explicit save/import/export captures in `ProcessenEditor.tsx`**

Import:

```ts
import { Sentry } from "@/lib/sentry";
```

In `handleSave` catch block, before `console.error(err)`:

```ts
Sentry.captureException(err, {
  tags: {
    area: "process_editor",
    action: "save_process_state",
  },
  extra: {
    pipelineId,
    steps: state.steps.length,
    connections: state.connections.length,
    activeLanes,
  },
});
```

In export/import catch blocks, use the same pattern with actions:

```ts
action: "export_process_canvas_png"
action: "export_process_canvas_pdf"
action: "import_process_backup"
```

- [x] **Step 3: Test context wiring with a mocked Sentry module**

Create `src/test/sentryProcessContext.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Procesviewer from "@/pages/Procesviewer";

const setContext = vi.hoisted(() => vi.fn());

vi.mock("@/lib/sentry", () => ({
  Sentry: {
    setContext,
    captureException: vi.fn(),
    ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  },
  createInstrumentedBrowserRouter: vi.fn(),
}));

vi.mock("@/lib/hooks", () => ({
  usePipelines: () => ({
    data: [
      {
        pipelineId: "pipe-1",
        naam: "Sales",
        stages: [],
        syncedAt: "2026-06-10T00:00:00.000Z",
        updatedAt: "2026-06-10T00:00:00.000Z",
        beschrijving: null,
        isActive: true,
        source: "hubspot",
      },
    ],
  }),
  useProcessState: () => ({
    data: {
      steps: [{ id: "intake", label: "Intake", team: "sales", column: 0 }],
      connections: [],
      automations: [],
      activeLanes: ["sales"],
      customLanes: [],
    },
  }),
  useAutomatiseringen: () => ({ data: [] }),
}));

describe("procesviewer Sentry context", () => {
  it("adds selected process context for production diagnostics", async () => {
    render(<Procesviewer />);

    await screen.findByText("Sales");

    await waitFor(() => {
      expect(setContext).toHaveBeenCalledWith(
        "process_viewer",
        expect.objectContaining({
          selectedProcessId: "pipe-1",
          selectedProcessName: "Sales",
          steps: 1,
          connections: 0,
          activeLanes: 1,
        }),
      );
    });
  });
});
```

- [x] **Step 4: Run process context tests**

Run:

```bash
npm test -- src/test/sentryProcessContext.test.tsx src/test/procesviewerSharedCanvas.test.tsx src/test/processenEditorEditMode.test.tsx
```

Expected:

```text
All selected test files pass.
```

---

### Task 7: Add Automation Error Insight Capture Points

**Files:**
- Modify: `src/lib/storage/automations.ts`
- Modify: `src/pages/AIUpload.tsx`
- Modify: `src/pages/Imports.tsx`
- Modify: `src/pages/Instellingen.tsx`
- Modify: `src/pages/FlowDetail.tsx`
- Test: `src/test/sentryAutomationCapturePoints.test.ts`

- [x] **Step 1: Add storage-level automation captures**

In `src/lib/storage/automations.ts`, import:

```ts
import { captureAutomationException } from "@/lib/sentry";
```

Wrap `insertAutomatisering`:

```ts
export async function insertAutomatisering(item: Automatisering): Promise<void> {
  try {
    const { error } = await supabase.from("automatiseringen").insert({
      id: item.id,
      naam: item.naam,
      categorie: item.categorie,
      doel: item.doel,
      trigger_beschrijving: item.trigger,
      systemen: item.systemen,
      stappen: item.stappen,
      afhankelijkheden: item.afhankelijkheden,
      owner: item.owner,
      status: item.status,
      verbeterideeen: readVerbeterideeen(item),
      mermaid_diagram: item.mermaidDiagram,
      fasen: item.fasen,
    });
    if (error) throw toFriendlyDbError(error);

    if (item.koppelingen.length > 0) {
      const { error: kopError } = await supabase.from("koppelingen").insert(
        item.koppelingen.map((k) => ({
          bron_id: item.id,
          doel_id: k.doelId,
          label: k.label,
        })),
      );
      if (kopError) throw kopError;
    }
  } catch (error) {
    captureAutomationException(error, item, "create", {
      koppelingen: item.koppelingen.length,
      fasen: item.fasen.length,
    });
    throw error;
  }
}
```

Apply the same pattern to:

```text
updateAutomatisering(item) -> action "update"
deleteAutomatisering(id) -> action "archive" with compact placeholder context if only id is known
verifieerAutomatisering(id, door, status) -> action "verify" with compact placeholder context if only id is known
```

For id-only operations, use:

```ts
captureAutomationException(error, {
  id,
  naam: id,
  status: status ?? "unknown",
  systemen: [],
}, "archive");
```

- [x] **Step 2: Capture AI extraction and batch save failures**

In `src/pages/AIUpload.tsx`, import:

```ts
import { Sentry, captureAutomationException } from "@/lib/sentry";
```

Where AI extraction catches errors, add:

```ts
Sentry.captureException(e, {
  tags: {
    area: "automation",
    automation_action: "ai_extract",
    automation_source: "ai_upload",
  },
  extra: {
    inputMode: "paste",
    inputLength: text.length,
  },
});
```

In `saveOne`, when a mapped automation fails:

```ts
captureAutomationException(err, full, "batch_save", {
  batchSource: "ai_upload",
});
```

- [x] **Step 3: Capture import proposal failures**

In `src/pages/Imports.tsx`, import:

```ts
import { Sentry } from "@/lib/sentry";
```

In approve/reject/sync mutation `onError` handlers, add:

```ts
Sentry.captureException(error, {
  tags: {
    area: "automation",
    automation_action: "import_approve",
    automation_source: proposal.source ?? "unknown",
  },
  extra: {
    proposalId: proposal.id,
    externalId: proposal.external_id,
    importStatus: proposal.import_status,
  },
});
```

Use `automation_action: "import_reject"` for rejection handlers.

- [x] **Step 4: Capture source sync failures from settings**

In `src/pages/Instellingen.tsx`, import:

```ts
import { Sentry } from "@/lib/sentry";
```

For source sync catch blocks, add:

```ts
Sentry.captureException(e, {
  tags: {
    area: "automation",
    automation_action: "sync_hubspot",
    automation_source: "hubspot",
  },
});
```

Use matching action/source pairs:

```text
sync_hubspot / hubspot
sync_gitlab / gitlab
sync_typeform / typeform
sync_zapier / zapier
```

- [x] **Step 5: Capture flow/process journey automation-link failures**

In `src/pages/FlowDetail.tsx`, import:

```ts
import { Sentry } from "@/lib/sentry";
```

When saving or confirming automation links fails, add:

```ts
Sentry.captureException(error, {
  tags: {
    area: "automation",
    automation_action: "process_link",
  },
  extra: {
    flowId: flow?.id,
    flowName: flow?.naam,
    automationIds: selectedAutomationIds,
  },
});
```

- [x] **Step 6: Verify automation capture tests**

Run:

```bash
npm test -- src/test/sentryAutomationContext.test.ts src/test/automationsStorage.test.ts src/test/evaluateAutomation.test.ts src/test/importsFlow.test.ts src/test/processJourneyLinks.test.ts
```

Expected:

```text
All selected test files pass.
```

---

### Task 8: Verification and Rollout

**Files:**
- Modify: deployment environment only
- No code changes

- [x] **Step 1: Run full relevant test suite**

Run:

```bash
npm test -- src/test/sentryConfig.test.ts src/test/sentryAutomationContext.test.ts src/test/sentryProcessContext.test.tsx src/test/processCanvasBpmnArtifacts.test.tsx src/test/processenEditorEditMode.test.tsx src/test/processCanvasManualConnections.test.tsx src/test/procesviewerSharedCanvas.test.tsx
```

Expected:

```text
All selected test files pass.
```

- [x] **Step 2: Run production build without Sentry secrets**

Run:

```bash
npm run build
```

Expected:

```text
Build exits 0. No source map upload is attempted.
```

- [ ] **Step 3: Run production build with Sentry secrets in CI**

In CI only:

```bash
SENTRY_UPLOAD_SOURCE_MAPS=true SENTRY_AUTH_TOKEN=*** SENTRY_ORG=<org> SENTRY_PROJECT=<project> npm run build
```

Expected:

```text
Build exits 0 and Sentry Vite plugin uploads source maps.
```

Prepared by `.github/workflows/sentry-observability.yml`. The workflow skips the upload build unless `SENTRY_UPLOAD_SOURCE_MAPS` is exactly `true`. This prevents a read-only `SENTRY_AUTH_TOKEN` from attempting source-map upload. If upload is later approved, use a narrowly scoped token with `project:releases` and set `VITE_SENTRY_RELEASE=${{ github.sha }}`.

- [ ] **Step 4: Verify Sentry in a staging deployment**

Add a temporary hidden test route or dev-only button guarded by:

```ts
if (import.meta.env.MODE !== "production") {
  throw new Error("Sentry Test Error");
}
```

Expected in Sentry:

```text
Issue appears with readable TypeScript/TSX stack trace, route context, release, browser, and replay when applicable.
```

Remove the temporary test trigger before production rollout.

- [ ] **Step 5: Roll out with conservative sampling**

Use:

```text
VITE_SENTRY_TRACES_SAMPLE_RATE=0.05
VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=0.25
```

After one week, review:

```text
Issue volume, replay usefulness, privacy risk, quota usage, and whether traces help diagnose slow pages.
```

---

## Self-Review

Spec coverage:

- Researches whether Sentry is possible in this portal: covered in research summary and file structure.
- Explains useful purpose: covered with portal-specific use cases.
- Provides implementation path: covered in eight tasks with exact files and commands.
- Adds automation-level observability so Sentry can answer which automation failed and during which action.
- Privacy and risk handling: covered with `sendDefaultPii: false`, replay masking, event scrubber, and conservative sampling.

Placeholder scan:

- No task contains "TBD", "TODO", or "implement later".
- Each implementation task includes concrete code or command snippets.

Type consistency:

- `scrubSentryEvent`, `Sentry`, and `createInstrumentedBrowserRouter` are defined in `src/lib/sentry.ts` before being imported elsewhere.
- `buildAutomationSentryContext` and `captureAutomationException` are defined in `src/lib/sentry.ts` before being used in storage/pages.
- React Router v6 is matched to `wrapCreateBrowserRouterV6` and `reactRouterV6BrowserTracingIntegration`.
