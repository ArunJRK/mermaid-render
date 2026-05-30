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

const MIN_TEXT_CONTRAST = 4.5

function toRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
}

function linearize(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function luminance(hex: number): number {
  const [r, g, b] = toRgb(hex)
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

function contrastRatio(foreground: number, background: number): number {
  const l1 = luminance(foreground)
  const l2 = luminance(background)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('theme contrast floor', () => {
  it('keeps node text, edge labels, and subgraph labels above the minimum contrast floor', () => {
    for (const philosophy of PHILOSOPHIES) {
      const theme = getTheme(philosophy)

      expect(
        contrastRatio(theme.nodeText, theme.nodeFill),
        `${philosophy} nodeText should contrast with nodeFill`,
      ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)

      expect(
        contrastRatio(theme.edgeLabelColor, theme.background),
        `${philosophy} edgeLabelColor should contrast with background`,
      ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)

      const subgraphFills = theme.subgraphDepthTints?.length
        ? theme.subgraphDepthTints
        : [theme.subgraphFill]

      for (const [depth, fill] of subgraphFills.entries()) {
        expect(
          contrastRatio(theme.subgraphLabel, fill),
          `${philosophy} subgraphLabel should contrast with depth ${depth} fill`,
        ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
      }
    }
  })
})
