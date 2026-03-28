import type {
  Directive,
  LinkDirective,
  LayoutDirective,
  PinDirective,
  RankDirective,
  SpacingDirective,
  LayoutPhilosophy,
} from '../types'

export interface ExtractionResult {
  directives: Directive[]
  cleanedSource: string
}

// %% @link <nodeId> -> <path>#<fragment>
const LINK_RE = /^%%\s+@link\s+(\S+)\s+->\s+(\S+)$/

// %% @layout <philosophy>
const LAYOUT_RE = /^%%\s+@layout\s+(\S+)$/

// %% @pin <nodeId> <x> <y>
const PIN_RE = /^%%\s+@pin\s+(\S+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/

// %% @rank <nodeId1> <nodeId2> ...
const RANK_RE = /^%%\s+@rank\s+(.+)$/

// %% @spacing <value>  (or %% @spacing nodeSpacing=<v> rankSpacing=<v>)
const SPACING_RE = /^%%\s+@spacing\s+(.+)$/

function parseLinkTarget(raw: string): { targetFile: string; targetNode?: string } {
  const hashIdx = raw.indexOf('#')
  if (hashIdx === -1) {
    return { targetFile: raw }
  }
  return {
    targetFile: raw.slice(0, hashIdx),
    targetNode: raw.slice(hashIdx + 1),
  }
}

export function extractDirectives(source: string): ExtractionResult {
  const lines = source.split('\n')
  const directives: Directive[] = []
  const cleanedLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // Try @link
    const linkMatch = trimmed.match(LINK_RE)
    if (linkMatch) {
      const { targetFile, targetNode } = parseLinkTarget(linkMatch[2])
      const d: LinkDirective = {
        type: 'link',
        nodeId: linkMatch[1],
        targetFile,
        ...(targetNode !== undefined ? { targetNode } : {}),
      }
      directives.push(d)
      continue
    }

    // Try @layout
    const layoutMatch = trimmed.match(LAYOUT_RE)
    if (layoutMatch) {
      const d: LayoutDirective = {
        type: 'layout',
        philosophy: layoutMatch[1] as LayoutPhilosophy,
      }
      directives.push(d)
      continue
    }

    // Try @pin
    const pinMatch = trimmed.match(PIN_RE)
    if (pinMatch) {
      const d: PinDirective = {
        type: 'pin',
        nodeId: pinMatch[1],
        x: parseFloat(pinMatch[2]),
        y: parseFloat(pinMatch[3]),
      }
      directives.push(d)
      continue
    }

    // Try @rank
    const rankMatch = trimmed.match(RANK_RE)
    if (rankMatch) {
      const nodeIds = rankMatch[1].trim().split(/\s+/)
      const d: RankDirective = {
        type: 'rank',
        nodeIds,
        rank: 'same', // default rank when not specified
      }
      directives.push(d)
      continue
    }

    // Try @spacing
    const spacingMatch = trimmed.match(SPACING_RE)
    if (spacingMatch) {
      const val = parseFloat(spacingMatch[1])
      const d: SpacingDirective = {
        type: 'spacing',
        nodeSpacing: val,
      }
      directives.push(d)
      continue
    }

    // Not a directive — keep in cleaned output
    cleanedLines.push(line)
  }

  return {
    directives,
    cleanedSource: cleanedLines.join('\n'),
  }
}
