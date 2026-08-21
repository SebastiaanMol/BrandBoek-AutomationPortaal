import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HubSpotDiagnosisRequest } from "@/lib/brandyHubspotDiagnosis";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

const request: HubSpotDiagnosisRequest = {
  dealIds: [{ id: "123456", roleHint: "IB deal" }],
  ownerIds: ["223935335"],
  propertyNames: ["dealstage"],
  expectedStageHints: ["contract sent"],
};

describe("HubSpot diagnosis storage", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.resetModules();
  });

  it("invokes hubspot-diagnose with the request body", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        request,
        deals: [{ id: "123456", name: "IB deal", stage: "contract sent" }],
        associatedRecords: [],
        owners: [{ id: "223935335", email: "owner@example.com" }],
        suspectedOwnerReferences: [],
        warnings: [],
        summaryLines: ["Deal 123456 is assigned to owner@example.com."],
        fetchedAt: "2026-06-22T10:15:00.000Z",
      },
      error: null,
    });
    const { fetchHubSpotDiagnosis } = await import("@/lib/storage/hubspotDiagnosis");

    const result = await fetchHubSpotDiagnosis(request);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("hubspot-diagnose", { body: request });
    expect(result.summaryLines).toEqual(["Deal 123456 is assigned to owner@example.com."]);
  });

  it("throws a readable Edge error body", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "FunctionsHttpError",
        context: {
          json: async () => ({ error: "HubSpot diagnose kon deal 123456 niet ophalen" }),
        },
      },
    });
    const { fetchHubSpotDiagnosis } = await import("@/lib/storage/hubspotDiagnosis");

    await expect(fetchHubSpotDiagnosis(request)).rejects.toThrow("HubSpot diagnose kon deal 123456 niet ophalen");
  });

  it("throws a generic Dutch error when the Edge error body is invalid JSON", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "FunctionsHttpError",
        context: {
          json: async () => {
            throw new SyntaxError("Unexpected token '<'");
          },
        },
      },
    });
    const { fetchHubSpotDiagnosis } = await import("@/lib/storage/hubspotDiagnosis");

    const result = fetchHubSpotDiagnosis(request);
    await expect(result).rejects.toThrow("HubSpot diagnose ophalen is mislukt");
    await expect(result).rejects.not.toThrow("Unexpected token");
  });

  it("throws a generic Dutch error when the Edge error body has no string error", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "FunctionsHttpError",
        context: {
          json: async () => ({ message: "Database timeout" }),
        },
      },
    });
    const { fetchHubSpotDiagnosis } = await import("@/lib/storage/hubspotDiagnosis");

    await expect(fetchHubSpotDiagnosis(request)).rejects.toThrow("HubSpot diagnose ophalen is mislukt");
  });

  it("does not expose technical Supabase context errors", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "FunctionsHttpError",
        context: {
          error: "FunctionsHttpError",
        },
      },
    });
    const { fetchHubSpotDiagnosis } = await import("@/lib/storage/hubspotDiagnosis");

    await expect(fetchHubSpotDiagnosis(request)).rejects.toThrow("HubSpot diagnose ophalen is mislukt");
  });

  it("normalizes missing optional arrays without throwing", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        request,
        fetchedAt: "",
      },
      error: null,
    });
    const { fetchHubSpotDiagnosis } = await import("@/lib/storage/hubspotDiagnosis");

    const result = await fetchHubSpotDiagnosis(request);

    expect(result.deals).toEqual([]);
    expect(result.associatedRecords).toEqual([]);
    expect(result.owners).toEqual([]);
    expect(result.suspectedOwnerReferences).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.summaryLines).toEqual([]);
    expect(result.request).toEqual(request);
    expect(new Date(result.fetchedAt).toString()).not.toBe("Invalid Date");
  });

  it("rejects completely invalid responses with a readable error", async () => {
    invokeMock.mockResolvedValueOnce({
      data: "not an object",
      error: null,
    });
    const { fetchHubSpotDiagnosis } = await import("@/lib/storage/hubspotDiagnosis");

    await expect(fetchHubSpotDiagnosis(request)).rejects.toThrow("HubSpot diagnose antwoord is ongeldig");
  });
});
