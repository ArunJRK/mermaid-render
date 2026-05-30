import type { PositionedGraph, PositionedNode, PositionedEdge } from '../types'
import type { RoutedWire, RouteResult, WireSegment } from './types'
import { GRID_SIZE } from './types'
import { OccupancyGrid } from './occupancy-grid'
import { manhattanRoute, pathToSegments } from './manhattan-router'
import { estimateRenderedNodeFootprint } from '../node-footprint'

export class BlueprintWireBuilder {
  private _graph: PositionedGraph
  private _grid!: OccupancyGrid
  private _g: number
  private _usedFallbackRoute = false

  constructor(graph: PositionedGraph, gridSize: number = GRID_SIZE) {
    this._graph = graph
    this._g = gridSize
  }

  route(): RouteResult {
    const wires: RoutedWire[] = []
    this._usedFallbackRoute = false
    this._buildGrid()
    const orderedEdges = [...this._graph.edges]
      .sort((left, right) => this._compareEdges(left, right))

    // Compute degree maps
    const outDegree = new Map<string, string[]>()
    const inDegree = new Map<string, string[]>()
    for (const edge of orderedEdges) {
      if (edge.source === edge.target) continue // I15: reject self-loops
      if (!outDegree.has(edge.source)) outDegree.set(edge.source, [])
      outDegree.get(edge.source)!.push(edge.id)
      if (!inDegree.has(edge.target)) inDegree.set(edge.target, [])
      inDegree.get(edge.target)!.push(edge.id)
    }

    // Fan-out sources (outDegree >= 2)
    const fanOutSources = new Set<string>()
    for (const [src, edges] of outDegree) {
      if (edges.length >= 2) fanOutSources.add(src)
    }

    // Fan-in targets (inDegree >= 2)
    const fanInTargets = new Set<string>()
    for (const [tgt, edges] of inDegree) {
      if (edges.length >= 2) fanInTargets.add(tgt)
    }

    // Track which edges are handled by bus/merge
    const handled = new Set<string>()

    // Phase 1: Fan-out buses
    for (const srcId of fanOutSources) {
      const srcNode = this._graph.nodes.get(srcId)
      if (!srcNode) continue
      const edges = orderedEdges.filter(e => e.source === srcId)
      const busWires = this._routeFanOut(srcId, srcNode, edges)
      for (const w of busWires) {
        wires.push(w)
        handled.add(w.edgeId)
      }
    }

    // Phase 2: Fan-in merges (for edges not already handled by fan-out)
    for (const tgtId of fanInTargets) {
      const tgtNode = this._graph.nodes.get(tgtId)
      if (!tgtNode) continue
      const edges = orderedEdges.filter(e => e.target === tgtId && !handled.has(e.id))
      if (edges.length < 2) continue
      const mergeWires = this._routeFanIn(tgtId, tgtNode, edges)
      for (const w of mergeWires) {
        wires.push(w)
        handled.add(w.edgeId)
      }
    }

    // Phase 3: Direct routes for remaining single edges
    for (const edge of orderedEdges) {
      if (handled.has(edge.id)) continue
      if (edge.source === edge.target) continue
      const wire = this._routeDirect(edge)
      if (wire) {
        wires.push(wire)
      }
    }

    return { wires, congested: this._usedFallbackRoute }
  }

  private _buildGrid(): void {
    const nodes = Array.from(this._graph.nodes.values())
    if (nodes.length === 0) {
      this._grid = new OccupancyGrid(0, 0, 100, 100, this._g)
      return
    }
    const footprints = nodes.map((node) => estimateRenderedNodeFootprint(node, true))
    const xs = nodes.map(n => n.x)
    const ys = nodes.map(n => n.y)
    const minX = Math.min(...xs.map((x, i) => x - footprints[i].width / 2))
    const minY = Math.min(...ys.map((y, i) => y - footprints[i].height / 2))
    const maxX = Math.max(...xs.map((x, i) => x + footprints[i].width / 2))
    const maxY = Math.max(...ys.map((y, i) => y + footprints[i].height / 2))
    this._grid = new OccupancyGrid(minX, minY, maxX, maxY, this._g)
    for (const node of nodes) {
      this._grid.markNode(node, true)
    }
  }

  private _exitPort(node: PositionedNode): { x: number; y: number } {
    return { x: node.x, y: node.y + node.height / 2 }
  }

  private _entryPort(node: PositionedNode): { x: number; y: number } {
    return { x: node.x, y: node.y - node.height / 2 }
  }

  private _routeAstar(fromX: number, fromY: number, toX: number, toY: number, edgeId: string): WireSegment[] | null {
    const src = this._grid.worldToCell(fromX, fromY)
    const tgt = this._grid.worldToCell(toX, toY)

    // Free source, target, and their immediate neighbors so shared ports work.
    // Ports are inside node inflation zones — we must carve an exit corridor.
    for (const cell of [src, tgt]) {
      this._grid.clearCell(cell.gx, cell.gy)
      this._grid.clearCell(cell.gx, cell.gy - 1)
      this._grid.clearCell(cell.gx, cell.gy + 1)
      this._grid.clearCell(cell.gx - 1, cell.gy)
      this._grid.clearCell(cell.gx + 1, cell.gy)
    }

    const path = manhattanRoute(this._grid, src, tgt)
    if (!path) return null

    // Mark interior cells only — keep first 2 and last 2 free for shared ports
    const markStart = Math.min(2, path.length - 1)
    const markEnd = Math.max(markStart, path.length - 2)
    for (let i = markStart; i < markEnd; i++) {
      this._grid.markPath([path[i]])
    }

    return pathToSegments(path, this._grid, edgeId)
  }

  private _routeDirect(edge: PositionedEdge): RoutedWire | null {
    const srcNode = this._graph.nodes.get(edge.source)
    const tgtNode = this._graph.nodes.get(edge.target)
    if (!srcNode || !tgtNode) return null
    const src = this._exitPort(srcNode)
    const tgt = this._entryPort(tgtNode)
    const segments = this._routeAstar(src.x, src.y, tgt.x, tgt.y, edge.id)
      ?? this._fallbackSegments(src, tgt, edge.id)
    return { edgeId: edge.id, segments, source: edge.source, target: edge.target }
  }

  private _routeFanOut(_srcId: string, srcNode: PositionedNode, edges: PositionedEdge[]): RoutedWire[] {
    const wires: RoutedWire[] = []
    const src = this._exitPort(srcNode)

    for (const edge of edges) {
      const tgtNode = this._graph.nodes.get(edge.target)
      if (!tgtNode) continue
      const tgt = this._entryPort(tgtNode)
      const segments = this._routeAstar(src.x, src.y, tgt.x, tgt.y, edge.id)
        ?? this._fallbackSegments(src, tgt, edge.id)
      wires.push({ edgeId: edge.id, segments, source: edge.source, target: edge.target })
    }
    return wires
  }

  private _routeFanIn(_tgtId: string, tgtNode: PositionedNode, edges: PositionedEdge[]): RoutedWire[] {
    const wires: RoutedWire[] = []
    const tgt = this._entryPort(tgtNode)

    for (const edge of edges) {
      const srcNode = this._graph.nodes.get(edge.source)
      if (!srcNode) continue
      const src = this._exitPort(srcNode)
      const segments = this._routeAstar(src.x, src.y, tgt.x, tgt.y, edge.id)
        ?? this._fallbackSegments(src, tgt, edge.id)
      wires.push({ edgeId: edge.id, segments, source: edge.source, target: edge.target })
    }
    return wires
  }

  private _fallbackSegments(
    src: { x: number; y: number },
    tgt: { x: number; y: number },
    edgeId: string,
  ): WireSegment[] {
    this._usedFallbackRoute = true
    if (src.x === tgt.x || src.y === tgt.y) {
      return [{
        x1: src.x,
        y1: src.y,
        x2: tgt.x,
        y2: tgt.y,
        isHorizontal: src.y === tgt.y,
        edgeId,
      }]
    }

    const midY = Math.round(((src.y + tgt.y) / 2) / this._g) * this._g
    return [
      { x1: src.x, y1: src.y, x2: src.x, y2: midY, isHorizontal: false, edgeId },
      { x1: src.x, y1: midY, x2: tgt.x, y2: midY, isHorizontal: true, edgeId },
      { x1: tgt.x, y1: midY, x2: tgt.x, y2: tgt.y, isHorizontal: false, edgeId },
    ]
  }

  private _compareEdges(left: PositionedEdge, right: PositionedEdge): number {
    return left.id.localeCompare(right.id)
      || left.source.localeCompare(right.source)
      || left.target.localeCompare(right.target)
  }
}
