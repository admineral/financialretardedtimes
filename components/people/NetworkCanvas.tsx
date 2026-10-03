'use client'

/**
 * NetworkCanvas — live, interactive ego network.
 *
 * Canvas + d3-force so a few hundred people and ~1–2k links stay at 60 fps.
 *
 * - Drag a person to move them; they stay pinned where dropped
 *   (right-click or "Lösen" releases). Drag the background to pan, wheel/pinch to zoom.
 * - Hover highlights someone's ties with particles flowing in the direction
 *   of each quote/mention; click selects (details in the side panel),
 *   double-click puts them in the centre.
 * - Layouts: Kraft (free physics), Ringe (distance = strength of tie),
 *   Gruppen (detected circles pulled into their own areas).
 * - Timeline: play the network month by month as it grew.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum
} from 'd3-force'
import { select } from 'd3-selection'
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import {
  Camera,
  Expand,
  LocateFixed,
  Minimize,
  Pause,
  Pin,
  PinOff,
  Play,
  Search,
  Shuffle
} from 'lucide-react'
import { detectCommunities, monthRange } from '@/lib/people/communities'
import { resolveAvatar } from '@/lib/tv-chat/client'
import type { NetworkLink, NetworkNode } from '@/lib/people/types'
import { MENTION_COLOR, QUOTE_COLOR, groupColor, relationColor } from './colors'

type Mode = 'force' | 'rings' | 'groups'

interface SimNode extends SimulationNodeDatum {
  id: string
  data: NetworkNode
  r: number
  group: number
  pinned: boolean
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  source: SimNode
  target: SimNode
  data: NetworkLink
  weight: number
  toCenter: boolean
}

interface Theme {
  bg: string
  fg: string
  card: string
  muted: string
  primary: string
}

function readTheme(): Theme {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return {
    bg: v('--background', '220 20% 4%'),
    fg: v('--foreground', '40 20% 92%'),
    card: v('--card', '220 18% 8%'),
    muted: v('--muted-foreground', '220 8% 60%'),
    primary: v('--primary', '43 96% 56%')
  }
}

const hsl = (triplet: string, alpha = 1) => `hsl(${triplet} / ${alpha})`

/**
 * Keeps the free-moving crowd centred on the (fixed) centre person. Dense
 * graphs otherwise drift to one side, because contacts pull on each other
 * far more than on the centre. Pinned/dragged people are left alone.
 */
function balanceForce(strength: number) {
  let nodes: SimNode[] = []
  const force = (alpha: number) => {
    let mx = 0
    let my = 0
    let count = 0
    for (const node of nodes) {
      if (node.fx != null || node.data.hop === 0) continue
      mx += node.x ?? 0
      my += node.y ?? 0
      count++
    }
    if (!count) return
    mx /= count
    my /= count
    for (const node of nodes) {
      if (node.fx != null || node.data.hop === 0) continue
      node.vx = (node.vx ?? 0) - mx * strength * alpha
      node.vy = (node.vy ?? 0) - my * strength * alpha
    }
  }
  force.initialize = (next: SimNode[]) => {
    nodes = next
  }
  return force
}

function monthLabel(month: string) {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })
}

export function NetworkCanvas({
  center,
  nodes,
  links,
  selected,
  highlight,
  onSelect,
  onRecenter,
  height = 680
}: {
  center: string
  nodes: NetworkNode[]
  links: NetworkLink[]
  selected: string | null
  /** Hover coming from outside (contact list). */
  highlight: string | null
  onSelect: (username: string | null) => void
  onRecenter: (username: string) => void
  height?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null)
  const zoomRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null)
  const transformRef = useRef<ZoomTransform>(zoomIdentity)
  const sizeRef = useRef({ width: 800, height, dpr: 1 })
  const poolRef = useRef(new Map<string, SimNode>())
  const imagesRef = useRef(new Map<string, HTMLImageElement>())
  const themeRef = useRef<Theme | null>(null)
  const visibleRef = useRef<{ nodes: SimNode[]; links: SimLink[] }>({ nodes: [], links: [] })
  const hoverRef = useRef<string | null>(null)
  const focusRef = useRef<string | null>(null)
  const dirtyRef = useRef(true)
  const fittedRef = useRef(false)
  const modeRef = useRef<Mode>('rings')

  const [mode, setMode] = useState<Mode>('rings')
  const [monthIndex, setMonthIndex] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const [query, setQuery] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [pinnedCount, setPinnedCount] = useState(0)

  const byName = useMemo(() => new Map(nodes.map(n => [n.username, n])), [nodes])

  // ---- timeline -----------------------------------------------------------
  const months = useMemo(() => {
    let first = ''
    let last = ''
    for (const link of links) {
      for (const month of Object.keys(link.months)) {
        if (!first || month < first) first = month
        if (!last || month > last) last = month
      }
    }
    return first ? monthRange(first, last) : []
  }, [links])
  const cutoff = monthIndex === null ? null : months[monthIndex] ?? null

  // ---- visible graph for the current timeline position -------------------
  const visible = useMemo(() => {
    const weighted = links
      .map(link => {
        if (!cutoff) return { link, weight: link.weight }
        let weight = 0
        for (const [month, count] of Object.entries(link.months)) if (month <= cutoff) weight += count
        return { link, weight }
      })
      .filter(entry => entry.weight > 0)
    const names = new Set<string>([center])
    for (const { link } of weighted) {
      names.add(link.a)
      names.add(link.b)
    }
    // Ring-2 people only make sense while they still touch a visible contact.
    const groups = detectCommunities(
      Array.from(names),
      weighted.map(({ link, weight }) => ({ a: link.a, b: link.b, weight })),
      center
    )
    return { weighted, names, groups }
  }, [links, cutoff, center])

  const maxWeight = useMemo(
    () => Math.max(1, ...nodes.filter(n => n.hop === 1).map(n => n.weight)),
    [nodes]
  )

  // ---- simulation setup (once) -------------------------------------------
  useEffect(() => {
    const sim = forceSimulation<SimNode, SimLink>()
      .alphaDecay(0.025)
      .velocityDecay(0.35)
      .on('tick', () => {
        dirtyRef.current = true
      })
    simRef.current = sim
    return () => {
      sim.stop()
      simRef.current = null
    }
  }, [])

  // New centre: forget positions and pins.
  useEffect(() => {
    poolRef.current = new Map()
    fittedRef.current = false
    setMonthIndex(null)
    setPlaying(false)
    setPinnedCount(0)
  }, [center])

  // ---- forces per layout ----------------------------------------------------
  const applyForces = useCallback(
    (alpha: number) => {
      const sim = simRef.current
      if (!sim) return
      const { nodes: simNodes, links: simLinks } = visibleRef.current
      const count = simNodes.length
      const spread = 150 + Math.sqrt(count) * 30
      const degree = new Map<string, number>()
      for (const link of simLinks) {
        degree.set(link.source.id, (degree.get(link.source.id) ?? 0) + 1)
        degree.set(link.target.id, (degree.get(link.target.id) ?? 0) + 1)
      }
      const ringRadius = (node: SimNode) =>
        node.data.hop === 0
          ? 0
          : node.data.hop === 1
            ? spread * (0.38 + 0.8 * (1 - Math.sqrt(Math.min(node.data.weight, maxWeight) / maxWeight)))
            : spread * 1.35
      const groupCount = Math.max(1, ...simNodes.map(n => n.group + 1))
      const anchor = (node: SimNode) => {
        if (node.data.hop === 0) return { x: 0, y: 0 }
        const angle = node.group >= 0 ? (node.group / groupCount) * Math.PI * 2 : ((node.id.length * 47) % 360) * (Math.PI / 180)
        const radius = node.group >= 0 ? spread * 0.85 : spread * 1.4
        return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
      }
      const current = modeRef.current

      sim
        .nodes(simNodes)
        .force(
          'link',
          forceLink<SimNode, SimLink>(simLinks)
            .id(n => n.id)
            .distance(link => {
              if (link.toCenter) {
                const other = link.source.data.hop === 0 ? link.target : link.source
                return current === 'rings' ? ringRadius(other) : 70 + spread * 0.5 * (1 - Math.sqrt(Math.min(other.data.weight, maxWeight) / maxWeight))
              }
              return 40 + link.source.r + link.target.r
            })
            .strength(link => {
              if (link.toCenter) return current === 'force' ? 0.12 : 0.03
              const base = 0.6 / Math.min(degree.get(link.source.id) ?? 1, degree.get(link.target.id) ?? 1)
              return Math.min(0.5, base * Math.min(1, Math.sqrt(link.weight) / 2)) * (current === 'groups' ? 1.4 : 1)
            })
        )
        .force('charge', forceManyBody<SimNode>().strength(n => -(30 + n.r * 9)).distanceMax(spread * 2.2))
        .force('collide', forceCollide<SimNode>().radius(n => n.r + 9).strength(0.9).iterations(2))
        .force('radial', current === 'rings' ? forceRadial<SimNode>(ringRadius).strength(0.55) : current === 'force' ? forceRadial<SimNode>(ringRadius).strength(0.03) : null)
        .force('x', current === 'groups' ? forceX<SimNode>(n => anchor(n).x).strength(0.12) : forceX<SimNode>(0).strength(0.02))
        .force('y', current === 'groups' ? forceY<SimNode>(n => anchor(n).y).strength(0.12) : forceY<SimNode>(0).strength(0.02))
        .force('balance', balanceForce(0.25))
        .alpha(alpha)
        .restart()
    },
    [maxWeight]
  )

  // ---- sync data → simulation ---------------------------------------------
  useEffect(() => {
    const pool = poolRef.current
    const maxRing2 = Math.max(1, ...nodes.filter(n => n.hop === 2).map(n => n.weight))
    const simNodes: SimNode[] = []
    for (const name of visible.names) {
      const data = byName.get(name)
      if (!data) continue
      let node = pool.get(name)
      const scale = Math.sqrt(data.weight / (data.hop === 2 ? maxRing2 : maxWeight))
      const r = data.hop === 0 ? 30 : data.hop === 1 ? 8 + 18 * Math.min(scale, 1) : 4 + 6 * Math.min(scale, 1)
      if (!node) {
        node = { id: name, data, r, group: -1, pinned: false }
        if (data.hop === 0) {
          node.x = 0
          node.y = 0
          node.fx = 0
          node.fy = 0
        }
        pool.set(name, node)
      }
      node.data = data
      node.r = r
      node.group = visible.groups.get(name) ?? -1
      simNodes.push(node)
    }
    const index = new Map(simNodes.map(n => [n.id, n]))
    // Newcomers appear next to someone they are linked to, not at the origin.
    for (const { link } of visible.weighted) {
      const a = index.get(link.a)
      const b = index.get(link.b)
      if (!a || !b) continue
      for (const [fresh, anchor] of [[a, b], [b, a]] as const) {
        if (fresh.x === undefined && anchor.x !== undefined) {
          fresh.x = anchor.x + (Math.random() - 0.5) * 40
          fresh.y = (anchor.y ?? 0) + (Math.random() - 0.5) * 40
        }
      }
    }
    const simLinks: SimLink[] = visible.weighted.flatMap(({ link, weight }) => {
      const source = index.get(link.a)
      const target = index.get(link.b)
      if (!source || !target) return []
      return [{ source, target, data: link, weight, toCenter: link.a === center || link.b === center }]
    })
    visibleRef.current = { nodes: simNodes, links: simLinks }
    simNodes.forEach(node => {
      if (node.data.hop === 0) return
      if (imagesRef.current.has(node.id)) return
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.decoding = 'async'
      img.onload = () => {
        dirtyRef.current = true
      }
      img.src = resolveAvatar(node.data.avatar, node.id, 50)
      imagesRef.current.set(node.id, img)
    })
    const centerNode = index.get(center)
    if (centerNode && !imagesRef.current.has(`${center}@200`)) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        dirtyRef.current = true
      }
      img.src = resolveAvatar(centerNode.data.avatar, center, 200)
      imagesRef.current.set(`${center}@200`, img)
    }
    applyForces(playing ? 0.35 : 0.9)
    dirtyRef.current = true
  }, [visible, byName, nodes, center, maxWeight, applyForces, playing])

  useEffect(() => {
    modeRef.current = mode
    fittedRef.current = false
    applyForces(0.8)
  }, [mode, applyForces])

  // ---- camera ---------------------------------------------------------------
  const animateTo = useCallback((target: ZoomTransform, ms = 550) => {
    const canvas = canvasRef.current
    const behavior = zoomRef.current
    if (!canvas || !behavior) return
    const start = transformRef.current
    const t0 = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      const k = start.k + (target.k - start.k) * e
      const x = start.x + (target.x - start.x) * e
      const y = start.y + (target.y - start.y) * e
      select(canvas).call(behavior.transform, zoomIdentity.translate(x, y).scale(k))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [])

  const fit = useCallback(
    (animate = true) => {
      const { width, height: h } = sizeRef.current
      const list = visibleRef.current.nodes
      if (!list.length) return
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const node of list) {
        minX = Math.min(minX, (node.x ?? 0) - node.r)
        maxX = Math.max(maxX, (node.x ?? 0) + node.r)
        minY = Math.min(minY, (node.y ?? 0) - node.r)
        maxY = Math.max(maxY, (node.y ?? 0) + node.r + 14)
      }
      const k = Math.min(2.2, (width - 60) / (maxX - minX || 1), (h - 120) / (maxY - minY || 1))
      const target = zoomIdentity.translate(width / 2 - ((minX + maxX) / 2) * k, h / 2 - ((minY + maxY) / 2) * k + 10).scale(k)
      if (animate) animateTo(target)
      else if (canvasRef.current && zoomRef.current) select(canvasRef.current).call(zoomRef.current.transform, target)
    },
    [animateTo]
  )

  const flyTo = useCallback(
    (name: string) => {
      const node = poolRef.current.get(name)
      if (!node || node.x === undefined) return
      const { width, height: h } = sizeRef.current
      const k = Math.max(transformRef.current.k, 1.8)
      animateTo(zoomIdentity.translate(width / 2 - node.x * k, h / 2 - (node.y ?? 0) * k).scale(k))
    },
    [animateTo]
  )

  // Selecting from outside (contact list, panel) flies the camera there.
  useEffect(() => {
    if (selected) flyTo(selected)
  }, [selected, flyTo])

  // ---- canvas, zoom, pointer interaction ------------------------------------
  const nodeAt = useCallback((clientX: number, clientY: number): SimNode | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const [x, y] = transformRef.current.invert([clientX - rect.left, clientY - rect.top])
    const list = visibleRef.current.nodes
    const slack = 4 / transformRef.current.k
    for (let i = list.length - 1; i >= 0; i--) {
      const node = list[i]
      const dx = (node.x ?? 0) - x
      const dy = (node.y ?? 0) - y
      if (dx * dx + dy * dy <= (node.r + slack) ** 2) return node
    }
    return null
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current!
    const container = containerRef.current!
    themeRef.current = readTheme()
    const themeObserver = new MutationObserver(() => {
      themeRef.current = readTheme()
      dirtyRef.current = true
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] })

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const previous = sizeRef.current
      sizeRef.current = { width: rect.width, height: rect.height, dpr }
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      if (transformRef.current === zoomIdentity && zoomRef.current) {
        select(canvas).call(zoomRef.current.transform, zoomIdentity.translate(rect.width / 2, rect.height / 2).scale(0.8))
      } else if (zoomRef.current && (previous.width !== rect.width || previous.height !== rect.height)) {
        const t = transformRef.current
        select(canvas).call(
          zoomRef.current.transform,
          zoomIdentity.translate(t.x + (rect.width - previous.width) / 2, t.y + (rect.height - previous.height) / 2).scale(t.k)
        )
      }
      dirtyRef.current = true
    }

    const behavior = d3zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.15, 8])
      .filter(event => {
        if (event.type === 'wheel') return true
        if (event.type === 'dblclick') return false
        if ((event as MouseEvent).button) return false
        const point = 'touches' in event && event.touches?.length ? event.touches[0] : (event as MouseEvent)
        return !nodeAt(point.clientX, point.clientY)
      })
      .on('zoom', event => {
        transformRef.current = event.transform
        dirtyRef.current = true
      })
    zoomRef.current = behavior
    select(canvas).call(behavior).on('dblclick.zoom', null)
    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)

    let drag: { node: SimNode; x: number; y: number; moved: boolean; id: number } | null = null

    const toWorld = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return transformRef.current.invert([event.clientX - rect.left, event.clientY - rect.top])
    }

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const node = nodeAt(event.clientX, event.clientY)
      if (!node) return
      event.stopPropagation()
      canvas.setPointerCapture(event.pointerId)
      drag = { node, x: event.clientX, y: event.clientY, moved: false, id: event.pointerId }
      node.fx = node.x
      node.fy = node.y
      simRef.current?.alphaTarget(0.25).restart()
    }
    const onMove = (event: PointerEvent) => {
      if (drag) {
        if (Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) > 3) drag.moved = true
        const [x, y] = toWorld(event)
        drag.node.fx = x
        drag.node.fy = y
        setHover(null)
        return
      }
      const node = nodeAt(event.clientX, event.clientY)
      const id = node?.id ?? null
      canvas.style.cursor = node ? 'pointer' : 'grab'
      if (id !== hoverRef.current) {
        hoverRef.current = id
        dirtyRef.current = true
      }
      const rect = container.getBoundingClientRect()
      setHover(current =>
        id ? { id, x: event.clientX - rect.left, y: event.clientY - rect.top } : current ? null : current
      )
    }
    const onUp = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return
      const { node, moved } = drag
      drag = null
      simRef.current?.alphaTarget(0)
      if (moved) {
        if (!node.pinned && node.data.hop !== 0) {
          node.pinned = true
          setPinnedCount(c => c + 1)
        }
      } else {
        if (!node.pinned && node.data.hop !== 0) {
          node.fx = null
          node.fy = null
        }
        onSelectRef.current(node.id === focusRef.current && node.id === selectedRef.current ? null : node.id)
      }
      dirtyRef.current = true
    }
    const onLeave = () => {
      if (hoverRef.current) {
        hoverRef.current = null
        dirtyRef.current = true
      }
      setHover(null)
    }
    const onDouble = (event: MouseEvent) => {
      const node = nodeAt(event.clientX, event.clientY)
      if (node && node.data.hop !== 0) onRecenterRef.current(node.id)
      else if (!node) fitRef.current(true)
    }
    const onContext = (event: MouseEvent) => {
      const node = nodeAt(event.clientX, event.clientY)
      if (!node || !node.pinned) return
      event.preventDefault()
      node.pinned = false
      node.fx = null
      node.fy = null
      setPinnedCount(c => Math.max(0, c - 1))
      simRef.current?.alpha(0.3).restart()
    }
    const onClick = (event: MouseEvent) => {
      if (!nodeAt(event.clientX, event.clientY) && event.detail === 1) onSelectRef.current(null)
    }

    canvas.addEventListener('pointerdown', onDown, { capture: true })
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('dblclick', onDouble)
    canvas.addEventListener('contextmenu', onContext)
    canvas.addEventListener('click', onClick)

    return () => {
      themeObserver.disconnect()
      resizeObserver.disconnect()
      select(canvas).on('.zoom', null)
      canvas.removeEventListener('pointerdown', onDown, { capture: true })
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('dblclick', onDouble)
      canvas.removeEventListener('contextmenu', onContext)
      canvas.removeEventListener('click', onClick)
    }
  }, [nodeAt])

  // Latest callbacks for the long-lived listeners above.
  const onSelectRef = useRef(onSelect)
  const onRecenterRef = useRef(onRecenter)
  const selectedRef = useRef(selected)
  const fitRef = useRef(fit)
  useEffect(() => {
    onSelectRef.current = onSelect
    onRecenterRef.current = onRecenter
    selectedRef.current = selected
    fitRef.current = fit
  })

  // ---- render loop ------------------------------------------------------------
  useEffect(() => {
    let frame = 0
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      const canvas = canvasRef.current
      const theme = themeRef.current
      if (!canvas || !theme) return
      const focus = hoverRef.current ?? highlightRef.current ?? selectedRef.current
      if (focus !== focusRef.current) {
        focusRef.current = focus
        dirtyRef.current = true
      }
      // Particles animate continuously while someone is in focus.
      if (!dirtyRef.current && !focus) return
      dirtyRef.current = false

      // First settle: frame the whole network once.
      const sim = simRef.current
      if (!fittedRef.current && sim && sim.alpha() < 0.25 && visibleRef.current.nodes.length > 1) {
        fittedRef.current = true
        fitRef.current(true)
      }

      const ctx = canvas.getContext('2d')!
      const { width, height: h, dpr } = sizeRef.current
      const t = transformRef.current
      const { nodes: list, links: edges } = visibleRef.current
      const maxLink = Math.max(1, ...edges.map(e => e.weight))
      const groups = modeRef.current === 'groups'

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = hsl(theme.bg)
      ctx.fillRect(0, 0, width, h)
      const glow = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, Math.max(width, h) * 0.7)
      glow.addColorStop(0, hsl(theme.primary, 0.07))
      glow.addColorStop(1, hsl(theme.primary, 0))
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, width, h)

      ctx.translate(t.x, t.y)
      ctx.scale(t.k, t.k)
      const px = 1 / t.k

      const near = new Set<string>()
      if (focus) {
        near.add(focus)
        for (const e of edges) {
          if (e.source.id === focus) near.add(e.target.id)
          if (e.target.id === focus) near.add(e.source.id)
        }
      }

      // Links
      ctx.lineCap = 'round'
      for (const e of edges) {
        const active = focus ? e.source.id === focus || e.target.id === focus : false
        const sameGroup = groups && e.source.group >= 0 && e.source.group === e.target.group
        let alpha = e.toCenter ? 0.42 : sameGroup ? 0.32 : 0.1
        if (focus) alpha = active ? 0.9 : 0.035
        const colour = active || e.toCenter
          ? relationColor(e.data.ab.quotes + e.data.ba.quotes, e.data.ab.mentions + e.data.ba.mentions)
          : sameGroup
            ? groupColor(e.source.group)
            : hsl(theme.muted)
        ctx.globalAlpha = alpha
        ctx.strokeStyle = colour
        ctx.lineWidth = ((e.toCenter ? 1 : 0.5) + (e.toCenter ? 5 : 2.5) * Math.sqrt(e.weight / maxLink)) * Math.max(px, 0.35) * (active ? 1.4 : 1)
        ctx.beginPath()
        ctx.moveTo(e.source.x ?? 0, e.source.y ?? 0)
        ctx.lineTo(e.target.x ?? 0, e.target.y ?? 0)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Particles: direction of each quote/mention, a → b and b → a.
      if (focus) {
        const clock = now / 1000
        for (const e of edges) {
          if (e.source.id !== focus && e.target.id !== focus) continue
          const a = e.data.a === e.source.id ? e.source : e.target
          const b = a === e.source ? e.target : e.source
          for (const [from, to, counts] of [[a, b, e.data.ab], [b, a, e.data.ba]] as const) {
            const total = counts.quotes + counts.mentions
            if (!total) continue
            const dots = Math.min(7, 1 + Math.round(Math.log2(1 + total)))
            const colour = relationColor(counts.quotes, counts.mentions)
            const dx = (to.x ?? 0) - (from.x ?? 0)
            const dy = (to.y ?? 0) - (from.y ?? 0)
            const length = Math.hypot(dx, dy) || 1
            const speed = 60 / length
            for (let i = 0; i < dots; i++) {
              const p = (clock * speed + i / dots) % 1
              ctx.beginPath()
              ctx.fillStyle = colour
              ctx.arc((from.x ?? 0) + dx * p, (from.y ?? 0) + dy * p, 2.6 * Math.max(px, 0.4), 0, Math.PI * 2)
              ctx.fill()
            }
          }
        }
      }

      // Nodes: ring 2 first, centre and focus last.
      const order = [...list].sort(
        (x, y) =>
          Number(x.id === focus) - Number(y.id === focus) ||
          Number(x.data.hop === 0) - Number(y.data.hop === 0) ||
          y.data.hop - x.data.hop ||
          x.r - y.r
      )
      const labelled = new Set(
        list
          .filter(n => n.data.hop === 1)
          .sort((x, y) => y.data.weight - x.data.weight)
          .slice(0, t.k > 1.6 ? 60 : t.k > 1.1 ? 25 : 12)
          .map(n => n.id)
      )
      for (const node of order) {
        const x = node.x ?? 0
        const y = node.y ?? 0
        const dim = focus ? !near.has(node.id) : false
        const isFocus = node.id === focus
        const isSelected = node.id === selectedRef.current
        ctx.globalAlpha = dim ? 0.16 : 1
        const ring =
          node.data.hop === 0
            ? hsl(theme.primary)
            : groups
              ? groupColor(node.group)
              : node.data.hop === 1
                ? relationColor(node.data.toCenter.quotes + node.data.fromCenter.quotes, node.data.toCenter.mentions + node.data.fromCenter.mentions)
                : hsl(theme.muted)

        if (isFocus || isSelected || node.data.hop === 0) {
          ctx.shadowColor = ring
          ctx.shadowBlur = (node.data.hop === 0 ? 28 : 18) * Math.min(t.k, 2)
        }
        ctx.beginPath()
        ctx.arc(x, y, node.r + (isFocus ? 2 : 0), 0, Math.PI * 2)
        ctx.fillStyle = hsl(theme.card)
        ctx.fill()
        ctx.shadowBlur = 0

        const img = imagesRef.current.get(node.data.hop === 0 ? `${node.id}@200` : node.id)
        if (node.data.hop < 2 && img?.complete && img.naturalWidth > 0) {
          ctx.save()
          ctx.beginPath()
          ctx.arc(x, y, node.r - 1.5, 0, Math.PI * 2)
          ctx.clip()
          ctx.drawImage(img, x - node.r, y - node.r, node.r * 2, node.r * 2)
          ctx.restore()
        } else if (node.data.hop < 2) {
          ctx.fillStyle = hsl(theme.muted)
          ctx.font = `600 ${Math.max(7, node.r * 0.75)}px ui-sans-serif, system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(node.id.slice(0, 2).toUpperCase(), x, y + 0.5)
        } else {
          ctx.beginPath()
          ctx.arc(x, y, Math.max(node.r - 2.5, 1.5), 0, Math.PI * 2)
          ctx.fillStyle = groups ? groupColor(node.group) : hsl(theme.muted, 0.45)
          ctx.fill()
        }

        ctx.beginPath()
        ctx.arc(x, y, node.r + (isFocus ? 2 : 0), 0, Math.PI * 2)
        ctx.strokeStyle = ring
        ctx.lineWidth = (node.data.hop === 0 ? 3 : isFocus || isSelected ? 2.6 : 1.6) * Math.max(px, 0.5)
        ctx.stroke()
        if (isSelected && !isFocus) {
          ctx.beginPath()
          ctx.setLineDash([4 * px, 3 * px])
          ctx.arc(x, y, node.r + 5 * px, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
        }

        if (node.pinned) {
          ctx.beginPath()
          ctx.arc(x + node.r * 0.72, y - node.r * 0.72, 3.2 * Math.max(px, 0.5), 0, Math.PI * 2)
          ctx.fillStyle = hsl(theme.primary)
          ctx.fill()
          ctx.strokeStyle = hsl(theme.bg)
          ctx.lineWidth = 1.2 * px
          ctx.stroke()
        }

        const showLabel =
          node.data.hop === 0 ||
          isFocus ||
          isSelected ||
          (focus ? near.has(node.id) && (node.data.hop < 2 || t.k > 1.4) : labelled.has(node.id) || (node.data.hop === 2 && t.k > 2.6))
        if (showLabel) {
          const size = (node.data.hop === 0 ? 14 : 11) * px
          ctx.font = `${node.data.hop === 0 || isFocus ? 700 : 500} ${size}px ui-sans-serif, system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.lineWidth = 3.5 * px
          ctx.strokeStyle = hsl(theme.bg, 0.9)
          ctx.strokeText(node.id, x, y + node.r + 4 * px)
          ctx.fillStyle = hsl(theme.fg)
          ctx.fillText(node.id, x, y + node.r + 4 * px)
        }
        ctx.globalAlpha = 1
      }
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])

  const highlightRef = useRef(highlight)
  useEffect(() => {
    highlightRef.current = highlight
    dirtyRef.current = true
  }, [highlight])
  useEffect(() => {
    dirtyRef.current = true
  }, [selected])

  // ---- timeline playback ----------------------------------------------------
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setMonthIndex(current => {
        const next = current === null ? 0 : current + 1
        if (next >= months.length) {
          setPlaying(false)
          return null
        }
        return next
      })
    }, 650)
    return () => window.clearInterval(timer)
  }, [playing, months.length])

  // ---- toolbar actions ---------------------------------------------------------
  const releaseAll = () => {
    for (const node of poolRef.current.values()) {
      if (node.data.hop === 0) continue
      node.pinned = false
      node.fx = null
      node.fy = null
    }
    setPinnedCount(0)
    simRef.current?.alpha(0.8).restart()
  }

  const shuffle = () => {
    for (const node of visibleRef.current.nodes) {
      if (node.data.hop === 0 || node.pinned) continue
      node.x = (Math.random() - 0.5) * 600
      node.y = (Math.random() - 0.5) * 600
    }
    fittedRef.current = false
    simRef.current?.alpha(1).restart()
  }

  const exportPng = () => {
    canvasRef.current?.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `frt-netzwerk-${center.replace(/[^A-Za-z0-9_.-]/g, '')}${cutoff ? `-${cutoff}` : ''}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void containerRef.current?.requestFullscreen()
  }

  const search = (event: React.SubmitEvent) => {
    event.preventDefault()
    const q = query.trim().toLowerCase()
    if (!q) return
    const match =
      visibleRef.current.nodes.find(n => n.id.toLowerCase() === q) ??
      visibleRef.current.nodes.find(n => n.id.toLowerCase().startsWith(q)) ??
      visibleRef.current.nodes.find(n => n.id.toLowerCase().includes(q))
    if (match) {
      onSelect(match.id)
      flyTo(match.id)
    }
  }

  // Group legend: biggest groups with their strongest members.
  const legend = useMemo(() => {
    if (mode !== 'groups') return []
    const members = new Map<number, NetworkNode[]>()
    for (const [name, group] of visible.groups) {
      if (group < 0) continue
      const node = byName.get(name)
      if (node) members.set(group, [...(members.get(group) ?? []), node])
    }
    return Array.from(members.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(0, 8)
      .map(([group, list]) => ({
        group,
        size: list.length,
        // Direct contacts name the group; ring-2 weights are not comparable.
        names: list.sort((a, b) => a.hop - b.hop || b.weight - a.weight).slice(0, 3).map(n => n.username)
      }))
  }, [mode, visible.groups, byName])

  const hoverNode = hover ? byName.get(hover.id) : undefined
  const visibleContacts = Array.from(visible.names).filter(n => byName.get(n)?.hop === 1).length

  const button =
    'inline-flex h-8 items-center gap-1.5 rounded-sm px-2 text-[11px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground'

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-sm border border-primary/20 bg-background shadow-[inset_0_0_80px_hsl(var(--primary)/0.04)]"
      style={{ height: fullscreen ? '100vh' : height }}
    >
      <canvas ref={canvasRef} className="block touch-none" aria-label={`Netzwerk von ${center}`} role="img" />

      {/* Toolbar */}
      <div className="absolute left-3 right-3 top-3 flex flex-wrap items-start gap-2">
        <form onSubmit={search} className="flex h-8 items-center gap-1.5 rounded-sm border border-border/60 bg-card/85 px-2 backdrop-blur">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            list="network-people"
            placeholder="Person finden…"
            className="w-32 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60 sm:w-40"
          />
          <datalist id="network-people">
            {nodes.map(n => (
              <option key={n.username} value={n.username} />
            ))}
          </datalist>
        </form>
        <div className="flex h-8 items-center rounded-sm border border-border/60 bg-card/85 p-0.5 backdrop-blur" role="radiogroup" aria-label="Anordnung">
          {(
            [
              ['rings', 'Ringe', 'Abstand zur Mitte = wie eng der Kontakt ist'],
              ['force', 'Kraft', 'Freie Physik: wer viel miteinander redet, rückt zusammen'],
              ['groups', 'Gruppen', 'Erkannte Kreise bekommen eigene Bereiche und Farben']
            ] as const
          ).map(([id, label, title]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              title={title}
              onClick={() => setMode(id)}
              className={`h-full rounded-[2px] px-2.5 text-[11px] font-medium transition-colors ${
                mode === id ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex h-8 items-center rounded-sm border border-border/60 bg-card/85 backdrop-blur">
          <button type="button" className={button} onClick={() => fit(true)} title="Alles einpassen (oder Doppelklick auf den Hintergrund)">
            <LocateFixed className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={button} onClick={shuffle} title="Neu mischen">
            <Shuffle className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={button}
            onClick={releaseAll}
            disabled={!pinnedCount}
            title="Alle festgesteckten Personen lösen"
          >
            {pinnedCount ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            {pinnedCount > 0 && <span className="font-mono">{pinnedCount}</span>}
          </button>
          <button type="button" className={button} onClick={exportPng} title="Als Bild speichern">
            <Camera className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={button} onClick={toggleFullscreen} title={fullscreen ? 'Vollbild verlassen' : 'Vollbild'}>
            {fullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {legend.length > 0 && (
        <div className="absolute right-3 top-14 max-w-[220px] space-y-1 rounded-sm border border-border/60 bg-card/85 p-2 text-[10px] backdrop-blur">
          <div className="uppercase tracking-wider text-muted-foreground">Kreise</div>
          {legend.map(entry => (
            <div key={entry.group} className="flex items-start gap-1.5">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: groupColor(entry.group) }} />
              <span className="min-w-0">
                <span className="font-mono text-foreground">{entry.size}</span>{' '}
                <span className="text-muted-foreground">{entry.names.join(', ')}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Hover tooltip */}
      {hover && hoverNode && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-sm border border-primary/30 bg-card/95 p-2.5 text-[11px] shadow-xl backdrop-blur"
          style={{
            left: Math.min(hover.x + 14, sizeRef.current.width - 232),
            top: Math.min(hover.y + 14, sizeRef.current.height - 120)
          }}
        >
          <div className="font-semibold text-foreground">{hoverNode.username}</div>
          <div className="text-muted-foreground">
            {hoverNode.messages.toLocaleString('de-DE')} Nachrichten · {hoverNode.activeDays.toLocaleString('de-DE')} Tage
          </div>
          {hoverNode.hop === 1 && (
            <div className="mt-1.5 space-y-0.5 font-mono tabular-nums">
              <div>
                → {center}: <span className="text-amber-400">{hoverNode.toCenter.quotes}× Zitat</span> ·{' '}
                <span className="text-sky-400">{hoverNode.toCenter.mentions}× @</span>
              </div>
              <div>
                ← {center}: <span className="text-amber-400">{hoverNode.fromCenter.quotes}× Zitat</span> ·{' '}
                <span className="text-sky-400">{hoverNode.fromCenter.mentions}× @</span>
              </div>
            </div>
          )}
          {hoverNode.hop === 2 && <div className="mt-1 text-muted-foreground">Im Umfeld mehrerer Kontakte</div>}
          <div className="mt-1.5 text-[10px] text-muted-foreground/70">Klick: Details · Ziehen: festpinnen · Doppelklick: ins Zentrum</div>
        </div>
      )}

      {/* Timeline + legend */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        {months.length > 1 && (
          <div className="flex flex-1 items-center gap-2 rounded-sm border border-border/60 bg-card/85 px-2 py-1.5 backdrop-blur">
            <button
              type="button"
              onClick={() => {
                if (!playing && monthIndex === null) setMonthIndex(0)
                setPlaying(p => !p)
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground hover:bg-primary/90"
              aria-label={playing ? 'Pause' : 'Zeitreise abspielen'}
              title="Zeitreise: das Netzwerk Monat für Monat wachsen sehen"
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <input
              type="range"
              min={0}
              max={months.length}
              value={monthIndex ?? months.length}
              onChange={event => {
                const value = Number(event.target.value)
                setPlaying(false)
                setMonthIndex(value >= months.length ? null : value)
              }}
              className="h-1 flex-1 cursor-pointer accent-[hsl(var(--primary))]"
              aria-label="Zeitpunkt"
            />
            <span className="w-28 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground">
              {cutoff ? `bis ${monthLabel(cutoff)}` : 'alle Monate'}
            </span>
            <span className="hidden w-24 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground md:inline">
              {visibleContacts} Kontakte
            </span>
          </div>
        )}
        <div className="pointer-events-none flex items-center gap-3 rounded-sm border border-border/60 bg-card/85 px-2.5 py-2 text-[10px] text-muted-foreground backdrop-blur">
          <span className="flex items-center gap-1"><span className="h-0.5 w-4 rounded" style={{ background: QUOTE_COLOR }} /> Zitat</span>
          <span className="flex items-center gap-1"><span className="h-0.5 w-4 rounded" style={{ background: MENTION_COLOR }} /> @</span>
          <span className="hidden lg:inline">Punkte fließen in Richtung des Zitats</span>
        </div>
      </div>
    </div>
  )
}
