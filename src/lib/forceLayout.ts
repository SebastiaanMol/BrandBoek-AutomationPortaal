export interface ForceNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  mass: number
}

export interface ForceEdge {
  source: string
  target: string
  strength?: number
}

/**
 * Fruchterman-Reingold force-directed layout.
 * Returns final positions for all nodes.
 */
export function runForceLayout(
  nodes: ForceNode[],
  edges: ForceEdge[],
  width: number,
  height: number,
  iterations = 250
): Map<string, { x: number; y: number }> {
  if (nodes.length === 0) return new Map()

  const area = width * height
  const k = Math.sqrt(area / nodes.length) * 1.2

  // Deep copy so originals are not mutated
  const ns = nodes.map(n => ({ ...n }))
  const byId = new Map(ns.map(n => [n.id, n]))

  const repulse = (d: number) => (k * k) / (d || 0.001)
  const attract = (d: number, str = 1) => ((d * d) / k) * str

  for (let iter = 0; iter < iterations; iter++) {
    const temp = k * (1 - iter / iterations)

    // Reset velocity
    for (const v of ns) { v.vx = 0; v.vy = 0 }

    // Repulsion between every pair
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const v = ns[i], u = ns[j]
        const dx = v.x - u.x
        const dy = v.y - u.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001
        const f = repulse(dist)
        const fx = (dx / dist) * f
        const fy = (dy / dist) * f
        v.vx += fx; v.vy += fy
        u.vx -= fx; u.vy -= fy
      }
    }

    // Attraction along edges
    for (const e of edges) {
      const s = byId.get(e.source)
      const t = byId.get(e.target)
      if (!s || !t) continue
      const dx = s.x - t.x
      const dy = s.y - t.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001
      const f = attract(dist, e.strength ?? 1)
      const fx = (dx / dist) * f
      const fy = (dy / dist) * f
      s.vx -= fx; s.vy -= fy
      t.vx += fx; t.vy += fy
    }

    // Apply with cooling + boundary clamping
    const half_w = width / 2
    const half_h = height / 2
    for (const v of ns) {
      const speed = Math.sqrt(v.vx * v.vx + v.vy * v.vy) || 0.001
      v.x += (v.vx / speed) * Math.min(speed, temp)
      v.y += (v.vy / speed) * Math.min(speed, temp)
      v.x = Math.max(-half_w, Math.min(half_w, v.x))
      v.y = Math.max(-half_h, Math.min(half_h, v.y))
    }
  }

  const result = new Map<string, { x: number; y: number }>()
  for (const n of ns) result.set(n.id, { x: n.x, y: n.y })
  return result
}

/** Seed nodes in a random scatter within bounds */
export function seedNodes(ids: string[], width: number, height: number): ForceNode[] {
  return ids.map(id => ({
    id,
    x: (Math.random() - 0.5) * width * 0.8,
    y: (Math.random() - 0.5) * height * 0.8,
    vx: 0,
    vy: 0,
    mass: 1,
  }))
}
