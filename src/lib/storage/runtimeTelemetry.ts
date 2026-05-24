import { supabase } from "@/integrations/supabase/client";
import {
  RuntimeEdge,
  RuntimeEvent,
  RuntimeIngestQueueItem,
  RuntimeSignal,
  RuntimeStateTransition,
  RuntimeTrace,
  RuntimeWorker,
} from "../runtimeObservability";
import {
  buildObservedPropagationEdge,
  correlateRuntimeEvent,
  deriveStateTransitionFromEvent,
  normalizeRuntimeTelemetryEvent,
  reconstructObservedPropagationOrder,
  RuntimeTelemetryEventInput,
} from "../runtimeTelemetry";
import {
  fetchRuntimeEvents,
  fetchRuntimeGraphSnapshot,
  fetchRuntimeStateTransitions,
} from "./runtimeObservability";

type RuntimeDb = typeof supabase;
const runtimeDb = supabase as RuntimeDb & {
  from(table: string): ReturnType<typeof supabase.from>;
};

export interface IngestRuntimeEventOptions {
  processImmediately?: boolean;
}

export interface IngestRuntimeEventResult {
  queueItem: RuntimeIngestQueueItem;
  event?: RuntimeEvent;
  trace?: RuntimeTrace;
  transition?: RuntimeStateTransition | null;
}

export interface RuntimeTraceTimeline {
  trace: RuntimeTrace;
  events: RuntimeEvent[];
  transitions: RuntimeStateTransition[];
  observedEdges: RuntimeEdge[];
}

export async function ingestRuntimeEvent(
  input: RuntimeTelemetryEventInput,
  options: IngestRuntimeEventOptions = { processImmediately: false },
): Promise<IngestRuntimeEventResult> {
  const normalized = normalizeRuntimeTelemetryEvent(input);
  const { data, error } = await runtimeDb
    .from("runtime_event_ingest_queue")
    .insert({
      source_system: normalized.sourceSystem,
      event_type: normalized.eventType,
      correlation_id: normalized.correlationId,
      hubspot_object_type: normalized.hubspotObjectType,
      hubspot_object_id: normalized.hubspotObjectId,
      payload: normalized.rawPayload ?? {},
      normalized_payload: normalized as unknown as Record<string, unknown>,
      processing_status: "pending",
      metadata: normalized.metadata ?? {},
    })
    .select("*")
    .single();
  if (error) throw error;

  const queueItem = mapQueueItem(data as RuntimeIngestQueueRow);
  if (!options.processImmediately) return { queueItem };

  return processRuntimeIngestQueueItem(queueItem.id);
}

export async function processRuntimeIngestQueueItem(queueItemId: string): Promise<IngestRuntimeEventResult> {
  const { data, error } = await runtimeDb
    .from("runtime_event_ingest_queue")
    .select("*")
    .eq("id", queueItemId)
    .single();
  if (error) throw error;

  const queueItem = mapQueueItem(data as RuntimeIngestQueueRow);
  const normalized = queueItem.normalizedPayload as unknown as RuntimeTelemetryEventInput;

  try {
    const correlation = await reconstructRuntimeTrace(normalized);
    const event = await insertRuntimeEvent(normalized, queueItem.id, correlation);
    const trace = await ensureRuntimeTraceForEvent(event, correlation);
    const eventWithTrace = { ...event, traceId: trace.id };
    const transition = await insertStateTransitionForEvent(eventWithTrace);

    await linkEventToTrace(trace.id, eventWithTrace.id);
    await boostObservedPropagation(eventWithTrace);
    await refreshTraceSummary(trace.id);

    const { data: updatedQueue, error: queueError } = await runtimeDb
      .from("runtime_event_ingest_queue")
      .update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
        runtime_event_id: eventWithTrace.id,
        trace_id: trace.id,
        correlation_strategy: correlation.strategy,
        confidence_score: correlation.confidenceScore,
      })
      .eq("id", queueItem.id)
      .select("*")
      .single();
    if (queueError) throw queueError;

    return {
      queueItem: mapQueueItem(updatedQueue as RuntimeIngestQueueRow),
      event: eventWithTrace,
      trace,
      transition,
    };
  } catch (caught) {
    await runtimeDb
      .from("runtime_event_ingest_queue")
      .update({
        processing_status: "failed",
        processed_at: new Date().toISOString(),
        error_message: caught instanceof Error ? caught.message : String(caught),
      })
      .eq("id", queueItem.id);
    throw caught;
  }
}

export async function reconstructRuntimeTrace(input: RuntimeTelemetryEventInput) {
  const normalized = normalizeRuntimeTelemetryEvent(input);
  const candidates = await fetchTraceCandidates(normalized);
  return correlateRuntimeEvent(normalized, candidates);
}

export async function correlateWorkerExecution(input: RuntimeTelemetryEventInput) {
  return reconstructRuntimeTrace({
    ...input,
    sourceSystem: input.sourceSystem ?? "gitlab",
    eventType: input.eventType ?? "worker_started",
  });
}

export async function correlateHubSpotStateTransition(input: RuntimeTelemetryEventInput) {
  return reconstructRuntimeTrace({
    ...input,
    sourceSystem: input.sourceSystem ?? "hubspot",
    eventType: input.eventType ?? (input.dealstageNew ? "hubspot_stage_changed" : "hubspot_property_changed"),
  });
}

export async function buildObservedPropagationEdgeForEvents(
  sourceEvent: RuntimeEvent,
  targetEvent: RuntimeEvent,
): Promise<RuntimeEdge | null> {
  const graph = await fetchRuntimeGraphSnapshot({ includeInactiveWorkers: true });
  const sourceWorker = graph.workers.find((worker) => worker.id === sourceEvent.workerId) ?? null;
  const targetWorker = graph.workers.find((worker) => worker.id === targetEvent.workerId) ?? null;
  const emittedSignal = graph.signals.find((signal) => signal.id === targetEvent.signalId || signal.id === sourceEvent.signalId) ?? null;
  const inferredEdge =
    graph.edges.find(
      (edge) =>
        edge.sourceWorkerId === sourceEvent.workerId &&
        edge.targetWorkerId === targetEvent.workerId &&
        (!emittedSignal || edge.emittedSignalId === emittedSignal.id),
    ) ?? null;

  const draft = buildObservedPropagationEdge({ sourceEvent, targetEvent, sourceWorker, targetWorker, emittedSignal, inferredEdge });
  if (!draft) return null;
  return upsertObservedEdge(draft);
}

export async function getTraceByObject(
  hubspotObjectType: string,
  hubspotObjectId: string,
  limit = 20,
): Promise<RuntimeTrace[]> {
  const { data, error } = await runtimeDb
    .from("runtime_traces")
    .select("*")
    .eq("root_hubspot_object_type", hubspotObjectType)
    .eq("root_hubspot_object_id", hubspotObjectId)
    .order("last_event_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as RuntimeTraceRow[]).map(mapTrace);
}

export async function getRecentRuntimeTraces(limit = 25): Promise<RuntimeTrace[]> {
  const { data, error } = await runtimeDb
    .from("runtime_traces")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as RuntimeTraceRow[]).map(mapTrace);
}

export async function getTraceTimeline(traceId: string): Promise<RuntimeTraceTimeline | null> {
  const { data: traceRow, error } = await runtimeDb
    .from("runtime_traces")
    .select("*")
    .eq("id", traceId)
    .maybeSingle();
  if (error) throw error;
  if (!traceRow) return null;

  const [events, transitions, observedEdges] = await Promise.all([
    fetchRuntimeEvents({ traceId, limit: 500 }),
    fetchRuntimeStateTransitions({ traceId, limit: 500 }),
    getObservedPropagationChains({ traceId }),
  ]);

  return {
    trace: mapTrace(traceRow as RuntimeTraceRow),
    events: reconstructObservedPropagationOrder(events),
    transitions: transitions.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()),
    observedEdges,
  };
}

export async function getWorkerExecutionHistory(workerId: string, limit = 50): Promise<RuntimeEvent[]> {
  return fetchRuntimeEvents({ workerId, limit });
}

export async function getObservedPropagationChains(filters: {
  traceId?: string;
  workerId?: string;
  signalId?: string;
  limit?: number;
} = {}): Promise<RuntimeEdge[]> {
  let query = runtimeDb
    .from("runtime_edges")
    .select("*")
    .eq("relationship_origin", "observed_runtime_trace")
    .order("last_observed_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.workerId) {
    query = query.or(`source_worker_id.eq.${filters.workerId},target_worker_id.eq.${filters.workerId}`);
  }
  if (filters.signalId) query = query.eq("emitted_signal_id", filters.signalId);
  if (filters.traceId) query = query.contains("metadata", { trace_ids: [filters.traceId] });

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as RuntimeEdgeRow[]).map(mapEdge);
}

export async function getObservedLoops(): Promise<RuntimeTraceTimeline[]> {
  const { data, error } = await runtimeDb
    .from("runtime_traces")
    .select("*")
    .contains("metadata", { has_observed_loop: true })
    .order("last_event_at", { ascending: false })
    .limit(25);
  if (error) throw error;

  const timelines = await Promise.all(((data ?? []) as RuntimeTraceRow[]).map((trace) => getTraceTimeline(trace.id)));
  return timelines.filter(Boolean) as RuntimeTraceTimeline[];
}

async function fetchTraceCandidates(input: RuntimeTelemetryEventInput) {
  let query = runtimeDb
    .from("runtime_traces")
    .select("*")
    .in("status", ["running", "partial"])
    .order("last_event_at", { ascending: false })
    .limit(20);

  if (input.correlationId) {
    query = query.or(`correlation_id.eq.${input.correlationId},metadata->>correlation_id.eq.${input.correlationId}`);
  } else if (input.hubspotObjectType && input.hubspotObjectId) {
    query = query
      .eq("root_hubspot_object_type", input.hubspotObjectType)
      .eq("root_hubspot_object_id", input.hubspotObjectId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return Promise.all(
    ((data ?? []) as RuntimeTraceRow[]).map(async (traceRow) => ({
      trace: mapTrace(traceRow),
      recentEvents: await fetchRuntimeEvents({ traceId: traceRow.id, limit: 50 }),
      score: 0,
      strategy: "new_trace" as const,
      reasons: [],
    })),
  );
}

async function insertRuntimeEvent(
  input: RuntimeTelemetryEventInput,
  ingestQueueId: string,
  correlation: Awaited<ReturnType<typeof reconstructRuntimeTrace>>,
): Promise<RuntimeEvent> {
  const { data, error } = await runtimeDb
    .from("runtime_events")
    .insert({
      trace_id: correlation.traceId,
      occurred_at: input.occurredAt,
      event_type: input.eventType,
      source_system: input.sourceSystem,
      worker_id: input.workerId,
      signal_id: input.signalId,
      hubspot_object_type: input.hubspotObjectType,
      hubspot_object_id: input.hubspotObjectId,
      property_name: input.propertyName,
      old_value: input.oldValue,
      new_value: input.newValue,
      dealstage_old: input.dealstageOld,
      dealstage_new: input.dealstageNew,
      pipeline_id: input.pipelineId,
      correlation_id: input.correlationId,
      ingest_queue_id: ingestQueueId,
      parent_event_id: correlation.parentEventId,
      causation_event_id: correlation.causationEventId,
      external_event_id: input.externalEventId,
      correlation_strategy: correlation.strategy,
      confidence_score: correlation.confidenceScore,
      raw_payload: input.rawPayload ?? {},
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapEvent(data as RuntimeEventRow);
}

async function ensureRuntimeTraceForEvent(
  event: RuntimeEvent,
  correlation: Awaited<ReturnType<typeof reconstructRuntimeTrace>>,
): Promise<RuntimeTrace> {
  if (correlation.traceId) {
    await runtimeDb
      .from("runtime_events")
      .update({ trace_id: correlation.traceId })
      .eq("id", event.id);

    const { data, error } = await runtimeDb
      .from("runtime_traces")
      .select("*")
      .eq("id", correlation.traceId)
      .single();
    if (error) throw error;
    return mapTrace(data as RuntimeTraceRow);
  }

  const { data, error } = await runtimeDb
    .from("runtime_traces")
    .insert({
      root_event_id: event.id,
      started_at: event.occurredAt,
      status: event.eventType === "error" ? "failed" : "running",
      root_hubspot_object_type: event.hubspotObjectType,
      root_hubspot_object_id: event.hubspotObjectId,
      correlation_id: event.correlationId,
      last_event_at: event.occurredAt,
      event_count: 1,
      summary: buildTraceSummary(event),
      confidence_score: correlation.confidenceScore,
      metadata: {
        correlation_id: event.correlationId,
        correlation_strategy: correlation.strategy,
        root_source_system: event.sourceSystem,
      },
    })
    .select("*")
    .single();
  if (error) throw error;

  const trace = mapTrace(data as RuntimeTraceRow);
  await runtimeDb.from("runtime_events").update({ trace_id: trace.id }).eq("id", event.id);
  return trace;
}

async function insertStateTransitionForEvent(event: RuntimeEvent): Promise<RuntimeStateTransition | null> {
  const transition = deriveStateTransitionFromEvent(event);
  if (!transition) return null;

  const { data, error } = await runtimeDb
    .from("runtime_state_transitions")
    .insert({
      event_id: transition.eventId,
      trace_id: transition.traceId,
      worker_id: transition.workerId,
      signal_id: transition.signalId,
      transition_type: transition.transitionType,
      hubspot_object_type: transition.hubspotObjectType,
      hubspot_object_id: transition.hubspotObjectId,
      property_name: transition.propertyName,
      old_value: transition.oldValue,
      new_value: transition.newValue,
      pipeline_id: transition.pipelineId,
      dealstage_old: transition.dealstageOld,
      dealstage_new: transition.dealstageNew,
      causation_event_id: event.causationEventId,
      correlation_strategy: event.correlationStrategy,
      source_event_type: event.eventType,
      emitted_signal_id: event.signalId,
      confidence_score: transition.confidenceScore,
      metadata: transition.metadata,
      occurred_at: transition.occurredAt,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapStateTransition(data as RuntimeStateTransitionRow);
}

async function linkEventToTrace(traceId: string, eventId: string): Promise<void> {
  const { count } = await runtimeDb
    .from("runtime_trace_events")
    .select("*", { count: "exact", head: true })
    .eq("trace_id", traceId);

  const { error } = await runtimeDb
    .from("runtime_trace_events")
    .upsert({
      trace_id: traceId,
      event_id: eventId,
      sequence_index: count ?? 0,
      metadata: { linked_by: "runtimeTelemetry.processRuntimeIngestQueueItem" },
    });
  if (error) throw error;
}

async function boostObservedPropagation(event: RuntimeEvent): Promise<void> {
  if (!event.traceId) return;
  const events = reconstructObservedPropagationOrder(await fetchRuntimeEvents({ traceId: event.traceId, limit: 100 }));
  const currentIndex = events.findIndex((item) => item.id === event.id);
  const previous = currentIndex > 0 ? events[currentIndex - 1] : null;
  if (!previous?.workerId || !event.workerId || previous.workerId === event.workerId) return;

  const edge = await buildObservedPropagationEdgeForEvents(previous, event);
  if (!edge) return;

  await runtimeDb
    .from("runtime_traces")
    .update({
      observed_edge_count: Math.max(1, (await countObservedEdgesForTrace(event.traceId)) ?? 1),
    })
    .eq("id", event.traceId);
}

async function upsertObservedEdge(draft: Awaited<ReturnType<typeof buildObservedPropagationEdge>>): Promise<RuntimeEdge> {
  if (!draft) throw new Error("Cannot upsert an empty observed edge.");
  const id = [
    "observed",
    draft.sourceWorkerId,
    draft.emittedSignalId ?? "unknown-signal",
    draft.targetWorkerId,
  ].join("--");

  const { data: existing } = await runtimeDb
    .from("runtime_edges")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const existingEdge = existing ? mapEdge(existing as RuntimeEdgeRow) : null;
  const metadata = {
    ...(existingEdge?.metadata ?? {}),
    ...draft.metadata,
    trace_ids: uniqueStrings([
      ...((existingEdge?.metadata?.trace_ids as string[] | undefined) ?? []),
      draft.metadata.trace_id as string,
    ]),
  };

  const { data, error } = await runtimeDb
    .from("runtime_edges")
    .upsert({
      id,
      source_worker_id: draft.sourceWorkerId,
      target_worker_id: draft.targetWorkerId,
      emitted_signal_id: draft.emittedSignalId,
      workflow_graph_id: draft.workflowGraphId,
      relationship_type: draft.relationshipType,
      relationship_origin: draft.relationshipOrigin,
      evidence_type: draft.evidenceType,
      confidence_score: Math.max(existingEdge?.confidenceScore ?? 0, draft.confidenceScore),
      confidence_label: draft.confidenceLabel,
      confidence_reasons: uniqueStrings([...(existingEdge?.confidenceReasons ?? []), ...draft.confidenceReasons]),
      fan_out_score: Math.max(existingEdge?.fanOutScore ?? 0, 40),
      fan_out_risk: existingEdge?.fanOutRisk ?? "medium",
      risk_score: Math.max(existingEdge?.riskScore ?? 0, 40),
      observed_count: (existingEdge?.observedCount ?? 0) + 1,
      last_observed_at: new Date().toISOString(),
      metadata,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapEdge(data as RuntimeEdgeRow);
}

async function refreshTraceSummary(traceId: string): Promise<void> {
  const events = await fetchRuntimeEvents({ traceId, limit: 500 });
  const ordered = reconstructObservedPropagationOrder(events);
  const first = ordered[0];
  const last = ordered.at(-1);
  const workflowGraphIds = uniqueStrings(ordered.flatMap((event) => event.metadata?.workflow_graph_id ? [String(event.metadata.workflow_graph_id)] : []));

  await runtimeDb
    .from("runtime_traces")
    .update({
      last_event_at: last?.occurredAt,
      event_count: ordered.length,
      ended_at: hasTerminalEvent(ordered) ? last?.occurredAt : null,
      status: hasErrorEvent(ordered) ? "failed" : hasTerminalEvent(ordered) ? "completed" : "running",
      workflow_graph_ids: workflowGraphIds,
      summary: first ? buildTraceSummary(first) : null,
    })
    .eq("id", traceId);
}

async function countObservedEdgesForTrace(traceId: string): Promise<number> {
  const { count } = await runtimeDb
    .from("runtime_edges")
    .select("*", { count: "exact", head: true })
    .eq("relationship_origin", "observed_runtime_trace")
    .contains("metadata", { trace_ids: [traceId] });
  return count ?? 0;
}

function buildTraceSummary(event: RuntimeEvent): string {
  const object = [event.hubspotObjectType, event.hubspotObjectId].filter(Boolean).join(":");
  return `${event.eventType} from ${event.sourceSystem}${object ? ` for ${object}` : ""}`;
}

function hasTerminalEvent(events: RuntimeEvent[]): boolean {
  return events.some((event) => event.eventType === "worker_finished" || event.eventType === "error");
}

function hasErrorEvent(events: RuntimeEvent[]): boolean {
  return events.some((event) => event.eventType === "error");
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter(Boolean).map(String))];
}

interface RuntimeIngestQueueRow {
  id: string;
  received_at: string;
  source_system: string;
  event_type: string;
  correlation_id: string | null;
  hubspot_object_type: string | null;
  hubspot_object_id: string | null;
  payload: Record<string, unknown> | null;
  normalized_payload: Record<string, unknown> | null;
  processing_status: RuntimeIngestQueueItem["processingStatus"];
  processed_at: string | null;
  error_message: string | null;
  runtime_event_id: string | null;
  trace_id: string | null;
  correlation_strategy: string | null;
  confidence_score: number | null;
  metadata: Record<string, unknown> | null;
}

interface RuntimeEventRow {
  id: string;
  trace_id: string | null;
  occurred_at: string;
  event_type: RuntimeEvent["eventType"];
  source_system: RuntimeEvent["sourceSystem"];
  worker_id: string | null;
  signal_id: string | null;
  hubspot_object_type: string | null;
  hubspot_object_id: string | null;
  property_name: string | null;
  old_value: string | null;
  new_value: string | null;
  dealstage_old: string | null;
  dealstage_new: string | null;
  pipeline_id: string | null;
  correlation_id: string | null;
  ingest_queue_id: string | null;
  parent_event_id: string | null;
  causation_event_id: string | null;
  external_event_id: string | null;
  correlation_strategy: string | null;
  confidence_score: number | null;
  raw_payload: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

interface RuntimeTraceRow {
  id: string;
  root_event_id: string | null;
  started_at: string;
  ended_at: string | null;
  status: RuntimeTrace["status"];
  root_hubspot_object_type: string | null;
  root_hubspot_object_id: string | null;
  correlation_id: string | null;
  last_event_at: string | null;
  event_count: number | null;
  observed_edge_count: number | null;
  reconstruction_version: number | null;
  workflow_graph_ids: string[] | null;
  summary: string | null;
  confidence_score: number | null;
  metadata: Record<string, unknown> | null;
}

interface RuntimeStateTransitionRow {
  id: string;
  event_id: string | null;
  trace_id: string | null;
  worker_id: string | null;
  signal_id: string | null;
  transition_type: RuntimeStateTransition["transitionType"];
  hubspot_object_type: string | null;
  hubspot_object_id: string | null;
  property_name: string | null;
  old_value: string | null;
  new_value: string | null;
  pipeline_id: string | null;
  dealstage_old: string | null;
  dealstage_new: string | null;
  causation_event_id: string | null;
  correlation_strategy: string | null;
  source_event_type: string | null;
  emitted_signal_id: string | null;
  confidence_score: number | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

interface RuntimeEdgeRow {
  id: string;
  source_worker_id: string;
  target_worker_id: string;
  emitted_signal_id: string | null;
  source_signal_id: string | null;
  target_trigger_signal_id: string | null;
  workflow_graph_id: string | null;
  relationship_type: RuntimeEdge["relationshipType"];
  relationship_origin: RuntimeEdge["relationshipOrigin"];
  evidence_type: RuntimeEdge["evidenceType"];
  confidence_score: number | null;
  confidence_label: RuntimeEdge["confidenceLabel"];
  confidence_reasons: string[] | null;
  fan_out_score: number | null;
  fan_out_risk: RuntimeEdge["fanOutRisk"];
  risk_score: number | null;
  observed_count: number | null;
  last_observed_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
}

function mapQueueItem(row: RuntimeIngestQueueRow): RuntimeIngestQueueItem {
  return {
    id: row.id,
    receivedAt: row.received_at,
    sourceSystem: row.source_system,
    eventType: row.event_type,
    correlationId: row.correlation_id,
    hubspotObjectType: row.hubspot_object_type,
    hubspotObjectId: row.hubspot_object_id,
    payload: row.payload ?? {},
    normalizedPayload: row.normalized_payload ?? {},
    processingStatus: row.processing_status,
    processedAt: row.processed_at,
    errorMessage: row.error_message,
    runtimeEventId: row.runtime_event_id,
    traceId: row.trace_id,
    correlationStrategy: row.correlation_strategy,
    confidenceScore: row.confidence_score ?? 0.5,
    metadata: row.metadata ?? {},
  };
}

function mapEvent(row: RuntimeEventRow): RuntimeEvent {
  return {
    id: row.id,
    traceId: row.trace_id,
    occurredAt: row.occurred_at,
    eventType: row.event_type,
    sourceSystem: row.source_system,
    workerId: row.worker_id,
    signalId: row.signal_id,
    hubspotObjectType: row.hubspot_object_type,
    hubspotObjectId: row.hubspot_object_id,
    propertyName: row.property_name,
    oldValue: row.old_value,
    newValue: row.new_value,
    dealstageOld: row.dealstage_old,
    dealstageNew: row.dealstage_new,
    pipelineId: row.pipeline_id,
    correlationId: row.correlation_id,
    ingestQueueId: row.ingest_queue_id,
    parentEventId: row.parent_event_id,
    causationEventId: row.causation_event_id,
    externalEventId: row.external_event_id,
    correlationStrategy: row.correlation_strategy,
    confidenceScore: row.confidence_score ?? 0.5,
    rawPayload: row.raw_payload ?? {},
    metadata: row.metadata ?? {},
  };
}

function mapTrace(row: RuntimeTraceRow): RuntimeTrace {
  return {
    id: row.id,
    rootEventId: row.root_event_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    rootHubspotObjectType: row.root_hubspot_object_type,
    rootHubspotObjectId: row.root_hubspot_object_id,
    correlationId: row.correlation_id,
    lastEventAt: row.last_event_at,
    eventCount: row.event_count ?? 0,
    observedEdgeCount: row.observed_edge_count ?? 0,
    reconstructionVersion: row.reconstruction_version ?? 1,
    workflowGraphIds: row.workflow_graph_ids ?? [],
    summary: row.summary,
    confidenceScore: row.confidence_score ?? 0.5,
    metadata: row.metadata ?? {},
  };
}

function mapStateTransition(row: RuntimeStateTransitionRow): RuntimeStateTransition {
  return {
    id: row.id,
    eventId: row.event_id,
    traceId: row.trace_id,
    workerId: row.worker_id,
    signalId: row.signal_id,
    transitionType: row.transition_type,
    hubspotObjectType: row.hubspot_object_type,
    hubspotObjectId: row.hubspot_object_id,
    propertyName: row.property_name,
    oldValue: row.old_value,
    newValue: row.new_value,
    pipelineId: row.pipeline_id,
    dealstageOld: row.dealstage_old,
    dealstageNew: row.dealstage_new,
    causationEventId: row.causation_event_id,
    correlationStrategy: row.correlation_strategy,
    sourceEventType: row.source_event_type,
    emittedSignalId: row.emitted_signal_id,
    confidenceScore: row.confidence_score ?? 0.5,
    metadata: row.metadata ?? {},
    occurredAt: row.occurred_at,
  };
}

function mapEdge(row: RuntimeEdgeRow): RuntimeEdge {
  return {
    id: row.id,
    sourceWorkerId: row.source_worker_id,
    targetWorkerId: row.target_worker_id,
    emittedSignalId: row.emitted_signal_id,
    sourceSignalId: row.source_signal_id,
    targetTriggerSignalId: row.target_trigger_signal_id,
    workflowGraphId: row.workflow_graph_id,
    relationshipType: row.relationship_type,
    relationshipOrigin: row.relationship_origin,
    evidenceType: row.evidence_type,
    confidenceScore: row.confidence_score ?? 0.5,
    confidenceLabel: row.confidence_label,
    confidenceReasons: row.confidence_reasons ?? [],
    fanOutScore: row.fan_out_score ?? 0,
    fanOutRisk: row.fan_out_risk,
    riskScore: row.risk_score ?? 0,
    observedCount: row.observed_count ?? 0,
    lastObservedAt: row.last_observed_at,
    notes: row.notes,
    metadata: row.metadata ?? {},
  };
}
