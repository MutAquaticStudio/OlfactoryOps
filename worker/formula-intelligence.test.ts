import { describe, expect, it } from 'vitest'
import { UnprocessableEntityException } from '../server/src/shared/http-error.js'
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
})
