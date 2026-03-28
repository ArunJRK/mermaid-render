import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from '../event-emitter'

describe('EventEmitter', () => {
  it('calls handler on emit', () => {
    const emitter = new EventEmitter()
    const handler = vi.fn()
    emitter.on('test', handler)
    emitter.emit('test', 'arg1', 'arg2')
    expect(handler).toHaveBeenCalledWith('arg1', 'arg2')
  })

  it('supports multiple handlers', () => {
    const emitter = new EventEmitter()
    const h1 = vi.fn()
    const h2 = vi.fn()
    emitter.on('test', h1)
    emitter.on('test', h2)
    emitter.emit('test')
    expect(h1).toHaveBeenCalled()
    expect(h2).toHaveBeenCalled()
  })

  it('off removes handler', () => {
    const emitter = new EventEmitter()
    const handler = vi.fn()
    emitter.on('test', handler)
    emitter.off('test', handler)
    emitter.emit('test')
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not call handlers for different events', () => {
    const emitter = new EventEmitter()
    const handler = vi.fn()
    emitter.on('eventA', handler)
    emitter.emit('eventB')
    expect(handler).not.toHaveBeenCalled()
  })

  it('removeAll clears all handlers', () => {
    const emitter = new EventEmitter()
    const h1 = vi.fn()
    const h2 = vi.fn()
    emitter.on('a', h1)
    emitter.on('b', h2)
    emitter.removeAll()
    emitter.emit('a')
    emitter.emit('b')
    expect(h1).not.toHaveBeenCalled()
    expect(h2).not.toHaveBeenCalled()
  })
})
