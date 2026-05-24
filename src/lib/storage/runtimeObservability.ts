import { supabase } from "@/integrations/supabase/client";
import {
  detectRuntimeHotspots,
  getCriticalRuntimeHubs as analyzeCriticalRuntimeHubs,
  getCrossWorkflowDependencies as analyzeCrossWorkflowDependencies,
  getDownstreamPaths,
  getPropagationLoops as analyzePropagationLoops,
  getSignalBlastRadius as analyzeSignalBlastRadius,
  getSignalConsumers as analyzeSignalConsumers,
  getSignalProducers as analyzeSignalProducers,
  getUpstreamPaths,
  getWorkflowGraphChains as analyzeWorkflowGraphChains,
  RuntimeGraphSnapshot,
  RuntimeHotspot,
  RuntimePropagationPath,
  RuntimeSignalImpact,
  RuntimeTraversalOptions,
} from "../runtimeGraphTraversal";
import {
  RuntimeEdge,
  RuntimeEvent,
  RuntimeHub,
  RuntimeLoop,
  RuntimeRisk,
  RuntimeSignal,
  RuntimeStateTransition,
  RuntimeTrace,
  RuntimeWorker,
  RuntimeWorkflowGraph,
} from "../runtimeObservability";

type RuntimeDb = typeof supabase;
const runtimeDb = supabase as RuntimeDb & {
  from(table: string): ReturnType<typeof supabase.from>;
};

export interface RuntimeGraphQueryOptions extends RuntimeTraversalOptions {
  workflowGraphId?: string;
  includeInactiveWorkers?: boolean;
}

export interface WorkerRuntimeContext {
  worker: RuntimeWorker;
  upstreamPaths: RuntimePropagationPath[];
  downstreamPaths: RuntimePropagationPath[];
  producers: RuntimeWorker[];
  consumers: RuntimeWorker[];
  risk?: RuntimeRisk;
  recentEvents: RuntimeEvent[];
}

export interface SignalRuntimeContext {
  impact: RuntimeSignalImpact;
  risk?: RuntimeRisk;
  recentEvents: RuntimeEvent[];
  recentTransitions: RuntimeStateTransition[];
}

export interface RuntimeTraceContext {
  trace: RuntimeTrace;
  events: RuntimeEvent[];
  transitions: RuntimeStateTransition[];
  inferredEdges: RuntimeEdge[];
}

export async function fetchRuntimeGraphSnapshot(
  options: RuntimeGraphQueryOptions = {},
): Promise<RuntimeGraphSnapshot> {
  const [
    workersResult,
    signalsResult,
    edgesResult,
    hubsResult,
    loopsResult,
    risksResult,
  ] = await Promise.all([
    runtimeDb.from("runtime_workers").select("*"),
    runtimeDb.from("runtime_signals").select("*"),
    runtimeDb.from("runtime_edges").select("*"),
    runtimeDb.from("runtime_hubs").select("*"),
    runtimeDb.from("runtime_loops").select("*"),
    runtimeDb.from("runtime_risks").select("*"),
  ]);

  for (const result of [workersResult, signalsResult, edgesResult, hubsResult, loopsResult, risksResult]) {
    if (result.error) throw result.error;
  }

  let workers = ((workersResult.data ?? []) as RuntimeWorkerRow[]).map(mapWorker);
  let edges = ((edgesResult.data ?? []) as RuntimeEdgeRow[]).map(mapEdge);

  if (!options.includeInactiveWorkers) {
    const activeWorkerIds = new Set(
      workers
        .filter((worker) => worker.status !== "inactive" && worker.status !== "deprecated")
        .map((worker) => worker.id),
    );
    workers = workers.filter((worker) => activeWorkerIds.has(worker.id));
    edges = edges.filter(
      (edge) => activeWorkerIds.has(edge.sourceWorkerId) && activeWorkerIds.has(edge.targetWorkerId),
    );
  }

  if (options.workflowGraphId) {
    workers = workers.filter((worker) => worker.workflowGraphId === options.workflowGraphId);
    const workerIds = new Set(workers.map((worker) => worker.id));
    edges = edges.filter(
      (edge) =>
        edge.workflowGraphId === options.workflowGraphId ||
        workerIds.has(edge.sourceWorkerId) ||
        workerIds.has(edge.targetWorkerId),
    );
  }

  return {
    workers,
    signals: ((signalsResult.data ?? []) as RuntimeSignalRow[]).map(mapSignal),
    edges,
    hubs: ((hubsResult.data ?? []) as RuntimeHubRow[]).map(mapHub),
    loops: ((loopsResult.data ?? []) as RuntimeLoopRow[]).map(mapLoop),
    risks: ((risksResult.data ?? []) as RuntimeRiskRow[]).map(mapRisk),
  };
}

export async function fetchRuntimeWorkflowGraphs(): Promise<RuntimeWorkflowGraph[]> {
  const { data, error } = await runtimeDb
    .from("runtime_workflow_graphs")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as RuntimeWorkflowGraphRow[]).map(mapWorkflowGraph);
}

export async function getWorkerUpstreamChain(
  workerId: string,
  options: RuntimeGraphQueryOptions = {},
): Promise<RuntimePropagationPath[]> {
  const graph = await fetchRuntimeGraphSnapshot(options);
  return getUpstreamPaths(graph, workerId, options);
}

export async function getWorkerDownstreamChain(
  workerId: string,
  options: RuntimeGraphQueryOptions = {},
): Promise<RuntimePropagationPath[]> {
  const graph = await fetchRuntimeGraphSnapshot(options);
  return getDownstreamPaths(graph, workerId, options);
}

export async function getWorkerRuntimeContext(
  workerId: string,
  options: RuntimeGraphQueryOptions = {},
): Promise<WorkerRuntimeContext | null> {
  const graph = await fetchRuntimeGraphSnapshot(options);
  const worker = graph.workers.find((item) => item.id === workerId);
  if (!worker) return null;

  const upstreamPaths = getUpstreamPaths(graph, workerId, options);
  const downstreamPaths = getDownstreamPaths(graph, workerId, options);
  const workerSignalIds = new Set([
    ...upstreamPaths.flatMap((path) => path.signals.map((signal) => signal.id)),
    ...downstreamPaths.flatMap((path) => path.signals.map((signal) => signal.id)),
  ]);
  const producers = uniqueWorkers([...workerSignalIds].flatMap((signalId) => analyzeSignalProducers(graph, signalId)));
  const consumers = uniqueWorkers([...workerSignalIds].flatMap((signalId) => analyzeSignalConsumers(graph, signalId)));
  const risk = graph.risks.find((item) => item.targetType === "worker" && item.targetId === workerId);
  const recentEvents = await fetchRuntimeEvents({ workerId, limit: 25 });

  return {
    worker,
    upstreamPaths,
    downstreamPaths,
    producers,
    consumers,
    risk,
    recentEvents,
  };
}

export async function getSignalBlastRadius(
  signalId: string,
  options: RuntimeGraphQueryOptions = {},
): Promise<RuntimeSignalImpact | null> {
  const graph = await fetchRuntimeGraphSnapshot(options);
  return analyzeSignalBlastRadius(graph, signalId, options);
}

export async function getSignalRuntimeContext(
  signalId: string,
  options: RuntimeGraphQueryOptions = {},
): Promise<SignalRuntimeContext | null> {
  const graph = await fetchRuntimeGraphSnapshot(options);
  const impact = analyzeSignalBlastRadius(graph, signalId, options);
  if (!impact) return null;

  const risk = graph.risks.find((item) => item.targetType === "signal" && item.targetId === signalId);
  const [recentEvents, recentTransitions] = await Promise.all([
    fetchRuntimeEvents({ signalId, limit: 25 }),
    fetchRuntimeStateTransitions({ signalId, limit: 25 }),
  ]);

  return { impact, risk, recentEvents, recentTransitions };
}

export async function getCriticalRuntimeHubs(limit = 25): Promise<RuntimeHotspot[]> {
  const graph = await fetchRuntimeGraphSnapshot();
  return analyzeCriticalRuntimeHubs(graph, limit);
}

export async function getPropagationLoops(): Promise<RuntimeLoop[]> {
  const graph = await fetchRuntimeGraphSnapshot();
  return analyzePropagationLoops(graph);
}

export async function getWorkflowGraphChains(
  graphId: string,
  options: RuntimeGraphQueryOptions = {},
): Promise<RuntimePropagationPath[]> {
  const graph = await fetchRuntimeGraphSnapshot({ ...options, workflowGraphId: graphId });
  return analyzeWorkflowGraphChains(graph, graphId, options);
}

export async function getSignalProducers(signalId: string): Promise<RuntimeWorker[]> {
  const graph = await fetchRuntimeGraphSnapshot();
  return analyzeSignalProducers(graph, signalId);
}

export async function getSignalConsumers(signalId: string): Promise<RuntimeWorker[]> {
  const graph = await fetchRuntimeGraphSnapshot();
  return analyzeSignalConsumers(graph, signalId);
}

export async function getCrossWorkflowDependencies(): Promise<RuntimeEdge[]> {
  const graph = await fetchRuntimeGraphSnapshot();
  return analyzeCrossWorkflowDependencies(graph);
}

export async function getRuntimeHotspots(limit = 25): Promise<RuntimeHotspot[]> {
  const graph = await fetchRuntimeGraphSnapshot();
  return detectRuntimeHotspots(graph, limit);
}

export async function getRuntimeTraceContext(traceId: string): Promise<RuntimeTraceContext | null> {
  const { data: traceRow, error: traceError } = await runtimeDb
    .from("runtime_traces")
    .select("*")
    .eq("id", traceId)
    .maybeSingle();
  if (traceError) throw traceError;
  if (!traceRow) return null;

  const [events, transitions, graph] = await Promise.all([
    fetchRuntimeEvents({ traceId, limit: 250 }),
    fetchRuntimeStateTransitions({ traceId, limit: 250 }),
    fetchRuntimeGraphSnapshot({ includeInactiveWorkers: true }),
  ]);

  const workerIds = new Set(events.map((event) => event.workerId).filter(Boolean));
  const inferredEdges = graph.edges.filter(
    (edge) => workerIds.has(edge.sourceWorkerId) || workerIds.has(edge.targetWorkerId),
  );

  return {
    trace: mapTrace(traceRow as RuntimeTraceRow),
    events,
    transitions,
    inferredEdges,
  };
}

export async function fetchRuntimeEvents(filters: {
  workerId?: string;
  signalId?: string;
  traceId?: string;
  hubspotObjectType?: string;
  hubspotObjectId?: string;
  correlationId?: string;
  limit?: number;
}): Promise<RuntimeEvent[]> {
  let query = runtimeDb
    .from("runtime_events")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(filters.limit ?? 50);

  if (filters.workerId) query = query.eq("worker_id", filters.workerId);
  if (filters.signalId) query = query.eq("signal_id", filters.signalId);
  if (filters.traceId) query = query.eq("trace_id", filters.traceId);
  if (filters.hubspotObjectType) query = query.eq("hubspot_object_type", filters.hubspotObjectType);
  if (filters.hubspotObjectId) query = query.eq("hubspot_object_id", filters.hubspotObjectId);
  if (filters.correlationId) query = query.eq("correlation_id", filters.correlationId);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as RuntimeEventRow[]).map(mapEvent);
}

export async function fetchRuntimeStateTransitions(filters: {
  workerId?: string;
  signalId?: string;
  traceId?: string;
  hubspotObjectType?: string;
  hubspotObjectId?: string;
  propertyName?: string;
  limit?: number;
}): Promise<RuntimeStateTransition[]> {
  let query = runtimeDb
    .from("runtime_state_transitions")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(filters.limit ?? 50);

  if (filters.workerId) query = query.eq("worker_id", filters.workerId);
  if (filters.signalId) query = query.eq("signal_id", filters.signalId);
  if (filters.traceId) query = query.eq("trace_id", filters.traceId);
  if (filters.hubspotObjectType) query = query.eq("hubspot_object_type", filters.hubspotObjectType);
  if (filters.hubspotObjectId) query = query.eq("hubspot_object_id", filters.hubspotObjectId);
  if (filters.propertyName) query = query.eq("property_name", filters.propertyName);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as RuntimeStateTransitionRow[]).map(mapStateTransition);
}

function uniqueWorkers(workers: RuntimeWorker[]): RuntimeWorker[] {
  const map = new Map<string, RuntimeWorker>();
  for (const worker of workers) map.set(worker.id, worker);
  return [...map.values()];
}

interface RuntimeWorkflowGraphRow {
  id: string;
  name: string;
  description: string | null;
  primary_hubspot_object_type: string | null;
  primary_pipeline_ids: string[] | null;
  criticality: RuntimeWorkflowGraph["criticality"];
  metadata: Record<string, unknown> | null;
}

interface RuntimeWorkerRow {
  id: string;
  name: string;
  source_system: RuntimeWorker["sourceSystem"];
  actor_role: RuntimeWorker["actorRole"];
  workflow_graph_id: string | null;
  status: RuntimeWorker["status"];
  gitlab_file_path: string | null;
  endpoint_method: string | null;
  endpoint_path: string | null;
  handler_name: string | null;
  business_semantics: string | null;
  fan_out_risk: string | null;
  orchestration_risk: string | null;
  risk_score: number | null;
  confidence_score: number | null;
  metadata: Record<string, unknown> | null;
}

interface RuntimeSignalRow {
  id: string;
  name: string;
  signal_type: RuntimeSignal["signalType"];
  hubspot_object_type: RuntimeSignal["hubspotObjectType"];
  property_name: string | null;
  property_label: string | null;
  stage_id: string | null;
  stage_label: string | null;
  pipeline_id: string | null;
  pipeline_label: string | null;
  semantic_group: string | null;
  is_orchestration_hub: boolean | null;
  hub_score: number | null;
  metadata: Record<string, unknown> | null;
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

interface RuntimeHubRow {
  id: string;
  hub_type: RuntimeHub["hubType"];
  ref_id: string;
  name: string;
  reason: string | null;
  hub_score: number | null;
  blast_radius_score: number | null;
  incoming_edge_count: number | null;
  outgoing_edge_count: number | null;
  observed_event_count: number | null;
  affected_workflow_graph_ids: string[] | null;
  metadata: Record<string, unknown> | null;
}

interface RuntimeLoopRow {
  id: string;
  name: string;
  description: string | null;
  risk_level: RuntimeLoop["riskLevel"];
  risk_score: number | null;
  is_confirmed_observed: boolean | null;
  mitigation_hint: string | null;
  through_signal_ids: string[] | null;
  metadata: Record<string, unknown> | null;
}

interface RuntimeRiskRow {
  id: string;
  target_type: RuntimeRisk["targetType"];
  target_id: string;
  risk_score: number | null;
  risk_level: RuntimeRisk["riskLevel"];
  risk_reasons: string[] | null;
  fan_out_score: number | null;
  loop_score: number | null;
  cross_workflow_score: number | null;
  temporal_score: number | null;
  migration_score: number | null;
  repair_score: number | null;
  observed_error_score: number | null;
  last_calculated_at: string;
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
  ingest_queue_id?: string | null;
  parent_event_id?: string | null;
  causation_event_id?: string | null;
  external_event_id?: string | null;
  correlation_strategy?: string | null;
  confidence_score?: number | null;
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
  correlation_id?: string | null;
  last_event_at?: string | null;
  event_count?: number | null;
  observed_edge_count?: number | null;
  reconstruction_version?: number | null;
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
  causation_event_id?: string | null;
  correlation_strategy?: string | null;
  source_event_type?: string | null;
  emitted_signal_id?: string | null;
  confidence_score: number | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

function mapWorkflowGraph(row: RuntimeWorkflowGraphRow): RuntimeWorkflowGraph {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    primaryHubspotObjectType: row.primary_hubspot_object_type,
    primaryPipelineIds: row.primary_pipeline_ids ?? [],
    criticality: row.criticality,
    metadata: row.metadata ?? {},
  };
}

function mapWorker(row: RuntimeWorkerRow): RuntimeWorker {
  return {
    id: row.id,
    name: row.name,
    sourceSystem: row.source_system,
    actorRole: row.actor_role,
    workflowGraphId: row.workflow_graph_id,
    status: row.status,
    gitlabFilePath: row.gitlab_file_path,
    endpointMethod: row.endpoint_method,
    endpointPath: row.endpoint_path,
    handlerName: row.handler_name,
    businessSemantics: row.business_semantics,
    fanOutRisk: row.fan_out_risk,
    orchestrationRisk: row.orchestration_risk,
    riskScore: row.risk_score ?? 0,
    confidenceScore: row.confidence_score ?? 0.5,
    metadata: row.metadata ?? {},
  };
}

function mapSignal(row: RuntimeSignalRow): RuntimeSignal {
  return {
    id: row.id,
    name: row.name,
    signalType: row.signal_type,
    hubspotObjectType: row.hubspot_object_type,
    propertyName: row.property_name,
    propertyLabel: row.property_label,
    stageId: row.stage_id,
    stageLabel: row.stage_label,
    pipelineId: row.pipeline_id,
    pipelineLabel: row.pipeline_label,
    semanticGroup: row.semantic_group,
    isOrchestrationHub: row.is_orchestration_hub ?? false,
    hubScore: row.hub_score ?? 0,
    metadata: row.metadata ?? {},
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

function mapHub(row: RuntimeHubRow): RuntimeHub {
  return {
    id: row.id,
    hubType: row.hub_type,
    refId: row.ref_id,
    name: row.name,
    reason: row.reason,
    hubScore: row.hub_score ?? 0,
    blastRadiusScore: row.blast_radius_score ?? 0,
    incomingEdgeCount: row.incoming_edge_count ?? 0,
    outgoingEdgeCount: row.outgoing_edge_count ?? 0,
    observedEventCount: row.observed_event_count ?? 0,
    affectedWorkflowGraphIds: row.affected_workflow_graph_ids ?? [],
    metadata: row.metadata ?? {},
  };
}

function mapLoop(row: RuntimeLoopRow): RuntimeLoop {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    riskLevel: row.risk_level,
    riskScore: row.risk_score ?? 0,
    isConfirmedObserved: row.is_confirmed_observed ?? false,
    mitigationHint: row.mitigation_hint,
    throughSignalIds: row.through_signal_ids ?? [],
    metadata: row.metadata ?? {},
  };
}

function mapRisk(row: RuntimeRiskRow): RuntimeRisk {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    riskScore: row.risk_score ?? 0,
    riskLevel: row.risk_level,
    riskReasons: row.risk_reasons ?? [],
    fanOutScore: row.fan_out_score ?? 0,
    loopScore: row.loop_score ?? 0,
    crossWorkflowScore: row.cross_workflow_score ?? 0,
    temporalScore: row.temporal_score ?? 0,
    migrationScore: row.migration_score ?? 0,
    repairScore: row.repair_score ?? 0,
    observedErrorScore: row.observed_error_score ?? 0,
    lastCalculatedAt: row.last_calculated_at,
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
