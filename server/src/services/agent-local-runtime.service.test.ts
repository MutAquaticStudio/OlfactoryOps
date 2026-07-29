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
})
