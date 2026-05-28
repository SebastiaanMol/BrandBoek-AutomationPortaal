import { describe, expect, it } from "vitest";
import {
  getProcessJourneyDetailPresentation,
  type ProcessJourneyConfirmedLink,
} from "@/lib/processJourneyDetailPresentation";
import type { Automatisering, Flow } from "@/lib/types";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";

describe("processJourneyDetailPresentation", () => {
  it("builds a source-aware chain only from exact webhook proof", () => {
    const automations = [
      makeHubSpotAutomation("hs"),
      makeGitLabAutomation("gl"),
    ];

    const presentation = getProcessJourneyDetailPresentation({
      flow: makeFlow(["hs", "gl"]),
      automations,
      confirmedLinks: [
        { sourceId: "hs", targetId: "gl" },
      ],
      openSuggestions: [],
    });

    expect(presentation.nodes.map((node) => node.sourceLabel)).toEqual([
      "HubSpot",
      "GitLab",
    ]);
    expect(presentation.transitions).toHaveLength(1);
    expect(presentation.transitions[0]).toMatchObject({
      label: "100% webhook-match",
      evidenceLabel: "100% webhook-match",
      score: 100,
    });
    expect(presentation.statusBadges[0]).toBe("Webhook-bewezen procesreis");
    expect(presentation.metrics.find((metric) => metric.label === "Automations")?.value).toBe("2");
  });

  it("does not create a sequential fallback when webhook proof is missing", () => {
    const presentation = getProcessJourneyDetailPresentation({
      flow: makeFlow(["hs", "gl"]),
      automations: [
        makeHubSpotAutomation("hs"),
        makeGitLabAutomation("gl", {
          gitlabEndpoint: {
            method: "POST",
            endpoint: "/different/backend-route",
            handler: "other_handler",
          },
        }),
      ],
      confirmedLinks: [],
      openSuggestions: [],
    });

    expect(presentation.transitions).toEqual([]);
    expect(presentation.evidenceItems[0]).toMatchObject({
      title: "Keten stopt zonder webhook-bewijs",
      tag: "Geen webhook-match",
    });
  });

  it("does not treat partial endpoint overlap as webhook proof", () => {
    const presentation = getProcessJourneyDetailPresentation({
      flow: makeFlow(["hs", "gl"]),
      automations: [
        makeHubSpotAutomation("hs"),
        makeGitLabAutomation("gl", {
          gitlabEndpoint: {
            method: "POST",
            endpoint: "/process-deal",
            handler: "process_deal",
          },
        }),
      ],
      confirmedLinks: [{ sourceId: "hs", targetId: "gl" }],
      openSuggestions: [],
    });

    expect(presentation.transitions).toEqual([]);
  });

  it("uses GitLab meaning data for the change summary without endpoint language", () => {
    const presentation = getProcessJourneyDetailPresentation({
      flow: makeFlow(["gl"]),
      automations: [
        makeGitLabAutomation("gl", {
          naam: "Contact change endpoint",
          gitlabEndpoint: {
            method: "POST",
            endpoint: "/contact/updating_dealname",
            handler: "contact_change_endpoint",
          },
        }),
      ],
      confirmedLinks: [],
      openSuggestions: [],
    });

    const readText = presentation.changeSummary.reads.join(" ");
    const writeText = presentation.changeSummary.writes.join(" ");

    expect(readText).toContain("Gekoppelde deals");
    expect(writeText).toContain("HubSpot dealveld dealname");
    expect(`${readText} ${writeText}`).not.toMatch(/\b(endpoint|handler|payload|API)\b/i);
  });

  it("keeps generic GitLab fallback text free of handler names and request language", () => {
    const presentation = getProcessJourneyDetailPresentation({
      flow: makeFlow(["gl"]),
      automations: [
        makeGitLabAutomation("gl", {
          gitlabEndpoint: {
            method: "POST",
            endpoint: "/wefact/hubspot/upsert_debtor",
            handler: "upsert_wefact_debtor_from_hubspot",
          },
        }),
      ],
      confirmedLinks: [],
      openSuggestions: [],
    });

    const text = [
      ...presentation.nodes.map((node) => node.description),
      ...presentation.steps.map((step) => step.description),
      ...presentation.storyParagraphs,
    ].join(" ");

    expect(text).toContain("verwerkt de gegevens");
    expect(text).not.toMatch(/upsert_wefact_debtor_from_hubspot|request|endpoint|handler/i);
  });

  it("shows open suggestions as gaps instead of confirmed transitions", () => {
    const openSuggestion: FlowSuggestie = {
      fromId: "gl",
      toId: "next",
      fromNaam: "Backend verwerking",
      toNaam: "Volgende workflow",
      fromCategorie: "Backend Script",
      toCategorie: "HubSpot Workflow",
      fromSource: "gitlab",
      toSource: "hubspot",
      zekerheid: "ai",
      redenering: "Mogelijke property-trigger, nog niet bevestigd.",
      confirmed: false,
      rejected: false,
    };

    const presentation = getProcessJourneyDetailPresentation({
      flow: makeFlow(["gl"]),
      automations: [makeGitLabAutomation("gl")],
      confirmedLinks: [],
      openSuggestions: [openSuggestion],
    });

    expect(presentation.gaps).toHaveLength(1);
    expect(presentation.gaps[0]).toMatchObject({
      title: "Volgende workflow",
      tag: "Open gap",
    });
    expect(presentation.transitions).toHaveLength(0);
  });

  it("returns safe fallbacks for a minimal flow", () => {
    const presentation = getProcessJourneyDetailPresentation({
      flow: makeFlow(["missing"]),
      automations: [],
      confirmedLinks: [],
      openSuggestions: [],
    });

    expect(presentation.title).toBe("Procesreis");
    expect(presentation.nodes).toEqual([]);
    expect(presentation.storyParagraphs.length).toBeGreaterThan(0);
  });
});

function makeFlow(automationIds: string[]): Flow {
  return {
    id: "flow-1",
    naam: "Procesreis",
    beschrijving: "",
    systemen: ["Typeform", "Zapier", "HubSpot", "GitLab"],
    automationIds,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-28T09:00:00.000Z",
  };
}

function makeAutomation(overrides: Partial<Automatisering>): Automatisering {
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
    createdAt: "2026-05-01T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  };
}

function makeTypeformAutomation(id: string): Automatisering {
  return makeAutomation({
    id,
    naam: "Aanvraagformulier",
    source: "typeform",
    categorie: "Typeform",
    systemen: ["Typeform"],
    importProposal: {
      typeform: {
        form: {
          id: "form-1",
          title: "Aanvraagformulier",
          hidden_fields: ["deal_id"],
          fields: [{ id: "field-1", title: "Wat wil je aanvragen?", type: "short_text" }],
        },
        webhooks: [{ tag: "zapier", enabled: true, eventTypes: ["form_response"], path: "/hooks/typeform" }],
      },
    },
    webhookPaths: ["/hooks/typeform"],
  });
}

function makeZapierAutomation(id: string): Automatisering {
  return makeAutomation({
    id,
    naam: "Inzending routeren",
    source: "zapier",
    categorie: "Zapier Zap",
    systemen: ["Zapier"],
    importProposal: {
      zap: {
        id: "zap-1",
        status: "enabled",
        process: {
          trigger: "Nieuwe Typeform inzending",
          outcome: "HubSpot workflow wordt gestart",
          conditions: ["Alleen aanvragen met deal_id gaan door"],
          emails: [],
          webhookHandoffs: [{ method: "POST", path: "/hooks/hubspot-workflow" }],
          dataLookups: ["Zoekt contact op"],
          steps: [
            {
              index: 1,
              appName: "Typeform",
              title: "Nieuwe inzending",
              type: "trigger",
              kind: "trigger",
              summary: "Ontvangt de Typeform inzending",
              details: [],
              webhookPaths: [],
            },
            {
              index: 2,
              appName: "Webhooks by Zapier",
              title: "Doorsturen",
              type: "action",
              kind: "action",
              summary: "Stuurt de gegevens door",
              details: [],
              webhookPaths: ["/hooks/hubspot-workflow"],
            },
          ],
        },
      },
    },
  });
}

function makeHubSpotAutomation(id: string): Automatisering {
  return makeAutomation({
    id,
    naam: "Workflow start backend",
    source: "hubspot",
    categorie: "HubSpot Workflow",
    systemen: ["HubSpot"],
    trigger: "Deal voldoet aan de workflowcriteria",
    webhookPaths: ["/backend/process-deal"],
    hubspotWorkflow: {
      name: "Workflow start backend",
      triggers: [{ label: "Deal voldoet aan de workflowcriteria", source: "HubSpot" }],
      actions: [
        {
          index: 1,
          type: "WEBHOOK",
          label: "Webhook",
          webhookPath: "/backend/process-deal",
        },
      ],
    },
  });
}

function makeGitLabAutomation(id: string, overrides: Partial<Automatisering> = {}): Automatisering {
  return makeAutomation({
    id,
    naam: "Backend verwerking",
    source: "gitlab",
    categorie: "Backend Script",
    systemen: ["GitLab", "HubSpot"],
    doel: "HubSpot deal wordt bijgewerkt",
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/backend/process-deal",
      handler: "process_deal",
    },
    ...overrides,
  });
}
