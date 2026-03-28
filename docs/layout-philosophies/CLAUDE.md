# Layout Philosophies — Guide for AI Agents

## What Is a Philosophy?

A layout philosophy is an opinionated rendering preset that controls FOUR axes:

1. **Layout Algorithm** — how nodes are positioned (dagre, force-directed, radial, grid)
2. **Edge Routing** — how connections are drawn (bezier, orthogonal, straight, none)
3. **Node Arrangement** — how groups/clusters behave (lanes, clusters, rings, cards)
4. **Visual Identity** — colors, fonts, backgrounds, animations

A philosophy is NOT just colors and spacing. It fundamentally changes the rendering output.

## Philosophy Registry

| Philosophy | Algorithm | Edges | Unique Feature |
|------------|-----------|-------|----------------|
| Narrative | Dagre + flow lanes | Smooth bezier | Center/left/right lane splitting at decisions |
| Map | d3-force (force-directed) | Curved, bundled | Obsidian-style organic clustering |
| Blueprint | Dagre + grid snap | Straight/diagonal + collision avoidance | Grid background, monospace font, blueprint blue |
| Breath | Dagre + 3-4x spacing | Whisper lines (1px, 0.3 opacity) | Presentation mode, huge nodes |
| Radial | Radial tree | Curved arcs | Central node with concentric rings |
| Mosaic | Masonry card grid | No edges (proximity only) | Card layout, no visible connections |

## Adding a New Philosophy

1. Create `docs/layout-philosophies/<name>.md` following the existing structure
2. Add the layout algorithm implementation in `packages/core/src/layout/`
3. Add the theme colors in `packages/core/src/renderer/theme.ts`
4. Add the philosophy config in `packages/core/src/layout/philosophy-config.ts`
5. Register it in the `LayoutPhilosophy` type in `packages/core/src/types.ts`
6. Update the README.md in this directory

## Structure of a Philosophy Spec

Every philosophy file MUST have these sections:
- **Title + tagline** (one-liner intent)
- **Intent** (2-3 sentences, what kind of diagram this is for)
- **Gestalt Principles** (which principles it leverages, with explanation)
- **Layout Algorithm** (exactly how nodes are positioned — not vague)
- **Edge Routing** (how connections are drawn — curves, straight, none?)
- **Spacing** (specific rules for gaps, padding)
- **Node Sizing** (rules for node dimensions)
- **When To Use** (list of diagram types)
- **When NOT To Use** (list of anti-patterns)
- **Directive** (the `%% @layout` syntax)

## Implementation Architecture

Each philosophy maps to:
- A `PhilosophyConfig` in `philosophy-config.ts` (spacing, sizing numbers)
- A `Theme` in `theme.ts` (colors, fonts, visual properties)
- Optionally a different layout engine (dagre vs d3-force vs radial vs grid)
- Optionally different edge rendering logic in `edge-graphic.ts`

The `MermaidRenderer` reads the philosophy from the `@layout` directive or programmatic option and wires up the correct layout engine + theme + edge renderer.
