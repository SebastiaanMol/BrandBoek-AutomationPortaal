import { describe, expect, it } from "vitest";

import {
  buildProcessJourneyTrace,
  buildProcessJourneyTraces,
} from "@/lib/processJourneyTrace";
import type { Automatisering } from "@/lib/types";

describe("processJourneyTrace", () => {
  it("recursively follows exact webhook paths from one automation to the next", () => {
    const automations = [
      makeAutomation("typeform", {
        source: "typeform",
        webhookPaths: ["/hooks/intake"],
      }),
      makeAutomation("backend-a", {
        source: "gitlab",
        endpoints: ["/hooks/intake"],
        webhookPaths: ["/hooks/create-deal"],
      }),
      makeAutomation("backend-b", {
        source: "gitlab",
        endpoints: ["/hooks/create-deal"],
      }),
    ];

    const trace = buildProcessJourneyTrace({
      automations,
      seedIds: ["typeform"],
    });

    expect(trace.orderedNodeIds).toEqual(["typeform", "backend-a", "backend-b"]);
    expect(trace.edges.map((edge) => [edge.fromId, edge.toId, edge.normalizedPath])).toEqual([
      ["typeform", "backend-a", "/hooks/intake"],
      ["backend-a", "backend-b", "/hooks/create-deal"],
    ]);
    expect(trace.stopNodeIds).toEqual(["backend-b"]);
  });

  it("keeps branches when one webhook sender matches multiple receiver endpoints", () => {
    const automations = [
      makeAutomation("hubspot", {
        source: "hubspot",
        webhookPaths: ["/hooks/client", "/hooks/invoice"],
      }),
      makeAutomation("client-api", {
        source: "gitlab",
        endpoints: ["/hooks/client"],
      }),
      makeAutomation("invoice-api", {
        source: "gitlab",
        endpoints: ["/hooks/invoice"],
      }),
    ];

    const trace = buildProcessJourneyTrace({
      automations,
      seedIds: ["hubspot"],
    });

    expect(trace.orderedNodeIds).toEqual(["hubspot", "client-api", "invoice-api"]);
    expect(trace.edges).toHaveLength(2);
    expect(trace.branchNodeIds).toEqual(["hubspot"]);
  });

  it("stops safely when a webhook route cycles back to an earlier automation", () => {
    const automations = [
      makeAutomation("a", {
        source: "gitlab",
        endpoints: ["/hooks/a"],
        webhookPaths: ["/hooks/b"],
      }),
      makeAutomation("b", {
        source: "gitlab",
        endpoints: ["/hooks/b"],
        webhookPaths: ["/hooks/a"],
      }),
    ];

    const trace = buildProcessJourneyTrace({
      automations,
      seedIds: ["a"],
    });

    expect(trace.orderedNodeIds).toEqual(["a", "b"]);
    expect(trace.edges.map((edge) => [edge.fromId, edge.toId, edge.isCycle])).toEqual([
      ["a", "b", false],
      ["b", "a", true],
    ]);
    expect(trace.cycleEdges).toHaveLength(1);
  });

  it("does not create a route from names or manual context without exact path proof", () => {
    const automations = [
      makeAutomation("hubspot", {
        naam: "Create deal",
        source: "hubspot",
        webhookPaths: ["/hooks/create-deal"],
      }),
      makeAutomation("backend", {
        naam: "Create deal backend",
        source: "gitlab",
        endpoints: ["/hooks/other-route"],
      }),
    ];

    const trace = buildProcessJourneyTrace({
      automations,
      seedIds: ["hubspot"],
    });

    expect(trace.orderedNodeIds).toEqual(["hubspot"]);
    expect(trace.edges).toEqual([]);
  });

  it("builds separate traces for independent webhook-proven journeys", () => {
    const automations = [
      makeAutomation("a", { webhookPaths: ["/one"] }),
      makeAutomation("b", { endpoints: ["/one"] }),
      makeAutomation("c", { webhookPaths: ["/two"] }),
      makeAutomation("d", { endpoints: ["/two"] }),
      makeAutomation("isolated"),
    ];

    const traces = buildProcessJourneyTraces(automations);

    expect(traces.map((trace) => trace.orderedNodeIds.join(">")).sort()).toEqual([
      "a>b",
      "c>d",
    ]);
  });

  it("does not stop at three automations when a longer webhook chain is proven", () => {
    const automations = [
      makeAutomation("typeform", { source: "typeform", webhookPaths: ["/one"] }),
      makeAutomation("gitlab-a", { source: "gitlab", endpoints: ["/one"], webhookPaths: ["/two"] }),
      makeAutomation("zapier", { source: "zapier", endpoints: ["/two"], webhookPaths: ["/three"] }),
      makeAutomation("gitlab-b", { source: "gitlab", endpoints: ["/three"], webhookPaths: ["/four"] }),
      makeAutomation("hubspot", { source: "hubspot", endpoints: ["/four"] }),
    ];

    const trace = buildProcessJourneyTrace({
      automations,
      seedIds: ["typeform"],
    });

    expect(trace.orderedNodeIds).toEqual(["typeform", "gitlab-a", "zapier", "gitlab-b", "hubspot"]);
    expect(trace.edges).toHaveLength(4);
  });

  it("matches HubSpot Create new deal to the active specific GitLab endpoint instead of the inactive generic API file", () => {
    const automations = [
      makeAutomation("AUTO-HS-1699666192", {
        naam: "Create new deal",
        source: "hubspot",
        categorie: "HubSpot Workflow",
        hubspotWorkflow: {
          name: "Create new deal",
          triggers: [],
          actions: [
            {
              index: 1,
              type: "WEBHOOK",
              label: "Send a webhook",
              webhookMethod: "POST",
              webhookUrl: "https://composed-month-production.up.railway.app/operations/hubspot/create_new_deal",
              webhookPath: "/operations/hubspot/create_new_deal",
            },
          ],
        },
      }),
      makeAutomation("AUTO-044", {
        naam: "HubSpot Operations API",
        source: "gitlab",
        status: "Uitgeschakeld",
        endpoints: ["/operations/hubspot/create_new_deal"],
        gitlabFilePath: "app/API/operations.py",
      }),
      makeAutomation("AUTO-GL-88cf40e9-9423-4911-858c-24070ea6299c", {
        naam: "New create deal (POST /operations/hubspot/create_new_deal)",
        source: "gitlab",
        status: "Actief",
        gitlabEndpoint: {
          method: "POST",
          endpoint: "/operations/hubspot/create_new_deal",
          handler: "create_new_deal",
        },
      }),
    ];

    const trace = buildProcessJourneyTrace({
      automations,
      seedIds: ["AUTO-HS-1699666192"],
    });

    expect(trace.orderedNodeIds).toEqual([
      "AUTO-HS-1699666192",
      "AUTO-GL-88cf40e9-9423-4911-858c-24070ea6299c",
    ]);
    expect(trace.edges.map((edge) => [edge.fromId, edge.toId, edge.normalizedPath])).toEqual([
      [
        "AUTO-HS-1699666192",
        "AUTO-GL-88cf40e9-9423-4911-858c-24070ea6299c",
        "/operations/hubspot/create_new_deal",
      ],
    ]);
  });

  it("matches Zapier Trustoo handoff routes to the specific GitLab Trustoo endpoint", () => {
    const automations = [
      makeAutomation("AUTO-ZAP-TRUSTOO", {
        naam: "Trustoo Leads - Rotterdam",
        source: "zapier",
        categorie: "Zapier Zap",
        importProposal: {
          zap: {
            id: "trustoo",
            title: "Trustoo Leads - Rotterdam",
            process: {
              trigger: "Lead ontvangen",
              outcome: "Stuur naar API",
              conditions: [],
              emails: [],
              dataLookups: [],
              webhookHandoffs: [
                { method: "POST", path: "/sales/leads/hubspot/trustoo" },
              ],
              steps: [],
            },
          },
        },
      }),
      makeAutomation("AUTO-048", {
        naam: "Lead- en Dealbeheer voor Sales in HubSpot",
        source: "gitlab",
        status: "Uitgeschakeld",
        endpoints: ["/sales/leads/hubspot/trustoo"],
        gitlabFilePath: "app/API/sales.py",
      }),
      makeAutomation("AUTO-GL-TRUSTOO", {
        naam: "Leads trustoo (POST /sales/leads/hubspot/trustoo)",
        source: "gitlab",
        status: "Actief",
        gitlabEndpoint: {
          method: "POST",
          endpoint: "/sales/leads/hubspot/trustoo",
          handler: "trustoo_leads",
        },
      }),
    ];

    const trace = buildProcessJourneyTrace({
      automations,
      seedIds: ["AUTO-ZAP-TRUSTOO"],
    });

    expect(trace.orderedNodeIds).toEqual(["AUTO-ZAP-TRUSTOO", "AUTO-GL-TRUSTOO"]);
    expect(trace.edges[0]).toMatchObject({
      fromId: "AUTO-ZAP-TRUSTOO",
      toId: "AUTO-GL-TRUSTOO",
      normalizedPath: "/sales/leads/hubspot/trustoo",
    });
  });

  it("matches active Typeform onboarding webhooks to the specific GitLab onboarding endpoint", () => {
    const automations = [
      makeAutomation("AUTO-TF-ONBOARDING", {
        naam: "Klantinformatie EZ of VOF",
        source: "typeform",
        categorie: "Typeform",
        importProposal: {
          typeform: {
            form: { id: "DMcVFxg2", title: "Klantinformatie EZ of VOF", fields: [], hidden_fields: [] },
            webhooks: [
              {
                tag: "phoenix:1775732320975",
                enabled: true,
                eventTypes: ["form_response"],
                path: "/typeform/onboarding",
                host: "composed-month-production.up.railway.app",
              },
            ],
          },
        },
      }),
      makeAutomation("AUTO-045", {
        naam: "Typeform Webhook Verwerking",
        source: "gitlab",
        status: "Uitgeschakeld",
        endpoints: ["/typeform/onboarding"],
        gitlabFilePath: "app/API/typeform.py",
      }),
      makeAutomation("AUTO-GL-TYPEFORM-ONBOARDING", {
        naam: "Typeform onboarding webhook (POST /typeform/onboarding)",
        source: "gitlab",
        status: "Actief",
        gitlabEndpoint: {
          method: "POST",
          endpoint: "/typeform/onboarding",
          handler: "typeform_onboarding",
        },
      }),
    ];

    const trace = buildProcessJourneyTrace({
      automations,
      seedIds: ["AUTO-TF-ONBOARDING"],
    });

    expect(trace.orderedNodeIds).toEqual(["AUTO-TF-ONBOARDING", "AUTO-GL-TYPEFORM-ONBOARDING"]);
    expect(trace.edges[0]).toMatchObject({
      fromId: "AUTO-TF-ONBOARDING",
      toId: "AUTO-GL-TYPEFORM-ONBOARDING",
      normalizedPath: "/typeform/onboarding",
    });
  });

  it("replaces a stored legacy GitLab file seed with the active specific endpoint node", () => {
    const automations = [
      makeAutomation("AUTO-209", {
        naam: "Questionnaire income tax 2025",
        source: "typeform",
        categorie: "Typeform",
        importProposal: {
          typeform: {
            form: { id: "form-1", title: "Questionnaire income tax 2025", fields: [], hidden_fields: [] },
            webhooks: [
              {
                tag: "typeform-webhook",
                enabled: true,
                eventTypes: ["form_response"],
                path: "/typeform/webhook",
              },
            ],
          },
        },
      }),
      makeAutomation("AUTO-045", {
        naam: "Typeform Webhook Verwerking",
        source: "gitlab",
        status: "Uitgeschakeld",
        endpoints: ["/typeform/webhook"],
        webhookPaths: ["/typeform/webhook"],
        gitlabFilePath: "app/API/typeform.py",
      }),
      makeAutomation("AUTO-143", {
        naam: "Typeform webhook (POST /typeform/webhook)",
        source: "gitlab",
        status: "Actief",
        gitlabEndpoint: {
          method: "POST",
          endpoint: "/typeform/webhook",
          handler: "typeform_webhook",
        },
      }),
    ];

    const trace = buildProcessJourneyTrace({
      automations,
      seedIds: ["AUTO-209", "AUTO-045"],
    });

    expect(trace.orderedNodeIds).toEqual(["AUTO-209", "AUTO-143"]);
    expect(trace.orderedNodeIds).not.toContain("AUTO-045");
    expect(trace.edges).toEqual([
      expect.objectContaining({
        fromId: "AUTO-209",
        toId: "AUTO-143",
        normalizedPath: "/typeform/webhook",
      }),
    ]);
  });

  it("does not treat legacy GitLab endpoint evidence as an outgoing webhook call", () => {
    const automations = [
      makeAutomation("AUTO-045", {
        naam: "Typeform Webhook Verwerking",
        source: "gitlab",
        status: "Uitgeschakeld",
        endpoints: ["/typeform/webhook"],
        webhookPaths: ["/typeform/webhook"],
        gitlabFilePath: "app/API/typeform.py",
      }),
      makeAutomation("AUTO-143", {
        naam: "Typeform webhook (POST /typeform/webhook)",
        source: "gitlab",
        status: "Actief",
        gitlabEndpoint: {
          method: "POST",
          endpoint: "/typeform/webhook",
          handler: "typeform_webhook",
        },
      }),
    ];

    const trace = buildProcessJourneyTrace({
      automations,
      seedIds: ["AUTO-045"],
    });

    expect(trace.orderedNodeIds).toEqual(["AUTO-143"]);
    expect(trace.edges).toEqual([]);
  });

  it("deduplicates repeated route rows so one webhook path creates one edge between two automations", () => {
    const automations = [
      makeAutomation("hubspot-duplicate-routes", {
        source: "hubspot",
        webhookPaths: ["/operations/hubspot/create_new_deal"],
        stappen: [
          "Send POST https://composed-month-production.up.railway.app/operations/hubspot/create_new_deal",
        ],
        hubspotWorkflow: {
          name: "Create new deal",
          triggers: [],
          actions: [
            {
              index: 1,
              type: "WEBHOOK",
              label: "Send a webhook",
              webhookMethod: "POST",
              webhookPath: "/operations/hubspot/create_new_deal",
            },
          ],
        },
      }),
      makeAutomation("gitlab-duplicate-routes", {
        source: "gitlab",
        endpoints: ["/operations/hubspot/create_new_deal"],
        gitlabEndpoint: {
          method: "POST",
          endpoint: "/operations/hubspot/create_new_deal",
          handler: "create_new_deal",
        },
      }),
    ];

    const trace = buildProcessJourneyTrace({
      automations,
      seedIds: ["hubspot-duplicate-routes"],
    });

    expect(trace.orderedNodeIds).toEqual(["hubspot-duplicate-routes", "gitlab-duplicate-routes"]);
    expect(trace.edges).toHaveLength(1);
  });
});

function makeAutomation(id: string, overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id,
    naam: id,
    categorie: "Anders",
    doel: "",
    trigger: "",
    systemen: ["API"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-01T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  };
}
