import { describe, expect, it } from 'vitest'
import { NotFoundException, UnprocessableEntityException } from '../server/src/shared/http-error.js'
import { FormulaIntelligenceStore } from './formula-intelligence.js'

type RecordedStatement = { sql: string; values: unknown[] }

function quotaExceededD1() {
  const statements: RecordedStatement[] = []
  const auditEvent = {
    id: 'audit-run-quota', at: '2026-07-29T00:00:00.000Z', actor: 'usr-perfumer',
    action: 'formula-intelligence.run.quota.denied', entity: 'project-1',
    request_id: 'formula-intelligence:audit-run-quota', outcome: 'blocked',
  }
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          statements.push({ sql, values })
          return {
            first: async () => {
              if (sql.includes('SUM(CASE WHEN user_id')) return { user_count: 2, tenant_count: 2 }
              if (sql.includes('FROM tenant_audit_events')) return auditEvent
              if (sql.includes('FROM tenant_audit_chain_heads')) return { last_sequence: 0, last_hash: '' }
              return null
            },
            all: async () => ({ results: [] }),
            run: async () => ({ meta: { changes: 1 } }),
          }
        },
      }
    },
    batch: async () => [{ meta: { changes: 1 } }, { meta: { changes: 1 } }],
  } as unknown as D1Database
  return { db, statements }
}

function designProjectAccessD1(options: { brandIds: string[]; existingRunUserId?: string }) {
  const project = {
    id: 'project-1', organization_id: 'org-a', brand_id: 'brand-a', created_by_user_id: 'usr-brand',
    status: 'BRIEFED', name: 'Shared brief', brief_json: '{}', selected_direction_id: null,
    created_at: '2026-07-29T00:00:00.000Z', updated_at: '2026-07-29T00:00:00.000Z',
  }
  return {
    prepare(sql: string) {
      return {
        bind() {
          return {
            first: async () => {
              if (sql.includes('FROM formula_design_projects')) return project
              if (sql.includes('FROM tenant_memberships')) return { brand_ids_json: JSON.stringify(options.brandIds) }
              if (sql.includes('FROM formula_intelligence_runs')) return options.existingRunUserId ? { created_by_user_id: options.existingRunUserId } : null
              return null
            },
            all: async () => ({ results: [] }),
            run: async () => ({ meta: { changes: 1 } }),
          }
        },
      }
    },
    batch: async () => [],
  } as unknown as D1Database
}

function unresolvedProjectD1(hasDirections: boolean) {
  const statements: RecordedStatement[] = []
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          statements.push({ sql, values })
          return {
            first: async () => sql.includes('FROM formula_design_directions') && hasDirections ? { id: 'direction-1' } : null,
            all: async () => ({ results: [] }),
            run: async () => ({ meta: { changes: 1 } }),
          }
        },
      }
    },
    batch: async () => [],
  } as unknown as D1Database
  return { db, statements }
}

describe('Formula Intelligence Worker persistence contract', () => {
  it('audits a tenant-scoped quota denial before rejecting a new run', async () => {
    const { db, statements } = quotaExceededD1()
    const store = new FormulaIntelligenceStore(db)
    const actor = { organizationId: 'org-a', userId: 'usr-perfumer', sessionId: 'ses-1', role: 'PERFUMER' }

    await expect(store.assertRunStartAllowed(actor, 'project-1')).rejects.toBeInstanceOf(UnprocessableEntityException)
    const auditInsert = statements.find((statement) => statement.sql.includes('INSERT INTO tenant_audit_events'))
    expect(auditInsert?.values).toContain('org-a')
    expect(auditInsert?.values).toContain('formula-intelligence.run.quota.denied')
    expect(auditInsert?.values).toContain('blocked')
  })

  it('does not expose a brand brief to a perfumer outside that brand', async () => {
    const store = new FormulaIntelligenceStore(designProjectAccessD1({ brandIds: ['brand-b'] }))
    const actor = { organizationId: 'org-a', userId: 'usr-perfumer', sessionId: 'ses-1', role: 'PERFUMER' }

    await expect(store.designProjectForGeneration(actor, 'project-1')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('prevents a second perfumer from generating over an existing direction run', async () => {
    const store = new FormulaIntelligenceStore(designProjectAccessD1({ brandIds: ['brand-a'], existingRunUserId: 'usr-other-perfumer' }))
    const actor = { organizationId: 'org-a', userId: 'usr-perfumer', sessionId: 'ses-1', role: 'PERFUMER' }

    await expect(store.designProjectForGeneration(actor, 'project-1')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('returns an unresolved failed design brief to the retryable state', async () => {
    const { db, statements } = unresolvedProjectD1(false)
    const store = new FormulaIntelligenceStore(db)
    const actor = { organizationId: 'org-a', userId: 'usr-perfumer', sessionId: 'ses-1', role: 'PERFUMER' }

    await store.returnUnresolvedProjectToBrief(actor, 'project-1')

    const reset = statements.find((statement) => statement.sql.includes("SET status = 'BRIEFED'"))
    expect(reset?.values).toContain('project-1')
    expect(reset?.values).toContain('org-a')
  })

  it('does not reset a project once directions were persisted', async () => {
    const { db, statements } = unresolvedProjectD1(true)
    const store = new FormulaIntelligenceStore(db)
    const actor = { organizationId: 'org-a', userId: 'usr-perfumer', sessionId: 'ses-1', role: 'PERFUMER' }

    await store.returnUnresolvedProjectToBrief(actor, 'project-1')

    expect(statements.some((statement) => statement.sql.includes("SET status = 'BRIEFED'"))).toBe(false)
  })
})
