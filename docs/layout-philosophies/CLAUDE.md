# Layout Philosophies — Guide for AI Agents

Current v1 reality: only `narrative` and `blueprint` have dedicated layout engines in code. `map`, `breath`, `radial`, and `mosaic` are still theme/spacing presets on top of the generic Dagre path and should not be described as shipped custom engines.
Current parser reality: the shipped v1 parser path is `flowchart` only. When a philosophy doc mentions class diagrams, ER diagrams, state diagrams, or C4 as a good fit, treat that as future intent unless there is matching parser/runtime support in code.

## What Is a Philosophy?

A layout philosophy is an opinionated rendering preset that can control FOUR axes:

1. **Layout Algorithm** — how nodes are positioned (dagre, force-directed, radial, grid)
2. **Edge Routing** — how connections are drawn (bezier, orthogonal, straight, none)
3. **Node Arrangement** — how groups/clusters behave (lanes, clusters, rings, cards)
4. **Visual Identity** — colors, fonts, backgrounds, animations

In the abstract, a philosophy can change all four axes. In the current v1 release, only `narrative` and `blueprint` actually ship dedicated layout-engine behavior; the others are mostly theme/spacing presets layered on the shared Dagre path.

## Philosophy Registry

| Philosophy | Algorithm | Edges | Unique Feature |
|------------|-----------|-------|----------------|
| Narrative | Shipped | Dedicated layout engine | Smooth bezier | Center/left/right lane splitting at decisions |
| Blueprint | Shipped | Dedicated layout engine | Straight/diagonal + collision avoidance | Grid background, monospace font, blueprint blue |
| Map | Experimental | Dagre fallback + theme | Straight edges today | Future force-directed clustering |
| Breath | Experimental | Dagre fallback + theme | Whisper-style rendering | Presentation spacing |
| Radial | Experimental | Dagre fallback + theme | Straight edges today | Future radial arrangement |
| Mosaic | Experimental | Dagre fallback + theme | Straight edges today | Future card/proximity layout |

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

Each shipped philosophy maps to:
- A `PhilosophyConfig` in `philosophy-config.ts` (spacing, sizing numbers)
- A `Theme` in `theme.ts` (colors, fonts, visual properties)
- Optionally a different layout engine
- Optionally different edge rendering logic in `edge-graphic.ts`

The `MermaidRenderer` reads the philosophy from the `@layout` directive or programmatic option and wires up the current layout/theme/edge-rendering behavior that actually exists in code. Do not describe a future algorithm as shipped unless there is a matching implementation in `packages/core/src/`.
