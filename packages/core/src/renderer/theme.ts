import type { LayoutPhilosophy } from '../types'

export interface Theme {
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
  hoverGlow: number
  hoverGlowAlpha: number
  strokeWidth: number
  cornerRadius: number
}

const NARRATIVE: Theme = {
  background: 0x0f172a,
  nodeFill: 0x1e293b,
  nodeStroke: 0x38bdf8,
  nodeStrokeSelected: 0xfbbf24,
  nodeText: 0xf0f9ff,
  edgeColor: 0x7dd3fc,
  edgeLabelColor: 0xbae6fd,
  subgraphFill: 0x0c4a6e,
  subgraphFillAlpha: 0.25,
  subgraphStroke: 0x38bdf8,
  subgraphStrokeAlpha: 0.5,
  subgraphLabel: 0x7dd3fc,
  hoverGlow: 0x38bdf8,
  hoverGlowAlpha: 0.3,
  strokeWidth: 2,
  cornerRadius: 8,
}

const MAP: Theme = {
  background: 0x0f172a,
  nodeFill: 0x1a2332,
  nodeStroke: 0x34d399,
  nodeStrokeSelected: 0xfbbf24,
  nodeText: 0xecfdf5,
  edgeColor: 0x6ee7b7,
  edgeLabelColor: 0xa7f3d0,
  subgraphFill: 0x064e3b,
  subgraphFillAlpha: 0.3,
  subgraphStroke: 0x34d399,
  subgraphStrokeAlpha: 0.6,
  subgraphLabel: 0x6ee7b7,
  hoverGlow: 0x34d399,
  hoverGlowAlpha: 0.3,
  strokeWidth: 2,
  cornerRadius: 10,
}

const BLUEPRINT: Theme = {
  background: 0x0a0f1a,
  nodeFill: 0x1e2433,
  nodeStroke: 0x818cf8,
  nodeStrokeSelected: 0xfbbf24,
  nodeText: 0xe0e7ff,
  edgeColor: 0xa5b4fc,
  edgeLabelColor: 0xc7d2fe,
  subgraphFill: 0x312e81,
  subgraphFillAlpha: 0.2,
  subgraphStroke: 0x818cf8,
  subgraphStrokeAlpha: 0.5,
  subgraphLabel: 0xa5b4fc,
  hoverGlow: 0x818cf8,
  hoverGlowAlpha: 0.25,
  strokeWidth: 1.5,
  cornerRadius: 4,
}

const BREATH: Theme = {
  background: 0x0c0a09,
  nodeFill: 0x1c1917,
  nodeStroke: 0xfb923c,
  nodeStrokeSelected: 0xfbbf24,
  nodeText: 0xfff7ed,
  edgeColor: 0xfdba74,
  edgeLabelColor: 0xfed7aa,
  subgraphFill: 0x7c2d12,
  subgraphFillAlpha: 0.2,
  subgraphStroke: 0xfb923c,
  subgraphStrokeAlpha: 0.4,
  subgraphLabel: 0xfdba74,
  hoverGlow: 0xfb923c,
  hoverGlowAlpha: 0.35,
  strokeWidth: 2.5,
  cornerRadius: 16,
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
