import { Graphics } from 'pixi.js'
import type { Theme } from './theme'
import { detectCrossings, type WireSegment } from './wire-crossings'

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

  for (const crossing of detectCrossings(edgeSegments)) {
    g.moveTo(crossing.x - HOP_RADIUS, crossing.y)
    g.arc(crossing.x, crossing.y, HOP_RADIUS, Math.PI, 0)
    g.stroke({ width: 1.5, color })
  }

  return g
}
