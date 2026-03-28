import { Container } from 'pixi.js'
import { Spring, type SpringConfig } from './spring'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 5.0
const ZOOM_FACTOR = 0.003

/** Spring config for viewport transitions — slightly snappier than node springs. */
const VIEWPORT_SPRING: SpringConfig = { stiffness: 170, damping: 26 }

export interface ViewportTarget {
  x: number
  y: number
  zoom: number
}

/**
 * Viewport container that supports zoom (wheel) and pan (drag on empty space).
 * Zoom targets the cursor position so the point under the cursor stays fixed.
 * All animated transitions use damped spring physics for natural motion.
 */
export class Viewport extends Container {
  /** Current zoom level (1 = 100%). */
  _zoom = 1

  /** Called whenever the zoom level changes (for semantic zoom). */
  onZoomChange: ((zoom: number) => void) | null = null

  private _isPanning = false
  private _panStartX = 0
  private _panStartY = 0
  private _panOriginX = 0
  private _panOriginY = 0

  private _canvas: HTMLCanvasElement | null = null

  // Bound handlers so we can remove them later
  private _onWheel: ((e: WheelEvent) => void) | null = null
  private _onPointerMove: ((e: PointerEvent) => void) | null = null
  private _onPointerUp: ((e: PointerEvent) => void) | null = null

  // Spring animation state
  private _animationId: number | null = null
  private _springX: Spring | null = null
  private _springY: Spring | null = null
  private _springZoom: Spring | null = null

  /**
   * Attach wheel/pointer listeners to the given canvas element.
   * Must be called once after PixiJS Application is initialised.
   */
  attach(canvas: HTMLCanvasElement): void {
    this._canvas = canvas

    this._onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const cursorX = e.clientX - rect.left
      const cursorY = e.clientY - rect.top
      this._handleZoom(e.deltaY, cursorX, cursorY)
    }

    this._onPointerMove = (e: PointerEvent) => {
      if (!this._isPanning) return
      const dx = e.clientX - this._panStartX
      const dy = e.clientY - this._panStartY
      this.x = this._panOriginX + dx
      this.y = this._panOriginY + dy
    }

    this._onPointerUp = () => {
      this._isPanning = false
    }

    canvas.addEventListener('wheel', this._onWheel, { passive: false })
    window.addEventListener('pointermove', this._onPointerMove)
    window.addEventListener('pointerup', this._onPointerUp)
  }

  /**
   * Begin a pan gesture. Called by the renderer when a drag starts on empty space.
   */
  startPan(clientX: number, clientY: number): void {
    this._isPanning = true
    this._panStartX = clientX
    this._panStartY = clientY
    this._panOriginX = this.x
    this._panOriginY = this.y
  }

  /**
   * Scale and centre the viewport so the content fits within the canvas.
   */
  fitToView(contentWidth: number, contentHeight: number): void {
    if (!this._canvas || contentWidth <= 0 || contentHeight <= 0) return
    const cw = this._canvas.clientWidth
    const ch = this._canvas.clientHeight
    const padding = 40
    const scaleX = (cw - padding * 2) / contentWidth
    const scaleY = (ch - padding * 2) / contentHeight
    const fitZoom = Math.min(scaleX, scaleY, MAX_ZOOM)

    // Enforce minimum readable zoom — content should never be tiny
    const MIN_READABLE_ZOOM = 0.5
    this._zoom = Math.max(fitZoom, MIN_READABLE_ZOOM)
    this.scale.set(this._zoom)

    // Center horizontally
    this.x = (cw - contentWidth * this._zoom) / 2

    // Start at the TOP of the diagram, not center
    // If diagram fits in viewport, center vertically. Otherwise, show from top.
    const scaledHeight = contentHeight * this._zoom
    if (scaledHeight <= ch - padding * 2) {
      // Fits: center vertically
      this.y = (ch - scaledHeight) / 2
    } else {
      // Doesn't fit: start at top with padding
      this.y = padding
    }

    this.onZoomChange?.(this._zoom)
  }

  /**
   * Animate the viewport to fit given content dimensions using spring physics.
   */
  animatedFitToView(contentWidth: number, contentHeight: number): void {
    if (!this._canvas || contentWidth <= 0 || contentHeight <= 0) return
    const cw = this._canvas.clientWidth
    const ch = this._canvas.clientHeight
    const padding = 40
    const scaleX = (cw - padding * 2) / contentWidth
    const scaleY = (ch - padding * 2) / contentHeight
    let zoom = Math.min(scaleX, scaleY, MAX_ZOOM)
    zoom = Math.max(zoom, MIN_ZOOM)
    const tx = (cw - contentWidth * zoom) / 2
    const ty = (ch - contentHeight * zoom) / 2
    this.animateTo({ x: tx, y: ty, zoom })
  }

  /**
   * Animate the viewport to center on a specific region (world coordinates).
   * The region is defined by center (cx, cy) and dimensions (w, h).
   * Uses spring physics for natural motion.
   */
  animateToRegion(cx: number, cy: number, w: number, h: number): void {
    if (!this._canvas) return
    const cw = this._canvas.clientWidth
    const ch = this._canvas.clientHeight
    const padding = 60
    const scaleX = (cw - padding * 2) / w
    const scaleY = (ch - padding * 2) / h
    let zoom = Math.min(scaleX, scaleY, MAX_ZOOM)
    zoom = Math.max(zoom, MIN_ZOOM)

    // Position so the region center maps to the canvas center
    const tx = cw / 2 - cx * zoom
    const ty = ch / 2 - cy * zoom

    this.animateTo({ x: tx, y: ty, zoom })
  }

  /**
   * Smoothly animate viewport to a target position and zoom using spring physics.
   * Replaces the old ease-out cubic with three independent damped springs (x, y, zoom).
   * The optional springConfig parameter overrides the default spring constants.
   */
  animateTo(target: ViewportTarget, springConfig?: SpringConfig): void {
    // Cancel any running animation
    if (this._animationId !== null) {
      cancelAnimationFrame(this._animationId)
      this._animationId = null
    }

    const config = springConfig ?? VIEWPORT_SPRING

    // Create or re-target springs from current position
    this._springX = new Spring(this.x, config)
    this._springY = new Spring(this.y, config)
    this._springZoom = new Spring(this._zoom, config)

    this._springX.setTarget(target.x)
    this._springY.setTarget(target.y)
    this._springZoom.setTarget(target.zoom)

    let lastTime = performance.now()

    const tick = () => {
      const now = performance.now()
      const dt = (now - lastTime) / 1000 // seconds
      lastTime = now

      this._springX!.tick(dt)
      this._springY!.tick(dt)
      this._springZoom!.tick(dt)

      this.x = this._springX!.value
      this.y = this._springY!.value
      this._zoom = this._springZoom!.value
      this.scale.set(this._zoom)
      this.onZoomChange?.(this._zoom)

      const settled =
        this._springX!.isSettled &&
        this._springY!.isSettled &&
        this._springZoom!.isSettled

      if (!settled) {
        this._animationId = requestAnimationFrame(tick)
      } else {
        // Snap to exact targets
        this.x = target.x
        this.y = target.y
        this._zoom = target.zoom
        this.scale.set(this._zoom)
        this.onZoomChange?.(this._zoom)
        this._animationId = null
        this._springX = null
        this._springY = null
        this._springZoom = null
      }
    }

    this._animationId = requestAnimationFrame(tick)
  }

  /**
   * Reset zoom to 1 and offset to 0, animated with spring physics.
   */
  resetView(): void {
    this.animateTo({ x: 0, y: 0, zoom: 1 })
  }

  /**
   * Reset zoom to 1 and offset to 0, immediately (no animation).
   */
  resetViewImmediate(): void {
    this._zoom = 1
    this.scale.set(1)
    this.x = 0
    this.y = 0
    this.onZoomChange?.(this._zoom)
  }

  /**
   * Remove all DOM event listeners. Call when destroying the renderer.
   */
  cleanup(): void {
    if (this._animationId !== null) {
      cancelAnimationFrame(this._animationId)
      this._animationId = null
    }
    this._springX = null
    this._springY = null
    this._springZoom = null

    if (this._canvas && this._onWheel) {
      this._canvas.removeEventListener('wheel', this._onWheel)
    }
    if (this._onPointerMove) {
      window.removeEventListener('pointermove', this._onPointerMove)
    }
    if (this._onPointerUp) {
      window.removeEventListener('pointerup', this._onPointerUp)
    }
    this._canvas = null
    this._onWheel = null
    this._onPointerMove = null
    this._onPointerUp = null
  }

  // ── private ──────────────────────────────────────────────

  private _handleZoom(delta: number, cursorX: number, cursorY: number): void {
    const oldZoom = this._zoom
    const zoomDelta = -delta * ZOOM_FACTOR
    let newZoom = oldZoom * (1 + zoomDelta)
    newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))

    // Adjust position so the point under cursor stays fixed
    const ratio = newZoom / oldZoom
    this.x = cursorX - (cursorX - this.x) * ratio
    this.y = cursorY - (cursorY - this.y) * ratio

    this._zoom = newZoom
    this.scale.set(newZoom)
    this.onZoomChange?.(this._zoom)
  }
}
