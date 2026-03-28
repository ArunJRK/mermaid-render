import type { RenderGraph, PositionedGraph, PositionedNode, PositionedEdge } from '../types'
import type { LayoutEngine, LayoutOptions } from './layout-engine'
import { DagreLayout } from './dagre-layout'

const GRID_SIZE = 20

/**
 * Snap a value to the nearest grid point.
 */
export function snapToGrid(value: number, gridSize: number = GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize
}

/**
 * Check if a line segment from p1 to p2 intersects a rectangle defined by
 * center (cx, cy) and half-dimensions (hw, hh). Uses Liang-Barsky clipping.
 */
export function lineIntersectsRect(
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  cx: number, cy: number,
  hw: number, hh: number,
): boolean {
  const dx = p2x - p1x
  const dy = p2y - p1y
  const minX = cx - hw
  const maxX = cx + hw
  const minY = cy - hh
  const maxY = cy + hh

  // Parametric clipping (Liang-Barsky)
  const p = [-dx, dx, -dy, dy]
  const q = [p1x - minX, maxX - p1x, p1y - minY, maxY - p1y]

  let tMin = 0
  let tMax = 1

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false // parallel and outside
    } else {
      const t = q[i] / p[i]
      if (p[i] < 0) {
        tMin = Math.max(tMin, t)
      } else {
        tMax = Math.min(tMax, t)
      }
      if (tMin > tMax) return false
    }
  }

  return tMin <= tMax
}

/**
 * Compute a waypoint that routes around an obstructing node.
 * Offsets perpendicular to the source-target line by nodeWidth/2 + margin.
 */
export function computeWaypoint(
  srcX: number, srcY: number,
  tgtX: number, tgtY: number,
  obstacleX: number, obstacleY: number,
  obstacleWidth: number,
  _obstacleHeight: number,
  margin: number = 10,
): { x: number; y: number } {
  const dx = tgtX - srcX
  const dy = tgtY - srcY
  const len = Math.sqrt(dx * dx + dy * dy)

  if (len === 0) return { x: obstacleX + obstacleWidth / 2 + margin, y: obstacleY }

  // Perpendicular direction (normalized)
  const perpX = -dy / len
  const perpY = dx / len

  // Determine which side of the line the obstacle center falls on
  // to route on the opposite side
  const cross = dx * (obstacleY - srcY) - dy * (obstacleX - srcX)
  const sign = cross >= 0 ? -1 : 1

  const offset = obstacleWidth / 2 + margin
  return {
    x: obstacleX + sign * perpX * offset,
    y: obstacleY + sign * perpY * offset,
  }
}

/**
 * Given positioned edges and all positioned nodes, check each edge for
 * collisions with non-endpoint nodes and insert waypoints to avoid them.
 */
export function avoidEdgeCollisions(
  edges: PositionedEdge[],
  nodes: Map<string, PositionedNode>,
): PositionedEdge[] {
  const nodeList = Array.from(nodes.values())

  return edges.map((edge) => {
    const srcNode = nodes.get(edge.source)
    const tgtNode = nodes.get(edge.target)
    if (!srcNode || !tgtNode) return edge

    const srcX = srcNode.x
    const srcY = srcNode.y
    const tgtX = tgtNode.x
    const tgtY = tgtNode.y

    // Check all non-endpoint nodes for collision
    for (const node of nodeList) {
      if (node.id === edge.source || node.id === edge.target) continue

      const hw = node.width / 2
      const hh = node.height / 2

      if (lineIntersectsRect(srcX, srcY, tgtX, tgtY, node.x, node.y, hw, hh)) {
        // Route around this node
        const waypoint = computeWaypoint(
          srcX, srcY, tgtX, tgtY,
          node.x, node.y, node.width, node.height,
        )
        return {
          ...edge,
          points: [
            { x: srcX, y: srcY },
            waypoint,
            { x: tgtX, y: tgtY },
          ],
        }
      }
    }

    return edge
  })
}

/**
 * Blueprint layout: Dagre + grid snapping + edge collision avoidance.
 *
 * After dagre computes positions, snaps each node to the nearest 20px grid
 * point and resolves overlaps from snapping. Then checks edges for collisions
 * with non-endpoint nodes and routes around them.
 */
export class BlueprintLayout implements LayoutEngine {
  private _dagre: DagreLayout

  constructor(options?: LayoutOptions) {
    this._dagre = new DagreLayout({ ...options, philosophy: 'blueprint' })
  }

  compute(graph: RenderGraph): PositionedGraph {
    // Run standard dagre layout first
    const result = this._dagre.compute(graph)

    // Snap nodes to grid
    this._snapNodesToGrid(result.nodes)

    // Resolve overlaps caused by snapping
    this._resolveOverlaps(result.nodes)

    // Rebuild edge points to match snapped positions
    const updatedEdges = this._rebuildEdgePoints(result.edges, result.nodes)

    // Apply edge collision avoidance
    const finalEdges = avoidEdgeCollisions(updatedEdges, result.nodes)

    return {
      ...result,
      edges: finalEdges,
    }
  }

  private _snapNodesToGrid(nodes: Map<string, PositionedNode>): void {
    for (const [, node] of nodes) {
      node.x = snapToGrid(node.x)
      node.y = snapToGrid(node.y)
    }
  }

  private _resolveOverlaps(nodes: Map<string, PositionedNode>): void {
    const nodeList = Array.from(nodes.values())
    const maxIterations = 10

    for (let iter = 0; iter < maxIterations; iter++) {
      let hasOverlap = false

      for (let i = 0; i < nodeList.length; i++) {
        for (let j = i + 1; j < nodeList.length; j++) {
          const a = nodeList[i]
          const b = nodeList[j]

          const overlapX = Math.abs(a.x - b.x) < (a.width + b.width) / 2
          const overlapY = Math.abs(a.y - b.y) < (a.height + b.height) / 2

          if (overlapX && overlapY) {
            hasOverlap = true
            // Offset the second node by one grid cell in the direction of less overlap
            const overlapAmountX = (a.width + b.width) / 2 - Math.abs(a.x - b.x)
            const overlapAmountY = (a.height + b.height) / 2 - Math.abs(a.y - b.y)

            if (overlapAmountX <= overlapAmountY) {
              // Shift horizontally
              b.x += (b.x >= a.x ? 1 : -1) * GRID_SIZE
            } else {
              // Shift vertically
              b.y += (b.y >= a.y ? 1 : -1) * GRID_SIZE
            }

            // Re-snap after shift
            b.x = snapToGrid(b.x)
            b.y = snapToGrid(b.y)
          }
        }
      }

      if (!hasOverlap) break
    }
  }

  private _rebuildEdgePoints(
    edges: PositionedEdge[],
    nodes: Map<string, PositionedNode>,
  ): PositionedEdge[] {
    return edges.map((edge) => {
      const src = nodes.get(edge.source)
      const tgt = nodes.get(edge.target)
      if (!src || !tgt) return edge

      return {
        ...edge,
        points: [
          { x: src.x, y: src.y },
          { x: (src.x + tgt.x) / 2, y: (src.y + tgt.y) / 2 },
          { x: tgt.x, y: tgt.y },
        ],
      }
    })
  }
}
