import { describe, expect, it } from 'vitest'
import { motionDisabledForPreferences } from './motionPolicy'

describe('motion policy', () => {
  it('disables optional motion for an operating-system preference', () => {
    expect(motionDisabledForPreferences(true, false)).toBe(true)
  })

  it('disables optional motion for the workspace preference', () => {
    expect(motionDisabledForPreferences(false, true)).toBe(true)
  })

  it('allows restrained motion only when both preferences allow it', () => {
    expect(motionDisabledForPreferences(false, false)).toBe(false)
  })
})
