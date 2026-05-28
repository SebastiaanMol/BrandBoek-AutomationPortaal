import { describe, expect, it } from "vitest";
import { getFlowSuggestionReviewPresentation } from "@/lib/flowSuggestionReviewPresentation";
import type { FlowSuggestionGroup } from "@/lib/flowSuggestionGroups";
import type { Automatisering, AutomationSourceFinding } from "@/lib/types";

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
        aiSuggestions: [
          {
            label: "Open punt",
            description: "Controleer vervolg.",
            severity: "warning",
            tag: "AI-voorstel",
          },
        ],
        openQuestions: ["Wie keurt dit goed?"],
        ignoredFields: ["approvalStatus"],
      },
    });

    expect(presentation.title).toBe("AI titel");
    expect(presentation.summary).toBe("AI samenvatting voor procesowners.");
    expect(presentation.aiSuggestions).toHaveLength(2);
    expect(presentation.aiSuggestions[0]).toMatchObject({
      tag: "Niet bewezen",
      description: "Controleer vervolg.",
    });
    expect(presentation.aiSuggestions[1]).toMatchObject({
      tag: "Review nodig",
      description: "Wie keurt dit goed?",
    });
    expect(presentation.transitions).toHaveLength(1);
  });

  it("blocks approval when source quality has a critical blocker", () => {
    const presentation = getFlowSuggestionReviewPresentation({
      group: makeGroup("Webhook-match: /backend/process-deal"),
      automations: [
        makeHubSpotAutomation({
          sourceFindings: [makeSourceFinding({ severity: "critical", message: "HubSpot bron ontbreekt." })],
        }),
        makeGitLabAutomation(),
      ],
      endpointEvidence: "/backend/process-deal",
      aiResult: null,
    });

    expect(presentation.approvalState.status).toBe("blocked");
    expect(presentation.sourceQualityMessages[0]).toMatchObject({
      label: "HubSpot workflow",
      description: "HubSpot bron ontbreekt.",
      tone: "danger",
    });
  });

  it("ignores critical source findings on automations outside the suggestion group", () => {
    const presentation = getFlowSuggestionReviewPresentation({
      group: makeGroup("Webhook-match: /backend/process-deal"),
      automations: [
        makeHubSpotAutomation(),
        makeGitLabAutomation(),
        baseAutomation({
          id: "unrelated",
          naam: "Unrelated automation",
          categorie: "HubSpot Workflow",
          source: "hubspot",
          sourceFindings: [
            makeSourceFinding({
              automationId: "unrelated",
              severity: "critical",
              message: "Unrelated bron ontbreekt.",
            }),
          ],
        }),
      ],
      endpointEvidence: "/backend/process-deal",
      aiResult: null,
    });

    expect(presentation.approvalState.status).toBe("ready");
    expect(presentation.sourceQualityMessages).toEqual([]);
  });

  it("blocks approval when involved source quality has generated missing evidence", () => {
    const presentation = getFlowSuggestionReviewPresentation({
      group: makeGroup("Webhook-match: /backend/process-deal"),
      automations: [
        makeHubSpotAutomation({
          hubspotWorkflow: {
            name: "HubSpot workflow",
            triggers: [],
            actions: [
              {
                index: 1,
                type: "WEBHOOK",
                label: "Webhook",
                webhookPath: "/backend/process-deal",
              },
            ],
          },
        }),
        makeGitLabAutomation(),
      ],
      endpointEvidence: "/backend/process-deal",
      aiResult: null,
    });

    expect(presentation.approvalState.status).toBe("blocked");
    expect(presentation.metrics.find((metric) => metric.label === "Bronkwaliteit")).toMatchObject({
      value: "Review",
      tone: "warning",
    });
    expect(presentation.sourceQualityMessages).toContainEqual(
      expect.objectContaining({
        label: "HubSpot triggercriteria",
        tone: "warning",
      }),
    );
  });
});

function makeGroup(reason: string): FlowSuggestionGroup {
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
        redenering: reason,
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
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-28T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  };
}

function makeHubSpotAutomation(overrides: Partial<Automatisering> = {}): Automatisering {
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
    ...overrides,
  });
}

function makeGitLabAutomation(overrides: Partial<Automatisering> = {}): Automatisering {
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
    ...overrides,
  });
}

function makeSourceFinding(
  overrides: Partial<AutomationSourceFinding>,
): AutomationSourceFinding {
  return {
    id: "finding-1",
    automationId: "hs",
    source: "hubspot",
    type: "source_missing",
    severity: "warning",
    message: "Brondata mist.",
    firstSeenAt: "2026-05-28T00:00:00.000Z",
    lastSeenAt: "2026-05-28T00:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}
