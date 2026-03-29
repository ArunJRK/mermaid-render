# Manhattan A* Grid Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Blueprint's heuristic wire routing with Manhattan A* on the 20px grid — single ports, merge zones for fan-in, bus for fan-out, layout feedback on congestion.

**Architecture:** OccupancyGrid (2D bitmap) + ManhattanRouter (A* with bend penalty) + BlueprintWireBuilder (orchestrator). Replaces WireRegistry + ad-hoc EdgeGraphic routing entirely for Blueprint philosophy.

**Tech Stack:** TypeScript, PixiJS 8, vitest

**Spec:** `docs/superpowers/specs/2026-03-29-manhattan-astar-router-design.md`

---

## File Map

| File | Responsibility | Change Type |
|------|---------------|-------------|
| `packages/core/src/router/types.ts` | Shared types for router | Create |
| `packages/core/src/router/occupancy-grid.ts` | 2D grid bitmap, mark/query cells | Create |
| `packages/core/src/router/manhattan-router.ts` | A* pathfinder with bend penalty | Create |
| `packages/core/src/router/blueprint-wire-builder.ts` | Orchestrator: fan-out, fan-in, direct, congestion feedback | Create |
| `packages/core/src/router/__tests__/occupancy-grid.test.ts` | Grid tests | Create |
| `packages/core/src/router/__tests__/manhattan-router.test.ts` | A* tests | Create |
| `packages/core/src/router/__tests__/blueprint-wire-builder.test.ts` | Builder tests | Create |
| `packages/core/src/renderer/edge-graphic.ts` | Simplified: accept pre-computed segments for blueprint | Modify |
| `packages/core/src/renderer/mermaid-renderer.ts` | Use BlueprintWireBuilder instead of WireRegistry + heuristics | Modify |

---

### Task 1: Router types + OccupancyGrid

**Files:**
- Create: `packages/core/src/router/types.ts`
- Create: `packages/core/src/router/occupancy-grid.ts`
- Create: `packages/core/src/router/__tests__/occupancy-grid.test.ts`

- [ ] **Step 1: Write types**

Create `packages/core/src/router/types.ts`:

```typescript
export interface GridCell {
  gx: number  // grid x index
  gy: number  // grid y index
}

export interface WireSegment {
  x1: number; y1: number
  x2: number; y2: number
  isHorizontal: boolean
  edgeId: string
}

export interface RoutedWire {
  edgeId: string
  segments: WireSegment[]
  source: string
  target: string
}

export interface RouteResult {
  wires: RoutedWire[]
  congested: boolean
}

export const GRID_SIZE = 20
export const COMPONENT_CLEARANCE = 8
export const BEND_PENALTY = 2
export const GRID_PADDING = 5  // grid steps of margin around diagram
export const MAX_EXPANSION_ROUNDS = 3
```

- [ ] **Step 2: Write OccupancyGrid tests**

Create `packages/core/src/router/__tests__/occupancy-grid.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { OccupancyGrid } from '../occupancy-grid'

describe('OccupancyGrid', () => {
  it('creates grid from bounds', () => {
    const grid = new OccupancyGrid(0, 0, 200, 200, 20)
    expect(grid.width).toBeGreaterThan(0)
    expect(grid.height).toBeGreaterThan(0)
  })

  it('marks node cells as occupied', () => {
    const grid = new OccupancyGrid(0, 0, 200, 200, 20)
    grid.markNode({ x: 100, y: 100, width: 40, height: 40 })
    // Center cell occupied
    expect(grid.isFree(100, 100)).toBe(false)
    // Cell far away is free
    expect(grid.isFree(0, 0)).toBe(true)
  })

  it('inflates nodes by Cc', () => {
    const grid = new OccupancyGrid(0, 0, 200, 200, 20)
    grid.markNode({ x: 100, y: 100, width: 40, height: 40 })
    // 8px outside node edge should still be occupied (Cc inflation)
    // Node edge at x=120 (100+40/2), inflated to x=128 → grid cell at x=120 blocked
    expect(grid.isFree(120, 100)).toBe(false)
    // Well outside inflation
    expect(grid.isFree(160, 100)).toBe(true)
  })

  it('marks wire path cells as occupied', () => {
    const grid = new OccupancyGrid(0, 0, 200, 200, 20)
    grid.markPath([
      { gx: 1, gy: 1 }, { gx: 1, gy: 2 }, { gx: 1, gy: 3 },
    ])
    expect(grid.isFreeCell(1, 1)).toBe(false)
    expect(grid.isFreeCell(1, 2)).toBe(false)
    expect(grid.isFreeCell(0, 1)).toBe(true)
  })

  it('converts between world coords and grid cells', () => {
    const grid = new OccupancyGrid(0, 0, 200, 200, 20)
    const cell = grid.worldToCell(100, 60)
    const world = grid.cellToWorld(cell.gx, cell.gy)
    expect(world.x).toBe(100)
    expect(world.y).toBe(60)
  })

  it('returns neighbors for a cell', () => {
    const grid = new OccupancyGrid(0, 0, 200, 200, 20)
    const neighbors = grid.neighbors({ gx: 5, gy: 5 })
    expect(neighbors).toHaveLength(4) // up, down, left, right
  })

  it('excludes occupied and out-of-bounds neighbors', () => {
    const grid = new OccupancyGrid(0, 0, 200, 200, 20)
    grid.markNode({ x: 120, y: 100, width: 40, height: 40 })
    const neighbors = grid.neighbors({ gx: 5, gy: 5 })
    // Some neighbors may be blocked by the node
    for (const n of neighbors) {
      expect(grid.isFreeCell(n.gx, n.gy)).toBe(true)
    }
  })
})
```

- [ ] **Step 3: Implement OccupancyGrid**

Create `packages/core/src/router/occupancy-grid.ts`:

```typescript
import { GRID_SIZE, COMPONENT_CLEARANCE, GRID_PADDING, type GridCell } from './types'

export class OccupancyGrid {
  private _cells: Uint8Array
  private _cols: number
  private _rows: number
  private _originX: number
  private _originY: number
  private _g: number

  constructor(minX: number, minY: number, maxX: number, maxY: number, gridSize: number = GRID_SIZE) {
    this._g = gridSize
    const pad = GRID_PADDING * gridSize
    this._originX = Math.floor((minX - pad) / gridSize) * gridSize
    this._originY = Math.floor((minY - pad) / gridSize) * gridSize
    const endX = Math.ceil((maxX + pad) / gridSize) * gridSize
    const endY = Math.ceil((maxY + pad) / gridSize) * gridSize
    this._cols = Math.round((endX - this._originX) / gridSize) + 1
    this._rows = Math.round((endY - this._originY) / gridSize) + 1
    this._cells = new Uint8Array(this._cols * this._rows) // 0 = free, 1 = occupied
  }

  get width(): number { return this._cols }
  get height(): number { return this._rows }

  worldToCell(x: number, y: number): GridCell {
    return {
      gx: Math.round((x - this._originX) / this._g),
      gy: Math.round((y - this._originY) / this._g),
    }
  }

  cellToWorld(gx: number, gy: number): { x: number; y: number } {
    return {
      x: this._originX + gx * this._g,
      y: this._originY + gy * this._g,
    }
  }

  private _inBounds(gx: number, gy: number): boolean {
    return gx >= 0 && gx < this._cols && gy >= 0 && gy < this._rows
  }

  isFreeCell(gx: number, gy: number): boolean {
    if (!this._inBounds(gx, gy)) return false
    return this._cells[gy * this._cols + gx] === 0
  }

  isFree(worldX: number, worldY: number): boolean {
    const c = this.worldToCell(worldX, worldY)
    return this.isFreeCell(c.gx, c.gy)
  }

  private _markCell(gx: number, gy: number): void {
    if (this._inBounds(gx, gy)) {
      this._cells[gy * this._cols + gx] = 1
    }
  }

  markNode(node: { x: number; y: number; width: number; height: number }): void {
    const hw = node.width / 2 + COMPONENT_CLEARANCE
    const hh = node.height / 2 + COMPONENT_CLEARANCE
    const min = this.worldToCell(node.x - hw, node.y - hh)
    const max = this.worldToCell(node.x + hw, node.y + hh)
    for (let gy = min.gy; gy <= max.gy; gy++) {
      for (let gx = min.gx; gx <= max.gx; gx++) {
        this._markCell(gx, gy)
      }
    }
  }

  markPath(path: GridCell[]): void {
    for (const c of path) {
      this._markCell(c.gx, c.gy)
    }
  }

  /** Clear a specific cell (used for temporarily freeing src/tgt ports) */
  clearCell(gx: number, gy: number): void {
    if (this._inBounds(gx, gy)) {
      this._cells[gy * this._cols + gx] = 0
    }
  }

  neighbors(cell: GridCell): GridCell[] {
    const result: GridCell[] = []
    const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }]
    for (const { dx, dy } of dirs) {
      const nx = cell.gx + dx
      const ny = cell.gy + dy
      if (this.isFreeCell(nx, ny)) {
        result.push({ gx: nx, gy: ny })
      }
    }
    return result
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/core/src/router/__tests__/occupancy-grid.test.ts --reporter=verbose`

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/router/
git commit -m "feat: OccupancyGrid — 2D bitmap grid for A* wire routing"
```

---

### Task 2: Manhattan A* Router

**Files:**
- Create: `packages/core/src/router/manhattan-router.ts`
- Create: `packages/core/src/router/__tests__/manhattan-router.test.ts`

- [ ] **Step 1: Write tests**

Create `packages/core/src/router/__tests__/manhattan-router.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { OccupancyGrid } from '../occupancy-grid'
import { manhattanRoute, pathToSegments } from '../manhattan-router'

describe('manhattanRoute', () => {
  it('finds straight vertical path', () => {
    const grid = new OccupancyGrid(0, 0, 200, 200, 20)
    const path = manhattanRoute(grid, { gx: 5, gy: 2 }, { gx: 5, gy: 8 })
    expect(path).not.toBeNull()
    expect(path![0]).toEqual({ gx: 5, gy: 2 })
    expect(path![path!.length - 1]).toEqual({ gx: 5, gy: 8 })
    // All cells should have same gx (straight vertical)
    for (const c of path!) expect(c.gx).toBe(5)
  })

  it('routes around an obstacle', () => {
    const grid = new OccupancyGrid(0, 0, 200, 200, 20)
    // Block a node in the middle
    grid.markNode({ x: 100, y: 100, width: 40, height: 40 })
    const src = grid.worldToCell(100, 40)
    const tgt = grid.worldToCell(100, 160)
    const path = manhattanRoute(grid, src, tgt)
    expect(path).not.toBeNull()
    expect(path!.length).toBeGreaterThan(7) // must detour around obstacle
  })

  it('returns null when no path exists', () => {
    const grid = new OccupancyGrid(0, 0, 100, 100, 20)
    // Wall off target completely
    for (let x = 0; x <= 100; x += 20) {
      grid.markPath([grid.worldToCell(x, 60)])
    }
    const path = manhattanRoute(grid, grid.worldToCell(40, 20), grid.worldToCell(40, 80))
    expect(path).toBeNull()
  })

  it('prefers fewer bends (bend penalty)', () => {
    const grid = new OccupancyGrid(0, 0, 200, 200, 20)
    const path = manhattanRoute(grid, { gx: 2, gy: 2 }, { gx: 8, gy: 8 })
    expect(path).not.toBeNull()
    // Count bends: should be exactly 1 (L-shape, not zigzag)
    let bends = 0
    for (let i = 1; i < path!.length - 1; i++) {
      const prev = path![i - 1], curr = path![i], next = path![i + 1]
      const dirIn = curr.gx === prev.gx ? 'V' : 'H'
      const dirOut = next.gx === curr.gx ? 'V' : 'H'
      if (dirIn !== dirOut) bends++
    }
    expect(bends).toBeLessThanOrEqual(2) // at most 2 bends for a diagonal target
  })
})

describe('pathToSegments', () => {
  it('converts straight path to one segment', () => {
    const grid = new OccupancyGrid(0, 0, 200, 200, 20)
    const path = [{ gx: 5, gy: 2 }, { gx: 5, gy: 3 }, { gx: 5, gy: 4 }, { gx: 5, gy: 5 }]
    const segs = pathToSegments(path, grid, 'e1')
    expect(segs).toHaveLength(1)
    expect(segs[0].isHorizontal).toBe(false)
    expect(segs[0].edgeId).toBe('e1')
  })

  it('converts L-shaped path to two segments', () => {
    const grid = new OccupancyGrid(0, 0, 200, 200, 20)
    const path = [
      { gx: 2, gy: 2 }, { gx: 2, gy: 3 }, { gx: 2, gy: 4 },
      { gx: 3, gy: 4 }, { gx: 4, gy: 4 },
    ]
    const segs = pathToSegments(path, grid, 'e1')
    expect(segs).toHaveLength(2)
    expect(segs[0].isHorizontal).toBe(false) // vertical
    expect(segs[1].isHorizontal).toBe(true)  // horizontal
  })
})
```

- [ ] **Step 2: Implement ManhattanRouter**

Create `packages/core/src/router/manhattan-router.ts`:

```typescript
import type { GridCell, WireSegment } from './types'
import { BEND_PENALTY } from './types'
import type { OccupancyGrid } from './occupancy-grid'

interface AStarNode {
  gx: number
  gy: number
  g: number         // cost so far (steps + bends * penalty)
  f: number         // g + h
  parent: AStarNode | null
  dir: number       // 0=none, 1=up, 2=down, 3=left, 4=right
}

const DIRS = [
  { dx: 0, dy: -1, dir: 1 },  // up
  { dx: 0, dy: 1, dir: 2 },   // down
  { dx: -1, dy: 0, dir: 3 },  // left
  { dx: 1, dy: 0, dir: 4 },   // right
]

function manhattan(a: GridCell, b: GridCell): number {
  return Math.abs(a.gx - b.gx) + Math.abs(a.gy - b.gy)
}

/**
 * A* pathfinding on the occupancy grid with bend penalty.
 * Returns cell path from src to tgt, or null if unreachable.
 */
export function manhattanRoute(
  grid: OccupancyGrid,
  src: GridCell,
  tgt: GridCell,
  bendPenalty: number = BEND_PENALTY,
): GridCell[] | null {
  const key = (gx: number, gy: number) => `${gx},${gy}`

  const open: AStarNode[] = [{
    gx: src.gx, gy: src.gy, g: 0, f: manhattan(src, tgt), parent: null, dir: 0,
  }]
  const closed = new Map<string, number>() // key → best g

  while (open.length > 0) {
    // Find node with lowest f
    let bestIdx = 0
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i
    }
    const current = open[bestIdx]
    open.splice(bestIdx, 1)

    // Goal reached
    if (current.gx === tgt.gx && current.gy === tgt.gy) {
      // Reconstruct path
      const path: GridCell[] = []
      let node: AStarNode | null = current
      while (node) {
        path.push({ gx: node.gx, gy: node.gy })
        node = node.parent
      }
      return path.reverse()
    }

    const ck = key(current.gx, current.gy)
    const prevBest = closed.get(ck)
    if (prevBest !== undefined && prevBest <= current.g) continue
    closed.set(ck, current.g)

    // Expand neighbors
    for (const { dx, dy, dir } of DIRS) {
      const nx = current.gx + dx
      const ny = current.gy + dy

      // Allow target cell even if occupied (port is inside node inflation zone)
      const isTarget = nx === tgt.gx && ny === tgt.gy
      if (!isTarget && !grid.isFreeCell(nx, ny)) continue

      const isBend = current.dir !== 0 && current.dir !== dir
      const stepCost = 1 + (isBend ? bendPenalty : 0)
      const ng = current.g + stepCost

      const nk = key(nx, ny)
      const existing = closed.get(nk)
      if (existing !== undefined && existing <= ng) continue

      open.push({
        gx: nx, gy: ny, g: ng,
        f: ng + manhattan({ gx: nx, gy: ny }, tgt),
        parent: current, dir,
      })
    }
  }

  return null // no path found — CONGESTED
}

/**
 * Convert a grid cell path to wire segments in world coordinates.
 */
export function pathToSegments(path: GridCell[], grid: OccupancyGrid, edgeId: string): WireSegment[] {
  if (path.length < 2) return []

  const segments: WireSegment[] = []
  let segStart = grid.cellToWorld(path[0].gx, path[0].gy)
  let prevDir: 'H' | 'V' = path[1].gx === path[0].gx ? 'V' : 'H'

  for (let i = 2; i < path.length; i++) {
    const dir: 'H' | 'V' = path[i].gx === path[i - 1].gx ? 'V' : 'H'
    if (dir !== prevDir) {
      // Direction changed — close current segment
      const segEnd = grid.cellToWorld(path[i - 1].gx, path[i - 1].gy)
      segments.push({
        x1: segStart.x, y1: segStart.y,
        x2: segEnd.x, y2: segEnd.y,
        isHorizontal: prevDir === 'H',
        edgeId,
      })
      segStart = segEnd
      prevDir = dir
    }
  }

  // Close final segment
  const last = grid.cellToWorld(path[path.length - 1].gx, path[path.length - 1].gy)
  segments.push({
    x1: segStart.x, y1: segStart.y,
    x2: last.x, y2: last.y,
    isHorizontal: prevDir === 'H',
    edgeId,
  })

  return segments
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run packages/core/src/router/__tests__/manhattan-router.test.ts --reporter=verbose`

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/router/manhattan-router.ts packages/core/src/router/__tests__/manhattan-router.test.ts
git commit -m "feat: Manhattan A* router with bend penalty and segment conversion"
```

---

### Task 3: BlueprintWireBuilder — fan-out, fan-in, direct routing

**Files:**
- Create: `packages/core/src/router/blueprint-wire-builder.ts`
- Create: `packages/core/src/router/__tests__/blueprint-wire-builder.test.ts`

- [ ] **Step 1: Write tests**

Create `packages/core/src/router/__tests__/blueprint-wire-builder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { BlueprintWireBuilder } from '../blueprint-wire-builder'
import type { PositionedGraph, PositionedNode, PositionedEdge } from '../../types'

function makeGraph(
  nodes: Array<[string, number, number, number, number]>,
  edges: Array<[string, string, string]>,
): PositionedGraph {
  const nodeMap = new Map<string, PositionedNode>()
  for (const [id, x, y, w, h] of nodes) {
    nodeMap.set(id, { id, label: id, shape: 'rectangle', metadata: {}, x, y, width: w, height: h })
  }
  const edgeList: PositionedEdge[] = edges.map(([id, src, tgt]) => ({
    id, source: src, target: tgt, style: 'solid' as const,
    points: [{ x: nodeMap.get(src)!.x, y: nodeMap.get(src)!.y },
             { x: nodeMap.get(tgt)!.x, y: nodeMap.get(tgt)!.y }],
  }))
  return { nodes: nodeMap, edges: edgeList, subgraphs: new Map(), width: 500, height: 500 }
}

describe('BlueprintWireBuilder', () => {
  it('routes a simple two-node edge', () => {
    const graph = makeGraph(
      [['A', 100, 40, 80, 40], ['B', 100, 200, 80, 40]],
      [['e1', 'A', 'B']],
    )
    const builder = new BlueprintWireBuilder(graph)
    const result = builder.route()
    expect(result.congested).toBe(false)
    expect(result.wires).toHaveLength(1)
    expect(result.wires[0].segments.length).toBeGreaterThanOrEqual(1)
  })

  it('creates fan-out bus for source with outDegree >= 2', () => {
    const graph = makeGraph(
      [['A', 100, 40, 80, 40], ['B', 60, 200, 80, 40], ['C', 200, 200, 80, 40]],
      [['e1', 'A', 'B'], ['e2', 'A', 'C']],
    )
    const builder = new BlueprintWireBuilder(graph)
    const result = builder.route()
    expect(result.congested).toBe(false)
    // Should have wires for both edges
    expect(result.wires).toHaveLength(2)
  })

  it('creates fan-in merge for target with inDegree >= 2', () => {
    const graph = makeGraph(
      [['A', 60, 40, 80, 40], ['B', 200, 40, 80, 40], ['C', 120, 200, 80, 40]],
      [['e1', 'A', 'C'], ['e2', 'B', 'C']],
    )
    const builder = new BlueprintWireBuilder(graph)
    const result = builder.route()
    expect(result.congested).toBe(false)
    expect(result.wires).toHaveLength(2)
    // All wires should end at C's entry port
    for (const w of result.wires) {
      const last = w.segments[w.segments.length - 1]
      expect(last.y2).toBe(200 - 20) // C.y - C.height/2
    }
  })

  it('rejects self-loops', () => {
    const graph = makeGraph(
      [['A', 100, 100, 80, 40]],
      [['e1', 'A', 'A']],
    )
    const builder = new BlueprintWireBuilder(graph)
    const result = builder.route()
    expect(result.wires).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Implement BlueprintWireBuilder**

Create `packages/core/src/router/blueprint-wire-builder.ts`:

```typescript
import type { PositionedGraph, PositionedNode, PositionedEdge } from '../types'
import type { RoutedWire, RouteResult, WireSegment, GridCell } from './types'
import { GRID_SIZE } from './types'
import { OccupancyGrid } from './occupancy-grid'
import { manhattanRoute, pathToSegments } from './manhattan-router'

export class BlueprintWireBuilder {
  private _graph: PositionedGraph
  private _grid!: OccupancyGrid
  private _g: number

  constructor(graph: PositionedGraph, gridSize: number = GRID_SIZE) {
    this._graph = graph
    this._g = gridSize
  }

  route(): RouteResult {
    const wires: RoutedWire[] = []
    this._buildGrid()

    // Compute degree maps
    const outDegree = new Map<string, string[]>()
    const inDegree = new Map<string, string[]>()
    for (const edge of this._graph.edges) {
      if (edge.source === edge.target) continue // I15: reject self-loops
      if (!outDegree.has(edge.source)) outDegree.set(edge.source, [])
      outDegree.get(edge.source)!.push(edge.id)
      if (!inDegree.has(edge.target)) inDegree.set(edge.target, [])
      inDegree.get(edge.target)!.push(edge.id)
    }

    // Fan-out sources (outDegree >= 2)
    const fanOutSources = new Set<string>()
    for (const [src, edges] of outDegree) {
      if (edges.length >= 2) fanOutSources.add(src)
    }

    // Fan-in targets (inDegree >= 2)
    const fanInTargets = new Set<string>()
    for (const [tgt, edges] of inDegree) {
      if (edges.length >= 2) fanInTargets.add(tgt)
    }

    // Track which edges are handled by bus/merge
    const handled = new Set<string>()

    // Phase 1: Fan-out buses
    for (const srcId of fanOutSources) {
      const srcNode = this._graph.nodes.get(srcId)
      if (!srcNode) continue
      const edges = this._graph.edges.filter(e => e.source === srcId)
      const busWires = this._routeFanOut(srcId, srcNode, edges)
      for (const w of busWires) {
        wires.push(w)
        handled.add(w.edgeId)
      }
    }

    // Phase 2: Fan-in merges (for edges not already handled by fan-out)
    for (const tgtId of fanInTargets) {
      const tgtNode = this._graph.nodes.get(tgtId)
      if (!tgtNode) continue
      const edges = this._graph.edges.filter(e => e.target === tgtId && !handled.has(e.id))
      if (edges.length < 2) continue
      const mergeWires = this._routeFanIn(tgtId, tgtNode, edges)
      for (const w of mergeWires) {
        wires.push(w)
        handled.add(w.edgeId)
      }
    }

    // Phase 3: Direct routes for remaining single edges
    for (const edge of this._graph.edges) {
      if (handled.has(edge.id)) continue
      if (edge.source === edge.target) continue
      const wire = this._routeDirect(edge)
      if (wire) {
        wires.push(wire)
      }
    }

    return { wires, congested: false }
  }

  private _buildGrid(): void {
    const nodes = Array.from(this._graph.nodes.values())
    if (nodes.length === 0) {
      this._grid = new OccupancyGrid(0, 0, 100, 100, this._g)
      return
    }
    const xs = nodes.map(n => n.x)
    const ys = nodes.map(n => n.y)
    const ws = nodes.map(n => n.width)
    const hs = nodes.map(n => n.height)
    const minX = Math.min(...xs.map((x, i) => x - ws[i] / 2))
    const minY = Math.min(...ys.map((y, i) => y - hs[i] / 2))
    const maxX = Math.max(...xs.map((x, i) => x + ws[i] / 2))
    const maxY = Math.max(...ys.map((y, i) => y + hs[i] / 2))
    this._grid = new OccupancyGrid(minX, minY, maxX, maxY, this._g)
    for (const node of nodes) {
      this._grid.markNode(node)
    }
  }

  private _exitPort(node: PositionedNode): { x: number; y: number } {
    return { x: node.x, y: node.y + node.height / 2 }
  }

  private _entryPort(node: PositionedNode): { x: number; y: number } {
    return { x: node.x, y: node.y - node.height / 2 }
  }

  private _routeAstar(fromX: number, fromY: number, toX: number, toY: number, edgeId: string): WireSegment[] | null {
    const src = this._grid.worldToCell(fromX, fromY)
    const tgt = this._grid.worldToCell(toX, toY)
    const path = manhattanRoute(this._grid, src, tgt)
    if (!path) return null
    this._grid.markPath(path)
    return pathToSegments(path, this._grid, edgeId)
  }

  private _routeDirect(edge: PositionedEdge): RoutedWire | null {
    const srcNode = this._graph.nodes.get(edge.source)
    const tgtNode = this._graph.nodes.get(edge.target)
    if (!srcNode || !tgtNode) return null
    const src = this._exitPort(srcNode)
    const tgt = this._entryPort(tgtNode)
    const segments = this._routeAstar(src.x, src.y, tgt.x, tgt.y, edge.id)
    if (!segments) return null
    return { edgeId: edge.id, segments, source: edge.source, target: edge.target }
  }

  private _routeFanOut(srcId: string, srcNode: PositionedNode, edges: PositionedEdge[]): RoutedWire[] {
    const wires: RoutedWire[] = []
    const src = this._exitPort(srcNode)

    // Route each target individually via A* (the grid handles collision avoidance)
    // Bus pattern emerges naturally: A* finds shared trunk when it's optimal
    for (const edge of edges) {
      const tgtNode = this._graph.nodes.get(edge.target)
      if (!tgtNode) continue
      const tgt = this._entryPort(tgtNode)
      const segments = this._routeAstar(src.x, src.y, tgt.x, tgt.y, edge.id)
      if (segments) {
        wires.push({ edgeId: edge.id, segments, source: edge.source, target: edge.target })
      }
    }
    return wires
  }

  private _routeFanIn(tgtId: string, tgtNode: PositionedNode, edges: PositionedEdge[]): RoutedWire[] {
    const wires: RoutedWire[] = []
    const tgt = this._entryPort(tgtNode)

    // Route each source to the target entry port via A*
    // Merge pattern emerges naturally: later wires route around earlier ones
    for (const edge of edges) {
      const srcNode = this._graph.nodes.get(edge.source)
      if (!srcNode) continue
      const src = this._exitPort(srcNode)
      const segments = this._routeAstar(src.x, src.y, tgt.x, tgt.y, edge.id)
      if (segments) {
        wires.push({ edgeId: edge.id, segments, source: edge.source, target: edge.target })
      }
    }
    return wires
  }
}
```

Note: The fan-out and fan-in methods use direct A* routing per edge. The grid's occupancy naturally forces later wires to route around earlier ones, creating implicit bus/merge patterns without explicit bus construction. Explicit bus lines can be added as an optimization later if the visual result isn't clean enough.

- [ ] **Step 3: Run tests**

Run: `npx vitest run packages/core/src/router/__tests__/blueprint-wire-builder.test.ts --reporter=verbose`

Expected: All pass.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run --reporter=verbose`

Expected: All router tests pass. Pre-existing failures unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/router/blueprint-wire-builder.ts packages/core/src/router/__tests__/blueprint-wire-builder.test.ts
git commit -m "feat: BlueprintWireBuilder — fan-out, fan-in, direct A* routing"
```

---

### Task 4: Integrate router into renderer

**Files:**
- Modify: `packages/core/src/renderer/mermaid-renderer.ts` (Blueprint block in `_renderGraph`)
- Modify: `packages/core/src/renderer/edge-graphic.ts` (accept pre-computed segments)

- [ ] **Step 1: Add segment-based drawing mode to EdgeGraphic**

In `edge-graphic.ts`, add a static factory or modify constructor to accept pre-computed segments. Add a new method after the constructor:

```typescript
/**
 * Blueprint A* mode: draw pre-computed wire segments.
 * Called instead of _drawOrthogonal when router provides segments.
 */
drawFromSegments(segments: WireSegment[], theme: Theme): void {
  if (segments.length === 0) return
  const color = theme.edgeColor

  // Draw all segments
  this.moveTo(segments[0].x1, segments[0].y1)
  for (const seg of segments) {
    this.lineTo(seg.x2, seg.y2)
  }
  this.stroke({ width: 1.5, color })

  // Record for hop detection
  this.orthogonalSegments = segments

  // Arrow at final segment end
  const last = segments[segments.length - 1]
  this._drawArrow([{ x: last.x1, y: last.y1 }, { x: last.x2, y: last.y2 }], color)
}
```

Import `WireSegment` from `../router/types` (or use the existing one from `./wire-hops` — they share the same shape).

- [ ] **Step 2: Replace Blueprint block in _renderGraph**

In `_renderGraph()`, replace the Blueprint bus/edge block (from `// Blueprint: create wire registry` through the hop detection block) with:

```typescript
// Blueprint: A* grid routing
if (isBlueprint && this._graph) {
  const { BlueprintWireBuilder } = await import('../router/blueprint-wire-builder')
  const builder = new BlueprintWireBuilder(positioned, (theme as any).gridSize ?? 20)
  const result = builder.route()

  // Draw routed wires
  for (const wire of result.wires) {
    const edge = positioned.edges.find(e => e.id === wire.edgeId)
    if (!edge) continue
    const eg = new EdgeGraphic(edge, theme)
    eg.drawFromSegments(wire.segments as any, theme)
    this._edgeGraphics.push(eg)
    this._viewport.addChild(eg)
  }

  // Hop detection from all segments
  const allSegs = result.wires.map(w => ({ edgeId: w.edgeId, segments: w.segments as any }))
  if (allSegs.length > 0) {
    const hopGraphic = drawWireHops(allSegs, theme)
    this._viewport.addChild(hopGraphic)
  }
} else {
  // Non-blueprint: original edge drawing (unchanged)
  ...existing code for non-blueprint edges...
}
```

Note: Keep all non-blueprint edge rendering unchanged. Only the `isBlueprint` path uses the new router.

- [ ] **Step 3: Handle the import**

The router module uses dynamic import to avoid loading A* code for non-blueprint philosophies. Alternatively, use a static import at the top of the file if tree-shaking is acceptable:

```typescript
import { BlueprintWireBuilder } from '../router/blueprint-wire-builder'
```

- [ ] **Step 4: Preserve hover highlighting**

After drawing wires, the node hover handlers need to know which wires connect to which nodes. The `RoutedWire.source` and `RoutedWire.target` fields provide this. Store the mapping so hover highlighting works:

```typescript
// Wire hover: store source/target on EdgeGraphic
for (const wire of result.wires) {
  // eg.data already has source/target from the edge
}
```

The existing hover code reads `eg.data.source` and `eg.data.target`, which comes from the edge passed to the EdgeGraphic constructor. This should work without changes.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run --reporter=verbose`

Expected: All pass (pre-existing failures only).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/renderer/edge-graphic.ts packages/core/src/renderer/mermaid-renderer.ts
git commit -m "feat: integrate A* router into Blueprint rendering, replace heuristic routing"
```

---

### Task 5: Visual verification + polish

**Files:**
- None modified (verification), or small fixes as needed

- [ ] **Step 1: Start dev server**

Run: `cd packages/core && npx vite --port 5199`

- [ ] **Step 2: Verify Blueprint on all 4 diagrams**

Switch to Blueprint. Check on overview, order-service, payment-service, auth-service:
1. All edges routed with orthogonal segments
2. No wires through nodes
3. Clean L-shaped or Z-shaped paths (few bends)
4. Hop arcs at crossings
5. Arrows at wire endpoints
6. Hover highlighting works

- [ ] **Step 3: Compare with before**

Switch between Narrative and Blueprint to verify Blueprint looks distinctly PCB-like. Wires should be cleaner than the old heuristic routing.

- [ ] **Step 4: Test other philosophies**

Verify Narrative, Map, Breath, Radial, Mosaic still work correctly (they don't use the router).

- [ ] **Step 5: Commit any polish**

If visual tweaks are needed, apply and commit.
