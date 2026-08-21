import { describe, expect, it, vi, beforeEach } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

describe("Brandy HubSpot owner lookup", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.resetModules();
  });

  it("recognizes explicit HubSpot owner lookup questions", async () => {
    const { parseHubSpotOwnerLookupQuestion } = await import("@/lib/brandyHubspotTools");

    expect(parseHubSpotOwnerLookupQuestion("GET https://api.hubapi.com/crm/v3/owners/223935335?idProperty=id&archived=false")).toBe("223935335");
    expect(parseHubSpotOwnerLookupQuestion("zoek HubSpot owner 223935335 op")).toBe("223935335");
    expect(parseHubSpotOwnerLookupQuestion("wie is eigenaar 223935335 in hubspot?")).toBe("223935335");
  });

  it("does not treat arbitrary ids as HubSpot owner lookups", async () => {
    const { parseHubSpotOwnerLookupQuestion } = await import("@/lib/brandyHubspotTools");

    expect(parseHubSpotOwnerLookupQuestion("toon automation 223935335")).toBeNull();
    expect(parseHubSpotOwnerLookupQuestion("wat betekent deal 223935335?")).toBeNull();
    expect(parseHubSpotOwnerLookupQuestion("waar staat HubSpot deal 61165856536 bij eigenaar 223935335?")).toBeNull();
    expect(parseHubSpotOwnerLookupQuestion("zoek HubSpot owner abc op")).toBeNull();
  });

  it("routes owner lookup questions through the read-only owner function instead of brandy-ask", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        owner: {
          id: "223935335",
          email: "owner@example.com",
          firstName: "Sam",
          lastName: "Owner",
          archived: false,
          teams: [{ id: "team-1", name: "Sales", primary: true }],
        },
        fetchedAt: "2026-06-22T10:15:00.000Z",
      },
      error: null,
    });
    const { askBrandy } = await import("@/lib/brandy");

    const response = await askBrandy("zoek HubSpot owner 223935335 op", []);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("hubspot-owner-lookup", {
      body: { ownerId: "223935335" },
    });
    expect(response.zekerheid).toBe("hoog");
    expect(response.bronnen).toEqual(["HubSpot owners API"]);
    expect(response.entiteiten).toContain("223935335");
    expect(response.antwoord).toContain("Sam Owner");
    expect(response.antwoord).not.toContain("owner@example.com");
    expect(response.entiteiten).not.toContain("owner@example.com");
    expect(response.antwoord).toContain("Sales");
  });

  it("uses a generic Dutch owner lookup error when the edge error body is unusable", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "FunctionsHttpError",
        context: {
          json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected end of JSON input")),
        },
      },
    });
    const { askBrandy } = await import("@/lib/brandy");

    await expect(askBrandy("zoek HubSpot owner 223935335 op", [])).rejects.toThrow(
      "HubSpot owner ophalen is mislukt",
    );
  });

  it("keeps normal questions on the existing Brandy answer function", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        antwoord: "Normaal antwoord",
        bronnen: [],
        entiteiten: [],
        zekerheid: "gemiddeld",
      },
      error: null,
    });
    const { askBrandy } = await import("@/lib/brandy");

    const response = await askBrandy("Welke automations hebben errors?", []);

    expect(invokeMock).toHaveBeenCalledWith("brandy-ask", {
      body: { vraag: "Welke automations hebben errors?", context: undefined, automations: [] },
    });
    expect(response.antwoord).toBe("Normaal antwoord");
  });
});
