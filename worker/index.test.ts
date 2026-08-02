import { describe, expect, it, vi } from 'vitest'
import {
  formulaVersions,
  formulas,
  materials,
  type Formula,
  type FormulaVersionRecord,
  type Material,
} from '../src/data/northStar'
import {
  auditChainHash,
  canonicalAuditChainPayload,
  canonicalOperationPayload,
  buildCorsHeaders,
  createSessionCredential,
  hashSessionCredential,
  isOpaqueSessionCredential,
  normalizeFormulaPersistenceRecord,
  normalizeFormulaVersionPersistenceRecord,
  normalizeMaterialPersistenceRecord,
  operationRequestHash,
  requiresIdempotency,
  resolveSeededAdminCredentialState,
  resolveActiveSessionCredential,
  isSingleRecoveryCodeConsumption,
} from './index'

describe('Worker mutation protocol', () => {
  it('requires idempotency for protected mutations and excludes public callbacks', () => {
    expect(requiresIdempotency({ mutates: true })).toBe(true)
    expect(requiresIdempotency({ mutates: true, public: true })).toBe(false)
    expect(requiresIdempotency({ mutates: true, idempotent: false })).toBe(false)
    expect(requiresIdempotency({ mutates: false, idempotent: true })).toBe(true)
  })

  it('canonicalizes JSON payloads before hashing an operation', async () => {
    const first = { filter: { status: 'DRAFT', tags: ['citrus', 'marine'] }, name: 'Citrus Lift' }
    const reordered = { name: 'Citrus Lift', filter: { tags: ['citrus', 'marine'], status: 'DRAFT' } }

    expect(canonicalOperationPayload(first)).toEqual(canonicalOperationPayload(reordered))
    await expect(operationRequestHash('PATCH', '/formulas/F-001', first)).resolves.toBe(
      await operationRequestHash('PATCH', '/formulas/F-001', reordered),
    )
    await expect(operationRequestHash('PATCH', '/formulas/F-001', first)).resolves.not.toBe(
      await operationRequestHash('PATCH', '/formulas/F-001', { ...first, name: 'Different formula' }),
    )
  })
})

describe('Material D1 scope normalization', () => {
  it('keeps curated records global and strips legacy tenant metadata', () => {
    const normalized = normalizeMaterialPersistenceRecord(
      { ...materials[0]!, organizationId: 'legacy-org' },
      'GLOBAL',
      null,
    )

    expect(normalized.libraryScope).toBe('GLOBAL')
    expect(normalized.organizationId).toBeUndefined()
  })

  it('requires and preserves organization ownership for tenant records', () => {
    const privateMaterial = {
      ...materials[0]!,
      id: 'mat-private-a',
      libraryScope: 'TENANT' as const,
      organizationId: 'org-a',
    }

    expect(normalizeMaterialPersistenceRecord(privateMaterial)).toMatchObject({
      id: 'mat-private-a',
      libraryScope: 'TENANT',
      organizationId: 'org-a',
    })
    expect(() => normalizeMaterialPersistenceRecord({
      ...privateMaterial,
      organizationId: undefined,
    } as Material)).toThrow('missing organization metadata')
  })
})

describe('Formula D1 persistence normalization', () => {
  it('backfills tenant and workflow metadata on legacy Formula snapshots', () => {
    const legacyFormula = {
      ...formulas[0],
      organizationId: undefined,
      brandId: undefined,
      workflowStatus: undefined,
      draftRevision: undefined,
      updatedAt: undefined,
      approvalHistory: undefined,
    } as unknown as Formula

    const normalized = normalizeFormulaPersistenceRecord(
      legacyFormula,
      '2026-07-18T12:00:00.000Z',
    )

    expect(normalized.organizationId).toBe('org-nxl')
    expect(normalized.brandId).toBe('brand-nxl')
    expect(normalized.workflowStatus).toBe('APPROVED')
    expect(normalized.draftRevision).toBe(1)
    expect(normalized.updatedAt).toBe('2026-07-18T12:00:00.000Z')
    expect(normalized.approvalHistory).toEqual([])
  })

  it('backfills organization metadata on legacy immutable versions', () => {
    const legacyVersion = {
      ...formulaVersions[0],
      organizationId: undefined,
      evaluations: undefined,
      resolvedLeaves: undefined,
      evaporation: undefined,
    } as unknown as FormulaVersionRecord

    const normalized = normalizeFormulaVersionPersistenceRecord(
      legacyVersion,
      '2026-07-18T12:00:00.000Z',
    )

    expect(normalized.organizationId).toBe('org-nxl')
    expect(normalized.checksum).toBe(formulaVersions[0]?.checksum)
    expect(normalized.evaluations).toEqual([])
    expect(normalized.resolvedLeaves).toEqual([])
    expect(normalized.evaporation).toEqual([])
  })

  it('fails closed when Formula identity metadata is missing', () => {
    const invalid = { ...formulas[0], id: undefined } as unknown as Formula
    expect(() => normalizeFormulaPersistenceRecord(invalid)).toThrow(
      'Formula persistence record is missing identity metadata',
    )
  })
})

describe('MFA recovery-code persistence', () => {
  it('accepts only an exact one-hash removal transition', () => {
    const previous = ['sha256:a', 'sha256:b', 'sha256:c']

    expect(isSingleRecoveryCodeConsumption(previous, ['sha256:a', 'sha256:c'])).toBe(true)
    expect(isSingleRecoveryCodeConsumption(previous, previous)).toBe(false)
    expect(isSingleRecoveryCodeConsumption(previous, ['sha256:a'])).toBe(false)
    expect(isSingleRecoveryCodeConsumption(previous, ['sha256:a', 'sha256:x'])).toBe(false)
    expect(
      isSingleRecoveryCodeConsumption(['sha256:a', 'sha256:a'], ['sha256:a']),
    ).toBe(false)
  })
})

describe('Worker session credentials', () => {
  it('uses an opaque random secret instead of the predictable audit session ID', async () => {
    const sessionSecret = createSessionCredential()
    const secretHash = await hashSessionCredential(sessionSecret)

    expect(isOpaqueSessionCredential(sessionSecret)).toBe(true)
    expect(sessionSecret).not.toContain('SES-')
    expect(secretHash).toMatch(/^sha256:v1:[a-f0-9]{64}$/)
    expect(secretHash).not.toContain(sessionSecret)
    expect(isOpaqueSessionCredential('SES-0001')).toBe(false)
  })

  it('resolves only a hashed opaque credential and rejects a legacy session ID', async () => {
    const sessionSecret = createSessionCredential()
    const secretHash = await hashSessionCredential(sessionSecret)
    const first = vi.fn().mockResolvedValue({
      id: 'SES-0007',
      status: 'ACTIVE',
      idle_expires_at: '2099-01-01T00:00:00.000Z',
      expires_at: '2099-01-01T00:00:00.000Z',
    })
    const bind = vi.fn().mockReturnValue({ first })
    const prepare = vi.fn().mockReturnValue({ bind })
    const db = { prepare } as unknown as D1Database

    await expect(
      resolveActiveSessionCredential(db, { sessionSecret, source: 'bearer' }),
    ).resolves.toMatchObject({ sessionId: 'SES-0007', source: 'bearer' })
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining('auth_session_credentials'))
    expect(bind).toHaveBeenCalledWith(secretHash)
    expect(JSON.stringify(prepare.mock.calls)).not.toContain(sessionSecret)

    const legacyPrepare = vi.fn()
    const legacyDb = { prepare: legacyPrepare } as unknown as D1Database
    await expect(
      resolveActiveSessionCredential(legacyDb, { sessionSecret: 'SES-0007', source: 'bearer' }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(legacyPrepare).not.toHaveBeenCalled()
  })
})

describe('Seeded administrator credential migration', () => {
  const passwordHash = `pbkdf2:v1:sha256:100000:${'a'.repeat(22)}:${'b'.repeat(43)}`

  it('cleans a legacy credential without repeatedly rotating the canonical account', () => {
    const state = resolveSeededAdminCredentialState([
      { email: 'm.thuanwork@gmail.com', passwordHash },
      { email: 'admin@labofscents.org', passwordHash: 'legacy-verifier' },
    ], passwordHash)

    expect(state.needsCanonicalUpsert).toBe(false)
    expect(state.legacyCredentialEmails).toEqual(['admin@labofscents.org'])
  })

  it('migrates a legacy-only credential to the canonical administrator email once', () => {
    const state = resolveSeededAdminCredentialState([
      { email: 'admin@labofscents.org', passwordHash: 'legacy-verifier' },
    ], passwordHash)

    expect(state.needsCanonicalUpsert).toBe(true)
    expect(state.legacyCredentialEmails).toEqual(['admin@labofscents.org'])
  })
})

describe('credentialed CORS', () => {
  it('allows only exact configured origins and rejects wildcard Pages origins', () => {
    const exact = buildCorsHeaders(
      'https://test.labofscents.pages.dev',
      'https://test.labofscents.pages.dev,https://olfactoryops-beta.pages.dev',
    )
    expect(exact['Access-Control-Allow-Origin']).toBe('https://test.labofscents.pages.dev')
    expect(exact['Access-Control-Allow-Credentials']).toBe('true')
    expect(exact['Access-Control-Allow-Headers']).toContain('Idempotency-Key')

    const wildcard = buildCorsHeaders(
      'https://preview.labofscents.pages.dev',
      'https://*.labofscents.pages.dev',
    )
    expect(wildcard['Access-Control-Allow-Origin']).toBeUndefined()
    expect(wildcard['Access-Control-Allow-Credentials']).toBeUndefined()
  })
})

describe('Audit-chain evidence', () => {
  const event = {
    id: 'AUD-200',
    at: '2026-07-27T10:00:00.000Z',
    actor: 'usr-owner',
    action: 'production.batch.release',
    entity: 'BTH-200',
    requestId: 'req_200',
    outcome: 'allowed' as const,
  }

  it('serializes a stable, versioned payload before hashing', () => {
    expect(canonicalAuditChainPayload('org-nxl', 2, 'abc123', event)).toBe(
      '["olfactoryops.audit-chain.v1","org-nxl",2,"abc123","AUD-200","2026-07-27T10:00:00.000Z","usr-owner","production.batch.release","BTH-200","req_200","allowed"]',
    )
  })

  it('changes the evidence hash when an audited field or predecessor changes', async () => {
    const original = await auditChainHash('org-nxl', 2, 'abc123', event)
    const alteredOutcome = await auditChainHash('org-nxl', 2, 'abc123', { ...event, outcome: 'blocked' })
    const alteredPredecessor = await auditChainHash('org-nxl', 2, 'def456', event)

    expect(original).toMatch(/^[a-f0-9]{64}$/)
    expect(alteredOutcome).not.toBe(original)
    expect(alteredPredecessor).not.toBe(original)
  })
})
