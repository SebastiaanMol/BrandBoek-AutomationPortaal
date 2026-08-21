import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAssociationUrl,
  buildCrmObjectUrl,
  buildDealUrl,
  buildDiagnosisSummaryLines,
  buildOwnerUrl,
  extractAssociationIds,
  findOwnerReferences,
  sanitizeCrmObject,
  sanitizeOwner,
  validateHubSpotDiagnosisRequest,
} from "../../supabase/functions/hubspot-diagnose/sanitize";

const sourcePath = resolve(process.cwd(), "supabase/functions/hubspot-diagnose/index.ts");
const source = readFileSync(sourcePath, "utf8");

describe("hubspot-diagnose edge function", () => {
  it("allows CORS preflight and POST requests only", () => {
    expect(source).toContain('"Access-Control-Allow-Methods": "POST, OPTIONS"');
    expect(source).toContain('if (req.method === "OPTIONS")');
    expect(source).toContain('if (req.method !== "POST")');
  });

  it("uses the existing HubSpot integration token and no browser env token", () => {
    expect(source).toContain('Deno.env.get("SUPABASE_URL")');
    expect(source).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(source).toContain('.eq("type", "hubspot")');
    expect(source).toContain('.eq("status", "connected")');
    expect(source).toContain("integration.token");
    expect(source).not.toContain("VITE_");
  });

  it("does not send mutation requests to HubSpot", () => {
    expect(source).not.toMatch(/\bmethod:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  });

  it("uses read-only HubSpot GET requests through whitelisted URL builders", () => {
    expect(source).toContain("fetch(url");
    expect(source).toMatch(/\bmethod:\s*"GET"/);
    for (const helperName of [
      "buildDealUrl",
      "buildAssociationUrl",
      "buildCrmObjectUrl",
      "buildOwnerUrl",
      "sanitizeCrmObject",
      "sanitizeOwner",
      "findOwnerReferences",
      "buildDiagnosisSummaryLines",
    ]) {
      expect(source).toContain(helperName);
    }
  });

  it("validates bounded diagnosis requests", () => {
    expect(
      validateHubSpotDiagnosisRequest({
        dealIds: [{ id: "61165856536", roleHint: "IB deal" }],
        ownerIds: ["223935335"],
        propertyNames: ["jaarrekeningen_klaar_om_ib_te_maken"],
        expectedStageHints: ["Gecontroleerd & Gefactureerd"],
      }),
    ).toEqual({
      ok: true,
      value: {
        dealIds: [{ id: "61165856536", roleHint: "IB deal" }],
        ownerIds: ["223935335"],
        propertyNames: ["jaarrekeningen_klaar_om_ib_te_maken"],
        expectedStageHints: ["Gecontroleerd & Gefactureerd"],
      },
    });

    expect(validateHubSpotDiagnosisRequest({ dealIds: [], ownerIds: ["1"], propertyNames: [], expectedStageHints: [] }).ok).toBe(false);
    expect(validateHubSpotDiagnosisRequest({ dealIds: [{ id: "1" }, { id: "2" }, { id: "3" }], ownerIds: ["1"], propertyNames: [], expectedStageHints: [] })).toEqual({
      ok: false,
      error: "Maximaal 2 HubSpot deals toegestaan",
    });
    expect(validateHubSpotDiagnosisRequest({ dealIds: [{ id: "1" }], ownerIds: ["1", "2", "3", "4"], propertyNames: [], expectedStageHints: [] })).toEqual({
      ok: false,
      error: "Maximaal 3 HubSpot owners toegestaan",
    });
    expect(
      validateHubSpotDiagnosisRequest({
        dealIds: [{ id: "1" }],
        ownerIds: ["2"],
        propertyNames: ["first_property", "second_property", "third_property", "fourth_property", "fifth_property", "sixth_property"],
        expectedStageHints: [],
      }),
    ).toEqual({
      ok: false,
      error: "Maximaal 5 HubSpot properties toegestaan",
    });
    expect(validateHubSpotDiagnosisRequest({ dealIds: [{ id: "abc" }], ownerIds: ["1"], propertyNames: [], expectedStageHints: [] }).ok).toBe(false);
    expect(validateHubSpotDiagnosisRequest({ dealIds: [{ id: "1" }], ownerIds: ["owner"], propertyNames: [], expectedStageHints: [] }).ok).toBe(false);
    expect(validateHubSpotDiagnosisRequest({ dealIds: [{ id: "1" }], ownerIds: ["2"], propertyNames: ["bad-name"], expectedStageHints: [] }).ok).toBe(false);
    expect(validateHubSpotDiagnosisRequest({ dealIds: [{ id: "1" }], ownerIds: ["2"], propertyNames: ["email"], expectedStageHints: [] }).ok).toBe(false);
    expect(validateHubSpotDiagnosisRequest({ dealIds: [{ id: "1" }], ownerIds: ["2"], propertyNames: ["amount"], expectedStageHints: [] }).ok).toBe(false);
    expect(validateHubSpotDiagnosisRequest({ dealIds: [{ id: "1" }], ownerIds: ["2"], propertyNames: ["customer_email"], expectedStageHints: [] }).ok).toBe(false);
  });

  it("builds only whitelisted read URLs", () => {
    const dealUrl = buildDealUrl("61165856536", ["jaarrekeningen_klaar_om_ib_te_maken", "email"]);
    expect(dealUrl.toString()).toContain("/crm/v3/objects/deals/61165856536?");
    expect(dealUrl.searchParams.get("properties")).toBe("dealstage,hubspot_owner_id,jaarrekeningen_klaar_om_ib_te_maken");
    expect(dealUrl.searchParams.get("propertiesWithHistory")).toBe("jaarrekeningen_klaar_om_ib_te_maken");
    expect(dealUrl.searchParams.get("archived")).toBe("false");
    expect(buildAssociationUrl("deals", "61165856536", "contacts")).toBe("https://api.hubapi.com/crm/v4/objects/deals/61165856536/associations/contacts");
    expect(buildOwnerUrl("223935335", false)).toBe("https://api.hubapi.com/crm/v3/owners/223935335?idProperty=id&archived=false");
    expect(buildOwnerUrl("223935335", true)).toBe("https://api.hubapi.com/crm/v3/owners/223935335?idProperty=id&archived=true");

    const crmObjectCases = [
      ["deal", "deals"],
      ["contact", "contacts"],
      ["company", "companies"],
    ] as const;
    for (const [recordType, pathSegment] of crmObjectCases) {
      const url = buildCrmObjectUrl(recordType, "123");
      expect(url.toString()).toContain(`/crm/v3/objects/${pathSegment}/123?`);
      expect(url.searchParams.get("properties")).toBe("hubspot_owner_id");
      expect(url.searchParams.get("archived")).toBe("false");
    }
  });

  it("sanitizes CRM objects and detects target owner references", () => {
    const record = sanitizeCrmObject(
      "deal",
      {
        id: "61165856536",
        archived: false,
        properties: {
          dealstage: "closedwon",
          hubspot_owner_id: "223935335",
          custom_owner_id: "999",
          eigenaar_contact_id: "223935335",
          user_reference: 12345,
          user_email: "user@example.test",
          user_name: "Test User",
          user_owner_id: "223935335",
          customer_email: "customer@example.test",
          amount: "100000",
          secret_owner: "223935335",
          cookie_owner: "223935335",
          token: "secret",
          authorization_header: "secret",
          password_value: "secret",
        },
        propertiesWithHistory: {
          jaarrekeningen_klaar_om_ib_te_maken: [
            { value: "true", timestamp: "2026-06-20T10:00:00.000Z", sourceType: "AUTOMATION", sourceId: "workflow-1", token: "secret" },
          ],
          other_property: [{ value: "leak", timestamp: "2026-06-20T11:00:00.000Z" }],
        },
      },
      ["jaarrekeningen_klaar_om_ib_te_maken"],
    );

    expect(record).toEqual({
      recordType: "deal",
      id: "61165856536",
      archived: false,
      properties: {
        dealstage: "closedwon",
        hubspot_owner_id: "223935335",
        custom_owner_id: "999",
        eigenaar_contact_id: "223935335",
        jaarrekeningen_klaar_om_ib_te_maken: undefined,
      },
      propertyHistory: {
        jaarrekeningen_klaar_om_ib_te_maken: [
          { value: "true", timestamp: "2026-06-20T10:00:00.000Z", sourceType: "AUTOMATION", sourceId: "workflow-1" },
        ],
      },
      ownerProperties: {
        hubspot_owner_id: "223935335",
        eigenaar_contact_id: "223935335",
        custom_owner_id: "999",
      },
    });
    expect(JSON.stringify(record)).not.toContain("secret");
    for (const propertyName of ["user_email", "user_reference", "user_name", "user_owner_id", "customer_email", "amount", "secret_owner", "cookie_owner"]) {
      expect(record.properties).not.toHaveProperty(propertyName);
      expect(record.ownerProperties).not.toHaveProperty(propertyName);
      expect(JSON.stringify(record)).not.toContain(propertyName);
    }
    expect(findOwnerReferences(record, ["223935335"])).toEqual([
      {
        ownerId: "223935335",
        recordType: "deal",
        recordId: "61165856536",
        propertyName: "hubspot_owner_id",
      },
      {
        ownerId: "223935335",
        recordType: "deal",
        recordId: "61165856536",
        propertyName: "eigenaar_contact_id",
      },
    ]);
  });

  it("sanitizes owners without leaking raw token fields or email", () => {
    const owner = sanitizeOwner(
      "223935335",
      {
        id: "223935335",
        archived: true,
        email: "archived.owner@example.test",
        firstName: "Archived",
        lastName: "Owner",
        accessToken: "secret-token",
        refreshToken: "secret-refresh",
        password: "secret-password",
        teams: [
          {
            id: "team-1",
            name: "Team One",
            primary: true,
            token: "secret",
            authorization: "secret",
          },
          {
            id: 2,
            name: "Team Two",
            primary: false,
            cookie: "secret",
          },
        ],
      },
      "archived",
    );

    expect(owner).toEqual({
      id: "223935335",
      lookup: "archived",
      found: true,
      archived: true,
      firstName: "Archived",
      lastName: "Owner",
      teams: [
        { id: "team-1", name: "Team One", primary: true },
        { id: "2", name: "Team Two", primary: false },
      ],
    });
    expect(owner).not.toHaveProperty("email");
    expect(JSON.stringify(owner)).not.toContain("archived.owner@example.test");
    expect(JSON.stringify(owner)).not.toContain("secret");
    expect(JSON.stringify(owner)).not.toContain("Token");
    expect(JSON.stringify(owner)).not.toContain("authorization");
    expect(JSON.stringify(owner)).not.toContain("cookie");
    expect(JSON.stringify(owner)).not.toContain("password");
  });

  it("extracts and dedupes HubSpot association ids from known response shapes", () => {
    expect(
      extractAssociationIds({
        results: [
          { toObjectId: 101 },
          { to: { objectId: "102" } },
          { id: "103" },
          { toObjectId: "101" },
          { to: { objectId: 102 } },
          { id: "103" },
          { toObjectId: "" },
          { to: { objectId: "   " } },
          { id: null },
        ],
      }),
    ).toEqual(["101", "102", "103"]);
  });

  it("builds diagnosis summary lines from evidence and warnings", () => {
    expect(
      buildDiagnosisSummaryLines({
        suspectedOwnerReferences: [
          {
            ownerId: "223935335",
            recordType: "deal",
            recordId: "61165856536",
            propertyName: "hubspot_owner_id",
          },
        ],
        owners: [
          {
            id: "223935335",
            lookup: "archived",
            found: true,
            archived: true,
            teams: [],
          },
        ],
        warnings: ["Property history niet beschikbaar."],
      }),
    ).toEqual([
      "Gevonden: owner 223935335 staat op deal 61165856536 via hubspot_owner_id.",
      "Waarschijnlijk: owner 223935335 is alleen als archived owner gevonden.",
      "Niet gecontroleerd: Property history niet beschikbaar.",
    ]);
  });
});
