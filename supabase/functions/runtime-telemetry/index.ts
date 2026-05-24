import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-runtime-telemetry-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type RuntimeEventType =
  | "webhook_received"
  | "worker_started"
  | "worker_finished"
  | "hubspot_property_changed"
  | "hubspot_stage_changed"
  | "api_write"
  | "error"
  | "portal_action"
  | "external_event";

type RuntimeSourceSystem = "gitlab" | "hubspot" | "portal" | "supabase_edge" | "external" | "manual";

type TelemetryEvent = {
  sourceSystem?: RuntimeSourceSystem;
  source_system?: RuntimeSourceSystem;
  eventType?: RuntimeEventType;
  event_type?: RuntimeEventType;
  occurredAt?: string;
  occurred_at?: string;
  workerId?: string | null;
  worker_id?: string | null;
  signalId?: string | null;
  signal_id?: string | null;
  hubspotObjectType?: string | null;
  hubspot_object_type?: string | null;
  hubspotObjectId?: string | null;
  hubspot_object_id?: string | null;
  propertyName?: string | null;
  property_name?: string | null;
  oldValue?: string | null;
  old_value?: string | null;
  newValue?: string | null;
  new_value?: string | null;
  dealstageOld?: string | null;
  dealstage_old?: string | null;
  dealstageNew?: string | null;
  dealstage_new?: string | null;
  pipelineId?: string | null;
  pipeline_id?: string | null;
  correlationId?: string | null;
  correlation_id?: string | null;
  traceId?: string | null;
  trace_id?: string | null;
  externalEventId?: string | null;
  external_event_id?: string | null;
  rawPayload?: Record<string, unknown>;
  raw_payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type NormalizedEvent = {
  sourceSystem: RuntimeSourceSystem;
  eventType: RuntimeEventType;
  occurredAt: string;
  workerId: string | null;
  signalId: string | null;
  hubspotObjectType: string | null;
  hubspotObjectId: string | null;
  propertyName: string | null;
  oldValue: string | null;
  newValue: string | null;
  dealstageOld: string | null;
  dealstageNew: string | null;
  pipelineId: string | null;
  correlationId: string | null;
  traceId: string | null;
  externalEventId: string | null;
  rawPayload: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

type TraceCandidate = {
  trace: Record<string, unknown>;
  recentEvents: Array<Record<string, unknown>>;
  score: number;
  strategy: string;
  reasons: string[];
};

const TRACE_TIME_WINDOW_MS = 30 * 60 * 1000;
const WORKER_CAUSATION_WINDOW_MS = 10 * 60 * 1000;
const MAX_BATCH_SIZE = numberEnv("RUNTIME_TELEMETRY_MAX_BATCH_SIZE", 50);
const MAX_PENDING = numberEnv("RUNTIME_TELEMETRY_MAX_PENDING", 5000);
const SAMPLE_RATE = Math.max(0, Math.min(1, Number(Deno.env.get("RUNTIME_TELEMETRY_SAMPLE_RATE") ?? "1")));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Only POST is supported." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "ingest");
    const db = createRuntimeClient();
    await authorize(db, req);

    if (action === "health") return jsonResponse(await getTelemetryHealth(db));
    if (action === "retry-failed") return jsonResponse(await retryFailedQueueItems(db, Number(body.limit ?? 25)));

    const rawEvents = Array.isArray(body.events) ? body.events : [body.event ?? body];
    if (rawEvents.length > MAX_BATCH_SIZE) {
      return jsonResponse({ error: `Batch too large. Max ${MAX_BATCH_SIZE} events.` }, 413);
    }

    const pendingCount = await getPendingCount(db);
    if (pendingCount >= MAX_PENDING) {
      return jsonResponse(
        { error: "Runtime telemetry queue is under backpressure.", pendingCount, maxPending: MAX_PENDING },
        429,
      );
    }

    const processImmediately = body.processImmediately ?? body.process_immediately ?? true;
    const results = [];
    for (const rawEvent of rawEvents) {
      const normalized = normalizeEvent(rawEvent);
      if (shouldSampleOut(normalized)) {
        results.push({ status: "sampled-out", sourceSystem: normalized.sourceSystem, eventType: normalized.eventType });
        continue;
      }
      results.push(await ingestOne(db, normalized, Boolean(processImmediately)));
    }

    return jsonResponse({ ok: true, count: results.length, results });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("Unauthorized") || message.includes("Invalid runtime telemetry ingest key") ? 401 : 500;
    return jsonResponse({ ok: false, error: message }, status);
  }
});

function createRuntimeClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function authorize(db: ReturnType<typeof createRuntimeClient>, req: Request) {
  const expected = Deno.env.get("RUNTIME_TELEMETRY_INGEST_KEY");
  const provided = req.headers.get("x-runtime-telemetry-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (expected && provided === expected) return;

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer) {
    const { data, error } = await db.auth.getUser(bearer);
    if (!error && data.user) return;
  }

  throw new Error("Unauthorized runtime telemetry request.");
}

async function ingestOne(db: ReturnType<typeof createRuntimeClient>, event: NormalizedEvent, processImmediately: boolean) {
  const duplicate = await findDuplicateEvent(db, event);
  if (duplicate) return { status: "duplicate", eventId: duplicate.id, traceId: duplicate.trace_id };

  const queue = await insertQueueItem(db, event);
  if (!processImmediately) return { status: "queued", queueId: queue.id };

  try {
    const correlation = await reconstructRuntimeTrace(db, event);
    const runtimeEvent = await insertRuntimeEvent(db, event, queue.id, correlation);
    const trace = await ensureTraceForEvent(db, runtimeEvent, correlation);
    const eventWithTrace = { ...runtimeEvent, trace_id: trace.id };
    const transition = await insertStateTransitionForEvent(db, eventWithTrace);

    await linkEventToTrace(db, trace.id, eventWithTrace.id);
    await boostObservedPropagation(db, eventWithTrace);
    await refreshTraceSummary(db, trace.id);

    await db.from("runtime_event_ingest_queue").update({
      processing_status: "processed",
      processed_at: new Date().toISOString(),
      runtime_event_id: eventWithTrace.id,
      trace_id: trace.id,
      correlation_strategy: correlation.strategy,
      confidence_score: correlation.confidenceScore,
    }).eq("id", queue.id);

    return {
      status: "processed",
      queueId: queue.id,
      eventId: eventWithTrace.id,
      traceId: trace.id,
      transitionId: transition?.id ?? null,
      correlationStrategy: correlation.strategy,
      confidenceScore: correlation.confidenceScore,
    };
  } catch (error) {
    await db.from("runtime_event_ingest_queue").update({
      processing_status: "failed",
      processed_at: new Date().toISOString(),
      error_message: errorMessage(error),
    }).eq("id", queue.id);
    throw error;
  }
}

async function insertQueueItem(db: ReturnType<typeof createRuntimeClient>, event: NormalizedEvent) {
  const { data, error } = await db.from("runtime_event_ingest_queue").insert({
    source_system: event.sourceSystem,
    event_type: event.eventType,
    correlation_id: event.correlationId,
    hubspot_object_type: event.hubspotObjectType,
    hubspot_object_id: event.hubspotObjectId,
    external_event_id: event.externalEventId,
    payload: event.rawPayload,
    normalized_payload: event,
    processing_status: "pending",
    metadata: event.metadata,
  }).select("*").single();
  if (error) throw error;
  return data;
}

async function findDuplicateEvent(db: ReturnType<typeof createRuntimeClient>, event: NormalizedEvent) {
  if (!event.externalEventId) return null;
  const { data, error } = await db
    .from("runtime_events")
    .select("id, trace_id")
    .eq("source_system", event.sourceSystem)
    .eq("external_event_id", event.externalEventId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function reconstructRuntimeTrace(db: ReturnType<typeof createRuntimeClient>, event: NormalizedEvent) {
  if (event.traceId) {
    return {
      traceId: event.traceId,
      strategy: "explicit_correlation_id",
      confidenceScore: 1,
      parentEventId: null,
      causationEventId: null,
      reasons: ["Trace id was explicitly supplied by upstream worker."],
    };
  }

  const candidates = await fetchTraceCandidates(db, event);
  const scored = candidates.map((candidate) => scoreTraceCandidate(event, candidate)).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 0.45) {
    return {
      traceId: null,
      strategy: "new_trace",
      confidenceScore: 0.55,
      parentEventId: null,
      causationEventId: null,
      reasons: ["No existing trace matched strongly enough."],
    };
  }

  const orderedEvents = [...best.recentEvents].sort(compareEventsAsc);
  const parentEvent = orderedEvents.at(-1) ?? null;
  const causationEvent = findCausationEvent(event, orderedEvents);
  return {
    traceId: String(best.trace.id),
    strategy: best.strategy,
    confidenceScore: clamp(best.score),
    parentEventId: parentEvent?.id ?? null,
    causationEventId: causationEvent?.id ?? parentEvent?.id ?? null,
    reasons: best.reasons,
  };
}

async function fetchTraceCandidates(db: ReturnType<typeof createRuntimeClient>, event: NormalizedEvent): Promise<TraceCandidate[]> {
  let query = db.from("runtime_traces").select("*").in("status", ["running", "partial"]).order("last_event_at", { ascending: false }).limit(20);
  if (event.correlationId) {
    query = query.eq("correlation_id", event.correlationId);
  } else if (event.hubspotObjectType && event.hubspotObjectId) {
    query = query.eq("root_hubspot_object_type", event.hubspotObjectType).eq("root_hubspot_object_id", event.hubspotObjectId);
  }
  const { data, error } = await query;
  if (error) throw error;

  const candidates: TraceCandidate[] = [];
  for (const trace of data ?? []) {
    const { data: recentEvents, error: eventsError } = await db
      .from("runtime_events")
      .select("*")
      .eq("trace_id", trace.id)
      .order("occurred_at", { ascending: false })
      .limit(50);
    if (eventsError) throw eventsError;
    candidates.push({ trace, recentEvents: recentEvents ?? [], score: 0, strategy: "new_trace", reasons: [] });
  }
  return candidates;
}

function scoreTraceCandidate(event: NormalizedEvent, candidate: TraceCandidate): TraceCandidate {
  const reasons: string[] = [];
  let score = 0;
  let strategy = "new_trace";

  if (event.correlationId && candidate.trace.correlation_id === event.correlationId) {
    score += 0.95;
    strategy = "explicit_correlation_id";
    reasons.push("Correlation id matches.");
  }
  if (
    event.hubspotObjectType &&
    event.hubspotObjectId &&
    candidate.trace.root_hubspot_object_type === event.hubspotObjectType &&
    candidate.trace.root_hubspot_object_id === event.hubspotObjectId
  ) {
    score += 0.7;
    if (strategy === "new_trace") strategy = "hubspot_object_time_window";
    reasons.push("HubSpot object matches trace root.");
  }

  const recent = candidate.recentEvents.filter((item) => isWithinWindow(event.occurredAt, String(item.occurred_at), TRACE_TIME_WINDOW_MS));
  if (recent.length > 0) {
    score += 0.2;
    if (strategy === "new_trace") strategy = "hubspot_object_time_window";
    reasons.push("Event is inside trace time window.");
  }
  if (event.propertyName && recent.some((item) => item.property_name === event.propertyName || (event.signalId && item.signal_id === event.signalId))) {
    score += 0.25;
    strategy = "property_stage_continuity";
    reasons.push("Property or signal continuity matched.");
  }
  if (event.dealstageNew && recent.some((item) => item.dealstage_new === event.dealstageOld || item.dealstage_old === event.dealstageOld)) {
    score += 0.25;
    strategy = "property_stage_continuity";
    reasons.push("Dealstage continuity matched.");
  }

  return { ...candidate, score: Math.max(candidate.score, clamp(score)), strategy, reasons: [...candidate.reasons, ...reasons] };
}

async function insertRuntimeEvent(db: ReturnType<typeof createRuntimeClient>, event: NormalizedEvent, queueId: string, correlation: Record<string, unknown>) {
  const { data, error } = await db.from("runtime_events").insert({
    trace_id: correlation.traceId,
    occurred_at: event.occurredAt,
    event_type: event.eventType,
    source_system: event.sourceSystem,
    worker_id: event.workerId,
    signal_id: event.signalId,
    hubspot_object_type: event.hubspotObjectType,
    hubspot_object_id: event.hubspotObjectId,
    property_name: event.propertyName,
    old_value: event.oldValue,
    new_value: event.newValue,
    dealstage_old: event.dealstageOld,
    dealstage_new: event.dealstageNew,
    pipeline_id: event.pipelineId,
    correlation_id: event.correlationId,
    ingest_queue_id: queueId,
    parent_event_id: correlation.parentEventId,
    causation_event_id: correlation.causationEventId,
    external_event_id: event.externalEventId,
    correlation_strategy: correlation.strategy,
    confidence_score: correlation.confidenceScore,
    raw_payload: event.rawPayload,
    metadata: event.metadata,
  }).select("*").single();
  if (error) throw error;
  return data;
}

async function ensureTraceForEvent(db: ReturnType<typeof createRuntimeClient>, event: Record<string, unknown>, correlation: Record<string, unknown>) {
  if (correlation.traceId) {
    await db.from("runtime_events").update({ trace_id: correlation.traceId }).eq("id", event.id);
    const { data, error } = await db.from("runtime_traces").select("*").eq("id", correlation.traceId).single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await db.from("runtime_traces").insert({
    root_event_id: event.id,
    started_at: event.occurred_at,
    status: event.event_type === "error" ? "failed" : "running",
    root_hubspot_object_type: event.hubspot_object_type,
    root_hubspot_object_id: event.hubspot_object_id,
    correlation_id: event.correlation_id,
    last_event_at: event.occurred_at,
    event_count: 1,
    summary: buildTraceSummary(event),
    confidence_score: correlation.confidenceScore,
    metadata: {
      correlation_id: event.correlation_id,
      correlation_strategy: correlation.strategy,
      root_source_system: event.source_system,
    },
  }).select("*").single();
  if (error) throw error;
  await db.from("runtime_events").update({ trace_id: data.id }).eq("id", event.id);
  return data;
}

async function insertStateTransitionForEvent(db: ReturnType<typeof createRuntimeClient>, event: Record<string, unknown>) {
  const transition = deriveTransition(event);
  if (!transition) return null;
  const { data, error } = await db.from("runtime_state_transitions").insert(transition).select("*").single();
  if (error) throw error;
  return data;
}

function deriveTransition(event: Record<string, unknown>) {
  if (event.event_type === "hubspot_stage_changed" || event.dealstage_old || event.dealstage_new) {
    return {
      event_id: event.id,
      trace_id: event.trace_id,
      worker_id: event.worker_id,
      signal_id: event.signal_id,
      transition_type: "dealstage_change",
      hubspot_object_type: event.hubspot_object_type,
      hubspot_object_id: event.hubspot_object_id,
      property_name: event.property_name ?? "dealstage",
      old_value: event.old_value,
      new_value: event.new_value,
      pipeline_id: event.pipeline_id,
      dealstage_old: event.dealstage_old,
      dealstage_new: event.dealstage_new,
      causation_event_id: event.causation_event_id,
      correlation_strategy: event.correlation_strategy,
      source_event_type: event.event_type,
      emitted_signal_id: event.signal_id,
      confidence_score: 0.9,
      metadata: { source_event_type: event.event_type },
      occurred_at: event.occurred_at,
    };
  }
  if ((event.event_type === "hubspot_property_changed" || event.event_type === "api_write") && (event.property_name || event.signal_id)) {
    return {
      event_id: event.id,
      trace_id: event.trace_id,
      worker_id: event.worker_id,
      signal_id: event.signal_id,
      transition_type: "property_write",
      hubspot_object_type: event.hubspot_object_type,
      hubspot_object_id: event.hubspot_object_id,
      property_name: event.property_name,
      old_value: event.old_value,
      new_value: event.new_value,
      pipeline_id: event.pipeline_id,
      causation_event_id: event.causation_event_id,
      correlation_strategy: event.correlation_strategy,
      source_event_type: event.event_type,
      emitted_signal_id: event.signal_id,
      confidence_score: event.event_type === "api_write" ? 0.8 : 0.9,
      metadata: { source_event_type: event.event_type },
      occurred_at: event.occurred_at,
    };
  }
  return null;
}

async function linkEventToTrace(db: ReturnType<typeof createRuntimeClient>, traceId: string, eventId: string) {
  const { count } = await db.from("runtime_trace_events").select("*", { count: "exact", head: true }).eq("trace_id", traceId);
  const { error } = await db.from("runtime_trace_events").upsert({
    trace_id: traceId,
    event_id: eventId,
    sequence_index: count ?? 0,
    metadata: { linked_by: "runtime-telemetry-edge-function" },
  });
  if (error) throw error;
}

async function boostObservedPropagation(db: ReturnType<typeof createRuntimeClient>, event: Record<string, unknown>) {
  if (!event.trace_id) return;
  const { data: events, error } = await db.from("runtime_events").select("*").eq("trace_id", event.trace_id).order("occurred_at", { ascending: true }).limit(100);
  if (error) throw error;
  const index = (events ?? []).findIndex((item) => item.id === event.id);
  const previous = index > 0 ? events[index - 1] : null;
  if (!previous?.worker_id || !event.worker_id || previous.worker_id === event.worker_id) return;

  const emittedSignalId = String(event.signal_id ?? previous.signal_id ?? "unknown-signal");
  const edgeId = ["observed", previous.worker_id, emittedSignalId, event.worker_id].join("--");
  const { data: existing, error: existingError } = await db.from("runtime_edges").select("*").eq("id", edgeId).maybeSingle();
  if (existingError) throw existingError;

  const metadata = {
    ...(existing?.metadata ?? {}),
    source_event_id: previous.id,
    target_event_id: event.id,
    trace_id: event.trace_id,
    observed_at: event.occurred_at,
    trace_ids: [...new Set([...(existing?.metadata?.trace_ids ?? []), event.trace_id].filter(Boolean))],
  };

  const { error: edgeError } = await db.from("runtime_edges").upsert({
    id: edgeId,
    source_worker_id: previous.worker_id,
    target_worker_id: event.worker_id,
    emitted_signal_id: emittedSignalId.startsWith("sig-") ? emittedSignalId : null,
    relationship_type: "observed",
    relationship_origin: "observed_runtime_trace",
    evidence_type: "observed_trace",
    confidence_score: Math.max(existing?.confidence_score ?? 0, 0.75),
    confidence_label: existing?.confidence_label ?? "high",
    confidence_reasons: [...new Set([...(existing?.confidence_reasons ?? []), "Observed in production runtime telemetry."])],
    fan_out_score: Math.max(existing?.fan_out_score ?? 0, 40),
    fan_out_risk: existing?.fan_out_risk ?? "medium",
    risk_score: Math.max(existing?.risk_score ?? 0, 40),
    observed_count: (existing?.observed_count ?? 0) + 1,
    last_observed_at: event.occurred_at,
    metadata,
  });
  if (edgeError) throw edgeError;

  const { count } = await db
    .from("runtime_edges")
    .select("*", { count: "exact", head: true })
    .eq("relationship_origin", "observed_runtime_trace")
    .contains("metadata", { trace_ids: [event.trace_id] });

  await db
    .from("runtime_traces")
    .update({ observed_edge_count: count ?? 1 })
    .eq("id", event.trace_id);
}

async function refreshTraceSummary(db: ReturnType<typeof createRuntimeClient>, traceId: string) {
  const { data: events, error } = await db.from("runtime_events").select("*").eq("trace_id", traceId).order("occurred_at", { ascending: true }).limit(500);
  if (error) throw error;
  const ordered = events ?? [];
  const first = ordered[0];
  const last = ordered.at(-1);
  await db.from("runtime_traces").update({
    last_event_at: last?.occurred_at,
    event_count: ordered.length,
    ended_at: hasTerminalEvent(ordered) ? last?.occurred_at : null,
    status: hasErrorEvent(ordered) ? "failed" : hasTerminalEvent(ordered) ? "completed" : "running",
    summary: first ? buildTraceSummary(first) : null,
  }).eq("id", traceId);
}

async function getTelemetryHealth(db: ReturnType<typeof createRuntimeClient>) {
  const [health, metrics] = await Promise.all([
    db.from("runtime_ingestion_health").select("*").single(),
    db.from("runtime_trace_reconstruction_metrics").select("*").single(),
  ]);
  if (health.error) throw health.error;
  if (metrics.error) throw metrics.error;
  return { ok: true, ingestion: health.data, reconstruction: metrics.data };
}

async function retryFailedQueueItems(db: ReturnType<typeof createRuntimeClient>, limit: number) {
  const { data, error } = await db
    .from("runtime_event_ingest_queue")
    .select("*")
    .eq("processing_status", "failed")
    .order("received_at", { ascending: true })
    .limit(Math.min(limit, 100));
  if (error) throw error;

  const results = [];
  for (const item of data ?? []) {
    const normalized = item.normalized_payload as NormalizedEvent;
    await db.from("runtime_event_ingest_queue").update({ processing_status: "pending", error_message: null }).eq("id", item.id);
    results.push(await ingestOne(db, normalized, true));
  }
  return { ok: true, retried: results.length, results };
}

async function getPendingCount(db: ReturnType<typeof createRuntimeClient>): Promise<number> {
  const { count, error } = await db.from("runtime_event_ingest_queue").select("*", { count: "exact", head: true }).eq("processing_status", "pending");
  if (error) throw error;
  return count ?? 0;
}

function normalizeEvent(raw: TelemetryEvent): NormalizedEvent {
  const rawPayload = raw.rawPayload ?? raw.raw_payload ?? {};
  const metadata = raw.metadata ?? {};
  const object = (rawPayload.object ?? {}) as Record<string, unknown>;
  return {
    sourceSystem: raw.sourceSystem ?? raw.source_system ?? "external",
    eventType: raw.eventType ?? raw.event_type ?? "external_event",
    occurredAt: raw.occurredAt ?? raw.occurred_at ?? new Date().toISOString(),
    workerId: nullable(raw.workerId ?? raw.worker_id),
    signalId: nullable(raw.signalId ?? raw.signal_id),
    hubspotObjectType: nullable(raw.hubspotObjectType ?? raw.hubspot_object_type ?? rawPayload.hubspotObjectType ?? object.type),
    hubspotObjectId: nullable(raw.hubspotObjectId ?? raw.hubspot_object_id ?? rawPayload.hubspotObjectId ?? object.id),
    propertyName: nullable(raw.propertyName ?? raw.property_name ?? rawPayload.propertyName),
    oldValue: nullable(raw.oldValue ?? raw.old_value ?? rawPayload.oldValue),
    newValue: nullable(raw.newValue ?? raw.new_value ?? rawPayload.newValue),
    dealstageOld: nullable(raw.dealstageOld ?? raw.dealstage_old ?? rawPayload.dealstageOld),
    dealstageNew: nullable(raw.dealstageNew ?? raw.dealstage_new ?? rawPayload.dealstageNew),
    pipelineId: nullable(raw.pipelineId ?? raw.pipeline_id ?? rawPayload.pipelineId),
    correlationId: nullable(raw.correlationId ?? raw.correlation_id ?? metadata.correlationId ?? metadata.correlation_id),
    traceId: nullable(raw.traceId ?? raw.trace_id ?? metadata.traceId ?? metadata.trace_id),
    externalEventId: nullable(raw.externalEventId ?? raw.external_event_id ?? rawPayload.eventId ?? rawPayload.id),
    rawPayload,
    metadata,
  };
}

function findCausationEvent(event: NormalizedEvent, orderedEvents: Array<Record<string, unknown>>) {
  return orderedEvents
    .filter((candidate) => String(candidate.occurred_at) <= event.occurredAt)
    .filter((candidate) => isWithinWindow(event.occurredAt, String(candidate.occurred_at), WORKER_CAUSATION_WINDOW_MS))
    .filter((candidate) =>
      (event.correlationId && candidate.correlation_id === event.correlationId) ||
      (event.hubspotObjectId && candidate.hubspot_object_id === event.hubspotObjectId) ||
      (event.signalId && candidate.signal_id === event.signalId) ||
      (event.propertyName && candidate.property_name === event.propertyName)
    )
    .sort(compareEventsAsc)
    .at(-1) ?? null;
}

function shouldSampleOut(event: NormalizedEvent): boolean {
  if (SAMPLE_RATE >= 1) return false;
  if (event.eventType === "error" || event.eventType === "hubspot_stage_changed") return false;
  return Math.random() > SAMPLE_RATE;
}

function hasTerminalEvent(events: Array<Record<string, unknown>>): boolean {
  return events.some((event) => event.event_type === "worker_finished" || event.event_type === "error");
}

function hasErrorEvent(events: Array<Record<string, unknown>>): boolean {
  return events.some((event) => event.event_type === "error");
}

function buildTraceSummary(event: Record<string, unknown>): string {
  const object = [event.hubspot_object_type, event.hubspot_object_id].filter(Boolean).join(":");
  return `${event.event_type} from ${event.source_system}${object ? ` for ${object}` : ""}`;
}

function isWithinWindow(left: string, right: string, windowMs: number): boolean {
  return Math.abs(new Date(left).getTime() - new Date(right).getTime()) <= windowMs;
}

function compareEventsAsc(left: Record<string, unknown>, right: Record<string, unknown>): number {
  return new Date(String(left.occurred_at)).getTime() - new Date(String(right.occurred_at)).getTime();
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

function nullable(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(Deno.env.get(name));
  return Number.isFinite(value) ? value : fallback;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "Unknown runtime telemetry error");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
