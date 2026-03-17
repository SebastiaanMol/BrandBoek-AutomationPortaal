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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useAutomatiseringen } from "@/lib/hooks";
import { Automatisering, Systeem, SYSTEMEN } from "@/lib/types";
import { StatusBadge, CategorieBadge, SystemBadge } from "@/components/Badges";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { computeSmartEdges, SmartEdge, countConnections } from "@/lib/smartEdges";
import { X, RotateCcw, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";

// --- System colors ---
const SYSTEM_COLORS: Record<string, string> = {
  HubSpot: "#ff7a59",
  Zapier: "#ff4a00",
  Typeform: "#262627",
  SharePoint: "#038387",
  WeFact: "#2ecc71",
  Docufy: "#8b5cf6",
  Backend: "#0066cc",
  "E-mail": "#10b981",
  API: "#64748b",
  Anders: "#a855f7",
};

const SYSTEM_BG: Record<string, string> = {
  HubSpot: "rgba(255,122,89,0.12)",
  Zapier: "rgba(255,74,0,0.12)",
  Typeform: "rgba(38,38,39,0.08)",
  SharePoint: "rgba(3,131,135,0.12)",
  WeFact: "rgba(46,204,113,0.12)",
  Docufy: "rgba(139,92,246,0.12)",
  Backend: "rgba(0,102,204,0.12)",
  "E-mail": "rgba(16,185,129,0.12)",
  API: "rgba(100,116,139,0.12)",
  Anders: "rgba(168,85,247,0.12)",
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

const SYSTEM_HUB_PREFIX = "sys-hub-";

function getPrimarySystem(auto: Automatisering): string {
  // Determine origin system based on categorie
  switch (auto.categorie) {
    case "HubSpot Workflow": return "HubSpot";
    case "Zapier Zap": return "Zapier";
    case "HubSpot + Zapier": return "HubSpot";
    case "Backend Script": return "Backend";
    default: return auto.systemen[0] || "Anders";
  }
}

/** Get origin systems — used for hub connections (only the source platform) */
function getOriginSystems(auto: Automatisering): string[] {
  switch (auto.categorie) {
    case "HubSpot Workflow": return ["HubSpot"];
    case "Zapier Zap": return ["Zapier"];
    case "HubSpot + Zapier": return ["HubSpot", "Zapier"];
    case "Backend Script": return ["Backend"];
    default: return [auto.systemen[0] || "Anders"];
  }
}

// --- Radial layout with system hubs in center ring ---
function applyRadialLayout(
  nodes: Node[],
  edges: Edge[],
  systemHubIds: string[]
): Node[] {
  if (nodes.length === 0) return nodes;

  const hubSet = new Set(systemHubIds);
  const hubNodes = nodes.filter((n) => hubSet.has(n.id));
  const autoNodes = nodes.filter((n) => !hubSet.has(n.id));

  // Place system hubs in a circle with enough spacing
  const HUB_RADIUS = Math.max(400, hubNodes.length * 80);
  const hubPositions: Record<string, { x: number; y: number }> = {};
  hubNodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / hubNodes.length - Math.PI / 2;
    hubPositions[n.id] = {
      x: Math.cos(angle) * HUB_RADIUS,
      y: Math.sin(angle) * HUB_RADIUS,
    };
  });

  // Group auto nodes by their primary system hub
  const hubToAutos: Record<string, Node[]> = {};
  systemHubIds.forEach((id) => (hubToAutos[id] = []));

  const autoToHubs: Record<string, string[]> = {};
  edges.forEach((e) => {
    if (hubSet.has(e.target) && !hubSet.has(e.source)) {
      if (!autoToHubs[e.source]) autoToHubs[e.source] = [];
      autoToHubs[e.source].push(e.target);
    }
    if (hubSet.has(e.source) && !hubSet.has(e.target)) {
      if (!autoToHubs[e.target]) autoToHubs[e.target] = [];
      autoToHubs[e.target].push(e.source);
    }
  });

  autoNodes.forEach((n) => {
    const hubs = autoToHubs[n.id];
    const primaryHub = hubs?.[0] || systemHubIds[0];
    if (hubToAutos[primaryHub]) {
      hubToAutos[primaryHub].push(n);
    } else if (systemHubIds.length > 0) {
      hubToAutos[systemHubIds[0]].push(n);
    }
  });

  const positions: Record<string, { x: number; y: number }> = {};

  // Hub positions
  hubNodes.forEach((n) => {
    const w = (n.style?.width as number) || 100;
    const h = (n.style?.height as number) || 100;
    positions[n.id] = {
      x: hubPositions[n.id].x - w / 2,
      y: hubPositions[n.id].y - h / 2,
    };
  });

  // Place auto nodes in a grid-like fan around their hub — no overlap
  const NODE_W = 210; // max node width + padding
  const NODE_H = 90;  // max node height + padding

  Object.entries(hubToAutos).forEach(([hubId, autos]) => {
    if (autos.length === 0) return;
    const hubPos = hubPositions[hubId] || { x: 0, y: 0 };
    const hubAngle = Math.atan2(hubPos.y, hubPos.x);

    // Place nodes in rows radiating outward from the hub
    const PER_ROW = Math.max(3, Math.ceil(Math.sqrt(autos.length)));
    const rows = Math.ceil(autos.length / PER_ROW);
    const RADIUS_START = 250;
    const ROW_SPACING = NODE_H + 20;

    autos.forEach((n, i) => {
      const row = Math.floor(i / PER_ROW);
      const col = i % PER_ROW;
      const colsInRow = Math.min(PER_ROW, autos.length - row * PER_ROW);

      // Offset along the tangent direction (perpendicular to hub angle)
      const tangentX = -Math.sin(hubAngle);
      const tangentY = Math.cos(hubAngle);
      const radialX = Math.cos(hubAngle);
      const radialY = Math.sin(hubAngle);

      const radialDist = RADIUS_START + row * ROW_SPACING;
      const tangentOffset = (col - (colsInRow - 1) / 2) * (NODE_W + 10);

      const w = (n.style?.width as number) || 180;
      const h = (n.style?.height as number) || 60;
      positions[n.id] = {
        x: hubPos.x + radialX * radialDist + tangentX * tangentOffset - w / 2,
        y: hubPos.y + radialY * radialDist + tangentY * tangentOffset - h / 2,
      };
    });
  });

  // Collision resolution pass — push apart any overlapping nodes
  const allIds = Object.keys(positions);
  for (let iter = 0; iter < 10; iter++) {
    let moved = false;
    for (let i = 0; i < allIds.length; i++) {
      for (let j = i + 1; j < allIds.length; j++) {
        const a = positions[allIds[i]];
        const b = positions[allIds[j]];
        const aW = hubSet.has(allIds[i]) ? 110 : NODE_W;
        const aH = hubSet.has(allIds[i]) ? 110 : NODE_H;
        const bW = hubSet.has(allIds[j]) ? 110 : NODE_W;
        const bH = hubSet.has(allIds[j]) ? 110 : NODE_H;

        const overlapX = (aW / 2 + bW / 2) - Math.abs((a.x + aW / 2) - (b.x + bW / 2));
        const overlapY = (aH / 2 + bH / 2) - Math.abs((a.y + aH / 2) - (b.y + bH / 2));

        if (overlapX > 0 && overlapY > 0) {
          // Push apart along the axis with least overlap
          const pushX = overlapX < overlapY;
          const dx = (a.x + aW / 2) - (b.x + bW / 2);
          const dy = (a.y + aH / 2) - (b.y + bH / 2);
          const push = pushX ? overlapX / 2 + 5 : overlapY / 2 + 5;

          if (pushX) {
            const dir = dx >= 0 ? 1 : -1;
            a.x += dir * push;
            b.x -= dir * push;
          } else {
            const dir = dy >= 0 ? 1 : -1;
            a.y += dir * push;
            b.y -= dir * push;
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return nodes.map((n) => ({
    ...n,
    position: positions[n.id] || { x: 0, y: 0 },
  }));
}

// --- Hexagon SVG for system hub ---
function HexagonHub({ label, color, count }: { label: string; color: string; count: number }) {
  return (
    <div className="flex flex-col items-center justify-center" style={{ width: 100, height: 100 }}>
      <svg viewBox="0 0 100 100" width="100" height="100">
        <polygon
          points="50,2 93,25 93,75 50,98 7,75 7,25"
          fill={`${color}20`}
          stroke={color}
          strokeWidth="3"
        />
        <text x="50" y="45" textAnchor="middle" fill={color} fontSize="13" fontWeight="700">
          {label}
        </text>
        <text x="50" y="65" textAnchor="middle" fill={color} fontSize="10" opacity="0.7">
          {count} auto.
        </text>
      </svg>
    </div>
  );
}

// --- Build graph ---
function buildGraph(
  automatiseringen: Automatisering[],
  smartEdges: SmartEdge[],
  filters: { systems: Set<string> },
  searchQuery: string,
  highlightId: string | null,
  highlightSystem: string | null,
  showOnlyManual: boolean
): { nodes: Node[]; edges: Edge[]; systemHubIds: string[] } {
  // Collect active origin systems only (not all used systems)
  const activeSystemsRaw = new Set<string>();
  automatiseringen.forEach((a) => getOriginSystems(a).forEach((s) => activeSystemsRaw.add(s)));

  let activeSystems = [...activeSystemsRaw];
  if (filters.systems.size > 0) {
    activeSystems = activeSystems.filter((s) => filters.systems.has(s));
  }

  // Filter automations by origin system
  let filtered = automatiseringen;
  if (filters.systems.size > 0) {
    filtered = filtered.filter((a) => getOriginSystems(a).some((s) => filters.systems.has(s)));
  }
  const filteredIds = new Set(filtered.map((a) => a.id));

  // System hub nodes
  const systemHubIds: string[] = [];
  const systemHubNodes: Node[] = activeSystems.map((sys) => {
    const hubId = `${SYSTEM_HUB_PREFIX}${sys}`;
    systemHubIds.push(hubId);
    const count = filtered.filter((a) => getOriginSystems(a).includes(sys)).length;
    const color = SYSTEM_COLORS[sys] || "#64748b";
    return {
      id: hubId,
      type: "default",
      position: { x: 0, y: 0 },
      data: {
        label: <HexagonHub label={sys} color={color} count={count} />,
      },
      style: {
        background: "transparent",
        border: "none",
        padding: 0,
        width: 100,
        height: 100,
        cursor: "pointer",
      },
    };
  });

  // Automation nodes
  const autoEdges = smartEdges.filter(
    (e) => filteredIds.has(e.sourceId) && filteredIds.has(e.targetId)
  );
  
  const autoNodes: Node[] = filtered.map((a) => {
    const sys = getPrimarySystem(a);
    const color = SYSTEM_COLORS[sys] || "#64748b";
    const conns = countConnections(a.id, autoEdges);
    const baseWidth = 180;
    const width = baseWidth + Math.min(conns * 15, 60);
    const isHighlighted = highlightId === a.id;
    const isSearchMatch = searchQuery && a.naam.toLowerCase().includes(searchQuery.toLowerCase());
    const isDimmed = highlightSystem !== null && !getOriginSystems(a).includes(highlightSystem);

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
            <div className="font-semibold text-xs mt-1 leading-snug truncate" style={{ maxWidth: width - 30 }}>
              {a.naam}
            </div>
            {conns > 0 && (
              <div className="text-[9px] text-muted-foreground mt-0.5 opacity-60">
                {conns} koppeling{conns > 1 ? "en" : ""}
              </div>
            )}
          </div>
        ),
      },
      style: {
        background: SYSTEM_BG[sys] || "rgba(100,116,139,0.08)",
        border: `2px solid ${color}`,
        borderRadius: "10px",
        padding: "10px 14px",
        width,
        cursor: "pointer",
        fontSize: "12px",
        opacity: isDimmed ? 0.2 : 1,
        transition: "opacity 0.3s ease",
        boxShadow:
          isHighlighted || isSearchMatch
            ? `0 0 0 3px ${color}, 0 0 20px ${color}60`
            : `0 1px 4px rgba(0,0,0,0.06)`,
      },
    };
  });

  // Edges: automation→system hub (thin, no label)
  const systemEdges: Edge[] = [];
  filtered.forEach((a) => {
    a.systemen.forEach((sys) => {
      const hubId = `${SYSTEM_HUB_PREFIX}${sys}`;
      if (systemHubIds.includes(hubId)) {
        systemEdges.push({
          id: `sysedge-${a.id}-${sys}`,
          source: a.id,
          target: hubId,
          type: "default",
          style: {
            stroke: SYSTEM_COLORS[sys] || "#64748b",
            strokeWidth: 1.5,
            opacity: highlightSystem === sys ? 0.6 : 0.15,
            transition: "opacity 0.3s ease",
          },
        });
      }
    });
  });

  // Edges: automation↔automation (thick, labeled)
  const autoEdgeElements: Edge[] = autoEdges
    .filter(() => !showOnlyManual || true) // all edges are manual now
    .map((e, idx) => ({
      id: `autoedge-${idx}-${e.sourceId}-${e.targetId}`,
      source: e.sourceId,
      target: e.targetId,
      label: e.label,
      type: "default",
      animated: true,
      className: "react-flow-edge-hover",
      style: {
        stroke: "#6366f1",
        strokeWidth: 3,
        opacity: 0.85,
        filter: "drop-shadow(0 0 4px rgba(99,102,241,0.3))",
        transition: "stroke-width 0.2s, opacity 0.2s, filter 0.2s",
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1", width: 16, height: 12 },
      labelStyle: { fontSize: 10, fontWeight: 700, fill: "#6366f1" },
      labelBgStyle: { fill: "white", fillOpacity: 0.95 },
      labelBgPadding: [8, 4] as [number, number],
      labelBgBorderRadius: 6,
      data: { reason: e.label },
    }));

  const allNodes = [...systemHubNodes, ...autoNodes];
  const allEdges = [...systemEdges, ...autoEdgeElements];

  const layoutNodes = applyRadialLayout(allNodes, allEdges, systemHubIds);
  return { nodes: layoutNodes, edges: allEdges, systemHubIds };
}

// --- Component ---
export default function Mindmap() {
  const navigate = useNavigate();
  const { data: automatiseringen = [], isLoading } = useAutomatiseringen();
  const allSmartEdges = useMemo(() => computeSmartEdges(automatiseringen), [automatiseringen]);

  const [systemFilter, setSystemFilter] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [highlightSystem, setHighlightSystem] = useState<string | null>(null);
  const [selectedAuto, setSelectedAuto] = useState<Automatisering | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ reason: string } | null>(null);
  const [showOnlyManual, setShowOnlyManual] = useState(false);
  const [showFilters, setShowFilters] = useState(true);

  const filters = useMemo(() => ({ systems: systemFilter }), [systemFilter]);

  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => buildGraph(automatiseringen, allSmartEdges, filters, searchQuery, highlightId, highlightSystem, showOnlyManual),
    [automatiseringen, allSmartEdges, filters, searchQuery, highlightId, highlightSystem, showOnlyManual]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(
      automatiseringen, allSmartEdges, filters, searchQuery, highlightId, highlightSystem, showOnlyManual
    );
    setNodes(n);
    setEdges(e);
  }, [filters, automatiseringen, allSmartEdges, searchQuery, highlightId, highlightSystem, showOnlyManual, setNodes, setEdges]);

  const resetLayout = useCallback(() => {
    const { nodes: n, edges: e } = buildGraph(
      automatiseringen, allSmartEdges, filters, searchQuery, highlightId, highlightSystem, showOnlyManual
    );
    setNodes(n);
    setEdges(e);
  }, [automatiseringen, allSmartEdges, filters, searchQuery, highlightId, highlightSystem, showOnlyManual, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // System hub click → highlight
      if (node.id.startsWith(SYSTEM_HUB_PREFIX)) {
        const sys = node.id.replace(SYSTEM_HUB_PREFIX, "");
        setHighlightSystem((prev) => (prev === sys ? null : sys));
        setSelectedAuto(null);
        setSelectedEdge(null);
        return;
      }
      // Automation click → detail panel
      const auto = automatiseringen.find((a) => a.id === node.id);
      if (auto) {
        setSelectedAuto(auto);
        setSelectedEdge(null);
        setHighlightSystem(null);
      }
    },
    [automatiseringen]
  );

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    const data = edge.data as { reason: string } | undefined;
    if (data?.reason) {
      setSelectedEdge({ reason: data.reason });
      setSelectedAuto(null);
    }
  }, []);

  const toggleSystem = (s: string) => {
    setSystemFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  // Connections for selected auto
  const selectedAutoEdges = useMemo(() => {
    if (!selectedAuto) return [];
    return allSmartEdges.filter(
      (e) => e.sourceId === selectedAuto.id || e.targetId === selectedAuto.id
    );
  }, [selectedAuto, allSmartEdges]);

  // Search highlight
  useEffect(() => {
    if (searchQuery.length >= 2) {
      const match = automatiseringen.find((a) =>
        a.naam.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setHighlightId(match?.id || null);
    } else {
      setHighlightId(null);
    }
  }, [searchQuery, automatiseringen]);

  // Collect active systems for filter
  const activeSystems = useMemo(() => {
    const s = new Set<string>();
    automatiseringen.forEach((a) => a.systemen.forEach((sys) => s.add(sys)));
    return [...s];
  }, [automatiseringen]);

  return (
    <div className="h-[calc(100vh-7rem)] w-full relative flex">
      {/* Filter sidebar */}
      {showFilters && (
        <div className="w-60 shrink-0 bg-card border-r border-border overflow-y-auto p-4 space-y-5">
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

          {/* System filter */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Systemen</span>
            <div className="space-y-1 mt-2">
              {activeSystems.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleSystem(s)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    systemFilter.has(s)
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50"
                  }`}
                  style={systemFilter.has(s) ? { background: `${SYSTEM_COLORS[s]}18` } : undefined}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: SYSTEM_COLORS[s] || "#64748b" }}
                  />
                  {s}
                  <span className="ml-auto text-[10px] opacity-60">
                    {automatiseringen.filter((a) => a.systemen.includes(s as Systeem)).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Toggle manual only */}
          <div>
            <button
              onClick={() => setShowOnlyManual(!showOnlyManual)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs transition-colors ${
                showOnlyManual ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/50"
              }`}
            >
              <Filter className="h-3 w-3 shrink-0" />
              Toon alleen handmatige koppelingen
            </button>
          </div>

          {/* Info */}
          <div className="bg-secondary rounded-lg p-3 text-[10px] text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground text-xs">Hoe het werkt</p>
            <p>🔷 <strong>Hexagonen</strong> = systemen. Klik om te highlighten.</p>
            <p>▬ <strong>Nodes</strong> = automatiseringen. Klik voor detail.</p>
            <p>→ <strong>Dikke pijlen</strong> = directe koppelingen met label.</p>
            <p>— <strong>Dunne lijnen</strong> = systeem-verbindingen.</p>
          </div>

          {/* Reset */}
          <button
            onClick={() => {
              setSystemFilter(new Set());
              setSearchQuery("");
              setHighlightSystem(null);
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
              {highlightSystem && (
                <div className="bg-card/90 backdrop-blur border border-border rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: SYSTEM_COLORS[highlightSystem] || "#64748b" }}
                  />
                  <span>{highlightSystem} geselecteerd</span>
                  <button onClick={() => setHighlightSystem(null)} className="hover:opacity-70">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </Panel>

          {/* Stats */}
          <Panel position="top-right">
            <div className="bg-card/90 backdrop-blur border border-border rounded-lg px-4 py-2 shadow-sm space-y-0.5">
              <span className="text-xs text-muted-foreground block">
                {automatiseringen.length} automatiseringen
              </span>
              <span className="text-xs text-muted-foreground block">
                {allSmartEdges.length} directe koppelingen
              </span>
            </div>
          </Panel>
        </ReactFlow>

        {/* Edge tooltip */}
        {selectedEdge && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-lg shadow-lg p-3 max-w-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 rounded-full bg-[#6366f1]" />
              <span className="text-xs font-semibold">Directe koppeling</span>
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

            {/* Connected automations */}
            {selectedAutoEdges.length > 0 && (
              <div>
                <p className="label-uppercase mb-1.5">
                  Directe koppelingen ({selectedAutoEdges.length})
                </p>
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
                        <span className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-[#6366f1]" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-semibold">{otherId}</span>
                            <span className="text-xs text-muted-foreground truncate">
                              {other?.naam}
                            </span>
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
