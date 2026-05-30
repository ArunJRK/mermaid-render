import type { PositionedNode } from './types'
import { measureTextWidth } from './layout/text-measure'

const RENDERED_LABEL_PADDING_X = 24

export interface NodeFootprint {
  width: number
  height: number
}

export function estimateRenderedNodeFootprint(
  node: Pick<PositionedNode, 'label' | 'width' | 'height'>,
  monospace: boolean = false,
): NodeFootprint {
  const labelWidth = measureTextWidth(node.label, 14, monospace)
  return {
    width: Math.max(node.width, labelWidth + RENDERED_LABEL_PADDING_X),
    height: node.height,
  }
}
