import { describe, it, expect } from 'vitest'
import { Spring } from '../spring'

/** Simulate the spring for a given number of seconds at 60 fps. */
function simulate(spring: Spring, seconds: number): number[] {
  const dt = 1 / 60
  const steps = Math.round(seconds / dt)
  const values: number[] = []
  for (let i = 0; i < steps; i++) {
    spring.tick(dt)
    values.push(spring.value)
  }
  return values
}

describe('Spring', () => {
  it('settles at the target value', () => {
    const spring = new Spring(0, { stiffness: 170, damping: 26 })
    spring.setTarget(100)
    simulate(spring, 2)
    expect(spring.value).toBeCloseTo(100, 1)
    expect(spring.isSettled).toBe(true)
  })

  it('starts at the initial value', () => {
    const spring = new Spring(42)
    expect(spring.value).toBe(42)
    expect(spring.target).toBe(42)
    expect(spring.isSettled).toBe(true)
  })

  it('with high damping does not overshoot much', () => {
    const spring = new Spring(0, { stiffness: 170, damping: 50 })
    spring.setTarget(100)
    const values = simulate(spring, 2)

    // With high damping, values should not exceed target by more than 2%
    const maxOvershoot = Math.max(...values) - 100
    expect(maxOvershoot).toBeLessThan(2)
  })

  it('with low damping oscillates past the target', () => {
    const spring = new Spring(0, { stiffness: 170, damping: 5 })
    spring.setTarget(100)
    const values = simulate(spring, 2)

    // With low damping, the value should overshoot past 100
    const maxValue = Math.max(...values)
    expect(maxValue).toBeGreaterThan(110)
  })

  it('isSettled returns true when settled', () => {
    const spring = new Spring(50)
    expect(spring.isSettled).toBe(true)

    spring.setTarget(60)
    expect(spring.isSettled).toBe(false)

    simulate(spring, 3)
    expect(spring.isSettled).toBe(true)
  })

  it('setImmediate jumps to value with no velocity', () => {
    const spring = new Spring(0)
    spring.setTarget(100)
    simulate(spring, 0.1) // build up some velocity

    spring.setImmediate(200)
    expect(spring.value).toBe(200)
    expect(spring.target).toBe(200)
    expect(spring.velocity).toBe(0)
    expect(spring.isSettled).toBe(true)
  })

  it('new target interrupts current animation', () => {
    const spring = new Spring(0, { stiffness: 170, damping: 26 })
    spring.setTarget(100)
    simulate(spring, 0.3)

    // Mid-flight, change target
    const midValue = spring.value
    expect(midValue).toBeGreaterThan(0)
    expect(midValue).toBeLessThan(100)

    spring.setTarget(0)
    simulate(spring, 3)
    expect(spring.value).toBeCloseTo(0, 1)
    expect(spring.isSettled).toBe(true)
  })

  it('converges with different stiffness values', () => {
    const soft = new Spring(0, { stiffness: 50, damping: 10 })
    const stiff = new Spring(0, { stiffness: 300, damping: 26 })
    soft.setTarget(100)
    stiff.setTarget(100)

    // After 0.3s, the stiffer spring should be closer to target
    simulate(soft, 0.3)
    simulate(stiff, 0.3)
    expect(Math.abs(stiff.value - 100)).toBeLessThan(Math.abs(soft.value - 100))
  })
})
