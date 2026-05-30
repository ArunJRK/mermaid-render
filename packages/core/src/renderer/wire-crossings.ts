export interface WireSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  isHorizontal: boolean
  edgeId: string
}

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
