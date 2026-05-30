import { MermaidRenderer, createVirtualFileResolver } from '../src/index'

type EmbedSnapshot = {
  ready: boolean
  destroyed: boolean
  nodeCount: number
  selectedNodeId: string | null
  backend: string | null
  status: string
}

declare global {
  interface Window {
    __EMBED_HARNESS__?: {
      snapshot(): EmbedSnapshot
      destroy(): Promise<void>
    }
  }
}

const statusEl = document.getElementById('status') as HTMLDivElement
const canvas = document.getElementById('embed-canvas') as HTMLCanvasElement

const files = {
  '/examples/embed/root.mmd': `
    %% @link details -> ./details#detailsNode
    graph TD
      start[Start] --> details[Details]
      details --> done[Done]
  `,
  '/examples/embed/details.mmd': `
    graph TD
      detailsNode[Detailed Step] --> finish[Finish]
  `,
}

const resolver = createVirtualFileResolver(files)
const renderer = new MermaidRenderer()

let ready = false
let destroyed = false
let selectedNodeId: string | null = null
let status = 'Mounting renderer…'

renderer.on('node:click', (event) => {
  const payload = event as { nodeId?: string }
  selectedNodeId = payload.nodeId ?? null
})

renderer.on('warn', (...args) => {
  const first = args[0] as { message?: string } | undefined
  if (first?.message) {
    status = first.message
    statusEl.textContent = status
  }
})

function currentBackend(): string | null {
  const app = (renderer as any)._app
  const type = app?.renderer?.type
  if (type === 0x1) return 'WebGL'
  if (type === 0x2) return 'WebGPU'
  return null
}

window.__EMBED_HARNESS__ = {
  snapshot(): EmbedSnapshot {
    return {
      ready,
      destroyed,
      nodeCount: ((renderer as any)._nodeSprites?.size as number | undefined) ?? 0,
      selectedNodeId,
      backend: currentBackend(),
      status,
    }
  },
  async destroy(): Promise<void> {
    renderer.destroy()
    destroyed = true
    ready = false
    status = 'Renderer destroyed.'
    statusEl.textContent = status
  },
}

async function init() {
  try {
    await renderer.mount(canvas)
    const result = await renderer.load(files['/examples/embed/root.mmd'], {
      sourcePath: '/examples/embed/root.mmd',
      linkResolver: resolver,
      layout: 'narrative',
    })
    if (!result.success) {
      status = result.errors.map((error) => error.message).join('\n') || 'Diagram failed to load.'
      statusEl.textContent = status
      return
    }
    ready = true
    status = `Renderer ready on ${currentBackend() ?? 'unknown backend'}.`
    statusEl.textContent = status
  } catch (error) {
    status = error instanceof Error ? error.message : String(error)
    statusEl.textContent = status
  }
}

void init()
