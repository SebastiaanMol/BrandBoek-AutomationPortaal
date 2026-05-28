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

  it("keeps a multi-edge chain ready when each transition has a different exact webhook endpoint", () => {
    const presentation = getFlowSuggestionReviewPresentation({
      group: makeMultiEndpointGroup(),
      automations: [
        makeHubSpotAutomation(),
        makeGitLabAutomation({
          id: "middle",
          naam: "Middle backend",
          webhookPaths: ["/backend/finalize-deal"],
        }),
        makeGitLabAutomation({
          id: "final",
          naam: "Final backend",
          gitlabEndpoint: {
            method: "POST",
            endpoint: "/backend/finalize-deal",
            handler: "finalizeDeal",
            calls: [{ depth: 1, kind: "hubspot_repository_call", from: "worker", to: "repo", file: "repo.py" }],
          },
        }),
      ],
      endpointEvidence: "/backend/process-deal",
      aiResult: null,
    });

    expect(presentation.approvalState.status).toBe("ready");
    expect(presentation.transitions).toHaveLength(2);
    expect(presentation.transitions.map((transition) => transition.normalizedPath)).toEqual([
      "/backend/process-deal",
      "/backend/finalize-deal",
    ]);
    expect(presentation.metrics.find((metric) => metric.label === "Bewijsstatus")?.value).toBe("100%");
  });

  it("does not become ready when exact webhook proof is missing", () => {
    const presentation = getFlowSuggestionReviewPresentation({
      group: makeGroup("Webhook-match: /other-route"),
      automations: [
        makeHubSpotAutomation(),
        makeGitLabAutomation({
          gitlabEndpoint: {
            method: "POST",
            endpoint: "/different-receiver",
            handler: "processDeal",
            calls: [{ depth: 1, kind: "hubspot_repository_call", from: "worker", to: "repo", file: "repo.py" }],
          },
        }),
      ],
      endpointEvidence: "/other-route",
      aiResult: null,
    });

    expect(presentation.approvalState.status).toBe("blocked");
    expect(presentation.metrics.find((metric) => metric.label === "Bewijsstatus")?.value).toBe("Niet klaar");
    expect(presentation.transitions).toEqual([]);
  });

  it("keeps a stored webhook suggestion visible when source handoff fields are incomplete", () => {
    const presentation = getFlowSuggestionReviewPresentation({
      group: makeGroup("Webhook-match: automation roept endpoint /operations/hubspot/create_new_deal aan."),
      automations: [
        makeHubSpotAutomation({
          webhookPaths: [],
          hubspotWorkflow: {
            name: "Create new deal",
            triggers: [],
            actions: [],
          },
        }),
        makeGitLabAutomation({
          gitlabEndpoint: {
            method: "POST",
            endpoint: "/operations/hubspot/create_new_deal",
            handler: "createNewDeal",
            calls: [{ depth: 1, kind: "hubspot_repository_call", from: "worker", to: "repo", file: "repo.py" }],
          },
        }),
      ],
      endpointEvidence: "/operations/hubspot/create_new_deal",
      aiResult: null,
    });

    expect(presentation.transitions).toHaveLength(1);
    expect(presentation.transitions[0]).toMatchObject({
      label: "100% webhook-match",
      normalizedPath: "/operations/hubspot/create_new_deal",
      sourcePath: "/operations/hubspot/create_new_deal",
      targetPath: "/operations/hubspot/create_new_deal",
    });
    expect(presentation.badges).toContain("1 webhook-overgangen");
    expect(presentation.metrics.find((metric) => metric.label === "Bewijsstatus")?.value).toBe("100%");
    expect(presentation.approvalState.status).toBe("blocked");
    expect(presentation.sourceQualityMessages).toContainEqual(
      expect.objectContaining({
        label: "HubSpot triggercriteria",
        tone: "warning",
      }),
    );
  });

  it("keeps a stored webhook suggestion visible when receiver endpoint metadata is unavailable", () => {
    const presentation = getFlowSuggestionReviewPresentation({
      group: makeGroup("Webhook-match: automation roept endpoint /operations/hubspot/create_new_deal aan."),
      automations: [
        makeHubSpotAutomation({
          webhookPaths: [],
          hubspotWorkflow: {
            name: "Create new deal",
            triggers: [],
            actions: [],
          },
        }),
        baseAutomation({
          id: "gl",
          naam: "HubSpot Operations API",
          categorie: "Backend Script",
          source: "gitlab",
          systemen: ["GitLab", "HubSpot"],
        }),
      ],
      endpointEvidence: "/operations/hubspot/create_new_deal",
      aiResult: null,
    });

    expect(presentation.transitions).toHaveLength(1);
    expect(presentation.transitions[0]).toMatchObject({
      label: "100% webhook-match",
      normalizedPath: "/operations/hubspot/create_new_deal",
      sourcePath: "/operations/hubspot/create_new_deal",
      targetPath: "/operations/hubspot/create_new_deal",
    });
    expect(presentation.metrics.find((metric) => metric.label === "Bewijsstatus")?.value).toBe("100%");
    expect(presentation.approvalState.status).toBe("blocked");
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

  it("explains unknown source quality on involved automations", () => {
    const presentation = getFlowSuggestionReviewPresentation({
      group: makeUnknownSourceGroup(),
      automations: [
        makeHubSpotAutomation(),
        baseAutomation({
          id: "unknown",
          naam: "Unknown receiver",
          categorie: "Anders",
          systemen: ["API"],
          endpoints: ["/backend/process-deal"],
        }),
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
        automationId: "unknown",
        label: "Unknown receiver",
        description: "Deze automation heeft geen bron waarmee procesreis-bewijs betrouwbaar kan worden opgebouwd.",
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

function makeUnknownSourceGroup(): FlowSuggestionGroup {
  return {
    id: "hs__unknown",
    nodes: [
      { id: "hs", naam: "HubSpot workflow", categorie: "HubSpot Workflow", source: "hubspot" },
      { id: "unknown", naam: "Unknown receiver", categorie: "Anders", source: null },
    ],
    suggestions: [
      {
        fromId: "hs",
        toId: "unknown",
        fromNaam: "HubSpot workflow",
        toNaam: "Unknown receiver",
        fromCategorie: "HubSpot Workflow",
        toCategorie: "Anders",
        fromSource: "hubspot",
        toSource: null,
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

function makeMultiEndpointGroup(): FlowSuggestionGroup {
  return {
    id: "hs__middle__final",
    nodes: [
      { id: "hs", naam: "HubSpot workflow", categorie: "HubSpot Workflow", source: "hubspot" },
      { id: "middle", naam: "Middle backend", categorie: "Backend Script", source: "gitlab" },
      { id: "final", naam: "Final backend", categorie: "Backend Script", source: "gitlab" },
    ],
    suggestions: [
      {
        fromId: "hs",
        toId: "middle",
        fromNaam: "HubSpot workflow",
        toNaam: "Middle backend",
        fromCategorie: "HubSpot Workflow",
        toCategorie: "Backend Script",
        fromSource: "hubspot",
        toSource: "gitlab",
        zekerheid: "webhook",
        redenering: "Webhook-match: /backend/process-deal",
        confirmed: false,
        rejected: false,
      },
      {
        fromId: "middle",
        toId: "final",
        fromNaam: "Middle backend",
        toNaam: "Final backend",
        fromCategorie: "Backend Script",
        toCategorie: "Backend Script",
        fromSource: "gitlab",
        toSource: "gitlab",
        zekerheid: "webhook",
        redenering: "Webhook-match: /backend/finalize-deal",
        confirmed: false,
        rejected: false,
      },
    ],
    webhookCount: 2,
    aiCount: 0,
    confirmedCount: 0,
    totalCount: 2,
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
