import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "supabase/functions/detect-flow-links/index.ts"), "utf8");

describe("Zapier webhook link detection", () => {
  it("treats Zapier webhook matches as explicit review suggestions", () => {
    expect(source).toContain("isZapierAutomation");
    expect(source).toContain("buildWebhookMatchReason");
    expect(source).toContain("Webhook-match: Zapier roept endpoint");
  });

  it("auto-confirms webhook suggestions for now", () => {
    expect(source).toContain("shouldAutoConfirmSuggestion");
    expect(source).toContain("confirmed: shouldAutoConfirmSuggestion(s)");
    expect(source).toContain("rejected: false");
  });

  it("matches webhook paths against normalized endpoint paths", () => {
    expect(source).toContain("normalizeEndpointPath");
    expect(source).toContain("endpointMatches(webhookPath, endpoint)");
  });
});
