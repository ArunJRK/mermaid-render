import { MermaidRenderer } from '../src/index'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const renderer = new MermaidRenderer()

const DIAGRAM = `graph TD
    Client[Web Client] --> Gateway[API Gateway]
    Mobile[Mobile App] --> Gateway
    Gateway --> Auth[Auth Service]
    Gateway --> UserSvc[User Service]
    Gateway --> OrderSvc[Order Service]
    Gateway --> NotifSvc[Notification Service]

    Auth --> Redis[(Redis Cache)]
    Auth --> UserDB[(User DB)]

    UserSvc --> UserDB
    UserSvc --> S3[S3 Storage]

    OrderSvc --> OrderDB[(Order DB)]
    OrderSvc --> PaymentSvc[Payment Service]
    OrderSvc --> InventorySvc[Inventory Service]

    PaymentSvc --> Stripe[Stripe API]
    PaymentSvc --> OrderDB

    InventorySvc --> WarehouseDB[(Warehouse DB)]
    InventorySvc --> NotifSvc

    NotifSvc --> Email[Email Provider]
    NotifSvc --> Push[Push Service]
    NotifSvc --> Queue[Message Queue]

    subgraph frontend[Frontend Layer]
        Client
        Mobile
    end

    subgraph api[API Layer]
        Gateway
        Auth
    end

    subgraph core[Core Services]
        UserSvc
        OrderSvc
        NotifSvc
    end

    subgraph payments[Payment Processing]
        PaymentSvc
        Stripe
    end

    subgraph warehouse[Warehouse & Inventory]
        InventorySvc
        WarehouseDB
    end

    subgraph data[Data Stores]
        Redis
        UserDB
        OrderDB
        S3
    end

    subgraph external[External Services]
        Email
        Push
        Queue
    end`

let currentLayout = 'narrative'

async function loadWithLayout(layout: string) {
  currentLayout = layout
  const source = `%% @layout ${layout}\n${DIAGRAM}`
  const result = await renderer.load(source)
  console.log(`[${layout}]`, result.success ? 'OK' : 'FAIL', `${result.graph?.nodes.size ?? 0} nodes, ${result.graph?.subgraphs.size ?? 0} subgraphs`)

  document.querySelectorAll('#controls button').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-layout') === layout)
  })
}

async function main() {
  await renderer.mount(canvas)
  await loadWithLayout('narrative')

  document.querySelectorAll('#controls button').forEach(btn => {
    btn.addEventListener('click', () => {
      const layout = btn.getAttribute('data-layout')
      if (layout) loadWithLayout(layout)
    })
  })

  renderer.on('node:click', (e) => console.log('Click:', (e as any).nodeId))
  renderer.on('fold:change', (id, c) => console.log('Fold:', id, c))
  renderer.on('error', (err) => console.error('Error:', err))
}

main().catch(console.error)
