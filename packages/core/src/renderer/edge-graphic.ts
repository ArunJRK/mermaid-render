import { Graphics, BitmapText } from 'pixi.js'
import type { PositionedEdge, PositionedNode, EdgeStyle } from '../types'
import { ensureFontsInstalled } from './fonts'
import { lineIntersectsRect, computeWaypoint } from '../layout/blueprint-layout'
import type { Theme } from './theme'
import type { WireSegment } from './wire-crossings'
import type { WireSegment as RouterWireSegment } from '../router/types'
import type { WireRegistry } from './wire-registry'

const DIMMED_ALPHA = 0.12
const ARROW_SIZE = 8

export class EdgeGraphic extends Graphics {
  data: PositionedEdge
  private _labelText: BitmapText | null = null
  private _theme: Theme
  private _stressMode = false
  private _labelFontFamily: string | null = null
  private _arrowDebug: {
    tip: { x: number; y: number }
    wingA: { x: number; y: number }
    wingB: { x: number; y: number }
    angle: number
  } | null = null
  /** Orthogonal wire segments (set by Blueprint mode, read by wire-hop detector) */
  orthogonalSegments?: WireSegment[]

  /**
   * @param edgeIndex — unique index for this edge, used by Blueprint to offset parallel routes
   * @param totalEdges — total edges in the graph, used for channel spacing
   */
  constructor(edge: PositionedEdge, theme: Theme, allNodes?: Map<string, PositionedNode>, philosophy?: string, edgeIndex = 0, totalEdges = 1, allSubgraphs?: Map<string, { x: number; y: number; width: number; height: number }> | undefined, wireRegistry?: WireRegistry, reversePairOffset = 0) {
    super()
    this._theme = theme
    this.data = edge
    this.redraw(edge, theme, allNodes, philosophy, edgeIndex, totalEdges, allSubgraphs, wireRegistry, reversePairOffset)
  }

  redraw(
    edge: PositionedEdge,
    theme: Theme,
    allNodes?: Map<string, PositionedNode>,
    philosophy?: string,
    edgeIndex = 0,
    totalEdges = 1,
    allSubgraphs?: Map<string, { x: number; y: number; width: number; height: number }> | undefined,
    wireRegistry?: WireRegistry,
    reversePairOffset = 0,
  ): void {
    void allSubgraphs
    this.clear()
    this.removeChildren()
    this._labelText = null
    this._labelFontFamily = null
    this._arrowDebug = null
    this.orthogonalSegments = undefined
    this._theme = theme

    // Self-loops are rendered as explicit loop shapes for non-blueprint modes.
    if (edge.source === edge.target) {
      this.data = edge
      if (allNodes) {
        const node = allNodes.get(edge.source)
        if (node && philosophy !== 'blueprint' && philosophy !== 'blueprint-routed') {
          this._drawSelfLoop(edge, node, theme)
        }
      }
      return
    }

    if (allNodes && philosophy !== 'blueprint') {
      edge = this._trimToNodeBounds(edge, allNodes)
      edge = this._applyCollisionAvoidance(edge, allNodes)
    }
    this.data = edge

    switch (philosophy) {
      case 'blueprint':
        this._drawOrthogonal(edge, theme, edgeIndex, totalEdges, allNodes, wireRegistry)
        break
      case 'blueprint-routed':
        // Segments will be drawn via drawFromSegments() after construction
        break
      case 'breath':
        this._drawWhisper(edge, theme)
        break
      default:
        this._draw(edge, theme, reversePairOffset)
    }
  }

  /**
   * Check if the edge's straight-line path collides with any non-endpoint node,
   * and if so, insert a waypoint to route around it.
   */
  private _applyCollisionAvoidance(
    edge: PositionedEdge,
    allNodes: Map<string, PositionedNode>,
  ): PositionedEdge {
    const points = edge.points
    if (points.length < 2) return edge

    const srcPt = points[0]
    const tgtPt = points[points.length - 1]

    for (const [id, node] of allNodes) {
      if (id === edge.source || id === edge.target) continue

      const hw = node.width / 2
      const hh = node.height / 2

      if (lineIntersectsRect(srcPt.x, srcPt.y, tgtPt.x, tgtPt.y, node.x, node.y, hw, hh)) {
        const waypoint = computeWaypoint(
          srcPt.x, srcPt.y, tgtPt.x, tgtPt.y,
          node.x, node.y, node.width, node.height,
        )
        return {
          ...edge,
          points: [srcPt, waypoint, tgtPt],
        }
      }
    }

    return edge
  }

  private _trimToNodeBounds(
    edge: PositionedEdge,
    allNodes: Map<string, PositionedNode>,
  ): PositionedEdge {
    const points = edge.points
    if (points.length < 2) return edge

    const srcNode = allNodes.get(edge.source)
    const tgtNode = allNodes.get(edge.target)
    if (!srcNode || !tgtNode) return edge

    const nextFromSource = points[1]
    const prevToTarget = points[points.length - 2]

    const trimmed = points.slice()
    trimmed[0] = this._pointOnNodeBoundary(srcNode, nextFromSource)
    trimmed[trimmed.length - 1] = this._pointOnNodeBoundary(tgtNode, prevToTarget)

    return { ...edge, points: trimmed }
  }

  private _pointOnNodeBoundary(
    node: PositionedNode,
    toward: { x: number; y: number },
  ): { x: number; y: number } {
    const dx = toward.x - node.x
    const dy = toward.y - node.y
    if (dx === 0 && dy === 0) return { x: node.x, y: node.y }

    const hw = node.width / 2
    const hh = node.height / 2

    if (node.shape === 'circle') {
      const radius = Math.max(hw, hh)
      const length = Math.hypot(dx, dy) || 1
      return {
        x: node.x + (dx / length) * radius,
        y: node.y + (dy / length) * radius,
      }
    }

    if (node.shape === 'diamond') {
      const scale = 1 / ((Math.abs(dx) / hw) + (Math.abs(dy) / hh))
      return {
        x: node.x + dx * scale,
        y: node.y + dy * scale,
      }
    }

    if (node.shape === 'hexagon') {
      const inset = hw * 0.25
      const vertices = [
        { x: node.x - hw + inset, y: node.y - hh },
        { x: node.x + hw - inset, y: node.y - hh },
        { x: node.x + hw, y: node.y },
        { x: node.x + hw - inset, y: node.y + hh },
        { x: node.x - hw + inset, y: node.y + hh },
        { x: node.x - hw, y: node.y },
      ]
      const hit = this._intersectRayWithPolygon({ x: node.x, y: node.y }, toward, vertices)
      if (hit) return hit
    }

    const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh)

    return {
      x: node.x + dx * scale,
      y: node.y + dy * scale,
    }
  }

  private _intersectRayWithPolygon(
    origin: { x: number; y: number },
    toward: { x: number; y: number },
    vertices: Array<{ x: number; y: number }>,
  ): { x: number; y: number } | null {
    const ray = {
      x: toward.x - origin.x,
      y: toward.y - origin.y,
    }
    let bestT = Infinity
    let bestPoint: { x: number; y: number } | null = null

    for (let index = 0; index < vertices.length; index++) {
      const a = vertices[index]
      const b = vertices[(index + 1) % vertices.length]
      const segment = { x: b.x - a.x, y: b.y - a.y }
      const denom = ray.x * segment.y - ray.y * segment.x
      if (Math.abs(denom) < 1e-6) continue

      const ax = a.x - origin.x
      const ay = a.y - origin.y
      const t = (ax * segment.y - ay * segment.x) / denom
      const u = (ax * ray.y - ay * ray.x) / denom
      if (t < 0 || u < 0 || u > 1) continue
      if (t < bestT) {
        bestT = t
        bestPoint = {
          x: origin.x + ray.x * t,
          y: origin.y + ray.y * t,
        }
      }
    }

    return bestPoint
  }

  /**
   * Blueprint A* mode: draw pre-computed wire segments.
   * Called instead of constructor's _drawOrthogonal when router provides segments.
   */
  drawFromSegments(segments: RouterWireSegment[], theme: Theme): void {
    if (segments.length === 0) return
    const color = theme.edgeColor

    this.moveTo(segments[0].x1, segments[0].y1)
    for (const seg of segments) {
      this.lineTo(seg.x2, seg.y2)
    }
    this.stroke({ width: 1.5, color })

    // Record for hop detection
    this.orthogonalSegments = segments as WireSegment[]

    // Arrow at final segment end
    const last = segments[segments.length - 1]
    this._drawArrow([{ x: last.x1, y: last.y1 }, { x: last.x2, y: last.y2 }], color)

    // Label at midpoint
    if (this.data.label && segments.length > 0) {
      const midSeg = segments[Math.floor(segments.length / 2)]
      const mx = (midSeg.x1 + midSeg.x2) / 2
      const my = (midSeg.y1 + midSeg.y2) / 2
      ensureFontsInstalled()
      this._labelText = new BitmapText({
        text: this.data.label,
        style: { fontFamily: 'MermaidBlueprint', fontSize: 10, fill: theme.edgeLabelColor },
      })
      this._labelFontFamily = 'MermaidBlueprint'
      this._labelText.anchor.set(0.5)
      this._labelText.x = mx
      this._labelText.y = my - 12
      this._labelText.visible = !this._stressMode
      this.addChild(this._labelText)
    }
  }

  dim(on: boolean): void {
    this.alpha = on ? DIMMED_ALPHA : 1
  }

  setStressMode(stressMode: boolean): void {
    this._stressMode = stressMode
    if (this._labelText) this._labelText.visible = !stressMode
  }

  getLabelBounds(): { x: number; y: number; width: number; height: number } | null {
    if (!this._labelText) return null
    const bounds = this._labelText.getBounds()
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    }
  }

  getDebugStyle(): {
    strokeColor: number
    labelFill: number | null
    labelVisible: boolean
    labelFontFamily: string | null
    arrowTip: { x: number; y: number } | null
    arrowWingA: { x: number; y: number } | null
    arrowWingB: { x: number; y: number } | null
    arrowAngle: number | null
  } {
    return {
      strokeColor: this._theme.edgeColor,
      labelFill: this._labelText ? (this._labelText.style.fill as number | undefined) ?? null : null,
      labelVisible: this._labelText?.visible ?? false,
      labelFontFamily: this._labelFontFamily,
      arrowTip: this._arrowDebug?.tip ?? null,
      arrowWingA: this._arrowDebug?.wingA ?? null,
      arrowWingB: this._arrowDebug?.wingB ?? null,
      arrowAngle: this._arrowDebug?.angle ?? null,
    }
  }

  private _draw(edge: PositionedEdge, theme: Theme, reversePairOffset = 0): void {
    const points = edge.points
    if (points.length < 2) return

    const { width: lineWidth, dash } = this._styleParams(edge.style)
    const color = theme.edgeColor

    this.moveTo(points[0].x, points[0].y)

    if (points.length === 2 && reversePairOffset !== 0) {
      const start = points[0]
      const end = points[1]
      const control = this._reversePairControlPoint(start, end, reversePairOffset)
      this.quadraticCurveTo(control.x, control.y, end.x, end.y)
    } else if (points.length === 2) {
      this.lineTo(points[1].x, points[1].y)
    } else if (points.length === 3) {
      this.quadraticCurveTo(points[1].x, points[1].y, points[2].x, points[2].y)
    } else {
      for (let i = 1; i < points.length - 2; i += 2) {
        const cp1 = points[i]
        const cp2 = points[i + 1]
        const end = points[Math.min(i + 2, points.length - 1)]
        this.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y)
      }
      const lastDrawn = points.length % 2 === 0 ? points.length - 2 : points.length - 1
      for (let i = lastDrawn; i < points.length; i++) {
        this.lineTo(points[i].x, points[i].y)
      }
    }

    this.stroke({ width: lineWidth, color, alpha: dash ? 0.5 : 1 })
    this._drawArrow(points, color)

    if (edge.label) {
      const mid = this._labelPlacement(points, reversePairOffset)
      ensureFontsInstalled()
      this._labelText = new BitmapText({
        text: edge.label,
        style: { fontFamily: 'MermaidEdge', fontSize: 11, fill: theme.edgeLabelColor },
      })
      this._labelFontFamily = 'MermaidEdge'
      this._labelText.anchor.set(0.5)
      this._labelText.x = mid.x
      this._labelText.y = mid.y
      this._labelText.visible = !this._stressMode
      this.addChild(this._labelText)
    }
  }

  private _drawArrow(points: Array<{ x: number; y: number }>, color: number): void {
    const last = points[points.length - 1]
    const prev = points[points.length - 2]
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x)
    const wingA = {
      x: last.x - ARROW_SIZE * Math.cos(angle - Math.PI / 6),
      y: last.y - ARROW_SIZE * Math.sin(angle - Math.PI / 6),
    }
    const wingB = {
      x: last.x - ARROW_SIZE * Math.cos(angle + Math.PI / 6),
      y: last.y - ARROW_SIZE * Math.sin(angle + Math.PI / 6),
    }
    this._arrowDebug = {
      tip: { x: last.x, y: last.y },
      wingA,
      wingB,
      angle,
    }

    this.moveTo(last.x, last.y)
    this.lineTo(wingA.x, wingA.y)
    this.moveTo(last.x, last.y)
    this.lineTo(wingB.x, wingB.y)
    this.stroke({ width: 2, color })
  }

  private _styleParams(style: EdgeStyle): { width: number; dash: boolean } {
    switch (style) {
      case 'dotted': return { width: 1.5, dash: true }
      case 'thick': return { width: 3, dash: false }
      default: return { width: 1.5, dash: false }
    }
  }

  private _reversePairControlPoint(
    start: { x: number; y: number },
    end: { x: number; y: number },
    offset: number,
  ): { x: number; y: number } {
    const { nx, ny } = this._canonicalNormal(start, end)
    return {
      x: (start.x + end.x) / 2 + nx * offset,
      y: (start.y + end.y) / 2 + ny * offset,
    }
  }

  private _labelPlacement(
    points: Array<{ x: number; y: number }>,
    reversePairOffset: number,
  ): { x: number; y: number } {
    const labelPath = points.length === 2 && reversePairOffset !== 0
      ? [points[0], this._reversePairControlPoint(points[0], points[1], reversePairOffset), points[1]]
      : points

    if (labelPath.length < 2) return labelPath[0] ?? { x: 0, y: 0 }

    let totalLength = 0
    const segmentLengths: number[] = []
    for (let index = 0; index < labelPath.length - 1; index++) {
      const start = labelPath[index]
      const end = labelPath[index + 1]
      const length = Math.hypot(end.x - start.x, end.y - start.y)
      segmentLengths.push(length)
      totalLength += length
    }

    if (totalLength <= 1e-6) return labelPath[Math.floor(labelPath.length / 2)]

    const target = totalLength / 2
    let traversed = 0
    for (let index = 0; index < segmentLengths.length; index++) {
      const length = segmentLengths[index]
      if (traversed + length < target) {
        traversed += length
        continue
      }

      const start = labelPath[index]
      const end = labelPath[index + 1]
      const ratio = length > 1e-6 ? (target - traversed) / length : 0.5
      const dx = end.x - start.x
      const dy = end.y - start.y
      const { nx, ny } = this._preferredLabelNormal(dx, dy)
      return {
        x: start.x + dx * ratio + nx * 14,
        y: start.y + dy * ratio + ny * 14,
      }
    }

    return labelPath[labelPath.length - 1]
  }

  private _canonicalNormal(
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): { nx: number; ny: number } {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy) || 1
    let nx = -dy / length
    let ny = dx / length
    if (start.y > end.y || (start.y === end.y && start.x > end.x)) {
      nx *= -1
      ny *= -1
    }
    return { nx, ny }
  }

  private _preferredLabelNormal(dx: number, dy: number): { nx: number; ny: number } {
    const length = Math.hypot(dx, dy) || 1
    let nx = -dy / length
    let ny = dx / length
    if (ny > 0 || (Math.abs(ny) < 1e-6 && nx > 0)) {
      nx *= -1
      ny *= -1
    }
    return { nx, ny }
  }

  private _drawSelfLoop(edge: PositionedEdge, node: PositionedNode, theme: Theme): void {
    const { width: lineWidth, dash } = this._styleParams(edge.style)
    const color = theme.edgeColor
    const hw = node.width / 2
    const hh = node.height / 2
    const loopWidth = Math.max(34, hw * 0.9)
    const loopHeight = Math.max(26, hh * 0.9)

    const start = { x: node.x + hw * 0.55, y: node.y - hh * 0.25 }
    const cp1 = { x: node.x + hw + loopWidth, y: node.y - hh - loopHeight * 0.2 }
    const cp2 = { x: node.x + hw + loopWidth, y: node.y + hh + loopHeight * 0.1 }
    const end = { x: node.x + hw * 0.18, y: node.y + hh * 0.1 }

    this.moveTo(start.x, start.y)
    this.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y)
    this.stroke({ width: lineWidth, color, alpha: dash ? 0.5 : 1 })
    this._drawArrow([cp2, end], color)

    if (edge.label) {
      ensureFontsInstalled()
      this._labelText = new BitmapText({
        text: edge.label,
        style: { fontFamily: 'MermaidEdge', fontSize: 11, fill: theme.edgeLabelColor },
      })
      this._labelFontFamily = 'MermaidEdge'
      this._labelText.anchor.set(0.5)
      this._labelText.x = node.x + hw + loopWidth * 0.55
      this._labelText.y = node.y - hh - loopHeight * 0.15
      this._labelText.visible = !this._stressMode
      this.addChild(this._labelText)
    }
  }

  /**
   * Blueprint: orthogonal edges with right-angle routing.
   * Goes horizontal to midpoint x, then vertical to target y, then horizontal to target.
   * Snaps to 20px grid.
   *
   * Port-based attachment: wires exit from the BOTTOM of the source node and
   * enter at the TOP of the target node (in TD layout).
   *
   * Junction dots are drawn at bend points where the wire changes direction.
   */
  private _drawOrthogonal(edge: PositionedEdge, theme: Theme, edgeIndex: number, totalEdges: number, allNodes?: Map<string, PositionedNode>, wireRegistry?: WireRegistry): void {
    const points = edge.points
    if (points.length < 2) return

    const src = points[0]
    const tgt = points[points.length - 1]
    const color = theme.edgeColor
    const gridSize = (theme as any).gridSize ?? 20

    // Port-based attachment: exit from bottom of source, enter top of target
    const srcNode = allNodes?.get(edge.source)
    const tgtNode = allNodes?.get(edge.target)
    const srcPort = { x: src.x, y: srcNode ? srcNode.y + srcNode.height / 2 : src.y }
    const tgtPort = { x: tgt.x, y: tgtNode ? tgtNode.y - tgtNode.height / 2 : tgt.y }

    // Find a horizontal channel Y that doesn't pass through any node
    const baseMidY = (srcPort.y + tgtPort.y) / 2
    const channelOffset = (edgeIndex - totalEdges / 2) * gridSize * 0.6
    const baseMid = Math.round((baseMidY + channelOffset) / gridSize) * gridSize
    const minX = Math.min(srcPort.x, tgtPort.x)
    const maxX = Math.max(srcPort.x, tgtPort.x)

    let midY: number
    if (wireRegistry) {
      midY = wireRegistry.findFreeHorizontal(baseMid, minX, maxX)
    } else {
      // Fallback: ad-hoc node scan (when no registry available)
      midY = baseMid
      if (allNodes) {
        let attempts = 0
        while (attempts < 20) {
          let blocked = false
          for (const [id, node] of allNodes) {
            if (id === edge.source || id === edge.target) continue
            const hw = node.width / 2 + 4
            const hh = node.height / 2 + 4
            if (midY >= node.y - hh && midY <= node.y + hh &&
                maxX >= node.x - hw && minX <= node.x + hw) {
              blocked = true
              break
            }
          }
          if (!blocked) break
          attempts++
          midY += (attempts % 2 === 0 ? 1 : -1) * attempts * gridSize
          midY = Math.round(midY / gridSize) * gridSize
        }
      }
    }

    // I15: enforce minimum bend separation — no zero-length vertical segments
    if (Math.abs(midY - srcPort.y) < gridSize) {
      midY = srcPort.y + (tgtPort.y >= srcPort.y ? gridSize : -gridSize)
      midY = Math.round(midY / gridSize) * gridSize
    }
    if (Math.abs(midY - tgtPort.y) < gridSize) {
      midY = tgtPort.y + (srcPort.y >= tgtPort.y ? gridSize : -gridSize)
      midY = Math.round(midY / gridSize) * gridSize
    }

    // Find free vertical lanes for source and target segments
    let srcExitX: number
    let tgtEntryX: number

    if (wireRegistry) {
      srcExitX = wireRegistry.findFreeVertical(srcPort.x, srcPort.y, midY)
      tgtEntryX = wireRegistry.findFreeVertical(tgtPort.x, midY, tgtPort.y)
    } else {
      // Fallback: ad-hoc node scan
      srcExitX = srcPort.x
      tgtEntryX = tgtPort.x
      if (allNodes) {
        for (const [id, node] of allNodes) {
          if (id === edge.source || id === edge.target) continue
          const hw = node.width / 2 + 6
          const hh = node.height / 2 + 6
          const minSegY = Math.min(srcPort.y, midY)
          const maxSegY = Math.max(srcPort.y, midY)
          if (srcExitX >= node.x - hw && srcExitX <= node.x + hw &&
              maxSegY >= node.y - hh && minSegY <= node.y + hh) {
            srcExitX = srcExitX < node.x ? node.x - hw - gridSize : node.x + hw + gridSize
            srcExitX = Math.round(srcExitX / gridSize) * gridSize
          }
        }
        for (const [id, node] of allNodes) {
          if (id === edge.source || id === edge.target) continue
          const hw = node.width / 2 + 6
          const hh = node.height / 2 + 6
          const minSegY = Math.min(midY, tgtPort.y)
          const maxSegY = Math.max(midY, tgtPort.y)
          if (tgtEntryX >= node.x - hw && tgtEntryX <= node.x + hw &&
              maxSegY >= node.y - hh && minSegY <= node.y + hh) {
            tgtEntryX = tgtEntryX < node.x ? node.x - hw - gridSize : node.x + hw + gridSize
            tgtEntryX = Math.round(tgtEntryX / gridSize) * gridSize
          }
        }
      }
    }

    // Route with potentially offset vertical segments
    this.moveTo(srcPort.x, srcPort.y)
    if (srcExitX !== srcPort.x) {
      // Jog horizontally to clear, then go vertical
      this.lineTo(srcExitX, srcPort.y)
    }
    this.lineTo(srcExitX, midY)
    this.lineTo(tgtEntryX, midY)
    if (tgtEntryX !== tgtPort.x) {
      this.lineTo(tgtEntryX, tgtPort.y)
      this.lineTo(tgtPort.x, tgtPort.y)
    } else {
      this.lineTo(tgtPort.x, tgtPort.y)
    }

    this.stroke({ width: 1.5, color })

    // Claim all segments in registry so future edges avoid them
    if (wireRegistry) {
      if (srcExitX !== srcPort.x) {
        wireRegistry.claimHorizontal(srcPort.y, srcPort.x, srcExitX)
      }
      wireRegistry.claimVertical(srcExitX, srcPort.y, midY)
      wireRegistry.claimHorizontal(midY, srcExitX, tgtEntryX)
      wireRegistry.claimVertical(tgtEntryX, midY, tgtPort.y)
      if (tgtEntryX !== tgtPort.x) {
        wireRegistry.claimHorizontal(tgtPort.y, tgtEntryX, tgtPort.x)
      }
    }

    // Record orthogonal segments for wire-hop detection (use actual routed positions)
    this.orthogonalSegments = []
    if (srcExitX !== srcPort.x) {
      this.orthogonalSegments.push({ x1: srcPort.x, y1: srcPort.y, x2: srcExitX, y2: srcPort.y, isHorizontal: true, edgeId: edge.id })
    }
    this.orthogonalSegments.push(
      { x1: srcExitX, y1: srcPort.y, x2: srcExitX, y2: midY, isHorizontal: false, edgeId: edge.id },
      { x1: srcExitX, y1: midY, x2: tgtEntryX, y2: midY, isHorizontal: true, edgeId: edge.id },
      { x1: tgtEntryX, y1: midY, x2: tgtEntryX, y2: tgtPort.y, isHorizontal: false, edgeId: edge.id },
    )
    if (tgtEntryX !== tgtPort.x) {
      this.orthogonalSegments.push({ x1: tgtEntryX, y1: tgtPort.y, x2: tgtPort.x, y2: tgtPort.y, isHorizontal: true, edgeId: edge.id })
    }

    // Arrow pointing into target
    this._drawArrow([{ x: tgtEntryX, y: midY }, tgtPort], color)

    // Label at the horizontal segment midpoint
    if (edge.label) {
      const labelX = (srcPort.x + tgtPort.x) / 2
      ensureFontsInstalled()
      this._labelText = new BitmapText({
        text: edge.label,
        style: { fontFamily: 'MermaidBlueprint', fontSize: 10, fill: theme.edgeLabelColor },
      })
      this._labelFontFamily = 'MermaidBlueprint'
      this._labelText.anchor.set(0.5)
      this._labelText.x = labelX
      this._labelText.y = midY - 12
      this._labelText.visible = !this._stressMode
      this.addChild(this._labelText)
    }
  }

  /**
   * Breath: whisper lines — barely visible, thin, low opacity.
   * No labels by default.
   */
  private _drawWhisper(edge: PositionedEdge, theme: Theme): void {
    const points = edge.points
    if (points.length < 2) return

    const color = theme.edgeColor

    this.moveTo(points[0].x, points[0].y)
    if (points.length === 2) {
      this.lineTo(points[1].x, points[1].y)
    } else {
      // Gentle quadratic through midpoints
      for (let i = 1; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2
        const yc = (points[i].y + points[i + 1].y) / 2
        this.quadraticCurveTo(points[i].x, points[i].y, xc, yc)
      }
      this.lineTo(points[points.length - 1].x, points[points.length - 1].y)
    }

    // Whisper: thin, low opacity
    this.stroke({ width: 1, color, alpha: 0.25 })

    // Small subtle arrow
    const last = points[points.length - 1]
    const prev = points[points.length - 2]
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x)
    const s = 5
    this.moveTo(last.x, last.y)
    this.lineTo(last.x - s * Math.cos(angle - Math.PI / 6), last.y - s * Math.sin(angle - Math.PI / 6))
    this.moveTo(last.x, last.y)
    this.lineTo(last.x - s * Math.cos(angle + Math.PI / 6), last.y - s * Math.sin(angle + Math.PI / 6))
    this.stroke({ width: 0.8, color, alpha: 0.25 })

    // No label for whisper lines (shown on hover only — future feature)
  }
}
