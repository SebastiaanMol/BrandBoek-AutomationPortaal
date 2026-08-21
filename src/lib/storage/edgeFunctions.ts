import { supabase } from "@/integrations/supabase/client";

type SyncResult = {
  inserted: number;
  updated: number;
  deactivated: number;
  deletedRejected?: number;
  total: number;
  proposed?: number;
  findings?: number;
  missing?: number;
  changed?: number;
  syncRunId?: string;
  failedItems?: Array<{
    id: string;
    title: string;
    externalId: string | null;
    changeType: string;
    errorMessage: string;
  }>;
};

export type SyncReviewChangeItem = {
  id: string;
  syncRunId?: string;
  source: "hubspot" | "zapier" | "typeform" | "gitlab" | string;
  externalId?: string | null;
  automationId?: string | null;
  changeType: "new_automation" | "metadata_changed" | "route_changed" | "source_data_incomplete" | "source_missing" | string;
  status?: "pending" | "applied" | "skipped" | "failed" | string;
  title: string;
  summary: string;
  impact: string;
  oldValue?: unknown;
  newValue?: unknown;
  payload?: unknown;
  selectedByDefault: boolean;
  errorMessage?: string | null;
};

export type SyncReviewSourceFilter = "all" | "hubspot" | "gitlab" | "zapier" | "typeform";
export type SyncReviewTypeFilter = "all" | "new" | "changed" | "warnings";
export type SyncReviewSelectedFilter = "all" | "selected" | "unselected";

export type SyncReviewFilters = {
  source: SyncReviewSourceFilter;
  type: SyncReviewTypeFilter;
  selected: SyncReviewSelectedFilter;
  search: string;
};

export type FetchPendingSyncReviewItemsParams = Partial<SyncReviewFilters> & {
  page?: number;
  pageSize?: number;
};

export type PaginatedSyncReviewItems = {
  items: SyncReviewChangeItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  from: number;
  to: number;
};

export type SyncPreviewResult = SyncResult & {
  mode?: "preview" | "apply";
  changeItems?: SyncReviewChangeItem[];
  applied?: number;
  skipped?: number;
  failed?: number;
};

export type GitLabBackfillResult = SyncResult & {
  mode: "backfill";
  dryRun: boolean;
  backfill?: {
    dryRun: boolean;
    scanned: number;
    matched: number;
    changedAutomations: number;
    changedFields: number;
    newEndpoints: number;
    missingExisting: number;
    changes: Array<{
      automationId: string;
      externalId: string;
      field: string;
      oldValue: unknown;
      newValue: unknown;
    }>;
    newExternalIds: string[];
    missingExternalIds: string[];
  };
};

export async function invokeEdgeFunction<T = SyncResult>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, body ? { body } : undefined);

  if (error) {
    const context = (error as Record<string, unknown>)?.context;

    if (context && typeof (context as Record<string, unknown>).error === "string") {
      throw new Error((context as Record<string, unknown>).error as string);
    }

    if (context && typeof (context as Record<string, unknown>).json === "function") {
      try {
        const errBody = await (context as { json: () => Promise<Record<string, unknown>> }).json();
        if (errBody?.error) throw new Error(errBody.error as string);
      } catch (e: unknown) {
        const eMsg = e instanceof Error ? e.message : undefined;
        if (eMsg && eMsg !== error.message) throw e;
      }
    }

    throw new Error(error.message);
  }

  return data as T;
}

export async function triggerHubSpotSync(): Promise<SyncPreviewResult> {
  return invokeEdgeFunction("hubspot-sync", { mode: "preview" });
}

export async function triggerZapierSync(): Promise<SyncPreviewResult> {
  return invokeEdgeFunction("zapier-sync", { mode: "preview" });
}

export async function triggerZapierJsonImport(exportBody: unknown): Promise<SyncPreviewResult> {
  return invokeEdgeFunction("zapier-sync", {
    mode: "json_export",
    export: exportBody as Record<string, unknown>,
  });
}

export async function triggerTypeformSync(): Promise<SyncPreviewResult> {
  return invokeEdgeFunction("typeform-sync", { mode: "preview" });
}

export async function triggerGitlabSync(): Promise<SyncPreviewResult> {
  return invokeEdgeFunction("gitlab-sync", { mode: "preview" });
}

export async function applySourceSyncReview(
  source: "hubspot" | "zapier" | "typeform" | "gitlab",
  syncRunId: string,
  selectedChangeItemIds: string[],
): Promise<SyncPreviewResult> {
  return invokeEdgeFunction(`${source}-sync`, {
    mode: "apply",
    syncRunId,
    selectedChangeItemIds,
  });
}

export async function fetchPendingSyncReviewItems(
  params: FetchPendingSyncReviewItemsParams = {},
): Promise<PaginatedSyncReviewItems> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, params.pageSize ?? 50);
  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;

  let query = (supabase as any)
    .from("source_sync_change_items")
    .select("id,sync_run_id,source,external_id,automation_id,change_type,status,title,summary,impact,old_value_sanitized,new_value_sanitized,payload_sanitized,selected_by_default,error_message_sanitized", { count: "exact" })
    .in("status", ["pending", "failed"]);

  if (params.source && params.source !== "all") {
    query = query.eq("source", params.source);
  }

  if (params.type === "new") {
    query = query.eq("change_type", "new_automation");
  } else if (params.type === "changed") {
    query = query.in("change_type", ["metadata_changed", "route_changed"]);
  } else if (params.type === "warnings") {
    query = query.in("change_type", ["source_data_incomplete", "source_missing", "legacy_gitlab_record"]);
  }

  if (params.selected === "selected") {
    query = query.eq("selected_by_default", true);
  } else if (params.selected === "unselected") {
    query = query.eq("selected_by_default", false);
  }

  const search = params.search?.trim();
  if (search) {
    query = query.or(`title.ilike.%${search}%,external_id.ilike.%${search}%`);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  if (error) throw error;

  const items = ((data ?? []) as Array<Record<string, unknown>>).map((item): SyncReviewChangeItem => ({
    id: String(item.id),
    syncRunId: typeof item.sync_run_id === "string" ? item.sync_run_id : undefined,
    source: String(item.source ?? ""),
    externalId: typeof item.external_id === "string" ? item.external_id : null,
    automationId: typeof item.automation_id === "string" ? item.automation_id : null,
    changeType: String(item.change_type ?? ""),
    status: typeof item.status === "string" ? item.status : undefined,
    title: String(item.title ?? ""),
    summary: String(item.summary ?? ""),
    impact: String(item.impact ?? ""),
    oldValue: item.old_value_sanitized,
    newValue: item.new_value_sanitized,
    payload: item.payload_sanitized,
    selectedByDefault: item.selected_by_default !== false,
    errorMessage: typeof item.error_message_sanitized === "string" ? item.error_message_sanitized : null,
  }));

  const total = typeof count === "number" ? count : items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const visibleFrom = total === 0 ? 0 : rangeFrom + 1;
  const visibleTo = total === 0 ? 0 : Math.min(rangeTo + 1, total);

  return {
    items,
    total,
    page,
    pageSize,
    pageCount,
    from: visibleFrom,
    to: visibleTo,
  };
}

export async function triggerGitlabBackfillDryRun(): Promise<GitLabBackfillResult> {
  return invokeEdgeFunction("gitlab-sync", { mode: "backfill", dryRun: true });
}

export async function triggerGitlabBackfillApply(): Promise<GitLabBackfillResult> {
  return invokeEdgeFunction("gitlab-sync", { mode: "backfill", dryRun: false });
}
