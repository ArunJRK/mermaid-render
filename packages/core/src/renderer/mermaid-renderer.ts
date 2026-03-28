import { Application } from 'pixi.js'
import type {
  LoadResult,
  LoadOptions,
  RenderGraph,
  PositionedGraph,
  NodeEvent,
  LinkDirective,
  LayoutDirective,
} from '../types'
import type { FederatedPointerEvent } from 'pixi.js'
import { LoadPipeline } from './load-pipeline'
import { EventEmitter } from './event-emitter'
import { Viewport } from './viewport'
import { NodeSprite } from './node-sprite'
import { EdgeGraphic } from './edge-graphic'
import { SubgraphContainer } from './subgraph-container'
import { FoldManager } from '../interaction/fold-manager'
import { DagreLayout } from '../layout/dagre-layout'
import { mapKeyToAction } from '../interaction/keyboard'
import { getTheme, type Theme } from './theme'

/**
 * Public API for the mermaid-render engine.
 *
 * Composes: LoadPipeline + PixiJS Application + Viewport + FoldManager + EventEmitter
 */
export class MermaidRenderer {
  private _app: Application | null = null
  private _canvas: HTMLCanvasElement | null = null
  private _viewport: Viewport | null = null
  private _emitter = new EventEmitter()
  private _pipeline = new LoadPipeline()
  private _foldManager: FoldManager | null = null
  private _graph: RenderGraph | null = null
  private _positioned: PositionedGraph | null = null
  private _selectedNodeId: string | null = null
  private _nodeSprites = new Map<string, NodeSprite>()
  private _edgeGraphics: EdgeGraphic[] = []
  private _currentPhilosophy: string = 'narrative'

  // Bound handlers for cleanup
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null

  // ── Lifecycle ────────────────────────────────────────────

  /**
   * Initialise PixiJS and attach to the given canvas element.
   */
  async mount(canvas: HTMLCanvasElement): Promise<void> {
    this._canvas = canvas

    const app = new Application()
    await app.init({
      canvas,
      background: 0x111827,
      resizeTo: canvas.parentElement ?? undefined,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio ?? 1,
    })
    this._app = app

    // Create viewport as root container
    const viewport = new Viewport()
    viewport.attach(canvas)
    app.stage.addChild(viewport)
    this._viewport = viewport

    // Wire up background pan: pointerdown on stage that doesn't hit a node
    app.stage.eventMode = 'static'
    app.stage.hitArea = app.screen
    app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
      // Only start pan if the target is the stage itself (empty space)
      if (e.target === app.stage) {
        viewport.startPan(e.clientX, e.clientY)
      }
    })

    // Keyboard shortcuts
    this._keyHandler = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const action = mapKeyToAction(e.key)
      if (action === 'fitToView') this.fitToView()
      else if (action === 'resetView') this.resetView()
    }
    window.addEventListener('keydown', this._keyHandler)
  }

  /**
   * Tear everything down.
   */
  destroy(): void {
    // Keyboard
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler)
      this._keyHandler = null
    }

    // Viewport DOM listeners
    this._viewport?.cleanup()
    this._viewport = null

    // PixiJS
    if (this._app) {
      this._app.destroy(true, { children: true })
      this._app = null
    }

    // Event emitter
    this._emitter.removeAll()

    this._canvas = null
    this._graph = null
    this._positioned = null
    this._foldManager = null
    this._nodeSprites.clear()
    this._edgeGraphics = []
  }

  // ── Loading ──────────────────────────────────────────────

  /**
   * Parse mermaid source, run layout, and render.
   */
  async load(source: string, options?: LoadOptions): Promise<LoadResult> {
    try {
      const pipelineOpts = options ? { layout: (options as Record<string, unknown>).layout as string | undefined } : undefined
      const result = await this._pipeline.load(source, pipelineOpts)

      if (!result.success || !result.graph || !result.positioned) {
        const loadResult: LoadResult = {
          success: false,
          errors: result.errors ?? [],
          warnings: result.warnings ?? [],
        }
        for (const err of loadResult.errors) {
          this._emitter.emit('error', err)
        }
        return loadResult
      }

      this._graph = result.graph
      this._positioned = result.positioned
      this._foldManager = new FoldManager(result.graph)

      // Detect philosophy from directive or options
      const layoutDir = result.graph.directives.find((d) => d.type === 'layout') as LayoutDirective | undefined
      this._currentPhilosophy = (pipelineOpts?.layout ?? layoutDir?.philosophy ?? 'narrative')

      // Update background color to match theme
      if (this._app) {
        const theme = getTheme(this._currentPhilosophy as any)
        this._app.renderer.background.color = theme.background
      }

      this._renderGraph(result.positioned)

      // Emit warnings
      for (const w of result.warnings ?? []) {
        this._emitter.emit('warn', w)
      }

      return {
        success: true,
        graph: result.graph,
        errors: [],
        warnings: result.warnings ?? [],
      }
    } catch (err: unknown) {
      const error = {
        code: 'LOAD_ERROR',
        message: err instanceof Error ? err.message : String(err),
      }
      this._emitter.emit('error', error)
      return { success: false, errors: [error], warnings: [] }
    }
  }

  /**
   * Render a pre-parsed and laid-out graph.
   */
  loadGraph(graph: RenderGraph): void {
    this._graph = graph
    this._foldManager = new FoldManager(graph)

    const layout = new DagreLayout()
    this._positioned = layout.compute(graph)
    this._renderGraph(this._positioned)
  }

  // ── Fold ─────────────────────────────────────────────────

  foldNode(id: string): void {
    if (!this._foldManager || !this._graph) return
    const sg = this._graph.subgraphs.get(id)
    if (!sg || sg.collapsed) return
    this._foldManager.toggle(id)
    this._emitter.emit('fold:change', id, true)
    this._relayout()
  }

  unfoldNode(id: string): void {
    if (!this._foldManager || !this._graph) return
    const sg = this._graph.subgraphs.get(id)
    if (!sg || !sg.collapsed) return
    this._foldManager.toggle(id)
    this._emitter.emit('fold:change', id, false)
    this._relayout()
  }

  foldAll(): void {
    if (!this._foldManager) return
    this._foldManager.foldAll()
    this._emitter.emit('fold:change', '*', true)
    this._relayout()
  }

  unfoldAll(): void {
    if (!this._foldManager) return
    this._foldManager.unfoldAll()
    this._emitter.emit('fold:change', '*', false)
    this._relayout()
  }

  // ── Selection ────────────────────────────────────────────

  /**
   * Highlight a node and dim unrelated edges.
   */
  selectNode(id: string | null): void {
    // Deselect previous
    if (this._selectedNodeId) {
      const prev = this._nodeSprites.get(this._selectedNodeId)
      prev?.setSelected(false)
    }

    this._selectedNodeId = id

    if (id) {
      const sprite = this._nodeSprites.get(id)
      sprite?.setSelected(true)

      // Dim edges not connected to this node
      for (const eg of this._edgeGraphics) {
        const connected = eg.data.source === id || eg.data.target === id
        eg.dim(!connected)
      }
    } else {
      // Restore all edges
      for (const eg of this._edgeGraphics) {
        eg.dim(false)
      }
    }
  }

  // ── View ─────────────────────────────────────────────────

  fitToView(): void {
    if (this._viewport && this._positioned) {
      this._viewport.fitToView(this._positioned.width, this._positioned.height)
    }
  }

  resetView(): void {
    this._viewport?.resetView()
  }

  // ── Events ───────────────────────────────────────────────

  on(event: string, handler: (...args: unknown[]) => void): void {
    this._emitter.on(event, handler)
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this._emitter.off(event, handler)
  }

  // ── Private rendering ────────────────────────────────────

  private _renderGraph(positioned: PositionedGraph): void {
    if (!this._viewport) return

    const theme = getTheme(this._currentPhilosophy as any)

    // Clear previous children
    this._viewport.removeChildren()
    this._nodeSprites.clear()
    this._edgeGraphics = []

    // Draw subgraphs first (underneath) — wire click to fold/unfold
    for (const [, sg] of positioned.subgraphs) {
      const sgc = new SubgraphContainer(sg, theme)
      const sgId = sg.id

      sgc.on('pointertap', () => {
        if (!this._graph?.subgraphs.has(sgId)) return
        const sub = this._graph.subgraphs.get(sgId)!
        if (sub.collapsed) {
          this.unfoldNode(sgId)
        } else {
          this.foldNode(sgId)
        }
      })

      this._viewport.addChild(sgc)
    }

    // Draw edges
    for (const edge of positioned.edges) {
      const eg = new EdgeGraphic(edge, theme)
      this._edgeGraphics.push(eg)
      this._viewport.addChild(eg)
    }

    // Draw nodes (on top)
    for (const [id, node] of positioned.nodes) {
      const sprite = new NodeSprite(node, theme)
      this._nodeSprites.set(id, sprite)
      this._viewport.addChild(sprite)

      // Wire click
      sprite.on('pointertap', (e: FederatedPointerEvent) => {
        const evt: NodeEvent = {
          nodeId: id,
          eventType: 'click',
          originalEvent: e.nativeEvent as Event | undefined,
        }
        this._emitter.emit('node:click', evt)

        // Check for link directives
        if (this._graph) {
          const link = this._graph.directives.find(
            (d): d is LinkDirective => d.type === 'link' && d.nodeId === id,
          )
          if (link) {
            this._emitter.emit('link:navigate', {
              targetFile: link.targetFile,
              targetNode: link.targetNode,
              sourceNode: id,
            })
          }
        }

        this.selectNode(id)
      })

      // Wire double-click for fold toggle
      sprite.on('dblclick' as any, (e: any) => {
        const evt: NodeEvent = {
          nodeId: id,
          eventType: 'dblclick',
          originalEvent: e?.nativeEvent,
        }
        this._emitter.emit('node:dblclick', evt)

        // If this node ID is a subgraph, toggle fold
        if (this._graph?.subgraphs.has(id)) {
          const sg = this._graph.subgraphs.get(id)!
          if (sg.collapsed) {
            this.unfoldNode(id)
          } else {
            this.foldNode(id)
          }
        }
      })
    }

    // Auto-fit after rendering
    this.fitToView()
  }

  /**
   * Re-run layout on the current graph (after fold changes) and re-render.
   */
  private _relayout(): void {
    if (!this._graph) return
    const layout = new DagreLayout()
    this._positioned = layout.compute(this._graph)
    this._renderGraph(this._positioned)
  }
}
