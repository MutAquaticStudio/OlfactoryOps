import { describe, expect, it } from 'vitest'
import { V2_PERMISSION_GROUPS, V2_PERMISSION_KEYS, V2_PERMISSION_REGISTRY, V2_PERMISSION_REGISTRY_VERSION, isRegisteredPermission, permissionsForGroup } from './registry'

describe('V2 permission registry', () => {
  it('has unique capability keys across every required group', () => {
    expect(new Set(V2_PERMISSION_KEYS).size).toBe(V2_PERMISSION_KEYS.length)
    expect(V2_PERMISSION_GROUPS).toHaveLength(21)
    for (const group of V2_PERMISSION_GROUPS) expect(permissionsForGroup(group).length).toBeGreaterThan(0)
  })

  it('does not reintroduce removed legacy module permissions', () => {
    expect(V2_PERMISSION_KEYS.some((key) => key.includes('lluch') || key.includes('formula-agent') || key.includes('optimizer'))).toBe(false)
    expect(isRegisteredPermission('formula.approve')).toBe(true)
    expect(isRegisteredPermission('legacy.optimizer.run')).toBe(false)
    expect(V2_PERMISSION_REGISTRY_VERSION).toBe('2.2.0')
    expect(isRegisteredPermission('trials.viewAll')).toBe(true)
    expect(isRegisteredPermission('trials.viewAssigned')).toBe(true)
    expect(V2_PERMISSION_REGISTRY.every((permission) => permission.description.length > 0)).toBe(true)
  })
})
