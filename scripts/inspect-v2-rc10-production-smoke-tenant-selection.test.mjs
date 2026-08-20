import { describe, expect, it } from 'vitest'

import {
  inspectProductionSmokeTenantCandidates,
  maxSmokeTenantCandidates,
  productionSmokeTenantSelectionSql,
  summarizeProductionSmokeTenantCandidates,
} from './inspect-v2-rc10-production-smoke-tenant-selection.mjs'

class FakeClient {
  constructor(rows, failure) {
    this.rows = rows
    this.failure = failure
    this.calls = []
    this.closed = false
  }

  async connect() {
    if (this.failure === 'connect') throw new Error('connection-detail-not-for-output')
  }

  async query(sql) {
    this.calls.push(sql)
    if (this.failure === 'query' && sql === productionSmokeTenantSelectionSql) {
      throw new Error('query-detail-not-for-output')
    }
    if (sql === productionSmokeTenantSelectionSql) return { rows: this.rows }
    return { rows: [] }
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

describe('RC10 production smoke tenant selection inventory', () => {
  it('emits only a deterministically ordered bounded hostname list', () => {
    expect(
      summarizeProductionSmokeTenantCandidates([
        { hostname: 'zeta.next.labofscents.org', candidate_count: 2 },
        { hostname: 'alpha.next.labofscents.org', candidate_count: 2 },
      ]),
    ).toEqual([
      'SMOKE_TENANT_SELECTION_REQUIRED=YES',
      'SMOKE_TENANT_CANDIDATE_COUNT=2',
      'SMOKE_TENANT_CANDIDATE_1=alpha.next.labofscents.org',
      'SMOKE_TENANT_CANDIDATE_2=zeta.next.labofscents.org',
    ])
  })

  it('does not require selection when no active tenant candidate exists', () => {
    expect(summarizeProductionSmokeTenantCandidates([])).toEqual([
      'SMOKE_TENANT_SELECTION_REQUIRED=NO',
      'SMOKE_TENANT_CANDIDATE_COUNT=0',
    ])
  })

  it('fails closed for malformed, duplicate, or over-bound result sets', () => {
    const expected = [
      'SMOKE_TENANT_SELECTION_REQUIRED=NO',
      'SMOKE_TENANT_CANDIDATE_COUNT=UNPROVEN',
    ]

    expect(
      summarizeProductionSmokeTenantCandidates([
        { hostname: 'nested.alpha.next.labofscents.org', candidate_count: 1 },
      ]),
    ).toEqual(expected)
    expect(
      summarizeProductionSmokeTenantCandidates([
        { hostname: 'alpha.next.labofscents.org', candidate_count: 2 },
        { hostname: 'alpha.next.labofscents.org', candidate_count: 2 },
      ]),
    ).toEqual(expected)
    expect(
      summarizeProductionSmokeTenantCandidates(
        Array.from({ length: maxSmokeTenantCandidates + 1 }, (_, index) => ({
          hostname: `tenant-${index}.next.labofscents.org`,
          candidate_count: maxSmokeTenantCandidates + 1,
        })),
      ),
    ).toEqual(expected)
  })

  it('uses a read-only transaction and emits no data other than hostnames', async () => {
    const client = new FakeClient([
      { hostname: 'alpha.next.labofscents.org', candidate_count: 1 },
    ])
    const output = []
    const emittedArguments = []

    const result = await inspectProductionSmokeTenantCandidates({
      environment: { PRODUCTION_DATABASE_URL: 'fixture-database-url' },
      pgModule: pgFor(client),
      emit: (...args) => {
        emittedArguments.push(args)
        output.push(args[0])
      },
    })

    expect(result.pass).toBe(true)
    expect(client.calls).toEqual([
      'BEGIN READ ONLY',
      productionSmokeTenantSelectionSql,
      'COMMIT',
    ])
    expect(productionSmokeTenantSelectionSql).toMatch(/^\s*SELECT/i)
    expect(productionSmokeTenantSelectionSql).toContain('ORDER BY hostname.hostname ASC')
    expect(productionSmokeTenantSelectionSql).toContain('LIMIT 21')
    expect(productionSmokeTenantSelectionSql).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i)
    expect(output.join('\n')).not.toContain('fixture-database-url')
    expect(output.join('\n')).not.toMatch(/(?:email|user_id|organization_id|membership|password)/i)
    expect(emittedArguments).toEqual(output.map((line) => [line]))
    expect(client.closed).toBe(true)
  })

  it('fails closed and rolls back without exposing database errors', async () => {
    const client = new FakeClient([], 'query')
    const output = []

    const result = await inspectProductionSmokeTenantCandidates({
      environment: { PRODUCTION_DATABASE_URL: 'fixture-database-url' },
      pgModule: pgFor(client),
      emit: (line) => output.push(line),
    })

    expect(result.pass).toBe(false)
    expect(output).toEqual([
      'SMOKE_TENANT_SELECTION_REQUIRED=NO',
      'SMOKE_TENANT_CANDIDATE_COUNT=UNPROVEN',
    ])
    expect(client.calls).toEqual([
      'BEGIN READ ONLY',
      productionSmokeTenantSelectionSql,
      'ROLLBACK',
    ])
    expect(output.join('\n')).not.toContain('query-detail-not-for-output')
    expect(client.closed).toBe(true)
  })
})
