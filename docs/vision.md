# Vision

## What is mermaid-render?

A high-performance, interactive rendering engine for Mermaid diagrams. It takes Mermaid's text-as-code philosophy and pairs it with a modern WebGL-powered canvas — zoom, pan, fold nodes, navigate across files.

The engine is a standalone, publishable npm library. The first consumer is a VS Code extension. Future consumers could be web apps, Electron tools, or any environment with a canvas element.

## The Gap

Mermaid.js is great for defining diagrams as code but produces static SVGs — no interaction, no folding, no multi-file support.

Tools like Coggle, Miro, and Excalidraw are interactive but don't use a text-based format — you lose version control, diffability, and code-as-documentation.

mermaid-render bridges this: Mermaid syntax in, interactive GPU-rendered canvas out.

## Primary Use Cases

1. **Information Architecture** — navigable IA diagrams with drill-down
2. **C4 Diagrams** — Context, Container, Component, Code levels with fold/unfold between levels
3. **Data Structure / Class Diagrams** — visualize data models with relationships
4. **Service Blueprints** — map service interactions across layers

## Core Features (v1)

- **Interactive canvas** — zoom, pan, smooth animations via WebGL (PixiJS)
- **Node folding** — collapse/expand parts of a diagram like code folding
- **Multi-file projects** — file explorer sidebar to browse .mmd files in a folder
- **Cross-file linking** — nodes reference other files via comment directives, click to navigate
- **Backward compatible** — files remain valid Mermaid syntax; cross-file links use comments

## Deferred (v2+)

- Inline editing (add/modify nodes visually)
- Real-time collaboration
- Accessibility (screen readers, ARIA)
- Export to image/PDF

## Design Principles

- **Rendering engine is the product** — VS Code is just the first shell
- **Zero breakage** — every .mmd file works in standard Mermaid tools too
- **Performance over features** — fast, smooth, responsive canvas first
- **Decomposition reduces cognitive load** — multi-file is a first-class concept, not an afterthought

## License

MIT
