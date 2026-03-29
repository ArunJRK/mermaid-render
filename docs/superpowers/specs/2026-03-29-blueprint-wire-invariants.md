# Blueprint Wire Routing — Formal Invariants

## Ontology

```
Wire        := ordered sequence of orthogonal Segments connecting srcPort → tgtPort
Segment     := (p1: Point, p2: Point) where p1.x = p2.x ∨ p1.y = p2.y
Lane        := grid-aligned axis-parallel line at coordinate k (vertical: x=k, horizontal: y=k)
Track       := a specific lane within a Channel, assigned to one wire
Port        := attachment point on node boundary (bottom-center for src, top-center for tgt in TD)
Channel     := horizontal corridor between two rows of obstacles, containing N tracks
Trunk       := vertical lane carrying bus source → bus horizontal
Drop        := vertical lane carrying bus horizontal → target port
BusLine     := Trunk + Channel + {Drop₁..Dropₙ} for fan-out from one source to n targets
Node        := axis-aligned rectangle (cx, cy, w, h) on grid
Subgraph    := axis-aligned rectangle enclosing a set of nodes
Obstacle    := any rectangle that wires must not penetrate (node OR subgraph border)
Grid        := discrete coordinate system, step = g (20px)
Registry    := global occupancy map: Lane → Set<Range>
Corridor    := vertical strip between two columns of obstacles
```

## Clearance Model

PCB convention: wire-to-wire and wire-to-component clearances are distinct.

```
Cw := wire-to-wire clearance     = g (20px, one grid step)
Cc := wire-to-component clearance = 8px

Cw enforced by: grid alignment + lane exclusivity (I1 + I4)
  Two parallel wires on adjacent grid lanes are exactly g apart.
  Lane exclusivity prevents sharing. Therefore min separation = g.

Cc enforced by: obstacle inflation (I2)
  Each obstacle inflated by Cc before registering in the occupancy map.
  No wire can occupy a lane within Cc of any node or subgraph border.

Cw > Cc is expected and correct:
  Grid step (20px) > component clearance (8px).
  Wires are spaced further from each other than from components.
  This matches PCB practice where trace pitch > pad clearance.
```

## Current System — How It Works

```
Layout phase:
  dagre → snap(nodes, grid) → resolveOverlaps(nodes) → rebuildEdgePoints

Render phase:
  registerNodeObstacles(registry, nodes)
  drawBusLines(registry)     // claims trunk + channel + drops
  drawEdges(registry)        // claims vertical + channel + vertical per edge
  drawHops(allSegments)      // semicircle at H∩V crossings
```

## Violations Found (mapped to screenshot artifacts)

### V1: Subgraphs invisible to registry

```
Obstacle set = { nodes }
Missing:       { subgraph borders }
```

**Effect:** Wires route freely through subgraph rectangles. Visible as wires cutting through "Warehouse & Inventory", "Payment Processing", "Core Services" borders.

**Fix:** Register subgraph borders as obstacles with Cc inflation.

### V2: Trunk horizontal jog not claimed

```
Bus trunk draws: srcNode.x → trunkX at srcPortY (horizontal jog)
Registry claims: claimVertical(trunkX, srcPortY, busY)  // trunk vertical only
Missing claim:   claimHorizontal(srcPortY, srcNode.x, trunkX)  // trunk jog
```

**Effect:** Other wires can occupy the same horizontal lane as the trunk jog. Creates overlapping horizontal segments at source port Y.

**Fix:** Add `wireReg.claimHorizontal(srcPortY, srcNode.x, trunkX)` when `trunkX !== srcNode.x`.

### V3: Drop horizontal jog endpoint not at target port

Wire terminates at the node boundary correctly. No violation — verified.

### V4: Bus channel span computed before drops assigned

```
minBusX = min(trunkX, ...targets.map(t => t.x))
maxBusX = max(trunkX, ...targets.map(t => t.x))
```

`t.x` = target node center X. But `dropX` may be offset by registry. Bus may not extend to reach offset drops.

**Effect:** Horizontal bus too short — drop connects to a point not on the bus. Visual gap.

**Fix:** Compute bus extent AFTER drop positions are known:

```
const dropXs = targets.map(tgt => wireReg.findFreeVertical(tgt.x, busY, tgt.y))
minBusX = min(trunkX, ...dropXs)
maxBusX = max(trunkX, ...dropXs)
```

### V5: Clearance margins inconsistent

```
registerNodeObstacles:  hw = node.width/2 + 8     (Cc = 8)
_drawOrthogonal:        hw = node.width/2 + 4     (wrong)
_drawOrthogonal:        hw = node.width/2 + 6     (wrong)
_horizontalHitsNode:    hw = node.width/2 + 8     (Cc = 8, correct)
_resolveOverlaps:       margin = GRID_SIZE * 2     (node-to-node, different concern)
```

**Effect:** Fallback paths use smaller padding than registry. Inconsistent clearance.

**Fix:** All wire↔component checks use `Cc = 8`. The overlap resolver uses its own node-to-node margin (40px) — that is a layout concern, not a routing concern. No conflict.

### V6: Port attachment assumes TD only

Hardcoded bottom-exit source, top-enter target. Lower priority — all current diagrams are TD.

### V7: No channel capacity awareness

```
Current: each wire independently calls findFreeHorizontal(baseMid, ...)
         registry nudges wires apart reactively (±gridSize per attempt)
Missing: pre-computation of how many wires pass through each corridor
         proactive track assignment within corridors
```

**Effect:** Congestion in corridors between dense node rows. Wires bunch near the corridor midpoint instead of spreading evenly across available tracks.

**Fix:** Two-phase routing: global (assign to channel) → detailed (assign to track within channel).

---

## Full Invariant Set

### I1: Lane Exclusivity

```
∀ segment S₁, S₂ where S₁.edgeId ≠ S₂.edgeId:
  S₁ ∥ S₂ ⟹ ¬overlap(S₁, S₂)

Where:
  S₁ ∥ S₂ := both horizontal ∨ both vertical
  overlap(H₁, H₂) := H₁.y = H₂.y ∧ rangeOverlap(H₁.xRange, H₂.xRange)
  overlap(V₁, V₂) := V₁.x = V₂.x ∧ rangeOverlap(V₁.yRange, V₂.yRange)
  rangeOverlap([a,b], [c,d]) := max(a,c) < min(b,d)
```

**Guarantees:** No two wires from different edges share the same lane over any overlapping range.

**Enforced by:** Registry `claim*` + `findFree*` cycle. Every segment claimed immediately after allocation.

### I2: Obstacle Avoidance (tiered clearance)

```
∀ segment S, ∀ obstacle O ∈ {nodes ∪ subgraphBorders}:
  ¬intersects(S, O.inflated(Cc))

Where:
  Cc = COMPONENT_CLEARANCE (8px)
  O.inflated(c) := rect(O.cx, O.cy, O.w + 2c, O.h + 2c)
  intersects(S, R) := Liang-Barsky(S.p1, S.p2, R)
```

**Guarantees:** No wire penetrates any node or subgraph border. Cc is the wire-to-component clearance — smaller than wire-to-wire (Cw = g) by design.

**Enforced by:** `registerNodeObstacles` + `registerSubgraphObstacles` blocking lanes through inflated bounds.

### I3: Wire-to-Wire Separation

```
∀ parallel segments S₁, S₂ on adjacent lanes where S₁.edgeId ≠ S₂.edgeId:
  distance(S₁, S₂) ≥ Cw

Where:
  Cw = g (gridSize, 20px)
  distance for horizontal: |S₁.y - S₂.y|
  distance for vertical:   |S₁.x - S₂.x|
```

**Guarantees:** Parallel wires maintain minimum separation Cw = g. Wires are never closer than one grid step.

**Enforced by:** Grid alignment (I5) + lane exclusivity (I1). Two distinct grid lanes differ by ≥ g. Combined with I1, parallel wires on the same lane are forbidden, so minimum distance = g.

### I4: Connectivity

```
∀ wire W from src → tgt:
  W.segments form a connected path
  W.segments[0].p1 = srcPort
  W.segments[-1].p2 = tgtPort
  ∀ adjacent (Sᵢ, Sᵢ₊₁): Sᵢ.p2 = Sᵢ₊₁.p1
```

**Guarantees:** No gaps. Every wire is a continuous path from source port to target port.

**Enforced by:** Drawing code emits connected segments. Bus channel extent covers all drop positions (I7).

### I5: Grid Alignment

```
∀ segment S (excluding port stubs):
  S.isHorizontal ⟹ S.y ≡ 0 (mod g)
  S.isVertical   ⟹ S.x ≡ 0 (mod g)

Port stubs: first/last segment of a wire may connect a non-grid-aligned port
to the nearest grid lane. These are exempt.
```

**Guarantees:** All routing segments lie on grid lines. Clean PCB aesthetic.

**Enforced by:** All `findFree*` return snapped values. All `baseMid` computations round to grid.

### I6: Orthogonality

```
∀ segment S:
  S.p1.x = S.p2.x ∨ S.p1.y = S.p2.y
```

**Guarantees:** No diagonal segments. Pure right-angle routing.

### I7: Bus Span Covers All Drops

```
∀ busLine B:
  let dropXs = { dropX for each target in B }
  B.channel.xMin ≤ min(B.trunkX, min(dropXs))
  B.channel.xMax ≥ max(B.trunkX, max(dropXs))
```

**Guarantees:** Horizontal bus extends to reach every drop. No gap between bus and drop.

**Enforced by:** Compute `minBusX`/`maxBusX` AFTER registry assigns drop positions.

### I8: Crossing Indication

```
∀ H-segment Sₕ, V-segment Sᵥ where Sₕ.edgeId ≠ Sᵥ.edgeId:
  crosses(Sₕ, Sᵥ) ⟹ hopArc drawn at intersection(Sₕ, Sᵥ)

Where:
  crosses(H, V) := V.x ∈ (H.xMin, H.xMax) ∧ H.y ∈ (V.yMin, V.yMax)
```

**Guarantees:** Every crossing has a hop arc. No ambiguous intersections.

### I9: Arrow Presence

```
∀ wire W terminating at tgtPort:
  arrowhead drawn at tgtPort pointing in direction of last segment
```

**Guarantees:** Every wire endpoint shows direction.

### I10: Routing Priority

```
Processing order:
  1. Register obstacles (nodes, subgraphs)
  2. Route bus lines (claim all bus segments)
  3. Route individual edges (claim all edge segments)

Within bus lines: process sources in topological order (upstream first).
Within individual edges: process in layout order (top-to-bottom, left-to-right).
```

**Guarantees:** Deterministic routing. Higher-fanout structures (buses) get first pick of lanes. Prevents buses from being squeezed by individual edges that routed first.

**Enforced by:** `_drawBlueprintBusLines` called before `EdgeGraphic` construction loop.

### I11: Channel Capacity

```
∀ corridor C between two adjacent obstacle rows:
  let tracks(C) = floor(C.height / g) - 1    // available grid lanes
  let demand(C) = |{ wires passing through C }|
  demand(C) ≤ tracks(C)

When demand > capacity:
  corridor must be expanded (push apart adjacent node rows)
  OR wires must be rerouted through adjacent corridors
```

**Guarantees:** No corridor is overloaded. Wires spread across available space instead of bunching.

**Enforced by:** Two-phase routing: global assignment counts demand per corridor, detailed assignment distributes wires to tracks. (Not yet implemented — current system uses reactive nudging.)

### I12: Minimum Bend Separation

```
∀ wire W, ∀ consecutive bends (Bᵢ, Bᵢ₊₁):
  manhattan_distance(Bᵢ, Bᵢ₊₁) ≥ g

Where:
  bend := point where wire changes direction (horizontal → vertical or vice versa)
```

**Guarantees:** No micro-zigzags. Every straight run between bends is at least one grid step. Prevents visually confusing tiny jogs.

**Enforced by:** Grid alignment (I5) naturally spaces bends by at least g. Routing algorithm should not produce zero-length segments.

### I13: Claim Completeness

```
∀ wire W:
  ∀ segment S ∈ W.segments:
    S is registered in the occupancy map before any subsequent wire routes

  Corollary: no partial claims. A wire's full route is claimed atomically
  from the perspective of subsequent wires.
```

**Guarantees:** Every drawn segment is tracked. No invisible wires that later wires can collide with.

**Enforced by:** `claim*` calls immediately after `findFree*` in both `_drawOrthogonal` and `_drawBlueprintBusLines`.

---

## Invariant Summary

| ID | Name | Prevents | Constants |
|----|------|----------|-----------|
| I1 | Lane Exclusivity | Wire overlap | — |
| I2 | Obstacle Avoidance | Wires through boxes | Cc = 8px |
| I3 | Wire-to-Wire Separation | Wires too close | Cw = g = 20px |
| I4 | Connectivity | Gaps in wires | — |
| I5 | Grid Alignment | Off-grid segments | g = 20px |
| I6 | Orthogonality | Diagonal segments | — |
| I7 | Bus Span | Detached drops | — |
| I8 | Crossing Indication | Ambiguous crossings | — |
| I9 | Arrow Presence | Missing direction | — |
| I10 | Routing Priority | Non-determinism | — |
| I11 | Channel Capacity | Corridor congestion | — |
| I12 | Minimum Bend Separation | Micro-zigzags | g = 20px |
| I13 | Claim Completeness | Phantom collisions | — |

## Constants

```typescript
const GRID_SIZE = 20                    // g: grid step, also wire-to-wire minimum (Cw)
const COMPONENT_CLEARANCE = 8           // Cc: wire-to-component clearance
// Cw = GRID_SIZE (implicit via grid alignment + lane exclusivity)
// Cw > Cc is correct: wires are further from each other than from components
```

## Priority Fixes to Satisfy Invariants

| Priority | Violation | Invariant | Fix |
|----------|-----------|-----------|-----|
| **P0** | V1: Subgraphs not obstacles | I2 | Register subgraph borders with Cc inflation |
| **P0** | V4: Bus span before drops | I4, I7 | Compute bus extent after drop assignment |
| **P1** | V2: Trunk jog unclaimed | I1, I13 | Claim horizontal jog in `_drawBlueprintBusLines` |
| **P1** | V5: Inconsistent margins | I2 | All wire↔component checks use Cc = 8 |
| **P2** | V7: No channel awareness | I11 | Two-phase routing: global → detailed |
| **P3** | V6: TD-only ports | — | Direction-aware port computation |
