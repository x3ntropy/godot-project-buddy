"use client"

import { useState, useMemo } from "react"
import type { GodotFile } from "@/lib/scanner/types"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import {
  Image,
  Music,
  Box,
  FileCode2,
  FileText,
  Search,
  ArrowUpDown,
  ChevronDown,
} from "lucide-react"

// ── Asset type definitions ────────────────────────────────────────────────────

const ASSET_TYPES = {
  image:   { label: "Images",       extensions: [".png", ".jpg", ".jpeg", ".webp", ".svg", ".bmp"], icon: Image,    color: "text-chart-2",      bg: "bg-chart-2/10",  bar: "bg-chart-2"  },
  audio:   { label: "Audio",        extensions: [".wav", ".ogg", ".mp3", ".flac"],                  icon: Music,    color: "text-chart-1",      bg: "bg-chart-1/10",  bar: "bg-chart-1"  },
  model3d: { label: "3D Models",    extensions: [".glb", ".gltf", ".dae", ".obj", ".fbx"],          icon: Box,      color: "text-primary",      bg: "bg-primary/10",  bar: "bg-primary"  },
  godot:   { label: "Godot Assets", extensions: [".tres", ".res", ".tscn"],                         icon: FileCode2,color: "text-chart-4",      bg: "bg-chart-4/10",  bar: "bg-chart-4"  },
  other:   { label: "Others",       extensions: [".ttf", ".otf", ".woff", ".woff2", ".json", ".shader", ".gdshader", ".material"], icon: FileText, color: "text-muted-foreground", bg: "bg-muted/30", bar: "bg-muted-foreground" },
} as const

type AssetTypeKey = keyof typeof ASSET_TYPES

function getAssetType(ext: string): AssetTypeKey | null {
  for (const [key, def] of Object.entries(ASSET_TYPES)) {
    if (def.extensions.includes(ext as never)) return key as AssetTypeKey
  }
  return null
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1))} ${sizes[i]}`
}

function basename(path: string): string {
  return path.split("/").pop() ?? path
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AssetSizeRankingProps {
  allFiles: GodotFile[]
}

// ── Filter pill ───────────────────────────────────────────────────────────────

function FilterPill({
  label,
  count,
  size,
  active,
  color,
  bg,
  icon: Icon,
  onClick,
}: {
  label: string
  count: number
  size: number
  active: boolean
  color: string
  bg: string
  icon: React.ElementType
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200 border ${
        active
          ? `${bg} ${color} border-current/20 shadow-sm`
          : "bg-card/40 text-muted-foreground border-border/40 hover:border-border/70 hover:text-foreground hover:bg-card/70"
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${active ? color : ""}`} />
      <span>{label}</span>
      <span className={`tabular-nums font-semibold ${active ? color : "text-muted-foreground/60"}`}>{count}</span>
      <span className={`text-[10px] tabular-nums hidden sm:inline ${active ? "opacity-70" : "text-muted-foreground/40"}`}>
        {formatBytes(size)}
      </span>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function AssetSizeRanking({ allFiles }: AssetSizeRankingProps) {
  const [search, setSearch] = useState("")
  const [activeType, setActiveType] = useState<AssetTypeKey | "all">("all")
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc")
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  // Filter files to only meaningful asset extensions
  const assetFiles = useMemo(() => {
    return allFiles.filter((f) => getAssetType(f.extension) !== null)
  }, [allFiles])

  // Per-type stats
  const typeStats = useMemo(() => {
    const stats = {} as Record<AssetTypeKey, { count: number; totalSize: number }>
    for (const key of Object.keys(ASSET_TYPES) as AssetTypeKey[]) {
      stats[key] = { count: 0, totalSize: 0 }
    }
    for (const f of assetFiles) {
      const t = getAssetType(f.extension)
      if (t) {
        stats[t].count++
        stats[t].totalSize += f.size
      }
    }
    return stats
  }, [assetFiles])

  // Filtered + sorted list
  const filtered = useMemo(() => {
    return assetFiles
      .filter((f) => {
        const matchesType = activeType === "all" || getAssetType(f.extension) === activeType
        const matchesSearch = search === "" || f.relativePath.toLowerCase().includes(search.toLowerCase())
        return matchesType && matchesSearch
      })
      .sort((a, b) => sortDir === "desc" ? b.size - a.size : a.size - b.size)
  }, [assetFiles, activeType, search, sortDir])

  // Max size for bar scaling
  const maxSize = filtered.length > 0 ? filtered[0].size : 1
  const totalFilteredSize = filtered.reduce((sum, f) => sum + f.size, 0)

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-foreground tracking-tight">Asset Size Ranking</h1>
        <p className="text-sm text-muted-foreground">
          {assetFiles.length.toLocaleString()} assets &middot; {formatBytes(assetFiles.reduce((s, f) => s + f.size, 0))} total &middot; sorted by size
        </p>
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveType("all")}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200 border ${
            activeType === "all"
              ? "bg-primary/10 text-primary border-primary/20 shadow-sm"
              : "bg-card/40 text-muted-foreground border-border/40 hover:border-border/70 hover:text-foreground hover:bg-card/70"
          }`}
        >
          <span>All</span>
          <span className={`tabular-nums font-semibold ${activeType === "all" ? "text-primary" : "text-muted-foreground/60"}`}>{assetFiles.length}</span>
        </button>

        {(Object.entries(ASSET_TYPES) as [AssetTypeKey, typeof ASSET_TYPES[AssetTypeKey]][]).map(([key, def]) => {
          const stats = typeStats[key]
          if (stats.count === 0) return null
          return (
            <FilterPill
              key={key}
              label={def.label}
              count={stats.count}
              size={stats.totalSize}
              active={activeType === key}
              color={def.color}
              bg={def.bg}
              icon={def.icon}
              onClick={() => setActiveType(activeType === key ? "all" : key)}
            />
          )
        })}
      </div>

      {/* Search + sort controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            placeholder="Filter by filename or path…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-xs bg-card/60 border-border/40"
          />
        </div>
        <button
          onClick={() => setSortDir((d) => d === "desc" ? "asc" : "desc")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 border border-border/40 rounded-lg px-3 h-8 bg-card/40 hover:bg-card/70"
        >
          <ArrowUpDown className="h-3 w-3" />
          {sortDir === "desc" ? "Largest first" : "Smallest first"}
        </button>
        <span className="text-[11px] text-muted-foreground/50 tabular-nums">
          {filtered.length} files &middot; {formatBytes(totalFilteredSize)}
        </span>
      </div>

      {/* Ranking list */}
      <ScrollArea className="h-[calc(100vh-20rem)]">
        <div className="flex flex-col gap-1 pr-2">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground/50">No assets match your filters</p>
            </div>
          )}

          {filtered.map((file, idx) => {
            const typeKey = getAssetType(file.extension)!
            const typeDef = ASSET_TYPES[typeKey]
            const Icon = typeDef.icon
            const barWidth = maxSize > 0 ? (file.size / maxSize) * 100 : 0
            const isExpanded = expandedRow === file.resPath
            const rank = idx + 1

            return (
              <div
                key={file.resPath}
                className="group rounded-xl border border-border/30 bg-card/50 hover:bg-card/80 hover:border-border/60 transition-all duration-200 overflow-hidden"
              >
                {/* Main row */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  onClick={() => setExpandedRow(isExpanded ? null : file.resPath)}
                >
                  {/* Rank */}
                  <span className="text-[11px] font-bold text-muted-foreground/25 w-6 shrink-0 tabular-nums text-right">
                    {rank}
                  </span>

                  {/* Icon */}
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${typeDef.bg}`}>
                    <Icon className={`h-3.5 w-3.5 ${typeDef.color}`} />
                  </div>

                  {/* File info */}
                  <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                    <span className="text-sm font-medium text-foreground font-mono truncate leading-tight">
                      {basename(file.resPath)}
                    </span>
                    {/* Size bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-border/30 overflow-hidden max-w-[200px]">
                        <div
                          className={`h-full rounded-full ${typeDef.bar} opacity-60 transition-all duration-500`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-medium tabular-nums ${typeDef.color} opacity-70`}>
                        {formatBytes(file.size)}
                      </span>
                    </div>
                  </div>

                  {/* Extension badge */}
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-md ${typeDef.bg} ${typeDef.color} uppercase tracking-wide`}>
                    {file.extension.replace(".", "")}
                  </span>

                  {/* Expand chevron */}
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-muted-foreground/30 shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-3 pt-0 animate-fade-in">
                    <div className="border-t border-border/20 pt-3 flex flex-col gap-1.5">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Full path</span>
                          <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[240px]">{file.relativePath}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Size</span>
                          <span className={`text-[11px] font-semibold ${typeDef.color}`}>{formatBytes(file.size)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Type</span>
                          <span className={`text-[11px] font-medium ${typeDef.color}`}>{typeDef.label}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">% of total</span>
                          <span className="text-[11px] text-muted-foreground font-semibold tabular-nums">
                            {assetFiles.reduce((s, f) => s + f.size, 0) > 0
                              ? `${((file.size / assetFiles.reduce((s, f) => s + f.size, 0)) * 100).toFixed(1)}%`
                              : "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
