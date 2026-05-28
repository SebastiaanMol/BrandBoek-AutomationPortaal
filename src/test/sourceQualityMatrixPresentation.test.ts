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
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-28T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  } as Automatisering;
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
          steps: [
            {
              index: 1,
              appName: "Gmail",
              title: "Send email",
              type: "action",
              kind: "action",
              summary: "",
              details: [],
              webhookPaths: [],
            },
          ],
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
        webhooks: [
          { tag: "api", enabled: true, eventTypes: ["form_response"], path: "/typeform/webhook" },
        ],
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
