# Godot Project Buddy
Dead Code & Orphan Asset Scanner for Godot Projects

## Overview

Godot Project Buddy is a standalone tool that scans your Godot project directory and detects:

- Unused assets (png, wav, ogg, glb, etc.)
- Orphaned scenes
- Unreferenced scripts
- Dead resources

It builds a full dependency graph starting from project entry points and identifies files that are not reachable.  
This helps reduce project size, clutter, and build time while improving workflow efficiency.

---

## Getting Started

These instructions will help you run Godot Project Buddy locally.

### 1. Download the Project
- **Option A:** Download the latest release ZIP from GitHub and extract it.
- **Option B:** Clone the repository using GitHub Desktop or another GUI tool.

### 2. Install Dependencies
- Make sure **Node.js** (v18+) is installed.
- Open a terminal in the project folder.
- Run:
```bash
npm install
````

This installs all required TypeScript dependencies.

### 3. Build the Project

* Compile the TypeScript project:

```bash
npm run build
```

This generates the executable files required to run the Cleaner.

### 4. Run the Cleaner

* Start the app:

```bash
npm start
```

* Select your Godot project root folder.
* The tool scans your files, builds the dependency graph, and flags unused or orphaned assets.
* Review results before taking any action.

---

## Usage Tips

* Always **backup your Godot project** before deleting flagged files.
* Double-check dynamically loaded assets (`load()`, `preload()`) as they may not appear in the dependency graph.
* Use the dependency graph to **visually trace references** and confirm deletions are safe.

---

## Features

* One-click scan of Godot projects
* Dependency graph visualization
* Detects unused files safely
* Lightweight and fast
* No external APIs required

---

## Contributing

Pull requests and suggestions are welcome.

To contribute:

1. Fork the repository.
2. Create a new branch.
3. Make changes and submit a pull request with a clear explanation.

---

## License

This project is licensed under the MIT License.

<img width="1871" height="992" alt="image" src="https://github.com/user-attachments/assets/54b69abd-02d2-4f39-8d53-b8684f5f8298" /><img width="932" height="491" alt="{D0125EB4-4AE5-4C85-9A3F-AD2BD05832D7}" src="https://github.com/user-attachments/assets/4baa83ad-3bb3-46bd-899e-75e560a7ed00" /><img width="938" height="474" alt="{9669475D-88B5-40E5-9BD6-107B1ADD0242}" src="https://github.com/user-attachments/assets/e5b28a82-43cb-4bfd-9507-6bed7d44699a" /><img width="931" height="455" alt="{79883EA5-44A2-4E16-961B-0B50B319DAA2}" src="https://github.com/user-attachments/assets/a5e0bc79-2dff-4556-9dee-ed6b5e5a4eaa" /><img width="942" height="495" alt="{27E6CA7D-7768-4886-84CC-6EA151050D0F}" src="https://github.com/user-attachments/assets/060d6eef-af5d-4cb6-b5f0-1462b10c95f6" /><img width="946" height="450" alt="{B12EDD6E-42A0-4F23-9295-08032E9C356D}" src="https://github.com/user-attachments/assets/83d7bf83-a1bd-4534-8e5e-0ffa0131e21e" />







