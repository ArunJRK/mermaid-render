import { Application, Graphics, BitmapText } from 'pixi.js'
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
import { LoadPipeline, createLayoutEngine } from './load-pipeline'
import { EventEmitter } from './event-emitter'
import { Viewport } from './viewport'
import { NodeSprite } from './node-sprite'
import { EdgeGraphic } from './edge-graphic'
import { SubgraphContainer } from './subgraph-container'
import { FoldManager } from '../interaction/fold-manager'
import { mapKeyToAction } from '../interaction/keyboard'
import { NarrativeLayout } from '../layout/narrative-layout'
import { getTheme, type Theme } from './theme'
import { LinkPreview } from './link-preview'
import { LayoutAnimator } from './layout-animator'
import { drawWireHops } from './wire-hops'
import { ensureFontsInstalled } from './fonts'

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
  private _layoutAnimator = new LayoutAnimator()
  private _spineNodeIds: Set<string> = new Set()
  private _busGraphics = new Map<string, Graphics>() // Blueprint: source ID → bus graphic
  private _busSourceIds = new Set<string>() // sources that were merged into bus lines
  private _linkPreview: LinkPreview | null = null

  // Focus navigation state
  private _focusStack: string[] = []

  // Breadcrumb callback — the consumer provides a function to update breadcrumb UI
  onBreadcrumbChange: ((segments: Array<{ id: string | null; label: string }>) => void) | null = null

  // Link preview resolver — consumer provides this to load target file graphs for hover preview
  onResolvePreview: ((targetFile: string) => Promise<RenderGraph | null>) | null = null

  // Bound handlers for cleanup
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null

  // ── Lifecycle ────────────────────────────────────────────

  /**
   * Initialise PixiJS and attach to the given canvas element.
   */
  async mount(canvas: HTMLCanvasElement): Promise<void> {
    this._canvas = canvas

    // Prefer WebGPU when available (true GPU guarantee), fall back to WebGL
    const preferWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator
    const app = new Application()
    await app.init({
      canvas,
      background: 0x111827,
      resizeTo: canvas.parentElement ?? undefined,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio ?? 1,
      preference: preferWebGPU ? 'webgpu' : 'webgl',
    })
    this._app = app

    // Log which renderer backend is active
    const rendererType = app.renderer.type === 0x1 ? 'WebGL' : app.renderer.type === 0x2 ? 'WebGPU' : 'Unknown'
    console.log(`[mermaid-render] GPU backend: ${rendererType}`)

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

    // Link preview popup — rendered inside the same PixiJS app (no second WebGL context)
    this._linkPreview = new LinkPreview(app)
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

    // Layout animator
    this._layoutAnimator.cancel()

    // Link preview
    this._linkPreview?.destroy()
    this._linkPreview = null

    // Event emitter
    this._emitter.removeAll()

    this._canvas = null
    this._graph = null
    this._positioned = null
    this._foldManager = null
    this._nodeSprites.clear()
    this._edgeGraphics = []
    this._subgraphContainers.clear()
    this._busGraphics.clear()
    this._busSourceIds.clear()
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

    const layout = createLayoutEngine(this._currentPhilosophy)
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

    const layout = createLayoutEngine(this._currentPhilosophy)
    const positioned = layout.compute(miniGraph)
    const isBlueprint = this._currentPhilosophy === 'blueprint'

    // Clear and render
    this._viewport.removeChildren()
    this._nodeSprites.clear()
    this._edgeGraphics = []
    this._subgraphContainers.clear()
    this._busGraphics.clear()
    this._busSourceIds.clear()

    // Blueprint: bus lines for multi-target edges from same source
    let edgesToRender = positioned.edges
    if (isBlueprint && this._graph) {
      const edgeCounts = new Map<string, number>()
      for (const e of positioned.edges) {
        edgeCounts.set(e.source, (edgeCounts.get(e.source) ?? 0) + 1)
      }
      const busSourceIds = new Set<string>()
      for (const [src, count] of edgeCounts) {
        if (count >= 2) busSourceIds.add(src)
      }
      this._busSourceIds = busSourceIds
      this._drawBlueprintBusLines(positioned, theme, busSourceIds)
      edgesToRender = positioned.edges.filter(e => !busSourceIds.has(e.source))
    }

    // Draw edges — pass all nodes for Blueprint collision avoidance
    let edgeIdx = 0
    for (const edge of edgesToRender) {
      const eg = new EdgeGraphic(edge, theme, positioned.nodes, this._currentPhilosophy, edgeIdx, edgesToRender.length); edgeIdx++
      this._edgeGraphics.push(eg)
      this._viewport.addChild(eg)
    }

    // Blueprint: wire crossing hops
    if (isBlueprint) {
      const edgeSegments = this._edgeGraphics
        .filter(eg => eg.orthogonalSegments != null)
        .map(eg => ({ edgeId: eg.data.id, segments: eg.orthogonalSegments! }))
      if (edgeSegments.length > 0) {
        const hopGraphic = drawWireHops(edgeSegments, theme)
        this._viewport.addChild(hopGraphic)
      }
    }

    // Determine font name based on philosophy
    const fontName = isBlueprint ? 'MermaidBlueprint' : 'MermaidNode'

    // Nodes
    for (const [id, node] of positioned.nodes) {
      const isStub = id.startsWith('_stub_')
      const sprite = new NodeSprite(node, theme, false, fontName)

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

  // ── Philosophy ───────────────────────────────────────────

  /**
   * Switch layout philosophy without re-parsing. Preserves fold state.
   */
  setPhilosophy(philosophy: string): void {
    this._currentPhilosophy = philosophy

    // Update background
    if (this._app) {
      const theme = getTheme(philosophy as any)
      this._app.renderer.background.color = theme.background
    }

    // Re-layout with new philosophy, preserving fold state
    this._relayout()
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
    // Toggle: clicking same node deselects it
    if (id !== null && id === this._selectedNodeId) {
      id = null
    }

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

    const isBlueprint = this._currentPhilosophy === 'blueprint'

    // Clear previous children
    this._viewport.removeChildren()
    this._nodeSprites.clear()
    this._edgeGraphics = []
    this._subgraphContainers.clear()
    this._busGraphics.clear()
    this._busSourceIds.clear()

    // Draw blueprint grid background
    if (isBlueprint && theme.gridColor !== undefined) {
      const gridGfx = new Graphics()
      const gridSize = theme.gridSize ?? 20
      const gridColor = theme.gridColor
      const gridAlpha = theme.gridAlpha ?? 0.3
      // Extend grid beyond the graph bounds for visual completeness
      const padding = 100
      const startX = -padding
      const startY = -padding
      const endX = positioned.width + padding
      const endY = positioned.height + padding

      // Vertical lines
      for (let x = startX; x <= endX; x += gridSize) {
        gridGfx.moveTo(x, startY)
        gridGfx.lineTo(x, endY)
      }
      // Horizontal lines
      for (let y = startY; y <= endY; y += gridSize) {
        gridGfx.moveTo(startX, y)
        gridGfx.lineTo(endX, y)
      }
      gridGfx.stroke({ width: 1, color: gridColor, alpha: gridAlpha })
      this._viewport.addChild(gridGfx)
    }

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

    // Blueprint: merge edges from same source into bus/trunk lines
    let edgesToDraw = positioned.edges
    const busSourceIds = new Set<string>()
    if (isBlueprint && this._graph) {
      // Find sources with 2+ edges (these become bus lines)
      const edgeCounts = new Map<string, number>()
      for (const e of positioned.edges) {
        edgeCounts.set(e.source, (edgeCounts.get(e.source) ?? 0) + 1)
      }
      for (const [src, count] of edgeCounts) {
        if (count >= 2) busSourceIds.add(src)
      }

      this._busSourceIds = busSourceIds
      this._busGraphics.clear()
      this._drawBlueprintBusLines(positioned, theme, busSourceIds)
      // Filter out edges that are drawn as bus lines
      edgesToDraw = positioned.edges.filter(e => !busSourceIds.has(e.source))
    }

    // Draw individual edges
    let edgeIdx = 0
    for (const edge of edgesToDraw) {
      const eg = new EdgeGraphic(edge, theme, positioned.nodes, this._currentPhilosophy, edgeIdx, edgesToDraw.length); edgeIdx++
      this._edgeGraphics.push(eg)
      this._viewport.addChild(eg)
    }

    // Blueprint: wire crossing hops — drawn after all edges so we can detect crossings
    if (isBlueprint) {
      const edgeSegments = this._edgeGraphics
        .filter(eg => eg.orthogonalSegments != null)
        .map(eg => ({ edgeId: eg.data.id, segments: eg.orthogonalSegments! }))
      if (edgeSegments.length > 0) {
        const hopGraphic = drawWireHops(edgeSegments, theme)
        this._viewport.addChild(hopGraphic)
      }
    }

    // Build set of node IDs that have @link directives
    const linkedNodeIds = new Set<string>()
    if (this._graph) {
      for (const d of this._graph.directives) {
        if (d.type === 'link') linkedNodeIds.add(d.nodeId)
      }
    }

    // Determine font name based on philosophy
    const fontName = isBlueprint ? 'MermaidBlueprint' : 'MermaidNode'

    // Draw nodes (on top)
    for (const [id, node] of positioned.nodes) {
      const hasLink = linkedNodeIds.has(id)
      const sprite = new NodeSprite(node, theme, hasLink, fontName)
      this._nodeSprites.set(id, sprite)
      this._viewport.addChild(sprite)

      // Hover: highlight connected edges + bus lines, dim unrelated
      sprite.on('pointerover', () => {
        for (const eg of this._edgeGraphics) {
          const connected = eg.data.source === id || eg.data.target === id
          eg.alpha = connected ? 1 : 0.15
        }
        // Also highlight/dim bus graphics
        for (const [srcId, busGfx] of this._busGraphics) {
          const targetIds: string[] = (busGfx as any)._targetIds ?? []
          const connected = srcId === id || targetIds.includes(id)
          busGfx.alpha = connected ? 1 : 0.15
        }
      })
      sprite.on('pointerout', () => {
        if (!this._selectedNodeId) {
          for (const eg of this._edgeGraphics) eg.alpha = 1
          for (const busGfx of this._busGraphics.values()) busGfx.alpha = 1
        }
      })

      // Wire node click — select only, no navigation
      sprite.on('pointertap', (e: FederatedPointerEvent) => {
        // If this is a collapsed summary node, clicking expands it
        if (node.metadata?._isCollapsedSummary) {
          const sgId = node.metadata._subgraphId as string
          this.unfoldNode(sgId)
          return
        }

        const evt: NodeEvent = {
          nodeId: id,
          eventType: 'click',
          originalEvent: e.nativeEvent as Event | undefined,
        }
        this._emitter.emit('node:click', evt)
        this.selectNode(id)
      })

      // Wire badge click + hover preview for linked nodes
      if (hasLink) {
        const linkDirective = this._graph?.directives.find(
          (d): d is LinkDirective => d.type === 'link' && d.nodeId === id,
        )

        // Badge click navigates to the linked file
        sprite.on('badge:click', () => {
          this._linkPreview?.hide()
          if (linkDirective) {
            this._emitter.emit('link:navigate', {
              targetFile: linkDirective.targetFile,
              targetNode: linkDirective.targetNode,
              sourceNode: id,
            })
          }
        })

        // Hover shows wiki-style preview of the target file (debounced)
        sprite.on('pointerover', () => {
          if (!linkDirective || !this.onResolvePreview || !this._linkPreview) return
          const theme = getTheme(this._currentPhilosophy as any)
          const bounds = sprite.getBounds()
          const resolver = this.onResolvePreview
          this._linkPreview.scheduleShow(
            bounds.right, bounds.y,
            linkDirective.targetFile,
            () => resolver(linkDirective.targetFile),
            theme,
          )
        })

        sprite.on('pointerout', () => {
          this._linkPreview?.hide()
        })
      }

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

    // For Narrative: detect and store spine for hover highlighting
    this._spineNodeIds.clear()
    if (this._currentPhilosophy === 'narrative' && this._graph) {
      const nl = new NarrativeLayout()
      const spine = nl.detectSpine(this._graph)
      for (const id of spine) this._spineNodeIds.add(id)

      // Build spine edge set
      const spineEdgeIds = new Set<string>()
      for (let i = 0; i < spine.length - 1; i++) {
        for (const eg of this._edgeGraphics) {
          if (eg.data.source === spine[i] && eg.data.target === spine[i + 1]) {
            spineEdgeIds.add(eg.data.id)
          }
        }
      }

      // Dim non-spine elements slightly by default
      for (const [id, sprite] of this._nodeSprites) {
        if (!this._spineNodeIds.has(id)) sprite.alpha = 0.7
      }
      for (const eg of this._edgeGraphics) {
        if (!spineEdgeIds.has(eg.data.id)) eg.alpha = 0.4
      }
    }
  }

  /**
   * Update semantic zoom detail levels on all elements.
   * Thresholds are relative to the fitToView zoom (the "default" zoom).
   * At default zoom everything should be fully visible.
   * Hiding only kicks in when user zooms OUT beyond the default.
   */
  private _updateDetailLevel(zoom: number): void {
    // Nodes get absolute zoom for Coggle-style font counter-scaling
    for (const sprite of this._nodeSprites.values()) {
      sprite.updateDetailLevel(zoom)
    }

    // Subgraphs use relative zoom for label visibility
    const fitZoom = this._fitZoom ?? 1
    const relativeZoom = fitZoom > 0 ? zoom / fitZoom : zoom
    for (const sgc of this._subgraphContainers.values()) {
      sgc.updateDetailLevel(relativeZoom)
    }

    // Edges always visible
    for (const eg of this._edgeGraphics) {
      eg.visible = true
      eg.alpha = 1
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
    if (!this._graph || !this._viewport) return
    this._layoutAnimator.cancel()

    const layout = createLayoutEngine(this._currentPhilosophy)
    const newPositioned = layout.compute(this._graph)
    this._positioned = newPositioned

    // Quick crossfade: fade out old content, render new, fade in
    // This keeps everything (nodes + edges + subgraphs) in sync as one organism
    const vp = this._viewport
    const startAlpha = vp.alpha
    vp.alpha = 0.3
    this._renderGraph(newPositioned)
    // Fade back in over ~150ms
    let frame = 0
    const fadeIn = () => {
      frame++
      vp.alpha = 0.3 + 0.7 * Math.min(1, frame / 9) // ~9 frames = 150ms at 60fps
      if (frame < 9) requestAnimationFrame(fadeIn)
    }
    requestAnimationFrame(fadeIn)
  }

  /**
   * Blueprint bus lines: when one source node has multiple edges to different targets,
   * draw a single trunk wire from the source, then fan out horizontally to each target.
   * This prevents multiple parallel wires from the same source port.
   * Returns a Graphics object with the bus lines, or null if no buses needed.
   */
  /** Check if a vertical line at x from y1 to y2 hits any node (excluding given IDs) */
  private _verticalHitsNode(x: number, y1: number, y2: number, positioned: PositionedGraph, excludeIds: Set<string>): boolean {
    const minY = Math.min(y1, y2)
    const maxY = Math.max(y1, y2)
    for (const [id, node] of positioned.nodes) {
      if (excludeIds.has(id)) continue
      const hw = node.width / 2 + 8
      const hh = node.height / 2 + 8
      if (x >= node.x - hw && x <= node.x + hw && maxY >= node.y - hh && minY <= node.y + hh) {
        return true
      }
    }
    return false
  }

  /** Find a clear vertical X lane near targetX that doesn't hit nodes */
  private _findClearVerticalLane(targetX: number, y1: number, y2: number, positioned: PositionedGraph, excludeIds: Set<string>, gridSize: number): number {
    if (!this._verticalHitsNode(targetX, y1, y2, positioned, excludeIds)) return targetX
    // Try offsets left and right
    for (let i = 1; i <= 15; i++) {
      const leftX = Math.round((targetX - i * gridSize) / gridSize) * gridSize
      if (!this._verticalHitsNode(leftX, y1, y2, positioned, excludeIds)) return leftX
      const rightX = Math.round((targetX + i * gridSize) / gridSize) * gridSize
      if (!this._verticalHitsNode(rightX, y1, y2, positioned, excludeIds)) return rightX
    }
    return targetX // give up
  }

  /** Check if a horizontal line at y from x1 to x2 hits any node */
  private _horizontalHitsNode(y: number, x1: number, x2: number, positioned: PositionedGraph, excludeIds: Set<string>): boolean {
    const minX = Math.min(x1, x2)
    const maxX = Math.max(x1, x2)
    for (const [id, node] of positioned.nodes) {
      if (excludeIds.has(id)) continue
      const hw = node.width / 2 + 8
      const hh = node.height / 2 + 8
      if (y >= node.y - hh && y <= node.y + hh && maxX >= node.x - hw && minX <= node.x + hw) {
        return true
      }
    }
    return false
  }

  private _drawBlueprintBusLines(positioned: PositionedGraph, theme: Theme, busSourceIds: Set<string>): void {
    if (!this._graph || !this._viewport) return

    const gridSize = (theme as any).gridSize ?? 20
    const color = theme.edgeColor

    const bySource = new Map<string, typeof positioned.edges>()
    for (const edge of positioned.edges) {
      const group = bySource.get(edge.source) ?? []
      group.push(edge)
      bySource.set(edge.source, group)
    }

    for (const [sourceId, edges] of bySource) {
      if (!busSourceIds.has(sourceId)) continue

      const srcNode = positioned.nodes.get(sourceId)
      if (!srcNode) continue

      const srcPortY = srcNode.y + srcNode.height / 2
      const targetIds = new Set(edges.map(e => e.target))
      const excludeIds = new Set([sourceId, ...targetIds])

      const targets = edges.map(e => {
        const tgt = positioned.nodes.get(e.target)
        return tgt ? { id: e.target, x: tgt.x, y: tgt.y - tgt.height / 2 } : null
      }).filter(Boolean) as Array<{ id: string; x: number; y: number }>

      if (targets.length < 2) continue

      // Find a clear trunk X lane
      const trunkX = this._findClearVerticalLane(srcNode.x, srcPortY, Math.min(...targets.map(t => t.y)), positioned, excludeIds, gridSize)

      // Find a clear horizontal bus Y
      const minTargetY = Math.min(...targets.map(t => t.y))
      let busY = Math.round(((srcPortY + minTargetY) / 2) / gridSize) * gridSize
      const minBusX = Math.min(trunkX, ...targets.map(t => t.x))
      const maxBusX = Math.max(trunkX, ...targets.map(t => t.x))

      // Shift busY if it hits nodes
      for (let attempt = 0; attempt < 15; attempt++) {
        if (!this._horizontalHitsNode(busY, minBusX, maxBusX, positioned, excludeIds)) break
        busY += (attempt % 2 === 0 ? 1 : -1) * (attempt + 1) * gridSize
        busY = Math.round(busY / gridSize) * gridSize
      }

      const busGfx = new Graphics()

      // Trunk: source → trunkX → busY
      busGfx.moveTo(srcNode.x, srcPortY)
      if (trunkX !== srcNode.x) busGfx.lineTo(trunkX, srcPortY)
      busGfx.lineTo(trunkX, busY)

      // Horizontal bus
      busGfx.moveTo(minBusX, busY)
      busGfx.lineTo(maxBusX, busY)

      // Fan-out: each target gets a UNIQUE vertical lane
      const usedLanes = new Set<number>()
      usedLanes.add(trunkX) // trunk already uses this lane
      for (const tgt of targets) {
        let dropX = this._findClearVerticalLane(tgt.x, busY, tgt.y, positioned, excludeIds, gridSize)
        // Ensure this lane isn't already used by another fan-out drop
        while (usedLanes.has(dropX)) {
          dropX += gridSize
          dropX = Math.round(dropX / gridSize) * gridSize
        }
        usedLanes.add(dropX)

        busGfx.moveTo(dropX, busY)
        busGfx.lineTo(dropX, tgt.y)
        if (dropX !== tgt.x) busGfx.lineTo(tgt.x, tgt.y)
      }

      busGfx.stroke({ width: 1.5, color })
      ;(busGfx as any)._targetIds = targets.map(t => t.id)
      this._busGraphics.set(sourceId, busGfx)
      this._viewport.addChild(busGfx)
    }
  }
}
