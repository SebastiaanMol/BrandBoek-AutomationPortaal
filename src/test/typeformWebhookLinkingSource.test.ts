import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "supabase/functions/detect-flow-links/index.ts"), "utf8");

describe("Typeform webhook link detection", () => {
  it("treats Typeform webhook matches as confirmed webhook suggestions", () => {
    expect(source).toContain("isTypeformAutomation");
    expect(source).toContain("Webhook-match: Typeform geeft formulierinzending door aan endpoint");
    expect(source).toContain("shouldAutoConfirmSuggestion");
    expect(source).toContain("confirmed: shouldAutoConfirmSuggestion(s)");
  });

  it("uses exact normalized webhook-to-endpoint matching instead of name matching", () => {
    expect(source).toContain("endpointMatches(webhookPath, endpoint)");
    expect(source).toContain("source.webhook_paths");
    expect(source).toContain("target.endpoints");
  });
});
