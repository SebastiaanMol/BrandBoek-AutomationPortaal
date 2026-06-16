import { describe, expect, it } from "vitest";
import { getProcessJourneyReviewPresentation } from "@/lib/processJourneyReviewPresentation";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";
import type { Automatisering, Flow } from "@/lib/types";

function automation(overrides: Partial<Automatisering>): Automatisering {
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

function suggestion(overrides: Partial<FlowSuggestie>): FlowSuggestie {
  return {
    fromId: "from",
    toId: "to",
    fromNaam: "From",
    toNaam: "To",
    fromCategorie: "HubSpot Workflow",
    toCategorie: "Backend Script",
    fromSource: "hubspot",
    toSource: "gitlab",
    fromStatus: "Actief",
    toStatus: "Actief",
    zekerheid: "webhook",
    redenering: "Webhook-match: POST /operations/hubspot/create_new_deal",
    confirmed: false,
    rejected: false,
    ...overrides,
  };
}

describe("process journey review presentation", () => {
  it("builds a queue and selected review detail for a linear webhook candidate", () => {
    const automations = [
      automation({
        id: "hs-create",
        naam: "Create new deal",
        source: "hubspot",
        categorie: "HubSpot Workflow",
        hubspotWorkflow: {
          name: "Create new deal",
          triggers: [{ label: "Deal is actief", source: "HubSpot" }],
          actions: [
            {
              index: 1,
              type: "WEBHOOK",
              label: "Send webhook",
              webhookMethod: "POST",
              webhookPath: "/operations/hubspot/create_new_deal",
            },
          ],
        },
      }),
      automation({
        id: "gl-create",
        naam: "New create deal (POST /operations/hubspot/create_new_deal)",
        source: "gitlab",
        categorie: "Backend Script",
        gitlabEndpoint: {
          method: "POST",
          endpoint: "/operations/hubspot/create_new_deal",
          handler: "new_create_deal",
          calls: [],
        },
      }),
    ];

    const presentation = getProcessJourneyReviewPresentation({
      automations,
      suggestions: [
        suggestion({
          fromId: "hs-create",
          toId: "gl-create",
          fromNaam: "Create new deal",
          toNaam: "New create deal (POST /operations/hubspot/create_new_deal)",
        }),
      ],
      reviewItems: [],
    });

    expect(presentation.queueRows).toHaveLength(1);
    expect(presentation.selectedJourney?.title).toContain("Create new deal");
    expect(presentation.selectedJourney?.nodes).toHaveLength(2);
    expect(presentation.selectedJourney?.edges).toMatchObject([
      {
        fromId: "hs-create",
        toId: "gl-create",
        evidenceLabel: "100% webhook-match",
        normalizedPath: "/operations/hubspot/create_new_deal",
      },
    ]);
    expect(presentation.selectedJourney?.stopReasons[0].description).toContain("Geen verdere harde technische overdracht");
  });

  it("keeps branching and parallel starters visible without inventing extra evidence", () => {
    const presentation = getProcessJourneyReviewPresentation({
      automations: [
        automation({ id: "zap-rotterdam", naam: "Trustoo Leads - Rotterdam", source: "zapier", categorie: "Zapier" }),
        automation({ id: "zap-utrecht", naam: "Trustoo Leads - Utrecht", source: "zapier", categorie: "Zapier" }),
        automation({
          id: "gl-trustoo",
          naam: "Leads trustoo (POST /sales/leads/hubspot/trustoo)",
          source: "gitlab",
          categorie: "Backend Script",
        }),
        automation({ id: "gl-followup", naam: "Trustoo follow-up", source: "gitlab", categorie: "Backend Script" }),
      ],
      suggestions: [
        suggestion({
          fromId: "zap-rotterdam",
          toId: "gl-trustoo",
          fromNaam: "Trustoo Leads - Rotterdam",
          toNaam: "Leads trustoo (POST /sales/leads/hubspot/trustoo)",
          fromSource: "zapier",
          redenering: "Webhook-match: POST /sales/leads/hubspot/trustoo",
        }),
        suggestion({
          fromId: "zap-utrecht",
          toId: "gl-trustoo",
          fromNaam: "Trustoo Leads - Utrecht",
          toNaam: "Leads trustoo (POST /sales/leads/hubspot/trustoo)",
          fromSource: "zapier",
          redenering: "Webhook-match: POST /sales/leads/hubspot/trustoo",
        }),
        suggestion({
          fromId: "gl-trustoo",
          toId: "gl-followup",
          fromNaam: "Leads trustoo (POST /sales/leads/hubspot/trustoo)",
          toNaam: "Trustoo follow-up",
          fromSource: "gitlab",
          toSource: "gitlab",
          redenering: "Webhook-match: POST /sales/leads/followup",
        }),
      ],
      reviewItems: [],
    });

    expect(presentation.selectedJourney?.structureLabel).toBe("Parallelle start");
    expect(presentation.selectedJourney?.edges).toHaveLength(3);
    expect(presentation.selectedJourney?.nodes.map((node) => node.name)).toContain("Trustoo Leads - Rotterdam");
    expect(presentation.selectedJourney?.nodes.map((node) => node.name)).toContain("Trustoo Leads - Utrecht");
  });

  it("includes open source-quality findings and sanitizes prompt data", () => {
    const automations = [
      automation({
        id: "hs-secret",
        naam: "Webhook with secret",
        source: "hubspot",
        categorie: "HubSpot Workflow",
        importProposal: {
          private_app_token: "super-secret",
          webhookPaths: ["/secret/path"],
        },
        sourceFindings: [
          {
            id: "finding-1",
            automationId: "hs-secret",
            source: "hubspot",
            externalId: "1",
            type: "source_data_incomplete",
            severity: "warning",
            message: "Webhook action mist body mapping",
            dedupeKey: "hs-secret:source_data_incomplete",
            firstSeenAt: "2026-05-29T00:00:00.000Z",
            lastSeenAt: "2026-05-29T00:00:00.000Z",
            resolvedAt: null,
            resolvedReason: null,
          },
        ],
      }),
      automation({ id: "gl-secret", naam: "Secret receiver", source: "gitlab", categorie: "Backend Script" }),
    ];

    const presentation = getProcessJourneyReviewPresentation({
      automations,
      suggestions: [
        suggestion({
          fromId: "hs-secret",
          toId: "gl-secret",
          fromNaam: "Webhook with secret",
          toNaam: "Secret receiver",
          redenering: "Webhook-match: POST /secret/path",
        }),
      ],
      reviewItems: [],
    });

    expect(presentation.selectedJourney?.sourceQualityWarnings).toMatchObject([
      { automationId: "hs-secret", message: "Webhook action mist body mapping" },
    ]);
    expect(presentation.selectedJourney?.prompt).toContain("[REDACTED]");
    expect(presentation.selectedJourney?.prompt).not.toContain("super-secret");
    expect(presentation.selectedJourney?.markdown).toContain("## Bewijs");
  });

  it("shows only open concept journeys and excludes already approved flows", () => {
    const automations = [
      automation({ id: "hs-concept", naam: "Concept HubSpot", source: "hubspot", systemen: ["HubSpot"] }),
      automation({
        id: "gl-concept",
        naam: "Concept endpoint (POST /concept)",
        source: "gitlab",
        systemen: ["GitLab"],
        gitlabEndpoint: { method: "POST", endpoint: "/concept", handler: "concept" },
      }),
      automation({ id: "hs-approved", naam: "Approved HubSpot", source: "hubspot", systemen: ["HubSpot"], webhookPaths: ["/approved"] }),
      automation({
        id: "gl-approved",
        naam: "Approved endpoint (POST /approved)",
        source: "gitlab",
        systemen: ["GitLab"],
        gitlabEndpoint: { method: "POST", endpoint: "/approved", handler: "approved" },
      }),
    ];
    const flows: Flow[] = [
      {
        id: "flow-approved",
        naam: "Bestaande procesreis",
        beschrijving: "Huidige beschrijving.",
        systemen: ["HubSpot", "GitLab"],
        automationIds: ["hs-approved", "gl-approved"],
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
    ];

    const presentation = getProcessJourneyReviewPresentation({
      automations,
      flows,
      confirmedLinks: [{ sourceId: "hs-approved", targetId: "gl-approved", matchType: "webhook" }],
      suggestions: [
        suggestion({
          fromId: "hs-concept",
          toId: "gl-concept",
          fromNaam: "Concept HubSpot",
          toNaam: "Concept endpoint (POST /concept)",
          redenering: "Webhook-match: POST /concept",
        }),
      ],
      reviewItems: [],
      selectedJourneyId: "flow:flow-approved",
    });

    expect(presentation.queueRows.map((row) => row.kind)).toEqual(["concept"]);
    expect(presentation.queueRows[0]).toMatchObject({
      title: expect.stringContaining("Concept HubSpot"),
      statusLabel: "Nog te doen",
    });
    expect(presentation.selectedJourney?.kind).toBe("concept");
  });

  it("does not show duplicate already approved flow rows in the review queue", () => {
    const automations = [
      automation({ id: "hs-approved", naam: "Approved HubSpot", source: "hubspot", webhookPaths: ["/approved"] }),
      automation({
        id: "gl-approved",
        naam: "Approved endpoint (POST /approved)",
        source: "gitlab",
        gitlabEndpoint: { method: "POST", endpoint: "/approved", handler: "approved" },
      }),
    ];
    const flows: Flow[] = [
      {
        id: "flow-newest",
        naam: "Bestaande procesreis",
        beschrijving: "Nieuwste duplicate.",
        systemen: ["HubSpot", "GitLab"],
        automationIds: ["hs-approved", "gl-approved"],
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
      {
        id: "flow-older",
        naam: "Bestaande procesreis kopie",
        beschrijving: "Oudere duplicate.",
        systemen: ["HubSpot", "GitLab"],
        automationIds: ["hs-approved", "gl-approved"],
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
    ];

    const presentation = getProcessJourneyReviewPresentation({
      automations,
      flows,
      confirmedLinks: [{ sourceId: "hs-approved", targetId: "gl-approved", matchType: "webhook" }],
      suggestions: [],
      reviewItems: [],
    });

    expect(presentation.queueRows).toEqual([]);
    expect(presentation.selectedJourney).toBeNull();
  });

  it("excludes confirmed concept suggestions from the review queue", () => {
    const presentation = getProcessJourneyReviewPresentation({
      automations: [
        automation({ id: "typeform", naam: "Typeform Webhook Verwerking", source: "typeform" }),
        automation({ id: "gitlab", naam: "Approved endpoint", source: "gitlab" }),
      ],
      suggestions: [
        suggestion({
          fromId: "typeform",
          toId: "gitlab",
          fromNaam: "Typeform Webhook Verwerking",
          toNaam: "Approved endpoint",
          fromSource: "typeform",
          redenering: "Webhook-match: POST /typeform/webhook",
          confirmed: true,
        }),
      ],
      reviewItems: [],
    });

    expect(presentation.queueRows).toEqual([]);
    expect(presentation.selectedJourney).toBeNull();
  });
});
