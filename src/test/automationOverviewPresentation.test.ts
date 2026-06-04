import { describe, expect, it } from "vitest";
import { getAutomationOverviewPresentation } from "@/lib/automationOverviewPresentation";
import type { Automatisering } from "@/lib/types";

function makeAutomation(overrides: Partial<Automatisering>): Automatisering {
  return {
    id: "AUTO-TEST",
    naam: "Test automation",
    categorie: "Anders",
    doel: "Houdt het proces actueel.",
    trigger: "Een gebeurtenis start de automation.",
    systemen: ["Anders"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-21T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  } as Automatisering;
}

describe("automation overview presentation", () => {
  it("summarizes HubSpot workflow triggers, actions, webhooks and usage", () => {
    const presentation = getAutomationOverviewPresentation(makeAutomation({
      source: "hubspot",
      categorie: "HubSpot Workflow",
      systemen: ["HubSpot"],
      trigger: "Deal stage is afspraak ingepland",
      doel: "Zet de deal klaar voor opvolging.",
      hubspotRunCount365d: 42,
      hubspotLastRunAt: "2026-05-20T12:00:00.000Z",
      webhookPaths: ["/sales/leads/hubspot/trustoo"],
      hubspotWorkflow: {
        name: "Deal opvolging",
        objectType: "deal",
        enrollmentType: "DEAL_BASED",
        shouldReEnroll: true,
        triggers: [{ label: "Deal stage is afspraak ingepland", source: "HubSpot" }],
        actions: [
          { index: 1, type: "SET_PROPERTY", label: "Update deal property" },
          { index: 2, type: "WEBHOOK", label: "Webhook", webhookPath: "/sales/leads/hubspot/trustoo" },
        ],
      },
    }));

    expect(presentation.triggerLabel).toBe("Deal stage is afspraak ingepland");
    expect(presentation.actionSummary).toBe("Deal opvolging geeft data door via POST webhook naar Backend endpoint.");
    expect(presentation.outcomeLabel).toBe("Backend endpoint: Uitvoering buiten HubSpot");
    expect(presentation.evidenceBadges.map((badge) => badge.label)).toEqual(
      expect.arrayContaining(["1 trigger", "2 acties", "1 webhook", "42 runs"]),
    );
  });

  it("uses the HubSpot detail dataflow for the expanded-row outcome", () => {
    const presentation = getAutomationOverviewPresentation(makeAutomation({
      source: "hubspot",
      categorie: "HubSpot Workflow",
      systemen: ["HubSpot"],
      doel: "HubSpot workflow-uitkomst niet gespecificeerd",
      hubspotWorkflow: {
        name: "Whatsapp",
        objectType: "contact",
        triggers: [{ label: "Contact is associated to: Any Meeting", source: "HubSpot" }],
        actions: [{ index: 1, type: "WEBHOOK", label: "Webhook", webhookPath: "/whatsapp/webhook" }],
      },
    }));

    expect(presentation.actionSummary).toBe("Whatsapp geeft data door via POST webhook naar Backend endpoint.");
    expect(presentation.outcomeLabel).toBe("Backend endpoint: Uitvoering buiten HubSpot");
  });

  it("keeps the real HubSpot webhook URL visible in the expanded-row action summary", () => {
    const presentation = getAutomationOverviewPresentation(makeAutomation({
      source: "hubspot",
      categorie: "HubSpot Workflow",
      systemen: ["HubSpot"],
      hubspotWorkflow: {
        name: "Create new deal",
        objectType: "deal",
        triggers: [{ label: "Activiteit Sales Deal Stage is Actief", source: "HubSpot" }],
        actions: [
          {
            index: 1,
            type: "WEBHOOK",
            label: "Webhook",
            webhookMethod: "POST",
            webhookPath: "/operations/hubspot/create_new_deal",
            webhookUrl: "https://composed-month-production.up.railway.app/operations/hubspot/create_new_deal",
          },
        ],
      },
    }));

    expect(presentation.actionSummary).toContain("https://composed-month-production.up.railway.app/operations/hubspot/create_new_deal");
    expect(presentation.evidenceBadges).toContainEqual(expect.objectContaining({
      label: "1 webhook",
      detail: "composed-month-production.up.railway.app",
    }));
  });

  it("summarizes Zapier steps, handoffs, lookups and conditions", () => {
    const presentation = getAutomationOverviewPresentation(makeAutomation({
      source: "zapier",
      categorie: "Zapier Zap",
      systemen: ["Zapier"],
      importProposal: {
        source: "zapier",
        zap: {
          title: "Trustoo leads",
          process: {
            trigger: "Nieuwe Trustoo lead ontvangen.",
            outcome: "Lead wordt doorgestuurd naar de backend.",
            conditions: ["Alleen zakelijke leads"],
            emails: [],
            webhookHandoffs: [{ method: "POST", path: "/sales/leads/hubspot/trustoo" }],
            dataLookups: ["Zoekt bestaande contactpersoon"],
            steps: [
              { index: 1, appName: "Trustoo", title: "Lead", type: "trigger", kind: "trigger", summary: "Nieuwe Trustoo lead ontvangen.", details: [], webhookPaths: [] },
              { index: 2, appName: "Filter", title: "Filter", type: "filter", kind: "condition", summary: "Controleert leadtype.", details: [], webhookPaths: [] },
              { index: 3, appName: "Webhooks by Zapier", title: "Webhook", type: "action", kind: "webhook", summary: "Stuurt naar backend.", details: [], webhookPaths: ["/sales/leads/hubspot/trustoo"] },
            ],
          },
        },
      },
    }));

    expect(presentation.triggerLabel).toBe("Nieuwe Trustoo lead ontvangen.");
    expect(presentation.actionSummary).toBe("Zapier doorloopt 3 stappen en geeft data door via een webhook.");
    expect(presentation.outcomeLabel).toBe("Lead wordt doorgestuurd naar de backend.");
    expect(presentation.evidenceBadges.map((badge) => badge.label)).toEqual(
      expect.arrayContaining(["3 stappen", "1 webhook", "1 conditie", "1 lookup"]),
    );
  });

  it("summarizes GitLab endpoints, handlers and HubSpot reads and writes", () => {
    const presentation = getAutomationOverviewPresentation(makeAutomation({
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab", "Backend"],
      externalId: "gitlab::POST /operations/hubspot/contact/updating_dealname",
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/operations/hubspot/contact/updating_dealname",
        api_file: "gitlabtest/app/API/operations.py",
        handler: "contact_change_endpoint",
        calls: [
          { depth: 1, kind: "call", from: "handler", to: "repository.hubspot.deals.get", file: "operations.py" },
          { depth: 1, kind: "call", from: "handler", to: "repository.hubspot.deals.update", file: "operations.py" },
        ],
      },
    }));

    expect(presentation.triggerLabel).toBe("POST /operations/hubspot/contact/updating_dealname");
    expect(presentation.actionSummary).toContain("Backend handler contact_change_endpoint verwerkt de request.");
    expect(presentation.outcomeLabel).toBe("Zet de uitkomst van de verwerking terug in HubSpot.");
    expect(presentation.evidenceBadges.map((badge) => badge.label)).toEqual(
      expect.arrayContaining(["Endpoint", "Handler", "1 read", "1 write"]),
    );
  });

  it("summarizes Typeform forms, questions, hidden fields and webhooks", () => {
    const presentation = getAutomationOverviewPresentation(makeAutomation({
      source: "typeform",
      categorie: "Typeform",
      systemen: ["Typeform"],
      importProposal: {
        source: "typeform",
        typeform: {
          form: {
            id: "tf-1",
            title: "IB intake",
            hidden_fields: ["portal_id", "contact_id"],
            fields: [
              { id: "q1", title: "Naam", type: "short_text" },
              { id: "q2", title: "E-mail", type: "email" },
            ],
          },
          webhooks: [{ tag: "default", enabled: true, eventTypes: ["form_response"], path: "/typeform/webhook" }],
          process: {
            trigger: "Formulier IB intake wordt ingevuld.",
            outcome: "Inzending wordt doorgestuurd voor verwerking.",
            webhookHandoffs: [{ method: "POST", path: "/typeform/webhook" }],
            steps: [],
          },
        },
      },
    }));

    expect(presentation.triggerLabel).toBe("Formulier IB intake wordt ingevuld.");
    expect(presentation.actionSummary).toBe("Typeform verzamelt 2 vragen en stuurt inzendingen door via een webhook.");
    expect(presentation.outcomeLabel).toBe("Inzending wordt doorgestuurd voor verwerking.");
    expect(presentation.evidenceBadges.map((badge) => badge.label)).toEqual(
      expect.arrayContaining(["2 vragen", "2 hidden fields", "1 actieve webhook"]),
    );
  });

  it("falls back safely when rich source data is missing", () => {
    const presentation = getAutomationOverviewPresentation(makeAutomation({
      source: "custom",
      trigger: "",
      doel: "",
      stappen: [],
    }));

    expect(presentation.triggerLabel).toBe("Startsignaal niet gespecificeerd");
    expect(presentation.actionSummary).toBe("Gebruikt de beschikbare automationgegevens om de processtap uit te voeren.");
    expect(presentation.outcomeLabel).toBe("Uitkomst niet gespecificeerd");
    expect(presentation.warning).toBe("Er is weinig brondata beschikbaar voor deze automation.");
  });
});
