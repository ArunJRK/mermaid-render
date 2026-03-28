import type {
  RenderGraph,
  RenderNode,
  RenderEdge,
  RenderSubgraph,
  NodeShape,
  EdgeStyle,
  DiagramType,
  Directive,
} from '../../types'

/**
 * Map mermaid's internal vertex type to our NodeShape.
 */
function mapShape(mermaidType: string | undefined): NodeShape {
  switch (mermaidType) {
    case 'square':
    case 'rect':
      return 'rectangle'
    case 'round':
      return 'rounded'
    case 'circle':
    case 'doublecircle':
    case 'ellipse':
      return 'circle'
    case 'diamond':
      return 'diamond'
    case 'hexagon':
      return 'hexagon'
    case 'stadium':
      return 'stadium'
    case 'cylinder':
      return 'cylinder'
    case 'subroutine':
      return 'subroutine'
    case 'odd':
    case 'lean_right':
    case 'lean_left':
    case 'trapezoid':
    case 'inv_trapezoid':
      return 'asymmetric'
    default:
      return 'unknown'
  }
}

/**
 * Map mermaid's stroke to our EdgeStyle.
 */
function mapEdgeStyle(stroke: string | undefined): EdgeStyle {
  switch (stroke) {
    case 'dotted':
      return 'dotted'
    case 'thick':
      return 'thick'
    case 'normal':
    default:
      return 'solid'
  }
}

export interface FlowchartBuildInput {
  db: any
  direction: string
  diagramType: DiagramType
  directives: Directive[]
}

/**
 * Build a RenderGraph from a flowchart diagram's db.
 */
export function buildFlowchartGraph(input: FlowchartBuildInput): RenderGraph {
  const { db, direction, diagramType, directives } = input

  // Build nodes from vertices
  const nodes = new Map<string, RenderNode>()
  const vertices: Map<string, any> = db.getVertices()
  for (const [id, vertex] of vertices) {
    nodes.set(id, {
      id,
      label: vertex.text ?? id,
      shape: mapShape(vertex.type),
      metadata: {},
    })
  }

  // Build edges
  const mermaidEdges: any[] = db.getEdges()
  const edges: RenderEdge[] = mermaidEdges.map((e: any, i: number) => {
    const edge: RenderEdge = {
      id: `e${i}`,
      source: e.start,
      target: e.end,
      style: mapEdgeStyle(e.stroke),
    }
    if (e.text && e.text.length > 0) {
      edge.label = e.text
    }
    return edge
  })

  // Build subgraphs
  const subgraphs = new Map<string, RenderSubgraph>()
  const mermaidSubgraphs: any[] = db.getSubGraphs()
  for (const sg of mermaidSubgraphs) {
    subgraphs.set(sg.id, {
      id: sg.id,
      label: sg.title ?? sg.id,
      nodeIds: sg.nodes ?? [],
      collapsed: false,
    })
  }

  return {
    nodes,
    edges,
    subgraphs,
    directives,
    direction,
    diagramType,
  }
}
