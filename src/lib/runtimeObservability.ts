export type RuntimeActorRole =
  | "route"
  | "compute"
  | "propagate"
  | "enrich"
  | "sync"
  | "migrate"
  | "coordinate"
  | "guard"
  | "repair";

export type RuntimeSignalType =
  | "property"
  | "dealstage"
  | "pipeline"
  | "association"
  | "external_event"
  | "worker_event"
  | "runtime_event"
  | "unknown";

export type RuntimeRelationshipType =
  | "direct"
  | "derived"
  | "cross-workflow"
  | "temporal"
  | "inferred"
  | "observed";

export type RuntimeRelationshipOrigin =
  | "static_code_analysis"
  | "manual_model"
  | "hubspot_workflow_metadata"
  | "observed_runtime_trace"
  | "hybrid";

export type RuntimeEvidenceType =
  | "code_static"
  | "manual_model"
  | "hubspot_metadata"
  | "observed_trace"
  | "hybrid";

export type RuntimeRiskLevel = "low" | "medium" | "high" | "critical";
export type RuntimeConfidenceLabel = "low" | "medium" | "high" | "confirmed";

export interface RuntimeWorkflowGraph {
  id: string;
  name: string;
  description?: string | null;
  primaryHubspotObjectType?: string | null;
  primaryPipelineIds: string[];
  criticality: RuntimeRiskLevel;
  metadata: Record<string, unknown>;
}

export interface RuntimeWorker {
  id: string;
  name: string;
  sourceSystem: "gitlab" | "hubspot_workflow" | "portal" | "external" | "manual_model";
  actorRole: RuntimeActorRole;
  workflowGraphId?: string | null;
  status: "active" | "inactive" | "deprecated" | "inferred";
  gitlabFilePath?: string | null;
  endpointMethod?: string | null;
  endpointPath?: string | null;
  handlerName?: string | null;
  businessSemantics?: string | null;
  fanOutRisk?: string | null;
  orchestrationRisk?: string | null;
  riskScore: number;
  confidenceScore: number;
  metadata: Record<string, unknown>;
}

export interface RuntimeSignal {
  id: string;
  name: string;
  signalType: RuntimeSignalType;
  hubspotObjectType?: "deal" | "company" | "contact" | "dossier" | "workflow" | "pipeline" | "none" | null;
  propertyName?: string | null;
  propertyLabel?: string | null;
  stageId?: string | null;
  stageLabel?: string | null;
  pipelineId?: string | null;
  pipelineLabel?: string | null;
  semanticGroup?: string | null;
  isOrchestrationHub: boolean;
  hubScore: number;
  metadata: Record<string, unknown>;
}

export interface RuntimeEdge {
  id: string;
  sourceWorkerId: string;
  targetWorkerId: string;
  emittedSignalId?: string | null;
  sourceSignalId?: string | null;
  targetTriggerSignalId?: string | null;
  workflowGraphId?: string | null;
  relationshipType: RuntimeRelationshipType;
  relationshipOrigin: RuntimeRelationshipOrigin;
  evidenceType: RuntimeEvidenceType;
  confidenceScore: number;
  confidenceLabel: RuntimeConfidenceLabel;
  confidenceReasons: string[];
  fanOutScore: number;
  fanOutRisk: RuntimeRiskLevel;
  riskScore: number;
  observedCount: number;
  lastObservedAt?: string | null;
  notes?: string | null;
  metadata: Record<string, unknown>;
}

export interface RuntimeHub {
  id: string;
  hubType: "signal" | "worker" | "pipeline" | "association_path";
  refId: string;
  name: string;
  reason?: string | null;
  hubScore: number;
  blastRadiusScore: number;
  incomingEdgeCount: number;
  outgoingEdgeCount: number;
  observedEventCount: number;
  affectedWorkflowGraphIds: string[];
  metadata: Record<string, unknown>;
}

export interface RuntimeLoop {
  id: string;
  name: string;
  description?: string | null;
  riskLevel: RuntimeRiskLevel;
  riskScore: number;
  isConfirmedObserved: boolean;
  mitigationHint?: string | null;
  throughSignalIds: string[];
  metadata: Record<string, unknown>;
}

export interface RuntimeEvent {
  id: string;
  traceId?: string | null;
  occurredAt: string;
  eventType:
    | "webhook_received"
    | "worker_started"
    | "worker_finished"
    | "hubspot_property_changed"
    | "hubspot_stage_changed"
    | "api_write"
    | "error"
    | "portal_action"
    | "external_event";
  sourceSystem: "gitlab" | "hubspot" | "portal" | "supabase_edge" | "external" | "manual";
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
  ingestQueueId?: string | null;
  parentEventId?: string | null;
  causationEventId?: string | null;
  externalEventId?: string | null;
  correlationStrategy?: string | null;
  confidenceScore?: number;
  rawPayload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface RuntimeTrace {
  id: string;
  rootEventId?: string | null;
  startedAt: string;
  endedAt?: string | null;
  status: "running" | "completed" | "failed" | "partial";
  rootHubspotObjectType?: string | null;
  rootHubspotObjectId?: string | null;
  correlationId?: string | null;
  lastEventAt?: string | null;
  eventCount?: number;
  observedEdgeCount?: number;
  reconstructionVersion?: number;
  workflowGraphIds: string[];
  summary?: string | null;
  confidenceScore: number;
  metadata: Record<string, unknown>;
}

export interface RuntimeStateTransition {
  id: string;
  eventId?: string | null;
  traceId?: string | null;
  workerId?: string | null;
  signalId?: string | null;
  transitionType: "property_write" | "dealstage_change" | "pipeline_change" | "association_change" | "external_state";
  hubspotObjectType?: string | null;
  hubspotObjectId?: string | null;
  propertyName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  pipelineId?: string | null;
  dealstageOld?: string | null;
  dealstageNew?: string | null;
  causationEventId?: string | null;
  correlationStrategy?: string | null;
  sourceEventType?: string | null;
  emittedSignalId?: string | null;
  confidenceScore: number;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface RuntimeIngestQueueItem {
  id: string;
  receivedAt: string;
  sourceSystem: string;
  eventType: string;
  correlationId?: string | null;
  hubspotObjectType?: string | null;
  hubspotObjectId?: string | null;
  payload: Record<string, unknown>;
  normalizedPayload: Record<string, unknown>;
  processingStatus: "pending" | "processed" | "failed" | "ignored";
  processedAt?: string | null;
  errorMessage?: string | null;
  runtimeEventId?: string | null;
  traceId?: string | null;
  correlationStrategy?: string | null;
  confidenceScore: number;
  metadata: Record<string, unknown>;
}

export interface RuntimeRisk {
  id: string;
  targetType: "worker" | "signal" | "edge" | "hub" | "loop";
  targetId: string;
  riskScore: number;
  riskLevel: RuntimeRiskLevel;
  riskReasons: string[];
  fanOutScore: number;
  loopScore: number;
  crossWorkflowScore: number;
  temporalScore: number;
  migrationScore: number;
  repairScore: number;
  observedErrorScore: number;
  lastCalculatedAt: string;
  metadata: Record<string, unknown>;
}
