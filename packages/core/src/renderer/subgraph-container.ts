import { Container, Graphics, BitmapText } from 'pixi.js'
import type { PositionedSubgraph } from '../types'
import { ensureFontsInstalled } from './fonts'
import { getSubgraphDepthFill, type Theme } from './theme'

const LABEL_PADDING = 10

export class SubgraphContainer extends Container {
  data: PositionedSubgraph
  private _bg: Graphics
  private _label: BitmapText
  private _chevron: BitmapText
  private _badge: BitmapText | null = null
  private _theme: Theme
  private _depth: number
  private _collapsed: boolean
  private _stressMode = false
  private _fontName: string

  constructor(subgraph: PositionedSubgraph, theme: Theme, depth: number = 0, fontName = 'MermaidLabel') {
    super()
    this.data = subgraph
    this._theme = theme
    this._depth = depth
    this._collapsed = subgraph.collapsed
    this._fontName = fontName

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
      style: { fontFamily: fontName, fontSize: 12, fill: theme.subgraphLabel },
    })
    this._label.x = -hw + LABEL_PADDING + 16 // leave room for chevron
    this._label.y = -hh + LABEL_PADDING
    this.addChild(this._label)

    // Chevron indicator (fold state)
    this._chevron = new BitmapText({
      text: subgraph.collapsed ? '\u25B6' : '\u25BC', // right-pointing or down-pointing triangle
      style: { fontFamily: fontName, fontSize: 12, fill: theme.subgraphLabel },
    })
    this._chevron.x = -hw + LABEL_PADDING
    this._chevron.y = -hh + LABEL_PADDING
    this.addChild(this._chevron)

    // Count badge — pill at top-right showing node count
    const nodeCount = subgraph.nodeIds.length
    if (nodeCount > 0) {
      this._badge = new BitmapText({
        text: String(nodeCount),
        style: { fontFamily: fontName, fontSize: 10, fill: theme.subgraphLabel },
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

  updateLayout(subgraph: PositionedSubgraph, depth: number = this._depth, theme: Theme = this._theme, fontName: string = this._fontName): void {
    this.data = subgraph
    this._theme = theme
    this._depth = depth
    this._collapsed = subgraph.collapsed
    this._fontName = fontName
    this.x = subgraph.x
    this.y = subgraph.y

    const hw = subgraph.width / 2
    const hh = subgraph.height / 2

    this._bg.clear()
    this._drawBg(hw, hh, false)

    this._label.text = subgraph.label
    this._label.style.fontFamily = fontName
    this._label.style.fill = theme.subgraphLabel
    this._label.x = -hw + LABEL_PADDING + 16
    this._label.y = -hh + LABEL_PADDING

    this._chevron.text = subgraph.collapsed ? '\u25B6' : '\u25BC'
    this._chevron.style.fontFamily = fontName
    this._chevron.style.fill = theme.subgraphLabel
    this._chevron.x = -hw + LABEL_PADDING
    this._chevron.y = -hh + LABEL_PADDING

    const nodeCount = subgraph.nodeIds.length
    if (nodeCount > 0) {
      if (!this._badge) {
        this._badge = new BitmapText({
          text: String(nodeCount),
          style: { fontFamily: fontName, fontSize: 10, fill: theme.subgraphLabel },
        })
        this._badge.anchor.set(1, 0)
        this.addChild(this._badge)
      }
      this._badge.text = String(nodeCount)
      this._badge.style.fontFamily = fontName
      this._badge.style.fill = theme.subgraphLabel
      this._badge.x = hw - LABEL_PADDING
      this._badge.y = -hh + LABEL_PADDING
    } else if (this._badge) {
      this._badge.removeFromParent()
      this._badge.destroy()
      this._badge = null
    }

    this.hitArea = {
      contains: (x: number, y: number) => {
        const inOuter = x >= -hw && x <= hw && y >= -hh && y <= hh
        const inInner = x >= -hw + 15 && x <= hw - 15 && y >= -hh + 30 && y <= hh - 15
        return inOuter && !inInner
      },
    }
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
  /**
   * zoom is RELATIVE to fitToView (1.0 = default, everything shows).
   * Subgraph labels always show at default zoom.
   */
  updateDetailLevel(zoom: number): void {
    // Labels and indicators always visible at default zoom and above
    this._label.visible = true
    this._label.alpha = zoom < 0.4 ? 0.5 : 1
    this._chevron.visible = !this._stressMode && zoom >= 0.5
    if (this._badge) this._badge.visible = !this._stressMode && zoom >= 0.5
  }

  setStressMode(stressMode: boolean): void {
    this._stressMode = stressMode
    if (stressMode) {
      this._chevron.visible = false
      if (this._badge) this._badge.visible = false
    }
  }

  getDebugStyle(): {
    depth: number
    fillColor: number
    labelFill: number
    labelFontFamily: string
    accent: number
    chevronVisible: boolean
    badgeVisible: boolean
  } {
    return {
      depth: this._depth,
      fillColor: getSubgraphDepthFill(this._theme, this._depth),
      labelFill: this._theme.subgraphLabel,
      labelFontFamily: this._fontName,
      accent: this._theme.accent,
      chevronVisible: this._chevron.visible,
      badgeVisible: this._badge?.visible ?? false,
    }
  }

  private _drawBg(hw: number, hh: number, hovered: boolean): void {
    const t = this._theme
    const w = hw * 2
    const h = hh * 2
    const d = this._depth

    // Determine fill color — Map philosophy uses depth tints
    const fillColor = getSubgraphDepthFill(t, d)

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
