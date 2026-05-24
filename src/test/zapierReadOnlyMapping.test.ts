import { describe, expect, it } from "vitest";
import {
  getNextZapierPageUrl,
  mapZapierZapToAutomationPayload,
  normalizeZapierApiResponse,
  zapierReadOnlyHeaders,
} from "../../supabase/functions/_shared/zapier-readonly";

describe("Zapier read-only mapping", () => {
  it("maps a Zap into a read-only automation payload", () => {
    const payload = mapZapierZapToAutomationPayload({
      id: "123",
      title: "Nieuwe lead naar HubSpot deal",
      is_enabled: true,
      steps: [
        {
          title: "Catch Hook",
          app: { name: "Webhooks by Zapier" },
          params: { url: "https://example.test/wefact/hubspot/upsert_debtor" },
        },
        { title: "Find company", app: { name: "HubSpot" } },
      ],
    }, "2026-05-19T10:00:00.000Z");

    expect(payload.source).toBe("zapier");
    expect(payload.categorie).toBe("Zapier Zap");
    expect(payload.status).toBe("Actief");
    expect(payload.systemen).toEqual(["Zapier", "Webhooks by Zapier", "HubSpot"]);
    expect(payload.webhook_paths).toEqual(["/wefact/hubspot/upsert_debtor"]);
    expect(payload.import_proposal.read_only).toBe(true);
    expect(payload.doel).toContain("alleen uitgelezen");
  });

  it("maps disabled Zaps as inactive automations", () => {
    const payload = mapZapierZapToAutomationPayload({
      id: "456",
      name: "Uitgeschakelde Zap",
      status: "disabled",
      steps: [],
    }, "2026-05-19T10:00:00.000Z");

    expect(payload.status).toBe("Uitgeschakeld");
    expect(payload.naam).toBe("Uitgeschakelde Zap");
  });

  it("normalizes common Zapier list response shapes", () => {
    expect(normalizeZapierApiResponse({ zaps: [{ id: 1 }] })).toHaveLength(1);
    expect(normalizeZapierApiResponse({ results: [{ id: 2 }] })).toHaveLength(1);
    expect(normalizeZapierApiResponse({ data: [{ id: 3 }] })).toHaveLength(1);
    expect(normalizeZapierApiResponse({ items: [{ id: 4 }] })).toHaveLength(1);
    expect(normalizeZapierApiResponse([{ data: [{ id: 5 }] }])).toEqual([{ id: 5 }]);
  });

  it("uses bearer auth instead of API-key style headers", () => {
    expect(zapierReadOnlyHeaders("token")).toEqual({
      Accept: "application/json",
      Authorization: "Bearer token",
    });
  });

  it("rejects external absolute pagination URLs", () => {
    expect(getNextZapierPageUrl({
      links: { next: "https://evil.example/zaps" },
    })).toBeNull();
  });

  it("rejects protocol-relative pagination URLs", () => {
    expect(getNextZapierPageUrl({
      links: { next: "//evil.example/zaps" },
    })).toBeNull();
  });

  it("accepts Zapier API pagination URLs and relative pagination paths", () => {
    expect(getNextZapierPageUrl({
      links: { next: "https://api.zapier.com/v2/zaps?page=2" },
    })).toBe("https://api.zapier.com/v2/zaps?page=2");

    expect(getNextZapierPageUrl({
      links: { next: "/v2/zaps?page=3" },
    })).toBe("https://api.zapier.com/v2/zaps?page=3");
  });
});
