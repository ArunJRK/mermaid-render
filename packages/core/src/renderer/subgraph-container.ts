import { Container, Graphics, BitmapText } from 'pixi.js'
import type { PositionedSubgraph } from '../types'
import { ensureFontsInstalled } from './fonts'

const BG_COLOR = 0x1e3a5f
const BG_ALPHA = 0.35
const BORDER_COLOR = 0x60a5fa
const BORDER_ALPHA = 0.6
const LABEL_COLOR = 0xbfdbfe
const CORNER_RADIUS = 12
const LABEL_PADDING = 10

/**
 * Visual container for a subgraph — semi-transparent rounded rect with a label.
 * Positioned at the subgraph centre (dagre gives centre coords).
 */
export class SubgraphContainer extends Container {
  readonly data: PositionedSubgraph
  private _bg: Graphics
  private _label: BitmapText

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
      .stroke({ width: 1.5, color: BORDER_COLOR, alpha: BORDER_ALPHA })
    this.addChild(this._bg)

    // Make interactive for fold/unfold on double-click
    this.eventMode = 'static'
    this.cursor = 'pointer'

    // Label at top-left — BitmapText stays crisp at any zoom
    ensureFontsInstalled()
    this._label = new BitmapText({
      text: subgraph.label,
      style: {
        fontFamily: 'MermaidLabel',
        fontSize: 12,
      },
    })
    this._label.x = -hw + LABEL_PADDING
    this._label.y = -hh + LABEL_PADDING
    this.addChild(this._label)
  }
}
