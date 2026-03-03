"use client"

import { Fragment, useMemo, useState } from "react"
import type { GodotFile, ClassifiedUnusedFile, AnalysisResults } from "@/lib/scanner/types"
import type { RiskScore } from "@/lib/scanner/risk-scorer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Clipboard,
  Download,
  ArrowUpDown,
  CheckCircle2,
  AlertTriangle,
  Info,
  FileJson,
  FileSearch,
  ShieldAlert,
  TrendingUp,
  Filter,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { RiskBadge, ScorePill, RiskBreakdown } from "@/components/godot-cleaner/risk-badge"

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`
}

const CRITICAL_FILE_PATTERNS = [
  /^res:\/\/project\.godot$/,
  /^res:\/\/export_presets\.cfg$/,
  /^res:\/\/default_env\.tres$/,
]

function isCriticalFile(resPath: string, results: AnalysisResults): boolean {
  if (CRITICAL_FILE_PATTERNS.some((p) => p.test(resPath))) return true
  if (results.projectInfo.mainScene === resPath) return true
  if (results.entryPoints.includes(resPath)) return true
  if (results.projectInfo.autoloads.some((a) => a.path === resPath)) return true
  return false
}

type SortKey = "score" | "size" | "path" | "type"
type FilterLabel = "all" | RiskScore["label"]

interface SafeToDeleteProps {
  files: GodotFile[]
  totalUnusedSize: number
  classifiedFiles?: ClassifiedUnusedFile[]
  results: AnalysisResults
  onFileClick?: (resPath: string) => void
}

export function SafeToDelete({
  files,
  totalUnusedSize,
  classifiedFiles,
  results,
  onFileClick,
}: SafeToDeleteProps) {
  const [sortKey, setSortKey] = useState<SortKey>("score")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [filterLabel, setFilterLabel] = useState<FilterLabel>("all")
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Build classification + risk map
  const classificationMap = useMemo(() => {
    const map = new Map<string, ClassifiedUnusedFile>()
    if (classifiedFiles) {
      for (const cf of classifiedFiles) {
        map.set(cf.file.resPath, cf)
      }
    }
    return map
  }, [classifiedFiles])

  const riskScoreMap = useMemo(() => {
    return results.riskScores ?? new Map<string, RiskScore>()
  }, [results.riskScores])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "score" ? "desc" : key === "size" ? "desc" : "asc")
    }
  }

  const baseFiles = useMemo(
    () => files.filter((f) => !isCriticalFile(f.resPath, results)),
    [files, results]
  )

  const sorted = useMemo(() => {
    let list = [...baseFiles]

    // Apply label filter
    if (filterLabel !== "all") {
      list = list.filter((f) => {
        const rs = riskScoreMap.get(f.resPath)
        return rs?.label === filterLabel
      })
    }

    list.sort((a, b) => {
      let cmp = 0
      if (sortKey === "score") {
        const sa = riskScoreMap.get(a.resPath)?.score ?? 0.5
        const sb = riskScoreMap.get(b.resPath)?.score ?? 0.5
        cmp = sa - sb
      } else if (sortKey === "size") {
        cmp = a.size - b.size
      } else if (sortKey === "path") {
        cmp = a.relativePath.localeCompare(b.relativePath)
      } else if (sortKey === "type") {
        cmp = a.category.localeCompare(b.category)
      }
      return sortDir === "asc" ? cmp : -cmp
    })

    return list
  }, [baseFiles, filterLabel, sortKey, sortDir, riskScoreMap])

  // Distribution stats
  const distribution = useMemo(() => {
    const counts: Record<RiskScore["label"] | "unscored", number> = {
      safe: 0, "low-risk": 0, moderate: 0, uncertain: 0, risky: 0, unscored: 0,
    }
    for (const f of baseFiles) {
      const rs = riskScoreMap.get(f.resPath)
      if (rs) counts[rs.label]++
      else counts.unscored++
    }
    return counts
  }, [baseFiles, riskScoreMap])

  const safeCount = distribution.safe + distribution["low-risk"]
  const riskyCount = distribution.risky + distribution.uncertain

  function copyToClipboard() {
    const text = sorted
      .map((f) => {
        const rs = riskScoreMap.get(f.resPath)
        const score = rs ? ` [score: ${Math.round(rs.score * 100)}]` : ""
        return `${f.relativePath} (${formatBytes(f.size)})${score}`
      })
      .join("\n")
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadReport(format: "txt" | "json" | "csv") {
    const getScore = (f: GodotFile) => riskScoreMap.get(f.resPath)

    if (format === "json") {
      const data = {
        generated: new Date().toISOString(),
        summary: {
          totalUnusedFiles: sorted.length,
          totalReclaimableBytes: totalUnusedSize,
          totalReclaimable: formatBytes(totalUnusedSize),
          riskDistribution: distribution,
        },
        files: sorted.map((f) => {
          const rs = getScore(f)
          return {
            path: f.relativePath,
            resPath: f.resPath,
            category: f.category,
            size: f.size,
            riskScore: rs?.score ?? null,
            riskLabel: rs?.label ?? null,
            riskFactors: rs?.factors ?? null,
            dominantReason: rs?.dominantReason ?? null,
            classification: classificationMap.get(f.resPath)?.classification ?? "safe",
          }
        }),
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      downloadBlob(blob, "godot-risk-report.json")
    } else if (format === "csv") {
      const header = "Path,Category,Size (bytes),Size,Risk Score,Risk Label,Dominant Reason"
      const rows = sorted.map((f) => {
        const rs = getScore(f)
        return [
          `"${f.relativePath}"`,
          f.category,
          f.size,
          formatBytes(f.size),
          rs ? Math.round(rs.score * 100) : "",
          rs?.label ?? "",
          `"${rs?.dominantReason ?? ""}"`,
        ].join(",")
      })
      const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" })
      downloadBlob(blob, "godot-risk-report.csv")
    } else {
      const lines = [
        "GODOT PROJECT CLEANER — DELETION RISK REPORT",
        "=".repeat(52),
        `Generated: ${new Date().toISOString()}`,
        "",
        `Total unused files: ${sorted.length}`,
        `  Safe / Low-Risk : ${safeCount}`,
        `  Moderate        : ${distribution.moderate}`,
        `  Uncertain/Risky : ${riskyCount}`,
        `Total reclaimable: ${formatBytes(totalUnusedSize)}`,
        "",
        "Score: 0 = HIGH deletion risk, 100 = SAFE to delete",
        "",
        ...sorted.map((f) => {
          const rs = getScore(f)
          const score = rs ? `[${String(Math.round(rs.score * 100)).padStart(3)}] ${rs.label.padEnd(9)}` : "[ -- ] unscored  "
          return `${score}  ${f.relativePath} (${formatBytes(f.size)})`
        }),
      ]
      const blob = new Blob([lines.join("\n")], { type: "text/plain" })
      downloadBlob(blob, "godot-risk-report.txt")
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/10">
          <FileSearch className="h-7 w-7 text-emerald-400" />
        </div>
        <p className="text-sm font-medium text-foreground">No unused files found</p>
        <p className="text-xs text-muted-foreground">Your project looks clean!</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Risk distribution overview */}
      <Card className="overflow-hidden border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground">Risk Overview</span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  {baseFiles.length} files scored · {formatBytes(totalUnusedSize)} reclaimable
                </span>
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" className="gap-1.5 text-xs cursor-pointer" onClick={copyToClipboard}>
                {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Clipboard className="h-3 w-3" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
              <Button size="sm" variant="secondary" className="gap-1.5 text-xs cursor-pointer" onClick={() => downloadReport("txt")}>
                <Download className="h-3 w-3" />TXT
              </Button>
              <Button size="sm" variant="secondary" className="gap-1.5 text-xs cursor-pointer" onClick={() => downloadReport("json")}>
                <FileJson className="h-3 w-3" />JSON
              </Button>
              <Button size="sm" variant="secondary" className="gap-1.5 text-xs cursor-pointer" onClick={() => downloadReport("csv")}>
                <Download className="h-3 w-3" />CSV
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Visual distribution bar */}
          <DistributionBar distribution={distribution} total={baseFiles.length} />

          {/* Stat chips */}
          <div className="grid grid-cols-3 gap-2">
            <StatChip label="Safe to Delete" value={safeCount} color="text-emerald-400" bg="bg-emerald-400/8" />
            <StatChip label="Review Needed" value={distribution.moderate} color="text-yellow-400" bg="bg-yellow-400/8" />
            <StatChip label="High Risk" value={riskyCount} color="text-red-400" bg="bg-red-400/8" />
          </div>
        </CardContent>
      </Card>

      {/* Filter + sort controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {(["all", "safe", "low-risk", "moderate", "uncertain", "risky"] as const).map((label) => (
          <button
            key={label}
            onClick={() => setFilterLabel(label)}
            className={`rounded-lg px-2.5 py-1 text-[10px] font-medium transition-all duration-200 cursor-pointer capitalize ${
              filterLabel === label
                ? "bg-primary/15 text-primary ring-1 ring-primary/25"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            {label === "all" ? `All (${baseFiles.length})` : label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          {sorted.length} file{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Main file table */}
      <ScrollArea className="h-[420px] rounded-xl border border-border/50">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/40">
              <TableHead>
                <SortButton label="File" sortKey="path" current={sortKey} dir={sortDir} onToggle={toggleSort} />
              </TableHead>
              <TableHead>
                <SortButton label="Type" sortKey="type" current={sortKey} dir={sortDir} onToggle={toggleSort} />
              </TableHead>
              <TableHead>
                <SortButton label="Risk Score" sortKey="score" current={sortKey} dir={sortDir} onToggle={toggleSort} />
              </TableHead>
              <TableHead className="text-right">
                <SortButton label="Size" sortKey="size" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((file) => {
              const cf = classificationMap.get(file.resPath)
              const rs = riskScoreMap.get(file.resPath)
              const isExpanded = expandedRow === file.resPath

              return (
                <Fragment key={file.resPath}>
                  <TableRow
                    className="transition-colors duration-150 border-border/30 hover:bg-muted/30 cursor-pointer"
                    onClick={() => {
                      setExpandedRow(isExpanded ? null : file.resPath)
                      onFileClick?.(file.resPath)
                    }}
                  >
                    <TableCell className="font-mono text-xs max-w-[280px] truncate text-foreground/90">
                      <div className="flex items-center gap-1.5">
                        {isExpanded
                          ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
                          : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                        }
                        <span className="truncate">{file.relativePath}</span>
                        {cf?.classification === "uncertain" && (
                          <AlertTriangle className="h-3 w-3 text-orange-400 shrink-0" title="May be dynamically loaded" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] border-0">{file.category}</Badge>
                    </TableCell>
                    <TableCell>
                      {rs
                        ? <ScorePill score={rs.score} label={rs.label} />
                        : <span className="text-[10px] text-muted-foreground/50">—</span>
                      }
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {formatBytes(file.size)}
                    </TableCell>
                  </TableRow>

                  {/* Expanded factor breakdown row */}
                  {isExpanded && rs && (
                    <TableRow key={`${file.resPath}-expanded`} className="border-border/20 bg-muted/10 hover:bg-muted/10">
                      <TableCell colSpan={4} className="p-0">
                        <div className="px-6 py-4 animate-fade-in-up" style={{ animationDuration: "0.2s" }}>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <RiskBreakdown riskScore={rs} />
                            <div className="flex flex-col gap-2">
                              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                                About this file
                              </span>
                              <div className="rounded-lg bg-muted/30 p-3 flex flex-col gap-1.5 text-xs text-muted-foreground font-mono">
                                <span>{file.resPath}</span>
                                <span>{formatBytes(file.size)} · {file.category}</span>
                                {cf?.reason && (
                                  <span className="text-orange-400 text-[10px] mt-1">{cf.reason}</span>
                                )}
                              </div>
                              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                                <p className="text-[10px] text-muted-foreground leading-relaxed">
                                  <strong className="text-foreground">Score {Math.round(rs.score * 100)}/100</strong> — {rs.dominantReason}.
                                  {rs.score >= 0.62
                                    ? " This file appears safe to remove manually."
                                    : rs.score >= 0.44
                                    ? " Review carefully before removing."
                                    : " High deletion risk — verify thoroughly before removing."
                                  }
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Score key:</span>
        {[
          { label: "80–100", desc: "Safe", color: "bg-emerald-400" },
          { label: "62–79",  desc: "Low Risk", color: "bg-teal-400" },
          { label: "44–61",  desc: "Moderate", color: "bg-yellow-400" },
          { label: "28–43",  desc: "Uncertain", color: "bg-orange-400" },
          { label: "0–27",   desc: "Risky", color: "bg-red-400" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${item.color}`} />
            <span className="text-[10px] text-muted-foreground">{item.desc} <span className="opacity-50">{item.label}</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  color,
  bg,
}: {
  label: string
  value: number
  color: string
  bg: string
}) {
  return (
    <div className={`rounded-lg ${bg} px-3 py-2.5 flex flex-col gap-0.5`}>
      <span className={`text-xl font-bold tabular-nums ${color}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  )
}

function DistributionBar({
  distribution,
  total,
}: {
  distribution: Record<string, number>
  total: number
}) {
  if (total === 0) return null
  const segments = [
    { key: "safe",      color: "bg-emerald-400" },
    { key: "low-risk",  color: "bg-teal-400" },
    { key: "moderate",  color: "bg-yellow-400" },
    { key: "uncertain", color: "bg-orange-400" },
    { key: "risky",     color: "bg-red-400" },
  ]
  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden gap-px">
      {segments.map(({ key, color }) => {
        const pct = ((distribution[key] ?? 0) / total) * 100
        if (pct === 0) return null
        return (
          <div
            key={key}
            className={`${color} h-full transition-all duration-700`}
            style={{ width: `${pct}%` }}
            title={`${key}: ${distribution[key]}`}
          />
        )
      })}
    </div>
  )
}

function SortButton({
  label,
  sortKey,
  current,
  dir,
  onToggle,
  align,
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  dir: "asc" | "desc"
  onToggle: (k: SortKey) => void
  align?: "right"
}) {
  const isActive = current === sortKey
  return (
    <Button
      variant="ghost"
      size="sm"
      className={`h-auto p-0 text-xs font-medium gap-1.5 hover:bg-transparent hover:text-foreground cursor-pointer ${align === "right" ? "ml-auto" : ""} ${isActive ? "text-foreground" : ""}`}
      onClick={() => onToggle(sortKey)}
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${isActive ? "opacity-100" : "opacity-40"}`} />
    </Button>
  )
}
