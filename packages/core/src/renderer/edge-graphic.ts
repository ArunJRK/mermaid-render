import { Graphics, BitmapText } from 'pixi.js'
import type { PositionedEdge, PositionedNode, EdgeStyle } from '../types'
import { ensureFontsInstalled } from './fonts'
import { lineIntersectsRect, computeWaypoint } from '../layout/blueprint-layout'
import type { Theme } from './theme'
import type { WireSegment } from './wire-hops'

const DIMMED_ALPHA = 0.12
const ARROW_SIZE = 8

export class EdgeGraphic extends Graphics {
  readonly data: PositionedEdge
  private _labelText: BitmapText | null = null

  /** Orthogonal wire segments (set by Blueprint mode, read by wire-hop detector) */
  orthogonalSegments?: WireSegment[]

  /**
   * @param edgeIndex — unique index for this edge, used by Blueprint to offset parallel routes
   * @param totalEdges — total edges in the graph, used for channel spacing
   */
  constructor(edge: PositionedEdge, theme: Theme, allNodes?: Map<string, PositionedNode>, philosophy?: string, edgeIndex = 0, totalEdges = 1) {
    super()
    if (allNodes && philosophy !== 'blueprint') {
      edge = this._applyCollisionAvoidance(edge, allNodes)
    }
    this.data = edge

    switch (philosophy) {
      case 'blueprint':
        this._drawOrthogonal(edge, theme, edgeIndex, totalEdges, allNodes)
        break
      case 'breath':
        this._drawWhisper(edge, theme)
        break
      default:
        this._draw(edge, theme)
    }
  }

  /**
   * Check if the edge's straight-line path collides with any non-endpoint node,
   * and if so, insert a waypoint to route around it.
   */
  private _applyCollisionAvoidance(
    edge: PositionedEdge,
    allNodes: Map<string, PositionedNode>,
  ): PositionedEdge {
    const points = edge.points
    if (points.length < 2) return edge

    const srcPt = points[0]
    const tgtPt = points[points.length - 1]

    for (const [id, node] of allNodes) {
      if (id === edge.source || id === edge.target) continue

      const hw = node.width / 2
      const hh = node.height / 2

      if (lineIntersectsRect(srcPt.x, srcPt.y, tgtPt.x, tgtPt.y, node.x, node.y, hw, hh)) {
        const waypoint = computeWaypoint(
          srcPt.x, srcPt.y, tgtPt.x, tgtPt.y,
          node.x, node.y, node.width, node.height,
        )
        return {
          ...edge,
          points: [srcPt, waypoint, tgtPt],
        }
      }
    }

    return edge
  }

  dim(on: boolean): void {
    this.alpha = on ? DIMMED_ALPHA : 1
  }

  private _draw(edge: PositionedEdge, theme: Theme): void {
    const points = edge.points
    if (points.length < 2) return

    const { width: lineWidth, dash } = this._styleParams(edge.style)
    const color = theme.edgeColor

    this.moveTo(points[0].x, points[0].y)

    if (points.length === 2) {
      this.lineTo(points[1].x, points[1].y)
    } else if (points.length === 3) {
      this.quadraticCurveTo(points[1].x, points[1].y, points[2].x, points[2].y)
    } else {
      for (let i = 1; i < points.length - 2; i += 2) {
        const cp1 = points[i]
        const cp2 = points[i + 1]
        const end = points[Math.min(i + 2, points.length - 1)]
        this.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y)
      }
      const lastDrawn = points.length % 2 === 0 ? points.length - 2 : points.length - 1
      for (let i = lastDrawn; i < points.length; i++) {
        this.lineTo(points[i].x, points[i].y)
      }
    }

    this.stroke({ width: lineWidth, color, alpha: dash ? 0.5 : 1 })
    this._drawArrow(points, color)

    if (edge.label) {
      const mid = this._midpoint(points)
      ensureFontsInstalled()
      this._labelText = new BitmapText({
        text: edge.label,
        style: { fontFamily: 'MermaidEdge', fontSize: 11 },
      })
      this._labelText.anchor.set(0.5)
      this._labelText.x = mid.x
      this._labelText.y = mid.y - 10
      this.addChild(this._labelText)
    }
  }

  private _drawArrow(points: Array<{ x: number; y: number }>, color: number): void {
    const last = points[points.length - 1]
    const prev = points[points.length - 2]
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x)

    this.moveTo(last.x, last.y)
    this.lineTo(last.x - ARROW_SIZE * Math.cos(angle - Math.PI / 6), last.y - ARROW_SIZE * Math.sin(angle - Math.PI / 6))
    this.moveTo(last.x, last.y)
    this.lineTo(last.x - ARROW_SIZE * Math.cos(angle + Math.PI / 6), last.y - ARROW_SIZE * Math.sin(angle + Math.PI / 6))
    this.stroke({ width: 2, color })
  }

  private _styleParams(style: EdgeStyle): { width: number; dash: boolean } {
    switch (style) {
      case 'dotted': return { width: 1.5, dash: true }
      case 'thick': return { width: 3, dash: false }
      default: return { width: 1.5, dash: false }
    }
  }

  private _midpoint(points: Array<{ x: number; y: number }>): { x: number; y: number } {
    return points[Math.floor(points.length / 2)]
  }

  /**
   * Blueprint: orthogonal edges with right-angle routing.
   * Goes horizontal to midpoint x, then vertical to target y, then horizontal to target.
   * Snaps to 20px grid.
   *
   * Port-based attachment: wires exit from the BOTTOM of the source node and
   * enter at the TOP of the target node (in TD layout).
   *
   * Junction dots are drawn at bend points where the wire changes direction.
   */
  private _drawOrthogonal(edge: PositionedEdge, theme: Theme, edgeIndex: number, totalEdges: number, allNodes?: Map<string, PositionedNode>): void {
    const points = edge.points
    if (points.length < 2) return

    const src = points[0]
    const tgt = points[points.length - 1]
    const color = theme.edgeColor
    const gridSize = (theme as any).gridSize ?? 20

    // Port-based attachment: exit from bottom of source, enter top of target
    const srcNode = allNodes?.get(edge.source)
    const tgtNode = allNodes?.get(edge.target)
    const srcPort = { x: src.x, y: srcNode ? srcNode.y + srcNode.height / 2 : src.y }
    const tgtPort = { x: tgt.x, y: tgtNode ? tgtNode.y - tgtNode.height / 2 : tgt.y }

    // Find a horizontal channel Y that doesn't pass through any node
    const baseMidY = (srcPort.y + tgtPort.y) / 2
    const channelOffset = (edgeIndex - totalEdges / 2) * gridSize * 0.6
    let midY = Math.round((baseMidY + channelOffset) / gridSize) * gridSize

    // Check if this horizontal channel (from min(src.x, tgt.x) to max(src.x, tgt.x))
    // passes through any node. If so, shift up or down until clear.
    if (allNodes) {
      const minX = Math.min(srcPort.x, tgtPort.x)
      const maxX = Math.max(srcPort.x, tgtPort.x)
      let attempts = 0
      while (attempts < 20) {
        let blocked = false
        for (const [id, node] of allNodes) {
          if (id === edge.source || id === edge.target) continue
          const hw = node.width / 2 + 4  // small padding
          const hh = node.height / 2 + 4
          // Check if horizontal line at midY overlaps with node box
          // and the horizontal span overlaps with the node's x range
          if (midY >= node.y - hh && midY <= node.y + hh &&
              maxX >= node.x - hw && minX <= node.x + hw) {
            blocked = true
            break
          }
        }
        if (!blocked) break
        // Shift channel by one grid step, alternating above/below
        attempts++
        midY += (attempts % 2 === 0 ? 1 : -1) * attempts * gridSize
        midY = Math.round(midY / gridSize) * gridSize
      }
    }

    // Check vertical segments for node collisions and offset if needed
    let srcExitX = srcPort.x
    let tgtEntryX = tgtPort.x

    if (allNodes) {
      // Check source vertical segment (srcPort down to midY)
      for (const [id, node] of allNodes) {
        if (id === edge.source || id === edge.target) continue
        const hw = node.width / 2 + 6
        const hh = node.height / 2 + 6
        // Vertical line at srcExitX from srcPort.y to midY
        const minSegY = Math.min(srcPort.y, midY)
        const maxSegY = Math.max(srcPort.y, midY)
        if (srcExitX >= node.x - hw && srcExitX <= node.x + hw &&
            maxSegY >= node.y - hh && minSegY <= node.y + hh) {
          // Offset source exit X to the side of the blocking node
          srcExitX = srcExitX < node.x ? node.x - hw - gridSize : node.x + hw + gridSize
          srcExitX = Math.round(srcExitX / gridSize) * gridSize
        }
      }
      // Check target vertical segment (midY down to tgtPort)
      for (const [id, node] of allNodes) {
        if (id === edge.source || id === edge.target) continue
        const hw = node.width / 2 + 6
        const hh = node.height / 2 + 6
        const minSegY = Math.min(midY, tgtPort.y)
        const maxSegY = Math.max(midY, tgtPort.y)
        if (tgtEntryX >= node.x - hw && tgtEntryX <= node.x + hw &&
            maxSegY >= node.y - hh && minSegY <= node.y + hh) {
          tgtEntryX = tgtEntryX < node.x ? node.x - hw - gridSize : node.x + hw + gridSize
          tgtEntryX = Math.round(tgtEntryX / gridSize) * gridSize
        }
      }
    }

    // Route with potentially offset vertical segments
    this.moveTo(srcPort.x, srcPort.y)
    if (srcExitX !== srcPort.x) {
      // Jog horizontally to clear, then go vertical
      this.lineTo(srcExitX, srcPort.y)
    }
    this.lineTo(srcExitX, midY)
    this.lineTo(tgtEntryX, midY)
    if (tgtEntryX !== tgtPort.x) {
      this.lineTo(tgtEntryX, tgtPort.y)
      this.lineTo(tgtPort.x, tgtPort.y)
    } else {
      this.lineTo(tgtPort.x, tgtPort.y)
    }

    this.stroke({ width: 1.5, color })

    // Record orthogonal segments for wire-hop detection (use actual routed positions)
    this.orthogonalSegments = [
      { x1: srcExitX, y1: srcPort.y, x2: srcExitX, y2: midY, isHorizontal: false, edgeId: edge.id },
      { x1: srcExitX, y1: midY, x2: tgtEntryX, y2: midY, isHorizontal: true, edgeId: edge.id },
      { x1: tgtEntryX, y1: midY, x2: tgtEntryX, y2: tgtPort.y, isHorizontal: false, edgeId: edge.id },
    ]

    // Arrow pointing into target
    this._drawArrow([{ x: tgtEntryX, y: midY }, tgtPort], color)

    // Label at the horizontal segment midpoint
    if (edge.label) {
      const labelX = (srcPort.x + tgtPort.x) / 2
      ensureFontsInstalled()
      this._labelText = new BitmapText({
        text: edge.label,
        style: { fontFamily: 'MermaidBlueprint', fontSize: 10 },
      })
      this._labelText.anchor.set(0.5)
      this._labelText.x = labelX
      this._labelText.y = midY - 12
      this.addChild(this._labelText)
    }
  }

  /**
   * Breath: whisper lines — barely visible, thin, low opacity.
   * No labels by default.
   */
  private _drawWhisper(edge: PositionedEdge, theme: Theme): void {
    const points = edge.points
    if (points.length < 2) return

    const color = theme.edgeColor

    this.moveTo(points[0].x, points[0].y)
    if (points.length === 2) {
      this.lineTo(points[1].x, points[1].y)
    } else {
      // Gentle quadratic through midpoints
      for (let i = 1; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2
        const yc = (points[i].y + points[i + 1].y) / 2
        this.quadraticCurveTo(points[i].x, points[i].y, xc, yc)
      }
      this.lineTo(points[points.length - 1].x, points[points.length - 1].y)
    }

    // Whisper: thin, low opacity
    this.stroke({ width: 1, color, alpha: 0.25 })

    // Small subtle arrow
    const last = points[points.length - 1]
    const prev = points[points.length - 2]
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x)
    const s = 5
    this.moveTo(last.x, last.y)
    this.lineTo(last.x - s * Math.cos(angle - Math.PI / 6), last.y - s * Math.sin(angle - Math.PI / 6))
    this.moveTo(last.x, last.y)
    this.lineTo(last.x - s * Math.cos(angle + Math.PI / 6), last.y - s * Math.sin(angle + Math.PI / 6))
    this.stroke({ width: 0.8, color, alpha: 0.25 })

    // No label for whisper lines (shown on hover only — future feature)
  }
}
