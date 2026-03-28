/**
 * Global wire lane registry for Blueprint routing.
 * Tracks which grid positions are occupied by wires so no two
 * wires share the same lane. Like a PCB auto-router grid.
 */
export class WireRegistry {
  /** Occupied vertical lanes: key = X grid position, value = set of Y ranges [minY, maxY] */
  private _verticalLanes = new Map<number, Array<[number, number]>>()

  /** Occupied horizontal channels: key = Y grid position, value = set of X ranges [minX, maxX] */
  private _horizontalChannels = new Map<number, Array<[number, number]>>()

  private _gridSize: number

  constructor(gridSize: number = 20) {
    this._gridSize = gridSize
  }

  /** Snap to grid */
  private _snap(v: number): number {
    return Math.round(v / this._gridSize) * this._gridSize
  }

  /** Check if a vertical lane at X from y1→y2 is free */
  isVerticalFree(x: number, y1: number, y2: number): boolean {
    const sx = this._snap(x)
    const ranges = this._verticalLanes.get(sx)
    if (!ranges) return true
    const minY = Math.min(y1, y2)
    const maxY = Math.max(y1, y2)
    return !ranges.some(([rMin, rMax]) => maxY > rMin && minY < rMax)
  }

  /** Check if a horizontal channel at Y from x1→x2 is free */
  isHorizontalFree(y: number, x1: number, x2: number): boolean {
    const sy = this._snap(y)
    const ranges = this._horizontalChannels.get(sy)
    if (!ranges) return true
    const minX = Math.min(x1, x2)
    const maxX = Math.max(x1, x2)
    return !ranges.some(([rMin, rMax]) => maxX > rMin && minX < rMax)
  }

  /** Claim a vertical lane */
  claimVertical(x: number, y1: number, y2: number): void {
    const sx = this._snap(x)
    if (!this._verticalLanes.has(sx)) this._verticalLanes.set(sx, [])
    this._verticalLanes.get(sx)!.push([Math.min(y1, y2), Math.max(y1, y2)])
  }

  /** Claim a horizontal channel */
  claimHorizontal(y: number, x1: number, x2: number): void {
    const sy = this._snap(y)
    if (!this._horizontalChannels.has(sy)) this._horizontalChannels.set(sy, [])
    this._horizontalChannels.get(sy)!.push([Math.min(x1, x2), Math.max(x1, x2)])
  }

  /** Find nearest free vertical lane near targetX for y range */
  findFreeVertical(targetX: number, y1: number, y2: number, maxSearch: number = 15): number {
    const sx = this._snap(targetX)
    if (this.isVerticalFree(sx, y1, y2)) return sx
    for (let i = 1; i <= maxSearch; i++) {
      const left = sx - i * this._gridSize
      if (this.isVerticalFree(left, y1, y2)) return left
      const right = sx + i * this._gridSize
      if (this.isVerticalFree(right, y1, y2)) return right
    }
    return sx // give up
  }

  /** Find nearest free horizontal channel near targetY for x range */
  findFreeHorizontal(targetY: number, x1: number, x2: number, maxSearch: number = 15): number {
    const sy = this._snap(targetY)
    if (this.isHorizontalFree(sy, x1, x2)) return sy
    for (let i = 1; i <= maxSearch; i++) {
      const up = sy - i * this._gridSize
      if (this.isHorizontalFree(up, x1, x2)) return up
      const down = sy + i * this._gridSize
      if (this.isHorizontalFree(down, x1, x2)) return down
    }
    return sy // give up
  }

  /** Also check against node bounding boxes — a lane through a node is blocked */
  registerNodeObstacles(nodes: Map<string, { x: number; y: number; width: number; height: number }>, excludeIds?: Set<string>): void {
    for (const [id, node] of nodes) {
      if (excludeIds?.has(id)) continue
      // Block all vertical lanes that pass through this node
      const hw = node.width / 2 + 8
      const hh = node.height / 2 + 8
      const minX = this._snap(node.x - hw)
      const maxX = this._snap(node.x + hw)
      for (let x = minX; x <= maxX; x += this._gridSize) {
        this.claimVertical(x, node.y - hh, node.y + hh)
      }
      // Block horizontal channels through this node
      const minY = this._snap(node.y - hh)
      const maxY = this._snap(node.y + hh)
      for (let y = minY; y <= maxY; y += this._gridSize) {
        this.claimHorizontal(y, node.x - hw, node.x + hw)
      }
    }
  }

  clear(): void {
    this._verticalLanes.clear()
    this._horizontalChannels.clear()
  }
}
