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

  constructor(subgraph: PositionedSubgraph, theme: Theme) {
    super()
    this.data = subgraph
    this._theme = theme

    this.x = subgraph.x
    this.y = subgraph.y

    const hw = subgraph.width / 2
    const hh = subgraph.height / 2

    // Background
    this._bg = new Graphics()
    this._drawBg(hw, hh, false)
    this.addChild(this._bg)

    // Label
    ensureFontsInstalled()
    this._label = new BitmapText({
      text: subgraph.label,
      style: { fontFamily: 'MermaidLabel', fontSize: 12 },
    })
    this._label.x = -hw + LABEL_PADDING
    this._label.y = -hh + LABEL_PADDING
    this.addChild(this._label)

    // Interactive
    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.hitArea = {
      contains: (x: number, y: number) => x >= -hw && x <= hw && y >= -hh && y <= hh,
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
    this._bg
      .roundRect(-hw, -hh, w, h, t.cornerRadius + 2)
      .fill({ color: t.subgraphFill, alpha: hovered ? t.subgraphFillAlpha * 1.8 : t.subgraphFillAlpha })
      .stroke({
        width: hovered ? 2.5 : 1.5,
        color: t.subgraphStroke,
        alpha: hovered ? 0.9 : t.subgraphStrokeAlpha,
      })
  }
}
