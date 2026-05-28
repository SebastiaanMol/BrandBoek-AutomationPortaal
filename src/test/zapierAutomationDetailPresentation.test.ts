import { describe, expect, it } from "vitest";
import { getZapierAutomationDetailPresentation } from "@/lib/zapierAutomationDetailPresentation";
import type { Automatisering, Pipeline } from "@/lib/types";

describe("Zapier automation detail presentation", () => {
  it("summarizes a Zap with HubSpot trigger, delay, filter and update", () => {
    const automation = makeZapierAutomation();
    const presentation = getZapierAutomationDetailPresentation(automation, {
      allAutomations: [makeAfwachtingToChaseAutomation(), automation, makeAlertChaseMailAutomation()],
    });

    expect(presentation.summary).toContain("wacht Zapier 4 dagen");
    expect(presentation.summary).toContain("controleert Zapier of dealstage gelijk is aan Chase (112417868)");
    expect(presentation.summary).toContain("werkt daarna de HubSpot deal bij");
    expect(presentation.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Status", value: "Disabled" }),
      expect.objectContaining({ label: "Stappen", value: "5", detail: "trigger, delay, lookup, filter, actie" }),
      expect.objectContaining({ label: "Delay", value: "4 dagen" }),
      expect.objectContaining({ label: "Laatst gewijzigd", value: "27 apr 2026" }),
    ]));
    expect(presentation.headerMeta).toEqual([
      "Zap ID 235361233",
      "Created 12 apr 2024",
      "Last updated 27 apr 2026",
      "Timezone Europe/Amsterdam",
    ]);
    expect(presentation.openInZapierUrl).toBe("https://zapier.com/app/editor/235361233");
    expect(presentation.stepCards.map((step) => step.title)).toEqual([
      "Start wanneer HubSpot dealstage verandert",
      "Wacht 4 dagen",
      "Haalt de HubSpot deal opnieuw op",
      "Controleert of de deal nog aan de voorwaarde voldoet",
      "Werkt de HubSpot deal bij",
    ]);
    expect(presentation.stepCards).toHaveLength(5);
    expect(presentation.stepCards[3].filter).toMatchObject({
      condition: "dealstage gelijk is aan Chase (112417868)",
      yesLabel: "Verder",
      noLabel: "Stop",
    });
    expect(presentation.stepCards[4].summary).toContain("Alert chase! (34210945)");
    expect(presentation.stepCards[0].technicalDetail).toContain("node 235361233");
    expect(presentation.fieldUsages).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "dealId", role: "lookup input", value: "{{235361233__dealId}}" }),
      expect.objectContaining({ field: "dealstage", role: "condition", value: "Chase (112417868)" }),
      expect.objectContaining({ field: "dealstage", role: "write", value: "Alert chase! (34210945)" }),
    ]));
    expect(presentation.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Stage labels ontbreken" }),
    ]));
    expect(presentation.evidenceBadges).toEqual(expect.arrayContaining([
      "HubSpot trigger",
      "Delay",
      "Filter check",
      "HubSpot action",
      "Zapier export",
    ]));
  });

  it("uses synced HubSpot pipeline labels before Zapier chain inference", () => {
    const presentation = getZapierAutomationDetailPresentation(makeZapierAutomation(), {
      pipelines: [makePipeline()],
    });

    expect(presentation.stepCards[3].filter?.condition).toBe("dealstage gelijk is aan Chase uit HubSpot (112417868)");
    expect(presentation.fieldUsages).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "pipeline", role: "trigger", value: "Klantenbestand" }),
      expect.objectContaining({ field: "dealstage", role: "condition", value: "Chase uit HubSpot (112417868)" }),
      expect.objectContaining({ field: "dealstage", role: "write", value: "Alert chase uit HubSpot (34210945)" }),
    ]));
  });

  it("falls back safely when a Zap has no delay step", () => {
    const presentation = getZapierAutomationDetailPresentation(makeZapierAutomation({
      importProposal: {
        source: "zapier",
        read_only: true,
        zap: {
          id: "zap-no-delay",
          title: "Simple Zap",
          status: "Actief",
          process: {
            trigger: "Zapier ontvangt een formulier.",
            outcome: "Zapier maakt een taak aan.",
            conditions: [],
            emails: [],
            webhookHandoffs: [],
            dataLookups: [],
            steps: [
              makeStep({ index: 1, appName: "Typeform", title: "New Entry", kind: "trigger", summary: "Zapier ontvangt een formulier." }),
              makeStep({ index: 2, appName: "Asana", title: "Create Task", kind: "action", summary: "Zapier maakt een taak aan." }),
            ],
          },
        },
        zapier_export: {
          read_only: true,
          node_count: 2,
          sanitized_nodes: {
            "1": { id: 1, action: "new_entry", selected_api: "TypeformCLIAPI", paused: false },
            "2": { id: 2, action: "create_task", selected_api: "AsanaCLIAPI", paused: false },
          },
        },
      },
    }));

    expect(presentation.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Delay", value: "Geen delay" }),
    ]));
    expect(presentation.summary).toContain("Typeform een nieuw formulier ontvangt");
    expect(presentation.summary).toContain("Maakt daarna een taak aan");
    expect(presentation.summary).not.toContain("wacht Zapier");
  });

  it("turns disabled status and missing source context into issues", () => {
    const presentation = getZapierAutomationDetailPresentation(makeZapierAutomation({
      sourceFindings: [
        {
          id: "finding-zap",
          automationId: "AUTO-ZAP",
          source: "zapier",
          type: "source_missing",
          severity: "critical",
          message: "Zap niet meer gevonden in Zapier.",
          firstSeenAt: "2026-05-20T00:00:00.000Z",
          lastSeenAt: "2026-05-21T00:00:00.000Z",
        },
      ],
    }));

    expect(presentation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: "gap", title: "Zap staat disabled" }),
      expect.objectContaining({ severity: "gap", title: "Stage labels ontbreken" }),
      expect.objectContaining({ severity: "gap", title: "Live Zapier API niet beschikbaar" }),
      expect.objectContaining({ severity: "critical", title: "Zap niet meer gevonden in Zapier." }),
    ]));
  });

  it("maps root node paused false to enabled even when child nodes are paused", () => {
    const presentation = getZapierAutomationDetailPresentation(makeZapierAutomation({
      status: "Actief",
      importProposal: {
        source: "zapier",
        read_only: true,
        zap: {
          id: "235361233",
          title: "Enabled Zap",
          status: "Uitgeschakeld",
          process: {
            trigger: "HubSpot dealstage wordt aangepast.",
            outcome: "HubSpot dealstage wordt bijgewerkt.",
            conditions: [],
            emails: [],
            webhookHandoffs: [],
            dataLookups: [],
            steps: [
              makeStep({ index: 1, appName: "HubSpot", title: "Updated Deal Stage", kind: "trigger", summary: "HubSpot dealstage wordt aangepast." }),
            ],
          },
        },
        zapier_export: {
          read_only: true,
          node_count: 1,
          sanitized_nodes: {
            "235361233": {
              id: 235361233,
              action: "updated_deal_stage",
              paused: false,
              parent_id: null,
              root_id: null,
              selected_api: "HubSpotCLIAPI@1.14.0",
            },
            "235361234": {
              id: 235361234,
              action: "get_deal_by_id",
              paused: true,
              parent_id: 235361233,
              root_id: 235361233,
              selected_api: "HubSpotCLIAPI@1.14.0",
            },
          },
        },
      },
    }));

    expect(presentation.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Status", value: "Enabled" }),
    ]));
    expect(presentation.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Zap staat disabled" }),
    ]));
  });

  it("keeps minimal Zapier automations useful without crashing", () => {
    const presentation = getZapierAutomationDetailPresentation(makeZapierAutomation({
      naam: "Minimale Zap",
      externalId: "",
      importProposal: {
        source: "zapier",
        read_only: true,
      },
    }));

    expect(presentation.summary).toContain("Deze Zap doorloopt de bekende Zapier-stappen");
    expect(presentation.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Status", value: "Onbekend" }),
      expect.objectContaining({ label: "Stappen", value: "0" }),
    ]));
    expect(presentation.stepCards).toEqual([]);
    expect(presentation.openInZapierUrl).toBeNull();
  });
});

function makeZapierAutomation(input: Partial<Automatisering> = {}): Automatisering {
  return {
    id: "AUTO-ZAP",
    naam: "Deal stage update na 4 dagen: Chase -> Alert chase!",
    categorie: "Zapier Zap",
    doel: "Zet een deal na vier dagen door als de stage nog gelijk is.",
    trigger: "Zapier trigger: HubSpot-dealfase activeert deze Zap.",
    systemen: ["Zapier", "HubSpot"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Uitgeschakeld",
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: ["Sales"],
    createdAt: "2026-05-22T08:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    source: "zapier",
    externalId: "235361233",
    importProposal: {
      source: "zapier",
      read_only: true,
      zap: {
        id: "235361233",
        title: "Deal stage update na 4 dagen: Chase -> Alert chase!",
        status: "Uitgeschakeld",
        process: {
          trigger: "HubSpot dealstage wordt aangepast.",
          outcome: "HubSpot dealstage wordt bijgewerkt.",
          conditions: ["dealstage blijft 112417868"],
          emails: [],
          webhookHandoffs: [],
          dataLookups: ["HubSpot deal ophalen"],
          steps: [
            makeStep({ index: 1, appName: "HubSpot", title: "Updated Deal Stage", kind: "trigger", summary: "HubSpot dealstage wordt aangepast." }),
            makeStep({ index: 2, appName: "Delay by Zapier", title: "Delay For", kind: "delay", summary: "Zapier wacht 4 dagen." }),
            makeStep({ index: 3, appName: "HubSpot", title: "Get Deal by ID", kind: "lookup", summary: "Zapier haalt de deal opnieuw op." }),
            makeStep({ index: 4, appName: "Filter by Zapier", title: "Only continue if", kind: "condition", summary: "Zapier controleert of de dealstage nog klopt." }),
            makeStep({ index: 5, appName: "HubSpot", title: "Update CRM Deal", kind: "action", summary: "Zapier werkt de HubSpot deal bij." }),
          ],
        },
      },
      zapier_export: {
        read_only: true,
        node_count: 5,
        sanitized_nodes: {
          "235361233": {
            id: 235361233,
            meta: { timezone: "Europe/Amsterdam" },
            title: "Deal stage update na 4 dagen: Chase -> Alert chase!",
            action: "updated_deal_stage",
            params: { pipeline: "5941173", dealstage: "112417868" },
            paused: true,
            created_at: "2024-04-12T13:22:50+00:00",
            last_changed: "2026-04-27T08:35:30+00:00",
            selected_api: "HubSpotCLIAPI@1.14.0",
            parent_id: null,
          },
          "235361234": {
            id: 235361234,
            action: "get_deal_by_id",
            params: { id: "{{235361233__dealId}}", properties_to_retrieve: ["dealstage"] },
            paused: true,
            selected_api: "HubSpotCLIAPI@1.14.0",
            parent_id: 235361236,
          },
          "235361236": {
            id: 235361236,
            action: "delay_for",
            params: { delay_for_unit: "days", delay_for_value: "4" },
            paused: true,
            selected_api: "DelayCLIAPI@1.1.1",
            parent_id: 235361233,
          },
          "235361237": {
            id: 235361237,
            action: "filter",
            params: {
              filter_criteria: [{ key: "235361234__dealstage", match: "iexact", value: "112417868", action: "continue" }],
            },
            paused: true,
            selected_api: "FilterAPI",
            parent_id: 235361234,
          },
          "235361238": {
            id: 235361238,
            action: "update_crm_deal",
            params: { id: "{{235361234__id}}", pipeline: "5941173", dealstage: "34210945" },
            paused: true,
            selected_api: "HubSpotCLIAPI@1.14.0",
            parent_id: 235361237,
          },
        },
      },
    },
    ...input,
  } as Automatisering;
}

function makeAfwachtingToChaseAutomation(): Automatisering {
  return makeZapierAutomation({
    id: "AUTO-ZAP-AFWACHTING",
    naam: "Deal stage update na 4 dagen: Afwachting -> Chase",
    externalId: "235354907",
    importProposal: {
      source: "zapier",
      read_only: true,
      zap: {
        id: "235354907",
        title: "Deal stage update na 4 dagen: Afwachting -> Chase",
        status: "Uitgeschakeld",
        process: {
          trigger: "HubSpot dealstage wordt aangepast.",
          outcome: "HubSpot dealstage wordt bijgewerkt.",
          conditions: [],
          emails: [],
          webhookHandoffs: [],
          dataLookups: [],
          steps: [],
        },
      },
      zapier_export: {
        read_only: true,
        node_count: 2,
        sanitized_nodes: {
          "235354907": {
            id: 235354907,
            action: "updated_deal_stage",
            params: { pipeline: "5941173", dealstage: "5941262" },
            selected_api: "HubSpotCLIAPI@1.14.0",
            parent_id: null,
          },
          "235355539": {
            id: 235355539,
            action: "update_crm_deal",
            params: { id: "{{235354907__dealId}}", pipeline: "5941173", dealstage: "112417868" },
            selected_api: "HubSpotCLIAPI@1.14.0",
            parent_id: 235354907,
          },
        },
      },
    },
  });
}

function makeAlertChaseMailAutomation(): Automatisering {
  return makeZapierAutomation({
    id: "AUTO-ZAP-ALERT-MAIL",
    naam: "Alert Chase! mail naar Joost",
    externalId: "244360792",
    importProposal: {
      source: "zapier",
      read_only: true,
      zapier_export: {
        read_only: true,
        node_count: 1,
        sanitized_nodes: {
          "244360792": {
            id: 244360792,
            action: "updated_deal_stage",
            params: { pipeline: "5941173", dealstage: "34210945" },
            selected_api: "HubSpotCLIAPI@1.14.0",
            parent_id: null,
          },
        },
      },
    },
  });
}

function makePipeline(): Pipeline {
  return {
    pipelineId: "5941173",
    naam: "Klantenbestand",
    syncedAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z",
    beschrijving: null,
    isActive: true,
    source: "hubspot",
    stages: [
      { stage_id: "112417868", label: "Chase uit HubSpot", display_order: 1, metadata: {} },
      { stage_id: "34210945", label: "Alert chase uit HubSpot", display_order: 2, metadata: {} },
    ],
  };
}

function makeStep(input: {
  index: number;
  appName: string;
  title: string;
  kind: string;
  summary: string;
}) {
  return {
    type: input.kind,
    details: [],
    webhookPaths: [],
    ...input,
  };
}
