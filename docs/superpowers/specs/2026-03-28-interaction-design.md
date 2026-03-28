# Interaction Design Spec v2: Navigation, Folding, Visual Identity, Layout

**Date:** 2026-03-28
**Status:** Final (user-approved decisions)

---

## Decisions Summary

| Decision | Choice |
|----------|--------|
| Navigation | Focus Zoom (click in, Esc out) |
| Theme Style | Monochrome + single accent color |
| Zoom Behavior | Semantic zoom (progressive disclosure) |
| Layout Engine | Multi-pass + force-directed option (like Obsidian graph) |
| Fold Indicators | Chevron + count badge + show-on-hover (layered) |
| Animations | Smooth everywhere (250-400ms) |
| Force Layout | Available for all philosophies as user toggle |
| Esc Key | Zoom out one level |
| Edge Routing | Orthogonal (right-angle) for Blueprint philosophy |
| Swimlanes | Available for Map philosophy |

---

## 1. Focus Navigation

### 1.1 Click to Zoom In

- **Click a subgraph** → viewport smoothly zooms/pans to fill the screen with that subgraph's contents (250ms ease-out). Other subgraphs fade to 20% opacity.
- **Esc key** → zoom out one level. Repeated Esc reaches root. Smooth reverse animation.
- **Breadcrumb bar** (fixed HTML overlay at top): `Root > Core Services > Order Processing`. Each segment clickable. Current focus is bold.

### 1.2 Double-Click to Fold

- **Double-click** a subgraph → traditional fold (collapse children to summary node). Power user feature.
- Fold state persists independently of focus state.

### 1.3 Keyboard

| Key | Action |
|-----|--------|
| Esc | Zoom out one level (or deselect if something selected) |
| F | Fit current view to canvas |
| R | Reset to root view |

---

## 2. Semantic Zoom (Progressive Disclosure)

Zoom level controls detail visibility:

| Zoom Level | Visible |
|------------|---------|
| < 0.4x | Subgraphs as solid colored cards — label only, no internal nodes |
| 0.4x–0.8x | Subgraph cards + internal nodes as small dots (no labels) |
| 0.8x–1.2x | Node shapes visible, labels fade in |
| > 1.2x | Full detail: node labels, edge labels, fold indicators |

Transitions between levels are gradual (alpha interpolation), not sudden swaps.

---

## 3. Fold Indicators (Layered)

Three layers of fold indication, all active simultaneously:

1. **Chevron icon** (▶/▼) rendered next to subgraph label — always visible at zoom > 0.8x
2. **Count badge** — pill showing node count (e.g., "5") at top-right corner of subgraph — always visible
3. **Hover controls** — on hover, chevron brightens and a subtle "click to fold" tooltip appears

### Collapsed State

- Chevron shows ▶
- Badge shows count
- Subgraph renders as a compact card (label + "▶ 5 nodes")
- Different visual treatment from expanded (slightly different fill, dashed border)

---

## 4. Color Themes — Monochrome + Accent

Each philosophy gets a monochrome palette with ONE accent color. Professional, restrained.

### 4.1 Narrative — "Ink"
```
Background:  #0d1117
Node fill:   #161b22
Node stroke: #30363d
Text:        #e6edf3
Edge:        #484f58
Subgraph:    #161b22 @ 40%, #30363d stroke
Accent:      #58a6ff  (selection, active, links)
```

### 4.2 Map — "Atlas"
```
Background:  #1a1a2e
Node fill:   #16213e
Node stroke: #0f3460
Text:        #eaeaea
Edge:        #3a3a5c
Subgraph:    depth-tinted (#0f3460 → #533483 → #e94560 per level)
Accent:      #e94560  (selection, active)
```

### 4.3 Blueprint — "Grid"
```
Background:  #0a192f
Node fill:   #112240
Node stroke: #233554
Text:        #ccd6f6
Edge:        #233554  (orthogonal, right-angle routing)
Subgraph:    #112240 @ 30%, #233554 dashed stroke
Accent:      #64ffda  (selection, active)
```

### 4.4 Breath — "Void"
```
Background:  #111111
Node fill:   #1a1a1a
Node stroke: #333333
Text:        #eeeeee
Edge:        #444444
Subgraph:    #1a1a1a @ 25%, #333333 stroke
Accent:      #ffffff  (selection — pure white on black)
```

---

## 5. Layout Engine — Multi-Pass + Force-Directed Option

### 5.1 Multi-Pass Hierarchical (Default)

Two-pass layout to prevent subgraph overlap:

**Pass 1 — Cluster layout:** Treat each subgraph as a single box. Run dagre on the cluster-level graph to position subgraphs relative to each other with generous gaps.

**Pass 2 — Internal layout:** For each subgraph, run dagre independently on its internal nodes. Position results within the bounding box from pass 1.

**Pass 3 — Edge routing:** Route inter-subgraph edges between the positioned clusters. For Blueprint philosophy, use orthogonal (right-angle) routing.

### 5.2 Force-Directed Layout (User Toggle)

Available for all philosophies via a toggle button in the UI (or `%% @force` directive).

Uses a force simulation (d3-force or custom):
- **Attraction:** nodes connected by edges attract each other
- **Repulsion:** all nodes repel each other (prevent overlap)
- **Cluster gravity:** nodes in the same subgraph attract toward their group center
- **Boundary force:** subgraph boundaries act as soft walls

Inspired by Obsidian's graph view. Creates organic, spatial layouts that feel alive.

Philosophy modifies force parameters:
- **Narrative:** strong directional force (top→bottom), weak lateral spread
- **Map:** strong cluster gravity, moderate repulsion — tight groups with clear separation
- **Blueprint:** grid-snapping force — nodes attracted to grid lines after simulation settles
- **Breath:** weak forces, high repulsion — everything spreads out with maximum whitespace

### 5.3 @rank and @pin Directive Enforcement

Now enforced in both layout modes:

- `%% @rank A B C` — constrain A, B, C to the same y-coordinate (in TD) or x-coordinate (in LR) during layout
- `%% @pin nodeA 200 150` — fix nodeA at position (200, 150), layout flows around it

---

## 6. Orthogonal Edge Routing (Blueprint)

Blueprint philosophy uses right-angle edges instead of curves:

- Edges consist of horizontal and vertical segments only
- Edges exit nodes from port positions (top/bottom for TD, left/right for LR)
- When edges must cross, add a small gap at the intersection for clarity
- Edge labels sit on the horizontal segment, centered

Other philosophies keep smooth bezier curves (Narrative, Breath) or direct lines (Map).

---

## 7. Swimlanes (Map Philosophy)

Map philosophy supports optional swimlanes when subgraphs form clear horizontal or vertical bands:

- **Detection:** If subgraphs are arranged in a row (all at roughly the same y-coordinate) or column (same x-coordinate), render swimlane dividers between them.
- **Rendering:** Subtle horizontal or vertical lines separating lanes. Lane labels on the side.
- **Directive:** `%% @swimlane horizontal` or `%% @swimlane vertical` to force lane direction.

Swimlanes are a Map-specific visual enhancement, not a layout constraint. The layout positions subgraphs normally; swimlane dividers are drawn post-layout if the arrangement is lane-like.

---

## 8. Transition Animations (250-400ms)

All state changes animate smoothly:

| Action | Animation |
|--------|-----------|
| Focus into subgraph | Viewport zooms/pans to center (250ms ease-out). Others fade to 20%. |
| Esc / breadcrumb back | Reverse zoom. Others fade back to 100%. (300ms) |
| Fold (double-click) | Children fade out (150ms), layout interpolates to new positions (250ms). |
| Unfold | Layout expands (250ms), children fade in (150ms). |
| Philosophy switch | Crossfade: old rendering fades out, new fades in (300ms). |
| Node selection | Selected node stroke transitions to accent color (100ms). Unrelated edges fade to 15%. |
| Hover | Glow appears behind node (100ms ease-in). Subgraph border brightens. |

Layout interpolation: when layout changes (fold/unfold/philosophy switch), each node animates from its old position to its new position using lerp over the transition duration. New nodes fade in at their target position. Removed nodes fade out at their old position.

---

## 9. Implementation Priority

| Priority | Task | Addresses |
|----------|------|-----------|
| **P0** | Multi-pass layout (no overlap) | Overlap, legibility |
| **P0** | Monochrome + accent themes | Childish colors |
| **P1** | Focus navigation + Esc | Navigation confusion |
| **P1** | Breadcrumb bar (HTML overlay) | Where am I? |
| **P1** | Fold indicators (chevron + badge + hover) | Discoverability |
| **P1** | Semantic zoom (progressive disclosure) | Detail at distance |
| **P2** | Smooth transition animations | Polish |
| **P2** | Force-directed layout toggle | Obsidian-style option |
| **P2** | Orthogonal edges for Blueprint | #2817, #2549 (198 reactions) |
| **P3** | Swimlanes for Map | #2028 (392 reactions) |
| **P3** | @rank and @pin enforcement | #3723, #270 (95 reactions) |
