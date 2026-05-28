import { describe, expect, it } from "vitest";
import { getGitLabAutomationDetailPresentation, isGitLabAutomation } from "@/lib/gitlabAutomationDetailPresentation";
import type { Automatisering } from "@/lib/types";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";

describe("GitLab automation detail presentation", () => {
  it("builds a backend overview from endpoint, handler, calls and incoming webhook evidence", () => {
    const gitlabAutomation = makeGitLabAutomation();
    const upstream = makeAutomation({
      id: "AUTO-HS-UPSTREAM",
      naam: "HubSpot klant sync workflow",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      systemen: ["HubSpot"],
      webhookPaths: ["/clockify/hubspot/upsert_client"],
    });

    const presentation = getGitLabAutomationDetailPresentation(gitlabAutomation, {
      allAutomations: [gitlabAutomation, upstream],
      confirmedLinks: [{ sourceId: "AUTO-HS-UPSTREAM", targetId: "AUTO-GL-CLOCKIFY" }],
      flowSuggesties: [
        makeSuggestion({
          fromId: "AUTO-HS-UPSTREAM",
          toId: "AUTO-GL-CLOCKIFY",
          fromNaam: "HubSpot klant sync workflow",
          redenering: "Webhook-match: automation roept endpoint /clockify/hubspot/upsert_client aan.",
          confirmed: true,
        }),
      ],
    });

    expect(isGitLabAutomation(gitlabAutomation)).toBe(true);
    expect(presentation.headerMeta).toEqual(
      expect.arrayContaining([
        "Backend Script",
        "POST /clockify/hubspot/upsert_client",
        "app/API/clockify.py",
        "Handler upsert_client",
      ]),
    );
    expect(presentation.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Endpoint", value: "POST" }),
        expect.objectContaining({ label: "Handler", value: "upsert_client" }),
        expect.objectContaining({ label: "Call graph", value: "4 calls" }),
        expect.objectContaining({ label: "Koppelingen", value: "1 inkomend" }),
      ]),
    );
    expect(presentation.summary).toContain("Clockify");
    expect(presentation.summary).toContain("haalt");
    expect(presentation.summary).not.toMatch(/POST|endpoint|property|API|upsert_client/i);
    expect(presentation.meaning.confidence).not.toBe("laag");
    expect(presentation.meaning.evidenceBadges).toEqual(expect.arrayContaining([expect.stringMatching(/Analyse:/)]));
    expect(presentation.evidenceBadges).toEqual(expect.arrayContaining(["GitLab endpoint", "Call graph", "Webhook-match"]));
    expect(presentation.dataflow.map((node) => node.name)).toEqual([
      "HubSpot klant sync workflow",
      "GitLab endpoint",
      "upsert_client",
      "Clockify",
    ]);
    expect(presentation.executionSteps.map((step) => step.title)).toEqual(
      expect.arrayContaining([
        "De backend automation wordt gestart",
        "De API-handler ontvangt de request",
      ]),
    );
    expect(presentation.callGraph).toHaveLength(4);
    expect(presentation.linkedAutomations[0]).toMatchObject({
      id: "AUTO-HS-UPSTREAM",
      name: "HubSpot klant sync workflow",
      evidence: "Webhook-match",
    });
  });

  it("adds a rich meaning model for contact dealname updates", () => {
    const presentation = getGitLabAutomationDetailPresentation(makeGitLabAutomation({
      id: "AUTO-120",
      naam: "Contact change endpoint",
      doel: "Werkt dealnamen bij wanneer de naam van een contact wijzigt.",
      trigger: "POST /operations/hubspot/contact/updating_dealname",
      systemen: ["GitLab", "HubSpot"],
      externalId: "app/API/operations.py::POST /operations/hubspot/contact/updating_dealname",
      gitlabFilePath: "app/API/operations.py",
      endpoints: ["/operations/hubspot/contact/updating_dealname"],
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/operations/hubspot/contact/updating_dealname",
        api_file: "app/API/operations.py",
        handler: "contact_change_endpoint",
        calls: [
          { depth: 0, kind: "background_task", from: "app.API.operations::contact_change_endpoint", to: "app.API.operations::_contact_change_task", file: "app/API/operations.py" },
          { depth: 1, kind: "await_call", from: "app.API.operations::_contact_change_task", to: "app.service.operations.deal_updates::contact_change", file: "app/service/operations/deal_updates.py" },
          { depth: 2, kind: "hubspot_repository_call", from: "app.service.operations.deal_updates::contact_change", to: "app.repository.hubspot::get_deals_for_contact", file: "app/repository/hubspot.py" },
          { depth: 2, kind: "hubspot_repository_call", from: "app.service.operations.deal_updates::contact_change", to: "app.repository.hubspot::get_contact_info", file: "app/repository/hubspot.py" },
          { depth: 3, kind: "hubspot_repository_call", from: "app.service.operations.deal_updates::_update_deal_names", to: "app.repository.hubspot::batch_update_deals", file: "app/repository/hubspot.py" },
        ],
      },
    }));

    expect(presentation.summary).toContain("Wanneer de naam van een HubSpot-contact wijzigt");
    expect(presentation.summary).toContain("schrijft de nieuwe dealnaam terug naar HubSpot");
    expect(presentation.summary).not.toMatch(/contact_id|endpoint|property|POST|API|scheduled response|achtergrondtaak/i);
    expect(presentation.meaning.confidence).toBe("hoog");
    expect(presentation.meaning.ontvangt).toEqual(expect.arrayContaining([expect.objectContaining({ label: "contact_id" })]));
    expect(presentation.meaning.pastAan).toEqual(expect.arrayContaining([expect.objectContaining({ label: "HubSpot deal property dealname" })]));
    expect(presentation.issues).not.toEqual(expect.arrayContaining([expect.objectContaining({ title: "Concrete write ontbreekt" })]));
  });

  it("shows safe fallbacks for GitLab endpoint automations without calls", () => {
    const presentation = getGitLabAutomationDetailPresentation(makeGitLabAutomation({
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/operations/hubspot/workflows/pipeline_usage",
        api_file: "app/API/operations.py",
        handler: "pipeline_usage",
        calls: [],
      },
      stappen: [],
    }));

    expect(presentation.metrics).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Call graph", value: "0 calls" })]));
    expect(presentation.executionSteps.length).toBeGreaterThan(0);
    expect(presentation.issues).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Call graph beperkt" })]));
  });

  it("marks legacy GitLab file records without a specific endpoint", () => {
    const presentation = getGitLabAutomationDetailPresentation(makeGitLabAutomation({
      id: "AUTO-LEGACY-GITLAB",
      externalId: "app/service/clockify/clockify.py",
      gitlabFilePath: "app/service/clockify/clockify.py",
      endpoints: [],
      gitlabEndpoint: undefined,
      importProposal: undefined,
    }));

    expect(presentation.isLegacyFileRecord).toBe(true);
    expect(presentation.summary).toContain("Oude GitLab bestandsimport");
    expect(presentation.issues).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Geen specifiek endpoint" })]));
  });

  it("adds gaps for source findings and missing runtime metadata", () => {
    const presentation = getGitLabAutomationDetailPresentation(makeGitLabAutomation({
      owner: "",
      hubspotLastRunAt: null,
      sourceFindings: [
        {
          id: "finding-1",
          automationId: "AUTO-GL-CLOCKIFY",
          source: "gitlab",
          type: "source_changed",
          severity: "warning",
          message: "GitLab bestand gewijzigd sinds laatste review.",
          firstSeenAt: "2026-05-21T10:00:00.000Z",
          lastSeenAt: "2026-05-21T10:00:00.000Z",
        },
      ],
    }));

    expect(presentation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Geen owner bekend" }),
      expect.objectContaining({ title: "Runtime onbekend" }),
      expect.objectContaining({ title: "GitLab bestand gewijzigd sinds laatste review." }),
    ]));
  });
});

function makeGitLabAutomation(input: Partial<Automatisering> = {}): Automatisering {
  return makeAutomation({
    id: "AUTO-GL-CLOCKIFY",
    naam: "Upsert clockify client from hubspot",
    source: "gitlab",
    categorie: "Backend Script",
    doel: "Werkt een Clockify klant bij op basis van HubSpot bedrijfsgegevens.",
    trigger: "API endpoint POST /clockify/hubspot/upsert_client",
    systemen: ["GitLab", "HubSpot", "Clockify"],
    stappen: [
      "Het script ontvangt een POST-verzoek met HubSpot bedrijfsgegevens.",
      "Het valideert de API-sleutel voor authenticatie.",
      "Het probeert een Clockify-klant bij te werken of te creëren.",
    ],
    externalId: "app/API/clockify.py::POST /clockify/hubspot/upsert_client",
    gitlabFilePath: "app/API/clockify.py",
    gitlabLastCommit: "c2fdbd671d33f04f9b838892e4f6a22a9dc22ff1",
    lastSyncedAt: "2026-05-05T08:44:32.673Z",
    endpoints: ["/clockify/hubspot/upsert_client"],
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/clockify/hubspot/upsert_client",
      api_file: "app/API/clockify.py",
      handler: "upsert_client",
      calls: [
        { depth: 0, kind: "await_call", from: "app.API.clockify::upsert_client", to: "app.service.clockify::upsert_client", file: "app/service/clockify/clockify.py" },
        { depth: 1, kind: "hubspot_repository_call", from: "app.service.clockify::upsert_client", to: "app.repository.hubspot::get_company_info", file: "app/repository/hubspot.py" },
        { depth: 1, kind: "call", from: "app.service.clockify::upsert_client", to: "app.service.clockify::archive_project", file: "app/service/clockify/clockify.py" },
        { depth: 1, kind: "call", from: "app.service.clockify::upsert_client", to: "app.clockify_client::create_client", file: "app/clockify_client.py" },
      ],
    },
    importProposal: {
      source: "gitlab",
      read_only: true,
      gitlab_endpoint: {
        method: "POST",
        endpoint: "/clockify/hubspot/upsert_client",
        api_file: "app/API/clockify.py",
        handler: "upsert_client",
        calls: [],
      },
    },
    ...input,
  });
}

function makeAutomation(input: Partial<Automatisering>): Automatisering {
  return {
    id: "AUTO-TEST",
    naam: "Automation",
    categorie: "Anders",
    doel: "Verwerkt automation data.",
    trigger: "Startsignaal",
    systemen: ["GitLab"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: ["Sales"],
    createdAt: "2026-05-22T08:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...input,
  } as Automatisering;
}

function makeSuggestion(input: Partial<FlowSuggestie>): FlowSuggestie {
  return {
    fromId: "AUTO-HS-UPSTREAM",
    toId: "AUTO-GL-CLOCKIFY",
    fromNaam: "HubSpot klant sync workflow",
    toNaam: "Upsert clockify client from hubspot",
    fromCategorie: "HubSpot Workflow",
    toCategorie: "Backend Script",
    fromSource: "hubspot",
    toSource: "gitlab",
    zekerheid: "webhook",
    redenering: "Webhook-match",
    confirmed: true,
    rejected: false,
    ...input,
  };
}
