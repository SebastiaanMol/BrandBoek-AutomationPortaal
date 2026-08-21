import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");
const migration = readdirSync(migrationsDir)
  .filter((name) => name.includes("source_sync_change_items") || name.includes("source_sync_review") || name.includes("legacy_gitlab_sync_review"))
  .map((name) => readFileSync(resolve(migrationsDir, name), "utf8"))
  .join("\n");

describe("source sync change items migration", () => {
  it("creates persistent review items linked to source sync runs", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.source_sync_change_items");
    expect(migration).toContain("sync_run_id UUID NOT NULL REFERENCES public.source_sync_runs(id)");
    expect(migration).toContain("status TEXT NOT NULL DEFAULT 'pending'");
    expect(migration).toContain("selected_by_default BOOLEAN NOT NULL DEFAULT true");
    expect(migration).toContain("payload_sanitized JSONB NOT NULL DEFAULT '{}'::jsonb");
  });

  it("allows only the review change types and statuses used by the UI", () => {
    expect(migration).toContain("'new_automation'");
    expect(migration).toContain("'metadata_changed'");
    expect(migration).toContain("'route_changed'");
    expect(migration).toContain("'source_data_incomplete'");
    expect(migration).toContain("'source_missing'");
    expect(migration).toContain("'legacy_gitlab_record'");
    expect(migration).toContain("'pending'");
    expect(migration).toContain("'applied'");
    expect(migration).toContain("'skipped'");
  });

  it("adds GitLab legacy cleanup columns used by the deployed sync function", () => {
    expect(migration).toContain("cleanup_delete_candidate");
    expect(migration).toContain("cleanup_delete_candidate_at");
  });
});
