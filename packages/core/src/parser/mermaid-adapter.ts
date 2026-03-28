import mermaid from 'mermaid'
import type { DiagramType } from '../types'

// Ensure mermaid is initialized once
let initialized = false

function ensureInitialized(): void {
  if (!initialized) {
    mermaid.initialize({ startOnLoad: false })
    initialized = true
  }
}

export interface MermaidParseResult {
  diagramType: DiagramType
  db: any
  direction: string
}

/**
 * Map mermaid's internal diagram type strings to our DiagramType.
 */
function mapDiagramType(mermaidType: string): DiagramType {
  if (mermaidType.startsWith('flowchart')) return 'flowchart'
  if (mermaidType.startsWith('classDiagram')) return 'classDiagram'
  if (mermaidType.startsWith('c4')) return 'c4'
  if (mermaidType.startsWith('stateDiagram')) return 'stateDiagram'
  return 'unknown'
}

/**
 * Parse mermaid source and return the diagram type, db (for querying
 * vertices/edges/subgraphs), and direction.
 */
export async function parseMermaid(source: string): Promise<MermaidParseResult> {
  ensureInitialized()

  // Access mermaidAPI.getDiagramFromText to get the full Diagram object
  const api = (mermaid as any).mermaidAPI
  const diagram = await api.getDiagramFromText(source)

  const diagramType = mapDiagramType(diagram.type)
  const db = diagram.db
  const direction: string = typeof db.getDirection === 'function' ? db.getDirection() : 'TD'

  return { diagramType, db, direction }
}
