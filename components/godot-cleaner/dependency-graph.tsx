"use client"

import { useRef, useCallback, useState, useMemo, useEffect } from "react"
import type { GraphData, GraphNode, GraphLink } from "@/lib/scanner/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react"

// ── Palette ──────────────────────────────────────────────────────────────────

const STATE_COLORS = {
  entry: "#38bdf8",   // sky-400
  used: "#34d399",    // emerald-400
  unused: "#f87171",  // red-400
  dynamic: "#fbbf24", // amber-400
}

const TYPE_COLORS: Record<string, string> = {
  script: "#60a5fa",  // blue-400
  scene: "#34d399",   // emerald-400
  asset: "#fbbf24",   // amber-400
  resource: "#c084fc", // violet-400
  config: "#94a3b8",  // slate-400
  other: "#94a3b8",
}

const BG = "#0c0c14"
const GRID_COLOR = "rgba(255,255,255,0.025)"
const NODE_BG_USED = "#181825"
const NODE_BG_USED_HOVER = "#1e1e30"
const NODE_BG_ORPHAN = "rgba(248,113,113,0.04)"
const NODE_BG_ORPHAN_HOVER = "rgba(248,113,113,0.08)"
const TEXT_PRIMARY = "#f1f5f9"     // slate-100
const TEXT_SECONDARY = "#cbd5e1"   // slate-300
const TEXT_DIM = "#64748b"         // slate-500
const TEXT_LABEL = "#94a3b8"       // slate-400
const EDGE_COLOR = "rgba(148,163,184,0.10)"
const EDGE_COLOR_HIGHLIGHT = "rgba(148,163,184,0.40)"
const EDGE_ARROW = "rgba(148,163,184,0.25)"
const EDGE_ARROW_HIGHLIGHT = "rgba(148,163,184,0.55)"

// ── Layout constants ─────────────────────────────────────────────────────────

const COL_GAP = 300          // horizontal gap between depth columns
const ROW_GAP = 16           // vertical gap between nodes in same column
const NODE_W = 200           // used node width
const NODE_H = 52            // used node height
const ORPHAN_NODE_W = 180    // orphan nodes
const ORPHAN_NODE_H = 36
const PADDING_X = 100
const PADDING_Y = 80
const ORPHAN_GAP_X = 140     // gap between main graph and orphan zone
const ACCENT_BAR_W = 4       // left accent bar width
const GRID_SIZE = 40          // background grid cell size

// ── Types for layout ─────────────────────────────────────────────────────────

interface LayoutNode {
  id: string
  node: GraphNode
  x: number
  y: number
  w: number
  h: number
  depth: number
  refCount: number
  color: string
  isOrphan: boolean
}

interface LayoutEdge {
  source: LayoutNode
  target: LayoutNode
}

// ── Component ────────────────────────────────────────────────────────────────

interface DependencyGraphProps {
  graph: GraphData
  rawFiles: File[]
  onNodeClick?: (nodeId: string) => void
}

export function DependencyGraph({ graph, rawFiles, onNodeClick }: DependencyGraphProps) {
  void rawFiles
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [showUnused, setShowUnused] = useState(true)
  const [colorMode, setColorMode] = useState<"status" | "type">("status")
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  // Camera state
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 })
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({
    dragging: false, lastX: 0, lastY: 0,
  })

  // ── Responsive sizing ───────────────────────────────────────────────────────

  useEffect(() => {
    function update() {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({ width: rect.width, height: Math.max(600, rect.height) })
      }
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  // ── Compute DAG layout ──────────────────────────────────────────────────────

  const { layoutNodes, layoutEdges, totalWidth, totalHeight } = useMemo(() => {
    const adjForward = new Map<string, string[]>()
    const adjReverse = new Map<string, string[]>()
    const nodeMap = new Map<string, GraphNode>()

    for (const n of graph.nodes) {
      nodeMap.set(n.id, n)
      adjForward.set(n.id, [])
      adjReverse.set(n.id, [])
    }

    const nodeIds = new Set(graph.nodes.map(n => n.id))
    for (const link of graph.links) {
      const s = typeof link.source === "object" ? (link.source as GraphNode).id : link.source as string
      const t = typeof link.target === "object" ? (link.target as GraphNode).id : link.target as string
      if (nodeIds.has(s) && nodeIds.has(t)) {
        adjForward.get(s)!.push(t)
        adjReverse.get(t)!.push(s)
      }
    }

    // Reference counts
    const refCountMap = new Map<string, number>()
    for (const n of graph.nodes) {
      refCountMap.set(n.id, adjReverse.get(n.id)?.length ?? 0)
    }

    // BFS to assign depth layers
    const depthMap = new Map<string, number>()
    const entryNodes = graph.nodes.filter(n => n.isEntryPoint)
    const queue: { id: string; depth: number }[] = entryNodes.map(n => ({ id: n.id, depth: 0 }))
    const visited = new Set<string>()

    // Roots of subgraphs (used, non-entry, no parents)
    for (const n of graph.nodes) {
      if (n.used && !n.isEntryPoint) {
        const parents = adjReverse.get(n.id) ?? []
        if (parents.length === 0) {
          queue.push({ id: n.id, depth: 0 })
        }
      }
    }

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      depthMap.set(id, depth)
      const children = adjForward.get(id) ?? []
      for (const child of children) {
        if (!visited.has(child)) {
          queue.push({ id: child, depth: depth + 1 })
        }
      }
    }

    const orphanNodes = graph.nodes.filter(n => !visited.has(n.id))

    // Group by depth
    const columns = new Map<number, GraphNode[]>()
    for (const [id, depth] of depthMap.entries()) {
      const n = nodeMap.get(id)!
      if (!columns.has(depth)) columns.set(depth, [])
      columns.get(depth)!.push(n)
    }

    // Sort within each column
    for (const [, col] of columns) {
      col.sort((a, b) => {
        if (a.isEntryPoint !== b.isEntryPoint) return a.isEntryPoint ? -1 : 1
        const ra = refCountMap.get(a.id) ?? 0
        const rb = refCountMap.get(b.id) ?? 0
        if (ra !== rb) return rb - ra
        return a.label.localeCompare(b.label)
      })
    }

    // Assign positions
    const maxDepth = Math.max(0, ...depthMap.values())
    const lnodes: LayoutNode[] = []
    const nodeLayoutMap = new Map<string, LayoutNode>()

    for (let d = 0; d <= maxDepth; d++) {
      const col = columns.get(d) ?? []
      for (let i = 0; i < col.length; i++) {
        const n = col[i]
        const refCount = refCountMap.get(n.id) ?? 0
        const color = getNodeColor(n, colorMode)
        const ln: LayoutNode = {
          id: n.id,
          node: n,
          x: PADDING_X + d * COL_GAP,
          y: PADDING_Y + i * (NODE_H + ROW_GAP),
          w: NODE_W,
          h: NODE_H,
          depth: d,
          refCount,
          color,
          isOrphan: false,
        }
        lnodes.push(ln)
        nodeLayoutMap.set(n.id, ln)
      }
    }

    // Center columns vertically relative to tallest
    const colHeights = Array.from({ length: maxDepth + 1 }, (_, d) => {
      const col = columns.get(d) ?? []
      return col.length * (NODE_H + ROW_GAP) - ROW_GAP
    })
    const maxColHeight = Math.max(1, ...colHeights)

    for (const ln of lnodes) {
      if (ln.isOrphan) continue
      const col = columns.get(ln.depth) ?? []
      const colH = col.length * (NODE_H + ROW_GAP) - ROW_GAP
      ln.y += (maxColHeight - colH) / 2
    }

    // Orphan zone
    let rightEdge = PADDING_X + (maxDepth + 1) * COL_GAP + ORPHAN_GAP_X
    if (maxDepth < 0) rightEdge = PADDING_X + ORPHAN_GAP_X

    if (showUnused && orphanNodes.length > 0) {
      const orphanCols = 4
      const orphanColGap = ORPHAN_NODE_W + 16
      const orphanRowGap = ORPHAN_NODE_H + 12

      orphanNodes.sort((a, b) => a.label.localeCompare(b.label))

      for (let i = 0; i < orphanNodes.length; i++) {
        const n = orphanNodes[i]
        const col = i % orphanCols
        const row = Math.floor(i / orphanCols)
        const refCount = refCountMap.get(n.id) ?? 0
        const color = getNodeColor(n, colorMode)
        const ln: LayoutNode = {
          id: n.id,
          node: n,
          x: rightEdge + col * orphanColGap,
          y: PADDING_Y + 36 + row * orphanRowGap, // 36px offset for zone header
          w: ORPHAN_NODE_W,
          h: ORPHAN_NODE_H,
          depth: -1,
          refCount,
          color,
          isOrphan: true,
        }
        lnodes.push(ln)
        nodeLayoutMap.set(n.id, ln)
      }
    }

    // Build edges
    const ledges: LayoutEdge[] = []
    for (const link of graph.links) {
      const s = typeof link.source === "object" ? (link.source as GraphNode).id : link.source as string
      const t = typeof link.target === "object" ? (link.target as GraphNode).id : link.target as string
      const sn = nodeLayoutMap.get(s)
      const tn = nodeLayoutMap.get(t)
      if (sn && tn) ledges.push({ source: sn, target: tn })
    }

    // Bounds
    let tw = 0, th = 0
    for (const ln of lnodes) {
      tw = Math.max(tw, ln.x + ln.w + PADDING_X)
      th = Math.max(th, ln.y + ln.h + PADDING_Y)
    }

    return { layoutNodes: lnodes, layoutEdges: ledges, totalWidth: tw, totalHeight: th }
  }, [graph, showUnused, colorMode])

  // ── Fit to view ────────────────────────────────────────────────────────────

  const fitView = useCallback(() => {
    if (totalWidth === 0 || totalHeight === 0) return
    const zoom = Math.min(
      dimensions.width / totalWidth,
      dimensions.height / totalHeight,
      1.5
    ) * 0.88
    cameraRef.current = {
      x: (dimensions.width - totalWidth * zoom) / 2,
      y: (dimensions.height - totalHeight * zoom) / 2,
      zoom,
    }
  }, [dimensions, totalWidth, totalHeight])

  useEffect(() => {
    fitView()
    requestDraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutNodes, dimensions, totalWidth, totalHeight])

  // ── Drawing ─────────────────────────────────────────────────────────────────

  const requestDraw = useCallback(() => {
    requestAnimationFrame(() => draw())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = dimensions.width * dpr
    canvas.height = dimensions.height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const cam = cameraRef.current

    // Clear
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, dimensions.width, dimensions.height)

    ctx.save()
    ctx.translate(cam.x, cam.y)
    ctx.scale(cam.zoom, cam.zoom)

    // ── Background grid ───────────────────────────────────────────────────────
    const gridStart = screenToWorld(0, 0)
    const gridEnd = screenToWorld(dimensions.width, dimensions.height)
    const gs = GRID_SIZE
    const gx0 = Math.floor(gridStart.x / gs) * gs
    const gy0 = Math.floor(gridStart.y / gs) * gs

    ctx.strokeStyle = GRID_COLOR
    ctx.lineWidth = 1
    for (let x = gx0; x <= gridEnd.x; x += gs) {
      ctx.beginPath()
      ctx.moveTo(x, gridStart.y)
      ctx.lineTo(x, gridEnd.y)
      ctx.stroke()
    }
    for (let y = gy0; y <= gridEnd.y; y += gs) {
      ctx.beginPath()
      ctx.moveTo(gridStart.x, y)
      ctx.lineTo(gridEnd.x, y)
      ctx.stroke()
    }

    // ── Depth column headers ──────────────────────────────────────────────────
    const maxDepth = Math.max(0, ...layoutNodes.filter(n => !n.isOrphan).map(n => n.depth))
    const depthLabels = ["Entry Points", "Direct Deps", "Scripts", "Resources", "Assets"]
    for (let d = 0; d <= maxDepth; d++) {
      const x = PADDING_X + d * COL_GAP
      const labelY = PADDING_Y - 28

      // Header background pill
      const label = depthLabels[d] || `Depth ${d}`
      ctx.font = "700 13px 'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif"
      const tw = ctx.measureText(label).width
      roundedRect(ctx, x + NODE_W / 2 - tw / 2 - 14, labelY - 12, tw + 28, 24, 6)
      ctx.fillStyle = "rgba(255,255,255,0.04)"
      ctx.fill()
      ctx.strokeStyle = "rgba(255,255,255,0.06)"
      ctx.lineWidth = 1
      ctx.stroke()

      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillStyle = TEXT_LABEL
      ctx.fillText(label, x + NODE_W / 2, labelY)
    }

    // ── Orphan zone ──────────────────────────────────────────────────────────
    if (showUnused) {
      const orphans = layoutNodes.filter(n => n.isOrphan)
      if (orphans.length > 0) {
        const minX = Math.min(...orphans.map(n => n.x)) - 24
        const minY = Math.min(...orphans.map(n => n.y)) - 48
        const maxX = Math.max(...orphans.map(n => n.x + n.w)) + 24
        const maxY = Math.max(...orphans.map(n => n.y + n.h)) + 24

        // Zone background
        roundedRect(ctx, minX, minY, maxX - minX, maxY - minY, 12)
        ctx.fillStyle = "rgba(248,113,113,0.02)"
        ctx.fill()
        ctx.strokeStyle = "rgba(248,113,113,0.10)"
        ctx.lineWidth = 1.5
        ctx.setLineDash([8, 5])
        ctx.stroke()
        ctx.setLineDash([])

        // Zone label
        ctx.font = "700 13px 'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif"
        ctx.fillStyle = "rgba(248,113,113,0.60)"
        ctx.textAlign = "left"
        ctx.textBaseline = "bottom"
        ctx.fillText(`Orphan Files (${orphans.length})`, minX + 12, minY - 10)
      }
    }

    // ── Edges ─────────────────────────────────────────────────────────────────
    for (const edge of layoutEdges) {
      drawEdge(ctx, edge, hoveredNodeId)
    }

    // ── Nodes (orphans first, used on top) ────────────────────────────────────
    const orphanNodes = layoutNodes.filter(n => n.isOrphan)
    const usedNodes = layoutNodes.filter(n => !n.isOrphan)
    for (const ln of orphanNodes) drawNode(ctx, ln, hoveredNodeId)
    for (const ln of usedNodes) drawNode(ctx, ln, hoveredNodeId)

    ctx.restore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutNodes, layoutEdges, dimensions, hoveredNodeId, showUnused])

  useEffect(() => { draw() }, [draw])

  // ── Interaction handlers ────────────────────────────────────────────────────

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const cam = cameraRef.current
    return {
      x: (sx - cam.x) / cam.zoom,
      y: (sy - cam.y) / cam.zoom,
    }
  }, [])

  const findNodeAt = useCallback((wx: number, wy: number): LayoutNode | null => {
    for (let i = layoutNodes.length - 1; i >= 0; i--) {
      const ln = layoutNodes[i]
      if (wx >= ln.x && wx <= ln.x + ln.w && wy >= ln.y && wy <= ln.y + ln.h) {
        return ln
      }
    }
    return null
  }, [layoutNodes])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    if (dragRef.current.dragging) {
      const dx = e.clientX - dragRef.current.lastX
      const dy = e.clientY - dragRef.current.lastY
      cameraRef.current.x += dx
      cameraRef.current.y += dy
      dragRef.current.lastX = e.clientX
      dragRef.current.lastY = e.clientY
      draw()
      return
    }

    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { x: wx, y: wy } = screenToWorld(sx, sy)
    const node = findNodeAt(wx, wy)
    const newId = node?.id ?? null
    if (newId !== hoveredNodeId) setHoveredNodeId(newId)
  }, [draw, screenToWorld, findNodeAt, hoveredNodeId])

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false
  }, [])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!onNodeClick) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { x: wx, y: wy } = screenToWorld(sx, sy)
    const node = findNodeAt(wx, wy)
    if (node) onNodeClick(node.id)
  }, [onNodeClick, screenToWorld, findNodeAt])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const cam = cameraRef.current
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    const newZoom = Math.min(Math.max(cam.zoom * factor, 0.05), 6)
    cam.x = sx - (sx - cam.x) * (newZoom / cam.zoom)
    cam.y = sy - (sy - cam.y) * (newZoom / cam.zoom)
    cam.zoom = newZoom
    draw()
  }, [draw])

  // ── Zoom controls ───────────────────────────────────────────────────────────

  const handleZoomIn = useCallback(() => {
    const cam = cameraRef.current
    const cx = dimensions.width / 2, cy = dimensions.height / 2
    const newZoom = Math.min(cam.zoom * 1.4, 6)
    cam.x = cx - (cx - cam.x) * (newZoom / cam.zoom)
    cam.y = cy - (cy - cam.y) * (newZoom / cam.zoom)
    cam.zoom = newZoom
    draw()
  }, [draw, dimensions])

  const handleZoomOut = useCallback(() => {
    const cam = cameraRef.current
    const cx = dimensions.width / 2, cy = dimensions.height / 2
    const newZoom = Math.max(cam.zoom / 1.4, 0.05)
    cam.x = cx - (cx - cam.x) * (newZoom / cam.zoom)
    cam.y = cy - (cy - cam.y) * (newZoom / cam.zoom)
    cam.zoom = newZoom
    draw()
  }, [draw, dimensions])

  const handleFit = useCallback(() => {
    fitView()
    draw()
  }, [fitView, draw])

  // ── Counts ──────────────────────────────────────────────────────────────────

  const usedCount = graph.nodes.filter(n => n.used).length
  const unusedCount = graph.nodes.filter(n => !n.used).length

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={handleZoomIn} className="h-8 w-8 p-0 cursor-pointer">
            <ZoomIn className="h-4 w-4" />
            <span className="sr-only">Zoom in</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={handleZoomOut} className="h-8 w-8 p-0 cursor-pointer">
            <ZoomOut className="h-4 w-4" />
            <span className="sr-only">Zoom out</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={handleFit} className="h-8 w-8 p-0 cursor-pointer">
            <Maximize2 className="h-4 w-4" />
            <span className="sr-only">Fit to view</span>
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox id="show-unused" checked={showUnused} onCheckedChange={(v) => setShowUnused(v === true)} />
          <Label htmlFor="show-unused" className="text-xs text-muted-foreground cursor-pointer">
            Show orphan files
          </Label>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant={colorMode === "status" ? "default" : "secondary"}
            size="sm"
            className="h-7 text-xs px-3 cursor-pointer"
            onClick={() => setColorMode("status")}
          >
            By Status
          </Button>
          <Button
            variant={colorMode === "type" ? "default" : "secondary"}
            size="sm"
            className="h-7 text-xs px-3 cursor-pointer"
            onClick={() => setColorMode("type")}
          >
            By Type
          </Button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 ml-auto">
          {colorMode === "status" ? (
            <>
              <LegendItem color={STATE_COLORS.entry} label="Entry Point" variant="solid" />
              <LegendItem color={STATE_COLORS.used} label="Reachable" variant="solid" />
              <LegendItem color={STATE_COLORS.unused} label="Orphan" variant="dashed" />
              <LegendItem color={STATE_COLORS.dynamic} label="Dynamic" variant="solid" />
            </>
          ) : (
            <>
              <LegendItem color={TYPE_COLORS.scene} label="Scene" variant="solid" />
              <LegendItem color={TYPE_COLORS.script} label="Script" variant="solid" />
              <LegendItem color={TYPE_COLORS.resource} label="Resource" variant="solid" />
              <LegendItem color={TYPE_COLORS.asset} label="Asset" variant="solid" />
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">{usedCount} reachable</Badge>
        <Badge variant="secondary" className="text-xs">{unusedCount} orphans</Badge>
        <Badge variant="secondary" className="text-xs">{layoutEdges.length} edges</Badge>
      </div>

      {/* Graph canvas */}
      <div
        ref={containerRef}
        className="rounded-xl border border-border/60 overflow-hidden"
        style={{ background: BG }}
      >
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          style={{
            width: dimensions.width,
            height: dimensions.height,
            cursor: dragRef.current.dragging ? "grabbing" : "grab",
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleClick}
          onWheel={handleWheel}
        />
      </div>
    </div>
  )
}

// ── Drawing helpers ──────────────────────────────────────────────────────────

function getNodeColor(node: GraphNode, colorMode: "status" | "type"): string {
  if (colorMode === "status") {
    if (node.isEntryPoint) return STATE_COLORS.entry
    if (node.hasDynamicLoad) return STATE_COLORS.dynamic
    return node.used ? STATE_COLORS.used : STATE_COLORS.unused
  }
  return TYPE_COLORS[node.category] || TYPE_COLORS.other
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (ctx.measureText(t + "\u2026").width > maxWidth && t.length > 2) t = t.slice(0, -1)
  return t + "\u2026"
}

function getFileName(id: string): string {
  const parts = id.replace("res://", "").split("/")
  return parts[parts.length - 1] || id
}

function hexToRGBA(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function drawEdge(ctx: CanvasRenderingContext2D, edge: LayoutEdge, hoveredNodeId: string | null) {
  const s = edge.source
  const t = edge.target
  const isHighlighted = hoveredNodeId === s.id || hoveredNodeId === t.id

  const sx = s.x + s.w
  const sy = s.y + s.h / 2
  const tx = t.x
  const ty = t.y + t.h / 2

  // Bezier control points for smooth left-to-right curve
  const dx = Math.abs(tx - sx)
  const cpOffset = Math.max(dx * 0.4, 40)

  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.bezierCurveTo(sx + cpOffset, sy, tx - cpOffset, ty, tx, ty)
  ctx.strokeStyle = isHighlighted ? EDGE_COLOR_HIGHLIGHT : EDGE_COLOR
  ctx.lineWidth = isHighlighted ? 2 : 1
  ctx.stroke()

  // Arrowhead
  const arrowLen = isHighlighted ? 8 : 6
  const angle = Math.atan2(ty - (ty * 0.6 + sy * 0.4), tx - (tx - cpOffset))
  ctx.beginPath()
  ctx.moveTo(tx, ty)
  ctx.lineTo(tx - arrowLen * Math.cos(angle - 0.3), ty - arrowLen * Math.sin(angle - 0.3))
  ctx.lineTo(tx - arrowLen * Math.cos(angle + 0.3), ty - arrowLen * Math.sin(angle + 0.3))
  ctx.closePath()
  ctx.fillStyle = isHighlighted ? EDGE_ARROW_HIGHLIGHT : EDGE_ARROW
  ctx.fill()
}

function drawNode(ctx: CanvasRenderingContext2D, ln: LayoutNode, hoveredNodeId: string | null) {
  const isHovered = hoveredNodeId === ln.id
  const n = ln.node
  const fileName = getFileName(ln.id)
  const { x, y, w, h, color } = ln
  const category = n.category

  // ── Orphan node ─────────────────────────────────────────────────────────────
  if (ln.isOrphan) {
    const r = 5
    roundedRect(ctx, x, y, w, h, r)
    ctx.fillStyle = isHovered ? NODE_BG_ORPHAN_HOVER : NODE_BG_ORPHAN
    ctx.fill()
    ctx.strokeStyle = isHovered ? hexToRGBA(color, 0.5) : hexToRGBA(color, 0.18)
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.stroke()
    ctx.setLineDash([])

    // Left accent bar
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y + 4, 3, h - 8)
    ctx.fillStyle = hexToRGBA(color, isHovered ? 0.6 : 0.25)
    ctx.fill()
    ctx.restore()

    // Filename
    ctx.font = `600 12px 'Geist Mono', ui-monospace, SFMono-Regular, monospace`
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillStyle = isHovered ? TEXT_SECONDARY : TEXT_DIM
    ctx.fillText(truncateText(ctx, fileName, w - 20), x + 12, y + h / 2)
    return
  }

  // ── Used node ───────────────────────────────────────────────────────────────

  // Determine corner radius by type
  const r = category === "scene" ? 4 : category === "script" ? 12 : 8

  // Subtle glow behind on hover
  if (isHovered) {
    ctx.save()
    ctx.shadowColor = hexToRGBA(color, 0.25)
    ctx.shadowBlur = 20
    ctx.shadowOffsetY = 0
    roundedRect(ctx, x, y, w, h, r)
    ctx.fillStyle = NODE_BG_USED_HOVER
    ctx.fill()
    ctx.restore()
  } else {
    // Subtle drop shadow
    ctx.save()
    ctx.shadowColor = "rgba(0,0,0,0.4)"
    ctx.shadowBlur = 8
    ctx.shadowOffsetY = 2
    roundedRect(ctx, x, y, w, h, r)
    ctx.fillStyle = NODE_BG_USED
    ctx.fill()
    ctx.restore()
  }

  // Border
  roundedRect(ctx, x, y, w, h, r)
  ctx.strokeStyle = isHovered ? hexToRGBA(color, 0.7) : hexToRGBA(color, 0.3)
  ctx.lineWidth = isHovered ? 2 : 1.2
  ctx.stroke()

  // Left accent bar (thick, full height, inside border radius)
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + ACCENT_BAR_W, y)
  ctx.lineTo(x + ACCENT_BAR_W, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fillStyle = isHovered ? color : hexToRGBA(color, 0.8)
  ctx.fill()
  ctx.restore()

  // Entry point indicator ring
  if (n.isEntryPoint) {
    roundedRect(ctx, x - 5, y - 5, w + 10, h + 10, r + 3)
    ctx.strokeStyle = hexToRGBA(color, 0.2)
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.stroke()
    ctx.setLineDash([])
  }

  // ── Text ────────────────────────────────────────────────────────────────────
  const textX = x + ACCENT_BAR_W + 10
  const textMaxW = w - ACCENT_BAR_W - 20

  // Filename (large, bold)
  ctx.font = `700 13px 'Geist Mono', ui-monospace, SFMono-Regular, monospace`
  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  ctx.fillStyle = TEXT_PRIMARY
  ctx.fillText(truncateText(ctx, fileName, textMaxW), textX, y + 10)

  // Category + ref count (secondary line)
  const catLabel = category.charAt(0).toUpperCase() + category.slice(1)
  const refLabel = ln.refCount > 0 ? ` \u00b7 ${ln.refCount} ref${ln.refCount > 1 ? "s" : ""}` : ""
  ctx.font = `500 11px 'Geist', ui-sans-serif, system-ui, sans-serif`
  ctx.fillStyle = hexToRGBA(color, 0.7)
  ctx.fillText(catLabel + refLabel, textX, y + 30)
}

// ── Legend ───────────────────────────────────────────────────────────────────

function LegendItem({ color, label, variant }: { color: string; label: string; variant: "solid" | "dashed" }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-3 w-5 rounded-sm"
        style={{
          backgroundColor: variant === "dashed" ? "transparent" : color,
          border: variant === "dashed" ? `1.5px dashed ${color}` : `1.5px solid ${color}`,
        }}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
