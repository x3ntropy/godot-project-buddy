// ============================================================
// Dependency Graph Builder
// ============================================================
import type {
  GodotFile,
  ParsedScene,
  ParsedScript,
  ParsedResource,
  ParsedProject,
  GraphData,
  GraphNode,
  GraphLink,
  ScanProgress,
} from "./types"
import { parseTscn } from "./tscn-parser"
import { parseGdScript } from "./gd-parser"
import { parseTres } from "./tres-parser"
import { parseProjectGodot } from "./project-parser"

export interface BuildResult {
  graph: GraphData
  adjacency: Map<string, Set<string>>
  reachable: Set<string>
  parsedScenes: Map<string, ParsedScene>
  parsedScripts: Map<string, ParsedScript>
  parsedResources: Map<string, ParsedResource>
  projectInfo: ParsedProject
  entryPoints: string[]
  dynamicLoadFiles: string[]
}

/**
 * Build the complete dependency graph from parsed files.
 *
 * Algorithm (mirrors garbage collection):
 * 1. Parse all .gd, .tscn, .tres, project.godot files
 * 2. Build adjacency list (directed edges: A depends on B)
 * 3. Define roots: main scene + autoloads
 * 4. BFS/DFS from roots to mark all reachable files as "used"
 * 5. Anything not reachable = "unused"
 */
export function buildDependencyGraph(
  files: Map<string, GodotFile>,
  onProgress?: (progress: ScanProgress) => void
): BuildResult {
  const adjacency = new Map<string, Set<string>>()
  const parsedScenes = new Map<string, ParsedScene>()
  const parsedScripts = new Map<string, ParsedScript>()
  const parsedResources = new Map<string, ParsedResource>()
  const dynamicLoadFiles: string[] = []
  let projectInfo: ParsedProject = { autoloads: [] }

  // Initialize adjacency list for ALL files (every file is a node in the graph)
  for (const resPath of files.keys()) {
    adjacency.set(resPath, new Set())
  }

  // Build a normalised-path → canonical-resPath lookup so that edge targets
  // coming from file content (which may differ in casing) still resolve to
  // the actual file key stored in the Map.
  const normalizedPathLookup = new Map<string, string>()
  for (const resPath of files.keys()) {
    normalizedPathLookup.set(resPath.toLowerCase(), resPath)
  }

  // Build a class_name -> res:// path map for resolving class references
  const classNameMap = new Map<string, string>()

  // ---- PARSING PHASE ----
  const parseableFiles = [...files.entries()].filter(
    ([, f]) => f.content !== undefined
  )
  const total = parseableFiles.length

  for (let i = 0; i < parseableFiles.length; i++) {
    const [resPath, file] = parseableFiles[i]
    const content = file.content!

    onProgress?.({
      stage: "parsing",
      stageLabel: "Parsing files...",
      current: i + 1,
      total,
      currentFile: file.relativePath,
    })

    if (file.extension === ".godot" && file.relativePath === "project.godot") {
      projectInfo = parseProjectGodot(content)
    } else if (file.extension === ".tscn") {
      const parsed = parseTscn(content, resPath)
      parsedScenes.set(resPath, parsed)

      // Add edges: scene -> its external resources
      for (const dep of parsed.externalResources) {
        addEdgeResolved(adjacency, normalizedPathLookup, resPath, dep)
      }
    } else if (file.extension === ".gd") {
      const parsed = parseGdScript(content, resPath)
      parsedScripts.set(resPath, parsed)

      if (parsed.className) {
        classNameMap.set(parsed.className, resPath)
      }

      // Add edges: script -> loaded resources
      for (const dep of parsed.loadedResources) {
        addEdgeResolved(adjacency, normalizedPathLookup, resPath, dep)
      }

      if (parsed.dynamicLoads.length > 0) {
        dynamicLoadFiles.push(resPath)
      }
    } else if (file.extension === ".tres") {
      const parsed = parseTres(content, resPath)
      parsedResources.set(resPath, parsed)

      for (const dep of parsed.externalResources) {
        addEdgeResolved(adjacency, normalizedPathLookup, resPath, dep)
      }
    }
  }

  // ---- RESOLVE CLASS_NAME REFERENCES ----
  // If script A extends class_name "Player" (defined in script B), add edge A -> B.
  // Also if script A uses "Player" as a type annotation, add edge A -> B.
  for (const script of parsedScripts.values()) {
    if (script.extendsClass && classNameMap.has(script.extendsClass)) {
      const targetPath = classNameMap.get(script.extendsClass)!
      if (targetPath !== script.resPath) {
        addEdge(adjacency, script.resPath, targetPath)
      }
    }
    // Scan script content for class_name usage (type annotations, constructors, etc.)
    const fileObj = files.get(script.resPath)
    if (fileObj?.content) {
      for (const [className, classPath] of classNameMap.entries()) {
        if (classPath === script.resPath) continue
        const classUsageRegex = new RegExp(`\\b${className}\\b`)
        if (classUsageRegex.test(fileObj.content)) {
          addEdge(adjacency, script.resPath, classPath)
        }
      }
    }
  }

  // ---- GRAPH TRAVERSAL (BFS from execution roots) ----
  onProgress?.({
    stage: "graphing",
    stageLabel: "Building dependency graph...",
    current: 0,
    total: 1,
  })

  // Define execution roots: main scene + autoloads
  const entryPoints: string[] = []
  if (projectInfo.mainScene) {
    // Resolve the main scene path through the normalised lookup
    const resolved = resolveResPath(normalizedPathLookup, projectInfo.mainScene)
    entryPoints.push(resolved)
  }
  for (const autoload of projectInfo.autoloads) {
    const resolved = resolveResPath(normalizedPathLookup, autoload.path)
    entryPoints.push(resolved)
  }

  // BFS: roots are live anchors, traverse marks live dependencies
  const reachable = new Set<string>()
  const queue: string[] = [...entryPoints]

  // project.godot itself is always "used"
  const projectGodotPath = "res://project.godot"
  if (files.has(projectGodotPath)) {
    reachable.add(projectGodotPath)
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    if (reachable.has(current)) continue
    reachable.add(current)

    // Follow forward edges: current depends on these files
    const deps = adjacency.get(current)
    if (deps) {
      for (const dep of deps) {
        if (!reachable.has(dep)) {
          queue.push(dep)
        }
      }
    }
  }

  // ---- BUILD GRAPH DATA FOR VISUALIZATION ----
  const nodes: GraphNode[] = []
  const links: GraphLink[] = []

  for (const [resPath, file] of files.entries()) {
    // Skip .import files from visualization
    if (file.category === "import") continue

    nodes.push({
      id: resPath,
      label: file.relativePath.split("/").pop() || resPath,
      category: file.category,
      size: file.size,
      used: reachable.has(resPath),
      isEntryPoint: entryPoints.includes(resPath),
      hasDynamicLoad: dynamicLoadFiles.includes(resPath),
    })
  }

  for (const [source, targets] of adjacency.entries()) {
    const sourceFile = files.get(source)
    if (sourceFile?.category === "import") continue

    for (const target of targets) {
      const targetFile = files.get(target)
      if (targetFile?.category === "import") continue

      // Only add links where both nodes exist in our file map
      if (files.has(source) && files.has(target)) {
        links.push({ source, target })
      }
    }
  }

  return {
    graph: { nodes, links },
    adjacency,
    reachable,
    parsedScenes,
    parsedScripts,
    parsedResources,
    projectInfo,
    entryPoints,
    dynamicLoadFiles,
  }
}

/**
 * Resolve a res:// path extracted from file content to its canonical key in
 * the files Map. This handles potential case mismatches between the path
 * written in a Godot file and the actual file system path.
 */
function resolveResPath(
  normalizedLookup: Map<string, string>,
  rawPath: string
): string {
  // Try exact match first
  const lower = rawPath.toLowerCase()
  return normalizedLookup.get(lower) || rawPath
}

/**
 * Add a directed edge from -> to, resolving the target path through the
 * normalised lookup to handle case mismatches.
 */
function addEdgeResolved(
  adjacency: Map<string, Set<string>>,
  normalizedLookup: Map<string, string>,
  from: string,
  rawTo: string
) {
  const to = resolveResPath(normalizedLookup, rawTo)
  addEdge(adjacency, from, to)
}

function addEdge(
  adjacency: Map<string, Set<string>>,
  from: string,
  to: string
) {
  if (!adjacency.has(from)) {
    adjacency.set(from, new Set())
  }
  adjacency.get(from)!.add(to)
}
