import { Container, Graphics, BitmapText } from 'pixi.js'
import type { PositionedSubgraph } from '../types'
import { ensureFontsInstalled } from './fonts'
import type { Theme } from './theme'

const LABEL_PADDING = 10

export class SubgraphContainer extends Container {
  readonly data: PositionedSubgraph
  private _bg: Graphics
  private _label: BitmapText
  private _theme: Theme
  private _depth: number

  constructor(subgraph: PositionedSubgraph, theme: Theme, depth: number = 0) {
    super()
    this.data = subgraph
    this._theme = theme
    this._depth = depth

    this.x = subgraph.x
    this.y = subgraph.y

    const hw = subgraph.width / 2
    const hh = subgraph.height / 2

    // Background — deeper subgraphs are brighter
    this._bg = new Graphics()
    this._drawBg(hw, hh, false)
    this.addChild(this._bg)

    // Label
    ensureFontsInstalled()
    this._label = new BitmapText({
      text: subgraph.label,
      style: { fontFamily: 'MermaidLabel', fontSize: 12 + depth * 0 },
    })
    this._label.x = -hw + LABEL_PADDING
    this._label.y = -hh + LABEL_PADDING
    this.addChild(this._label)

    // Interactive
    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.hitArea = {
      contains: (x: number, y: number) => {
        // Only respond in the label/border area, not the full interior
        // This prevents stealing clicks from child nodes
        const inOuter = x >= -hw && x <= hw && y >= -hh && y <= hh
        const inInner = x >= -hw + 15 && x <= hw - 15 && y >= -hh + 30 && y <= hh - 15
        return inOuter && !inInner // border + label strip only
      },
    }

    // Hover — brighten border
    this.on('pointerover', () => {
      this._bg.clear()
      this._drawBg(hw, hh, true)
    })
    this.on('pointerout', () => {
      this._bg.clear()
      this._drawBg(hw, hh, false)
    })
  }

  private _drawBg(hw: number, hh: number, hovered: boolean): void {
    const t = this._theme
    const w = hw * 2
    const h = hh * 2
    const d = this._depth

    // Deeper nesting = slightly higher fill opacity + thicker border
    const fillAlpha = t.subgraphFillAlpha + d * 0.08
    const strokeAlpha = hovered ? 0.95 : t.subgraphStrokeAlpha + d * 0.1
    const strokeWidth = hovered ? 2.5 + d * 0.5 : 1.5 + d * 0.5
    const cornerRadius = Math.max(4, t.cornerRadius - d * 2) // tighter corners for deeper nesting

    this._bg
      .roundRect(-hw, -hh, w, h, cornerRadius)
      .fill({ color: t.subgraphFill, alpha: fillAlpha })
      .stroke({ width: strokeWidth, color: t.subgraphStroke, alpha: strokeAlpha })

    // Depth indicator — subtle left accent bar for nested subgraphs
    if (d > 0) {
      const barWidth = 3
      this._bg
        .roundRect(-hw, -hh, barWidth, h, cornerRadius)
        .fill({ color: t.subgraphStroke, alpha: 0.6 + d * 0.1 })
    }
  }
}
