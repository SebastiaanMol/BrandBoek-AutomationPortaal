import { describe, expect, it } from "vitest";

import {
  applyPortalOwnedSyncChanges,
  previewPortalOwnedSync,
} from "../../supabase/functions/_shared/portal-owned-sync";

type Row = Record<string, any>;

class FakeSupabase {
  tables: Record<string, Row[]>;
  insertErrors: Record<string, string>;

  constructor(tables: Record<string, Row[]> = {}, options: { insertErrors?: Record<string, string> } = {}) {
    this.tables = tables;
    this.insertErrors = options.insertErrors ?? {};
  }

  from(table: string) {
    if (!this.tables[table]) this.tables[table] = [];
    return new FakeQuery(this.tables, table, this.insertErrors);
  }
}

class FakeQuery {
  private filters: Array<{ field: string; value: unknown; mode: "eq" | "is" | "in" }> = [];
  private operation: "select" | "insert" | "update" | null = null;
  private payload: Row | Row[] | null = null;
  private wantsMaybeSingle = false;
  private wantsSingle = false;

  constructor(
    private tables: Record<string, Row[]>,
    private table: string,
    private insertErrors: Record<string, string>,
  ) {}

  select() {
    this.operation = this.operation ?? "select";
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

  in(field: string, value: unknown[]) {
    this.filters.push({ field, value, mode: "in" });
    return this;
  }

  maybeSingle() {
    this.wantsMaybeSingle = true;
    return this;
  }

  single() {
    this.wantsSingle = true;
    return this;
  }

  then(resolve: (value: { data: any; error: null | { message: string } }) => void) {
    return Promise.resolve(resolve(this.execute()));
  }

  private execute(): { data: any; error: null | { message: string } } {
    if (this.operation === "insert") {
      if (this.insertErrors[this.table]) {
        return { data: null, error: { message: this.insertErrors[this.table] } };
      }
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted = rows.filter(Boolean).map((row) => ({ ...row }));
      this.tables[this.table].push(...inserted);
      return { data: this.wantsSingle ? inserted[0] ?? null : inserted, error: null };
    }

    if (this.operation === "update") {
      const matches = this.tables[this.table].filter((row) => this.matches(row));
      for (const row of matches) Object.assign(row, this.payload);
      return { data: null, error: null };
    }

    const rows = this.tables[this.table].filter((row) => this.matches(row));
    return { data: this.wantsMaybeSingle || this.wantsSingle ? rows[0] ?? null : rows, error: null };
  }

  private matches(row: Row): boolean {
    return this.filters.every((filter) => {
      if (filter.mode === "is" && filter.value === null) return row[filter.field] == null;
      if (filter.mode === "in" && Array.isArray(filter.value)) return filter.value.includes(row[filter.field]);
      return row[filter.field] === filter.value;
    });
  }
}

function newAutomationReviewRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "change-new-1",
    sync_run_id: "sync-1",
    source: "zapier",
    external_id: "zap-1",
    automation_id: null,
    change_type: "new_automation",
    status: "pending",
    title: "Trustoo Lead Intake",
    summary: "Nieuwe Zapier automation gevonden.",
    impact: "Komt direct in de catalogus.",
    old_value_sanitized: null,
    new_value_sanitized: {},
    payload_sanitized: {
      external_id: "zap-1",
      source: "zapier",
      naam: "Trustoo Lead Intake",
      status: "Actief",
      doel: "Verwerkt Trustoo leads.",
      trigger_beschrijving: "Nieuwe lead ontvangen",
      systemen: ["Zapier", "HubSpot"],
      stappen: ["Ontvang lead", "Maak deal"],
      branches: [{ id: "b1", label: "Lead", toStepId: "s2" }],
      categorie: "Lead intake",
      endpoints: ["/zapier/trustoo"],
      webhook_paths: ["/hooks/trustoo"],
      import_proposal: { read_only: true, zap: { id: "zap-1" } },
      pipeline_id: "pipeline-1",
      stage_id: "stage-1",
      last_synced_at: "2026-06-28T10:00:00.000Z",
    },
    selected_by_default: true,
    ...overrides,
  };
}

function newGitLabAutomationReviewRow(overrides: Partial<Row> = {}): Row {
  return newAutomationReviewRow({
    id: "change-gitlab-new-1",
    sync_run_id: "sync-1",
    source: "gitlab",
    external_id: "app/API/deals.py::POST /deals/create",
    title: "Deal aanmaken",
    summary: "Nieuwe GitLab automation gevonden.",
    payload_sanitized: {
      external_id: "app/API/deals.py::POST /deals/create",
      source: "gitlab",
      naam: "Deal aanmaken",
      status: "Actief",
      doel: "Maakt een deal aan via de backend.",
      trigger_beschrijving: "Een gekoppelde workflow roept dit endpoint aan.",
      systemen: ["GitLab", "Backend", "HubSpot"],
      stappen: ["Ontvang request", "Maak deal"],
      categorie: "Backend Script",
      endpoints: ["/deals/create"],
      webhook_paths: [],
      gitlab_file_path: "app/API/deals.py",
      gitlab_last_commit: "abc123",
      import_proposal: {
        source: "gitlab",
        read_only: true,
        gitlab_endpoint: {
          method: "POST",
          endpoint: "/deals/create",
          api_file: "app/API/deals.py",
          handler: "create_deal",
        },
      },
      last_synced_at: "2026-07-10T10:00:00.000Z",
    },
    ...overrides,
  });
}

function existingHubSpotAutomation(overrides: Partial<Row> = {}): Row {
  return {
    id: "AUTO-HS-1617887756",
    source: "hubspot",
    external_id: "1617887756",
    naam: "Oude workflow",
    doel: "",
    trigger_beschrijving: "",
    systemen: ["HubSpot"],
    stappen: [],
    categorie: "Data beheer",
    status: "Actief",
    endpoints: [],
    webhook_paths: [],
    import_proposal: {
      hubspot_workflow: {
        id: "1617887756",
        triggers: [],
        actions: [],
      },
    },
    ...overrides,
  };
}

describe("previewPortalOwnedSync superseding", () => {
  it("supersedes older pending metadata noise when the current preview no longer produces that change", async () => {
    const db = new FakeSupabase({
      source_sync_runs: [{ id: "sync-2", source: "hubspot", status: "started" }],
      automatiseringen: [existingHubSpotAutomation({
        id: "AUTO-HS-1697577818",
        external_id: "1697577818",
        naam: "Set Software/Portaal/Pakket/CSV based on dealstage",
        doel: "Handmatig aangescherpte uitleg door gebruiker.",
        stage_id: "1176430505, 1044124012",
      })],
      source_sync_change_items: [{
        id: "old-metadata-noise",
        sync_run_id: "sync-1",
        source: "hubspot",
        external_id: "1697577818",
        automation_id: "AUTO-HS-1697577818",
        change_type: "metadata_changed",
        review_key: "general",
        status: "pending",
        title: "Set Software/Portaal/Pakket/CSV based on dealstage",
        summary: "Broninformatie wijzigt.",
        impact: "Werkt bestaande automation bij.",
        old_value_sanitized: { metadata: [{ field: "stage_id", value: "1176430505, 1044124012" }] },
        new_value_sanitized: { metadata: [{ field: "stage_id", value: null }] },
        payload_sanitized: {},
        selected_by_default: true,
      }],
    });

    const result = await previewPortalOwnedSync(db as any, {
      source: "hubspot",
      syncRunId: "sync-2",
      now: "2026-07-03T09:00:00.000Z",
      payloads: [{
        external_id: "1697577818",
        source: "hubspot",
        naam: "Set Software/Portaal/Pakket/CSV based on dealstage",
        status: "Actief",
        doel: "Automatisch gegenereerd op basis van naam: 'Set Software/Portaal/Pakket/CSV based on dealstage'",
        stage_id: null,
        pipeline_id: null,
        import_proposal: {
          hubspot_workflow: {
            id: "1697577818",
            triggers: [{ property: "dealstage" }],
            actions: [{ type: "SET_DEAL_PROPERTY" }],
          },
        },
      }],
    });

    expect(result.changeItems.filter((item) => item.changeType === "metadata_changed")).toEqual([]);
    expect(db.tables.source_sync_change_items.find((row) => row.id === "old-metadata-noise")).toMatchObject({
      status: "superseded",
      skipped_at: "2026-07-03T09:00:00.000Z",
    });
  });

  it("does not create metadata review noise for protected user text and derived stage fields", async () => {
    const db = new FakeSupabase({
      source_sync_runs: [{ id: "sync-2", source: "hubspot", status: "started" }],
      automatiseringen: [existingHubSpotAutomation({
        id: "AUTO-HS-1697577818",
        external_id: "1697577818",
        naam: "Set Software/Portaal/Pakket/CSV based on dealstage",
        doel: "Handmatig aangescherpte uitleg door gebruiker.",
        trigger_beschrijving: "Handmatige triggertekst.",
        categorie: "Handmatig beheer",
        systemen: ["HubSpot", "Portaal"],
        stappen: ["Handmatig beschreven stap"],
        pipeline_id: "1176430499",
        stage_id: "1176430505, 1044124012, 1189168762, 1176430501, 1176430502",
      })],
      source_sync_change_items: [],
    });

    const result = await previewPortalOwnedSync(db as any, {
      source: "hubspot",
      syncRunId: "sync-2",
      now: "2026-07-03T08:00:00.000Z",
      payloads: [{
        external_id: "1697577818",
        source: "hubspot",
        naam: "Set Software/Portaal/Pakket/CSV based on dealstage",
        status: "Actief",
        doel: "Automatisch gegenereerd op basis van naam: 'Set Software/Portaal/Pakket/CSV based on dealstage'",
        trigger_beschrijving: "Deal stage is known",
        categorie: "Data beheer",
        systemen: ["HubSpot"],
        stappen: ["Stel Software/Portaal/Pakket/CSV in"],
        pipeline_id: null,
        stage_id: null,
        import_proposal: {
          hubspot_workflow: {
            id: "1697577818",
            triggers: [{ property: "dealstage" }],
            actions: [{ type: "SET_DEAL_PROPERTY" }],
          },
        },
      }],
    });

    expect(result.changed).toBe(0);
    expect(result.changeItems.filter((item) => item.changeType === "metadata_changed")).toEqual([]);
    expect(db.tables.source_sync_change_items.filter((row) => row.change_type === "metadata_changed")).toEqual([]);
  });

  it("still creates route review items for real webhook or endpoint source changes", async () => {
    const db = new FakeSupabase({
      source_sync_runs: [{ id: "sync-2", source: "hubspot", status: "started" }],
      automatiseringen: [existingHubSpotAutomation({
        webhook_paths: ["/old"],
        endpoints: ["/old"],
      })],
      source_sync_change_items: [],
    });

    const result = await previewPortalOwnedSync(db as any, {
      source: "hubspot",
      syncRunId: "sync-2",
      now: "2026-07-03T08:00:00.000Z",
      payloads: [{
        external_id: "1617887756",
        source: "hubspot",
        naam: "Oude workflow",
        status: "Actief",
        webhook_paths: ["/new"],
        endpoints: ["/new"],
        import_proposal: {
          hubspot_workflow: {
            id: "1617887756",
            triggers: [{ property: "dealstage" }],
            actions: [{ type: "WEBHOOK" }],
          },
        },
      }],
    });

    expect(result.changeItems).toHaveLength(1);
    expect(result.changeItems[0]).toMatchObject({
      changeType: "route_changed",
      oldValue: expect.objectContaining({ webhook_paths: ["/old"], endpoints: ["/old"] }),
      newValue: expect.objectContaining({ webhook_paths: ["/new"], endpoints: ["/new"] }),
    });
  });

  it("marks older pending rows with the same review key superseded before inserting the new row", async () => {
    const db = new FakeSupabase({
      source_sync_runs: [{ id: "sync-2", source: "hubspot", status: "started" }],
      automatiseringen: [existingHubSpotAutomation()],
      source_sync_change_items: [{
        id: "old-change",
        sync_run_id: "sync-1",
        source: "hubspot",
        external_id: "1617887756",
        automation_id: "AUTO-HS-1617887756",
        change_type: "source_data_incomplete",
        review_key: "hubspot_triggers",
        status: "pending",
        title: "Oude workflow",
        summary: "HubSpot triggercriteria ontbreekt voor procesreisvorming.",
        impact: "",
        old_value_sanitized: null,
        new_value_sanitized: { missing_evidence_key: "hubspot_triggers" },
        payload_sanitized: { missingEvidence: { key: "hubspot_triggers" } },
        selected_by_default: true,
        created_at: "2026-06-01T09:00:00.000Z",
      }],
    });

    const result = await previewPortalOwnedSync(db as any, {
      source: "hubspot",
      syncRunId: "sync-2",
      now: "2026-06-29T10:00:00.000Z",
      payloads: [{
        external_id: "1617887756",
        source: "hubspot",
        naam: "Oude workflow",
        import_proposal: {
          hubspot_workflow: {
            id: "1617887756",
            triggers: [],
            actions: [],
          },
        },
      }],
    });

    expect(db.tables.source_sync_change_items.find((row) => row.id === "old-change")).toMatchObject({
      status: "superseded",
      skipped_at: "2026-06-29T10:00:00.000Z",
    });
    const inserted = db.tables.source_sync_change_items.filter((row) => row.sync_run_id === "sync-2");
    expect(inserted.some((row) => row.review_key === "hubspot_triggers" && row.status === "pending")).toBe(true);
    expect(result.changeItems.some((item) => item.reviewKey === "hubspot_triggers")).toBe(true);
  });

  it("keeps different source_data_incomplete evidence keys open independently", async () => {
    const db = new FakeSupabase({
      source_sync_runs: [{ id: "sync-2", source: "hubspot", status: "started" }],
      automatiseringen: [existingHubSpotAutomation()],
      source_sync_change_items: [{
        id: "old-actions",
        sync_run_id: "sync-1",
        source: "hubspot",
        external_id: "1617887756",
        automation_id: "AUTO-HS-1617887756",
        change_type: "source_data_incomplete",
        review_key: "hubspot_actions",
        status: "pending",
        title: "Oude workflow",
        summary: "HubSpot acties ontbreekt voor procesreisvorming.",
        impact: "",
        old_value_sanitized: null,
        new_value_sanitized: { missing_evidence_key: "hubspot_actions" },
        payload_sanitized: { missingEvidence: { key: "hubspot_actions" } },
        selected_by_default: true,
      }],
    });

    await previewPortalOwnedSync(db as any, {
      source: "hubspot",
      syncRunId: "sync-2",
      now: "2026-06-29T10:00:00.000Z",
      payloads: [{
        external_id: "1617887756",
        source: "hubspot",
        naam: "Oude workflow",
        import_proposal: {
          hubspot_workflow: {
            id: "1617887756",
            triggers: [],
            actions: [],
          },
        },
      }],
    });

    expect(db.tables.source_sync_change_items.find((row) => row.id === "old-actions")).toMatchObject({
      status: "superseded",
    });
    const pendingKeys = db.tables.source_sync_change_items
      .filter((row) => row.status === "pending")
      .map((row) => row.review_key);
    expect(pendingKeys).toContain("hubspot_triggers");
    expect(pendingKeys).toContain("hubspot_actions");
  });
});

describe("applyPortalOwnedSyncChanges", () => {
  it("hides source-missing automations from the portal by marking them as cleanup candidates", async () => {
    const db = new FakeSupabase({
      source_sync_change_items: [{
        id: "change-missing-1",
        sync_run_id: "sync-1",
        source: "gitlab",
        external_id: "app/service/old.py::POST /old",
        automation_id: "AUTO-GL-OLD",
        change_type: "source_missing",
        status: "pending",
        title: "Oude GitLab automation",
        summary: "Deze automation kan niet meer worden teruggevonden bij GitLab.",
        impact: "Wordt uit de actieve portalweergave gehaald als je deze regel toepast.",
        old_value_sanitized: { external_id: "app/service/old.py::POST /old" },
        new_value_sanitized: null,
        payload_sanitized: {
          automation: {
            id: "AUTO-GL-OLD",
            source: "gitlab",
            external_id: "app/service/old.py::POST /old",
            naam: "Oude GitLab automation",
          },
        },
        selected_by_default: true,
      }],
      automatiseringen: [{
        id: "AUTO-GL-OLD",
        source: "gitlab",
        external_id: "app/service/old.py::POST /old",
        naam: "Oude GitLab automation",
        status: "Actief",
        cleanup_delete_candidate: false,
        cleanup_delete_candidate_at: null,
        reviewer_overrides: { process_status: "In review" },
      }],
      automation_source_findings: [],
    });

    const result = await applyPortalOwnedSyncChanges(db as any, {
      source: "gitlab",
      syncRunId: "sync-1",
      selectedChangeItemIds: ["change-missing-1"],
      now: "2026-07-08T12:00:00.000Z",
    });

    expect(db.tables.automatiseringen[0]).toMatchObject({
      cleanup_delete_candidate: true,
      cleanup_delete_candidate_at: "2026-07-08T12:00:00.000Z",
      status: "Uitgeschakeld",
      reviewer_overrides: {
        process_status: "In review",
        cleanup_delete_candidate: true,
        cleanup_delete_candidate_at: "2026-07-08T12:00:00.000Z",
        source_deleted_at: "2026-07-08T12:00:00.000Z",
        source_deleted_reason: "Niet meer gevonden bij GitLab",
      },
    });
    expect(db.tables.source_sync_change_items[0]).toMatchObject({ status: "applied" });
    expect(result).toMatchObject({ applied: 1, deactivated: 1, missing: 1, failed: 0 });
  });

  it("does not overwrite protected text or clear stage links when applying an existing source update", async () => {
    const db = new FakeSupabase({
      source_sync_change_items: [{
        id: "change-route-1",
        sync_run_id: "sync-1",
        source: "hubspot",
        external_id: "1697577818",
        automation_id: "AUTO-HS-1697577818",
        change_type: "route_changed",
        status: "pending",
        title: "Set Software/Portaal/Pakket/CSV based on dealstage",
        summary: "Webhook- of endpointinformatie wijzigt.",
        impact: "Werkt bestaande automation bij.",
        old_value_sanitized: { webhook_paths: ["/old"], endpoints: ["/old"], metadata: [] },
        new_value_sanitized: { webhook_paths: ["/new"], endpoints: ["/new"], metadata: [] },
        payload_sanitized: {
          external_id: "1697577818",
          source: "hubspot",
          naam: "Set Software/Portaal/Pakket/CSV based on dealstage",
          status: "Actief",
          doel: "Automatisch gegenereerd op basis van naam: 'Set Software/Portaal/Pakket/CSV based on dealstage'",
          trigger_beschrijving: "Deal stage is known",
          categorie: "Data beheer",
          systemen: ["HubSpot"],
          stappen: ["Automatisch beschreven stap"],
          webhook_paths: ["/new"],
          endpoints: ["/new"],
          pipeline_id: null,
          stage_id: null,
          import_proposal: { hubspot_workflow: { id: "1697577818", actions: [{ type: "WEBHOOK" }] } },
          hubspot_last_run_at: "2026-07-01T10:00:00.000Z",
          hubspot_run_count_365d: 12,
          last_synced_at: "2026-07-03T08:00:00.000Z",
        },
        selected_by_default: true,
      }],
      automatiseringen: [{
        id: "AUTO-HS-1697577818",
        source: "hubspot",
        external_id: "1697577818",
        naam: "Set Software/Portaal/Pakket/CSV based on dealstage",
        doel: "Handmatig aangescherpte uitleg door gebruiker.",
        trigger_beschrijving: "Handmatige triggertekst.",
        systemen: ["HubSpot", "Portaal"],
        stappen: ["Handmatig beschreven stap"],
        categorie: "Handmatig beheer",
        status: "Actief",
        endpoints: ["/old"],
        webhook_paths: ["/old"],
        pipeline_id: "1176430499",
        stage_id: "1176430505, 1044124012, 1189168762, 1176430501, 1176430502",
        import_proposal: { hubspot_workflow: { id: "1697577818", actions: [] } },
      }],
      automation_source_findings: [],
    });

    const result = await applyPortalOwnedSyncChanges(db as any, {
      source: "hubspot",
      syncRunId: "sync-1",
      selectedChangeItemIds: ["change-route-1"],
      now: "2026-07-03T08:00:00.000Z",
    });

    expect(db.tables.automatiseringen[0]).toMatchObject({
      doel: "Handmatig aangescherpte uitleg door gebruiker.",
      trigger_beschrijving: "Handmatige triggertekst.",
      categorie: "Handmatig beheer",
      systemen: ["HubSpot", "Portaal"],
      stappen: ["Handmatig beschreven stap"],
      pipeline_id: "1176430499",
      stage_id: "1176430505, 1044124012, 1189168762, 1176430501, 1176430502",
      endpoints: ["/new"],
      webhook_paths: ["/new"],
      hubspot_last_run_at: "2026-07-01T10:00:00.000Z",
      hubspot_run_count_365d: 12,
      last_synced_at: "2026-07-03T08:00:00.000Z",
    });
    expect(result).toMatchObject({ updated: 1, applied: 1, failed: 0 });
  });

  it("creates selected new automations as approved records instead of pending import proposals", async () => {
    const db = new FakeSupabase({
      source_sync_change_items: [newAutomationReviewRow()],
      automatiseringen: [],
      automation_import_proposals: [],
      automation_source_findings: [],
    });

    const result = await applyPortalOwnedSyncChanges(db as any, {
      source: "zapier",
      syncRunId: "sync-1",
      selectedChangeItemIds: ["change-new-1"],
      now: "2026-06-29T08:00:00.000Z",
    });

    expect(db.tables.automation_import_proposals).toEqual([]);
    expect(db.tables.automatiseringen).toHaveLength(1);
    expect(db.tables.automatiseringen[0]).toMatchObject({
      naam: "Trustoo Lead Intake",
      source: "zapier",
      external_id: "zap-1",
      import_status: "approved",
      endpoints: ["/zapier/trustoo"],
      webhook_paths: ["/hooks/trustoo"],
      pipeline_id: "pipeline-1",
      stage_id: "stage-1",
    });
    expect(db.tables.source_sync_change_items[0]).toMatchObject({ status: "applied" });
    expect(result).toMatchObject({
      inserted: 1,
      proposed: 0,
      applied: 1,
      failed: 0,
      skipped: 0,
    });
  });

  it("creates selected GitLab new automations as approved records", async () => {
    const db = new FakeSupabase({
      source_sync_change_items: [newGitLabAutomationReviewRow()],
      automatiseringen: [],
      automation_import_proposals: [],
      automation_source_findings: [],
    });

    const result = await applyPortalOwnedSyncChanges(db as any, {
      source: "gitlab",
      syncRunId: "sync-1",
      selectedChangeItemIds: ["change-gitlab-new-1"],
      now: "2026-07-10T12:00:00.000Z",
    });

    expect(db.tables.automatiseringen).toHaveLength(1);
    expect(db.tables.automatiseringen[0]).toMatchObject({
      naam: "Deal aanmaken",
      source: "gitlab",
      external_id: "app/API/deals.py::POST /deals/create",
      import_status: "approved",
      gitlab_file_path: "app/API/deals.py",
      endpoints: ["/deals/create"],
    });
    expect(result).toMatchObject({
      inserted: 1,
      applied: 1,
      failed: 0,
      failedItems: [],
    });
  });

  it("keeps GitLab source/external id identity and creates a unique name when the title already exists", async () => {
    const db = new FakeSupabase({
      source_sync_change_items: [newGitLabAutomationReviewRow()],
      automatiseringen: [{
        id: "AUTO-OLD",
        source: "hubspot",
        external_id: "169",
        naam: "Deal aanmaken",
        status: "Actief",
      }],
      automation_import_proposals: [],
      automation_source_findings: [],
    });

    const result = await applyPortalOwnedSyncChanges(db as any, {
      source: "gitlab",
      syncRunId: "sync-1",
      selectedChangeItemIds: ["change-gitlab-new-1"],
      now: "2026-07-10T12:00:00.000Z",
    });

    expect(db.tables.automatiseringen).toHaveLength(2);
    expect(db.tables.automatiseringen[1]).toMatchObject({
      naam: "Deal aanmaken - POST /deals/create",
      source: "gitlab",
      external_id: "app/API/deals.py::POST /deals/create",
      import_status: "approved",
    });
    expect(result).toMatchObject({ inserted: 1, failed: 0 });
  });

  it("creates a unique name for non-GitLab automations when the title already exists", async () => {
    const db = new FakeSupabase({
      source_sync_change_items: [newAutomationReviewRow({
        source: "hubspot",
        external_id: "1830080287",
        title: "Send a follow-up email after form submission",
        payload_sanitized: {
          external_id: "1830080287",
          source: "hubspot",
          naam: "Send a follow-up email after form submission",
          status: "Actief",
          doel: "Follow-up versturen.",
          trigger_beschrijving: "Formulier verzonden",
          systemen: ["HubSpot"],
          stappen: [],
          categorie: "Algemeen",
        },
      })],
      automatiseringen: [{
        id: "AUTO-HS-OLD",
        source: "hubspot",
        external_id: "old-workflow",
        naam: "Send a follow-up email after form submission",
        status: "Actief",
      }],
      automation_import_proposals: [],
      automation_source_findings: [],
    });

    const result = await applyPortalOwnedSyncChanges(db as any, {
      source: "hubspot",
      syncRunId: "sync-1",
      selectedChangeItemIds: ["change-new-1"],
      now: "2026-07-14T08:00:00.000Z",
    });

    expect(db.tables.automatiseringen).toHaveLength(2);
    expect(db.tables.automatiseringen[1]).toMatchObject({
      id: "AUTO-HS-1830080287",
      naam: "Send a follow-up email after form submission - 1830080287",
      source: "hubspot",
      external_id: "1830080287",
      import_status: "approved",
    });
    expect(result).toMatchObject({ inserted: 1, failed: 0 });
  });

  it("skips unselected new automations without creating records", async () => {
    const db = new FakeSupabase({
      source_sync_change_items: [newAutomationReviewRow()],
      automatiseringen: [],
      automation_import_proposals: [],
      automation_source_findings: [],
    });

    const result = await applyPortalOwnedSyncChanges(db as any, {
      source: "zapier",
      syncRunId: "sync-1",
      selectedChangeItemIds: [],
      now: "2026-06-29T08:00:00.000Z",
    });

    expect(db.tables.automatiseringen).toEqual([]);
    expect(db.tables.automation_import_proposals).toEqual([]);
    expect(db.tables.source_sync_change_items[0]).toMatchObject({ status: "skipped" });
    expect(result).toMatchObject({
      inserted: 0,
      proposed: 0,
      applied: 0,
      skipped: 1,
      failed: 0,
    });
  });

  it("updates an existing automation for the same source and external id without inserting a duplicate", async () => {
    const db = new FakeSupabase({
      source_sync_change_items: [newAutomationReviewRow()],
      automatiseringen: [{
        id: "AUTO-EXISTING",
        source: "zapier",
        external_id: "zap-1",
        naam: "Trustoo Lead Intake",
        doel: "Verwerkt Trustoo leads.",
        trigger_beschrijving: "Nieuwe lead ontvangen",
        systemen: ["Zapier", "HubSpot"],
        stappen: ["Ontvang lead", "Maak deal"],
        categorie: "Lead intake",
        status: "Actief",
        endpoints: ["/zapier/trustoo"],
        webhook_paths: ["/hooks/trustoo"],
        import_proposal: { read_only: true },
      }],
      automation_import_proposals: [],
      automation_source_findings: [],
    });

    const result = await applyPortalOwnedSyncChanges(db as any, {
      source: "zapier",
      syncRunId: "sync-1",
      selectedChangeItemIds: ["change-new-1"],
      now: "2026-06-29T08:00:00.000Z",
    });

    expect(db.tables.automatiseringen).toHaveLength(1);
    expect(db.tables.automatiseringen[0]).toMatchObject({
      id: "AUTO-EXISTING",
      last_synced_at: "2026-06-29T08:00:00.000Z",
    });
    expect(result).toMatchObject({
      inserted: 0,
      updated: 1,
      proposed: 0,
      applied: 1,
      failed: 0,
    });
  });

  it("marks a selected new automation failed when the approved automation insert fails", async () => {
    const db = new FakeSupabase(
      {
        source_sync_change_items: [newAutomationReviewRow()],
        automatiseringen: [],
        automation_import_proposals: [],
        automation_source_findings: [],
      },
      { insertErrors: { automatiseringen: "duplicate key" } },
    );

    const result = await applyPortalOwnedSyncChanges(db as any, {
      source: "zapier",
      syncRunId: "sync-1",
      selectedChangeItemIds: ["change-new-1"],
      now: "2026-06-29T08:00:00.000Z",
    });

    expect(db.tables.automatiseringen).toEqual([]);
    expect(db.tables.source_sync_change_items[0]).toMatchObject({
      status: "failed",
      error_message_sanitized: "Nieuwe automation uit sync-review aanmaken: duplicate key",
    });
    expect(result).toMatchObject({
      inserted: 0,
      proposed: 0,
      applied: 0,
      failed: 1,
      failedItems: [{
        id: "change-new-1",
        title: "Trustoo Lead Intake",
        externalId: "zap-1",
        changeType: "new_automation",
        errorMessage: "Nieuwe automation uit sync-review aanmaken: duplicate key",
      }],
    });
  });
});
