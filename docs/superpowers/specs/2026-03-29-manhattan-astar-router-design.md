# Manhattan A* Grid Router — Design Spec

**Date:** 2026-03-29
**Status:** Approved

## Problem

The current Blueprint wire routing is a sequential greedy heuristic: each wire picks its route independently, the WireRegistry patches collisions reactively. After 3 rounds of fixes, the system remains fragile — congestion near corridors, silent give-up on exhaustion, bus span gaps.

## Solution

Replace the entire heuristic routing system with Manhattan A* on the 20px grid. Single entry/exit port per node. Merge zones for fan-in (inDegree ≥ 2), bus for fan-out (outDegree ≥ 2). Layout feedback on congestion (push rows apart, re-route).

## Architecture

```
OccupancyGrid          — 2D bitmap on 20px grid. Cells are free/occupied.
                         Built from node positions (inflated by Cc).
                         Wires mark cells as they route.

ManhattanRouter        — A* pathfinder. 4-connected grid. Bend penalty = 2.
                         Input: srcCell, tgtCell, grid.
                         Output: Cell[] path → converted to WireSegment[].
                         Returns null on no-path (CONGESTED).

BlueprintWireBuilder   — Orchestrator. For each edge in the graph:
                         1. Fan-out (outDegree ≥ 2) → bus: trunk + horizontal + drops
                         2. Fan-in (inDegree ≥ 2) → merge zone: collect + merge bus + trunk
                         3. Single edges → direct A* route
                         4. CONGESTED → push rows apart by g, rebuild grid, re-route all
                         Max 3 expansion rounds.
```

## Single Port Model

```
∀ node N (TD layout):
  exitPort  = (N.x, N.y + N.height/2)     — bottom center, snapped to grid
  entryPort = (N.x, N.y - N.height/2)     — top center, snapped to grid

1 wire in, 1 wire out. Merge/fan zones handle multiplexing.
```

## Routing Order

```
1. Build OccupancyGrid (nodes inflated by Cc = 8px)
2. Detect fan-out groups: {src | outDegree(src) ≥ 2}
3. Detect fan-in groups: {tgt | inDegree(tgt) ≥ 2}
4. Route fan-out buses:
     For each src in fan-out group:
       A* trunk from src.exitPort straight down to busY
       Horizontal bus spanning all target columns
       A* drop from bus to each target.entryPort (or merge bus if target has fan-in)
5. Route fan-in merges:
     For each tgt in fan-in group:
       mergeY = tgt.entryPort.y - g (one grid step above target)
       Horizontal merge bus at mergeY connecting all incoming wire endpoints
       Single trunk from merge bus down to tgt.entryPort
6. Route remaining single edges: A* from src.exitPort to tgt.entryPort
7. Each routed path marks grid cells as occupied before next wire routes
8. On CONGESTED:
     Identify corridor between src row and tgt row
     Push rows apart by g (20px)
     Re-snap, rebuild grid, re-route ALL wires
     Max 3 rounds
```

## Fan-Out Bus

```
outDegree(Source) ≥ 2:

    ┌────────────┐
    │   Source    │
    └─────┬──────┘
          │  exitPort (single)
          │  trunk: A* straight down to busY
    ──────┼────────  busY: horizontal, covers all drop X positions
     │    │    │
     v    v    v     drops: A* from busY to each target entryPort
```

busY = midpoint between source exitPort and nearest target entryPort, snapped to grid. If corridor is congested, A* finds a clear path.

## Fan-In Merge Zone

```
inDegree(Target) ≥ 2:

    │       │       │    incoming wires (from A* or bus drops)
    └───────┼───────┘    mergeY: horizontal bus, g above target
            │            single trunk to entryPort
      ┌─────┴─────┐
      │  Target   │
      └───────────┘
```

mergeY = `target.entryPort.y - g`. Each incoming wire routes to `(wireX, mergeY)`. Merge bus connects all arrival points horizontally. Single vertical trunk descends to entryPort.

## Layout Feedback on Congestion

```
CONGESTED detected (A* returns null):
  1. Find corridor C between the two node rows involved
  2. Push all nodes below C down by g (20px)
  3. Re-snap to grid
  4. Rebuild OccupancyGrid from new positions
  5. Re-route ALL wires from scratch
  6. Max 3 expansion rounds, then accept best-effort
```

## OccupancyGrid

```
Grid bounds: [minX - padding, minY - padding] to [maxX + padding, maxY + padding]
  padding = 5 * g (100px margin around diagram)

Cell (gx, gy) maps to world position (minX + gx * g, minY + gy * g)
Cell states: FREE | OCCUPIED

Initialization:
  For each node N:
    inflate by Cc (8px)
    mark all grid cells within inflated rect as OCCUPIED

After routing wire W:
    mark all cells on W's path as OCCUPIED
```

## Manhattan A* with Bend Penalty

```
g(n) = steps_so_far + bends_so_far * BEND_PENALTY
h(n) = manhattan_distance(n, target)  // admissible heuristic
BEND_PENALTY = 2  // strongly prefers straight runs

Neighbors: 4-connected (up, down, left, right)
Skip: OCCUPIED cells
Track: direction of arrival at each cell (to detect bends)

Returns: Cell[] from src to tgt, or null if unreachable
```

## Segment Conversion

```
Cell[] path → WireSegment[]:
  Walk the path. While direction is unchanged, extend current segment.
  On direction change: close current segment, start new one.

  Each segment has: x1, y1, x2, y2, isHorizontal, edgeId
```

## File Structure

```
packages/core/src/router/
  occupancy-grid.ts           — 2D grid, mark/query cells (~50 lines)
  manhattan-router.ts         — A* with bend penalty (~80 lines)
  blueprint-wire-builder.ts   — orchestrator: detect groups, route, merge, feedback (~150 lines)
  types.ts                    — RoutedWire, WireSegment[], RouteResult (~20 lines)

packages/core/src/router/__tests__/
  occupancy-grid.test.ts
  manhattan-router.test.ts
  blueprint-wire-builder.test.ts
```

## What Gets Deleted

```
REMOVED (replaced by router):
  WireRegistry (wire-registry.ts) — replaced by OccupancyGrid
  EdgeGraphic._drawOrthogonal ad-hoc routing — receives pre-computed segments
  _drawBlueprintBusLines heuristic — replaced by BlueprintWireBuilder
  avoidEdgeCollisions in blueprint-layout.ts — unnecessary with A*

KEPT:
  EdgeGraphic (simplified: draw pre-computed segments)
  wire-hops.ts (hop detection from segments — unchanged)
  BlueprintLayout (dagre + grid snap + overlap resolution — layout phase)
  theme.ts, fonts.ts, node-sprite.ts — unchanged
```

## Integration with Renderer

```
In _renderGraph(), the Blueprint block becomes:

  if (isBlueprint) {
    const builder = new BlueprintWireBuilder(positioned, theme)
    const result = builder.route()

    if (result.congested) {
      // Layout feedback: expand corridors, re-layout, re-render
      // Max 3 rounds
    }

    // Draw all routed wires
    for (const wire of result.wires) {
      const eg = new EdgeGraphic(wire.edge, theme, wire.segments)
      // ... add to viewport
    }

    // Hop detection from all segments
    drawWireHops(result.allSegments, theme)
  }
```

## Constants

```typescript
const GRID_SIZE = 20              // g
const COMPONENT_CLEARANCE = 8     // Cc — node inflation on grid
const BEND_PENALTY = 2            // A* bend cost multiplier
const GRID_PADDING = 5            // padding in grid steps around diagram
const MAX_EXPANSION_ROUNDS = 3    // layout feedback limit
```

## Invariants Satisfied

| Invariant | Mechanism |
|-----------|-----------|
| I1 Lane Exclusivity | Cell capacity = 1. A* skips occupied. |
| I2 Obstacle Avoidance | Nodes inflated by Cc on grid. |
| I3 Wire-to-Wire Sep | Grid step = Cw = g. Adjacent cells ≥ g apart. |
| I4 Connectivity | A* guarantees connected path or null. |
| I5 Grid Alignment | All routing on grid cells. |
| I6 Orthogonality | A* moves in 4 directions only. |
| I7 Bus Span | Bus extent from actual routed positions. |
| I8 Crossing Indication | Segments fed to existing hop detector. |
| I9 Arrow Presence | EdgeGraphic draws arrows on final segment. |
| I14 Routability | null → layout feedback → re-route. No silent failure. |
| I15 Non-Degeneracy | A* path length ≥ 1. Self-loops rejected at input. |
| I16 Bus Claim Ordering | Builder sequences: fan-out → fan-in → direct. |
