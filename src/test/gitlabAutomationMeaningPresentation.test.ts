import { describe, expect, it } from "vitest";
import { getGitLabAutomationMeaningPresentation } from "@/lib/gitlabAutomationMeaningPresentation";
import type { Automatisering } from "@/lib/types";

describe("GitLab automation meaning presentation", () => {
  it("explains contact_change_endpoint with input, reads, dealname write, scheduled response and background work", () => {
    const presentation = getGitLabAutomationMeaningPresentation(makeContactChangeAutomation());

    expect(presentation.confidence).toBe("hoog");
    expect(presentation.summary).toContain("Wanneer de naam van een HubSpot-contact wijzigt");
    expect(presentation.summary).toContain("gekoppelde deals");
    expect(presentation.summary).toContain("dealnaam");
    expect(presentation.ontvangt).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "contact_id" }),
    ]));
    expect(presentation.haaltOp.map((fact) => `${fact.label} ${fact.description}`).join(" ")).toMatch(/gekoppelde deals/i);
    expect(presentation.haaltOp.map((fact) => `${fact.label} ${fact.description}`).join(" ")).toMatch(/firstname.*lastname|lastname.*firstname/i);
    expect(presentation.haaltOp.map((fact) => `${fact.label} ${fact.description}`).join(" ")).toMatch(/dealname/i);
    expect(presentation.berekent.map((fact) => fact.description).join(" ")).toContain("<pipeline>: <contact name> - <company name>");
    expect(presentation.pastAan).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "HubSpot deal property dealname",
        description: expect.stringMatching(/batch-updatet/i),
      }),
    ]));
    expect(presentation.stuurtTerug).toEqual(expect.arrayContaining([
      expect.objectContaining({ description: expect.stringMatching(/scheduled/i) }),
    ]));
    expect(presentation.backgroundWork).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "_contact_change_task" }),
    ]));
    expect(presentation.evidenceBadges).toEqual(expect.arrayContaining(["Codepad", "Curated evidence"]));
  });

  it("writes the automation summary as a plain Dutch business paragraph without technical internals", () => {
    const presentation = getGitLabAutomationMeaningPresentation(makeContactChangeAutomation());

    expect(presentation.summary).toMatch(/Wanneer .* haalt .* bepaalt .* schrijft .* terug naar HubSpot/i);
    expect(presentation.summary).toContain("gebeurt op de achtergrond");
    expect(presentation.summary).not.toMatch(/\n|batch-update|scheduled response|achtergrondtaak|endpoint|property|contact_change_endpoint|POST|API|function|handler/i);
  });

  it("detects a direct HubSpot write without inventing extra reads", () => {
    const presentation = getGitLabAutomationMeaningPresentation(makeAutomation({
      id: "AUTO-GL-WRITE",
      naam: "Update year",
      externalId: "app/API/properties.py::POST /properties/update_year",
      gitlabFilePath: "app/API/properties.py",
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/properties/update_year",
        api_file: "app/API/properties.py",
        handler: "update_year",
        calls: [
          {
            depth: 0,
            kind: "hubspot_repository_call",
            from: "app.API.properties::update_year",
            to: "app.repository.hubspot::update_deal_properties",
            file: "app/repository/hubspot.py",
          },
        ],
      },
    }));

    expect(presentation.pastAan.map((fact) => `${fact.label} ${fact.description}`).join(" ")).toMatch(/year|update deal properties/i);
    expect(presentation.summary).toContain("schrijft");
    expect(presentation.summary).not.toMatch(/endpoint|property|POST|API|update_deal_properties/i);
    expect(presentation.confidence).not.toBe("laag");
  });

  it("does not invent a write for read-only endpoints", () => {
    const presentation = getGitLabAutomationMeaningPresentation(makeAutomation({
      id: "AUTO-GL-READ",
      naam: "Get company deals",
      externalId: "app/API/operations.py::POST /operations/get_company_deals",
      gitlabFilePath: "app/API/operations.py",
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/operations/get_company_deals",
        api_file: "app/API/operations.py",
        handler: "get_company_deals",
        calls: [
          {
            depth: 0,
            kind: "hubspot_repository_call",
            from: "app.API.operations::get_company_deals",
            to: "app.repository.hubspot::get_deals_for_company",
            file: "app/repository/hubspot.py",
          },
        ],
      },
    }));

    expect(presentation.haaltOp.length).toBeGreaterThan(0);
    expect(presentation.pastAan).toHaveLength(0);
    expect(presentation.gaps).toEqual(expect.arrayContaining([expect.stringMatching(/Geen concrete write/i)]));
  });

  it("keeps low-confidence automations honest with gaps", () => {
    const presentation = getGitLabAutomationMeaningPresentation(makeAutomation({
      id: "AUTO-GL-MINIMAL",
      naam: "Legacy backend thing",
      externalId: "app/service/legacy.py",
      gitlabFilePath: "app/service/legacy.py",
      gitlabEndpoint: undefined,
      importProposal: undefined,
      stappen: [],
    }));

    expect(presentation.confidence).toBe("laag");
    expect(presentation.gaps).toEqual(expect.arrayContaining([
      expect.stringMatching(/Inputvelden/i),
      expect.stringMatching(/Concrete read/i),
      expect.stringMatching(/Concrete write/i),
    ]));
  });
});

function makeContactChangeAutomation(): Automatisering {
  return makeAutomation({
    id: "AUTO-120",
    naam: "Contact change endpoint",
    doel: "Werkt dealnamen bij wanneer de naam van een contact wijzigt.",
    trigger: "POST /operations/hubspot/contact/updating_dealname",
    externalId: "app/API/operations.py::POST /operations/hubspot/contact/updating_dealname",
    gitlabFilePath: "app/API/operations.py",
    endpoints: ["/operations/hubspot/contact/updating_dealname"],
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/operations/hubspot/contact/updating_dealname",
      api_file: "app/API/operations.py",
      handler: "contact_change_endpoint",
      calls: [
        {
          depth: 0,
          kind: "background_task",
          from: "app.API.operations::contact_change_endpoint",
          to: "app.API.operations::_contact_change_task",
          file: "app/API/operations.py",
        },
        {
          depth: 1,
          kind: "await_call",
          from: "app.API.operations::_contact_change_task",
          to: "app.service.operations.deal_updates::contact_change",
          file: "app/service/operations/deal_updates.py",
        },
        {
          depth: 2,
          kind: "hubspot_repository_call",
          from: "app.service.operations.deal_updates::contact_change",
          to: "app.repository.hubspot::get_deals_for_contact",
          file: "app/repository/hubspot.py",
        },
        {
          depth: 2,
          kind: "hubspot_repository_call",
          from: "app.service.operations.deal_updates::contact_change",
          to: "app.repository.hubspot::get_contact_info",
          file: "app/repository/hubspot.py",
        },
        {
          depth: 3,
          kind: "hubspot_repository_call",
          from: "app.service.operations.deal_updates::_update_deal_names",
          to: "app.repository.hubspot::batch_update_deals",
          file: "app/repository/hubspot.py",
        },
      ],
    },
  });
}

function makeAutomation(input: Partial<Automatisering>): Automatisering {
  return {
    id: "AUTO-TEST",
    naam: "Automation",
    categorie: "Backend Script",
    doel: "Verwerkt automation data.",
    trigger: "Startsignaal",
    systemen: ["GitLab", "HubSpot"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: ["Sales"],
    createdAt: "2026-05-22T08:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    source: "gitlab",
    ...input,
  } as Automatisering;
}
