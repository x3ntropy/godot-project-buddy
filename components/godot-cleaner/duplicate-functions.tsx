"use client"

import { useState } from "react"
import type { DuplicateGroup } from "@/lib/scanner/types"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChevronDown, ChevronRight, Copy } from "lucide-react"

interface DuplicateFunctionsProps {
  groups: DuplicateGroup[]
  onFileClick?: (resPath: string) => void
}

export function DuplicateFunctions({ groups, onFileClick }: DuplicateFunctionsProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-status-used/10">
          <Copy className="h-7 w-7 text-status-used" />
        </div>
        <p className="text-sm font-medium text-foreground">No duplicate functions found</p>
        <p className="text-xs text-muted-foreground">All function implementations are unique</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-[520px]">
      <div className="flex flex-col gap-2">
        {groups.map((group, idx) => {
          const isExpanded = expandedIndex === idx
          return (
            <div
              key={group.hash}
              className={`rounded-xl border bg-card transition-all duration-200 ${
                isExpanded ? "border-primary/20 shadow-sm" : "border-border/60 hover:border-border"
              }`}
            >
              <button
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors rounded-xl cursor-pointer"
                onClick={() => setExpandedIndex(isExpanded ? null : idx)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-primary shrink-0 transition-transform" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 transition-transform" />
                )}
                <div className="flex flex-1 items-center gap-2.5 min-w-0">
                  <span className="font-mono text-sm font-medium text-foreground truncate">
                    {group.functionName}()
                  </span>
                  <Badge variant="secondary" className="text-[10px] shrink-0 bg-status-warning/15 text-status-warning border-0 font-semibold">
                    {group.occurrences.length} copies
                  </Badge>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border/40 px-4 py-4 flex flex-col gap-4 animate-fade-in">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      Found in
                    </span>
                    <div className="flex flex-col gap-0.5">
                      {group.occurrences.map((occ, i) => (
                        <button
                          key={`${occ.filePath}-${i}`}
                          className="flex items-center gap-2 text-left hover:bg-muted/40 rounded-lg px-3 py-2 -mx-1 transition-colors cursor-pointer group"
                          onClick={(e) => {
                            e.stopPropagation()
                            onFileClick?.(occ.filePath)
                          }}
                        >
                          <span className="font-mono text-xs text-primary group-hover:text-primary/80 truncate transition-colors">
                            {occ.filePath.replace("res://", "")}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums">
                            line {occ.line}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {group.bodyPreview && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                        Preview
                      </span>
                      <pre className="rounded-lg bg-muted/30 border border-border/30 p-4 text-xs font-mono text-foreground/80 overflow-x-auto max-h-40 leading-relaxed">
                        {group.bodyPreview}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}
