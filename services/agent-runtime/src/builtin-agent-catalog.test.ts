import { describe, expect, it } from 'vitest'
import { assertBuiltinCatalogBounds, BUILTIN_AGENT_CATALOG, BUILTIN_AGENT_KEYS, builtinAgentTemplate } from './builtin-agent-catalog.js'

describe('built-in Phase 9 agent catalogue', () => {
  it('ships a deterministic supported agent for each major read-only workspace domain', () => {
    expect(BUILTIN_AGENT_KEYS).toEqual([
      'formula-research', 'material-intelligence', 'inventory-assistant', 'sensory-analysis', 'production-assistant', 'commerce-assistant', 'qa-traceability',
    ])
    expect(assertBuiltinCatalogBounds()).toBe(true)
    for (const key of BUILTIN_AGENT_KEYS) {
      const item = builtinAgentTemplate(key)
      expect(item.workflow.nodes.some((node) => node.kind === 'TOOL')).toBe(true)
      expect(item.policy.allowedToolKeys.every((toolKey) => toolKey !== 'inventory.adjust')).toBe(true)
    }
  })

  it('requires an explicit existing candidate reference before Formula Research can request a draft-save confirmation', () => {
    const confirmation = BUILTIN_AGENT_CATALOG['formula-research'].workflow.nodes.find((node) => node.kind === 'CONFIRMATION')
    expect(confirmation).toMatchObject({ confirmationIntent: 'CANDIDATE_SAVE_DRAFT', conditionKey: 'candidate_reference_present' })
  })
})
