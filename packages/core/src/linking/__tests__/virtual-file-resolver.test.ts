import { describe, expect, it } from 'vitest'
import { createVirtualFileResolver, normalizeDiagramPath } from '../virtual-file-resolver'

describe('normalizeDiagramPath', () => {
  it('normalizes relative and extensionless paths', () => {
    expect(normalizeDiagramPath('./order-service', '/examples/microservice/overview.mmd'))
      .toBe('/examples/microservice/order-service.mmd')
  })

  it('normalizes dot segments to a single canonical key', () => {
    expect(normalizeDiagramPath('../microservice/./order-service.mmd', '/examples/cross-file/main.mmd'))
      .toBe('/examples/microservice/order-service.mmd')
  })

  it('rejects out-of-scope traversal and URL targets', () => {
    expect(normalizeDiagramPath('../../../../etc/passwd', '/examples/microservice/overview.mmd')).toBeNull()
    expect(normalizeDiagramPath('https://example.com/evil.mmd', '/examples/microservice/overview.mmd')).toBeNull()
  })
})

describe('createVirtualFileResolver', () => {
  it('canonicalizes and reads from a virtual file map', async () => {
    const resolver = createVirtualFileResolver({
      '/examples/main.mmd': 'graph TD\nA --> B',
      '/examples/order-service.mmd': 'graph TD\nB --> C',
    })

    const canonical = await resolver.canonicalize('./order-service', '/examples/main.mmd')
    expect(canonical).toBe('/examples/order-service.mmd')
    expect(await resolver.read(canonical!)).toContain('B --> C')
  })
})
