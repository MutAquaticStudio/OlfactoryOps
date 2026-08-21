import { describe, expect, it } from 'vitest'
import { isLocalWorkspaceOrigin, localWorkspaceUrl, workspaceSlugFromLocalOrigin } from './local-workspace-hosts.js'

describe('local workspace hostname mapper', () => {
  it('accepts only an eligible single-label localhost workspace host', () => {
    expect(workspaceSlugFromLocalOrigin('http://atelier.localhost:5173')).toBe('atelier')
    expect(workspaceSlugFromLocalOrigin('http://api.localhost:5173')).toBeUndefined()
    expect(workspaceSlugFromLocalOrigin('https://atelier.localhost:5173')).toBeUndefined()
    expect(isLocalWorkspaceOrigin('http://atelier.team.localhost:5173')).toBe(false)
  })

  it('keeps the Vite port when resolving the local canonical workspace address', () => {
    expect(localWorkspaceUrl('atelier', 'http://localhost:5173')).toBe('http://atelier.localhost:5173')
  })
})
