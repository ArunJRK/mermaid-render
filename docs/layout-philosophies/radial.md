# Radial

> Mind map. Central concept radiates outward.

## Intent

The diagram has a central concept. Everything else orbits around it in concentric rings. First-level connections form the inner ring, second-level the outer ring. Your eye starts at the center and explores outward.

Think: dependency trees, topic exploration, API surface maps, knowledge graphs.

## Gestalt Principles

### Focal Point
The central node is the largest, most prominent element. Everything radiates from it.

### Proximity
Nodes closer to center are more closely related to the core concept. Distance = relationship distance.

### Symmetry
Branches distribute evenly around the center. Balance creates calm.

## Layout Algorithm

- Radial tree layout from the most-connected node (or explicitly marked root)
- First-level connections in a ring at radius R1
- Second-level at radius R2 (R2 = R1 * 1.8)
- Subgraphs occupy arc segments
- Uses d3-hierarchy or custom radial positioning

## Edge Routing

- Curved arcs radiating outward from center
- No straight lines — everything follows the radial flow
- Inner edges (close to center) are thicker, outer edges thinner

## Spacing

- Angular spacing: even distribution around 360°
- Radial spacing: generous gaps between rings
- Branches with more children get more angular space

## Node Sizing

- Center node: 2x normal size, bold label
- First ring: normal size
- Outer rings: progressively smaller

## When To Use

- Dependency trees
- Topic/concept exploration
- API surface maps
- Knowledge graphs
- Any diagram with a clear central concept

## When NOT To Use

- Sequential processes (use Narrative)
- Multi-region systems (use Map)
- Technical reference diagrams (use Blueprint)

## Directive

```mermaid
%% @layout radial
```
