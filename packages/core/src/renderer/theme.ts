import type { LayoutPhilosophy } from '../types'

export interface Theme {
  name: string
  background: number
  nodeFill: number
  nodeStroke: number
  nodeStrokeSelected: number
  nodeText: number
  edgeColor: number
  edgeLabelColor: number
  subgraphFill: number
  subgraphFillAlpha: number
  subgraphStroke: number
  subgraphStrokeAlpha: number
  subgraphLabel: number
  /** Per-depth subgraph tints (Map philosophy uses gradient) */
  subgraphDepthTints?: number[]
  /** Blueprint grid overlay */
  gridColor?: number
  gridAlpha?: number
  gridSize?: number
  hoverGlow: number
  hoverGlowAlpha: number
  accent: number
  strokeWidth: number
  cornerRadius: number
  /** Dimmed opacity for unfocused elements */
  dimmedAlpha: number
  /** Breadcrumb bar styling */
  breadcrumbBg: string
  breadcrumbText: string
  breadcrumbAccent: string
}

// ── Narrative "Ink" ──────────────────────────────────────────────────────────
const NARRATIVE: Theme = {
  name: 'Ink',
  background: 0x0d1117,
  nodeFill: 0x161b22,
  nodeStroke: 0x30363d,
  nodeStrokeSelected: 0x58a6ff,
  nodeText: 0xe6edf3,
  edgeColor: 0x6e7681,
  edgeLabelColor: 0x8b949e,
  subgraphFill: 0x161b22,
  subgraphFillAlpha: 0.4,
  subgraphStroke: 0x30363d,
  subgraphStrokeAlpha: 0.6,
  subgraphLabel: 0x8b949e,
  hoverGlow: 0x58a6ff,
  hoverGlowAlpha: 0.2,
  accent: 0x58a6ff,
  strokeWidth: 2,
  cornerRadius: 8,
  dimmedAlpha: 0.2,
  breadcrumbBg: '#0d1117',
  breadcrumbText: '#8b949e',
  breadcrumbAccent: '#58a6ff',
}

// ── Map "Atlas" ──────────────────────────────────────────────────────────────
const MAP: Theme = {
  name: 'Atlas',
  background: 0x1a1a2e,
  nodeFill: 0x16213e,
  nodeStroke: 0x0f3460,
  nodeStrokeSelected: 0xe94560,
  nodeText: 0xeaeaea,
  edgeColor: 0x5a5a8c,
  edgeLabelColor: 0x7a7a9e,
  subgraphFill: 0x0f3460,
  subgraphFillAlpha: 0.3,
  subgraphStroke: 0x0f3460,
  subgraphStrokeAlpha: 0.6,
  subgraphLabel: 0x7a7a9e,
  subgraphDepthTints: [0x0f3460, 0x533483, 0xe94560],
  hoverGlow: 0xe94560,
  hoverGlowAlpha: 0.25,
  accent: 0xe94560,
  strokeWidth: 2,
  cornerRadius: 10,
  dimmedAlpha: 0.2,
  breadcrumbBg: '#1a1a2e',
  breadcrumbText: '#7a7a9e',
  breadcrumbAccent: '#e94560',
}

// ── Blueprint "Grid" ─────────────────────────────────────────────────────────
const BLUEPRINT: Theme = {
  name: 'Grid',
  background: 0x001a33,
  nodeFill: 0x004080,
  nodeStroke: 0x0066cc,
  nodeStrokeSelected: 0x00ffcc,
  nodeText: 0xffffff,
  edgeColor: 0x0066cc,
  edgeLabelColor: 0x99ccff,
  subgraphFill: 0x002b55,
  subgraphFillAlpha: 0.3,
  subgraphStroke: 0x0066cc,
  subgraphStrokeAlpha: 0.5,
  subgraphLabel: 0x99ccff,
  gridColor: 0x003366,
  gridAlpha: 0.3,
  gridSize: 20,
  hoverGlow: 0x00ffcc,
  hoverGlowAlpha: 0.2,
  accent: 0x00ffcc,
  strokeWidth: 1.5,
  cornerRadius: 4,
  dimmedAlpha: 0.2,
  breadcrumbBg: '#001a33',
  breadcrumbText: '#99ccff',
  breadcrumbAccent: '#00ffcc',
}

// ── Breath "Void" ────────────────────────────────────────────────────────────
const BREATH: Theme = {
  name: 'Void',
  background: 0x111111,
  nodeFill: 0x1a1a1a,
  nodeStroke: 0x333333,
  nodeStrokeSelected: 0xffffff,
  nodeText: 0xeeeeee,
  edgeColor: 0x666666,
  edgeLabelColor: 0x888888,
  subgraphFill: 0x1a1a1a,
  subgraphFillAlpha: 0.25,
  subgraphStroke: 0x333333,
  subgraphStrokeAlpha: 0.4,
  subgraphLabel: 0x888888,
  hoverGlow: 0xffffff,
  hoverGlowAlpha: 0.15,
  accent: 0xffffff,
  strokeWidth: 2.5,
  cornerRadius: 16,
  dimmedAlpha: 0.2,
  breadcrumbBg: '#111111',
  breadcrumbText: '#888888',
  breadcrumbAccent: '#ffffff',
}

const THEMES: Record<LayoutPhilosophy, Theme> = {
  narrative: NARRATIVE,
  map: MAP,
  blueprint: BLUEPRINT,
  breath: BREATH,
}

export function getTheme(philosophy: LayoutPhilosophy): Theme {
  return THEMES[philosophy]
}
