// ============================================================
// project.godot Parser
// ============================================================
import type { ParsedProject } from "./types"

/**
 * Parse the project.godot file to extract entry points:
 * - Main scene path
 * - Autoload script paths
 * - Project name
 */
export function parseProjectGodot(content: string): ParsedProject {
  const result: ParsedProject = {
    autoloads: [],
  }

  // Extract project name
  const nameMatch = content.match(/config\/name="([^"]+)"/)
  if (nameMatch) {
    result.projectName = nameMatch[1]
  }

  // Extract main scene
  const mainSceneMatch = content.match(/run\/main_scene="([^"]+)"/)
  if (mainSceneMatch) {
    result.mainScene = mainSceneMatch[1]
  }

  // Extract autoloads
  // Format: AutoloadName="*res://path/to/script.gd" or AutoloadName="res://path/to/script.gd"
  const autoloadSection = content.match(/\[autoload\]([\s\S]*?)(?:\n\[|\n*$)/)
  if (autoloadSection) {
    const lines = autoloadSection[1].split("\n")
    for (const line of lines) {
      const match = line.match(/^(\w+)="\*?(res:\/\/[^"]+)"/)
      if (match) {
        result.autoloads.push({
          name: match[1],
          path: match[2],
        })
      }
    }
  }

  return result
}
