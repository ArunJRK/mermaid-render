# mermaid-render Execution Matrix

**Source plan:** `docs/superpowers/plans/2026-03-28-mermaid-render-impl.md`
**Spec:** `docs/superpowers/specs/2026-03-28-mermaid-render-design.md`

---

## Quick Index

| Theme | Key Deliverable |
|-------|----------------|
| **1. Foundation** | Monorepo scaffold + types + build toolchain |
| **2. Parser Pipeline** | Mermaid text → RenderGraph with directives |
| **3. Layout Engine** | Positioned graph with philosophy presets + fold support |
| **4. Renderer** | PixiJS scene graph + interaction + dev harness |
| **5. VS Code Extension** | Extension + webview panel + file explorer |
| **6. Integration** | End-to-end wiring + example files |

---

## Theme 1: Foundation

| Task | Description | Chunk | Done When |
|------|-------------|-------|-----------|
| 1.1 | Create root `package.json`, `pnpm-workspace.yaml`, base `tsconfig.json`, `.gitignore` | foundation | `cat package.json \| jq .name` → `"mermaid-render"` |
| 1.2 | Create `packages/core/package.json` with dependencies (mermaid, dagre, pixi.js), `tsconfig.json`, `tsup.config.ts` | foundation | `cat packages/core/package.json \| jq .name` → `"@mermaid-render/core"` |
| 1.3 | Run `pnpm install` and verify lockfile | foundation | `test -f pnpm-lock.yaml && echo ok` → `ok` |
| 1.4 | Create `packages/core/src/types.ts` with all interfaces (RenderGraph, RenderNode, RenderEdge, RenderSubgraph, Directive types, PositionedGraph, LoadResult, NodeEvent) | foundation | `pnpm --filter @mermaid-render/core typecheck` → exit 0 |
| 1.5 | Create `packages/core/vitest.config.ts` (with `environment: 'jsdom'`) and type validation tests | foundation | `pnpm --filter @mermaid-render/core test` → PASS |
| 1.6 | Create `packages/core/src/index.ts` with placeholder exports, verify build | foundation | `pnpm --filter @mermaid-render/core build && test -f packages/core/dist/index.js` → true |

### Theme 1 Gate
`pnpm install && pnpm build && pnpm test` — all pass from repo root.

---

## Theme 2: Parser Pipeline

| Task | Description | Chunk | Done When |
|------|-------------|-------|-----------|
| 2.1 | Implement `directive-extractor.ts` — regex extraction of `@link`, `@layout`, `@pin`, `@rank`, `@spacing` from `%%` comments | parser-pipeline | `pnpm --filter @mermaid-render/core test -- directive-extractor` → 8/8 PASS |
| 2.2 | Mermaid API spike — run `_spike.ts` to discover `Diagram.fromText()` and `db.getData()` shape for mermaid 11.4.x | parser-pipeline | Spike script runs without errors and logs db structure to console |
| 2.3 | Implement `mermaid-adapter.ts` — thin wrapper around mermaid, returns `{ diagramType, db, direction }` | parser-pipeline | `pnpm --filter @mermaid-render/core test -- mermaid-adapter` → PASS |
| 2.4 | Implement `adapters/flowchart.ts` — transforms mermaid flowchart db into RenderGraph (nodes, edges, subgraphs) | parser-pipeline | `pnpm --filter @mermaid-render/core test -- graph-builder` → 7/7 PASS |
| 2.5 | Implement `graph-builder.ts` — orchestrator: extractDirectives → parseMermaid → buildFlowchartGraph → attach links | parser-pipeline | `pnpm --filter @mermaid-render/core test -- graph-builder` → includes directive attachment test PASS |

### Theme 2 Gate
```bash
pnpm --filter @mermaid-render/core test -- parser
```
All parser tests pass. `buildGraph('graph TD\n A --> B')` returns `{ success: true, graph: { nodes: Map(2), edges: [1] } }`.

---

## Theme 3: Layout Engine

| Task | Description | Chunk | Done When |
|------|-------------|-------|-----------|
| 3.1 | Create `layout-engine.ts` interface and `philosophy-config.ts` with Narrative/Map/Blueprint/Breath presets | layout-engine | `pnpm --filter @mermaid-render/core typecheck` → exit 0 |
| 3.2 | Implement `dagre-layout.ts` — wraps dagre, applies philosophy spacing, handles fold (hidden nodes + summary nodes + edge rerouting) | layout-engine | `pnpm --filter @mermaid-render/core test -- dagre-layout` → 5/5 PASS |
| 3.3 | Verify philosophy spacing works: Breath produces larger layout than Blueprint for same graph | layout-engine | `pnpm --filter @mermaid-render/core test -- "applies philosophy"` → PASS |

### Theme 3 Gate
```bash
pnpm --filter @mermaid-render/core test -- layout
```
All layout tests pass. `DagreLayout.compute(graph)` returns `PositionedGraph` with non-overlapping nodes.

---

## Theme 4: Renderer

| Task | Description | Chunk | Done When |
|------|-------------|-------|-----------|
| 4.1 | Implement `viewport.ts` — zoom (wheel), pan (drag empty space), fitToView, resetView, cleanup method | renderer-core | `pnpm --filter @mermaid-render/core typecheck` → exit 0 |
| 4.2 | Implement `node-sprite.ts` — rounded rect shapes, Text labels, highlight/select, click events | renderer-core | `pnpm --filter @mermaid-render/core typecheck` → exit 0 |
| 4.3 | Implement `edge-graphic.ts` — bezier curves, dotted/thick styles, arrow heads, edge labels | renderer-core | `pnpm --filter @mermaid-render/core typecheck` → exit 0 |
| 4.4 | Implement `subgraph-container.ts` — background rect, label, positioning | renderer-core | `pnpm --filter @mermaid-render/core typecheck` → exit 0 |
| 4.5 | Implement `mermaid-renderer.ts` — mount, load, loadGraph, clearScene, renderGraph, selectNode, foldNode/unfoldNode, foldAll/unfoldAll, on/off, destroy | renderer-core | `pnpm --filter @mermaid-render/core build` → exit 0 |
| 4.6 | Create dev harness (`packages/core/dev/index.html` + `dev/main.ts` + `vite.config.ts`) | renderer-harness | `cd packages/core && pnpm dev` → Vite serves at localhost:3000 |
| 4.7 | Implement `interaction/fold-manager.ts` — toggle, foldAll, unfoldAll, collapseDescendants | renderer-interaction | `pnpm --filter @mermaid-render/core typecheck` → exit 0 |
| 4.8 | Implement `interaction/keyboard.ts` — F=fitToView, R=resetView on focused canvas | renderer-interaction | `pnpm --filter @mermaid-render/core typecheck` → exit 0 |
| 4.9 | Wire fold-manager + keyboard into mermaid-renderer. Double-click subgraph header toggles fold. | renderer-interaction | Open dev harness → double-click subgraph → children collapse, re-layout, expand on second double-click |

### Theme 4 Gate
Open `localhost:3000` → see rendered flowchart with subgraphs. Zoom with wheel, pan by dragging, fold/unfold with double-click, F to fit, R to reset. Nodes are clickable.

---

## Theme 5: VS Code Extension

| Task | Description | Chunk | Done When |
|------|-------------|-------|-----------|
| 5.1 | Create `packages/vscode/package.json` with contributes (commands, keybindings, languages, views), `tsconfig.json`, `.vscodeignore` | vscode-scaffold | `cat packages/vscode/package.json \| jq .contributes.commands[0].command` → `"mermaidRender.openPreview"` |
| 5.2 | Implement `extension.ts` — activate, register commands (openPreview, foldAll, unfoldAll), register TreeDataProvider, watch `.mmd` saves | vscode-scaffold | `pnpm --filter mermaid-render-vscode build` → exit 0 |
| 5.3 | Implement `file-explorer.ts` — TreeDataProvider that lists `.mmd` files in workspace | vscode-scaffold | `pnpm --filter mermaid-render-vscode typecheck` → exit 0 |
| 5.4 | Implement `renderer-panel.ts` — WebviewPanel with retainContextWhenHidden, message passing (load, foldAll, unfoldAll, navigate), cross-file navigation handler | vscode-webview | `pnpm --filter mermaid-render-vscode build` → exit 0 |
| 5.5 | Implement `webview/webview.ts` — imports @mermaid-render/core, mounts renderer, handles postMessage load/fold/navigate | vscode-webview | `pnpm --filter mermaid-render-vscode build` → `dist/webview.js` exists |
| 5.6 | Add `build:webview` esbuild step (iife, browser platform), update renderer-panel.ts to load bundled webview.js via webview URI | vscode-webview | `pnpm --filter mermaid-render-vscode build && test -f packages/vscode/dist/webview.js && test -f packages/vscode/dist/extension.js` → true |

### Theme 5 Gate
Press F5 in VS Code → Extension Development Host opens. Create a `.mmd` file → run "Mermaid: Open Preview" → webview panel opens showing rendered diagram. File explorer shows `.mmd` files in sidebar.

---

## Theme 6: Integration

| Task | Description | Chunk | Done When |
|------|-------------|-------|-----------|
| 6.1 | Create `examples/` directory with test .mmd files: simple-flow, with-subgraphs, cross-file (3 linked files), each layout philosophy | integration-verify | `ls examples/*.mmd examples/cross-file/*.mmd \| wc -l` → ≥6 |
| 6.2 | End-to-end manual verification: open each example in dev harness + VS Code extension, test zoom/pan/fold/cross-file-nav/layout-switching | integration-verify | All 4 philosophies render differently. Cross-file click navigates. Fold/unfold works. |
| 6.3 | Run full test suite, fix any failures | integration-verify | `pnpm test` from repo root → ALL PASS |
| 6.4 | Final commit and push | integration-verify | `git log --oneline -1` shows integration commit. `git status` is clean. |

### Theme 6 Gate
`pnpm build && pnpm test` → clean. Dev harness renders all examples. VS Code extension activates and previews `.mmd` files.

---

## Chunk Plan

### Chunk: foundation
**Tasks:** 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
**Agent:** JR | Haiku (config)
**Human:** no
**Context brief:**
  - Read `docs/superpowers/plans/2026-03-28-mermaid-render-impl.md` Task 1 and Task 2
  - Read `docs/tech.md` §Architecture and §Bundle Size Budget
**Shared files:** `package.json`, `tsconfig.json`, `packages/core/package.json`, `packages/core/src/types.ts`, `packages/core/src/index.ts`
**Rollback:** `rm -rf packages/ node_modules/ pnpm-lock.yaml` and revert root config files
**Done when:** `pnpm install && pnpm build && pnpm test` → all exit 0

---

### Chunk: parser-pipeline
**Tasks:** 2.1, 2.2, 2.3, 2.4, 2.5
**Agent:** SR | Sonnet (integration)
**Human:** no
**Context brief:**
  - Read `docs/superpowers/plans/2026-03-28-mermaid-render-impl.md` Tasks 3 + 4
  - Read `docs/superpowers/specs/2026-03-28-mermaid-render-design.md` §3.1 Parser Layer, §5 Cross-File Linking, §12 Parser Stability
  - Read `packages/core/src/types.ts` for graph model interfaces
  - **Critical:** Task 2.2 is a spike. Run the spike script FIRST to discover mermaid's actual internal API before writing adapter code. Do not skip this.
**Shared files:** `packages/core/src/parser/*`, `packages/core/src/types.ts`
**Rollback:** Delete `packages/core/src/parser/` directory
**Done when:** `pnpm --filter @mermaid-render/core test` → all parser tests PASS including flowchart with subgraphs and directive attachment

---

### Chunk: layout-engine
**Tasks:** 3.1, 3.2, 3.3
**Agent:** SR | Sonnet (multi-file)
**Human:** no
**Context brief:**
  - Read `docs/superpowers/plans/2026-03-28-mermaid-render-impl.md` Task 5
  - Read `docs/layout-philosophies/*.md` for spacing/grouping philosophy details
  - Read `docs/superpowers/specs/2026-03-28-mermaid-render-design.md` §3.2 Layout Engine, §6 Node Folding, §15.3 Deep Nesting
  - Read `packages/core/src/types.ts` for PositionedGraph interfaces
**Shared files:** `packages/core/src/layout/*`
**Rollback:** Delete `packages/core/src/layout/` directory
**Done when:** `pnpm --filter @mermaid-render/core test -- layout` → 5/5 PASS. Breath layout dimensions > Blueprint for same input graph.

---

### Chunk: renderer-core
**Tasks:** 4.1, 4.2, 4.3, 4.4, 4.5
**Agent:** SR | Opus (arch)
**Human:** no
**Context brief:**
  - Read `docs/superpowers/plans/2026-03-28-mermaid-render-impl.md` Task 6
  - Read `docs/superpowers/specs/2026-03-28-mermaid-render-design.md` §3.3 Renderer, §3.4 Interaction Model, §10 Error Handling, §11 Performance Strategy
  - Read PixiJS 8 docs for `Application`, `Container`, `Graphics`, `Text`, `TextStyle` APIs — verify method signatures match plan code
  - Read `packages/core/src/types.ts` for all interfaces
  - Read `packages/core/src/parser/graph-builder.ts` for `buildGraph()` API
  - Read `packages/core/src/layout/dagre-layout.ts` for `DagreLayout` API
**Shared files:** `packages/core/src/renderer/*`, `packages/core/src/index.ts`
**Rollback:** Delete `packages/core/src/renderer/` directory
**Done when:** `pnpm --filter @mermaid-render/core build` → exit 0. All renderer files type-check.

---

### Chunk: renderer-harness
**Tasks:** 4.6
**Agent:** JR | Haiku (config)
**Human:** no
**Context brief:**
  - Read `docs/superpowers/plans/2026-03-28-mermaid-render-impl.md` Task 7
  - Read `packages/core/src/index.ts` for available exports
**Shared files:** `packages/core/dev/*`, `packages/core/vite.config.ts`, `packages/core/package.json` (add dev script)
**Rollback:** Delete `packages/core/dev/` and `packages/core/vite.config.ts`
**Done when:** `cd packages/core && pnpm dev` → Vite starts on localhost:3000 without errors

---

### Chunk: renderer-interaction
**Tasks:** 4.7, 4.8, 4.9
**Agent:** SR | Sonnet (multi-file)
**Human:** approve (manual verification of fold/unfold behavior in browser)
**Context brief:**
  - Read `docs/superpowers/plans/2026-03-28-mermaid-render-impl.md` Task 8
  - Read `docs/superpowers/specs/2026-03-28-mermaid-render-design.md` §6 Node Folding, §3.4 Interaction Model
  - Read `packages/core/src/renderer/mermaid-renderer.ts` — this file must be modified to integrate fold-manager and keyboard
  - Read `packages/core/src/renderer/node-sprite.ts` — needs dblclick handler wired
**Shared files:** `packages/core/src/interaction/*`, `packages/core/src/renderer/mermaid-renderer.ts`
**Rollback:** Delete `packages/core/src/interaction/` and revert mermaid-renderer.ts changes
**Done when:** Open dev harness → double-click subgraph → children collapse. Press F → fits to view. Press R → resets zoom.

---

### Chunk: vscode-scaffold
**Tasks:** 5.1, 5.2, 5.3
**Agent:** SR | Sonnet (multi-file)
**Human:** no
**Context brief:**
  - Read `docs/superpowers/plans/2026-03-28-mermaid-render-impl.md` Tasks 9 + 11
  - Read `docs/superpowers/specs/2026-03-28-mermaid-render-design.md` §4 VS Code Extension
  - Read VS Code Extension API docs for WebviewPanel, TreeDataProvider, commands
**Shared files:** `packages/vscode/*`
**Rollback:** Delete `packages/vscode/` directory
**Done when:** `pnpm --filter mermaid-render-vscode build` → `dist/extension.js` exists

---

### Chunk: vscode-webview
**Tasks:** 5.4, 5.5, 5.6
**Agent:** SR | Opus (arch)
**Human:** approve (manual verification in Extension Development Host)
**Context brief:**
  - Read `docs/superpowers/plans/2026-03-28-mermaid-render-impl.md` Tasks 10 + 12
  - Read `docs/superpowers/specs/2026-03-28-mermaid-render-design.md` §4.2 Renderer Panel, §4.3 Directive Resolution, §14 Cross-File Path Resolution, §15.1 Circular Cross-File Links
  - Read `packages/core/src/index.ts` for the public API surface
  - Read `packages/vscode/src/extension.ts` for message types expected
  - **Key complexity:** Bundling @mermaid-render/core + PixiJS + mermaid for the webview context (browser, iife). May need esbuild `define` or `alias` for mermaid's Node.js polyfills.
**Shared files:** `packages/vscode/src/renderer-panel.ts`, `packages/vscode/src/webview/webview.ts`, `packages/vscode/package.json`
**Rollback:** Revert renderer-panel.ts to placeholder HTML. Delete webview.ts.
**Done when:** F5 in VS Code → open `.mmd` file → "Mermaid: Open Preview" → diagram renders in webview panel. Saving file triggers hot-reload.

---

### Chunk: integration-verify
**Tasks:** 6.1, 6.2, 6.3, 6.4
**Agent:** SR | Sonnet (integration)
**Human:** approve (manual e2e verification)
**Context brief:**
  - Read all layout philosophy files in `docs/layout-philosophies/`
  - Read `docs/superpowers/specs/2026-03-28-mermaid-render-design.md` §5 Cross-File Linking for example syntax
  - Browse the full `packages/core/src/` and `packages/vscode/src/` to understand what's built
**Shared files:** `examples/*`
**Rollback:** Delete `examples/` directory
**Done when:** `pnpm build && pnpm test` → all pass. Dev harness renders all examples. VS Code extension previews all examples.

---

## Cross-Chunk Dependencies

```
parser-pipeline    requires  foundation
layout-engine      requires  foundation
renderer-core      requires  parser-pipeline AND layout-engine
renderer-harness   requires  renderer-core
renderer-interaction requires renderer-core AND renderer-harness
vscode-scaffold    requires  foundation
vscode-webview     requires  vscode-scaffold AND renderer-core
integration-verify requires  renderer-interaction AND vscode-webview
```

---

## Concurrency Map

```
Wave 1: [foundation]
         ↓
Wave 2: [parser-pipeline || layout-engine || vscode-scaffold]
         ↓
Wave 3: [renderer-core]
         ↓
Wave 4: [renderer-harness || vscode-webview]
         ↓
Wave 5: [renderer-interaction]
         ↓
Wave 6: [integration-verify]
```

**Max concurrent chunks:** 3 (Wave 2)
**Total chunks:** 9
**Estimated context cost:** 9 chunks x ~3K avg = ~27K tokens
(vs 28 tasks x ~2K = 56K if unchunked)

---

## Token Budget Estimate

| Chunk | Tasks | Agent | Model | Est. Tokens |
|-------|-------|-------|-------|-------------|
| foundation | 6 | JR | Haiku | ~2K |
| parser-pipeline | 5 | SR | Sonnet | ~5K |
| layout-engine | 3 | SR | Sonnet | ~3K |
| renderer-core | 5 | SR | Opus | ~5K |
| renderer-harness | 1 | JR | Haiku | ~1K |
| renderer-interaction | 3 | SR | Sonnet | ~3K |
| vscode-scaffold | 3 | SR | Sonnet | ~3K |
| vscode-webview | 3 | SR | Opus | ~4K |
| integration-verify | 4 | SR | Sonnet | ~2K |
| **Total** | **33** | | | **~28K** |

---

## Overall Go/No-Go

- [ ] `pnpm build` — both packages build clean
- [ ] `pnpm test` — all unit tests pass
- [ ] Dev harness at localhost:3000 renders flowcharts with subgraphs
- [ ] All 4 layout philosophies produce visually distinct results
- [ ] Zoom, pan, fold/unfold, keyboard shortcuts work in dev harness
- [ ] VS Code extension activates, file explorer shows .mmd files
- [ ] VS Code preview panel renders diagrams with hot-reload on save
- [ ] Cross-file link click navigates to target file
- [ ] `git status` is clean, all work committed and pushed
