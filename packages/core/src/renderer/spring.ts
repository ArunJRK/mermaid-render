/**
 * Damped spring animation.
 * Based on the spring formula: x'' = -k(x - target) - d*x'
 * Where k=stiffness, d=damping
 */
export interface SpringConfig {
  stiffness: number // higher = snappier (default: 170)
  damping: number // higher = less bouncy (default: 26)
}

export const DEFAULT_SPRING: SpringConfig = { stiffness: 170, damping: 26 }

export class Spring {
  private _value: number
  private _target: number
  private _velocity = 0

  constructor(
    initial: number,
    private _config: SpringConfig = DEFAULT_SPRING,
  ) {
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
    this._target = target
  }

  setImmediate(value: number): void {
    this._value = value
    this._target = value
    this._velocity = 0
  }

  /** Advance the spring by dt seconds. Returns new value. */
  tick(dt: number): number {
    // Clamp dt to avoid numerical instability with large steps
    const step = Math.min(dt, 1 / 30)
    const displacement = this._value - this._target
    const springForce = -this._config.stiffness * displacement
    const dampingForce = -this._config.damping * this._velocity
    this._velocity += (springForce + dampingForce) * step
    this._value += this._velocity * step
    return this._value
  }
}
