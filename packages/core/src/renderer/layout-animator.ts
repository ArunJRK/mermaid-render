import type { PositionedGraph } from '../types'
import type { NodeSprite } from './node-sprite'
import type { SubgraphContainer } from './subgraph-container'
import { Spring, type SpringConfig } from './spring'

const NODE_SPRING: SpringConfig = { stiffness: 170, damping: 22 }
const FADE_SPRING: SpringConfig = { stiffness: 120, damping: 20 }

interface AnimatingNode {
  sprite: NodeSprite
  springX: Spring
  springY: Spring
}

interface FadingSprite {
  sprite: NodeSprite | SubgraphContainer
  spring: Spring
  direction: 'in' | 'out'
}

/**
 * Animates nodes and subgraphs from their current positions to new layout positions.
 * Uses spring physics per-element for organic movement.
 *
 * - Existing nodes: spring-animate x,y from old to new position
 * - New nodes: fade in at target position
 * - Removed nodes: fade out at old position, then call onComplete to remove them
 */
export class LayoutAnimator {
  private _animationId: number | null = null
  private _animatingNodes: AnimatingNode[] = []
  private _fadingSprites: FadingSprite[] = []

  /**
   * Cancel any running layout animation.
   */
  cancel(): void {
    if (this._animationId !== null) {
      cancelAnimationFrame(this._animationId)
      this._animationId = null
    }
    this._animatingNodes = []
    this._fadingSprites = []
  }

  /**
   * Animate nodes from current positions to new layout positions.
   *
   * @param existingSprites Map of node IDs to their current sprites (before clearing).
   * @param newPositioned   The new layout to animate towards.
   * @param addSprite       Callback to create and add a sprite at target position (for new nodes).
   * @param removeSprite    Callback to remove a sprite from the viewport.
   * @param onComplete      Called when all animations finish.
   */
  animateNodes(
    existingSprites: Map<string, NodeSprite>,
    newPositioned: PositionedGraph,
    addSprite: (id: string) => NodeSprite | null,
    removeSprite: (sprite: NodeSprite) => void,
    onComplete: () => void,
  ): void {
    this.cancel()

    const animating: AnimatingNode[] = []
    const fading: FadingSprite[] = []
    const handledIds = new Set<string>()

    // Animate existing nodes that are still in the new layout
    for (const [id, sprite] of existingSprites) {
      const newNode = newPositioned.nodes.get(id)
      if (newNode) {
        // Existing node with new position: spring-animate
        handledIds.add(id)
        const springX = new Spring(sprite.x, NODE_SPRING)
        const springY = new Spring(sprite.y, NODE_SPRING)
        springX.setTarget(newNode.x)
        springY.setTarget(newNode.y)
        animating.push({ sprite, springX, springY })
      } else {
        // Node removed: fade out
        const spring = new Spring(sprite.alpha, FADE_SPRING)
        spring.setTarget(0)
        fading.push({ sprite, spring, direction: 'out' })
      }
    }

    // New nodes that didn't exist before: fade in
    for (const [id] of newPositioned.nodes) {
      if (!handledIds.has(id) && !existingSprites.has(id)) {
        const sprite = addSprite(id)
        if (sprite) {
          sprite.alpha = 0
          const spring = new Spring(0, FADE_SPRING)
          spring.setTarget(1)
          fading.push({ sprite, spring, direction: 'in' })
        }
      }
    }

    this._animatingNodes = animating
    this._fadingSprites = fading

    if (animating.length === 0 && fading.length === 0) {
      onComplete()
      return
    }

    let lastTime = performance.now()

    const tick = () => {
      const now = performance.now()
      const dt = (now - lastTime) / 1000 // seconds
      lastTime = now

      let allSettled = true

      // Advance position springs
      for (const entry of this._animatingNodes) {
        entry.springX.tick(dt)
        entry.springY.tick(dt)
        entry.sprite.x = entry.springX.value
        entry.sprite.y = entry.springY.value
        if (!entry.springX.isSettled || !entry.springY.isSettled) {
          allSettled = false
        }
      }

      // Advance fade springs
      for (const entry of this._fadingSprites) {
        entry.spring.tick(dt)
        entry.sprite.alpha = Math.max(0, Math.min(1, entry.spring.value))
        if (!entry.spring.isSettled) {
          allSettled = false
        }
      }

      if (allSettled) {
        // Snap to final positions
        for (const entry of this._animatingNodes) {
          entry.sprite.x = entry.springX.target
          entry.sprite.y = entry.springY.target
        }
        // Remove faded-out sprites
        for (const entry of this._fadingSprites) {
          if (entry.direction === 'out') {
            removeSprite(entry.sprite as NodeSprite)
          } else {
            entry.sprite.alpha = 1
          }
        }
        this._animationId = null
        this._animatingNodes = []
        this._fadingSprites = []
        onComplete()
      } else {
        this._animationId = requestAnimationFrame(tick)
      }
    }

    this._animationId = requestAnimationFrame(tick)
  }
}
