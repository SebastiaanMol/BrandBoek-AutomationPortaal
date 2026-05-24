import { describe, expect, it } from "vitest";
import {
  buildProcessJourneyNarrative,
  formatHubSpotTriggerSentence,
  getHubSpotWorkflowBranchPaths,
  getHubSpotTriggerValueList,
  summarizeAutomationForProcessJourney,
} from "@/lib/processJourneyCopy";
import type { Automatisering, Pipeline } from "@/lib/types";

const baseAutomation: Automatisering = {
  id: "AUTO-HS-1",
  naam: "Workflow",
  categorie: "HubSpot Workflow",
  doel: "",
  trigger: "deal eigenschap",
  systemen: ["HubSpot"],
  stappen: [],
  afhankelijkheden: "",
  owner: "",
  status: "Actief",
  verbeterideeen: "",
  mermaidDiagram: "",
  koppelingen: [],
  fasen: [],
  createdAt: "",
  laatstGeverifieerd: null,
  geverifieerdDoor: "",
  source: "hubspot",
};

describe("processJourneyCopy", () => {
  it("resolves HubSpot dealstage ids to readable stage labels while preserving verifiable ids", () => {
    const pipelines: Pipeline[] = [
      {
        pipelineId: "pipe-btw",
        naam: "BTW - Q",
        stages: [
          { stage_id: "1162449030", label: "2 maanden geboekt (info nodig)", display_order: 1, metadata: {} },
          { stage_id: "1162621597", label: "2 maanden geboekt", display_order: 2, metadata: {} },
        ],
        syncedAt: "",
        updatedAt: "",
        beschrijving: null,
        isActive: true,
        source: "hubspot",
      },
    ];

    const sentence = formatHubSpotTriggerSentence(
      {
        ...baseAutomation,
        beschrijvingInSimpeleTaal: [
          "Stap 1: De automatisering start zodra de object-eigenschap 'dealstage' een van deze waarden is '1162449030, 1162621597'.",
        ],
      },
      { pipelines },
    );

    expect(sentence).toBe(
      "Start zodra de HubSpot-eigenschap 'dealstage' een van deze waarden is '2 maanden geboekt (info nodig) (BTW - Q, id 1162449030)', '2 maanden geboekt (BTW - Q, id 1162621597)'",
    );
  });

  it("resolves HubSpot Deal stage trigger wording from workflow canvas exports", () => {
    const pipelines: Pipeline[] = [
      {
        pipelineId: "pipe-btw",
        naam: "BTW - Q",
        stages: [
          { stage_id: "1162449030", label: "2 maanden geboekt (info nodig)", display_order: 1, metadata: {} },
          { stage_id: "1162621597", label: "2 maanden geboekt", display_order: 2, metadata: {} },
          { stage_id: "1162621598", label: "2 maanden geboekt (controle)", display_order: 3, metadata: {} },
        ],
        syncedAt: "",
        updatedAt: "",
        beschrijving: null,
        isActive: true,
        source: "hubspot",
      },
    ];

    const triggerValues = getHubSpotTriggerValueList(
      {
        ...baseAutomation,
        beschrijvingInSimpeleTaal: [
          "Start zodra Deal stage een van deze waarden is '1162449030, 1162621597, 1162621598'.",
        ],
      },
      { pipelines },
    );

    expect(triggerValues).toEqual({
      property: "dealstage",
      values: [
        "2 maanden geboekt (info nodig) (BTW - Q, id 1162449030)",
        "2 maanden geboekt (BTW - Q, id 1162621597)",
        "2 maanden geboekt (controle) (BTW - Q, id 1162621598)",
      ],
    });
  });

  it("returns multi-value trigger details for bullet rendering", () => {
    const triggerValues = getHubSpotTriggerValueList({
      ...baseAutomation,
      beschrijvingInSimpeleTaal: [
        "Stap 1: De automatisering start zodra de object-eigenschap 'dealstage' een van deze waarden is 'a, b, c'.",
      ],
    });

    expect(triggerValues).toEqual({
      property: "dealstage",
      values: ["a", "b", "c"],
    });
  });

  it("builds a human narrative for a BTW two-month process journey", () => {
    const hubspotAutomation: Automatisering = {
      ...baseAutomation,
      naam: "'BTW 2 maanden geboekt' instellen",
      beschrijvingInSimpeleTaal: [
        "Stap 1: De automatisering start zodra de object-eigenschap 'dealstage' een van deze waarden is '1162449030, 1162621597'.",
      ],
      webhookPaths: ["/properties/btw/update_next_quarter_prev2m"],
    };
    const gitlabAutomation: Automatisering = {
      ...baseAutomation,
      id: "AUTO-GL-1",
      naam: "Update next quarter prev2m (POST /properties/btw/update_next_quarter_prev2m)",
      source: "gitlab",
      systemen: ["GitLab", "HubSpot"],
      gitlabEndpoint: {
        endpoint: "/properties/btw/update_next_quarter_prev2m",
        method: "POST",
        handler: "update_next_quarter_prev2m",
        calls: [{ depth: 1, kind: "hubspot_repository_call", from: "worker", to: "repo::update_deal_properties", file: "repo.py" }],
      },
    };

    const narrative = buildProcessJourneyNarrative({
      automations: [hubspotAutomation, gitlabAutomation],
      endpoint: "/properties/btw/update_next_quarter_prev2m",
    });

    expect(narrative.opening).toContain("btw-administratie voor twee maanden");
    expect(narrative.triggerValues).toEqual(["1162449030", "1162621597"]);
    expect(narrative.hubspotStep).toContain("BTW 2 maanden geboekt instellen");
    expect(narrative.backendStep).toContain("welk volgend kwartaal bij het dossier hoort");
    expect(narrative.hubspotUpdate).toContain("HubSpot bijgewerkt");
    expect(narrative.downstream).toContain("pas gekoppeld wanneer duidelijk is");
    expect(narrative.chainSummary).toContain("volgende stap in het btw-proces");
  });

  it("builds a Zapier webhook narrative without treating Zapier as a HubSpot workflow", () => {
    const zapierAutomation: Automatisering = {
      ...baseAutomation,
      id: "AUTO-ZAP-1",
      naam: "Trustoo Leads - Rotterdam",
      categorie: "Zapier Zap",
      source: "zapier",
      systemen: ["Zapier", "Trustoo", "Webhooks by Zapier"],
      trigger: "Zapier trigger: Trustoo Leads - Rotterdam (Trustoo)",
      webhookPaths: ["/sales/leads/hubspot/trustoo"],
    };
    const gitlabAutomation: Automatisering = {
      ...baseAutomation,
      id: "AUTO-GL-TRUSTOO",
      naam: "Leads trustoo (POST /sales/leads/hubspot/trustoo)",
      source: "gitlab",
      systemen: ["GitLab", "HubSpot"],
      gitlabEndpoint: {
        endpoint: "/sales/leads/hubspot/trustoo",
        method: "POST",
        handler: "leads_trustoo",
        calls: [{ depth: 1, kind: "hubspot_repository_call", from: "worker", to: "repo::create_deal", file: "repo.py" }],
      },
    };

    const narrative = buildProcessJourneyNarrative({
      automations: [zapierAutomation, gitlabAutomation],
      endpoint: "/sales/leads/hubspot/trustoo",
    });

    expect(narrative.triggerIntro).toContain('Zapier automation "Trustoo Leads - Rotterdam"');
    expect(narrative.triggerIntro).not.toContain("HubSpot workflow");
    expect(narrative.hubspotStep).toContain("geeft Zapier de klant- of leadcontext door aan de backend");
    expect(narrative.hubspotStep).not.toContain("/sales/leads/hubspot/trustoo");
    expect(narrative.backendStep).toContain("gegevens uit Zapier");
    expect(narrative.chainSummary).toContain("Zapier activeert de backendverwerking");
  });

  it("keeps Zapier automation summaries functional and hides webhook paths", () => {
    const summary = summarizeAutomationForProcessJourney({
      ...baseAutomation,
      id: "AUTO-ZAP-TRUSTOO",
      naam: "Trustoo Leads - Rotterdam",
      source: "zapier",
      doel: "Deze Zap verwerkt een Trustoo-lead en geeft die door via /sales/leads/hubspot/trustoo.",
      webhookPaths: ["/sales/leads/hubspot/trustoo"],
      importProposal: {
        source: "zapier",
        read_only: true,
        zap: {
          process: {
            trigger: "Ontvangt een nieuwe lead vanuit Trustoo.",
            outcome: "",
            conditions: [],
            emails: [],
            dataLookups: [],
            webhookHandoffs: [],
            steps: [],
          },
        },
      },
    });

    expect(summary).toContain("Zapier start bij: Ontvangt een nieuwe lead vanuit Trustoo.");
    expect(summary).toContain("read-only");
    expect(summary).not.toContain("/sales/leads/hubspot/trustoo");
  });

  it("reconstructs HubSpot branch paths for the BTW two-month workflow", () => {
    const paths = getHubSpotWorkflowBranchPaths({
      ...baseAutomation,
      naam: "'BTW 2 maanden geboekt' instellen",
      beschrijvingInSimpeleTaal: [
        "Stap 1: De automatisering start zodra de object-eigenschap 'dealstage' een van deze waarden is '2 maanden geboekt (info nodig), 2 maanden geboekt, 2 maanden geboekt (controle)'.",
      ],
      branches: [
        { id: "b1", label: "2 maanden geboekt (controle)", toStepId: "" },
        { id: "b2", label: "2 maanden geboekt (info nodig)", toStepId: "" },
        { id: "b3", label: "2 maanden geboekt", toStepId: "" },
      ],
      webhookPaths: ["/properties/btw/update_next_quarter_prev2m"],
    });

    expect(paths).toHaveLength(3);
    expect(paths[0]).toMatchObject({
      label: "2 maanden geboekt (controle)",
      conditionLabel: "2 maanden geboekt (controle)",
      webhookPath: "/properties/btw/update_next_quarter_prev2m",
    });
    expect(paths[0].updates).toEqual([
      {
        property: "BTW 2 maanden geboekt huidig kwartaal",
        value: "2 maanden geboekt (controle)",
      },
    ]);
  });

  it("does not turn a single HubSpot value with pipeline metadata into fake branch paths", () => {
    const automation = {
      ...baseAutomation,
      naam: "Upsert WeFact client",
      beschrijvingInSimpeleTaal: [
        "Stap 1: De automatisering start zodra de object-eigenschap 'dealstage' een van deze waarden is 'WeFact klant aanmaken (Sales Pipeline, id 1284704094)'.",
      ],
      branches: [
        { id: "b1", label: "WeFact klant aanmaken (Sales Pipeline", toStepId: "" },
        { id: "b2", label: "id 1284704094)", toStepId: "" },
      ],
      webhookPaths: ["/wefact/hubspot/upsert_debtor"],
    };

    expect(getHubSpotTriggerValueList(automation)).toBeUndefined();
    expect(getHubSpotWorkflowBranchPaths(automation)).toEqual([]);
  });
});
