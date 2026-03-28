import type { RenderGraph, PositionedGraph, LayoutDirective, RenderError } from '../types'
import { buildGraph } from '../parser/graph-builder'
import { DagreLayout } from '../layout/dagre-layout'

export interface PipelineResult {
  success: boolean
  graph?: RenderGraph
  positioned?: PositionedGraph
  errors?: RenderError[]
  warnings?: any[]
}

export class LoadPipeline {
  lastGraph: RenderGraph | null = null
  lastPositioned: PositionedGraph | null = null
  private loadId = 0

  async load(source: string, options?: { layout?: string }): Promise<PipelineResult> {
    const currentId = ++this.loadId

    const result = await buildGraph(source)

    // Check cancellation
    if (currentId !== this.loadId) {
      return { success: false, errors: [{ code: 'LOAD_CANCELLED', message: 'Superseded by newer load' }] }
    }

    if (!result.success || !result.graph) {
      return {
        success: false,
        errors: result.errors,
      }
    }

    // Determine philosophy from options or directive
    const layoutDir = result.graph.directives.find((d): d is LayoutDirective => d.type === 'layout')
    const philosophy = (options?.layout ?? layoutDir?.philosophy ?? 'narrative') as any

    // Layout
    const layout = new DagreLayout({ philosophy })
    const positioned = layout.compute(result.graph)

    this.lastGraph = result.graph
    this.lastPositioned = positioned

    return {
      success: true,
      graph: result.graph,
      positioned,
      warnings: result.warnings,
    }
  }
}
