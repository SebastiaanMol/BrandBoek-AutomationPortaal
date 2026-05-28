# Procesreis Voorstel Review Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/flows/suggesties/:id` as a review cockpit where 100% webhook proof stays read-only and a manual AI prompt/paste workflow can enrich descriptions and clearly labeled gaps.

**Architecture:** Add three focused frontend units: an AI contract/parser, a prompt builder, and a review presentation builder. Replace the current large inline concept page layout with reusable review components while preserving existing accept/reject behavior and using the same query hooks.

**Tech Stack:** React, TypeScript, Vite, Vitest, React Testing Library, shadcn/ui, lucide-react, Tailwind CSS.

---

## File Structure

- Create `src/lib/flowSuggestionAi.ts`
  - Owns the manual AI result type, JSON parser, sanitization helper, and description merge helper.
  - No React imports.

- Create `src/lib/flowSuggestionPromptBuilder.ts`
  - Builds the copyable prompt from existing concept journey data.
  - Redacts secrets from raw source data.
  - No React imports.

- Create `src/lib/flowSuggestionReviewPresentation.ts`
  - Combines `FlowSuggestionGroup`, `Automatisering`, webhook proof, and source quality into UI-ready fields.
  - Uses `getExactWebhookProof` and `getAutomationSourceQualityPresentation`.

- Create `src/components/flows/FlowSuggestionReviewCockpit.tsx`
  - Renders header card, metric row, journey summary, verified chain, review steps, evidence, AI suggestions, and source quality messages.
  - Receives presentation data and event handlers as props.

- Create `src/components/flows/FlowSuggestionAiWorkbench.tsx`
  - Renders prompt copy, AI result textarea, validation feedback, and accepted AI result preview.
  - Owns only local textarea UI state; parsing is delegated to `flowSuggestionAi.ts`.

- Modify `src/pages/FlowSuggestionDetail.tsx`
  - Keep data loading, routing, accept/reject mutations, and `FlowConfirmDialog`.
  - Replace the current inline review layout with the new cockpit component.
  - Use manual AI enrichment to prefill `FlowConfirmDialog` name/description when available.

- Add tests:
  - `src/test/flowSuggestionAi.test.ts`
  - `src/test/flowSuggestionPromptBuilder.test.ts`
  - `src/test/flowSuggestionReviewPresentation.test.ts`
  - Update `src/test/flowSuggestionDetailUx.test.tsx`

---

### Task 1: AI Result Contract And Parser

**Files:**
- Create: `src/lib/flowSuggestionAi.ts`
- Test: `src/test/flowSuggestionAi.test.ts`

- [ ] **Step 1: Write parser tests**

Create `src/test/flowSuggestionAi.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildAcceptedFlowDescriptionFromAiResult,
  parseFlowSuggestionAiResult,
  sanitizeForPrompt,
} from "@/lib/flowSuggestionAi";

describe("flowSuggestionAi", () => {
  it("parses allowed descriptive AI fields", () => {
    const result = parseFlowSuggestionAiResult(JSON.stringify({
      title: "Lead intake verwerken",
      summary: "Een Typeform inzending wordt verwerkt en in HubSpot opgevolgd.",
      businessObject: "Lead",
      processSteps: [
        "Bezoeker vult het formulier in.",
        "Backend verwerkt de leadgegevens.",
      ],
      changeSummary: [
        "HubSpot wordt bijgewerkt met de leadstatus.",
      ],
      reviewNotes: [
        "Controleer of de eigenaar van de opvolging klopt.",
      ],
      aiSuggestions: [
        {
          label: "Lifecycle-fase",
          description: "Waarschijnlijk lead intake.",
          severity: "warning",
        },
      ],
      openQuestions: [
        "Wie is eigenaar van de opvolging?",
      ],
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected parse success");
    expect(result.value.title).toBe("Lead intake verwerken");
    expect(result.value.aiSuggestions[0]).toMatchObject({
      label: "Lifecycle-fase",
      tag: "AI-voorstel",
    });
  });

  it("ignores proof-sensitive fields and reports them", () => {
    const result = parseFlowSuggestionAiResult(JSON.stringify({
      title: "Procesreis",
      confirmedTransitions: [{ fromId: "a", toId: "b" }],
      approvalStatus: "approved",
      webhookEvidence: ["fake"],
      sourceAutomationId: "a",
      targetAutomationId: "b",
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected parse success");
    expect(result.value.ignoredFields).toEqual([
      "confirmedTransitions",
      "approvalStatus",
      "webhookEvidence",
      "sourceAutomationId",
      "targetAutomationId",
    ]);
    expect(result.value.title).toBe("Procesreis");
  });

  it("returns a readable error for invalid JSON", () => {
    const result = parseFlowSuggestionAiResult("dit is geen json");

    expect(result).toEqual({
      ok: false,
      error: "Plak geldige JSON uit de AI-output.",
    });
  });

  it("redacts secrets before prompt generation", () => {
    const sanitized = sanitizeForPrompt({
      token: "secret-token",
      nested: {
        authorization: "Bearer x",
        safe: "visible",
      },
    });

    expect(sanitized).toEqual({
      token: "[REDACTED]",
      nested: {
        authorization: "[REDACTED]",
        safe: "visible",
      },
    });
  });

  it("builds a flow description from accepted AI result without proof language", () => {
    const description = buildAcceptedFlowDescriptionFromAiResult({
      title: "Lead intake",
      summary: "Een formulierinzending wordt verwerkt.",
      businessObject: "Lead",
      processSteps: ["Formulier komt binnen.", "HubSpot wordt bijgewerkt."],
      changeSummary: ["Leadstatus verandert."],
      reviewNotes: ["Controleer eigenaar."],
      aiSuggestions: [{ label: "Vervolg", description: "Mogelijke latere workflow.", severity: "warning", tag: "AI-voorstel" }],
      openQuestions: ["Is er een vervolgworkflow?"],
      ignoredFields: [],
    });

    expect(description).toContain("Een formulierinzending wordt verwerkt.");
    expect(description).toContain("Processtappen");
    expect(description).toContain("AI-voorstellen, niet bewezen");
    expect(description).not.toContain("confirmedTransitions");
  });
});
```

- [ ] **Step 2: Run parser tests to verify they fail**

Run:

```bash
npm run test -- src/test/flowSuggestionAi.test.ts
```

Expected: FAIL because `src/lib/flowSuggestionAi.ts` does not exist.

- [ ] **Step 3: Implement parser and helpers**

Create `src/lib/flowSuggestionAi.ts`:

```ts
export type FlowSuggestionAiSeverity = "info" | "warning" | "critical";

export interface FlowSuggestionAiSuggestion {
  label: string;
  description: string;
  severity: FlowSuggestionAiSeverity;
  tag: "AI-voorstel" | "Niet bewezen" | "Review nodig";
}

export interface FlowSuggestionAiResult {
  title: string;
  summary: string;
  businessObject: string;
  processSteps: string[];
  changeSummary: string[];
  reviewNotes: string[];
  aiSuggestions: FlowSuggestionAiSuggestion[];
  openQuestions: string[];
  ignoredFields: string[];
}

export type FlowSuggestionAiParseResult =
  | { ok: true; value: FlowSuggestionAiResult }
  | { ok: false; error: string };

const PROOF_SENSITIVE_FIELDS = [
  "confirmedTransitions",
  "webhookEvidence",
  "approvalStatus",
  "sourceAutomationId",
  "targetAutomationId",
] as const;

const SECRET_KEY_PATTERN = /(token|secret|password|authorization|api[_-]?key|private[_-]?app)/i;

export function parseFlowSuggestionAiResult(raw: string): FlowSuggestionAiParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Plak eerst de JSON-output van de AI." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "Plak geldige JSON uit de AI-output." };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: "De AI-output moet een JSON-object zijn." };
  }

  const ignoredFields = PROOF_SENSITIVE_FIELDS.filter((field) => field in parsed);

  return {
    ok: true,
    value: {
      title: stringValue(parsed.title),
      summary: stringValue(parsed.summary),
      businessObject: stringValue(parsed.businessObject),
      processSteps: stringArray(parsed.processSteps),
      changeSummary: stringArray(parsed.changeSummary),
      reviewNotes: stringArray(parsed.reviewNotes),
      aiSuggestions: suggestionArray(parsed.aiSuggestions),
      openQuestions: stringArray(parsed.openQuestions),
      ignoredFields,
    },
  };
}

export function buildAcceptedFlowDescriptionFromAiResult(result: FlowSuggestionAiResult): string {
  const sections = [
    result.summary,
    result.businessObject ? `Businessobject: ${result.businessObject}` : "",
    formatSection("Processtappen", result.processSteps),
    formatSection("Wat verandert er", result.changeSummary),
    formatSection("Reviewnotities", result.reviewNotes),
    formatSection(
      "AI-voorstellen, niet bewezen",
      result.aiSuggestions.map((suggestion) => `${suggestion.label}: ${suggestion.description}`),
    ),
    formatSection("Open vragen", result.openQuestions),
  ].filter(Boolean);

  return sections.join("\n\n");
}

export function sanitizeForPrompt(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeForPrompt(item));
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitizeForPrompt(entry),
    ]),
  );
}

function formatSection(title: string, items: string[]): string {
  if (items.length === 0) return "";
  return `${title}:\n${items.map((item) => `- ${item}`).join("\n")}`;
}

function suggestionArray(value: unknown): FlowSuggestionAiSuggestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      return {
        label: stringValue(item.label),
        description: stringValue(item.description),
        severity: severityValue(item.severity),
        tag: tagValue(item.tag),
      };
    })
    .filter((item): item is FlowSuggestionAiSuggestion => Boolean(item?.label || item?.description));
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(stringValue).filter(Boolean);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function severityValue(value: unknown): FlowSuggestionAiSeverity {
  return value === "critical" || value === "warning" || value === "info" ? value : "warning";
}

function tagValue(value: unknown): FlowSuggestionAiSuggestion["tag"] {
  return value === "Niet bewezen" || value === "Review nodig" || value === "AI-voorstel"
    ? value
    : "AI-voorstel";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
```

- [ ] **Step 4: Run parser tests to verify they pass**

Run:

```bash
npm run test -- src/test/flowSuggestionAi.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit parser**

```bash
git add src/lib/flowSuggestionAi.ts src/test/flowSuggestionAi.test.ts
git commit -m "feat: add flow suggestion ai parser"
```

---

### Task 2: Prompt Builder

**Files:**
- Create: `src/lib/flowSuggestionPromptBuilder.ts`
- Test: `src/test/flowSuggestionPromptBuilder.test.ts`

- [ ] **Step 1: Write prompt builder tests**

Create `src/test/flowSuggestionPromptBuilder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildFlowSuggestionAiPrompt } from "@/lib/flowSuggestionPromptBuilder";
import type { FlowSuggestionGroup } from "@/lib/flowSuggestionGroups";
import type { Automatisering } from "@/lib/types";

describe("flowSuggestionPromptBuilder", () => {
  it("builds a prompt with strict proof guardrails and raw source context", () => {
    const prompt = buildFlowSuggestionAiPrompt({
      group: makeGroup(),
      automations: [makeAutomation("hs"), makeAutomation("gl")],
      endpointEvidence: "/backend/process-deal",
    });

    expect(prompt).toContain("Je mag geen webhook-bewijs verzinnen");
    expect(prompt).toContain("confirmedTransitions");
    expect(prompt).toContain('"fromId": "hs"');
    expect(prompt).toContain('"normalizedEndpoint": "/backend/process-deal"');
    expect(prompt).toContain('"source": "hubspot"');
  });

  it("redacts token-like fields from raw automation data", () => {
    const automation = makeAutomation("zap");
    automation.importProposal = {
      zap: { id: "zap-1", title: "Zap" },
      token: "secret",
      nested: { authorization: "Bearer x" },
    };

    const prompt = buildFlowSuggestionAiPrompt({
      group: makeGroup(),
      automations: [automation],
      endpointEvidence: "/hook",
    });

    expect(prompt).toContain("[REDACTED]");
    expect(prompt).not.toContain("Bearer x");
    expect(prompt).not.toContain("secret");
  });
});

function makeGroup(): FlowSuggestionGroup {
  return {
    id: "hs__gl",
    nodes: [
      { id: "hs", naam: "HubSpot workflow", categorie: "HubSpot Workflow", source: "hubspot" },
      { id: "gl", naam: "Backend endpoint", categorie: "Backend Script", source: "gitlab" },
    ],
    suggestions: [
      {
        fromId: "hs",
        toId: "gl",
        fromNaam: "HubSpot workflow",
        toNaam: "Backend endpoint",
        fromCategorie: "HubSpot Workflow",
        toCategorie: "Backend Script",
        fromSource: "hubspot",
        toSource: "gitlab",
        zekerheid: "webhook",
        redenering: "Webhook-match: /backend/process-deal",
        confirmed: false,
        rejected: false,
      },
    ],
    webhookCount: 1,
    aiCount: 0,
    confirmedCount: 0,
    totalCount: 1,
    structureType: "lineair",
    structureSummary: "Deze kandidaat lijkt een lineaire stapvolgorde.",
  };
}

function makeAutomation(id: string): Automatisering {
  return {
    id,
    naam: id === "hs" ? "HubSpot workflow" : "Backend endpoint",
    categorie: id === "hs" ? "HubSpot Workflow" : "Backend Script",
    doel: "Doel",
    trigger: "Trigger",
    systemen: id === "hs" ? ["HubSpot"] : ["GitLab", "HubSpot"],
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
    source: id === "hs" ? "hubspot" : "gitlab",
    webhookPaths: id === "hs" ? ["/backend/process-deal"] : [],
    gitlabEndpoint: id === "gl" ? { method: "POST", endpoint: "/backend/process-deal", handler: "processDeal" } : undefined,
  };
}
```

- [ ] **Step 2: Run prompt builder tests to verify they fail**

Run:

```bash
npm run test -- src/test/flowSuggestionPromptBuilder.test.ts
```

Expected: FAIL because `src/lib/flowSuggestionPromptBuilder.ts` does not exist.

- [ ] **Step 3: Implement prompt builder**

Create `src/lib/flowSuggestionPromptBuilder.ts`:

```ts
import type { FlowSuggestionGroup } from "./flowSuggestionGroups";
import { sanitizeForPrompt } from "./flowSuggestionAi";
import type { Automatisering } from "./types";

interface BuildFlowSuggestionAiPromptInput {
  group: FlowSuggestionGroup;
  automations: Automatisering[];
  endpointEvidence: string;
}

export function buildFlowSuggestionAiPrompt({
  group,
  automations,
  endpointEvidence,
}: BuildFlowSuggestionAiPromptInput): string {
  const payload = {
    task: "Verrijk deze concept-procesreis voor menselijke review.",
    hardRules: [
      "Je mag geen webhook-bewijs verzinnen.",
      "Je mag geen nieuwe bewezen overgangen toevoegen.",
      "Je mag confirmedTransitions, webhookEvidence, approvalStatus, sourceAutomationId of targetAutomationId niet invullen.",
      "Onzekerheden moeten in aiSuggestions of openQuestions staan.",
      "Schrijf gewone Nederlandse tekst voor procesowners.",
    ],
    expectedJsonShape: {
      title: "string",
      summary: "string",
      businessObject: "string",
      processSteps: ["string"],
      changeSummary: ["string"],
      reviewNotes: ["string"],
      aiSuggestions: [{ label: "string", description: "string", severity: "info|warning|critical", tag: "AI-voorstel|Niet bewezen|Review nodig" }],
      openQuestions: ["string"],
    },
    conceptJourney: {
      groupId: group.id,
      structureType: group.structureType,
      structureSummary: group.structureSummary,
      normalizedEndpoint: endpointEvidence,
      nodes: group.nodes,
      webhookSuggestions: group.suggestions.map((suggestion) => ({
        fromId: suggestion.fromId,
        toId: suggestion.toId,
        fromSource: suggestion.fromSource,
        toSource: suggestion.toSource,
        redenering: suggestion.redenering,
        zekerheid: suggestion.zekerheid,
      })),
    },
    automations: automations.map((automation) => sanitizeForPrompt({
      id: automation.id,
      naam: automation.naam,
      source: automation.source,
      categorie: automation.categorie,
      status: automation.status,
      doel: automation.doel,
      trigger: automation.trigger,
      systemen: automation.systemen,
      webhookPaths: automation.webhookPaths,
      hubspotWorkflow: automation.hubspotWorkflow,
      gitlabEndpoint: automation.gitlabEndpoint,
      importProposal: automation.importProposal,
      sourceFindings: automation.sourceFindings,
    })),
  };

  return [
    "Analyseer onderstaande procesreis-kandidaat en geef uitsluitend geldige JSON terug.",
    "Gebruik alleen de aangeleverde data. Markeer onzekerheden als AI-voorstel of open vraag.",
    "Je mag geen webhook-bewijs verzinnen en geen goedkeuringsstatus bepalen.",
    JSON.stringify(payload, null, 2),
  ].join("\n\n");
}
```

- [ ] **Step 4: Run prompt builder tests to verify they pass**

Run:

```bash
npm run test -- src/test/flowSuggestionPromptBuilder.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit prompt builder**

```bash
git add src/lib/flowSuggestionPromptBuilder.ts src/test/flowSuggestionPromptBuilder.test.ts
git commit -m "feat: build flow suggestion ai prompt"
```

---

### Task 3: Review Presentation Builder

**Files:**
- Create: `src/lib/flowSuggestionReviewPresentation.ts`
- Test: `src/test/flowSuggestionReviewPresentation.test.ts`

- [ ] **Step 1: Write presentation tests**

Create `src/test/flowSuggestionReviewPresentation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getFlowSuggestionReviewPresentation } from "@/lib/flowSuggestionReviewPresentation";
import type { FlowSuggestionGroup } from "@/lib/flowSuggestionGroups";
import type { Automatisering } from "@/lib/types";

describe("flowSuggestionReviewPresentation", () => {
  it("marks a fully webhook-proven concept as ready for review", () => {
    const presentation = getFlowSuggestionReviewPresentation({
      group: makeGroup("Webhook-match: /backend/process-deal"),
      automations: [makeHubSpotAutomation(), makeGitLabAutomation()],
      endpointEvidence: "/backend/process-deal",
      aiResult: null,
    });

    expect(presentation.approvalState.status).toBe("ready");
    expect(presentation.approvalState.label).toBe("Klaar voor review");
    expect(presentation.metrics.find((metric) => metric.label === "Bewijsstatus")?.value).toBe("100%");
    expect(presentation.transitions[0]).toMatchObject({
      label: "100% webhook-match",
      fromId: "hs",
      toId: "gl",
      normalizedPath: "/backend/process-deal",
    });
  });

  it("does not become ready when exact webhook proof is missing", () => {
    const presentation = getFlowSuggestionReviewPresentation({
      group: makeGroup("Webhook-match: /other-route"),
      automations: [makeHubSpotAutomation(), makeGitLabAutomation()],
      endpointEvidence: "/other-route",
      aiResult: null,
    });

    expect(presentation.approvalState.status).toBe("blocked");
    expect(presentation.metrics.find((metric) => metric.label === "Bewijsstatus")?.value).toBe("Niet klaar");
    expect(presentation.transitions).toEqual([]);
  });

  it("uses AI result for descriptive fields without changing proof", () => {
    const presentation = getFlowSuggestionReviewPresentation({
      group: makeGroup("Webhook-match: /backend/process-deal"),
      automations: [makeHubSpotAutomation(), makeGitLabAutomation()],
      endpointEvidence: "/backend/process-deal",
      aiResult: {
        title: "AI titel",
        summary: "AI samenvatting voor procesowners.",
        businessObject: "Lead",
        processSteps: ["Stap een"],
        changeSummary: ["HubSpot verandert"],
        reviewNotes: [],
        aiSuggestions: [{ label: "Open punt", description: "Controleer vervolg.", severity: "warning", tag: "AI-voorstel" }],
        openQuestions: ["Wie keurt dit goed?"],
        ignoredFields: ["approvalStatus"],
      },
    });

    expect(presentation.title).toBe("AI titel");
    expect(presentation.summary).toBe("AI samenvatting voor procesowners.");
    expect(presentation.aiSuggestions).toHaveLength(2);
    expect(presentation.transitions).toHaveLength(1);
  });
});

function makeGroup(reason: string): FlowSuggestionGroup {
  return {
    id: "hs__gl",
    nodes: [
      { id: "hs", naam: "HubSpot workflow", categorie: "HubSpot Workflow", source: "hubspot" },
      { id: "gl", naam: "Backend endpoint", categorie: "Backend Script", source: "gitlab" },
    ],
    suggestions: [{
      fromId: "hs",
      toId: "gl",
      fromNaam: "HubSpot workflow",
      toNaam: "Backend endpoint",
      fromCategorie: "HubSpot Workflow",
      toCategorie: "Backend Script",
      fromSource: "hubspot",
      toSource: "gitlab",
      zekerheid: "webhook",
      redenering: reason,
      confirmed: false,
      rejected: false,
    }],
    webhookCount: 1,
    aiCount: 0,
    confirmedCount: 0,
    totalCount: 1,
    structureType: "lineair",
    structureSummary: "Deze kandidaat lijkt een lineaire stapvolgorde.",
  };
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

function makeHubSpotAutomation(): Automatisering {
  return baseAutomation({
    id: "hs",
    naam: "HubSpot workflow",
    categorie: "HubSpot Workflow",
    source: "hubspot",
    webhookPaths: ["/backend/process-deal"],
    hubspotWorkflow: {
      name: "HubSpot workflow",
      triggers: [{ label: "Deal voldoet aan criteria", source: "HubSpot" }],
      actions: [{ index: 1, type: "WEBHOOK", label: "Webhook", webhookPath: "/backend/process-deal" }],
    },
  });
}

function makeGitLabAutomation(): Automatisering {
  return baseAutomation({
    id: "gl",
    naam: "Backend endpoint",
    categorie: "Backend Script",
    source: "gitlab",
    systemen: ["GitLab", "HubSpot"],
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/backend/process-deal",
      handler: "processDeal",
      calls: [{ depth: 1, kind: "hubspot_repository_call", from: "worker", to: "repo", file: "repo.py" }],
    },
  });
}
```

- [ ] **Step 2: Run presentation tests to verify they fail**

Run:

```bash
npm run test -- src/test/flowSuggestionReviewPresentation.test.ts
```

Expected: FAIL because `src/lib/flowSuggestionReviewPresentation.ts` does not exist.

- [ ] **Step 3: Implement presentation builder**

Create `src/lib/flowSuggestionReviewPresentation.ts`:

```ts
import { getAutomationSourceQualityPresentation } from "./automationSourceQuality";
import type { FlowSuggestionAiResult } from "./flowSuggestionAi";
import type { FlowSuggestionGroup } from "./flowSuggestionGroups";
import { getExactWebhookProof } from "./webhookProof";
import type { Automatisering } from "./types";

export interface FlowSuggestionReviewMetric {
  label: string;
  value: string;
  detail: string;
  tone: "default" | "success" | "warning" | "danger";
}

export interface FlowSuggestionReviewTransition {
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  label: "100% webhook-match";
  sourcePath: string;
  targetPath: string;
  normalizedPath: string;
}

export interface FlowSuggestionReviewPresentation {
  title: string;
  summary: string;
  approvalState: {
    status: "ready" | "blocked";
    label: string;
    detail: string;
  };
  badges: string[];
  metrics: FlowSuggestionReviewMetric[];
  nodes: Array<{ id: string; label: string; sourceLabel: string; status: string }>;
  transitions: FlowSuggestionReviewTransition[];
  evidenceItems: Array<{ title: string; description: string; tag: string; tone: "success" | "warning" | "danger" }>;
  reviewSteps: Array<{ title: string; description: string; tag: string; tone: "success" | "warning" }>;
  aiSuggestions: Array<{ label: string; description: string; tag: string; tone: "warning" | "danger" }>;
  sourceQualityMessages: Array<{ automationId: string; label: string; description: string; tone: "warning" | "danger" }>;
}

interface BuildInput {
  group: FlowSuggestionGroup;
  automations: Automatisering[];
  endpointEvidence: string;
  aiResult: FlowSuggestionAiResult | null;
}

export function getFlowSuggestionReviewPresentation({
  group,
  automations,
  endpointEvidence,
  aiResult,
}: BuildInput): FlowSuggestionReviewPresentation {
  const autoMap = new Map(automations.map((automation) => [automation.id, automation]));
  const transitions = group.suggestions
    .map((suggestion) => {
      const from = autoMap.get(suggestion.fromId);
      const to = autoMap.get(suggestion.toId);
      const proof = getExactWebhookProof(from, to);
      if (!proof) return null;
      return {
        fromId: suggestion.fromId,
        toId: suggestion.toId,
        fromLabel: suggestion.fromNaam,
        toLabel: suggestion.toNaam,
        label: "100% webhook-match" as const,
        sourcePath: proof.sourcePath,
        targetPath: proof.targetPath,
        normalizedPath: proof.normalizedPath,
      };
    })
    .filter((transition): transition is FlowSuggestionReviewTransition => Boolean(transition));

  const sourceQualityMessages = automations.flatMap((automation) => {
    const quality = getAutomationSourceQualityPresentation(automation);
    return quality.blockingFindings.map((finding) => ({
      automationId: automation.id,
      label: automation.naam,
      description: finding.message,
      tone: finding.severity === "critical" ? "danger" as const : "warning" as const,
    }));
  });

  const ready = transitions.length === group.suggestions.length && sourceQualityMessages.every((message) => message.tone !== "danger");
  const title = aiResult?.title || buildFallbackTitle(group);
  const summary = aiResult?.summary || buildFallbackSummary(group, endpointEvidence);
  const aiSuggestions = [
    ...(aiResult?.aiSuggestions ?? []).map((suggestion) => ({
      label: suggestion.label,
      description: suggestion.description,
      tag: suggestion.tag,
      tone: suggestion.severity === "critical" ? "danger" as const : "warning" as const,
    })),
    ...(aiResult?.openQuestions ?? []).map((question) => ({
      label: "Open vraag",
      description: question,
      tag: "Review nodig",
      tone: "warning" as const,
    })),
  ];

  return {
    title,
    summary,
    approvalState: ready
      ? { status: "ready", label: "Klaar voor review", detail: "Alle overgangen zijn exact via webhook/endpoint bewezen." }
      : { status: "blocked", label: "Niet goedkeuringsklaar", detail: "Een of meer overgangen missen exacte webhook-bewijsvoering." },
    badges: [`${group.nodes.length} automations`, `${transitions.length} webhook-overgangen`, `${aiSuggestions.length} AI-voorstellen`],
    metrics: [
      {
        label: "Bewijsstatus",
        value: ready ? "100%" : "Niet klaar",
        detail: ready ? "Alle overgangen via exacte webhook-match" : "Er mist exacte webhook-bewijsvoering",
        tone: ready ? "success" : "danger",
      },
      {
        label: "Bronkwaliteit",
        value: sourceQualityMessages.length ? "Review" : "Goed",
        detail: sourceQualityMessages.length ? "Controleer bronkwaliteitmeldingen" : "Geen blocker voor deze keten",
        tone: sourceQualityMessages.length ? "warning" : "success",
      },
      {
        label: "Businessobject",
        value: aiResult?.businessObject || "Nog niet verrijkt",
        detail: aiResult?.businessObject ? "Afkomstig uit AI-verrijking" : "Kan via AI-werkbank worden aangevuld",
        tone: "default",
      },
      {
        label: "Keten stopt bij",
        value: group.nodes.at(-1)?.naam || "Onbekend",
        detail: "Geen volgende bewezen webhook-match in dit voorstel",
        tone: "default",
      },
    ],
    nodes: group.nodes.map((node) => ({
      id: node.id,
      label: node.naam,
      sourceLabel: sourceLabel(node.source),
      status: autoMap.get(node.id)?.status ?? "Onbekend",
    })),
    transitions,
    evidenceItems: transitions.map((transition) => ({
      title: `${transition.fromLabel} → ${transition.toLabel}`,
      description: `Exacte webhook/endpoint match op ${transition.normalizedPath}.`,
      tag: "100% webhook-match",
      tone: "success",
    })),
    reviewSteps: [
      {
        title: "Controleer of de keten technisch klopt",
        description: "Elke overgang moet een exacte webhook- of endpointmatch hebben.",
        tag: ready ? "OK" : "Review",
        tone: ready ? "success" : "warning",
      },
      {
        title: "Lees het businessverhaal",
        description: "De samenvatting moet uitleggen wat het proces doet zonder bewijs te verzinnen.",
        tag: aiResult ? "AI" : "Basis",
        tone: "warning",
      },
      {
        title: "Beoordeel AI-voorstellen en gaps",
        description: "AI-output blijft zichtbaar als voorstel of open vraag.",
        tag: "Review",
        tone: "warning",
      },
      {
        title: "Keur alleen de bewezen procesreis goed",
        description: "Alleen de harde webhook-keten wordt opgeslagen als procesreis.",
        tag: ready ? "Opslaan" : "Geblokkeerd",
        tone: ready ? "success" : "warning",
      },
    ],
    aiSuggestions,
    sourceQualityMessages,
  };
}

function buildFallbackTitle(group: FlowSuggestionGroup): string {
  const first = group.nodes[0]?.naam ?? "Start";
  const last = group.nodes.at(-1)?.naam ?? "einde";
  return `${first} naar ${last}`;
}

function buildFallbackSummary(group: FlowSuggestionGroup, endpointEvidence: string): string {
  const endpointText = endpointEvidence ? ` De technische overdracht loopt via ${endpointEvidence}.` : "";
  return `Deze concept-procesreis verbindt ${group.nodes.length} automations via webhook-bewijs.${endpointText} Gebruik de AI-werkbank om het businessverhaal aan te vullen zonder extra bewijs te verzinnen.`;
}

function sourceLabel(source: string | null): string {
  if (source === "hubspot") return "HubSpot";
  if (source === "zapier") return "Zapier";
  if (source === "gitlab") return "GitLab";
  if (source === "typeform") return "Typeform";
  return "Automation";
}
```

- [ ] **Step 4: Run presentation tests to verify they pass**

Run:

```bash
npm run test -- src/test/flowSuggestionReviewPresentation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit presentation builder**

```bash
git add src/lib/flowSuggestionReviewPresentation.ts src/test/flowSuggestionReviewPresentation.test.ts
git commit -m "feat: present flow suggestion review cockpit"
```

---

### Task 4: AI Workbench Component

**Files:**
- Create: `src/components/flows/FlowSuggestionAiWorkbench.tsx`
- Test: Update `src/test/flowSuggestionDetailUx.test.tsx` later in Task 7 after integration.

- [ ] **Step 1: Create the workbench component**

Create `src/components/flows/FlowSuggestionAiWorkbench.tsx`:

```tsx
import { Clipboard, WandSparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  parseFlowSuggestionAiResult,
  type FlowSuggestionAiResult,
} from "@/lib/flowSuggestionAi";

interface FlowSuggestionAiWorkbenchProps {
  prompt: string;
  aiResult: FlowSuggestionAiResult | null;
  onApply: (result: FlowSuggestionAiResult) => void;
}

export function FlowSuggestionAiWorkbench({
  prompt,
  aiResult,
  onApply,
}: FlowSuggestionAiWorkbenchProps): React.ReactNode {
  const [rawResult, setRawResult] = useState("");
  const [error, setError] = useState("");

  async function handleCopyPrompt(): Promise<void> {
    if (!navigator.clipboard) {
      setError("Kopiëren wordt niet ondersteund in deze browser.");
      return;
    }
    await navigator.clipboard.writeText(prompt);
    toast.success("AI-prompt gekopieerd");
  }

  function handleApply(): void {
    const parsed = parseFlowSuggestionAiResult(rawResult);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError("");
    onApply(parsed.value);
    toast.success("AI-resultaat verwerkt");
  }

  return (
    <section className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            AI-werkbank
          </p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            Verrijk dit voorstel handmatig met AI
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Kopieer de prompt, plak die in een AI, en plak de JSON-output hier terug.
            AI mag beschrijven en vragen stellen, maar bewijst nooit nieuwe overgangen.
          </p>
        </div>
        {aiResult && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            AI-verrijking actief
          </span>
        )}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">1. Prompt met brondata</h3>
            <Button type="button" variant="outline" onClick={handleCopyPrompt}>
              <Clipboard className="mr-2 h-4 w-4" />
              Prompt kopiëren
            </Button>
          </div>
          <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-50">
            {prompt}
          </pre>
        </div>

        <div className="min-w-0 rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">2. AI-resultaat terugplakken</h3>
          <Textarea
            aria-label="AI-resultaat"
            className="mt-3 min-h-56 resize-y font-mono text-xs"
            value={rawResult}
            onChange={(event) => setRawResult(event.target.value)}
            placeholder='{"title":"...","summary":"...","processSteps":["..."]}'
          />
          {error && (
            <p role="alert" className="mt-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <Button type="button" className="mt-3" onClick={handleApply}>
            <WandSparkles className="mr-2 h-4 w-4" />
            Resultaat verwerken
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <RuleCard title="Mag invullen" description="Naam, samenvatting, processtappen en reviewnotities." tone="success" />
        <RuleCard title="Blijft gelabeld" description="Open vragen, mogelijke vervolgen en gaps." tone="warning" />
        <RuleCard title="Blijft read-only" description="Webhook-bewijs, bewezen overgangen en goedkeuringsstatus." tone="default" />
      </div>
    </section>
  );
}

function RuleCard({
  title,
  description,
  tone,
}: {
  title: string;
  description: string;
  tone: "success" | "warning" | "default";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : "border-slate-200 bg-white text-slate-950";
  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed opacity-75">{description}</p>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript via related tests after integration**

Do not run the component alone yet. It will compile once Task 7 imports it.

- [ ] **Step 3: Commit workbench component**

```bash
git add src/components/flows/FlowSuggestionAiWorkbench.tsx
git commit -m "feat: add flow suggestion ai workbench"
```

---

### Task 5: Review Cockpit Component

**Files:**
- Create: `src/components/flows/FlowSuggestionReviewCockpit.tsx`

- [ ] **Step 1: Create cockpit component**

Create `src/components/flows/FlowSuggestionReviewCockpit.tsx`:

```tsx
import { ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FlowSuggestionReviewPresentation } from "@/lib/flowSuggestionReviewPresentation";

interface FlowSuggestionReviewCockpitProps {
  presentation: FlowSuggestionReviewPresentation;
  onAccept: () => void;
  onReject: () => void;
  rejectPending: boolean;
}

export function FlowSuggestionReviewCockpit({
  presentation,
  onAccept,
  onReject,
  rejectPending,
}: FlowSuggestionReviewCockpitProps): React.ReactNode {
  const canAccept = presentation.approvalState.status === "ready";

  return (
    <div className="min-w-0 space-y-5">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <span className={approvalBadgeClass(presentation.approvalState.status)}>
              {presentation.approvalState.label}
            </span>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Concept-procesreis
            </p>
            <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-foreground">
              {presentation.title}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {presentation.badges.map((badge) => (
                <span key={badge} className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                  {badge}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button type="button" variant="outline" onClick={onReject} disabled={rejectPending}>
              <XCircle className="mr-2 h-4 w-4" />
              Verwerp
            </Button>
            <Button type="button" onClick={onAccept} disabled={!canAccept}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Goedkeuren
            </Button>
          </div>
        </div>
        <p className="mt-4 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          {presentation.approvalState.detail}
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {presentation.metrics.map((metric) => (
          <div key={metric.label} className={`rounded-2xl border bg-card p-4 shadow-sm ${metricBorderClass(metric.tone)}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{metric.value}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{metric.detail}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-foreground">Wat gebeurt er in deze procesreis?</h2>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            AI-verrijkt, bewijs apart
          </span>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{presentation.summary}</p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-foreground">Webhook-bewezen keten</h2>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            Alleen harde matches
          </span>
        </div>
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
          {presentation.nodes.map((node, index) => (
            <div key={node.id} className="flex min-w-max items-center gap-3">
              <div className="w-48 rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{node.sourceLabel}</p>
                <p className="mt-1 line-clamp-2 text-sm font-semibold text-foreground">{node.label}</p>
                <p className="mt-2 text-xs text-muted-foreground">{node.status}</p>
              </div>
              {index < presentation.nodes.length - 1 && (
                <div className="flex min-w-32 flex-col items-center justify-center text-center text-[11px] font-semibold text-muted-foreground">
                  <span>100% webhook-match</span>
                  <div className="my-1 flex w-full items-center">
                    <span className="h-px flex-1 bg-border" />
                    <ArrowRight className="h-4 w-4" />
                  </div>
                  <span>{presentation.transitions[index]?.normalizedPath ?? "Geen bewijs"}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-foreground">Reviewstappen</h2>
          <div className="mt-4 space-y-3">
            {presentation.reviewSteps.map((step, index) => (
              <div key={step.title} className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-[2rem_minmax(0,1fr)_auto]">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-xs font-bold text-foreground">
                  {index + 1}
                </span>
                <div>
                  <p className="font-semibold text-foreground">{step.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
                <span className={smallTagClass(step.tone)}>{step.tag}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <ReviewSideCard title="Bewijs per overgang" items={presentation.evidenceItems} />
          <ReviewSideCard title="AI-voorstellen & gaps" items={presentation.aiSuggestions} emptyText="Nog geen AI-voorstellen geplakt." />
          <ReviewSideCard title="Bronkwaliteit" items={presentation.sourceQualityMessages.map((message) => ({
            title: message.label,
            description: message.description,
            tag: message.tone === "danger" ? "Blocker" : "Waarschuwing",
            tone: message.tone,
          }))} emptyText="Geen bronkwaliteit-blockers voor dit voorstel." />
        </aside>
      </div>
    </div>
  );
}

function ReviewSideCard({
  title,
  items,
  emptyText = "Geen items.",
}: {
  title: string;
  items: Array<{ title?: string; label?: string; description: string; tag: string; tone: "success" | "warning" | "danger" }>;
  emptyText?: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          items.map((item) => (
            <div key={`${item.title ?? item.label}-${item.description}`} className="flex gap-3 rounded-xl border border-border bg-muted/20 p-3">
              <span className={`mt-1 h-2.5 w-2.5 rounded-full ${dotClass(item.tone)}`} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{item.title ?? item.label}</p>
                  <span className={smallTagClass(item.tone)}>{item.tag}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function approvalBadgeClass(status: "ready" | "blocked"): string {
  return status === "ready"
    ? "inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800"
    : "inline-flex rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800";
}

function metricBorderClass(tone: "default" | "success" | "warning" | "danger"): string {
  if (tone === "success") return "border-emerald-200";
  if (tone === "warning") return "border-amber-200";
  if (tone === "danger") return "border-red-200";
  return "border-border";
}

function smallTagClass(tone: "success" | "warning" | "danger"): string {
  if (tone === "success") return "rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-800";
  if (tone === "danger") return "rounded-full bg-red-100 px-2 py-1 text-[11px] font-semibold text-red-800";
  return "rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800";
}

function dotClass(tone: "success" | "warning" | "danger"): string {
  if (tone === "success") return "bg-emerald-500";
  if (tone === "danger") return "bg-red-500";
  return "bg-amber-500";
}
```

- [ ] **Step 2: Commit cockpit component**

```bash
git add src/components/flows/FlowSuggestionReviewCockpit.tsx
git commit -m "feat: add flow suggestion review cockpit component"
```

---

### Task 6: Integrate The Cockpit Into FlowSuggestionDetail

**Files:**
- Modify: `src/pages/FlowSuggestionDetail.tsx`

- [ ] **Step 1: Add imports and AI state**

Modify imports in `src/pages/FlowSuggestionDetail.tsx`:

```tsx
import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, Workflow } from "lucide-react";
import { FlowSuggestionAiWorkbench } from "@/components/flows/FlowSuggestionAiWorkbench";
import { FlowSuggestionReviewCockpit } from "@/components/flows/FlowSuggestionReviewCockpit";
import { buildAcceptedFlowDescriptionFromAiResult, type FlowSuggestionAiResult } from "@/lib/flowSuggestionAi";
import { buildFlowSuggestionAiPrompt } from "@/lib/flowSuggestionPromptBuilder";
import { getFlowSuggestionReviewPresentation } from "@/lib/flowSuggestionReviewPresentation";
```

Keep imports used by helper functions that remain in the file. Remove imports only after TypeScript confirms they are unused.

Inside `FlowSuggestionDetail`, add:

```tsx
const [manualAiResult, setManualAiResult] = useState<FlowSuggestionAiResult | null>(null);
```

- [ ] **Step 2: Build prompt and presentation**

After `involvedAutomations` is computed, add:

```tsx
const reviewPresentation = useMemo(
  () =>
    group
      ? getFlowSuggestionReviewPresentation({
          group,
          automations: involvedAutomations,
          endpointEvidence,
          aiResult: manualAiResult,
        })
      : null,
  [endpointEvidence, group, involvedAutomations, manualAiResult],
);

const aiPrompt = useMemo(
  () =>
    group
      ? buildFlowSuggestionAiPrompt({
          group,
          automations: involvedAutomations,
          endpointEvidence,
        })
      : "",
  [endpointEvidence, group, involvedAutomations],
);
```

- [ ] **Step 3: Use manual AI result in accept flow**

At the top of `handleAccepteer`, before `setAcceptState`, compute:

```tsx
const manualName = manualAiResult?.title.trim() ?? "";
const manualDescription = manualAiResult
  ? buildAcceptedFlowDescriptionFromAiResult(manualAiResult)
  : "";
```

Then replace the `setAcceptState` call with:

```tsx
setAcceptState({
  group: groupToAccept,
  automationIds: orderedIds,
  aiName: manualName,
  aiBeschrijving: manualDescription,
  aiError: false,
  loading: !manualAiResult,
  saving: false,
});

if (manualAiResult) return;
```

This keeps the existing `nameFlow(autos)` fallback for cases without manual AI result.

- [ ] **Step 4: Replace the main layout body**

Inside the `<main>` element, replace the current left column and sticky aside with:

```tsx
{reviewPresentation && (
  <div className="min-w-0 space-y-5 lg:col-span-2">
    <FlowSuggestionReviewCockpit
      presentation={reviewPresentation}
      onAccept={() => handleAccepteer(group)}
      onReject={handleVerwerpProcesreis}
      rejectPending={actionPending}
    />
    <FlowSuggestionAiWorkbench
      prompt={aiPrompt}
      aiResult={manualAiResult}
      onApply={setManualAiResult}
    />
  </div>
)}
```

Keep the loading state, missing group redirect, `FlowConfirmDialog`, `handleSaveFlow`, and helper functions required by fallback naming.

- [ ] **Step 5: Keep existing fallback helpers until TypeScript removal is safe**

Run:

```bash
npm run test -- src/test/flowSuggestionDetailUx.test.tsx
```

Expected: FAIL because the tests still expect old section names. If TypeScript fails due to unused imports, remove only the imports and helper functions that are no longer referenced.

- [ ] **Step 6: Commit integration after tests are updated in Task 7**

Do not commit this task yet. Task 7 updates tests against this integrated UI.

---

### Task 7: Update Flow Suggestion UI Tests

**Files:**
- Modify: `src/test/flowSuggestionDetailUx.test.tsx`
- Modify: `src/pages/FlowSuggestionDetail.tsx`
- Add from earlier tasks if not committed: `src/components/flows/FlowSuggestionReviewCockpit.tsx`, `src/components/flows/FlowSuggestionAiWorkbench.tsx`, `src/lib/flowSuggestionReviewPresentation.ts`, `src/lib/flowSuggestionPromptBuilder.ts`, `src/lib/flowSuggestionAi.ts`

- [ ] **Step 1: Add clipboard mock**

At the top of `src/test/flowSuggestionDetailUx.test.tsx`, after mocks:

```ts
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});
```

- [ ] **Step 2: Replace outdated page structure tests**

Replace the old UX tests that assert `Procesverhaal`, `Stap voor stap overzicht`, `Vervolgcontrole`, and compact transition separators with:

```ts
it("shows the review cockpit with hard webhook proof and no probability language", () => {
  renderSuggestionDetail();

  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/BTW 2 maanden geboekt/i);
  expect(screen.getByText(/Klaar voor review/i)).toBeInTheDocument();
  expect(screen.getByText(/Bewijsstatus/i)).toBeInTheDocument();
  expect(screen.getByText("100%")).toBeInTheDocument();
  expect(screen.getAllByText(/100% webhook-match/i).length).toBeGreaterThan(0);
  expect(screen.queryByText(/waarschijnlijk/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/88%|95%/i)).not.toBeInTheDocument();
});

it("shows the AI workbench and keeps proof guardrails visible", () => {
  renderSuggestionDetail();

  expect(screen.getByRole("heading", { name: /Verrijk dit voorstel handmatig met AI/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Prompt kopiëren/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/AI-resultaat/i)).toBeInTheDocument();
  expect(screen.getByText(/Webhook-bewijs, bewezen overgangen en goedkeuringsstatus/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Add AI paste behavior test**

Add:

```ts
import userEvent from "@testing-library/user-event";
```

Then add:

```ts
it("applies pasted AI output as descriptive context and labels gaps as unproven", async () => {
  const user = userEvent.setup();
  renderSuggestionDetail();

  await user.type(
    screen.getByLabelText(/AI-resultaat/i),
    JSON.stringify({
      title: "BTW vervolgkwartaal review",
      summary: "Deze procesreis werkt het volgende BTW-kwartaal bij.",
      businessObject: "BTW-dossier",
      processSteps: ["HubSpot start de overdracht.", "Backend werkt HubSpot bij."],
      changeSummary: ["Het volgende kwartaal verandert."],
      aiSuggestions: [{ label: "Vervolgworkflow", description: "Mogelijke vervolgtrigger, nog niet bewezen.", severity: "warning" }],
      openQuestions: ["Moet dit nog naar een andere workflow?"],
    }),
  );
  await user.click(screen.getByRole("button", { name: /Resultaat verwerken/i }));

  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("BTW vervolgkwartaal review");
  expect(screen.getByText(/Deze procesreis werkt het volgende BTW-kwartaal bij/i)).toBeInTheDocument();
  expect(screen.getByText(/Mogelijke vervolgtrigger, nog niet bewezen/i)).toBeInTheDocument();
  expect(screen.getByText(/Review nodig/i)).toBeInTheDocument();
});
```

- [ ] **Step 4: Keep component-level tests for `StepLogicDetails` and `ProcessJourneyNarrative`**

Leave these existing tests in the file:

```ts
it("uses a touch-friendly trigger for step logic details", () => {
  render(<StepLogicDetails logic="Deze logica verklaart de stap." />);

  const trigger = screen.getByRole("button", { name: /logica/i });
  expect(trigger).toHaveClass("min-h-[44px]");
  expect(trigger).toHaveClass("focus-visible:ring-2");
});

it("shows the approved flow description as the confirmed process story", () => {
  render(
    <ProcessJourneyNarrative
      automations={automations}
      pipelines={[]}
      autoMap={new Map(automations.map((automation) => [automation.id, automation]))}
      approvedDescription={[
        "Wanneer een klant of bedrijf in HubSpot klaarstaat om in WeFact te worden aangemaakt of bijgewerkt, start de workflow \"Upsert WeFact client\".",
        "Na afloop blijft HubSpot het startpunt voor de klantrelatie en is WeFact bijgewerkt voor facturatie.",
      ].join("\n\n")}
    />,
  );

  expect(screen.getByText(/WeFact te worden aangemaakt of bijgewerkt/i)).toBeInTheDocument();
  expect(screen.getByText(/WeFact bijgewerkt voor facturatie/i)).toBeInTheDocument();
  expect(screen.queryByText(/De procesreis start zodra/i)).not.toBeInTheDocument();
});
```

Remove tests for the old runtime journey layout from this file once the new cockpit renders.

- [ ] **Step 5: Run updated UI tests**

Run:

```bash
npm run test -- src/test/flowSuggestionDetailUx.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit integration and UI tests**

```bash
git add src/pages/FlowSuggestionDetail.tsx src/components/flows/FlowSuggestionReviewCockpit.tsx src/components/flows/FlowSuggestionAiWorkbench.tsx src/test/flowSuggestionDetailUx.test.tsx
git commit -m "feat: redesign flow suggestion review cockpit"
```

---

### Task 8: Acceptance Dialog And Manual AI Description

**Files:**
- Modify: `src/test/flowSuggestionDetailUx.test.tsx`
- Modify: `src/pages/FlowSuggestionDetail.tsx`

- [ ] **Step 1: Mock flow creation dependencies for acceptance behavior**

In `src/test/flowSuggestionDetailUx.test.tsx`, expose mock functions:

```ts
const createFlowMock = vi.fn().mockResolvedValue({ id: "flow-new" });
const acceptCandidateMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/queryHooks/automationLinks", () => ({
  useAccepteerFlowKandidaat: () => ({ mutateAsync: acceptCandidateMock, isPending: false }),
  useFlowSuggesties: () => ({ data: suggestions, isLoading: false }),
  useVerwerpFlowSuggestie: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/queryHooks/flows", () => ({
  useCreateFlow: () => ({ mutateAsync: createFlowMock }),
}));
```

If Vitest hoisting rejects the direct constants, wrap them with `vi.hoisted`.

- [ ] **Step 2: Add acceptance test for manual AI result**

Add:

```ts
it("prefills the acceptance dialog from manual AI output", async () => {
  const user = userEvent.setup();
  renderSuggestionDetail();

  await user.type(
    screen.getByLabelText(/AI-resultaat/i),
    JSON.stringify({
      title: "BTW vervolgkwartaal review",
      summary: "Deze procesreis werkt het volgende BTW-kwartaal bij.",
      businessObject: "BTW-dossier",
      processSteps: ["HubSpot start.", "Backend werkt bij."],
      changeSummary: ["Volgend kwartaal verandert."],
    }),
  );
  await user.click(screen.getByRole("button", { name: /Resultaat verwerken/i }));
  await user.click(screen.getByRole("button", { name: /Goedkeuren/i }));

  expect(screen.getByDisplayValue("BTW vervolgkwartaal review")).toBeInTheDocument();
  expect(screen.getByDisplayValue(/Deze procesreis werkt het volgende BTW-kwartaal bij/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run acceptance UI test**

Run:

```bash
npm run test -- src/test/flowSuggestionDetailUx.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit acceptance behavior**

```bash
git add src/pages/FlowSuggestionDetail.tsx src/test/flowSuggestionDetailUx.test.tsx
git commit -m "feat: use manual ai result for flow approval copy"
```

---

### Task 9: Visual Polish And Responsive Layout

**Files:**
- Modify: `src/components/flows/FlowSuggestionReviewCockpit.tsx`
- Modify: `src/components/flows/FlowSuggestionAiWorkbench.tsx`

- [ ] **Step 1: Check desktop and mobile in browser**

Start the app:

```bash
npm run dev -- --host 127.0.0.1
```

Open an existing concept journey route:

```text
http://127.0.0.1:5173/flows/suggesties/<existing-suggestion-id>
```

Expected:

- Header card fits without horizontal scroll.
- Metrics wrap from 4 columns to 2 or 1 columns on smaller widths.
- Webhook chain scrolls horizontally inside its card.
- AI workbench is below primary review information.
- `Goedkeuren` button is disabled for blocked concepts and enabled for 100% webhook-proven concepts.

- [ ] **Step 2: Fix overflow using local component classes**

If desktop or mobile overflow appears, update only the two new components. Use these class patterns:

```tsx
className="min-w-0"
className="break-words"
className="overflow-x-auto"
className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]"
className="w-full max-w-full"
```

Do not change global CSS.

- [ ] **Step 3: Re-run UI tests**

Run:

```bash
npm run test -- src/test/flowSuggestionDetailUx.test.tsx src/test/flowSuggestionReviewPresentation.test.ts src/test/flowSuggestionAi.test.ts src/test/flowSuggestionPromptBuilder.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit visual fixes**

```bash
git add src/components/flows/FlowSuggestionReviewCockpit.tsx src/components/flows/FlowSuggestionAiWorkbench.tsx
git commit -m "style: polish flow suggestion review cockpit"
```

---

### Task 10: Full Verification

**Files:**
- No source changes expected unless verification finds a defect.

- [ ] **Step 1: Run all tests**

Run:

```bash
npm run test
```

Expected: all test files pass, existing todo tests remain todo.

- [ ] **Step 2: Build**

Run:

```bash
npm run build
```

Expected: build succeeds. Existing Vite chunk warnings are acceptable.

- [ ] **Step 3: Lint**

Run:

```bash
npm run lint
```

Expected: no new lint errors. Existing warnings may remain if already present before this work.

- [ ] **Step 4: Browser verification**

Use the local browser to check:

```text
/flows
/flows/suggesties/<existing-suggestion-id>
```

Expected:

- Flow suggestions list still opens concept detail pages.
- Concept detail uses the Review cockpit.
- Prompt copy works when browser clipboard is available.
- Pasting valid JSON updates title, summary, suggestions, and open questions.
- Invalid JSON shows a readable error and does not break the page.
- Approval still creates a flow only from the proven concept journey.

- [ ] **Step 5: Final commit if verification fixes were needed**

If verification required fixes:

```bash
git add <changed-files>
git commit -m "fix: verify flow suggestion review cockpit"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage:
  - Review cockpit: Tasks 3, 5, 6, 7.
  - 100% webhook proof read-only: Tasks 3, 5, 7.
  - AI prompt copy: Tasks 2, 4, 7.
  - AI paste/parser: Tasks 1, 4, 7.
  - AI suggestions and gaps labeled as unproven: Tasks 1, 3, 5, 7.
  - Manual AI output used for approval copy: Task 8.
  - Browser/mobile verification: Tasks 9 and 10.

- Type consistency:
  - `FlowSuggestionAiResult` is defined once in `flowSuggestionAi.ts`.
  - `FlowSuggestionReviewPresentation` is defined once in `flowSuggestionReviewPresentation.ts`.
  - UI components consume presentation types and never inspect raw source data directly.

- Scope:
  - No database migration.
  - No automatic AI API call.
  - No change to flow detection rules.
  - No AI-generated proof.
