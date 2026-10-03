/**
 * Groups in the ego network: Louvain-style modularity optimisation (local
 * moving, then merging groups into super-nodes and repeating). Unlike label
 * propagation this still separates circles when everyone in a small chat
 * talks to everyone. The centre is left out (it is linked to all and
 * would join every group). Deterministic: fixed visiting order, ties by name.
 * Groups smaller than `minSize` are returned as -1 ("no group").
 */
export function detectCommunities(
  nodes: string[],
  links: Array<{ a: string; b: string; weight: number }>,
  exclude: string,
  minSize = 3,
  resolution = 1.1
): Map<string, number> {
  const members = nodes.filter(n => n !== exclude).sort()
  const index = new Map(members.map((n, i) => [n, i]))
  // Edge list on integer ids; log weights so one chatty pair does not dominate.
  let edges: Array<[number, number, number]> = []
  for (const link of links) {
    const a = index.get(link.a)
    const b = index.get(link.b)
    if (a === undefined || b === undefined || a === b) continue
    edges.push([a, b, Math.log2(1 + link.weight)])
  }
  // membership[i] = community of original member i
  let membership = members.map((_, i) => i)
  let size = members.length

  for (let level = 0; level < 10; level++) {
    const adjacency: Array<Map<number, number>> = Array.from({ length: size }, () => new Map())
    const degree = new Float64Array(size)
    let total = 0
    for (const [a, b, w] of edges) {
      adjacency[a].set(b, (adjacency[a].get(b) ?? 0) + w)
      adjacency[b].set(a, (adjacency[b].get(a) ?? 0) + w)
      degree[a] += w
      degree[b] += w
      total += 2 * w
    }
    if (!total) break
    const community = Array.from({ length: size }, (_, i) => i)
    const sumTot = Float64Array.from(degree)
    let moved = false
    for (let pass = 0; pass < 50; pass++) {
      let changed = false
      for (let i = 0; i < size; i++) {
        const own = community[i]
        const weights = new Map<number, number>()
        for (const [j, w] of adjacency[i]) {
          if (j === i) continue
          weights.set(community[j], (weights.get(community[j]) ?? 0) + w)
        }
        sumTot[own] -= degree[i]
        let best = own
        let bestGain = (weights.get(own) ?? 0) - (resolution * sumTot[own] * degree[i]) / total
        for (const [c, w] of weights) {
          const gain = w - (resolution * sumTot[c] * degree[i]) / total
          if (gain > bestGain + 1e-12 || (Math.abs(gain - bestGain) <= 1e-12 && c < best)) {
            best = c
            bestGain = gain
          }
        }
        sumTot[best] += degree[i]
        if (best !== own) {
          community[i] = best
          changed = true
          moved = true
        }
      }
      if (!changed) break
    }
    if (!moved) break
    // Renumber and collapse communities into super-nodes.
    const renumber = new Map<number, number>()
    for (const c of community) if (!renumber.has(c)) renumber.set(c, renumber.size)
    membership = membership.map(m => renumber.get(community[m])!)
    const merged = new Map<string, number>()
    for (const [a, b, w] of edges) {
      const ca = renumber.get(community[a])!
      const cb = renumber.get(community[b])!
      // Internal weight stays as a self-loop; dropping it would let the next level merge everything.
      const key = ca < cb ? `${ca}:${cb}` : `${cb}:${ca}`
      merged.set(key, (merged.get(key) ?? 0) + w)
    }
    edges = Array.from(merged.entries()).map(([key, w]) => {
      const [a, b] = key.split(':').map(Number)
      return [a, b, w]
    })
    if (renumber.size === size) break
    size = renumber.size
  }

  const sizes = new Map<number, number>()
  for (const c of membership) sizes.set(c, (sizes.get(c) ?? 0) + 1)
  // Biggest group gets id 0, so colours are stable across reloads.
  const ranked = Array.from(sizes.entries())
    .filter(([, n]) => n >= minSize)
    .sort((x, y) => y[1] - x[1] || x[0] - y[0])
    .map(([c]) => c)
  const ids = new Map(ranked.map((c, i) => [c, i]))
  const out = new Map<string, number>()
  members.forEach((name, i) => out.set(name, ids.get(membership[i]) ?? -1))
  return out
}

/** 'YYYY-MM' months from first to last inclusive. */
export function monthRange(first: string, last: string): string[] {
  const out: string[] = []
  let [y, m] = first.split('-').map(Number)
  const [ly, lm] = last.split('-').map(Number)
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}
