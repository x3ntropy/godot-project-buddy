"use client"

import { useRef } from "react"
import {
  FolderOpen,
  AlertCircle,
  ShieldCheck,
  FileX,
  Code2,
  CopySlash,
  Radio,
  Lock,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { APP_VERSION } from "@/app/page"

interface ProjectPickerProps {
  onFilesSelected: (files: File[]) => void
  onScan: () => void
  projectName: string | null
  projectPath: string | null
  includeAddons: boolean
  onIncludeAddonsChange: (v: boolean) => void
  isScanning: boolean
  error: string | null
}

const FEATURES = [
  {
    icon: FileX,
    title: "Unused Files",
    description: "Detect orphan assets and resources that no scene or script references.",
  },
  {
    icon: Code2,
    title: "Dead Code",
    description: "Find functions and variables that exist but are never called or read.",
  },
  {
    icon: CopySlash,
    title: "Duplicate Functions",
    description: "Identify identical or near-identical functions across your scripts.",
  },
  {
    icon: Radio,
    title: "Signal Analysis",
    description: "Trace signal connections and flag disconnected or unused signals.",
  },
]

export function ProjectPicker({
  onFilesSelected,
  onScan,
  projectName,
  projectPath,
  includeAddons,
  onIncludeAddonsChange,
  isScanning,
  error,
}: ProjectPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handlePickFolder() {
    inputRef.current?.click()
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) {
      onFilesSelected(files)
    }
    e.target.value = ""
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 py-20 overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 bg-grid bg-grid-fade pointer-events-none" aria-hidden="true" />

      {/* Primary top glow orb — drifts slowly */}
      <div
        className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full blur-[120px] pointer-events-none opacity-40 animate-orb-drift"
        style={{ background: "radial-gradient(ellipse, oklch(0.72 0.14 180 / 0.18), transparent 65%)" }}
        aria-hidden="true"
      />

      {/* Secondary accent orb — bottom right */}
      <div
        className="absolute bottom-[-80px] right-[-100px] w-[500px] h-[400px] rounded-full blur-[100px] pointer-events-none opacity-20"
        style={{ background: "radial-gradient(ellipse, oklch(0.65 0.12 220 / 0.25), transparent 70%)", animationDelay: "6s" }}
        aria-hidden="true"
      />

      {/* Tertiary orb — bottom left */}
      <div
        className="absolute bottom-0 left-[-60px] w-[400px] h-[300px] rounded-full blur-[90px] pointer-events-none opacity-15"
        style={{ background: "radial-gradient(ellipse, oklch(0.70 0.17 145 / 0.2), transparent 70%)" }}
        aria-hidden="true"
      />

      {/* Hidden input */}
      <input
        ref={inputRef}
        type="file"
        // @ts-expect-error -- webkitdirectory is non-standard but widely supported
        webkitdirectory=""
        multiple
        className="hidden"
        onChange={handleInputChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center gap-16 w-full max-w-4xl">
        {/* Hero section */}
        <div className="flex flex-col items-center gap-6 text-center animate-fade-in-up">
          {/* Badge */}
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Open Source Project Analyzer
          </span>

          {/* Logo */}
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-card border border-border/60 shadow-xl shadow-black/40 overflow-hidden animate-float ring-1 ring-primary/10">
            <img
              src="/logo.jpg"
              alt="Godot Project Buddy logo"
              className="h-full w-full object-cover"
            />
            {/* Subtle shine overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: "linear-gradient(135deg, oklch(1 0 0 / 0.08) 0%, transparent 50%)" }}
              aria-hidden="true"
            />
          </div>

          {/* Title + subtitle */}
          <div className="flex flex-col items-center gap-3">
            <h1 className="text-5xl font-bold tracking-tight text-foreground text-balance leading-tight">
              Godot Project Buddy
            </h1>
            <p className="max-w-lg text-muted-foreground leading-relaxed text-pretty text-lg animate-fade-in delay-100">
              Scan your Godot project to find unused files, duplicate functions, dead signals, and orphan assets.
            </p>
          </div>

          {/* CTA area */}
          {projectPath ? (
            <div className="flex flex-col items-center gap-5 animate-scale-in">
              {/* Selected project card */}
              <div className="flex items-center gap-4 rounded-xl border border-primary/20 bg-card/80 backdrop-blur-sm px-5 py-4 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground">
                    {projectName || "Godot Project"}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">{projectPath}</span>
                </div>
                <ShieldCheck className="h-4 w-4 text-primary ml-3" />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="include-addons"
                  checked={includeAddons}
                  onCheckedChange={(v) => onIncludeAddonsChange(v === true)}
                />
                <Label htmlFor="include-addons" className="text-sm text-muted-foreground cursor-pointer select-none">
                  Include addons folder
                </Label>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={handlePickFolder}
                  disabled={isScanning}
                  className="cursor-pointer"
                >
                  Change Folder
                </Button>
                <Button
                  onClick={onScan}
                  disabled={isScanning}
                  className="cursor-pointer gap-2 px-6 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
                >
                  {isScanning ? "Scanning..." : "Scan Project"}
                  {!isScanning && <ArrowRight className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 animate-fade-in delay-200">
              <Button
                size="lg"
                onClick={handlePickFolder}
                className="cursor-pointer gap-2.5 px-8 py-6 text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
              >
                <FolderOpen className="h-5 w-5" />
                Select Project Folder
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2.5 rounded-xl bg-destructive/10 border border-destructive/20 px-5 py-3 text-sm text-destructive animate-scale-in">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Feature grid */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-px bg-border/30 rounded-2xl overflow-hidden border border-border/30 animate-fade-in-up delay-300 shadow-xl shadow-black/20">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className="group relative flex flex-col gap-3 glass p-6 transition-all duration-300 hover:bg-card/80 overflow-hidden animate-fade-in-up"
              style={{ animationDelay: `${320 + i * 80}ms` }}
            >
              {/* Hover accent line */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden="true" />
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 border border-primary/10 transition-all duration-300 group-hover:bg-primary/18 group-hover:border-primary/25 group-hover:scale-110">
                  <feature.icon className="h-4 w-4 text-primary/60 transition-colors duration-300 group-hover:text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Privacy note */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground/50 animate-fade-in delay-500">
          <Lock className="h-3 w-3" />
          <span>All analysis happens locally in your browser. No files are uploaded.</span>
          <span className="ml-2 text-muted-foreground/30">v{APP_VERSION}</span>
        </div>
      </div>
    </div>
  )
}
