import { describe, expect, it } from "vitest";
import {
  getAnalyticsHealthPresentation,
  type AnalyticsHealthPresentation,
} from "@/lib/analyticsHealthPresentation";
import type { Automatisering, Flow } from "@/lib/types";

describe("analyticsHealthPresentation", () => {
  it("builds an explainable evidence-weighted health score", () => {
    const presentation = build([
      hubspotSender(),
      gitlabEndpoint(),
      gitlabUnmatchedEndpoint(),
      hubspotIncomplete(),
    ]);

    expect(presentation.healthScore.value).toBeGreaterThanOrEqual(0);
    expect(presentation.healthScore.value).toBeLessThanOrEqual(100);
    expect(presentation.healthScore.breakdown.map((item) => item.label)).toEqual([
      "Webhook route coverage",
      "GitLab endpoint coverage",
      "Source quality readiness",
      "Actieve procesreis-integriteit",
      "Sync/verificatie-basisdekking",
    ]);
    expect(presentation.metrics.find((metric) => metric.id === "source-incomplete")).toMatchObject({
      label: "Brondata incompleet",
      value: "1",
    });
  });

  it("classifies a GitLab endpoint with one exact sender as part of a process journey", () => {
    const presentation = build([hubspotSender(), gitlabEndpoint()]);

    expect(gapRow(presentation, "gl-endpoint", "/operations/hubspot/create_new_deal")).toMatchObject({
      classification: "in_process_journey",
      classificationLabel: "In procesreis",
      matchedSenders: [expect.objectContaining({ automationId: "hs-create", method: "POST" })],
      nextAction: "Geen actie nodig; dit endpoint heeft een harde inkomende route-match.",
    });
  });

  it("classifies multiple starters for the same GitLab endpoint as a shared endpoint", () => {
    const presentation = build([
      zapierTrustoo("zap-rotterdam", "Trustoo Leads - Rotterdam"),
      zapierTrustoo("zap-amsterdam", "Trustoo Leads - Amsterdam"),
      gitlabTrustooEndpoint(),
    ]);

    expect(gapRow(presentation, "gl-trustoo", "/sales/leads/hubspot/trustoo")).toMatchObject({
      classification: "shared_endpoint",
      classificationLabel: "Gedeeld endpoint",
      matchedSenders: [
        expect.objectContaining({ automationName: "Trustoo Leads - Rotterdam" }),
        expect.objectContaining({ automationName: "Trustoo Leads - Amsterdam" }),
      ],
    });
  });

  it("classifies a GitLab receiver without an exact incoming sender as an endpoint gap", () => {
    const presentation = build([gitlabUnmatchedEndpoint()]);

    expect(gapRow(presentation, "gl-unmatched", "/internal/check_pipeline_usage")).toMatchObject({
      classification: "no_incoming_webhook",
      classificationLabel: "Geen inkomende webhook",
      matchedSenders: [],
      nextAction: "Leg de aanroepende bron vast of verbeter de bronsync zodat de inkomende webhook bewezen kan worden.",
    });
  });

  it("keeps inactive specific endpoint exact matches as alternative hard matches instead of rejecting them", () => {
    const presentation = build([
      hubspotSender(),
      gitlabEndpoint(),
      gitlabInactiveSpecificAlternative(),
    ]);

    const alternative = gapRow(presentation, "gl-inactive-alternative", "/operations/hubspot/create_new_deal");
    expect(alternative).toMatchObject({
      classification: "alternative_hard_match",
      classificationLabel: "Alternatieve harde match",
    });
    expect(alternative.diagnostics.some((item) => item.kind === "alternative")).toBe(true);
  });

  it("shows duplicate route evidence without counting it as another process journey", () => {
    const presentation = build([hubspotSender(), gitlabEndpointWithDuplicateEvidence()]);

    const row = gapRow(presentation, "gl-endpoint-dup", "/operations/hubspot/create_new_deal");
    expect(row.classification).toBe("in_process_journey");
    expect(row.supportingEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceField: "automatiseringen.endpoints" }),
      ]),
    );
  });

  it("classifies same-path method conflicts as a method mismatch", () => {
    const presentation = build([hubspotSender({ method: "GET" }), gitlabEndpoint()]);

    expect(gapRow(presentation, "gl-endpoint", "/operations/hubspot/create_new_deal")).toMatchObject({
      classification: "method_mismatch",
      classificationLabel: "Methode mismatch",
      matchedSenders: [],
      conflictingSenders: [expect.objectContaining({ method: "GET" })],
    });
  });

  it("marks incomplete source findings as blocking source quality", () => {
    const presentation = build([gitlabEndpointWithFinding()]);

    expect(gapRow(presentation, "gl-finding", "/operations/hubspot/create_new_deal")).toMatchObject({
      classification: "source_incomplete",
      classificationLabel: "Brondata incompleet",
      nextAction: "Los de source finding of ontbrekende endpointanalyse op voordat dit endpoint als procesreisbewijs telt.",
    });
  });

  it("reports disabled automations that are involved in saved process journeys", () => {
    const presentation = build(
      [hubspotSender(), gitlabDisabledEndpoint()],
      [
        {
          id: "flow-1",
          naam: "Create new deal journey",
          beschrijving: "",
          systemen: ["HubSpot", "GitLab"],
          automationIds: ["hs-create", "gl-disabled"],
          createdAt: "2026-05-29T00:00:00.000Z",
          updatedAt: "2026-05-29T00:00:00.000Z",
        },
      ],
    );

    expect(presentation.disabledJourneyAutomations).toEqual([
      expect.objectContaining({
        automationName: "New create deal disabled",
        journeyName: "Create new deal journey",
      }),
    ]);
  });
});

function build(automations: Automatisering[], flows: Flow[] = []): AnalyticsHealthPresentation {
  return getAnalyticsHealthPresentation({ automations, flows });
}

function gapRow(
  presentation: AnalyticsHealthPresentation,
  automationId: string,
  normalizedPath: string,
) {
  const row = presentation.gitlabEndpointGaps.find(
    (item) => item.automationId === automationId && item.normalizedPath === normalizedPath,
  );
  expect(row).toBeDefined();
  return row!;
}

function baseAutomation(overrides: Partial<Automatisering>): Automatisering {
  return {
    id: "auto",
    naam: "Automation",
    categorie: "Anders",
    doel: "",
    trigger: "",
    systemen: [],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-29T00:00:00.000Z",
    laatstGeverifieerd: "2026-05-29T00:00:00.000Z",
    geverifieerdDoor: "Tester",
    lastSyncedAt: "2026-05-29T00:00:00.000Z",
    ...overrides,
  } as Automatisering;
}

function hubspotSender(overrides: { method?: string } = {}): Automatisering {
  return baseAutomation({
    id: "hs-create",
    naam: "Create new deal",
    source: "hubspot",
    categorie: "HubSpot Workflow",
    systemen: ["HubSpot"],
    hubspotWorkflow: {
      name: "Create new deal",
      triggers: [{ label: "Deal meets criteria", source: "HubSpot" }],
      actions: [
        {
          index: 1,
          type: "WEBHOOK",
          label: "Send webhook",
          webhookMethod: overrides.method ?? "POST",
          webhookPath: "/operations/hubspot/create_new_deal",
        },
      ],
    },
  });
}

function hubspotIncomplete(): Automatisering {
  return baseAutomation({
    id: "hs-incomplete",
    naam: "Incomplete HubSpot",
    source: "hubspot",
    categorie: "HubSpot Workflow",
    systemen: ["HubSpot"],
    hubspotWorkflow: {
      name: "Incomplete HubSpot",
      triggers: [{ label: "Deal changed", source: "HubSpot" }],
      actions: [],
    },
    sourceFindings: [
      {
        id: "finding-hs",
        automationId: "hs-incomplete",
        source: "hubspot",
        type: "source_data_incomplete",
        severity: "warning",
        message: "Actions ontbreken.",
        firstSeenAt: "2026-05-29T00:00:00.000Z",
        lastSeenAt: "2026-05-29T00:00:00.000Z",
      },
    ],
  });
}

function zapierTrustoo(id: string, naam: string): Automatisering {
  return baseAutomation({
    id,
    naam,
    source: "zapier",
    categorie: "Zapier Zap",
    systemen: ["Zapier"],
    importProposal: {
      zap: {
        title: naam,
        process: {
          trigger: "New Trustoo lead",
          outcome: "Lead goes to backend",
          conditions: [],
          emails: [],
          dataLookups: [],
          steps: [],
          webhookHandoffs: [{ method: "POST", path: "/sales/leads/hubspot/trustoo" }],
        },
      },
    },
  });
}

function gitlabEndpoint(): Automatisering {
  return baseAutomation({
    id: "gl-endpoint",
    naam: "New create deal",
    source: "gitlab",
    categorie: "Backend Script",
    systemen: ["GitLab", "API"],
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/operations/hubspot/create_new_deal",
      handler: "new_create_deal",
      api_file: "app/api/operations.py",
      calls: [{ depth: 1, kind: "call", from: "new_create_deal", to: "create_new_deal", file: "operations.py" }],
    },
  });
}

function gitlabEndpointWithDuplicateEvidence(): Automatisering {
  return {
    ...gitlabEndpoint(),
    id: "gl-endpoint-dup",
    naam: "New create deal duplicated",
    endpoints: ["/operations/hubspot/create_new_deal"],
  };
}

function gitlabTrustooEndpoint(): Automatisering {
  return baseAutomation({
    id: "gl-trustoo",
    naam: "Lead- en Dealbeheer voor Sales in HubSpot",
    source: "gitlab",
    categorie: "Backend Script",
    systemen: ["GitLab", "HubSpot"],
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/sales/leads/hubspot/trustoo",
      handler: "trustoo_leads",
      calls: [{ depth: 1, kind: "call", from: "trustoo_leads", to: "upsert_hubspot_lead", file: "sales.py" }],
    },
  });
}

function gitlabUnmatchedEndpoint(): Automatisering {
  return baseAutomation({
    id: "gl-unmatched",
    naam: "Check pipeline usage",
    source: "gitlab",
    categorie: "Backend Script",
    systemen: ["GitLab"],
    gitlabEndpoint: {
      method: "GET",
      endpoint: "/internal/check_pipeline_usage",
      handler: "check_pipeline_usage",
      calls: [{ depth: 1, kind: "call", from: "check_pipeline_usage", to: "read_pipeline", file: "internal.py" }],
    },
  });
}

function gitlabInactiveSpecificAlternative(): Automatisering {
  return baseAutomation({
    id: "gl-inactive-alternative",
    naam: "Inactive create deal endpoint",
    source: "gitlab",
    categorie: "Backend Script",
    systemen: ["GitLab"],
    status: "Uitgeschakeld",
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/operations/hubspot/create_new_deal",
      handler: "new_create_deal_old",
      api_file: "legacy/operations.py",
      calls: [],
    },
  });
}

function gitlabEndpointWithFinding(): Automatisering {
  return {
    ...gitlabEndpoint(),
    id: "gl-finding",
    naam: "New create deal incomplete",
    sourceFindings: [
      {
        id: "finding-gl",
        automationId: "gl-finding",
        source: "gitlab",
        type: "source_data_incomplete",
        severity: "warning",
        message: "Call graph ontbreekt.",
        firstSeenAt: "2026-05-29T00:00:00.000Z",
        lastSeenAt: "2026-05-29T00:00:00.000Z",
      },
    ],
  };
}

function gitlabDisabledEndpoint(): Automatisering {
  return {
    ...gitlabEndpoint(),
    id: "gl-disabled",
    naam: "New create deal disabled",
    status: "Uitgeschakeld",
  };
}
