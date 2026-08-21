import { describe, expect, it, vi } from 'vitest'

import {
  isProductionSmokeTenantHostname,
  verifyProductionSmokeTenantReadiness,
} from './verify-v2-production-smoke-tenant-readiness.mjs'

const environment = {
  PRODUCTION_DATABASE_URL: 'fixture-database-url',
  PRODUCTION_SMOKE_TENANT_HOSTNAME: 'smoke-fixture.labofscents.org',
  PRODUCTION_SMOKE_LOGIN_EMAIL: 'smoke-fixture@example.test',
  PRODUCTION_SMOKE_LOGIN_PASSWORD: 'fixture-password',
}

describe('production smoke tenant readiness', () => {
  it('requires the same single-label hostname shape accepted by the tenant router', () => {
    expect(isProductionSmokeTenantHostname('smoke-fixture.labofscents.org')).toBe(true)
    expect(isProductionSmokeTenantHostname('api.labofscents.org')).toBe(false)
    expect(isProductionSmokeTenantHostname('next.labofscents.org')).toBe(false)
    expect(isProductionSmokeTenantHostname('labofscents.org')).toBe(false)
    expect(isProductionSmokeTenantHostname('nested.smoke.labofscents.org')).toBe(false)
    expect(isProductionSmokeTenantHostname('SMOKE.labofscents.org')).toBe(false)
  })

  it('proves one active hostname, organization, verified Viewer, and no Platform Operator without emitting identity data', async () => {
    const output = []
    const client = {
      connect: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [{ active: true }] }),
    }

    const result = await verifyProductionSmokeTenantReadiness({
      environment,
      clientFactory: vi.fn().mockReturnValue(client),
      emit: (line) => output.push(line),
    })

    expect(result).toEqual({ pass: true })
    const [query] = client.query.mock.calls[0]
    expect(query).toContain('public.v2_users')
    expect(query).toContain('public.v2_memberships')
    expect(query).toContain("membership.role_key = 'Viewer'")
    expect(query).toContain('public.v2_platform_operators')
    expect(query).toMatch(/^SELECT EXISTS/)
    expect(query).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/)
    expect(output).toEqual([
      'PRODUCTION_SMOKE_TENANT_HOSTNAME_READY=PASS',
      'PRODUCTION_SMOKE_LOGIN_IDENTITY_READY=PASS',
    ])
    expect(JSON.stringify(output)).not.toContain(environment.PRODUCTION_SMOKE_LOGIN_EMAIL)
    expect(JSON.stringify(output)).not.toContain(environment.PRODUCTION_SMOKE_LOGIN_PASSWORD)
    expect(client.end).toHaveBeenCalledOnce()
  })

  it('fails closed before database access for a base domain or missing login configuration', async () => {
    const output = []
    const clientFactory = vi.fn()

    const result = await verifyProductionSmokeTenantReadiness({
      environment: {
        ...environment,
        PRODUCTION_SMOKE_TENANT_HOSTNAME: 'api.labofscents.org',
        PRODUCTION_SMOKE_LOGIN_PASSWORD: '',
      },
      clientFactory,
      emit: (line) => output.push(line),
    })

    expect(result).toEqual({ pass: false })
    expect(clientFactory).not.toHaveBeenCalled()
    expect(output).toEqual([
      'PRODUCTION_SMOKE_TENANT_HOSTNAME_READY=UNPROVEN',
      'PRODUCTION_SMOKE_LOGIN_IDENTITY_READY=UNPROVEN',
    ])
  })

  it('fails closed and closes the database client when the active tuple is absent', async () => {
    const output = []
    const client = {
      connect: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [{ active: false }] }),
    }

    const result = await verifyProductionSmokeTenantReadiness({
      environment,
      clientFactory: () => client,
      emit: (line) => output.push(line),
    })

    expect(result).toEqual({ pass: false })
    expect(client.end).toHaveBeenCalledOnce()
    expect(JSON.stringify(output)).not.toContain('TENANT_OR_IDENTITY_NOT_ACTIVE')
  })
})
