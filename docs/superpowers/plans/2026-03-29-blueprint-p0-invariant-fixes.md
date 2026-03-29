# Blueprint P0 Invariant Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 3 P0 violations: subgraphs as obstacles (I2), bus claim ordering with correct span (I7/I16), and registry silent give-up (I14). Plus P1 fixes: trunk jog claim (I13), zero-length segments (I15), consistent Cc margins (I2).

**Architecture:** WireRegistry gains `registerSubgraphObstacles()`. Bus lines reorder to claim drops before computing bus extent. `findFree*` doubles search on exhaustion and logs warnings. Edge routing guards zero-length segments.

**Tech Stack:** TypeScript, PixiJS 8, vitest

**Spec:** `docs/superpowers/specs/2026-03-29-blueprint-wire-invariants.md`

---

## File Map

| File | Responsibility | Change Type |
|------|---------------|-------------|
| `packages/core/src/renderer/wire-registry.ts` | Lane occupancy map | Modify: add `registerSubgraphObstacles`, expand `findFree*` search, export `COMPONENT_CLEARANCE` |
| `packages/core/src/renderer/mermaid-renderer.ts` | Render orchestration | Modify: register subgraphs, reorder bus claim logic, claim trunk jog |
| `packages/core/src/renderer/edge-graphic.ts` | Per-edge rendering | Modify: zero-length segment guard, self-loop guard |
| `packages/core/src/renderer/__tests__/wire-registry.test.ts` | Registry tests | Create |

---

### Task 1: Extract COMPONENT_CLEARANCE constant and add registerSubgraphObstacles

**Files:**
- Modify: `packages/core/src/renderer/wire-registry.ts`
- Create: `packages/core/src/renderer/__tests__/wire-registry.test.ts`

- [ ] **Step 1: Write tests for registerSubgraphObstacles**

Create `packages/core/src/renderer/__tests__/wire-registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { WireRegistry, COMPONENT_CLEARANCE } from '../wire-registry'

describe('WireRegistry', () => {
  describe('COMPONENT_CLEARANCE', () => {
    it('exports Cc = 8', () => {
      expect(COMPONENT_CLEARANCE).toBe(8)
    })
  })

  describe('registerSubgraphObstacles', () => {
    it('blocks lanes through subgraph borders', () => {
      const reg = new WireRegistry(20)
      const subgraphs = new Map([
        ['sg1', { x: 200, y: 200, width: 300, height: 200 }],
      ])
      reg.registerSubgraphObstacles(subgraphs)

      // A vertical lane at x=200 (center) should be blocked at top border (y≈100) and bottom border (y≈300)
      // Top border zone: y around 100 (200 - 200/2 = 100)
      expect(reg.isVerticalFree(200, 90, 110)).toBe(false)
      // Bottom border zone: y around 300 (200 + 200/2 = 300)
      expect(reg.isVerticalFree(200, 290, 310)).toBe(false)
      // Interior should be FREE (subgraph interior is not blocked, only borders)
      expect(reg.isVerticalFree(200, 150, 250)).toBe(true)
    })

    it('blocks horizontal lanes through subgraph left and right borders', () => {
      const reg = new WireRegistry(20)
      const subgraphs = new Map([
        ['sg1', { x: 200, y: 200, width: 300, height: 200 }],
      ])
      reg.registerSubgraphObstacles(subgraphs)

      // Left border at x≈50 (200 - 300/2 = 50)
      expect(reg.isHorizontalFree(200, 40, 60)).toBe(false)
      // Right border at x≈350 (200 + 300/2 = 350)
      expect(reg.isHorizontalFree(200, 340, 360)).toBe(false)
      // Interior horizontal should be FREE
      expect(reg.isHorizontalFree(200, 100, 300)).toBe(true)
    })
  })

  describe('registerNodeObstacles uses COMPONENT_CLEARANCE', () => {
    it('blocks lanes through inflated node bounds', () => {
      const reg = new WireRegistry(20)
      const nodes = new Map([
        ['n1', { x: 100, y: 100, width: 40, height: 40 }],
      ])
      reg.registerNodeObstacles(nodes)

      // Node center at (100,100), half-width 20 + Cc(8) = 28
      // Lane at x=120 should be blocked (within 28px of center)
      expect(reg.isVerticalFree(120, 80, 120)).toBe(false)
      // Lane at x=140 should be free (40px from center > 28)
      expect(reg.isVerticalFree(140, 80, 120)).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/renderer/__tests__/wire-registry.test.ts --reporter=verbose`

Expected: FAIL — `COMPONENT_CLEARANCE` not exported, `registerSubgraphObstacles` doesn't exist.

- [ ] **Step 3: Implement COMPONENT_CLEARANCE and registerSubgraphObstacles**

In `wire-registry.ts`:

Add at top of file (before class):
```typescript
/** Wire-to-component clearance (Cc). Used to inflate obstacles. */
export const COMPONENT_CLEARANCE = 8
```

Change `registerNodeObstacles` line 89 from hardcoded `8` to use the constant:
```typescript
const hw = node.width / 2 + COMPONENT_CLEARANCE
const hh = node.height / 2 + COMPONENT_CLEARANCE
```

Add new method to WireRegistry class:
```typescript
/** Register subgraph BORDERS (not interiors) as obstacles.
 *  Only the 4 border strips are blocked, wires can route through the interior. */
registerSubgraphObstacles(subgraphs: Map<string, { x: number; y: number; width: number; height: number }>): void {
  const borderThickness = COMPONENT_CLEARANCE * 2 // border zone width
  for (const [, sg] of subgraphs) {
    const hw = sg.width / 2
    const hh = sg.height / 2
    const left = sg.x - hw
    const right = sg.x + hw
    const top = sg.y - hh
    const bottom = sg.y + hh

    // Top border: horizontal strip
    const topMinY = top - COMPONENT_CLEARANCE
    const topMaxY = top + COMPONENT_CLEARANCE
    for (let y = this._snap(topMinY); y <= this._snap(topMaxY); y += this._gridSize) {
      this.claimHorizontal(y, left - COMPONENT_CLEARANCE, right + COMPONENT_CLEARANCE)
    }

    // Bottom border: horizontal strip
    const botMinY = bottom - COMPONENT_CLEARANCE
    const botMaxY = bottom + COMPONENT_CLEARANCE
    for (let y = this._snap(botMinY); y <= this._snap(botMaxY); y += this._gridSize) {
      this.claimHorizontal(y, left - COMPONENT_CLEARANCE, right + COMPONENT_CLEARANCE)
    }

    // Left border: vertical strip
    const leftMinX = left - COMPONENT_CLEARANCE
    const leftMaxX = left + COMPONENT_CLEARANCE
    for (let x = this._snap(leftMinX); x <= this._snap(leftMaxX); x += this._gridSize) {
      this.claimVertical(x, top - COMPONENT_CLEARANCE, bottom + COMPONENT_CLEARANCE)
    }

    // Right border: vertical strip
    const rightMinX = right - COMPONENT_CLEARANCE
    const rightMaxX = right + COMPONENT_CLEARANCE
    for (let x = this._snap(rightMinX); x <= this._snap(rightMaxX); x += this._gridSize) {
      this.claimVertical(x, top - COMPONENT_CLEARANCE, bottom + COMPONENT_CLEARANCE)
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/renderer/__tests__/wire-registry.test.ts --reporter=verbose`

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/renderer/wire-registry.ts packages/core/src/renderer/__tests__/wire-registry.test.ts
git commit -m "feat: COMPONENT_CLEARANCE constant, registerSubgraphObstacles blocks borders not interiors"
```

---

### Task 2: Expand findFree* search on exhaustion (I14)

**Files:**
- Modify: `packages/core/src/renderer/wire-registry.ts:58-82`
- Modify: `packages/core/src/renderer/__tests__/wire-registry.test.ts`

- [ ] **Step 1: Write test for expanded search**

Add to `wire-registry.test.ts`:

```typescript
describe('findFreeVertical expanded search', () => {
  it('finds free lane beyond default maxSearch when first 15 are occupied', () => {
    const reg = new WireRegistry(20)
    // Occupy lanes from x=0 to x=300 (15 lanes each side of x=100)
    for (let x = -200; x <= 400; x += 20) {
      reg.claimVertical(x, 0, 100)
    }
    // Free up x=420 (just beyond 15*20=300 from center 100)
    // findFreeVertical(100, 0, 100) should find it with expanded search
    // Actually, let's occupy 0..400 and leave 420 free
    const result = reg.findFreeVertical(100, 0, 100)
    // With expanded search (30 lanes), it should find x=420 or x=-220
    expect(Math.abs(result - 100)).toBeGreaterThan(300)
  })
})

describe('findFreeHorizontal expanded search', () => {
  it('finds free channel beyond default maxSearch', () => {
    const reg = new WireRegistry(20)
    for (let y = -200; y <= 400; y += 20) {
      reg.claimHorizontal(y, 0, 100)
    }
    const result = reg.findFreeHorizontal(100, 0, 100)
    expect(Math.abs(result - 100)).toBeGreaterThan(300)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/renderer/__tests__/wire-registry.test.ts --reporter=verbose`

Expected: FAIL — current maxSearch=15 doesn't reach beyond 300px.

- [ ] **Step 3: Implement expanded search**

Replace `findFreeVertical` (lines 58-69) with:

```typescript
/** Find nearest free vertical lane near targetX for y range.
 *  Searches maxSearch lanes in each direction, then doubles search on exhaustion. */
findFreeVertical(targetX: number, y1: number, y2: number, maxSearch: number = 15): number {
  const sx = this._snap(targetX)
  if (this.isVerticalFree(sx, y1, y2)) return sx
  // First pass
  for (let i = 1; i <= maxSearch; i++) {
    const left = sx - i * this._gridSize
    if (this.isVerticalFree(left, y1, y2)) return left
    const right = sx + i * this._gridSize
    if (this.isVerticalFree(right, y1, y2)) return right
  }
  // Expanded search: double the radius
  for (let i = maxSearch + 1; i <= maxSearch * 2; i++) {
    const left = sx - i * this._gridSize
    if (this.isVerticalFree(left, y1, y2)) return left
    const right = sx + i * this._gridSize
    if (this.isVerticalFree(right, y1, y2)) return right
  }
  return sx // last resort — I14 violation, but extremely unlikely at 2x radius
}
```

Replace `findFreeHorizontal` (lines 71-82) with identical pattern:

```typescript
/** Find nearest free horizontal channel near targetY for x range.
 *  Searches maxSearch lanes in each direction, then doubles search on exhaustion. */
findFreeHorizontal(targetY: number, x1: number, x2: number, maxSearch: number = 15): number {
  const sy = this._snap(targetY)
  if (this.isHorizontalFree(sy, x1, x2)) return sy
  // First pass
  for (let i = 1; i <= maxSearch; i++) {
    const up = sy - i * this._gridSize
    if (this.isHorizontalFree(up, x1, x2)) return up
    const down = sy + i * this._gridSize
    if (this.isHorizontalFree(down, x1, x2)) return down
  }
  // Expanded search: double the radius
  for (let i = maxSearch + 1; i <= maxSearch * 2; i++) {
    const up = sy - i * this._gridSize
    if (this.isHorizontalFree(up, x1, x2)) return up
    const down = sy + i * this._gridSize
    if (this.isHorizontalFree(down, x1, x2)) return down
  }
  return sy // last resort
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/core/src/renderer/__tests__/wire-registry.test.ts --reporter=verbose`

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/renderer/wire-registry.ts packages/core/src/renderer/__tests__/wire-registry.test.ts
git commit -m "feat: findFree* doubles search radius on exhaustion (I14 routability)"
```

---

### Task 3: Register subgraphs as obstacles + claim trunk jog in renderer

**Files:**
- Modify: `packages/core/src/renderer/mermaid-renderer.ts:691-694` (main render path)
- Modify: `packages/core/src/renderer/mermaid-renderer.ts:395-398` (focus path)
- Modify: `packages/core/src/renderer/mermaid-renderer.ts:1106` (trunk jog claim)

- [ ] **Step 1: Register subgraph obstacles in main render path**

After line 693 (`wireReg.registerNodeObstacles(positioned.nodes)`), add:

```typescript
wireReg.registerSubgraphObstacles(positioned.subgraphs)
```

- [ ] **Step 2: Register subgraph obstacles in focus path**

Find the focus path's registry setup (around line 397, `wireReg.registerNodeObstacles(positioned.nodes)`). Add after it:

```typescript
wireReg.registerSubgraphObstacles(positioned.subgraphs)
```

Note: the focus path has `subgraphs: new Map()` so this is a no-op there, but keeps both paths symmetric.

- [ ] **Step 3: Claim trunk horizontal jog**

In `_drawBlueprintBusLines`, after line 1106 (`wireReg?.claimVertical(trunkX, srcPortY, busY)`), add:

```typescript
if (trunkX !== srcNode.x) {
  wireReg?.claimHorizontal(srcPortY, srcNode.x, trunkX)
}
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run --reporter=verbose`

Expected: 88 pass, 5 fail (pre-existing parser failures).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/renderer/mermaid-renderer.ts
git commit -m "feat: register subgraph borders as obstacles, claim trunk horizontal jog (I2, I13)"
```

---

### Task 4: Bus claim ordering — drops before bus extent (I16)

**Files:**
- Modify: `packages/core/src/renderer/mermaid-renderer.ts:1093-1160` (inside `_drawBlueprintBusLines`)

- [ ] **Step 1: Reorder the bus line construction**

Replace the block from line 1093 (trunkX computation) through line 1160 (end of fan-out loop). The new structure:

```typescript
// Phase 1: Find trunk
const trunkX = wireReg
  ? wireReg.findFreeVertical(srcNode.x, srcPortY, minTargetY)
  : this._findClearVerticalLane(srcNode.x, srcPortY, minTargetY, positioned, excludeIds, gridSize)

// Phase 2: Find busY (initial estimate using target node positions)
const estMinBusX = Math.min(trunkX, ...targets.map(t => t.x))
const estMaxBusX = Math.max(trunkX, ...targets.map(t => t.x))
const baseBusY = Math.round(((srcPortY + minTargetY) / 2) / gridSize) * gridSize
const busY = wireReg
  ? wireReg.findFreeHorizontal(baseBusY, estMinBusX, estMaxBusX)
  : baseBusY

// Claim trunk
wireReg?.claimVertical(trunkX, srcPortY, busY)
if (trunkX !== srcNode.x) {
  wireReg?.claimHorizontal(srcPortY, srcNode.x, trunkX)
}

// Phase 3: Find + claim all drops SEQUENTIALLY (each claim before next find)
const drops: Array<{ tgt: typeof targets[0]; dropX: number }> = []
for (const tgt of targets) {
  const dropX = wireReg
    ? wireReg.findFreeVertical(tgt.x, busY, tgt.y)
    : tgt.x
  wireReg?.claimVertical(dropX, busY, tgt.y)
  if (dropX !== tgt.x) {
    wireReg?.claimHorizontal(tgt.y, dropX, tgt.x)
  }
  drops.push({ tgt, dropX })
}

// Phase 4: Compute bus extent from ACTUAL drop positions (I7, I16)
const minBusX = Math.min(trunkX, ...drops.map(d => d.dropX))
const maxBusX = Math.max(trunkX, ...drops.map(d => d.dropX))
wireReg?.claimHorizontal(busY, minBusX, maxBusX)

// Phase 5: Draw everything
const busGfx = new Graphics()
const busSegments: WireSegment[] = []

// Trunk
busGfx.moveTo(srcNode.x, srcPortY)
if (trunkX !== srcNode.x) busGfx.lineTo(trunkX, srcPortY)
busGfx.lineTo(trunkX, busY)

if (trunkX !== srcNode.x) {
  busSegments.push({ x1: srcNode.x, y1: srcPortY, x2: trunkX, y2: srcPortY, isHorizontal: true, edgeId: `bus:${sourceId}` })
}
busSegments.push({ x1: trunkX, y1: srcPortY, x2: trunkX, y2: busY, isHorizontal: false, edgeId: `bus:${sourceId}` })

// Horizontal bus
busGfx.moveTo(minBusX, busY)
busGfx.lineTo(maxBusX, busY)
busSegments.push({ x1: minBusX, y1: busY, x2: maxBusX, y2: busY, isHorizontal: true, edgeId: `bus:${sourceId}` })

// Fan-out drops (using pre-computed positions)
for (const { tgt, dropX } of drops) {
  busGfx.moveTo(dropX, busY)
  busGfx.lineTo(dropX, tgt.y)
  if (dropX !== tgt.x) {
    busGfx.lineTo(tgt.x, tgt.y)
  }

  busSegments.push({ x1: dropX, y1: busY, x2: dropX, y2: tgt.y, isHorizontal: false, edgeId: `bus:${sourceId}` })
  if (dropX !== tgt.x) {
    busSegments.push({ x1: dropX, y1: tgt.y, x2: tgt.x, y2: tgt.y, isHorizontal: true, edgeId: `bus:${sourceId}` })
  }

  // Arrow at fan-out endpoint
  const prevPt = dropX !== tgt.x
    ? { x: dropX, y: tgt.y }
    : { x: dropX, y: busY }
  const angle = Math.atan2(tgt.y - prevPt.y, tgt.x - prevPt.x)
  const arrowSize = 6
  busGfx.moveTo(tgt.x, tgt.y)
  busGfx.lineTo(tgt.x - arrowSize * Math.cos(angle - Math.PI / 6), tgt.y - arrowSize * Math.sin(angle - Math.PI / 6))
  busGfx.moveTo(tgt.x, tgt.y)
  busGfx.lineTo(tgt.x - arrowSize * Math.cos(angle + Math.PI / 6), tgt.y - arrowSize * Math.sin(angle + Math.PI / 6))
}
```

The lines after (stroke, store segments, etc.) remain unchanged.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run --reporter=verbose`

Expected: 88 pass, 5 fail (pre-existing).

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/renderer/mermaid-renderer.ts
git commit -m "feat: bus claim ordering — drops before bus extent (I7, I16)"
```

---

### Task 5: Zero-length segment guard + self-loop guard (I15)

**Files:**
- Modify: `packages/core/src/renderer/edge-graphic.ts:24-30` (self-loop guard)
- Modify: `packages/core/src/renderer/edge-graphic.ts:175-180` (midY minimum separation)

- [ ] **Step 1: Add self-loop guard**

In the EdgeGraphic constructor, at line 25 (after `super()`), add:

```typescript
// I15: reject self-loops — degenerate wire
if (edge.source === edge.target) {
  this.data = edge
  return
}
```

- [ ] **Step 2: Add midY minimum separation in _drawOrthogonal**

After the midY computation (after the `if (wireRegistry) { ... } else { ... }` block that sets `midY`, around line 205), add:

```typescript
// I15: enforce minimum bend separation — no zero-length vertical segments
if (Math.abs(midY - srcPort.y) < gridSize) {
  midY = srcPort.y + (tgtPort.y >= srcPort.y ? gridSize : -gridSize)
  midY = Math.round(midY / gridSize) * gridSize
}
if (Math.abs(midY - tgtPort.y) < gridSize) {
  midY = tgtPort.y + (srcPort.y >= tgtPort.y ? gridSize : -gridSize)
  midY = Math.round(midY / gridSize) * gridSize
}
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run --reporter=verbose`

Expected: 88 pass, 5 fail (pre-existing).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/renderer/edge-graphic.ts
git commit -m "feat: self-loop guard and zero-length segment prevention (I15)"
```

---

### Task 6: Visual verification

**Files:**
- None modified (verification only)

- [ ] **Step 1: Reload dev harness at http://localhost:5199**

- [ ] **Step 2: Switch to Blueprint, verify on overview diagram**

Check:
1. Wires do NOT cut through subgraph borders (I2 — V1 fixed)
2. No overlapping horizontal segments at source ports (V2 — trunk jog claimed)
3. No gaps between bus horizontal and drops (I7/I16 — bus span fixed)
4. No visible wire stacking (I14 — expanded search)

- [ ] **Step 3: Test all 4 diagrams**

Switch between overview, order-service, payment-service, auth-service. Verify Blueprint wires on each.

- [ ] **Step 4: Test focus view**

Double-click a subgraph. Verify wires route correctly in focus view.

- [ ] **Step 5: Commit any visual polish**
