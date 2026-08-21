import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HubSpotDiagnosisResult } from "@/lib/storage/hubspotDiagnosis";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

describe("Brandy HubSpot diagnosis parser", () => {
  it("extracts deal ids, owner ids, properties, and role hints from free text", async () => {
    const { parseHubSpotDiagnosisQuestion } = await import("@/lib/brandyHubspotDiagnosis");

    const result = parseHubSpotDiagnosisQuestion(`
      Check eerst de IB deal 61165856536.
      Check daarna de Jaarrekening deal ID 61186289939.
      Zoek property jaarrekeningen_klaar_om_ib_te_maken.
      De fout gaat over owner ID 223935335.
    `);

    expect(result).toEqual({
      dealIds: [
        { id: "61165856536", roleHint: "IB deal" },
        { id: "61186289939", roleHint: "Jaarrekening deal" },
      ],
      ownerIds: ["223935335"],
      propertyNames: ["jaarrekeningen_klaar_om_ib_te_maken"],
      expectedStageHints: [],
    });
  });

  it("extracts an expected Jaarrekening stage when the text mentions one", async () => {
    const { parseHubSpotDiagnosisQuestion } = await import("@/lib/brandyHubspotDiagnosis");

    const result = parseHubSpotDiagnosisQuestion(`
      Zoek Jaarrekening deal 61186289939 en controleer stage Gecontroleerd & Gefactureerd.
      Owner 223935335 lijkt kapot.
    `);

    expect(result?.expectedStageHints).toEqual(["Gecontroleerd & Gefactureerd"]);
  });

  it("rejects unrelated text and owner-only lookups without deal context", async () => {
    const { parseHubSpotDiagnosisQuestion } = await import("@/lib/brandyHubspotDiagnosis");

    expect(parseHubSpotDiagnosisQuestion("wat betekent automation 61165856536?")).toBeNull();
    expect(parseHubSpotDiagnosisQuestion("zoek HubSpot owner 223935335 op")).toBeNull();
    expect(parseHubSpotDiagnosisQuestion("waar staat deal 61165856536 bij eigenaar 223935335?")).toBeNull();
    expect(parseHubSpotDiagnosisQuestion("waar staat HubSpot deal 61165856536 bij eigenaar 223935335?")).toBeNull();
  });

  it("enforces V1 limits deterministically", async () => {
    const { parseHubSpotDiagnosisQuestion } = await import("@/lib/brandyHubspotDiagnosis");

    const result = parseHubSpotDiagnosisQuestion(`
      HubSpot diagnose deal 111 deal 222 deal 333
      owner 444 owner 555 owner 666 owner 777
      property a_b property c_d property e_f property g_h property i_j property k_l
    `);

    expect(result).toEqual({
      dealIds: [
        { id: "111", roleHint: "deal" },
        { id: "222", roleHint: "deal" },
      ],
      ownerIds: ["444", "555", "666"],
      propertyNames: ["a_b", "c_d", "e_f", "g_h", "i_j"],
      expectedStageHints: [],
    });
  });

  it("does not let duplicate deal ids consume the max deal limit", async () => {
    const { parseHubSpotDiagnosisQuestion } = await import("@/lib/brandyHubspotDiagnosis");

    const result = parseHubSpotDiagnosisQuestion(`
      HubSpot diagnose deal 111 deal 111 deal 222
      owner 444
    `);

    expect(result?.dealIds).toEqual([
      { id: "111", roleHint: "deal" },
      { id: "222", roleHint: "deal" },
    ]);
  });

  it("returns duplicate owner ids and property names once", async () => {
    const { parseHubSpotDiagnosisQuestion } = await import("@/lib/brandyHubspotDiagnosis");

    const result = parseHubSpotDiagnosisQuestion(`
      HubSpot diagnose deal 111
      owner 444 eigenaar 444 owner 555
      property jaarrekeningen_klaar_om_ib_te_maken property jaarrekeningen_klaar_om_ib_te_maken property extra_property_name
    `);

    expect(result?.ownerIds).toEqual(["444", "555"]);
    expect(result?.propertyNames).toEqual([
      "jaarrekeningen_klaar_om_ib_te_maken",
      "extra_property_name",
    ]);
  });

  it("keeps a specific role hint when a duplicate deal id is later named as an IB deal", async () => {
    const { parseHubSpotDiagnosisQuestion } = await import("@/lib/brandyHubspotDiagnosis");

    const result = parseHubSpotDiagnosisQuestion(`
      HubSpot diagnose deal 111 en later IB deal 111
      owner 444
    `);

    expect(result?.dealIds).toEqual([{ id: "111", roleHint: "IB deal" }]);
  });
});

describe("Brandy HubSpot diagnosis routing", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.resetModules();
  });

  it("routes diagnosis prompts through hubspot-diagnose before owner lookup or brandy-ask", async () => {
    const request = {
      dealIds: [{ id: "61165856536", roleHint: "IB deal" }],
      ownerIds: ["223935335"],
      propertyNames: ["jaarrekeningen_klaar_om_ib_te_maken"],
      expectedStageHints: [],
    };
    invokeMock.mockResolvedValueOnce({
      data: {
        request,
        deals: [{ id: "61165856536", roleHint: "IB deal", fetchStatus: "found" }],
        associatedRecords: [],
        owners: [{ id: "223935335", lookup: "active", found: true, email: "hidden@example.com", teams: [] }],
        suspectedOwnerReferences: [],
        warnings: [],
        summaryLines: ["IB deal 61165856536 verwijst naar owner 223935335."],
        fetchedAt: "2026-06-22T10:15:00.000Z",
      },
      error: null,
    });
    const { askBrandy } = await import("@/lib/brandy");

    const response = await askBrandy(`
      HubSpot diagnose: controleer IB deal 61165856536 met owner 223935335 en property jaarrekeningen_klaar_om_ib_te_maken.
    `, []);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("hubspot-diagnose", { body: request });
    expect(invokeMock).not.toHaveBeenCalledWith("hubspot-owner-lookup", expect.anything());
    expect(invokeMock).not.toHaveBeenCalledWith("brandy-ask", expect.anything());
    expect(response.diagnose_modus).toBe(true);
    expect(response.entiteiten).toEqual(expect.arrayContaining(["deal 61165856536", "owner 223935335"]));
  });

  it("keeps HubSpot deal and owner questions without diagnosis intent on normal Brandy", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        antwoord: "Normaal Brandy antwoord",
        bronnen: [],
        entiteiten: [],
        zekerheid: "gemiddeld",
      },
      error: null,
    });
    const { askBrandy } = await import("@/lib/brandy");

    const question = "waar staat HubSpot deal 61165856536 bij eigenaar 223935335?";
    const response = await askBrandy(question, []);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("brandy-ask", {
      body: { vraag: question, context: undefined, automations: [] },
    });
    expect(response.antwoord).toBe("Normaal Brandy antwoord");
  });

  it("answers BTW Open to Gegevens gereed questions with a complete evidence-first transition checklist", async () => {
    const { askBrandy } = await import("@/lib/brandy");

    const response = await askBrandy(
      "Welke voorwaarden heeft een BTW deal om van Open naar Gegevens gereed te gaan? Volgens mij is het niet alleen bankrekening.",
      []
    );

    expect(invokeMock).not.toHaveBeenCalled();
    expect(response.antwoord).toContain("bankkoppeling_status");
    expect(response.antwoord).toContain("bankkoppeling_verlopen_datum");
    expect(response.antwoord).toContain("year");
    expect(response.antwoord).toContain("quarter");
    expect(response.antwoord).toContain("btw_2_maanden_geboekt_huidig_kwartaal");
    expect(response.antwoord).toContain("company");
    expect(response.antwoord).toContain("2 maanden geboekt");
    expect(response.antwoord).toContain("Open");
    expect(response.bronnen).toEqual(expect.arrayContaining([
      "docs/runtime-orchestration/worker-profiles.json",
      "src/lib/generatedPythonCodePathAnalysis.ts",
    ]));
    expect(response.entiteiten).toEqual(expect.arrayContaining([
      "BTW pipeline",
      "Gegevens gereed",
      "route_btw_by_deal_id_and_update",
    ]));
    expect(response.zekerheid).toBe("hoog");
  });

  it("formats summary, evidence, owner statuses, warnings, and fetched timestamp without sensitive owner email", async () => {
    const { buildHubSpotDiagnosisBrandyResponse } = await import("@/lib/brandyHubspotDiagnosis");

    const result: HubSpotDiagnosisResult = {
      request: {
        dealIds: [{ id: "61165856536", roleHint: "IB deal" }],
        ownerIds: ["223935335"],
        propertyNames: ["jaarrekeningen_klaar_om_ib_te_maken"],
        expectedStageHints: ["Gecontroleerd & Gefactureerd"],
      },
      deals: [
        {
          id: "61165856536",
          roleHint: "IB deal",
          fetchStatus: "found",
          dealstage: "appointmentscheduled",
          ownerProperties: { hubspot_owner_id: "223935335" },
          propertyValues: { jaarrekeningen_klaar_om_ib_te_maken: "false" },
          propertyHistory: {},
          associationCounts: { contacts: 1, companies: 0, deals: 1 },
        },
      ],
      associatedRecords: [],
      owners: [
        {
          id: "223935335",
          lookup: "archived",
          found: true,
          archived: true,
          email: "owner@example.com",
          firstName: "Sam",
          lastName: "Owner",
          teams: [{ id: "team-1", name: "Sales", primary: true }],
        },
      ],
      suspectedOwnerReferences: [
        {
          ownerId: "223935335",
          recordType: "deal",
          recordId: "61165856536",
          propertyName: "hubspot_owner_id",
        },
      ],
      warnings: ["Owner 223935335 is gearchiveerd."],
      summaryLines: ["IB deal 61165856536 heeft owner 223935335 op hubspot_owner_id."],
      fetchedAt: "2026-06-22T10:15:00.000Z",
    };

    const response = buildHubSpotDiagnosisBrandyResponse(result);

    expect(response.antwoord).toContain("HubSpot diagnose");
    expect(response.antwoord).toContain("Sam Owner");
    expect(response.antwoord).toContain("gearchiveerd");
    expect(response.antwoord).toContain("IB deal 61165856536 heeft owner 223935335");
    expect(response.antwoord).toContain("Owner 223935335 is gearchiveerd.");
    expect(response.antwoord).toContain("Opgehaald:");
    expect(response.antwoord).not.toContain("owner@example.com");
    expect(response.antwoord).not.toContain("propertyValues");
    expect(response.entiteiten).toEqual(expect.arrayContaining([
      "deal 61165856536",
      "owner 223935335",
      "property jaarrekeningen_klaar_om_ib_te_maken",
    ]));
    expect(response.bronnen).toContain("HubSpot diagnose");
    expect(response.zekerheid).toBe("gemiddeld");
    expect(response.diagnose_modus).toBe(true);
  });
});
