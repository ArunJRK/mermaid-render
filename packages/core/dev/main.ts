import { MermaidRenderer } from '../src/index'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const breadcrumbEl = document.getElementById('breadcrumb') as HTMLDivElement
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

// Theme colors for dynamic breadcrumb/control styling
const THEME_STYLES: Record<string, {
  bg: string; text: string; accent: string; border: string; bodyBg: string
}> = {
  narrative: { bg: '#0d1117', text: '#8b949e', accent: '#58a6ff', border: '#30363d', bodyBg: '#0d1117' },
  map:       { bg: '#1a1a2e', text: '#7a7a9e', accent: '#e94560', border: '#0f3460', bodyBg: '#1a1a2e' },
  blueprint: { bg: '#0a192f', text: '#8892b0', accent: '#64ffda', border: '#233554', bodyBg: '#0a192f' },
  breath:    { bg: '#111111', text: '#888888', accent: '#ffffff', border: '#333333', bodyBg: '#111111' },
}

let currentLayout = 'narrative'

function applyThemeStyles(layout: string) {
  const s = THEME_STYLES[layout] ?? THEME_STYLES.narrative

  // Breadcrumb bar
  breadcrumbEl.style.background = s.bg
  breadcrumbEl.style.borderColor = s.border
  breadcrumbEl.style.color = s.text

  // Body background
  document.body.style.background = s.bodyBg

  // Control buttons
  document.querySelectorAll<HTMLButtonElement>('#controls button').forEach(btn => {
    const isActive = btn.getAttribute('data-layout') === layout
    btn.style.background = s.bg
    btn.style.borderColor = isActive ? s.accent : s.border
    btn.style.color = isActive ? s.accent : s.text
    btn.classList.toggle('active', isActive)
  })
}

function createSpan(className: string, text: string, style?: Record<string, string>): HTMLSpanElement {
  const el = document.createElement('span')
  el.className = className
  el.textContent = text
  if (style) {
    for (const [k, v] of Object.entries(style)) {
      el.style.setProperty(k, v)
    }
  }
  return el
}

function updateBreadcrumb(segments: Array<{ id: string | null; label: string }>) {
  const s = THEME_STYLES[currentLayout] ?? THEME_STYLES.narrative

  // Clear existing content
  while (breadcrumbEl.firstChild) {
    breadcrumbEl.removeChild(breadcrumbEl.firstChild)
  }

  // Build breadcrumb using safe DOM methods
  segments.forEach((seg, i) => {
    if (i > 0) {
      const sep = createSpan('separator', '>')
      breadcrumbEl.appendChild(sep)
    }
    const isCurrent = i === segments.length - 1
    const cls = isCurrent ? 'segment current' : 'segment'
    const segEl = createSpan(cls, seg.label, isCurrent ? { color: s.accent } : undefined)
    segEl.setAttribute('data-depth', String(i))
    segEl.addEventListener('click', () => {
      renderer.focusTo(i)
    })
    breadcrumbEl.appendChild(segEl)
  })

  // Add the hint
  const hint = document.createElement('span')
  hint.className = 'hint'

  const escKbd = document.createElement('kbd')
  escKbd.textContent = 'Esc'
  hint.appendChild(escKbd)
  hint.appendChild(document.createTextNode(' zoom out \u00B7 '))

  const fKbd = document.createElement('kbd')
  fKbd.textContent = 'F'
  hint.appendChild(fKbd)
  hint.appendChild(document.createTextNode(' fit \u00B7 '))

  const rKbd = document.createElement('kbd')
  rKbd.textContent = 'R'
  hint.appendChild(rKbd)
  hint.appendChild(document.createTextNode(' reset'))

  breadcrumbEl.appendChild(hint)
}

async function loadWithLayout(layout: string) {
  currentLayout = layout
  const source = `%% @layout ${layout}\n${DIAGRAM}`
  const result = await renderer.load(source)
  console.log(`[${layout}]`, result.success ? 'OK' : 'FAIL', `${result.graph?.nodes.size ?? 0} nodes, ${result.graph?.subgraphs.size ?? 0} subgraphs`)

  applyThemeStyles(layout)
}

async function main() {
  await renderer.mount(canvas)

  // Wire breadcrumb updates
  renderer.onBreadcrumbChange = (segments) => {
    updateBreadcrumb(segments)
  }

  await loadWithLayout('narrative')

  document.querySelectorAll('#controls button').forEach(btn => {
    btn.addEventListener('click', () => {
      const layout = btn.getAttribute('data-layout')
      if (layout) loadWithLayout(layout)
    })
  })

  renderer.on('node:click', (e) => console.log('Click:', (e as any).nodeId))
  renderer.on('fold:change', (id, c) => console.log('Fold:', id, c))
  renderer.on('focus:change', (id, stack) => console.log('Focus:', id, stack))
  renderer.on('error', (err) => console.error('Error:', err))
}

main().catch(console.error)
