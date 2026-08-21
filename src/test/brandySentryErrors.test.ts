import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Automatisering } from "@/lib/types";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

function makeAutomation(overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id: "AUTO-1",
    naam: "Update IB deal",
    categorie: "API",
    doel: "",
    trigger: "",
    systemen: ["API"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-06-19T08:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    externalId: "update_ib_deal",
    ...overrides,
  };
}

describe("Brandy Sentry error lookup", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.resetModules();
  });

  it("recognizes latest Sentry error questions", async () => {
    const { parseSentryErrorQuestion } = await import("@/lib/brandySentryTools");

    expect(parseSentryErrorQuestion("kan je opzoek gaan naar de laatste sentry fout van deze automation")).toEqual({
      wantsLatestSentryError: true,
    });
    expect(parseSentryErrorQuestion("wat is de laatste fout van deze automation?")).toBeNull();
  });

  it("routes contextual latest Sentry error questions through sentry-issues detail", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        issues: [
          {
            id: "old",
            shortId: "AUTOMATIONS-OLD",
            title: "OldError",
            status: "unresolved",
            level: "error",
            count: 1,
            userCount: 0,
            firstSeen: "2026-06-20T08:00:00.000Z",
            lastSeen: "2026-06-20T09:00:00.000Z",
            permalink: "https://brand-boekhouders.sentry.io/issues/old/",
            tags: { automation_id: "AUTO-1" },
          },
          {
            id: "new",
            shortId: "AUTOMATIONS-NEW",
            title: "ApiException: owner not found",
            culprit: "app.service.hubspot.get_owner",
            status: "unresolved",
            level: "error",
            count: 7,
            userCount: 2,
            firstSeen: "2026-06-21T08:00:00.000Z",
            lastSeen: "2026-06-22T09:15:30.000Z",
            permalink: "https://brand-boekhouders.sentry.io/issues/new/",
            metadataText: "owner 223935335 not found for company Brand Boekhouders BV",
            tags: {
              automation_id: "AUTO-1",
              company_name: "Brand Boekhouders BV",
              company_id: "12345",
            },
          },
        ],
        limited: false,
        fetchedAt: "2026-06-22T09:16:00.000Z",
      },
      error: null,
    });
    const { askBrandy } = await import("@/lib/brandy");

    const response = await askBrandy(
      "kan je opzoek gaan naar de laatste sentry fout van deze automation en achterhalen wat er mis ging en welk bedrijf hieraan gekoppeld is",
      [makeAutomation()],
      { automationId: "AUTO-1", automationNaam: "Update IB deal" },
    );

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("sentry-issues", {
      body: { mode: "detail", automationId: "AUTO-1", limit: 25 },
    });
    expect(response.diagnose_modus).toBe(true);
    expect(response.bronnen).toEqual(["Sentry issues", "Automation catalog"]);
    expect(response.entiteiten).toEqual(expect.arrayContaining([
      "automation AUTO-1",
      "issue AUTOMATIONS-NEW",
      "bedrijf Brand Boekhouders BV",
      "company_id 12345",
    ]));
    expect(response.antwoord).toContain("ApiException: owner not found");
    expect(response.antwoord).toContain("22 jun 2026");
    expect(response.antwoord).toContain("11:15:30");
    expect(response.antwoord).toContain("7 events");
    expect(response.antwoord).toContain("Brand Boekhouders BV");
    expect(response.antwoord).toContain("owner 223935335 not found");
  });

  it("states when no company could be found in available Sentry data", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        issues: [
          {
            id: "issue-1",
            title: "TimeoutError",
            status: "unresolved",
            count: 2,
            permalink: "https://brand-boekhouders.sentry.io/issues/1/",
            lastSeen: "2026-06-22T09:15:30.000Z",
            tags: { automation_id: "AUTO-1" },
          },
        ],
        limited: false,
      },
      error: null,
    });
    const { askBrandy } = await import("@/lib/brandy");

    const response = await askBrandy(
      "laatste sentry fout van deze automation",
      [makeAutomation()],
      { automationId: "AUTO-1" },
    );

    expect(response.antwoord).toContain("Geen bedrijf gevonden in de beschikbare Sentry-data");
  });

  it("uses Brandy URL context when the automation list does not contain the selected automation yet", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        issues: [
          {
            id: "issue-1",
            shortId: "AUTOMATIONS-1",
            title: "ApiException",
            status: "unresolved",
            count: 1,
            permalink: "https://brand-boekhouders.sentry.io/issues/1/",
            lastSeen: "2026-06-22T09:15:30.000Z",
            tags: { automation_id: "LEGACY-1" },
          },
        ],
        limited: false,
      },
      error: null,
    });
    const { askBrandy } = await import("@/lib/brandy");

    const response = await askBrandy(
      "kan je opzoek gaan naar de laatste sentry fout van deze auotmation en acherhlane wat er mis ging en welk bedrijf hieraan gekoppeld is",
      [],
      { automationId: "LEGACY-1", automationNaam: "Legacy automation" },
    );

    expect(invokeMock).toHaveBeenCalledWith("sentry-issues", {
      body: { mode: "detail", automationId: "LEGACY-1", limit: 25 },
    });
    expect(response.antwoord).toContain("Legacy automation");
    expect(response.antwoord).toContain("ApiException");
  });

  it("routes Sentry log access questions through the read-only Sentry issues tool", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        issues: [
          {
            id: "issue-log",
            shortId: "AUTOMATIONS-LOG",
            title: "Laatste Sentry log error",
            status: "unresolved",
            count: 3,
            permalink: "https://brand-boekhouders.sentry.io/issues/log/",
            lastSeen: "2026-06-22T09:15:30.000Z",
            tags: { automation_id: "AUTO-1" },
          },
        ],
        limited: false,
      },
      error: null,
    });
    const { askBrandy } = await import("@/lib/brandy");

    const response = await askBrandy(
      "kan je direct de Sentry logs inzien voor deze automation?",
      [makeAutomation()],
      { automationId: "AUTO-1", automationNaam: "Update IB deal" },
    );

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("sentry-issues", {
      body: { mode: "detail", automationId: "AUTO-1", limit: 25 },
    });
    expect(response.antwoord).toContain("Laatste Sentry log error");
    expect(response.antwoord).not.toContain("Ik kan helaas niet direct Sentry logs inzien");
  });

  it("extracts company and owner details from Sentry metadata value text", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        issues: [
          {
            id: "issue-metadata-value",
            shortId: "AUTOMATIONS-META",
            title: "ApiException: HubSpot owner not found",
            culprit: "POST /properties/update_ib_kan_gemaakt_worden",
            status: "unresolved",
            level: "error",
            count: 17,
            userCount: 1,
            firstSeen: "2026-06-19T07:14:02.000Z",
            lastSeen: "2026-06-22T09:25:33.000Z",
            permalink: "https://brand-boekhouders.sentry.io/issues/meta/",
            metadata: {
              value: "Owner 223935335 was not found while processing company Brand Boekhouders B.V. (company_id 987654321)",
            },
            tags: { automation_id: "AUTO-1" },
          },
        ],
        limited: false,
      },
      error: null,
    });
    const { askBrandy } = await import("@/lib/brandy");

    const response = await askBrandy(
      "kan je direct de Sentry logs inzien voor deze automation?",
      [makeAutomation()],
      { automationId: "AUTO-1", automationNaam: "Update IB deal" },
    );

    expect(response.antwoord).toContain("Owner 223935335 was not found");
    expect(response.antwoord).toContain("Brand Boekhouders B.V.");
    expect(response.antwoord).toContain("987654321");
    expect(response.entiteiten).toEqual(expect.arrayContaining([
      "bedrijf Brand Boekhouders B.V.",
      "company_id 987654321",
    ]));
  });
});
