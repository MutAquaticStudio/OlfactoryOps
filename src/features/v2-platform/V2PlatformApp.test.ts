import { describe, expect, it } from 'vitest'
import { workspaceErrorMessage, workspaceNavigation } from './V2PlatformApp.js'

describe('V2 scientific creative workspace shell', () => {
  it('keeps the production navigation focused on supported workspace areas', () => {
    expect(workspaceNavigation.map((group) => group.label)).toEqual(['Home', 'R&D', 'Operations', 'Intelligence', 'System'])
    expect(workspaceNavigation.flatMap((group) => group.items.map((item) => item.key))).toEqual([
      'workspace', 'materials', 'formulas', 'design-studio', 'inventory', 'suppliers', 'procurement', 'agents', 'domains', 'members', 'security', 'observability',
    ])
    expect(workspaceNavigation.flatMap((group) => group.items.map((item) => item.key))).not.toContain('trials')
    expect(workspaceNavigation.flatMap((group) => group.items.map((item) => item.key))).not.toContain('advanced')
  })

  it('maps transport errors to product language instead of exposing a raw browser failure', () => {
    const message = workspaceErrorMessage(new Error('TypeError: Failed to fetch'), 'load materials')
    expect(message).toBe('Unable to load materials right now. Check your connection and try again.')
    expect(message).not.toContain('Failed to fetch')
  })

  it('keeps authorization and unavailable-environment guidance bounded', () => {
    expect(workspaceErrorMessage(new Error('Forbidden'), 'save this draft')).toContain('workspace role')
    expect(workspaceErrorMessage(new Error('runtime not configured'), 'open this workspace')).toContain('not available')
  })
})
