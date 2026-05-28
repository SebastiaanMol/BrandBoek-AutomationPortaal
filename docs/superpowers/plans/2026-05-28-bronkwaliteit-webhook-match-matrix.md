# Bronkwaliteit En Webhook-Match Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a source-quality and webhook-match matrix tab that shows which automations are process-journey-ready, which are native/individual, and which exact webhook-to-endpoint matches may form process journey proposals.

**Architecture:** Add a pure presenter that classifies `Automatisering[]` into source summaries, automation rows, sender routes, receiver routes, exact matches, and unmatched routes. Add a `SourceQualityMatrixTab` component under the existing `/flows` page so this becomes a third Processes tab beside confirmed and concept process journeys.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing shadcn/ui table/card/badge/button components, existing `webhookProof` route normalization helpers.

---

## File Structure

- Create `src/lib/sourceQualityMatrixPresentation.ts`
  - Pure source-quality presenter.
  - Owns source classification, route extraction, exact route matching, and UI-ready labels.
- Create `src/test/sourceQualityMatrixPresentation.test.ts`
  - Unit tests for all source classifications and match behavior.
- Create `src/components/flows/SourceQualityMatrixTab.tsx`
  - UI tab content for source cards, source table, match matrix, and unmatched route lists.
- Create `src/test/sourceQualityMatrixTab.test.tsx`
  - UI tests for summary cards, source filtering, match rows, unmatched rows, and detail links.
- Modify `src/pages/Flows.tsx`
  - Add third tab trigger: `Bronkwaliteit`.
  - Render `SourceQualityMatrixTab` using `journeyAutomations`, because it includes legacy GitLab file records.

## Task 1: Presenter Types And Classification Tests

**Files:**
- Create: `src/test/sourceQualityMatrixPresentation.test.ts`
- Create: `src/lib/sourceQualityMatrixPresentation.ts`

- [ ] **Step 1: Write failing presenter tests**

Create `src/test/sourceQualityMatrixPresentation.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  getSourceQualityMatrixPresentation,
  type SourceQualityMatrixPresentation,
} from "@/lib/sourceQualityMatrixPresentation";
import type { Automatisering } from "@/lib/types";

describe("sourceQualityMatrixPresentation", () => {
  it("classifies HubSpot workflow with webhook path as matchable sender", () => {
    const presentation = build([hubspotWebhook(), gitlabEndpoint()]);

    expect(row(presentation, "hs-webhook")).toMatchObject({
      classification: "matchable",
      classificationLabel: "Matchbaar",
      sourceLabel: "HubSpot",
      routeEvidence: "/properties/ib/finished_webhook",
    });
    expect(presentation.summaryCards.find((card) => card.source === "hubspot")).toMatchObject({
      total: 1,
      matchable: 1,
      missing: 0,
    });
  });

  it("classifies HubSpot workflow without webhook action as native", () => {
    const presentation = build([hubspotNative()]);

    expect(row(presentation, "hs-native")).toMatchObject({
      classification: "native",
      classificationLabel: "Individueel/native",
      reason: "Geen webhook-action in HubSpot workflow-actions.",
    });
  });

  it("classifies HubSpot workflow without actions as incomplete", () => {
    const presentation = build([hubspotWithoutActions()]);

    expect(row(presentation, "hs-no-actions")).toMatchObject({
      classification: "incomplete",
      classificationLabel: "Brondata incompleet",
      reason: "HubSpot actions ontbreken; webhook-overdracht kan niet worden beoordeeld.",
    });
  });

  it("classifies Zapier zap with webhook handoff as matchable sender", () => {
    const presentation = build([zapierWebhook()]);

    expect(row(presentation, "zap-webhook")).toMatchObject({
      classification: "matchable",
      routeEvidence: "/sales/leads/hubspot/trustoo",
    });
  });

  it("classifies Zapier zap without webhook handoff as native", () => {
    const presentation = build([zapierNative()]);

    expect(row(presentation, "zap-native")).toMatchObject({
      classification: "native",
      reason: "Geen webhook-handoff in Zapier stappen.",
    });
  });

  it("classifies Typeform with active webhook as matchable sender", () => {
    const presentation = build([typeformWebhook()]);

    expect(row(presentation, "tf-webhook")).toMatchObject({
      classification: "matchable",
      routeEvidence: "/typeform/webhook",
    });
  });

  it("classifies Typeform without stored webhooks as incomplete", () => {
    const presentation = build([typeformWithoutWebhook()]);

    expect(row(presentation, "tf-no-webhook")).toMatchObject({
      classification: "incomplete",
      reason: "Geen Typeform webhooks opgeslagen.",
    });
  });

  it("classifies GitLab endpoint as receiver and legacy GitLab file as legacy import", () => {
    const presentation = build([gitlabEndpoint(), gitlabLegacyFile()]);

    expect(row(presentation, "gl-endpoint")).toMatchObject({
      classification: "matchable",
      sourceLabel: "GitLab/API",
      routeEvidence: "/properties/ib/finished_webhook",
    });
    expect(row(presentation, "gl-legacy")).toMatchObject({
      classification: "legacy",
      classificationLabel: "Legacy import",
      reason: "Oude GitLab bestandsimport zonder specifiek endpoint-record.",
    });
  });

  it("builds exact webhook matches and keeps unmatched routes separate", () => {
    const presentation = build([
      hubspotWebhook(),
      zapierWebhook(),
      gitlabEndpoint(),
      gitlabOtherEndpoint(),
    ]);

    expect(presentation.matches).toHaveLength(1);
    expect(presentation.matches[0]).toMatchObject({
      sourceAutomationId: "hs-webhook",
      targetAutomationId: "gl-endpoint",
      normalizedPath: "/properties/ib/finished_webhook",
      evidenceLabel: "100% webhook-match",
    });
    expect(presentation.unmatchedWebhooks.map((item) => item.normalizedPath)).toContain(
      "/sales/leads/hubspot/trustoo",
    );
    expect(presentation.unmatchedEndpoints.map((item) => item.normalizedPath)).toContain(
      "/operations/hubspot/create_new_deal",
    );
  });
});

function build(automations: Automatisering[]): SourceQualityMatrixPresentation {
  return getSourceQualityMatrixPresentation(automations);
}

function row(presentation: SourceQualityMatrixPresentation, id: string) {
  const result = presentation.rows.find((item) => item.id === id);
  expect(result).toBeDefined();
  return result;
}

function baseAutomation(overrides: Partial<Automatisering>): Automatisering {
  return {
    id: "auto",
    naam: "Automation",
    categorie: "Anders",
    doel: "",
    trigger: "",
    systemen: ["HubSpot"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-28T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  };
}

function hubspotWebhook(): Automatisering {
  return baseAutomation({
    id: "hs-webhook",
    naam: "IB ingediend",
    categorie: "HubSpot Workflow",
    source: "hubspot",
    hubspotWorkflow: {
      name: "IB ingediend",
      triggers: [{ label: "IB ingediend is true", source: "HubSpot" }],
      actions: [
        {
          index: 1,
          type: "WEBHOOK",
          label: "Webhook",
          webhookPath: "/properties/ib/finished_webhook",
        },
      ],
    },
  });
}

function hubspotNative(): Automatisering {
  return baseAutomation({
    id: "hs-native",
    naam: "Deal owner change",
    categorie: "HubSpot Workflow",
    source: "hubspot",
    hubspotWorkflow: {
      name: "Deal owner change",
      triggers: [{ label: "Deal owner changed", source: "HubSpot" }],
      actions: [{ index: 1, type: "SET_PROPERTY", label: "Set property" }],
    },
  });
}

function hubspotWithoutActions(): Automatisering {
  return baseAutomation({
    id: "hs-no-actions",
    naam: "Create new deal",
    categorie: "HubSpot Workflow",
    source: "hubspot",
    hubspotWorkflow: {
      name: "Create new deal",
      triggers: [{ label: "Deal meets criteria", source: "HubSpot" }],
      actions: [],
    },
  });
}

function zapierWebhook(): Automatisering {
  return baseAutomation({
    id: "zap-webhook",
    naam: "Trustoo Leads",
    categorie: "Zapier Zap",
    source: "zapier",
    importProposal: {
      zap: {
        id: "zap-1",
        title: "Trustoo Leads",
        process: {
          trigger: "New lead",
          outcome: "Send to API",
          conditions: [],
          emails: [],
          dataLookups: [],
          webhookHandoffs: [{ method: "POST", path: "/sales/leads/hubspot/trustoo" }],
          steps: [],
        },
      },
    },
  });
}

function zapierNative(): Automatisering {
  return baseAutomation({
    id: "zap-native",
    naam: "Send email",
    categorie: "Zapier Zap",
    source: "zapier",
    importProposal: {
      zap: {
        id: "zap-2",
        title: "Send email",
        process: {
          trigger: "New row",
          outcome: "Send email",
          conditions: [],
          emails: [],
          dataLookups: [],
          webhookHandoffs: [],
          steps: [{ index: 1, appName: "Gmail", title: "Send email", type: "action", kind: "action", summary: "", details: [], webhookPaths: [] }],
        },
      },
    },
  });
}

function typeformWebhook(): Automatisering {
  return baseAutomation({
    id: "tf-webhook",
    naam: "IB Typeform",
    categorie: "Typeform",
    source: "typeform",
    importProposal: {
      typeform: {
        form: { id: "form-1", title: "IB Typeform", fields: [], hidden_fields: [] },
        webhooks: [{ tag: "api", enabled: true, eventTypes: ["form_response"], path: "/typeform/webhook" }],
      },
    },
  });
}

function typeformWithoutWebhook(): Automatisering {
  return baseAutomation({
    id: "tf-no-webhook",
    naam: "Contactformulier",
    categorie: "Typeform",
    source: "typeform",
    importProposal: {
      typeform: {
        form: { id: "form-2", title: "Contactformulier", fields: [], hidden_fields: [] },
        webhooks: [],
      },
    },
  });
}

function gitlabEndpoint(): Automatisering {
  return baseAutomation({
    id: "gl-endpoint",
    naam: "IB finished webhook",
    categorie: "Backend Script",
    source: "gitlab",
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/properties/ib/finished_webhook",
      handler: "ib_finished_webhook",
      calls: [{ depth: 1, kind: "hubspot_repository_call", from: "handler", to: "repo", file: "repo.py" }],
    },
  });
}

function gitlabOtherEndpoint(): Automatisering {
  return baseAutomation({
    id: "gl-other",
    naam: "Create new deal",
    categorie: "Backend Script",
    source: "gitlab",
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/operations/hubspot/create_new_deal",
      handler: "create_new_deal",
      calls: [{ depth: 1, kind: "hubspot_repository_call", from: "handler", to: "repo", file: "repo.py" }],
    },
  });
}

function gitlabLegacyFile(): Automatisering {
  return baseAutomation({
    id: "gl-legacy",
    naam: "Old GitLab file",
    categorie: "Backend Script",
    source: "gitlab",
    externalId: "app/services/old_file.py",
    gitlabFilePath: "app/services/old_file.py",
  });
}
```

- [ ] **Step 2: Add an empty presenter module**

Create `src/lib/sourceQualityMatrixPresentation.ts`:

```ts
import type { Automatisering } from "./types";

export type SourceQualitySource = "hubspot" | "zapier" | "gitlab" | "typeform";
export type SourceQualityClassification = "matchable" | "native" | "incomplete" | "legacy";

export interface SourceQualitySummaryCard {
  source: SourceQualitySource;
  label: string;
  total: number;
  matchable: number;
  missing: number;
  incomplete: number;
  interpretation: string;
}

export interface SourceQualityAutomationRow {
  id: string;
  name: string;
  source: SourceQualitySource;
  sourceLabel: string;
  status: string;
  classification: SourceQualityClassification;
  classificationLabel: string;
  routeEvidence: string;
  reason: string;
  href: string;
}

export interface SourceQualityRoute {
  automationId: string;
  automationName: string;
  source: SourceQualitySource;
  sourceLabel: string;
  path: string;
  normalizedPath: string;
}

export interface SourceQualityWebhookMatch {
  id: string;
  sourceAutomationId: string;
  sourceAutomationName: string;
  sourceLabel: string;
  targetAutomationId: string;
  targetAutomationName: string;
  targetLabel: string;
  sourcePath: string;
  targetPath: string;
  normalizedPath: string;
  evidenceLabel: "100% webhook-match";
}

export interface SourceQualityMatrixPresentation {
  summaryCards: SourceQualitySummaryCard[];
  rows: SourceQualityAutomationRow[];
  senders: SourceQualityRoute[];
  receivers: SourceQualityRoute[];
  matches: SourceQualityWebhookMatch[];
  unmatchedWebhooks: SourceQualityRoute[];
  unmatchedEndpoints: SourceQualityRoute[];
}

export function getSourceQualityMatrixPresentation(
  _automations: Automatisering[],
): SourceQualityMatrixPresentation {
  return {
    summaryCards: [],
    rows: [],
    senders: [],
    receivers: [],
    matches: [],
    unmatchedWebhooks: [],
    unmatchedEndpoints: [],
  };
}
```

- [ ] **Step 3: Run test and verify it fails**

Run:

```bash
npm run test -- src/test/sourceQualityMatrixPresentation.test.ts
```

Expected: FAIL because `row(...)` cannot find rows and summary values are missing.

## Task 2: Presenter Implementation

**Files:**
- Modify: `src/lib/sourceQualityMatrixPresentation.ts`
- Test: `src/test/sourceQualityMatrixPresentation.test.ts`

- [ ] **Step 1: Implement route extraction and classification**

Replace `src/lib/sourceQualityMatrixPresentation.ts` with:

```ts
import {
  collectWebhookHandoffPaths,
  collectWebhookReceiverPaths,
  normalizeWebhookRoute,
} from "./webhookProof";
import type { Automatisering } from "./types";

export type SourceQualitySource = "hubspot" | "zapier" | "gitlab" | "typeform";
export type SourceQualityClassification = "matchable" | "native" | "incomplete" | "legacy";

export interface SourceQualitySummaryCard {
  source: SourceQualitySource;
  label: string;
  total: number;
  matchable: number;
  missing: number;
  incomplete: number;
  interpretation: string;
}

export interface SourceQualityAutomationRow {
  id: string;
  name: string;
  source: SourceQualitySource;
  sourceLabel: string;
  status: string;
  classification: SourceQualityClassification;
  classificationLabel: string;
  routeEvidence: string;
  reason: string;
  href: string;
}

export interface SourceQualityRoute {
  automationId: string;
  automationName: string;
  source: SourceQualitySource;
  sourceLabel: string;
  path: string;
  normalizedPath: string;
}

export interface SourceQualityWebhookMatch {
  id: string;
  sourceAutomationId: string;
  sourceAutomationName: string;
  sourceLabel: string;
  targetAutomationId: string;
  targetAutomationName: string;
  targetLabel: string;
  sourcePath: string;
  targetPath: string;
  normalizedPath: string;
  evidenceLabel: "100% webhook-match";
}

export interface SourceQualityMatrixPresentation {
  summaryCards: SourceQualitySummaryCard[];
  rows: SourceQualityAutomationRow[];
  senders: SourceQualityRoute[];
  receivers: SourceQualityRoute[];
  matches: SourceQualityWebhookMatch[];
  unmatchedWebhooks: SourceQualityRoute[];
  unmatchedEndpoints: SourceQualityRoute[];
}

export function getSourceQualityMatrixPresentation(
  automations: Automatisering[],
): SourceQualityMatrixPresentation {
  const sourceAutomations = automations.filter((automation) => getSource(automation) !== "");
  const rows = sourceAutomations.map(buildRow);
  const senders = sourceAutomations.flatMap(buildSenderRoutes);
  const receivers = sourceAutomations.flatMap(buildReceiverRoutes);
  const matches = buildMatches(senders, receivers);
  const matchedSenderKeys = new Set(matches.map((match) => routeKey(match.sourceAutomationId, match.normalizedPath)));
  const matchedReceiverKeys = new Set(matches.map((match) => routeKey(match.targetAutomationId, match.normalizedPath)));

  return {
    summaryCards: buildSummaryCards(rows),
    rows,
    senders,
    receivers,
    matches,
    unmatchedWebhooks: senders.filter((route) => !matchedSenderKeys.has(routeKey(route.automationId, route.normalizedPath))),
    unmatchedEndpoints: receivers.filter((route) => !matchedReceiverKeys.has(routeKey(route.automationId, route.normalizedPath))),
  };
}

function buildRow(automation: Automatisering): SourceQualityAutomationRow {
  const source = getSource(automation) as SourceQualitySource;
  const senderRoutes = buildSenderRoutes(automation);
  const receiverRoutes = buildReceiverRoutes(automation);
  const routes = source === "gitlab" ? receiverRoutes : senderRoutes;
  const classification = classifyAutomation(automation, routes);

  return {
    id: automation.id,
    name: automation.naam,
    source,
    sourceLabel: sourceLabel(source),
    status: automation.status,
    classification,
    classificationLabel: classificationLabel(classification),
    routeEvidence: routes.map((route) => route.normalizedPath).join(", "),
    reason: reasonFor(automation, classification),
    href: `/automations/${encodeURIComponent(automation.id)}`,
  };
}

function classifyAutomation(
  automation: Automatisering,
  routes: SourceQualityRoute[],
): SourceQualityClassification {
  const source = getSource(automation);
  if (routes.length > 0) return "matchable";
  if (source === "gitlab" && isLegacyGitLabFile(automation)) return "legacy";
  if (source === "hubspot") {
    const workflow = automation.hubspotWorkflow ?? automation.importProposal?.hubspot_workflow;
    const actions = Array.isArray((workflow as { actions?: unknown[] } | undefined)?.actions)
      ? (workflow as { actions: unknown[] }).actions
      : [];
    if (!workflow || actions.length === 0) return "incomplete";
    return "native";
  }
  if (source === "zapier") {
    const zap = automation.importProposal?.zap;
    const processSteps = zap?.process?.steps ?? zap?.steps ?? [];
    return processSteps.length > 0 ? "native" : "incomplete";
  }
  if (source === "typeform") {
    const typeform = automation.importProposal?.typeform;
    return typeform?.webhooks ? "incomplete" : "incomplete";
  }
  return "incomplete";
}

function reasonFor(
  automation: Automatisering,
  classification: SourceQualityClassification,
): string {
  if (classification === "matchable") return "Matchbare route gevonden.";
  if (classification === "legacy") return "Oude GitLab bestandsimport zonder specifiek endpoint-record.";

  const source = getSource(automation);
  if (source === "hubspot") {
    const workflow = automation.hubspotWorkflow ?? automation.importProposal?.hubspot_workflow;
    const actions = Array.isArray((workflow as { actions?: unknown[] } | undefined)?.actions)
      ? (workflow as { actions: unknown[] }).actions
      : [];
    if (!workflow) return "HubSpot workflowdata ontbreekt.";
    if (actions.length === 0) return "HubSpot actions ontbreken; webhook-overdracht kan niet worden beoordeeld.";
    return "Geen webhook-action in HubSpot workflow-actions.";
  }
  if (source === "zapier") {
    const zap = automation.importProposal?.zap;
    const processSteps = zap?.process?.steps ?? zap?.steps ?? [];
    if (!zap) return "Zapier export ontbreekt.";
    if (processSteps.length === 0) return "Zapier step flow ontbreekt.";
    return "Geen webhook-handoff in Zapier stappen.";
  }
  if (source === "typeform") {
    const webhooks = automation.importProposal?.typeform?.webhooks;
    if (!webhooks) return "Typeform brondata ontbreekt.";
    if (webhooks.length === 0) return "Geen Typeform webhooks opgeslagen.";
    return "Geen actieve Typeform webhook met route gevonden.";
  }
  if (source === "gitlab") return "Geen GitLab endpoint path gevonden.";
  return "Brondata ontbreekt.";
}

function buildSenderRoutes(automation: Automatisering): SourceQualityRoute[] {
  const source = getSource(automation);
  if (source === "gitlab" || source === "") return [];

  const paths = source === "typeform"
    ? getActiveTypeformWebhookPaths(automation)
    : collectWebhookHandoffPaths(automation);

  return toRoutes(automation, source, paths);
}

function buildReceiverRoutes(automation: Automatisering): SourceQualityRoute[] {
  const source = getSource(automation);
  if (source !== "gitlab") return [];
  return toRoutes(automation, source, collectWebhookReceiverPaths(automation));
}

function toRoutes(
  automation: Automatisering,
  source: SourceQualitySource,
  paths: string[],
): SourceQualityRoute[] {
  return unique(paths)
    .map((path) => ({
      automationId: automation.id,
      automationName: automation.naam,
      source,
      sourceLabel: sourceLabel(source),
      path,
      normalizedPath: normalizeWebhookRoute(path),
    }))
    .filter((route) => route.normalizedPath.length > 0);
}

function buildMatches(
  senders: SourceQualityRoute[],
  receivers: SourceQualityRoute[],
): SourceQualityWebhookMatch[] {
  const matches: SourceQualityWebhookMatch[] = [];
  for (const sender of senders) {
    for (const receiver of receivers) {
      if (sender.normalizedPath !== receiver.normalizedPath) continue;
      matches.push({
        id: `${sender.automationId}__${receiver.automationId}__${sender.normalizedPath}`,
        sourceAutomationId: sender.automationId,
        sourceAutomationName: sender.automationName,
        sourceLabel: sender.sourceLabel,
        targetAutomationId: receiver.automationId,
        targetAutomationName: receiver.automationName,
        targetLabel: receiver.sourceLabel,
        sourcePath: sender.path,
        targetPath: receiver.path,
        normalizedPath: sender.normalizedPath,
        evidenceLabel: "100% webhook-match",
      });
    }
  }
  return matches;
}

function buildSummaryCards(rows: SourceQualityAutomationRow[]): SourceQualitySummaryCard[] {
  return (["hubspot", "zapier", "gitlab", "typeform"] as SourceQualitySource[]).map((source) => {
    const sourceRows = rows.filter((row) => row.source === source);
    const matchable = sourceRows.filter((row) => row.classification === "matchable").length;
    const incomplete = sourceRows.filter((row) => row.classification === "incomplete").length;
    return {
      source,
      label: sourceLabel(source),
      total: sourceRows.length,
      matchable,
      missing: sourceRows.length - matchable,
      incomplete,
      interpretation: interpretationFor(source),
    };
  });
}

function getActiveTypeformWebhookPaths(automation: Automatisering): string[] {
  return (automation.importProposal?.typeform?.webhooks ?? [])
    .filter((webhook) => webhook.enabled !== false)
    .map((webhook) => webhook.path)
    .filter((path): path is string => Boolean(path));
}

function getSource(automation: Automatisering): SourceQualitySource | "" {
  const source = automation.source?.toLowerCase();
  if (source === "hubspot" || automation.categorie === "HubSpot Workflow") return "hubspot";
  if (source === "zapier" || automation.categorie === "Zapier Zap") return "zapier";
  if (source === "gitlab" || automation.gitlabEndpoint || automation.gitlabFilePath) return "gitlab";
  if (source === "typeform" || automation.categorie === "Typeform") return "typeform";
  return "";
}

function sourceLabel(source: SourceQualitySource): string {
  if (source === "hubspot") return "HubSpot";
  if (source === "zapier") return "Zapier";
  if (source === "gitlab") return "GitLab/API";
  return "Typeform";
}

function classificationLabel(classification: SourceQualityClassification): string {
  if (classification === "matchable") return "Matchbaar";
  if (classification === "native") return "Individueel/native";
  if (classification === "legacy") return "Legacy import";
  return "Brondata incompleet";
}

function interpretationFor(source: SourceQualitySource): string {
  if (source === "hubspot") return "De meeste workflows zijn native HubSpot-logica; alleen webhook-actions starten een bewezen overdracht.";
  if (source === "zapier") return "Zapier telt alleen mee wanneer een Zap data doorstuurt naar een endpoint.";
  if (source === "gitlab") return "GitLab/API is de receiver-laag voor complexe verwerking en integraties.";
  return "Typeform telt als startpunt wanneer een actieve webhook is opgeslagen.";
}

function isLegacyGitLabFile(automation: Automatisering): boolean {
  return Boolean(automation.gitlabFilePath) && !automation.externalId?.includes("::");
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function routeKey(automationId: string, normalizedPath: string): string {
  return `${automationId}::${normalizedPath}`;
}
```

- [ ] **Step 2: Run presenter tests**

Run:

```bash
npm run test -- src/test/sourceQualityMatrixPresentation.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit presenter**

Run:

```bash
git add src/lib/sourceQualityMatrixPresentation.ts src/test/sourceQualityMatrixPresentation.test.ts
git commit -m "feat: add source quality matrix presenter"
```

## Task 3: Source Quality Matrix UI Tests

**Files:**
- Create: `src/test/sourceQualityMatrixTab.test.tsx`
- Create: `src/components/flows/SourceQualityMatrixTab.tsx`

- [ ] **Step 1: Write failing UI tests**

Create `src/test/sourceQualityMatrixTab.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SourceQualityMatrixTab } from "@/components/flows/SourceQualityMatrixTab";
import type { Automatisering } from "@/lib/types";

describe("SourceQualityMatrixTab", () => {
  it("shows source summary cards and the exact match matrix", () => {
    renderTab([hubspotWebhook(), gitlabEndpoint(), zapierNative(), typeformWithoutWebhook()]);

    expect(screen.getByRole("heading", { name: "Bronkwaliteit voor procesreizen" })).toBeInTheDocument();
    expect(screen.getAllByText("HubSpot").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Zapier").length).toBeGreaterThan(0);
    expect(screen.getAllByText("GitLab/API").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Typeform").length).toBeGreaterThan(0);
    expect(screen.getAllByText("100% webhook-match").length).toBeGreaterThan(0);
    expect(screen.getAllByText("/properties/ib/finished_webhook").length).toBeGreaterThan(0);
  });

  it("shows automation classifications and detail links", () => {
    renderTab([hubspotWebhook(), hubspotNative(), typeformWithoutWebhook(), gitlabEndpoint()]);

    expect(screen.getAllByText("Matchbaar").length).toBeGreaterThan(0);
    expect(screen.getByText("Individueel/native")).toBeInTheDocument();
    expect(screen.getByText("Brondata incompleet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open IB ingediend" })).toHaveAttribute(
      "href",
      "/automations/hs-webhook",
    );
  });

  it("keeps unmatched webhooks and endpoints outside the match list", () => {
    renderTab([zapierWebhook(), gitlabEndpoint(), gitlabOtherEndpoint()]);

    const unmatchedWebhooks = screen.getByRole("region", { name: "Webhooks zonder receiver" });
    expect(within(unmatchedWebhooks).getByText("/sales/leads/hubspot/trustoo")).toBeInTheDocument();

    const unmatchedEndpoints = screen.getByRole("region", { name: "Endpoints zonder afzender" });
    expect(within(unmatchedEndpoints).getByText("/operations/hubspot/create_new_deal")).toBeInTheDocument();
  });
});

function renderTab(automations: Automatisering[]): void {
  render(
    <MemoryRouter>
      <SourceQualityMatrixTab automations={automations} />
    </MemoryRouter>,
  );
}

function baseAutomation(overrides: Partial<Automatisering>): Automatisering {
  return {
    id: "auto",
    naam: "Automation",
    categorie: "Anders",
    doel: "",
    trigger: "",
    systemen: ["HubSpot"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-28T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  };
}

function hubspotWebhook(): Automatisering {
  return baseAutomation({
    id: "hs-webhook",
    naam: "IB ingediend",
    categorie: "HubSpot Workflow",
    source: "hubspot",
    hubspotWorkflow: {
      name: "IB ingediend",
      triggers: [{ label: "IB ingediend is true", source: "HubSpot" }],
      actions: [{ index: 1, type: "WEBHOOK", label: "Webhook", webhookPath: "/properties/ib/finished_webhook" }],
    },
  });
}

function hubspotNative(): Automatisering {
  return baseAutomation({
    id: "hs-native",
    naam: "Native workflow",
    categorie: "HubSpot Workflow",
    source: "hubspot",
    hubspotWorkflow: {
      name: "Native workflow",
      triggers: [{ label: "Deal changed", source: "HubSpot" }],
      actions: [{ index: 1, type: "SET_PROPERTY", label: "Set property" }],
    },
  });
}

function zapierNative(): Automatisering {
  return baseAutomation({
    id: "zap-native",
    naam: "Zapier mail",
    categorie: "Zapier Zap",
    source: "zapier",
    importProposal: {
      zap: {
        process: {
          trigger: "New row",
          outcome: "Send mail",
          conditions: [],
          emails: [],
          dataLookups: [],
          webhookHandoffs: [],
          steps: [{ index: 1, appName: "Gmail", title: "Send mail", type: "action", kind: "action", summary: "", details: [], webhookPaths: [] }],
        },
      },
    },
  });
}

function zapierWebhook(): Automatisering {
  return baseAutomation({
    id: "zap-webhook",
    naam: "Trustoo Leads",
    categorie: "Zapier Zap",
    source: "zapier",
    importProposal: {
      zap: {
        process: {
          trigger: "New lead",
          outcome: "Send to API",
          conditions: [],
          emails: [],
          dataLookups: [],
          webhookHandoffs: [{ method: "POST", path: "/sales/leads/hubspot/trustoo" }],
          steps: [],
        },
      },
    },
  });
}

function typeformWithoutWebhook(): Automatisering {
  return baseAutomation({
    id: "tf-no-webhook",
    naam: "Contactformulier",
    categorie: "Typeform",
    source: "typeform",
    importProposal: {
      typeform: {
        form: { id: "form-1", title: "Contactformulier", fields: [], hidden_fields: [] },
        webhooks: [],
      },
    },
  });
}

function gitlabEndpoint(): Automatisering {
  return baseAutomation({
    id: "gl-endpoint",
    naam: "IB endpoint",
    categorie: "Backend Script",
    source: "gitlab",
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/properties/ib/finished_webhook",
      handler: "ib_finished_webhook",
      calls: [{ depth: 1, kind: "hubspot_repository_call", from: "handler", to: "repo", file: "repo.py" }],
    },
  });
}

function gitlabOtherEndpoint(): Automatisering {
  return baseAutomation({
    id: "gl-other",
    naam: "Create new deal",
    categorie: "Backend Script",
    source: "gitlab",
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/operations/hubspot/create_new_deal",
      handler: "create_new_deal",
      calls: [{ depth: 1, kind: "hubspot_repository_call", from: "handler", to: "repo", file: "repo.py" }],
    },
  });
}
```

- [ ] **Step 2: Add an empty component module**

Create `src/components/flows/SourceQualityMatrixTab.tsx`:

```tsx
import type { Automatisering } from "@/lib/types";

export function SourceQualityMatrixTab({ automations: _automations }: { automations: Automatisering[] }) {
  return <div />;
}
```

- [ ] **Step 3: Run UI test and verify it fails**

Run:

```bash
npm run test -- src/test/sourceQualityMatrixTab.test.tsx
```

Expected: FAIL because the heading, cards, rows, and links are not rendered.

## Task 4: Source Quality Matrix UI Implementation

**Files:**
- Modify: `src/components/flows/SourceQualityMatrixTab.tsx`
- Test: `src/test/sourceQualityMatrixTab.test.tsx`

- [ ] **Step 1: Implement the tab component**

Replace `src/components/flows/SourceQualityMatrixTab.tsx` with:

```tsx
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, CircleAlert, ExternalLink, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getSourceQualityMatrixPresentation,
  type SourceQualityAutomationRow,
} from "@/lib/sourceQualityMatrixPresentation";
import type { Automatisering } from "@/lib/types";

export function SourceQualityMatrixTab({ automations }: { automations: Automatisering[] }) {
  const presentation = getSourceQualityMatrixPresentation(automations);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              Bronkwaliteit
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              Bronkwaliteit voor procesreizen
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Alleen exacte webhook/endpoint matches mogen procesreizen vormen. Automations zonder
              webhook zijn niet automatisch fout; vaak zijn ze individuele of native automations.
            </p>
          </div>
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            Webhook-only bewijs
          </Badge>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {presentation.summaryCards.map((card) => (
            <article key={card.source} className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-foreground">{card.label}</h3>
                <Badge variant="outline">{card.matchable}/{card.total}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric label="Totaal" value={card.total} />
                <Metric label="Matchbaar" value={card.matchable} />
                <Metric label="Zonder" value={card.missing} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {card.interpretation}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h3 className="font-semibold text-foreground">Automations per bron</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Classificatie van elke bronautomation voor procesreisvorming.
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Automation</TableHead>
                <TableHead>Bron</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Classificatie</TableHead>
                <TableHead>Routebewijs</TableHead>
                <TableHead>Waarom</TableHead>
                <TableHead className="text-right">Actie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {presentation.rows.map((row) => (
                <TableRow key={row.id} className="align-top">
                  <TableCell>
                    <p className="font-medium text-foreground">{row.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{row.id}</p>
                  </TableCell>
                  <TableCell>{row.sourceLabel}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>
                    <ClassificationBadge row={row} />
                  </TableCell>
                  <TableCell>
                    {row.routeEvidence ? (
                      <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                        {row.routeEvidence}
                      </code>
                    ) : (
                      <span className="text-sm text-muted-foreground">Geen route</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[320px] text-sm text-muted-foreground">
                    {row.reason}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link to={row.href} aria-label={`Open ${row.name}`}>
                        Open
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground">Webhook-match matrix</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Alleen exacte genormaliseerde routes verschijnen als 100% match.
            </p>
          </div>
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            {presentation.matches.length} matches
          </Badge>
        </div>

        <div className="mt-4 space-y-3">
          {presentation.matches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Geen exacte webhook/endpoint matches gevonden.
            </div>
          ) : (
            presentation.matches.map((match) => (
              <article key={match.id} className="grid gap-3 rounded-xl border border-green-200 bg-green-50/40 p-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                <div className="min-w-0">
                  <Badge variant="outline">{match.sourceLabel}</Badge>
                  <p className="mt-2 font-semibold text-foreground">{match.sourceAutomationName}</p>
                  <code className="mt-1 block truncate rounded bg-white px-2 py-1 text-xs text-muted-foreground">
                    {match.sourcePath}
                  </code>
                </div>
                <div className="flex items-center justify-center">
                  <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                    {match.evidenceLabel}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div className="min-w-0">
                  <Badge variant="outline">{match.targetLabel}</Badge>
                  <p className="mt-2 font-semibold text-foreground">{match.targetAutomationName}</p>
                  <code className="mt-1 block truncate rounded bg-white px-2 py-1 text-xs text-muted-foreground">
                    {match.targetPath}
                  </code>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <UnmatchedRoutes
          title="Webhooks zonder receiver"
          label="Deze zenders hebben nog geen exact GitLab/API endpoint."
          routes={presentation.unmatchedWebhooks}
        />
        <UnmatchedRoutes
          title="Endpoints zonder afzender"
          label="Deze endpoints hebben nog geen bekende webhook-zender."
          routes={presentation.unmatchedEndpoints}
        />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-background px-2 py-2">
      <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function ClassificationBadge({ row }: { row: SourceQualityAutomationRow }) {
  if (row.classification === "matchable") {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {row.classificationLabel}
      </Badge>
    );
  }
  if (row.classification === "incomplete") {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
        <CircleAlert className="h-3.5 w-3.5" />
        {row.classificationLabel}
      </Badge>
    );
  }
  if (row.classification === "legacy") {
    return (
      <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
        <GitBranch className="h-3.5 w-3.5" />
        {row.classificationLabel}
      </Badge>
    );
  }
  return <Badge variant="outline">{row.classificationLabel}</Badge>;
}

function UnmatchedRoutes({
  title,
  label,
  routes,
}: {
  title: string;
  label: string;
  routes: Array<{ automationId: string; automationName: string; normalizedPath: string; sourceLabel: string }>;
}) {
  return (
    <section aria-label={title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      <div className="mt-4 space-y-2">
        {routes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Geen open routes.
          </p>
        ) : (
          routes.map((route) => (
            <div key={`${route.automationId}-${route.normalizedPath}`} className="rounded-lg border border-border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">{route.automationName}</p>
                <Badge variant="outline">{route.sourceLabel}</Badge>
              </div>
              <code className="mt-1 block truncate text-xs text-muted-foreground">{route.normalizedPath}</code>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Run UI tests**

Run:

```bash
npm run test -- src/test/sourceQualityMatrixTab.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit UI component**

Run:

```bash
git add src/components/flows/SourceQualityMatrixTab.tsx src/test/sourceQualityMatrixTab.test.tsx
git commit -m "feat: add source quality matrix tab"
```

## Task 5: Integrate Tab Into Flows Page

**Files:**
- Modify: `src/pages/Flows.tsx`
- Test: create or modify `src/test/flowsSourceQualityTab.test.tsx`

- [ ] **Step 1: Write route-level UI test**

Create `src/test/flowsSourceQualityTab.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Flows from "@/pages/Flows";
import type { Automatisering } from "@/lib/types";

vi.mock("@/lib/hooks", () => ({
  useAutomatiseringen: () => ({ data: automations }),
  useAutomatiseringenIncludingLegacyGitlab: () => ({ data: automations }),
  useFlows: () => ({ data: [] }),
  useAllConfirmedAutomationLinks: () => ({ data: [] }),
  useFlowSuggesties: () => ({ data: [] }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/storage/edgeFunctions", () => ({ invokeEdgeFunction: vi.fn() }));

const automations: Automatisering[] = [
  {
    id: "hs-webhook",
    naam: "IB ingediend",
    categorie: "HubSpot Workflow",
    doel: "",
    trigger: "",
    systemen: ["HubSpot"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-28T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    source: "hubspot",
    hubspotWorkflow: {
      name: "IB ingediend",
      triggers: [{ label: "IB ingediend is true", source: "HubSpot" }],
      actions: [{ index: 1, type: "WEBHOOK", label: "Webhook", webhookPath: "/properties/ib/finished_webhook" }],
    },
  },
  {
    id: "gl-endpoint",
    naam: "IB endpoint",
    categorie: "Backend Script",
    doel: "",
    trigger: "",
    systemen: ["GitLab"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-28T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    source: "gitlab",
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/properties/ib/finished_webhook",
      handler: "ib_finished_webhook",
      calls: [{ depth: 1, kind: "hubspot_repository_call", from: "handler", to: "repo", file: "repo.py" }],
    },
  },
];

describe("Flows source quality tab", () => {
  it("renders Bronkwaliteit as a third tab with the matrix content", () => {
    render(
      <MemoryRouter>
        <Flows />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Bronkwaliteit" }));

    expect(screen.getByRole("heading", { name: "Bronkwaliteit voor procesreizen" })).toBeInTheDocument();
    expect(screen.getByText("100% webhook-match")).toBeInTheDocument();
    expect(screen.getAllByText("/properties/ib/finished_webhook").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run route-level test and verify it fails**

Run:

```bash
npm run test -- src/test/flowsSourceQualityTab.test.tsx
```

Expected: FAIL because the `Bronkwaliteit` tab is not present.

- [ ] **Step 3: Wire the tab into `src/pages/Flows.tsx`**

Modify imports:

```ts
import { SourceQualityMatrixTab } from "@/components/flows/SourceQualityMatrixTab";
```

Add a third trigger inside `<TabsList>`:

```tsx
<TabsTrigger value="bronkwaliteit">Bronkwaliteit</TabsTrigger>
```

Add a third `<TabsContent>` after concept procesreizen:

```tsx
<TabsContent value="bronkwaliteit" className="mt-4">
  <SourceQualityMatrixTab automations={journeyAutomations} />
</TabsContent>
```

- [ ] **Step 4: Run route-level test**

Run:

```bash
npm run test -- src/test/flowsSourceQualityTab.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run focused matrix tests**

Run:

```bash
npm run test -- src/test/sourceQualityMatrixPresentation.test.ts src/test/sourceQualityMatrixTab.test.tsx src/test/flowsSourceQualityTab.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit integration**

Run:

```bash
git add src/pages/Flows.tsx src/test/flowsSourceQualityTab.test.tsx
git commit -m "feat: add source quality tab to flows"
```

## Task 6: Browser Verification And Final Checks

**Files:**
- No source files.
- Verification artifacts may be written to `tmp/`.

- [ ] **Step 1: Run all tests**

Run:

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: build completes successfully. Existing Vite large chunk warnings may remain.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: no lint errors. Existing warnings may remain if they are unrelated.

- [ ] **Step 4: Browser check desktop**

Use an authenticated Playwright context and open:

```text
http://127.0.0.1:5173/flows
```

Click `Bronkwaliteit` and verify:

- four source cards are visible;
- automation table is visible;
- webhook-match matrix is visible;
- unmatched webhooks and unmatched endpoints are visible;
- no horizontal page overflow at 1440px width.

Save screenshot:

```text
tmp/browser-source-quality-matrix-desktop.png
```

- [ ] **Step 5: Browser check mobile**

Use viewport `390x900`, open `/flows`, click `Bronkwaliteit`, and verify:

- summary cards stack cleanly;
- table scrolls inside its container instead of causing page overflow;
- match cards remain readable;
- detail links are tappable.

Save screenshot:

```text
tmp/browser-source-quality-matrix-mobile.png
```

- [ ] **Step 6: Commit verification note only if code changed after previous commits**

If browser checks require a UI fix, commit that fix:

```bash
git add src/components/flows/SourceQualityMatrixTab.tsx src/pages/Flows.tsx src/test/sourceQualityMatrixTab.test.tsx src/test/flowsSourceQualityTab.test.tsx
git commit -m "fix: polish source quality matrix layout"
```

If no code changed after Task 5, do not create an empty commit.

## Implementation Notes

- Keep this page explanatory, not scary. Automations without webhook are often normal native automations.
- Do not create process journey suggestions from this page in this iteration.
- Do not use stored AI suggestions as matrix evidence. Matrix evidence must come from source automation fields.
- Keep process journey review approval rules unchanged.
- Preserve existing `FlowSuggestiesTab` behavior.
- Use `journeyAutomations` instead of `automations` in the new tab so legacy GitLab file records appear as legacy imports.

## Self-Review Checklist

- Spec coverage: source summary cards, source detail table, exact match matrix, unmatched webhooks, unmatched endpoints, no new sync logic, no migration.
- Placeholder scan: no placeholder implementation steps remain.
- Type consistency: presenter names used by UI tests match exported presenter interfaces.
- Test coverage: presenter, component, page integration, browser verification.
