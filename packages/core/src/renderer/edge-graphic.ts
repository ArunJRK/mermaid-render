import { Graphics, BitmapText } from 'pixi.js'
import type { PositionedEdge, PositionedNode, EdgeStyle } from '../types'
import { ensureFontsInstalled } from './fonts'
import { lineIntersectsRect, computeWaypoint } from '../layout/blueprint-layout'
import type { Theme } from './theme'

const DIMMED_ALPHA = 0.12
const ARROW_SIZE = 8

export class EdgeGraphic extends Graphics {
  readonly data: PositionedEdge
  private _labelText: BitmapText | null = null

  constructor(edge: PositionedEdge, theme: Theme, allNodes?: Map<string, PositionedNode>, philosophy?: string) {
    super()
    // If allNodes provided, apply collision avoidance to the edge points
    if (allNodes) {
      edge = this._applyCollisionAvoidance(edge, allNodes)
    }
    this.data = edge

    switch (philosophy) {
      case 'blueprint':
        this._drawOrthogonal(edge, theme)
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
   */
  private _drawOrthogonal(edge: PositionedEdge, theme: Theme): void {
    const points = edge.points
    if (points.length < 2) return

    const src = points[0]
    const tgt = points[points.length - 1]
    const color = theme.edgeColor
    const gridSize = (theme as any).gridSize ?? 20

    // Snap midpoint to grid
    const midY = Math.round(((src.y + tgt.y) / 2) / gridSize) * gridSize

    // Route: src → down to midY → across to tgt.x → down to tgt
    this.moveTo(src.x, src.y)
    this.lineTo(src.x, midY)          // vertical from source
    this.lineTo(tgt.x, midY)          // horizontal to target column
    this.lineTo(tgt.x, tgt.y)         // vertical to target

    this.stroke({ width: 1.5, color })

    // Arrow
    this._drawArrow([{ x: tgt.x, y: midY }, tgt], color)

    // Label at the horizontal segment midpoint
    if (edge.label) {
      const labelX = (src.x + tgt.x) / 2
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
