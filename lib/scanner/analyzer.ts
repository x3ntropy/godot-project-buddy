// ============================================================
// Analyzer - Runs all analysis passes
// ============================================================
import type {
  GodotFile,
  AnalysisResults,
  DuplicateGroup,
  SignalWarning,
  NodeWarning,
  ExportVar,
  FileCategory,
  ScanProgress,
  ClassifiedUnusedFile,
} from "./types"
import type { BuildResult } from "./graph-builder"
import { computeRiskScores } from "./risk-scorer"

/** Files/folders to exclude from unused list */
const EXCLUDED_PATTERNS = [
  /^res:\/\/project\.godot$/,
  /^res:\/\/export_presets\.cfg$/,
  /^res:\/\/default_env\.tres$/,
  /^res:\/\/icon\.svg$/,
  /^res:\/\/icon\.png$/,
  /\.import$/,
  /^res:\/\/\.godot\//,
  /^res:\/\/\.git\//,
]

function isExcluded(resPath: string): boolean {
  return EXCLUDED_PATTERNS.some((p) => p.test(resPath))
}

/**
 * Run all analysis passes and produce structured results.
 */
export function analyzeProject(
  files: Map<string, GodotFile>,
  buildResult: BuildResult,
  onProgress?: (progress: ScanProgress) => void,
  scanWarnings: string[] = []
): AnalysisResults {
  onProgress?.({
    stage: "analyzing",
    stageLabel: "Analyzing project...",
    current: 0,
    total: 5,
  })

  const {
    graph,
    reachable,
    parsedScenes,
    parsedScripts,
    projectInfo,
    entryPoints,
    dynamicLoadFiles,
  } = buildResult

  // ---- 1. Unused Files ----
  onProgress?.({
    stage: "analyzing",
    stageLabel: "Finding unused files...",
    current: 1,
    total: 5,
  })

  const unusedFiles: GodotFile[] = []
  const usedFiles: GodotFile[] = []

  for (const [resPath, file] of files.entries()) {
    if (file.category === "import") continue
    if (isExcluded(resPath)) continue

    if (reachable.has(resPath)) {
      usedFiles.push(file)
    } else {
      unusedFiles.push(file)
    }
  }

  const unusedSize = unusedFiles.reduce((sum, f) => sum + f.size, 0)
  const totalSize = [...files.values()].reduce((sum, f) => sum + f.size, 0)

  // ---- 1b. Classify unused files as "safe" or "uncertain" ----
  // Dynamic loads create uncertainty — if a file's extension or path *could* be
  // loaded by any dynamic load pattern, classify it as "uncertain" rather than
  // "safe" to delete.  This favours false positives over false negatives.
  const dynamicLoadPatterns: string[] = []
  for (const script of buildResult.parsedScripts.values()) {
    for (const dl of script.dynamicLoads) {
      dynamicLoadPatterns.push(dl)
    }
  }

  const classifiedUnusedFiles: ClassifiedUnusedFile[] = unusedFiles.map((file) => {
    // Files whose extensions match common dynamically-loaded categories
    const isDynamicallyRisky =
      dynamicLoadPatterns.length > 0 &&
      (file.category === "scene" || file.category === "resource" || file.category === "script")

    // If any dynamic load pattern partially matches this file path
    const pathMatchesDynamic = dynamicLoadPatterns.some((dl) => {
      const pathPart = file.resPath.replace("res://", "")
      return dl.includes(pathPart.split("/").pop()?.replace(file.extension, "") ?? "")
    })

    if (isDynamicallyRisky || pathMatchesDynamic) {
      return {
        file,
        classification: "uncertain" as const,
        reason: "Project contains dynamic load() patterns that may reference this file at runtime.",
      }
    }
    return { file, classification: "safe" as const }
  })

  // ---- 2. Duplicate Functions ----
  onProgress?.({
    stage: "analyzing",
    stageLabel: "Detecting duplicate functions...",
    current: 2,
    total: 5,
  })

  const duplicateFunctions = findDuplicateFunctions(parsedScripts)

  // ---- 3. Export Vars Analysis ----
  onProgress?.({
    stage: "analyzing",
    stageLabel: "Checking export variables...",
    current: 3,
    total: 5,
  })

  const unusedExportVars = findUnusedExportVars(parsedScripts, parsedScenes)

  // ---- 4. Signal Analysis ----
  onProgress?.({
    stage: "analyzing",
    stageLabel: "Analyzing signals...",
    current: 4,
    total: 5,
  })

  const signalWarnings = findSignalWarnings(parsedScripts, parsedScenes)

  // ---- 5. Suspicious Node Warnings ----
  onProgress?.({
    stage: "analyzing",
    stageLabel: "Checking node warnings...",
    current: 5,
    total: 5,
  })

  const nodeWarnings = findSuspiciousNodes(parsedScenes)

  // ---- 5b. Risk Scoring ----
  // Pass a minimal stub so the scorer can access entryPoints, projectInfo,
  // and dynamicLoadFiles — all available at this point in the pipeline.
  const resultsStub = {
    entryPoints,
    projectInfo,
    dynamicLoadFiles,
  } as AnalysisResults

  const riskScores = computeRiskScores(unusedFiles, buildResult, resultsStub)

  // Attach individual scores back to classifiedUnusedFiles for easy access
  for (const cf of classifiedUnusedFiles) {
    cf.riskScore = riskScores.get(cf.file.resPath)
  }

  // ---- Category Counts ----
  const categoryCounts: Record<FileCategory, number> = {
    script: 0,
    scene: 0,
    resource: 0,
    asset: 0,
    config: 0,
    import: 0,
    other: 0,
  }
  for (const file of files.values()) {
    categoryCounts[file.category]++
  }

  onProgress?.({
    stage: "complete",
    stageLabel: "Analysis complete!",
    current: 1,
    total: 1,
  })

  return {
    totalFiles: files.size,
    totalSize,
    projectInfo,
    graph,
    unusedFiles,
    classifiedUnusedFiles,
    unusedSize,
    usedFiles,
    duplicateFunctions,
    unusedExportVars,
    signalWarnings,
    nodeWarnings,
    dynamicLoadFiles,
    categoryCounts,
    entryPoints,
    scanWarnings,
    riskScores,
  }
}

// ============================================================
// Sub-Analyzers
// ============================================================

function findDuplicateFunctions(
  scripts: BuildResult["parsedScripts"]
): DuplicateGroup[] {
  // Group functions by body hash
  const hashGroups = new Map<
    string,
    { name: string; filePath: string; line: number; bodyPreview: string }[]
  >()

  for (const script of scripts.values()) {
    for (const func of script.functions) {
      // Skip trivial functions (empty body or just 'pass')
      if (!func.bodyHash || func.lineCount <= 1) continue
      // Skip common lifecycle functions
      if (
        ["_ready", "_process", "_physics_process", "_input", "_enter_tree", "_exit_tree"].includes(
          func.name
        )
      )
        continue

      if (!hashGroups.has(func.bodyHash)) {
        hashGroups.set(func.bodyHash, [])
      }
      hashGroups.get(func.bodyHash)!.push({
        name: func.name,
        filePath: func.filePath,
        line: func.line,
        bodyPreview: func.bodyPreview,
      })
    }
  }

  // Only keep groups with 2+ occurrences
  const duplicates: DuplicateGroup[] = []
  for (const [hash, occurrences] of hashGroups.entries()) {
    if (occurrences.length < 2) continue
    duplicates.push({
      hash,
      functionName: occurrences[0].name,
      bodyPreview: occurrences[0].bodyPreview,
      occurrences: occurrences.map((o) => ({
        filePath: o.filePath,
        functionName: o.name,
        line: o.line,
      })),
    })
  }

  return duplicates.sort((a, b) => b.occurrences.length - a.occurrences.length)
}

function findUnusedExportVars(
  scripts: BuildResult["parsedScripts"],
  scenes: BuildResult["parsedScenes"]
): ExportVar[] {
  const unused: ExportVar[] = []

  // Build a map of script path → set of properties set in scenes
  const scenePropertySets = new Map<string, Set<string>>()
  for (const scene of scenes.values()) {
    for (const node of scene.nodes) {
      if (node.scriptRef) {
        if (!scenePropertySets.has(node.scriptRef)) {
          scenePropertySets.set(node.scriptRef, new Set())
        }
        for (const propName of Object.keys(node.properties)) {
          scenePropertySets.get(node.scriptRef)!.add(propName)
        }
      }
    }
  }

  for (const script of scripts.values()) {
    for (const exportVar of script.exportVars) {
      const sceneProps = scenePropertySets.get(script.resPath)
      exportVar.usedInScene = sceneProps ? sceneProps.has(exportVar.name) : false

      if (!exportVar.usedInScript && !exportVar.usedInScene) {
        unused.push({
          ...exportVar,
          // Attach file path for display
          name: exportVar.name,
          line: exportVar.line,
          type: exportVar.type,
          defaultValue: exportVar.defaultValue,
          usedInScript: false,
          usedInScene: false,
        })
      }
    }
  }

  return unused
}

function findSignalWarnings(
  scripts: BuildResult["parsedScripts"],
  scenes: BuildResult["parsedScenes"]
): SignalWarning[] {
  const warnings: SignalWarning[] = []

  // Collect all signal connections from scenes
  const connectedSignals = new Set<string>()
  for (const scene of scenes.values()) {
    for (const conn of scene.connections) {
      connectedSignals.add(conn.signal)
    }
  }

  // Collect all .connect() calls and emit calls from scripts
  const codeConnectedSignals = new Set<string>()
  const emittedSignals = new Set<string>()
  for (const script of scripts.values()) {
    for (const conn of script.connectCalls) {
      codeConnectedSignals.add(conn.signalName)
    }
    for (const emit of script.emitCalls) {
      emittedSignals.add(emit)
    }
  }

  // Check each signal definition
  for (const script of scripts.values()) {
    for (const signal of script.signals) {
      const isConnected =
        connectedSignals.has(signal.name) || codeConnectedSignals.has(signal.name)
      const isEmitted = emittedSignals.has(signal.name)

      if (!isConnected || !isEmitted) {
        warnings.push({
          signalName: signal.name,
          definedIn: signal.filePath,
          line: signal.line,
          isConnected,
          isEmitted,
        })
      }
    }
  }

  return warnings
}

function findSuspiciousNodes(
  scenes: BuildResult["parsedScenes"]
): NodeWarning[] {
  const warnings: NodeWarning[] = []

  for (const scene of scenes.values()) {
    for (const node of scene.nodes) {
      // Skip root node
      if (!node.parent && node.parent !== ".") continue

      const hasScript = !!node.scriptRef
      const hasProperties = Object.keys(node.properties).length > 0

      // Node with no script, no custom type, and minimal properties
      if (
        !hasScript &&
        !hasProperties &&
        node.type === "Node" &&
        !scene.connections.some(
          (c) => c.from.includes(node.name) || c.to.includes(node.name)
        )
      ) {
        warnings.push({
          nodeName: node.name,
          scenePath: scene.resPath,
          nodeType: node.type,
          reason: "Empty Node with no script, signals, or properties",
        })
      }
    }
  }

  return warnings
}
