import { describe, expect, it } from 'vitest'

import {
  inspectProductionSmokeIdentityAvailability,
  productionSmokeIdentityInventorySql,
  summarizeProductionSmokeIdentityAvailability,
} from './inspect-v2-rc10-production-smoke-identity.mjs'

class FakeClient {
  constructor(row, failure) {
    this.row = row
    this.failure = failure
    this.calls = []
    this.closed = false
  }

  async connect() {
    if (this.failure === 'connect') throw new Error('connection-detail-not-for-output')
  }

  async query(sql) {
    this.calls.push(sql)
    if (this.failure === 'query') throw new Error('query-detail-not-for-output')
    return { rows: [this.row] }
  }

  async end() {
    this.closed = true
  }
}

function pgFor(client) {
  return {
    Client: class {
      constructor() {
        return client
      }
    },
  }
}

describe('RC10 production smoke identity inventory', () => {
  it('reports a safe existing non-Platform-Owner identity and its single-label tenant hostname only', () => {
    const report = summarizeProductionSmokeIdentityAvailability({
      smoke_tenant_available: true,
      smoke_login_identity_available: true,
      active_platform_owner_available: true,
      smoke_tenant_hostname: 'smoke-fixture.next.labofscents.org',
    })

    expect(report).toEqual([
      'EXISTING_SMOKE_TENANT_AVAILABLE=YES',
      'EXISTING_SMOKE_LOGIN_IDENTITY_AVAILABLE=YES',
      'PLATFORM_OWNER_CREDENTIAL_REUSE_REQUIRED=NO',
      'EXISTING_SMOKE_TENANT_HOSTNAME=smoke-fixture.next.labofscents.org',
    ])
  })

  it('requires provisioning instead of treating the Platform Owner as a smoke identity', () => {
    const report = summarizeProductionSmokeIdentityAvailability({
      smoke_tenant_available: true,
      smoke_login_identity_available: false,
      active_platform_owner_available: true,
      smoke_tenant_hostname: null,
    })

    expect(report).toEqual([
      'EXISTING_SMOKE_TENANT_AVAILABLE=YES',
      'EXISTING_SMOKE_LOGIN_IDENTITY_AVAILABLE=NO',
      'PLATFORM_OWNER_CREDENTIAL_REUSE_REQUIRED=YES',
    ])
  })

  it('suppresses a hostname unless it has the exact single-label tenant shape and a qualifying identity', () => {
    expect(
      summarizeProductionSmokeIdentityAvailability({
        smoke_tenant_available: true,
        smoke_login_identity_available: true,
        active_platform_owner_available: false,
        smoke_tenant_hostname: 'nested.smoke.next.labofscents.org',
      }),
    ).toEqual([
      'EXISTING_SMOKE_TENANT_AVAILABLE=YES',
      'EXISTING_SMOKE_LOGIN_IDENTITY_AVAILABLE=NO',
      'PLATFORM_OWNER_CREDENTIAL_REUSE_REQUIRED=NO',
    ])
  })

  it('executes one read-only aggregate query and emits no identity data', async () => {
    const client = new FakeClient({
      smoke_tenant_available: true,
      smoke_login_identity_available: true,
      active_platform_owner_available: true,
      smoke_tenant_hostname: 'smoke-fixture.next.labofscents.org',
    })
    const output = []

    const result = await inspectProductionSmokeIdentityAvailability({
      environment: { PRODUCTION_DATABASE_URL: 'fixture-database-url' },
      pgModule: pgFor(client),
      emit: (line) => output.push(line),
    })

    expect(result.pass).toBe(true)
    expect(client.calls).toEqual([productionSmokeIdentityInventorySql])
    expect(productionSmokeIdentityInventorySql).toMatch(/^\s*WITH/i)
    expect(productionSmokeIdentityInventorySql).toContain('v2_platform_operators')
    expect(productionSmokeIdentityInventorySql).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i)
    expect(output.join('\n')).not.toContain('fixture-database-url')
    expect(output.join('\n')).not.toContain('user_record.id')
    expect(client.closed).toBe(true)
  })

  it('fails closed without exposing database errors', async () => {
    const client = new FakeClient({}, 'query')
    const output = []

    const result = await inspectProductionSmokeIdentityAvailability({
      environment: { PRODUCTION_DATABASE_URL: 'fixture-database-url' },
      pgModule: pgFor(client),
      emit: (line) => output.push(line),
    })

    expect(result.pass).toBe(false)
    expect(output).toEqual([
      'EXISTING_SMOKE_TENANT_AVAILABLE=NO',
      'EXISTING_SMOKE_LOGIN_IDENTITY_AVAILABLE=NO',
      'PLATFORM_OWNER_CREDENTIAL_REUSE_REQUIRED=NO',
    ])
    expect(output.join('\n')).not.toContain('query-detail-not-for-output')
    expect(client.closed).toBe(true)
  })
})
