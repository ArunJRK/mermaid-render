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

PCB convention: three tiers of clearance for three pair types.

```
Cn := component-to-component clearance = 2g (40px)
Cw := wire-to-wire clearance           = g  (20px)
Cc := wire-to-component clearance       = 8px

Cn > Cw > Cc — strictest between components, loosest between wire and component.

Cn enforced by: layout phase (_resolveOverlaps, MIN_MARGIN = GRID_SIZE * 2)
  Nodes are pushed apart until no two are closer than Cn.
  This is a LAYOUT concern — guarantees enough corridor space for wires to route.
  Cn = 2g means every corridor has room for at least 1 wire track between nodes.

Cw enforced by: grid alignment + lane exclusivity (I1 + I5)
  Two parallel wires on adjacent grid lanes are exactly g apart.
  Lane exclusivity prevents sharing. Therefore min separation = g.

Cc enforced by: obstacle inflation (I2)
  Each obstacle inflated by Cc before registering in the occupancy map.
  No wire can occupy a lane within Cc of any node or subgraph border.

Relationship:
  Cn = 2g: between two nodes 40px apart, there is room for exactly 1 wire
           (Cc on each side = 8+8 = 16px, leaving 24px, which fits 1 grid lane).
  Cw = g:  parallel wires are always a full grid step apart.
  Cc = 8px: wires can approach components closer than they approach each other.
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

### I14: Routability (no silent failure)

```
∀ wire W:
  route(W) produces a valid path satisfying I1–I6
  ∨ route(W) reports FAILURE explicitly

Silent degradation is forbidden:
  findFree*(target, range, maxSearch) exhausts candidates
    → MUST NOT return occupied position
    → MUST either expand search OR signal failure

On failure:
  option A: expand search radius (maxSearch *= 2, retry)
  option B: push apart adjacent obstacles to create room (layout feedback)
  option C: draw wire in error state (distinct color/dash) so violation is visible
```

**Guarantees:** No invisible overlaps. Every routing failure is either resolved or surfaced.

**Enforced by:** `findFree*` must throw or return a sentinel on exhaustion. Caller must handle failure, not silently draw on an occupied lane.

### I15: Non-Degeneracy

```
Precondition:
  edge.source ≠ edge.target  (self-loops rejected before routing)

Postcondition:
  ∀ segment S ∈ wire W: length(S) > 0
  ∀ wire W: |W.segments| ≥ 2

Minimum bend clearance (strengthens I12):
  |midY - srcPort.y| ≥ g
  |midY - tgtPort.y| ≥ g
  If snap(midY) = snap(srcPort.y): force midY += g
```

**Guarantees:** No zero-length segments. No degenerate wires from self-loops or co-located ports.

**Enforced by:** Guard in routing entry point: skip self-loops. Post-snap enforcement of minimum vertical separation between channel and ports.

### I16: Bus Claim Ordering

```
∀ busLine B:
  Processing order within B:
    1. Find + claim trunkX (vertical)
    2. Find busY (horizontal, NOT yet claimed)
    3. For each target in left-to-right order:
       find + claim dropX (sequential — each claim before next find)
    4. Compute bus extent: [min(trunkX, dropXs), max(trunkX, dropXs)]
    5. Claim horizontal bus at busY with computed extent
    6. Draw all segments

  Sequential drop claiming prevents two drops landing on the same lane.
  Bus extent computed from actual claimed positions, not target node centers.
```

**Guarantees:** No two drops share a lane. Bus horizontal reaches all drops. No gap between bus and drop.

**Enforced by:** Sequenced find→claim loop in `_drawBlueprintBusLines`.

---

## Design Decision: Orthogonal-Only Routing

```
REJECTED: Isometric / 45° diagonal routing

Diagonal routing (PCB 45° traces, isometric projection) reduces total wire
length and crossing count. However:

  1. Readability loss: diagonal lines are harder to follow visually than
     right-angle paths, especially in dense diagrams with many parallel wires.
  2. Grid alignment breaks: 45° segments don't lie on the integer grid.
     Lane exclusivity (I1) and grid alignment (I5) become harder to enforce.
  3. Hop arc ambiguity: crossing detection for diagonal segments requires
     general line-line intersection, not just H∩V. Hop arcs at arbitrary
     angles are visually confusing.
  4. Blueprint aesthetic: real blueprints and PCB schematics use orthogonal
     routing. Diagonals break the visual metaphor.

DECISION: All segments are orthogonal (I6). This is a permanent constraint,
not a limitation. The readability and invariant simplicity it provides
outweigh the routing efficiency of diagonals.
```

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
| I14 | Routability | Silent overlap on exhaustion | — |
| I15 | Non-Degeneracy | Zero-length segments, self-loops | g = 20px |
| I16 | Bus Claim Ordering | Drop lane collision, bus gap | — |

## Constants

```typescript
const GRID_SIZE = 20                        // g: grid step
const COMPONENT_CLEARANCE = 8               // Cc: wire-to-component clearance
const NODE_MIN_MARGIN = GRID_SIZE * 2       // Cn: component-to-component clearance (40px)
// Cw = GRID_SIZE (implicit via grid alignment + lane exclusivity)
// Cn > Cw > Cc:  40px > 20px > 8px
```

## Priority Fixes to Satisfy Invariants

| Priority | Violation | Invariant | Fix |
|----------|-----------|-----------|-----|
| **P0** | V1: Subgraphs not obstacles | I2 | Register subgraph borders with Cc inflation |
| **P0** | V4: Bus span before drops | I4, I7, I16 | Sequenced drop claim → compute bus extent |
| **P0** | Registry silent give-up | I1, I14 | `findFree*` expands search or signals failure |
| **P1** | V2: Trunk jog unclaimed | I1, I13 | Claim horizontal jog in `_drawBlueprintBusLines` |
| **P1** | V5: Inconsistent margins | I2 | All wire↔component checks use Cc = 8 |
| **P1** | Zero-length segments | I12, I15 | Guard: `\|midY - srcPort.y\| ≥ g`, reject self-loops |
| **P2** | V7: No channel awareness | I11 | Two-phase routing: global → detailed |
| **P3** | V6: TD-only ports | — | Direction-aware port computation |

## Fixes for Warnings

### Fix for 🔴 Registry silent give-up (I14)

In `wire-registry.ts`, `findFreeVertical` and `findFreeHorizontal`:

```typescript
// Current (line 68): return sx  // give up — SILENT OVERLAP
// Fix: double search radius on first failure, then signal
findFreeVertical(targetX, y1, y2, maxSearch = 15): number {
  const sx = this._snap(targetX)
  if (this.isVerticalFree(sx, y1, y2)) return sx
  for (let i = 1; i <= maxSearch; i++) { /* existing search */ }
  // Exhausted — expand search 2x before giving up
  for (let i = maxSearch + 1; i <= maxSearch * 2; i++) { /* same pattern */ }
  // Still exhausted — return with warning flag
  console.warn(`WireRegistry: no free vertical lane near x=${sx} after ${maxSearch*2} attempts`)
  return sx  // last resort, but now logged
}
```

Better long-term: return `{ x: number; conflict: boolean }` so the renderer can draw conflicting wires in a distinct error style (e.g., red dashed).

### Fix for 🔴 Bus claim ordering (I16)

In `_drawBlueprintBusLines`, reorder the fan-out loop:

```typescript
// Phase 1: find + claim all drop positions (sequential)
const drops: Array<{ tgt: Target; dropX: number }> = []
for (const tgt of targets) {
  const dropX = wireReg.findFreeVertical(tgt.x, busY, tgt.y)
  wireReg.claimVertical(dropX, busY, tgt.y)
  if (dropX !== tgt.x) wireReg.claimHorizontal(tgt.y, dropX, tgt.x)
  drops.push({ tgt, dropX })
}

// Phase 2: compute bus extent from ACTUAL drop positions
const minBusX = Math.min(trunkX, ...drops.map(d => d.dropX))
const maxBusX = Math.max(trunkX, ...drops.map(d => d.dropX))
wireReg.claimHorizontal(busY, minBusX, maxBusX)

// Phase 3: draw everything
busGfx.moveTo(srcNode.x, srcPortY)
// ... trunk, bus, drops, arrows
```

### Fix for 🟠 Zero-length segments (I15)

In `_drawOrthogonal`, after computing `midY`:

```typescript
// Enforce minimum bend separation
if (Math.abs(midY - srcPort.y) < gridSize) {
  midY = srcPort.y + (tgtPort.y > srcPort.y ? gridSize : -gridSize)
  midY = Math.round(midY / gridSize) * gridSize
}
if (Math.abs(midY - tgtPort.y) < gridSize) {
  midY = tgtPort.y + (srcPort.y > tgtPort.y ? gridSize : -gridSize)
  midY = Math.round(midY / gridSize) * gridSize
}
```

Self-loop guard at the routing entry point:

```typescript
// In EdgeGraphic constructor, before routing
if (edge.source === edge.target) return  // skip self-loops
```

### Fix for 🟠 Channel capacity (I11)

Deferred — requires two-phase routing. Current mitigation: the `findFree*` expanded search (I14 fix) allows wires to route further from the corridor midpoint, effectively using more of the available space. Full channel-aware routing is a P2 item.
