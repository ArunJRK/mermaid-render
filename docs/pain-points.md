# Pain Points — User Validation

Evidence gathered from Mermaid.js GitHub issues (as of March 2026) confirming the problems mermaid-render solves.

## Summary

The four core features of mermaid-render each map to highly-requested, unresolved Mermaid issues that have been open for years.

## Zoom & Pan

Users cannot zoom or pan Mermaid diagrams. Large diagrams are shrunk to fit the page, becoming unreadable.

- **#1860 — "ZOOM!!!"** (open, 35 reactions, 22 comments)
  Large diagrams are unreadable, no zoom capability exists.
  https://github.com/mermaid-js/mermaid/issues/1860

- **#2162 — "Ability to zoom HTML diagram"** (open, 11 reactions, 13 comments)
  Page shrinks complex flowcharts to fit, unreadable on small screens.
  https://github.com/mermaid-js/mermaid/issues/2162

- **#399 — "Can't Zoom the flowchart?"** (open)
  Diagrams fill the screen with many nodes, can't zoom to see clearly.
  https://github.com/mermaid-js/mermaid/issues/399

- **#535 — "Add drag and zoom?"** (open)
  User created a large graph, needs pan and zoom.
  https://github.com/mermaid-js/mermaid/issues/535

- **#756 — "Text is too small to read when the diagram becomes bigger"** (open)
  Text becomes illegible as diagrams scale.
  https://github.com/mermaid-js/mermaid/issues/756

## Node Folding / Collapse

Complex diagrams overwhelm users. No way to collapse sections and progressively reveal detail.

- **#5508 — "Click/hover to Expand or collapse subgraphs"** (open, 20 reactions, 14 comments)
  Proposes CollapsedByDefault, Expand on hover/click for subgraph sections.
  https://github.com/mermaid-js/mermaid/issues/5508

- **#1123 — "Fold out / collapse flowchart"** (closed, unresolved, 3 reactions)
  "Complicated flow charts are hard to grasp." Wants to see only the start until the first split, then expand branches.
  https://github.com/mermaid-js/mermaid/issues/1123

## Multi-File / Import

No way to decompose large diagrams across files. Common components can't be reused.

- **#4673 — "import / include mmd syntax"** (open, 32 reactions, 8 comments)
  "Mermaid.js should add a syntax for including other mmd files, so that common actors/participants in Sequence and other diagrams can be referenced."
  https://github.com/mermaid-js/mermaid/issues/4673

## Performance on Large Diagrams

Mermaid's SVG renderer chokes on large inputs, freezing the entire browser page.

- **#1216 — "Mermaid hangs up current page on large inputs"** (open)
  Rendering large diagrams makes the page unresponsive.
  https://github.com/mermaid-js/mermaid/issues/1216

- **#6781 — "Excessive vertical space in complex diagrams"**
  Default node height and spacing cause complex diagrams to consume excessive space, impairing readability.
  https://github.com/mermaid-js/mermaid/issues/6781

## Other Relevant Complaints

- Layout issues with C4 diagrams (excessive whitespace)
- Character encoding bugs in mindmaps
- No server-side rendering without a browser environment
- Accessibility: diagrams not accessible to screen readers

## Conclusion

The pain is real, documented, highly upvoted, and unresolved for years (some since 2018). mermaid-render addresses the top 4 most-requested categories of improvements to Mermaid.
