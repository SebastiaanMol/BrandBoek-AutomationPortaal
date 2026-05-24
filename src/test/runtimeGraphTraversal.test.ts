import { describe, expect, it } from "vitest";
import {
  getCrossWorkflowDependencies,
  getDownstreamPaths,
  getSignalBlastRadius,
  getSignalConsumers,
  getSignalProducers,
  getUpstreamPaths,
  scorePath,
} from "@/lib/runtimeGraphTraversal";
import { RuntimeGraphSnapshot } from "@/lib/runtimeGraphTraversal";

const graph: RuntimeGraphSnapshot = {
  workers: [
    worker("worker-a", "A", "wg-btw"),
    worker("worker-b", "B", "wg-btw"),
    worker("worker-c", "C", "wg-ib"),
  ],
  signals: [
    signal("sig-stage", "dealstage"),
    signal("sig-machtiging", "machtiging_actief"),
  ],
  edges: [
    edge("edge-a-b", "worker-a", "worker-b", "sig-stage", "direct", "wg-btw", 0.8, 70),
    edge("edge-b-c", "worker-b", "worker-c", "sig-machtiging", "cross-workflow", "wg-ib", 0.6, 85),
  ],
  hubs: [],
  loops: [],
  risks: [],
};

describe("runtime graph traversal", () => {
  it("builds depth-limited downstream paths with weighted scores", () => {
    const paths = getDownstreamPaths(graph, "worker-a", { maxDepth: 2 });

    expect(paths).toHaveLength(2);
    expect(paths[0].workers.map((worker) => worker.id)).toEqual(["worker-a", "worker-b", "worker-c"]);
    expect(paths[0].confidenceScore).toBe(0.48);
    expect(paths[0].riskScore).toBe(85);
  });

  it("builds upstream paths for why a worker can run", () => {
    const paths = getUpstreamPaths(graph, "worker-c", { maxDepth: 2 });

    expect(paths).toHaveLength(2);
    expect(paths.map((path) => path.workers.map((worker) => worker.id))).toContainEqual([
      "worker-a",
      "worker-b",
      "worker-c",
    ]);
  });

  it("finds signal producers and consumers", () => {
    expect(getSignalProducers(graph, "sig-stage").map((worker) => worker.id)).toEqual(["worker-a"]);
    expect(getSignalConsumers(graph, "sig-stage").map((worker) => worker.id)).toEqual(["worker-b"]);
  });

  it("calculates blast radius from signal consumers", () => {
    const impact = getSignalBlastRadius(graph, "sig-stage", { maxDepth: 2 });

    expect(impact?.signal.id).toBe("sig-stage");
    expect(impact?.consumers.map((worker) => worker.id)).toEqual(["worker-b"]);
    expect(impact?.downstreamPaths).toHaveLength(1);
    expect(impact?.riskLevel).toMatch(/medium|high|critical/);
  });

  it("filters cross-workflow dependencies", () => {
    expect(getCrossWorkflowDependencies(graph).map((item) => item.id)).toEqual(["edge-b-c"]);
  });

  it("scores paths by compounded confidence and max risk", () => {
    expect(scorePath(graph.edges)).toEqual({
      confidenceScore: 0.48,
      riskScore: 85,
      fanOutScore: 85,
    });
  });
});

function worker(id: string, name: string, workflowGraphId: string) {
  return {
    id,
    name,
    sourceSystem: "gitlab" as const,
    actorRole: "route" as const,
    workflowGraphId,
    status: "active" as const,
    riskScore: 50,
    confidenceScore: 0.7,
    metadata: {},
  };
}

function signal(id: string, name: string) {
  return {
    id,
    name,
    signalType: "property" as const,
    isOrchestrationHub: false,
    hubScore: 0,
    metadata: {},
  };
}

function edge(
  id: string,
  sourceWorkerId: string,
  targetWorkerId: string,
  emittedSignalId: string,
  relationshipType: "direct" | "cross-workflow",
  workflowGraphId: string,
  confidenceScore: number,
  riskScore: number,
) {
  return {
    id,
    sourceWorkerId,
    targetWorkerId,
    emittedSignalId,
    workflowGraphId,
    relationshipType,
    relationshipOrigin: "manual_model" as const,
    evidenceType: "manual_model" as const,
    confidenceScore,
    confidenceLabel: "high" as const,
    confidenceReasons: [],
    fanOutScore: riskScore,
    fanOutRisk: riskScore >= 75 ? ("critical" as const) : ("high" as const),
    riskScore,
    observedCount: 0,
    metadata: {},
  };
}
