// ============================================================
// .tres Resource File Parser
// ============================================================
import type { ParsedResource } from "./types"

/**
 * Parse a .tres resource file to extract external resource references.
 * Uses the same ext_resource pattern as .tscn files.
 */
export function parseTres(content: string, resPath: string): ParsedResource {
  const result: ParsedResource = {
    resPath,
    externalResources: [],
  }

  // Parse ext_resource entries (same format as .tscn)
  // Godot 4: [ext_resource type="..." uid="..." path="res://..." id="..."]
  // Godot 3: [ext_resource path="res://..." type="..." id=...]
  const extResourceRegex = /\[ext_resource\s+[^\]]*path="(res:\/\/[^"]+)"[^\]]*\]/g
  let match: RegExpExecArray | null
  while ((match = extResourceRegex.exec(content)) !== null) {
    result.externalResources.push(match[1])
  }

  // Also check for load/preload in any embedded GDScript expressions
  const loadRegex = /(?:preload|load)\s*\(\s*"(res:\/\/[^"]+)"\s*\)/g
  while ((match = loadRegex.exec(content)) !== null) {
    result.externalResources.push(match[1])
  }

  // Check for resource_path references
  const resPathRegex = /resource_path\s*=\s*"(res:\/\/[^"]+)"/g
  while ((match = resPathRegex.exec(content)) !== null) {
    result.externalResources.push(match[1])
  }

  // Catch-all: find any "res://..." string in the file
  // This catches embedded paths in animation data, metadata, etc.
  const resCatchAll = /"(res:\/\/[^"]+)"/g
  while ((match = resCatchAll.exec(content)) !== null) {
    if (!result.externalResources.includes(match[1])) {
      result.externalResources.push(match[1])
    }
  }

  // Deduplicate
  result.externalResources = [...new Set(result.externalResources)]

  return result
}
