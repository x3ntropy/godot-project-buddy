"use client"

import { useState, useCallback, useRef } from "react"
import type { AnalysisResults, GodotFile, ScanProgress } from "@/lib/scanner/types"
import {
  validateGodotProjectFromFiles,
  readProjectNameFromFiles,
  readProjectFiles,
} from "@/lib/scanner/file-reader"
import type { ScanWarning } from "@/lib/scanner/file-reader"
import { buildDependencyGraph } from "@/lib/scanner/graph-builder"
import type { BuildResult } from "@/lib/scanner/graph-builder"
import { analyzeProject } from "@/lib/scanner/analyzer"
import { ProjectPicker } from "@/components/godot-cleaner/project-picker"
import { ScanProgressOverlay } from "@/components/godot-cleaner/scan-progress"
import { ResultsDashboard } from "@/components/godot-cleaner/results-dashboard"
import { FileDetailPanel } from "@/components/godot-cleaner/file-detail-panel"
import { Button } from "@/components/ui/button"
import { RotateCcw } from "lucide-react"

/** App version — displayed in the UI */
export const APP_VERSION = "1.0.0"

export default function GodotCleanerPage() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [projectName, setProjectName] = useState<string | null>(null)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [includeAddons, setIncludeAddons] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [results, setResults] = useState<AnalysisResults | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  // Store parsed data for the detail panel
  const filesRef = useRef<Map<string, GodotFile>>(new Map())
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map())
  const rawFilesRef = useRef<File[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      setError(null)
      if (!validateGodotProjectFromFiles(files)) {
        setError("No project.godot found. Please select a valid Godot project folder.")
        return
      }
      setSelectedFiles(files)
      const rootFolder = files[0]?.webkitRelativePath.split("/")[0] ?? null
      setProjectPath(rootFolder)

      const name = await readProjectNameFromFiles(files)
      if (name) setProjectName(name)
    },
    []
  )

  const handleCancelScan = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const handleScan = useCallback(async () => {
    if (selectedFiles.length === 0) return

    const controller = new AbortController()
    abortRef.current = controller

    setIsScanning(true)
    setError(null)
    setResults(null)
    setScanProgress({
      stage: "reading",
      stageLabel: "Starting scan...",
      current: 0,
      total: 0,
    })

    try {
      // Step 1: Read all files (with security guards)
      const { files, warnings } = await readProjectFiles(selectedFiles, {
        includeAddons,
        onProgress: setScanProgress,
        signal: controller.signal,
      })

      if (controller.signal.aborted) {
        setError("Scan cancelled.")
        return
      }

      filesRef.current = files
      rawFilesRef.current = selectedFiles

      // Collect warning messages for the results
      const scanWarningMessages = warnings.map((w: ScanWarning) => w.message)

      // Step 2: Build dependency graph
      const buildResult: BuildResult = buildDependencyGraph(files, setScanProgress)
      adjacencyRef.current = buildResult.adjacency

      // Step 3: Run analysis
      const analysisResults = analyzeProject(files, buildResult, setScanProgress, scanWarningMessages)

      if (buildResult.projectInfo.projectName) {
        setProjectName(buildResult.projectInfo.projectName)
      }

      setResults(analysisResults)
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setError("Scan cancelled.")
      } else {
        setError(
          err instanceof Error
            ? `Scan failed: ${err.message}`
            : "An unexpected error occurred during scanning."
        )
      }
    } finally {
      setIsScanning(false)
      setScanProgress(null)
      abortRef.current = null
    }
  }, [selectedFiles, includeAddons])

  const handleReset = useCallback(() => {
    setResults(null)
    setSelectedFile(null)
  }, [])

  return (
    <main className="min-h-screen bg-gradient-deep">
      {/* Progress overlay */}
      {isScanning && scanProgress && (
        <ScanProgressOverlay progress={scanProgress} onCancel={handleCancelScan} />
      )}

      {/* File detail panel */}
      {results && (
        <FileDetailPanel
          resPath={selectedFile}
          onClose={() => setSelectedFile(null)}
          files={filesRef.current}
          results={results}
          adjacency={adjacencyRef.current}
          onNavigate={setSelectedFile}
          rawFiles={rawFilesRef.current}
        />
      )}

      {results ? (
        /* Results view */
        <div className="flex flex-col min-h-screen animate-fade-in-down">
          {/* Top header bar */}
          <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border/50 bg-background/80 backdrop-blur-md px-6 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 overflow-hidden shadow-sm">
                <img
                  src="/logo.jpg"
                  alt="Godot Project Buddy logo"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-foreground">
                  Godot Project Buddy
                </h1>
                <span className="text-muted-foreground/40 text-sm select-none">/</span>
                <span className="text-sm text-muted-foreground font-mono truncate max-w-[200px]">
                  {projectName || projectPath}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200 h-8 px-3"
                onClick={handleScan}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Re-scan
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="cursor-pointer transition-all duration-200 hover:bg-secondary/80 h-8 px-3 font-medium"
                onClick={handleReset}
              >
                New Project
              </Button>
            </div>
          </header>

          {/* Scan warnings banner */}
          {results.scanWarnings.length > 0 && (
            <div className="mx-6 mt-4 rounded-xl border border-status-warning/20 bg-status-warning/5 px-4 py-3 flex flex-col gap-1">
              <span className="text-xs font-semibold text-status-warning">Scan Warnings</span>
              {results.scanWarnings.map((w, i) => (
                <span key={i} className="text-xs text-status-warning/80">{w}</span>
              ))}
            </div>
          )}

          {/* Dashboard with sidebar */}
          <div className="mx-auto w-full max-w-7xl px-6 py-6 flex-1">
            <ResultsDashboard
              results={results}
              files={filesRef.current}
              adjacency={adjacencyRef.current}
              rawFiles={rawFilesRef.current}
              onFileClick={setSelectedFile}
            />
          </div>
        </div>
      ) : (
        /* Picker view */
        <ProjectPicker
          onFilesSelected={handleFilesSelected}
          onScan={handleScan}
          projectName={projectName}
          projectPath={projectPath}
          includeAddons={includeAddons}
          onIncludeAddonsChange={setIncludeAddons}
          isScanning={isScanning}
          error={error}
        />
      )}
    </main>
  )
}
