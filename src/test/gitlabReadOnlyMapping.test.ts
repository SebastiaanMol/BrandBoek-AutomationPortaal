import { describe, expect, it } from "vitest";
import {
  mapGitLabEndpointToAutomationPayload,
  type GitLabEndpointAutomationInput,
} from "../../supabase/functions/_shared/gitlab-readonly";

const endpointAutomation: GitLabEndpointAutomationInput = {
  externalId: "gitlab:app/API/operations.py:new_create_deal:POST:/operations/hubspot/create_new_deal",
  name: "New create deal",
  method: "POST",
  endpoint: "/operations/hubspot/create_new_deal",
  apiFile: "app/API/operations.py",
  handler: "new_create_deal",
  systems: ["HubSpot"],
  phases: ["Sales"],
  blobId: "blob-123",
  calls: [
    {
      depth: 0,
      kind: "await_call",
      from: "app.API.operations::new_create_deal",
      to: "app.hubspot.deals::create_new_deal",
      file: "app/hubspot/deals.py",
    },
    {
      depth: 1,
      kind: "call",
      from: "app.hubspot.deals::create_new_deal",
      to: "app.hubspot.client::call_hubspot_api",
      file: "app/hubspot/client.py",
    },
  ],
};

describe("GitLab read-only mapping", () => {
  it("maps a FastAPI endpoint to functional main copy with technical proof under Logica metadata", () => {
    const payload = mapGitLabEndpointToAutomationPayload(
      endpointAutomation,
      "2026-05-22T08:00:00.000Z",
    );

    expect(payload.source).toBe("gitlab");
    expect(payload.categorie).toBe("Backend Script");
    expect(payload.status).toBe("Actief");
    expect(payload.systemen).toEqual(["GitLab", "Backend", "HubSpot"]);
    expect(payload.endpoints).toEqual(["/operations/hubspot/create_new_deal"]);

    const ordinaryCopy = [
      payload.naam,
      payload.doel,
      payload.trigger_beschrijving,
      ...(payload.stappen ?? []),
    ].join(" ");

    expect(ordinaryCopy).not.toMatch(/POST/i);
    expect(ordinaryCopy).not.toContain("/operations/hubspot/create_new_deal");
    expect(ordinaryCopy).not.toMatch(/new_create_deal|operations\.py|handler|endpoint/i);
    expect(ordinaryCopy).toMatch(/HubSpot|backend|verwerking/i);

    expect(payload.import_proposal.standard).toEqual(
      expect.objectContaining({
        source: "gitlab",
        trigger: expect.stringMatching(/verwerking/i),
        outcome: expect.stringMatching(/HubSpot/i),
        systems: ["GitLab", "Backend", "HubSpot"],
        confidence: expect.objectContaining({
          evidence: "fastapi_endpoint_analysis",
        }),
      }),
    );

    expect(payload.import_proposal.standard.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: expect.stringMatching(/verwerking/i),
          summary: expect.not.stringMatching(/POST|\/operations\/hubspot\/create_new_deal|new_create_deal/i),
        }),
      ]),
    );

    expect(payload.import_proposal.gitlab).toEqual(
      expect.objectContaining({
        endpoint: {
          method: "POST",
          path: "/operations/hubspot/create_new_deal",
          api_file: "app/API/operations.py",
          handler: "new_create_deal",
        },
        calls: endpointAutomation.calls,
        hubspotWrites: expect.any(Array),
        internalCalls: expect.any(Array),
      }),
    );

    expect(payload.import_proposal.gitlab_endpoint).toEqual({
      method: "POST",
      endpoint: "/operations/hubspot/create_new_deal",
      api_file: "app/API/operations.py",
      handler: "new_create_deal",
      calls: endpointAutomation.calls,
    });
  });

  it("keeps helper and service calls as technical logic instead of separate automation payloads", () => {
    const payload = mapGitLabEndpointToAutomationPayload(
      endpointAutomation,
      "2026-05-22T08:00:00.000Z",
    );

    expect(payload.external_id).toBe(endpointAutomation.externalId);
    expect(payload.import_proposal.gitlab.internalCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to: "app.hubspot.deals::create_new_deal",
        }),
      ]),
    );
    expect(JSON.stringify(payload.import_proposal.standard)).not.toContain("app.hubspot.deals::create_new_deal");
  });
});
