import { MermaidRenderer } from '../src/index'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const renderer = new MermaidRenderer()

const DIAGRAM = `graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
    subgraph processing[Processing Phase]
        C
        D
    end`

let currentLayout = 'narrative'

async function loadWithLayout(layout: string) {
  currentLayout = layout
  const source = `%% @layout ${layout}\n${DIAGRAM}`
  const result = await renderer.load(source)
  console.log(`Loaded with ${layout}:`, result.success, result)

  // Update active button
  document.querySelectorAll('#controls button').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-layout') === layout)
  })
}

async function main() {
  await renderer.mount(canvas)

  await loadWithLayout('narrative')

  // Philosophy switcher buttons
  document.querySelectorAll('#controls button').forEach(btn => {
    btn.addEventListener('click', () => {
      const layout = btn.getAttribute('data-layout')
      if (layout) loadWithLayout(layout)
    })
  })

  renderer.on('node:click', (e) => {
    console.log('Clicked:', (e as any).nodeId)
  })

  renderer.on('fold:change', (nodeId, collapsed) => {
    console.log('Fold:', nodeId, collapsed)
  })

  renderer.on('error', (err) => {
    console.error('Render error:', err)
  })
}

main().catch(console.error)
