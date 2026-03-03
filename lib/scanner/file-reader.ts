// ============================================================
// File Reader - supports <input webkitdirectory> folder upload
// ============================================================
import type { GodotFile, FileCategory, ScanProgress } from "./types"
import { EXTENSION_CATEGORY } from "./types"

/** Folders to always skip */
const ALWAYS_SKIP = new Set([".godot", ".import", ".git", ".vs", "__pycache__"])

/** Extensions to read content from */
const READABLE_EXTENSIONS = new Set([".gd", ".tscn", ".tres", ".godot", ".cfg", ".import"])

// ── Security guards ──────────────────────────────────────────────────────────

/** Maximum folder nesting depth to prevent recursive-symlink or zip-bomb attacks */
const MAX_DEPTH = 64

/** File count threshold — warn the caller if exceeded */
const FILE_COUNT_WARNING_THRESHOLD = 20_000

/** Maximum files to process before aborting to avoid OOM */
const FILE_COUNT_HARD_LIMIT = 200_000

export interface ScanWarning {
  code: "file_count_high" | "path_traversal" | "depth_exceeded" | "unreadable"
  message: string
  file?: string
}

/**
 * Normalise a relative path and reject path-traversal attempts.
 * Returns `null` if the path tries to escape the project root.
 */
function normalizePath(parts: string[]): string | null {
  const segments: string[] = []
  for (const seg of parts) {
    if (seg === "..") return null // path traversal attempt
    if (seg === "." || seg === "") continue
    segments.push(seg)
  }
  return segments.join("/")
}

/**
 * Validate that a FileList contains a valid Godot project
 * (i.e. has a project.godot at the root level).
 */
export function validateGodotProjectFromFiles(files: File[]): boolean {
  return files.some((f) => {
    const parts = f.webkitRelativePath.split("/")
    return parts.length === 2 && parts[1] === "project.godot"
  })
}

/**
 * Read project name from the project.godot file in the FileList.
 */
export async function readProjectNameFromFiles(files: File[]): Promise<string | null> {
  const projectFile = files.find((f) => {
    const parts = f.webkitRelativePath.split("/")
    return parts.length === 2 && parts[1] === "project.godot"
  })
  if (!projectFile) return null
  try {
    const content = await projectFile.text()
    const nameMatch = content.match(/config\/name="([^"]+)"/)
    return nameMatch ? nameMatch[1] : null
  } catch {
    return null
  }
}

/**
 * Convert a FileList from <input webkitdirectory> into a Map of
 * res:// paths → GodotFile objects, suitable for the scanner.
 *
 * Security:
 * - Normalises all paths and rejects path-traversal (../) attempts.
 * - Enforces maximum folder depth to guard against recursive symlinks.
 * - Warns and hard-limits on extreme file counts.
 * - Respects AbortSignal for cancellation.
 * - NEVER executes file content — all files are treated as plain text.
 */
export async function readProjectFiles(
  files: File[],
  options: {
    includeAddons: boolean
    onProgress?: (progress: ScanProgress) => void
    signal?: AbortSignal
  }
): Promise<{ files: Map<string, GodotFile>; warnings: ScanWarning[] }> {
  const result = new Map<string, GodotFile>()
  const warnings: ScanWarning[] = []

  // Filter out files in skipped folders and (optionally) addons
  const filtered = files.filter((f) => {
    const parts = f.webkitRelativePath.split("/")
    for (let i = 1; i < parts.length - 1; i++) {
      if (ALWAYS_SKIP.has(parts[i])) return false
      if (!options.includeAddons && parts[i] === "addons") return false
    }
    return true
  })

  // ── File count guard ────────────────────────────────────────────────────────
  if (filtered.length > FILE_COUNT_WARNING_THRESHOLD) {
    warnings.push({
      code: "file_count_high",
      message: `Project contains ${filtered.length.toLocaleString()} files, which may be slow to scan.`,
    })
  }
  if (filtered.length > FILE_COUNT_HARD_LIMIT) {
    warnings.push({
      code: "file_count_high",
      message: `Project exceeds ${FILE_COUNT_HARD_LIMIT.toLocaleString()} files — aborting to prevent browser crash.`,
    })
    return { files: result, warnings }
  }

  const total = filtered.length

  options.onProgress?.({
    stage: "reading",
    stageLabel: "Reading files...",
    current: 0,
    total,
  })

  for (let i = 0; i < filtered.length; i++) {
    // ── Cancellation support ──────────────────────────────────────────────────
    if (options.signal?.aborted) {
      break
    }

    const file = filtered[i]
    const rawParts = file.webkitRelativePath.split("/")
    // Strip the root folder prefix — relativePath is relative to project root
    const innerParts = rawParts.slice(1)

    // ── Path traversal protection ─────────────────────────────────────────────
    const relativePath = normalizePath(innerParts)
    if (!relativePath) {
      warnings.push({
        code: "path_traversal",
        message: `Rejected file with path traversal: ${file.webkitRelativePath}`,
        file: file.webkitRelativePath,
      })
      continue
    }

    // ── Depth guard ───────────────────────────────────────────────────────────
    if (innerParts.length > MAX_DEPTH) {
      warnings.push({
        code: "depth_exceeded",
        message: `Skipped deeply nested file (${innerParts.length} levels): ${relativePath}`,
        file: relativePath,
      })
      continue
    }

    const ext = getExtension(relativePath)
    const category = getCategory(ext)
    const resPath = `res://${relativePath}`

    options.onProgress?.({
      stage: "reading",
      stageLabel: "Reading files...",
      current: i + 1,
      total,
      currentFile: relativePath,
    })

    try {
      const godotFile: GodotFile = {
        resPath,
        relativePath,
        extension: ext,
        size: file.size,
        category,
      }

      if (READABLE_EXTENSIONS.has(ext)) {
        godotFile.content = await file.text()
      }

      result.set(resPath, godotFile)
    } catch (err) {
      warnings.push({
        code: "unreadable",
        message: `Could not read file: ${relativePath}`,
        file: relativePath,
      })
      console.warn(`[v0] Skipped unreadable file: ${relativePath}`, err)
    }
  }

  return { files: result, warnings }
}

function getExtension(path: string): string {
  const lastDot = path.lastIndexOf(".")
  if (lastDot === -1) return ""
  return path.slice(lastDot).toLowerCase()
}

function getCategory(ext: string): FileCategory {
  return EXTENSION_CATEGORY[ext] || "other"
}
