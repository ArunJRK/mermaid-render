import { Container, Graphics, Text } from 'pixi.js'
import type { PositionedSubgraph } from '../types'

const BG_COLOR = 0x334155
const BG_ALPHA = 0.25
const BORDER_COLOR = 0x475569
const LABEL_COLOR = 0x94a3b8
const CORNER_RADIUS = 12
const LABEL_PADDING = 8

/**
 * Visual container for a subgraph — semi-transparent rounded rect with a label.
 * Positioned at the subgraph centre (dagre gives centre coords).
 */
export class SubgraphContainer extends Container {
  readonly data: PositionedSubgraph
  private _bg: Graphics
  private _label: Text

  constructor(subgraph: PositionedSubgraph) {
    super()
    this.data = subgraph

    // Position at centre
    this.x = subgraph.x
    this.y = subgraph.y

    const hw = subgraph.width / 2
    const hh = subgraph.height / 2

    // Background
    this._bg = new Graphics()
    this._bg
      .roundRect(-hw, -hh, subgraph.width, subgraph.height, CORNER_RADIUS)
      .fill({ color: BG_COLOR, alpha: BG_ALPHA })
      .stroke({ width: 1, color: BORDER_COLOR, alpha: 0.5 })
    this.addChild(this._bg)

    // Label at top-left
    this._label = new Text({
      text: subgraph.label,
      style: {
        fontSize: 12,
        fill: LABEL_COLOR,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: 'bold',
      },
      resolution: 4,
    })
    this._label.x = -hw + LABEL_PADDING
    this._label.y = -hh + LABEL_PADDING
    this.addChild(this._label)
  }
}
