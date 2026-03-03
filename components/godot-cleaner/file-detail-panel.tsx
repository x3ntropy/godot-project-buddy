"use client"

import { useState, useEffect, type ReactNode } from "react"
import type { GodotFile, AnalysisResults } from "@/lib/scanner/types"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  FileCode2,
  FileImage,
  Box,
  FileText,
  ArrowRight,
  ArrowLeft,
  Radio,
  Braces,
  Eye,
  ImageIcon,
  Music,
  Cuboid,
  X,
} from "lucide-react"

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`
}

const CATEGORY_ICONS: Record<string, typeof FileCode2> = {
  script: FileCode2,
  scene: Box,
  asset: FileImage,
  resource: FileText,
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".bmp"])
const AUDIO_EXTS = new Set([".wav", ".ogg", ".mp3"])
const MODEL_EXTS = new Set([".glb", ".gltf", ".obj", ".fbx", ".dae"])
const CODE_EXTS = new Set([".gd", ".tres", ".cfg", ".godot", ".gdshader", ".shader"])
const SCENE_EXTS = new Set([".tscn"])
const PREVIEW_MAX_LINES = 40

/* ------------------------------------------------------------------ */
/*  GDScript syntax highlighter – React-element based (no HTML strings) */
/* ------------------------------------------------------------------ */

const KW = new Set([
  "func","var","const","class","class_name","extends","signal","export",
  "onready","static","enum","match","if","elif","else","for","while",
  "return","yield","await","pass","break","continue","in","is","as",
  "not","and","or","self","true","false","null","void","preload","load",
  "super","setget","set","get",
])
const TYPES = new Set([
  "int","float","bool","String","Vector2","Vector3","Array","Dictionary",
  "Node","Node2D","Node3D","PackedScene","Resource","Object","Control",
  "Sprite2D","CharacterBody2D","Area2D","RigidBody2D","AnimationPlayer",
  "Timer","AudioStreamPlayer",
])

/** Tokenise a single GDScript line into styled React nodes */
function tokeniseLine(line: string, lineKey: number): ReactNode[] {
  const nodes: ReactNode[] = []
  let idx = 0
  let key = 0

  // Handle comment portion first
  const commentIdx = line.indexOf("#")
  const codePart = commentIdx >= 0 ? line.slice(0, commentIdx) : line
  const commentPart = commentIdx >= 0 ? line.slice(commentIdx) : null

  const push = (text: string, color?: string) => {
    if (!text) return
    if (color) {
      nodes.push(<span key={`${lineKey}-${key++}`} style={{ color }}>{text}</span>)
    } else {
      nodes.push(<span key={`${lineKey}-${key++}`}>{text}</span>)
    }
  }

  // Simple single-pass tokeniser for the code portion
  const src = codePart
  while (idx < src.length) {
    const ch = src[idx]

    // Whitespace
    if (ch === " " || ch === "\t") {
      let end = idx
      while (end < src.length && (src[end] === " " || src[end] === "\t")) end++
      push(src.slice(idx, end))
      idx = end
      continue
    }

    // Annotation (@export, @onready, etc.)
    if (ch === "@") {
      let end = idx + 1
      while (end < src.length && /\w/.test(src[end])) end++
      push(src.slice(idx, end), "#4ec9b0")
      idx = end
      continue
    }

    // String (double or single quote)
    if (ch === '"' || ch === "'") {
      const quote = ch
      let end = idx + 1
      while (end < src.length && src[end] !== quote) {
        if (src[end] === "\\") end++ // skip escaped char
        end++
      }
      if (end < src.length) end++ // include closing quote
      push(src.slice(idx, end), "#ce9178")
      idx = end
      continue
    }

    // Number
    if (/\d/.test(ch)) {
      let end = idx
      while (end < src.length && /[\d._x]/.test(src[end])) end++
      push(src.slice(idx, end), "#b5cea8")
      idx = end
      continue
    }

    // Word (identifier / keyword / type)
    if (/[a-zA-Z_]/.test(ch)) {
      let end = idx
      while (end < src.length && /\w/.test(src[end])) end++
      const word = src.slice(idx, end)
      if (KW.has(word)) {
        push(word, "#c586c0")
      } else if (TYPES.has(word)) {
        push(word, "#4ec9b0")
      } else if (end < src.length && src[end] === "(") {
        push(word, "#dcdcaa") // function call
      } else {
        push(word)
      }
      idx = end
      continue
    }

    // Operators / punctuation — emit one char
    push(ch)
    idx++
  }

  // Append comment
  if (commentPart) {
    nodes.push(
      <span key={`${lineKey}-cmt`} className="text-muted-foreground/50 italic">
        {commentPart}
      </span>
    )
  }

  return nodes
}

/** Highlight full GDScript source into React elements with line numbers */
function HighlightedCode({
  code,
  showLineNumbers = false,
  maxLines,
}: {
  code: string
  showLineNumbers?: boolean
  maxLines?: number
}) {
  const allLines = code.split("\n")
  const lines = maxLines ? allLines.slice(0, maxLines) : allLines
  const gutterWidth = `${String(lines.length).length + 1}ch`

  return (
    <div className="flex text-[11.5px] leading-[1.7] font-mono">
      {showLineNumbers && (
        <div
          className="shrink-0 pr-3 pl-2 py-3 text-right select-none border-r border-border/10"
          style={{ minWidth: gutterWidth }}
        >
          {lines.map((_, i) => (
            <div key={i} className="text-muted-foreground/25">{i + 1}</div>
          ))}
        </div>
      )}
      <pre className="flex-1 overflow-x-auto p-3 m-0">
        {lines.map((line, i) => (
          <div key={i}>{tokeniseLine(line, i)}{line === "" && "\n"}</div>
        ))}
      </pre>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Image preview hook                                                 */
/* ------------------------------------------------------------------ */

function useImageBlobUrl(
  rawFiles: File[],
  file: GodotFile | null | undefined,
  resPath: string | null
): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file || !resPath || !IMAGE_EXTS.has(file.extension)) {
      setUrl(null)
      return
    }

    // Find the matching raw File object
    const rawFile = rawFiles.find((f) => {
      const parts = f.webkitRelativePath.split("/")
      const relativePath = parts.slice(1).join("/")
      return `res://${relativePath}` === resPath
    })

    if (!rawFile) {
      setUrl(null)
      return
    }

    const blobUrl = URL.createObjectURL(rawFile)
    setUrl(blobUrl)

    return () => URL.revokeObjectURL(blobUrl)
  }, [rawFiles, file, resPath])

  return url
}

/* ------------------------------------------------------------------ */
/*  File Preview Component                                             */
/* ------------------------------------------------------------------ */

function FilePreview({
  file,
  rawFiles,
  resPath,
}: {
  file: GodotFile
  rawFiles: File[]
  resPath: string
}) {
  const [fullCodeOpen, setFullCodeOpen] = useState(false)
  const imageUrl = useImageBlobUrl(rawFiles, file, resPath)

  const ext = file.extension

  // Scene files: no preview
  if (SCENE_EXTS.has(ext)) return null

  // Image files
  if (IMAGE_EXTS.has(ext)) {
    return (
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Preview
          </h3>
        </div>
        {imageUrl ? (
          <div className="rounded-lg border border-border/40 bg-muted/20 p-2 overflow-hidden">
            <img
              src={imageUrl}
              alt={file.relativePath}
              className="w-full max-h-72 object-contain rounded-md"
              crossOrigin="anonymous"
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/60 pl-5.5">Could not load image preview</p>
        )}
      </section>
    )
  }

  // Audio files
  if (AUDIO_EXTS.has(ext)) {
    return (
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <Music className="h-3.5 w-3.5 text-chart-4" />
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Audio File
          </h3>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/20 px-4 py-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-4/10 shrink-0">
            <Music className="h-5 w-5 text-chart-4" />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-xs font-medium text-foreground truncate">
              {file.relativePath.split("/").pop()}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {ext.replace(".", "").toUpperCase()} audio -- {formatBytes(file.size)}
            </span>
          </div>
        </div>
      </section>
    )
  }

  // 3D model files
  if (MODEL_EXTS.has(ext)) {
    return (
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <Cuboid className="h-3.5 w-3.5 text-chart-3" />
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            3D Model
          </h3>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/20 px-4 py-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-3/10 shrink-0">
            <Cuboid className="h-5 w-5 text-chart-3" />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-xs font-medium text-foreground truncate">
              {file.relativePath.split("/").pop()}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {ext.replace(".", "").toUpperCase()} model -- {formatBytes(file.size)}
            </span>
          </div>
        </div>
      </section>
    )
  }

  // Code / text files
  if (CODE_EXTS.has(ext) && file.content) {
    const lineCount = file.content.split("\n").length
    const isLarge = lineCount > PREVIEW_MAX_LINES
    const isGDScript = ext === ".gd" || ext === ".gdshader" || ext === ".shader"

    return (
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Code Preview
            </h3>
            <span className="text-[10px] text-muted-foreground/60">
              {lineCount} lines
            </span>
          </div>
          {isLarge && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-[10px] text-primary hover:text-primary/80 px-2"
              onClick={() => setFullCodeOpen(true)}
            >
              <Eye className="h-3 w-3" />
              View Full File
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-border/40 bg-[#1e1e1e] overflow-hidden">
          <div className="overflow-x-auto">
            {isGDScript ? (
              <HighlightedCode code={file.content} maxLines={PREVIEW_MAX_LINES} />
            ) : (
              <pre className="text-[11.5px] leading-[1.7] font-mono p-3">
                {file.content.split("\n").slice(0, PREVIEW_MAX_LINES).join("\n")}
              </pre>
            )}
          </div>
          {isLarge && (
            <div className="border-t border-border/20 px-3 py-2 bg-[#1a1a1a] flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground/50">
                Showing {PREVIEW_MAX_LINES} of {lineCount} lines
              </span>
              <button
                className="text-[10px] text-primary hover:text-primary/80 cursor-pointer transition-colors"
                onClick={() => setFullCodeOpen(true)}
              >
                Show all
              </button>
            </div>
          )}
        </div>

        {/* Full file dialog */}
        <Dialog open={fullCodeOpen} onOpenChange={setFullCodeOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-4 py-3 border-b border-border/40 bg-card shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode2 className="h-4 w-4 text-primary shrink-0" />
                  <DialogTitle className="text-sm font-mono truncate">
                    {file.relativePath}
                  </DialogTitle>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {lineCount} lines
                  </span>
                </div>
              </div>
            </DialogHeader>
            <ScrollArea className="flex-1 max-h-[calc(85vh-52px)]">
              <div className="bg-[#1e1e1e]">
                {isGDScript ? (
                  <HighlightedCode code={file.content} showLineNumbers />
                ) : (
                  <pre className="text-[11.5px] leading-[1.7] font-mono p-3 overflow-x-auto">
                    {file.content}
                  </pre>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </section>
    )
  }

  // Font / other asset files
  if (file.category === "asset") {
    return (
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Asset Info
          </h3>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/20 px-4 py-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/30 shrink-0">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-xs font-medium text-foreground truncate">
              {file.relativePath.split("/").pop()}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {ext.replace(".", "").toUpperCase()} file -- {formatBytes(file.size)}
            </span>
          </div>
        </div>
      </section>
    )
  }

  return null
}

/* ------------------------------------------------------------------ */
/*  Main Panel                                                         */
/* ------------------------------------------------------------------ */

interface FileDetailPanelProps {
  resPath: string | null
  onClose: () => void
  files: Map<string, GodotFile>
  results: AnalysisResults
  adjacency: Map<string, Set<string>>
  onNavigate: (resPath: string) => void
  rawFiles: File[]
}

export function FileDetailPanel({
  resPath,
  onClose,
  files,
  results,
  adjacency,
  onNavigate,
  rawFiles,
}: FileDetailPanelProps) {
  const file = resPath ? files.get(resPath) : null
  const isUsed = resPath ? results.graph.nodes.find((n) => n.id === resPath)?.used ?? false : false
  const isEntry = resPath ? results.entryPoints.includes(resPath) : false

  const dependsOn = resPath ? [...(adjacency.get(resPath) || [])] : []
  const dependedBy = resPath
    ? [...adjacency.entries()]
        .filter(([, deps]) => deps.has(resPath))
        .map(([from]) => from)
    : []

  const Icon = file ? CATEGORY_ICONS[file.category] || FileText : FileText

  return (
    <Sheet open={!!resPath} onOpenChange={() => onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg border-border/60 flex flex-col h-full p-0">
        <SheetHeader className="gap-2 shrink-0 px-4 pt-4 pb-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <SheetTitle className="text-sm truncate font-semibold">
              {file?.relativePath || resPath}
            </SheetTitle>
          </div>
          <SheetDescription className="flex items-center gap-2 flex-wrap">
            {file && (
              <>
                <Badge
                  variant="secondary"
                  className={`text-[10px] border-0 font-semibold ${
                    isUsed
                      ? "bg-status-used/15 text-status-used"
                      : "bg-status-unused/15 text-status-unused"
                  }`}
                >
                  {isUsed ? "Used" : "Unused"}
                </Badge>
                {isEntry && (
                  <Badge variant="secondary" className="text-[10px] bg-status-entry/15 text-status-entry border-0 font-semibold">
                    Entry Point
                  </Badge>
                )}
                <Badge variant="secondary" className="text-[10px] border-0">
                  {file.category}
                </Badge>
                <span className="text-xs tabular-nums text-muted-foreground">{formatBytes(file.size)}</span>
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0 px-4">
          <div className="flex flex-col gap-6 pt-4 pb-10">
            {/* Depends On */}
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Depends On ({dependsOn.length})
                </h3>
              </div>
              {dependsOn.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 pl-5.5">No dependencies</p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {dependsOn.map((dep) => (
                    <button
                      key={dep}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-muted/40 transition-colors cursor-pointer group"
                      onClick={() => onNavigate(dep)}
                    >
                      <span className="font-mono text-xs text-primary group-hover:text-primary/80 truncate transition-colors">
                        {dep.replace("res://", "")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <Separator className="bg-border/40" />

            {/* Referenced By */}
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <ArrowLeft className="h-3.5 w-3.5 text-chart-2" />
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Referenced By ({dependedBy.length})
                </h3>
              </div>
              {dependedBy.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 pl-5.5">Not referenced by any file</p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {dependedBy.map((ref) => (
                    <button
                      key={ref}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-muted/40 transition-colors cursor-pointer group"
                      onClick={() => onNavigate(ref)}
                    >
                      <span className="font-mono text-xs text-chart-2 group-hover:text-chart-2/80 truncate transition-colors">
                        {ref.replace("res://", "")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* File Preview — rendered below Referenced By */}
            {file && (
              <>
                <Separator className="bg-border/40" />
                <FilePreview file={file} rawFiles={rawFiles} resPath={resPath!} />
              </>
            )}

            {file?.category === "script" && (
              <>
                <Separator className="bg-border/40" />
                <ScriptDetails resPath={resPath!} results={results} />
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Script Details (signals, duplicates)                               */
/* ------------------------------------------------------------------ */

function ScriptDetails({
  resPath,
  results,
}: {
  resPath: string
  results: AnalysisResults
}) {
  const exportVars = results.unusedExportVars.filter(() => true)
  const signals = results.signalWarnings.filter((s) => s.definedIn === resPath)
  const duplicates = results.duplicateFunctions.filter((d) =>
    d.occurrences.some((o) => o.filePath === resPath)
  )

  return (
    <div className="flex flex-col gap-5">
      {signals.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-status-warning" />
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Signals ({signals.length})
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {signals.map((s) => (
              <Badge
                key={s.signalName}
                variant="secondary"
                className={`text-[10px] border-0 font-semibold ${
                  s.isConnected && s.isEmitted
                    ? "bg-status-used/15 text-status-used"
                    : "bg-status-warning/15 text-status-warning"
                }`}
              >
                {s.signalName}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {duplicates.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <Braces className="h-3.5 w-3.5 text-status-warning" />
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Duplicate Functions ({duplicates.length})
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {duplicates.map((d) => (
              <Badge key={d.hash} variant="secondary" className="text-[10px] bg-status-warning/15 text-status-warning border-0 font-semibold">
                {d.functionName}()
              </Badge>
            ))}
          </div>
        </section>
      )}

      {exportVars.length === 0 && signals.length === 0 && duplicates.length === 0 && (
        <p className="text-xs text-muted-foreground/60">No warnings for this script</p>
      )}
    </div>
  )
}
