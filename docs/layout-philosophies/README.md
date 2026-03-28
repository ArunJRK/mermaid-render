# Layout Philosophies

A layout philosophy is an opinionated set of rules for how a diagram should look and feel. Each philosophy applies Gestalt principles differently to serve a different reading intent.

## Available Philosophies

| Philosophy | Intent | Best For |
|------------|--------|----------|
| [Narrative](narrative.md) | Read like a story | Flowcharts, decision trees, user journeys |
| [Map](map.md) | See the territory at a glance | Information architecture, service maps, system overviews |
| [Blueprint](blueprint.md) | Precise, technical, aligned | Class diagrams, ER diagrams, C4 component level |
| [Breath](breath.md) | Space to think | Presentations, stakeholder diagrams, conceptual overviews |

## Usage

Set via directive in your `.mmd` file:

```mermaid
%% @layout narrative
```

Or programmatically:

```typescript
renderer.load(source, { layout: 'narrative' })
```

If no philosophy is specified, the renderer picks a default based on diagram type (flowchart → narrative, class → blueprint, etc.).

## Manual Overrides

Every philosophy supports manual overrides that sit on top of the auto-layout:

- **Nudge** — drag a node to adjust position after auto-layout
- **Pin** — lock a node so auto-layout works around it (`%% @pin nodeId x y`)
- **Rank hints** — force nodes to the same level (`%% @rank nodeA nodeB nodeC`)
- **Spacing multiplier** — global knob to tighten or loosen (`%% @spacing 1.5`)

## Contributing a Philosophy

Each philosophy is a single file in this directory. To add a new one:

1. Create a new markdown file (e.g., `your-philosophy.md`)
2. Follow the structure of existing files: Intent, Gestalt Principles, Layout Rules, Edge Routing, Spacing, When To Use
3. Implement the corresponding layout preset in `packages/core/src/layout/philosophies/`
4. Add it to this README

Philosophies should be opinionated. The goal is not to expose every knob — it's to make diagrams that communicate well by default, so users don't have to fight the layout engine.
