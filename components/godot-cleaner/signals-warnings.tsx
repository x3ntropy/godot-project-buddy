"use client"

import type { SignalWarning, NodeWarning } from "@/lib/scanner/types"
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
import { Radio, AlertTriangle, Check, X } from "lucide-react"

interface SignalsWarningsProps {
  signals: SignalWarning[]
  nodes: NodeWarning[]
  onFileClick?: (resPath: string) => void
}

export function SignalsWarnings({ signals, nodes, onFileClick }: SignalsWarningsProps) {
  const hasContent = signals.length > 0 || nodes.length > 0

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-status-used/10">
          <Radio className="h-7 w-7 text-status-used" />
        </div>
        <p className="text-sm font-medium text-foreground">All signals are connected</p>
        <p className="text-xs text-muted-foreground">No unconnected signals or suspicious nodes found</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {signals.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-status-warning/10">
              <Radio className="h-3.5 w-3.5 text-status-warning" />
            </div>
            <h3 className="text-sm font-medium text-foreground">
              Unconnected Signals
            </h3>
            <Badge variant="secondary" className="text-[10px] font-semibold border-0">{signals.length}</Badge>
          </div>
          <ScrollArea className="h-[260px] rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/40">
                  <TableHead className="text-xs font-medium">Signal</TableHead>
                  <TableHead className="text-xs font-medium">Defined In</TableHead>
                  <TableHead className="text-xs font-medium text-center">Line</TableHead>
                  <TableHead className="text-xs font-medium text-center">Connected</TableHead>
                  <TableHead className="text-xs font-medium text-center">Emitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signals.map((sig, i) => (
                  <TableRow
                    key={`${sig.signalName}-${sig.definedIn}-${i}`}
                    className="cursor-pointer transition-colors duration-150 hover:bg-muted/40 border-border/30"
                    onClick={() => onFileClick?.(sig.definedIn)}
                  >
                    <TableCell className="font-mono text-xs font-medium text-foreground">
                      {sig.signalName}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[250px] truncate">
                      {sig.definedIn.replace("res://", "")}
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs tabular-nums text-muted-foreground">
                      {sig.line}
                    </TableCell>
                    <TableCell className="text-center">
                      {sig.isConnected ? (
                        <Check className="h-3.5 w-3.5 text-status-used mx-auto" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-status-unused mx-auto" />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {sig.isEmitted ? (
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
        </div>
      )}

      {nodes.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-status-warning/10">
              <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
            </div>
            <h3 className="text-sm font-medium text-foreground">
              Suspicious Nodes
            </h3>
            <Badge variant="secondary" className="text-[10px] font-semibold border-0">{nodes.length}</Badge>
          </div>
          <ScrollArea className="h-[220px] rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/40">
                  <TableHead className="text-xs font-medium">Node</TableHead>
                  <TableHead className="text-xs font-medium">Scene</TableHead>
                  <TableHead className="text-xs font-medium">Type</TableHead>
                  <TableHead className="text-xs font-medium">Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodes.map((node, i) => (
                  <TableRow
                    key={`${node.nodeName}-${node.scenePath}-${i}`}
                    className="cursor-pointer transition-colors duration-150 hover:bg-muted/40 border-border/30"
                    onClick={() => onFileClick?.(node.scenePath)}
                  >
                    <TableCell className="font-mono text-xs font-medium text-foreground">
                      {node.nodeName}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                      {node.scenePath.replace("res://", "")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] border-0">{node.nodeType}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {node.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
