import { MermaidRenderer } from '../src/index'

type LifecycleHarnessResult = {
  multiInstanceMounted: boolean
  multiInstanceBackendCount: number
  bothRenderersLoaded: boolean
  firstRendererNodeCount: number
  secondRendererNodeCount: number
}

type LifecycleMisuseResult = {
  secondMountOtherCanvasError: string | null
  foreignCanvasOwnershipError: string | null
  loadAfterDestroyError: string | null
  setPhilosophyAfterDestroyError: string | null
  mountAfterDestroyError: string | null
}

type ContextRecoveryResult = {
  initialNodeCount: number
  recoveredNodeCount: number
  contextLossPrevented: boolean
  contextRestoredDispatched: boolean
}

type VisibilityPauseResult = {
  initiallyRunning: boolean
  hiddenRunning: boolean
  restoredRunning: boolean
}

type IdlePauseResult = {
  runningImmediatelyAfterLoad: boolean
  stoppedAfterIdle: boolean
  runningAfterPointerMove: boolean
  stoppedAgainAfterIdle: boolean
}

type AdapterFallbackResult = {
  mountSucceeded: boolean
  backend: string | null
  nodeCount: number
  requestAdapterCalls: number
}

type WebGpuRecoveryResult = {
  done: boolean
  error: string | null
  initialBackend: string | null
  recoveredBackend: string | null
  initialNodeCount: number
  recoveredNodeCount: number
  warningMessages: string[]
  steps: string[]
}

declare global {
  interface Window {
    __LIFECYCLE_HARNESS__?: {
      runMultiInstanceProbe(): Promise<LifecycleHarnessResult>
      runLifecycleMisuseProbe(): Promise<LifecycleMisuseResult>
      runContextRecovery(): Promise<ContextRecoveryResult>
      runVisibilityPauseProbe(): Promise<VisibilityPauseResult>
      runIdlePauseProbe(): Promise<IdlePauseResult>
      runAdapterFallbackProbe(): Promise<AdapterFallbackResult>
      startWebGpuRecoveryProbe(): void
      getWebGpuRecoveryProbe(): WebGpuRecoveryResult | null
    }
  }
}

const statusEl = document.getElementById('status') as HTMLPreElement
let webGpuRecoveryProbe: WebGpuRecoveryResult | null = null

function setStatus(message: string) {
  statusEl.textContent = message
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out`)), 5000)
    }),
  ])
}

window.__LIFECYCLE_HARNESS__ = {
  async runMultiInstanceProbe(): Promise<LifecycleHarnessResult> {
    const originalGpuDescriptor = Object.getOwnPropertyDescriptor(navigator, 'gpu')
    try {
      Object.defineProperty(navigator, 'gpu', {
        configurable: true,
        value: undefined,
      })
    } catch {
      // ignore if the browser does not let us override this property
    }

    const canvasA = document.getElementById('canvas-a') as HTMLCanvasElement
    const canvasB = document.getElementById('canvas-b') as HTMLCanvasElement
    const graph = {
      nodes: new Map([
        ['A', { id: 'A', label: 'Start', shape: 'rectangle', metadata: {} }],
        ['B', { id: 'B', label: 'Done', shape: 'rectangle', metadata: {} }],
      ]),
      edges: [{ id: 'A->B', source: 'A', target: 'B', style: 'solid' as const }],
      subgraphs: new Map(),
      directives: [],
      direction: 'TD',
      diagramType: 'flowchart' as const,
    }

    let multiInstanceMounted = false
    let multiInstanceBackendCount = 0
    let bothRenderersLoaded = false
    let firstRendererNodeCount = 0
    let secondRendererNodeCount = 0
    const first = new MermaidRenderer()
    const second = new MermaidRenderer()
    try {
      await withTimeout(first.mount(canvasA), 'first mount')
      await withTimeout(second.mount(canvasB), 'second mount')
      first.loadGraph(graph)
      second.loadGraph(graph)
      multiInstanceMounted = true
      multiInstanceBackendCount = [first, second]
        .filter((instance: any) => instance._app?.renderer?.type === 0x1 || instance._app?.renderer?.type === 0x2)
        .length
      firstRendererNodeCount = (first as any)._nodeSprites.size
      secondRendererNodeCount = (second as any)._nodeSprites.size
      bothRenderersLoaded = firstRendererNodeCount > 0 && secondRendererNodeCount > 0
    } finally {
      first.destroy()
      second.destroy()
    }

    const result = {
      multiInstanceMounted,
      multiInstanceBackendCount,
      bothRenderersLoaded,
      firstRendererNodeCount,
      secondRendererNodeCount,
    }

    setStatus(JSON.stringify(result, null, 2))
    if (originalGpuDescriptor) {
      Object.defineProperty(navigator, 'gpu', originalGpuDescriptor)
    }
    return result
  },
  async runLifecycleMisuseProbe(): Promise<LifecycleMisuseResult> {
    const canvasA = document.getElementById('canvas-a') as HTMLCanvasElement
    const canvasB = document.getElementById('canvas-b') as HTMLCanvasElement
    const source = `graph TD
      A[Start] --> B[Done]`

    let secondMountOtherCanvasError: string | null = null
    let foreignCanvasOwnershipError: string | null = null
    let loadAfterDestroyError: string | null = null
    let setPhilosophyAfterDestroyError: string | null = null
    let mountAfterDestroyError: string | null = null

    const primary = new MermaidRenderer()
    try {
      await withTimeout(primary.mount(canvasA), 'primary mount')
      await withTimeout(primary.mount(canvasB), 'primary remount')
    } catch (error) {
      secondMountOtherCanvasError = error instanceof Error ? error.message : String(error)
    }
    primary.destroy()

    const owner = new MermaidRenderer()
    const thief = new MermaidRenderer()
    try {
      await withTimeout(owner.mount(canvasB), 'owner mount')
      await withTimeout(thief.mount(canvasB), 'thief mount')
    } catch (error) {
      foreignCanvasOwnershipError = error instanceof Error ? error.message : String(error)
    } finally {
      owner.destroy()
      thief.destroy()
    }

    try {
      await primary.load(source)
    } catch (error) {
      loadAfterDestroyError = error instanceof Error ? error.message : String(error)
    }

    try {
      primary.setPhilosophy('blueprint')
    } catch (error) {
      setPhilosophyAfterDestroyError = error instanceof Error ? error.message : String(error)
    }

    try {
      await primary.mount(canvasA)
    } catch (error) {
      mountAfterDestroyError = error instanceof Error ? error.message : String(error)
    }

    const result = {
      secondMountOtherCanvasError,
      foreignCanvasOwnershipError,
      loadAfterDestroyError,
      setPhilosophyAfterDestroyError,
      mountAfterDestroyError,
    }

    setStatus(JSON.stringify(result, null, 2))
    return result
  },
  async runContextRecovery(): Promise<ContextRecoveryResult> {
    const originalGpuDescriptor = Object.getOwnPropertyDescriptor(navigator, 'gpu')
    try {
      Object.defineProperty(navigator, 'gpu', {
        configurable: true,
        value: undefined,
      })
    } catch {
      // ignore if the browser does not let us override this property
    }

    const canvasA = document.getElementById('canvas-a') as HTMLCanvasElement
    const renderer = new MermaidRenderer()
    const source = `graph TD
      A[Start] --> B[Done]`

    try {
      await withTimeout(renderer.mount(canvasA), 'recovery mount')
      await withTimeout(renderer.load(source), 'recovery load')
      const initialNodeCount = (renderer as any)._nodeSprites.size

      const lostEvent = new Event('webglcontextlost', { cancelable: true })
      const restoredEvent = new Event('webglcontextrestored')
      canvasA.dispatchEvent(lostEvent)
      const contextLossPrevented = lostEvent.defaultPrevented
      const contextRestoredDispatched = canvasA.dispatchEvent(restoredEvent)

      const recoveredNodeCount = await withTimeout(
        new Promise<number>((resolve, reject) => {
          const started = performance.now()
          const tick = () => {
            const nodeCount = (renderer as any)._nodeSprites.size as number
            if (nodeCount > 0) {
              resolve(nodeCount)
              return
            }
            if (performance.now() - started > 5000) {
              reject(new Error('context recovery timed out'))
              return
            }
            window.setTimeout(tick, 50)
          }
          tick()
        }),
        'context recovery',
      )

      return {
        initialNodeCount,
        recoveredNodeCount,
        contextLossPrevented,
        contextRestoredDispatched,
      }
    } finally {
      renderer.destroy()
      if (originalGpuDescriptor) {
        Object.defineProperty(navigator, 'gpu', originalGpuDescriptor)
      }
    }
  },
  async runVisibilityPauseProbe(): Promise<VisibilityPauseResult> {
    const originalGpuDescriptor = Object.getOwnPropertyDescriptor(navigator, 'gpu')
    try {
      Object.defineProperty(navigator, 'gpu', {
        configurable: true,
        value: undefined,
      })
    } catch {
      // ignore if the browser does not let us override this property
    }

    const canvasA = document.getElementById('canvas-a') as HTMLCanvasElement
    const renderer = new MermaidRenderer()
    const source = `graph TD
      A[Start] --> B[Done]`
    const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    const documentPrototype = Object.getPrototypeOf(document) as Document
    const prototypeVisibilityDescriptor = Object.getOwnPropertyDescriptor(documentPrototype, 'visibilityState')
    let simulatedVisibilityState: DocumentVisibilityState | null = null

    try {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => simulatedVisibilityState ?? prototypeVisibilityDescriptor?.get?.call(document) ?? 'visible',
      })
    } catch {
      // ignore if the browser does not let us override this property
    }

    try {
      await withTimeout(renderer.mount(canvasA), 'visibility mount')
      await withTimeout(renderer.load(source), 'visibility load')

      const app = (renderer as any)._app as { ticker?: { started?: boolean } } | null
      const initiallyRunning = Boolean(app?.ticker?.started)

      simulatedVisibilityState = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
      const hiddenRunning = Boolean(app?.ticker?.started)

      simulatedVisibilityState = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
      const restoredRunning = Boolean(app?.ticker?.started)

      return {
        initiallyRunning,
        hiddenRunning,
        restoredRunning,
      }
    } finally {
      renderer.destroy()
      if (originalVisibilityDescriptor) {
        Object.defineProperty(document, 'visibilityState', originalVisibilityDescriptor)
      } else {
        delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState
      }
      if (originalGpuDescriptor) {
        Object.defineProperty(navigator, 'gpu', originalGpuDescriptor)
      }
    }
  },
  async runIdlePauseProbe(): Promise<IdlePauseResult> {
    const originalGpuDescriptor = Object.getOwnPropertyDescriptor(navigator, 'gpu')
    try {
      Object.defineProperty(navigator, 'gpu', {
        configurable: true,
        value: undefined,
      })
    } catch {
      // ignore if the browser does not let us override this property
    }

    const canvasA = document.getElementById('canvas-a') as HTMLCanvasElement
    const renderer = new MermaidRenderer()
    const source = `graph TD
      A[Start] --> B[Done]`

    try {
      await withTimeout(renderer.mount(canvasA), 'idle mount')
      await withTimeout(renderer.load(source), 'idle load')

      const app = (renderer as any)._app as { ticker?: { started?: boolean } } | null
      const runningImmediatelyAfterLoad = Boolean(app?.ticker?.started)

      await new Promise((resolve) => window.setTimeout(resolve, 350))
      const stoppedAfterIdle = !app?.ticker?.started

      canvasA.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 20,
        clientY: 20,
      }))
      await new Promise((resolve) => window.setTimeout(resolve, 50))
      const runningAfterPointerMove = Boolean(app?.ticker?.started)

      await new Promise((resolve) => window.setTimeout(resolve, 350))
      const stoppedAgainAfterIdle = !app?.ticker?.started

      return {
        runningImmediatelyAfterLoad,
        stoppedAfterIdle,
        runningAfterPointerMove,
        stoppedAgainAfterIdle,
      }
    } finally {
      renderer.destroy()
      if (originalGpuDescriptor) {
        Object.defineProperty(navigator, 'gpu', originalGpuDescriptor)
      }
    }
  },
  async runAdapterFallbackProbe(): Promise<AdapterFallbackResult> {
    const originalGpuDescriptor = Object.getOwnPropertyDescriptor(navigator, 'gpu')
    let requestAdapterCalls = 0
    try {
      Object.defineProperty(navigator, 'gpu', {
        configurable: true,
        value: {
          async requestAdapter() {
            requestAdapterCalls += 1
            return null
          },
        },
      })
    } catch {
      // ignore if the browser does not let us override this property
    }

    const canvasA = document.getElementById('canvas-a') as HTMLCanvasElement
    const renderer = new MermaidRenderer()
    const source = `graph TD
      A[Start] --> B[Done]`

    try {
      await withTimeout(renderer.mount(canvasA), 'adapter fallback mount')
      await withTimeout(renderer.load(source), 'adapter fallback load')
      const app = (renderer as any)._app as { renderer?: { type?: number } } | null
      const backend = app?.renderer?.type === 0x1
        ? 'WebGL'
        : app?.renderer?.type === 0x2
          ? 'WebGPU'
          : null
      const nodeCount = (renderer as any)._nodeSprites.size as number
      return {
        mountSucceeded: true,
        backend,
        nodeCount,
        requestAdapterCalls,
      }
    } finally {
      renderer.destroy()
      if (originalGpuDescriptor) {
        Object.defineProperty(navigator, 'gpu', originalGpuDescriptor)
      }
    }
  },
  startWebGpuRecoveryProbe(): void {
    const canvasA = document.getElementById('canvas-a') as HTMLCanvasElement
    const renderer = new MermaidRenderer()
    const source = `graph TD
      A[Start] --> B[Done]`
    const onWarn = (warning: any) => {
      webGpuRecoveryProbe?.warningMessages.push(warning?.message ?? String(warning))
    }
    renderer.on('warn', onWarn)
    webGpuRecoveryProbe = {
      done: false,
      error: null,
      initialBackend: null,
      recoveredBackend: null,
      initialNodeCount: 0,
      recoveredNodeCount: 0,
      warningMessages: [],
      steps: [],
    }

    const readBackend = () => {
      const app = (renderer as any)._app as { renderer?: { type?: number } } | null
      return app?.renderer?.type === 0x2
        ? 'WebGPU'
        : app?.renderer?.type === 0x1
          ? 'WebGL'
          : null
    }

    const finish = (error: string | null = null) => {
      if (!webGpuRecoveryProbe || webGpuRecoveryProbe.done) return
      if (error) webGpuRecoveryProbe.error = error
      webGpuRecoveryProbe.done = true
      setStatus(JSON.stringify(webGpuRecoveryProbe, null, 2))
      renderer.off('warn', onWarn)
      renderer.destroy()
    }

    void (async () => {
      try {
        webGpuRecoveryProbe?.steps.push('mount:start')
        await withTimeout(renderer.mount(canvasA), 'webgpu recovery mount')
        webGpuRecoveryProbe?.steps.push('mount:done')

        await withTimeout(renderer.load(source), 'webgpu recovery load')
        webGpuRecoveryProbe?.steps.push('load:done')

        if (!webGpuRecoveryProbe) return
        webGpuRecoveryProbe.initialBackend = readBackend()
        webGpuRecoveryProbe.initialNodeCount = (renderer as any)._nodeSprites.size as number
        if (webGpuRecoveryProbe.initialBackend !== 'WebGPU') {
          finish('WebGPU adapter unavailable in current browser environment')
          return
        }

        const app = (renderer as any)._app as object | null
        const generation = (renderer as any)._gpuLostGeneration as number
        webGpuRecoveryProbe.steps.push('deviceLost:invoke')
        void (renderer as any)
          ._handleGpuDeviceLost(app, generation)
          .then(() => {
            webGpuRecoveryProbe?.steps.push('deviceLost:handled')
          })
          .catch((error: unknown) => {
            finish(error instanceof Error ? error.message : String(error))
          })

        const started = performance.now()
        const poll = () => {
          if (!webGpuRecoveryProbe || webGpuRecoveryProbe.done) return

          const nodeCount = (renderer as any)._nodeSprites.size as number
          if (readBackend() && nodeCount > 0 && webGpuRecoveryProbe.warningMessages.some((message) => message.includes('WebGPU device lost'))) {
            webGpuRecoveryProbe.recoveredBackend = readBackend()
            webGpuRecoveryProbe.recoveredNodeCount = nodeCount
            webGpuRecoveryProbe.steps.push('recovery:done')
            finish()
            return
          }

          if (performance.now() - started > 10000) {
            finish('webgpu recovery timed out')
            return
          }

          window.setTimeout(poll, 50)
        }

        poll()
      } catch (error) {
        finish(error instanceof Error ? error.message : String(error))
      }
    })()
  },
  getWebGpuRecoveryProbe(): WebGpuRecoveryResult | null {
    return webGpuRecoveryProbe
  },
}

setStatus('ready')
