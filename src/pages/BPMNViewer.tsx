/**
 * BPMNViewer v2
 *
 * Canvas loads /public/bpmn-graph.json (v2 format: startEvent, endEvent,
 * exclusiveGateway, task nodes).  Review panel stays Supabase-backed.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type NodeTypes,
  type Node,
  type Edge,
  type NodeProps,
  Position,
  Handle,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useBpmnGraph, useReviewAiFlow } from "@/hooks/useBpmnGraph";
import type { GraphFlow } from "@/types/bpmn";
import { Loader2, Check, X, ChevronRight } from "lucide-react";

// ── v2 JSON types ─────────────────────────────────────────────────────────────

interface V2Node {
  id: string;
  label: string;
  bpmn_type: "startEvent" | "endEvent" | "task" | "exclusiveGateway";
  lane: string;
  laneIndex: number;
  column: number;
  row: number;
  processGroup: string;
  automationId: string | null;
  importance: "primary" | "support" | "background";
}
interface V2Flow { id: string; from: string; to: string; confidence: number; reasoning: string; }
interface V2Graph {
  meta: { pool: string; laneOrder: string[]; phaseOrder: string[] };
  nodes: V2Node[];
  flows: V2Flow[];
}

// ── Colours ───────────────────────────────────────────────────────────────────

const LANE_BG: Record<string, string> = {
  Sales: "#dbeafe", Marketing: "#fce7f3", Onboarding: "#d1fae5",
  Boekhouding: "#fef9c3", Management: "#f3e8ff",
};
const LANE_BD: Record<string, string> = {
  Sales: "#93c5fd", Marketing: "#f9a8d4", Onboarding: "#6ee7b7",
  Boekhouding: "#fde047", Management: "#d8b4fe",
};
const LANE_TX: Record<string, string> = {
  Sales: "#1d4ed8", Marketing: "#9d174d", Onboarding: "#065f46",
  Boekhouding: "#78350f", Management: "#581c87",
};

// ── Sizes ──────────────────────────────────────────────────────────────────────

const TASK_W    = 160;
const TASK_H    = 48;
const EVT_D     = 34;    // event circle diameter
const GW_D      = 44;    // gateway diamond bounding box
const COL_W     = 220;   // width per phase column
const ROW_H     = 72;    // height per row slot
const LANE_PT   = 52;    // lane padding top
const LANE_PB   = 20;    // lane padding bottom
const HDR_H     = 32;    // phase column header height
const LBAR_W    = 44;    // lane-label bar width

// ── No-handle background node ─────────────────────────────────────────────────

function BpmnBgNode({ data }: NodeProps) {
  const d = data as any;
  return (
    <div
      style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      {d.label && (
        <span style={{
          fontSize: 9, fontWeight: 700, color: "#64748b",
          textAlign: "center", padding: "0 6px", lineHeight: 1.2,
        }}>
          {d.label}
        </span>
      )}
    </div>
  );
}

function BpmnLaneLabelNode({ data }: NodeProps) {
  const d = data as any;
  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", alignItems: "center", justifyContent: "center",
      writingMode: "vertical-rl",
      transform: "rotate(180deg)",
      fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
      color: d.color,
      userSelect: "none",
      pointerEvents: "none",
    }}>
      {d.label}
    </div>
  );
}

// ── BPMN shape nodes ──────────────────────────────────────────────────────────

const hSrc = { width: 8, height: 8, border: "none" };
const hTgt = { width: 8, height: 8, border: "none" };

function BpmnStartNode() {
  return (
    <div style={{ width: EVT_D, height: EVT_D }}>
      <Handle type="source" position={Position.Right}
        style={{ ...hSrc, background: "#16a34a", right: -4 }} />
      <svg width={EVT_D} height={EVT_D}>
        <circle cx={EVT_D / 2} cy={EVT_D / 2} r={EVT_D / 2 - 2}
          fill="#dcfce7" stroke="#16a34a" strokeWidth="2.5" />
      </svg>
    </div>
  );
}

function BpmnEndNode() {
  return (
    <div style={{ width: EVT_D, height: EVT_D }}>
      <Handle type="target" position={Position.Left}
        style={{ ...hTgt, background: "#dc2626", left: -4 }} />
      <svg width={EVT_D} height={EVT_D}>
        <circle cx={EVT_D / 2} cy={EVT_D / 2} r={EVT_D / 2 - 2}
          fill="#fee2e2" stroke="#dc2626" strokeWidth="4" />
        <circle cx={EVT_D / 2} cy={EVT_D / 2} r={EVT_D / 2 - 8}
          fill="#dc2626" />
      </svg>
    </div>
  );
}

function BpmnTaskNode({ data }: NodeProps) {
  const d = data as V2Node;
  const opacity = d.importance === "background" ? 0.45 : d.importance === "support" ? 0.78 : 1;
  return (
    <div style={{ width: TASK_W, height: TASK_H, opacity }}>
      <Handle type="target" position={Position.Left}
        style={{ ...hTgt, background: "#94a3b8", left: -4 }} />
      <Handle type="source" position={Position.Right}
        style={{ ...hSrc, background: "#94a3b8", right: -4 }} />
      <div style={{
        width: TASK_W, height: TASK_H, borderRadius: 7,
        border: "1.5px solid #b0bec5",
        background: "white",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "4px 10px",
        fontSize: 10, fontWeight: 500, textAlign: "center", lineHeight: 1.3,
        color: "#1e293b",
        boxShadow: "0 1px 3px rgba(0,0,0,.09)",
      }}>
        {d.label}
      </div>
    </div>
  );
}

function BpmnGatewayNode() {
  return (
    <div style={{ width: GW_D, height: GW_D, position: "relative" }}>
      <Handle type="target" position={Position.Left}
        style={{ ...hTgt, background: "#92400e", left: -4, top: "50%" }} />
      <Handle type="source" position={Position.Right}
        style={{ ...hSrc, background: "#92400e", right: -4, top: "50%" }} />
      <Handle id="b" type="source" position={Position.Bottom}
        style={{ ...hSrc, background: "#92400e", bottom: -4, left: "50%" }} />
      <svg width={GW_D} height={GW_D} style={{ display: "block" }}>
        <polygon
          points={`${GW_D / 2},2 ${GW_D - 2},${GW_D / 2} ${GW_D / 2},${GW_D - 2} 2,${GW_D / 2}`}
          fill="#fef3c7" stroke="#92400e" strokeWidth="1.5"
        />
        <text x={GW_D / 2} y={GW_D / 2 + 5}
          textAnchor="middle" fontSize="14" fill="#92400e" fontWeight="bold">
          ×
        </text>
      </svg>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  bpmnBg:        BpmnBgNode as any,
  bpmnLaneLabel: BpmnLaneLabelNode as any,
  bpmnStart:     BpmnStartNode as any,
  bpmnEnd:       BpmnEndNode as any,
  bpmnTask:      BpmnTaskNode as any,
  bpmnGateway:   BpmnGatewayNode as any,
};

// ── Layout builder ────────────────────────────────────────────────────────────

function buildLayout(v2: V2Graph, minConf: number): { nodes: Node[]; edges: Edge[] } {
  const { nodes: v2n, flows, meta } = v2;

  // Max row per lane
  const laneMaxRow = new Map<string, number>();
  for (const lane of meta.laneOrder) laneMaxRow.set(lane, 0);
  for (const n of v2n) {
    if (n.row >= 0)
      laneMaxRow.set(n.lane, Math.max(laneMaxRow.get(n.lane) ?? 0, n.row + 1));
  }

  // Lane Y positions
  const laneY = new Map<string, number>();
  let yOff = HDR_H + 6;
  for (const lane of meta.laneOrder) {
    laneY.set(lane, yOff);
    const rows = Math.max(laneMaxRow.get(lane) ?? 1, 1);
    yOff += LANE_PT + rows * ROW_H + LANE_PB;
  }

  const maxCol = Math.max(...v2n.map(n => n.column), 0);
  const contentW = LBAR_W + (maxCol + 1) * COL_W + 60;

  const rfNodes: Node[] = [];

  // Phase column headers
  meta.phaseOrder.forEach((phase, pi) => {
    rfNodes.push({
      id: `ph-${pi}`,
      type: "bpmnBg",
      position: { x: LBAR_W + pi * COL_W, y: 0 },
      data: { label: phase },
      style: {
        width: COL_W - 4, height: HDR_H - 4,
        background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 4,
      },
      selectable: false, draggable: false, zIndex: 0,
    });
  });

  // Lane backgrounds + lane label bars
  for (const lane of meta.laneOrder) {
    const ly = laneY.get(lane)!;
    const rows = Math.max(laneMaxRow.get(lane) ?? 1, 1);
    const h = LANE_PT + rows * ROW_H + LANE_PB;

    // Content background
    rfNodes.push({
      id: `lane-bg-${lane}`,
      type: "bpmnBg",
      position: { x: LBAR_W, y: ly },
      data: {},
      style: {
        width: contentW - LBAR_W, height: h,
        background: LANE_BG[lane] ?? "#f1f5f9",
        border: `1px solid ${LANE_BD[lane] ?? "#e2e8f0"}`,
        borderRadius: 0,
      },
      selectable: false, draggable: false, zIndex: 0,
    });

    // Lane label bar
    rfNodes.push({
      id: `lane-label-${lane}`,
      type: "bpmnLaneLabel",
      position: { x: 0, y: ly },
      data: { label: lane, color: LANE_TX[lane] ?? "#374151" },
      style: {
        width: LBAR_W, height: h,
        background: LANE_BG[lane] ?? "#f1f5f9",
        border: `1px solid ${LANE_BD[lane] ?? "#e2e8f0"}`,
        borderRight: `2px solid ${LANE_BD[lane] ?? "#cbd5e1"}`,
        borderRadius: 0,
      },
      selectable: false, draggable: false, zIndex: 0,
    });
  }

  // BPMN element nodes
  for (const n of v2n) {
    const ly = laneY.get(n.lane) ?? 0;
    const colX = LBAR_W + n.column * COL_W;
    let x: number, y: number, type: string;

    if (n.bpmn_type === "startEvent" || n.bpmn_type === "endEvent") {
      x = colX + (COL_W - EVT_D) / 2;
      y = n.row < 0
        ? ly + 10
        : ly + LANE_PT + n.row * ROW_H + (ROW_H - EVT_D) / 2;
      type = n.bpmn_type === "startEvent" ? "bpmnStart" : "bpmnEnd";
    } else if (n.bpmn_type === "exclusiveGateway") {
      x = colX + (COL_W - GW_D) / 2;
      y = n.row < 0
        ? ly + 10
        : ly + LANE_PT + n.row * ROW_H + (ROW_H - GW_D) / 2;
      type = "bpmnGateway";
    } else {
      x = colX + (COL_W - TASK_W) / 2;
      y = n.row < 0
        ? ly + 8
        : ly + LANE_PT + n.row * ROW_H + (ROW_H - TASK_H) / 2;
      type = "bpmnTask";
    }

    rfNodes.push({
      id: n.id,
      type,
      position: { x, y },
      data: { ...n },
      zIndex: 2,
    });
  }

  // Edges
  const nodeSet = new Set(v2n.map(n => n.id));
  const edges: Edge[] = flows
    .filter(f => f.confidence >= minConf && nodeSet.has(f.from) && nodeSet.has(f.to))
    .map(f => {
      const color =
        f.confidence >= 0.85 ? "#16a34a" :
        f.confidence >= 0.7  ? "#d97706" : "#94a3b8";
      return {
        id: f.id,
        source: f.from,
        target: f.to,
        type: "smoothstep",
        style: { stroke: color, strokeWidth: 1.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 16,
          height: 16,
        },
      } satisfies Edge;
    });

  return { nodes: rfNodes, edges };
}

// ── Review Panel ──────────────────────────────────────────────────────────────

function ReviewPanel({
  flows,
  onReview,
}: {
  flows: GraphFlow[];
  onReview: (id: string, action: "confirm" | "reject") => void;
}) {
  const pending   = flows.filter(f => !f.confirmed && !f.rejected);
  const confirmed = flows.filter(f => f.confirmed);
  const rejected  = flows.filter(f => f.rejected);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">AI Flows Reviewen</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {pending.length} openstaand · {confirmed.length} bevestigd · {rejected.length} afgewezen
        </p>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {pending.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">Alle flows zijn beoordeeld.</p>
        )}
        {pending.map(f => (
          <div key={f.id} className="px-4 py-3 space-y-2">
            <p className="text-xs text-muted-foreground leading-snug">{f.reasoning_flow}</p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{
                background: f.confidence >= 0.75 ? "#dcfce7" : f.confidence >= 0.6 ? "#fef3c7" : "#fee2e2",
                color:      f.confidence >= 0.75 ? "#15803d" : f.confidence >= 0.6 ? "#b45309" : "#b91c1c",
              }}>
                {Math.round(f.confidence * 100)}%
              </span>
              <button onClick={() => onReview(f.db_id!, "confirm")}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                <Check className="h-3 w-3" /> Bevestig
              </button>
              <button onClick={() => onReview(f.db_id!, "reject")}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 transition-colors">
                <X className="h-3 w-3" /> Afwijzen
              </button>
            </div>
          </div>
        ))}
        {confirmed.length > 0 && (
          <details className="group">
            <summary className="px-4 py-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
              <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
              {confirmed.length} bevestigd
            </summary>
            {confirmed.map(f => (
              <div key={f.id} className="px-4 py-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground leading-snug line-clamp-2 flex-1">{f.reasoning_flow}</p>
                <span className="text-xs text-green-600 ml-2 shrink-0">✓</span>
              </div>
            ))}
          </details>
        )}
        {rejected.length > 0 && (
          <details className="group">
            <summary className="px-4 py-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
              <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
              {rejected.length} afgewezen
            </summary>
            {rejected.map(f => (
              <div key={f.id} className="px-4 py-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground leading-snug line-clamp-2 flex-1">{f.reasoning_flow}</p>
                <span className="text-xs text-red-500 ml-2 shrink-0">✗</span>
              </div>
            ))}
          </details>
        )}
      </div>
    </div>
  );
}

// ── Main canvas ───────────────────────────────────────────────────────────────

const CONF_FILTERS = [
  { label: "Alle",  value: 0 },
  { label: "≥70%", value: 0.7 },
  { label: "≥80%", value: 0.8 },
  { label: "≥90%", value: 0.9 },
];

function BpmnCanvas() {
  const { graph, isLoading: reviewLoading } = useBpmnGraph();
  const reviewMutation = useReviewAiFlow();

  const [v2, setV2]       = useState<V2Graph | null>(null);
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const [minConf, setMinConf] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    fetch("/bpmn-graph.json")
      .then(r => r.json())
      .then(setV2)
      .catch(e => setJsonErr(String(e)));
  }, []);

  const { nodes, edges } = useMemo(() => {
    if (!v2) return { nodes: [], edges: [] };
    return buildLayout(v2, minConf);
  }, [v2, minConf]);

  const handleReview = useCallback(
    (id: string, action: "confirm" | "reject") => reviewMutation.mutate({ id, action }),
    [reviewMutation],
  );

  if (!v2 && !jsonErr) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (jsonErr) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-destructive">Kon bpmn-graph.json niet laden: {jsonErr}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 relative">
        {/* Confidence filter */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-background/90 border border-border rounded-lg shadow-sm px-2 py-1.5">
          <span className="text-xs text-muted-foreground mr-1">Betrouwbaarheid:</span>
          {CONF_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setMinConf(f.value)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                minConf === f.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Panel toggle */}
        <button
          onClick={() => setPanelOpen(p => !p)}
          className="absolute top-3 right-3 z-10 text-xs px-2.5 py-1.5 bg-background/90 border border-border rounded-lg shadow-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {panelOpen ? "Verberg review" : "Toon review"}
        </button>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.06 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} color="#e2e8f0" />
          <Controls />
          <MiniMap zoomable pannable nodeColor={n => {
            const lane = (n.data as any)?.lane as string;
            return LANE_BG[lane] ?? "#e2e8f0";
          }} />
        </ReactFlow>
      </div>

      {panelOpen && graph && (
        <div className="w-80 border-l border-border bg-card flex-shrink-0">
          <ReviewPanel flows={graph.flows} onReview={handleReview} />
        </div>
      )}
    </div>
  );
}

export default function BPMNViewer() {
  return (
    <div style={{ height: "calc(100vh - 48px)" }}>
      <ReactFlowProvider>
        <BpmnCanvas />
      </ReactFlowProvider>
    </div>
  );
}
