import { Graphics } from 'pixi.js'
import type { Theme } from './theme'

export interface WireSegment {
  x1: number; y1: number; x2: number; y2: number
  isHorizontal: boolean
  edgeId: string
}

/**
 * Detect where orthogonal wires cross and draw hop arcs.
 * Returns a Graphics object to add to the viewport.
 *
 * For each crossing of a horizontal and a vertical segment from different edges,
 * a small semicircle arc is drawn on the horizontal wire to indicate
 * the wires do not connect.
 */
export function drawWireHops(
  edgeSegments: Array<{ edgeId: string; segments: WireSegment[] }>,
  theme: Theme,
): Graphics {
  const g = new Graphics()
  const HOP_RADIUS = 6
  const color = theme.edgeColor

  // Collect all segments from all edges
  const allSegments: WireSegment[] = []
  for (const edge of edgeSegments) {
    allSegments.push(...edge.segments)
  }

  // Find intersections between horizontal and vertical segments
  for (let i = 0; i < allSegments.length; i++) {
    for (let j = i + 1; j < allSegments.length; j++) {
      const a = allSegments[i]
      const b = allSegments[j]
      if (a.edgeId === b.edgeId) continue // same edge doesn't cross itself
      if (a.isHorizontal === b.isHorizontal) continue // parallel don't cross

      const h = a.isHorizontal ? a : b // horizontal segment
      const v = a.isHorizontal ? b : a // vertical segment

      const hMinX = Math.min(h.x1, h.x2)
      const hMaxX = Math.max(h.x1, h.x2)
      const vMinY = Math.min(v.y1, v.y2)
      const vMaxY = Math.max(v.y1, v.y2)

      // Check if they actually cross (strict interior, not at endpoints)
      if (v.x1 > hMinX && v.x1 < hMaxX && h.y1 > vMinY && h.y1 < vMaxY) {
        // Intersection at (v.x1, h.y1)
        // Draw a hop arc on the horizontal wire
        g.moveTo(v.x1 - HOP_RADIUS, h.y1)
        g.arc(v.x1, h.y1, HOP_RADIUS, Math.PI, 0) // semicircle above
        g.stroke({ width: 1.5, color })
      }
    }
  }

  return g
}

/**
 * Pure detection helper — returns intersection points without drawing.
 * Useful for testing.
 */
export function detectCrossings(
  edgeSegments: Array<{ edgeId: string; segments: WireSegment[] }>,
): Array<{ x: number; y: number }> {
  const allSegments: WireSegment[] = []
  for (const edge of edgeSegments) {
    allSegments.push(...edge.segments)
  }

  const crossings: Array<{ x: number; y: number }> = []

  for (let i = 0; i < allSegments.length; i++) {
    for (let j = i + 1; j < allSegments.length; j++) {
      const a = allSegments[i]
      const b = allSegments[j]
      if (a.edgeId === b.edgeId) continue
      if (a.isHorizontal === b.isHorizontal) continue

      const h = a.isHorizontal ? a : b
      const v = a.isHorizontal ? b : a

      const hMinX = Math.min(h.x1, h.x2)
      const hMaxX = Math.max(h.x1, h.x2)
      const vMinY = Math.min(v.y1, v.y2)
      const vMaxY = Math.max(v.y1, v.y2)

      if (v.x1 > hMinX && v.x1 < hMaxX && h.y1 > vMinY && h.y1 < vMaxY) {
        crossings.push({ x: v.x1, y: h.y1 })
      }
    }
  }

  return crossings
}
