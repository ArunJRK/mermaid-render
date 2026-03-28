import { describe, it, expect, vi } from 'vitest'
import { mapKeyToAction } from '../keyboard'

describe('keyboard', () => {
  it('maps f to fitToView', () => {
    expect(mapKeyToAction('f')).toBe('fitToView')
  })

  it('maps r to resetView', () => {
    expect(mapKeyToAction('r')).toBe('resetView')
  })

  it('returns undefined for unknown keys', () => {
    expect(mapKeyToAction('x')).toBeUndefined()
    expect(mapKeyToAction('a')).toBeUndefined()
  })
})
