import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSentryQuery,
  sanitizeSentryIssue,
  validateSentryIssuesRequest,
} from "../../supabase/functions/sentry-issues/sanitize";

const sourcePath = resolve(process.cwd(), "supabase/functions/sentry-issues/index.ts");
const source = readFileSync(sourcePath, "utf8");
const sanitizerPath = resolve(process.cwd(), "supabase/functions/sentry-issues/sanitize.ts");
const sanitizerSource = readFileSync(sanitizerPath, "utf8");
const envExamplePath = resolve(process.cwd(), ".env.example");
const envExampleSource = readFileSync(envExamplePath, "utf8");

describe("sentry-issues edge function", () => {
  it("allows CORS preflight and POST requests only", () => {
    expect(source).toContain('"Access-Control-Allow-Methods": "POST, OPTIONS"');
    expect(source).toContain('if (req.method === "OPTIONS")');
    expect(source).toContain('if (req.method !== "POST")');
  });

  it("reads Sentry configuration from server-side Supabase secrets only", () => {
    expect(source).toContain('Deno.env.get("SENTRY_AUTH_TOKEN")');
    expect(source).toContain('Deno.env.get("SENTRY_ORG")');
    expect(source).toContain('Deno.env.get("SENTRY_PROJECT")');
    expect(source).not.toContain("VITE_SENTRY");
  });

  it("does not expose a Sentry read token placeholder in .env.example", () => {
    expect(envExampleSource).not.toMatch(/^SENTRY_AUTH_TOKEN\s*=/m);
    expect(envExampleSource).not.toMatch(/^VITE_.*SENTRY.*TOKEN\s*=/m);
  });

  it("uses the read-only Sentry organization issues API", () => {
    expect(source).toContain("https://sentry.io/api/0/organizations/${encodeURIComponent(org)}/issues/");
    expect(source).toContain('url.searchParams.set("query", buildSentryQuery(mode, automationId))');
    expect(source).toContain('url.searchParams.set("sort", "date")');
    expect(source).toContain('url.searchParams.set("project", project)');
    expect(source).toContain('method: "GET"');
    expect(source).toContain('Authorization: `Bearer ${token}`');
  });

  it("adds the automation tag search term for detail requests with an automation id", () => {
    expect(buildSentryQuery("overview")).toBe("is:unresolved");
    expect(buildSentryQuery("detail", "AUTO-1")).toBe("is:unresolved tags[automation_id]:AUTO-1");
  });

  it("rejects detail query construction without an automation id", () => {
    expect(() => buildSentryQuery("detail")).toThrow("Missing automation id");
    expect(() => buildSentryQuery("detail", "   ")).toThrow("Missing automation id");
  });

  it("rejects malformed detail automation ids before building a Sentry query", () => {
    [
      "AUTO 1",
      'AUTO"1',
      "AUTO:1",
      "AUTO-1 OR is:unresolved",
      "AUTO-1*",
    ].forEach((automationId) => {
      expect(() => buildSentryQuery("detail", automationId)).toThrow("Invalid automation id");
    });

    expect(buildSentryQuery("detail", "  AUTO_1-2  ")).toBe("is:unresolved tags[automation_id]:AUTO_1-2");
  });

  it("does not send mutation requests or resolve issues in Sentry", () => {
    expect(source).not.toMatch(/\bmethod:\s*["'](?:PUT|PATCH|DELETE)["']/);
    expect(source).not.toMatch(/\/(?:resolve|resolved|unresolve|bulk|merge)\b/i);
    expect(source).not.toContain("response.text()");
  });

  it("sanitizes issues before returning them and excludes raw event payload fields", () => {
    expect(source).toContain("sanitizeSentryIssue");
    expect(source).toContain(".map(sanitizeSentryIssue)");
    const returnedFields = sanitizerSource.slice(
      sanitizerSource.indexOf("return {"),
      sanitizerSource.indexOf("metadataText: buildMetadataText"),
    );
    expect(returnedFields).not.toMatch(/\b(stacktrace|stackTrace|entries|headers|cookies|requestBody|raw)\s*:/);
  });

  it("returns required string defaults for status and permalink", () => {
    expect(sanitizerSource).toContain('status: string;');
    expect(sanitizerSource).toContain('permalink: string;');
    expect(sanitizerSource).toContain('status: optionalString(record.status) ?? "unknown"');
    expect(sanitizerSource).toContain('permalink: optionalString(record.permalink) ?? ""');
  });

  it("filters unsafe tag keys while preserving matching and diagnostic tags", () => {
    const tagsSource = sanitizerSource.slice(
      sanitizerSource.indexOf("const ALLOWED_TAG_KEYS"),
      sanitizerSource.indexOf("const SENSITIVE_METADATA_KEYS"),
    );

    [
      "automation_id",
      "automation_source",
      "automation_status",
      "automation_action",
      "environment",
      "runtime",
      "server_name",
      "transaction",
      "logger",
      "level",
      "release",
    ].forEach((safeKey) => {
      expect(tagsSource).toContain(`"${safeKey}"`);
    });

    [
      "stacktrace",
      "entries",
      "headers",
      "cookies",
      "request_body",
      "raw_payload",
      "token",
      "secret",
      "authorization",
      "email",
    ].forEach((unsafeKey) => {
      expect(tagsSource).not.toContain(`"${unsafeKey}"`);
    });

    expect(sanitizerSource).toContain("ALLOWED_TAG_KEYS.has(normalizedKey)");
    expect(sanitizerSource).toContain("sanitizeTagKey");
  });

  it("executes tag sanitization and preserves only useful allowed tags", () => {
    const issue = sanitizeSentryIssue({
      tags: [
        { key: "automation_id", value: "auto-123" },
        { key: "environment", value: "production" },
        { key: "level", value: "error" },
        { key: "headers", value: "Authorization: Bearer secret" },
        { key: "cookies", value: "sessionid=secret" },
        { key: "request_body", value: '{"password":"secret"}' },
        { key: "raw", value: "full event payload" },
        { key: "token", value: "dummy_github_token_abcdefghijklmnopqrstuvwxyz123456" },
        { key: "authorization", value: "Bearer secret" },
      ],
    });

    expect(issue.tags).toEqual({
      automation_id: "auto-123",
      environment: "production",
      level: "error",
    });
  });

  it("redacts sensitive metadataText values and caps length", () => {
    const issue = sanitizeSentryIssue({
      metadata: {
        type: "RuntimeError",
        value:
          "Authorization: Bearer dummy_stripe_key_abcdefghijklmnopqrstuvwxyz1234567890 contact admin@example.com Cookie: sid=abc123; session=def456 password=hunter2 secret=supersecret api_key=key_abcdefghijklmnopqrstuvwxyz1234567890 webhook payload " +
          "x".repeat(800),
        filename: "/api/webhook/handler.ts",
        function: "runAutomation",
      },
    });

    expect(issue.metadataText).toBeDefined();
    expect(issue.metadataText?.length).toBeLessThanOrEqual(240);
    expect(issue.metadataText).toContain("[redacted]");
    expect(issue.metadataText).not.toMatch(/Bearer\s+\S+/i);
    expect(issue.metadataText).not.toContain("admin@example.com");
    expect(issue.metadataText).not.toMatch(/Cookie:/i);
    expect(issue.metadataText).not.toMatch(/password\s*=/i);
    expect(issue.metadataText).not.toMatch(/secret\s*=/i);
    expect(issue.metadataText).not.toMatch(/api_key\s*=/i);
    expect(issue.metadataText).not.toContain("webhook payload");
  });

  it("redacts sensitive title and culprit display values and caps length", () => {
    const issue = sanitizeSentryIssue({
      title:
        "Failed for admin@example.com Authorization: Bearer dummy_stripe_key_abcdefghijklmnopqrstuvwxyz1234567890 Cookie: sid=abc123 token=dummy_github_token_abcdefghijklmnopqrstuvwxyz123456 " +
        "x".repeat(800),
      culprit:
        "https://example.com/api/run?email=admin@example.com&access_token=dummy_github_token_abcdefghijklmnopqrstuvwxyz123456 Cookie: sid=abc123 Bearer dummy_stripe_key_abcdefghijklmnopqrstuvwxyz1234567890",
    });

    expect(issue.title).toBeDefined();
    expect(issue.title.length).toBeLessThanOrEqual(240);
    expect(issue.title).toContain("[redacted]");
    expect(issue.title).not.toMatch(/Bearer\s+\S+/i);
    expect(issue.title).not.toContain("admin@example.com");
    expect(issue.title).not.toMatch(/Cookie:/i);
    expect(issue.title).not.toMatch(/token\s*=/i);
    expect(issue.title).not.toContain("dummy_github_token_abcdefghijklmnopqrstuvwxyz123456");

    expect(issue.culprit).toBeDefined();
    expect(issue.culprit?.length).toBeLessThanOrEqual(240);
    expect(issue.culprit).toContain("[redacted]");
    expect(issue.culprit).not.toMatch(/Bearer\s+\S+/i);
    expect(issue.culprit).not.toContain("admin@example.com");
    expect(issue.culprit).not.toMatch(/Cookie:/i);
    expect(issue.culprit).not.toMatch(/access_token\s*=/i);
    expect(issue.culprit).not.toContain("dummy_github_token_abcdefghijklmnopqrstuvwxyz123456");
  });

  it("defaults title when redaction leaves no display text and omits empty culprit", () => {
    const issue = sanitizeSentryIssue({
      title: "Authorization: Bearer dummy_stripe_key_abcdefghijklmnopqrstuvwxyz1234567890",
      culprit: "Cookie: sid=abc123",
    });

    expect(issue.title).toBe("Sentry issue");
    expect(issue.culprit).toBeUndefined();
  });

  it("always returns string status and permalink values", () => {
    const issue = sanitizeSentryIssue({
      status: 500,
      permalink: null,
    });

    expect(issue.status).toBe("unknown");
    expect(issue.permalink).toBe("");
  });

  it("validates unsupported request modes and malformed limits", () => {
    expect(validateSentryIssuesRequest({ mode: "detail", limit: 10 })).toEqual({
      ok: false,
      error: "Missing automation id",
    });
    expect(validateSentryIssuesRequest({ mode: "detail", automationId: "   ", limit: 10 })).toEqual({
      ok: false,
      error: "Missing automation id",
    });
    expect(validateSentryIssuesRequest({ mode: "detail", automationId: "AUTO-1", limit: 10 })).toEqual({
      ok: true,
      value: { mode: "detail", automationId: "AUTO-1", limit: 10 },
    });
    [
      "AUTO 1",
      'AUTO"1',
      "AUTO:1",
      "AUTO-1 OR is:unresolved",
      "AUTO-1*",
    ].forEach((automationId) => {
      expect(validateSentryIssuesRequest({ mode: "detail", automationId, limit: 10 })).toEqual({
        ok: false,
        error: "Invalid automation id",
      });
    });
    expect(validateSentryIssuesRequest({ mode: "delete" })).toEqual({
      ok: false,
      error: "Unsupported mode",
    });
    expect(validateSentryIssuesRequest({ limit: "25" })).toEqual({
      ok: false,
      error: "Invalid limit",
    });
    expect(validateSentryIssuesRequest({ limit: 101 })).toEqual({
      ok: false,
      error: "Invalid limit",
    });
  });

  it("returns generic client-visible validation errors while logging details server-side", () => {
    expect(source).toContain('console.warn("sentry-issues validation error:", request.error)');
    expect(source).toContain('return jsonResponse({ error: "Ongeldig Sentry issues verzoek" }, 400)');
    expect(source).not.toContain("return jsonResponse({ error: request.error }, 400)");
  });

  it("returns only sanitized upstream Sentry status details to the portal", () => {
    expect(source).toContain("class SentryApiError extends Error");
    expect(source).toContain("error instanceof SentryApiError");
    expect(source).toContain('`Sentry API gaf status ${error.status}`');
    expect(source).not.toContain("await response.text()");
  });
});
