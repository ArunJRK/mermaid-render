// ─── Primitive type aliases ──────────────────────────────────────────────────

export type NodeShape =
  | 'rectangle'
  | 'rounded'
  | 'circle'
  | 'diamond'
  | 'hexagon'
  | 'stadium'
  | 'cylinder'
  | 'subroutine'
  | 'asymmetric'
  | 'unknown'

export type EdgeStyle = 'solid' | 'dotted' | 'thick'

export type LayoutPhilosophy = 'narrative' | 'map' | 'blueprint' | 'breath' | 'radial' | 'mosaic'

export type DiagramType =
  | 'flowchart'
  | 'classDiagram'
  | 'c4'
  | 'stateDiagram'
  | 'unknown'

// ─── Graph model ─────────────────────────────────────────────────────────────

export interface RenderNode {
  id: string
  label: string
  shape: NodeShape
  metadata: Record<string, unknown>
}

export interface RenderEdge {
  id: string
  source: string
  target: string
  style: EdgeStyle
  label?: string
}

export interface RenderSubgraph {
  id: string
  label: string
  nodeIds: string[]
  collapsed: boolean
}

export interface RenderGraph {
  nodes: Map<string, RenderNode>
  edges: RenderEdge[]
  subgraphs: Map<string, RenderSubgraph>
  directives: Directive[]
  direction: string
  diagramType: DiagramType
}

// ─── Cross-file linking ──────────────────────────────────────────────────────

export interface CrossFileLink {
  sourceFile: string
  sourceNode: string
  targetFile: string
  targetNode: string
}

// ─── Directives ──────────────────────────────────────────────────────────────

export interface LinkDirective {
  type: 'link'
  nodeId: string
  targetFile: string
  targetNode?: string
}

export interface LayoutDirective {
  type: 'layout'
  philosophy: LayoutPhilosophy
}

export interface PinDirective {
  type: 'pin'
  nodeId: string
  x: number
  y: number
}

export interface RankDirective {
  type: 'rank'
  nodeIds: string[]
  rank: 'same' | 'min' | 'max'
}

export interface SpacingDirective {
  type: 'spacing'
  nodeSpacing?: number
  rankSpacing?: number
}

export type Directive =
  | LinkDirective
  | LayoutDirective
  | PinDirective
  | RankDirective
  | SpacingDirective

// ─── Positioned (layout output) ─────────────────────────────────────────────

export interface PositionedNode extends RenderNode {
  x: number
  y: number
  width: number
  height: number
}

export interface PositionedEdge extends RenderEdge {
  points: Array<{ x: number; y: number }>
}

export interface PositionedSubgraph extends RenderSubgraph {
  x: number
  y: number
  width: number
  height: number
}

export interface PositionedGraph {
  nodes: Map<string, PositionedNode>
  edges: PositionedEdge[]
  subgraphs: Map<string, PositionedSubgraph>
  width: number
  height: number
}

// ─── Load / parse results ────────────────────────────────────────────────────

export interface RenderError {
  code: string
  message: string
  line?: number
  column?: number
}

export interface RenderWarning {
  code: string
  message: string
  line?: number
  column?: number
}

export interface LoadResult {
  success: boolean
  graph?: RenderGraph
  errors: RenderError[]
  warnings: RenderWarning[]
}

export interface LoadOptions {
  strict?: boolean
  maxNodes?: number
  baseDir?: string
}

// ─── Interaction events ──────────────────────────────────────────────────────

export interface NodeEvent {
  nodeId: string
  eventType: 'click' | 'hover' | 'dblclick' | 'contextmenu'
  originalEvent?: Event
}
