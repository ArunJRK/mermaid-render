import { Container, Graphics, BitmapText } from 'pixi.js'
import type { PositionedNode, NodeShape } from '../types'
import { ensureFontsInstalled } from './fonts'
import type { Theme } from './theme'

export class NodeSprite extends Container {
  readonly data: PositionedNode
  private _gfx: Graphics
  private _hoverGfx: Graphics
  private _label: BitmapText
  private _linkBadge: Graphics | null = null
  private _selected = false
  private _theme: Theme

  constructor(node: PositionedNode, theme: Theme, hasLink = false) {
    super()
    this.data = node
    this._theme = theme

    this.x = node.x
    this.y = node.y

    this.eventMode = 'static'
    this.cursor = 'pointer'

    // Hover glow (behind everything)
    this._hoverGfx = new Graphics()
    this._hoverGfx.alpha = 0
    this.addChild(this._hoverGfx)
    this._drawHoverGlow(node.shape, node.width + 12, node.height + 12)

    // Main shape
    this._gfx = new Graphics()
    this._drawShape(node.shape, node.width, node.height, theme.nodeStroke)
    this.addChild(this._gfx)

    // Label
    ensureFontsInstalled()
    this._label = new BitmapText({
      text: node.label,
      style: { fontFamily: 'MermaidNode', fontSize: 14 },
    })
    this._label.anchor.set(0.5)
    this.addChild(this._label)

    // Link badge — small arrow icon at top-right corner indicating "has linked file"
    if (hasLink) {
      this._linkBadge = new Graphics()
      const bx = node.width / 2 - 6
      const by = -node.height / 2 + 6
      // Small circle with arrow
      this._linkBadge.circle(bx, by, 8)
      this._linkBadge.fill({ color: theme.accent, alpha: 0.9 })
      // Arrow symbol drawn as lines
      this._linkBadge.moveTo(bx - 3, by + 2).lineTo(bx, by - 3).lineTo(bx + 3, by + 2)
      this._linkBadge.stroke({ width: 1.5, color: theme.nodeFill })
      this.addChild(this._linkBadge)
    }

    // Hit area
    this.hitArea = {
      contains: (x: number, y: number) => {
        const hw = node.width / 2 + 4
        const hh = node.height / 2 + 4
        return x >= -hw && x <= hw && y >= -hh && y <= hh
      },
    }

    // Hover events
    this.on('pointerover', () => { this._hoverGfx.alpha = 1 })
    this.on('pointerout', () => { if (!this._selected) this._hoverGfx.alpha = 0 })
  }

  setSelected(selected: boolean): void {
    if (this._selected === selected) return
    this._selected = selected
    this._gfx.clear()
    this._drawShape(
      this.data.shape, this.data.width, this.data.height,
      selected ? this._theme.nodeStrokeSelected : this._theme.nodeStroke,
    )
    this._hoverGfx.alpha = selected ? 1 : 0
  }

  /**
   * Update visibility of detail elements based on semantic zoom level.
   * @param zoom Current viewport zoom level.
   */
  /**
   * Update visibility based on semantic zoom.
   * zoom is RELATIVE to fitToView (1.0 = default view, everything should show).
   * Hiding only kicks in below 0.5 (user zoomed out beyond default).
   */
  updateDetailLevel(zoom: number): void {
    if (zoom < 0.3) {
      this._label.visible = false
      this._gfx.alpha = 0.4
    } else if (zoom < 0.6) {
      this._label.visible = false
      this._gfx.alpha = 0.6 + (zoom - 0.3) / 0.3 * 0.4
    } else {
      // At default zoom and above: full detail
      this._label.visible = true
      this._label.alpha = 1
      this._gfx.alpha = 1
    }
  }

  private _drawHoverGlow(shape: NodeShape, w: number, h: number): void {
    const hw = w / 2
    const hh = h / 2
    const g = this._hoverGfx

    if (shape === 'circle') {
      g.circle(0, 0, Math.max(hw, hh))
    } else if (shape === 'diamond') {
      g.moveTo(0, -hh).lineTo(hw, 0).lineTo(0, hh).lineTo(-hw, 0).closePath()
    } else {
      g.roundRect(-hw, -hh, w, h, this._theme.cornerRadius + 4)
    }
    g.fill({ color: this._theme.hoverGlow, alpha: this._theme.hoverGlowAlpha })
  }

  private _drawShape(shape: NodeShape, w: number, h: number, strokeColor: number): void {
    const hw = w / 2
    const hh = h / 2
    const g = this._gfx
    const r = this._theme.cornerRadius

    switch (shape) {
      case 'diamond':
        g.moveTo(0, -hh).lineTo(hw, 0).lineTo(0, hh).lineTo(-hw, 0).closePath()
        break
      case 'circle':
        g.circle(0, 0, Math.max(hw, hh))
        break
      case 'stadium':
        g.roundRect(-hw, -hh, w, h, hh)
        break
      case 'hexagon': {
        const inset = hw * 0.25
        g.moveTo(-hw + inset, -hh).lineTo(hw - inset, -hh).lineTo(hw, 0)
          .lineTo(hw - inset, hh).lineTo(-hw + inset, hh).lineTo(-hw, 0).closePath()
        break
      }
      case 'rounded':
        g.roundRect(-hw, -hh, w, h, r)
        break
      case 'subroutine':
        g.rect(-hw, -hh, w, h)
        break
      case 'cylinder':
        g.roundRect(-hw, -hh, w, h, r)
        break
      case 'rectangle':
      default:
        g.rect(-hw, -hh, w, h)
        break
    }

    g.fill({ color: this._theme.nodeFill })
    g.stroke({ width: this._theme.strokeWidth, color: strokeColor })

    if (shape === 'subroutine') {
      const inset = 6
      g.moveTo(-hw + inset, -hh).lineTo(-hw + inset, hh)
        .moveTo(hw - inset, -hh).lineTo(hw - inset, hh)
        .stroke({ width: 1, color: strokeColor })
    }
  }
}
