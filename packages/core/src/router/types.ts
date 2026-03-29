export interface GridCell {
  gx: number  // grid x index
  gy: number  // grid y index
}

export interface WireSegment {
  x1: number; y1: number
  x2: number; y2: number
  isHorizontal: boolean
  edgeId: string
}

export interface RoutedWire {
  edgeId: string
  segments: WireSegment[]
  source: string
  target: string
}

export interface RouteResult {
  wires: RoutedWire[]
  congested: boolean
}

export const GRID_SIZE = 20
export const COMPONENT_CLEARANCE = 8
export const BEND_PENALTY = 2
export const GRID_PADDING = 5  // grid steps of margin around diagram
export const MAX_EXPANSION_ROUNDS = 3
