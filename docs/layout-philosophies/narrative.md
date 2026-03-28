# Narrative

> Read the diagram like a story. Beginning, middle, end.

## Intent

The diagram has a clear dominant path. Your eye follows it naturally from start to finish. Branches exist but are subordinate — they're side notes, not the main thread. The viewer should immediately understand the sequence of events.

Think: process flows, decision trees, user journeys, onboarding funnels, CI/CD pipelines.

## Gestalt Principles

### Continuity
The main path is a single continuous visual line. The eye never has to jump or search for "what comes next." Edges along the primary path are straight or gently curved, never zigzagging.

### Figure/Ground
The main path is visually prominent (thicker edges, bolder nodes). Branches recede — thinner edges, slightly muted. The reader's brain immediately separates "the story" from "the details."

### Common Fate
Nodes that are part of the same sequential flow move in the same direction. A top-down flow stays top-down. A left-right flow stays left-right. Direction changes signal a branch, not continuation.

## Layout Rules

- **Single dominant axis.** The main path flows along one direction (TD or LR). No switching mid-diagram.
- **Main path detection.** The longest path from entry to exit is the "spine." Layout prioritizes keeping this path straight and centered.
- **Branches offset.** Side branches are visually indented from the spine. They don't compete for center stage.
- **Decision points are prominent.** Diamond/choice nodes get extra spacing around them — they're the moments where the story splits.
- **Merge points are clean.** When branches rejoin, the merge node sits cleanly on the spine, not awkwardly between branches.

## Edge Routing

- **Straight edges** along the main path. No unnecessary curves.
- **Right-angle edges** for branches leaving the spine (a clean 90-degree turn signals "leaving the main path").
- **Minimal crossings.** Edge crossing is the single biggest readability killer. The layout engine should optimize for fewest crossings even at the cost of extra spacing.

## Spacing

- **Tight rhythm along the spine.** Consistent vertical (or horizontal) gap between sequential nodes. This creates a visual pulse — step, step, step.
- **Generous gap before/after decision points.** A breath before a fork. A breath after a merge. Signals "something important happens here."
- **Branches get less spacing.** Tighter gaps within branches communicate "this is a sub-story."

## Node Sizing

- Spine nodes have a minimum width to ensure the path feels solid.
- Branch nodes can be smaller.
- Labels drive size — never truncate on the spine, may truncate on deep branches.

## When To Use

- Flowcharts with a clear start and end
- Decision trees
- User journey maps
- Sequential processes (CI/CD, onboarding, approval flows)
- State machines with a dominant happy path

## When NOT To Use

- Diagrams with no clear directionality (use **Map** instead)
- Dense technical reference diagrams (use **Blueprint**)
- Presentation/overview diagrams where everything needs equal weight (use **Breath**)

## Directive

```mermaid
%% @layout narrative
```
