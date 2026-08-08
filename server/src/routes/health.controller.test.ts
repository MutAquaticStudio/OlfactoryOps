import { describe, expect, it } from 'vitest'
import { HealthController } from './health.controller.js'

describe('HealthController release metadata', () => {
  it('uses the shared release identity for local health and version routes', () => {
    const controller = new HealthController()
    expect(controller.health().release.applicationVersion).toBe('0.1.0-rc.1')
    expect(controller.version().release.migrationHead).toBe('0044')
  })
})
