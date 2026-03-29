import { describe, it, expect } from 'vitest'
import { WireRegistry, COMPONENT_CLEARANCE } from '../wire-registry'

describe('WireRegistry', () => {
  describe('COMPONENT_CLEARANCE', () => {
    it('exports Cc = 8', () => {
      expect(COMPONENT_CLEARANCE).toBe(8)
    })
  })

  describe('registerSubgraphObstacles', () => {
    it('blocks lanes through subgraph borders', () => {
      const reg = new WireRegistry(20)
      const subgraphs = new Map([
        ['sg1', { x: 200, y: 200, width: 300, height: 200 }],
      ])
      reg.registerSubgraphObstacles(subgraphs)

      // Top border zone: y around 100 (200 - 200/2 = 100)
      expect(reg.isVerticalFree(200, 90, 110)).toBe(false)
      // Bottom border zone: y around 300 (200 + 200/2 = 300)
      expect(reg.isVerticalFree(200, 290, 310)).toBe(false)
      // Interior should be FREE (only borders are blocked)
      expect(reg.isVerticalFree(200, 150, 250)).toBe(true)
    })

    it('blocks horizontal lanes through subgraph left and right borders', () => {
      const reg = new WireRegistry(20)
      const subgraphs = new Map([
        ['sg1', { x: 200, y: 200, width: 300, height: 200 }],
      ])
      reg.registerSubgraphObstacles(subgraphs)

      // Left border at x=50 (200 - 300/2 = 50)
      expect(reg.isHorizontalFree(200, 40, 60)).toBe(false)
      // Right border at x=350 (200 + 300/2 = 350)
      expect(reg.isHorizontalFree(200, 340, 360)).toBe(false)
      // Interior horizontal should be FREE
      expect(reg.isHorizontalFree(200, 100, 300)).toBe(true)
    })
  })

  describe('registerNodeObstacles uses COMPONENT_CLEARANCE', () => {
    it('blocks lanes through inflated node bounds', () => {
      const reg = new WireRegistry(20)
      const nodes = new Map([
        ['n1', { x: 100, y: 100, width: 40, height: 40 }],
      ])
      reg.registerNodeObstacles(nodes)

      // Node center (100,100), half-width 20 + Cc(8) = 28
      // Lane at x=120 should be blocked (within 28px of center)
      expect(reg.isVerticalFree(120, 80, 120)).toBe(false)
      // Lane at x=140 should be free (40px from center > 28)
      expect(reg.isVerticalFree(140, 80, 120)).toBe(true)
    })
  })
})
