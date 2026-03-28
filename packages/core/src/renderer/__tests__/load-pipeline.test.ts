import { describe, it, expect } from 'vitest'
import { LoadPipeline } from '../load-pipeline'

describe('LoadPipeline', () => {
  it('parses mermaid source and produces positioned graph', async () => {
    const pipeline = new LoadPipeline()
    const result = await pipeline.load('graph TD\n    A[Hello] --> B[World]')

    expect(result.success).toBe(true)
    expect(result.positioned).toBeDefined()
    expect(result.positioned!.nodes.size).toBe(2)
    expect(result.positioned!.edges.length).toBe(1)
  })

  it('returns error for invalid source', async () => {
    const pipeline = new LoadPipeline()
    const result = await pipeline.load('not valid mermaid')

    expect(result.success).toBe(false)
    expect(result.errors!.length).toBeGreaterThan(0)
    expect(result.errors![0].code).toBe('PARSE_FAILED')
  })

  it('preserves previous result on error', async () => {
    const pipeline = new LoadPipeline()

    // First load succeeds
    const good = await pipeline.load('graph TD\n    A --> B')
    expect(good.success).toBe(true)

    // Second load fails
    const bad = await pipeline.load('invalid')
    expect(bad.success).toBe(false)

    // Previous result still available
    expect(pipeline.lastPositioned).toBeDefined()
    expect(pipeline.lastPositioned!.nodes.size).toBe(2)
  })

  it('applies layout philosophy from directive', async () => {
    const pipeline = new LoadPipeline()

    const breathResult = await pipeline.load('%% @layout breath\ngraph TD\n    A --> B --> C')
    const blueprintPipeline = new LoadPipeline()
    const blueprintResult = await blueprintPipeline.load('%% @layout blueprint\ngraph TD\n    A --> B --> C')

    expect(breathResult.success).toBe(true)
    expect(blueprintResult.success).toBe(true)

    // Breath should produce larger dimensions
    expect(breathResult.positioned!.height).toBeGreaterThan(blueprintResult.positioned!.height)
  })

  it('cancels previous load when new load starts', async () => {
    const pipeline = new LoadPipeline()

    // Start two loads concurrently
    const first = pipeline.load('graph TD\n    A --> B')
    const second = pipeline.load('graph TD\n    X --> Y')

    const [firstResult, secondResult] = await Promise.all([first, second])

    // Only second should succeed, first should be cancelled
    expect(secondResult.success).toBe(true)
    expect(secondResult.positioned!.nodes.has('X')).toBe(true)
  })
})
