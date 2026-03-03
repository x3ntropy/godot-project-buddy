"use client"

import { useState, useMemo } from "react"
import type { GodotFile, ClassifiedUnusedFile, AnalysisResults } from "@/lib/scanner/types"
import type { RiskScore } from "@/lib/scanner/risk-scorer"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ArrowUpDown, Search, FileCode2, FileImage, Box, FileText, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScorePill } from "@/components/godot-cleaner/risk-badge"

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`
}

const CATEGORY_ICONS: Record<string, typeof FileCode2> = {
  script: FileCode2,
  scene: Box,
  asset: FileImage,
  resource: FileText,
}

const CATEGORY_COLORS: Record<string, string> = {
  script: "bg-chart-1/15 text-chart-1",
  scene: "bg-chart-2/15 text-chart-2",
  asset: "bg-chart-4/15 text-chart-4",
  resource: "bg-muted text-muted-foreground",
  config: "bg-muted text-muted-foreground",
  other: "bg-muted text-muted-foreground",
}

type SortKey = "path" | "type" | "size" | "score"
type SortDir = "asc" | "desc"

interface UnusedFilesTableProps {
  files: GodotFile[]
  classifiedFiles?: ClassifiedUnusedFile[]
  riskScores?: Map<string, RiskScore>
  onFileClick?: (resPath: string) => void
}

export function UnusedFilesTable({ files, classifiedFiles, riskScores, onFileClick }: UnusedFilesTableProps) {
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("score")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  // Build classification lookup
  const classificationMap = useMemo(() => {
    const map = new Map<string, ClassifiedUnusedFile>()
    if (classifiedFiles) {
      for (const cf of classifiedFiles) {
        map.set(cf.file.resPath, cf)
      }
    }
    return map
  }, [classifiedFiles])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let result = files.filter((f) =>
      f.relativePath.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q)
    )

    result.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "path":
          cmp = a.relativePath.localeCompare(b.relativePath)
          break
        case "type":
          cmp = a.category.localeCompare(b.category)
          break
        case "size":
          cmp = a.size - b.size
          break
        case "score":
          cmp = (riskScores?.get(a.resPath)?.score ?? 0.5) - (riskScores?.get(b.resPath)?.score ?? 0.5)
          break
      }
      return sortDir === "asc" ? cmp : -cmp
    })

    return result
  }, [files, search, sortKey, sortDir])

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-status-used/10">
          <FileCode2 className="h-7 w-7 text-status-used" />
        </div>
        <p className="text-sm font-medium text-foreground">No unused files found</p>
        <p className="text-xs text-muted-foreground">All files are referenced in your project</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm bg-secondary/30 border-border/50 focus:bg-card transition-colors"
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
          {filtered.length} file{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <ScrollArea className="h-[420px] rounded-xl border border-border/60">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/40">
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs font-medium gap-1.5 hover:bg-transparent hover:text-foreground cursor-pointer"
                  onClick={() => toggleSort("path")}
                >
                  File Path
                  <ArrowUpDown className={`h-3 w-3 ${sortKey === "path" ? "opacity-100" : "opacity-40"}`} />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs font-medium gap-1.5 hover:bg-transparent hover:text-foreground cursor-pointer"
                  onClick={() => toggleSort("type")}
                >
                  Type
                  <ArrowUpDown className={`h-3 w-3 ${sortKey === "type" ? "opacity-100" : "opacity-40"}`} />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs font-medium gap-1.5 hover:bg-transparent hover:text-foreground cursor-pointer"
                  onClick={() => toggleSort("score")}
                >
                  Risk Score
                  <ArrowUpDown className={`h-3 w-3 ${sortKey === "score" ? "opacity-100" : "opacity-40"}`} />
                </Button>
              </TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs font-medium gap-1.5 hover:bg-transparent hover:text-foreground ml-auto cursor-pointer"
                  onClick={() => toggleSort("size")}
                >
                  Size
                  <ArrowUpDown className={`h-3 w-3 ${sortKey === "size" ? "opacity-100" : "opacity-40"}`} />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((file) => {
              const Icon = CATEGORY_ICONS[file.category] || FileText
              const colorClass = CATEGORY_COLORS[file.category] || CATEGORY_COLORS.other
              const classified = classificationMap.get(file.resPath)
              const isUncertain = classified?.classification === "uncertain"
              const rs = riskScores?.get(file.resPath)
              return (
                <TableRow
                  key={file.resPath}
                  className="cursor-pointer transition-colors duration-150 hover:bg-muted/40 border-border/30"
                  onClick={() => onFileClick?.(file.resPath)}
                >
                  <TableCell className="font-mono text-xs max-w-[320px] truncate text-foreground/90">
                    <div className="flex items-center gap-2">
                      {file.relativePath}
                      {isUncertain && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-status-warning" title={classified?.reason || "May be loaded dynamically at runtime"}>
                          <AlertTriangle className="h-3 w-3" />
                          Uncertain
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`gap-1 text-[10px] ${colorClass} border-0`}>
                      <Icon className="h-2.5 w-2.5" />
                      {file.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {rs
                      ? <ScorePill score={rs.score} label={rs.label} />
                      : <span className="text-[10px] text-muted-foreground/40">—</span>
                    }
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {formatBytes(file.size)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  )
}
