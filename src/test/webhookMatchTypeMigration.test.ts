import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("automation_links webhook match type migration", () => {
  it("allows saved concept journeys to persist webhook links", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260529120000_allow_webhook_automation_links.sql"),
      "utf8",
    );

    expect(migration).toContain("automation_links_match_type_check");
    expect(migration).toContain("'webhook'");
    expect(migration).toContain("'exact'");
    expect(migration).toContain("'manual'");
  });
});
