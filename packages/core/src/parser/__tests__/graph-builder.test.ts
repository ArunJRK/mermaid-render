import { describe, it, expect } from 'vitest'
import { buildGraph } from '../graph-builder'
import type { LoadResult } from '../../types'

describe('buildGraph', () => {
  it('parses a simple flowchart with 2 nodes and 1 edge', async () => {
    const source = `graph TD
    A[Hello] --> B[World]`

    const result: LoadResult = await buildGraph(source)

    expect(result.success).toBe(true)
    expect(result.graph).toBeDefined()
    expect(result.graph!.nodes.size).toBe(2)
    expect(result.graph!.nodes.get('A')!.label).toBe('Hello')
    expect(result.graph!.nodes.get('B')!.label).toBe('World')
    expect(result.graph!.edges).toHaveLength(1)
    expect(result.graph!.edges[0].source).toBe('A')
    expect(result.graph!.edges[0].target).toBe('B')
    expect(result.graph!.diagramType).toBe('flowchart')
    expect(result.graph!.direction).toBe('TD')
  })

  it('parses flowchart with subgraphs', async () => {
    const source = `graph TD
    subgraph backend[Backend Services]
        API[API Server]
        DB[(Database)]
    end
    API --> DB`

    const result = await buildGraph(source)

    expect(result.success).toBe(true)
    expect(result.graph!.subgraphs.size).toBeGreaterThanOrEqual(1)

    // Find the subgraph labeled "Backend Services"
    let found = false
    for (const [, sg] of result.graph!.subgraphs) {
      if (sg.label === 'Backend Services') {
        expect(sg.nodeIds).toContain('API')
        expect(sg.nodeIds).toContain('DB')
        found = true
      }
    }
    expect(found).toBe(true)
  })

  it('attaches @link directives to nodes', async () => {
    const source = `%% @link auth -> /services/auth/flow.mmd#loginHandler
graph TD
    auth[Auth Service] --> db[Database]`

    const result = await buildGraph(source)

    expect(result.success).toBe(true)
    expect(result.graph!.directives).toHaveLength(1)
    const linkDir = result.graph!.directives[0]
    expect(linkDir.type).toBe('link')
    if (linkDir.type === 'link') {
      expect(linkDir.nodeId).toBe('auth')
      expect(linkDir.targetFile).toBe('/services/auth/flow.mmd')
      expect(linkDir.targetNode).toBe('loginHandler')
    }
  })

  it('detects layout philosophy from @layout directive', async () => {
    const source = `%% @layout blueprint
graph TD
    A --> B`

    const result = await buildGraph(source)

    expect(result.success).toBe(true)
    const layoutDir = result.graph!.directives.find((d) => d.type === 'layout')
    expect(layoutDir).toBeDefined()
    if (layoutDir && layoutDir.type === 'layout') {
      expect(layoutDir.philosophy).toBe('blueprint')
    }
  })

  it('returns errors for invalid mermaid syntax', async () => {
    const source = `this is not valid mermaid at all`

    const result = await buildGraph(source)

    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].code).toBe('PARSE_FAILED')
  })

  it('parses edge labels', async () => {
    const source = `graph TD
    A -->|yes| B
    A -->|no| C`

    const result = await buildGraph(source)

    expect(result.success).toBe(true)
    expect(result.graph!.edges).toHaveLength(2)

    const edgeAB = result.graph!.edges.find((e) => e.source === 'A' && e.target === 'B')
    expect(edgeAB).toBeDefined()
    expect(edgeAB!.label).toBe('yes')

    const edgeAC = result.graph!.edges.find((e) => e.source === 'A' && e.target === 'C')
    expect(edgeAC).toBeDefined()
    expect(edgeAC!.label).toBe('no')
  })

  it('warns when @link references unknown node', async () => {
    const source = `%% @link nonexistent -> /path.mmd
graph TD
    A --> B`

    const result = await buildGraph(source)

    expect(result.success).toBe(true)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].code).toBe('LINK_NODE_NOT_FOUND')
  })
})
