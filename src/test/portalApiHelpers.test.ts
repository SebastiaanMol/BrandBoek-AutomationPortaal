import {
  assertAllowedFields,
  buildDryRunPayload,
  buildJsonResponse,
  computeDiff,
  errorResponse,
  mapSyncReviewStatusToDbPatch,
  mergeById,
  mergeByField,
  parseBearerToken,
  redactSecrets,
  requireVersion,
} from "../../supabase/functions/portal-api/helpers";

describe("portal API helpers", () => {
  it("parses bearer tokens and rejects malformed headers", () => {
    expect(parseBearerToken("Bearer abc")).toBe("abc");
    expect(parseBearerToken("Basic abc")).toBeNull();
    expect(parseBearerToken("Bearer abc def")).toBeNull();
    expect(parseBearerToken("Bearer\tabc")).toBeNull();
    expect(parseBearerToken("Bearer abc:def")).toBeNull();
    expect(parseBearerToken(null)).toBeNull();
  });

  it("redacts nested secret values and bearer strings", () => {
    expect(redactSecrets({
      safe: "ok",
      token: "secret",
      "api key": "secret",
      api_key: "secret",
      "api-key": "secret",
      password: "secret",
      secret: "secret",
      nested: { Authorization: "Bearer abc.def" },
      note: "Call with Bearer plain.token and Bearer sk:abc",
    })).toEqual({
      safe: "ok",
      token: "[redacted]",
      "api key": "[redacted]",
      api_key: "[redacted]",
      "api-key": "[redacted]",
      password: "[redacted]",
      secret: "[redacted]",
      nested: { Authorization: "[redacted]" },
      note: "Call with Bearer [redacted] and Bearer [redacted]",
    });
  });

  it("rejects unknown write fields", () => {
    expect(() => assertAllowedFields({ name: "A", placements: [] }, ["name"])).toThrow("Unknown field: placements");
  });

  it("requires If-Match for mutable routes", () => {
    expect(requireVersion("3")).toBe(3);
    expect(() => requireVersion(null)).toThrow("Missing If-Match header");
    expect(() => requireVersion("0")).toThrow("Invalid If-Match header");
    expect(() => requireVersion("-1")).toThrow("Invalid If-Match header");
    expect(() => requireVersion(" 3 ")).toThrow("Invalid If-Match header");
    expect(() => requireVersion("+3")).toThrow("Invalid If-Match header");
    expect(() => requireVersion("1e2")).toThrow("Invalid If-Match header");
    expect(() => requireVersion("2147483648")).toThrow("Invalid If-Match header");
    expect(() => requireVersion("999999999999999999999999")).toThrow("Invalid If-Match header");
    expect(() => requireVersion("3.2")).toThrow("Invalid If-Match header");
    expect(() => requireVersion("abc")).toThrow("Invalid If-Match header");
  });

  it("merges nested arrays by id without dropping unmentioned items", () => {
    expect(mergeById([{ id: "a", label: "A" }, { id: "b", label: "B" }], [{ id: "b", label: "B2" }]))
      .toEqual([{ id: "a", label: "A" }, { id: "b", label: "B2" }]);

    expect(mergeById([{ id: "a", label: "A" }], [{ id: "b", label: "B1" }, { id: "b", label: "B2" }]))
      .toEqual([{ id: "a", label: "A" }, { id: "b", label: "B2" }]);
  });

  it("merges nested arrays by an arbitrary key field without dropping unmentioned items", () => {
    expect(mergeByField(
      [{ key: "a", label: "A" }, { key: "b", label: "B" }],
      [{ key: "b", label: "B2" }],
      "key",
    )).toEqual([{ key: "a", label: "A" }, { key: "b", label: "B2" }]);

    expect(mergeByField(
      [{ key: "a", label: "A" }],
      [{ key: "b", label: "B1" }, { key: "b", label: "B2" }],
      "key",
    )).toEqual([{ key: "a", label: "A" }, { key: "b", label: "B2" }]);
  });

  it("maps sync review status tokens to database columns without ever writing an invalid status value", () => {
    expect(mapSyncReviewStatusToDbPatch("skipped", "2026-01-01T00:00:00.000Z")).toEqual({
      status: "skipped",
      skipped_at: "2026-01-01T00:00:00.000Z",
    });
    expect(mapSyncReviewStatusToDbPatch("selected", "2026-01-01T00:00:00.000Z")).toEqual({
      selected_by_default: true,
    });
    expect(mapSyncReviewStatusToDbPatch("unselected", "2026-01-01T00:00:00.000Z")).toEqual({
      selected_by_default: false,
    });
    for (const token of ["selected", "unselected"] as const) {
      expect(mapSyncReviewStatusToDbPatch(token, "2026-01-01T00:00:00.000Z")).not.toHaveProperty("status");
    }
  });

  it("computes a compact before/after diff", () => {
    expect(computeDiff({ name: "Old", status: "active" }, { name: "New", status: "active" }))
      .toEqual({ name: { before: "Old", after: "New" } });

    expect(computeDiff({ config: { x: 1, y: 2 } }, { config: { y: 2, x: 1 } })).toEqual({});
  });

  it("returns stable JSON envelopes", async () => {
    const response = buildJsonResponse({ data: { ok: true } }, 201);
    expect(response.status).toBe(201);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("if-match");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("PATCH");
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(await response.json()).toEqual({ data: { ok: true } });
  });

  it("does not emit bodies for empty response statuses", async () => {
    const response = buildJsonResponse({}, 204);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("returns stable error envelopes", async () => {
    const response = errorResponse("Unauthorized", "UNAUTHORIZED", 401);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("builds dry-run payloads with a diff and no committed flag", () => {
    expect(buildDryRunPayload({ name: "Old" }, { name: "New" })).toEqual({
      dryRun: true,
      wouldChange: { name: { before: "Old", after: "New" } },
    });
  });
});
