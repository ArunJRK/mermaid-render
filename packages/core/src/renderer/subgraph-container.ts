import { Container, Graphics, BitmapText } from 'pixi.js'
import type { PositionedSubgraph } from '../types'
import { ensureFontsInstalled } from './fonts'
import type { Theme } from './theme'

const LABEL_PADDING = 10

export class SubgraphContainer extends Container {
  readonly data: PositionedSubgraph
  private _bg: Graphics
  private _label: BitmapText
  private _chevron: BitmapText
  private _badge: BitmapText | null = null
  private _theme: Theme
  private _depth: number
  private _collapsed: boolean

  constructor(subgraph: PositionedSubgraph, theme: Theme, depth: number = 0) {
    super()
    this.data = subgraph
    this._theme = theme
    this._depth = depth
    this._collapsed = subgraph.collapsed

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
      style: { fontFamily: 'MermaidLabel', fontSize: 12 },
    })
    this._label.x = -hw + LABEL_PADDING + 16 // leave room for chevron
    this._label.y = -hh + LABEL_PADDING
    this.addChild(this._label)

    // Chevron indicator (fold state)
    this._chevron = new BitmapText({
      text: subgraph.collapsed ? '\u25B6' : '\u25BC', // right-pointing or down-pointing triangle
      style: { fontFamily: 'MermaidLabel', fontSize: 12 },
    })
    this._chevron.x = -hw + LABEL_PADDING
    this._chevron.y = -hh + LABEL_PADDING
    this.addChild(this._chevron)

    // Count badge — pill at top-right showing node count
    const nodeCount = subgraph.nodeIds.length
    if (nodeCount > 0) {
      this._badge = new BitmapText({
        text: String(nodeCount),
        style: { fontFamily: 'MermaidLabel', fontSize: 10 },
      })
      this._badge.anchor.set(1, 0)
      this._badge.x = hw - LABEL_PADDING
      this._badge.y = -hh + LABEL_PADDING
      this.addChild(this._badge)
    }

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

  /**
   * Update the fold indicator to reflect collapsed/expanded state.
   */
  setCollapsed(collapsed: boolean): void {
    this._collapsed = collapsed
    this._chevron.text = collapsed ? '\u25B6' : '\u25BC'
  }

  /**
   * Update visibility of detail elements based on semantic zoom level.
   * @param zoom Current viewport zoom level.
   */
  updateDetailLevel(zoom: number): void {
    // Chevron and badge visible at zoom > 0.8x
    const showIndicators = zoom > 0.8
    this._chevron.visible = showIndicators
    if (this._badge) this._badge.visible = showIndicators

    // Labels fade out below 0.8x
    if (zoom < 0.4) {
      this._label.visible = false
    } else if (zoom < 0.8) {
      this._label.visible = true
      this._label.alpha = (zoom - 0.4) / 0.4
    } else {
      this._label.visible = true
      this._label.alpha = 1
    }
  }

  private _drawBg(hw: number, hh: number, hovered: boolean): void {
    const t = this._theme
    const w = hw * 2
    const h = hh * 2
    const d = this._depth

    // Determine fill color — Map philosophy uses depth tints
    let fillColor = t.subgraphFill
    if (t.subgraphDepthTints && t.subgraphDepthTints.length > 0) {
      const tints = t.subgraphDepthTints
      fillColor = tints[Math.min(d, tints.length - 1)]
    }

    // Deeper nesting = slightly higher fill opacity + thicker border
    const fillAlpha = t.subgraphFillAlpha + d * 0.08
    const strokeAlpha = hovered ? 0.95 : t.subgraphStrokeAlpha + d * 0.1
    const strokeWidth = hovered ? 2.5 + d * 0.5 : 1.5 + d * 0.5
    const cornerRadius = Math.max(4, t.cornerRadius - d * 2) // tighter corners for deeper nesting

    // Collapsed subgraphs get dashed-style border (simulated with lower alpha) and different fill
    const effectiveFillAlpha = this._collapsed ? fillAlpha * 0.7 : fillAlpha
    const effectiveStrokeAlpha = this._collapsed ? strokeAlpha * 0.8 : strokeAlpha

    this._bg
      .roundRect(-hw, -hh, w, h, cornerRadius)
      .fill({ color: fillColor, alpha: effectiveFillAlpha })
      .stroke({ width: strokeWidth, color: t.subgraphStroke, alpha: effectiveStrokeAlpha })

    // Depth indicator — subtle left accent bar for nested subgraphs
    if (d > 0) {
      const barWidth = 3
      this._bg
        .roundRect(-hw, -hh, barWidth, h, cornerRadius)
        .fill({ color: t.accent, alpha: 0.4 + d * 0.1 })
    }
  }
}
