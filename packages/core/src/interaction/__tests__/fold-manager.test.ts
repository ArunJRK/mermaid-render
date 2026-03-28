import { describe, it, expect } from 'vitest'
import { FoldManager } from '../fold-manager'
import type { RenderGraph, RenderNode, RenderSubgraph } from '../../types'

function makeGraph(): RenderGraph {
  return {
    nodes: new Map<string, RenderNode>([
      ['A', { id: 'A', label: 'A', shape: 'rectangle', metadata: {} }],
      ['B', { id: 'B', label: 'B', shape: 'rectangle', metadata: {} }],
      ['C', { id: 'C', label: 'C', shape: 'rectangle', metadata: {} }],
    ]),
    edges: [],
    subgraphs: new Map<string, RenderSubgraph>([
      ['sg1', { id: 'sg1', label: 'Group 1', nodeIds: ['B', 'C'], collapsed: false }],
      ['sg2', { id: 'sg2', label: 'Group 2', nodeIds: ['A'], collapsed: false }],
    ]),
    directives: [],
    direction: 'TD',
    diagramType: 'flowchart',
  }
}

describe('FoldManager', () => {
  it('toggles fold on a subgraph', () => {
    const graph = makeGraph()
    const fm = new FoldManager(graph)
    const result = fm.toggle('sg1')
    expect(result).toBe(true) // now collapsed
    expect(graph.subgraphs.get('sg1')!.collapsed).toBe(true)
  })

  it('toggles fold again to unfold', () => {
    const graph = makeGraph()
    graph.subgraphs.get('sg1')!.collapsed = true
    const fm = new FoldManager(graph)
    const result = fm.toggle('sg1')
    expect(result).toBe(false) // now uncollapsed
    expect(graph.subgraphs.get('sg1')!.collapsed).toBe(false)
  })

  it('returns false for non-existent subgraph', () => {
    const graph = makeGraph()
    const fm = new FoldManager(graph)
    const result = fm.toggle('missing')
    expect(result).toBe(false)
  })

  it('foldAll collapses all subgraphs', () => {
    const graph = makeGraph()
    const fm = new FoldManager(graph)
    fm.foldAll()
    expect(graph.subgraphs.get('sg1')!.collapsed).toBe(true)
    expect(graph.subgraphs.get('sg2')!.collapsed).toBe(true)
  })

  it('unfoldAll uncollapses all subgraphs', () => {
    const graph = makeGraph()
    graph.subgraphs.get('sg1')!.collapsed = true
    graph.subgraphs.get('sg2')!.collapsed = true
    const fm = new FoldManager(graph)
    fm.unfoldAll()
    expect(graph.subgraphs.get('sg1')!.collapsed).toBe(false)
    expect(graph.subgraphs.get('sg2')!.collapsed).toBe(false)
  })
})
