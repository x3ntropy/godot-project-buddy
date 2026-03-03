"use client"

import { useMemo } from "react"
import type { ScanProgress } from "@/lib/scanner/types"
import { Button } from "@/components/ui/button"
import { X, FolderSearch, FileCode2, GitBranch, Cpu, CheckCircle2 } from "lucide-react"

interface ScanProgressOverlayProps {
  progress: ScanProgress
  onCancel?: () => void
}

const STAGES = [
  { key: "reading" as const, label: "Read", icon: FolderSearch, description: "Scanning project directory for files" },
  { key: "parsing" as const, label: "Parse", icon: FileCode2, description: "Parsing scripts, scenes, and resources" },
  { key: "graphing" as const, label: "Graph", icon: GitBranch, description: "Building dependency graph from references" },
  { key: "analyzing" as const, label: "Analyze", icon: Cpu, description: "Identifying unused files and dead code" },
]

export function ScanProgressOverlay({ progress, onCancel }: ScanProgressOverlayProps) {
  const percent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0

  const currentIdx = useMemo(
    () => STAGES.findIndex((s) => s.key === progress.stage),
    [progress.stage]
  )
  const isComplete = progress.stage === "complete"
  const activeStage = isComplete ? null : STAGES[currentIdx]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-fade-in" style={{ animationDuration: "0.25s" }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/70 backdrop-blur-2xl" />

      {/* Ambient glow orbs */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full blur-[100px] pointer-events-none opacity-25 animate-orb-drift"
        style={{ background: "radial-gradient(ellipse, oklch(0.72 0.14 180 / 0.2), transparent 70%)" }}
        aria-hidden="true"
      />

      {/* Card */}
      <div
        className="relative z-10 flex w-full max-w-md flex-col gap-0 rounded-2xl border border-border/50 bg-card/90 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden animate-scale-in"
        style={{ animationDuration: "0.35s" }}
      >
        {/* Top accent line */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        {/* Inner content */}
        <div className="flex flex-col gap-6 p-6 pb-5">

          {/* Header — icon + title + description */}
          <div className="flex items-start gap-4">
            {/* Animated scanner icon */}
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/15">
              {isComplete ? (
                <CheckCircle2 className="h-5 w-5 text-primary animate-scale-in" />
              ) : (
                <>
                  <div className="absolute inset-0 rounded-xl animate-pulse-glow" />
                  {activeStage && <activeStage.icon className="h-5 w-5 text-primary animate-pulse" style={{ animationDuration: "1.5s" }} />}
                </>
              )}
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <h2 className="text-base font-semibold text-foreground leading-tight">
                {isComplete ? "Analysis complete" : activeStage?.description ?? "Scanning..."}
              </h2>
              <p className="text-[11px] text-muted-foreground/60 leading-snug">
                Godot Project Buddy
              </p>
            </div>
          </div>

          {/* Stage timeline */}
          <div className="flex items-center gap-1">
            {STAGES.map((stage, i) => {
              const done = i < currentIdx || isComplete
              const active = i === currentIdx && !isComplete
              const StageIcon = stage.icon
              return (
                <div key={stage.key} className="flex items-center gap-1 flex-1">
                  {/* Stage pill */}
                  <div
                    className={`flex items-center gap-1.5 flex-1 rounded-lg px-2 py-1.5 transition-all duration-500 ${
                      done
                        ? "bg-primary/12 border border-primary/20"
                        : active
                        ? "bg-primary/8 border border-primary/30 shadow-sm shadow-primary/10"
                        : "bg-muted/30 border border-border/30"
                    }`}
                  >
                    <StageIcon
                      className={`h-3 w-3 shrink-0 transition-colors duration-500 ${
                        done ? "text-primary" : active ? "text-primary animate-pulse" : "text-muted-foreground/30"
                      }`}
                      style={active ? { animationDuration: "1.5s" } : undefined}
                    />
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wide transition-colors duration-500 ${
                        done ? "text-primary/80" : active ? "text-primary" : "text-muted-foreground/25"
                      }`}
                    >
                      {stage.label}
                    </span>
                  </div>
                  {/* Connector */}
                  {i < STAGES.length - 1 && (
                    <div className={`h-px w-2 shrink-0 transition-colors duration-700 ${done ? "bg-primary/30" : "bg-border/20"}`} />
                  )}
                </div>
              )
            })}
          </div>

          {/* Progress bar */}
          <div className="flex flex-col gap-2">
            {/* Bar track */}
            <div className="relative h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
              {/* Glow fill */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-700 ease-out"
                style={{ width: `${percent}%` }}
              />
              {/* Shimmer overlay on the fill */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-transparent via-white/15 to-transparent animate-shimmer"
                style={{ width: `${percent}%` }}
              />
              {/* Glow at the tip */}
              {percent > 2 && percent < 100 && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full blur-md bg-primary/50 transition-all duration-700"
                  style={{ left: `calc(${percent}% - 8px)` }}
                />
              )}
            </div>

            {/* File path + percentage */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-muted-foreground/50 font-mono truncate max-w-[280px] leading-none">
                {progress.currentFile || progress.stageLabel || "Initializing..."}
              </span>
              <span className="text-xs font-bold text-foreground tabular-nums shrink-0 leading-none">
                {percent}%
              </span>
            </div>
          </div>
        </div>

        {/* Footer bar */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border/30 bg-card/50">
          <span className="text-[11px] text-muted-foreground/40 tabular-nums">
            <span className="text-muted-foreground/70 font-medium">{progress.current.toLocaleString()}</span>
            {" / "}
            <span>{progress.total.toLocaleString()}</span>
            {" items"}
          </span>
          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-[11px] h-6 px-2.5 text-muted-foreground/50 hover:text-foreground hover:bg-muted/50"
              onClick={onCancel}
            >
              <X className="h-3 w-3" />
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
