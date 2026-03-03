"use client"

import { useMemo } from "react"
import type { AnalysisResults } from "@/lib/scanner/types"
import type { InspectorCategory } from "./category-inspector"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  FileCode2,
  FileImage,
  Box,
  FileText,
  Trash2,
  HardDrive,
  Network,
  AlertTriangle,
  GitBranch,
  Copy,
  Link,
} from "lucide-react"

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`
}

interface StatsOverviewProps {
  results: AnalysisResults
  activeCategory: InspectorCategory | null
  onCategoryClick: (category: InspectorCategory) => void
}

const DELAYS = ["", "delay-75", "delay-150", "delay-200", "delay-300", "delay-400", "delay-500", "delay-600", "delay-700"]

function basename(resPath: string): string {
  return resPath.split("/").pop() ?? resPath
}

function useInsights(results: AnalysisResults) {
  return useMemo(() => {
    const { graph, unusedFiles, duplicateFunctions } = results

    // 1. Most connected script — highest in-degree among script nodes
    const inDegree = new Map<string, number>()
    for (const node of graph.nodes) inDegree.set(node.id, 0)
    for (const link of graph.links) {
      inDegree.set(link.target, (inDegree.get(link.target) ?? 0) + 1)
    }
    const outDegree = new Map<string, number>()
    for (const link of graph.links) {
      outDegree.set(link.source, (outDegree.get(link.source) ?? 0) + 1)
    }
    const scriptNodes = graph.nodes.filter((n) => n.category === "script")
    const mostConnectedScript = scriptNodes.reduce<{ id: string; connections: number } | null>(
      (best, n) => {
        const total = (inDegree.get(n.id) ?? 0) + (outDegree.get(n.id) ?? 0)
        return !best || total > best.connections ? { id: n.id, connections: total } : best
      },
      null
    )

    // 2. Largest scene by size (across all files)
    const allFiles = [...results.usedFiles, ...unusedFiles]
    const sceneFiles = allFiles.filter((f) => f.category === "scene")
    const largestScene = sceneFiles.reduce<{ name: string; size: number } | null>(
      (best, f) => (!best || f.size > best.size ? { name: basename(f.resPath), size: f.size } : best),
      null
    )

    // 3. Deepest dependency chain — longest BFS path from any entry point
    const adjacency = new Map<string, string[]>()
    for (const link of graph.links) {
      if (!adjacency.has(link.source)) adjacency.set(link.source, [])
      adjacency.get(link.source)!.push(link.target)
    }
    let maxDepth = 0
    let deepestStart = ""
    for (const entry of results.entryPoints) {
      const visited = new Set<string>()
      const queue: [string, number][] = [[entry, 0]]
      while (queue.length) {
        const [node, depth] = queue.shift()!
        if (visited.has(node)) continue
        visited.add(node)
        if (depth > maxDepth) { maxDepth = depth; deepestStart = entry }
        for (const child of adjacency.get(node) ?? []) queue.push([child, depth + 1])
      }
    }

    // 4. Largest orphan cluster — BFS over unused subgraph
    const unusedPaths = new Set(unusedFiles.map((f) => f.resPath))
    const unusedAdj = new Map<string, string[]>()
    for (const link of graph.links) {
      if (unusedPaths.has(link.source) && unusedPaths.has(link.target)) {
        if (!unusedAdj.has(link.source)) unusedAdj.set(link.source, [])
        unusedAdj.get(link.source)!.push(link.target)
        if (!unusedAdj.has(link.target)) unusedAdj.set(link.target, [])
        unusedAdj.get(link.target)!.push(link.source)
      }
    }
    const visitedOrphan = new Set<string>()
    let largestCluster = 0
    for (const start of unusedPaths) {
      if (visitedOrphan.has(start)) continue
      const stack = [start]
      let size = 0
      while (stack.length) {
        const node = stack.pop()!
        if (visitedOrphan.has(node)) continue
        visitedOrphan.add(node)
        size++
        for (const neighbor of unusedAdj.get(node) ?? []) stack.push(neighbor)
      }
      if (size > largestCluster) largestCluster = size
    }

    // 5. Most duplicated function
    const mostDuplicated = duplicateFunctions.reduce<{ name: string; count: number } | null>(
      (best, g) =>
        !best || g.occurrences.length > best.count
          ? { name: g.functionName, count: g.occurrences.length }
          : best,
      null
    )

    return { mostConnectedScript, largestScene, maxDepth, deepestStart, largestCluster, mostDuplicated }
  }, [results])
}

export function StatsOverview({ results, activeCategory, onCategoryClick }: StatsOverviewProps) {
  const insights = useInsights(results)

  const usedCount = results.usedFiles.length
  const unusedCount = results.unusedFiles.length
  const usedPercent = results.totalFiles > 0 ? Math.round((usedCount / results.totalFiles) * 100) : 0

  const stats: {
    key: InspectorCategory
    label: string
    value: string
    icon: typeof HardDrive
    color: string
    valueColor: string
    bgColor: string
    borderColor: string
    activeBorderColor: string
    glowColor: string
    barColor: string
    proportion: number
  }[] = [
    {
      key: "total",
      label: "Total Files",
      value: results.totalFiles.toLocaleString(),
      icon: HardDrive,
      color: "text-primary",
      valueColor: "text-primary",
      bgColor: "bg-primary/10",
      borderColor: "border-primary/10",
      activeBorderColor: "border-primary/50",
      glowColor: "shadow-primary/15",
      barColor: "bg-primary",
      proportion: 1,
    },
    {
      key: "script",
      label: "Scripts",
      value: results.categoryCounts.script.toLocaleString(),
      icon: FileCode2,
      color: "text-chart-1",
      valueColor: "text-chart-1",
      bgColor: "bg-chart-1/10",
      borderColor: "border-chart-1/10",
      activeBorderColor: "border-chart-1/50",
      glowColor: "shadow-chart-1/15",
      barColor: "bg-chart-1",
      proportion: results.totalFiles > 0 ? results.categoryCounts.script / results.totalFiles : 0,
    },
    {
      key: "scene",
      label: "Scenes",
      value: results.categoryCounts.scene.toLocaleString(),
      icon: Box,
      color: "text-chart-2",
      valueColor: "text-chart-2",
      bgColor: "bg-chart-2/10",
      borderColor: "border-chart-2/10",
      activeBorderColor: "border-chart-2/50",
      glowColor: "shadow-chart-2/15",
      barColor: "bg-chart-2",
      proportion: results.totalFiles > 0 ? results.categoryCounts.scene / results.totalFiles : 0,
    },
    {
      key: "asset",
      label: "Assets",
      value: results.categoryCounts.asset.toLocaleString(),
      icon: FileImage,
      color: "text-chart-4",
      valueColor: "text-chart-4",
      bgColor: "bg-chart-4/10",
      borderColor: "border-chart-4/10",
      activeBorderColor: "border-chart-4/50",
      glowColor: "shadow-chart-4/15",
      barColor: "bg-chart-4",
      proportion: results.totalFiles > 0 ? results.categoryCounts.asset / results.totalFiles : 0,
    },
    {
      key: "resource",
      label: "Resources",
      value: results.categoryCounts.resource.toLocaleString(),
      icon: FileText,
      color: "text-chart-3",
      valueColor: "text-chart-3",
      bgColor: "bg-chart-3/10",
      borderColor: "border-chart-3/10",
      activeBorderColor: "border-chart-3/50",
      glowColor: "shadow-chart-3/15",
      barColor: "bg-chart-3",
      proportion: results.totalFiles > 0 ? results.categoryCounts.resource / results.totalFiles : 0,
    },
    {
      key: "unused",
      label: "Unused Files",
      value: results.unusedFiles.length.toLocaleString(),
      icon: Trash2,
      color: "text-status-unused",
      valueColor: "text-status-unused",
      bgColor: "bg-status-unused/10",
      borderColor: "border-status-unused/15",
      activeBorderColor: "border-status-unused/50",
      glowColor: "shadow-status-unused/15",
      barColor: "bg-status-unused",
      proportion: results.totalFiles > 0 ? results.unusedFiles.length / results.totalFiles : 0,
    },
    {
      key: "reclaimable",
      label: "Reclaimable",
      value: formatBytes(results.unusedSize),
      icon: HardDrive,
      color: "text-status-unused",
      valueColor: "text-status-unused",
      bgColor: "bg-status-unused/10",
      borderColor: "border-status-unused/15",
      activeBorderColor: "border-status-unused/50",
      glowColor: "shadow-status-unused/15",
      barColor: "bg-status-unused",
      proportion: 0.65,
    },
    {
      key: "graph",
      label: "Graph Nodes",
      value: results.graph.nodes.length.toLocaleString(),
      icon: Network,
      color: "text-primary",
      valueColor: "text-primary",
      bgColor: "bg-primary/10",
      borderColor: "border-primary/10",
      activeBorderColor: "border-primary/50",
      glowColor: "shadow-primary/15",
      barColor: "bg-primary",
      proportion: 0.8,
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* Stat cards grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat, idx) => {
        const isActive = activeCategory === stat.key
        return (
          <button
            key={stat.key}
            onClick={() => onCategoryClick(stat.key)}
            className={`text-left transition-all duration-300 animate-fade-in-up ${DELAYS[idx] || ""} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-xl`}
          >
            <Card
              className={`relative py-4 gap-2 overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 group ${
                isActive
                  ? `${stat.activeBorderColor} shadow-md -translate-y-0.5 ring-1 ring-inset ${stat.activeBorderColor} ${stat.glowColor}`
                  : `${stat.borderColor} hover:${stat.activeBorderColor} hover:${stat.glowColor}`
              }`}
            >
              {/* Colored left accent bar */}
              <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl transition-opacity duration-300 ${stat.barColor} ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`} />

              <CardHeader className="pb-0 px-4 gap-0">
                <div className="flex items-center gap-2.5">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300 ${stat.bgColor} ${isActive ? "scale-110" : "group-hover:scale-105"}`}>
                    <stat.icon className={`h-4 w-4 ${stat.color} transition-transform duration-300`} />
                  </div>
                  <CardTitle className="text-xs text-muted-foreground font-normal transition-colors duration-200 group-hover:text-foreground/80">
                    {stat.label}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-4 flex flex-col gap-2">
                <span className={`text-2xl font-bold tabular-nums tracking-tight transition-colors duration-300 ${isActive ? stat.valueColor : "text-card-foreground"} group-hover:${stat.valueColor}`}>
                  {stat.value}
                </span>
                {/* Mini proportion bar */}
                <div className="h-1 w-full rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${stat.barColor} transition-all duration-700 ease-out opacity-60 group-hover:opacity-100`}
                    style={{ width: `${Math.max(stat.proportion * 100, 4)}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          </button>
        )
      })}
      {results.dynamicLoadFiles.length > 0 && (
        <button
          onClick={() => onCategoryClick("dynamic")}
          className={`text-left transition-all duration-300 animate-fade-in-up delay-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-xl`}
        >
          <Card className={`relative py-4 gap-2 overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 group ${
            activeCategory === "dynamic"
              ? "border-status-warning/50 shadow-md -translate-y-0.5 ring-1 ring-inset ring-status-warning/50 shadow-status-warning/15"
              : "border-status-warning/20 hover:border-status-warning/40"
          }`}>
            <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl bg-status-warning transition-opacity duration-300 ${activeCategory === "dynamic" ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`} />
            <CardHeader className="pb-0 px-4 gap-0">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-status-warning/10 transition-all duration-300 ${activeCategory === "dynamic" ? "scale-110" : "group-hover:scale-105"}`}>
                  <AlertTriangle className="h-4 w-4 text-status-warning" />
                </div>
                <CardTitle className="text-xs text-muted-foreground font-normal transition-colors duration-200 group-hover:text-foreground/80">
                  Dynamic Loads
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 flex flex-col gap-2">
              <span className="text-2xl font-bold text-status-warning tabular-nums tracking-tight">
                {results.dynamicLoadFiles.length}
              </span>
              <div className="h-1 w-full rounded-full bg-muted/50 overflow-hidden">
                <div className="h-full rounded-full bg-status-warning opacity-60 group-hover:opacity-100 transition-opacity duration-300" style={{ width: "30%" }} />
              </div>
            </CardContent>
          </Card>
        </button>
      )}
    </div>

      {/* Dynamic load disclaimer */}
      {results.dynamicLoadFiles.length > 0 && (
        <div className="rounded-xl border border-status-warning/20 bg-status-warning/5 p-3 flex items-start gap-2.5 animate-fade-in">
          <AlertTriangle className="h-4 w-4 text-status-warning shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-foreground">
              Dynamic load() detected in {results.dynamicLoadFiles.length} file{results.dynamicLoadFiles.length !== 1 ? "s" : ""}
            </span>
            <span className="text-[10px] text-muted-foreground leading-relaxed">
              Some scripts construct resource paths at runtime. Unused file detection may not
              be 100% accurate for dynamically loaded assets. Files that could be dynamically
              loaded are marked as &ldquo;uncertain&rdquo; in the deletion panel. We strongly recommend
              reviewing these before deletion.
            </span>
          </div>
        </div>
      )}

      {/* Scan summary with visual bar */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-4 flex flex-col gap-3 animate-fade-in delay-500">
        {/* Composition bar */}
        <div className="flex items-center gap-1.5 h-2 w-full rounded-full overflow-hidden bg-muted/30">
          <div className="h-full rounded-full bg-status-used transition-all duration-700" style={{ width: `${usedPercent}%` }} />
          <div className="h-full rounded-full bg-status-unused transition-all duration-700" style={{ width: `${100 - usedPercent}%` }} />
        </div>
        <div className="flex items-center gap-5 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-primary" />
            Scanned <strong className="text-foreground">{results.totalFiles.toLocaleString()}</strong> files
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-status-used" />
            Used <strong className="text-status-used">{usedCount.toLocaleString()}</strong>
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-status-unused" />
            Unused <strong className="text-status-unused">{unusedCount.toLocaleString()}</strong>
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-status-unused" />
            Reclaimable <strong className="text-status-unused">{formatBytes(results.unusedSize)}</strong>
          </span>
        </div>
      </div>

      {/* Project Insights */}
      <div className="flex flex-col gap-3 animate-fade-in-up delay-600">

        {/* Section header */}
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Project Insights
          </h2>
          <span className="text-[10px] text-muted-foreground/40 font-medium tabular-nums">4 signals</span>
        </div>

        {/* Insight cards — 4-up grid of vertical cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">

          {/* Most Connected Script */}
          <div className="relative flex flex-col rounded-xl border border-chart-1/15 bg-card/60 overflow-hidden hover:border-chart-1/35 hover:bg-card/80 transition-all duration-200 group">
            {/* Colored glow strip at top */}
            <div className="h-[3px] w-full bg-chart-1/50 group-hover:bg-chart-1/80 transition-colors duration-300" />
            <div className="flex flex-col gap-3 p-4">
              {/* Icon + label row */}
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-chart-1/10 group-hover:bg-chart-1/20 transition-colors duration-200">
                  <Link className="h-3.5 w-3.5 text-chart-1" />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider leading-none">Most Connected</span>
              </div>
              {/* Big metric */}
              <div className="flex flex-col gap-0.5">
                <span className="text-3xl font-bold text-chart-1 tabular-nums leading-none">
                  {insights.mostConnectedScript ? insights.mostConnectedScript.connections : "—"}
                </span>
                <span className="text-[10px] text-chart-1/40 uppercase tracking-wide leading-none">links</span>
              </div>
              {/* Divider */}
              <div className="h-px w-full bg-border/30" />
              {/* Filename */}
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[10px] text-muted-foreground/40 leading-none">script</span>
                {insights.mostConnectedScript ? (
                  <span className="text-xs font-medium text-foreground/80 font-mono truncate leading-snug">
                    {basename(insights.mostConnectedScript.id)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground/30 leading-snug">None found</span>
                )}
              </div>
            </div>
          </div>

          {/* Largest Scene */}
          <div className="relative flex flex-col rounded-xl border border-chart-2/15 bg-card/60 overflow-hidden hover:border-chart-2/35 hover:bg-card/80 transition-all duration-200 group">
            <div className="h-[3px] w-full bg-chart-2/50 group-hover:bg-chart-2/80 transition-colors duration-300" />
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-chart-2/10 group-hover:bg-chart-2/20 transition-colors duration-200">
                  <Box className="h-3.5 w-3.5 text-chart-2" />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider leading-none">Largest Scene</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-3xl font-bold text-chart-2 tabular-nums leading-none">
                  {insights.largestScene ? formatBytes(insights.largestScene.size) : "—"}
                </span>
                <span className="text-[10px] text-chart-2/40 uppercase tracking-wide leading-none">size</span>
              </div>
              <div className="h-px w-full bg-border/30" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[10px] text-muted-foreground/40 leading-none">scene</span>
                {insights.largestScene ? (
                  <span className="text-xs font-medium text-foreground/80 font-mono truncate leading-snug">{insights.largestScene.name}</span>
                ) : (
                  <span className="text-xs text-muted-foreground/30 leading-snug">None found</span>
                )}
              </div>
            </div>
          </div>

          {/* Deepest Dependency */}
          <div className="relative flex flex-col rounded-xl border border-primary/15 bg-card/60 overflow-hidden hover:border-primary/35 hover:bg-card/80 transition-all duration-200 group">
            <div className="h-[3px] w-full bg-primary/50 group-hover:bg-primary/80 transition-colors duration-300" />
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors duration-200">
                  <GitBranch className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider leading-none">Deepest Dep.</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-3xl font-bold text-primary tabular-nums leading-none">
                  {insights.maxDepth > 0 ? insights.maxDepth : "—"}
                </span>
                <span className="text-[10px] text-primary/40 uppercase tracking-wide leading-none">levels</span>
              </div>
              <div className="h-px w-full bg-border/30" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[10px] text-muted-foreground/40 leading-none">from</span>
                {insights.maxDepth > 0 ? (
                  <span className="text-xs font-medium text-foreground/80 font-mono truncate leading-snug">{basename(insights.deepestStart)}</span>
                ) : (
                  <span className="text-xs text-muted-foreground/30 leading-snug">None detected</span>
                )}
              </div>
            </div>
          </div>

          {/* Most Duplicated Function */}
          <div className="relative flex flex-col rounded-xl border border-chart-4/15 bg-card/60 overflow-hidden hover:border-chart-4/35 hover:bg-card/80 transition-all duration-200 group">
            <div className="h-[3px] w-full bg-chart-4/50 group-hover:bg-chart-4/80 transition-colors duration-300" />
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-chart-4/10 group-hover:bg-chart-4/20 transition-colors duration-200">
                  <Copy className="h-3.5 w-3.5 text-chart-4" />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider leading-none">Most Duped Fn.</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-3xl font-bold text-chart-4 tabular-nums leading-none">
                  {insights.mostDuplicated ? insights.mostDuplicated.count : "—"}
                </span>
                <span className="text-[10px] text-chart-4/40 uppercase tracking-wide leading-none">copies</span>
              </div>
              <div className="h-px w-full bg-border/30" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[10px] text-muted-foreground/40 leading-none">function</span>
                {insights.mostDuplicated ? (
                  <span className="text-xs font-medium text-foreground/80 font-mono truncate leading-snug">{insights.mostDuplicated.name}()</span>
                ) : (
                  <span className="text-xs text-muted-foreground/30 leading-snug">No duplicates found</span>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Manual review notice */}
        <div className="flex items-start gap-3 rounded-xl border border-border/30 bg-card/30 px-4 py-3">
          <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
            These insights identify candidates for cleanup. No files are modified automatically —
            review each item and delete unused files manually in Godot or your file system.
          </p>
        </div>

      </div>
    </div>
  )
}
