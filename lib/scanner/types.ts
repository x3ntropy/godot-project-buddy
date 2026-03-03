// ============================================================
// Godot Project Cleaner - Type Definitions
// ============================================================

/** File categories recognized in a Godot project */
export type FileCategory = "script" | "scene" | "resource" | "asset" | "config" | "import" | "other"

/** File extensions mapped to categories */
export const EXTENSION_CATEGORY: Record<string, FileCategory> = {
  ".gd": "script",
  ".tscn": "scene",
  ".tres": "resource",
  ".godot": "config",
  ".cfg": "config",
  ".import": "import",
  ".png": "asset",
  ".jpg": "asset",
  ".jpeg": "asset",
  ".webp": "asset",
  ".svg": "asset",
  ".bmp": "asset",
  ".wav": "asset",
  ".ogg": "asset",
  ".mp3": "asset",
  ".glb": "asset",
  ".gltf": "asset",
  ".obj": "asset",
  ".fbx": "asset",
  ".dae": "asset",
  ".ttf": "asset",
  ".otf": "asset",
  ".woff": "asset",
  ".woff2": "asset",
  ".tres": "resource",
  ".material": "asset",
  ".shader": "asset",
  ".gdshader": "asset",
}

/** Represents a single file in the Godot project */
export interface GodotFile {
  /** res:// path used by Godot */
  resPath: string
  /** Relative path from project root */
  relativePath: string
  /** File extension including dot */
  extension: string
  /** File size in bytes */
  size: number
  /** Categorized file type */
  category: FileCategory
  /** Raw text content (for parseable files) */
  content?: string
}

/** Parsed data from a .tscn scene file */
export interface ParsedScene {
  resPath: string
  /** All ext_resource paths referenced */
  externalResources: string[]
  /** All sub_resource references */
  subResources: string[]
  /** Signal connections */
  connections: SceneConnection[]
  /** Node definitions */
  nodes: SceneNode[]
  /** Script paths attached to nodes */
  attachedScripts: string[]
}

/** A signal connection in a .tscn file */
export interface SceneConnection {
  signal: string
  from: string
  to: string
  method: string
}

/** A node definition in a .tscn file */
export interface SceneNode {
  name: string
  type: string
  parent: string
  scriptRef?: string
  /** Properties set on the node (key=value) */
  properties: Record<string, string>
}

/** Parsed data from a .gd script file */
export interface ParsedScript {
  resPath: string
  /** class_name if declared */
  className?: string
  /** All preload/load resource paths */
  loadedResources: string[]
  /** Dynamic load references (string concatenation) */
  dynamicLoads: string[]
  /** Export variable declarations */
  exportVars: ExportVar[]
  /** Signal definitions */
  signals: SignalDef[]
  /** Function definitions */
  functions: FunctionDef[]
  /** All .connect() calls */
  connectCalls: ConnectCall[]
  /** All .emit_signal() or signal.emit() calls */
  emitCalls: string[]
  /** Extends clause */
  extendsClass?: string
}

/** An @export variable in a script */
export interface ExportVar {
  name: string
  line: number
  type?: string
  defaultValue?: string
  /** The res:// path of the script this var belongs to */
  filePath: string
  /** Whether this var is read elsewhere in the same script */
  usedInScript: boolean
  /** Whether this var is set in any .tscn file */
  usedInScene: boolean
}

/** A signal definition in a script */
export interface SignalDef {
  name: string
  line: number
  filePath: string
}

/** A function definition in a script */
export interface FunctionDef {
  name: string
  line: number
  filePath: string
  /** Normalized body for duplicate detection */
  bodyHash: string
  /** Raw body for display */
  bodyPreview: string
  /** Number of lines */
  lineCount: number
}

/** A .connect() call in a script */
export interface ConnectCall {
  signalName: string
  line: number
  targetMethod?: string
}

/** Parsed data from a .tres resource file */
export interface ParsedResource {
  resPath: string
  externalResources: string[]
}

/** Parsed project.godot data */
export interface ParsedProject {
  mainScene?: string
  autoloads: { name: string; path: string }[]
  projectName?: string
}

// ============================================================
// Analysis Results
// ============================================================

/** A node in the dependency graph */
export interface GraphNode {
  id: string
  label: string
  category: FileCategory
  size: number
  used: boolean
  isEntryPoint: boolean
  hasDynamicLoad: boolean
}

/** A link/edge in the dependency graph */
export interface GraphLink {
  source: string
  target: string
}

/** Graph data for visualization */
export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

/** Full results of a duplicate function group */
export interface DuplicateGroup {
  hash: string
  functionName: string
  bodyPreview: string
  occurrences: {
    filePath: string
    functionName: string
    line: number
  }[]
}

/** An unconnected signal warning */
export interface SignalWarning {
  signalName: string
  definedIn: string
  line: number
  isConnected: boolean
  isEmitted: boolean
}

/** A suspicious node warning */
export interface NodeWarning {
  nodeName: string
  scenePath: string
  nodeType: string
  reason: string
}

/** Classification for unused files */
export type UnusedClassification = "safe" | "uncertain"

/** An unused file with its classification and risk score */
export interface ClassifiedUnusedFile {
  file: GodotFile
  classification: UnusedClassification
  /** Reason it's classified as uncertain */
  reason?: string
  /** Risk score (0 = high risk, 1 = safe to delete). Populated after scoring pass. */
  riskScore?: import("./risk-scorer").RiskScore
}

/** Complete analysis results */
export interface AnalysisResults {
  /** Total files scanned */
  totalFiles: number
  /** Total project size */
  totalSize: number
  /** Parsed project info */
  projectInfo: ParsedProject
  /** The dependency graph */
  graph: GraphData
  /** Unused files (unreachable from entry points) */
  unusedFiles: GodotFile[]
  /** Classified unused files with safe/uncertain labels */
  classifiedUnusedFiles: ClassifiedUnusedFile[]
  /** Total size of unused files */
  unusedSize: number
  /** Used files */
  usedFiles: GodotFile[]
  /** Duplicate function groups */
  duplicateFunctions: DuplicateGroup[]
  /** Export vars that appear unused */
  unusedExportVars: ExportVar[]
  /** Signals with warnings */
  signalWarnings: SignalWarning[]
  /** Suspicious nodes */
  nodeWarnings: NodeWarning[]
  /** Files with dynamic loads */
  dynamicLoadFiles: string[]
  /** Breakdown by category */
  categoryCounts: Record<FileCategory, number>
  /** Entry points used */
  entryPoints: string[]
  /** Scanner warnings (security, performance) */
  scanWarnings: string[]
  /** Risk scores keyed by resPath for all classified unused files */
  riskScores: Map<string, import("./risk-scorer").RiskScore>
}

/** Progress callback for scan stages */
export interface ScanProgress {
  stage: "reading" | "parsing" | "graphing" | "analyzing" | "complete"
  stageLabel: string
  current: number
  total: number
  currentFile?: string
}
