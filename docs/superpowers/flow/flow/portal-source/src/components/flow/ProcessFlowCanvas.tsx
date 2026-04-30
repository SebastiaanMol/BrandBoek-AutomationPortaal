import { useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import { AutomationNode } from "./AutomationNode";
import {
  type BusinessProcess,
  getProcessesUsingAutomation,
} from "@/data/portal";

const nodeTypes = { automation: AutomationNode };

interface ProcessFlowCanvasProps {
  process: BusinessProcess;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Layered layout: respect edges; nodes with multiple incoming edges get placed lower.
 * For mock data we do a simple BFS-leveling, then column-distribute siblings.
 */
function layout(process: BusinessProcess): Record<string, { x: number; y: number }> {
  const COL_W = 320;
  const ROW_H = 200;
  const { automationIds, edges } = process;

  // Build adjacency
  const incoming: Record<string, string[]> = {};
  automationIds.forEach((id) => (incoming[id] = []));
  edges.forEach((e) => {
    if (incoming[e.to]) incoming[e.to].push(e.from);
  });

  // Compute level via longest path from root
  const level: Record<string, number> = {};
  const visit = (id: string): number => {
    if (level[id] !== undefined) return level[id];
    const ins = incoming[id];
    if (!ins.length) return (level[id] = 0);
    level[id] = Math.max(...ins.map(visit)) + 1;
    return level[id];
  };
  automationIds.forEach(visit);

  // Group by level, then assign x by index in that level
  const byLevel: Record<number, string[]> = {};
  automationIds.forEach((id) => {
    const l = level[id];
    (byLevel[l] = byLevel[l] || []).push(id);
  });

  const positions: Record<string, { x: number; y: number }> = {};
  const maxWidth = Math.max(...Object.values(byLevel).map((arr) => arr.length));
  const totalWidth = maxWidth * COL_W;

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

export const ProcessFlowCanvas = ({
  process,
  selectedId,
  onSelect,
}: ProcessFlowCanvasProps) => {
  const { nodes, edges } = useMemo(() => {
    const positions = layout(process);
    const ns: Node[] = process.automationIds.map((id, i) => {
      const reused = getProcessesUsingAutomation(id).filter(
        (p) => p.id !== process.id
      ).length;
      return {
        id,
        type: "automation",
        position: positions[id] ?? { x: 0, y: i * 200 },
        data: { automationId: id, index: i, reusedCount: reused },
        selected: id === selectedId,
      };
    });
    const es: Edge[] = process.edges.map((e) => ({
      id: `${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      label: e.label,
      animated: e.animated,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--muted-foreground))" },
      labelStyle: { fontSize: 11, fill: "hsl(var(--muted-foreground))", fontWeight: 600 },
      labelBgStyle: { fill: "hsl(var(--background))" },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
    }));
    return { nodes: ns, edges: es };
  }, [process, selectedId]);

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
