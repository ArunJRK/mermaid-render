import { Application, Container, Graphics, BitmapText } from 'pixi.js'
import type { RenderGraph, PositionedGraph } from '../types'
import { DagreLayout } from '../layout/dagre-layout'
import { ensureFontsInstalled } from './fonts'
import type { Theme } from './theme'

const PREVIEW_WIDTH = 280
const PREVIEW_HEIGHT = 180
const PADDING = 12

/**
 * Floating wiki-style preview card that appears on hover over linked nodes.
 * Renders a mini version of the target file's diagram.
 */
export class LinkPreview {
  private _container: HTMLDivElement
  private _canvas: HTMLCanvasElement
  private _app: Application | null = null
  private _titleEl: HTMLDivElement
  private _visible = false

  constructor(private _parentEl: HTMLElement) {
    // Create the floating card DOM
    this._container = document.createElement('div')
    this._container.style.cssText = `
      position: fixed; z-index: 100; pointer-events: none;
      width: ${PREVIEW_WIDTH}px; border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      overflow: hidden; opacity: 0;
      transition: opacity 0.15s ease-out, transform 0.15s ease-out;
      transform: translateY(4px);
    `

    this._titleEl = document.createElement('div')
    this._titleEl.style.cssText = `
      padding: 8px 12px; font-size: 12px; font-weight: 600;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    `
    this._container.appendChild(this._titleEl)

    this._canvas = document.createElement('canvas')
    this._canvas.width = PREVIEW_WIDTH * 2 // retina
    this._canvas.height = PREVIEW_HEIGHT * 2
    this._canvas.style.cssText = `width: ${PREVIEW_WIDTH}px; height: ${PREVIEW_HEIGHT}px; display: block;`
    this._container.appendChild(this._canvas)

    this._parentEl.appendChild(this._container)
  }

  /**
   * Show the preview near the given screen coordinates.
   */
  async show(
    x: number,
    y: number,
    targetFile: string,
    graph: RenderGraph,
    theme: Theme,
  ): Promise<void> {
    if (this._visible) return
    this._visible = true

    // Style the card to match theme
    this._container.style.background = `rgb(${(theme.nodeFill >> 16) & 0xff}, ${(theme.nodeFill >> 8) & 0xff}, ${theme.nodeFill & 0xff})`
    this._container.style.border = `1px solid rgb(${(theme.nodeStroke >> 16) & 0xff}, ${(theme.nodeStroke >> 8) & 0xff}, ${theme.nodeStroke & 0xff})`
    this._titleEl.style.color = `rgb(${(theme.nodeText >> 16) & 0xff}, ${(theme.nodeText >> 8) & 0xff}, ${theme.nodeText & 0xff})`
    this._titleEl.textContent = targetFile.replace(/^\//, '')

    // Position near the node but not overlapping
    const viewW = window.innerWidth
    const viewH = window.innerHeight
    let left = x + 20
    let top = y - 40
    if (left + PREVIEW_WIDTH > viewW - 20) left = x - PREVIEW_WIDTH - 20
    if (top + PREVIEW_HEIGHT + 40 > viewH - 20) top = viewH - PREVIEW_HEIGHT - 60
    if (top < 50) top = 50

    this._container.style.left = `${left}px`
    this._container.style.top = `${top}px`

    // Animate in
    requestAnimationFrame(() => {
      this._container.style.opacity = '1'
      this._container.style.transform = 'translateY(0)'
    })

    // Render the mini diagram
    await this._renderMini(graph, theme)
  }

  hide(): void {
    if (!this._visible) return
    this._visible = false
    this._container.style.opacity = '0'
    this._container.style.transform = 'translateY(4px)'
  }

  destroy(): void {
    this.hide()
    if (this._app) {
      this._app.destroy(true)
      this._app = null
    }
    this._container.remove()
  }

  private async _renderMini(graph: RenderGraph, theme: Theme): Promise<void> {
    // Create or reuse mini PixiJS app
    if (this._app) {
      this._app.destroy(true)
    }

    this._app = new Application()
    await this._app.init({
      canvas: this._canvas,
      background: theme.background,
      width: PREVIEW_WIDTH * 2,
      height: PREVIEW_HEIGHT * 2,
      antialias: true,
      resolution: 1,
    })

    // Layout the graph
    const layout = new DagreLayout({ philosophy: 'narrative' })
    const positioned = layout.compute(graph)

    if (positioned.nodes.size === 0) return

    // Scale to fit preview canvas
    const pw = PREVIEW_WIDTH * 2 - PADDING * 4
    const ph = PREVIEW_HEIGHT * 2 - PADDING * 4
    const scaleX = pw / (positioned.width || 1)
    const scaleY = ph / (positioned.height || 1)
    const scale = Math.min(scaleX, scaleY, 2)

    const root = new Container()
    root.scale.set(scale)
    root.x = (PREVIEW_WIDTH * 2 - positioned.width * scale) / 2
    root.y = (PREVIEW_HEIGHT * 2 - positioned.height * scale) / 2
    this._app.stage.addChild(root)

    // Draw mini edges
    for (const edge of positioned.edges) {
      const g = new Graphics()
      if (edge.points.length >= 2) {
        g.moveTo(edge.points[0].x, edge.points[0].y)
        for (let i = 1; i < edge.points.length; i++) {
          g.lineTo(edge.points[i].x, edge.points[i].y)
        }
        g.stroke({ width: 1, color: theme.edgeColor, alpha: 0.6 })
      }
      root.addChild(g)
    }

    // Draw mini subgraphs
    for (const [, sg] of positioned.subgraphs) {
      const g = new Graphics()
      g.roundRect(sg.x - sg.width / 2, sg.y - sg.height / 2, sg.width, sg.height, 4)
      g.fill({ color: theme.subgraphFill, alpha: theme.subgraphFillAlpha })
      g.stroke({ width: 0.5, color: theme.subgraphStroke, alpha: 0.4 })
      root.addChild(g)
    }

    // Draw mini nodes (small dots with optional labels)
    ensureFontsInstalled()
    for (const [, node] of positioned.nodes) {
      const g = new Graphics()
      g.roundRect(node.x - node.width / 2, node.y - node.height / 2, node.width, node.height, 3)
      g.fill({ color: theme.nodeFill })
      g.stroke({ width: 1, color: theme.nodeStroke })
      root.addChild(g)

      // Mini label (only if scale allows it)
      if (scale > 0.4) {
        const label = new BitmapText({
          text: node.label.length > 15 ? node.label.slice(0, 13) + '..' : node.label,
          style: { fontFamily: 'MermaidNode', fontSize: 8 },
        })
        label.anchor.set(0.5)
        label.x = node.x
        label.y = node.y
        root.addChild(label)
      }
    }
  }
}
