# Design Spec: mermaid-render

**Date:** 2026-03-28
**Status:** Draft

## 1. Problem Statement

Mermaid.js produces static SVGs with no interactivity. Users with complex diagrams (information architecture, C4, service blueprints, data models) face:

- Unreadable diagrams that shrink to fit the page (#1860, #2162 — 46+ reactions)
- No way to collapse complexity (#5508, #1123 — 23+ reactions)
- No way to decompose across files (#4673 — 32 reactions)
- Browser freezing on large inputs (#1216)

These are the most upvoted open issues in the Mermaid repo, unresolved for years.

## 2. Solution

A standalone rendering engine that takes Mermaid's AST and renders it to an interactive WebGL canvas. Two packages:

1. **@mermaid-render/core** — framework-agnostic npm library
2. **@mermaid-render/vscode** — VS Code extension (first consumer)

## 3. Architecture

```
┌─────────────────────────────────────────────────┐
│                  Consumers                       │
│  ┌──────────────┐  ┌──────────┐  ┌───────────┐ │
│  │ VS Code Ext  │  │ Web App  │  │ Embedded  │ │
│  └──────┬───────┘  └────┬─────┘  └─────┬─────┘ │
└─────────┼───────────────┼───────────────┼───────┘
          │               │               │
          ▼               ▼               ▼
┌─────────────────────────────────────────────────┐
│              @mermaid-render/core                 │
│                                                   │
│  ┌───────────┐  ┌──────────┐  ┌───────────────┐ │
│  │  Parser    │  │  Layout  │  │   Renderer    │ │
│  │  Layer     │  │  Engine  │  │   (PixiJS)    │ │
│  │           │  │          │  │               │ │
│  │ Mermaid   │  │ dagre v1 │  │ Scene Graph   │ │
│  │ Parser +  │──▶│ ELK   v2 │──▶│ Interaction  │ │
│  │ Directive │  │          │  │ Zoom/Pan      │ │
│  │ Extractor │  │          │  │ Fold/Unfold   │ │
│  └───────────┘  └──────────┘  └───────────────┘ │
└─────────────────────────────────────────────────┘
```

### 3.1 Parser Layer

**Input:** Raw Mermaid text (string)
**Output:** Parsed graph (nodes, edges, metadata) + extracted directives

Pipeline:
1. **Directive extractor** — regex scan for `%% @link` and other directives, strip them, store separately
2. **Mermaid parser** — pass cleaned text to @mermaid-js/parser, get AST
3. **Graph builder** — transform Mermaid AST into our internal graph representation (nodes, edges, properties, hierarchy)
4. **Directive resolver** — attach extracted directives back to graph nodes

Internal graph format:
```typescript
interface RenderGraph {
  nodes: Map<string, RenderNode>
  edges: RenderEdge[]
  subgraphs: Map<string, RenderSubgraph>
  directives: Directive[]
}

interface RenderNode {
  id: string
  label: string
  type: string // shape type
  children?: string[] // for compound nodes
  links?: CrossFileLink[]
  metadata: Record<string, unknown>
}

interface CrossFileLink {
  targetFile: string // full path
  targetNode?: string // optional fragment
}

interface RenderEdge {
  source: string
  target: string
  label?: string
  style?: EdgeStyle
}

interface RenderSubgraph {
  id: string
  label: string
  nodeIds: string[]
  collapsed: boolean
}
```

### 3.2 Layout Engine

**Input:** RenderGraph
**Output:** Positioned graph (x, y, width, height for each node; waypoints for each edge)

v1: @dagrejs/dagre
- Accepts directed graph, produces layered layout
- Re-run layout when fold state changes (pass only visible nodes)
- Animate transitions between layouts

v2: ELK.js
- Native compound node support (no need to manually filter)
- Hierarchical layout across nesting levels
- Async layout in web worker

Layout runs in a web worker to avoid blocking the main thread.

### 3.3 Renderer (PixiJS)

**Input:** Positioned graph
**Output:** Interactive WebGL canvas

Components:
- **Viewport container** — handles zoom/pan via wheel and pointer events
- **Node sprites** — rounded rectangles with MSDF text labels
- **Edge graphics** — bezier curves between nodes, animated on hover
- **Subgraph containers** — PixiJS Containers that group child nodes (fold = hide container children, show summary)
- **Cross-file link indicators** — visual badge on linked nodes (click navigates)
- **Minimap** — small overview in corner showing full diagram with viewport rectangle

Visual features:
- Glow filter on hovered/selected nodes
- Smooth animated transitions on fold/unfold (layout interpolation)
- Edge highlighting on node selection (dim unrelated edges)
- Depth indication via subtle shadows on nested subgraphs

### 3.4 Interaction Model

| Action | Input | Result |
|--------|-------|--------|
| Pan | Click + drag on empty space | Move viewport |
| Zoom | Scroll wheel / pinch | Zoom in/out at cursor |
| Select node | Click node | Highlight node + connected edges |
| Fold/unfold | Double-click subgraph header OR keyboard shortcut | Collapse/expand children, re-layout |
| Cross-file nav | Click link badge on node | Emit event (consumer handles navigation) |
| Fit to view | Keyboard shortcut (F) | Zoom to fit all visible nodes |
| Reset view | Keyboard shortcut (R) | Reset to default zoom/position |

The core engine emits events. Consumers (VS Code, web app) handle navigation and file loading.

```typescript
interface MermaidRenderer {
  // Lifecycle
  mount(canvas: HTMLCanvasElement): void
  destroy(): void

  // Data
  load(source: string): void // Mermaid text
  loadGraph(graph: RenderGraph): void // Pre-parsed

  // Interaction
  foldNode(nodeId: string): void
  unfoldNode(nodeId: string): void
  fitToView(): void
  resetView(): void
  selectNode(nodeId: string): void

  // Events
  on(event: 'node:click', handler: (nodeId: string) => void): void
  on(event: 'node:dblclick', handler: (nodeId: string) => void): void
  on(event: 'link:navigate', handler: (link: CrossFileLink) => void): void
  on(event: 'fold:change', handler: (nodeId: string, collapsed: boolean) => void): void
}
```

## 4. VS Code Extension

### 4.1 File Explorer

- VS Code TreeView in the sidebar
- Shows .mmd files in workspace
- Click to open in the renderer panel
- Icons indicate files with cross-file links

### 4.2 Renderer Panel

- VS Code WebviewPanel
- Loads @mermaid-render/core in the webview
- Watches file for changes, hot-reloads on save
- Handles `link:navigate` events by opening the target file

### 4.3 Directive Resolution

The extension resolves cross-file paths:
- Absolute paths used as-is
- Workspace-relative paths resolved from workspace root
- Invalid paths shown as broken link indicators in the renderer

### 4.4 Commands

| Command | Shortcut | Action |
|---------|----------|--------|
| Mermaid: Open Preview | Ctrl+Shift+M | Open renderer panel for current .mmd file |
| Mermaid: Fold All | — | Collapse all subgraphs |
| Mermaid: Unfold All | — | Expand all subgraphs |
| Mermaid: Fit to View | F (when panel focused) | Zoom to fit |

## 5. Cross-File Linking

### 5.1 Syntax

```
%% @link <nodeId> -> <absolutePath>#<targetNodeId>
```

Examples:
```mermaid
%% @link authService -> /services/auth/flow.mmd#loginHandler
%% @link userDB -> /services/data/schema.mmd#usersTable

graph TD
    authService[Auth Service] --> userDB[User Database]
```

### 5.2 Rules

- Paths are always full (absolute or workspace-relative)
- Fragment (#targetNodeId) is optional — without it, links to the file's root view
- Multiple links per node are allowed
- Directives are comments — standard Mermaid tools render the diagram normally without them

## 6. Node Folding

### 6.1 What Folds

- Mermaid subgraphs are the fold boundary
- Folding hides all child nodes and internal edges
- A folded subgraph shows as a single summary node (label + child count)
- Edges that crossed into the subgraph reroute to the summary node

### 6.2 State

Fold state is per-session (not persisted in the .mmd file). The renderer tracks which subgraphs are collapsed and re-runs layout when fold state changes.

### 6.3 Animation

Fold/unfold transitions:
1. Calculate new layout (target positions)
2. Animate nodes from current to target positions over ~300ms
3. Fade in/out appearing/disappearing nodes

## 7. Diagram Type Support

Priority order for v1:

1. **Flowchart (graph TD/LR)** — most common, subgraphs for folding
2. **Class diagram** — data structures, relationships
3. **C4 diagram** — architectural layers, natural fit for folding
4. **State diagram** — nested states map to folding

Other Mermaid types (sequence, Gantt, pie, git, journey) are lower priority and may render as static fallbacks initially.

## 8. Project Structure

```
mermaid-render/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── parser/
│   │   │   │   ├── directive-extractor.ts
│   │   │   │   ├── mermaid-adapter.ts
│   │   │   │   └── graph-builder.ts
│   │   │   ├── layout/
│   │   │   │   ├── layout-engine.ts (interface)
│   │   │   │   ├── dagre-layout.ts
│   │   │   │   └── layout-worker.ts
│   │   │   ├── renderer/
│   │   │   │   ├── mermaid-renderer.ts (main class)
│   │   │   │   ├── viewport.ts
│   │   │   │   ├── node-sprite.ts
│   │   │   │   ├── edge-graphic.ts
│   │   │   │   ├── subgraph-container.ts
│   │   │   │   └── minimap.ts
│   │   │   ├── interaction/
│   │   │   │   ├── zoom-pan.ts
│   │   │   │   ├── fold-manager.ts
│   │   │   │   └── selection.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── vscode/
│       ├── src/
│       │   ├── extension.ts
│       │   ├── file-explorer.ts
│       │   ├── renderer-panel.ts
│       │   └── directive-resolver.ts
│       ├── package.json
│       └── tsconfig.json
├── docs/
├── package.json (workspace root)
├── pnpm-workspace.yaml
├── tsconfig.json (base)
└── README.md
```

## 9. Testing Strategy

- **Unit tests** — parser, directive extractor, graph builder, fold logic
- **Layout tests** — given a graph, assert node positions are reasonable (no overlaps, correct hierarchy)
- **Renderer tests** — PixiJS with headless-gl for CI, or snapshot-based visual regression
- **Integration tests** — full pipeline: Mermaid text → rendered canvas assertions
- **VS Code extension tests** — vscode-test framework for extension activation and commands

## 10. Non-Goals (v1)

- Inline editing of diagrams
- Real-time collaboration
- Accessibility (screen readers, ARIA)
- Export to image/PDF
- Custom themes (beyond basic light/dark)
- Server-side rendering
- Mermaid Live Editor replacement
