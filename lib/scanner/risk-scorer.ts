// ============================================================
// Risk Scorer — Deletion Safety Scoring Engine
// ============================================================
//
// Produces a score from 0 → 1 for each unused file, where:
//   0 = HIGH risk (do NOT delete without careful review)
//   1 = LOW risk  (safe to delete)
//
// The score is a weighted combination of five independent factors:
//
//  Factor                   Weight   Description
//  ─────────────────────    ──────   ──────────────────────────────────
//  1. Reference Depth        0.30    How far from any entry point the file
//                                    is in the dependency graph (deeper =
//                                    more isolated = safer)
//  2. Asset Type             0.20    Category-based base risk (scripts and
//                                    scenes are riskier than raw assets)
//  3. Proximity to Entries   0.25    Minimum graph distance from any entry
//                                    point (closer = riskier)
//  4. Dynamic Load Exposure  0.15    Whether the project has dynamic load()
//                                    patterns that could reference this file
//  5. File Path Heuristics   0.10    Path segments that hint at criticality
//                                    (e.g. "autoload", "singleton", "main")
//
// ============================================================

import type { GodotFile, FileCategory, AnalysisResults } from "./types"
import type { BuildResult } from "./graph-builder"

// ─── Public API ──────────────────────────────────────────────────────────────

export interface RiskScore {
  /** Overall score: 0 (risky) → 1 (safe to delete) */
  score: number
  /** Human-readable label */
  label: "safe" | "low-risk" | "moderate" | "uncertain" | "risky"
  /** Individual factor scores (each 0→1) */
  factors: RiskFactors
  /** Short explanation of the dominant factor */
  dominantReason: string
}

export interface RiskFactors {
  /** How isolated the file is in the graph (1 = completely isolated) */
  referenceDepth: number
  /** Safety score from asset category alone */
  assetType: number
  /** Proximity to entry points (1 = far away, 0 = directly adjacent) */
  entryProximity: number
  /** Whether dynamic loads could reference it (1 = no dynamic risk) */
  dynamicExposure: number
  /** Path-based heuristic safety (1 = nothing suspicious in path) */
  pathHeuristic: number
}

/** Weights for each factor — must sum to 1.0 */
const WEIGHTS: Record<keyof RiskFactors, number> = {
  referenceDepth: 0.30,
  assetType: 0.20,
  entryProximity: 0.25,
  dynamicExposure: 0.15,
  pathHeuristic: 0.10,
}

// ─── Category base-safety scores ─────────────────────────────────────────────
// How inherently "safe" each category is to delete (0→1)
const CATEGORY_SAFETY: Record<FileCategory, number> = {
  script:   0.20,  // Scripts may be loaded dynamically or referenced by class_name
  scene:    0.30,  // Scenes can be instanced dynamically at runtime
  resource: 0.50,  // Resources are moderately safe — often have static refs
  asset:    0.80,  // Raw assets (images, audio) are rarely dynamically loaded
  config:   0.10,  // Config files are almost always critical
  import:   0.90,  // .import sidecars — safe if the source is gone
  other:    0.60,
}

// ─── Path segments that increase deletion risk ────────────────────────────────
const RISKY_PATH_SEGMENTS = [
  "autoload",
  "singleton",
  "global",
  "main",
  "boot",
  "splash",
  "entry",
  "init",
  "base",
  "core",
  "manager",
  "system",
  "game_manager",
  "scene_manager",
  "event_bus",
]

// ─── Main scorer ─────────────────────────────────────────────────────────────

/**
 * Compute risk scores for all classified unused files.
 * Returns a Map from resPath → RiskScore.
 */
export function computeRiskScores(
  unusedFiles: GodotFile[],
  buildResult: BuildResult,
  results: AnalysisResults
): Map<string, RiskScore> {
  const scores = new Map<string, RiskScore>()

  // Pre-compute BFS distances from all entry points
  const distanceMap = computeEntryDistances(buildResult)

  // Max depth in the graph for normalisation
  const maxDist = Math.max(...distanceMap.values(), 1)

  // Determine if the project has dynamic load patterns
  const hasDynamicLoads = buildResult.dynamicLoadFiles.length > 0

  for (const file of unusedFiles) {
    const factors = computeFactors(file, distanceMap, maxDist, hasDynamicLoads, results)
    const score = computeWeightedScore(factors)
    const label = scoreToLabel(score)
    const dominantReason = findDominantReason(factors, file)

    scores.set(file.resPath, { score, label, factors, dominantReason })
  }

  return scores
}

// ─── Factor computers ─────────────────────────────────────────────────────────

function computeFactors(
  file: GodotFile,
  distanceMap: Map<string, number>,
  maxDist: number,
  hasDynamicLoads: boolean,
  results: AnalysisResults
): RiskFactors {
  return {
    referenceDepth: factorReferenceDepth(file, distanceMap, maxDist),
    assetType: factorAssetType(file),
    entryProximity: factorEntryProximity(file, distanceMap, maxDist),
    dynamicExposure: factorDynamicExposure(file, hasDynamicLoads),
    pathHeuristic: factorPathHeuristic(file),
  }
}

/**
 * Factor 1 — Reference Depth
 * Files that appear deep in the dependency graph or have no path from entry
 * points are more isolated and therefore safer to remove.
 * Score = 1 when completely unreachable (dist = Infinity / absent from map).
 */
function factorReferenceDepth(
  file: GodotFile,
  distanceMap: Map<string, number>,
  maxDist: number
): number {
  const dist = distanceMap.get(file.resPath)
  if (dist === undefined || dist === Infinity) return 1.0
  // The deeper in the graph, the safer (normalise against maxDist)
  return Math.min(dist / maxDist, 1.0)
}

/**
 * Factor 2 — Asset Type
 * Raw category-based safety heuristic.
 */
function factorAssetType(file: GodotFile): number {
  return CATEGORY_SAFETY[file.category] ?? 0.50
}

/**
 * Factor 3 — Entry Point Proximity
 * The minimum BFS distance from any entry point. Files right next to entry
 * points are riskier — even if unused, they might be important context.
 * Inverted so that far-away files get a high (safe) score.
 */
function factorEntryProximity(
  file: GodotFile,
  distanceMap: Map<string, number>,
  maxDist: number
): number {
  const dist = distanceMap.get(file.resPath)
  if (dist === undefined || dist === Infinity) return 1.0
  if (dist === 0) return 0.0 // This IS an entry point — should not appear in unused
  // Normalise: larger distance → safer
  return Math.min(dist / maxDist, 1.0)
}

/**
 * Factor 4 — Dynamic Load Exposure
 * If the project uses dynamic load() patterns, scripts and scenes are at risk
 * of being referenced at runtime even when no static edge was found.
 */
function factorDynamicExposure(file: GodotFile, hasDynamicLoads: boolean): number {
  if (!hasDynamicLoads) return 1.0
  // Scripts and scenes face the most exposure from dynamic loads
  if (file.category === "script" || file.category === "scene") return 0.25
  if (file.category === "resource") return 0.55
  return 0.85 // assets are rarely dynamically loaded by path
}

/**
 * Factor 5 — Path Heuristics
 * If the file path contains segments that commonly indicate critical files,
 * lower its safety score.
 */
function factorPathHeuristic(file: GodotFile): number {
  const lowerPath = file.resPath.toLowerCase()
  const matchedSegments = RISKY_PATH_SEGMENTS.filter((seg) =>
    lowerPath.includes(seg)
  )
  if (matchedSegments.length === 0) return 1.0
  // Each matched segment reduces safety
  const penalty = Math.min(matchedSegments.length * 0.25, 0.90)
  return Math.max(1.0 - penalty, 0.10)
}

// ─── Weighted aggregation ─────────────────────────────────────────────────────

function computeWeightedScore(factors: RiskFactors): number {
  let total = 0
  for (const [key, weight] of Object.entries(WEIGHTS) as [keyof RiskFactors, number][]) {
    total += factors[key] * weight
  }
  return Math.round(total * 1000) / 1000 // round to 3dp
}

// ─── Label mapper ─────────────────────────────────────────────────────────────

function scoreToLabel(score: number): RiskScore["label"] {
  if (score >= 0.80) return "safe"
  if (score >= 0.62) return "low-risk"
  if (score >= 0.44) return "moderate"
  if (score >= 0.28) return "uncertain"
  return "risky"
}

// ─── Dominant reason ──────────────────────────────────────────────────────────

function findDominantReason(factors: RiskFactors, file: GodotFile): string {
  // Find which factor is pulling the score down the most
  const penalties: { factor: keyof RiskFactors; value: number }[] = [
    { factor: "referenceDepth", value: 1.0 - factors.referenceDepth },
    { factor: "assetType", value: 1.0 - factors.assetType },
    { factor: "entryProximity", value: 1.0 - factors.entryProximity },
    { factor: "dynamicExposure", value: 1.0 - factors.dynamicExposure },
    { factor: "pathHeuristic", value: 1.0 - factors.pathHeuristic },
  ]

  penalties.sort((a, b) => b.value - a.value)
  const dominant = penalties[0]

  const reasons: Record<keyof RiskFactors, string> = {
    referenceDepth: "Close to referenced files in the dependency graph",
    assetType: file.category === "script"
      ? "Scripts can be loaded dynamically via class_name"
      : file.category === "scene"
      ? "Scenes can be instanced at runtime"
      : file.category === "config"
      ? "Config files are typically critical to the project"
      : "Asset type has elevated deletion risk",
    entryProximity: "Located near project entry points in the graph",
    dynamicExposure: "Project uses dynamic load() — may reference this file at runtime",
    pathHeuristic: "File path contains segments suggesting a critical role",
  }

  // If all penalties are low, it's just clean
  if (dominant.value < 0.1) return "No significant risk factors detected"

  return reasons[dominant.factor]
}

// ─── BFS distance computation ─────────────────────────────────────────────────

/**
 * Compute BFS distances from ALL entry points using the reverse adjacency list.
 * A file that is directly depended-upon by an entry point gets distance 1.
 * Files with no path from any entry point get Infinity / are absent from the map.
 *
 * We use the *forward* adjacency (entry → dependencies) and BFS outward,
 * so distance represents "how many hops from the nearest root".
 */
function computeEntryDistances(buildResult: BuildResult): Map<string, number> {
  const dist = new Map<string, number>()
  const queue: string[] = []

  for (const entry of buildResult.entryPoints) {
    if (!dist.has(entry)) {
      dist.set(entry, 0)
      queue.push(entry)
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    const currentDist = dist.get(current)!
    const deps = buildResult.adjacency.get(current)
    if (!deps) continue
    for (const dep of deps) {
      if (!dist.has(dep)) {
        dist.set(dep, currentDist + 1)
        queue.push(dep)
      }
    }
  }

  return dist
}
