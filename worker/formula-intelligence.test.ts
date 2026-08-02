import { describe, expect, it } from 'vitest'
import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '../server/src/shared/http-error.js'
import type { Material } from '../src/data/northStar.js'
import { FormulaIntelligenceStore, assertFormulaDesignBriefMaterialConstraints, formulaIntelligenceMaterialCatalog } from './formula-intelligence.js'

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

function designProjectAccessD1(options: { brandIds: string[]; existingRunUserId?: string; briefState?: 'RAW' | 'REVIEW_REQUIRED' | 'REVIEWED' | 'LEGACY_UNSTRUCTURED' }) {
  const project = {
    id: 'project-1', organization_id: 'org-a', brand_id: 'brand-a', created_by_user_id: 'usr-brand',
    status: 'BRIEFED', name: 'Shared brief', brief_json: '{}', current_brief_version_id: options.briefState ? 'brief-1' : null, selected_direction_id: null,
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
              if (sql.includes('FROM formula_design_brief_versions')) return options.briefState ? {
                id: 'brief-1', organization_id: 'org-a', project_id: 'project-1', version_number: 1, state: options.briefState,
                schema_version: 1, raw_brief: 'Marine woody', structured_brief_json: null, unresolved_questions_json: '[]', compiler_mode: 'MANUAL', checksum: 'checksum', created_by_user_id: 'usr-brand', created_at: '2026-07-29T00:00:00.000Z',
              } : null
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

function designProjectLifecycleD1() {
  const statements: RecordedStatement[] = []
  const project = {
    id: 'project-1', organization_id: 'org-a', brand_id: 'brand-a', created_by_user_id: 'usr-perfumer',
    status: 'BRIEFED', name: 'Archiveable brief', brief_json: '{}', current_brief_version_id: null, selected_direction_id: null,
    formula_type_hint: 'ACCORD', archived_at: null, archived_by_user_id: null, archive_previous_status: null as string | null, purge_after: null as string | null,
    created_at: '2026-07-29T00:00:00.000Z', updated_at: '2026-07-29T00:00:00.000Z',
  }
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          statements.push({ sql, values })
          return {
            first: async () => {
              if (sql.includes('FROM formula_design_projects')) return project
              // Keeping the audit event absent makes audit chaining intentionally
              // no-op while this test asserts the lifecycle transaction itself.
              return null
            },
            all: async () => ({ results: [] }),
            run: async () => {
              if (sql.includes('SET status = ?, archived_at = NULL')) project.status = String(values[0])
              return { meta: { changes: 1 } }
            },
          }
        },
      }
    },
    batch: async () => {
      const archive = [...statements].reverse().find((statement) => statement.sql.includes("SET status = 'ARCHIVED'"))
      if (archive) {
        project.status = 'ARCHIVED'
        project.archive_previous_status = String(archive.values[2] ?? 'BRIEFED')
        project.purge_after = String(archive.values[3] ?? '')
      }
      return []
    },
  } as unknown as D1Database
  return { db, statements, project }
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

function constraintSnapshotD1() {
  const statements: RecordedStatement[] = []
  let snapshotReads = 0
  let pinnedHash: string | null = null
  const initial = {
    id: 'snapshot-1', organization_id: 'org-a', project_id: 'project-1', brief_version_id: 'brief-1',
    snapshot_json: JSON.stringify({ schemaVersion: 1 }), constraints_hash: 'constraints-hash', material_universe_hash: null,
    material_universe_state: 'NOT_EVALUATED', created_by_user_id: 'usr-perfumer', created_at: '2026-08-01T00:00:00.000Z',
  }
  const pinned = { ...initial, material_universe_hash: 'pending', material_universe_state: 'PINNED' }
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          statements.push({ sql, values })
          if (sql.includes("SET snapshot_json = ?, material_universe_hash = ?, material_universe_state = 'PINNED'")) {
            pinnedHash = String(values[1])
          }
          return {
            first: async () => {
              if (!sql.includes('FROM formula_design_constraint_snapshots')) return null
              snapshotReads += 1
              if (snapshotReads === 1) return initial
              return { ...pinned, material_universe_hash: pinnedHash ?? pinned.material_universe_hash }
            },
            all: async () => ({ results: [] }),
            run: async () => ({ meta: { changes: 1 } }),
          }
        },
      }
    },
    batch: async () => [],
  } as unknown as D1Database
  return { db, statements, pinned }
}

describe('Formula Intelligence Worker persistence contract', () => {
  it('excludes source-only catalogue rows even when a stale profile appears approved', () => {
    const sourceOnly = { id: 'mat-lluch-2026-0104', name: 'ASTROLIDE PURE', catalogueSource: { status: 'SOURCE_ONLY' } } as unknown as Material
    const reviewed = { id: 'mat-reviewed', name: 'Bergamot FCF' } as unknown as Material
    const service = {
      materials: () => ({ data: [sourceOnly, reviewed] }),
      materialCompliance: () => ({ data: { status: 'APPROVED' } }),
    } as unknown as import('../server/src/services/northstar.service.js').NorthStarService

    expect(formulaIntelligenceMaterialCatalog(service)).toEqual({
      materials: [reviewed],
      researchMaterials: [sourceOnly],
      reviewedOnly: true,
      sourceReferenceCount: 1,
      workspaceMaterialCount: 2,
    })
  })

  it('does not fall back to unreviewed material records for design directions', () => {
    const unreviewed = { id: 'mat-unreviewed', name: 'Pending material' } as unknown as Material
    const service = {
      materials: () => ({ data: [unreviewed] }),
      materialCompliance: () => ({ data: undefined }),
    } as unknown as import('../server/src/services/northstar.service.js').NorthStarService

    expect(formulaIntelligenceMaterialCatalog(service)).toEqual({
      materials: [],
      researchMaterials: [],
      reviewedOnly: true,
      sourceReferenceCount: 0,
      workspaceMaterialCount: 1,
    })
  })

  it('rejects a required material that is not approved in Materials', () => {
    const pending = { id: 'mat-pending', name: 'Pending material' } as unknown as Material
    const service = {
      materials: () => ({ data: [pending] }),
      materialCompliance: () => ({ data: { status: 'REVIEW_REQUIRED' } }),
    } as unknown as import('../server/src/services/northstar.service.js').NorthStarService

    expect(() => assertFormulaDesignBriefMaterialConstraints(service, {
      schemaVersion: 1,
      product: {}, creative: { families: [], descriptors: [], references: [], desiredNotes: [], avoidedNotes: [], specialEffects: [] }, performance: {}, audience: { markets: [] },
      constraints: { workspaceMaterialsOnly: true, reviewedMaterialsOnly: true, targetMarkets: [], inventoryPreference: 'PREFER_AVAILABLE', prohibitedMaterialIds: [], requiredMaterialIds: ['mat-pending'], prohibitedDescriptors: [] },
      unresolvedQuestions: [],
    })).toThrow('Required materials must be reviewed and approved')
  })

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

  it('blocks Worker generation until a new brief has a reviewed version', async () => {
    const store = new FormulaIntelligenceStore(designProjectAccessD1({ brandIds: ['brand-a'], briefState: 'RAW' }))
    const actor = { organizationId: 'org-a', userId: 'usr-perfumer', sessionId: 'ses-1', role: 'PERFUMER' }

    await expect(store.designProjectForGeneration(actor, 'project-1')).rejects.toThrow('FORMULA_INTELLIGENCE_REVIEWED_BRIEF_REQUIRED')
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

  it('archives a creator project transactionally, revokes shares, cancels work, and allows restore', async () => {
    const { db, statements, project } = designProjectLifecycleD1()
    const store = new FormulaIntelligenceStore(db)
    const actor = { organizationId: 'org-a', userId: 'usr-perfumer', sessionId: 'ses-1', role: 'PERFUMER' }

    await expect(store.archiveDesignProject({ ...actor, userId: 'usr-unrelated' }, 'project-1')).rejects.toBeInstanceOf(ForbiddenException)

    const archived = await store.archiveDesignProject(actor, 'project-1')
    expect(archived).toMatchObject({ projectId: 'project-1', status: 'ARCHIVED', duplicate: false })
    expect(project.status).toBe('ARCHIVED')
    expect(statements.some((statement) => statement.sql.includes('UPDATE formula_design_direction_shares'))).toBe(true)
    expect(statements.some((statement) => statement.sql.includes("SET status = 'CANCELLED'"))).toBe(true)
    expect(statements.some((statement) => statement.sql.includes("SET status = 'EXPIRED'"))).toBe(true)

    const restored = await store.restoreDesignProject(actor, 'project-1')
    expect(restored).toMatchObject({ projectId: 'project-1', status: 'BRIEFED' })
    expect(project.status).toBe('BRIEFED')
  })

  it('lets a workspace admin archive another tenant member project without crossing tenants', async () => {
    const { db, project } = designProjectLifecycleD1()
    const store = new FormulaIntelligenceStore(db)
    const admin = { organizationId: 'org-a', userId: 'usr-admin', sessionId: 'ses-admin', role: 'ADMIN' }

    await expect(store.archiveDesignProject(admin, project.id)).resolves.toMatchObject({ status: 'ARCHIVED' })
    expect(project.status).toBe('ARCHIVED')
  })

  it('pins the reviewed material universe before persisting candidate evaluation context', async () => {
    const { db, statements } = constraintSnapshotD1()
    const store = new FormulaIntelligenceStore(db)
    const actor = { organizationId: 'org-a', userId: 'usr-perfumer', sessionId: 'ses-1', role: 'PERFUMER' }
    const snapshot = await store.pinMaterialUniverse(actor, 'run-1', 'snapshot-1', [
      { id: 'mat-b', family: 'Citrus', tier: 'Top', availabilityRank: 10 } as unknown as Material,
      { id: 'mat-a', family: 'Woody', tier: 'Base', availabilityRank: 0 } as unknown as Material,
    ])

    expect(snapshot.material_universe_state).toBe('PINNED')
    expect(snapshot.material_universe_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(statements.some((statement) => statement.sql.includes("material_universe_state = 'NOT_EVALUATED'"))).toBe(true)
    expect(statements.some((statement) => statement.sql.includes('UPDATE formula_design_generation_contexts'))).toBe(true)
    const replayed = await store.pinMaterialUniverse(actor, 'run-retry', 'snapshot-1', [
      { id: 'mat-a', family: 'Woody', tier: 'Base', availabilityRank: 0 } as unknown as Material,
      { id: 'mat-b', family: 'Citrus', tier: 'Top', availabilityRank: 10 } as unknown as Material,
    ])
    expect(replayed.material_universe_hash).toBe(snapshot.material_universe_hash)
  })
})
