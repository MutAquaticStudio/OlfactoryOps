import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentLocalRuntimeService } from './agent-local-runtime.service'
import { NorthStarService } from './northstar.service'

const email = 'admin@labofscents.org'
const password = 'LocalAgentPassword2026!'
const directories: string[] = []

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
    expect(proposal?.ingredients.some((ingredient) => ingredient.materialId.startsWith('mat-lluch-2026-'))).toBe(false)
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
