/**
 * Damped spring animation.
 * Based on the spring formula: x'' = -k(x - target) - d*x'
 * Where k=stiffness, d=damping
 */
export interface SpringConfig {
  stiffness: number // higher = snappier (default: 170)
  damping: number // higher = less bouncy (default: 26)
  maxDuration?: number // seconds before we snap to target (default: 4)
}

export const DEFAULT_SPRING: SpringConfig = { stiffness: 170, damping: 26, maxDuration: 4 }
const MAX_REASONABLE_MAGNITUDE = 1_000_000_000

export class Spring {
  private _value: number
  private _target: number
  private _velocity = 0
  private _elapsed = 0

  constructor(
    initial: number,
    private _config: SpringConfig = DEFAULT_SPRING,
  ) {
    this._assertFinite(initial, 'initial')
    this._value = initial
    this._target = initial
  }

  get value(): number {
    return this._value
  }

  get target(): number {
    return this._target
  }

  get velocity(): number {
    return this._velocity
  }

  get isSettled(): boolean {
    return Math.abs(this._value - this._target) < 0.01 && Math.abs(this._velocity) < 0.01
  }

  setTarget(target: number): void {
    this._assertFinite(target, 'target')
    this._target = target
    this._elapsed = 0
  }

  setImmediate(value: number): void {
    this._assertFinite(value, 'value')
    this._value = value
    this._target = value
    this._velocity = 0
    this._elapsed = 0
  }

  /** Advance the spring by dt seconds. Returns new value. */
  tick(dt: number): number {
    if (this.isSettled) {
      this._value = this._target
      this._velocity = 0
      return this._value
    }

    if (!Number.isFinite(dt) || dt <= 0) {
      return this._value
    }

    // Clamp dt to avoid numerical instability with large steps
    const step = Math.min(dt, 1 / 30)
    this._elapsed += step

    const maxDuration = this._config.maxDuration ?? DEFAULT_SPRING.maxDuration!
    if (this._elapsed >= maxDuration) {
      this.setImmediate(this._target)
      return this._value
    }

    const displacement = this._value - this._target
    const springForce = -this._config.stiffness * displacement
    const dampingForce = -this._config.damping * this._velocity
    const nextVelocity = this._velocity + (springForce + dampingForce) * step
    const nextValue = this._value + nextVelocity * step

    if (!this._isReasonableState(nextVelocity) || !this._isReasonableState(nextValue)) {
      this.setImmediate(this._target)
      return this._value
    }

    this._velocity = nextVelocity
    this._value = nextValue

    if (this.isSettled) {
      this.setImmediate(this._target)
    }

    return this._value
  }

  private _assertFinite(value: number, label: string): void {
    if (!Number.isFinite(value)) {
      throw new Error(`Spring ${label} must be finite`)
    }
  }

  private _isReasonableState(value: number): boolean {
    return Number.isFinite(value) && Math.abs(value) <= MAX_REASONABLE_MAGNITUDE
  }
}
