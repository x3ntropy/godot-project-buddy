// ============================================================
// .gd Script Parser
// ============================================================
import type { ParsedScript, ExportVar, SignalDef, FunctionDef, ConnectCall } from "./types"

/**
 * Simple string hash for duplicate detection.
 * Uses djb2 algorithm.
 */
function hashString(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff
  }
  return hash.toString(16)
}

/**
 * Normalize a function body for comparison:
 * - Strip comments
 * - Collapse whitespace
 * - Remove blank lines
 */
function normalizeBody(body: string): string {
  return body
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter((line) => line.length > 0)
    .join("\n")
}

/**
 * Parse a .gd GDScript file to extract:
 * - preload/load references
 * - class_name
 * - export variables
 * - signal definitions
 * - function definitions with body hashing
 * - .connect() calls
 * - emit_signal / .emit() calls
 * - extends clause
 * - dynamic load warnings
 */
export function parseGdScript(content: string, resPath: string): ParsedScript {
  const lines = content.split("\n")
  const result: ParsedScript = {
    resPath,
    loadedResources: [],
    dynamicLoads: [],
    exportVars: [],
    signals: [],
    functions: [],
    connectCalls: [],
    emitCalls: [],
  }

  // Extract class_name
  const classMatch = content.match(/^class_name\s+(\w+)/m)
  if (classMatch) {
    result.className = classMatch[1]
  }

  // Extract extends
  const extendsMatch = content.match(/^extends\s+(\w+)/m)
  if (extendsMatch) {
    result.extendsClass = extendsMatch[1]
  }

  // Extract extends with res:// path (e.g. extends "res://Scripts/base.gd")
  const extendsPathMatch = content.match(/^extends\s+"(res:\/\/[^"]+)"/m)
  if (extendsPathMatch) {
    result.loadedResources.push(extendsPathMatch[1])
  }

  // Extract preload/load references
  const loadRegex = /(?:preload|load)\s*\(\s*"(res:\/\/[^"]+)"\s*\)/g
  let match: RegExpExecArray | null
  while ((match = loadRegex.exec(content)) !== null) {
    result.loadedResources.push(match[1])
  }

  // Capture ALL res:// string literals in the script —
  // this catches patterns like:
  //   var path = "res://Scenes/area.tscn"
  //   get_tree().change_scene_to_file("res://...")
  //   ResourceLoader.load("res://...")
  //   $SceneTree.change_scene("res://...")
  const resStringRegex = /"(res:\/\/[^"]+)"/g
  while ((match = resStringRegex.exec(content)) !== null) {
    const path = match[1]
    // Don't double-add paths already found by load/preload/extends regex
    if (!result.loadedResources.includes(path)) {
      result.loadedResources.push(path)
    }
  }

  // Detect dynamic loads (string concatenation in load/preload)
  const dynamicLoadRegex = /(?:preload|load)\s*\(\s*(?:"res:\/\/"\s*\+|[^")]+\+\s*")/g
  while ((match = dynamicLoadRegex.exec(content)) !== null) {
    result.dynamicLoads.push(match[0])
  }

  // Also detect dynamic res:// path construction outside load/preload
  const dynamicResRegex = /"res:\/\/"\s*\+\s*\w+|"res:\/\/[^"]*"\s*%/g
  while ((match = dynamicResRegex.exec(content)) !== null) {
    if (!result.dynamicLoads.includes(match[0])) {
      result.dynamicLoads.push(match[0])
    }
  }

  // Extract export variables
  const exportRegex = /^(?:@export(?:_\w+)?)\s+var\s+(\w+)(?:\s*:\s*(\w+))?\s*(?:=\s*(.+))?$/gm
  while ((match = exportRegex.exec(content)) !== null) {
    const varName = match[1]
    const lineNum = content.slice(0, match.index).split("\n").length

    // Check if the var is used elsewhere in the script (beyond its declaration)
    const usageRegex = new RegExp(`\\b${varName}\\b`, "g")
    let usageCount = 0
    for (let i = 0; i < lines.length; i++) {
      if (i + 1 === lineNum) continue // Skip declaration line
      const line = lines[i].replace(/#.*$/, "") // Strip comments
      if (usageRegex.test(line)) {
        usageCount++
        usageRegex.lastIndex = 0
      }
    }

    const exportVar: ExportVar = {
      name: varName,
      line: lineNum,
      type: match[2],
      defaultValue: match[3]?.trim(),
      filePath: resPath,
      usedInScript: usageCount > 0,
      usedInScene: false, // Will be set during cross-file analysis
    }
    result.exportVars.push(exportVar)
  }

  // Extract signal definitions
  const signalRegex = /^signal\s+(\w+)/gm
  while ((match = signalRegex.exec(content)) !== null) {
    const lineNum = content.slice(0, match.index).split("\n").length
    result.signals.push({
      name: match[1],
      line: lineNum,
      filePath: resPath,
    })
  }

  // Extract .connect() calls
  const connectRegex = /\.connect\(\s*"(\w+)"(?:\s*,\s*[^,]+\s*,\s*"(\w+)")?\)/g
  while ((match = connectRegex.exec(content)) !== null) {
    const lineNum = content.slice(0, match.index).split("\n").length
    result.connectCalls.push({
      signalName: match[1],
      line: lineNum,
      targetMethod: match[2],
    })
  }

  // Also Godot 4 style: signal_name.connect(callable)
  const connect4Regex = /(\w+)\.connect\s*\(/g
  while ((match = connect4Regex.exec(content)) !== null) {
    // Avoid false positives with common method names
    const name = match[1]
    if (
      !["self", "get_node", "get_parent", "owner", "this"].includes(name) &&
      !name.startsWith("_")
    ) {
      const lineNum = content.slice(0, match.index).split("\n").length
      // Only add if not already found by the previous regex check
      const alreadyFound = result.connectCalls.some(
        (c) => c.signalName === name && c.line === lineNum
      )
      if (!alreadyFound) {
        result.connectCalls.push({
          signalName: name,
          line: lineNum,
        })
      }
    }
  }

  // Extract emit_signal calls
  const emitRegex = /(?:emit_signal\s*\(\s*"(\w+)"|(\w+)\.emit\s*\()/g
  while ((match = emitRegex.exec(content)) !== null) {
    result.emitCalls.push(match[1] || match[2])
  }

  // Extract function definitions with bodies
  const funcStarts: { name: string; line: number; startIndex: number }[] = []
  const funcRegex = /^(func\s+(\w+)\s*\([^)]*\)\s*(?:->\s*\w+\s*)?:)/gm
  while ((match = funcRegex.exec(content)) !== null) {
    const lineNum = content.slice(0, match.index).split("\n").length
    funcStarts.push({
      name: match[2],
      line: lineNum,
      startIndex: match.index + match[0].length,
    })
  }

  // Extract function bodies (everything until next function or end of file or unindented line)
  for (let i = 0; i < funcStarts.length; i++) {
    const start = funcStarts[i]
    const startLine = start.line // 1-indexed
    const endLine = i + 1 < funcStarts.length ? funcStarts[i + 1].line - 1 : lines.length

    // Collect body lines (indented lines after the func declaration)
    const bodyLines: string[] = []
    for (let ln = startLine; ln < endLine; ln++) {
      const line = lines[ln] // 0-indexed array
      // Body ends when we hit a non-empty, non-indented line (excluding the end)
      if (bodyLines.length > 0 && line.length > 0 && !line.startsWith("\t") && !line.startsWith("  ")) {
        break
      }
      bodyLines.push(line)
    }

    const rawBody = bodyLines.join("\n")
    const normalized = normalizeBody(rawBody)

    // Only hash if body has meaningful content
    const bodyHash = normalized.length > 0 ? hashString(normalized) : ""

    const funcDef: FunctionDef = {
      name: start.name,
      line: start.line,
      filePath: resPath,
      bodyHash,
      bodyPreview: rawBody.slice(0, 300),
      lineCount: bodyLines.length,
    }
    result.functions.push(funcDef)
  }

  return result
}
