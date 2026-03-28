# Blueprint Wire Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 4 Blueprint wire-routing bugs so no two wires share a lane, bus lines participate in hop detection, and fan-outs have arrowheads.

**Architecture:** WireRegistry becomes the single source of truth for all Blueprint wire routing. Both render paths create a registry, register node obstacles, then pass it to bus line drawing and individual edge drawing. All wire segments (bus + edge) are combined for hop detection.

**Tech Stack:** TypeScript, PixiJS 8, vitest

**Spec:** `docs/superpowers/specs/2026-03-29-blueprint-wire-fixes-design.md`

---

## File Map

| File | Responsibility | Change Type |
|------|---------------|-------------|
| `packages/core/src/renderer/edge-graphic.ts` | Per-edge rendering | Modify: add WireRegistry param, registry-aware routing |
| `packages/core/src/renderer/mermaid-renderer.ts` | Orchestrates rendering | Modify: WireRegistry in `_renderGraph`, bus segments + hops, bus arrows |
| `packages/core/src/renderer/__tests__/edge-graphic-registry.test.ts` | Tests for registry-aware EdgeGraphic | Create |

---

### Task 1: EdgeGraphic accepts optional WireRegistry

**Files:**
- Modify: `packages/core/src/renderer/edge-graphic.ts:1-40`

- [ ] **Step 1: Add WireRegistry import and constructor param**

In `edge-graphic.ts`, add the import and extend the constructor:

```typescript
// Add to imports (line 6, after WireSegment import)
import type { WireRegistry } from './wire-registry'
```

Change the constructor signature (line 22) from:

```typescript
constructor(edge: PositionedEdge, theme: Theme, allNodes?: Map<string, PositionedNode>, philosophy?: string, edgeIndex = 0, totalEdges = 1, allSubgraphs?: Map<string, { x: number; y: number; width: number; height: number }>) {
```

to:

```typescript
constructor(edge: PositionedEdge, theme: Theme, allNodes?: Map<string, PositionedNode>, philosophy?: string, edgeIndex = 0, totalEdges = 1, allSubgraphs?: Map<string, { x: number; y: number; width: number; height: number }>, wireRegistry?: WireRegistry) {
```

Store it as a private field and pass to `_drawOrthogonal`:

```typescript
private _wireRegistry?: WireRegistry
```

In the constructor body, store it: `this._wireRegistry = wireRegistry`

Change the blueprint case (line 31) to pass it:

```typescript
case 'blueprint':
  this._drawOrthogonal(edge, theme, edgeIndex, totalEdges, allNodes, wireRegistry)
  break
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx vitest run packages/core/src/layout/__tests__/blueprint-layout.test.ts packages/core/src/renderer/__tests__/wire-hops.test.ts --reporter=verbose`

Expected: All pass (no behavior change yet, param is optional).

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/renderer/edge-graphic.ts
git commit -m "refactor: EdgeGraphic accepts optional WireRegistry param"
```

---

### Task 2: Registry-aware _drawOrthogonal routing

**Files:**
- Modify: `packages/core/src/renderer/edge-graphic.ts:157-280`

- [ ] **Step 1: Update `_drawOrthogonal` signature**

Change line 157 from:

```typescript
private _drawOrthogonal(edge: PositionedEdge, theme: Theme, edgeIndex: number, totalEdges: number, allNodes?: Map<string, PositionedNode>): void {
```

to:

```typescript
private _drawOrthogonal(edge: PositionedEdge, theme: Theme, edgeIndex: number, totalEdges: number, allNodes?: Map<string, PositionedNode>, wireRegistry?: WireRegistry): void {
```

- [ ] **Step 2: Replace horizontal channel scan with registry call**

Replace the horizontal channel collision block (lines 172-203). The new logic:

```typescript
// Find a horizontal channel Y that doesn't pass through any node
const baseMidY = (srcPort.y + tgtPort.y) / 2
const channelOffset = (edgeIndex - totalEdges / 2) * gridSize * 0.6
const baseMid = Math.round((baseMidY + channelOffset) / gridSize) * gridSize
const minX = Math.min(srcPort.x, tgtPort.x)
const maxX = Math.max(srcPort.x, tgtPort.x)

let midY: number
if (wireRegistry) {
  midY = wireRegistry.findFreeHorizontal(baseMid, minX, maxX)
} else {
  // Fallback: ad-hoc node scan (when no registry available)
  midY = baseMid
  if (allNodes) {
    let attempts = 0
    while (attempts < 20) {
      let blocked = false
      for (const [id, node] of allNodes) {
        if (id === edge.source || id === edge.target) continue
        const hw = node.width / 2 + 4
        const hh = node.height / 2 + 4
        if (midY >= node.y - hh && midY <= node.y + hh &&
            maxX >= node.x - hw && minX <= node.x + hw) {
          blocked = true
          break
        }
      }
      if (!blocked) break
      attempts++
      midY += (attempts % 2 === 0 ? 1 : -1) * attempts * gridSize
      midY = Math.round(midY / gridSize) * gridSize
    }
  }
}
```

- [ ] **Step 3: Replace vertical segment scans with registry calls**

Replace the vertical collision blocks (lines 205-238). The new logic:

```typescript
// Find free vertical lanes for source and target segments
let srcExitX: number
let tgtEntryX: number

if (wireRegistry) {
  srcExitX = wireRegistry.findFreeVertical(srcPort.x, srcPort.y, midY)
  tgtEntryX = wireRegistry.findFreeVertical(tgtPort.x, midY, tgtPort.y)
} else {
  // Fallback: ad-hoc node scan
  srcExitX = srcPort.x
  tgtEntryX = tgtPort.x
  if (allNodes) {
    for (const [id, node] of allNodes) {
      if (id === edge.source || id === edge.target) continue
      const hw = node.width / 2 + 6
      const hh = node.height / 2 + 6
      const minSegY = Math.min(srcPort.y, midY)
      const maxSegY = Math.max(srcPort.y, midY)
      if (srcExitX >= node.x - hw && srcExitX <= node.x + hw &&
          maxSegY >= node.y - hh && minSegY <= node.y + hh) {
        srcExitX = srcExitX < node.x ? node.x - hw - gridSize : node.x + hw + gridSize
        srcExitX = Math.round(srcExitX / gridSize) * gridSize
      }
    }
    for (const [id, node] of allNodes) {
      if (id === edge.source || id === edge.target) continue
      const hw = node.width / 2 + 6
      const hh = node.height / 2 + 6
      const minSegY = Math.min(midY, tgtPort.y)
      const maxSegY = Math.max(midY, tgtPort.y)
      if (tgtEntryX >= node.x - hw && tgtEntryX <= node.x + hw &&
          maxSegY >= node.y - hh && minSegY <= node.y + hh) {
        tgtEntryX = tgtEntryX < node.x ? node.x - hw - gridSize : node.x + hw + gridSize
        tgtEntryX = Math.round(tgtEntryX / gridSize) * gridSize
      }
    }
  }
}
```

- [ ] **Step 4: Add registry claims after routing**

After the drawing code (after line 255 `this.stroke(...)`) and before recording segments, add:

```typescript
// Claim all segments in registry so future edges avoid them
if (wireRegistry) {
  if (srcExitX !== srcPort.x) {
    wireRegistry.claimHorizontal(srcPort.y, srcPort.x, srcExitX)
  }
  wireRegistry.claimVertical(srcExitX, srcPort.y, midY)
  wireRegistry.claimHorizontal(midY, srcExitX, tgtEntryX)
  wireRegistry.claimVertical(tgtEntryX, midY, tgtPort.y)
  if (tgtEntryX !== tgtPort.x) {
    wireRegistry.claimHorizontal(tgtPort.y, tgtEntryX, tgtPort.x)
  }
}
```

- [ ] **Step 5: Also record jog segments in orthogonalSegments**

Update the segment recording (lines 258-262) to include horizontal jogs:

```typescript
this.orthogonalSegments = []
if (srcExitX !== srcPort.x) {
  this.orthogonalSegments.push({ x1: srcPort.x, y1: srcPort.y, x2: srcExitX, y2: srcPort.y, isHorizontal: true, edgeId: edge.id })
}
this.orthogonalSegments.push(
  { x1: srcExitX, y1: srcPort.y, x2: srcExitX, y2: midY, isHorizontal: false, edgeId: edge.id },
  { x1: srcExitX, y1: midY, x2: tgtEntryX, y2: midY, isHorizontal: true, edgeId: edge.id },
  { x1: tgtEntryX, y1: midY, x2: tgtEntryX, y2: tgtPort.y, isHorizontal: false, edgeId: edge.id },
)
if (tgtEntryX !== tgtPort.x) {
  this.orthogonalSegments.push({ x1: tgtEntryX, y1: tgtPort.y, x2: tgtPort.x, y2: tgtPort.y, isHorizontal: true, edgeId: edge.id })
}
```

- [ ] **Step 6: Verify existing tests still pass**

Run: `npx vitest run packages/core/src/layout/__tests__/blueprint-layout.test.ts packages/core/src/renderer/__tests__/wire-hops.test.ts --reporter=verbose`

Expected: All pass (fallback paths preserve old behavior).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/renderer/edge-graphic.ts
git commit -m "feat: EdgeGraphic uses WireRegistry for orthogonal routing with ad-hoc fallback"
```

---

### Task 3: WireRegistry in _renderGraph + pass to EdgeGraphic

**Files:**
- Modify: `packages/core/src/renderer/mermaid-renderer.ts:679-705`

- [ ] **Step 1: Create WireRegistry in `_renderGraph` Blueprint block**

Replace the Blueprint bus-line block (lines 679-697) with:

```typescript
// Blueprint: create wire registry, draw bus lines, filter edges
let edgesToDraw = positioned.edges
const busSourceIds = new Set<string>()
let wireReg: WireRegistry | undefined
if (isBlueprint && this._graph) {
  wireReg = new WireRegistry((theme as any).gridSize ?? 20)
  wireReg.registerNodeObstacles(positioned.nodes)

  // Find sources with 2+ edges (these become bus lines)
  const edgeCounts = new Map<string, number>()
  for (const e of positioned.edges) {
    edgeCounts.set(e.source, (edgeCounts.get(e.source) ?? 0) + 1)
  }
  for (const [src, count] of edgeCounts) {
    if (count >= 2) busSourceIds.add(src)
  }

  this._busSourceIds = busSourceIds
  this._busGraphics.clear()
  this._drawBlueprintBusLines(positioned, theme, busSourceIds, wireReg)
  edgesToDraw = positioned.edges.filter(e => !busSourceIds.has(e.source))
}
```

- [ ] **Step 2: Pass wireReg to EdgeGraphic constructor**

Change line 702 from:

```typescript
const eg = new EdgeGraphic(edge, theme, positioned.nodes, this._currentPhilosophy, edgeIdx, edgesToDraw.length); edgeIdx++
```

to:

```typescript
const eg = new EdgeGraphic(edge, theme, positioned.nodes, this._currentPhilosophy, edgeIdx, edgesToDraw.length, undefined, wireReg); edgeIdx++
```

- [ ] **Step 3: Also pass wireReg in focus path**

Change line 415 from:

```typescript
const eg = new EdgeGraphic(edge, theme, positioned.nodes, this._currentPhilosophy, edgeIdx, edgesToRender.length); edgeIdx++
```

to:

```typescript
const eg = new EdgeGraphic(edge, theme, positioned.nodes, this._currentPhilosophy, edgeIdx, edgesToRender.length, undefined, wireReg); edgeIdx++
```

- [ ] **Step 4: Verify existing tests pass**

Run: `npx vitest run --reporter=verbose`

Expected: 88 pass, 5 fail (pre-existing parser failures only).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/renderer/mermaid-renderer.ts
git commit -m "feat: _renderGraph creates WireRegistry and passes to EdgeGraphic"
```

---

### Task 4: Bus lines record wire segments for hop detection

**Files:**
- Modify: `packages/core/src/renderer/mermaid-renderer.ts:1043-1124` (`_drawBlueprintBusLines`)
- Modify: `packages/core/src/renderer/mermaid-renderer.ts:707-716` (hop detection block)
- Modify: `packages/core/src/renderer/mermaid-renderer.ts:420-429` (focus path hop detection)

- [ ] **Step 1: Record wire segments on bus Graphics**

In `_drawBlueprintBusLines()`, after line 1091 (`const busGfx = new Graphics()`), initialize a segment array:

```typescript
const busSegments: WireSegment[] = []
```

After the trunk drawing (after line 1096), record the trunk segments:

```typescript
// Record trunk segments
if (trunkX !== srcNode.x) {
  busSegments.push({ x1: srcNode.x, y1: srcPortY, x2: trunkX, y2: srcPortY, isHorizontal: true, edgeId: `bus:${sourceId}` })
}
busSegments.push({ x1: trunkX, y1: srcPortY, x2: trunkX, y2: busY, isHorizontal: false, edgeId: `bus:${sourceId}` })
```

After the horizontal bus drawing (after line 1100), record:

```typescript
busSegments.push({ x1: minBusX, y1: busY, x2: maxBusX, y2: busY, isHorizontal: true, edgeId: `bus:${sourceId}` })
```

Inside the fan-out loop, after each drop (after line 1116), record:

```typescript
busSegments.push({ x1: dropX, y1: busY, x2: dropX, y2: tgt.y, isHorizontal: false, edgeId: `bus:${sourceId}` })
if (dropX !== tgt.x) {
  busSegments.push({ x1: dropX, y1: tgt.y, x2: tgt.x, y2: tgt.y, isHorizontal: true, edgeId: `bus:${sourceId}` })
}
```

After `busGfx.stroke(...)` (line 1119), store the segments:

```typescript
;(busGfx as any)._wireSegments = busSegments
```

- [ ] **Step 2: Add WireSegment import to mermaid-renderer.ts**

Ensure `WireSegment` is imported at the top of `mermaid-renderer.ts`. Check if it's already imported (it may be via `drawWireHops`). If not, add:

```typescript
import type { WireSegment } from './wire-hops'
```

- [ ] **Step 3: Include bus segments in hop detection (main path)**

Replace the hop detection block (lines 707-716) with:

```typescript
// Blueprint: wire crossing hops — drawn after all edges so we can detect crossings
if (isBlueprint) {
  const edgeSegments = this._edgeGraphics
    .filter(eg => eg.orthogonalSegments != null)
    .map(eg => ({ edgeId: eg.data.id, segments: eg.orthogonalSegments! }))
  // Include bus line segments
  for (const [srcId, busGfx] of this._busGraphics) {
    const segs: WireSegment[] = (busGfx as any)._wireSegments ?? []
    if (segs.length > 0) {
      edgeSegments.push({ edgeId: `bus:${srcId}`, segments: segs })
    }
  }
  if (edgeSegments.length > 0) {
    const hopGraphic = drawWireHops(edgeSegments, theme)
    this._viewport.addChild(hopGraphic)
  }
}
```

- [ ] **Step 4: Include bus segments in hop detection (focus path)**

Apply the same change to the focus path hop detection block (lines 420-429):

```typescript
if (isBlueprint) {
  const edgeSegments = this._edgeGraphics
    .filter(eg => eg.orthogonalSegments != null)
    .map(eg => ({ edgeId: eg.data.id, segments: eg.orthogonalSegments! }))
  for (const [srcId, busGfx] of this._busGraphics) {
    const segs: WireSegment[] = (busGfx as any)._wireSegments ?? []
    if (segs.length > 0) {
      edgeSegments.push({ edgeId: `bus:${srcId}`, segments: segs })
    }
  }
  if (edgeSegments.length > 0) {
    const hopGraphic = drawWireHops(edgeSegments, theme)
    this._viewport.addChild(hopGraphic)
  }
}
```

- [ ] **Step 5: Verify existing tests pass**

Run: `npx vitest run --reporter=verbose`

Expected: 88 pass, 5 fail (pre-existing parser failures only).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/renderer/mermaid-renderer.ts
git commit -m "feat: bus lines record wire segments for hop detection in both render paths"
```

---

### Task 5: Bus fan-out arrowheads

**Files:**
- Modify: `packages/core/src/renderer/mermaid-renderer.ts:1103-1117` (fan-out loop in `_drawBlueprintBusLines`)

- [ ] **Step 1: Add arrowhead drawing in the fan-out loop**

Inside the fan-out loop in `_drawBlueprintBusLines()`, after drawing the drop line to the target (after line 1116), add an arrowhead. The arrow direction depends on whether the last segment is a vertical drop or a horizontal jog:

```typescript
// Arrow at fan-out endpoint pointing into target
const prevPt = dropX !== tgt.x
  ? { x: dropX, y: tgt.y }    // horizontal jog: arrow points right/left
  : { x: dropX, y: busY }     // straight drop: arrow points down
const angle = Math.atan2(tgt.y - prevPt.y, tgt.x - prevPt.x)
const arrowSize = 6
busGfx.moveTo(tgt.x, tgt.y)
busGfx.lineTo(tgt.x - arrowSize * Math.cos(angle - Math.PI / 6), tgt.y - arrowSize * Math.sin(angle - Math.PI / 6))
busGfx.moveTo(tgt.x, tgt.y)
busGfx.lineTo(tgt.x - arrowSize * Math.cos(angle + Math.PI / 6), tgt.y - arrowSize * Math.sin(angle + Math.PI / 6))
```

- [ ] **Step 2: Move the stroke call after the arrows**

The arrows need to be stroked too. The existing `busGfx.stroke(...)` call (line 1119) already comes after the fan-out loop, so arrows drawn inside the loop will be included in the stroke. Verify this is the case — the stroke must be after the loop, not inside it.

- [ ] **Step 3: Verify existing tests pass**

Run: `npx vitest run --reporter=verbose`

Expected: 88 pass, 5 fail (pre-existing parser failures only).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/renderer/mermaid-renderer.ts
git commit -m "feat: bus fan-out drops draw arrowheads at target nodes"
```

---

### Task 6: Visual verification in dev harness

**Files:**
- None modified (verification only)

- [ ] **Step 1: Start dev server**

Run: `cd packages/core && npx vite --open`

- [ ] **Step 2: Switch to Blueprint philosophy**

Click the Blueprint button in the toolbar. Verify:

1. Grid background visible (dark blue with lighter grid lines)
2. Orthogonal wires with right-angle routing
3. No two wires share the same lane (no overlapping wire segments)
4. Hop arcs where wires cross (small semicircle on horizontal wire at crossing)
5. Arrowheads on bus fan-out drops pointing into target nodes
6. Hovering a node still highlights connected edges + bus lines

- [ ] **Step 3: Test with different diagrams**

Use the file selector to switch between the 4 microservice diagrams. Verify Blueprint wires look correct on each.

- [ ] **Step 4: Test focus view**

Double-click a subgraph to enter focus view. Verify wires in focus view also don't overlap and have hop arcs.

- [ ] **Step 5: Final commit with any polish**

If any visual tweaks are needed, apply and commit.
