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

    // Build the dagre graph with compound support for subgraph grouping
    const g = new dagre.graphlib.Graph({ compound: true })
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

    // Add subgraph group nodes (compound parents) for non-collapsed subgraphs
    for (const [sgId, sg] of graph.subgraphs) {
      if (sg.collapsed) continue
      // Add the subgraph as a compound parent with padding
      const sgPadding = 30 * m
      g.setNode(sgId, {
        label: sg.label,
        clusterLabelPos: 'top',
        style: 'fill: none',
        // Extra padding so children don't overlap the border
        paddingTop: sgPadding + 20, // room for label
        paddingBottom: sgPadding,
        paddingLeft: sgPadding,
        paddingRight: sgPadding,
      })
    }

    // Add visible nodes and assign them to their parent subgraph
    for (const [id, node] of graph.nodes) {
      if (hiddenNodeIds.has(id)) continue
      g.setNode(id, {
        label: node.label,
        width: Math.max(cfg.nodeMinWidth, node.label.length * 8 + cfg.nodePadding * 2),
        height: cfg.nodeMinHeight,
      })

      // Set parent to subgraph if this node belongs to one
      for (const [sgId, sg] of graph.subgraphs) {
        if (!sg.collapsed && sg.nodeIds.includes(id)) {
          g.setParent(id, sgId)
          break
        }
      }
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

    // Collect non-collapsed subgraph IDs — these are compound parents, not real nodes
    const compoundParentIds = new Set<string>()
    for (const [sgId, sg] of graph.subgraphs) {
      if (!sg.collapsed) compoundParentIds.add(sgId)
    }

    // Extract positioned nodes (skip compound parent IDs — they become subgraph visuals)
    const positionedNodes = new Map<string, PositionedNode>()
    for (const nodeId of g.nodes()) {
      if (compoundParentIds.has(nodeId)) continue // this is a subgraph group, not a node

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

    // Compute subgraph bounds — dagre compound graph gives us positions for group nodes
    const positionedSubgraphs = new Map<string, PositionedSubgraph>()
    for (const [sgId, sg] of graph.subgraphs) {
      if (sg.collapsed) {
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
        // Try dagre's compound node position first
        const dagreGroup = g.node(sgId)
        if (dagreGroup && dagreGroup.width > 0) {
          positionedSubgraphs.set(sgId, {
            ...sg,
            x: dagreGroup.x,
            y: dagreGroup.y,
            width: dagreGroup.width,
            height: dagreGroup.height,
          })
        } else {
          // Fallback: compute from member positions
          const memberNodes = sg.nodeIds
            .map((id) => positionedNodes.get(id))
            .filter((n): n is PositionedNode => n !== undefined)

          if (memberNodes.length > 0) {
            const padding = 30 * m
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
            for (const node of memberNodes) {
              minX = Math.min(minX, node.x - node.width / 2)
              minY = Math.min(minY, node.y - node.height / 2)
              maxX = Math.max(maxX, node.x + node.width / 2)
              maxY = Math.max(maxY, node.y + node.height / 2)
            }
            positionedSubgraphs.set(sgId, {
              ...sg,
              x: (minX + maxX) / 2,
              y: (minY + maxY) / 2,
              width: maxX - minX + padding * 2,
              height: maxY - minY + padding * 2 + 20, // extra for label
            })
          }
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
