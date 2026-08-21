import { describe, expect, it } from 'vitest'

import { publicAcceptanceFailurePhase } from './v2-production-public-acceptance-classification.mjs'

describe('production public acceptance failure classification', () => {
  it('emits only the bounded acceptance phase', () => {
    expect(publicAcceptanceFailurePhase('MATERIALS')).toBe('MATERIALS')
    expect(publicAcceptanceFailurePhase('TENANT_ISOLATION')).toBe('TENANT_ISOLATION')
  })

  it('does not surface unknown failure detail', () => {
    expect(publicAcceptanceFailurePhase('password=must-not-appear')).toBe('UNCLASSIFIED')
    expect(publicAcceptanceFailurePhase(undefined)).toBe('UNCLASSIFIED')
  })
})
