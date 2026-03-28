# Mosaic

> Cards on a wall. No lines, just proximity.

## Intent

The diagram is a collection of items. There's no flow, no hierarchy, no connections to trace. Items are grouped by proximity — things near each other are related. Like sticky notes on a whiteboard, or cards in Trello.

Think: inventories, catalogs, dashboards, capability maps, team rosters.

## Gestalt Principles

### Proximity
The ONLY organizing principle. Related items cluster together. Gaps between clusters signal boundaries.

### Common Region
Subgraphs render as background regions (colored zones). Items within a zone are related.

### Similarity
All cards are the same size and shape. No visual hierarchy among individual items.

## Layout Algorithm

- Masonry/card grid layout
- Each node renders as a large card (300x100)
- Cards arranged in responsive columns (auto-detected from canvas width)
- Subgraph members grouped together, separated by gaps from other groups
- No hierarchical ordering — alphabetical or source-order within groups

## Edge Routing

- **No visible edges.** Connections are implied by proximity and grouping.
- Optional: on hover, faint dotted lines show connections from the hovered card

## Spacing

- Card gap: 16px within a group
- Group gap: 48px between groups
- Cards fill available width in columns

## Node Sizing

- All cards same size: 300x100 (or responsive to longest label)
- Large text: 16px
- Subtitle/metadata line in smaller text below label

## When To Use

- Service catalogs
- Capability maps
- Team/org inventories
- Dashboard-style overviews
- Any collection without meaningful flow

## When NOT To Use

- Anything with directed flow (use Narrative)
- Anything where connections matter (use Map or Blueprint)
- Presentations (use Breath)

## Directive

```mermaid
%% @layout mosaic
```
