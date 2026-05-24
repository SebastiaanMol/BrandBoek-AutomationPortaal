import { describe, expect, it } from "vitest";
import { runGitLabAutomationBackfill } from "../../supabase/functions/_shared/gitlab-backfill";
import { mapGitLabEndpointToAutomationPayload } from "../../supabase/functions/_shared/gitlab-readonly";

const payload = mapGitLabEndpointToAutomationPayload({
  externalId: "gitlab:app/API/operations.py:new_create_deal:POST:/operations/hubspot/create_new_deal",
  name: "New create deal",
  method: "POST",
  endpoint: "/operations/hubspot/create_new_deal",
  apiFile: "app/API/operations.py",
  handler: "new_create_deal",
  systems: ["HubSpot"],
  phases: ["Sales"],
  blobId: "blob-123",
  calls: [],
}, "2026-05-22T08:00:00.000Z");

describe("GitLab automation backfill", () => {
  it("reports old/new differences in dry-run without updating automations or audit logs", async () => {
    const db = new FakeDb([
      {
        id: "auto-1",
        external_id: payload.external_id,
        source: "gitlab",
        naam: "Oude technische naam (POST /operations/hubspot/create_new_deal)",
        doel: "Oude technische beschrijving",
      },
    ]);

    const report = await runGitLabAutomationBackfill(db as never, {
      payloads: [payload],
      now: "2026-05-22T08:30:00.000Z",
      dryRun: true,
    });

    expect(report.dryRun).toBe(true);
    expect(report.matched).toBe(1);
    expect(report.changedAutomations).toBe(1);
    expect(report.changes.some((change) => change.field === "naam")).toBe(true);
    expect(db.updates).toEqual([]);
    expect(db.inserts).toEqual([]);
  });

  it("replaces existing GitLab automation fields and writes audit events on apply", async () => {
    const db = new FakeDb([
      {
        id: "auto-1",
        external_id: payload.external_id,
        source: "gitlab",
        naam: "Oude technische naam",
        doel: "Oude technische beschrijving",
      },
    ]);

    const report = await runGitLabAutomationBackfill(db as never, {
      payloads: [payload],
      now: "2026-05-22T08:30:00.000Z",
      dryRun: false,
    });

    expect(report.dryRun).toBe(false);
    expect(report.changedAutomations).toBe(1);
    expect(db.updates).toEqual([
      expect.objectContaining({
        table: "automatiseringen",
        field: "id",
        value: "auto-1",
        values: expect.objectContaining({
          naam: "New create deal",
          doel: expect.not.stringMatching(/POST|\/operations\/hubspot\/create_new_deal/i),
          import_proposal: expect.objectContaining({
            standard: expect.any(Object),
            gitlab: expect.any(Object),
          }),
        }),
      }),
    ]);
    expect(db.inserts).toEqual([
      expect.objectContaining({
        table: "audit_events",
        values: expect.arrayContaining([
          expect.objectContaining({
            action: "gitlab_backfill_update",
            object_id: "auto-1",
            field_name: "naam",
          }),
        ]),
      }),
    ]);
  });
});

class FakeDb {
  updates: Array<{ table: string; values: unknown; field: string; value: unknown }> = [];
  inserts: Array<{ table: string; values: unknown }> = [];

  constructor(public automations: Array<Record<string, unknown>>) {}

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }
}

class FakeQuery implements PromiseLike<{ data?: unknown; error: null }> {
  private operation: "select" | "update" | null = null;
  private values: unknown;
  private filters: Array<{ field: string; value: unknown }> = [];

  constructor(private db: FakeDb, private table: string) {}

  select(): this {
    this.operation = "select";
    return this;
  }

  update(values: unknown): this {
    this.operation = "update";
    this.values = values;
    return this;
  }

  insert(values: unknown): Promise<{ error: null }> {
    this.db.inserts.push({ table: this.table, values });
    return Promise.resolve({ error: null });
  }

  eq(field: string, value: unknown): this {
    this.filters.push({ field, value });
    return this;
  }

  then<TResult1 = { data?: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data?: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    try {
      const result = this.execute();
      return Promise.resolve(result).then(onfulfilled, onrejected);
    } catch (error) {
      return Promise.reject(error).then(onfulfilled, onrejected);
    }
  }

  private execute(): { data?: unknown; error: null } {
    if (this.table === "automatiseringen" && this.operation === "select") {
      return {
        data: this.db.automations.filter((row) => (
          this.filters.every((filter) => row[filter.field] === filter.value)
        )),
        error: null,
      };
    }

    if (this.table === "automatiseringen" && this.operation === "update") {
      const idFilter = this.filters.find((filter) => filter.field === "id");
      this.db.updates.push({
        table: this.table,
        values: this.values,
        field: idFilter?.field ?? "",
        value: idFilter?.value,
      });
      const row = this.db.automations.find((item) => item.id === idFilter?.value);
      if (row && this.values && typeof this.values === "object") {
        Object.assign(row, this.values);
      }
      return { error: null };
    }

    return { error: null };
  }
}
