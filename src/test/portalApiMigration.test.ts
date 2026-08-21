import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("portal API v2 migration", () => {
  const source = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260817120000_portal_api_v2.sql"),
    "utf8",
  );
  const archiveRpcSource = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260817121000_portal_api_archive_automation_rpc.sql"),
    "utf8",
  );
  const archiveRpcReturnPlacementsSource = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260817130000_portal_api_archive_rpc_return_removed_placements.sql"),
    "utf8",
  );

  it("adds version columns to mutable resources", () => {
    expect(source).toContain("ALTER TABLE public.automatiseringen");
    expect(source).toContain("ADD COLUMN IF NOT EXISTS api_version integer NOT NULL DEFAULT 1");
    expect(source).toContain("ALTER TABLE public.process_state");
    expect(source).toContain("ALTER TABLE public.flows");
    expect(source).toContain("ADD COLUMN IF NOT EXISTS api_chain JSONB NOT NULL DEFAULT '[]'");
    expect(source).toContain("ALTER TABLE public.source_sync_change_items");
  });

  it("creates automation placements and audit log tables", () => {
    expect(source).toContain("CREATE TABLE IF NOT EXISTS public.automation_placements");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS public.portal_api_audit_log");
    expect(source).toContain("automation_id TEXT NOT NULL REFERENCES public.automatiseringen(id)");
    expect(source).toContain("pipeline_id TEXT NOT NULL");
    expect(source).toContain("target JSONB NOT NULL");
    expect(source).toContain("automation_placements_target_type_check");
    expect(source).toContain("automation_placements_step_target_check");
    expect(source).toContain("automation_placements_arrow_target_check");
    expect(source).toContain("automation_placements_automation_idx");
    expect(source).toContain("automation_placements_pipeline_idx");
    expect(source).toContain("automation_placements_unique_target_idx");
    expect(source).toContain("COALESCE(target->>'stepId', '__portal_api_null__')");
    expect(source).toContain("COALESCE(target->>'arrowId', '__portal_api_null__')");
    expect(source).toContain("diff JSONB NOT NULL DEFAULT '{}'");
    expect(source).toContain("portal_api_audit_log_resource_idx");
    expect(source).toContain("ALTER TABLE public.automation_placements ENABLE ROW LEVEL SECURITY");
    expect(source).toContain("ALTER TABLE public.portal_api_audit_log ENABLE ROW LEVEL SECURITY");
    expect(source).toContain("Service role can manage automation placements");
    expect(source).toContain("Service role can manage portal api audit log");
  });

  it("uses soft archive fields instead of hard delete support", () => {
    expect(source).toContain("ADD COLUMN IF NOT EXISTS archived_at timestamptz");
    expect(source).toContain("ADD COLUMN IF NOT EXISTS archived_by text");
    expect(source).not.toMatch(/DROP\s+TABLE/i);
  });

  it("fails clearly before adding the automation upsert index when duplicates exist", () => {
    expect(source).toContain("ON public.automatiseringen(source, external_id)");
    expect(source).toContain("WHERE source IS NOT NULL AND external_id IS NOT NULL");
    expect(source).toContain("GROUP BY source, external_id");
    expect(source).toContain("HAVING count(*) > 1");
    expect(source).toContain("Duplicate automatiseringen source/external_id pairs");
    expect(source.indexOf("HAVING count(*) > 1")).toBeLessThan(
      source.indexOf("CREATE UNIQUE INDEX IF NOT EXISTS automatiseringen_source_external_unique_idx"),
    );
  });

  it("adds a transactional automation archive RPC for force placement cleanup", () => {
    expect(archiveRpcSource).toContain("CREATE OR REPLACE FUNCTION public.portal_api_archive_automation");
    expect(archiveRpcSource).toContain("pg_advisory_xact_lock(hashtext('portal_api_automation:' || p_id))");
    expect(archiveRpcSource).toContain("FOR UPDATE");
    expect(archiveRpcSource).toContain("p_expected_version");
    expect(archiveRpcSource).toContain("ACTIVE_PLACEMENTS");
    expect(archiveRpcSource).toContain("DELETE FROM public.automation_placements");
    expect(archiveRpcSource).toContain("UPDATE public.automatiseringen");
    expect(archiveRpcSource).toContain("REVOKE ALL ON FUNCTION public.portal_api_archive_automation");
    expect(archiveRpcSource).toContain("GRANT EXECUTE ON FUNCTION public.portal_api_archive_automation");
    expect(archiveRpcSource).toContain("CREATE OR REPLACE FUNCTION public.portal_api_lock_automation_placement_target");
    expect(archiveRpcSource).toContain("AND status = 'archived'");
    expect(archiveRpcSource).toContain("Cannot place archived automation");
    expect(archiveRpcSource).toContain("CREATE TRIGGER portal_api_lock_automation_placement_target");
  });

  it("returns the removed placement records from a force archive so each one can be audit-logged", () => {
    expect(archiveRpcReturnPlacementsSource).toContain("CREATE OR REPLACE FUNCTION public.portal_api_archive_automation");
    expect(archiveRpcReturnPlacementsSource).toContain("'removedPlacementRecords', CASE WHEN p_force THEN placement_payload ELSE '[]'::jsonb END");
  });
});
