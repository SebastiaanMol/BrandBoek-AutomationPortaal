import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("source_data_incomplete migration", () => {
  it("allows source_data_incomplete in automation_source_findings.type", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260528090000_add_source_data_incomplete_finding_type.sql"),
      "utf8",
    );

    expect(migration).toContain("automation_source_findings_type_check");
    expect(migration).toContain("source_data_incomplete");
  });
});
