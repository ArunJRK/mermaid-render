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

export type Lane = 'LEFT' | 'CENTER' | 'RIGHT'

/**
 * Maps graph direction strings to dagre rankdir values.
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
 * Narrative "flow lanes" layout engine.
 *
 * 1. Detect the spine — longest path from entry to exit node.
 * 2. Assign lanes — spine nodes go CENTER; at decision points (diamonds
 *    with multiple outgoing edges), the first branch stays on the spine
 *    path (RIGHT), and the second branch goes LEFT.
 * 3. After a merge (node with multiple incoming edges), return to CENTER.
 * 4. Use dagre for vertical ordering, then override x-positions to enforce
 *    lane columns: LEFT = -laneWidth, CENTER = 0, RIGHT = +laneWidth.
 * 5. Edge routing: spine edges are straight vertical, cross-lane edges
 *    use smooth bezier curves.
 */
export class NarrativeLayout implements LayoutEngine {
  private readonly config: PhilosophyConfig
  private readonly multiplier: number
  private readonly laneWidth: number

  constructor(options?: LayoutOptions) {
    const philosophy = options?.philosophy ?? 'narrative'
    this.config = getPhilosophyConfig(philosophy)
    this.multiplier = options?.spacingMultiplier ?? 1.0
    // Lane width: wide enough that nodes in adjacent lanes never overlap
    this.laneWidth = (this.config.nodeMinWidth * 2 + this.config.nodeSep * 2) * this.multiplier
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

    // Step 1: Detect spine
    const spine = this.detectSpine(graph)
    const spineSet = new Set(spine)

    // Step 2: Assign lanes
    const lanes = this.assignLanes(graph)

    // Step 3: Use dagre to get vertical ordering (y-positions)
    const dagrePositions = this._runDagre(graph)

    // Step 4: Override x-positions based on lane assignment
    const cfg = this.config
    const m = this.multiplier
    const positionedNodes = new Map<string, PositionedNode>()

    // Compute the center x from dagre's output (use the average x of spine nodes)
    let centerX = 0
    let spineCount = 0
    for (const nodeId of spine) {
      const pos = dagrePositions.get(nodeId)
      if (pos) {
        centerX += pos.x
        spineCount++
      }
    }
    centerX = spineCount > 0 ? centerX / spineCount : 0

    for (const [id, node] of graph.nodes) {
      const dagrePos = dagrePositions.get(id)
      if (!dagrePos) continue

      const lane = lanes.get(id) ?? 'CENTER'
      let x: number
      switch (lane) {
        case 'LEFT':
          x = centerX - this.laneWidth
          break
        case 'RIGHT':
          x = centerX + this.laneWidth
          break
        case 'CENTER':
        default:
          x = centerX
          break
      }

      const width = Math.max(cfg.nodeMinWidth, node.label.length * 8 + cfg.nodePadding * 2)
      const height = cfg.nodeMinHeight

      positionedNodes.set(id, {
        ...node,
        x,
        y: dagrePos.y,
        width,
        height,
      })
    }

    // Step 5: Route edges
    const positionedEdges = this._routeEdges(graph.edges, positionedNodes, spineSet, lanes)

    // Compute subgraph bounds
    const positionedSubgraphs = this._computeSubgraphBounds(graph, positionedNodes)

    // Compute total dimensions
    const allNodes = Array.from(positionedNodes.values())
    if (allNodes.length === 0) {
      return {
        nodes: positionedNodes,
        edges: positionedEdges,
        subgraphs: positionedSubgraphs,
        width: 0,
        height: 0,
      }
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of allNodes) {
      minX = Math.min(minX, node.x - node.width / 2)
      minY = Math.min(minY, node.y - node.height / 2)
      maxX = Math.max(maxX, node.x + node.width / 2)
      maxY = Math.max(maxY, node.y + node.height / 2)
    }

    const marginX = cfg.marginX * m
    const marginY = cfg.marginY * m

    return {
      nodes: positionedNodes,
      edges: positionedEdges,
      subgraphs: positionedSubgraphs,
      width: maxX - minX + marginX * 2,
      height: maxY - minY + marginY * 2,
    }
  }

  /**
   * Detect the spine: the longest path from an entry node (no incoming edges)
   * to an exit node (no outgoing edges).
   *
   * Uses DFS with memoization to find the longest path in the DAG.
   * For cyclic graphs, tracks visited nodes to avoid infinite loops.
   */
  detectSpine(graph: RenderGraph): string[] {
    if (graph.nodes.size === 0) return []

    // Build adjacency list
    const outgoing = new Map<string, string[]>()
    const incoming = new Map<string, string[]>()
    for (const [id] of graph.nodes) {
      outgoing.set(id, [])
      incoming.set(id, [])
    }
    for (const edge of graph.edges) {
      if (graph.nodes.has(edge.source) && graph.nodes.has(edge.target)) {
        outgoing.get(edge.source)!.push(edge.target)
        incoming.get(edge.target)!.push(edge.source)
      }
    }

    // Find entry nodes (no incoming edges)
    const entryNodes: string[] = []
    for (const [id] of graph.nodes) {
      if (incoming.get(id)!.length === 0) {
        entryNodes.push(id)
      }
    }

    // If no entry nodes (cycle), pick first node
    if (entryNodes.length === 0) {
      entryNodes.push(graph.nodes.keys().next().value as string)
    }

    // DFS with memoization to find longest path from each node
    const memo = new Map<string, string[]>()
    const inProgress = new Set<string>()

    const longestFrom = (nodeId: string): string[] => {
      if (memo.has(nodeId)) return memo.get(nodeId)!
      if (inProgress.has(nodeId)) return [nodeId] // cycle detected

      inProgress.add(nodeId)
      const neighbors = outgoing.get(nodeId) ?? []

      let bestPath: string[] = [nodeId]
      for (const next of neighbors) {
        const subpath = longestFrom(next)
        if (subpath.length + 1 > bestPath.length) {
          bestPath = [nodeId, ...subpath]
        }
      }

      inProgress.delete(nodeId)
      memo.set(nodeId, bestPath)
      return bestPath
    }

    // Find longest path from any entry node
    let spine: string[] = []
    for (const entry of entryNodes) {
      const path = longestFrom(entry)
      if (path.length > spine.length) {
        spine = path
      }
    }

    return spine
  }

  /**
   * Assign each node to a lane: LEFT, CENTER, or RIGHT.
   *
   * - Spine nodes -> CENTER
   * - At decision nodes (diamonds with 2+ outgoing), the branch that continues
   *   on the spine stays CENTER. The first off-spine branch -> RIGHT, second -> LEFT.
   * - Nodes with multiple incoming edges (merge nodes) -> CENTER.
   */
  assignLanes(graph: RenderGraph): Map<string, Lane> {
    const spine = this.detectSpine(graph)
    const spineSet = new Set(spine)
    const lanes = new Map<string, Lane>()

    // Build adjacency
    const outgoing = new Map<string, string[]>()
    const incoming = new Map<string, string[]>()
    for (const [id] of graph.nodes) {
      outgoing.set(id, [])
      incoming.set(id, [])
    }
    for (const edge of graph.edges) {
      if (graph.nodes.has(edge.source) && graph.nodes.has(edge.target)) {
        outgoing.get(edge.source)!.push(edge.target)
        incoming.get(edge.target)!.push(edge.source)
      }
    }

    // All spine nodes are CENTER
    for (const nodeId of spine) {
      lanes.set(nodeId, 'CENTER')
    }

    // Merge nodes (multiple incoming edges) are always CENTER
    for (const [id] of graph.nodes) {
      if (incoming.get(id)!.length > 1) {
        lanes.set(id, 'CENTER')
      }
    }

    // At decision nodes on the spine, assign off-spine branches
    for (const nodeId of spine) {
      const neighbors = outgoing.get(nodeId) ?? []
      if (neighbors.length <= 1) continue

      // Find which neighbor is on the spine (spine-continuation)
      const spineNext = neighbors.find((n) => spineSet.has(n))
      const offSpine = neighbors.filter((n) => n !== spineNext)

      // Assign off-spine branches
      let branchIndex = 0
      for (const branchTarget of offSpine) {
        if (lanes.has(branchTarget)) continue // already assigned (e.g., merge node)

        const lane: Lane = branchIndex === 0 ? 'LEFT' : 'RIGHT'
        branchIndex++

        // Assign this node and follow its chain until we hit a merge or spine node
        this._assignBranchLane(branchTarget, lane, lanes, outgoing, spineSet, incoming)
      }
    }

    // Any unassigned nodes default to CENTER
    for (const [id] of graph.nodes) {
      if (!lanes.has(id)) {
        lanes.set(id, 'CENTER')
      }
    }

    return lanes
  }

  /**
   * Recursively assign a lane to a branch chain until we hit a spine or merge node.
   */
  private _assignBranchLane(
    nodeId: string,
    lane: Lane,
    lanes: Map<string, Lane>,
    outgoing: Map<string, string[]>,
    spineSet: Set<string>,
    incoming: Map<string, string[]>,
  ): void {
    if (lanes.has(nodeId)) return // already assigned
    if (spineSet.has(nodeId)) return // spine node, keep CENTER

    // Merge nodes (multiple incoming) always go to CENTER
    if (incoming.get(nodeId)!.length > 1) {
      lanes.set(nodeId, 'CENTER')
      return
    }

    lanes.set(nodeId, lane)

    // Follow the chain
    const neighbors = outgoing.get(nodeId) ?? []
    for (const next of neighbors) {
      this._assignBranchLane(next, lane, lanes, outgoing, spineSet, incoming)
    }
  }

  /**
   * Run dagre to get y-positions (vertical ordering) for all nodes.
   * Returns a map of nodeId -> { x, y, width, height } from dagre.
   */
  private _runDagre(graph: RenderGraph): Map<string, { x: number; y: number; width: number; height: number }> {
    const cfg = this.config
    const m = this.multiplier
    const g = new dagre.graphlib.Graph()

    g.setGraph({
      rankdir: toRankDir(graph.direction),
      nodesep: cfg.nodeSep * m,
      ranksep: cfg.rankSep * m,
      edgesep: cfg.edgeSep * m,
      marginx: cfg.marginX * m,
      marginy: cfg.marginY * m,
    })
    g.setDefaultEdgeLabel(() => ({}))

    for (const [id, node] of graph.nodes) {
      g.setNode(id, {
        label: node.label,
        width: Math.max(cfg.nodeMinWidth, node.label.length * 8 + cfg.nodePadding * 2),
        height: cfg.nodeMinHeight,
      })
    }

    for (const edge of graph.edges) {
      if (graph.nodes.has(edge.source) && graph.nodes.has(edge.target)) {
        g.setEdge(edge.source, edge.target, {})
      }
    }

    dagre.layout(g)

    const positions = new Map<string, { x: number; y: number; width: number; height: number }>()
    for (const nodeId of g.nodes()) {
      const dagreNode = g.node(nodeId)
      if (dagreNode) {
        positions.set(nodeId, {
          x: dagreNode.x,
          y: dagreNode.y,
          width: dagreNode.width,
          height: dagreNode.height,
        })
      }
    }

    return positions
  }

  /**
   * Route edges with appropriate curves:
   * - Spine edges (both endpoints in CENTER): straight vertical line
   * - Cross-lane edges: smooth bezier with control points
   */
  private _routeEdges(
    edges: RenderEdge[],
    nodes: Map<string, PositionedNode>,
    spineSet: Set<string>,
    lanes: Map<string, Lane>,
  ): PositionedEdge[] {
    const positionedEdges: PositionedEdge[] = []

    for (const edge of edges) {
      const srcNode = nodes.get(edge.source)
      const tgtNode = nodes.get(edge.target)
      if (!srcNode || !tgtNode) continue

      const srcLane = lanes.get(edge.source) ?? 'CENTER'
      const tgtLane = lanes.get(edge.target) ?? 'CENTER'
      const isSameLane = srcLane === tgtLane

      let points: Array<{ x: number; y: number }>

      if (isSameLane) {
        // Straight vertical edge along the lane
        points = [
          { x: srcNode.x, y: srcNode.y },
          { x: tgtNode.x, y: tgtNode.y },
        ]
      } else {
        // Cross-lane: bezier curve with control points
        // Control points at 1/3 and 2/3 of the y-distance,
        // easing the x-transition
        const dy = tgtNode.y - srcNode.y
        const dx = tgtNode.x - srcNode.x

        points = [
          { x: srcNode.x, y: srcNode.y },
          { x: srcNode.x + dx * 0.15, y: srcNode.y + dy * 0.33 },
          { x: srcNode.x + dx * 0.5, y: srcNode.y + dy * 0.5 },
          { x: srcNode.x + dx * 0.85, y: srcNode.y + dy * 0.67 },
          { x: tgtNode.x, y: tgtNode.y },
        ]
      }

      positionedEdges.push({ ...edge, points })
    }

    return positionedEdges
  }

  /**
   * Compute subgraph bounding boxes from positioned member nodes.
   */
  private _computeSubgraphBounds(
    graph: RenderGraph,
    positionedNodes: Map<string, PositionedNode>,
  ): Map<string, PositionedSubgraph> {
    const positionedSubgraphs = new Map<string, PositionedSubgraph>()
    const m = this.multiplier
    const padding = 30 * m

    for (const [sgId, sg] of graph.subgraphs) {
      const memberNodes = sg.nodeIds
        .map((id) => positionedNodes.get(id))
        .filter((n): n is PositionedNode => n !== undefined)

      if (memberNodes.length === 0) continue

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

    return positionedSubgraphs
  }
}
