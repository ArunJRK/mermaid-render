import dagre from '@dagrejs/dagre'
import { computeNodeWidth } from './text-measure'
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

/**
 * Two-pass dagre layout engine that prevents subgraph overlap.
 *
 * Pass 1 — Cluster layout: each subgraph is treated as a single node.
 *   Dagre positions them with generous spacing.
 *
 * Pass 2 — Internal layout: for each subgraph, dagre runs independently
 *   on its internal nodes. Results are placed within the bounding box
 *   assigned by pass 1.
 *
 * Combine: internal node positions are translated to their subgraph's
 *   assigned global position. Edges are routed between clusters.
 *
 * Falls back to single-pass when there are no subgraphs or when all
 * subgraphs are collapsed.
 */
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

    // Gather active (non-collapsed) subgraphs
    const activeSubgraphs = new Map<string, { id: string; label: string; nodeIds: string[] }>()
    for (const [sgId, sg] of graph.subgraphs) {
      if (!sg.collapsed) {
        const visibleNodes = sg.nodeIds.filter((id) => !hiddenNodeIds.has(id))
        if (visibleNodes.length > 0) {
          activeSubgraphs.set(sgId, { id: sgId, label: sg.label, nodeIds: visibleNodes })
        }
      }
    }

    // Identify orphan nodes (not in any active subgraph)
    const nodesInSubgraphs = new Set<string>()
    for (const sg of activeSubgraphs.values()) {
      for (const nid of sg.nodeIds) nodesInSubgraphs.add(nid)
    }
    const orphanNodeIds: string[] = []
    for (const [id] of graph.nodes) {
      if (!hiddenNodeIds.has(id) && !nodesInSubgraphs.has(id)) {
        orphanNodeIds.push(id)
      }
    }

    // Also include collapsed subgraph summary nodes as orphans in cluster graph
    const collapsedSgIds = Array.from(collapsedSubgraphs.keys())

    // If no active subgraphs, use single-pass layout (original behavior)
    if (activeSubgraphs.size === 0) {
      return this._singlePassLayout(graph, hiddenNodeIds, collapsedSubgraphs)
    }

    // ═══════ PASS 1: Cluster-level layout ═══════
    // Each active subgraph becomes a single node. Orphan nodes and collapsed
    // subgraph summary nodes are also placed as individual nodes.

    const cfg = this.config
    const m = this.multiplier

    // First, compute the internal size of each subgraph
    const internalLayouts = new Map<string, {
      graph: { nodes: Map<string, PositionedNode> }
      width: number
      height: number
    }>()

    for (const [sgId, sg] of activeSubgraphs) {
      const internalEdges = this._getInternalEdges(graph.edges, sg.nodeIds, hiddenNodeIds, collapsedSubgraphs)
      const internalResult = this._layoutInternalNodes(
        graph, sg.nodeIds, internalEdges, graph.direction,
      )
      internalLayouts.set(sgId, internalResult)
    }

    // Build the cluster graph
    const clusterG = new dagre.graphlib.Graph()
    clusterG.setGraph({
      rankdir: toRankDir(graph.direction),
      nodesep: cfg.nodeSep * m * 1.5, // generous cluster spacing
      ranksep: cfg.rankSep * m * 1.5,
      edgesep: cfg.edgeSep * m,
      marginx: cfg.marginX * m,
      marginy: cfg.marginY * m,
    })
    clusterG.setDefaultEdgeLabel(() => ({}))

    // Add active subgraphs as cluster nodes
    const CLUSTER_PADDING = 40 * m
    const LABEL_HEIGHT = 25
    for (const [sgId] of activeSubgraphs) {
      const internal = internalLayouts.get(sgId)!
      clusterG.setNode(sgId, {
        label: sgId,
        width: internal.width + CLUSTER_PADDING * 2,
        height: internal.height + CLUSTER_PADDING * 2 + LABEL_HEIGHT,
      })
    }

    // Add orphan nodes as individual nodes in cluster graph
    for (const nid of orphanNodeIds) {
      const node = graph.nodes.get(nid)!
      clusterG.setNode(nid, {
        label: node.label,
        width: computeNodeWidth(node.label, cfg.nodeMinWidth, cfg.nodePadding),
        height: cfg.nodeMinHeight,
      })
    }

    // Add collapsed subgraph summary nodes
    for (const sgId of collapsedSgIds) {
      const sg = graph.subgraphs.get(sgId)!
      const summaryLabel = `▶ ${sg.label} (${sg.nodeIds.length})`
      clusterG.setNode(sgId, {
        label: summaryLabel,
        width: computeNodeWidth(summaryLabel, cfg.nodeMinWidth * 1.5, cfg.nodePadding),
        height: cfg.nodeMinHeight * 1.2,
      })
    }

    // Add cluster-level edges: edges that cross subgraph boundaries
    // Map each visible node to its cluster (subgraph ID, or self for orphans)
    const nodeToCluster = new Map<string, string>()
    for (const [sgId, sg] of activeSubgraphs) {
      for (const nid of sg.nodeIds) nodeToCluster.set(nid, sgId)
    }
    for (const nid of orphanNodeIds) nodeToCluster.set(nid, nid)
    for (const sgId of collapsedSgIds) nodeToCluster.set(sgId, sgId)

    // Build a map from hidden nodes to their collapsed subgraph
    const nodeToSummary = new Map<string, string>()
    for (const [sgId, nodeIds] of collapsedSubgraphs) {
      for (const nodeId of nodeIds) {
        nodeToSummary.set(nodeId, sgId)
      }
    }

    const clusterEdgeSeen = new Set<string>()
    for (const edge of graph.edges) {
      const source = nodeToSummary.get(edge.source) ?? edge.source
      const target = nodeToSummary.get(edge.target) ?? edge.target
      const srcCluster = nodeToCluster.get(source)
      const tgtCluster = nodeToCluster.get(target)
      if (!srcCluster || !tgtCluster) continue
      if (srcCluster === tgtCluster) continue // internal edge
      const key = `${srcCluster}->${tgtCluster}`
      if (clusterEdgeSeen.has(key)) continue
      clusterEdgeSeen.add(key)
      clusterG.setEdge(srcCluster, tgtCluster, {})
    }

    dagre.layout(clusterG)

    // ═══════ PASS 2: Combine ═══════
    // Position internal nodes relative to their subgraph's cluster position.

    const positionedNodes = new Map<string, PositionedNode>()
    const positionedSubgraphs = new Map<string, PositionedSubgraph>()

    for (const [sgId, sg] of activeSubgraphs) {
      const clusterNode = clusterG.node(sgId)
      const internal = internalLayouts.get(sgId)!

      // Cluster center position
      const cx = clusterNode.x
      const cy = clusterNode.y
      const clusterW = clusterNode.width
      const clusterH = clusterNode.height

      // Internal layout is centered at (internalCenterX, internalCenterY)
      // We need to offset it so it fits within the cluster bounding box
      const offsetX = cx
      const offsetY = cy + LABEL_HEIGHT / 2 // shift down for label

      for (const [nid, nodePos] of internal.graph.nodes) {
        positionedNodes.set(nid, {
          ...nodePos,
          x: nodePos.x + offsetX,
          y: nodePos.y + offsetY,
        })
      }

      // Record subgraph bounds
      const sgData = graph.subgraphs.get(sgId)!
      positionedSubgraphs.set(sgId, {
        ...sgData,
        x: cx,
        y: cy,
        width: clusterW,
        height: clusterH,
      })
    }

    // Place orphan nodes
    for (const nid of orphanNodeIds) {
      const dagreNode = clusterG.node(nid)
      const originalNode = graph.nodes.get(nid)!
      positionedNodes.set(nid, {
        ...originalNode,
        x: dagreNode.x,
        y: dagreNode.y,
        width: dagreNode.width,
        height: dagreNode.height,
      })
    }

    // Place collapsed subgraph summary nodes
    for (const sgId of collapsedSgIds) {
      const dagreNode = clusterG.node(sgId)
      const sg = graph.subgraphs.get(sgId)!
      const originalNode = graph.nodes.get(sgId)

      const summaryLabel = `▶ ${sg.label} (${sg.nodeIds.length})`
      const baseNode = originalNode ?? {
        id: sgId,
        label: summaryLabel,
        shape: 'rounded' as const,
        metadata: { _isCollapsedSummary: true, _subgraphId: sgId, _childCount: sg.nodeIds.length },
      }

      positionedNodes.set(sgId, {
        ...baseNode,
        x: dagreNode.x,
        y: dagreNode.y,
        width: dagreNode.width,
        height: dagreNode.height,
      })

      positionedSubgraphs.set(sgId, {
        ...sg,
        x: dagreNode.x,
        y: dagreNode.y,
        width: dagreNode.width,
        height: dagreNode.height,
      })
    }

    // ═══════ Edge routing ═══════
    // Re-route edges using the final node positions.

    const rerouted = this.rerouteEdges(graph.edges, hiddenNodeIds, collapsedSubgraphs)
    const positionedEdges: PositionedEdge[] = []

    for (const edge of rerouted) {
      const srcNode = positionedNodes.get(edge.source)
      const tgtNode = positionedNodes.get(edge.target)
      if (!srcNode || !tgtNode) continue

      positionedEdges.push({
        ...edge,
        points: [
          { x: srcNode.x, y: srcNode.y },
          { x: (srcNode.x + tgtNode.x) / 2, y: (srcNode.y + tgtNode.y) / 2 },
          { x: tgtNode.x, y: tgtNode.y },
        ],
      })
    }

    // Compute total dimensions
    const graphLabel = clusterG.graph()
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
   * Layout internal nodes of a subgraph independently.
   * Returns centered positions (centered around 0,0).
   */
  private _layoutInternalNodes(
    graph: RenderGraph,
    nodeIds: string[],
    edges: RenderEdge[],
    direction: string,
  ): { graph: { nodes: Map<string, PositionedNode> }; width: number; height: number } {
    const cfg = this.config
    const m = this.multiplier
    const g = new dagre.graphlib.Graph()
    g.setGraph({
      rankdir: toRankDir(direction),
      nodesep: cfg.nodeSep * m,
      ranksep: cfg.rankSep * m,
      edgesep: cfg.edgeSep * m,
      marginx: 10,
      marginy: 10,
    })
    g.setDefaultEdgeLabel(() => ({}))

    for (const nid of nodeIds) {
      const node = graph.nodes.get(nid)
      if (!node) continue
      g.setNode(nid, {
        label: node.label,
        width: computeNodeWidth(node.label, cfg.nodeMinWidth, cfg.nodePadding),
        height: cfg.nodeMinHeight,
      })
    }

    for (const edge of edges) {
      g.setEdge(edge.source, edge.target, {})
    }

    dagre.layout(g)

    const graphLabel = g.graph()
    const layoutWidth = graphLabel.width ?? 0
    const layoutHeight = graphLabel.height ?? 0

    // Center the layout around (0, 0)
    const centerX = layoutWidth / 2
    const centerY = layoutHeight / 2

    const nodes = new Map<string, PositionedNode>()
    for (const nid of g.nodes()) {
      const dagreNode = g.node(nid)
      if (!dagreNode) continue
      const originalNode = graph.nodes.get(nid)
      if (!originalNode) continue
      nodes.set(nid, {
        ...originalNode,
        x: dagreNode.x - centerX,
        y: dagreNode.y - centerY,
        width: dagreNode.width,
        height: dagreNode.height,
      })
    }

    return {
      graph: { nodes },
      width: layoutWidth,
      height: layoutHeight,
    }
  }

  /**
   * Get edges that are internal to a set of node IDs.
   */
  private _getInternalEdges(
    edges: RenderEdge[],
    nodeIds: string[],
    hiddenNodeIds: Set<string>,
    collapsedSubgraphs: Map<string, string[]>,
  ): RenderEdge[] {
    const nodeSet = new Set(nodeIds)
    return edges.filter(
      (e) => nodeSet.has(e.source) && nodeSet.has(e.target)
        && !hiddenNodeIds.has(e.source) && !hiddenNodeIds.has(e.target),
    )
  }

  /**
   * Single-pass layout (fallback for when there are no active subgraphs).
   * Preserves the original dagre compound layout behavior.
   */
  private _singlePassLayout(
    graph: RenderGraph,
    hiddenNodeIds: Set<string>,
    collapsedSubgraphs: Map<string, string[]>,
  ): PositionedGraph {
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
      const sgPadding = 30 * m
      g.setNode(sgId, {
        label: sg.label,
        clusterLabelPos: 'top',
        style: 'fill: none',
        paddingTop: sgPadding + 20,
        paddingBottom: sgPadding,
        paddingLeft: sgPadding,
        paddingRight: sgPadding,
      })
    }

    // Add visible nodes
    for (const [id, node] of graph.nodes) {
      if (hiddenNodeIds.has(id)) continue
      g.setNode(id, {
        label: node.label,
        width: computeNodeWidth(node.label, cfg.nodeMinWidth, cfg.nodePadding),
        height: cfg.nodeMinHeight,
      })

      for (const [sgId, sg] of graph.subgraphs) {
        if (!sg.collapsed && sg.nodeIds.includes(id)) {
          g.setParent(id, sgId)
          break
        }
      }
    }

    // Add summary nodes for collapsed subgraphs
    for (const [sgId] of collapsedSubgraphs) {
      const sg = graph.subgraphs.get(sgId)!
      g.setNode(sgId, {
        label: sg.label,
        width: computeNodeWidth(sg.label, cfg.nodeMinWidth, cfg.nodePadding),
        height: cfg.nodeMinHeight,
      })
    }

    // Route edges
    const edgesToLayout = this.rerouteEdges(
      graph.edges, hiddenNodeIds, collapsedSubgraphs,
    )
    for (const edge of edgesToLayout) {
      g.setEdge(edge.source, edge.target, {})
    }

    dagre.layout(g)

    // Collect non-collapsed subgraph IDs
    const compoundParentIds = new Set<string>()
    for (const [sgId, sg] of graph.subgraphs) {
      if (!sg.collapsed) compoundParentIds.add(sgId)
    }

    // Extract positioned nodes
    const positionedNodes = new Map<string, PositionedNode>()
    for (const nodeId of g.nodes()) {
      if (compoundParentIds.has(nodeId)) continue

      const dagreNode = g.node(nodeId)
      if (!dagreNode) continue

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

    // Extract edges
    const positionedEdges: PositionedEdge[] = []
    for (const edge of edgesToLayout) {
      const dagreEdge = g.edge(edge.source, edge.target)
      if (!dagreEdge) continue

      const points =
        dagreEdge.points && dagreEdge.points.length >= 2
          ? dagreEdge.points
          : [
              { x: g.node(edge.source).x, y: g.node(edge.source).y },
              { x: g.node(edge.target).x, y: g.node(edge.target).y },
            ]

      positionedEdges.push({ ...edge, points })
    }

    // Subgraph bounds
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
              height: maxY - minY + padding * 2 + 20,
            })
          }
        }
      }
    }

    const graphLabel = g.graph()

    return {
      nodes: positionedNodes,
      edges: positionedEdges,
      subgraphs: positionedSubgraphs,
      width: graphLabel.width ?? 0,
      height: graphLabel.height ?? 0,
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

      // Skip self-loops created by collapsing
      if (source === target) continue

      // Deduplicate edges with same source-target pair
      const key = `${source}->${target}`
      if (seen.has(key)) continue
      seen.add(key)

      result.push({ ...edge, source, target })
    }

    return result
  }
}
