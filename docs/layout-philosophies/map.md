# Map

> See the territory at a glance. Scan regions, not sequences.

## Intent

The diagram is a landscape. There's no single reading direction — the viewer surveys the whole thing, then zooms into regions of interest. Groups are the primary unit of meaning. The connections between groups matter more than the sequence within them.

Think: information architecture, service maps, system overviews, org charts, microservice topologies, dependency graphs.

## Gestalt Principles

### Proximity
Related items cluster together with tight spacing. Unrelated groups have generous gaps between them. The whitespace between groups is as meaningful as the groups themselves — it says "these are separate concerns."

### Common Region
Each group has a visible boundary — a subtle background fill, a border, or both. The boundary is the first thing the eye sees. It answers the question: "how is this system organized?"

### Similarity
Nodes of the same type look the same across the entire diagram. A service is always the same shape. A database is always the same shape. This lets the viewer scan for "where are all the databases?" without reading labels.

### Enclosure
Subgraphs are real visual containers, not just labels. They have padding, distinct backgrounds, and clear edges. Nested subgraphs use progressively subtle styling to show depth without clutter.

## Layout Rules

- **Groups first, nodes second.** Layout starts by positioning groups (subgraphs) relative to each other. Then nodes within each group are laid out independently. This prevents a single group's internal complexity from distorting the overall map.
- **Grid alignment between groups.** Groups snap to an implicit grid. This creates order at the macro level even if individual groups have organic internal layouts.
- **Swimlane support.** When the diagram has clear horizontal or vertical lanes (e.g., frontend / backend / data layer), groups align to lanes automatically based on subgraph nesting or explicit hints.
- **Cross-group edges are secondary.** Edges between groups are visually subordinate — thinner, slightly transparent. They show relationships but don't dominate the visual field.
- **Internal edges are primary.** Edges within a group are full-weight. They show how things work inside the region.

## Edge Routing

- **Straight lines between groups.** Long inter-group edges should be direct, not routed through other groups.
- **Curved edges within groups.** Softer curves within a group feel organic and help distinguish from the straighter inter-group connections.
- **Edge bundling.** When multiple edges leave one group heading to the same target group, bundle them visually. Three lines becoming one line says "these things all talk to that region."

## Spacing

- **Generous between groups.** The gaps between groups are the most important whitespace in the diagram. They should be at least 2x the intra-group spacing.
- **Tight within groups.** Nodes within a group are packed closer together to reinforce their relatedness.
- **Group padding is generous.** The space between a group's border and its content should feel comfortable, not cramped.

## Node Sizing

- Consistent sizing within a group. Nodes in the same group should be the same size — this reinforces similarity.
- Group labels are large and prominent — they're the entry point for scanning.
- Node labels are secondary — you read them after you've oriented to the group.

## When To Use

- Information architecture diagrams
- Service blueprints and service maps
- System overview / C4 Context diagrams
- Microservice topologies
- Dependency graphs
- Org charts and team maps
- Any diagram where "what are the main areas?" is the first question

## When NOT To Use

- Diagrams with a clear linear flow (use **Narrative**)
- Dense technical diagrams needing precise alignment (use **Blueprint**)
- Simple diagrams with few nodes (use **Breath**)

## Directive

```mermaid
%% @layout map
```
