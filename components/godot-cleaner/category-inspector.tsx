"use client"

import { useMemo, useState } from "react"
import type { GodotFile, AnalysisResults, FileCategory } from "@/lib/scanner/types"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  FileCode2,
  FileImage,
  Box,
  FileText,
  HardDrive,
  Trash2,
  Network,
  AlertTriangle,
  Search,
  ArrowUpDown,
} from "lucide-react"

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`
}

export type InspectorCategory =
  | "total"
  | "script"
  | "scene"
  | "asset"
  | "resource"
  | "unused"
  | "reclaimable"
  | "graph"
  | "dynamic"

const CATEGORY_META: Record<
  InspectorCategory,
  { label: string; icon: typeof FileCode2; color: string; bgColor: string }
> = {
  total: { label: "All Files", icon: HardDrive, color: "text-primary", bgColor: "bg-primary/10" },
  script: { label: "Scripts", icon: FileCode2, color: "text-chart-1", bgColor: "bg-chart-1/10" },
  scene: { label: "Scenes", icon: Box, color: "text-chart-2", bgColor: "bg-chart-2/10" },
  asset: { label: "Assets", icon: FileImage, color: "text-chart-4", bgColor: "bg-chart-4/10" },
  resource: { label: "Resources", icon: FileText, color: "text-muted-foreground", bgColor: "bg-muted" },
  unused: { label: "Unused Files", icon: Trash2, color: "text-status-unused", bgColor: "bg-status-unused/10" },
  reclaimable: { label: "Reclaimable Files", icon: HardDrive, color: "text-status-unused", bgColor: "bg-status-unused/10" },
  graph: { label: "Graph Nodes", icon: Network, color: "text-primary", bgColor: "bg-primary/10" },
  dynamic: { label: "Dynamic Loads", icon: AlertTriangle, color: "text-status-warning", bgColor: "bg-status-warning/10" },
}

const FILE_CATEGORY_ICONS: Record<string, typeof FileCode2> = {
  script: FileCode2,
  scene: Box,
  asset: FileImage,
  resource: FileText,
  config: FileText,
  import: FileText,
  other: FileText,
}

interface CategoryInspectorProps {
  category: InspectorCategory | null
  onClose: () => void
  files: Map<string, GodotFile>
  results: AnalysisResults
  onFileClick: (resPath: string) => void
}

export function CategoryInspector({
  category,
  onClose,
  files,
  results,
  onFileClick,
}: CategoryInspectorProps) {
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"name" | "size">("name")

  const meta = category ? CATEGORY_META[category] : null

  const fileList = useMemo(() => {
    if (!category) return []

    let list: GodotFile[] = []

    switch (category) {
      case "total":
        list = [...files.values()]
        break
      case "script":
      case "scene":
      case "asset":
      case "resource":
        list = [...files.values()].filter((f) => f.category === category)
        break
      case "unused":
      case "reclaimable":
        list = results.unusedFiles
        break
      case "graph":
        // Show files that are graph nodes
        const nodeIds = new Set(results.graph.nodes.map((n) => n.id))
        list = [...files.values()].filter((f) => nodeIds.has(f.resPath))
        break
      case "dynamic":
        list = [...files.values()].filter((f) =>
          results.dynamicLoadFiles.includes(f.resPath)
        )
        break
    }

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (f) =>
          f.relativePath.toLowerCase().includes(q) ||
          f.resPath.toLowerCase().includes(q) ||
          f.extension.toLowerCase().includes(q)
      )
    }

    // Sort
    if (sortBy === "size") {
      list.sort((a, b) => b.size - a.size)
    } else {
      list.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    }

    return list
  }, [category, files, results, search, sortBy])

  const totalSize = useMemo(
    () => fileList.reduce((sum, f) => sum + f.size, 0),
    [fileList]
  )

  const usedNodeIds = useMemo(
    () => new Set(results.graph.nodes.filter((n) => n.used).map((n) => n.id)),
    [results]
  )

  const Icon = meta?.icon || HardDrive

  return (
    <Sheet open={!!category} onOpenChange={() => { onClose(); setSearch(""); }}>
      <SheetContent side="right" className="w-full sm:max-w-md border-border/60 p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-0 gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${meta?.bgColor || "bg-muted"}`}>
              <Icon className={`h-4.5 w-4.5 ${meta?.color || "text-muted-foreground"}`} />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <SheetTitle className="text-sm font-semibold">
                {meta?.label || "Files"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {fileList.length.toLocaleString()} files &middot; {formatBytes(totalSize)}
              </SheetDescription>
            </div>
          </div>

          {/* Search + sort */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs bg-muted/40 border-border/40 focus-visible:ring-primary/30"
              />
            </div>
            <button
              onClick={() => setSortBy(sortBy === "name" ? "size" : "name")}
              className="flex items-center gap-1 h-8 px-2.5 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200 shrink-0"
              title={`Sort by ${sortBy === "name" ? "size" : "name"}`}
            >
              <ArrowUpDown className="h-3 w-3" />
              {sortBy === "name" ? "Name" : "Size"}
            </button>
          </div>
        </SheetHeader>

        {/* File list */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col py-2">
            {fileList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 mb-3">
                  <Search className="h-5 w-5 text-muted-foreground/50" />
                </div>
                <p className="text-sm text-muted-foreground">No files found</p>
                {search && (
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Try a different search term
                  </p>
                )}
              </div>
            ) : (
              fileList.map((file, idx) => {
                const FileIcon = FILE_CATEGORY_ICONS[file.category] || FileText
                const isUsed = usedNodeIds.has(file.resPath)
                return (
                  <button
                    key={file.resPath}
                    onClick={() => onFileClick(file.resPath)}
                    className="group flex items-center gap-3 px-5 py-2.5 text-left hover:bg-muted/40 transition-all duration-150 animate-fade-in"
                    style={{ animationDelay: `${Math.min(idx * 20, 400)}ms` }}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 group-hover:bg-muted shrink-0 transition-colors">
                      <FileIcon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {file.relativePath}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {formatBytes(file.size)}
                        </span>
                        <span className="text-[10px] text-muted-foreground/50">
                          {file.extension}
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className={`text-[9px] border-0 px-1.5 py-0 font-semibold shrink-0 ${
                        isUsed
                          ? "bg-status-used/15 text-status-used"
                          : "bg-status-unused/15 text-status-unused"
                      }`}
                    >
                      {isUsed ? "Used" : "Unused"}
                    </Badge>
                  </button>
                )
              })
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
