import { describe, expect, it } from "vitest";
import { getHubSpotAutomationDetailPresentation } from "@/lib/hubspotAutomationDetailPresentation";
import type { Automatisering } from "@/lib/types";

describe("HubSpot automation detail presentation", () => {
  it("summarizes a HubSpot workflow with a webhook action", () => {
    const presentation = getHubSpotAutomationDetailPresentation(makeAutomation({
      hubspotLastRunAt: "2026-05-25T10:30:00.000Z",
      hubspotRunCount365d: 42,
      hubspotWorkflow: {
        workflowId: "1699666192",
        name: "Create new deal",
        objectType: "Deal",
        shouldReEnroll: true,
        enrollmentType: "LIST_BASED",
        triggers: [
          { label: "activiteit is Actief", property: "activiteit", operator: "IS_ANY_OF", value: "Actief", source: "HubSpot" },
          { label: "pipeline is 5941173", property: "pipeline", operator: "IS_ANY_OF", value: "5941173", source: "HubSpot" },
        ],
        actions: [
          {
            index: 1,
            type: "WEBHOOK",
            label: "Webhook",
            webhookMethod: "POST",
            webhookUrl: "https://example.test/operations/hubspot/create_new_deal",
            webhookPath: "/operations/hubspot/create_new_deal",
          },
        ],
      },
    }));

    expect(presentation.summary).toBe("Maakt een nieuwe deal aan.");
    expect(presentation.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Workflow state", value: "Enabled" }),
      expect.objectContaining({ label: "Actions", value: "1" }),
      expect.objectContaining({ label: "Conditions", value: "2" }),
      expect.objectContaining({ label: "Runtime metrics", value: "42 runs" }),
    ]));
    expect(presentation.dataflow.map((node) => node.name)).toEqual([
      "HubSpot Deal",
      "Create new deal",
      "Backend endpoint",
    ]);
    expect(presentation.webhookActions[0]).toMatchObject({
      method: "POST",
      path: "/operations/hubspot/create_new_deal",
    });
    expect(presentation.conditions).toHaveLength(2);
    expect(presentation.evidenceBadges).toEqual(expect.arrayContaining(["HubSpot criteria", "Webhook action", "Re-enrollment", "Last run"]));
  });

  it("falls back to a HubSpot action dataflow when there is no webhook action", () => {
    const presentation = getHubSpotAutomationDetailPresentation(makeAutomation({
      hubspotWorkflow: {
        workflowId: "wf-no-webhook",
        name: "Set property",
        objectType: "Contact",
        shouldReEnroll: false,
        triggers: [{ label: "Email is known", property: "email", operator: "IS_KNOWN", source: "HubSpot" }],
        actions: [{ index: 1, type: "SET_PROPERTY", label: "Set lifecycle stage", propertyName: "lifecyclestage", propertyValue: "lead" }],
      },
    }));

    expect(presentation.dataflow.map((node) => node.name)).toEqual([
      "HubSpot Contact",
      "Set property",
      "HubSpot action",
    ]);
    expect(presentation.webhookActions).toHaveLength(0);
    expect(presentation.actionDetails[0].title).toBe("Set lifecycle stage");
  });

  it("shows unavailable runtime and field mapping states when source data is minimal", () => {
    const presentation = getHubSpotAutomationDetailPresentation(makeAutomation({
      hubspotWorkflow: undefined,
      trigger: "",
      doel: "",
    }));

    expect(presentation.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Runtime metrics", value: "Unavailable" }),
    ]));
    expect(presentation.fieldMappingAvailability.status).toBe("not_available");
    expect(presentation.conditions[0].title).toBe("Geen startvoorwaarden beschikbaar");
    expect(presentation.summary).toContain("Deze HubSpot-workflow");
  });

  it("turns source findings and webhook handoffs into issues", () => {
    const presentation = getHubSpotAutomationDetailPresentation(makeAutomation({
      sourceFindings: [
        {
          id: "finding-1",
          automationId: "AUTO-HS",
          source: "hubspot",
          type: "source_missing",
          severity: "critical",
          message: "Workflow niet meer gevonden.",
          firstSeenAt: "2026-05-20T00:00:00.000Z",
          lastSeenAt: "2026-05-21T00:00:00.000Z",
        },
      ],
      hubspotWorkflow: {
        name: "Webhook workflow",
        objectType: "Deal",
        triggers: [],
        actions: [{ index: 1, type: "WEBHOOK", label: "Webhook", webhookPath: "/endpoint", webhookMethod: "POST" }],
      },
    }));

    expect(presentation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: "critical", title: "Workflow niet meer gevonden." }),
      expect.objectContaining({ severity: "gap", title: "Backend effect is outside HubSpot" }),
      expect.objectContaining({ severity: "gap", title: "Field mappings ontbreken" }),
    ]));
  });

  it("formats raw HubSpot operator objects without leaking React objects into the view model", () => {
    const presentation = getHubSpotAutomationDetailPresentation(makeAutomation({
      hubspotWorkflow: {
        name: "Raw operator workflow",
        objectType: "Deal",
        triggers: [
          {
            label: "dealstage is known",
            property: "dealstage",
            operator: { operator: "IS_KNOWN", operationType: "ALL_PROPERTY", includeObjectsWithNoValueSet: false } as unknown as string,
            value: { operationType: "ALL_PROPERTY" } as unknown as string,
            source: "HubSpot",
          },
        ],
        actions: [],
      },
    }));

    expect(presentation.conditions[0].badge).toBe("IS_KNOWN");
    expect(presentation.properties[0]).toMatchObject({
      property: "dealstage",
      rule: "IS_KNOWN",
      value: "ALL_PROPERTY",
    });
  });

  it("ignores generic active-status AI descriptions for the main summary", () => {
    const presentation = getHubSpotAutomationDetailPresentation(makeAutomation({
      naam: "Whatsapp",
      aiDescription: "Deze automatisering heet 'Whatsapp' en is actief.",
      hubspotWorkflow: {
        name: "Whatsapp",
        objectType: "Contact",
        shouldReEnroll: true,
        triggers: [{ label: "Contact is associated to: Any Meeting", source: "HubSpot" }],
        actions: [{ index: 1, type: "WEBHOOK", label: "Webhook", webhookPath: "/", webhookMethod: "POST" }],
      },
    }));

    expect(presentation.summary).toContain("Deze HubSpot-workflow bewaakt contact-records");
    expect(presentation.summary).toContain("gekoppelde backend-verwerking");
    expect(presentation.summary).not.toContain("heet 'Whatsapp' en is actief");
  });

  it("shows HubSpot created and updated user audit metadata when available", () => {
    const presentation = getHubSpotAutomationDetailPresentation(makeAutomation({
      hubspotWorkflow: {
        workflowId: "1699666192",
        name: "Create new deal",
        objectType: "Deal",
        triggers: [],
        actions: [],
        createdAt: "2026-01-20T10:00:00.000Z",
        updatedAt: "2026-01-21T12:00:00.000Z",
        createdBy: { id: "101", label: "Linda" },
        updatedBy: { id: "202", label: "Sanne" },
      },
    }));

    expect(presentation.meta).toEqual(expect.arrayContaining([
      { label: "HubSpot created by", value: "Linda" },
      { label: "HubSpot updated by", value: "Sanne" },
      { label: "Created at", value: "20 jan 2026" },
      { label: "Updated at", value: "21 jan 2026" },
    ]));
  });

  it("groups created metadata before updated metadata in ownership meta", () => {
    const presentation = getHubSpotAutomationDetailPresentation(makeAutomation({
      hubspotWorkflow: {
        workflowId: "1699666192",
        name: "Create new deal",
        objectType: "Deal",
        triggers: [],
        actions: [],
        createdAt: "2026-01-20T10:00:00.000Z",
        updatedAt: "2026-01-21T12:00:00.000Z",
        createdBy: { id: "101", label: "Linda" },
        updatedBy: { id: "202", label: "Sanne" },
      },
    }));

    const labels = presentation.meta.map((item) => item.label);
    expect(labels.slice(3, 7)).toEqual([
      "HubSpot created by",
      "Created at",
      "HubSpot updated by",
      "Updated at",
    ]);
  });

  it("keeps HubSpot audit rows visible with clear API availability fallbacks", () => {
    const presentation = getHubSpotAutomationDetailPresentation(makeAutomation({
      owner: "",
      hubspotWorkflow: {
        workflowId: "1699666192",
        name: "Create new deal",
        objectType: "Deal",
        triggers: [],
        actions: [],
      },
    }));

    expect(presentation.meta).toEqual(expect.arrayContaining([
      { label: "Portal owner", value: "Niet toegewezen" },
      { label: "HubSpot created by", value: "Niet beschikbaar via HubSpot API" },
      { label: "HubSpot updated by", value: "Niet beschikbaar via HubSpot API" },
      { label: "Created at", value: "Niet beschikbaar via HubSpot API" },
      { label: "Updated at", value: "Niet beschikbaar via HubSpot API" },
    ]));
  });
});

function makeAutomation(input: Partial<Automatisering>): Automatisering {
  return {
    id: "AUTO-HS",
    naam: "Create new deal",
    categorie: "HubSpot Workflow",
    doel: "Maakt een nieuwe deal aan.",
    trigger: "Deal voldoet aan HubSpot voorwaarden.",
    systemen: ["HubSpot"],
    stappen: [],
    afhankelijkheden: "",
    owner: "Linda",
    status: "Actief",
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: ["Sales"],
    createdAt: "2026-05-20T00:00:00.000Z",
    laatstGeverifieerd: "2026-05-21T00:00:00.000Z",
    geverifieerdDoor: "Sebastiaan",
    source: "hubspot",
    ...input,
  } as Automatisering;
}
