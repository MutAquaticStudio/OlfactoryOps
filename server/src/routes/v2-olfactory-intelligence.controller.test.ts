import { describe, expect, it, vi } from 'vitest'
import { V2OlfactoryIntelligenceController } from './v2-olfactory-intelligence.controller.js'

describe('V2 olfactory intelligence route authentication', () => {
  it('blocks an unauthenticated prediction before application or model execution', async () => {
    const intelligence = { predictOdor: vi.fn() }
    const platform = { cookieName: 'v2_session', contextFromToken: vi.fn(), assertCsrf: vi.fn() }
    const controller = new V2OlfactoryIntelligenceController(platform as never, intelligence as never)
    await expect(controller.prediction({ headers: { host: 'tenant.example.test' } } as never, 'material_1', {
      modelVersionId: 'model_version_1', requestedTask: 'odor-descriptor',
    }, 'idempotency-key-0001', 'csrf')).rejects.toMatchObject({ code: 'SESSION_EXPIRED', status: 401 })
    expect(platform.contextFromToken).not.toHaveBeenCalled()
    expect(intelligence.predictOdor).not.toHaveBeenCalled()
  })
})
