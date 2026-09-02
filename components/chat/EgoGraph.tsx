'use client'

import { useMemo, useState } from 'react'
import { polarLayout } from '@/lib/tv-chat/graph'
import type { GraphEdge, GraphNode } from '@/lib/tv-chat/types'

interface EgoGraphProps {
  center: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  onSelect: (username: string) => void
  title?: string
  emptyHint?: string
}

/** 2D SVG ego network: who the centre user quotes and mentions, and who answers. */
export function EgoGraph({
  center,
  nodes,
  edges,
  onSelect,
  title = 'Netzwerk',
  emptyHint = 'Das Netzwerk füllt sich, sobald Zitate und @Mentions geladen sind.'
}: EgoGraphProps) {
  const [hover, setHover] = useState<string | null>(null)
  const [raum, setRaum] = useState(false)
  const trimmed = useMemo(() => trimToRaum(center, nodes, edges, raum), [center, nodes, edges, raum])
  const layout = useMemo(() => polarLayout(trimmed.nodes), [trimmed.nodes])
  const byName = useMemo(() => new Map(layout.map(n => [n.username, n])), [layout])
  const width = 640
  const height = 420

  if (nodes.length <= 1) {
    return (
      <div className="rounded-sm border border-primary/15 bg-card/40 px-4 py-3 text-xs text-muted-foreground font-body">
        {emptyHint}
      </div>
    )
  }

  return (
    <div className="rounded-sm border border-primary/15 bg-card/40 p-3 overflow-hidden">
      <div className="flex items-center justify-between px-2 pb-2">
        <h3 className="font-headline text-sm font-semibold uppercase tracking-wider">{title}</h3>
        <div className="flex items-center gap-2">
          {nodes.length > 40 && (
            <button
              type="button"
              onClick={() => setRaum(v => !v)}
              className="text-[11px] px-2 py-0.5 rounded-md border border-border/60 text-muted-foreground hover:text-foreground"
            >
              {raum ? 'Alle' : 'Raum'}
            </button>
          )}
          <span className="text-[11px] text-muted-foreground">
            {trimmed.nodes.length} Personen · Ring 2 = neu entdeckt
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[380px]">
        {trimmed.edges.map(edge => {
          const from = byName.get(edge.from)
          const to = byName.get(edge.to)
          if (!from || !to) return null
          const active = hover === edge.from || hover === edge.to
          return (
            <line
              key={`${edge.from}-${edge.to}-${edge.kind}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={edge.kind === 'mention' ? 'rgb(56 189 248)' : edge.kind === 'both' ? 'rgb(52 211 153)' : 'rgb(251 191 36)'}
              strokeOpacity={active ? 0.9 : 0.35}
              strokeWidth={Math.min(4, 0.6 + edge.weight / 4)}
            />
          )
        })}
        {layout.map(node => (
          <g
            key={node.username}
            transform={`translate(${node.x}, ${node.y})`}
            className="cursor-pointer"
            onMouseEnter={() => setHover(node.username)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelect(node.username)}
          >
            <circle
              r={node.hop === 0 ? 22 : node.hop === 1 ? 16 : 12}
              fill={node.inArchive ? 'hsl(var(--card))' : 'transparent'}
              stroke={node.username === center ? 'hsl(var(--primary))' : node.inArchive ? 'rgb(52 211 153)' : 'rgb(251 191 36)'}
              strokeDasharray={node.inArchive ? undefined : '3 2'}
              strokeWidth={node.hop === 0 ? 3 : 1.5}
              opacity={node.hop === 2 ? 0.75 : 1}
            />
            {node.avatar && (
              <image
                href={node.avatar}
                x={node.hop === 0 ? -18 : node.hop === 1 ? -12 : -9}
                y={node.hop === 0 ? -18 : node.hop === 1 ? -12 : -9}
                width={node.hop === 0 ? 36 : node.hop === 1 ? 24 : 18}
                height={node.hop === 0 ? 36 : node.hop === 1 ? 24 : 18}
                clipPath="inset(0% round 99px)"
              />
            )}
            {(hover === node.username || node.hop === 0) && (
              <text
                y={node.hop === 0 ? 36 : 26}
                textAnchor="middle"
                className="fill-foreground"
                fontSize={node.hop === 0 ? 11 : 9}
              >
                {node.username}
              </text>
            )}
          </g>
        ))}
      </svg>
      {hover && (
        <div className="px-3 pb-2 text-[11px] text-muted-foreground">
          {hover}
          {byName.get(hover)?.inArchive ? ' · im Archiv' : ' · nur entdeckt'}
          {byName.get(hover)?.joinYear ? ` · dabei ${byName.get(hover)?.joinYear}` : ''}
          {byName.get(hover)?.messageCount ? ` · ${byName.get(hover)?.messageCount} msgs` : ''}
        </div>
      )}
    </div>
  )
}

function trimToRaum(
  center: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  raum: boolean
) {
  if (!raum || nodes.length <= 40) return { nodes, edges }
  const degree = new Map<string, number>()
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) || 0) + edge.weight)
    degree.set(edge.to, (degree.get(edge.to) || 0) + edge.weight)
  }
  const ranked = nodes.slice().sort((a, b) => {
    if (a.username === center) return -1
    if (b.username === center) return 1
    if (a.hop !== b.hop) return a.hop - b.hop
    return (degree.get(b.username) || 0) - (degree.get(a.username) || 0)
  })
  const keep = new Set(ranked.slice(0, 40).map(n => n.username))
  keep.add(center)
  return {
    nodes: nodes.filter(n => keep.has(n.username)),
    edges: edges.filter(e => keep.has(e.from) && keep.has(e.to))
  }
}
