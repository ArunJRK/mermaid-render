import { describe, it, expect } from 'vitest'
import type {
  RenderGraph, RenderNode, RenderEdge, RenderSubgraph,
  LinkDirective, LayoutDirective, PositionedGraph, LoadResult,
} from '../types'

describe('types', () => {
  it('can construct a RenderGraph', () => {
    const node: RenderNode = {
      id: 'A', label: 'Node A', shape: 'rectangle', metadata: {},
    }
    const edge: RenderEdge = {
      id: 'A->B', source: 'A', target: 'B', style: 'solid',
    }
    const subgraph: RenderSubgraph = {
      id: 'sg1', label: 'Group', nodeIds: ['A'], collapsed: false,
    }
    const graph: RenderGraph = {
      nodes: new Map([['A', node]]),
      edges: [edge],
      subgraphs: new Map([['sg1', subgraph]]),
      directives: [],
      direction: 'TD',
      diagramType: 'flowchart',
    }
    expect(graph.nodes.get('A')).toBe(node)
    expect(graph.edges).toHaveLength(1)
    expect(graph.subgraphs.get('sg1')?.collapsed).toBe(false)
  })

  it('can construct directives', () => {
    const link: LinkDirective = {
      type: 'link', nodeId: 'A',
      targetFile: '/path/to/file.mmd', targetNode: 'nodeB',
    }
    const layout: LayoutDirective = {
      type: 'layout', philosophy: 'narrative',
    }
    expect(link.type).toBe('link')
    expect(layout.philosophy).toBe('narrative')
  })

  it('can construct LoadResult', () => {
    const result: LoadResult = {
      success: true, errors: [], warnings: [],
    }
    expect(result.success).toBe(true)
  })
})
