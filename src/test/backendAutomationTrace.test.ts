import { describe, expect, it } from "vitest";
import { getBackendAutomationTrace } from "@/lib/backendAutomationTrace";
import type { Automatisering } from "@/lib/types";

const baseAutomation: Automatisering = {
  id: "AUTO-GL-create-new-deal",
  naam: "New create deal",
  categorie: "Backend Script",
  doel: "",
  trigger: "",
  systemen: ["GitLab", "HubSpot"],
  stappen: [],
  afhankelijkheden: "",
  owner: "",
  status: "Actief",
  verbeterideeen: "",
  mermaidDiagram: "",
  koppelingen: [],
  fasen: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  laatstGeverifieerd: null,
  geverifieerdDoor: "",
  source: "gitlab",
};

describe("getBackendAutomationTrace", () => {
  it("returns the full create_new_deal trace for the backend endpoint", () => {
    const trace = getBackendAutomationTrace({
      ...baseAutomation,
      externalId: "gitlab::POST /operations/hubspot/create_new_deal",
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/operations/hubspot/create_new_deal",
        api_file: "gitlabtest/app/API/operations.py",
        handler: "new_create_deal",
      },
    });

    expect(trace?.id).toBe("create_new_deal");
    expect(trace?.plainSteps.length).toBeGreaterThan(10);
    expect(trace?.technicalSteps.map((step) => step.code)).toContain("await create_new_deal(deal_id.deal_id)");
    expect(trace?.plainSteps.some((step) => step.technical?.some((item) => item.code === "await create_new_deal(deal_id.deal_id)"))).toBe(true);
    expect(trace?.decisions).toContain("Geen `company_id` betekent: proces stopt, want de backend weet niet bij welk bedrijf de vervolgdeal hoort.");
  });

  it("returns a generic trace for other GitLab endpoint automations", () => {
    const trace = getBackendAutomationTrace({
      ...baseAutomation,
      id: "AUTO-GL-other",
      naam: "Reset betaald niet",
      externalId: "gitlab::POST /operations/hubspot/reset_betaalt_niet",
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/operations/hubspot/reset_betaalt_niet",
        api_file: "gitlabtest/app/API/operations.py",
        handler: "reset_betaalt_niet",
        calls: [
          {
            depth: 0,
            kind: "hubspot_repository_call",
            from: "app.API.operations::reset_betaalt_niet",
            to: "app.repository.hubspot::get_deal_info",
            file: "gitlabtest/app/repository/hubspot.py",
          },
          {
            depth: 1,
            kind: "hubspot_repository_call",
            from: "app.API.operations::reset_betaalt_niet",
            to: "app.repository.hubspot::update_deal_properties",
            file: "gitlabtest/app/repository/hubspot.py",
          },
        ],
      },
    });

    expect(trace?.id).toBe("generic:AUTO-GL-other");
    expect(trace?.plainSteps.some((step) => step.title === "De backend leest actuele HubSpot-data")).toBe(true);
    expect(trace?.plainSteps.some((step) => step.title === "De backend schrijft terug naar HubSpot")).toBe(true);
    expect(trace?.technicalSteps.map((step) => step.code).join("\n")).toContain("update_deal_properties");
  });

  it("uses the WeFact worker semantics for the WeFact debtor endpoint", () => {
    const trace = getBackendAutomationTrace({
      ...baseAutomation,
      id: "AUTO-GL-wefact",
      naam: "Upsert wefact debtor from hubspot",
      externalId: "gitlab::POST /wefact/hubspot/upsert_debtor",
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/wefact/hubspot/upsert_debtor",
        api_file: "gitlabtest/app/API/wefact.py",
        handler: "upsert_wefact_debtor_from_hubspot",
      },
    });

    const plainText = trace?.plainSteps.map((step) => `${step.title}\n${step.description}`).join("\n") ?? "";
    const evidence = trace?.evidence.map((item) => item.value).join("\n") ?? "";

    expect(plainText).toContain("financial debtor administration");
    expect(evidence).toContain("WeFact debtor upsert worker");
    expect(plainText).not.toContain("time-tracking");
    expect(plainText).not.toContain("Clockify");
  });

  it("does not leak unrelated lead/sales runtime semantics into a weak generic endpoint match", () => {
    const trace = getBackendAutomationTrace({
      ...baseAutomation,
      id: "AUTO-GL-contact-change",
      naam: "Contact change endpoint",
      externalId: "gitlab::POST /operations/hubspot/contact/updating_dealname",
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/operations/hubspot/contact/updating_dealname",
        api_file: "gitlabtest/app/API/operations.py",
        handler: "contact_change_endpoint",
      },
    });

    const plainText = trace?.plainSteps.map((step) => `${step.title}\n${step.description}`).join("\n") ?? "";

    expect(plainText).not.toContain("lead becomes an owned Sales deal");
    expect(plainText).not.toContain("initial Sales pipeline fase");
    expect(plainText).toContain("De backend verwerkt deze stap");
  });

  it("groups generic traces by service/helper function when the call graph contains deeper calls", () => {
    const trace = getBackendAutomationTrace({
      ...baseAutomation,
      id: "AUTO-GL-service",
      naam: "Reset betaald niet",
      externalId: "gitlab::POST /operations/hubspot/reset_betaalt_niet",
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/operations/hubspot/reset_betaalt_niet",
        api_file: "gitlabtest/app/API/operations.py",
        handler: "reset_betaalt_niet",
        calls: [
          {
            depth: 0,
            kind: "async_call",
            from: "app.API.operations::reset_betaalt_niet",
            to: "app.service.operations.betaalt_niet::reset_all_from_betaalt_niet",
            file: "gitlabtest/app/service/operations/betaalt_niet.py",
          },
          {
            depth: 1,
            kind: "hubspot_repository_call",
            from: "app.service.operations.betaalt_niet::reset_all_from_betaalt_niet",
            to: "app.repository.hubspot::get_deal_info",
            file: "gitlabtest/app/repository/hubspot.py",
          },
          {
            depth: 1,
            kind: "hubspot_repository_call",
            from: "app.service.operations.betaalt_niet::reset_all_from_betaalt_niet",
            to: "app.repository.hubspot::update_deal_properties",
            file: "gitlabtest/app/repository/hubspot.py",
          },
        ],
      },
    });

    const titles = trace?.plainSteps.map((step) => step.title) ?? [];

    expect(titles).toContain("De handler geeft de verwerking door");
    expect(titles).toContain("reset all from betaalt niet leest HubSpot-data");
    expect(titles).toContain("reset all from betaalt niet schrijft terug naar HubSpot");
    expect(titles).toContain("reset all from betaalt niet doorloopt records");
    expect(titles).toContain("reset all from betaalt niet neemt codebeslissingen");
    expect(
      trace?.plainSteps.some((step) =>
        step.technical?.some((item) => item.code?.includes("if not previous_stage:")),
      ),
    ).toBe(true);
    expect(
      trace?.plainSteps.some((step) =>
        step.technical?.some((item) => item.code?.includes('{"dealstage": previous_stage}')),
      ),
    ).toBe(true);
  });

  it("does not return a trace for old GitLab file records without an endpoint", () => {
    const trace = getBackendAutomationTrace({
      ...baseAutomation,
      id: "AUTO-GL-file",
      naam: "Some helper file",
      externalId: "gitlabtest/app/service/helpers.py",
      gitlabFilePath: "gitlabtest/app/service/helpers.py",
    });

    expect(trace).toBeNull();
  });
});
