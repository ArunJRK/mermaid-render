import { describe, it, expect } from 'vitest'
import { detectCrossings, type WireSegment } from '../wire-hops'

function seg(
  edgeId: string,
  x1: number, y1: number,
  x2: number, y2: number,
  isHorizontal: boolean,
): WireSegment {
  return { edgeId, x1, y1, x2, y2, isHorizontal }
}

describe('detectCrossings', () => {
  it('detects a crossing between a horizontal and vertical segment', () => {
    const edges = [
      { edgeId: 'e1', segments: [seg('e1', 0, 50, 200, 50, true)] },
      { edgeId: 'e2', segments: [seg('e2', 100, 0, 100, 100, false)] },
    ]
    const crossings = detectCrossings(edges)
    expect(crossings).toHaveLength(1)
    expect(crossings[0]).toEqual({ x: 100, y: 50 })
  })

  it('returns empty for parallel segments', () => {
    const edges = [
      { edgeId: 'e1', segments: [seg('e1', 0, 50, 200, 50, true)] },
      { edgeId: 'e2', segments: [seg('e2', 0, 100, 200, 100, true)] },
    ]
    expect(detectCrossings(edges)).toHaveLength(0)
  })

  it('returns empty for segments that do not overlap', () => {
    const edges = [
      { edgeId: 'e1', segments: [seg('e1', 0, 50, 80, 50, true)] },
      { edgeId: 'e2', segments: [seg('e2', 100, 0, 100, 100, false)] },
    ]
    // horizontal ends at x=80, vertical is at x=100 — no crossing
    expect(detectCrossings(edges)).toHaveLength(0)
  })

  it('ignores segments from the same edge', () => {
    const edges = [
      {
        edgeId: 'e1',
        segments: [
          seg('e1', 0, 50, 200, 50, true),
          seg('e1', 100, 0, 100, 100, false),
        ],
      },
    ]
    expect(detectCrossings(edges)).toHaveLength(0)
  })

  it('does not count endpoint-only touching as a crossing', () => {
    // Vertical segment ends exactly where the horizontal starts — endpoint
    const edges = [
      { edgeId: 'e1', segments: [seg('e1', 100, 50, 300, 50, true)] },
      { edgeId: 'e2', segments: [seg('e2', 100, 0, 100, 100, false)] },
    ]
    // v.x1 (100) must be strictly > hMinX (100) — it's not, so no crossing
    expect(detectCrossings(edges)).toHaveLength(0)
  })

  it('detects multiple crossings from multiple edges', () => {
    const edges = [
      { edgeId: 'e1', segments: [seg('e1', 0, 50, 300, 50, true)] },
      { edgeId: 'e2', segments: [seg('e2', 100, 0, 100, 100, false)] },
      { edgeId: 'e3', segments: [seg('e3', 200, 0, 200, 100, false)] },
    ]
    const crossings = detectCrossings(edges)
    expect(crossings).toHaveLength(2)
    expect(crossings).toContainEqual({ x: 100, y: 50 })
    expect(crossings).toContainEqual({ x: 200, y: 50 })
  })

  it('handles reversed segment coordinates (x2 < x1)', () => {
    const edges = [
      { edgeId: 'e1', segments: [seg('e1', 200, 50, 0, 50, true)] },
      { edgeId: 'e2', segments: [seg('e2', 100, 100, 100, 0, false)] },
    ]
    const crossings = detectCrossings(edges)
    expect(crossings).toHaveLength(1)
    expect(crossings[0]).toEqual({ x: 100, y: 50 })
  })

  it('returns empty for no edges', () => {
    expect(detectCrossings([])).toHaveLength(0)
  })

  it('returns empty for a single edge', () => {
    const edges = [
      {
        edgeId: 'e1',
        segments: [
          seg('e1', 50, 0, 50, 100, false),
          seg('e1', 50, 100, 200, 100, true),
          seg('e1', 200, 100, 200, 200, false),
        ],
      },
    ]
    expect(detectCrossings(edges)).toHaveLength(0)
  })
})
