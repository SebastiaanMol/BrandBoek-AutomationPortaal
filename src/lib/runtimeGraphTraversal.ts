import {
  RuntimeConfidenceLabel,
  RuntimeEdge,
  RuntimeHub,
  RuntimeLoop,
  RuntimeRisk,
  RuntimeSignal,
  RuntimeWorker,
} from "./runtimeObservability";

export interface RuntimeGraphSnapshot {
  workers: RuntimeWorker[];
  signals: RuntimeSignal[];
  edges: RuntimeEdge[];
  hubs: RuntimeHub[];
  loops: RuntimeLoop[];
  risks: RuntimeRisk[];
}

export interface RuntimeTraversalOptions {
  maxDepth?: number;
  minConfidenceScore?: number;
  includeInferred?: boolean;
  includeObserved?: boolean;
  relationshipTypes?: RuntimeEdge["relationshipType"][];
}

export interface RuntimePropagationPath {
  workers: RuntimeWorker[];
  edges: RuntimeEdge[];
  signals: RuntimeSignal[];
  depth: number;
  confidenceScore: number;
  riskScore: number;
  fanOutScore: number;
  relationshipTypes: RuntimeEdge["relationshipType"][];
  workflowGraphIds: string[];
}

export interface RuntimeSignalImpact {
  signal: RuntimeSignal;
  producers: RuntimeWorker[];
  consumers: RuntimeWorker[];
  downstreamPaths: RuntimePropagationPath[];
  directEdges: RuntimeEdge[];
  blastRadiusScore: number;
  riskLevel: RuntimeRisk["riskLevel"];
}

export interface RuntimeHotspot {
  targetType: "worker" | "signal" | "edge" | "hub" | "loop";
  targetId: string;
  name: string;
  riskScore: number;
  riskLevel: RuntimeRisk["riskLevel"];
  incomingEdges: number;
  outgoingEdges: number;
  reasons: string[];
}

const DEFAULT_MAX_DEPTH = 4;

export function getUpstreamPaths(
  graph: RuntimeGraphSnapshot,
  workerId: string,
  options: RuntimeTraversalOptions = {},
): RuntimePropagationPath[] {
  return traverseWorkerGraph(graph, workerId, "upstream", options);
}

export function getDownstreamPaths(
  graph: RuntimeGraphSnapshot,
  workerId: string,
  options: RuntimeTraversalOptions = {},
): RuntimePropagationPath[] {
  return traverseWorkerGraph(graph, workerId, "downstream", options);
}

export function getSignalProducers(graph: RuntimeGraphSnapshot, signalId: string): RuntimeWorker[] {
  const writerIds = new Set(
    graph.edges
      .filter((edge) => edge.emittedSignalId === signalId || edge.sourceSignalId === signalId)
      .map((edge) => edge.sourceWorkerId),
  );
  return graph.workers.filter((worker) => writerIds.has(worker.id));
}

export function getSignalConsumers(graph: RuntimeGraphSnapshot, signalId: string): RuntimeWorker[] {
  const consumerIds = new Set(
    graph.edges
      .filter((edge) => edge.emittedSignalId === signalId || edge.targetTriggerSignalId === signalId)
      .map((edge) => edge.targetWorkerId),
  );
  return graph.workers.filter((worker) => consumerIds.has(worker.id));
}

export function getSignalBlastRadius(
  graph: RuntimeGraphSnapshot,
  signalId: string,
  options: RuntimeTraversalOptions = {},
): RuntimeSignalImpact | null {
  const signal = graph.signals.find((item) => item.id === signalId);
  if (!signal) return null;

  const producers = getSignalProducers(graph, signalId);
  const consumers = getSignalConsumers(graph, signalId);
  const downstreamPaths = consumers.flatMap((worker) =>
    getDownstreamPaths(graph, worker.id, options).map((path) => ({
      ...path,
      signals: uniqueSignals([signal, ...path.signals]),
    })),
  );
  const directEdges = filterEdges(graph.edges, options).filter(
    (edge) =>
      edge.emittedSignalId === signalId ||
      edge.sourceSignalId === signalId ||
      edge.targetTriggerSignalId === signalId,
  );
  const blastRadiusScore = scoreBlastRadius({
    edgeCount: directEdges.length,
    pathCount: downstreamPaths.length,
    workflowCount: new Set(downstreamPaths.flatMap((path) => path.workflowGraphIds)).size,
    maxRisk: Math.max(0, ...downstreamPaths.map((path) => path.riskScore), signal.hubScore),
  });

  return {
    signal,
    producers,
    consumers,
    downstreamPaths,
    directEdges,
    blastRadiusScore,
    riskLevel: riskLevelFromScore(blastRadiusScore),
  };
}

export function getCriticalRuntimeHubs(graph: RuntimeGraphSnapshot, limit = 25): RuntimeHotspot[] {
  const edgeCounts = countEdges(graph.edges);
  const byRisk = new Map(graph.risks.map((risk) => [`${risk.targetType}:${risk.targetId}`, risk]));

  return graph.hubs
    .map((hub) => {
      const risk = byRisk.get(`hub:${hub.id}`);
      return {
        targetType: "hub" as const,
        targetId: hub.id,
        name: hub.name,
        riskScore: risk?.riskScore ?? hub.blastRadiusScore,
        riskLevel: risk?.riskLevel ?? riskLevelFromScore(hub.blastRadiusScore),
        incomingEdges: edgeCounts.incoming.get(hub.refId) ?? hub.incomingEdgeCount,
        outgoingEdges: edgeCounts.outgoing.get(hub.refId) ?? hub.outgoingEdgeCount,
        reasons: [hub.reason, ...(risk?.riskReasons ?? [])].filter(Boolean) as string[],
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, limit);
}

export function getPropagationLoops(graph: RuntimeGraphSnapshot): RuntimeLoop[] {
  return [...graph.loops].sort((a, b) => b.riskScore - a.riskScore);
}

export function getCrossWorkflowDependencies(graph: RuntimeGraphSnapshot): RuntimeEdge[] {
  return graph.edges
    .filter((edge) => edge.relationshipType === "cross-workflow")
    .sort((a, b) => b.riskScore - a.riskScore || b.confidenceScore - a.confidenceScore);
}

export function getWorkflowGraphChains(
  graph: RuntimeGraphSnapshot,
  workflowGraphId: string,
  options: RuntimeTraversalOptions = {},
): RuntimePropagationPath[] {
  const workerIds = graph.workers
    .filter((worker) => worker.workflowGraphId === workflowGraphId)
    .map((worker) => worker.id);
  return workerIds.flatMap((workerId) =>
    getDownstreamPaths(graph, workerId, {
      ...options,
      maxDepth: options.maxDepth ?? 3,
    }).filter((path) => path.workflowGraphIds.includes(workflowGraphId)),
  );
}

export function detectRuntimeHotspots(graph: RuntimeGraphSnapshot, limit = 25): RuntimeHotspot[] {
  const edgeCounts = countEdges(graph.edges);
  const workerById = new Map(graph.workers.map((worker) => [worker.id, worker]));
  const signalById = new Map(graph.signals.map((signal) => [signal.id, signal]));

  const workerHotspots = graph.workers.map((worker) => {
    const incoming = edgeCounts.incoming.get(worker.id) ?? 0;
    const outgoing = edgeCounts.outgoing.get(worker.id) ?? 0;
    const riskScore = Math.max(worker.riskScore, scoreBlastRadius({ edgeCount: incoming + outgoing, pathCount: outgoing, workflowCount: 1, maxRisk: worker.riskScore }));
    return {
      targetType: "worker" as const,
      targetId: worker.id,
      name: worker.name,
      riskScore,
      riskLevel: riskLevelFromScore(riskScore),
      incomingEdges: incoming,
      outgoingEdges: outgoing,
      reasons: [worker.orchestrationRisk, worker.fanOutRisk].filter(Boolean) as string[],
    };
  });

  const signalHotspots = graph.signals
    .filter((signal) => signal.isOrchestrationHub || signal.hubScore > 0)
    .map((signal) => {
      const producers = getSignalProducers(graph, signal.id).length;
      const consumers = getSignalConsumers(graph, signal.id).length;
      const riskScore = Math.max(signal.hubScore, scoreBlastRadius({ edgeCount: producers + consumers, pathCount: consumers, workflowCount: 1, maxRisk: signal.hubScore }));
      return {
        targetType: "signal" as const,
        targetId: signal.id,
        name: signal.name,
        riskScore,
        riskLevel: riskLevelFromScore(riskScore),
        incomingEdges: producers,
        outgoingEdges: consumers,
        reasons: ["orchestration signal", signal.semanticGroup].filter(Boolean) as string[],
      };
    });

  const edgeHotspots = graph.edges
    .filter((edge) => edge.riskScore >= 60 || edge.fanOutScore >= 60)
    .map((edge) => ({
      targetType: "edge" as const,
      targetId: edge.id,
      name: `${workerById.get(edge.sourceWorkerId)?.name ?? edge.sourceWorkerId} -> ${workerById.get(edge.targetWorkerId)?.name ?? edge.targetWorkerId}`,
      riskScore: Math.max(edge.riskScore, edge.fanOutScore),
      riskLevel: riskLevelFromScore(Math.max(edge.riskScore, edge.fanOutScore)),
      incomingEdges: signalById.has(edge.emittedSignalId ?? "") ? 1 : 0,
      outgoingEdges: 1,
      reasons: [`${edge.relationshipType} edge`, `${edge.confidenceLabel} confidence`, `${edge.fanOutRisk} fan-out`],
    }));

  return [...workerHotspots, ...signalHotspots, ...edgeHotspots]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, limit);
}

export function scorePath(edges: RuntimeEdge[]): Pick<RuntimePropagationPath, "confidenceScore" | "riskScore" | "fanOutScore"> {
  if (edges.length === 0) {
    return { confidenceScore: 1, riskScore: 0, fanOutScore: 0 };
  }

  const confidenceScore = edges.reduce((score, edge) => score * edge.confidenceScore, 1);
  const riskScore = Math.max(...edges.map((edge) => edge.riskScore));
  const fanOutScore = Math.max(...edges.map((edge) => edge.fanOutScore));

  return {
    confidenceScore: Number(confidenceScore.toFixed(3)),
    riskScore,
    fanOutScore,
  };
}

function traverseWorkerGraph(
  graph: RuntimeGraphSnapshot,
  startWorkerId: string,
  direction: "upstream" | "downstream",
  options: RuntimeTraversalOptions,
): RuntimePropagationPath[] {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const workerById = new Map(graph.workers.map((worker) => [worker.id, worker]));
  const signalById = new Map(graph.signals.map((signal) => [signal.id, signal]));
  const edges = filterEdges(graph.edges, options);
  const paths: RuntimePropagationPath[] = [];

  const visit = (
    currentWorkerId: string,
    workerIds: string[],
    edgePath: RuntimeEdge[],
    depth: number,
    seenWorkers: Set<string>,
  ) => {
    if (depth >= maxDepth) return;

    const nextEdges = edges.filter((edge) =>
      direction === "downstream" ? edge.sourceWorkerId === currentWorkerId : edge.targetWorkerId === currentWorkerId,
    );

    for (const edge of nextEdges) {
      const nextWorkerId = direction === "downstream" ? edge.targetWorkerId : edge.sourceWorkerId;
      if (seenWorkers.has(nextWorkerId)) continue;

      const nextWorkerIds =
        direction === "downstream"
          ? [...workerIds, nextWorkerId]
          : [nextWorkerId, ...workerIds];
      const nextEdgesPath =
        direction === "downstream"
          ? [...edgePath, edge]
          : [edge, ...edgePath];
      const workers = nextWorkerIds
        .map((id) => workerById.get(id))
        .filter((worker): worker is RuntimeWorker => Boolean(worker));
      const signals = uniqueSignals(
        nextEdgesPath
          .map((item) => item.emittedSignalId)
          .filter(Boolean)
          .map((id) => signalById.get(id as string))
          .filter((signal): signal is RuntimeSignal => Boolean(signal)),
      );
      const scores = scorePath(nextEdgesPath);
      paths.push({
        workers,
        edges: nextEdgesPath,
        signals,
        depth: nextEdgesPath.length,
        relationshipTypes: [...new Set(nextEdgesPath.map((item) => item.relationshipType))],
        workflowGraphIds: [...new Set(nextEdgesPath.map((item) => item.workflowGraphId).filter(Boolean))] as string[],
        ...scores,
      });

      const nextSeen = new Set(seenWorkers);
      nextSeen.add(nextWorkerId);
      visit(nextWorkerId, nextWorkerIds, nextEdgesPath, depth + 1, nextSeen);
    }
  };

  visit(startWorkerId, [startWorkerId], [], 0, new Set([startWorkerId]));
  return paths.sort((a, b) => b.riskScore - a.riskScore || b.confidenceScore - a.confidenceScore);
}

function filterEdges(edges: RuntimeEdge[], options: RuntimeTraversalOptions): RuntimeEdge[] {
  const includeInferred = options.includeInferred ?? true;
  const includeObserved = options.includeObserved ?? true;
  const minConfidence = options.minConfidenceScore ?? 0;
  return edges.filter((edge) => {
    if (edge.confidenceScore < minConfidence) return false;
    if (options.relationshipTypes && !options.relationshipTypes.includes(edge.relationshipType)) return false;
    const isObserved = edge.relationshipOrigin === "observed_runtime_trace" || edge.evidenceType === "observed_trace" || edge.relationshipType === "observed";
    if (isObserved && !includeObserved) return false;
    if (!isObserved && !includeInferred) return false;
    return true;
  });
}

function uniqueSignals(signals: RuntimeSignal[]): RuntimeSignal[] {
  const map = new Map<string, RuntimeSignal>();
  for (const signal of signals) map.set(signal.id, signal);
  return [...map.values()];
}

function countEdges(edges: RuntimeEdge[]) {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const edge of edges) {
    outgoing.set(edge.sourceWorkerId, (outgoing.get(edge.sourceWorkerId) ?? 0) + 1);
    incoming.set(edge.targetWorkerId, (incoming.get(edge.targetWorkerId) ?? 0) + 1);
    if (edge.emittedSignalId) {
      outgoing.set(edge.emittedSignalId, (outgoing.get(edge.emittedSignalId) ?? 0) + 1);
    }
  }
  return { incoming, outgoing };
}

function scoreBlastRadius(input: {
  edgeCount: number;
  pathCount: number;
  workflowCount: number;
  maxRisk: number;
}): number {
  const score =
    input.edgeCount * 8 +
    input.pathCount * 4 +
    input.workflowCount * 12 +
    input.maxRisk * 0.45;
  return Math.min(100, Math.round(score));
}

export function riskLevelFromScore(score: number): RuntimeRisk["riskLevel"] {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export function confidenceLabelFromScore(score: number): RuntimeConfidenceLabel {
  if (score >= 0.95) return "confirmed";
  if (score >= 0.75) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}
