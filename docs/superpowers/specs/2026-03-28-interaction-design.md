# Interaction Design Spec: Navigation, Folding, and Visual Identity

**Date:** 2026-03-28
**Status:** Draft
**Problem:** Current renderer has overlapping subgraphs, no navigation model, childish colors, no fold indicators, no progressive disclosure on zoom.

---

## 1. Core Interaction Model: Semantic Zoom + Breadcrumb Navigation

Instead of "fold collapses to summary node" (confusing), use a **focus-based navigation model**:

### 1.1 Focus Navigation

- **Default view:** Show top-level subgraphs as cards. Each card shows its label, node count, and a preview of its internal structure (faint, simplified).
- **Click a subgraph:** "Focus into" it — the viewport zooms/animates to fill the screen with that subgraph's contents. Other subgraphs fade to the periphery.
- **Breadcrumb bar** at the top shows the navigation path: `Root > Core Services > Order Processing`
- **Click breadcrumb** to navigate back up. Click "Root" to see the full diagram again.
- **Double-click** a subgraph to toggle traditional fold (collapse children to summary node) for users who want that.

### 1.2 Breadcrumb Bar

Fixed at top of canvas. Shows: `[icon] Root  >  API Layer  >  Auth Service`

- Each segment is clickable
- Current focus is bold/highlighted
- Animates smoothly when navigating

### 1.3 Progressive Disclosure on Zoom

When zoomed out:
- Subgraph cards show only label + node count badge
- Internal nodes are hidden or shown as tiny dots

When zooming in toward a subgraph:
- At 1.5x zoom: internal node labels start to appear (faded)
- At 2x zoom: full detail visible
- This creates a natural "reveal on zoom" feeling

---

## 2. Fold Indicators

Every foldable subgraph gets a visual indicator:

- **Expanded state:** `▼` chevron icon next to the label
- **Collapsed state:** `▶` chevron icon + node count badge (e.g., "▶ Core Services (5)")
- **Hover:** Chevron highlights, tooltip says "Click to expand/collapse"

---

## 3. Color Themes — Professional Palettes

Replace the current saturated children's-book colors with sophisticated, muted palettes.

### 3.1 Narrative — "Ink & Paper"
Inspired by technical documentation. Clean, readable.
- Background: `#0d1117` (GitHub dark)
- Nodes: `#161b22` fill, `#8b949e` stroke
- Selected: `#58a6ff` stroke
- Text: `#e6edf3`
- Edges: `#484f58`
- Subgraphs: `#161b22` fill at 40%, `#30363d` stroke
- Accent: `#58a6ff` (blue, used sparingly for selection/active states)

### 3.2 Map — "Terrain"
Inspired by cartography. Warm, earthy, regions feel like territories.
- Background: `#1a1a2e`
- Nodes: `#16213e` fill, `#0f3460` stroke
- Selected: `#e94560` stroke
- Text: `#eaeaea`
- Edges: `#533483`
- Subgraphs: Different fill per depth level:
  - Depth 0: `#0f3460` at 20%
  - Depth 1: `#533483` at 20%
  - Depth 2: `#e94560` at 10%

### 3.3 Blueprint — "Technical Drawing"
Inspired by engineering blueprints. Grid feel, precise.
- Background: `#0a192f`
- Nodes: `#112240` fill, `#233554` stroke
- Selected: `#64ffda` stroke
- Text: `#ccd6f6`
- Edges: `#233554`
- Subgraphs: `#112240` fill at 30%, `#233554` stroke, dashed

### 3.4 Breath — "Warm Minimal"
Inspired by modern design tools (Linear, Notion dark). Calm, spacious.
- Background: `#111111`
- Nodes: `#1a1a1a` fill, `#333333` stroke
- Selected: `#ffffff` stroke
- Text: `#eeeeee`
- Edges: `#444444`
- Subgraphs: `#1a1a1a` fill at 25%, `#333333` stroke
- Accent: subtle warm white, minimal color

---

## 4. Layout Fixes

### 4.1 Subgraph Separation
Subgraphs MUST NOT overlap. Current dagre compound graph still produces overlaps because:
- Subgraph padding is too small
- Some nodes belong to multiple conceptual groups but only one subgraph

Fix: Increase compound node padding. Add minimum gap between subgraph bounding boxes in post-layout pass.

### 4.2 Text Legibility
- Minimum font size: 11px at default zoom
- Maximum node label: 30 characters before truncation
- Node minimum size must accommodate label + padding
- At zoom < 0.5x, hide labels and show shapes only

### 4.3 Nesting Depth Visualization
Each nesting level gets:
- Progressively lighter/brighter fill opacity
- Progressively thinner borders (outermost = thickest)
- Left accent bar for depth > 0 (colored per philosophy)

---

## 5. Transition Animations

All state changes should animate over 250-400ms:

- **Focus into subgraph:** viewport zooms and pans to center on the subgraph. Other elements fade to 20% opacity.
- **Focus out (breadcrumb click):** reverse — viewport zooms out, other elements fade back in.
- **Fold/unfold:** children fade in/out, layout interpolates to new positions.
- **Philosophy switch:** crossfade between old and new rendering (opacity transition).

---

## 6. Implementation Priority

1. **Fix subgraph overlap** — increase dagre compound padding, post-layout gap enforcement
2. **Professional color themes** — replace current palettes
3. **Breadcrumb bar** — HTML overlay, not canvas-rendered
4. **Fold indicators** — chevron icons on subgraphs
5. **Focus navigation** — click subgraph to zoom into it
6. **Progressive disclosure** — hide detail at low zoom, reveal on zoom in
7. **Transition animations** — smooth state changes
