import { useMemo } from "react";
import { ReactFlow, Background, BackgroundVariant, Controls, MarkerType } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Automatisering, Flow } from "@/lib/types";
import { AutomationNode } from "./AutomationNode";
import { evaluateFlowEvidence, type FlowEvidence } from "@/lib/flowEvidence";

const nodeTypes = { automation: AutomationNode };

export interface FlowEdge {
  from: string;
  to: string;
  label: string;
  evidence: FlowEvidence;
}

export interface ConfirmedFlowLink {
  sourceId: string;
  targetId: string;
}

/**
 * Derives official flow edges. Accepted flow suggestions are stored in
 * automation_links, so prefer those inside the flow. Older/manual flows still
 * fall back to koppelingen, then to a simple sequential chain.
 */
export function buildFlowEdges(
  automationIds: string[],
  autoMap: Map<string, Automatisering>,
  confirmedLinks: ConfirmedFlowLink[] = [],
): FlowEdge[] {
  const flowSet = new Set(automationIds);
  const edges: FlowEdge[] = [];

  const seen = new Set<string>();
  for (const link of confirmedLinks) {
    if (!flowSet.has(link.sourceId) || !flowSet.has(link.targetId)) continue;
    const key = `${link.sourceId}â†’${link.targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      from: link.sourceId,
      to: link.targetId,
      label: "",
      evidence: evaluateFlowEvidence({
        from: autoMap.get(link.sourceId),
        to: autoMap.get(link.targetId),
        source: "confirmed",
      }),
    });
  }

  if (edges.length > 0) return edges;

  for (const id of automationIds) {
    const auto = autoMap.get(id);
    if (!auto) continue;
    for (const k of auto.koppelingen ?? []) {
      if (!flowSet.has(k.doelId)) continue;
      const key = `${id}→${k.doelId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        from: id,
        to: k.doelId,
        label: k.label,
        evidence: evaluateFlowEvidence({
          from: auto,
          to: autoMap.get(k.doelId),
          source: "manual",
          label: k.label,
        }),
      });
    }
  }

  if (edges.length === 0 && automationIds.length > 1) {
    for (let i = 0; i < automationIds.length - 1; i++) {
      edges.push({
        from: automationIds[i],
        to: automationIds[i + 1],
        label: "",
        evidence: evaluateFlowEvidence({
          from: autoMap.get(automationIds[i]),
          to: autoMap.get(automationIds[i + 1]),
          source: "sequential",
        }),
      });
    }
  }

  return edges;
}

function layout(
  automationIds: string[],
  edges: FlowEdge[],
): Record<string, { x: number; y: number }> {
  const COL_W = 320;
  const ROW_H = 200;

  const incoming: Record<string, string[]> = {};
  automationIds.forEach((id) => (incoming[id] = []));
  edges.forEach((e) => {
    if (incoming[e.to]) incoming[e.to].push(e.from);
  });

  const level: Record<string, number> = {};
  const visiting = new Set<string>();
  const visit = (id: string): number => {
    if (level[id] !== undefined) return level[id];
    if (visiting.has(id)) return (level[id] = 0); // cycle detected: pin to level 0
    visiting.add(id);
    const ins = incoming[id];
    if (!ins.length) {
      visiting.delete(id);
      return (level[id] = 0);
    }
    level[id] = Math.max(...ins.map(visit)) + 1;
    visiting.delete(id);
    return level[id];
  };
  automationIds.forEach(visit);

  const byLevel: Record<number, string[]> = {};
  automationIds.forEach((id) => {
    const l = level[id] ?? 0;
    (byLevel[l] = byLevel[l] || []).push(id);
  });

  const maxWidth = Math.max(...Object.values(byLevel).map((arr) => arr.length));
  const totalWidth = maxWidth * COL_W;
  const positions: Record<string, { x: number; y: number }> = {};

  Object.entries(byLevel).forEach(([lvl, ids]) => {
    const y = Number(lvl) * ROW_H;
    const rowWidth = ids.length * COL_W;
    const offset = (totalWidth - rowWidth) / 2;
    ids.forEach((id, i) => {
      positions[id] = { x: offset + i * COL_W, y };
    });
  });

  return positions;
}

interface FlowCanvasProps {
  flow: Flow;
  autoMap: Map<string, Automatisering>;
  allFlows: Flow[];
  confirmedLinks?: ConfirmedFlowLink[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export const FlowCanvas = ({ flow, autoMap, allFlows, confirmedLinks = [], selectedId, onSelect }: FlowCanvasProps) => {
  const { baseNodes, edges } = useMemo(() => {
    const flowEdges = buildFlowEdges(flow.automationIds, autoMap, confirmedLinks);
    const positions = layout(flow.automationIds, flowEdges);
    const ns: Node[] = flow.automationIds.map((id, i) => {
      const auto = autoMap.get(id);
      const reusedCount = auto
        ? allFlows.filter((f) => f.id !== flow.id && f.automationIds.includes(id)).length
        : 0;
      return {
        id,
        type: "automation",
        position: positions[id] ?? { x: 0, y: i * 200 },
        data: { automation: auto, index: i, reusedCount },
      };
    });
    const es: Edge[] = flowEdges.map((e) => ({
      id: `${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      label: e.evidence.label,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor(e.evidence.level) },
      style: {
        stroke: edgeColor(e.evidence.level),
        strokeWidth: e.evidence.level === "confirmed" || e.evidence.level === "hard" ? 2.5 : 1.75,
        strokeDasharray: e.evidence.level === "uncertain" || e.evidence.level === "weak" ? "6 4" : undefined,
      },
      labelStyle: { fontSize: 11, fill: edgeColor(e.evidence.level), fontWeight: 700 },
      labelBgStyle: { fill: "hsl(var(--background))" },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
    }));
    return { baseNodes: ns, edges: es };
  }, [flow, autoMap, allFlows, confirmedLinks]);

  const nodes = useMemo(
    () => baseNodes.map((n) => ({ ...n, selected: n.id === selectedId })),
    [baseNodes, selectedId],
  );

  return (
    <div className="h-full w-full rounded-xl border border-border overflow-hidden bg-[hsl(var(--surface-sunken))]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, n) => onSelect(n.id)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={1.4}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.2}
          color="hsl(var(--grid-dot))"
        />
        <Controls
          showInteractive={false}
          className="!shadow-sm !border !border-border !rounded-lg overflow-hidden"
        />
      </ReactFlow>
    </div>
  );
};

function edgeColor(level: FlowEvidence["level"]): string {
  if (level === "confirmed") return "rgb(22 163 74)";
  if (level === "hard") return "rgb(37 99 235)";
  if (level === "strong") return "rgb(79 70 229)";
  if (level === "weak") return "rgb(234 179 8)";
  return "rgb(148 163 184)";
}
