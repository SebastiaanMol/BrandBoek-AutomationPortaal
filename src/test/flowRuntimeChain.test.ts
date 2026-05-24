import { describe, expect, it } from "vitest";
import {
  buildFlowRuntimeChain,
  countFlowRuntimeStepsForAutomation,
  expandFlowAutomationIds,
  isFlowRuntimeStepSelectedForAutomation,
} from "@/lib/flowRuntimeChain";
import type { Automatisering } from "@/lib/types";

function makeAuto(overrides: Partial<Automatisering>): Automatisering {
  return {
    id: "auto",
    naam: "Automation",
    categorie: "HubSpot Workflow",
    doel: "",
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
    createdAt: "",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  };
}

describe("buildFlowRuntimeChain", () => {
  it("adds signal and state-write semantics around HubSpot and GitLab automations", () => {
    const hubspot = makeAuto({
      id: "hs",
      naam: "'BTW 2 maanden geboekt' instellen",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      doel: "Start de backend worker voor BTW kwartaalstate.",
    });
    const gitlab = makeAuto({
      id: "gl",
      naam: "Update next quarter prev2m",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab", "HubSpot"],
      gitlabEndpoint: {
        handler: "update_next_quarter_prev2m",
        calls: [
          {
            depth: 0,
            kind: "hubspot_repository_call",
            from: "app.API.properties::update_next_quarter_prev2m",
            to: "app.repository.hubspot::update_deal_properties",
            file: "gitlabtest/app/repository/hubspot.py",
          },
        ],
      },
    });

    const steps = buildFlowRuntimeChain(
      ["hs", "gl"],
      new Map([
        ["hs", hubspot],
        ["gl", gitlab],
      ]),
    );

    expect(steps.map((step) => step.type)).toEqual([
      "signal",
      "hubspot_workflow",
      "gitlab_backend_block",
      "return_to_hubspot",
      "state_write",
      "emitted_signal",
      "downstream",
    ]);
    expect(steps[0].title).toBe("BTW 2 maanden geboekt");
    expect(steps[2].workers).toHaveLength(1);
    expect(steps[2].workers?.[0]?.title).toBe("Volgend BTW-kwartaal bijwerken");
    expect(steps[3]).toMatchObject({
      type: "return_to_hubspot",
      label: "Resultaat terug naar HubSpot",
      title: "De verwerking levert een HubSpot-uitkomst op",
    });
    expect(steps[4]).toMatchObject({
      type: "state_write",
      label: "Eindpunt in HubSpot",
      title: "HubSpot registreert de uitkomst: btw_2_maanden_geboekt = true",
    });
    expect(steps[5]).toMatchObject({
      type: "emitted_signal",
      label: "Uitgaand HubSpot-signaal",
      title: "btw_2_maanden_geboekt bijgewerkt",
    });
    expect(steps[6]).toMatchObject({
      type: "downstream",
      label: "Gekoppelde volgende procesreis",
      title: "Nog geen vervolgproces gekoppeld",
    });
  });

  it("describes Zapier webhook starts without HubSpot workflow wording", () => {
    const zapier = makeAuto({
      id: "zapier",
      naam: "Trustoo Leads - Rotterdam",
      source: "zapier",
      categorie: "Zapier Zap",
      systemen: ["Zapier", "Trustoo", "Webhooks by Zapier"],
      trigger: "Zapier trigger: Trustoo Leads - Rotterdam (Trustoo)",
      webhookPaths: ["/sales/leads/hubspot/trustoo"],
    });
    const gitlab = makeAuto({
      id: "gitlab",
      naam: "Leads trustoo",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab", "HubSpot"],
      gitlabEndpoint: {
        endpoint: "/sales/leads/hubspot/trustoo",
        method: "POST",
        handler: "leads_trustoo",
      },
    });

    const steps = buildFlowRuntimeChain(
      ["zapier", "gitlab"],
      new Map([
        ["zapier", zapier],
        ["gitlab", gitlab],
      ]),
    );

    expect(steps[0].description).toContain('Zapier automation "Trustoo Leads - Rotterdam"');
    expect(steps[1]).toMatchObject({
      type: "automation",
      label: "Zapier automation",
    });
    expect(steps[1].description).toMatch(/geeft het werk door aan de backendverwerking/i);
    expect(steps[1].description).not.toContain("POST /sales/leads/hubspot/trustoo");
    expect(steps[2].description).toContain('Zapier automation "Trustoo Leads - Rotterdam" geeft gegevens door aan deze backend automation');
    expect(steps[2].description).not.toContain("POST /sales/leads/hubspot/trustoo");
    expect(steps[2].evidence).toContain("Webhookactie vanuit Zapier automation");
  });

  it("turns rich Zapier process details into numbered journey steps before the backend block", () => {
    const zapier = makeAuto({
      id: "zapier",
      naam: "Trustoo Leads - Rotterdam",
      source: "zapier",
      categorie: "Zapier Zap",
      systemen: ["Zapier", "Trustoo", "Webhooks by Zapier"],
      trigger: "Zapier trigger: nieuwe lead vanuit Trustoo",
      webhookPaths: ["/sales/leads/hubspot/trustoo"],
      importProposal: {
        source: "zapier",
        read_only: true,
        zap: {
          process: {
            trigger: "Ontvangt een nieuwe lead vanuit Trustoo.",
            outcome: "Zapier geeft gegevens door aan de backend via /sales/leads/hubspot/trustoo.",
            conditions: [],
            emails: [],
            dataLookups: [],
            webhookHandoffs: [
              { method: "POST", path: "/sales/leads/hubspot/trustoo", host: "example.test" },
            ],
            steps: [
              {
                index: 1,
                appName: "Trustoo",
                title: "New Lead",
                type: "trigger",
                kind: "trigger",
                summary: "Ontvangt een nieuwe lead vanuit Trustoo.",
                details: ["Bron: Trustoo leadtrigger in Zapier."],
                webhookPaths: [],
              },
              {
                index: 2,
                appName: "Webhooks by Zapier",
                title: "POST",
                type: "write",
                kind: "webhook",
                summary: "Geeft gegevens door aan de backend via /sales/leads/hubspot/trustoo.",
                details: ["Doelsysteem: example.test."],
                webhookPaths: ["/sales/leads/hubspot/trustoo"],
              },
            ],
          },
        },
      },
    });
    const gitlab = makeAuto({
      id: "gitlab",
      naam: "Leads trustoo",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab", "HubSpot"],
      gitlabEndpoint: {
        endpoint: "/sales/leads/hubspot/trustoo",
        method: "POST",
        handler: "leads_trustoo",
      },
    });

    const steps = buildFlowRuntimeChain(
      ["zapier", "gitlab"],
      new Map([
        ["zapier", zapier],
        ["gitlab", gitlab],
      ]),
    );

    expect(steps.map((step) => step.type)).toEqual([
      "signal",
      "zapier_step",
      "zapier_step",
      "gitlab_backend_block",
      "state_write",
      "downstream",
    ]);
    expect(steps[1]).toMatchObject({
      label: "Zapier stap",
      title: "Ontvangt een nieuwe lead vanuit Trustoo.",
      automationId: "zapier",
    });
    expect(steps[2]).toMatchObject({
      label: "Zapier overdracht",
      title: "Geeft gegevens door aan de backendverwerking",
      automationId: "zapier",
    });
    expect(steps[2].title).not.toContain("/sales/leads/hubspot/trustoo");
    expect(steps[2].evidence).toContain("/sales/leads/hubspot/trustoo");
    expect(steps[2].transitionFromPrevious?.label).toBe("Van stap 1 naar stap 2");
    expect(steps[2].transitionFromPrevious?.description).toContain("volgende actie in dezelfde Zap");
    expect(steps[3].transitionFromPrevious?.label).toBe("Van stap 2 naar stap 3");
    expect(steps[3].transitionFromPrevious?.description).toContain("Webhook-match");
    expect(steps.find((step) => step.type === "state_write")).toMatchObject({
      label: "Einduitkomst",
      title: "Backendverwerking afgerond",
    });
  });

  it("orders the journey by proven webhook handoff instead of input order", () => {
    const zapier = makeAuto({
      id: "zapier",
      naam: "Trustoo Leads - Rotterdam",
      source: "zapier",
      categorie: "Zapier Zap",
      systemen: ["Zapier", "Trustoo", "Webhooks by Zapier"],
      trigger: "Zapier trigger: nieuwe lead vanuit Trustoo",
      webhookPaths: ["/sales/leads/hubspot/trustoo"],
      importProposal: {
        source: "zapier",
        read_only: true,
        zap: {
          process: {
            trigger: "Ontvangt een nieuwe lead vanuit Trustoo.",
            outcome: "Geeft door aan de Brand backend.",
            conditions: [],
            emails: [],
            dataLookups: [],
            webhookHandoffs: [
              { method: "POST", path: "/sales/leads/hubspot/trustoo", host: "example.test" },
            ],
            steps: [
              {
                index: 1,
                appName: "Trustoo",
                title: "New Lead",
                type: "trigger",
                kind: "trigger",
                summary: "Ontvangt een nieuwe lead vanuit Trustoo.",
                details: [],
                webhookPaths: [],
              },
              {
                index: 2,
                appName: "Webhooks by Zapier",
                title: "POST",
                type: "write",
                kind: "webhook",
                summary: "Geeft gegevens door aan de backend.",
                details: [],
                webhookPaths: ["/sales/leads/hubspot/trustoo"],
              },
            ],
          },
        },
      },
    });
    const gitlab = makeAuto({
      id: "gitlab",
      naam: "Leads trustoo",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab", "HubSpot"],
      gitlabEndpoint: {
        endpoint: "/sales/leads/hubspot/trustoo",
        method: "POST",
        handler: "leads_trustoo",
      },
    });

    const steps = buildFlowRuntimeChain(
      ["gitlab", "zapier"],
      new Map([
        ["zapier", zapier],
        ["gitlab", gitlab],
      ]),
    );

    expect(steps[0]).toMatchObject({
      type: "signal",
      title: "Zapier trigger: nieuwe lead vanuit Trustoo",
    });
    expect(steps.findIndex((step) => step.type === "zapier_step")).toBeLessThan(
      steps.findIndex((step) => step.type === "gitlab_backend_block"),
    );
    expect(steps.find((step) => step.type === "gitlab_backend_block")?.transitionFromPrevious?.description).toContain(
      "Webhook-match",
    );
  });

  it("starts at a direct GitLab process automation when no upstream trigger is proven", () => {
    const gitlab = makeAuto({
      id: "gitlab",
      naam: "Upsert wefact debtor from hubspot",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab", "WeFact"],
      gitlabEndpoint: {
        endpoint: "/wefact/hubspot/upsert_debtor",
        method: "POST",
        handler: "upsert_wefact_debtor_from_hubspot",
      },
    });

    const steps = buildFlowRuntimeChain(
      ["gitlab"],
      new Map([["gitlab", gitlab]]),
    );

    expect(steps[0]).toMatchObject({
      type: "signal",
      title: "Directe backendverwerking",
    });
    expect(steps[0].description).toContain("direct aangeroepen");
    expect(steps[0].description).not.toContain("HubSpot workflow");
    expect(steps[1]).toMatchObject({
      type: "gitlab_backend_block",
      title: "WeFact debiteur bijwerken",
    });
    expect(steps[1].description).not.toContain("De vorige automation");
  });

  it("ends at the proven external outcome when no HubSpot write is proven", () => {
    const gitlab = makeAuto({
      id: "gitlab",
      naam: "Upsert wefact debtor from hubspot",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab", "WeFact"],
      gitlabEndpoint: {
        endpoint: "/wefact/hubspot/upsert_debtor",
        method: "POST",
        handler: "upsert_wefact_debtor_from_hubspot",
        calls: [
          {
            depth: 0,
            kind: "async_call",
            from: "app.API.wefact::upsert_wefact_debtor_from_hubspot",
            to: "app.service.wefact::upsert_debtor",
            file: "gitlabtest/app/service/wefact.py",
          },
        ],
      },
    });

    const steps = buildFlowRuntimeChain(
      ["gitlab"],
      new Map([["gitlab", gitlab]]),
    );

    expect(steps.map((step) => step.type)).toEqual([
      "signal",
      "gitlab_backend_block",
      "state_write",
      "downstream",
    ]);
    expect(steps[2]).toMatchObject({
      type: "state_write",
      label: "Einduitkomst",
      title: "WeFact debiteur wordt aangemaakt of bijgewerkt",
    });
    expect(steps[2].description).not.toContain("HubSpot bevat nu");
    expect(steps.some((step) => step.type === "return_to_hubspot")).toBe(false);
    expect(steps.some((step) => step.type === "emitted_signal")).toBe(false);
  });

  it("groups consecutive GitLab automations inside one backend block", () => {
    const gitlabA = makeAuto({
      id: "gl-a",
      naam: "First backend step",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab", "HubSpot"],
      gitlabEndpoint: { handler: "first_backend_step" },
    });
    const gitlabB = makeAuto({
      id: "gl-b",
      naam: "Second backend step",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab", "HubSpot"],
      gitlabEndpoint: { handler: "second_backend_step" },
    });

    const steps = buildFlowRuntimeChain(
      ["gl-a", "gl-b"],
      new Map([
        ["gl-a", gitlabA],
        ["gl-b", gitlabB],
      ]),
    );

    expect(steps.map((step) => step.type)).toEqual([
      "signal",
      "gitlab_backend_block",
      "state_write",
      "downstream",
    ]);
    expect(steps[1].title).toBe("2 gekoppelde GitLab automations");
    expect(steps[1].workers?.map((worker) => worker.automationId)).toEqual(["gl-a", "gl-b"]);
  });

  it("projects rich backend traces into process journey GitLab workers", () => {
    const hubspot = makeAuto({
      id: "hs",
      naam: "Reset betaalt niet workflow",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      webhookPaths: ["/operations/hubspot/reset_betaalt_niet"],
    });
    const gitlab = makeAuto({
      id: "gl",
      naam: "Reset betaalt niet",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab", "HubSpot"],
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
            to: "app.repository.hubspot::update_deal_properties",
            file: "gitlabtest/app/repository/hubspot.py",
          },
        ],
      },
    });

    const steps = buildFlowRuntimeChain(
      ["hs", "gl"],
      new Map([
        ["hs", hubspot],
        ["gl", gitlab],
      ]),
    );

    const worker = steps.find((step) => step.type === "gitlab_backend_block")?.workers?.[0];

    expect(worker?.backendTrace?.summary).toContain("Reset betaalt niet");
    expect(worker?.miniSteps.map((step) => step.title)).toContain("reset all from betaalt niet neemt codebeslissingen");
    expect(
      worker?.miniSteps.some((step) =>
        step.technical?.some((item) => item.code?.includes("if not previous_stage:")),
      ),
    ).toBe(true);
  });

  it("uses HubSpot workflow audit metadata for concrete trigger and webhook text", () => {
    const hubspot = makeAuto({
      id: "hs",
      naam: "BTW 2 maanden geboekt instellen",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      hubspotWorkflow: {
        workflowId: "123",
        name: "BTW 2 maanden geboekt instellen",
        objectType: "deal",
        triggers: [{
          objectType: "deal",
          property: "btw_2_maanden_geboekt",
          operator: "EQ",
          value: true,
          label: "de dealeigenschap 'btw_2_maanden_geboekt' gelijk is aan 'true'",
          source: "enrollmentCriteria",
        }],
        actions: [{
          index: 2,
          type: "WEBHOOK",
          label: "Webhook -> https://example.test/properties/btw/update_next_quarter_prev2m",
          webhookMethod: "POST",
          webhookUrl: "https://example.test/properties/btw/update_next_quarter_prev2m",
          webhookPath: "/properties/btw/update_next_quarter_prev2m",
        }],
      },
    });
    const gitlab = makeAuto({
      id: "gl",
      naam: "Update next quarter prev2m",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab", "HubSpot"],
      endpoints: ["/properties/btw/update_next_quarter_prev2m"],
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/properties/btw/update_next_quarter_prev2m",
        handler: "update_next_quarter_prev2m",
      },
    });

    const steps = buildFlowRuntimeChain(
      ["hs", "gl"],
      new Map([
        ["hs", hubspot],
        ["gl", gitlab],
      ]),
    );

    expect(steps[0].description).toContain("de dealeigenschap 'btw_2_maanden_geboekt'");
    expect(steps[1].description).toContain("startsignaal uit stap 1");
    expect(steps[1].description).not.toContain("de dealeigenschap 'btw_2_maanden_geboekt'");
    expect(steps[1].description).not.toContain("POST /properties/btw/update_next_quarter_prev2m");
    expect(steps[1].description).toMatch(/geeft het werk door aan de backendverwerking/i);
    expect(steps[1].description).toContain('GitLab automation "Update next quarter prev2m"');
    expect(steps[1].evidence).toContain("dezelfde triggercriteria als het startsignaal");
    expect(steps[2].description).not.toContain("POST /properties/btw/update_next_quarter_prev2m");
    expect(steps[1].hubspotActions?.[0]).toMatchObject({
      label: "Webhookactie",
      title: "Stuurt de verwerking aan",
      description: "Een HubSpot-terugschrijving wordt alleen getoond als die uit de code blijkt.",
    });
    expect(steps[2].evidence).toContain("handler update_next_quarter_prev2m");
  });

  it("does not invent a boolean property write for create-new-deal outputs", () => {
    const hubspot = makeAuto({
      id: "hs",
      naam: "Create new deal",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      webhookPaths: ["/operations/hubspot/create_new_deal"],
    });
    const gitlab = makeAuto({
      id: "gl",
      naam: "New create deal",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab", "HubSpot"],
      externalId: "gitlab::POST /operations/hubspot/create_new_deal",
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/operations/hubspot/create_new_deal",
        handler: "new_create_deal",
      },
    });

    const steps = buildFlowRuntimeChain(
      ["hs", "gl"],
      new Map([
        ["hs", hubspot],
        ["gl", gitlab],
      ]),
    );

    const stateWrite = steps.find((step) => step.type === "state_write");
    const returnToHubSpot = steps.find((step) => step.type === "return_to_hubspot");
    const emittedSignal = steps.find((step) => step.type === "emitted_signal");

    expect(returnToHubSpot?.title).toBe("De verwerking levert HubSpot-records op");
    expect(returnToHubSpot?.description).toContain("dealrecords worden aangemaakt of gekoppeld");
    expect(stateWrite?.title).toBe("HubSpot registreert de uitkomst: Maakt of koppelt dealrecords aan in HubSpot.");
    expect(stateWrite?.description).toContain("aangemaakte of gekoppelde dealrecords");
    expect(stateWrite?.description).not.toContain("status of eigenschap");
    expect(stateWrite?.title).not.toContain("create_new_deal = true");
    expect(emittedSignal?.title).toBe("Maakt of koppelt dealrecords aan in HubSpot");
    expect(countFlowRuntimeStepsForAutomation(steps, "hs")).toBe(2);
    expect(countFlowRuntimeStepsForAutomation(steps, "gl")).toBe(2);
    expect(steps.filter((step) => isFlowRuntimeStepSelectedForAutomation(step, "hs")).map((step) => step.type)).toEqual([
      "hubspot_workflow",
      "state_write",
    ]);
    expect(steps.filter((step) => isFlowRuntimeStepSelectedForAutomation(step, "gl")).map((step) => step.type)).toEqual([
      "gitlab_backend_block",
      "return_to_hubspot",
    ]);
  });

  it("adds a HubSpot branching step when a workflow has multiple branch paths", () => {
    const hubspot = makeAuto({
      id: "hs",
      naam: "'BTW 2 maanden geboekt' instellen",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      beschrijvingInSimpeleTaal: [
        "Stap 1: De automatisering start zodra de object-eigenschap 'dealstage' een van deze waarden is '2 maanden geboekt (controle), 2 maanden geboekt'.",
      ],
      branches: [
        { id: "b1", label: "2 maanden geboekt (controle)", toStepId: "" },
        { id: "b2", label: "2 maanden geboekt", toStepId: "" },
      ],
      webhookPaths: ["/properties/btw/update_next_quarter_prev2m"],
    });
    const gitlab = makeAuto({
      id: "gl",
      naam: "Update next quarter prev2m",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab", "HubSpot"],
    });

    const steps = buildFlowRuntimeChain(
      ["hs", "gl"],
      new Map([
        ["hs", hubspot],
        ["gl", gitlab],
      ]),
    );

    expect(steps.map((step) => step.type)).toEqual([
      "signal",
      "hubspot_workflow",
      "hubspot_branching",
      "gitlab_backend_block",
      "state_write",
      "downstream",
    ]);
    expect(steps[2].branchPaths?.map((path) => path.label)).toEqual([
      "2 maanden geboekt (controle)",
      "2 maanden geboekt",
    ]);
  });

  it("expands a flow with confirmed links so linked GitLab workers are included", () => {
    const ids = expandFlowAutomationIds(
      ["hubspot"],
      [{ sourceId: "hubspot", targetId: "gitlab" }],
    );

    expect(ids).toEqual(["hubspot", "gitlab"]);
  });
});
