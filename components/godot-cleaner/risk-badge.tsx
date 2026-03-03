"use client"

import type { RiskScore } from "@/lib/scanner/risk-scorer"
import { cn } from "@/lib/utils"

// ─── Label → visual config ────────────────────────────────────────────────────

const LABEL_CONFIG: Record<
  RiskScore["label"],
  { fg: string; bg: string; ring: string; bar: string; text: string }
> = {
  safe:      { fg: "text-emerald-400",   bg: "bg-emerald-400/10", ring: "ring-emerald-400/20", bar: "bg-emerald-400",  text: "Safe"     },
  "low-risk":{ fg: "text-teal-400",      bg: "bg-teal-400/10",    ring: "ring-teal-400/20",    bar: "bg-teal-400",    text: "Low Risk" },
  moderate:  { fg: "text-yellow-400",    bg: "bg-yellow-400/10",  ring: "ring-yellow-400/20",  bar: "bg-yellow-400",  text: "Moderate" },
  uncertain: { fg: "text-orange-400",    bg: "bg-orange-400/10",  ring: "ring-orange-400/20",  bar: "bg-orange-400",  text: "Uncertain"},
  risky:     { fg: "text-red-400",       bg: "bg-red-400/10",     ring: "ring-red-400/20",     bar: "bg-red-400",     text: "Risky"    },
}

// ─── Score bar ────────────────────────────────────────────────────────────────

interface ScoreBarProps {
  score: number
  label: RiskScore["label"]
  className?: string
}

export function ScoreBar({ score, label, className }: ScoreBarProps) {
  const cfg = LABEL_CONFIG[label]
  const pct = Math.round(score * 100)
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative h-1.5 flex-1 rounded-full bg-muted/50 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", cfg.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("text-[10px] font-semibold tabular-nums w-7 text-right", cfg.fg)}>
        {pct}
      </span>
    </div>
  )
}

// ─── Inline badge ─────────────────────────────────────────────────────────────

interface RiskBadgeProps {
  riskScore: RiskScore
  showScore?: boolean
  size?: "sm" | "xs"
}

export function RiskBadge({ riskScore, showScore = true, size = "sm" }: RiskBadgeProps) {
  const cfg = LABEL_CONFIG[riskScore.label]
  const pct = Math.round(riskScore.score * 100)

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md ring-1 font-medium whitespace-nowrap",
        cfg.bg,
        cfg.fg,
        cfg.ring,
        size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]"
      )}
      title={riskScore.dominantReason}
    >
      {/* Mini gauge dot */}
      <span className={cn("rounded-full shrink-0", cfg.bar, size === "xs" ? "h-1.5 w-1.5" : "h-2 w-2")} />
      {cfg.text}
      {showScore && (
        <span className="opacity-60 tabular-nums">{pct}</span>
      )}
    </span>
  )
}

// ─── Detailed factor breakdown card ──────────────────────────────────────────

interface RiskBreakdownProps {
  riskScore: RiskScore
}

const FACTOR_LABELS: Record<string, string> = {
  referenceDepth:  "Reference Depth",
  assetType:       "Asset Type",
  entryProximity:  "Entry Proximity",
  dynamicExposure: "Dynamic Load Risk",
  pathHeuristic:   "Path Heuristics",
}

const FACTOR_DESCRIPTIONS: Record<string, string> = {
  referenceDepth:  "How isolated the file is within the dependency graph",
  assetType:       "Inherent risk based on file category (script > scene > asset)",
  entryProximity:  "Distance from the nearest project entry point",
  dynamicExposure: "Likelihood of being referenced via dynamic load() calls",
  pathHeuristic:   "Whether the file path suggests a critical project role",
}

export function RiskBreakdown({ riskScore }: RiskBreakdownProps) {
  const cfg = LABEL_CONFIG[riskScore.label]

  return (
    <div className="flex flex-col gap-3">
      {/* Overall */}
      <div className={cn("flex items-center justify-between rounded-lg px-3 py-2.5 ring-1", cfg.bg, cfg.ring)}>
        <div className="flex flex-col gap-0.5">
          <span className={cn("text-xs font-semibold", cfg.fg)}>{cfg.text}</span>
          <span className="text-[10px] text-muted-foreground leading-snug max-w-[220px]">
            {riskScore.dominantReason}
          </span>
        </div>
        <span className={cn("text-2xl font-bold tabular-nums", cfg.fg)}>
          {Math.round(riskScore.score * 100)}
        </span>
      </div>

      {/* Factor breakdown */}
      <div className="flex flex-col gap-2">
        {(Object.entries(riskScore.factors) as [string, number][]).map(([key, value]) => {
          const factorLabel = LABEL_CONFIG[scoreToLabel(value)]
          return (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground" title={FACTOR_DESCRIPTIONS[key]}>
                  {FACTOR_LABELS[key] || key}
                </span>
                <span className={cn("text-[10px] font-medium tabular-nums", factorLabel.fg)}>
                  {Math.round(value * 100)}
                </span>
              </div>
              <ScoreBar score={value} label={scoreToLabel(value)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Score pill for table rows ────────────────────────────────────────────────

interface ScorePillProps {
  score: number
  label: RiskScore["label"]
}

export function ScorePill({ score, label }: ScorePillProps) {
  const cfg = LABEL_CONFIG[label]
  const pct = Math.round(score * 100)
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="relative h-1 w-12 rounded-full bg-muted/40 overflow-hidden shrink-0">
        <div
          className={cn("h-full rounded-full", cfg.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("text-[10px] font-semibold tabular-nums w-5", cfg.fg)}>{pct}</span>
    </div>
  )
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function scoreToLabel(score: number): RiskScore["label"] {
  if (score >= 0.80) return "safe"
  if (score >= 0.62) return "low-risk"
  if (score >= 0.44) return "moderate"
  if (score >= 0.28) return "uncertain"
  return "risky"
}
