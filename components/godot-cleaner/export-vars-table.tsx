"use client"

import type { ExportVar } from "@/lib/scanner/types"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Variable, Check, X } from "lucide-react"

interface ExportVarsTableProps {
  vars: ExportVar[]
  onFileClick?: (resPath: string) => void
}

export function ExportVarsTable({ vars, onFileClick }: ExportVarsTableProps) {
  if (vars.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Variable className="h-7 w-7 text-primary" />
        </div>
        <p className="text-sm font-medium text-foreground">All export vars are in use</p>
        <p className="text-xs text-muted-foreground">No unreferenced export variables found</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-[420px] rounded-xl border border-border/60">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border/40">
            <TableHead className="text-xs font-medium">Variable</TableHead>
            <TableHead className="text-xs font-medium">File</TableHead>
            <TableHead className="text-xs font-medium text-center">Line</TableHead>
            <TableHead className="text-xs font-medium text-center">In Script</TableHead>
            <TableHead className="text-xs font-medium text-center">In Scene</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vars.map((v, i) => (
            <TableRow
              key={`${v.name}-${v.line}-${i}`}
              className="cursor-pointer transition-colors duration-150 hover:bg-muted/40 border-border/30"
              onClick={() => v.filePath && onFileClick?.(v.filePath)}
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium text-foreground">{v.name}</span>
                  {v.type && (
                    <Badge variant="secondary" className="text-[10px] border-0">{v.type}</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground max-w-[250px] truncate">
                {v.filePath.replace("res://", "")}
              </TableCell>
              <TableCell className="text-center font-mono text-xs tabular-nums text-muted-foreground">
                {v.line}
              </TableCell>
              <TableCell className="text-center">
                {v.usedInScript ? (
                  <Check className="h-3.5 w-3.5 text-status-used mx-auto" />
                ) : (
                  <X className="h-3.5 w-3.5 text-status-unused mx-auto" />
                )}
              </TableCell>
              <TableCell className="text-center">
                {v.usedInScene ? (
                  <Check className="h-3.5 w-3.5 text-status-used mx-auto" />
                ) : (
                  <X className="h-3.5 w-3.5 text-status-unused mx-auto" />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}
