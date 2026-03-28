import { Graphics, Text } from 'pixi.js'
import type { PositionedEdge, EdgeStyle } from '../types'

const EDGE_COLOR = 0x94a3b8
const DIMMED_ALPHA = 0.15
const ARROW_SIZE = 8

/**
 * Draws an edge (with optional label and arrow) between two nodes.
 * Extends PixiJS Graphics directly.
 */
export class EdgeGraphic extends Graphics {
  readonly data: PositionedEdge
  private _labelText: Text | null = null

  constructor(edge: PositionedEdge) {
    super()
    this.data = edge
    this._draw(edge)
  }

  /** Dim or restore the edge for selection highlighting. */
  dim(on: boolean): void {
    this.alpha = on ? DIMMED_ALPHA : 1
  }

  // ── private ──────────────────────────────────────────────

  private _draw(edge: PositionedEdge): void {
    const points = edge.points
    if (points.length < 2) return

    const { width: lineWidth, dash } = this._styleParams(edge.style)

    // Draw the curve through waypoints
    this.moveTo(points[0].x, points[0].y)

    if (points.length === 2) {
      // Straight line
      this.lineTo(points[1].x, points[1].y)
    } else if (points.length === 3) {
      // Quadratic curve through midpoint
      this.quadraticCurveTo(
        points[1].x,
        points[1].y,
        points[2].x,
        points[2].y,
      )
    } else {
      // Multiple waypoints: use bezier segments
      for (let i = 1; i < points.length - 2; i += 2) {
        const cp1 = points[i]
        const cp2 = points[i + 1]
        const end = points[Math.min(i + 2, points.length - 1)]
        this.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y)
      }
      // If remaining points don't fit neatly, draw lines to finish
      const lastDrawn = points.length % 2 === 0 ? points.length - 2 : points.length - 1
      for (let i = lastDrawn; i < points.length; i++) {
        this.lineTo(points[i].x, points[i].y)
      }
    }

    if (dash) {
      // Dotted style uses a thinner dashed approach — PixiJS 8 doesn't have native dash,
      // so we approximate with reduced alpha for dotted lines.
      this.stroke({ width: lineWidth, color: EDGE_COLOR, alpha: 0.6 })
    } else {
      this.stroke({ width: lineWidth, color: EDGE_COLOR })
    }

    // Arrow head at endpoint
    this._drawArrow(points)

    // Optional label
    if (edge.label) {
      const mid = this._midpoint(points)
      this._labelText = new Text({
        text: edge.label,
        style: {
          fontSize: 11,
          fill: 0xcbd5e1,
          fontFamily: 'Inter, system-ui, sans-serif',
        },
        resolution: 4,
      })
      this._labelText.anchor.set(0.5)
      this._labelText.x = mid.x
      this._labelText.y = mid.y - 10
      this.addChild(this._labelText)
    }
  }

  private _drawArrow(points: Array<{ x: number; y: number }>): void {
    const last = points[points.length - 1]
    const prev = points[points.length - 2]

    const angle = Math.atan2(last.y - prev.y, last.x - prev.x)

    this.moveTo(last.x, last.y)
    this.lineTo(
      last.x - ARROW_SIZE * Math.cos(angle - Math.PI / 6),
      last.y - ARROW_SIZE * Math.sin(angle - Math.PI / 6),
    )
    this.moveTo(last.x, last.y)
    this.lineTo(
      last.x - ARROW_SIZE * Math.cos(angle + Math.PI / 6),
      last.y - ARROW_SIZE * Math.sin(angle + Math.PI / 6),
    )
    this.stroke({ width: 2, color: EDGE_COLOR })
  }

  private _styleParams(style: EdgeStyle): { width: number; dash: boolean } {
    switch (style) {
      case 'dotted':
        return { width: 1.5, dash: true }
      case 'thick':
        return { width: 3, dash: false }
      case 'solid':
      default:
        return { width: 1.5, dash: false }
    }
  }

  private _midpoint(points: Array<{ x: number; y: number }>): { x: number; y: number } {
    const mid = Math.floor(points.length / 2)
    return points[mid]
  }
}
