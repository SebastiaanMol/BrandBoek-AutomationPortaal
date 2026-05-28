import { describe, expect, it } from "vitest";
import { getHubSpotWorkflowSourceUrl } from "@/lib/hubspotSourceUrl";
import type { Automatisering } from "@/lib/types";

describe("getHubSpotWorkflowSourceUrl", () => {
  it("builds the HubSpot editor URL from hubspotWorkflow.workflowId", () => {
    const automation = makeAutomation({
      source: "hubspot",
      categorie: "HubSpot Workflow",
      externalId: "fallback-id",
      hubspotWorkflow: {
        workflowId: "57732512",
        name: "WhatsApp workflow",
        triggers: [],
        actions: [],
      },
    });

    expect(getHubSpotWorkflowSourceUrl(automation)).toBe(
      "https://app.hubspot.com/workflows/6108551/platform/flow/57732512/edit",
    );
  });

  it("falls back to externalId when hubspotWorkflow.workflowId is missing", () => {
    const automation = makeAutomation({
      source: "hubspot",
      categorie: "HubSpot Workflow",
      externalId: "1699666192",
    });

    expect(getHubSpotWorkflowSourceUrl(automation)).toBe(
      "https://app.hubspot.com/workflows/6108551/platform/flow/1699666192/edit",
    );
  });

  it("returns null for HubSpot automations without a workflow ID", () => {
    expect(getHubSpotWorkflowSourceUrl(makeAutomation({ source: "hubspot", categorie: "HubSpot Workflow" }))).toBeNull();
  });

  it("returns null for non-HubSpot automations", () => {
    const automation = makeAutomation({
      source: "typeform",
      categorie: "Typeform",
      externalId: "57732512",
    });

    expect(getHubSpotWorkflowSourceUrl(automation)).toBeNull();
  });
});

function makeAutomation(input: Partial<Automatisering>): Automatisering {
  return {
    id: "AUTO-TEST",
    naam: "Automation",
    categorie: "Anders",
    doel: "Verwerkt automation data.",
    trigger: "Startsignaal",
    systemen: ["HubSpot"],
    stappen: [],
    afhankelijkheden: "",
    owner: "Linda",
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
