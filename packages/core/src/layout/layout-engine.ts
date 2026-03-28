import type { RenderGraph, PositionedGraph, LayoutPhilosophy } from '../types'

export interface LayoutEngine {
  compute(graph: RenderGraph): PositionedGraph
}

export interface LayoutOptions {
  philosophy?: LayoutPhilosophy
  spacingMultiplier?: number
}
