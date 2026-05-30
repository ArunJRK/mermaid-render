import { describe, expect, it } from 'vitest'
import { getTheme } from '../theme'

const PHILOSOPHIES = [
  'narrative',
  'map',
  'blueprint',
  'breath',
  'radial',
  'mosaic',
] as const

describe('theme subgraph depth tints', () => {
  it('defines at least three distinct depth tints for every shipped philosophy', () => {
    for (const philosophy of PHILOSOPHIES) {
      const theme = getTheme(philosophy)
      expect(theme.subgraphDepthTints, `${philosophy} is missing subgraphDepthTints`).toBeDefined()
      expect(theme.subgraphDepthTints!.length, `${philosophy} should define at least 3 depth tints`).toBeGreaterThanOrEqual(3)
      expect(new Set(theme.subgraphDepthTints!).size, `${philosophy} depth tints should not collapse to one color`).toBeGreaterThanOrEqual(3)
    }
  })
})
