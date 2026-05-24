import { describe, expect, it } from "vitest";
import {
  applyFlowDetailPresentationToRuntimeSteps,
  getFlowDetailPresentation,
  getPresentationAutomationLabel,
} from "@/lib/flowDetailPresentation";
import type { FlowRuntimeStep } from "@/lib/flowRuntimeChain";
import type { Automatisering, Flow } from "@/lib/types";

function makeFlow(overrides: Partial<Flow> = {}): Flow {
  return {
    id: "f8164cda-51b2-4f80-ae49-cf58a4c9eda8",
    naam: "WeFact debiteur bijwerken",
    beschrijving: "",
    systemen: ["HubSpot", "GitLab", "WeFact"],
    automationIds: ["hs", "gl"],
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function makeAutomation(overrides: Partial<Automatisering>): Automatisering {
  return {
    id: "auto",
    naam: "Automation",
    categorie: "Backend Script",
    doel: "",
    trigger: "",
    systemen: ["HubSpot"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    ...({ ["verbeteridee\u00ebn"]: "" } as Record<string, string>),
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  } as Automatisering;
}

describe("flow detail presentation", () => {
  it("documents all Create new deal enrollment routes without technical endpoint copy", () => {
    const presentation = getFlowDetailPresentation(
      makeFlow({
        id: "8a9ef9d2-9bf8-469c-8107-647c28ac03ba",
        naam: "Create new deal naar New create deal",
        systemen: ["HubSpot", "GitLab"],
      }),
      [
        makeAutomation({
          id: "hs",
          source: "hubspot",
          naam: "Create new deal",
          categorie: "HubSpot Workflow",
          hubspotWorkflow: {
            workflowId: "1699666192",
            name: "Create new deal",
            objectType: "deal",
            enrollmentType: "LIST_BASED",
            shouldReEnroll: true,
            triggers: [
              {
                objectType: "deal",
                property: "activiteit",
                operator: "IS_ANY_OF",
                value: "Actief",
                label: "Activiteit Sales Deal Stage een van deze waarden is 'Actief'",
                source: "enrollmentCriteria",
              },
              {
                objectType: "deal",
                property: "pipeline",
                operator: "IS_ANY_OF",
                value: "5941173",
                label: "Pipeline een van deze waarden is '5941173'",
                source: "enrollmentCriteria",
              },
              {
                objectType: "deal",
                property: "dealstage",
                operator: "IS_KNOWN",
                value: null,
                label: "Deal stage is known",
                source: "enrollmentCriteria",
              },
              {
                objectType: "deal",
                property: "hs_num_of_associated_line_items",
                operator: "IS_GREATER_THAN",
                value: 0,
                label: "Hs Num Of Associated Line Items verandert",
                source: "enrollmentCriteria",
              },
              {
                objectType: "deal",
                property: "software_portaal_pakket",
                operator: "IS_KNOWN",
                value: null,
                label: "Software Portaal Pakket is known",
                source: "enrollmentCriteria",
              },
            ],
            actions: [],
          },
        }),
        makeAutomation({
          id: "gl",
          source: "gitlab",
          naam: "New create deal",
          externalId: "gitlab::POST /operations/hubspot/create_new_deal",
          gitlabEndpoint: {
            endpoint: "/operations/hubspot/create_new_deal",
            method: "POST",
            handler: "new_create_deal",
          },
        }),
      ],
    );

    expect(presentation).not.toBeNull();
    expect(presentation?.approvedDescription).toContain("handmatig");
    expect(presentation?.approvedDescription).toContain("Klantenbestand");
    expect(presentation?.approvedDescription).toContain("minimaal een gekoppeld line item");
    expect(presentation?.approvedDescription).toContain("Software/Portaal/Pakket");
    expect(presentation?.approvedDescription).toContain("opnieuw door deze workflow lopen");
    expect(presentation?.approvedDescription).not.toMatch(/POST|\/operations|endpoint|handler/i);

    const rewritten = applyFlowDetailPresentationToRuntimeSteps(
      [
        {
          id: "signal-start",
          type: "signal",
          label: "Startsignaal",
          title: "Activiteit Sales Deal Stage een van deze waarden is 'Actief'",
          description: "HubSpot workflow starts on one trigger.",
          evidence: "Bron: HubSpot workflowdefinitie.",
        },
        {
          id: "automation-hs",
          type: "hubspot_workflow",
          label: "HubSpot workflow",
          title: "Create new deal",
          description: "Start door het startsignaal uit stap 1.",
          evidence: "Webhookactie: POST /operations/hubspot/create_new_deal.",
        },
        {
          id: "gitlab-backend-block-gl",
          type: "gitlab_backend_block",
          label: "GitLab backendblok",
          title: "New create deal",
          description: "Generic backend copy.",
          evidence: "GitLab endpoint/handler: POST /operations/hubspot/create_new_deal, handler new_create_deal.",
        },
        {
          id: "downstream-end",
          type: "downstream",
          label: "Gekoppelde volgende procesreis",
          title: "Geen vervolgproces bewezen",
          description: "Generic downstream copy.",
        },
      ],
      presentation,
    );

    const signal = rewritten.find((step) => step.type === "signal");
    expect(signal?.title).toBe("Inschrijving in HubSpot workflow");
    expect(signal?.description).toContain("handmatig");
    expect(signal?.description).toContain("automatisch");
    expect(signal?.description).toContain("Activiteit Sales Deal Stage");
    expect(signal?.description).toContain("Klantenbestand");
    expect(signal?.description).toContain("opnieuw instromen");
    expect(signal?.description).not.toMatch(/POST|\/operations|endpoint|handler/i);
  });

  it("recognizes the WeFact debtor process journey and keeps user copy production-ready", () => {
    const presentation = getFlowDetailPresentation(makeFlow(), [
      makeAutomation({
        id: "gl",
        source: "gitlab",
        naam: "Upsert wefact debtor from hubspot",
        externalId: "gitlab::POST /wefact/hubspot/upsert_debtor",
        gitlabEndpoint: {
          endpoint: "/wefact/hubspot/upsert_debtor",
          method: "POST",
          handler: "upsert_wefact_debtor_from_hubspot",
        },
      }),
    ]);

    expect(presentation?.processJourneyIntro).toContain("WeFact-reis als bedrijfsproces");
    expect(presentation?.processChainIntro).toBe("Van HubSpot-trigger naar backendverwerking en WeFact-update.");
    expect(presentation?.processChainIntro).not.toBe(presentation?.processJourneyIntro);
    expect(presentation?.automationSummaries.gitlab).toContain("facturatie");
    expect(presentation?.evidenceItems.map((item) => item.label)).toEqual([
      "Webhook-match",
      "Procesvolgorde",
      "Vervolgtrigger",
    ]);
    expect(presentation?.evidenceItems[2]).toMatchObject({
      status: "Niet bewezen",
      reason:
        "Er is geen exacte HubSpot-property of waarde gevonden die na deze WeFact-update automatisch een volgende procesreis start.",
    });
    expect(JSON.stringify(presentation)).not.toMatch(/\bdemo\b/i);
    expect(JSON.stringify(presentation)).not.toMatch(/POST|\/wefact|handler|endpoint|upsert/i);
    expect(presentation?.approvedDescription).toContain("WeFact bijgewerkt voor facturatie");
    expect(presentation?.approvedDescription).not.toMatch(/POST|\/wefact|handler|endpoint|upsert/i);
    expect(
      getPresentationAutomationLabel(
        presentation,
        makeAutomation({ source: "hubspot", naam: "Upsert WeFact client" }),
        "Upsert WeFact client",
      ),
    ).toBe("HubSpot WeFact-synchronisatie");
    expect(
      getPresentationAutomationLabel(
        presentation,
        makeAutomation({ source: "gitlab", naam: "Upsert wefact debtor from hubspot" }),
        "Upsert wefact debtor from hubspot",
      ),
    ).toBe("WeFact debiteur synchroniseren");
  });

  it("does not apply WeFact copy to other process journeys", () => {
    const presentation = getFlowDetailPresentation(
      makeFlow({ id: "other-flow", naam: "BTW kwartaalstatus bijwerken" }),
      [
        makeAutomation({
          id: "gl",
          source: "gitlab",
          naam: "Update next quarter prev2m",
          gitlabEndpoint: {
            endpoint: "/properties/btw/update_next_quarter_prev2m",
            method: "POST",
            handler: "update_next_quarter_prev2m",
          },
        }),
      ],
    );

    expect(presentation).toBeNull();
  });

  it("rewrites visible copy while preserving technical logic evidence", () => {
    const presentation = getFlowDetailPresentation(makeFlow(), []);
    const steps: FlowRuntimeStep[] = [
      {
        id: "signal-start",
        type: "signal",
        label: "Startsignaal",
        title: "Bedrijf is associated to: Any Deal",
        description: "HubSpot workflow starts.",
        evidence: "Technische trigger: Bedrijf is associated to Any Deal.",
      },
      {
        id: "automation-hs",
        type: "hubspot_workflow",
        label: "HubSpot workflow",
        title: "Upsert WeFact client",
        description: "Generic workflow copy.",
        evidence: "Technische workflow: webhook POST /wefact/hubspot/upsert_debtor.",
        hubspotActions: [
          {
            id: "hs-action",
            label: "HubSpot actie 2",
            title: "Stuurt door naar verwerking",
            description: "HubSpot geeft het werk door aan de verwerking buiten de workflow. Daarna kan de uitkomst weer in HubSpot terugkomen.",
            tone: "route",
          },
        ],
      },
      {
        id: "gitlab-backend-block-gl",
        type: "gitlab_backend_block",
        label: "GitLab backendblok",
        title: "Upsert wefact debtor from hubspot",
        description: "Generic backend copy.",
        evidence: "Technische backend: handler upsert_wefact_debtor_from_hubspot verwerkt endpoint /wefact/hubspot/upsert_debtor.",
        workers: [
          {
            id: "worker-gl",
            automationId: "gl",
            title: "Upsert wefact debtor from hubspot",
            description: "Generic worker copy.",
            miniSteps: [
              { kind: "read", title: "Leest", summary: "Leest generieke data." },
              { kind: "write", title: "Schrijft", summary: "Wijzigt companygegevens in HubSpot." },
            ],
            backendTrace: {
              summary: "Technische trace voor WeFact.",
              decisions: ["Gebruikt result.get(\"status\") en result.get(\"debtor code\")."],
              technicalSteps: [
                {
                  title: "Endpoint",
                  description: "Workflow: Upsert WeFact client",
                  code: "POST /wefact/hubspot/upsert_debtor",
                },
                {
                  title: "Backend",
                  description: "Backendhandler",
                  code: "handler upsert_wefact_debtor_from_hubspot",
                },
              ],
            },
          },
        ],
      },
      {
        id: "state-write-gl",
        type: "state_write",
        label: "Eindpunt in HubSpot",
        title: "HubSpot registreert de uitkomst: Wijzigt companygegevens in HubSpot.",
        description: "Generic output copy.",
      },
      {
        id: "emitted-signal-gl",
        type: "emitted_signal",
        label: "Uitgaand HubSpot-signaal",
        title: "Geen bewezen vervolgtrigger vanuit WeFact",
        description: "Generic emitted signal copy.",
      },
      {
        id: "downstream-end",
        type: "downstream",
        label: "Gekoppelde volgende procesreis",
        title: "Geen vervolgproces bewezen",
        description: "Generic downstream copy.",
        evidence: "Geen vervolgtrigger bewezen in workflowdata.",
      },
    ];

    const rewritten = applyFlowDetailPresentationToRuntimeSteps(steps, presentation);
    const visibleText = JSON.stringify(
      rewritten.map(({ evidence: _evidence, workers, ...step }) => ({
        ...step,
        workers: workers?.map(({ backendTrace: _backendTrace, evidence: _workerEvidence, ...worker }) => worker),
      })),
    );
    const logicText = rewritten.map((step) => step.evidence).filter(Boolean).join("\n");
    const hubspotAction = rewritten.find((step) => step.type === "hubspot_workflow")?.hubspotActions?.[0];
    const backendTrace = rewritten.find((step) => step.type === "gitlab_backend_block")?.workers?.[0]?.backendTrace;

    expect(rewritten.find((step) => step.type === "signal")?.title).toContain("WeFact");
    expect(rewritten.find((step) => step.type === "signal")?.title).toContain("HubSpot activeert");
    expect(rewritten.find((step) => step.type === "signal")?.description).toContain("technische trigger");
    expect(rewritten.find((step) => step.type === "signal")?.description).toContain("voor een gekoppelde klant of bedrijf");
    expect(hubspotAction).toMatchObject({
      label: "Webhookactie",
      title: "Stuurt de WeFact-verwerking aan",
      description: "Een HubSpot-terugschrijving wordt alleen getoond als die uit de code blijkt.",
    });
    expect(rewritten.find((step) => step.type === "gitlab_backend_block")?.description).toContain("WeFact");
    expect(rewritten.find((step) => step.type === "state_write")).toBeUndefined();
    expect(rewritten.find((step) => step.type === "emitted_signal")).toBeUndefined();
    expect(rewritten.find((step) => step.type === "downstream")?.title).toBe("Einde procesreis - Geen vervolgproces bewezen");
    expect(rewritten.find((step) => step.type === "gitlab_backend_block")?.workers?.[0]?.miniSteps[2].summary).toContain(
      "afhankelijk van de beschikbare WeFact-koppeling en backendlogica",
    );
    expect(JSON.stringify(backendTrace?.technicalSteps)).toContain("Workflow: Upsert WeFact client");
    expect(JSON.stringify(backendTrace?.technicalSteps)).toContain("POST /wefact/hubspot/upsert_debtor");
    expect(JSON.stringify(backendTrace?.technicalSteps)).toContain("handler upsert_wefact_debtor_from_hubspot");
    expect(visibleText).not.toContain("Clockify");
    expect(visibleText).not.toContain("Wijzigt companygegevens in HubSpot");
    expect(visibleText).not.toMatch(/\bdemo\b/i);
    expect(visibleText).not.toMatch(/POST|\/wefact|handler|endpoint|upsert/i);
    expect(visibleText).not.toContain("zichtbare uitkomst staat weer in HubSpot");
    expect(logicText).toContain("POST /wefact/hubspot/upsert_debtor");
    expect(logicText).toContain("handler upsert_wefact_debtor_from_hubspot");
  });
});
