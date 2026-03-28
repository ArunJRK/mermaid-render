# Breath

> Space to think. Every element has room. Nothing crowds.

## Intent

The diagram is for an audience that needs to grasp the big picture quickly — often non-technical stakeholders, executives, or anyone seeing this for the first time. The whitespace isn't wasted space — it's the most important design element. It says "this is simple, don't be intimidated."

Think: presentations, stakeholder reviews, C4 Context diagrams, conceptual overviews, onboarding docs, README diagrams.

## Gestalt Principles

### Figure/Ground
Nodes float in generous space. The background is as prominent as the elements. This creates a feeling of calm and clarity — the opposite of a cluttered technical diagram. Each element demands individual attention because it has room.

### Proximity (inverted)
Everything is spaced apart. Even related nodes have breathing room between them. Grouping is communicated through subtle connections and labels, not through tight clustering. The viewer processes one thing at a time.

### Simplicity (Pragnanz)
Fewer visual elements on screen at once. This philosophy pairs naturally with node folding — show only the top-level concepts, let the viewer drill down if they want detail. The default state is "zoomed out."

### Focal Point
The most important node (root, entry point, or central concept) is visually emphasized — larger, bolder, more central. Secondary nodes radiate outward with decreasing visual weight. There is a clear "start here."

## Layout Algorithm

Same dagre but 3-4x spacing multiplier. Node minimum 200x60. Font 18px.

- **Center the focal node.** The most connected or explicitly marked root node sits at the visual center.
- **Radiate outward.** Connected nodes spread outward from center. Not a strict radial layout — more of a "gravitational pull" that keeps the center important.
- **Maximum 5-7 visible nodes by default.** If the diagram has more, fold secondary branches. The viewer can unfold to explore. First impression should be digestible.
- **No node touches another.** Minimum gap between any two elements is 2x the gap used in other philosophies.
- **Subgraphs are subtle.** Group boundaries are soft — a faint background tint, not a hard border. They organize without adding visual noise.

## Edge Routing

1px thin lines, 0.3 opacity — "whisper lines". Barely visible.

- **Minimal edges visible.** If a node has many connections, show only the most important by default. Others appear on hover or selection.
- **No edge labels by default.** Labels add clutter. Show them on hover or when the user selects an edge. Exception: if a label is critical to understanding (like "authenticates" vs "reads from"), it stays.
- **Consistent edge weight.** All edges are the same thickness and style. No visual hierarchy among connections — the hierarchy is in the nodes.

## Visual Identity

Maximum whitespace. Designed for projection/sharing. Readable from across the room.

## Spacing

- **Generous everywhere.** 2-3x the spacing of other philosophies.
- **Proportional to importance.** The focal node has the most space around it. Peripheral nodes can be slightly closer to each other.
- **Vertical rhythm for TD layouts.** If top-down, maintain a slow, steady cadence. Each level of the hierarchy feels like a new paragraph.

## Node Sizing

- **Large nodes.** Nodes are bigger than necessary for the text. The extra padding makes them feel like "cards" — friendly, tappable, approachable.
- **Large fonts.** Readable from across the room on a projected screen.
- **Rounded shapes.** Softer corners, more rounded edges. The visual language is warm, not clinical.
- **Icons over text where possible.** If a node represents a well-known concept (database, user, cloud), prefer an icon with a short label over a text-only box.

## When To Use

- Presentations and slide decks
- C4 Context level diagrams
- Stakeholder-facing overviews
- README and documentation hero diagrams
- First-time viewer onboarding
- Any diagram where "I get the gist in 5 seconds" is the goal

## When NOT To Use

- Diagrams with many nodes that all need to be visible (use **Map** with folding)
- Technical reference diagrams where precision matters (use **Blueprint**)
- Sequential processes where the story matters (use **Narrative**)
- Any context where whitespace feels wasteful (constrained editors, dense docs)

## Directive

```mermaid
%% @layout breath
```
