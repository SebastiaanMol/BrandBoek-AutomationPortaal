import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ForceGraph3D from "react-force-graph-3d"
import * as THREE from "three"
import { ChevronRight, X, Zap, Share2 } from "lucide-react"
import { Automatisering, berekenComplexiteit, berekenImpact } from "@/lib/types"
import { cascadeImpact, degreeCentrality, findOrphans, shortestPath, buildEdgeList } from "@/lib/graphAnalysis"

// ─── colours ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Actief: "#22c55e",
  Verouderd: "#f59e0b",
  "In review": "#3b82f6",
  Uitgeschakeld: "#ef4444",
}

const SYSTEM_COLORS: Record<string, string> = {
  HubSpot: "#ff7a59", Zapier: "#65A30D", Typeform: "#262627",
  SharePoint: "#038387", WeFact: "#2ecc71", Docufy: "#8b5cf6",
  Backend: "#0066cc", "E-mail": "#10b981", API: "#64748b", Anders: "#a855f7",
}

const PHASE_COLORS: Record<string, string> = {
  Marketing: "#6366f1", Sales: "#f43f5e", Onboarding: "#0ea5e9",
  Boekhouding: "#f97316", Offboarding: "#8b5cf6",
}

function hexToNum(hex: string): number {
  return parseInt(hex.replace("#", ""), 16)
}

// ─── types ────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string
  naam: string
  status: string
  categorie: string
  systemen: string[]
  fasen: string[]
  impact: number
  centrality: number
  isOrphan: boolean
  nodeType: "automation" | "system" | "phase"
  color: string
  size: number
  auto?: Automatisering
}

interface GraphLink {
  source: string
  target: string
  label?: string
  color: string
  width: number
}

// ─── props ────────────────────────────────────────────────────────────────────

interface KennisGraaf3DProps {
  automations: Automatisering[]
  showSystems?: boolean
  showPhases?: boolean
  analysisMode?: "none" | "cascade" | "centrality" | "orphans"
}

export default function KennisGraaf3D({
  automations,
  showSystems = false,
  showPhases = false,
  analysisMode = "none",
}: KennisGraaf3DProps) {
  const fgRef = useRef<any>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [highlightNodes, setHighlightNodes] = useState(new Set<string>())
  const [highlightLinks, setHighlightLinks] = useState(new Set<string>())
  const [dims, setDims] = useState({ w: window.innerWidth - 256, h: window.innerHeight - 48 })

  useEffect(() => {
    const onResize = () => setDims({ w: window.innerWidth - 256, h: window.innerHeight - 48 })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // ── analysis data ──────────────────────────────────────────────────────────
  const centrality = useMemo(() => degreeCentrality(automations), [automations])
  const orphans = useMemo(() => findOrphans(automations), [automations])
  const edgeList = useMemo(() => buildEdgeList(automations), [automations])

  // ── graph data ─────────────────────────────────────────────────────────────
  const graphData = useMemo(() => {
    const nodes: GraphNode[] = automations.map(a => {
      const c = centrality.get(a.id) ?? 0
      const imp = berekenImpact(a, automations)
      return {
        id: a.id,
        naam: a.naam,
        status: a.status,
        categorie: a.categorie,
        systemen: a.systemen ?? [],
        fasen: a.fasen ?? [],
        impact: imp,
        centrality: c,
        isOrphan: orphans.has(a.id),
        nodeType: "automation" as const,
        color: STATUS_COLORS[a.status] ?? "#6366f1",
        size: 3 + (imp / 100) * 6, // 3–9 based on impact
        auto: a,
      }
    })

    // System nodes
    if (showSystems) {
      const systems = [...new Set(automations.flatMap(a => a.systemen ?? []))]
      for (const s of systems) {
        nodes.push({
          id: `sys_${s}`, naam: s, status: "", categorie: "", systemen: [], fasen: [],
          impact: 0, centrality: 0, isOrphan: false,
          nodeType: "system" as const,
          color: SYSTEM_COLORS[s] ?? "#64748b",
          size: 10,
        })
      }
    }

    // Phase nodes
    if (showPhases) {
      const phases = [...new Set(automations.flatMap(a => a.fasen ?? []))]
      for (const p of phases) {
        nodes.push({
          id: `phase_${p}`, naam: p, status: "", categorie: "", systemen: [], fasen: [],
          impact: 0, centrality: 0, isOrphan: false,
          nodeType: "phase" as const,
          color: PHASE_COLORS[p] ?? "#6366f1",
          size: 10,
        })
      }
    }

    // Links
    const links: GraphLink[] = []
    const seen = new Set<string>()

    // Automation koppelingen
    for (const a of automations) {
      for (const k of (a.koppelingen ?? [])) {
        const key = `${a.id}::${k.doelId}`
        if (!seen.has(key)) {
          seen.add(key)
          links.push({ source: a.id, target: k.doelId, label: k.label, color: "#6366f1", width: 2 })
        }
      }
    }

    // System links
    if (showSystems) {
      for (const a of automations) {
        for (const s of (a.systemen ?? [])) {
          links.push({ source: a.id, target: `sys_${s}`, color: `${SYSTEM_COLORS[s] ?? "#94a3b8"}88`, width: 0.5 })
        }
      }
    }

    // Phase links
    if (showPhases) {
      for (const a of automations) {
        for (const p of (a.fasen ?? [])) {
          links.push({ source: a.id, target: `phase_${p}`, color: `${PHASE_COLORS[p] ?? "#6366f1"}88`, width: 0.5 })
        }
      }
    }

    return { nodes, links }
  }, [automations, showSystems, showPhases, centrality, orphans])

  // ── node 3D object ─────────────────────────────────────────────────────────
  const nodeThreeObject = useCallback((node: object) => {
    const n = node as GraphNode
    const isHighlighted = highlightNodes.has(n.id)
    const isDimmed = analysisMode === "orphans"
      ? !n.isOrphan && n.nodeType === "automation"
      : analysisMode === "centrality"
        ? n.centrality < 0.05 && n.nodeType === "automation"
        : false

    const color = hexToNum(n.color)

    if (n.nodeType === "system") {
      const geo = new THREE.OctahedronGeometry(n.size)
      const mat = new THREE.MeshLambertMaterial({ color, transparent: isDimmed, opacity: isDimmed ? 0.15 : 1 })
      const mesh = new THREE.Mesh(geo, mat)

      // Label
      const canvas = document.createElement("canvas")
      canvas.width = 256; canvas.height = 64
      const ctx = canvas.getContext("2d")!
      ctx.fillStyle = n.color
      ctx.font = "bold 22px Inter, sans-serif"
      ctx.fillText(n.naam, 8, 44)
      const texture = new THREE.CanvasTexture(canvas)
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }))
      sprite.scale.set(32, 8, 1)
      sprite.position.set(0, n.size + 6, 0)
      const group = new THREE.Group()
      group.add(mesh, sprite)
      return group
    }

    if (n.nodeType === "phase") {
      const geo = new THREE.TetrahedronGeometry(n.size)
      const mat = new THREE.MeshLambertMaterial({ color, transparent: isDimmed, opacity: isDimmed ? 0.15 : 1 })
      const mesh = new THREE.Mesh(geo, mat)
      const canvas = document.createElement("canvas")
      canvas.width = 256; canvas.height = 64
      const ctx = canvas.getContext("2d")!
      ctx.fillStyle = n.color
      ctx.font = "bold 22px Inter, sans-serif"
      ctx.fillText(n.naam, 8, 44)
      const texture = new THREE.CanvasTexture(canvas)
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }))
      sprite.scale.set(32, 8, 1)
      sprite.position.set(0, n.size + 6, 0)
      const group = new THREE.Group()
      group.add(mesh, sprite)
      return group
    }

    // Automation node
    const size = isHighlighted ? n.size * 1.5 : n.size
    const geo = new THREE.SphereGeometry(size, 16, 16)
    const mat = new THREE.MeshLambertMaterial({
      color,
      transparent: isDimmed,
      opacity: isDimmed ? 0.1 : 1,
      emissive: isHighlighted ? new THREE.Color(color) : new THREE.Color(0x000000),
      emissiveIntensity: isHighlighted ? 0.3 : 0,
    })
    const sphere = new THREE.Mesh(geo, mat)

    // Label canvas
    const canvas = document.createElement("canvas")
    canvas.width = 512; canvas.height = 80
    const ctx = canvas.getContext("2d")!
    ctx.fillStyle = "#0f172a"
    ctx.font = "bold 18px Inter, sans-serif"
    ctx.fillText(n.id, 8, 26)
    ctx.fillStyle = "#475569"
    ctx.font = "15px Inter, sans-serif"
    const maxW = 490
    let name = n.naam
    if (ctx.measureText(name).width > maxW) name = name.slice(0, 38) + "…"
    ctx.fillText(name, 8, 52)

    const texture = new THREE.CanvasTexture(canvas)
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }))
    sprite.scale.set(40, 6, 1)
    sprite.position.set(0, size + 6, 0)

    const group = new THREE.Group()
    group.add(sphere, sprite)
    return group
  }, [highlightNodes, analysisMode])

  // ── click handler ──────────────────────────────────────────────────────────
  const onNodeClick = useCallback((node: object) => {
    const n = node as GraphNode
    if (!n.auto) return
    setSelectedNode(n)

    // Highlight neighbourhood
    const neighbors = new Set<string>([n.id])
    const linkHighlight = new Set<string>()
    for (const l of graphData.links) {
      const s = typeof l.source === "object" ? (l.source as any).id : l.source
      const t = typeof l.target === "object" ? (l.target as any).id : l.target
      if (s === n.id || t === n.id) {
        neighbors.add(s); neighbors.add(t)
        linkHighlight.add(`${s}::${t}`)
      }
    }
    setHighlightNodes(neighbors)
    setHighlightLinks(linkHighlight)

    // Camera zoom
    if (fgRef.current) {
      const dist = 80
      const distRatio = 1 + dist / Math.hypot((n as any).x ?? 0, (n as any).y ?? 0, (n as any).z ?? 0)
      fgRef.current.cameraPosition(
        { x: ((n as any).x ?? 0) * distRatio, y: ((n as any).y ?? 0) * distRatio, z: ((n as any).z ?? 0) * distRatio },
        n as any,
        1000
      )
    }
  }, [graphData.links])

  const clearSelection = useCallback(() => {
    setSelectedNode(null)
    setHighlightNodes(new Set())
    setHighlightLinks(new Set())
  }, [])

  // ── link colour ────────────────────────────────────────────────────────────
  const linkColor = useCallback((link: object) => {
    const l = link as GraphLink
    const s = typeof l.source === "object" ? (l.source as any).id : l.source
    const t = typeof l.target === "object" ? (l.target as any).id : l.target
    return highlightLinks.has(`${s}::${t}`) ? "#facc15" : l.color
  }, [highlightLinks])

  const linkWidth = useCallback((link: object) => {
    const l = link as GraphLink
    const s = typeof l.source === "object" ? (l.source as any).id : l.source
    const t = typeof l.target === "object" ? (l.target as any).id : l.target
    return highlightLinks.has(`${s}::${t}`) ? 3 : l.width
  }, [highlightLinks])

  return (
    <div style={{ width: "100%", height: "calc(100vh - 48px)", position: "relative", background: "#020817" }}>
      <ForceGraph3D
        ref={fgRef}
        width={dims.w}
        height={dims.h}
        graphData={graphData}
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkDirectionalArrowColor={linkColor}
        linkCurvature={0.1}
        onNodeClick={onNodeClick}
        onBackgroundClick={clearSelection}
        backgroundColor="#020817"
        showNavInfo={false}
      />

      {/* Stats overlay */}
      <div style={{
        position: "absolute", top: 16, left: 16,
        background: "#ffffff11", backdropFilter: "blur(8px)",
        border: "1px solid #ffffff22", borderRadius: 10,
        padding: "8px 16px", color: "#e2e8f0", fontSize: 12,
        display: "flex", gap: 16,
      }}>
        <span>🔵 {automations.filter(a => a.status === "Actief").length} actief</span>
        <span>🟡 {automations.filter(a => a.status === "Verouderd").length} verouderd</span>
        <span>🔗 {edgeList.length} koppelingen</span>
        <span>⚪ {[...orphans].length} orphans</span>
      </div>

      {/* Legend */}
      <div style={{
        position: "absolute", bottom: 16, left: 16,
        background: "#ffffff11", backdropFilter: "blur(8px)",
        border: "1px solid #ffffff22", borderRadius: 10,
        padding: "10px 14px", color: "#94a3b8", fontSize: 11,
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        <div style={{ color: "#e2e8f0", fontWeight: 700, marginBottom: 4 }}>Legenda</div>
        {Object.entries(STATUS_COLORS).map(([s, c]) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
            <span>{s}</span>
          </div>
        ))}
        <div style={{ borderTop: "1px solid #ffffff22", marginTop: 4, paddingTop: 4 }}>
          Grootte node = impact score
        </div>
        {showSystems && <div>◆ Octaëder = systeem</div>}
        {showPhases && <div>▲ Tetraëder = fase</div>}
      </div>

      {/* Detail panel */}
      {selectedNode?.auto && (
        <div style={{
          position: "absolute", top: 0, right: 0,
          width: 300, height: "100%",
          background: "#0f172af0", backdropFilter: "blur(12px)",
          borderLeft: "1px solid #1e293b",
          overflowY: "auto", padding: 20,
          display: "flex", flexDirection: "column", gap: 14,
          color: "#e2e8f0",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>{selectedNode.id}</div>
              <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>{selectedNode.naam}</div>
            </div>
            <button onClick={clearSelection} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}>
              <X size={18} />
            </button>
          </div>

          {/* Status badge */}
          <span style={{
            display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: `${STATUS_COLORS[selectedNode.status]}22`,
            color: STATUS_COLORS[selectedNode.status],
            border: `1px solid ${STATUS_COLORS[selectedNode.status]}`,
          }}>
            {selectedNode.status}
          </span>

          {/* Metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Impact", val: selectedNode.impact, color: "#6366f1" },
              { label: "Complexiteit", val: berekenComplexiteit(selectedNode.auto!), color: "#f43f5e" },
              { label: "Centraliteit", val: Math.round(selectedNode.centrality * 100), color: "#f59e0b", suffix: "%" },
              { label: "Koppelingen", val: selectedNode.auto!.koppelingen?.length ?? 0, color: "#22c55e", suffix: "" },
            ].map(m => (
              <div key={m.label} style={{ background: "#1e293b", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 10, color: "#64748b" }}>{m.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: m.color }}>
                  {m.val}{m.suffix ?? "/100"}
                </div>
              </div>
            ))}
          </div>

          {/* Info */}
          {[
            { label: "Trigger", val: selectedNode.auto!.trigger },
            { label: "Eigenaar", val: selectedNode.auto!.owner },
            { label: "Doel", val: selectedNode.auto!.doel },
          ].filter(r => r.val).map(r => (
            <div key={r.label}>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{r.label}</div>
              <div style={{ fontSize: 12, color: "#cbd5e1" }}>{r.val}</div>
            </div>
          ))}

          {/* Systems */}
          {selectedNode.systemen.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Systemen</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {selectedNode.systemen.map(s => (
                  <span key={s} style={{
                    padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                    background: `${SYSTEM_COLORS[s] ?? "#334155"}22`,
                    color: SYSTEM_COLORS[s] ?? "#94a3b8",
                    border: `1px solid ${SYSTEM_COLORS[s] ?? "#334155"}`,
                  }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Koppelingen */}
          {(selectedNode.auto!.koppelingen?.length ?? 0) > 0 && (
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Koppelingen</div>
              {selectedNode.auto!.koppelingen.map(k => (
                <div key={k.doelId} style={{
                  background: "#1e293b", border: "1px solid #334155", borderRadius: 6,
                  padding: "5px 10px", fontSize: 11, color: "#a78bfa", marginBottom: 4,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span>{k.doelId} — {k.label}</span>
                  <ChevronRight size={12} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
