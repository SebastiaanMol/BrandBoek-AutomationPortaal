import { describe, expect, it } from "vitest";

import { previewPortalOwnedSync } from "../../supabase/functions/_shared/portal-owned-sync";

type Row = Record<string, any>;

class FakeSupabase {
  constructor(public tables: Record<string, Row[]> = {}) {}

  from(table: string) {
    if (!this.tables[table]) this.tables[table] = [];
    return new FakeQuery(this.tables, table);
  }
}

class FakeQuery {
  private filters: Array<{ field: string; value: unknown; mode: "eq" | "is" }> = [];
  private operation: "select" | "insert" | "update" | null = null;
  private payload: Row | Row[] | null = null;
  private wantsSingle = false;

  constructor(private tables: Record<string, Row[]>, private table: string) {}

  select() {
    if (!this.operation) this.operation = "select";
    return this;
  }

  insert(payload: Row | Row[]) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Row) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, value, mode: "eq" });
    return this;
  }

  is(field: string, value: unknown) {
    this.filters.push({ field, value, mode: "is" });
    return this;
  }

  single() {
    this.wantsSingle = true;
    return this;
  }

  then(resolve: (value: { data: any; error: null }) => void) {
    return Promise.resolve(resolve(this.execute()));
  }

  private execute(): { data: any; error: null } {
    if (this.operation === "insert") {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted = rows.filter(Boolean).map((row) => ({ ...row }));
      this.tables[this.table].push(...inserted);
      return { data: this.wantsSingle ? inserted[0] ?? null : inserted, error: null };
    }

    if (this.operation === "update") {
      for (const row of this.tables[this.table].filter((row) => this.matches(row))) Object.assign(row, this.payload);
      return { data: null, error: null };
    }

    const rows = this.tables[this.table].filter((row) => this.matches(row));
    return { data: this.wantsSingle ? rows[0] ?? null : rows, error: null };
  }

  private matches(row: Row): boolean {
    return this.filters.every((filter) => {
      if (filter.mode === "is" && filter.value === null) return row[filter.field] == null;
      return row[filter.field] === filter.value;
    });
  }
}

describe("HubSpot pipeline/stage sync preview", () => {
  it("creates a review item when pipeline or stage linkage changes", async () => {
    const db = new FakeSupabase({
      automatiseringen: [{
        id: "AUTO-HS-1617887756",
        source: "hubspot",
        external_id: "1617887756",
        naam: "Dealstage workflow",
        doel: "",
        trigger_beschrijving: "Deal eigenschap",
        systemen: ["HubSpot"],
        stappen: [],
        categorie: "Data beheer",
        status: "Actief",
        endpoints: [],
        webhook_paths: [],
        pipeline_id: null,
        stage_id: null,
        import_proposal: {
          hubspot_workflow: {
            id: "1617887756",
            triggers: [{ propertyName: "dealstage", value: "stage-offerte" }],
            actions: [{ type: "SET_DEAL_PROPERTY" }],
          },
        },
      }],
      source_sync_change_items: [],
      automation_source_findings: [],
    });

    const result = await previewPortalOwnedSync(db as any, {
      source: "hubspot",
      syncRunId: "sync-2",
      now: "2026-06-29T10:00:00.000Z",
      payloads: [{
        external_id: "1617887756",
        source: "hubspot",
        naam: "Dealstage workflow",
        status: "Actief",
        doel: "",
        trigger_beschrijving: "Deal eigenschap",
        systemen: ["HubSpot"],
        stappen: [],
        categorie: "Data beheer",
        endpoints: [],
        webhook_paths: [],
        pipeline_id: "pipeline-sales",
        stage_id: "stage-offerte",
        import_proposal: {
          hubspot_workflow: {
            id: "1617887756",
            triggers: [{ propertyName: "dealstage", value: "stage-offerte" }],
            actions: [{ type: "SET_DEAL_PROPERTY" }],
          },
        },
      }],
    });

    const linkageItem = result.changeItems.find((item) => item.changeType === "metadata_changed");

    expect(linkageItem).toMatchObject({
      externalId: "1617887756",
      title: "Dealstage workflow",
    });
    expect(linkageItem?.oldValue).toMatchObject({
      metadata: expect.arrayContaining([
        { field: "pipeline_id", value: null },
        { field: "stage_id", value: null },
      ]),
    });
    expect(linkageItem?.newValue).toMatchObject({
      metadata: expect.arrayContaining([
        { field: "pipeline_id", value: "pipeline-sales" },
        { field: "stage_id", value: "stage-offerte" },
      ]),
    });
  });
});
