import { describe, expect, it } from 'vitest'
import {
  featureCapabilities,
  isWorkspaceFeatureAvailableInPublicCutover,
  productionVisibleDeadRouteCount,
  workspaceFeatureRouteContract,
} from './feature-route-contract.js'

describe('V2 public workspace feature-route contract', () => {
  it('classifies every workspace navigation surface and leaves no public API route dead', () => {
    expect(workspaceFeatureRouteContract.map((feature) => feature.key)).toEqual([
      'workspace', 'materials', 'formulas', 'design-studio', 'trials', 'production', 'commerce', 'agents', 'advanced',
      'suppliers', 'inventory', 'procurement', 'security', 'members', 'domains', 'billing', 'notifications', 'privacy', 'observability',
    ])
    expect(productionVisibleDeadRouteCount()).toBe(0)
  })

  it('makes Worker-excluded Phase 7+ modules unavailable in public builds before they can fetch', () => {
    for (const key of ['trials', 'production', 'commerce', 'advanced']) {
      expect(isWorkspaceFeatureAvailableInPublicCutover(key, true)).toBe(false)
      expect(isWorkspaceFeatureAvailableInPublicCutover(key, false)).toBe(true)
    }
    expect(isWorkspaceFeatureAvailableInPublicCutover('materials', true)).toBe(true)
  })

  it('keeps capability checks explicit instead of treating an authorization denial as a transport failure', () => {
    expect(featureCapabilities('trials')).toEqual(['trials.viewAll', 'trials.viewAssigned'])
    expect(featureCapabilities('members')).toEqual(['members.view'])
    expect(featureCapabilities('unknown')).toEqual([])
  })
})
