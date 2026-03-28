import { MermaidRenderer } from '../src/index'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const renderer = new MermaidRenderer()

async function main() {
  await renderer.mount(canvas)

  const result = await renderer.load(`
%% @layout narrative
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
    subgraph processing[Processing Phase]
        C
        D
    end
  `)

  console.log('Load result:', result)

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
