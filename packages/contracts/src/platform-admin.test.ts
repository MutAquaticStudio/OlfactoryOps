import { describe, expect, it } from 'vitest'
import {
  platformLimitUpdateSchema,
  platformOperatorRoleUpdateSchema,
} from './platform-admin.js'

const confirmation = 'CONFIRM_PLATFORM_ACTION' as const

describe('platform admin mutation contracts', () => {
  it('accepts a bounded non-negative workspace limit', () => {
    expect(platformLimitUpdateSchema.parse({
      key: 'members', value: 25, reason: 'Increase isolated fixture capacity.', confirmation,
    })).toMatchObject({ key: 'members', value: 25 })
  })

  it('rejects a malformed or unbounded workspace limit', () => {
    expect(() => platformLimitUpdateSchema.parse({
      key: 'Members', value: -1, reason: 'Invalid test.', confirmation,
    })).toThrow()
  })

  it('requires an explicit confirmation for platform role rotation', () => {
    expect(() => platformOperatorRoleUpdateSchema.parse({
      role: 'PLATFORM_ADMIN', reason: 'Rotate isolated operator role.', confirmation: 'APPROVE',
    })).toThrow()
    expect(platformOperatorRoleUpdateSchema.parse({
      role: 'PLATFORM_ADMIN', reason: 'Rotate isolated operator role.', confirmation,
    }).role).toBe('PLATFORM_ADMIN')
  })
})
