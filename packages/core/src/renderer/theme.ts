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

// ── Radial "Orbit" ──────────────────────────────────────────────────────────
const RADIAL: Theme = {
  name: 'Orbit',
  background: 0x0f0f1a,
  nodeFill: 0x1a1a2e,
  nodeStroke: 0x4a3a6a,
  nodeStrokeSelected: 0xb07aff,
  nodeText: 0xe0d8f0,
  edgeColor: 0x6a5a8a,
  edgeLabelColor: 0x9090b0,
  subgraphFill: 0x1a1a2e,
  subgraphFillAlpha: 0.3,
  subgraphStroke: 0x4a3a6a,
  subgraphStrokeAlpha: 0.5,
  subgraphLabel: 0x9090b0,
  hoverGlow: 0xb07aff,
  hoverGlowAlpha: 0.25,
  accent: 0xb07aff,
  strokeWidth: 2,
  cornerRadius: 12,
  dimmedAlpha: 0.2,
  breadcrumbBg: '#0f0f1a',
  breadcrumbText: '#9090b0',
  breadcrumbAccent: '#b07aff',
}

// ── Mosaic "Board" ──────────────────────────────────────────────────────────
const MOSAIC: Theme = {
  name: 'Board',
  background: 0x121212,
  nodeFill: 0x1e1e1e,
  nodeStroke: 0x3a3a3a,
  nodeStrokeSelected: 0xff9f43,
  nodeText: 0xe0e0e0,
  edgeColor: 0x3a3a3a,
  edgeLabelColor: 0x909090,
  subgraphFill: 0x1e1e1e,
  subgraphFillAlpha: 0.25,
  subgraphStroke: 0x3a3a3a,
  subgraphStrokeAlpha: 0.4,
  subgraphLabel: 0x909090,
  hoverGlow: 0xff9f43,
  hoverGlowAlpha: 0.2,
  accent: 0xff9f43,
  strokeWidth: 1.5,
  cornerRadius: 8,
  dimmedAlpha: 0.2,
  breadcrumbBg: '#121212',
  breadcrumbText: '#909090',
  breadcrumbAccent: '#ff9f43',
}

const THEMES: Record<LayoutPhilosophy, Theme> = {
  narrative: NARRATIVE,
  map: MAP,
  blueprint: BLUEPRINT,
  breath: BREATH,
  radial: RADIAL,
  mosaic: MOSAIC,
}

export function getTheme(philosophy: LayoutPhilosophy): Theme {
  return THEMES[philosophy]
}
