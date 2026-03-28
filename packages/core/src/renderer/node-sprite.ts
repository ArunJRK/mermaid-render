import { Container, Graphics, Text } from 'pixi.js'
import type { PositionedNode, NodeShape } from '../types'

// ── Palette ────────────────────────────────────────────────────────────────

const FILL_COLOR = 0x1e293b
const STROKE_COLOR = 0x60a5fa
const SELECTED_STROKE = 0xfbbf24
const TEXT_COLOR = 0xf1f5f9
const STROKE_WIDTH = 2
const CORNER_RADIUS = 8

/**
 * Visual representation of a single graph node.
 * Extends PixiJS Container so it can be added to the scene graph.
 */
export class NodeSprite extends Container {
  readonly data: PositionedNode

  private _gfx: Graphics
  private _label: Text
  private _selected = false

  constructor(node: PositionedNode) {
    super()
    this.data = node

    // Position at the node centre (dagre gives centre coords)
    this.x = node.x
    this.y = node.y

    // Make interactive
    this.eventMode = 'static'
    this.cursor = 'pointer'

    // Draw shape
    this._gfx = new Graphics()
    this._drawShape(node.shape, node.width, node.height, STROKE_COLOR)
    this.addChild(this._gfx)

    // Label
    this._label = new Text({
      text: node.label,
      style: {
        fontSize: 14,
        fill: TEXT_COLOR,
        fontFamily: 'Inter, system-ui, sans-serif',
        wordWrap: true,
        wordWrapWidth: node.width - 16,
        align: 'center',
      },
    })
    this._label.anchor.set(0.5)
    this.addChild(this._label)

    // Hit area should cover the entire shape
    this.hitArea = {
      contains: (x: number, y: number) => {
        const hw = node.width / 2
        const hh = node.height / 2
        return x >= -hw && x <= hw && y >= -hh && y <= hh
      },
    }
  }

  /** Toggle the selected visual state. */
  setSelected(selected: boolean): void {
    if (this._selected === selected) return
    this._selected = selected
    this._gfx.clear()
    this._drawShape(
      this.data.shape,
      this.data.width,
      this.data.height,
      selected ? SELECTED_STROKE : STROKE_COLOR,
    )
  }

  // ── private ──────────────────────────────────────────────

  private _drawShape(shape: NodeShape, w: number, h: number, strokeColor: number): void {
    const hw = w / 2
    const hh = h / 2
    const g = this._gfx

    switch (shape) {
      case 'diamond':
        g.moveTo(0, -hh)
          .lineTo(hw, 0)
          .lineTo(0, hh)
          .lineTo(-hw, 0)
          .closePath()
        break

      case 'circle':
        g.circle(0, 0, Math.max(hw, hh))
        break

      case 'stadium':
        g.roundRect(-hw, -hh, w, h, hh)
        break

      case 'hexagon': {
        const inset = hw * 0.25
        g.moveTo(-hw + inset, -hh)
          .lineTo(hw - inset, -hh)
          .lineTo(hw, 0)
          .lineTo(hw - inset, hh)
          .lineTo(-hw + inset, hh)
          .lineTo(-hw, 0)
          .closePath()
        break
      }

      case 'cylinder':
        // Simplified: rectangle with rounded top/bottom
        g.roundRect(-hw, -hh, w, h, CORNER_RADIUS)
        break

      case 'subroutine':
        // Double-bordered rectangle
        g.rect(-hw, -hh, w, h)
        break

      case 'rounded':
        g.roundRect(-hw, -hh, w, h, CORNER_RADIUS)
        break

      case 'rectangle':
      default:
        g.rect(-hw, -hh, w, h)
        break
    }

    g.fill({ color: FILL_COLOR })
    g.stroke({ width: STROKE_WIDTH, color: strokeColor })

    // Extra inner lines for subroutine
    if (shape === 'subroutine') {
      const inset = 6
      g.moveTo(-hw + inset, -hh)
        .lineTo(-hw + inset, hh)
        .moveTo(hw - inset, -hh)
        .lineTo(hw - inset, hh)
        .stroke({ width: 1, color: strokeColor })
    }
  }
}
