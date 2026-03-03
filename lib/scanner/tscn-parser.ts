// ============================================================
// .tscn Scene File Parser
// ============================================================
import type { ParsedScene, SceneConnection, SceneNode } from "./types"

/**
 * Parse a .tscn scene file to extract:
 * - External resource references (ext_resource)
 * - Signal connections
 * - Node definitions with properties
 * - Attached scripts
 */
export function parseTscn(content: string, resPath: string): ParsedScene {
  const result: ParsedScene = {
    resPath,
    externalResources: [],
    subResources: [],
    connections: [],
    nodes: [],
    attachedScripts: [],
  }

  // Build a map of ext_resource id → path for resolving references
  const resourceIdMap = new Map<string, string>()

  // Parse ext_resource entries
  // Godot 4 format: [ext_resource type="Script" uid="uid://..." path="res://..." id="1"]
  // Godot 3 format: [ext_resource path="res://..." type="Script" id=1]
  const extResourceRegex = /\[ext_resource\s+[^\]]*path="(res:\/\/[^"]+)"[^\]]*id="?(\w+)"?\]/g
  let match: RegExpExecArray | null

  while ((match = extResourceRegex.exec(content)) !== null) {
    const path = match[1]
    const id = match[2]
    result.externalResources.push(path)
    resourceIdMap.set(id, path)
  }

  // Also try alternate ordering where path comes after id
  const extResourceRegex2 = /\[ext_resource\s+[^\]]*id="?(\w+)"?[^\]]*path="(res:\/\/[^"]+)"[^\]]*\]/g
  while ((match = extResourceRegex2.exec(content)) !== null) {
    const id = match[1]
    const path = match[2]
    if (!resourceIdMap.has(id)) {
      result.externalResources.push(path)
      resourceIdMap.set(id, path)
    }
  }

  // Deduplicate external resources
  result.externalResources = [...new Set(result.externalResources)]

  // Parse signal connections
  // Format: [connection signal="pressed" from="Button" to="." method="_on_button_pressed"]
  const connectionRegex = /\[connection\s+signal="([^"]+)"\s+from="([^"]+)"\s+to="([^"]+)"\s+method="([^"]+)"\]/g
  while ((match = connectionRegex.exec(content)) !== null) {
    const connection: SceneConnection = {
      signal: match[1],
      from: match[2],
      to: match[3],
      method: match[4],
    }
    result.connections.push(connection)
  }

  // Parse node definitions
  // Format: [node name="Player" type="CharacterBody2D" parent="."]
  // Also: [node name="Player" parent="." instance=ExtResource("2_abc")]
  const nodeRegex = /\[node\s+name="([^"]+)"(?:\s+type="([^"]*)")?(?:\s+parent="([^"]*)")?([^\]]*)\]/g
  while ((match = nodeRegex.exec(content)) !== null) {
    const node: SceneNode = {
      name: match[1],
      type: match[2] || "",
      parent: match[3] || "",
      properties: {},
    }

    // Check for instance=ExtResource("id") in the node header itself
    // This is how Godot represents instanced scenes (PackedScene references)
    const headerRemainder = match[4] || ""
    const fullHeader = match[0]
    const instanceMatch = fullHeader.match(/instance\s*=\s*ExtResource\(\s*"?(\w+)"?\s*\)/)
    if (instanceMatch) {
      const instanceId = instanceMatch[1]
      const instancePath = resourceIdMap.get(instanceId)
      if (instancePath) {
        node.properties["__instance_scene"] = instancePath
      }
    }

    // Also check for parent in the header remainder if not captured
    if (!match[3]) {
      const parentInRemainder = headerRemainder.match(/parent="([^"]*)"/)
      if (parentInRemainder) {
        node.parent = parentInRemainder[1]
      }
    }

    // Look for script reference after node definition
    const afterNode = content.slice(match.index + match[0].length, match.index + match[0].length + 500)
    const scriptMatch = afterNode.match(/script\s*=\s*ExtResource\(\s*"?(\w+)"?\s*\)/)
    if (scriptMatch) {
      const scriptId = scriptMatch[1]
      const scriptPath = resourceIdMap.get(scriptId)
      if (scriptPath) {
        node.scriptRef = scriptPath
        result.attachedScripts.push(scriptPath)
      }
    }

    // Extract properties from the node section
    const propSection = content.slice(match.index + match[0].length)
    const nextSectionIdx = propSection.search(/\n\[/)
    const propsText = nextSectionIdx > -1 ? propSection.slice(0, nextSectionIdx) : propSection.slice(0, 500)

    const propRegex = /^(\w+)\s*=\s*(.+)$/gm
    let propMatch: RegExpExecArray | null
    while ((propMatch = propRegex.exec(propsText)) !== null) {
      node.properties[propMatch[1]] = propMatch[2]

      // If a property value references an ExtResource, resolve it
      // This catches properties like: texture = ExtResource("3_abc")
      const extRefInProp = propMatch[2].match(/ExtResource\(\s*"?(\w+)"?\s*\)/)
      if (extRefInProp) {
        const refId = extRefInProp[1]
        const refPath = resourceIdMap.get(refId)
        if (refPath && !result.externalResources.includes(refPath)) {
          // Ensure this reference is tracked (it should already be from ext_resource parsing,
          // but this is a safety net)
          result.externalResources.push(refPath)
        }
      }
    }

    result.nodes.push(node)
  }

  // ---- CATCH-ALL: Scan for any res:// paths in the entire file ----
  // This catches references in animation tracks, shader params, and other
  // property values that might not be declared as ext_resource
  const resPathCatchAll = /"(res:\/\/[^"]+)"/g
  let catchAllMatch: RegExpExecArray | null
  while ((catchAllMatch = resPathCatchAll.exec(content)) !== null) {
    const path = catchAllMatch[1]
    if (!result.externalResources.includes(path)) {
      result.externalResources.push(path)
    }
  }

  // Deduplicate attached scripts
  result.attachedScripts = [...new Set(result.attachedScripts)]

  return result
}
