import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentLocalRuntimeService } from './agent-local-runtime.service'
import { NorthStarService } from './northstar.service'

const email = 'm.thuanwork@gmail.com'
const password = 'LocalAgentPassword2026!'
const directories: string[] = []

function reviewedBrief() {
  return {
    schemaVersion: 1,
    product: { productType: 'FINE_FRAGRANCE', formulaType: 'FINE_FRAGRANCE', format: 'spray', concentrationLabel: 'EDP', targetConcentrationPercent: 20, targetGrams: 100 },
    creative: { families: ['citrus'], descriptors: ['bright amber'], emotionalIntent: 'Confident and polished', references: [], desiredNotes: ['citrus'], avoidedNotes: [], specialEffects: [] },
    performance: { diffusion: 'MEDIUM', targetLongevityHours: 8, opening: 'bright citrus', drydown: 'amber' },
    audience: { target: 'Adults', positioning: 'Premium', occasion: 'Evening', markets: ['EU'] },
    constraints: { workspaceMaterialsOnly: true, reviewedMaterialsOnly: true, ifraCategory: '4', targetMarkets: ['EU'], inventoryPreference: 'PREFER_AVAILABLE', prohibitedMaterialIds: [], requiredMaterialIds: [], prohibitedDescriptors: [] },
    unresolvedQuestions: [],
  }
}

function authenticatedService() {
  const service = new NorthStarService({
    authCredentials: [{
      email,
      passwordHash: `sha256:${createHash('sha256').update(`auth:v1:${email}:${password}`).digest('hex')}`,
      passwordSetAt: '2026-07-29T00:00:00.000Z',
    }],
    mfaEncryptionKey: 'local-agent-test-encryption-key-2026-07-29',
  })
  const login = service.login(email, password)
  service.authenticateSession(login.data.session.id)
  return service
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('AgentLocalRuntimeService', () => {
  it('exposes only tenant-reviewed materials to the local runtime', async () => {
    const service = authenticatedService()
    const runtime = new AgentLocalRuntimeService()
    const catalog = await runtime.designMaterialCatalog(service, service.me().data.session)

    expect(catalog.data.sourceReferenceCount).toBe(0)
    expect(catalog.data.workspaceMaterialCount).toBeGreaterThan(catalog.data.materials.length)
    expect(catalog.data.materials.every((material) => service.materialCompliance(material.id).data?.status === 'APPROVED')).toBe(true)
  })

  it('persists a deterministic run and creates exactly one non-consuming draft after confirmation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'olfactoryops-agent-'))
    directories.push(directory)
    const service = authenticatedService()
    const runtime = new AgentLocalRuntimeService()
    Object.defineProperty(runtime, 'storagePath', { value: join(directory, 'agent-state.json') })
    const session = service.me().data.session
    const beforeMovements = service.inventoryMovements().data.length
    const created = await runtime.create(service, session, { brief: 'Marine woody fine fragrance with citrus and amber.' })
    expect(created.data.run.status).toBe('WAITING_FOR_CONFIRMATION')
    expect(created.data.artifacts.map((artifact) => artifact.type)).toContain('formula_table')
    const proposal = created.data.confirmation?.proposal
    expect(proposal?.ingredients.length).toBeGreaterThan(0)
    const confirmation = created.data.confirmation
    expect(confirmation?.status).toBe('PENDING')
    const confirmed = await runtime.resolveConfirmation(service, session, created.data.run.id, confirmation!.id, 'accept')
    expect(confirmed.data.formula).toBeDefined()
    expect(confirmed.data.formula?.lines).not.toHaveLength(0)
    expect(service.inventoryMovements().data).toHaveLength(beforeMovements)
    const duplicate = await runtime.resolveConfirmation(service, session, created.data.run.id, confirmation!.id, 'accept')
    expect(duplicate.data.duplicate).toBe(true)
    const restored = new AgentLocalRuntimeService()
    Object.defineProperty(restored, 'storagePath', { value: join(directory, 'agent-state.json') })
    expect((await restored.list(session)).data).toHaveLength(1)
  })

  it('does not expose a creator run to another tenant session', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'olfactoryops-agent-'))
    directories.push(directory)
    const service = authenticatedService()
    const runtime = new AgentLocalRuntimeService()
    Object.defineProperty(runtime, 'storagePath', { value: join(directory, 'agent-state.json') })
    const creatorSession = service.me().data.session
    const created = await runtime.create(service, creatorSession, { brief: 'Marine woody formula with a resilient amber base.' })

    service.signup({
      email: 'other-tenant@example.test',
      password: 'OtherTenantPassword2026!',
      name: 'Other Tenant',
      organizationName: 'Other Tenant Lab',
      workspaceSlug: 'other-tenant-lab',
    })
    await expect(runtime.detail(service.me().data.session, created.data.run.id)).rejects.toThrow('Formula research run was not found')
  })

  it('replays the same local mutation once and rejects conflicting idempotency reuse', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'olfactoryops-agent-'))
    directories.push(directory)
    const service = authenticatedService()
    const runtime = new AgentLocalRuntimeService()
    Object.defineProperty(runtime, 'storagePath', { value: join(directory, 'agent-state.json') })
    const session = service.me().data.session
    let writes = 0
    const first = await runtime.idempotentMutation(session, 'POST:/formula-intelligence/test', 'local-key-001', { name: 'first' }, async () => ({ writes: ++writes }))
    const replay = await runtime.idempotentMutation(session, 'POST:/formula-intelligence/test', 'local-key-001', { name: 'first' }, async () => ({ writes: ++writes }))
    expect(first).toEqual({ writes: 1 })
    expect(replay).toEqual({ writes: 1 })
    expect(writes).toBe(1)
    await expect(runtime.idempotentMutation(session, 'POST:/formula-intelligence/test', 'local-key-001', { name: 'changed' }, async () => ({ writes: ++writes })))
      .rejects.toThrow('Idempotency-Key was already used for a different request')
  })

  it('requires a reviewed structured version before local direction generation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'olfactoryops-agent-'))
    directories.push(directory)
    const service = authenticatedService()
    const runtime = new AgentLocalRuntimeService()
    Object.defineProperty(runtime, 'storagePath', { value: join(directory, 'agent-state.json') })
    const session = service.me().data.session
    const project = await runtime.createDesignProject(service, session, { name: 'Manual review required', rawBrief: 'A bright citrus fragrance with a clean amber drydown.' })

    await expect(runtime.generateDesignDirections(service, session, project.data.project.id)).rejects.toThrow('FORMULA_INTELLIGENCE_REVIEWED_BRIEF_REQUIRED')
    await expect(runtime.designBriefCompilerStatus(service, session, project.data.project.id, true)).resolves.toMatchObject({
      data: { status: 'NOT_CONFIGURED', mode: 'MANUAL' },
    })
    const first = await runtime.saveDesignBriefVersion(service, session, project.data.project.id, reviewedBrief())
    const second = await runtime.saveDesignBriefVersion(service, session, project.data.project.id, reviewedBrief())
    expect(first).toMatchObject({ data: { version: { state: 'REVIEWED' } } })
    expect(second.data.version.checksum).toBe(first.data.version.checksum)
  })

  it('lets the authenticated tenant admin approve a brief created by another member', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'olfactoryops-agent-'))
    directories.push(directory)
    const service = authenticatedService()
    const runtime = new AgentLocalRuntimeService()
    Object.defineProperty(runtime, 'storagePath', { value: join(directory, 'agent-state.json') })
    const session = service.me().data.session
    const project = await runtime.createDesignProject(service, session, {
      name: 'Admin review queue', rawBrief: 'A woody amber fine fragrance that needs an approval gate.',
    })
    const state = runtime as unknown as { state: { projects: Array<{ id: string; createdByUserId: string }> } }
    state.state.projects.find((candidate) => candidate.id === project.data.project.id)!.createdByUserId = 'usr-perfumer'

    const queue = await runtime.listDesignProjects(service, session, true, false, true)
    expect(queue.data.some((item) => item.id === project.data.project.id)).toBe(true)

    const approved = await runtime.saveDesignBriefVersion(service, session, project.data.project.id, reviewedBrief())
    expect(approved).toMatchObject({ data: { version: { state: 'REVIEWED' } } })
  })

  it('archives a private brief for thirty days and restores it without exposing it in the active list', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'olfactoryops-agent-'))
    directories.push(directory)
    const service = authenticatedService()
    const runtime = new AgentLocalRuntimeService()
    Object.defineProperty(runtime, 'storagePath', { value: join(directory, 'agent-state.json') })
    const session = service.me().data.session
    const project = await runtime.createDesignProject(service, session, {
      name: 'Archive this creative brief',
      rawBrief: 'A private citrus wood brief that should be recoverable after archive.',
      formulaType: 'ACCORD',
    })

    const archived = await runtime.archiveDesignProject(service, session, project.data.project.id)
    expect(archived.data).toMatchObject({ projectId: project.data.project.id, status: 'ARCHIVED', duplicate: false })
    expect((await runtime.listDesignProjects(service, session, true)).data.some((item) => item.id === project.data.project.id)).toBe(false)
    expect((await runtime.listDesignProjects(service, session, true, true)).data.find((item) => item.id === project.data.project.id)).toMatchObject({
      status: 'ARCHIVED', formulaTypeHint: 'ACCORD',
    })

    const restored = await runtime.restoreDesignProject(service, session, project.data.project.id)
    expect(restored.data).toMatchObject({ projectId: project.data.project.id, status: 'BRIEFED' })
    expect((await runtime.listDesignProjects(service, session, true)).data.some((item) => item.id === project.data.project.id)).toBe(true)
  })

  it('removes an expired unused archive when the local durable state is reloaded', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'olfactoryops-agent-'))
    directories.push(directory)
    const service = authenticatedService()
    const runtime = new AgentLocalRuntimeService()
    Object.defineProperty(runtime, 'storagePath', { value: join(directory, 'agent-state.json') })
    const session = service.me().data.session
    const project = await runtime.createDesignProject(service, session, {
      name: 'Expired unused brief',
      rawBrief: 'A private brief that was archived before any direction or run existed.',
    })
    await runtime.archiveDesignProject(service, session, project.data.project.id)

    const internal = runtime as unknown as {
      state: { projects: Array<{ id: string; purgeAfter?: string }> }
      persist: () => Promise<void>
    }
    internal.state.projects.find((candidate) => candidate.id === project.data.project.id)!.purgeAfter = '2000-01-01T00:00:00.000Z'
    await internal.persist()

    const restored = new AgentLocalRuntimeService()
    Object.defineProperty(restored, 'storagePath', { value: join(directory, 'agent-state.json') })
    expect((await restored.listDesignProjects(service, session, true, true)).data.some((item) => item.id === project.data.project.id)).toBe(false)
  })

  it('pins a material universe and restores private deterministic candidate evaluations', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'olfactoryops-agent-'))
    directories.push(directory)
    const service = authenticatedService()
    const runtime = new AgentLocalRuntimeService()
    Object.defineProperty(runtime, 'storagePath', { value: join(directory, 'agent-state.json') })
    const session = service.me().data.session
    for (const material of service.materials().data) {
      service.upsertMaterialCompliance(material.id, { status: 'APPROVED', source: 'Local test', sourceVersion: 'v1' })
    }
    const project = await runtime.createDesignProject(service, session, {
      name: 'Pinned candidate lineage', rawBrief: 'A citrus amber direction with a long, dry woody trail.',
    })
    await runtime.saveDesignBriefVersion(service, session, project.data.project.id, reviewedBrief())
    const generated = await runtime.generateDesignDirections(service, session, project.data.project.id)
    const runDetail = await runtime.detail(session, generated.data.run.id)
    const comparison = runDetail.data.artifacts.find((artifact) => artifact.type === 'design_candidate_comparison')
    expect(comparison).toBeDefined()
    const detail = await runtime.designProject(service, session, project.data.project.id, true)
    expect(detail.data.project.directions).toHaveLength(3)
    expect(detail.data.project.directions.map((direction) => direction.evaluation?.rank).sort()).toEqual([1, 2, 3])
    expect(detail.data.project.directions.every((direction) => direction.evaluation?.materialUniverse.hash)).toBe(true)
  })

  it('optimizes a nested immutable formula through resolved raw-material leaves', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'olfactoryops-agent-'))
    directories.push(directory)
    const service = authenticatedService()
    const runtime = new AgentLocalRuntimeService()
    Object.defineProperty(runtime, 'storagePath', { value: join(directory, 'agent-state.json') })
    const session = service.me().data.session
    for (const material of service.materials().data) {
      service.upsertMaterialCompliance(material.id, { status: 'APPROVED', source: 'Local test', sourceVersion: 'v1' })
    }

    const started = await runtime.startOptimizer(service, session, {
      baselineFormulaId: 'frm-0421', baselineVersion: 'v12', intent: 'COMBINED', lockedMaterialIds: [], requireEligibleInventory: false,
      objectives: { maximizeInventoryCoverage: true, minimizeNewPurchases: true, maximizeEvidenceCoverage: true, preserveMaterialIds: [], prohibitedMaterialIds: [], complianceRequired: true, requireApprovedSubstitutions: true },
    })
    const detail = await runtime.detail(session, started.data.run.id)
    const artifact = detail.data.artifacts.find((item) => item.type === 'optimizer_candidates')?.data as { data?: { candidates?: Array<{ candidateId: string; compositionChangePercent: number; proposal: { ingredients: Array<{ materialId: string; percentage: number }> } }> } } | undefined
    const candidate = artifact?.data?.candidates?.find((item) => item.compositionChangePercent > 0)

    expect(started.data.run.status).toBe('COMPLETED')
    expect(candidate).toBeDefined()
    expect(artifact?.data?.candidates?.every((candidate) => candidate.proposal.ingredients.every((line) => line.materialId.startsWith('mat-')))).toBe(true)
    const beforeMovements = service.inventoryMovements().data.length
    const pending = await runtime.requestOptimizerDraftSave(service, session, started.data.run.id, candidate!.candidateId)
    const confirmed = await runtime.resolveConfirmation(service, session, started.data.run.id, pending.data.confirmationId, 'accept')
    const repeated = await runtime.resolveConfirmation(service, session, started.data.run.id, pending.data.confirmationId, 'accept')
    expect(confirmed.data.formula).toBeDefined()
    expect(repeated.data).toMatchObject({ duplicate: true, formulaId: confirmed.data.formula?.id })
    expect(service.inventoryMovements().data).toHaveLength(beforeMovements)
  })

  it('plans one non-consuming trial from a saved, approved design direction', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'olfactoryops-agent-'))
    directories.push(directory)
    const service = authenticatedService()
    const runtime = new AgentLocalRuntimeService()
    Object.defineProperty(runtime, 'storagePath', { value: join(directory, 'agent-state.json') })
    const session = service.me().data.session
    const beforeMovements = service.inventoryMovements().data.length
    for (const material of service.materials().data) {
      service.upsertMaterialCompliance(material.id, { status: 'APPROVED', source: 'Local test', sourceVersion: 'v1' })
    }
    const project = await runtime.createDesignProject(service, session, { name: 'Trial lineage direction', rawBrief: 'A bright citrus amber fragrance for a controlled lab trial.' })
    await runtime.saveDesignBriefVersion(service, session, project.data.project.id, reviewedBrief())
    await runtime.generateDesignDirections(service, session, project.data.project.id)
    const detail = await runtime.designProject(service, session, project.data.project.id, true)
    const direction = detail.data.project.directions[0]!
    const pending = await runtime.requestDesignDraftSave(service, session, project.data.project.id, direction.directionId)
    const confirmed = await runtime.resolveConfirmation(service, session, direction.runId!, pending.data.confirmationId, 'accept')
    const formula = confirmed.data.formula!
    service.updateFormulaDraft(formula.id, {
      expectedRevision: formula.draftRevision,
      finalProductConcentrationPercent: 20,
      ifraCategory: '4',
    })
    service.submitFormulaForReview(formula.id, { reviewer: email, comment: 'Direction draft is ready for normal approval.' })
    const approval = service.approveFormula(formula.id, { comment: 'Approved for trial planning.' }).data

    const planned = await runtime.createTrialFromDesignDirection(service, session, project.data.project.id, direction.directionId, { sampleCode: 'TRL-LOCAL-DIRECTION-001' })
    const repeated = await runtime.createTrialFromDesignDirection(service, session, project.data.project.id, direction.directionId, { sampleCode: 'TRL-LOCAL-DIRECTION-001' })

    expect(planned.data.trial.formulaSnapshot.formulaVersion).toBe(approval.version.version)
    expect(planned.data.trial.formulaIntelligenceSource?.directionId).toBe(direction.directionId)
    expect(repeated.data.duplicate).toBe(true)
    expect(service.inventoryMovements().data).toHaveLength(beforeMovements)
  })

  it('does not reveal a tenant brief-version history to another tenant', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'olfactoryops-agent-'))
    directories.push(directory)
    const service = authenticatedService()
    const runtime = new AgentLocalRuntimeService()
    Object.defineProperty(runtime, 'storagePath', { value: join(directory, 'agent-state.json') })
    const ownerSession = service.me().data.session
    const project = await runtime.createDesignProject(service, ownerSession, { name: 'Private history', rawBrief: 'A private amber wood fragrance brief for this tenant.' })

    service.signup({
      email: 'brief-other-tenant@example.test', password: 'OtherTenantPassword2026!', name: 'Other Tenant',
      organizationName: 'Other Tenant Lab', workspaceSlug: 'brief-other-tenant',
    })
    await expect(runtime.designBriefVersions(service, service.me().data.session, project.data.project.id, true)).rejects.toThrow('Design project was not found')
  })

  it('rejects sharing a direction to a recipient outside the active project brand', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'olfactoryops-agent-'))
    directories.push(directory)
    const service = authenticatedService()
    const runtime = new AgentLocalRuntimeService()
    Object.defineProperty(runtime, 'storagePath', { value: join(directory, 'agent-state.json') })
    const session = service.me().data.session
    for (const material of service.materials().data) {
      service.upsertMaterialCompliance(material.id, { status: 'APPROVED', source: 'Local test', sourceVersion: 'v1' })
    }
    const project = await runtime.createDesignProject(service, session, {
      name: 'Brand scoped direction',
      formulaType: 'FINE_FRAGRANCE',
      concentrationType: 'EDP',
      finalProductConcentrationPercent: 20,
      ifraCategory: '4',
      targetMarkets: ['EU'],
      creativeBrief: 'Citrus amber fragrance direction for a brand review.',
      desiredNotes: ['citrus'],
      avoidedNotes: [],
      lockedMaterialIds: [],
      availabilityFirst: true,
      targetGrams: 100,
    })
    await runtime.saveDesignBriefVersion(service, session, project.data.project.id, reviewedBrief())
    await runtime.generateDesignDirections(service, session, project.data.project.id)
    const detail = await runtime.designProject(service, session, project.data.project.id, true)
    const direction = detail.data.project.directions[0]
    expect(direction).toBeDefined()
    await expect(runtime.shareDesignDirection(service, session, project.data.project.id, direction!.directionId, {
      recipientUserIds: ['usr-not-in-brand'],
      allowMaterialNames: false,
    })).rejects.toThrow('Every recipient must be an active member of this project brand')
  })

  it('does not let a perfumer outside the project brand generate a brief', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'olfactoryops-agent-'))
    directories.push(directory)
    const service = authenticatedService()
    const runtime = new AgentLocalRuntimeService()
    Object.defineProperty(runtime, 'storagePath', { value: join(directory, 'agent-state.json') })
    const session = service.me().data.session
    const project = await runtime.createDesignProject(service, session, {
      name: 'Private brand brief',
      formulaType: 'FINE_FRAGRANCE',
      concentrationType: 'EDP',
      finalProductConcentrationPercent: 20,
      ifraCategory: '4',
      targetMarkets: ['EU'],
      creativeBrief: 'A private creative direction owned by this brand.',
      desiredNotes: ['citrus'],
      avoidedNotes: [],
      lockedMaterialIds: [],
      availabilityFirst: true,
      targetGrams: 100,
    })
    const outsideBrandSession = { ...session, userId: 'usr-other-perfumer', brandId: 'brand-other' }

    await expect(runtime.generateDesignDirections(service, outsideBrandSession, project.data.project.id)).rejects.toThrow('Design project was not found')
  })
})
