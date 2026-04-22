import { useMemo } from "react";
import { ReactFlow, Background, BackgroundVariant, Controls, MarkerType } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Automatisering, Flow } from "@/lib/types";
import { AutomationNode } from "./AutomationNode";

const nodeTypes = { automation: AutomationNode };

export interface FlowEdge {
  from: string;
  to: string;
  label: string;
}

/**
 * Derives edges from koppelingen. Only includes edges between automations
 * that are members of the flow. If no koppelingen exist, falls back to a
 * sequential chain (automationIds order).
 */
export function buildFlowEdges(
  automationIds: string[],
  autoMap: Map<string, Automatisering>,
): FlowEdge[] {
  const flowSet = new Set(automationIds);
  const edges: FlowEdge[] = [];

  for (const id of automationIds) {
    const auto = autoMap.get(id);
    if (!auto) continue;
    for (const k of auto.koppelingen ?? []) {
      if (flowSet.has(k.doelId)) {
        edges.push({ from: id, to: k.doelId, label: k.label });
      }
    }
  }

  if (edges.length === 0 && automationIds.length > 1) {
    for (let i = 0; i < automationIds.length - 1; i++) {
      edges.push({ from: automationIds[i], to: automationIds[i + 1], label: "" });
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
  const visit = (id: string): number => {
    if (level[id] !== undefined) return level[id];
    const ins = incoming[id];
    if (!ins.length) return (level[id] = 0);
    level[id] = Math.max(...ins.map(visit)) + 1;
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
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export const FlowCanvas = ({ flow, autoMap, allFlows, selectedId, onSelect }: FlowCanvasProps) => {
  const { nodes, edges } = useMemo(() => {
    const flowEdges = buildFlowEdges(flow.automationIds, autoMap);
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
        selected: id === selectedId,
      };
    });

    const es: Edge[] = flowEdges.map((e) => ({
      id: `${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      label: e.label || undefined,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--muted-foreground))" },
      labelStyle: { fontSize: 11, fill: "hsl(var(--muted-foreground))", fontWeight: 600 },
      labelBgStyle: { fill: "hsl(var(--background))" },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
    }));

    return { nodes: ns, edges: es };
  }, [flow, autoMap, allFlows, selectedId]);

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
