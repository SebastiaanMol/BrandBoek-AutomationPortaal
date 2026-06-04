import { describe, expect, it } from "vitest";
import { getGitLabEndpointCheckPresentation } from "@/lib/gitlabEndpointCheckPresentation";
import type { Automatisering } from "@/lib/types";

describe("gitlabEndpointCheckPresentation", () => {
  it("counts only specific endpoint records as GitLab automations while showing legacy records as no-endpoint source records", () => {
    const presentation = getGitLabEndpointCheckPresentation([
      hubspotSender(),
      gitlabLinkedEndpoint(),
      gitlabUnmatchedEndpoint(),
      gitlabWithoutEndpoint(),
    ]);

    expect(presentation.metrics).toMatchObject({
      totalGitLabAutomations: 2,
      automationsWithoutEndpoint: 1,
      endpointRows: 2,
      notLinkableEndpointRows: 1,
    });

    expect(presentation.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          automationId: "gl-missing",
          automationName: "Legacy helper without endpoint",
          category: "Legacy/bestandsrecord",
          hasEndpoint: false,
          linkStatus: "no_endpoint",
          linkStatusLabel: "Geen endpoint",
          issue: "Dit is een legacy/bestandsrecord zonder specifieke endpoint-node; daarom telt het niet als GitLab automation voor procesreizen.",
        }),
        expect.objectContaining({
          automationId: "gl-unmatched",
          automationName: "Check pipeline usage",
          hasEndpoint: true,
          normalizedPath: "/internal/check_pipeline_usage",
          linkStatus: "not_linkable",
          linkStatusLabel: "Niet linkbaar",
          classificationLabel: "Geen inkomende webhook",
        }),
        expect.objectContaining({
          automationId: "gl-create",
          automationName: "New create deal",
          hasEndpoint: true,
          normalizedPath: "/operations/hubspot/create_new_deal",
          linkStatus: "linked",
          linkStatusLabel: "Gekoppeld",
          matchedSenders: ["Create new deal"],
        }),
      ]),
    );
  });
});

function baseAutomation(overrides: Partial<Automatisering>): Automatisering {
  return {
    id: "auto",
    naam: "Automation",
    categorie: "Anders",
    doel: "",
    trigger: "",
    systemen: [],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-29T00:00:00.000Z",
    laatstGeverifieerd: "2026-05-29T00:00:00.000Z",
    geverifieerdDoor: "Tester",
    lastSyncedAt: "2026-05-29T00:00:00.000Z",
    ...overrides,
  } as Automatisering;
}

function hubspotSender(): Automatisering {
  return baseAutomation({
    id: "hs-create",
    naam: "Create new deal",
    source: "hubspot",
    categorie: "HubSpot Workflow",
    systemen: ["HubSpot"],
    hubspotWorkflow: {
      name: "Create new deal",
      triggers: [{ label: "Deal meets criteria", source: "HubSpot" }],
      actions: [
        {
          index: 1,
          type: "WEBHOOK",
          label: "Send webhook",
          webhookMethod: "POST",
          webhookPath: "/operations/hubspot/create_new_deal",
        },
      ],
    },
  });
}

function gitlabLinkedEndpoint(): Automatisering {
  return baseAutomation({
    id: "gl-create",
    naam: "New create deal",
    source: "gitlab",
    categorie: "Backend Script",
    systemen: ["GitLab", "API"],
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/operations/hubspot/create_new_deal",
      handler: "new_create_deal",
      api_file: "app/api/operations.py",
      calls: [],
    },
  });
}

function gitlabUnmatchedEndpoint(): Automatisering {
  return baseAutomation({
    id: "gl-unmatched",
    naam: "Check pipeline usage",
    source: "gitlab",
    categorie: "Backend Script",
    systemen: ["GitLab"],
    gitlabEndpoint: {
      method: "GET",
      endpoint: "/internal/check_pipeline_usage",
      handler: "check_pipeline_usage",
      calls: [],
    },
  });
}

function gitlabWithoutEndpoint(): Automatisering {
  return baseAutomation({
    id: "gl-missing",
    naam: "Legacy helper without endpoint",
    source: "gitlab",
    categorie: "Backend Script",
    systemen: ["GitLab"],
    gitlabFilePath: "legacy/helper.py",
  });
}
