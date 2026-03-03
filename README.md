# Godot Project Cleaner
Dead Code & Orphan Asset Scanner for Godot Projects

## Overview

Godot Project Cleaner is a standalone tool that scans a Godot project directory and detects:

- Unused assets (png, wav, ogg, glb, etc.)
- Orphaned scenes
- Unreferenced scripts
- Dead resources

It builds a full dependency graph starting from project entry points and identifies files that are not reachable.

This helps reduce:
- Project size
- Build time
- Clutter
- Long-term technical debt

---

## How It Works

1. Select your Godot project root folder.
2. The tool recursively scans:
   - `.gd`
   - `.tscn`
   - `.tres`
   - Asset files
3. Builds a dependency graph.
4. Traverses from entry points.
5. Flags unused files.

No external APIs required. Fully local processing.

---

## Features

- One-click scan
- Dependency graph visualization
- Unused file detection
- Safe review before deletion
- Lightweight and fast

---

## Installation

1. Download the latest release.
2. Extract the files.
3. Run in localhost.
4. Select your Godot project folder.

---

## Safety Notice

Always back up your project before deleting flagged files.  
Dynamic loads (`load()`, `preload()`, runtime-generated paths) may require manual verification.

---

## Contributing

Pull requests are welcome.

If you want to contribute:
- Fork the repository
- Create a new branch
- Submit a pull request with a clear explanation

---

## License

This project is licensed under the MIT License.

