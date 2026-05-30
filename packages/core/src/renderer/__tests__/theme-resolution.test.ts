import { describe, expect, it } from 'vitest'
import { resolveTheme } from '../theme'

describe('theme resolution', () => {
  it('uses the light narrative palette when system mode prefers light', () => {
    const theme = resolveTheme('narrative', 'system', true)
    expect(theme.name).toBe('Ink Light')
    expect(theme.background).toBe(0xf6f8fa)
    expect(theme.nodeFill).toBe(0xffffff)
    expect(theme.nodeText).toBe(0x1f2328)
  })

  it('applies theme overrides on top of the resolved palette', () => {
    const theme = resolveTheme('narrative', 'light', true, {
      background: 0xfef3c7,
      nodeFill: 0xfffbeb,
      nodeText: 0x78350f,
    })
    expect(theme.background).toBe(0xfef3c7)
    expect(theme.nodeFill).toBe(0xfffbeb)
    expect(theme.nodeText).toBe(0x78350f)
    expect(theme.edgeLabelColor).toBe(0x57606a)
  })
})
