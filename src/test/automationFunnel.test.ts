import { describe, expect, it } from "vitest";
import { buildAutomationFunnel } from "@/lib/automationFunnel";
import type { Automatisering } from "@/lib/types";

const baseAutomation: Automatisering = {
  id: "AUTO-GL-1",
  naam: "Update year",
  categorie: "Backend Script",
  doel: "Berekent en schrijft het jaar terug naar HubSpot.",
  trigger: "HubSpot workflow roept de backend endpoint aan.",
  systemen: ["GitLab", "HubSpot", "Backend"],
  stappen: ["Ontvangt de request.", "Berekent het juiste jaar.", "Update de deal in HubSpot."],
  afhankelijkheden: "",
  owner: "",
  status: "Actief",
  verbeterideeen: "",
  mermaidDiagram: "",
  koppelingen: [],
  fasen: ["Boekhouding"],
  createdAt: "2026-05-07T00:00:00.000Z",
  laatstGeverifieerd: null,
  geverifieerdDoor: "",
  externalId: "gitlabtest/app/API/properties.py::POST /properties/update_year",
  source: "gitlab",
  gitlabFilePath: "gitlabtest/app/API/properties.py",
  gitlabEndpoint: {
    method: "POST",
    endpoint: "/properties/update_year",
    api_file: "gitlabtest/app/API/properties.py",
    handler: "update_year",
    calls: [
      {
        depth: 0,
        kind: "hubspot_repository_call",
        from: "app.API.properties::update_year",
        to: "app.repository.hubspot::update_deal_properties",
        file: "gitlabtest/app/repository/hubspot.py",
      },
    ],
  },
};

describe("automation funnel", () => {
  it("turns a GitLab endpoint automation into an operational funnel", () => {
    const funnel = buildAutomationFunnel(baseAutomation);

    expect(funnel?.isEndpointAutomation).toBe(true);
    expect(funnel?.endpoint).toBe("/properties/update_year");
    expect(funnel?.handler).toBe("update_year");
    expect(funnel?.hubspotWrites).toContain("Wijzigt dealgegevens in HubSpot.");
    expect(funnel?.steps.map((step) => step.kind)).toEqual([
      "start",
      "read",
      "compute",
      "write",
      "downstream",
    ]);
  });

  it("keeps SDK and internal call details out of the business funnel", () => {
    const funnel = buildAutomationFunnel({
      ...baseAutomation,
      stappen: [
        "Voert een asynchrone vervolgstap uit: Add lead to hubspot.",
        "Voert vervolgstap uit: Client.crm.associations.v4.basic_api.get_page",
        "Voert vervolgstap uit: HubSpotAPIError",
      ],
    });

    const visibleText = funnel?.steps.flatMap((step) => [step.summary, ...step.details]).join(" ");

    expect(visibleText).toContain("Verwerkt de binnengekomen lead");
    expect(visibleText).not.toContain("Client.crm");
    expect(visibleText).not.toContain("HubSpotAPIError");
  });

  it("recognizes generated hubspot_calls create helpers as HubSpot output", () => {
    const funnel = buildAutomationFunnel({
      ...baseAutomation,
      naam: "New create deal",
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/operations/hubspot/create_new_deal",
        api_file: "gitlabtest/app/API/operations.py",
        handler: "new_create_deal",
        calls: [
          {
            depth: 2,
            kind: "hubspot_client_call",
            from: "app.service.operations.deal_creation::create_new_deal",
            to: "hubspot_calls.batch_create_deals_sync",
            file: "gitlabtest/app/service/operations/deal_creation.py",
          },
        ],
      },
    });

    expect(funnel?.hubspotWrites).toContain("Maakt of koppelt dealrecords aan in HubSpot.");
    expect(funnel?.narrative).not.toContain("geen duidelijke HubSpot-write");
    expect(funnel?.narrative).not.toContain("nieuwe status terug");
    expect(funnel?.narrative).toContain("maakt of koppelt het systeem de benodigde records in HubSpot");
    expect(funnel?.steps.find((step) => step.kind === "write")?.summary).toBe(
      "Maakt of koppelt records in HubSpot op basis van de verwerking.",
    );
  });

  it("recognizes create-new-deal endpoint output even when call graph is incomplete", () => {
    const funnel = buildAutomationFunnel({
      ...baseAutomation,
      naam: "New create deal",
      externalId: "gitlab::POST /operations/hubspot/create_new_deal",
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/operations/hubspot/create_new_deal",
        api_file: "gitlabtest/app/API/operations.py",
        handler: "new_create_deal",
      },
    });

    expect(funnel?.hubspotWrites).toEqual(["Maakt of koppelt dealrecords aan in HubSpot."]);
    expect(funnel?.narrative).not.toContain("geen duidelijke HubSpot-write");
    expect(funnel?.narrative).not.toContain("nieuwe status terug");
  });

  it("does not render a funnel for non-GitLab automations", () => {
    expect(buildAutomationFunnel({ ...baseAutomation, source: "hubspot", gitlabFilePath: undefined })).toBeNull();
  });
});
