import { describe, it, expect } from 'vitest'
import { BlueprintLayout, snapToGrid, lineIntersectsRect, computeWaypoint, avoidEdgeCollisions } from '../blueprint-layout'
import type { RenderGraph, RenderNode, RenderEdge, PositionedNode, PositionedEdge } from '../../types'

function makeGraph(): RenderGraph {
  const nodes = new Map<string, RenderNode>([
    ['A', { id: 'A', label: 'Node A', shape: 'rectangle', metadata: {} }],
    ['B', { id: 'B', label: 'Node B', shape: 'rectangle', metadata: {} }],
    ['C', { id: 'C', label: 'Node C', shape: 'rectangle', metadata: {} }],
  ])
  const edges: RenderEdge[] = [
    { id: 'e0', source: 'A', target: 'B', style: 'solid' },
    { id: 'e1', source: 'B', target: 'C', style: 'solid' },
  ]
  return {
    nodes,
    edges,
    subgraphs: new Map(),
    directives: [],
    direction: 'TD',
    diagramType: 'flowchart',
  }
}

// ── Grid Snapping ─────────────────────────────────────────────────────────────

describe('snapToGrid', () => {
  it('snaps (123) to 120', () => {
    expect(snapToGrid(123)).toBe(120)
  })

  it('snaps (47) to 40', () => {
    expect(snapToGrid(47)).toBe(40)
  })

  it('snaps (130) to 140 (rounds to nearest)', () => {
    expect(snapToGrid(130)).toBe(140)
  })

  it('snaps exact grid values to themselves', () => {
    expect(snapToGrid(60)).toBe(60)
    expect(snapToGrid(0)).toBe(0)
    expect(snapToGrid(100)).toBe(100)
  })

  it('snaps negative values correctly', () => {
    expect(snapToGrid(-13)).toBe(-20)
    expect(snapToGrid(-25)).toBe(-20)
    expect(snapToGrid(-31)).toBe(-40)
  })

  it('supports custom grid size', () => {
    expect(snapToGrid(27, 10)).toBe(30)
    expect(snapToGrid(23, 10)).toBe(20)
  })
})

// ── BlueprintLayout ───────────────────────────────────────────────────────────

describe('BlueprintLayout', () => {
  it('snaps all node positions to 20px grid', () => {
    const layout = new BlueprintLayout()
    const result = layout.compute(makeGraph())

    for (const [, node] of result.nodes) {
      expect(node.x % 20).toBe(0)
      expect(node.y % 20).toBe(0)
    }
  })

  it('does not produce overlapping nodes after snapping', () => {
    const layout = new BlueprintLayout()
    const result = layout.compute(makeGraph())
    const positioned = Array.from(result.nodes.values())

    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        const a = positioned[i]
        const b = positioned[j]
        const overlapX = Math.abs(a.x - b.x) < (a.width + b.width) / 2
        const overlapY = Math.abs(a.y - b.y) < (a.height + b.height) / 2
        expect(overlapX && overlapY).toBe(false)
      }
    }
  })

  it('positions all nodes', () => {
    const layout = new BlueprintLayout()
    const result = layout.compute(makeGraph())
    expect(result.nodes.size).toBe(3)
  })

  it('produces edges with at least 2 points', () => {
    const layout = new BlueprintLayout()
    const result = layout.compute(makeGraph())
    expect(result.edges.length).toBe(2)
    for (const edge of result.edges) {
      expect(edge.points.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('handles empty graph', () => {
    const layout = new BlueprintLayout()
    const emptyGraph: RenderGraph = {
      nodes: new Map(),
      edges: [],
      subgraphs: new Map(),
      directives: [],
      direction: 'TD',
      diagramType: 'flowchart',
    }
    const result = layout.compute(emptyGraph)
    expect(result.nodes.size).toBe(0)
    expect(result.edges.length).toBe(0)
  })
})

// ── Line-Rect Intersection ────────────────────────────────────────────────────

describe('lineIntersectsRect', () => {
  it('detects a line passing through a rectangle', () => {
    // Line from (0,0) to (200,0), rect centered at (100,0) with 40x40
    expect(lineIntersectsRect(0, 0, 200, 0, 100, 0, 20, 20)).toBe(true)
  })

  it('returns false for a line that misses the rectangle', () => {
    // Line from (0,0) to (200,0), rect centered at (100,50) with 40x40
    expect(lineIntersectsRect(0, 0, 200, 0, 100, 50, 20, 20)).toBe(false)
  })

  it('detects diagonal line through rectangle', () => {
    // Line from (0,0) to (200,200), rect centered at (100,100) with 40x40
    expect(lineIntersectsRect(0, 0, 200, 200, 100, 100, 20, 20)).toBe(true)
  })

  it('returns false when line ends before rectangle', () => {
    // Line from (0,0) to (50,0), rect centered at (100,0) with 20x20
    expect(lineIntersectsRect(0, 0, 50, 0, 100, 0, 10, 10)).toBe(false)
  })
})

// ── Edge Collision Avoidance ──────────────────────────────────────────────────

describe('avoidEdgeCollisions', () => {
  it('reroutes edge that passes through an intermediate node', () => {
    const nodes = new Map<string, PositionedNode>([
      ['A', { id: 'A', label: 'A', shape: 'rectangle', metadata: {}, x: 0, y: 0, width: 40, height: 40 }],
      ['B', { id: 'B', label: 'B', shape: 'rectangle', metadata: {}, x: 100, y: 0, width: 40, height: 40 }],
      ['C', { id: 'C', label: 'C', shape: 'rectangle', metadata: {}, x: 200, y: 0, width: 40, height: 40 }],
    ])

    const edges: PositionedEdge[] = [
      {
        id: 'e0', source: 'A', target: 'C', style: 'solid',
        points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
      },
    ]

    const result = avoidEdgeCollisions(edges, nodes)
    expect(result.length).toBe(1)
    // The edge should now have 3 points (source, waypoint, target)
    expect(result[0].points.length).toBe(3)
    // The waypoint should NOT be at y=0 (it was rerouted around node B)
    const waypoint = result[0].points[1]
    expect(waypoint.y).not.toBe(0)
  })

  it('does not modify edges that have no collisions', () => {
    const nodes = new Map<string, PositionedNode>([
      ['A', { id: 'A', label: 'A', shape: 'rectangle', metadata: {}, x: 0, y: 0, width: 40, height: 40 }],
      ['B', { id: 'B', label: 'B', shape: 'rectangle', metadata: {}, x: 0, y: 200, width: 40, height: 40 }],
      ['C', { id: 'C', label: 'C', shape: 'rectangle', metadata: {}, x: 200, y: 100, width: 40, height: 40 }],
    ])

    const edges: PositionedEdge[] = [
      {
        id: 'e0', source: 'A', target: 'B', style: 'solid',
        points: [{ x: 0, y: 0 }, { x: 0, y: 200 }],
      },
    ]

    const result = avoidEdgeCollisions(edges, nodes)
    expect(result.length).toBe(1)
    // Edge should remain unchanged (2 points)
    expect(result[0].points.length).toBe(2)
  })

  it('skips collision check against source and target nodes', () => {
    const nodes = new Map<string, PositionedNode>([
      ['A', { id: 'A', label: 'A', shape: 'rectangle', metadata: {}, x: 0, y: 0, width: 40, height: 40 }],
      ['B', { id: 'B', label: 'B', shape: 'rectangle', metadata: {}, x: 100, y: 0, width: 40, height: 40 }],
    ])

    const edges: PositionedEdge[] = [
      {
        id: 'e0', source: 'A', target: 'B', style: 'solid',
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      },
    ]

    const result = avoidEdgeCollisions(edges, nodes)
    // Should not reroute since line only passes through source and target
    expect(result[0].points.length).toBe(2)
  })
})

// ── computeWaypoint ───────────────────────────────────────────────────────────

describe('computeWaypoint', () => {
  it('produces a waypoint offset from the obstacle', () => {
    const wp = computeWaypoint(0, 0, 200, 0, 100, 0, 40, 40)
    // Waypoint should be at x=100 (same x as obstacle) but offset in y
    expect(wp.x).toBe(100)
    expect(Math.abs(wp.y)).toBe(30) // nodeWidth/2 + margin = 20 + 10 = 30
  })
})
