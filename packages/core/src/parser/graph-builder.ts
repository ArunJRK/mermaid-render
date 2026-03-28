import type {
  LoadResult,
  RenderWarning,
  LinkDirective,
} from '../types'
import { extractDirectives } from './directive-extractor'
import { parseMermaid } from './mermaid-adapter'
import { buildFlowchartGraph } from './adapters/flowchart'

/**
 * Full orchestrator: extract directives, parse mermaid, build graph, attach links.
 */
export async function buildGraph(source: string): Promise<LoadResult> {
  // Step 1: Extract directives from source
  const { directives, cleanedSource } = extractDirectives(source)

  // Step 2: Parse with mermaid
  let parseResult
  try {
    parseResult = await parseMermaid(cleanedSource)
  } catch (err: any) {
    return {
      success: false,
      errors: [
        {
          code: 'PARSE_FAILED',
          message: err?.message ?? String(err),
        },
      ],
      warnings: [],
    }
  }

  // Step 3: Build graph via adapter (currently only flowchart)
  const { diagramType, db, direction } = parseResult
  const graph = buildFlowchartGraph({
    db,
    direction,
    diagramType,
    directives,
  })

  // Step 4: Validate link directives against graph nodes
  const warnings: RenderWarning[] = []
  for (const d of directives) {
    if (d.type === 'link') {
      const linkDir = d as LinkDirective
      if (!graph.nodes.has(linkDir.nodeId)) {
        warnings.push({
          code: 'LINK_NODE_NOT_FOUND',
          message: `@link references unknown node "${linkDir.nodeId}"`,
        })
      }
    }
  }

  return {
    success: true,
    graph,
    errors: [],
    warnings,
  }
}
