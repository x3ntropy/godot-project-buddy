"use client"

import { useState } from "react"
import type { AnalysisResults, GodotFile } from "@/lib/scanner/types"
import type { InspectorCategory } from "./category-inspector"
import { StatsOverview } from "./stats-overview"
import { UnusedFilesTable } from "./unused-files-table"
import { DuplicateFunctions } from "./duplicate-functions"
import { ExportVarsTable } from "./export-vars-table"
import { SignalsWarnings } from "./signals-warnings"
import { SafeToDelete } from "./safe-to-delete"
import { DependencyGraph } from "./dependency-graph"
import { CategoryInspector } from "./category-inspector"
import { AssetSizeRanking } from "./asset-size-ranking"
import {
  LayoutDashboard,
  Network,
  FileX,
  Copy,
  Variable,
  Radio,
  FileSearch,
  BarChart2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

interface ResultsDashboardProps {
  results: AnalysisResults
  files: Map<string, GodotFile>
  adjacency: Map<string, Set<string>>
  rawFiles: File[]
  onFileClick: (resPath: string) => void
}

export function ResultsDashboard({
  results,
  files,
  adjacency,
  rawFiles,
  onFileClick,
}: ResultsDashboardProps) {
  void adjacency

  const [activeTab, setActiveTab] = useState("overview")
  const [collapsed, setCollapsed] = useState(false)
  const [inspectorCategory, setInspectorCategory] = useState<InspectorCategory | null>(null)

  const tabs = [
    { value: "overview", label: "Overview", icon: LayoutDashboard, count: null, group: "main" },
    { value: "graph", label: "Graph", icon: Network, count: results.graph.nodes.length, group: "main" },
    { value: "unused", label: "Unused", icon: FileX, count: results.unusedFiles.length, group: "analysis" },
    { value: "duplicates", label: "Duplicates", icon: Copy, count: results.duplicateFunctions.length, group: "analysis" },
    { value: "exports", label: "Exports", icon: Variable, count: results.unusedExportVars.length, group: "analysis" },
    { value: "signals", label: "Signals", icon: Radio, count: results.signalWarnings.length + results.nodeWarnings.length, group: "analysis" },
    { value: "delete", label: "Unused Files", icon: FileSearch, count: results.unusedFiles.length, group: "cleanup" },
    { value: "assets", label: "Asset Sizes", icon: BarChart2, count: null, group: "cleanup" },
  ]

  const handleCategoryClick = (category: InspectorCategory) => {
    setInspectorCategory((prev) => (prev === category ? null : category))
  }

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <StatsOverview
            results={results}
            activeCategory={inspectorCategory}
            onCategoryClick={handleCategoryClick}
          />
        )
      case "graph":
        return <DependencyGraph graph={results.graph} rawFiles={rawFiles} onNodeClick={onFileClick} />
      case "unused":
        return <UnusedFilesTable files={results.unusedFiles} classifiedFiles={results.classifiedUnusedFiles} riskScores={results.riskScores} onFileClick={onFileClick} />
      case "duplicates":
        return <DuplicateFunctions groups={results.duplicateFunctions} onFileClick={onFileClick} />
      case "exports":
        return <ExportVarsTable vars={results.unusedExportVars} onFileClick={onFileClick} />
      case "signals":
        return <SignalsWarnings signals={results.signalWarnings} nodes={results.nodeWarnings} onFileClick={onFileClick} />
      case "delete":
        return (
          <SafeToDelete
            files={results.unusedFiles}
            totalUnusedSize={results.unusedSize}
            classifiedFiles={results.classifiedUnusedFiles}
            results={results}
            onFileClick={onFileClick}
          />
        )
      case "assets":
        return (
          <AssetSizeRanking
            allFiles={[...results.usedFiles, ...results.unusedFiles]}
          />
        )
      default:
        return null
    }
  }

  return (
    <>
      <div className="flex gap-0 min-h-[calc(100vh-8rem)]">
        {/* Sidebar */}
        <aside
          className={`relative flex-shrink-0 transition-all duration-500 ${
            collapsed ? "w-14" : "w-52"
          }`}
        >
          <div className="sticky top-[57px] flex flex-col gap-0.5 pt-1">
            {/* Collapse toggle */}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center justify-center h-7 w-7 rounded-md self-end mb-3 text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-all duration-200"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Nav groups */}
            <nav className="flex flex-col gap-4" role="tablist" aria-label="Results navigation">
              {(["main", "analysis", "cleanup"] as const).map((group) => {
                const groupTabs = tabs.filter((t) => t.group === group)
                const groupLabel = group === "main" ? null : group === "analysis" ? "Analysis" : "Cleanup"
                return (
                  <div key={group} className="flex flex-col gap-0.5">
                    {!collapsed && groupLabel && (
                      <span className="px-3 pb-1 text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-widest">
                        {groupLabel}
                      </span>
                    )}
                    {groupTabs.map((tab) => {
                      const isActive = activeTab === tab.value
                      return (
                        <button
                          key={tab.value}
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => {
                            setActiveTab(tab.value)
                            if (tab.value !== "overview") setInspectorCategory(null)
                          }}
                          className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-200 cursor-pointer ${
                            isActive
                              ? "bg-muted/80 text-foreground font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/40 font-normal"
                          } ${collapsed ? "justify-center px-2" : ""}`}
                          title={collapsed ? tab.label : undefined}
                        >
                          {/* Active indicator dot */}
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r-full bg-primary animate-fade-in" />
                          )}

                          <tab.icon
                            className={`h-4 w-4 flex-shrink-0 transition-colors duration-200 ${
                              isActive ? "text-primary" : "text-muted-foreground/70 group-hover:text-muted-foreground"
                            }`}
                          />

                          {!collapsed && (
                            <>
                              <span className="flex-1 text-left truncate text-[13px]">{tab.label}</span>
                              {tab.count !== null && tab.count > 0 && (
                                <span
                                  className={`text-[10px] font-semibold tabular-nums rounded-md px-1.5 py-0.5 min-w-5 text-center transition-colors duration-200 ${
                                    isActive
                                      ? "bg-muted text-foreground/70"
                                      : "bg-muted/60 text-muted-foreground/70"
                                  }`}
                                >
                                  {tab.count}
                                </span>
                              )}
                            </>
                          )}

                          {collapsed && tab.count !== null && tab.count > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </nav>

            {/* Footer info */}
            {!collapsed && (
              <div className="mt-6 pt-4 border-t border-border/30 px-3 animate-fade-in">
                <p className="text-[10px] text-muted-foreground/40 leading-relaxed tabular-nums">
                  {results.totalFiles.toLocaleString()} files scanned
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* Divider line */}
        <div className="w-px bg-border/30 flex-shrink-0 mx-1" />

        {/* Main content area */}
        <div className="flex-1 min-w-0 pl-6" role="tabpanel">
          <div className="animate-fade-in-up" key={activeTab} style={{ animationDuration: "0.3s" }}>
            {renderContent()}
          </div>
        </div>
      </div>

      {/* Category Inspector Panel */}
      <CategoryInspector
        category={inspectorCategory}
        onClose={() => setInspectorCategory(null)}
        files={files}
        results={results}
        onFileClick={onFileClick}
      />
    </>
  )
}
