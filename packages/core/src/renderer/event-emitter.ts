type Handler = (...args: unknown[]) => void

export class EventEmitter {
  private handlers = new Map<string, Set<Handler>>()

  on(event: string, handler: Handler): void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler)
  }

  off(event: string, handler: Handler): void {
    const set = this.handlers.get(event)
    if (set) {
      set.delete(handler)
    }
  }

  emit(event: string, ...args: unknown[]): void {
    const set = this.handlers.get(event)
    if (set) {
      for (const handler of set) {
        handler(...args)
      }
    }
  }

  removeAll(): void {
    this.handlers.clear()
  }
}
