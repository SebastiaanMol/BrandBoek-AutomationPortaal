import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "supabase/functions/typeform-sync/index.ts"), "utf8");
const helperSource = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/portal-owned-sync.ts"), "utf8");

describe("typeform-sync edge function", () => {
  it("uses Typeform read-only Forms, Form detail and Webhooks APIs", () => {
    expect(source).toContain("../_shared/typeform-readonly.ts");
    expect(source).toContain("https://api.typeform.com/forms?page_size=200");
    expect(source).toContain("/forms/${formId}");
    expect(source).toContain("/forms/${formId}/webhooks");
    expect(source).toContain("typeformReadOnlyHeaders");
    expect(source).toContain("mapTypeformFormToAutomationPayload");
  });

  it("does not retrieve Typeform responses or write back to Typeform", () => {
    expect(source).not.toContain("/responses");
    expect(source).not.toMatch(/fetch\([^)]*method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/s);
  });

  it("stores Typeform discoveries as import proposals instead of updating automations", () => {
    expect(source).toContain("recordPortalOwnedSync");
    expect(helperSource).toContain("automation_import_proposals");
    expect(helperSource).toContain("webhook_paths");
    expect(source).not.toContain('import_status: "approved"');
    expect(source).not.toMatch(/\.from\(["']automatiseringen["']\)\s*\.\s*update/s);
  });
});
