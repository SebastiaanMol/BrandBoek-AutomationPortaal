import { supabase } from "@/integrations/supabase/client";

export type ProcessJourneyReviewItemType =
  | "missing_automation"
  | "wrong_edge"
  | "missing_source_data"
  | "duplicate_or_legacy_node"
  | "endpoint_mismatch"
  | "description_fix"
  | "stop_point_unclear"
  | "other";

export type ProcessJourneyReviewItemStatus = "open" | "resolved";

export interface ProcessJourneyReviewItem {
  id: string;
  conceptJourneyId: string;
  flowId: string | null;
  automationId: string | null;
  fromAutomationId: string | null;
  toAutomationId: string | null;
  normalizedPath: string | null;
  itemType: ProcessJourneyReviewItemType;
  status: ProcessJourneyReviewItemStatus;
  note: string;
  proposedAction: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface FetchProcessJourneyReviewItemsInput {
  conceptJourneyId?: string;
  flowId?: string;
}

export interface CreateProcessJourneyReviewItemInput {
  conceptJourneyId: string;
  flowId?: string | null;
  automationId?: string | null;
  fromAutomationId?: string | null;
  toAutomationId?: string | null;
  normalizedPath?: string | null;
  itemType: ProcessJourneyReviewItemType;
  note: string;
  proposedAction: string;
}

type ReviewItemRow = {
  id: string;
  concept_journey_id: string;
  flow_id: string | null;
  automation_id: string | null;
  from_automation_id: string | null;
  to_automation_id: string | null;
  normalized_path: string | null;
  item_type: ProcessJourneyReviewItemType;
  status: ProcessJourneyReviewItemStatus;
  note: string | null;
  proposed_action: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

const REVIEW_ITEM_SELECT = [
  "id",
  "concept_journey_id",
  "flow_id",
  "automation_id",
  "from_automation_id",
  "to_automation_id",
  "normalized_path",
  "item_type",
  "status",
  "note",
  "proposed_action",
  "created_at",
  "updated_at",
  "resolved_at",
].join(", ");

export async function fetchProcessJourneyReviewItems({
  conceptJourneyId,
  flowId,
}: FetchProcessJourneyReviewItemsInput = {}): Promise<ProcessJourneyReviewItem[]> {
  let query = db()
    .from("process_journey_review_items")
    .select(REVIEW_ITEM_SELECT)
    .order("created_at", { ascending: false });

  if (conceptJourneyId && flowId) {
    query = query.or(`concept_journey_id.eq.${escapeOrValue(conceptJourneyId)},flow_id.eq.${escapeOrValue(flowId)}`);
  } else if (conceptJourneyId) {
    query = query.eq("concept_journey_id", conceptJourneyId);
  } else if (flowId) {
    query = query.eq("flow_id", flowId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as ReviewItemRow[]).map(mapReviewItemRow);
}

export async function createProcessJourneyReviewItem(
  input: CreateProcessJourneyReviewItemInput,
): Promise<ProcessJourneyReviewItem> {
  const payload = {
    concept_journey_id: input.conceptJourneyId,
    flow_id: input.flowId ?? null,
    automation_id: input.automationId ?? null,
    from_automation_id: input.fromAutomationId ?? null,
    to_automation_id: input.toAutomationId ?? null,
    normalized_path: input.normalizedPath ?? null,
    item_type: input.itemType,
    status: "open" as const,
    note: input.note,
    proposed_action: input.proposedAction,
  };

  const { data, error } = await db()
    .from("process_journey_review_items")
    .insert(payload)
    .select(REVIEW_ITEM_SELECT)
    .single();

  if (error) throw error;
  return mapReviewItemRow(data as ReviewItemRow);
}

export async function updateProcessJourneyReviewItemStatus(
  id: string,
  status: ProcessJourneyReviewItemStatus,
): Promise<void> {
  const payload = status === "resolved"
    ? { status, resolved_at: new Date().toISOString() }
    : { status, resolved_at: null };
  const { error } = await db()
    .from("process_journey_review_items")
    .update(payload)
    .eq("id", id);
  if (error) throw error;
}

function mapReviewItemRow(row: ReviewItemRow): ProcessJourneyReviewItem {
  return {
    id: row.id,
    conceptJourneyId: row.concept_journey_id,
    flowId: row.flow_id,
    automationId: row.automation_id,
    fromAutomationId: row.from_automation_id,
    toAutomationId: row.to_automation_id,
    normalizedPath: row.normalized_path,
    itemType: row.item_type,
    status: row.status,
    note: row.note ?? "",
    proposedAction: row.proposed_action ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  };
}

function escapeOrValue(value: string): string {
  return value.replaceAll(",", "\\,");
}

function db(): any {
  return supabase as any;
}
