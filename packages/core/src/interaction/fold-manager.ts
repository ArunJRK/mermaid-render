import type { RenderGraph } from '../types'

export class FoldManager {
  private readonly graph: RenderGraph

  constructor(graph: RenderGraph) {
    this.graph = graph
  }

  /**
   * Toggle the collapsed state of a subgraph.
   * Returns the new collapsed state, or false if subgraph not found.
   */
  toggle(subgraphId: string): boolean {
    const sg = this.graph.subgraphs.get(subgraphId)
    if (!sg) return false
    sg.collapsed = !sg.collapsed
    return sg.collapsed
  }

  /** Collapse all subgraphs. */
  foldAll(): void {
    for (const sg of this.graph.subgraphs.values()) {
      sg.collapsed = true
    }
  }

  /** Expand all subgraphs. */
  unfoldAll(): void {
    for (const sg of this.graph.subgraphs.values()) {
      sg.collapsed = false
    }
  }
}
