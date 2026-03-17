import { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
import Dagre from "@dagrejs/dagre";
import { getAutomatiseringen } from "@/lib/storage";
import { Automatisering, Systeem, SYSTEMEN } from "@/lib/types";
import { StatusBadge, CategorieBadge, SystemBadge } from "@/components/Badges";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { computeSmartEdges, SmartEdge, EdgeType, countConnections } from "@/lib/smartEdges";
import { X, RotateCcw, Search, Eye, EyeOff, Link, Zap, Users, Share2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";

// --- Colors ---
const SYSTEM_COLORS: Record<string, string> = {
  HubSpot: "#ff7a59",
  Zapier: "#ff4a00",
  Backend: "#0066cc",
  "E-mail": "#10b981",
  API: "#64748b",
};

const SYSTEM_BG: Record<string, string> = {
  HubSpot: "rgba(255,122,89,0.10)",
  Zapier: "rgba(255,74,0,0.10)",
  Backend: "rgba(0,102,204,0.10)",
  "E-mail": "rgba(16,185,129,0.10)",
  API: "rgba(100,116,139,0.10)",
};

const EDGE_TYPE_COLORS: Record<EdgeType, string> = {
  explicit: "#6366f1",
  shared_system: "#f59e0b",
  trigger_match: "#ec4899",
  shared_owner: "#14b8a6",
};

const EDGE_TYPE_LABELS: Record<EdgeType, string> = {
  explicit: "Expliciet",
  shared_system: "Gedeeld systeem",
  trigger_match: "Trigger match",
  shared_owner: "Zelfde owner",
};

const EDGE_TYPE_ICONS: Record<EdgeType, typeof Link> = {
  explicit: Link,
  shared_system: Share2,
  trigger_match: Zap,
  shared_owner: Users,
};

const CATEGORY_ICONS: Record<string, string> = {
  "HubSpot Workflow": "⚙️",
  "Zapier Zap": "⚡",
  "Backend Script": "💻",
  "HubSpot + Zapier": "🔗",
  Anders: "📦",
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

// --- Radial mindmap layout ---
function applyRadialLayout(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  // Build adjacency from edges
  const adj: Record<string, Set<string>> = {};
  nodes.forEach((n) => (adj[n.id] = new Set()));
  edges.forEach((e) => {
    adj[e.source]?.add(e.target);
    adj[e.target]?.add(e.source);
  });

  // Find the most-connected node as center
  let centerId = nodes[0].id;
  let maxConns = 0;
  nodes.forEach((n) => {
    const c = adj[n.id]?.size || 0;
    if (c > maxConns) {
      maxConns = c;
      centerId = n.id;
    }
  });

  // BFS to assign layers
  const layers: Record<string, number> = { [centerId]: 0 };
  const queue = [centerId];
  const order: string[] = [centerId];
  const visited = new Set([centerId]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of adj[cur] || []) {
      if (!visited.has(nb)) {
        visited.add(nb);
        layers[nb] = (layers[cur] || 0) + 1;
        queue.push(nb);
        order.push(nb);
      }
    }
  }
  // Place disconnected nodes
  nodes.forEach((n) => {
    if (!visited.has(n.id)) {
      visited.add(n.id);
      layers[n.id] = 1;
      order.push(n.id);
    }
  });

  // Group by layer
  const layerGroups: Record<number, string[]> = {};
  let maxLayer = 0;
  order.forEach((id) => {
    const l = layers[id] || 0;
    if (!layerGroups[l]) layerGroups[l] = [];
    layerGroups[l].push(id);
    if (l > maxLayer) maxLayer = l;
  });

  // Position: center at origin, rings outward
  const RING_DISTANCE = 280;
  const positions: Record<string, { x: number; y: number }> = {};

  // Center node
  (layerGroups[0] || []).forEach((id) => {
    positions[id] = { x: 0, y: 0 };
  });

  // Outer rings
  for (let layer = 1; layer <= maxLayer; layer++) {
    const group = layerGroups[layer] || [];
    const radius = layer * RING_DISTANCE;
    const count = group.length;
    // Spread evenly around the circle with slight offset per layer
    const offsetAngle = layer * 0.3;
    group.forEach((id, i) => {
      const angle = offsetAngle + (2 * Math.PI * i) / count;
      positions[id] = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    });
  }

  return nodes.map((n) => {
    const w = (n.style?.width as number) || 200;
    const h = (n.style?.height as number) || 70;
    const pos = positions[n.id] || { x: 0, y: 0 };
    return { ...n, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });
}

// --- Build graph ---
function buildGraph(
  automatiseringen: Automatisering[],
  smartEdges: SmartEdge[],
  filters: { systems: Set<string>; owners: Set<string>; categories: Set<string>; edgeTypes: Set<EdgeType> },
  searchQuery: string,
  highlightId: string | null
): { nodes: Node[]; edges: Edge[] } {
  // Filter automations
  let filtered = automatiseringen;
  if (filters.systems.size > 0) {
    filtered = filtered.filter((a) => a.systemen.some((s) => filters.systems.has(s)));
  }
  if (filters.owners.size > 0) {
    filtered = filtered.filter((a) => filters.owners.has(a.owner));
  }
  if (filters.categories.size > 0) {
    filtered = filtered.filter((a) => filters.categories.has(a.categorie));
  }
  const filteredIds = new Set(filtered.map((a) => a.id));

  // Filter edges
  const visibleEdges = smartEdges.filter(
    (e) =>
      filteredIds.has(e.sourceId) &&
      filteredIds.has(e.targetId) &&
      filters.edgeTypes.has(e.type)
  );

  // Build nodes
  const nodes: Node[] = filtered.map((a) => {
    const sys = getPrimarySystem(a);
    const color = SYSTEM_COLORS[sys] || "#64748b";
    const conns = countConnections(a.id, visibleEdges);
    const width = 200;
    const isHighlighted = highlightId === a.id;
    const isSearchMatch = searchQuery && a.naam.toLowerCase().includes(searchQuery.toLowerCase());

    return {
      id: a.id,
      type: "default",
      position: { x: 0, y: 0 },
      data: {
        label: (
          <div className="text-left leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono opacity-60">{a.id}</span>
              <span>{CATEGORY_ICONS[a.categorie] || "📦"}</span>
              <span>{STATUS_ICON[a.status] || ""}</span>
            </div>
            <div className="font-semibold text-xs mt-1 leading-snug truncate" style={{ maxWidth: 160 }}>
              {a.naam}
            </div>
            {conns > 0 && (
              <div className="text-[9px] text-muted-foreground mt-0.5 opacity-60">{conns} verbinding{conns > 1 ? "en" : ""}</div>
            )}
          </div>
        ),
      },
      style: {
        background: SYSTEM_BG[sys],
        border: `2px solid ${color}`,
        borderRadius: "10px",
        padding: "10px 14px",
        width,
        cursor: "pointer",
        fontSize: "12px",
        boxShadow: isHighlighted || isSearchMatch
          ? `0 0 0 3px ${color}, 0 0 20px ${color}60`
          : `0 1px 4px rgba(0,0,0,0.05)`,
      },
    };
  });

  // Build edges
  const edges: Edge[] = visibleEdges.map((e, idx) => {
    const color = EDGE_TYPE_COLORS[e.type];
    const isExplicit = e.type === "explicit";
    return {
      id: `edge-${idx}-${e.sourceId}-${e.targetId}`,
      source: e.sourceId,
      target: e.targetId,
      label: isExplicit ? e.label : undefined,
      type: "smoothstep",
      animated: isExplicit,
      style: {
        stroke: color,
        strokeWidth: isExplicit ? 2 : 1,
        opacity: isExplicit ? 0.9 : 0.35,
        strokeDasharray: isExplicit ? undefined : "6 3",
      },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 10 },
      labelStyle: { fontSize: 9, fontWeight: 600, fill: "#374151" },
      labelBgStyle: { fill: "white", fillOpacity: 0.95 },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
      data: { edgeType: e.type, reason: e.label },
    };
  });

  // Apply dagre layout
  const layoutNodes = applyDagreLayout(nodes, edges);
  return { nodes: layoutNodes, edges };
}

// --- Component ---
export default function Mindmap() {
  const navigate = useNavigate();
  const automatiseringen = useMemo(() => getAutomatiseringen(), []);
  const allSmartEdges = useMemo(() => computeSmartEdges(automatiseringen), [automatiseringen]);

  // Unique owners and categories
  const allOwners = useMemo(() => [...new Set(automatiseringen.map((a) => a.owner).filter(Boolean))], [automatiseringen]);
  const allCategories = useMemo(() => [...new Set(automatiseringen.map((a) => a.categorie))], [automatiseringen]);

  const [systemFilter, setSystemFilter] = useState<Set<string>>(new Set());
  const [ownerFilter, setOwnerFilter] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [edgeTypeFilter, setEdgeTypeFilter] = useState<Set<EdgeType>>(
    new Set(["explicit"])
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [selectedAuto, setSelectedAuto] = useState<Automatisering | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ type: EdgeType; reason: string } | null>(null);
  const [showFilters, setShowFilters] = useState(true);

  const filters = useMemo(
    () => ({ systems: systemFilter, owners: ownerFilter, categories: categoryFilter, edgeTypes: edgeTypeFilter }),
    [systemFilter, ownerFilter, categoryFilter, edgeTypeFilter]
  );

  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => buildGraph(automatiseringen, allSmartEdges, filters, searchQuery, highlightId),
    [automatiseringen, allSmartEdges, filters, searchQuery, highlightId]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(automatiseringen, allSmartEdges, filters, searchQuery, highlightId);
    setNodes(n);
    setEdges(e);
  }, [filters, automatiseringen, allSmartEdges, searchQuery, highlightId, setNodes, setEdges]);

  const resetLayout = useCallback(() => {
    const { nodes: n, edges: e } = buildGraph(automatiseringen, allSmartEdges, filters, searchQuery, highlightId);
    setNodes(n);
    setEdges(e);
  }, [automatiseringen, allSmartEdges, filters, searchQuery, highlightId, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const auto = automatiseringen.find((a) => a.id === node.id);
      if (auto) {
        setSelectedAuto(auto);
        setSelectedEdge(null);
      }
    },
    [automatiseringen]
  );

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    const data = edge.data as { edgeType: EdgeType; reason: string } | undefined;
    if (data) {
      setSelectedEdge({ type: data.edgeType, reason: data.reason });
      setSelectedAuto(null);
    }
  }, []);

  const toggleSet = <T,>(set: Set<T>, value: T, setter: React.Dispatch<React.SetStateAction<Set<T>>>) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  // Connections for selected auto
  const selectedAutoEdges = useMemo(() => {
    if (!selectedAuto) return [];
    return allSmartEdges.filter(
      (e) =>
        (e.sourceId === selectedAuto.id || e.targetId === selectedAuto.id) &&
        edgeTypeFilter.has(e.type)
    );
  }, [selectedAuto, allSmartEdges, edgeTypeFilter]);

  // Search highlight
  useEffect(() => {
    if (searchQuery.length >= 2) {
      const match = automatiseringen.find((a) => a.naam.toLowerCase().includes(searchQuery.toLowerCase()));
      setHighlightId(match?.id || null);
    } else {
      setHighlightId(null);
    }
  }, [searchQuery, automatiseringen]);

  // Edge type stats
  const edgeStats = useMemo(() => {
    const stats: Record<EdgeType, number> = { explicit: 0, shared_system: 0, trigger_match: 0, shared_owner: 0 };
    allSmartEdges.forEach((e) => stats[e.type]++);
    return stats;
  }, [allSmartEdges]);

  return (
    <div className="h-[calc(100vh-7rem)] w-full relative flex">
      {/* Filter sidebar */}
      {showFilters && (
        <div className="w-64 shrink-0 bg-card border-r border-border overflow-y-auto p-4 space-y-5">
          {/* Search */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zoeken</span>
            </div>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Zoek automatisering..."
              className="h-8 text-xs"
            />
          </div>

          {/* Edge type toggles */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Koppelingen</span>
            <div className="space-y-1.5 mt-2">
              {(Object.keys(EDGE_TYPE_COLORS) as EdgeType[]).map((type) => {
                const Icon = EDGE_TYPE_ICONS[type];
                const active = edgeTypeFilter.has(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleSet(edgeTypeFilter, type, setEdgeTypeFilter)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                      active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: EDGE_TYPE_COLORS[type], opacity: active ? 1 : 0.3 }} />
                    <Icon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{EDGE_TYPE_LABELS[type]}</span>
                    <span className="ml-auto text-[10px] opacity-60">{edgeStats[type]}</span>
                    {active ? <Eye className="h-3 w-3 shrink-0 opacity-50" /> : <EyeOff className="h-3 w-3 shrink-0 opacity-30" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* System filter */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Systemen</span>
            <div className="space-y-1 mt-2">
              {SYSTEMEN.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleSet(systemFilter, s, setSystemFilter)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    systemFilter.has(s) ? "font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/50"
                  }`}
                  style={systemFilter.has(s) ? { background: `${SYSTEM_COLORS[s]}18` } : undefined}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SYSTEM_COLORS[s] }} />
                  {s}
                  <span className="ml-auto text-[10px] opacity-60">
                    {automatiseringen.filter((a) => a.systemen.includes(s as Systeem)).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Category filter */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Categorieën</span>
            <div className="space-y-1 mt-2">
              {allCategories.map((c) => (
                <button
                  key={c}
                  onClick={() => toggleSet(categoryFilter, c, setCategoryFilter)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    categoryFilter.has(c) ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/50"
                  }`}
                >
                  <span>{CATEGORY_ICONS[c] || "📦"}</span>
                  <span className="truncate">{c}</span>
                  <span className="ml-auto text-[10px] opacity-60">
                    {automatiseringen.filter((a) => a.categorie === c).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Owner filter */}
          {allOwners.length > 0 && (
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Owners</span>
              <div className="space-y-1 mt-2">
                {allOwners.map((o) => (
                  <button
                    key={o}
                    onClick={() => toggleSet(ownerFilter, o, setOwnerFilter)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                      ownerFilter.has(o) ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <Users className="h-3 w-3 shrink-0" />
                    <span className="truncate">{o}</span>
                    <span className="ml-auto text-[10px] opacity-60">
                      {automatiseringen.filter((a) => a.owner === o).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reset all */}
          <button
            onClick={() => {
              setSystemFilter(new Set());
              setOwnerFilter(new Set());
              setCategoryFilter(new Set());
              setEdgeTypeFilter(new Set(["explicit", "shared_system", "trigger_match", "shared_owner"]));
              setSearchQuery("");
            }}
            className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 hover:underline"
          >
            Reset alle filters
          </button>
        </div>
      )}

      {/* Graph area */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.1}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(214, 32%, 91%)" />
          <Controls position="bottom-left" />
          <MiniMap
            position="bottom-right"
            nodeStrokeWidth={3}
            pannable
            zoomable
            style={{ borderRadius: "8px", border: "1px solid hsl(214, 32%, 91%)" }}
          />

          {/* Top bar */}
          <Panel position="top-left">
            <div className="flex gap-2 items-center">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="bg-card/90 backdrop-blur border border-border rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shadow-sm"
              >
                {showFilters ? "◀ Verberg filters" : "▶ Toon filters"}
              </button>
              <button
                onClick={resetLayout}
                className="bg-card/90 backdrop-blur border border-border rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shadow-sm flex items-center gap-1.5"
              >
                <RotateCcw className="h-3 w-3" />
                Reset layout
              </button>
            </div>
          </Panel>

          {/* Stats */}
          <Panel position="top-right">
            <div className="bg-card/90 backdrop-blur border border-border rounded-lg px-4 py-2 shadow-sm space-y-0.5">
              <span className="text-xs text-muted-foreground block">
                {automatiseringen.length} automatiseringen
              </span>
              <span className="text-xs text-muted-foreground block">
                {allSmartEdges.length} koppelingen ({edgeStats.explicit} expliciet)
              </span>
            </div>
          </Panel>
        </ReactFlow>

        {/* Edge tooltip */}
        {selectedEdge && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-lg shadow-lg p-3 max-w-xs">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 rounded-full" style={{ background: EDGE_TYPE_COLORS[selectedEdge.type] }} />
              <span className="text-xs font-semibold">{EDGE_TYPE_LABELS[selectedEdge.type]}</span>
              <button onClick={() => setSelectedEdge(null)} className="ml-auto p-0.5 hover:bg-secondary rounded">
                <X className="h-3 w-3" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{selectedEdge.reason}</p>
          </div>
        )}
      </div>

      {/* Detail sidebar */}
      {selectedAuto && (
        <div className="w-96 shrink-0 bg-card border-l border-border overflow-y-auto">
          <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between z-10">
            <div>
              <p className="font-mono text-xs text-muted-foreground">{selectedAuto.id}</p>
              <h2 className="font-bold text-foreground">{selectedAuto.naam}</h2>
            </div>
            <button onClick={() => setSelectedAuto(null)} className="p-1.5 rounded-md hover:bg-secondary transition-colors">
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

            {/* Connected automations with reasons */}
            {selectedAutoEdges.length > 0 && (
              <div>
                <p className="label-uppercase mb-1.5">Verbonden automatiseringen ({selectedAutoEdges.length})</p>
                <div className="space-y-1.5">
                  {selectedAutoEdges.map((e, i) => {
                    const otherId = e.sourceId === selectedAuto.id ? e.targetId : e.sourceId;
                    const other = automatiseringen.find((a) => a.id === otherId);
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-sm bg-secondary rounded-lg p-2.5 cursor-pointer hover:bg-accent transition-colors"
                        onClick={() => {
                          if (other) setSelectedAuto(other);
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                          style={{ background: EDGE_TYPE_COLORS[e.type] }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-semibold">{otherId}</span>
                            <span className="text-xs text-muted-foreground truncate">{other?.naam}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">{e.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <DetailBlock title="Verbeterideeën">{selectedAuto.verbeterideeën || "—"}</DetailBlock>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              {selectedAuto.mermaidDiagram && (
                <button
                  onClick={() => navigate(`/bpmn?id=${selectedAuto.id}`)}
                  className="flex-1 bg-secondary text-foreground px-3 py-2 rounded-lg text-xs font-medium hover:bg-accent transition-colors"
                >
                  Bekijk BPMN diagram
                </button>
              )}
              <button
                onClick={() => navigate(`/nieuw`)}
                className="flex-1 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
              >
                Bewerk automatisering
              </button>
            </div>

            {/* BPMN preview */}
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
