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
  private _subgraphContainers = new Map<string, SubgraphContainer>()
  private _currentPhilosophy: string = 'narrative'

  // Focus navigation state
  private _focusStack: string[] = []

  // Breadcrumb callback — the consumer provides a function to update breadcrumb UI
  onBreadcrumbChange: ((segments: Array<{ id: string | null; label: string }>) => void) | null = null

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

    // Wire zoom change for semantic zoom
    viewport.onZoomChange = (zoom: number) => {
      this._updateDetailLevel(zoom)
    }

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
      else if (action === 'focusOut') this.focusOut()
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
    this._subgraphContainers.clear()
    this._focusStack = []
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

      // Clear focus stack on load
      this._focusStack = []

      this._renderGraph(result.positioned)
      this._emitBreadcrumb()

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
    this._focusStack = []
    this._renderGraph(this._positioned)
    this._emitBreadcrumb()
  }

  // ── Focus Navigation ────────────────────────────────────

  /**
   * Focus on a subgraph: zoom/pan viewport to center on it,
   * dim all elements not in the subgraph.
   */
  /**
   * Focus into a subgraph: re-layout and re-render showing ONLY that
   * subgraph's nodes + their internal edges + stubs for external connections.
   */
  focusSubgraph(id: string): void {
    if (!this._graph) return
    const sg = this._graph.subgraphs.get(id)
    if (!sg) return

    this._focusStack.push(id)
    this._emitter.emit('focus:change', id, this._focusStack.slice())
    this._renderFocusedView()
    this._emitBreadcrumb()
  }

  /**
   * Pop the focus stack. If empty, return to full graph.
   */
  focusOut(): void {
    if (this._focusStack.length === 0) return
    this._focusStack.pop()
    this._emitter.emit('focus:change', null, this._focusStack.slice())

    if (this._focusStack.length === 0) {
      // Back to root — show full graph
      if (this._positioned) {
        this._renderGraph(this._positioned)
      }
    } else {
      this._renderFocusedView()
    }
    this._emitBreadcrumb()
  }

  /**
   * Focus to a specific depth (for breadcrumb clicks).
   */
  focusTo(depth: number): void {
    while (this._focusStack.length > depth) {
      this._focusStack.pop()
    }
    this._emitter.emit('focus:change', null, this._focusStack.slice())

    if (this._focusStack.length === 0) {
      if (this._positioned) this._renderGraph(this._positioned)
    } else {
      this._renderFocusedView()
    }
    this._emitBreadcrumb()
  }

  /**
   * Re-layout and render only the focused subgraph's contents.
   * External connections shown as stub nodes at the edges.
   */
  private _renderFocusedView(): void {
    if (!this._graph || !this._viewport || this._focusStack.length === 0) return

    const focusedId = this._focusStack[this._focusStack.length - 1]
    const sg = this._graph.subgraphs.get(focusedId)
    if (!sg) return

    const theme = getTheme(this._currentPhilosophy as any)
    const focusedNodeIds = new Set(sg.nodeIds)

    // Build a mini-graph with just this subgraph's nodes
    const miniNodes = new Map<string, any>()
    for (const nodeId of sg.nodeIds) {
      const node = this._graph.nodes.get(nodeId)
      if (node) miniNodes.set(nodeId, node)
    }

    // Find external connections and create stub nodes for them
    const stubNodes = new Map<string, any>()
    const allEdges: typeof this._graph.edges = []

    for (const edge of this._graph.edges) {
      const srcIn = focusedNodeIds.has(edge.source)
      const tgtIn = focusedNodeIds.has(edge.target)

      if (srcIn && tgtIn) {
        // Internal edge — keep as-is
        allEdges.push(edge)
      } else if (srcIn && !tgtIn) {
        // Outgoing edge — create stub for target
        const targetNode = this._graph.nodes.get(edge.target)
        const stubId = `_stub_${edge.target}`
        if (!stubNodes.has(stubId)) {
          stubNodes.set(stubId, {
            id: stubId,
            label: targetNode?.label ?? edge.target,
            shape: 'rectangle',
            metadata: { _isStub: true },
          })
        }
        allEdges.push({ ...edge, target: stubId })
      } else if (!srcIn && tgtIn) {
        // Incoming edge — create stub for source
        const sourceNode = this._graph.nodes.get(edge.source)
        const stubId = `_stub_${edge.source}`
        if (!stubNodes.has(stubId)) {
          stubNodes.set(stubId, {
            id: stubId,
            label: sourceNode?.label ?? edge.source,
            shape: 'rectangle',
            metadata: { _isStub: true },
          })
        }
        allEdges.push({ ...edge, source: stubId })
      }
    }

    // Merge real + stub nodes
    const combinedNodes = new Map(miniNodes)
    for (const [id, stub] of stubNodes) {
      combinedNodes.set(id, stub as any)
    }

    // Layout just this subset
    const miniGraph = {
      ...this._graph,
      nodes: combinedNodes,
      edges: allEdges,
      subgraphs: new Map(), // No subgraphs in focused view
    }

    const layout = new DagreLayout({ philosophy: this._currentPhilosophy as any })
    const positioned = layout.compute(miniGraph)

    // Clear and render
    this._viewport.removeChildren()
    this._nodeSprites.clear()
    this._edgeGraphics = []
    this._subgraphContainers.clear()

    // Edges
    for (const edge of positioned.edges) {
      const eg = new EdgeGraphic(edge, theme)
      this._edgeGraphics.push(eg)
      this._viewport.addChild(eg)
    }

    // Nodes
    for (const [id, node] of positioned.nodes) {
      const isStub = id.startsWith('_stub_')
      const sprite = new NodeSprite(node, theme)

      // Stubs are faded
      if (isStub) {
        sprite.alpha = 0.4
      }

      this._nodeSprites.set(id, sprite)
      this._viewport.addChild(sprite)

      // Click on stub navigates back or to the source subgraph
      if (!isStub) {
        sprite.on('pointertap', (e: FederatedPointerEvent) => {
          this._emitter.emit('node:click', {
            nodeId: id,
            eventType: 'click',
            originalEvent: e.nativeEvent as Event | undefined,
          })
          this.selectNode(id)
        })
      }
    }

    // Fit the focused content
    this.fitToView()
    if (this._viewport) {
      this._updateDetailLevel(this._viewport._zoom)
    }
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
      this._fitZoom = this._viewport._zoom
    }
  }

  resetView(): void {
    this._viewport?.resetView()
    this._focusStack = []
    this._restoreAllOpacities()
    this._emitBreadcrumb()
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
    this._subgraphContainers.clear()

    // Compute nesting depth for each subgraph (larger subgraphs containing smaller ones = deeper)
    const sgDepths = new Map<string, number>()
    const sortedSgs = Array.from(positioned.subgraphs.entries())
      .sort((a, b) => (b[1].width * b[1].height) - (a[1].width * a[1].height)) // largest first
    for (const [sgId, sg] of sortedSgs) {
      let depth = 0
      for (const [otherId, other] of positioned.subgraphs) {
        if (otherId === sgId) continue
        // Check if this subgraph is inside another (center is within bounds)
        const hw = other.width / 2, hh = other.height / 2
        if (sg.x > other.x - hw && sg.x < other.x + hw &&
            sg.y > other.y - hh && sg.y < other.y + hh) {
          depth++
        }
      }
      sgDepths.set(sgId, depth)
    }

    // Draw subgraphs — largest (depth 0) first, smallest (deepest) on top.
    // Single-click = fold/unfold (primary). Double-click = isolate/focus (secondary).
    for (const [sgId, sg] of sortedSgs) {
      const depth = sgDepths.get(sgId) ?? 0
      const sgc = new SubgraphContainer(sg, theme, depth)
      this._subgraphContainers.set(sgId, sgc)

      // Single click = fold/unfold
      let lastTapTime = 0
      sgc.on('pointertap', () => {
        const now = Date.now()
        if (now - lastTapTime < 400) {
          // Double-click = isolate/focus into subgraph
          if (!this._graph?.subgraphs.has(sgId)) return
          this.focusSubgraph(sgId)
          lastTapTime = 0
          return
        }
        lastTapTime = now

        // Delayed single-click = fold/unfold (wait to see if double-click follows)
        setTimeout(() => {
          if (lastTapTime !== now) return // double-click happened, skip
          if (!this._graph?.subgraphs.has(sgId)) return
          const sub = this._graph.subgraphs.get(sgId)!
          if (sub.collapsed) {
            this.unfoldNode(sgId)
          } else {
            this.foldNode(sgId)
          }
        }, 250) // wait 250ms to distinguish from double-click
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

    // Auto-fit first (sets _fitZoom baseline), then apply detail levels
    this.fitToView()

    // Now that fitToView set the zoom, apply detail levels (relative to fit zoom)
    if (this._viewport) {
      this._updateDetailLevel(this._viewport._zoom)
    }

    // Re-apply focus dimming if we have an active focus
    if (this._focusStack.length > 0) {
      this._applyFocusDimming()
    }
  }

  /**
   * Update semantic zoom detail levels on all elements.
   * Thresholds are relative to the fitToView zoom (the "default" zoom).
   * At default zoom everything should be fully visible.
   * Hiding only kicks in when user zooms OUT beyond the default.
   */
  private _updateDetailLevel(zoom: number): void {
    // Get the fit zoom as baseline — everything at or above this should show full detail
    const fitZoom = this._fitZoom ?? 1
    const relativeZoom = fitZoom > 0 ? zoom / fitZoom : zoom

    for (const sprite of this._nodeSprites.values()) {
      sprite.updateDetailLevel(relativeZoom)
    }
    for (const sgc of this._subgraphContainers.values()) {
      sgc.updateDetailLevel(relativeZoom)
    }
    // Only hide edges when zoomed way out (less than 30% of default)
    for (const eg of this._edgeGraphics) {
      if (relativeZoom < 0.3) {
        eg.visible = false
      } else if (relativeZoom < 0.6) {
        eg.visible = true
        eg.alpha = (relativeZoom - 0.3) / 0.3
      } else {
        eg.visible = true
        eg.alpha = 1
      }
    }
  }

  /** Cached fit-to-view zoom level — used as baseline for semantic zoom */
  private _fitZoom: number = 1

  /**
   * Apply focus dimming: dim all elements not in the currently focused subgraph.
   */
  private _applyFocusDimming(): void {
    if (this._focusStack.length === 0) return
    const focusedId = this._focusStack[this._focusStack.length - 1]
    const focusedSg = this._graph?.subgraphs.get(focusedId)
    if (!focusedSg) return

    const theme = getTheme(this._currentPhilosophy as any)
    const focusedNodeIds = new Set(focusedSg.nodeIds)

    // Dim nodes not in focused subgraph
    for (const [id, sprite] of this._nodeSprites) {
      sprite.alpha = focusedNodeIds.has(id) ? 1 : theme.dimmedAlpha
    }

    // Dim subgraph containers not the focused one
    for (const [id, sgc] of this._subgraphContainers) {
      sgc.alpha = id === focusedId ? 1 : theme.dimmedAlpha
    }

    // Dim edges not connecting nodes within the focused subgraph
    for (const eg of this._edgeGraphics) {
      const srcIn = focusedNodeIds.has(eg.data.source)
      const tgtIn = focusedNodeIds.has(eg.data.target)
      eg.alpha = (srcIn && tgtIn) ? 1 : theme.dimmedAlpha
    }
  }

  /**
   * Restore all element opacities to full.
   */
  private _restoreAllOpacities(): void {
    for (const sprite of this._nodeSprites.values()) {
      sprite.alpha = 1
    }
    for (const sgc of this._subgraphContainers.values()) {
      sgc.alpha = 1
    }
    for (const eg of this._edgeGraphics) {
      eg.alpha = 1
    }
  }

  /**
   * Emit breadcrumb state to the consumer callback.
   */
  private _emitBreadcrumb(): void {
    if (!this.onBreadcrumbChange) return

    const segments: Array<{ id: string | null; label: string }> = [
      { id: null, label: 'Root' },
    ]

    for (const sgId of this._focusStack) {
      const sg = this._graph?.subgraphs.get(sgId)
      segments.push({
        id: sgId,
        label: sg?.label ?? sgId,
      })
    }

    this.onBreadcrumbChange(segments)
  }

  /**
   * Re-run layout on the current graph (after fold changes) and re-render.
   */
  private _relayout(): void {
    if (!this._graph) return
    const layout = new DagreLayout({ philosophy: this._currentPhilosophy as any })
    this._positioned = layout.compute(this._graph)
    this._renderGraph(this._positioned)
  }
}
