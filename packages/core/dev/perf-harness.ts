import { MermaidRenderer } from '../src/index'

type PerfSample = {
  name: string
  nodeCount: number
  edgeCount: number
  loadMs: number
  avgFrameMs: number
  p95FrameMs: number
  approxFps: number
}

type PerfHarnessResult = {
  representative: PerfSample
  stress: PerfSample
}

declare global {
  interface Window {
    __PERF_HARNESS__?: {
      run(): Promise<PerfHarnessResult>
    }
  }
}

const statusEl = document.getElementById('status') as HTMLPreElement
const canvas = document.getElementById('canvas') as HTMLCanvasElement
const renderer = new MermaidRenderer()

const representativeSource = `%% @layout narrative
graph TD
  Client[Web Client] --> Gateway[API Gateway]
  Gateway --> Auth[Auth Service]
  Gateway --> OrderSvc[Order Service]
  Gateway --> PaymentSvc[Payment Service]
  OrderSvc --> Queue[Queue]
  PaymentSvc --> Ledger[(Ledger DB)]
  subgraph api[API]
    Gateway
    Auth
  end
  subgraph services[Services]
    OrderSvc
    PaymentSvc
  end`

function buildStressSource(nodeCount = 220): string {
  const lines: string[] = ['%% @layout narrative', 'graph TD']
  for (let i = 0; i < nodeCount; i++) {
    lines.push(`  N${i}[Service ${i}]`)
  }
  for (let i = 0; i < nodeCount - 1; i++) {
    lines.push(`  N${i} --> N${i + 1}`)
    if (i % 4 === 0 && i + 10 < nodeCount) lines.push(`  N${i} --> N${i + 10}`)
    if (i % 9 === 0 && i + 25 < nodeCount) lines.push(`  N${i} --> N${i + 25}`)
  }
  return lines.join('\n')
}

function setStatus(message: string) {
  statusEl.textContent = message
}

async function measureFramePacing(frameCount = 120): Promise<{ avgFrameMs: number; p95FrameMs: number; approxFps: number }> {
  const viewport = (renderer as any)._viewport as { x: number } | null
  if (!viewport) throw new Error('Missing viewport')

  const deltas: number[] = []
  let previous = performance.now()

  await new Promise<void>((resolve) => {
    let frame = 0
    const tick = (now: number) => {
      deltas.push(now - previous)
      previous = now
      viewport.x += frame % 2 === 0 ? 1.5 : -1.5
      frame += 1
      if (frame < frameCount) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })

  const trimmed = deltas.slice(1)
  const avgFrameMs = trimmed.reduce((sum, delta) => sum + delta, 0) / trimmed.length
  const ordered = [...trimmed].sort((a, b) => a - b)
  const p95FrameMs = ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))]
  const approxFps = 1000 / avgFrameMs
  return { avgFrameMs, p95FrameMs, approxFps }
}

async function runSample(name: string, source: string): Promise<PerfSample> {
  const started = performance.now()
  const result = await renderer.load(source)
  const loadMs = performance.now() - started
  if (!result.success || !result.graph) {
    throw new Error(`Failed to load ${name}: ${result.errors.map((error) => error.message).join('; ')}`)
  }
  renderer.fitToView()
  const pacing = await measureFramePacing()
  return {
    name,
    nodeCount: result.graph.nodes.size,
    edgeCount: result.graph.edges.length,
    loadMs,
    ...pacing,
  }
}

window.__PERF_HARNESS__ = {
  async run(): Promise<PerfHarnessResult> {
    await renderer.mount(canvas)
    const representative = await runSample('representative', representativeSource)
    const stress = await runSample('stress', buildStressSource(220))
    const result = { representative, stress }
    setStatus(JSON.stringify(result, null, 2))
    renderer.destroy()
    return result
  },
}

setStatus('ready')
