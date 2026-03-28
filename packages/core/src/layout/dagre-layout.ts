import dagre from '@dagrejs/dagre'
import type {
  RenderGraph,
  RenderEdge,
  PositionedGraph,
  PositionedNode,
  PositionedEdge,
  PositionedSubgraph,
} from '../types'
import type { LayoutEngine, LayoutOptions } from './layout-engine'
import { getPhilosophyConfig, type PhilosophyConfig } from './philosophy-config'

/**
 * Maps graph direction strings (TD, TB, LR, BT, RL) to dagre rankdir values.
 */
function toRankDir(direction: string): 'TB' | 'LR' | 'BT' | 'RL' {
  const map: Record<string, 'TB' | 'LR' | 'BT' | 'RL'> = {
    TD: 'TB',
    TB: 'TB',
    LR: 'LR',
    BT: 'BT',
    RL: 'RL',
  }
  return map[direction] ?? 'TB'
}

export class DagreLayout implements LayoutEngine {
  private readonly config: PhilosophyConfig
  private readonly multiplier: number

  constructor(options?: LayoutOptions) {
    const philosophy = options?.philosophy ?? 'narrative'
    this.config = getPhilosophyConfig(philosophy)
    this.multiplier = options?.spacingMultiplier ?? 1.0
  }

  compute(graph: RenderGraph): PositionedGraph {
    // Handle empty graph
    if (graph.nodes.size === 0) {
      return {
        nodes: new Map(),
        edges: [],
        subgraphs: new Map(),
        width: 0,
        height: 0,
      }
    }

    // Determine which nodes are hidden due to collapsed subgraphs
    const hiddenNodeIds = new Set<string>()
    const collapsedSubgraphs = new Map<string, string[]>() // sgId -> nodeIds

    for (const [sgId, sg] of graph.subgraphs) {
      if (sg.collapsed) {
        collapsedSubgraphs.set(sgId, sg.nodeIds)
        for (const nodeId of sg.nodeIds) {
          hiddenNodeIds.add(nodeId)
        }
      }
    }

    // Build the dagre graph
    const g = new dagre.graphlib.Graph()
    const cfg = this.config
    const m = this.multiplier

    g.setGraph({
      rankdir: toRankDir(graph.direction),
      nodesep: cfg.nodeSep * m,
      ranksep: cfg.rankSep * m,
      edgesep: cfg.edgeSep * m,
      marginx: cfg.marginX * m,
      marginy: cfg.marginY * m,
    })
    g.setDefaultEdgeLabel(() => ({}))

    // Add visible nodes
    for (const [id, node] of graph.nodes) {
      if (hiddenNodeIds.has(id)) continue
      g.setNode(id, {
        label: node.label,
        width: Math.max(cfg.nodeMinWidth, node.label.length * 8 + cfg.nodePadding * 2),
        height: cfg.nodeMinHeight,
      })
    }

    // Add summary nodes for collapsed subgraphs
    for (const [sgId, _nodeIds] of collapsedSubgraphs) {
      const sg = graph.subgraphs.get(sgId)!
      g.setNode(sgId, {
        label: sg.label,
        width: Math.max(cfg.nodeMinWidth, sg.label.length * 8 + cfg.nodePadding * 2),
        height: cfg.nodeMinHeight,
      })
    }

    // Reroute and deduplicate edges
    const edgesToLayout = this.rerouteEdges(
      graph.edges,
      hiddenNodeIds,
      collapsedSubgraphs,
    )

    for (const edge of edgesToLayout) {
      g.setEdge(edge.source, edge.target, {})
    }

    // Run dagre layout
    dagre.layout(g)

    // Extract positioned nodes
    const positionedNodes = new Map<string, PositionedNode>()
    for (const nodeId of g.nodes()) {
      const dagreNode = g.node(nodeId)
      if (!dagreNode) continue

      // For summary nodes (collapsed subgraphs), create a synthetic RenderNode
      const originalNode = graph.nodes.get(nodeId)
      const sg = graph.subgraphs.get(nodeId)

      const baseNode = originalNode ?? {
        id: nodeId,
        label: sg?.label ?? nodeId,
        shape: 'rectangle' as const,
        metadata: {},
      }

      positionedNodes.set(nodeId, {
        ...baseNode,
        x: dagreNode.x,
        y: dagreNode.y,
        width: dagreNode.width,
        height: dagreNode.height,
      })
    }

    // Extract positioned edges
    const positionedEdges: PositionedEdge[] = []
    for (const edge of edgesToLayout) {
      const dagreEdge = g.edge(edge.source, edge.target)
      if (!dagreEdge) continue

      const points =
        dagreEdge.points && dagreEdge.points.length >= 2
          ? dagreEdge.points
          : [
              {
                x: g.node(edge.source).x,
                y: g.node(edge.source).y,
              },
              {
                x: g.node(edge.target).x,
                y: g.node(edge.target).y,
              },
            ]

      positionedEdges.push({
        ...edge,
        points,
      })
    }

    // Compute subgraph bounds for non-collapsed subgraphs
    const positionedSubgraphs = new Map<string, PositionedSubgraph>()
    for (const [sgId, sg] of graph.subgraphs) {
      if (sg.collapsed) {
        // Collapsed subgraph: use the summary node position
        const summaryNode = positionedNodes.get(sgId)
        if (summaryNode) {
          positionedSubgraphs.set(sgId, {
            ...sg,
            x: summaryNode.x,
            y: summaryNode.y,
            width: summaryNode.width,
            height: summaryNode.height,
          })
        }
      } else {
        // Compute bounding box from member nodes
        const memberNodes = sg.nodeIds
          .map((id) => positionedNodes.get(id))
          .filter((n): n is PositionedNode => n !== undefined)

        if (memberNodes.length > 0) {
          const padding = cfg.nodePadding * m
          let minX = Infinity
          let minY = Infinity
          let maxX = -Infinity
          let maxY = -Infinity

          for (const node of memberNodes) {
            minX = Math.min(minX, node.x - node.width / 2)
            minY = Math.min(minY, node.y - node.height / 2)
            maxX = Math.max(maxX, node.x + node.width / 2)
            maxY = Math.max(maxY, node.y + node.height / 2)
          }

          const width = maxX - minX + padding * 2
          const height = maxY - minY + padding * 2
          const cx = (minX + maxX) / 2
          const cy = (minY + maxY) / 2

          positionedSubgraphs.set(sgId, {
            ...sg,
            x: cx,
            y: cy,
            width,
            height,
          })
        }
      }
    }

    // Compute total graph dimensions
    const graphLabel = g.graph()
    const totalWidth = graphLabel.width ?? 0
    const totalHeight = graphLabel.height ?? 0

    return {
      nodes: positionedNodes,
      edges: positionedEdges,
      subgraphs: positionedSubgraphs,
      width: totalWidth,
      height: totalHeight,
    }
  }

  /**
   * Reroute edges for collapsed subgraphs: replace references to hidden
   * nodes with the summary node ID, and deduplicate.
   */
  private rerouteEdges(
    edges: RenderEdge[],
    hiddenNodeIds: Set<string>,
    collapsedSubgraphs: Map<string, string[]>,
  ): RenderEdge[] {
    // Build a map from hidden node ID to its owning collapsed subgraph ID
    const nodeToSummary = new Map<string, string>()
    for (const [sgId, nodeIds] of collapsedSubgraphs) {
      for (const nodeId of nodeIds) {
        nodeToSummary.set(nodeId, sgId)
      }
    }

    const seen = new Set<string>()
    const result: RenderEdge[] = []

    for (const edge of edges) {
      const source = nodeToSummary.get(edge.source) ?? edge.source
      const target = nodeToSummary.get(edge.target) ?? edge.target

      // Skip self-loops created by collapsing (both source and target in same subgraph)
      if (source === target) continue

      // Deduplicate edges with same source-target pair
      const key = `${source}->${target}`
      if (seen.has(key)) continue
      seen.add(key)

      result.push({
        ...edge,
        source,
        target,
      })
    }

    return result
  }
}
