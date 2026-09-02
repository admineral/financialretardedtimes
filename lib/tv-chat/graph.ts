import type { GraphEdge, GraphNode } from './types'

export interface RawEdge {
  from: string
  to: string
  kind: 'quote' | 'mention'
  weight: number
}

function keyOf(a: string, b: string) {
  return `${a.toLowerCase()}→${b.toLowerCase()}`
}

export function mergeEdges(edges: RawEdge[]): GraphEdge[] {
  const map = new Map<string, GraphEdge>()
  for (const edge of edges) {
    if (edge.from.toLowerCase() === edge.to.toLowerCase()) continue
    const key = keyOf(edge.from, edge.to)
    const existing = map.get(key)
    if (!existing) {
      map.set(key, {
        from: edge.from,
        to: edge.to,
        kind: edge.kind,
        weight: edge.weight
      })
    } else {
      existing.weight += edge.weight
      if (existing.kind !== edge.kind) existing.kind = 'both'
    }
  }
  return Array.from(map.values())
}

export function egoGraph(
  center: string,
  edges: GraphEdge[],
  archiveUsers: Set<string>
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const centerKey = center.toLowerCase()
  const hop1 = new Set<string>()
  const hop2 = new Set<string>()

  for (const edge of edges) {
    const from = edge.from.toLowerCase()
    const to = edge.to.toLowerCase()
    if (from === centerKey) hop1.add(edge.to)
    if (to === centerKey) hop1.add(edge.from)
  }

  const hop1Keys = new Set(Array.from(hop1).map(n => n.toLowerCase()))
  for (const edge of edges) {
    const from = edge.from.toLowerCase()
    const to = edge.to.toLowerCase()
    if (hop1Keys.has(from) && to !== centerKey && !hop1Keys.has(to)) hop2.add(edge.to)
    if (hop1Keys.has(to) && from !== centerKey && !hop1Keys.has(from)) hop2.add(edge.from)
  }

  const allowed = new Set([centerKey, ...hop1Keys, ...Array.from(hop2).map(n => n.toLowerCase())])
  const visibleEdges = edges.filter(
    e => allowed.has(e.from.toLowerCase()) && allowed.has(e.to.toLowerCase())
  )

  const names = new Map<string, string>()
  names.set(centerKey, center)
  for (const name of hop1) names.set(name.toLowerCase(), name)
  for (const name of hop2) names.set(name.toLowerCase(), name)
  for (const edge of visibleEdges) {
    names.set(edge.from.toLowerCase(), edge.from)
    names.set(edge.to.toLowerCase(), edge.to)
  }

  const nodes: GraphNode[] = Array.from(names.entries()).map(([key, username]) => ({
    username,
    hop: key === centerKey ? 0 : hop1Keys.has(key) ? 1 : 2,
    inArchive: archiveUsers.has(key) || archiveUsers.has(username)
  }))

  return { nodes, edges: visibleEdges }
}

export function polarLayout<T extends GraphNode>(nodes: T[], width = 640, height = 420) {
  const cx = width / 2
  const cy = height / 2
  const rings = [0, 120, 190]
  const byHop = [0, 1, 2].map(h => nodes.filter(n => n.hop === h))

  return nodes.map(node => {
    const group = byHop[node.hop]
    const index = group.findIndex(n => n.username === node.username)
    const count = Math.max(group.length, 1)
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2
    const r = rings[node.hop]
    return {
      ...node,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r
    }
  })
}