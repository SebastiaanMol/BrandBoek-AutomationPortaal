import {
  RuntimeEdge,
  RuntimeEvent,
  RuntimeSignal,
  RuntimeStateTransition,
  RuntimeTrace,
  RuntimeWorker,
} from "./runtimeObservability";

export type RuntimeCorrelationStrategy =
  | "explicit_correlation_id"
  | "hubspot_object_time_window"
  | "property_stage_continuity"
  | "association_traversal"
  | "workflow_graph_continuity"
  | "new_trace";

export interface RuntimeTelemetryEventInput {
  id?: string;
  sourceSystem: RuntimeEvent["sourceSystem"];
  eventType: RuntimeEvent["eventType"];
  occurredAt?: string;
  workerId?: string | null;
  signalId?: string | null;
  hubspotObjectType?: string | null;
  hubspotObjectId?: string | null;
  propertyName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  dealstageOld?: string | null;
  dealstageNew?: string | null;
  pipelineId?: string | null;
  correlationId?: string | null;
  externalEventId?: string | null;
  rawPayload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface RuntimeTraceCandidate {
  trace: RuntimeTrace;
  recentEvents: RuntimeEvent[];
  score: number;
  strategy: RuntimeCorrelationStrategy;
  reasons: string[];
}

export interface RuntimeCorrelationResult {
  traceId?: string;
  strategy: RuntimeCorrelationStrategy;
  confidenceScore: number;
  causationEventId?: string | null;
  parentEventId?: string | null;
  reasons: string[];
}

export interface ObservedPropagationEdgeInput {
  sourceEvent: RuntimeEvent;
  targetEvent: RuntimeEvent;
  emittedSignal?: RuntimeSignal | null;
  sourceWorker?: RuntimeWorker | null;
  targetWorker?: RuntimeWorker | null;
  inferredEdge?: RuntimeEdge | null;
}

export interface ObservedPropagationEdgeDraft {
  sourceWorkerId: string;
  targetWorkerId: string;
  emittedSignalId?: string | null;
  workflowGraphId?: string | null;
  relationshipType: RuntimeEdge["relationshipType"];
  relationshipOrigin: RuntimeEdge["relationshipOrigin"];
  evidenceType: RuntimeEdge["evidenceType"];
  confidenceScore: number;
  confidenceLabel: RuntimeEdge["confidenceLabel"];
  confidenceReasons: string[];
  metadata: Record<string, unknown>;
}

const TRACE_TIME_WINDOW_MS = 30 * 60 * 1000;
const WORKER_CAUSATION_WINDOW_MS = 10 * 60 * 1000;

export function normalizeRuntimeTelemetryEvent(input: RuntimeTelemetryEventInput): RuntimeTelemetryEventInput {
  const rawPayload = input.rawPayload ?? {};
  const metadata = input.metadata ?? {};
  const payloadObject = getPayloadHubSpotObject(rawPayload);

  return {
    ...input,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    hubspotObjectType: input.hubspotObjectType ?? payloadObject.objectType ?? stringFrom(rawPayload.objectType),
    hubspotObjectId: input.hubspotObjectId ?? payloadObject.objectId ?? stringFrom(rawPayload.objectId),
    propertyName: input.propertyName ?? stringFrom(rawPayload.propertyName),
    oldValue: input.oldValue ?? stringFrom(rawPayload.oldValue),
    newValue: input.newValue ?? stringFrom(rawPayload.newValue),
    dealstageOld: input.dealstageOld ?? stringFrom(rawPayload.dealstageOld),
    dealstageNew: input.dealstageNew ?? stringFrom(rawPayload.dealstageNew),
    pipelineId: input.pipelineId ?? stringFrom(rawPayload.pipelineId),
    correlationId: input.correlationId ?? stringFrom(rawPayload.correlationId) ?? stringFrom(metadata.correlationId),
    externalEventId: input.externalEventId ?? stringFrom(rawPayload.eventId) ?? stringFrom(rawPayload.id),
    rawPayload,
    metadata,
  };
}

export function correlateRuntimeEvent(
  input: RuntimeTelemetryEventInput,
  candidates: RuntimeTraceCandidate[],
): RuntimeCorrelationResult {
  const event = normalizeRuntimeTelemetryEvent(input);
  const scored = candidates
    .map((candidate) => scoreTraceCandidate(event, candidate))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.45) {
    return {
      strategy: "new_trace",
      confidenceScore: 0.55,
      reasons: ["No existing trace matched strongly enough, so a new runtime trace should be started."],
    };
  }

  const orderedEvents = [...best.recentEvents].sort(compareEventsAsc);
  const parentEvent = orderedEvents.at(-1);
  const causationEvent = findCausationEvent(event, orderedEvents);

  return {
    traceId: best.trace.id,
    strategy: best.strategy,
    confidenceScore: clamp(best.score),
    parentEventId: parentEvent?.id ?? null,
    causationEventId: causationEvent?.id ?? parentEvent?.id ?? null,
    reasons: best.reasons,
  };
}

export function deriveStateTransitionFromEvent(
  event: RuntimeEvent,
): Omit<RuntimeStateTransition, "id"> | null {
  if (event.eventType === "hubspot_stage_changed" || event.dealstageOld || event.dealstageNew) {
    return {
      eventId: event.id,
      traceId: event.traceId,
      workerId: event.workerId,
      signalId: event.signalId,
      transitionType: "dealstage_change",
      hubspotObjectType: event.hubspotObjectType,
      hubspotObjectId: event.hubspotObjectId,
      propertyName: event.propertyName ?? "dealstage",
      oldValue: event.oldValue,
      newValue: event.newValue,
      pipelineId: event.pipelineId,
      dealstageOld: event.dealstageOld,
      dealstageNew: event.dealstageNew,
      confidenceScore: 0.9,
      metadata: { source_event_type: event.eventType },
      occurredAt: event.occurredAt,
    };
  }

  if (event.eventType === "hubspot_property_changed" || event.eventType === "api_write") {
    if (!event.propertyName && !event.signalId) return null;
    return {
      eventId: event.id,
      traceId: event.traceId,
      workerId: event.workerId,
      signalId: event.signalId,
      transitionType: "property_write",
      hubspotObjectType: event.hubspotObjectType,
      hubspotObjectId: event.hubspotObjectId,
      propertyName: event.propertyName,
      oldValue: event.oldValue,
      newValue: event.newValue,
      pipelineId: event.pipelineId,
      dealstageOld: event.dealstageOld,
      dealstageNew: event.dealstageNew,
      confidenceScore: event.eventType === "api_write" ? 0.8 : 0.9,
      metadata: { source_event_type: event.eventType },
      occurredAt: event.occurredAt,
    };
  }

  return null;
}

export function buildObservedPropagationEdge(
  input: ObservedPropagationEdgeInput,
): ObservedPropagationEdgeDraft | null {
  const sourceWorkerId = input.sourceWorker?.id ?? input.sourceEvent.workerId;
  const targetWorkerId = input.targetWorker?.id ?? input.targetEvent.workerId;
  if (!sourceWorkerId || !targetWorkerId || sourceWorkerId === targetWorkerId) return null;

  const confidenceScore = input.inferredEdge
    ? Math.max(0.85, input.inferredEdge.confidenceScore)
    : input.emittedSignal
      ? 0.75
      : 0.65;

  return {
    sourceWorkerId,
    targetWorkerId,
    emittedSignalId: input.emittedSignal?.id ?? input.targetEvent.signalId ?? input.sourceEvent.signalId,
    workflowGraphId: input.inferredEdge?.workflowGraphId ?? input.sourceWorker?.workflowGraphId ?? input.targetWorker?.workflowGraphId,
    relationshipType: "observed",
    relationshipOrigin: "observed_runtime_trace",
    evidenceType: "observed_trace",
    confidenceScore,
    confidenceLabel: confidenceScore >= 0.85 ? "confirmed" : "high",
    confidenceReasons: [
      "Observed in runtime event telemetry.",
      input.inferredEdge ? "Matches an existing inferred propagation edge." : "No inferred edge matched; created from observed sequence.",
    ],
    metadata: {
      source_event_id: input.sourceEvent.id,
      target_event_id: input.targetEvent.id,
      trace_id: input.targetEvent.traceId ?? input.sourceEvent.traceId ?? null,
      inferred_edge_id: input.inferredEdge?.id ?? null,
      observed_at: input.targetEvent.occurredAt,
    },
  };
}

export function reconstructObservedPropagationOrder(events: RuntimeEvent[]): RuntimeEvent[] {
  return [...events].sort(compareEventsAsc);
}

export function findObservedWorkerCausation(
  workerEvent: RuntimeEvent,
  previousEvents: RuntimeEvent[],
): RuntimeEvent | null {
  if (!["worker_started", "worker_finished", "api_write"].includes(workerEvent.eventType)) return null;
  return findCausationEvent(workerEvent, previousEvents);
}

function scoreTraceCandidate(
  event: RuntimeTelemetryEventInput,
  candidate: RuntimeTraceCandidate,
): RuntimeTraceCandidate {
  const reasons: string[] = [];
  let score = 0;
  let strategy: RuntimeCorrelationStrategy = "new_trace";

  if (event.correlationId && candidate.trace.metadata?.correlation_id === event.correlationId) {
    score += 0.95;
    strategy = "explicit_correlation_id";
    reasons.push("Correlation id matches the existing trace.");
  }

  if (
    event.correlationId &&
    candidate.trace.summary?.includes(event.correlationId)
  ) {
    score += 0.8;
    strategy = "explicit_correlation_id";
    reasons.push("Correlation id appears in trace summary.");
  }

  if (
    event.hubspotObjectType &&
    event.hubspotObjectId &&
    candidate.trace.rootHubspotObjectType === event.hubspotObjectType &&
    candidate.trace.rootHubspotObjectId === event.hubspotObjectId
  ) {
    score += 0.7;
    strategy = strategy === "new_trace" ? "hubspot_object_time_window" : strategy;
    reasons.push("HubSpot object matches the trace root object.");
  }

  const recentEvents = candidate.recentEvents.filter((item) => isWithinWindow(event.occurredAt, item.occurredAt, TRACE_TIME_WINDOW_MS));
  if (recentEvents.length > 0) {
    score += 0.2;
    strategy = strategy === "new_trace" ? "hubspot_object_time_window" : strategy;
    reasons.push("Event occurred inside the active trace time window.");
  }

  if (
    event.propertyName &&
    recentEvents.some(
      (item) =>
        item.propertyName === event.propertyName ||
        (Boolean(event.signalId) && item.signalId === event.signalId),
    )
  ) {
    score += 0.25;
    strategy = "property_stage_continuity";
    reasons.push("Property or signal continuity connects this event to the trace.");
  }

  if (event.dealstageNew && recentEvents.some((item) => item.dealstageNew === event.dealstageOld || item.dealstageOld === event.dealstageOld)) {
    score += 0.25;
    strategy = "property_stage_continuity";
    reasons.push("Dealstage continuity connects this event to the trace.");
  }

  return {
    ...candidate,
    score: Math.max(candidate.score, clamp(score)),
    strategy,
    reasons: [...candidate.reasons, ...reasons],
  };
}

function findCausationEvent(event: RuntimeTelemetryEventInput | RuntimeEvent, orderedEvents: RuntimeEvent[]): RuntimeEvent | null {
  const candidates = orderedEvents
    .filter((candidate) => candidate.id !== "id" && candidate.occurredAt <= (event.occurredAt ?? new Date().toISOString()))
    .filter((candidate) => isWithinWindow(event.occurredAt, candidate.occurredAt, WORKER_CAUSATION_WINDOW_MS))
    .filter((candidate) => {
      if (event.correlationId && candidate.correlationId === event.correlationId) return true;
      if (event.hubspotObjectId && candidate.hubspotObjectId === event.hubspotObjectId) return true;
      if (event.signalId && candidate.signalId === event.signalId) return true;
      if (event.propertyName && candidate.propertyName === event.propertyName) return true;
      return false;
    })
    .sort(compareEventsAsc);

  return candidates.at(-1) ?? null;
}

function getPayloadHubSpotObject(payload: Record<string, unknown>): { objectType?: string; objectId?: string } {
  const object = payload.object as Record<string, unknown> | undefined;
  return {
    objectType: stringFrom(payload.hubspotObjectType) ?? stringFrom(object?.type),
    objectId: stringFrom(payload.hubspotObjectId) ?? stringFrom(object?.id),
  };
}

function isWithinWindow(left?: string, right?: string, windowMs = TRACE_TIME_WINDOW_MS): boolean {
  if (!left || !right) return false;
  return Math.abs(new Date(left).getTime() - new Date(right).getTime()) <= windowMs;
}

function compareEventsAsc(left: RuntimeEvent, right: RuntimeEvent): number {
  return new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime();
}

function stringFrom(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}
