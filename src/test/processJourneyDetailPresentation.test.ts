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

  it("follows the full webhook path beyond the stored starting automation", () => {
    const automations = [
      makeTypeformAutomation("tf"),
      makeGitLabAutomation("gl-1", {
        naam: "Intake backend",
        gitlabEndpoint: {
          method: "POST",
          endpoint: "/hooks/typeform",
          handler: "handle_typeform",
        },
        webhookPaths: ["/hooks/hubspot-workflow"],
      }),
      makeGitLabAutomation("gl-2", {
        naam: "HubSpot backend",
        gitlabEndpoint: {
          method: "POST",
          endpoint: "/hooks/hubspot-workflow",
          handler: "handle_hubspot",
        },
      }),
    ];

    const presentation = getProcessJourneyDetailPresentation({
      flow: makeFlow(["tf"]),
      automations,
      confirmedLinks: [],
      openSuggestions: [],
    });

    expect(presentation.nodes.map((node) => node.id)).toEqual(["tf", "gl-1", "gl-2"]);
    expect(presentation.transitions.map((transition) => [transition.fromId, transition.toId])).toEqual([
      ["tf", "gl-1"],
      ["gl-1", "gl-2"],
    ]);
    expect(presentation.analysisQuality).toBe("100% webhook");
  });

  it("labels multiple graph roots as startpoints instead of picking a chronological first item", () => {
    const automations = [
      makeTypeformAutomation("tf", "/shared/backend"),
      makeHubSpotAutomation("hs", "/shared/backend"),
      makeGitLabAutomation("gl", {
        gitlabEndpoint: {
          method: "POST",
          endpoint: "/shared/backend",
          handler: "handle_shared_backend",
        },
      }),
    ];

    const presentation = getProcessJourneyDetailPresentation({
      flow: makeFlow(["tf", "hs", "gl"]),
      automations,
      confirmedLinks: [],
      openSuggestions: [],
    });

    expect(presentation.meta).toContain("Startpunten: 2 (Typeform / HubSpot)");
    expect(presentation.meta).toContain("Eindpunt: GitLab");
    expect(presentation.statusBadges).toContain("2 webhook-overgangen");
    expect(presentation.statusBadges).not.toContain("2 100% webhook-overgangen");
    expect(presentation.storyParagraphs.join(" ")).toContain("meerdere bewezen startpunten");
    expect(presentation.storyParagraphs.join(" ")).not.toContain("De procesreis start bij");
  });

  it("does not put a stale saved description above the webhook-proven graph story", () => {
    const presentation = getProcessJourneyDetailPresentation({
      flow: {
        ...makeFlow(["tf", "gl"]),
        beschrijving: "Deze oude beschrijving zegt dat de procesreis eindigt bij de bewezen HubSpot-update.",
      },
      automations: [makeTypeformAutomation("tf"), makeGitLabAutomation("gl", {
        gitlabEndpoint: {
          method: "POST",
          endpoint: "/hooks/typeform",
          handler: "handle_typeform",
        },
      })],
      confirmedLinks: [],
      openSuggestions: [],
    });

    expect(presentation.meta).toContain("Eindpunt: GitLab");
    expect(presentation.storyParagraphs[0]).not.toContain("HubSpot-update");
    expect(presentation.storyParagraphs.join(" ")).toContain("De reis eindigt bij GitLab");
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

  it("enriches the journey with source details from the individual automation templates", () => {
    const presentation = getProcessJourneyDetailPresentation({
      flow: makeFlow(["tf", "zap", "hs", "gl"]),
      automations: [
        makeTypeformAutomation("tf"),
        makeZapierAutomation("zap"),
        makeHubSpotAutomation("hs"),
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

    const story = presentation.storyParagraphs.join(" ");
    const cardText = presentation.automationCards
      .flatMap((card) => [card.description, ...card.insights])
      .join(" ");
    const changeText = Object.values(presentation.changeSummary).flat().join(" ");

    expect(story).toContain("1 vraag uit Typeform");
    expect(story).toContain("2 Zapier-stappen");
    expect(cardText).toContain("Verborgen contextvelden: deal_id");
    expect(cardText).toContain("Zapier apps: Typeform, Webhooks by Zapier");
    expect(cardText).toContain("HubSpot voorwaarden: Deal voldoet aan de workflowcriteria");
    expect(changeText).toContain("Gekoppelde deals");
    expect(changeText).toContain("HubSpot dealveld dealname");
  });

  it("builds an execution timeline with detailed steps per automation and an explicit stop", () => {
    const presentation = getProcessJourneyDetailPresentation({
      flow: makeFlow(["hs-create", "gl-create"]),
      automations: [
        makeHubSpotAutomation("hs-create", "/operations/hubspot/create_new_deal"),
        makeGitLabAutomation("gl-create", {
          naam: "New create deal (POST /operations/hubspot/create_new_deal)",
          externalId: "app/API/operations.py::POST /operations/hubspot/create_new_deal",
          gitlabFilePath: "app/API/operations.py",
          gitlabEndpoint: {
            method: "POST",
            endpoint: "/operations/hubspot/create_new_deal",
            handler: "new_create_deal",
            calls: [
              {
                depth: 0,
                kind: "await_call",
                from: "app.API.operations::new_create_deal",
                to: "app.service.operations.deal_creation::create_new_deal",
                file: "app/service/operations/deal_creation.py",
              },
            ],
          },
        }),
      ],
      confirmedLinks: [],
      openSuggestions: [],
    });

    const titles = presentation.steps.map((step) => step.title);
    const descriptions = presentation.steps.map((step) => step.description).join(" ");

    expect(presentation.steps.filter((step) => step.automationId === "hs-create").length).toBeGreaterThan(1);
    expect(presentation.steps.filter((step) => step.automationId === "gl-create").length).toBeGreaterThanOrEqual(5);
    expect(titles).toEqual(expect.arrayContaining([
      "Ontvangt deal-ID",
      "Haalt gegevens op uit HubSpot",
      "Controleert voorwaarden",
      "Schrijft terug naar HubSpot",
      "Procesreis stopt hier",
    ]));
    expect(descriptions).toContain("Line items");
    expect(descriptions).toContain("Klanttype en pipelinekeuze");
    expect(descriptions).toContain("Nieuwe HubSpot vervolgdeals");
    expect(descriptions).toContain("Werkt het bedrag bij wanneer een bestaande vervolgdeal al bestaat maar het bedrag afwijkt");
    expect(presentation.automationCards.find((card) => card.id === "gl-create")?.stepCount).toBeGreaterThanOrEqual(5);
  });

  it("groups detailed GitLab reads, determinations and writes into one business step per action type", () => {
    const presentation = getProcessJourneyDetailPresentation({
      flow: makeFlow(["gl-rich"]),
      automations: [
        makeGitLabAutomation("gl-rich", {
          naam: "VPB ingediend -> VA VPB deal aanpassen",
          gitlabEndpoint: {
            method: "POST",
            endpoint: "/properties/vpb/finished_webhook",
            handler: "vpb_finished_webhook",
            calls: [],
          },
          importProposal: {
            gitlab_endpoint: {
              method: "POST",
              endpoint: "/properties/vpb/finished_webhook",
              handler: "vpb_finished_webhook",
              calls: [],
            },
            gitlab_meaning: {
              ontvangt: [
                { label: "deal-ID", description: "De webhook geeft het deal-ID mee." },
              ],
              haaltOp: [
                { label: "deal info", description: "Leest HubSpot-data op deal info. Gebruikte properties: year." },
                { label: "company id", description: "Leest de gekoppelde company id uit HubSpot." },
                { label: "gekoppelde VA VPB deal", description: "Haalt de gekoppelde VA VPB-deal op." },
              ],
              berekent: [
                { label: "dealstage 1178945698, 1090711431", description: "Controleert of dealstage een van 1178945698 of 1090711431 is." },
                { label: "pipeline VPB", description: "Controleert of de deal in de VPB-pipeline zit." },
              ],
              pastAan: [
                { label: "gekoppelde VA VPB-deal naar VPB ingediend", description: "Werkt de gekoppelde VA VPB-deal bij naar VPB ingediend." },
                { label: "/properties/vpb/finished_webhook", description: "Zet de vervolgroute /properties/vpb/finished_webhook klaar." },
              ],
            },
          },
        }),
      ],
      confirmedLinks: [],
      openSuggestions: [],
    });

    const gitlabSteps = presentation.steps.filter((step) => step.automationId === "gl-rich");
    const readSteps = gitlabSteps.filter((step) => step.kind === "read");
    const determineSteps = gitlabSteps.filter((step) => step.kind === "determine");
    const writeSteps = gitlabSteps.filter((step) => step.kind === "write");

    expect(readSteps).toHaveLength(1);
    expect(determineSteps).toHaveLength(1);
    expect(writeSteps).toHaveLength(1);
    expect(readSteps[0].title).toBe("Haalt gegevens op uit HubSpot");
    expect(readSteps[0].description).toContain("deal info");
    expect(readSteps[0].description).toContain("company id");
    expect(readSteps[0].description).toContain("gekoppelde VA VPB-deal");
    expect(readSteps[0].description).toContain("year");
    expect(determineSteps[0].title).toBe("Controleert voorwaarden");
    expect(determineSteps[0].description).toContain("dealstage");
    expect(determineSteps[0].description).toContain("1178945698");
    expect(determineSteps[0].description).toContain("1090711431");
    expect(determineSteps[0].description).toContain("VPB-pipeline");
    expect(writeSteps[0].title).toBe("Schrijft terug naar HubSpot");
    expect(writeSteps[0].description).toContain("gekoppelde VA VPB-deal");
    expect(writeSteps[0].description).toContain("VPB ingediend");
    expect(writeSteps[0].description).toContain("/properties/vpb/finished_webhook");
  });

  it("groups detailed HubSpot conditions and writes into one business step per action type", () => {
    const presentation = getProcessJourneyDetailPresentation({
      flow: makeFlow(["hs-vpb", "gl-vpb"]),
      automations: [
        makeAutomation({
          id: "hs-vpb",
          naam: "VPB ingediend -> VA VPB deal aanpassen",
          source: "hubspot",
          categorie: "HubSpot Workflow",
          systemen: ["HubSpot"],
          webhookPaths: ["/properties/vpb/finished_webhook"],
          hubspotWorkflow: {
            name: "VPB ingediend -> VA VPB deal aanpassen",
            triggers: [
              {
                label: "Deal stage een van deze waarden is '1178945698, 1090711431'",
                source: "HubSpot",
                property: "dealstage",
                operator: "IN",
                value: "1178945698, 1090711431",
              },
              {
                label: "dealstage IS ANY OF 1178945698, 1090711431",
                source: "HubSpot",
                property: "dealstage",
                operator: "IN",
                value: "1178945698, 1090711431",
              },
            ],
            actions: [
              {
                index: 1,
                type: "SET_PROPERTY",
                label: "Werk de gekoppelde VA VPB-deal bij naar 'VPB ingediend'",
                propertyName: "dealstage",
                propertyValue: "VPB ingediend",
              },
              {
                index: 2,
                type: "WEBHOOK",
                label: "Send a webhook",
                webhookPath: "/properties/vpb/finished_webhook",
                webhookMethod: "POST",
              },
            ],
          },
        }),
        makeGitLabAutomation("gl-vpb", {
          naam: "Vpb finished webhook (POST /properties/vpb/finished_webhook)",
          gitlabEndpoint: {
            method: "POST",
            endpoint: "/properties/vpb/finished_webhook",
            handler: "vpb_finished_webhook",
          },
        }),
      ],
      confirmedLinks: [],
      openSuggestions: [],
    });

    const hubspotSteps = presentation.steps.filter((step) => step.automationId === "hs-vpb");
    const determineSteps = hubspotSteps.filter((step) => step.kind === "determine");
    const writeSteps = hubspotSteps.filter((step) => step.kind === "write");
    const handoffSteps = hubspotSteps.filter((step) => step.kind === "handoff");
    const hubspotText = hubspotSteps.map((step) => `${step.title} ${step.description}`).join(" ");

    expect(determineSteps).toHaveLength(1);
    expect(writeSteps).toHaveLength(1);
    expect(handoffSteps).toHaveLength(1);
    expect(determineSteps[0].title).toBe("Controleert HubSpot voorwaarden");
    expect(determineSteps[0].description).toContain("dealstage");
    expect(determineSteps[0].description).toContain("1178945698");
    expect(determineSteps[0].description).toContain("1090711431");
    expect(writeSteps[0].title).toBe("Werkt HubSpot bij");
    expect(writeSteps[0].description).toContain("gekoppelde VA VPB-deal");
    expect(writeSteps[0].description).toContain("VPB ingediend");
    expect(handoffSteps[0].description).toContain("/properties/vpb/finished_webhook");
    expect(hubspotText).not.toContain("Bepaalt: Deal stage");
    expect(hubspotText).not.toContain("Schrijft terug: /properties/vpb/finished_webhook");
  });

  it("groups equivalent parallel Zapier starts in the execution timeline", () => {
    const presentation = getProcessJourneyDetailPresentation({
      flow: makeFlow(["zap-rotterdam", "zap-amsterdam", "zap-utrecht", "zap-tilburg", "gl-trustoo"]),
      automations: [
        makeZapierAutomation("zap-rotterdam", "Trustoo Leads - Rotterdam", "/sales/leads/hubspot/trustoo"),
        makeZapierAutomation("zap-amsterdam", "Trustoo Leads - Amsterdam", "/sales/leads/hubspot/trustoo"),
        makeZapierAutomation("zap-utrecht", "Trustoo Leads - Utrecht", "/sales/leads/hubspot/trustoo"),
        makeZapierAutomation("zap-tilburg", "Trustoo Leads - Tilburg", "/sales/leads/hubspot/trustoo"),
        makeGitLabAutomation("gl-trustoo", {
          naam: "Leads trustoo (POST /sales/leads/hubspot/trustoo)",
          gitlabEndpoint: {
            method: "POST",
            endpoint: "/sales/leads/hubspot/trustoo",
            handler: "leads_trustoo",
          },
        }),
      ],
      confirmedLinks: [],
      openSuggestions: [],
    });

    const timelineText = presentation.steps.map((step) => `${step.title} ${step.description}`).join(" ");
    const zapierInputSteps = presentation.steps.filter(
      (step) => step.sourceLabel === "Zapier" && step.kind === "start",
    );
    const groupedStart = zapierInputSteps[0];

    expect(zapierInputSteps).toHaveLength(1);
    expect(groupedStart.description).toContain("Trustoo Leads - Rotterdam, Amsterdam, Utrecht en Tilburg starten met een nieuwe lead vanuit Trustoo");
    expect(groupedStart.automationIds).toEqual(["zap-rotterdam", "zap-amsterdam", "zap-utrecht", "zap-tilburg"]);
    expect(timelineText.match(/Ontvangt een nieuwe lead vanuit Trustoo/g)).toHaveLength(1);
    expect(presentation.steps.filter((step) => step.sourceLabel === "Zapier" && step.kind === "handoff")).toHaveLength(1);
    expect(presentation.automationCards.find((card) => card.id === "zap-amsterdam")?.stepCount).toBeGreaterThan(0);
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

    expect(text).toContain("haalt deze automatisering de benodigde gegevens op uit HubSpot");
    expect(text).toContain("WeFact");
    expect(text).not.toMatch(/upsert_wefact_debtor_from_hubspot|request|endpoint|handler|\bupsert\b|\bvia get\b/i);
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

function makeTypeformAutomation(id: string, path = "/hooks/typeform"): Automatisering {
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
        webhooks: [{ tag: "zapier", enabled: true, eventTypes: ["form_response"], path }],
      },
    },
    webhookPaths: [path],
  });
}

function makeZapierAutomation(
  id: string,
  naam = "Inzending routeren",
  path = "/hooks/hubspot-workflow",
): Automatisering {
  return makeAutomation({
    id,
    naam,
    source: "zapier",
    categorie: "Zapier Zap",
    systemen: ["Zapier"],
    importProposal: {
      zap: {
        id: "zap-1",
        status: "enabled",
        process: {
          trigger: naam.includes("Trustoo") ? "Ontvangt een nieuwe lead vanuit Trustoo" : "Nieuwe Typeform inzending",
          outcome: naam.includes("Trustoo")
            ? `Geeft gegevens door aan de backend via ${path}`
            : "HubSpot workflow wordt gestart",
          conditions: ["Alleen aanvragen met deal_id gaan door"],
          emails: [],
          webhookHandoffs: [{ method: "POST", path }],
          dataLookups: ["Zoekt contact op"],
          steps: [
            {
              index: 1,
              appName: naam.includes("Trustoo") ? "Trustoo" : "Typeform",
              title: naam.includes("Trustoo") ? naam : "Nieuwe inzending",
              type: "trigger",
              kind: "trigger",
              summary: naam.includes("Trustoo")
                ? "Ontvangt een nieuwe lead vanuit Trustoo"
                : "Ontvangt de Typeform inzending",
              details: [],
              webhookPaths: [],
            },
            {
              index: 2,
              appName: "Webhooks by Zapier",
              title: "Doorsturen",
              type: "action",
              kind: "action",
              summary: naam.includes("Trustoo")
                ? `Geeft gegevens door aan de backend via ${path}`
                : "Stuurt de gegevens door",
              details: [],
              webhookPaths: [path],
            },
          ],
        },
      },
    },
  });
}

function makeHubSpotAutomation(id: string, path = "/backend/process-deal"): Automatisering {
  return makeAutomation({
    id,
    naam: "Workflow start backend",
    source: "hubspot",
    categorie: "HubSpot Workflow",
    systemen: ["HubSpot"],
    trigger: "Deal voldoet aan de workflowcriteria",
    webhookPaths: [path],
    hubspotWorkflow: {
      name: "Workflow start backend",
      triggers: [{ label: "Deal voldoet aan de workflowcriteria", source: "HubSpot" }],
      actions: [
        {
          index: 1,
          type: "WEBHOOK",
          label: "Webhook",
          webhookPath: path,
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
