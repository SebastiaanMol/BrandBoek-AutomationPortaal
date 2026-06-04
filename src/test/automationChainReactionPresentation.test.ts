import { describe, expect, it } from "vitest";
import { getAutomationChainReactionPresentation } from "@/lib/automationChainReactionPresentation";
import type { Automatisering } from "@/lib/types";

describe("automation chain reaction presentation", () => {
  it("builds the Create new deal webhook chain and stops at the unproven HubSpot follow-up", () => {
    const createNewDeal = makeAutomation({
      id: "AUTO-HS-CREATE",
      naam: "Create new deal",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      systemen: ["HubSpot"],
      hubspotWorkflow: {
        name: "Create new deal",
        objectType: "deal",
        enrollmentType: "LIST_BASED",
        shouldReEnroll: true,
        triggers: [{ label: "Activiteit Sales Deal Stage is Actief", property: "activiteit", value: "Actief", source: "HubSpot" }],
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
      webhookPaths: ["/operations/hubspot/create_new_deal"],
    });
    const backend = makeAutomation({
      id: "AUTO-GL-CREATE",
      naam: "New create deal",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab", "HubSpot"],
      externalId: "gitlab::POST /operations/hubspot/create_new_deal",
      endpoints: ["/operations/hubspot/create_new_deal"],
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/operations/hubspot/create_new_deal",
        api_file: "gitlabtest/app/API/operations.py",
        handler: "new_create_deal",
      },
    });

    const presentation = getAutomationChainReactionPresentation({
      startAutomation: createNewDeal,
      automations: [createNewDeal, backend],
    });

    expect(presentation.nodes.map((node) => node.title)).toEqual(expect.arrayContaining([
      "Create new deal",
      "New create deal",
      "HubSpot vervolgdeals",
    ]));
    expect(presentation.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "100% webhook-match",
        evidence: "https://composed-month-production.up.railway.app/operations/hubspot/create_new_deal",
      }),
      expect.objectContaining({
        label: "bewijs stopt hier",
        fromId: "AUTO-GL-CREATE",
        toId: expect.stringContaining("write:AUTO-GL-CREATE"),
      }),
    ]));
    expect(presentation.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: "Hier stopt het bewijs",
        description: expect.stringMatching(/geen exacte volgende HubSpot workflow-trigger bewezen/i),
      }),
    ]));
  });

  it("creates a HubSpot write-to-trigger edge only for exact property and value matches", () => {
    const writer = makeAutomation({
      id: "AUTO-HS-WRITER",
      naam: "Zet deal klaar",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      systemen: ["HubSpot"],
      hubspotWorkflow: {
        name: "Zet deal klaar",
        objectType: "deal",
        triggers: [{ label: "Deal wordt aangemaakt", property: "pipeline", value: "sales", source: "HubSpot" }],
        actions: [{ index: 1, type: "SET_PROPERTY", label: "Set dealstage", propertyName: "dealstage", propertyValue: "ready" }],
      },
    });
    const nextWorkflow = makeAutomation({
      id: "AUTO-HS-NEXT",
      naam: "Vervolg bij ready",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      systemen: ["HubSpot"],
      hubspotWorkflow: {
        name: "Vervolg bij ready",
        objectType: "deal",
        triggers: [{ label: "Dealstage is ready", property: "dealstage", value: "ready", source: "HubSpot" }],
        actions: [],
      },
    });
    const mismatch = makeAutomation({
      id: "AUTO-HS-MISMATCH",
      naam: "Vervolg bij done",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      systemen: ["HubSpot"],
      hubspotWorkflow: {
        name: "Vervolg bij done",
        objectType: "deal",
        triggers: [{ label: "Dealstage is done", property: "dealstage", value: "done", source: "HubSpot" }],
        actions: [],
      },
    });

    const presentation = getAutomationChainReactionPresentation({
      startAutomation: writer,
      automations: [writer, nextWorkflow, mismatch],
    });

    expect(presentation.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "100% HubSpot write -> trigger",
        fromId: expect.stringContaining("write:AUTO-HS-WRITER"),
        toId: "AUTO-HS-NEXT",
      }),
    ]));
    expect(presentation.nodes.map((node) => node.id)).toContain("AUTO-HS-NEXT");
    expect(presentation.nodes.map((node) => node.id)).not.toContain("AUTO-HS-MISMATCH");
  });

  it("uses stored source step text as webhook evidence when normalized workflow actions are missing", () => {
    const createNewDeal = makeAutomation({
      id: "AUTO-HS-CREATE",
      naam: "Create new deal",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      systemen: ["HubSpot"],
      stappen: [
        "Webhook -> https://composed-month-production.up.railway.app/operations/hubspot/create_new_deal",
      ],
      hubspotWorkflow: {
        name: "Create new deal",
        objectType: "deal",
        triggers: [],
        actions: [],
      },
    });
    const backend = makeAutomation({
      id: "AUTO-GL-CREATE",
      naam: "New create deal",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab", "HubSpot"],
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/operations/hubspot/create_new_deal",
        api_file: "gitlabtest/app/API/operations.py",
        handler: "new_create_deal",
      },
    });

    const presentation = getAutomationChainReactionPresentation({
      startAutomation: createNewDeal,
      automations: [createNewDeal, backend],
    });

    expect(presentation.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "100% webhook-match",
        evidence: "https://composed-month-production.up.railway.app/operations/hubspot/create_new_deal",
      }),
    ]));
    expect(presentation.nodes.map((node) => node.title)).toContain("New create deal");
  });

  it("does not create a HubSpot follow-up edge when the written value is missing", () => {
    const writer = makeAutomation({
      id: "AUTO-HS-WRITER",
      naam: "Zet deal klaar",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      systemen: ["HubSpot"],
      hubspotWorkflow: {
        name: "Zet deal klaar",
        objectType: "deal",
        triggers: [],
        actions: [{ index: 1, type: "SET_PROPERTY", label: "Set dealstage", propertyName: "dealstage", propertyValue: null }],
      },
    });
    const nextWorkflow = makeAutomation({
      id: "AUTO-HS-NEXT",
      naam: "Vervolg bij ready",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      systemen: ["HubSpot"],
      hubspotWorkflow: {
        name: "Vervolg bij ready",
        objectType: "deal",
        triggers: [{ label: "Dealstage is ready", property: "dealstage", value: "ready", source: "HubSpot" }],
        actions: [],
      },
    });

    const presentation = getAutomationChainReactionPresentation({
      startAutomation: writer,
      automations: [writer, nextWorkflow],
    });

    expect(presentation.edges.some((edge) => edge.label === "100% HubSpot write -> trigger")).toBe(false);
    expect(presentation.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Hier stopt het bewijs" }),
    ]));
  });

  it("keeps unproven suggestions and percentages out of chain evidence", () => {
    const start = makeAutomation({
      id: "AUTO-HS-START",
      naam: "Start workflow",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      systemen: ["HubSpot"],
    });

    const presentation = getAutomationChainReactionPresentation({
      startAutomation: start,
      automations: [start],
    });

    expect(JSON.stringify(presentation)).not.toMatch(/waarschijnlijk|mogelijk|88%|95%|30%/i);
    expect(presentation.gaps[0]?.title).toBe("Hier stopt het bewijs");
  });
});

function makeAutomation(input: Partial<Automatisering>): Automatisering {
  return {
    id: "AUTO-TEST",
    naam: "Automation",
    categorie: "Anders",
    doel: "Verwerkt een automation.",
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
    createdAt: "2026-05-22T08:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...input,
  } as Automatisering;
}
