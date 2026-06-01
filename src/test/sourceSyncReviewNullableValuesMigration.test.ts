import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260601110000_allow_null_sync_review_values.sql",
);

describe("source sync review nullable value migration", () => {
  it("allows one side of a review diff to be absent", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("ALTER COLUMN old_value_sanitized DROP NOT NULL");
    expect(migration).toContain("ALTER COLUMN new_value_sanitized DROP NOT NULL");
  });
});
