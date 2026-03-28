import { Container, Graphics, BitmapText } from 'pixi.js'
import type { Application } from 'pixi.js'
import type { RenderGraph } from '../types'
import { DagreLayout } from '../layout/dagre-layout'
import { ensureFontsInstalled } from './fonts'
import type { Theme } from './theme'

const PREVIEW_WIDTH = 420
const PREVIEW_HEIGHT = 280
const PADDING = 16

/**
 * Wiki-style hover preview rendered INSIDE the main PixiJS app.
 * Uses a Container overlay — no second WebGL context needed.
 */
export class LinkPreview {
  private _container: Container
  private _bg: Graphics
  private _content: Container
  private _titleText: BitmapText
  private _visible = false
  private _hoverTimer: ReturnType<typeof setTimeout> | null = null
  private _cache = new Map<string, RenderGraph>()

  constructor(private _app: Application) {
    this._container = new Container()
    this._container.visible = false
    this._container.eventMode = 'none' // don't intercept clicks

    // Background card
    this._bg = new Graphics()
    this._container.addChild(this._bg)

    // Title
    ensureFontsInstalled()
    this._titleText = new BitmapText({
      text: '',
      style: { fontFamily: 'MermaidLabel', fontSize: 11 },
    })
    this._titleText.x = PADDING
    this._titleText.y = PADDING
    this._container.addChild(this._titleText)

    // Content container for the mini diagram
    this._content = new Container()
    this._content.y = PADDING + 20 // below title
    this._content.x = PADDING
    this._container.addChild(this._content)

    // Add to stage on top of everything
    this._app.stage.addChild(this._container)
  }

  cacheGraph(targetFile: string, graph: RenderGraph): void {
    this._cache.set(targetFile, graph)
  }

  scheduleShow(
    screenX: number,
    screenY: number,
    targetFile: string,
    resolveGraph: () => Promise<RenderGraph | null>,
    theme: Theme,
  ): void {
    this.cancelSchedule()
    this._hoverTimer = setTimeout(async () => {
      let graph = this._cache.get(targetFile)
      if (!graph) {
        graph = await resolveGraph() ?? undefined
        if (graph) this._cache.set(targetFile, graph)
      }
      if (graph) {
        this._show(screenX, screenY, targetFile, graph, theme)
      }
    }, 300)
  }

  cancelSchedule(): void {
    if (this._hoverTimer) {
      clearTimeout(this._hoverTimer)
      this._hoverTimer = null
    }
  }

  hide(): void {
    this.cancelSchedule()
    if (!this._visible) return
    this._visible = false
    this._container.visible = false
  }

  destroy(): void {
    this.hide()
    this._container.destroy({ children: true })
  }

  private _show(
    screenX: number,
    screenY: number,
    targetFile: string,
    graph: RenderGraph,
    theme: Theme,
  ): void {
    this._visible = true
    this._container.visible = true

    // Position in screen space (stage coordinates, not world)
    // The container is added to stage directly, so position = screen pixels
    const canvasW = this._app.screen.width
    const canvasH = this._app.screen.height

    let x = screenX + 20
    let y = screenY - 20
    if (x + PREVIEW_WIDTH > canvasW - 20) x = screenX - PREVIEW_WIDTH - 20
    if (y + PREVIEW_HEIGHT > canvasH - 20) y = canvasH - PREVIEW_HEIGHT - 20
    if (y < 50) y = 50

    this._container.x = x
    this._container.y = y

    // Draw background card
    this._bg.clear()
    this._bg.roundRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT, 10)
    this._bg.fill({ color: theme.nodeFill, alpha: 0.95 })
    this._bg.stroke({ width: 1, color: theme.nodeStroke })

    // Title
    this._titleText.text = targetFile.replace(/^\//, '')

    // Clear previous content
    this._content.removeChildren()

    // Render mini diagram
    this._renderMini(graph, theme)
  }

  private _renderMini(graph: RenderGraph, theme: Theme): void {
    const layout = new DagreLayout({ philosophy: 'narrative' })
    const positioned = layout.compute(graph)

    if (positioned.nodes.size === 0) return

    // Scale to fit inside the content area
    const contentW = PREVIEW_WIDTH - PADDING * 2
    const contentH = PREVIEW_HEIGHT - PADDING * 2 - 20 // minus title
    const scaleX = contentW / (positioned.width || 1)
    const scaleY = contentH / (positioned.height || 1)
    const scale = Math.min(scaleX, scaleY, 1.5)

    const root = new Container()
    root.scale.set(scale)
    // Center the diagram in the content area
    root.x = (contentW - positioned.width * scale) / 2
    root.y = (contentH - positioned.height * scale) / 2
    this._content.addChild(root)

    // Mini subgraphs
    for (const [, sg] of positioned.subgraphs) {
      const g = new Graphics()
      g.roundRect(sg.x - sg.width / 2, sg.y - sg.height / 2, sg.width, sg.height, 4)
      g.fill({ color: theme.subgraphFill, alpha: theme.subgraphFillAlpha })
      g.stroke({ width: 0.5, color: theme.subgraphStroke, alpha: 0.4 })
      root.addChild(g)
    }

    // Mini edges
    for (const edge of positioned.edges) {
      const g = new Graphics()
      if (edge.points.length >= 2) {
        g.moveTo(edge.points[0].x, edge.points[0].y)
        for (let i = 1; i < edge.points.length; i++) {
          g.lineTo(edge.points[i].x, edge.points[i].y)
        }
        g.stroke({ width: 0.8, color: theme.edgeColor, alpha: 0.5 })
      }
      root.addChild(g)
    }

    // Mini nodes
    ensureFontsInstalled()
    for (const [, node] of positioned.nodes) {
      const g = new Graphics()
      g.roundRect(node.x - node.width / 2, node.y - node.height / 2, node.width, node.height, 3)
      g.fill({ color: theme.nodeFill })
      g.stroke({ width: 0.8, color: theme.nodeStroke })
      root.addChild(g)

      if (scale > 0.3) {
        const label = new BitmapText({
          text: node.label.length > 18 ? node.label.slice(0, 16) + '..' : node.label,
          style: { fontFamily: 'MermaidNode', fontSize: 7 },
        })
        label.anchor.set(0.5)
        label.x = node.x
        label.y = node.y
        root.addChild(label)
      }
    }
  }
}
