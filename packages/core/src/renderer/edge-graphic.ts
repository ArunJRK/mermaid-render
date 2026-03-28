import { Graphics, BitmapText } from 'pixi.js'
import type { PositionedEdge, EdgeStyle } from '../types'
import { ensureFontsInstalled } from './fonts'
import type { Theme } from './theme'

const DIMMED_ALPHA = 0.12
const ARROW_SIZE = 8

export class EdgeGraphic extends Graphics {
  readonly data: PositionedEdge
  private _labelText: BitmapText | null = null

  constructor(edge: PositionedEdge, theme: Theme) {
    super()
    this.data = edge
    this._draw(edge, theme)
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
}
