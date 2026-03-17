import { useState, useCallback, useMemo, useEffect } from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  BackgroundVariant,
  Panel,
  MarkerType,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getAutomatiseringen } from "@/lib/storage";
import { Automatisering, Systeem, Categorie } from "@/lib/types";
import { StatusBadge, CategorieBadge, SystemBadge } from "@/components/Badges";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { X, RotateCcw } from "lucide-react";

const SYSTEM_COLORS: Record<string, string> = {
  HubSpot: "hsl(12, 100%, 67%)",
  Zapier: "hsl(17, 100%, 50%)",
  Backend: "hsl(210, 100%, 40%)",
  "E-mail": "hsl(160, 84%, 39%)",
  API: "hsl(215, 16%, 47%)",
};

const SYSTEM_BG: Record<string, string> = {
  HubSpot: "hsl(12, 100%, 67%, 0.08)",
  Zapier: "hsl(17, 100%, 50%, 0.08)",
  Backend: "hsl(210, 100%, 40%, 0.08)",
  "E-mail": "hsl(160, 84%, 39%, 0.08)",
  API: "hsl(215, 16%, 47%, 0.08)",
};

const CATEGORY_COLORS: Record<string, string> = {
  "HubSpot Workflow": "hsl(12, 100%, 67%, 0.15)",
  "Zapier Zap": "hsl(17, 100%, 50%, 0.15)",
  "Backend Script": "hsl(210, 100%, 40%, 0.15)",
  "HubSpot + Zapier": "hsl(30, 100%, 55%, 0.15)",
  "Anders": "hsl(215, 16%, 47%, 0.15)",
};

const CATEGORY_BORDER: Record<string, string> = {
  "HubSpot Workflow": "hsl(12, 100%, 67%, 0.35)",
  "Zapier Zap": "hsl(17, 100%, 50%, 0.35)",
  "Backend Script": "hsl(210, 100%, 40%, 0.35)",
  "HubSpot + Zapier": "hsl(30, 100%, 55%, 0.35)",
  "Anders": "hsl(215, 16%, 47%, 0.35)",
};

const CATEGORY_ICONS: Record<string, string> = {
  "HubSpot Workflow": "⚙️",
  "Zapier Zap": "⚡",
  "Backend Script": "💻",
  "HubSpot + Zapier": "🔗",
  "Anders": "📦",
};

const STATUS_ICON: Record<string, string> = {
  Actief: "🟢",
  Verouderd: "🔴",
  "In review": "🟡",
  Uitgeschakeld: "⚫",
};

function getPrimarySystem(auto: Automatisering): string {
  if (auto.systemen.includes("HubSpot")) return "HubSpot";
  if (auto.systemen.includes("Zapier")) return "Zapier";
  if (auto.systemen.includes("Backend")) return "Backend";
  return auto.systemen[0] || "API";
}

// Hub positions for layout
const HUB_POSITIONS: Record<string, { x: number; y: number }> = {
  HubSpot: { x: 0, y: 0 },
  Zapier: { x: 800, y: 0 },
  Backend: { x: 400, y: 600 },
};

function buildGraph(
  automatiseringen: Automatisering[],
  filter: string | null
): { nodes: Node[]; edges: Edge[] } {
  const filtered = filter
    ? automatiseringen.filter((a) => a.systemen.includes(filter as Systeem))
    : automatiseringen;

  // Group by primary system, then by categorie
  const groups: Record<string, Record<string, Automatisering[]>> = {};
  filtered.forEach((a) => {
    const sys = getPrimarySystem(a);
    if (!groups[sys]) groups[sys] = {};
    if (!groups[sys][a.categorie]) groups[sys][a.categorie] = [];
    groups[sys][a.categorie].push(a);
  });

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Create hub nodes
  const activeHubs = new Set(filtered.map(getPrimarySystem));
  activeHubs.forEach((sys) => {
    const pos = HUB_POSITIONS[sys] || { x: 1200, y: 300 };
    const totalInHub = Object.values(groups[sys] || {}).reduce((s, arr) => s + arr.length, 0);
    nodes.push({
      id: `hub-${sys}`,
      type: "default",
      position: pos,
      data: {
        label: (
          <div className="flex items-center gap-2 px-1">
            <span className="text-lg font-bold">{sys}</span>
            <span className="text-xs opacity-70">({totalInHub})</span>
          </div>
        ),
      },
      style: {
        background: SYSTEM_COLORS[sys],
        color: "#fff",
        borderRadius: "50%",
        width: 140,
        height: 140,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: `3px solid ${SYSTEM_COLORS[sys]}`,
        fontSize: "14px",
        fontWeight: 700,
        boxShadow: `0 4px 24px ${SYSTEM_COLORS[sys]}40`,
        zIndex: 10,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });

  // Place subcategory groups as clusters around each hub
  Object.entries(groups).forEach(([sys, catGroups]) => {
    const hub = HUB_POSITIONS[sys] || { x: 1200, y: 300 };
    const categories = Object.keys(catGroups);
    const clusterRadius = 320;

    categories.forEach((cat, catIdx) => {
      const autos = catGroups[cat];
      const catAngle = (2 * Math.PI * catIdx) / categories.length - Math.PI / 2;
      const clusterCenterX = hub.x + clusterRadius * Math.cos(catAngle) + 70;
      const clusterCenterY = hub.y + clusterRadius * Math.sin(catAngle) + 70;

      // Subcategory group node (background container)
      const padding = 30;
      const nodeWidth = 180;
      const nodeHeight = 52;
      const cols = Math.min(autos.length, 2);
      const rows = Math.ceil(autos.length / cols);
      const groupW = cols * (nodeWidth + 16) + padding * 2;
      const groupH = rows * (nodeHeight + 12) + padding * 2 + 32; // 32 for header

      const groupId = `group-${sys}-${cat}`;
      nodes.push({
        id: groupId,
        type: "default",
        position: {
          x: clusterCenterX - groupW / 2,
          y: clusterCenterY - groupH / 2,
        },
        data: {
          label: (
            <div style={{ width: groupW - 24, height: groupH - 16 }} className="relative">
              <div className="absolute top-0 left-0 right-0 flex items-center gap-1.5 pb-1">
                <span>{CATEGORY_ICONS[cat] || "📦"}</span>
                <span className="text-xs font-bold opacity-80">{cat}</span>
                <span className="text-[10px] opacity-50">({autos.length})</span>
              </div>
            </div>
          ),
        },
        style: {
          background: CATEGORY_COLORS[cat] || "hsl(0,0%,95%,0.5)",
          border: `1.5px dashed ${CATEGORY_BORDER[cat] || "hsl(0,0%,70%,0.4)"}`,
          borderRadius: "12px",
          width: groupW,
          height: groupH,
          padding: "8px 12px",
          zIndex: 0,
          pointerEvents: "none" as const,
        },
        selectable: false,
        draggable: true,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });

      // Edge from hub to subcategory group
      edges.push({
        id: `hub-${sys}-${groupId}`,
        source: `hub-${sys}`,
        target: groupId,
        type: "default",
        style: { stroke: SYSTEM_COLORS[sys], strokeWidth: 1.5, opacity: 0.25 },
      });

      // Place automation nodes inside the group
      autos.forEach((a, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = clusterCenterX - groupW / 2 + padding + col * (nodeWidth + 16);
        const y = clusterCenterY - groupH / 2 + padding + 28 + row * (nodeHeight + 12);
        const color = SYSTEM_COLORS[sys] || "#888";

        nodes.push({
          id: a.id,
          type: "default",
          position: { x, y },
          data: {
            label: (
              <div className="text-left leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono opacity-70">{a.id}</span>
                  <span>{STATUS_ICON[a.status] || ""}</span>
                </div>
                <div className="font-semibold text-xs mt-0.5 truncate max-w-[140px]">{a.naam}</div>
              </div>
            ),
          },
          style: {
            background: SYSTEM_BG[sys] || "#f5f5f5",
            border: `2px solid ${color}`,
            borderRadius: "var(--radius-inner, 8px)",
            padding: "8px 12px",
            width: nodeWidth,
            cursor: "pointer",
            fontSize: "12px",
            zIndex: 5,
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        });
      });
    });
  });

  // Koppeling edges between automations
  filtered.forEach((a) => {
    (a.koppelingen || []).forEach((k) => {
      const target = filtered.find((t) => t.id === k.doelId);
      if (!target) return;
      const sys = getPrimarySystem(a);
      const color = SYSTEM_COLORS[sys] || "#888";
      edges.push({
        id: `link-${a.id}-${k.doelId}`,
        source: a.id,
        target: k.doelId,
        label: k.label || undefined,
        type: "default",
        animated: true,
        style: { stroke: color, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        labelStyle: { fontSize: 10, fontWeight: 500, fill: "hsl(222, 47%, 11%)" },
        labelBgStyle: { fill: "hsl(0, 0%, 100%)", fillOpacity: 0.85 },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
      });
    });
  });

  return { nodes, edges };
}

export default function Mindmap() {
  const automatiseringen = useMemo(() => getAutomatiseringen(), []);
  const [filter, setFilter] = useState<string | null>(null);
  const [selectedAuto, setSelectedAuto] = useState<Automatisering | null>(null);

  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => buildGraph(automatiseringen, filter),
    [automatiseringen, filter]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(automatiseringen, filter);
    setNodes(n);
    setEdges(e);
  }, [filter, automatiseringen, setNodes, setEdges]);

  const resetLayout = useCallback(() => {
    const { nodes: n, edges: e } = buildGraph(automatiseringen, filter);
    setNodes(n);
    setEdges(e);
  }, [automatiseringen, filter, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id.startsWith("hub-") || node.id.startsWith("group-")) return;
      const auto = automatiseringen.find((a) => a.id === node.id);
      if (auto) setSelectedAuto(auto);
    },
    [automatiseringen]
  );

  const filters: string[] = ["HubSpot", "Zapier", "Backend"];

  return (
    <div className="h-[calc(100vh-7rem)] w-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(214, 32%, 91%)" />
        <Controls position="bottom-left" />
        <MiniMap
          position="bottom-right"
          nodeStrokeWidth={3}
          pannable
          zoomable
          style={{ borderRadius: "var(--radius-inner, 8px)", border: "1px solid hsl(214, 32%, 91%)" }}
        />

        {/* Filter panel */}
        <Panel position="top-left">
          <div className="flex gap-2 bg-card/90 backdrop-blur border border-border rounded-[var(--radius-inner)] p-2 shadow-sm">
            <button
              onClick={() => setFilter(null)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                !filter ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              Alles
            </button>
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(filter === f ? null : f)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                  filter === f ? "text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
                }`}
                style={filter === f ? { background: SYSTEM_COLORS[f] } : undefined}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: SYSTEM_COLORS[f] }}
                />
                {f}
              </button>
            ))}
            <div className="w-px bg-border mx-1" />
            <button
              onClick={resetLayout}
              className="px-3 py-1.5 text-xs rounded-md text-muted-foreground hover:bg-secondary flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>
        </Panel>

        {/* Stats */}
        <Panel position="top-right">
          <div className="bg-card/90 backdrop-blur border border-border rounded-[var(--radius-inner)] px-4 py-2 shadow-sm">
            <span className="text-xs text-muted-foreground">
              {automatiseringen.length} automatiseringen · {automatiseringen.reduce((s, a) => s + (a.koppelingen?.length || 0), 0)} koppelingen
            </span>
          </div>
        </Panel>
      </ReactFlow>

      {/* Detail sidebar */}
      {selectedAuto && (
        <div className="absolute top-0 right-0 h-full w-96 bg-card border-l border-border shadow-xl z-50 overflow-y-auto">
          <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between z-10">
            <div>
              <p className="font-mono text-xs text-muted-foreground">{selectedAuto.id}</p>
              <h2 className="font-bold text-foreground">{selectedAuto.naam}</h2>
            </div>
            <button
              onClick={() => setSelectedAuto(null)}
              className="p-1.5 rounded-md hover:bg-secondary transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-5">
            <div className="flex flex-wrap gap-1.5">
              <CategorieBadge categorie={selectedAuto.categorie} />
              <StatusBadge status={selectedAuto.status} />
              {selectedAuto.systemen.map((s) => (
                <SystemBadge key={s} systeem={s} />
              ))}
            </div>

            <DetailBlock title="Doel">{selectedAuto.doel}</DetailBlock>
            <DetailBlock title="Trigger">{selectedAuto.trigger}</DetailBlock>
            <DetailBlock title="Owner">{selectedAuto.owner || "—"}</DetailBlock>

            {selectedAuto.stappen.length > 0 && (
              <div>
                <p className="label-uppercase mb-1.5">Flow / Stappen</p>
                <ol className="list-decimal list-inside text-sm text-foreground space-y-0.5">
                  {selectedAuto.stappen.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
            )}

            <DetailBlock title="Afhankelijkheden">{selectedAuto.afhankelijkheden || "—"}</DetailBlock>

            {(selectedAuto.koppelingen || []).length > 0 && (
              <div>
                <p className="label-uppercase mb-1.5">Koppelingen</p>
                <div className="space-y-1.5">
                  {selectedAuto.koppelingen.map((k, i) => {
                    const target = automatiseringen.find((a) => a.id === k.doelId);
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-sm bg-secondary rounded-[var(--radius-inner)] p-2 cursor-pointer hover:bg-accent transition-colors"
                        onClick={() => {
                          if (target) setSelectedAuto(target);
                        }}
                      >
                        <span className="font-mono text-xs font-semibold">{k.doelId}</span>
                        <span className="text-muted-foreground text-xs truncate">{target?.naam}</span>
                        {k.label && (
                          <span className="ml-auto text-xs text-ring">→ {k.label}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <DetailBlock title="Verbeterideeën">{selectedAuto.verbeterideeën || "—"}</DetailBlock>

            {selectedAuto.mermaidDiagram && (
              <div>
                <p className="label-uppercase mb-1.5">BPMN Diagram</p>
                <div className="mermaid-container">
                  <MermaidDiagram chart={selectedAuto.mermaidDiagram} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label-uppercase mb-0.5">{title}</p>
      <p className="text-sm text-foreground">{children}</p>
    </div>
  );
}
