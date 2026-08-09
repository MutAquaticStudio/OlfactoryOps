import { describe, expect, it } from 'vitest'
import { PlatformError } from '../../platform/src/service.js'
import { boundedToolPayload, formulaAgentToolPolicy } from './tool-registry.js'

describe('Formula agent tool registry', () => {
  it('allows only named read-only tools with bounded output', () => {
    expect(formulaAgentToolPolicy('material.search').destructive).toBe(false)
    expect(boundedToolPayload({ materials: ['one'] }, 100)).toEqual({ materials: ['one'] })
  })

  it('fails closed for arbitrary execution and oversized tool output', () => {
    expect(() => formulaAgentToolPolicy('sql.execute')).toThrow(PlatformError)
    expect(() => boundedToolPayload({ text: 'x'.repeat(100) }, 10)).toThrow(PlatformError)
  })
})
