# Blueprint Wire Fixes — Registry-First Approach

**Date:** 2026-03-29
**Status:** Approved

## Problem

Blueprint philosophy has four wire-routing bugs:

1. **Main render path skips WireRegistry.** `_renderGraph()` calls `_drawBlueprintBusLines()` without a WireRegistry, so bus lines don't get globally unique lanes. The focused view (`_renderFocusGraph()`) creates a registry for bus lines but doesn't pass it to EdgeGraphic either.
2. **Individual edges ignore WireRegistry.** `EdgeGraphic._drawOrthogonal()` does ad-hoc node collision avoidance but never consults the registry. Edges can overlap each other and bus lines. Affects both `_renderGraph()` and the focus path.
3. **Bus lines invisible to hop detection.** Only `EdgeGraphic.orthogonalSegments` are checked for wire crossings. Bus line segments are plain `Graphics` with no segment data, so bus-edge crossings never get hop arcs. Affects both render paths.
4. **Bus line fan-outs have no arrowheads.** Fan-out drops end at target nodes but don't draw directional arrows.

## Approach

Make WireRegistry the single source of truth for all Blueprint wire routing — bus lines and individual edges. Both render paths (`_renderGraph()` and the focus path) follow the same pipeline.

### Pipeline (applied to both render paths)

```
create WireRegistry
  → registerNodeObstacles (all nodes)
  → draw bus lines (claim trunk + bus + fan-out lanes)
  → draw individual edges (query registry for free lanes, claim them)
  → detect hops (bus segments + edge segments combined)
```

## Design

### 1. Unify WireRegistry in both render paths

Both `_renderGraph()` and the focus graph path get:

- Create `WireRegistry` with theme grid size
- Call `registerNodeObstacles(positioned.nodes)`
- Pass registry to `_drawBlueprintBusLines()`
- Pass registry to each `EdgeGraphic` constructor

The focus path already creates a WireRegistry for bus lines. It just needs to also pass it to `EdgeGraphic`.

### 2. EdgeGraphic registry-aware routing

New constructor signature:

```typescript
constructor(
  edge: PositionedEdge,
  theme: Theme,
  allNodes?: Map<string, PositionedNode>,
  philosophy?: string,
  edgeIndex?: number,
  totalEdges?: number,
  allSubgraphs?: Map<string, { x: number; y: number; width: number; height: number }>,
  wireRegistry?: WireRegistry,
)
```

When `wireRegistry` is present, `_drawOrthogonal()`:

- Replaces the horizontal channel node-scanning loop (lines 179-203) with `registry.findFreeHorizontal(baseMidY, minX, maxX)`
- Replaces the source vertical collision scan (lines 211-224) with `registry.findFreeVertical(srcPort.x, srcPort.y, midY)`
- Replaces the target vertical collision scan (lines 226-238) with `registry.findFreeVertical(tgtPort.x, midY, tgtPort.y)`
- Claims all segments after routing: `claimVertical()` for verticals, `claimHorizontal()` for the channel

When `wireRegistry` is absent (non-Blueprint, or direct construction in tests), the existing ad-hoc collision loops are preserved as fallback. This avoids regressions if EdgeGraphic is constructed without a registry.

### 3. Bus lines record segments for hop detection

`_drawBlueprintBusLines()` builds a `WireSegment[]` array per bus graphic, stored as `(busGfx as any)._wireSegments`:

- Trunk horizontal jog: `srcNode.x → trunkX` at `srcPortY` (when trunkX !== srcNode.x)
- Trunk vertical segment: `trunkX` from `srcPortY → busY`
- Horizontal bus segment: `minBusX → maxBusX` at `busY`
- Each fan-out vertical drop: `dropX` from `busY → tgt.y`
- Each fan-out horizontal jog: `dropX → tgt.x` at `tgt.y` (when dropX !== tgt.x)

All bus segments use `edgeId: "bus:${sourceId}"` to namespace them. This prevents collision with real edge IDs and ensures the hop detector correctly suppresses bus-internal crossings (a bus crossing its own fan-out at a junction is intentional).

The hop-detection block in both render paths combines bus segments with edge segments before calling `drawWireHops()`.

### 4. Bus fan-out arrowheads

`_drawBlueprintBusLines()` draws an arrowhead at each fan-out drop endpoint, pointing into the target node. Arrow geometry is duplicated inline (same triangle math as `EdgeGraphic._drawArrow()` but operating on the bus `Graphics` object, since `_drawArrow` is private to EdgeGraphic).

## Files Changed

| File | Change |
|------|--------|
| `renderer/mermaid-renderer.ts` | Create WireRegistry in `_renderGraph()`, pass to EdgeGraphic in both render paths, include bus segments in hop detection in both render paths |
| `renderer/edge-graphic.ts` | Accept optional WireRegistry as 8th constructor param, use registry in `_drawOrthogonal()` when present, preserve ad-hoc loops as fallback when absent |
| `renderer/mermaid-renderer.ts` | `_drawBlueprintBusLines()` — record `_wireSegments` on Graphics, draw arrows on fan-outs |

## Files Not Changed

- `wire-registry.ts` — already correct
- `wire-hops.ts` — detection logic already correct (callers change how they build the segment array, but `drawWireHops()` itself is unchanged)
- `blueprint-layout.ts` — layout-level collision avoidance stays (handles layout pass; this fixes rendering pass)
- All non-blueprint philosophies — untouched
- `theme.ts` — no changes needed

## Testing

- Existing blueprint-layout tests continue to pass (no layout changes)
- Existing wire-hops tests continue to pass (no detection changes)
- Visual verification in dev harness: switch to Blueprint, confirm no overlapping wires, hop arcs at crossings, arrows on bus fan-outs
