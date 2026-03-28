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

  constructor(node: PositionedNode, theme: Theme, hasLink = false, fontName = 'MermaidNode') {
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

    // Label — full text, node must be sized to fit
    ensureFontsInstalled()
    this._label = new BitmapText({
      text: node.label,
      style: { fontFamily: fontName, fontSize: 14 },
    })
    this._label.anchor.set(0.5)
    this.addChild(this._label)

    // If label is wider than node, expand the node shape to fit
    const labelWidth = this._label.width
    if (labelWidth + 20 > node.width) {
      const expandedWidth = labelWidth + 24
      this._gfx.clear()
      this._drawShape(node.shape, expandedWidth, node.height, theme.nodeStroke)
      // Update hit area to match
      const hw = expandedWidth / 2 + 4
      const hh = node.height / 2 + 4
      this.hitArea = { contains: (x: number, y: number) => x >= -hw && x <= hw && y >= -hh && y <= hh }
      // Redraw hover glow too
      this._hoverGfx.clear()
      this._drawHoverGlow(node.shape, expandedWidth + 12, node.height + 12)
    }

    // Link badge — interactive icon at top-right indicating "has linked file"
    if (hasLink) {
      const bx = node.width / 2 - 6
      const by = -node.height / 2 + 6

      this._linkBadge = new Graphics()
      this._linkBadge.eventMode = 'static'
      this._linkBadge.cursor = 'pointer'

      // Draw badge circle + arrow
      this._drawLinkBadge(bx, by, theme.accent, theme.nodeFill, 1.0)

      // Badge hit area (larger than visual for easier clicking)
      this._linkBadge.hitArea = {
        contains: (x: number, y: number) => {
          const dx = x - bx, dy = y - by
          return dx * dx + dy * dy <= 14 * 14
        },
      }

      // Hover: enlarge badge
      this._linkBadge.on('pointerover', () => {
        this._linkBadge!.clear()
        this._drawLinkBadge(bx, by, theme.accent, theme.nodeFill, 1.3)
      })
      this._linkBadge.on('pointerout', () => {
        this._linkBadge!.clear()
        this._drawLinkBadge(bx, by, theme.accent, theme.nodeFill, 1.0)
      })

      // Click badge emits 'badge:click' — renderer wires this to link:navigate
      this._linkBadge.on('pointertap', (e) => {
        e.stopPropagation() // don't trigger node click
        this.emit('badge:click')
      })

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

  private _drawLinkBadge(bx: number, by: number, accent: number, fill: number, scale: number): void {
    const g = this._linkBadge!
    const r = 8 * scale
    g.circle(bx, by, r)
    g.fill({ color: accent, alpha: 0.9 })
    // Arrow-up symbol
    const s = 3 * scale
    g.moveTo(bx - s, by + s * 0.6).lineTo(bx, by - s * 0.8).lineTo(bx + s, by + s * 0.6)
    g.stroke({ width: 1.5 * scale, color: fill })
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
   * Coggle-style: text always stays readable regardless of zoom.
   * Counter-scales font size so it maintains a constant screen size,
   * clamped between min (8px) and max (20px screen pixels).
   * @param absoluteZoom The actual viewport zoom level (not relative)
   */
  updateDetailLevel(absoluteZoom: number): void {
    // Always visible
    this._label.visible = true
    this._gfx.alpha = 1

    // Counter-scale: as viewport zooms in, make label smaller in world space
    // so it stays ~14px on screen. Clamp to min/max.
    const baseFontSize = 14
    const minScreenPx = 8
    const maxScreenPx = 22
    const desiredWorldSize = baseFontSize / Math.max(absoluteZoom, 0.05)
    const screenSize = desiredWorldSize * absoluteZoom
    const clampedScreenSize = Math.max(minScreenPx, Math.min(maxScreenPx, screenSize))
    const finalWorldSize = clampedScreenSize / Math.max(absoluteZoom, 0.05)

    this._label.style.fontSize = finalWorldSize
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
