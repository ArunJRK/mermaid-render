import { Container, Graphics, BitmapText } from 'pixi.js'
import type { PositionedNode, NodeShape } from '../types'
import { ensureFontsInstalled } from './fonts'
import type { Theme } from './theme'
import { estimateRenderedNodeFootprint } from '../node-footprint'

type BoundsRect = {
  x: number
  y: number
  width: number
  height: number
}

export class NodeSprite extends Container {
  data: PositionedNode
  private _gfx!: Graphics
  private _hoverGfx!: Graphics
  private _selectionGfx!: Graphics
  private _label!: BitmapText
  private _linkBadge: Graphics | null = null
  private _hovered = false
  private _selected = false
  private _theme: Theme
  private _displayWidth: number
  private _displayHeight: number
  private _fontName: string
  private _badgeAccent: number | null = null
  private _badgeKind: 'valid' | 'broken' | null = null

  constructor(
    node: PositionedNode,
    theme: Theme,
    linkState: false | 'valid' | 'broken' = false,
    fontName = 'MermaidNode',
  ) {
    super()
    this.data = node
    this._theme = theme
    this._displayWidth = estimateRenderedNodeFootprint(node, fontName === 'MermaidBlueprint').width
    this._displayHeight = node.height
    this._fontName = fontName

    this.x = node.x
    this.y = node.y

    this.eventMode = 'static'
    this.cursor = 'pointer'

    this._rebuildVisuals(node, theme, linkState, fontName)

    // Hover events
    this.on('pointerover', () => {
      this._hovered = true
      this._hoverGfx.alpha = 1
    })
    this.on('pointerout', () => {
      this._hovered = false
      this._hoverGfx.alpha = 0
    })
  }

  updateAppearance(
    theme: Theme,
    linkState: false | 'valid' | 'broken' = false,
    fontName = this._fontName,
  ): void {
    this._rebuildVisuals(this.data, theme, linkState, fontName)
  }

  private _rebuildVisuals(
    node: PositionedNode,
    theme: Theme,
    linkState: false | 'valid' | 'broken',
    fontName: string,
  ): void {
    this.data = node
    this._theme = theme
    this._fontName = fontName
    this._displayWidth = estimateRenderedNodeFootprint(node, fontName === 'MermaidBlueprint').width
    this._displayHeight = node.height
    this._badgeAccent = null
    this._badgeKind = null
    this.removeChildren()

    // Main shape
    this._gfx = new Graphics()
    this._drawShape(node.shape, this._displayWidth, node.height, theme.nodeStroke)
    this.addChild(this._gfx)

    // Label — full text, node must be sized to fit
    ensureFontsInstalled()
    this._label = new BitmapText({
      text: node.label,
      style: { fontFamily: fontName, fontSize: 14, fill: theme.nodeText },
    })
    this._label.anchor.set(0.5)
    this.addChild(this._label)

    // If label is wider than node, expand the node shape to fit
    const labelWidth = this._label.width
    if (labelWidth + 24 > this._displayWidth) {
      const expandedWidth = labelWidth + 24
      this._displayWidth = expandedWidth
      this._gfx.clear()
      this._drawShape(node.shape, expandedWidth, node.height, theme.nodeStroke)
    }

    // Link badge — interactive icon at top-right indicating "has linked file"
    if (linkState) {
      const bx = this._displayWidth / 2 - 6
      const by = -node.height / 2 + 6
      const accent = linkState === 'broken' ? theme.brokenLinkAccent : theme.accent
      const badgeKind = linkState === 'broken' ? 'broken' : 'valid'
      this._badgeAccent = accent
      this._badgeKind = badgeKind
      this._linkBadge = new Graphics()
      this._linkBadge.eventMode = 'static'
      this._linkBadge.cursor = 'pointer'

      // Draw badge circle + arrow
      this._drawLinkBadge(bx, by, accent, theme.nodeFill, 1.0, badgeKind)

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
        this._drawLinkBadge(bx, by, accent, theme.nodeFill, 1.3, badgeKind)
      })
      this._linkBadge.on('pointerout', () => {
        this._linkBadge!.clear()
        this._drawLinkBadge(bx, by, accent, theme.nodeFill, 1.0, badgeKind)
      })

      // Click badge emits 'badge:click' — renderer wires this to link:navigate
      this._linkBadge.on('pointertap', (e) => {
        e.stopPropagation() // don't trigger node click
        this.emit('badge:click')
      })

      this.addChild(this._linkBadge)
    }

    // Hover/selection overlays stay above labels and badges.
    this._hoverGfx = new Graphics()
    this._hoverGfx.alpha = 0
    this.addChild(this._hoverGfx)
    this._drawHoverGlow(node.shape, this._displayWidth + 12, node.height + 12)

    this._selectionGfx = new Graphics()
    this._selectionGfx.alpha = 0
    this.addChild(this._selectionGfx)
    this._drawSelectionRing(node.shape, this._displayWidth + 10, node.height + 10)

    // Hit area
    this.hitArea = {
      contains: (x: number, y: number) => {
        const hw = this._displayWidth / 2 + 4
        const hh = this._displayHeight / 2 + 4
        return x >= -hw && x <= hw && y >= -hh && y <= hh
      },
    }

    this._selectionGfx.alpha = this._selected ? 1 : 0
    this._hoverGfx.alpha = this._hovered ? 1 : 0
  }

  private _drawLinkBadge(
    bx: number,
    by: number,
    accent: number,
    fill: number,
    scale: number,
    kind: 'valid' | 'broken',
  ): void {
    const g = this._linkBadge!
    const r = 8 * scale
    g.circle(bx, by, r)
    g.fill({ color: accent, alpha: 0.9 })
    if (kind === 'broken') {
      const slash = 3.6 * scale
      g.moveTo(bx - slash, by - slash).lineTo(bx + slash, by + slash)
      g.stroke({ width: 1.9 * scale, color: fill, cap: 'round' })
      g.circle(bx - 1.4 * scale, by + 1.4 * scale, 0.9 * scale)
      g.fill({ color: fill, alpha: 1 })
      return
    }

    const s = 3 * scale
    g.moveTo(bx - s, by + s * 0.6).lineTo(bx, by - s * 0.8).lineTo(bx + s, by + s * 0.6)
    g.stroke({ width: 1.5 * scale, color: fill })
  }

  setSelected(selected: boolean): void {
    if (this._selected === selected) return
    this._selected = selected
    this._gfx.clear()
    this._drawShape(
      this.data.shape, this._displayWidth, this._displayHeight,
      selected ? this._theme.nodeStrokeSelected : this._theme.nodeStroke,
    )
    this._selectionGfx.alpha = selected ? 1 : 0
    this._hoverGfx.alpha = this._hovered ? 1 : 0
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

    if (absoluteZoom < 0.7) {
      this._label.style.fontSize = 14
      this._label.alpha = absoluteZoom < 0.28 ? 0.55 : 0.9
      return
    }

    this._label.alpha = 1

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

  getShapeBounds(): BoundsRect {
    const bounds = this._gfx.getBounds()
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
  }

  getLabelBounds(): BoundsRect {
    const bounds = this._label.getBounds()
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
  }

  getHoverBounds(): BoundsRect {
    const bounds = this._hoverGfx.getBounds()
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
  }

  isHovered(): boolean {
    return this._hovered
  }

  getDebugStyle(): {
    nodeFill: number
    nodeStroke: number
    labelFill: number
    labelFontFamily: string
    brokenBadgeAccent: number | null
    badgeKind: 'valid' | 'broken' | null
    hoverAlpha: number
    selectionAlpha: number
    shapeLayerIndex: number
    labelLayerIndex: number
    badgeLayerIndex: number | null
    hoverLayerIndex: number
    selectionLayerIndex: number
  } {
    return {
      nodeFill: this._theme.nodeFill,
      nodeStroke: this._selected ? this._theme.nodeStrokeSelected : this._theme.nodeStroke,
      labelFill: this._theme.nodeText,
      labelFontFamily: this._fontName,
      brokenBadgeAccent: this._badgeAccent,
      badgeKind: this._badgeKind,
      hoverAlpha: this._hoverGfx.alpha,
      selectionAlpha: this._selectionGfx.alpha,
      shapeLayerIndex: this.getChildIndex(this._gfx),
      labelLayerIndex: this.getChildIndex(this._label),
      badgeLayerIndex: this._linkBadge ? this.getChildIndex(this._linkBadge) : null,
      hoverLayerIndex: this.getChildIndex(this._hoverGfx),
      selectionLayerIndex: this.getChildIndex(this._selectionGfx),
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

  private _drawSelectionRing(shape: NodeShape, w: number, h: number): void {
    const hw = w / 2
    const hh = h / 2
    const g = this._selectionGfx

    if (shape === 'circle') {
      g.circle(0, 0, Math.max(hw, hh))
    } else if (shape === 'diamond') {
      g.moveTo(0, -hh).lineTo(hw, 0).lineTo(0, hh).lineTo(-hw, 0).closePath()
    } else if (shape === 'hexagon') {
      const inset = hw * 0.25
      g.moveTo(-hw + inset, -hh).lineTo(hw - inset, -hh).lineTo(hw, 0)
        .lineTo(hw - inset, hh).lineTo(-hw + inset, hh).lineTo(-hw, 0).closePath()
    } else {
      g.roundRect(-hw, -hh, w, h, this._theme.cornerRadius + 5)
    }

    g.stroke({
      width: Math.max(2, this._theme.strokeWidth + 1.5),
      color: this._theme.nodeStrokeSelected,
      alpha: 1,
    })
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
