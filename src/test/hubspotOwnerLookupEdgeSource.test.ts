import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildHubSpotOwnerUrl,
  sanitizeHubSpotOwner,
  validateHubSpotOwnerLookupRequest,
} from "../../supabase/functions/hubspot-owner-lookup/sanitize";

const sourcePath = resolve(process.cwd(), "supabase/functions/hubspot-owner-lookup/index.ts");
const source = readFileSync(sourcePath, "utf8");

describe("hubspot-owner-lookup edge function", () => {
  it("allows CORS preflight and POST requests only", () => {
    expect(source).toContain('"Access-Control-Allow-Methods": "POST, OPTIONS"');
    expect(source).toContain('if (req.method === "OPTIONS")');
    expect(source).toContain('if (req.method !== "POST")');
  });

  it("uses the existing server-side HubSpot integration token", () => {
    expect(source).toContain('Deno.env.get("SUPABASE_URL")');
    expect(source).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(source).toContain('.eq("type", "hubspot")');
    expect(source).toContain('.eq("status", "connected")');
    expect(source).toContain("integration.token");
    expect(source).not.toContain("VITE_");
  });

  it("uses only the read-only HubSpot owners endpoint", () => {
    expect(source).toContain("buildHubSpotOwnerUrl(ownerId)");
    expect(source).toContain('method: "GET"');
    expect(source).toContain('Authorization: `Bearer ${token}`');
    expect(source).not.toMatch(/\bmethod:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
    expect(source).not.toMatch(/\/crm\/v3\/objects|\/automation\/v[34]\//);
  });

  it("validates numeric owner ids before building the HubSpot URL", () => {
    expect(validateHubSpotOwnerLookupRequest({ ownerId: "223935335" })).toEqual({
      ok: true,
      ownerId: "223935335",
    });
    expect(validateHubSpotOwnerLookupRequest({ ownerId: " 223935335 " })).toEqual({
      ok: true,
      ownerId: "223935335",
    });

    expect(validateHubSpotOwnerLookupRequest({ ownerId: "abc" })).toEqual({
      ok: false,
      error: "Ongeldige HubSpot owner id",
    });
    expect(validateHubSpotOwnerLookupRequest({ ownerId: "223935335/contacts" }).ok).toBe(false);
  });

  it("builds the exact HubSpot owner lookup URL", () => {
    expect(buildHubSpotOwnerUrl("223935335")).toBe(
      "https://api.hubapi.com/crm/v3/owners/223935335?idProperty=id&archived=false",
    );
  });

  it("sanitizes owner responses and excludes raw token-like fields", () => {
    const owner = sanitizeHubSpotOwner({
      id: "223935335",
      email: "owner@example.com",
      firstName: "Sam",
      lastName: "Owner",
      userId: 123,
      userIdIncludingInactive: 456,
      archived: false,
      createdAt: "2026-06-22T08:00:00.000Z",
      updatedAt: "2026-06-22T09:00:00.000Z",
      accessToken: "secret",
      teams: [
        { id: "team-1", name: "Sales", primary: true, token: "secret" },
        { id: 2, name: "", primary: false },
      ],
    });

    expect(owner).toEqual({
      id: "223935335",
      firstName: "Sam",
      lastName: "Owner",
      userId: "123",
      userIdIncludingInactive: "456",
      archived: false,
      createdAt: "2026-06-22T08:00:00.000Z",
      updatedAt: "2026-06-22T09:00:00.000Z",
      teams: [{ id: "team-1", name: "Sales", primary: true }],
    });
    expect(JSON.stringify(owner)).not.toContain("secret");
    expect(JSON.stringify(owner)).not.toContain("owner@example.com");
  });
});
