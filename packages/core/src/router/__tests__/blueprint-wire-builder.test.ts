import { describe, it, expect } from 'vitest'
import { BlueprintWireBuilder } from '../blueprint-wire-builder'
import type { PositionedGraph, PositionedNode, PositionedEdge } from '../../types'

function makeGraph(
  nodes: Array<[string, number, number, number, number]>,
  edges: Array<[string, string, string]>,
): PositionedGraph {
  const nodeMap = new Map<string, PositionedNode>()
  for (const [id, x, y, w, h] of nodes) {
    nodeMap.set(id, { id, label: id, shape: 'rectangle', metadata: {}, x, y, width: w, height: h })
  }
  const edgeList: PositionedEdge[] = edges.map(([id, src, tgt]) => ({
    id, source: src, target: tgt, style: 'solid' as const,
    points: [{ x: nodeMap.get(src)!.x, y: nodeMap.get(src)!.y },
             { x: nodeMap.get(tgt)!.x, y: nodeMap.get(tgt)!.y }],
  }))
  return { nodes: nodeMap, edges: edgeList, subgraphs: new Map(), width: 500, height: 500 }
}

describe('BlueprintWireBuilder', () => {
  it('routes a simple two-node edge', () => {
    const graph = makeGraph(
      [['A', 100, 40, 80, 40], ['B', 100, 200, 80, 40]],
      [['e1', 'A', 'B']],
    )
    const builder = new BlueprintWireBuilder(graph)
    const result = builder.route()
    expect(result.congested).toBe(false)
    expect(result.wires).toHaveLength(1)
    expect(result.wires[0].segments.length).toBeGreaterThanOrEqual(1)
  })

  it('creates fan-out bus for source with outDegree >= 2', () => {
    const graph = makeGraph(
      [['A', 100, 40, 80, 40], ['B', 60, 200, 80, 40], ['C', 200, 200, 80, 40]],
      [['e1', 'A', 'B'], ['e2', 'A', 'C']],
    )
    const builder = new BlueprintWireBuilder(graph)
    const result = builder.route()
    expect(result.congested).toBe(false)
    // Should have wires for both edges
    expect(result.wires).toHaveLength(2)
  })

  it('creates fan-in merge for target with inDegree >= 2', () => {
    const graph = makeGraph(
      [['A', 60, 40, 80, 40], ['B', 200, 40, 80, 40], ['C', 120, 200, 80, 40]],
      [['e1', 'A', 'C'], ['e2', 'B', 'C']],
    )
    const builder = new BlueprintWireBuilder(graph)
    const result = builder.route()
    expect(result.congested).toBe(false)
    expect(result.wires).toHaveLength(2)
  })

  it('rejects self-loops', () => {
    const graph = makeGraph(
      [['A', 100, 100, 80, 40]],
      [['e1', 'A', 'A']],
    )
    const builder = new BlueprintWireBuilder(graph)
    const result = builder.route()
    expect(result.wires).toHaveLength(0)
  })
})
