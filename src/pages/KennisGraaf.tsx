import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  ReactFlowProvider,
  Edge,
  MarkerType,
  MiniMap,
  Node,
  NodeProps,
  Panel,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import * as dagre from "@dagrejs/dagre"
import {
  AlertTriangle,
  ChevronRight,
  Filter,
  GitFork,
  Network,
  Search,
  Share2,
  Shuffle,
  Sigma,
  X,
  Zap,
} from "lucide-react"
import { useAutomatiseringen } from "@/lib/hooks"
import { Automatisering, berekenComplexiteit, berekenImpact, KlantFase, Systeem } from "@/lib/types"
import { buildEdgeList, cascadeImpact, degreeCentrality, findOrphans, shortestPath } from "@/lib/graphAnalysis"
import { runForceLayout, seedNodes } from "@/lib/forceLayout"


// ─── constants ───────────────────────────────────────────────────────────────

const SYSTEM_COLORS: Record<string, string> = {
  HubSpot: "#ff7a59",
  Zapier: "#65A30D",
  Typeform: "#262627",
  SharePoint: "#038387",
  WeFact: "#2ecc71",
  Docufy: "#8b5cf6",
  Backend: "#0066cc",
  "E-mail": "#10b981",
  API: "#64748b",
  Anders: "#a855f7",
}

const STATUS_COLORS: Record<string, string> = {
  Actief: "#22c55e",
  Verouderd: "#f59e0b",
  "In review": "#3b82f6",
  Uitgeschakeld: "#ef4444",
}

const PHASE_COLORS: Record<string, string> = {
  Marketing: "#6366f1",
  Sales: "#f43f5e",
  Onboarding: "#0ea5e9",
  Boekhouding: "#f97316",
  Offboarding: "#8b5cf6",
}

const NODE_W = 200
const NODE_H = 70
const SYS_SIZE = 90
const PHASE_SIZE = 80

type LayoutMode = "force" | "dagre" | "cluster-system" | "cluster-fase"
type AnalysisMode = "none" | "cascade" | "centrality" | "orphans" | "path"

// ─── custom node: Automation ─────────────────────────────────────────────────

function AutomationNode({ data }: NodeProps) {
  const d = data as {
    label: string
    id: string
    status: string
    category: string
    systems: string[]
    centralityScore: number
    isHighlighted: boolean
    isDimmed: boolean
    isOrphan: boolean
    isPathNode: boolean
    impactScore: number
  }

  const borderColor = STATUS_COLORS[d.status] ?? "#6366f1"
  const opacity = d.isDimmed ? 0.2 : 1
  const ring = d.isPathNode
    ? "0 0 0 3px #facc15"
    : d.isHighlighted
    ? `0 0 0 3px ${borderColor}`
    : "none"

  const sizeBoost = 0 // kept uniform; size variation via width prop
  return (
    <div
      style={{
        opacity,
        boxShadow: ring,
        border: `2px solid ${borderColor}`,
        background: d.isDimmed ? "#1a1a2e" : "#0f0f1a",
        borderRadius: 10,
        width: NODE_W,
        minHeight: NODE_H,
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        transition: "opacity 0.2s, box-shadow 0.2s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{d.id}</span>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: borderColor,
          }}
        />
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", lineHeight: 1.3, wordBreak: "break-word" }}>
        {d.label}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
        {d.systems.slice(0, 2).map(s => (
          <span
            key={s}
            style={{
              fontSize: 9,
              background: SYSTEM_COLORS[s] ? `${SYSTEM_COLORS[s]}33` : "#33334d",
              color: SYSTEM_COLORS[s] ?? "#94a3b8",
              border: `1px solid ${SYSTEM_COLORS[s] ?? "#334155"}`,
              borderRadius: 4,
              padding: "1px 5px",
              fontWeight: 600,
            }}
          >
            {s}
          </span>
        ))}
        {d.systems.length > 2 && (
          <span style={{ fontSize: 9, color: "#64748b" }}>+{d.systems.length - 2}</span>
        )}
        {d.isOrphan && (
          <span style={{ fontSize: 9, color: "#f97316", background: "#f9731622", border: "1px solid #f97316", borderRadius: 4, padding: "1px 5px" }}>
            orphan
          </span>
        )}
      </div>
      {d.centralityScore > 0 && (
        <div style={{ height: 2, background: "#1e293b", borderRadius: 2, marginTop: 2 }}>
          <div
            style={{
              height: 2,
              width: `${d.centralityScore * 100}%`,
              background: `linear-gradient(90deg, #6366f1, #a78bfa)`,
              borderRadius: 2,
            }}
          />
        </div>
      )}
    </div>
  )
}

// ─── custom node: System ──────────────────────────────────────────────────────

function SystemNode({ data }: NodeProps) {
  const d = data as { label: string; color: string; count: number; isDimmed: boolean }
  return (
    <div
      style={{
        opacity: d.isDimmed ? 0.2 : 1,
        width: SYS_SIZE,
        height: SYS_SIZE,
        borderRadius: "50%",
        background: `${d.color}22`,
        border: `3px solid ${d.color}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        transition: "opacity 0.2s",
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 800, color: d.color }}>{d.label}</span>
      <span style={{ fontSize: 10, color: "#64748b" }}>{d.count} automations</span>
    </div>
  )
}

// ─── custom node: Phase ───────────────────────────────────────────────────────

function PhaseNode({ data }: NodeProps) {
  const d = data as { label: string; color: string; count: number; isDimmed: boolean }
  const c = d.color
  return (
    <div
      style={{
        opacity: d.isDimmed ? 0.2 : 1,
        width: PHASE_SIZE,
        height: PHASE_SIZE,
        borderRadius: 8,
        background: `${c}22`,
        border: `3px solid ${c}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        transform: "rotate(45deg)",
        transition: "opacity 0.2s",
      }}
    >
      <div style={{ transform: "rotate(-45deg)", textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: c }}>{d.label}</div>
        <div style={{ fontSize: 9, color: "#64748b" }}>{d.count}</div>
      </div>
    </div>
  )
}

const nodeTypes = {
  automation: AutomationNode,
  system: SystemNode,
  phase: PhaseNode,
}

// ─── dagre layout ─────────────────────────────────────────────────────────────

function applyDagre(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "LR"
): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 120 })

  for (const n of nodes) {
    const w = n.type === "system" ? SYS_SIZE : n.type === "phase" ? PHASE_SIZE : NODE_W
    const h = n.type === "automation" ? NODE_H : n.type === "system" ? SYS_SIZE : PHASE_SIZE
    g.setNode(n.id, { width: w, height: h })
  }
  for (const e of edges) g.setEdge(e.source, e.target)

  dagre.layout(g)

  return nodes.map(n => {
    const pos = g.node(n.id)
    if (!pos) return n
    const w = n.type === "system" ? SYS_SIZE : n.type === "phase" ? PHASE_SIZE : NODE_W
    const h = n.type === "automation" ? NODE_H : n.type === "system" ? SYS_SIZE : PHASE_SIZE
    return { ...n, position: { x: pos.x - w / 2, y: pos.y - h / 2 } }
  })
}

// ─── main component ───────────────────────────────────────────────────────────

function KennisGraafInner() {
  const { data: rawData = [], isLoading } = useAutomatiseringen()
  const automations: Automatisering[] = rawData as Automatisering[]

  // ── UI state ────────────────────────────────────────────────────────────────
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("force")
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("none")
  const [showSystems, setShowSystems] = useState(true)
  const [showPhases, setShowPhases] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  const [filterSystem, setFilterSystem] = useState<string[]>([])
  const [filterFase, setFilterFase] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pathTarget, setPathTarget] = useState<string | null>(null)
  const [pathSource, setPathSource] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(true)
  const [showDetail, setShowDetail] = useState(false)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const { fitView } = useReactFlow()

  // ── analysis data ────────────────────────────────────────────────────────────
  const centrality = useMemo(() => degreeCentrality(automations), [automations])
  const orphans = useMemo(() => findOrphans(automations), [automations])
  const edgeList = useMemo(() => buildEdgeList(automations), [automations])

  const cascadeSet = useMemo(() => {
    if (analysisMode === "cascade" && selectedId) return cascadeImpact(selectedId, automations)
    return null
  }, [analysisMode, selectedId, automations])

  const pathSet = useMemo(() => {
    if (analysisMode === "path" && pathSource && pathTarget) {
      const p = shortestPath(pathSource, pathTarget, automations)
      return new Set(p)
    }
    return null
  }, [analysisMode, pathSource, pathTarget, automations])

  // ── filtered automations ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = automations
    if (filterStatus.length) list = list.filter(a => filterStatus.includes(a.status))
    if (filterSystem.length) list = list.filter(a => a.systemen?.some(s => filterSystem.includes(s)))
    if (filterFase.length) list = list.filter(a => a.fasen?.some(f => filterFase.includes(f)))
    if (searchQuery.length >= 2)
      list = list.filter(
        a =>
          a.naam.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    return list
  }, [automations, filterStatus, filterSystem, filterFase, searchQuery])

  const filteredIds = useMemo(() => new Set(filtered.map(a => a.id)), [filtered])

  // ── build graph ──────────────────────────────────────────────────────────────
  const buildGraph = useCallback(() => {
    if (automations.length === 0) return

    const W = 2400, H = 1800

    // Automation nodes
    const forceNodes = seedNodes(filtered.map(a => a.id), W, H)
    const forceEdges = edgeList
      .filter(e => filteredIds.has(e.source) && filteredIds.has(e.target))
      .map(e => ({ source: e.source, target: e.target, strength: 2 }))

    // System linkage edges for force
    if (showSystems) {
      for (const a of filtered) {
        for (const s of (a.systemen ?? [])) {
          forceEdges.push({ source: a.id, target: `sys_${s}`, strength: 0.5 })
        }
      }
    }
    if (showPhases) {
      for (const a of filtered) {
        for (const f of (a.fasen ?? [])) {
          forceEdges.push({ source: a.id, target: `phase_${f}`, strength: 0.5 })
        }
      }
    }

    // System / phase meta-nodes
    const sysIds = showSystems
      ? [...new Set(filtered.flatMap(a => a.systemen ?? []))]
      : []
    const phaseIds = showPhases
      ? [...new Set(filtered.flatMap(a => a.fasen ?? []))]
      : []

    for (const s of sysIds) {
      forceNodes.push({
        id: `sys_${s}`, x: (Math.random() - 0.5) * W * 0.6,
        y: (Math.random() - 0.5) * H * 0.6, vx: 0, vy: 0, mass: 3,
      })
    }
    for (const f of phaseIds) {
      forceNodes.push({
        id: `phase_${f}`, x: (Math.random() - 0.5) * W * 0.6,
        y: (Math.random() - 0.5) * H * 0.6, vx: 0, vy: 0, mass: 3,
      })
    }

    // Run force layout
    const positions = layoutMode === "force" || layoutMode === "cluster-system" || layoutMode === "cluster-fase"
      ? runForceLayout(forceNodes, forceEdges, W, H, 300)
      : new Map(forceNodes.map(n => [n.id, { x: n.x, y: n.y }]))

    // Build ReactFlow nodes
    const rfNodes: Node[] = filtered.map(a => {
      const pos = positions.get(a.id) ?? { x: 0, y: 0 }
      const c = centrality.get(a.id) ?? 0
      const isDimmed =
        (analysisMode === "cascade" && cascadeSet && !cascadeSet.has(a.id)) ||
        (analysisMode === "orphans" && !orphans.has(a.id)) ||
        (analysisMode === "centrality" && c < 0.05) ||
        (analysisMode === "path" && pathSet && !pathSet.has(a.id)) ||
        false

      return {
        id: a.id,
        type: "automation",
        position: pos,
        data: {
          label: a.naam,
          id: a.id,
          status: a.status,
          category: a.categorie,
          systems: a.systemen ?? [],
          centralityScore: analysisMode === "centrality" ? c : 0,
          isHighlighted: a.id === selectedId,
          isDimmed,
          isOrphan: analysisMode === "orphans" && orphans.has(a.id),
          isPathNode: analysisMode === "path" && pathSet ? pathSet.has(a.id) : false,
          impactScore: berekenImpact(a, automations),
        },
      }
    })

    // System nodes
    for (const s of sysIds) {
      const pos = positions.get(`sys_${s}`) ?? { x: 0, y: 0 }
      const count = filtered.filter(a => a.systemen?.includes(s as Systeem)).length
      rfNodes.push({
        id: `sys_${s}`,
        type: "system",
        position: pos,
        data: { label: s, color: SYSTEM_COLORS[s] ?? "#64748b", count, isDimmed: false },
      })
    }

    // Phase nodes
    for (const f of phaseIds) {
      const pos = positions.get(`phase_${f}`) ?? { x: 0, y: 0 }
      const count = filtered.filter(a => a.fasen?.includes(f as KlantFase)).length
      rfNodes.push({
        id: `phase_${f}`,
        type: "phase",
        position: pos,
        data: { label: f, color: PHASE_COLORS[f] ?? "#6366f1", count, isDimmed: false },
      })
    }

    // Build ReactFlow edges
    const rfEdges: Edge[] = edgeList
      .filter(e => filteredIds.has(e.source) && filteredIds.has(e.target))
      .map(e => ({
        id: `e_${e.source}_${e.target}`,
        source: e.source,
        target: e.target,
        label: e.label,
        type: "smoothstep",
        animated: analysisMode === "cascade" && cascadeSet?.has(e.source) && cascadeSet?.has(e.target),
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" },
        style: {
          stroke:
            analysisMode === "path" && pathSet?.has(e.source) && pathSet?.has(e.target)
              ? "#facc15"
              : "#6366f1",
          strokeWidth:
            analysisMode === "path" && pathSet?.has(e.source) && pathSet?.has(e.target) ? 4 : 2,
          opacity:
            (analysisMode === "cascade" && cascadeSet && !(cascadeSet.has(e.source) && cascadeSet.has(e.target)))
              ? 0.1
              : 1,
        },
        labelStyle: { fill: "#94a3b8", fontSize: 10 },
        labelBgStyle: { fill: "#0f172a", fillOpacity: 0.8 },
      }))

    // System edges
    if (showSystems) {
      for (const a of filtered) {
        for (const s of (a.systemen ?? [])) {
          rfEdges.push({
            id: `sys_${a.id}_${s}`,
            source: a.id,
            target: `sys_${s}`,
            type: "straight",
            style: { stroke: `${SYSTEM_COLORS[s] ?? "#64748b"}66`, strokeWidth: 1, strokeDasharray: "4 3" },
          })
        }
      }
    }

    // Phase edges
    if (showPhases) {
      for (const a of filtered) {
        for (const f of (a.fasen ?? [])) {
          rfEdges.push({
            id: `phase_${a.id}_${f}`,
            source: a.id,
            target: `phase_${f}`,
            type: "straight",
            style: { stroke: `${PHASE_COLORS[f] ?? "#6366f1"}66`, strokeWidth: 1, strokeDasharray: "4 3" },
          })
        }
      }
    }

    // Apply dagre if needed
    let finalNodes = rfNodes
    if (layoutMode === "dagre") {
      finalNodes = applyDagre(rfNodes, rfEdges.filter(e => !e.id.startsWith("sys_") && !e.id.startsWith("phase_")))
    }

    setNodes(finalNodes)
    setEdges(rfEdges)
    setTimeout(() => fitView({ padding: 0.15, duration: 600 }), 50)
  }, [filtered, filteredIds, edgeList, layoutMode, showSystems, showPhases, analysisMode, cascadeSet, pathSet, orphans, centrality, selectedId, automations, setNodes, setEdges, fitView])

  useEffect(() => { buildGraph() }, [buildGraph])

  // ── selected automation detail ────────────────────────────────────────────
  const selectedAuto = useMemo(
    () => automations.find(a => a.id === selectedId),
    [selectedId, automations]
  )

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    if (node.type !== "automation") return
    const id = node.id
    setSelectedId(id)
    setShowDetail(true)

    if (analysisMode === "path") {
      if (!pathSource) {
        setPathSource(id)
      } else if (!pathTarget && id !== pathSource) {
        setPathTarget(id)
      } else {
        setPathSource(id)
        setPathTarget(null)
      }
    }
  }, [analysisMode, pathSource])

  // Stats
  const stats = useMemo(() => ({
    total: filtered.length,
    connections: edgeList.filter(e => filteredIds.has(e.source) && filteredIds.has(e.target)).length,
    orphanCount: [...orphans].filter(id => filteredIds.has(id)).length,
    topNode: [...centrality.entries()]
      .filter(([id]) => filteredIds.has(id))
      .sort((a, b) => b[1] - a[1])[0],
  }), [filtered, edgeList, filteredIds, orphans, centrality])

  if (isLoading) {
    return (
      <div style={{ width: "100%", height: "calc(100vh - 48px)", background: "#080812", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 14 }}>
        Kennisgraaf laden…
      </div>
    )
  }

  return (
    <div style={{ width: "100%", height: "calc(100vh - 48px)", background: "#080812", position: "relative", overflow: "hidden" }}>
      <style>{`.react-flow { background: #080812 !important; } .react-flow__renderer { background: #080812 !important; }`}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.05}
        maxZoom={3}
        style={{ background: "#080812", width: "100%", height: "100%" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e293b" />
        <Controls style={{ bottom: 16, left: 16 }} />
        <MiniMap
          style={{ background: "#0f172a", border: "1px solid #1e293b" }}
          nodeColor={n => {
            if (n.type === "system") return (n.data as { color: string }).color
            if (n.type === "phase") return (n.data as { color: string }).color
            return STATUS_COLORS[(n.data as { status: string }).status] ?? "#6366f1"
          }}
          maskColor="#08081288"
        />

        {/* ── top bar ── */}
        <Panel position="top-center">
          <div style={{
            background: "#0f172aee",
            border: "1px solid #1e293b",
            borderRadius: 10,
            padding: "8px 16px",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}>
            <Network size={16} color="#6366f1" />
            <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14 }}>Kennisgraaf</span>
            <span style={{ color: "#475569", fontSize: 12 }}>
              {stats.total} automations · {stats.connections} koppelingen
            </span>
          </div>
        </Panel>

        {/* ── layout + analysis toolbar ── */}
        <Panel position="top-right">
          <div style={{
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 10,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minWidth: 200,
          }}>
            {/* Layout */}
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Layout</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {([
                  { id: "force", icon: <Shuffle size={11} />, label: "Force" },
                  { id: "dagre", icon: <GitFork size={11} />, label: "Hiërarchisch" },
                ] as { id: LayoutMode; icon: React.ReactNode; label: string }[]).map(l => (
                  <button
                    key={l.id}
                    onClick={() => setLayoutMode(l.id)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      border: `1px solid ${layoutMode === l.id ? "#6366f1" : "#1e293b"}`,
                      background: layoutMode === l.id ? "#6366f133" : "transparent",
                      color: layoutMode === l.id ? "#a78bfa" : "#64748b",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {l.icon}{l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Show layers */}
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Lagen</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[
                  { key: "systems", label: "Systemen", val: showSystems, set: setShowSystems },
                  { key: "phases", label: "Fasen", val: showPhases, set: setShowPhases },
                ].map(item => (
                  <button
                    key={item.key}
                    onClick={() => item.set(!item.val)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      border: `1px solid ${item.val ? "#0ea5e9" : "#1e293b"}`,
                      background: item.val ? "#0ea5e933" : "transparent",
                      color: item.val ? "#38bdf8" : "#64748b",
                      cursor: "pointer",
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Analysis */}
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Analyse</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {([
                  { id: "none", label: "Uit" },
                  { id: "centrality", icon: <Sigma size={11} />, label: "Centraliteit" },
                  { id: "cascade", icon: <Zap size={11} />, label: "Cascade" },
                  { id: "orphans", icon: <AlertTriangle size={11} />, label: "Orphans" },
                  { id: "path", icon: <Share2 size={11} />, label: "Pad" },
                ] as { id: AnalysisMode; icon?: React.ReactNode; label: string }[]).map(a => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setAnalysisMode(a.id)
                      if (a.id !== "cascade") setSelectedId(null)
                      if (a.id !== "path") { setPathSource(null); setPathTarget(null) }
                    }}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      border: `1px solid ${analysisMode === a.id ? "#f43f5e" : "#1e293b"}`,
                      background: analysisMode === a.id ? "#f43f5e22" : "transparent",
                      color: analysisMode === a.id ? "#fb7185" : "#64748b",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {a.icon}{a.label}
                  </button>
                ))}
              </div>

              {analysisMode === "cascade" && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>
                  {selectedId
                    ? `Cascade van ${selectedId} → ${(cascadeSet?.size ?? 1) - 1} geraakt`
                    : "Klik een node om cascade te zien"}
                </div>
              )}

              {analysisMode === "path" && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>
                  {!pathSource
                    ? "Klik startnode"
                    : !pathTarget
                    ? `Start: ${pathSource} — klik doel`
                    : pathSet && pathSet.size > 1
                    ? `Pad: ${[...pathSet].join(" → ")}`
                    : "Geen pad gevonden"}
                </div>
              )}

              {analysisMode === "orphans" && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#f97316" }}>
                  {stats.orphanCount} automations zonder koppelingen
                </div>
              )}
            </div>

            {/* Stats */}
            {stats.topNode && (
              <div style={{ borderTop: "1px solid #1e293b", paddingTop: 8 }}>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Meest verbonden</div>
                <div style={{ fontSize: 11, color: "#a78bfa" }}>{stats.topNode[0]}</div>
                <div style={{ fontSize: 10, color: "#64748b" }}>{(stats.topNode[1] * 100).toFixed(0)}% centraliteit</div>
              </div>
            )}
          </div>
        </Panel>

        {/* ── left filter panel ── */}
        {showFilters && (
          <Panel position="top-left">
            <div style={{
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 10,
              padding: 12,
              width: 200,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}>
              {/* Search */}
              <div style={{ position: "relative" }}>
                <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Zoeken..."
                  style={{
                    width: "100%",
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: 6,
                    padding: "5px 8px 5px 26px",
                    fontSize: 12,
                    color: "#e2e8f0",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Status filter */}
              <div>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>Status</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {["Actief", "Verouderd", "In review", "Uitgeschakeld"].map(s => (
                    <button
                      key={s}
                      onClick={() => setFilterStatus(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                      style={{
                        padding: "3px 7px",
                        borderRadius: 5,
                        fontSize: 10,
                        fontWeight: 600,
                        border: `1px solid ${filterStatus.includes(s) ? STATUS_COLORS[s] : "#1e293b"}`,
                        background: filterStatus.includes(s) ? `${STATUS_COLORS[s]}22` : "transparent",
                        color: filterStatus.includes(s) ? STATUS_COLORS[s] : "#64748b",
                        cursor: "pointer",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* System filter */}
              <div>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>Systemen</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {Object.entries(SYSTEM_COLORS).map(([s, c]) => (
                    <button
                      key={s}
                      onClick={() => setFilterSystem(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                      style={{
                        padding: "3px 7px",
                        borderRadius: 5,
                        fontSize: 10,
                        fontWeight: 600,
                        border: `1px solid ${filterSystem.includes(s) ? c : "#1e293b"}`,
                        background: filterSystem.includes(s) ? `${c}22` : "transparent",
                        color: filterSystem.includes(s) ? c : "#64748b",
                        cursor: "pointer",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fase filter */}
              <div>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>Fasen</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {Object.entries(PHASE_COLORS).map(([f, c]) => (
                    <button
                      key={f}
                      onClick={() => setFilterFase(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])}
                      style={{
                        padding: "3px 7px",
                        borderRadius: 5,
                        fontSize: 10,
                        fontWeight: 600,
                        border: `1px solid ${filterFase.includes(f) ? c : "#1e293b"}`,
                        background: filterFase.includes(f) ? `${c}22` : "transparent",
                        color: filterFase.includes(f) ? c : "#64748b",
                        cursor: "pointer",
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reset */}
              {(filterStatus.length > 0 || filterSystem.length > 0 || filterFase.length > 0 || searchQuery) && (
                <button
                  onClick={() => { setFilterStatus([]); setFilterSystem([]); setFilterFase([]); setSearchQuery("") }}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    border: "1px solid #334155",
                    background: "transparent",
                    color: "#94a3b8",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <X size={10} /> Filters wissen
                </button>
              )}
            </div>
          </Panel>
        )}

        {/* ── filter toggle ── */}
        <Panel position="top-left" style={{ top: 16, left: showFilters ? 220 : 16 }}>
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 8,
              padding: "6px 10px",
              color: "#64748b",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
            }}
          >
            <Filter size={12} />
            {showFilters ? "Verberg" : "Filters"}
          </button>
        </Panel>
      </ReactFlow>

      {/* ── detail panel ── */}
      {showDetail && selectedAuto && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 320,
            height: "100%",
            background: "#0f172a",
            borderLeft: "1px solid #1e293b",
            overflowY: "auto",
            zIndex: 10,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>{selectedAuto.id}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#e2e8f0", marginTop: 2 }}>{selectedAuto.naam}</div>
            </div>
            <button
              onClick={() => setShowDetail(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Badges */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span style={{
              padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: `${STATUS_COLORS[selectedAuto.status]}22`,
              color: STATUS_COLORS[selectedAuto.status],
              border: `1px solid ${STATUS_COLORS[selectedAuto.status]}`,
            }}>
              {selectedAuto.status}
            </span>
            <span style={{
              padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: "#1e293b", color: "#94a3b8", border: "1px solid #334155",
            }}>
              {selectedAuto.categorie}
            </span>
          </div>

          {/* Metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Impact", value: berekenImpact(selectedAuto, automations), color: "#6366f1" },
              { label: "Complexiteit", value: berekenComplexiteit(selectedAuto), color: "#f43f5e" },
              { label: "Centraliteit", value: Math.round((centrality.get(selectedAuto.id) ?? 0) * 100), color: "#f59e0b", suffix: "%" },
              { label: "Koppelingen", value: selectedAuto.koppelingen?.length ?? 0, color: "#22c55e", suffix: "" },
            ].map(m => (
              <div key={m.label} style={{
                background: "#1e293b", borderRadius: 8, padding: "10px 12px",
                border: "1px solid #334155",
              }}>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>{m.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: m.color, marginTop: 2 }}>
                  {m.value}{m.suffix ?? "/100"}
                </div>
              </div>
            ))}
          </div>

          {/* Info rows */}
          {[
            { label: "Trigger", value: selectedAuto.trigger },
            { label: "Eigenaar", value: selectedAuto.owner },
            { label: "Doel", value: selectedAuto.doel },
          ].filter(r => r.value).map(r => (
            <div key={r.label}>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 3, textTransform: "uppercase", letterSpacing: 1 }}>{r.label}</div>
              <div style={{ fontSize: 12, color: "#cbd5e1" }}>{r.value}</div>
            </div>
          ))}

          {/* Systems */}
          {selectedAuto.systemen?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>Systemen</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {selectedAuto.systemen.map(s => (
                  <span key={s} style={{
                    padding: "3px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                    background: `${SYSTEM_COLORS[s] ?? "#334155"}22`,
                    color: SYSTEM_COLORS[s] ?? "#94a3b8",
                    border: `1px solid ${SYSTEM_COLORS[s] ?? "#334155"}`,
                  }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Fasen */}
          {selectedAuto.fasen?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>Fasen</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {selectedAuto.fasen.map(f => (
                  <span key={f} style={{
                    padding: "3px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                    background: `${PHASE_COLORS[f] ?? "#334155"}22`,
                    color: PHASE_COLORS[f] ?? "#94a3b8",
                    border: `1px solid ${PHASE_COLORS[f] ?? "#334155"}`,
                  }}>{f}</span>
                ))}
              </div>
            </div>
          )}

          {/* Connected automations */}
          {selectedAuto.koppelingen?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>Koppelingen</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {selectedAuto.koppelingen.map(k => (
                  <button
                    key={k.doelId}
                    onClick={() => setSelectedId(k.doelId)}
                    style={{
                      background: "#1e293b",
                      border: "1px solid #334155",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 11,
                      color: "#a78bfa",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>{k.doelId} — {k.label}</span>
                    <ChevronRight size={12} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stappen */}
          {selectedAuto.stappen?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>Stappen</div>
              <ol style={{ margin: 0, padding: "0 0 0 16px" }}>
                {selectedAuto.stappen.map((s, i) => (
                  <li key={i} style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>{s}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Analyse actions */}
          <div style={{ borderTop: "1px solid #1e293b", paddingTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              onClick={() => { setAnalysisMode("cascade"); }}
              style={{
                background: "#1e293b", border: "1px solid #334155", borderRadius: 6,
                padding: "7px 12px", fontSize: 12, color: "#fb7185", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6, fontWeight: 600,
              }}
            >
              <Zap size={13} /> Toon cascade-impact
            </button>
            <button
              onClick={() => { setAnalysisMode("path"); setPathSource(selectedAuto.id); setPathTarget(null); }}
              style={{
                background: "#1e293b", border: "1px solid #334155", borderRadius: 6,
                padding: "7px 12px", fontSize: 12, color: "#facc15", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6, fontWeight: 600,
              }}
            >
              <Share2 size={13} /> Zoek pad vanaf hier
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function KennisGraaf() {
  return (
    <ReactFlowProvider>
      <KennisGraafInner />
    </ReactFlowProvider>
  )
}
