import { Container } from 'pixi.js'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 5.0
const ZOOM_FACTOR = 0.001

/**
 * Viewport container that supports zoom (wheel) and pan (drag on empty space).
 * Zoom targets the cursor position so the point under the cursor stays fixed.
 */
export class Viewport extends Container {
  /** Current zoom level (1 = 100%). */
  _zoom = 1

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
    this._zoom = Math.min(scaleX, scaleY, MAX_ZOOM)
    this._zoom = Math.max(this._zoom, MIN_ZOOM)
    this.scale.set(this._zoom)
    this.x = (cw - contentWidth * this._zoom) / 2
    this.y = (ch - contentHeight * this._zoom) / 2
  }

  /**
   * Reset zoom to 1 and offset to 0.
   */
  resetView(): void {
    this._zoom = 1
    this.scale.set(1)
    this.x = 0
    this.y = 0
  }

  /**
   * Remove all DOM event listeners. Call when destroying the renderer.
   */
  cleanup(): void {
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
  }
}
