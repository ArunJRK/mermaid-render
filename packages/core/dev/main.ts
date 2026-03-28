import { MermaidRenderer } from '../src/index'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const breadcrumbEl = document.getElementById('breadcrumb') as HTMLDivElement
const renderer = new MermaidRenderer()

// ── Multi-file diagram registry ─────────────────────────────────────────────
// Simulates file system — in VS Code extension, these come from real files.

const FILES: Record<string, string> = {
  '/overview': `%% @link OrderSvc -> /order-service#orderFlow
%% @link PaymentSvc -> /payment-service#paymentFlow
%% @link Auth -> /auth-service#authFlow
%% @link NotifSvc -> /notification-service#notifFlow

graph TD
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
    end

    S3
    Email
    Push
    Queue
    Stripe`,

  '/order-service': `%% @link PaymentSvc -> /payment-service#paymentFlow

graph TD
    orderFlow[Receive Order] --> validate[Validate Order]
    validate --> checkStock{Stock Available?}
    checkStock -->|Yes| reserve[Reserve Items]
    checkStock -->|No| backorder[Create Backorder]
    reserve --> calcPrice[Calculate Price]
    backorder --> notify[Notify Customer]
    calcPrice --> PaymentSvc[Process Payment]
    PaymentSvc --> confirm{Payment OK?}
    confirm -->|Yes| fulfill[Fulfill Order]
    confirm -->|No| cancel[Cancel & Release Stock]
    fulfill --> ship[Schedule Shipping]
    ship --> complete[Order Complete]
    cancel --> notifyFail[Notify Failure]

    subgraph validation[Order Validation]
        validate
        checkStock
    end

    subgraph processing[Order Processing]
        reserve
        calcPrice
        backorder
    end

    subgraph fulfillment[Fulfillment]
        fulfill
        ship
        complete
    end`,

  '/payment-service': `graph TD
    paymentFlow[Payment Request] --> authCard[Authorize Card]
    authCard --> gateway{Gateway Response}
    gateway -->|Approved| capture[Capture Funds]
    gateway -->|Declined| retry{Retry?}
    retry -->|Yes| authCard
    retry -->|No| fail[Payment Failed]
    capture --> record[Record Transaction]
    record --> webhook[Send Webhook]
    webhook --> done[Payment Complete]

    subgraph stripe[Stripe Integration]
        authCard
        capture
        gateway
    end

    subgraph internal[Internal Processing]
        record
        webhook
    end`,

  '/auth-service': `graph TD
    authFlow[Auth Request] --> checkToken{Has Token?}
    checkToken -->|Yes| validateToken[Validate JWT]
    checkToken -->|No| login[Login Flow]
    login --> credentials[Check Credentials]
    credentials --> mfa{MFA Required?}
    mfa -->|Yes| sendCode[Send MFA Code]
    sendCode --> verifyCode[Verify Code]
    mfa -->|No| issueToken[Issue JWT]
    verifyCode --> issueToken
    validateToken --> expired{Token Expired?}
    expired -->|Yes| refresh[Refresh Token]
    expired -->|No| authorized[Authorized]
    refresh --> issueToken
    issueToken --> authorized

    subgraph authentication[Authentication]
        login
        credentials
        mfa
        sendCode
        verifyCode
    end

    subgraph tokens[Token Management]
        validateToken
        expired
        refresh
        issueToken
    end`,
}

// ── Theme styles ────────────────────────────────────────────────────────────

const THEME_STYLES: Record<string, {
  bg: string; text: string; accent: string; border: string; bodyBg: string
}> = {
  narrative: { bg: '#0d1117', text: '#8b949e', accent: '#58a6ff', border: '#30363d', bodyBg: '#0d1117' },
  map:       { bg: '#1a1a2e', text: '#7a7a9e', accent: '#e94560', border: '#0f3460', bodyBg: '#1a1a2e' },
  blueprint: { bg: '#0a192f', text: '#8892b0', accent: '#64ffda', border: '#233554', bodyBg: '#0a192f' },
  breath:    { bg: '#111111', text: '#888888', accent: '#ffffff', border: '#333333', bodyBg: '#111111' },
  radial:    { bg: '#0f0f1a', text: '#9090b0', accent: '#b07aff', border: '#2a2a4a', bodyBg: '#0f0f1a' },
  mosaic:    { bg: '#121212', text: '#909090', accent: '#ff9f43', border: '#2a2a2a', bodyBg: '#121212' },
}

let currentLayout = 'narrative'
let currentFile = '/overview'
const fileHistory: string[] = []

// ── UI helpers ──────────────────────────────────────────────────────────────

function applyThemeStyles(layout: string) {
  const s = THEME_STYLES[layout] ?? THEME_STYLES.narrative
  breadcrumbEl.style.background = s.bg
  breadcrumbEl.style.borderColor = s.border
  breadcrumbEl.style.color = s.text
  document.body.style.background = s.bodyBg

  document.querySelectorAll<HTMLButtonElement>('#controls button[data-layout]').forEach(btn => {
    const isActive = btn.getAttribute('data-layout') === layout
    btn.style.background = s.bg
    btn.style.borderColor = isActive ? s.accent : s.border
    btn.style.color = isActive ? s.accent : s.text
  })
}

function updateBreadcrumb(segments: Array<{ id: string | null; label: string }>) {
  const s = THEME_STYLES[currentLayout] ?? THEME_STYLES.narrative
  while (breadcrumbEl.firstChild) breadcrumbEl.removeChild(breadcrumbEl.firstChild)

  // File path indicator
  const fileLabel = document.createElement('span')
  fileLabel.className = 'segment file-label'
  fileLabel.textContent = currentFile
  fileLabel.style.color = s.accent
  fileLabel.style.fontWeight = '600'
  fileLabel.style.opacity = '0.7'
  fileLabel.style.marginRight = '12px'
  breadcrumbEl.appendChild(fileLabel)

  // Breadcrumb segments
  segments.forEach((seg, i) => {
    if (i > 0) {
      const sep = document.createElement('span')
      sep.className = 'separator'
      sep.textContent = '>'
      breadcrumbEl.appendChild(sep)
    }
    const isCurrent = i === segments.length - 1
    const el = document.createElement('span')
    el.className = isCurrent ? 'segment current' : 'segment'
    el.textContent = seg.label
    if (isCurrent) el.style.color = s.accent
    el.addEventListener('click', () => renderer.focusTo(i))
    breadcrumbEl.appendChild(el)
  })

  // Back button (if we navigated from another file)
  if (fileHistory.length > 0) {
    const back = document.createElement('span')
    back.className = 'segment'
    back.textContent = '← Back'
    back.style.marginLeft = '16px'
    back.style.opacity = '0.6'
    back.addEventListener('click', () => navigateBack())
    breadcrumbEl.appendChild(back)
  }

  // Hint
  const hint = document.createElement('span')
  hint.className = 'hint'
  const keys = [['Esc', 'back'], ['F', 'fit'], ['R', 'reset']]
  keys.forEach(([key, label], i) => {
    if (i > 0) hint.appendChild(document.createTextNode(' · '))
    const kbd = document.createElement('kbd')
    kbd.textContent = key
    hint.appendChild(kbd)
    hint.appendChild(document.createTextNode(` ${label}`))
  })
  breadcrumbEl.appendChild(hint)
}

async function loadFile(filePath: string) {
  const source = FILES[filePath]
  if (!source) {
    console.error(`File not found: ${filePath}`)
    return
  }

  currentFile = filePath
  // Load with current user-selected philosophy (not per-file)
  const result = await renderer.load(`%% @layout ${currentLayout}\n${source}`)

  applyThemeStyles(currentLayout)

  // Highlight active file button
  document.querySelectorAll<HTMLButtonElement>('#files button').forEach(btn => {
    const isActive = btn.getAttribute('data-file') === filePath
    const s = THEME_STYLES[currentLayout] ?? THEME_STYLES.narrative
    btn.style.borderColor = isActive ? s.accent : s.border
    btn.style.color = isActive ? s.accent : s.text
  })

  console.log(`[${filePath}] loaded with ${currentLayout}:`, result.success ? 'OK' : 'FAIL')
}

function navigateToFile(filePath: string) {
  fileHistory.push(currentFile)
  loadFile(filePath)
}

function navigateBack() {
  const prev = fileHistory.pop()
  if (prev) loadFile(prev)
}

// ── File selector buttons ───────────────────────────────────────────────────

function buildFileButtons() {
  const container = document.getElementById('files')!
  for (const path of Object.keys(FILES)) {
    const btn = document.createElement('button')
    btn.textContent = path.replace('/', '')
    btn.setAttribute('data-file', path)
    btn.addEventListener('click', () => {
      fileHistory.length = 0 // direct navigation, clear history
      loadFile(path)
    })
    container.appendChild(btn)
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await renderer.mount(canvas)

  renderer.onBreadcrumbChange = updateBreadcrumb

  // Provide preview resolver — parses target file for hover preview
  renderer.onResolvePreview = async (targetFile: string) => {
    const source = FILES[targetFile]
    if (!source) return null
    const { buildGraph } = await import('../src/parser/graph-builder')
    const result = await buildGraph(source)
    return result.success && result.graph ? result.graph : null
  }

  // Handle cross-file link clicks
  renderer.on('link:navigate', (link: any) => {
    const targetFile = link.targetFile as string
    console.log('Navigate to:', targetFile)
    if (FILES[targetFile]) {
      navigateToFile(targetFile)
    } else {
      console.warn(`File not found: ${targetFile}`)
    }
  })

  buildFileButtons()
  await loadFile('/overview')

  // Philosophy switcher
  document.querySelectorAll('#controls button[data-layout]').forEach(btn => {
    btn.addEventListener('click', () => {
      const layout = btn.getAttribute('data-layout')
      if (layout) {
        currentLayout = layout
        renderer.setPhilosophy(layout)
        applyThemeStyles(layout)
      }
    })
  })

  renderer.on('node:click', (e: any) => console.log('Click:', e.nodeId))
  renderer.on('fold:change', (id: any, c: any) => console.log('Fold:', id, c))
  renderer.on('error', (err: any) => console.error('Error:', err))
}

main().catch(console.error)
