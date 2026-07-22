import { createHash, createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ForbiddenException, UnauthorizedException, UnprocessableEntityException } from '../shared/http-error'
import { NorthStarService } from './northstar.service'

const fixedSessionFixtureNow = new Date('2026-07-10T07:00:00.000Z')
const adminEmail = 'admin@labofscents.org'
const adminPassword = 'UnitTestAdminPassword2026!'

const testMfaEncryptionKey = 'unit-test-mfa-encryption-key-2026-07-18'
const testBase32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function createAuthenticatedService(email = adminEmail) {

  const service = createTestService()
  const login = service.login(email, email === adminEmail ? adminPassword : undefined)
  const internals = service as unknown as { sessions: Array<{ id: string; mfaVerified: boolean }> }
  internals.sessions = internals.sessions.map((session) =>
    session.id === login.data.session.id ? { ...session, mfaVerified: true } : session,
  )
  service.authenticateSession(login.data.session.id)
  return service
}

function testPasswordHashForEmail(email: string, password: string) {
  return `sha256:${createHash('sha256').update(`auth:v1:${email.trim().toLowerCase()}:${password}`).digest('hex')}`
}

function createTestService() {
  return new NorthStarService({
    authCredentials: [
      {
        email: adminEmail,
        passwordHash: testPasswordHashForEmail(adminEmail, adminPassword),
        passwordSetAt: fixedSessionFixtureNow.toISOString(),
      },
    ],
    mfaEncryptionKey: testMfaEncryptionKey,
  })
}

function provisionTestCredential(service: NorthStarService, email: string, password: string) {
  const internals = service as unknown as {
    authCredentialRecords: { email: string; passwordHash: string; passwordSetAt: string }[]
  }
  const normalizedEmail = email.trim().toLowerCase()
  internals.authCredentialRecords = [
    {
      email: normalizedEmail,
      passwordHash: testPasswordHashForEmail(normalizedEmail, password),
      passwordSetAt: fixedSessionFixtureNow.toISOString(),
    },
    ...internals.authCredentialRecords.filter((credential) => credential.email !== normalizedEmail),
  ]
}

function credentialForEmail(service: NorthStarService, email: string) {
  const internals = service as unknown as {
    authCredentialRecords: { email: string; passwordHash: string; passwordSetAt: string }[]
  }
  return internals.authCredentialRecords.find((credential) => credential.email === email.trim().toLowerCase())
}

function decodeTestBase32(secret: string) {
  let bits = 0
  let accumulator = 0
  const bytes: number[] = []
  for (const character of secret) {
    const index = testBase32Alphabet.indexOf(character)
    if (index < 0) {
      throw new Error('Invalid test Base32 secret')
    }
    accumulator = (accumulator << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function currentTestTotp(secret: string) {
  const counter = Math.floor(fixedSessionFixtureNow.getTime() / 1000 / 30)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0)
  counterBuffer.writeUInt32BE(counter >>> 0, 4)
  const digest = createHmac('sha1', decodeTestBase32(secret)).update(counterBuffer).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  return String(binary % 1_000_000).padStart(6, '0')
}

describe('NorthStarService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(fixedSessionFixtureNow)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('requires an authenticated session before protected tenant operations', () => {
    const service = createTestService()

    expect(() => service.tenantConsole()).toThrow(UnauthorizedException)
    expect(() => service.requestDocumentSignedUrl('DOC-118')).toThrow(UnauthorizedException)
    expect(() => service.authenticateSession(undefined)).toThrow(UnauthorizedException)
  })

  it('requires the configured admin password before issuing an admin session', () => {
    const service = createTestService()

    expect(() => service.login(adminEmail)).toThrow(ForbiddenException)
    expect(() => service.login(adminEmail, 'wrong-password')).toThrow(ForbiddenException)

    const login = service.login(adminEmail, adminPassword).data

    expect(login.session.email).toBe(adminEmail)
    expect(login.session.role).toBe('Admin')
    expect(login.permissions).toContain('security.manageUsers')
    expect(credentialForEmail(service, adminEmail)?.passwordHash).toMatch(/^pbkdf2:v1:sha256:/)
  })

  it('blocks active memberships that have not completed password setup', () => {
    const service = createTestService()

    expect(() => service.login('owner@example.test', 'any-password')).toThrow(ForbiddenException)
    expect(() => service.login('lab@example.test', 'any-password')).toThrow(ForbiddenException)
  })

  it('issues session-bound CSRF tokens without exposing them through session lists', () => {
    const service = createTestService()
    const login = service.login(adminEmail, adminPassword).data

    expect(login.csrfToken).toMatch(/^csrf_/)
    expect(login.session).not.toHaveProperty('csrfToken')
    expect(login.revokedForLimit.every((session) => !('csrfToken' in session))).toBe(true)

    const me = service.me().data
    expect(me.csrfToken).toBe(login.csrfToken)
    expect(me.session).not.toHaveProperty('csrfToken')

    expect(() => service.assertValidCsrfToken('wrong-token')).toThrow(ForbiddenException)
    expect(() => service.assertValidCsrfToken(login.csrfToken)).not.toThrow()

    const tenantConsole = service.tenantConsole().data
    expect(tenantConsole.sessions.length).toBeGreaterThan(0)
    expect(tenantConsole.sessions.every((session) => !('csrfToken' in session))).toBe(true)
  })

  it('stores user settings for the active user without changing tenant-wide settings', () => {
    const service = createAuthenticatedService()
    const initial = service.me().data.userSettings

    expect(initial.displayName).toBe('Thuan Le Minh')
    expect(initial.organizationId).toBe('org-nxl')
    expect(initial.sidebarMode).toBe('expanded')
    expect(initial.accentColor).toBe('#0f766e')
    expect(initial.formulaWorkspace).toEqual({ library: true, summary: true, ifra: true, evaporation: true })

    const updated = service.updateUserSettings({
      displayName: 'Maison Owner',
      preferredLanding: 'inventory',
      uiDensity: 'compact',
      sidebarMode: 'rail',
      reduceMotion: true,
      emailDigest: 'daily',
      accentColor: '#F5B04C',
      formulaWorkspace: { library: false, summary: true, ifra: true, evaporation: false },
      organizationId: 'org-other',
    }).data
    const tenantSettings = service.customizationConsole().data.settings
    const membership = service.tenantConsole().data.memberships.find((item) => item.userId === updated.settings.userId)

    expect(updated.settings.displayName).toBe('Maison Owner')
    expect(updated.settings.preferredLanding).toBe('inventory')
    expect(updated.settings.uiDensity).toBe('compact')
    expect(updated.settings.sidebarMode).toBe('rail')
    expect(updated.settings.reduceMotion).toBe(true)
    expect(updated.settings.emailDigest).toBe('daily')
    expect(updated.settings.accentColor).toBe('#f5b04c')
    expect(updated.settings.formulaWorkspace).toEqual({ library: false, summary: true, ifra: true, evaporation: false })
    expect(updated.settings.organizationId).toBe('org-nxl')
    expect(updated.audit.action).toBe('user.settings.update')
    expect(updated.invariant).toContain('scoped to the authenticated user')
    expect(service.userSettings().data.displayName).toBe('Maison Owner')
    expect(membership?.name).toBe('Maison Owner')
    expect(tenantSettings.organizationId).toBe('org-nxl')

    const invalid = service.updateUserSettings({
      preferredLanding: 'tenant-escape',
      uiDensity: 'spacious',
      sidebarMode: 'floating',
      emailDigest: 'hourly',
      accentColor: 'url(javascript:alert(1))',
      formulaWorkspace: { library: 'hide', summary: 'show' },
    }).data.settings

    expect(invalid.preferredLanding).toBe('inventory')
    expect(invalid.uiDensity).toBe('compact')
    expect(invalid.sidebarMode).toBe('rail')
    expect(invalid.emailDigest).toBe('daily')
    expect(invalid.accentColor).toBe('#f5b04c')
    expect(invalid.formulaWorkspace).toEqual({ library: false, summary: true, ifra: true, evaporation: false })
  })

  it('commits lab usage through OUT movements and reverses by compensation', () => {
    const service = createAuthenticatedService()
    const commit = service.commitLabUsage('frm-accord-citrus', 12.5).data

    expect(commit.usage.status).toBe('COMMITTED')
    expect(commit.usage.weighingSession?.status).toBe('READY')
    expect(commit.movements.length).toBeGreaterThan(0)
    expect(commit.movements.every((movement) => movement.direction === 'OUT')).toBe(true)

    const reverse = service.reverseLatestLabUsage().data

    expect(reverse.usageId).toBe(commit.usage.id)
    expect(reverse.usage.status).toBe('REVERSED')
    expect(reverse.movements.every((movement) => movement.direction === 'IN')).toBe(true)
    expect(reverse.invariant).toContain('reverse by compensation')
  })

  it('exposes lab usage history, detail, and reverse-by-id evidence', () => {
    const service = createAuthenticatedService()
    const commit = service.commitLabUsage('frm-accord-citrus', 12.5, {
      purpose: 'sample',
      projectCode: 'NXL-RD-0421',
      sampleCode: 'SMP-0421-A',
      operator: 'Bench Chemist',
    }).data

    const history = service.labUsageHistory().data
    expect(history.usages[0]?.id).toBe(commit.usage.id)
    expect(history.usages[0]?.purpose).toBe('sample')
    expect(history.invariant).toContain('usage history')

    const detail = service.labUsageDetail(commit.usage.id).data
    expect(detail.usage.sampleCode).toBe('SMP-0421-A')
    expect(detail.movements.length).toBe(commit.movements.length)

    const reverse = service.reverseLabUsage(commit.usage.id, {
      reason: 'Bench correction',
      actor: 'Lab Manager',
    }).data
    expect(reverse.usage.reversedAt).toBeDefined()
    expect(reverse.usage.reversalMovements?.length).toBe(commit.movements.length)
    expect(reverse.movements.every((movement) => movement.actor === 'Lab Manager')).toBe(true)
    expect(() => service.reverseLabUsage(commit.usage.id)).toThrow(UnprocessableEntityException)
  })

  it('records lab weighing sessions without creating inventory movements', () => {
    const service = createAuthenticatedService()
    const beforeMovements = service.inventoryMovements().data.length
    const plan = service.labUsagePlan('frm-accord-citrus', 12.5).data
    const actuals = plan.allocations.map((allocation, index) => ({
      materialId: allocation.materialId,
      lotId: allocation.lotId,
      actualGrams: index === 0 ? Number((allocation.allocatedGrams * 1.01).toFixed(4)) : allocation.allocatedGrams,
    }))

    const result = service.recordLabWeighingSession('frm-accord-citrus', 12.5, {
      actuals,
      tolerancePercent: 2,
      operator: 'Bench Chemist',
    }).data

    expect(result.weighingSession.status).toBe('READY')
    expect(result.weighingSession.operator).toBe('Bench Chemist')
    expect(result.weighingSession.lines[0]?.deviationPercent).toBeCloseTo(1)
    expect(result.invariant).toContain('before movement creation')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
  })

  it('commits lab usage with actual weighed quantities', () => {
    const service = createAuthenticatedService()
    const plan = service.labUsagePlan('frm-accord-citrus', 12.5).data
    const firstAllocation = plan.allocations[0]!
    const actualGrams = Number((firstAllocation.allocatedGrams * 0.99).toFixed(4))

    const commit = service.commitLabUsage('frm-accord-citrus', 12.5, {
      actuals: [
        {
          materialId: firstAllocation.materialId,
          lotId: firstAllocation.lotId,
          actualGrams,
        },
      ],
      tolerancePercent: 2,
      operator: 'Bench Chemist',
    }).data

    expect(commit.movements[0]?.quantityGrams).toBeCloseTo(actualGrams)
    expect(commit.movements[0]?.actor).toBe('Bench Chemist')
    expect(commit.usage.allocations[0]?.allocatedGrams).toBeCloseTo(actualGrams)
    expect(commit.usage.weighingSession?.lines[0]?.actualGrams).toBeCloseTo(actualGrams)
  })

  it('blocks out-of-tolerance lab weighing commits before inventory changes', () => {
    const service = createAuthenticatedService()
    const beforeMovements = service.inventoryMovements().data.length
    const plan = service.labUsagePlan('frm-accord-citrus', 12.5).data
    const firstAllocation = plan.allocations[0]!

    expect(() =>
      service.commitLabUsage('frm-accord-citrus', 12.5, {
        actuals: [
          {
            materialId: firstAllocation.materialId,
            lotId: firstAllocation.lotId,
            actualGrams: Number((firstAllocation.allocatedGrams * 1.25).toFixed(4)),
          },
        ],
        tolerancePercent: 2,
        operator: 'Bench Chemist',
      }),
    ).toThrow(UnprocessableEntityException)
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
  })

  it('requires a currently published formula before planning or posting lab inventory usage', () => {
    const service = createAuthenticatedService()
    const beforeMovements = service.inventoryMovements().data.length

    expect(() => service.labUsagePlan('frm-0421', 12.5)).toThrowError(
      'Formula FRM-0421 must be published before lab inventory usage',
    )
    expect(() => service.commitLabUsage('frm-0421', 12.5)).toThrowError(
      'Formula FRM-0421 must be published before lab inventory usage',
    )
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
  })

  it('issues short-lived document URLs only after permission check and logs access', () => {
    const service = createAuthenticatedService()
    const before = service.documents().data.find((document) => document.id === 'DOC-118')
    expect(before).toBeDefined()

    const result = service.requestDocumentSignedUrl('DOC-118').data

    expect(result.signedUrl.url).toContain('expires=')
    expect(result.signedUrl.url).toContain('nonce=')
    expect(result.signedUrl.ttlSeconds).toBe(300)
    expect(result.document.downloads).toBe(before!.downloads + 1)
    expect(result.audit.action).toBe('document.download')
    expect(result.audit.outcome).toBe('allowed')
    expect(service.documentDownloadAudit().data[0]?.entity).toBe('DOC-118')
  })

  it('blocks highly confidential document downloads without sensitive permission and keeps audit evidence', () => {
    const service = createAuthenticatedService()

    expect(service.requestDocumentSignedUrl('DOC-121').data.audit.outcome).toBe('allowed')
    expect(() =>
      service.requestDocumentSignedUrl('DOC-121', {
        actor: 'api:viewer',
        permissions: ['documents.download'],
      }),
    ).toThrow(ForbiddenException)

    const latestAudit = service.documentDownloadAudit().data[0]
    expect(latestAudit?.entity).toBe('DOC-121')
    expect(latestAudit?.outcome).toBe('blocked')
  })

  it('reports compliance coverage and generates review-gated documents', () => {
    const service = createAuthenticatedService()
    const before = service.documentComplianceDashboard().data
    expect(before.missingCount).toBeGreaterThan(0)
    expect(before.expiringDocuments.some((document) => document.id === 'DOC-118')).toBe(true)

    const result = service.generateDocument({
      type: 'CoA',
      linkedTo: 'lot-iso-001',
      actor: 'Compliance Lead',
    }).data

    expect(result.document.type).toBe('CoA')
    expect(result.document.linkedTo).toBe('lot-iso-001')
    expect(result.document.status).toBe('REVIEW_REQUIRED')
    expect(result.document.generatedFrom).toBe('lot:lot-iso-001')
    expect(result.audit.action).toBe('document.generate')
    expect(result.audit.outcome).toBe('review')
    expect(result.dashboard.generatedCount).toBe(1)
    expect(result.dashboard.requirements.find((item) => item.id === 'REQ-COA-lot-iso-001')?.status).toBe('review')
  })

  it('approves generated documents before external sharing', () => {
    const service = createAuthenticatedService()
    const generated = service.generateDocument({ type: 'CoA', linkedTo: 'lot-iso-001' }).data.document

    expect(() => service.shareDocument(generated.id, { recipient: 'client@example.com' })).toThrow(
      UnprocessableEntityException,
    )

    const approved = service.approveDocument(generated.id, { actor: 'Compliance Lead' }).data
    const shared = service.shareDocument(generated.id, {
      recipient: 'client@example.com',
      actor: 'Compliance Lead',
    }).data

    expect(approved.document.status).toBe('APPROVED')
    expect(approved.audit.action).toBe('document.approve')
    expect(shared.document.status).toBe('SHARED')
    expect(shared.shareLink.recipient).toBe('client@example.com')
    expect(shared.shareLink.permission).toBe('external-view')
    expect(shared.audit.action).toBe('document.externalShare')
    expect(service.documentDownloadAudit().data.some((event) => event.action === 'document.externalShare')).toBe(true)
  })

  it('blocks cross-tenant and missing-permission probes', () => {
    const service = createAuthenticatedService()

    expect(service.tenantProbe('org-nxl').data.allowed).toBe(true)
    expect(() => service.tenantProbe('org-other')).toThrow(ForbiddenException)
    expect(() => service.permissionProbe('inventory.adjust', 'Viewer')).toThrow(ForbiddenException)
    expect(service.permissionProbe('inventory.adjust', 'Owner').data.allowed).toBe(true)
  })

  it('returns a server-side permission matrix for organization roles', () => {
    const service = createAuthenticatedService()
    const result = service.permissionMatrix().data
    const viewer = result.matrix.find((row) => row.role === 'Viewer')

    expect(result.permissionCatalog.some((permission) => permission.key === 'inventory.adjust')).toBe(true)
    expect(result.rolePolicies.some((policy) => policy.role === 'Admin')).toBe(true)
    expect(viewer?.allowedPermissions).toContain('inventory.view')
    expect(viewer?.deniedPermissions).toContain('inventory.adjust')
    expect(result.invariant).toContain('server-side')
  })

  it('updates role permissions and applies the new permission decision', () => {
    const service = createAuthenticatedService()
    const viewer = service.permissionMatrix().data.matrix.find((row) => row.role === 'Viewer')
    const updated = service.setRolePermissions('Viewer', [
      ...(viewer?.allowedPermissions ?? []),
      'inventory.adjust',
    ]).data

    expect(updated.rolePolicy.permissions).toContain('inventory.adjust')
    expect(updated.audit.action).toBe('role.permissions.update')
    expect(service.permissionProbe('inventory.adjust', 'Viewer').data.allowed).toBe(true)
  })

  it('blocks unknown permissions and unsafe Admin permission removal', () => {
    const service = createAuthenticatedService()
    const admin = service.permissionMatrix().data.matrix.find((row) => row.role === 'Admin')

    expect(() => service.setRolePermissions('Viewer', ['inventory.view', 'tenant.escape'])).toThrow(
      UnprocessableEntityException,
    )
    expect(() =>
      service.setRolePermissions(
        'Admin',
        (admin?.allowedPermissions ?? []).filter((permission) => permission !== 'security.manageUsers'),
      ),
    ).toThrow(UnprocessableEntityException)
  })

  it('scopes the tenant console to the active organization', () => {
    const service = createAuthenticatedService()
    const result = service.tenantConsole().data

    expect(result.organization.id).toBe('org-nxl')
    expect(result.brands.every((brand) => brand.organizationId === 'org-nxl')).toBe(true)
    expect(result.memberships.every((membership) => membership.organizationId === 'org-nxl')).toBe(true)
    expect(result.sessions.every((session) => session.organizationId === 'org-nxl')).toBe(true)
    expect(result.rolePolicies.some((policy) => policy.role === 'Owner')).toBe(true)
    expect(result.permissionMatrix.some((matrix) => matrix.role === 'Admin')).toBe(true)
    expect(result.invariant).toContain('active session')
  })

  it('invites tenant members without creating a usable credential', () => {
    const service = createAuthenticatedService()
    const result = service.inviteMember({
      email: 'new.viewer@example.test',
      name: 'New Viewer',
      role: 'Viewer',
      brandIds: ['brand-nxl'],
    }).data

    expect(result.membership.status).toBe('INVITED')
    expect(result.membership.organizationId).toBe('org-nxl')
    expect(result.audit.action).toBe('membership.invite')
    expect(result.invariant).toContain('invitee sets password')
    expect(() => service.login('new.viewer@example.test')).toThrow(ForbiddenException)
  })

  it('keeps a normal invited user blocked until admin approval and then enforces viewer permissions', () => {
    const service = createAuthenticatedService()
    const invited = service.inviteMember({
      email: 'approved.viewer@example.test',
      name: 'Approved Viewer',
      role: 'Viewer',
      brandIds: ['brand-nxl'],
    }).data

    expect(invited.membership.status).toBe('INVITED')
    expect(() => service.login('approved.viewer@example.test')).toThrow(ForbiddenException)

    const approval = service.setMembershipStatus(invited.membership.id, 'ACTIVE').data
    expect(approval.membership.status).toBe('ACTIVE')
    expect(approval.audit.action).toBe('membership.status.update')
    expect(() => service.login('approved.viewer@example.test')).toThrow(ForbiddenException)

    provisionTestCredential(service, 'approved.viewer@example.test', 'ApprovedViewer2026!')
    const login = service.login('approved.viewer@example.test', 'ApprovedViewer2026!').data
    const me = service.me().data
    const settings = service.updateUserSettings({
      displayName: 'Normal Viewer',
      preferredLanding: 'documents',
      accentColor: '#37D6A0',
    }).data

    expect(login.session.role).toBe('Viewer')
    expect(login.session.organizationId).toBe('org-nxl')
    expect(me.permissions).toContain('documents.view')
    expect(me.permissions).not.toContain('security.manageUsers')
    expect(settings.settings.displayName).toBe('Normal Viewer')
    expect(settings.settings.organizationId).toBe('org-nxl')
    expect(credentialForEmail(service, 'approved.viewer@example.test')?.passwordHash).toMatch(/^pbkdf2:v1:sha256:/)
    expect(() => service.tenantConsole()).toThrow(ForbiddenException)
    expect(() => service.inviteMember({ email: 'should.block@example.test', role: 'Viewer' })).toThrow(ForbiddenException)
    expect(() => service.setMembershipStatus('MBR-LAB', 'DEACTIVATED')).toThrow(ForbiddenException)
    expect(() => service.billingConsole()).toThrow(ForbiddenException)
    expect(() => service.selectBillingPlan({ planId: 'PLAN-ARTISAN' })).toThrow(ForbiddenException)
    expect(() => service.openBillingPortal()).toThrow(ForbiddenException)
  })

  it('routes normal-user inventory updates through admin approval before mutating stock', () => {
    const service = createAuthenticatedService()
    const invited = service.inviteMember({
      email: 'inventory.requester@example.test',
      name: 'Inventory Requester',
      role: 'Viewer',
      brandIds: ['brand-nxl'],
    }).data
    service.setMembershipStatus(invited.membership.id, 'ACTIVE')
    provisionTestCredential(service, 'inventory.requester@example.test', 'InventoryRequester2026!')

    service.login('inventory.requester@example.test', 'InventoryRequester2026!')
    const beforeMovements = service.inventoryMovements().data.length
    const beforeLot = service.lotsList().data.find((lot) => lot.id === 'lot-amb-001')

    expect(() =>
      service.adjustInventory({
        lotId: 'lot-amb-001',
        direction: 'OUT',
        quantityGrams: 2,
        reason: 'Viewer direct correction',
      }),
    ).toThrow(ForbiddenException)

    const requested = service.requestInventoryApproval({
      action: 'inventory.adjust',
      payload: {
        lotId: 'lot-amb-001',
        direction: 'OUT',
        quantityGrams: 2,
        reason: 'Bench count variance',
      },
      reason: 'Please approve shelf correction',
    }).data
    const requesterQueue = service.inventoryApprovalRequests().data.requests

    expect(requested.request.status).toBe('PENDING')
    expect(requested.request.requiredPermission).toBe('inventory.adjust')
    expect(requested.audit.outcome).toBe('review')
    expect(requesterQueue).toHaveLength(1)
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
    expect(service.lotsList().data.find((lot) => lot.id === 'lot-amb-001')?.quantityGrams).toBe(beforeLot?.quantityGrams)

    service.login(adminEmail, adminPassword)
    const approverQueue = service.inventoryApprovalRequests().data.requests
    const approved = service.approveInventoryApprovalRequest(requested.request.id, { note: 'Count verified' }).data
    const approvedResult = approved.result as { movement: { id: string; type: string; actor: string } }
    const afterLot = service.lotsList().data.find((lot) => lot.id === 'lot-amb-001')

    expect(approverQueue.some((request) => request.id === requested.request.id)).toBe(true)
    expect(approved.request.status).toBe('APPROVED')
    expect(approved.request.reviewedBy).toBe('usr-admin')
    expect(approved.request.resultRef).toBe(approvedResult.movement.id)
    expect(approvedResult.movement.type).toBe('ADJUSTMENT')
    expect(approvedResult.movement.actor).toBe('usr-admin')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements + 1)
    expect(afterLot?.quantityGrams).toBe((beforeLot?.quantityGrams ?? 0) - 2)
    expect(() => service.approveInventoryApprovalRequest(requested.request.id)).toThrow(UnprocessableEntityException)

    service.login('inventory.requester@example.test', 'InventoryRequester2026!')
    const transferRequest = service.requestInventoryApproval({
      action: 'inventory.transfer',
      payload: { lotId: 'lot-amb-001', toLocation: 'Cold Room A' },
      reason: 'Move to controlled storage',
    }).data

    service.login(adminEmail, adminPassword)
    const movementsBeforeReject = service.inventoryMovements().data.length
    const rejected = service.rejectInventoryApprovalRequest(transferRequest.request.id, { note: 'Location not approved' }).data

    expect(rejected.request.status).toBe('REJECTED')
    expect(rejected.audit.action).toBe('inventory.approval.reject')
    expect(service.inventoryMovements().data.length).toBe(movementsBeforeReject)
    expect(service.lotsList().data.find((lot) => lot.id === 'lot-amb-001')?.location).not.toBe('Cold Room A')

    service.login('inventory.requester@example.test', 'InventoryRequester2026!')
    const qualityRequest = service.requestInventoryApproval({
      action: 'inventory.quality',
      payload: { lotId: 'lot-amb-001', qualityStatus: 'ON_HOLD', reason: 'Pending retest evidence' },
      reason: 'Move lot to hold before release',
    }).data

    service.login(adminEmail, adminPassword)
    const movementsBeforeQuality = service.inventoryMovements().data.length
    const qualityApproval = service.approveInventoryApprovalRequest(qualityRequest.request.id, { note: 'Retest required' }).data

    expect(qualityApproval.request.status).toBe('APPROVED')
    expect(qualityApproval.result.lot.qualityStatus).toBe('ON_HOLD')
    expect(service.inventoryMovements().data.length).toBe(movementsBeforeQuality)

    service.login('inventory.requester@example.test', 'InventoryRequester2026!')
    const beforeStockTakeLot = service.lotsList().data.find((lot) => lot.id === 'lot-amb-001')
    const stockTakeRequest = service.requestInventoryApproval({
      action: 'inventory.stockTake',
      payload: {
        lotId: 'lot-amb-001',
        countedGrams: (beforeStockTakeLot?.quantityGrams ?? 0) - 1,
        reason: 'Shelf count correction',
      },
      reason: 'Approve stock take variance',
    }).data

    service.login(adminEmail, adminPassword)
    const movementsBeforeStockTake = service.inventoryMovements().data.length
    const stockTakeApproval = service.approveInventoryApprovalRequest(stockTakeRequest.request.id, { note: 'Variance accepted' }).data
    const stockTakeResult = stockTakeApproval.result as {
      movement?: { type: string }
      stockTake: { status: string }
    }

    expect(stockTakeApproval.request.status).toBe('APPROVED')
    expect(stockTakeResult.movement?.type).toBe('ADJUSTMENT')
    expect(stockTakeResult.stockTake.status).toBe('ADJUSTED')
    expect(service.inventoryMovements().data.length).toBe(movementsBeforeStockTake + 1)
  })

  it('routes non-inventory writes through operation approval before execution', () => {
    const service = createAuthenticatedService()
    const invited = service.inviteMember({
      email: 'operation.requester@example.test',
      name: 'Operation Requester',
      role: 'Viewer',
      brandIds: ['brand-nxl'],
    }).data
    service.setMembershipStatus(invited.membership.id, 'ACTIVE')
    provisionTestCredential(service, 'operation.requester@example.test', 'OperationRequester2026!')

    service.login('operation.requester@example.test', 'OperationRequester2026!')
    expect(() => service.createFormulaDraft({ name: 'Viewer Direct Formula', targetGrams: 50 })).toThrow(ForbiddenException)

    const formulaRequest = service.requestOperationApproval({
      method: 'POST',
      path: '/formulas',
      payload: { name: 'Approved Operation Formula', targetGrams: 50 },
      reason: 'Viewer needs a formula draft',
    }).data

    expect(formulaRequest.request.status).toBe('PENDING')
    expect(formulaRequest.request.requiredPermission).toBe('formulas.edit')
    expect(service.operationApprovalRequests().data.requests).toHaveLength(1)

    service.login(adminEmail, adminPassword)
    const approvedFormula = service.approveOperationApprovalRequest(formulaRequest.request.id, { note: 'Approved draft' }).data
    const formulaResult = approvedFormula.result as { formula: { name: string; targetGrams: number } }

    expect(approvedFormula.request.status).toBe('APPROVED')
    expect(formulaResult.formula.name).toBe('Approved Operation Formula')
    expect(formulaResult.formula.targetGrams).toBe(50)
    expect(() => service.approveOperationApprovalRequest(formulaRequest.request.id)).toThrow(UnprocessableEntityException)

    service.login('operation.requester@example.test', 'OperationRequester2026!')
    expect(() => service.generateDocument({ type: 'CoA', linkedTo: 'lot-iso-001' })).toThrow(ForbiddenException)
    const documentRequest = service.requestOperationApproval({
      method: 'POST',
      path: '/documents/generate',
      payload: { type: 'CoA', linkedTo: 'lot-iso-001' },
      reason: 'Need CoA generated for customer review',
    }).data

    service.login(adminEmail, adminPassword)
    const approvedDocument = service.approveOperationApprovalRequest(documentRequest.request.id).data
    const documentResult = approvedDocument.result as { document: { type: string; linkedTo: string; status: string } }

    expect(documentRequest.request.requiredPermission).toBe('documents.manage')
    expect(documentResult.document.type).toBe('CoA')
    expect(documentResult.document.linkedTo).toBe('lot-iso-001')
    expect(documentResult.document.status).toBe('REVIEW_REQUIRED')

    service.login('operation.requester@example.test', 'OperationRequester2026!')
    const exportRequest = service.requestOperationApproval({
      method: 'POST',
      path: '/formulas/frm-0421/export',
      reason: 'Need an immutable formula export',
    }).data
    const evaluationRequest = service.requestOperationApproval({
      method: 'POST',
      path: '/formulas/frm-0421/versions/v12/evaluations',
      payload: {
        day: 30,
        observation: 'Approved operation notebook entry',
        stability: 'PASS',
        rating: 4,
      },
      reason: 'Record the approved aging observation',
    }).data

    service.login(adminEmail, adminPassword)
    const approvedExport = service.approveOperationApprovalRequest(exportRequest.request.id).data
    const approvedEvaluation = service.approveOperationApprovalRequest(evaluationRequest.request.id).data
    const exportResult = approvedExport.result as { document: { type: string } }
    const evaluationResult = approvedEvaluation.result as unknown as {
      version: { evaluations: Array<{ observation: string }> }
    }

    expect(exportRequest.request.requiredPermission).toBe('formulas.export')
    expect(exportResult.document.type).toBe('Formula Export')
    expect(evaluationRequest.request.requiredPermission).toBe('formulas.edit')
    expect(evaluationResult.version.evaluations.some(
      (evaluation) => evaluation.observation === 'Approved operation notebook entry',
    )).toBe(true)
  })

  it('blocks cross-tenant brand grants during member invite', () => {
    const service = createAuthenticatedService()

    expect(() =>
      service.inviteMember({
        email: 'leaky.viewer@example.test',
        role: 'Viewer',
        brandIds: ['brand-other'],
      }),
    ).toThrow(ForbiddenException)
  })

  it('deactivates members by revoking their active sessions', () => {
    const service = createAuthenticatedService()
    const result = service.setMembershipStatus('MBR-LAB', 'DEACTIVATED').data
    const consoleState = service.tenantConsole().data

    expect(result.membership.status).toBe('DEACTIVATED')
    expect(result.revokedSessions.some((session) => session.id === 'SES-0002')).toBe(true)
    expect(consoleState.sessions.find((session) => session.id === 'SES-0002')?.status).toBe('REVOKED')
    expect(result.invariant).toContain('revoke active sessions')
    expect(() => service.login('lab@example.test')).toThrow(ForbiddenException)
  })

  it('prevents deactivating the last active Owner and audits session revocation', () => {
    const service = createAuthenticatedService()

    expect(() => service.setMembershipStatus('MBR-OWNER', 'DEACTIVATED')).toThrow(UnprocessableEntityException)

    const revoked = service.revokeSession('SES-0002').data
    expect(revoked.session.status).toBe('REVOKED')
    expect(revoked.audit.action).toBe('session.revoke')
    expect(revoked.invariant).toContain('tenant-scoped')
  })

  it('creates bounded login sessions and clamps concurrent sessions', () => {
    const service = createAuthenticatedService()
    const firstLogin = service.login(adminEmail, adminPassword).data
    const secondLogin = service.login(adminEmail, adminPassword).data
    const consoleState = service.tenantConsole().data
    const activeAdminSessions = consoleState.sessions.filter(
      (session) => session.email === adminEmail && session.status === 'ACTIVE',
    )

    expect(firstLogin.session.idleExpiresAt).toBeTruthy()
    expect(firstLogin.session.expiresAt).not.toBe(firstLogin.session.idleExpiresAt)
    expect(secondLogin.revokedForLimit.length).toBeGreaterThanOrEqual(1)
    expect(activeAdminSessions.length).toBeLessThanOrEqual(consoleState.securityPolicy.concurrentSessionLimit)
    expect(secondLogin.invariant).toContain('idle and absolute')
  })

  it('signs up a new tenant with an owner session', () => {
    const service = createAuthenticatedService()
    const result = service.signup({
      organizationName: 'Atelier Smoke Test',
      workspaceSlug: 'atelier-smoke',
      email: 'owner@atelier-smoke.test',
      name: 'Atelier Owner',
      password: 'AtelierSmoke2026',
    }).data

    expect(result.organization.slug).toBe('atelier-smoke')
    expect(result.organization.customDomain).toBe('atelier-smoke.labofscents.org')
    expect(result.organization.plan).toBe('Free')
    expect(result.brand.organizationId).toBe(result.organization.id)
    expect(result.membership.id).toBe('MBR-ATELIER-SMOKE')
    expect(result.membership.role).toBe('Owner')
    expect(result.membership.status).toBe('ACTIVE')
    expect(result.membership.organizationId).toBe(result.organization.id)
    expect(result.membership.brandIds).toContain(result.brand.id)
    expect(result.session.email).toBe('owner@atelier-smoke.test')
    expect(result.session.organizationId).toBe(result.organization.id)
    expect(result.session.brandId).toBe(result.brand.id)
    expect(result.subscription.organizationId).toBe(result.organization.id)
    expect(result.subscription.planId).toBe('PLAN-APPRENTICE')
    expect(result.sso.organizationId).toBe(result.organization.id)
    expect(result.sso.domain).toBe('atelier-smoke.labofscents.org')
    expect(result.sso.status).toBe('verified')
    expect(result.audit.action).toBe('auth.signup')
    expect(credentialForEmail(service, 'owner@atelier-smoke.test')?.passwordHash).toMatch(/^pbkdf2:v1:sha256:/)
    expect(service.me().data.userSettings).toMatchObject({
      userId: result.session.userId,
      organizationId: result.organization.id,
      email: 'owner@atelier-smoke.test',
      displayName: 'Atelier Owner',
      preferredLanding: 'dashboard',
    })
    expect(() => service.tenantConsole()).toThrow(ForbiddenException)
    expect(service.billingConsole().data.subscription.organizationId).toBe(result.organization.id)
    expect(service.billingConsole().data.sso.domain).toBe('atelier-smoke.labofscents.org')
    expect(service.billingConsole().data.usage).toMatchObject({
      organizationId: result.organization.id,
      formulas: 0,
      lots: 0,
      documents: 0,
    })
    expect(() => service.assertPlanCapacity('formulas')).not.toThrow()
    expect(() => service.login('owner@atelier-smoke.test')).toThrow(ForbiddenException)
    expect(() => service.login('owner@atelier-smoke.test', 'WrongPassword2026')).toThrow(ForbiddenException)
    expect(service.login('owner@atelier-smoke.test', 'AtelierSmoke2026').data.session.organizationId).toBe(
      result.organization.id,
    )
    expect(() => service.tenantProbe('org-nxl')).toThrow(ForbiddenException)
  })

  it('rejects weak signup passwords before provisioning a tenant', () => {
    const service = createAuthenticatedService()

    expect(() =>
      service.signup({
        organizationName: 'Weak Signup Lab',
        workspaceSlug: 'weak-signup-lab',
        email: 'owner@weak-signup.test',
        name: 'Weak Owner',
        password: 'short1',
      }),
    ).toThrow(UnprocessableEntityException)
    expect(() => service.tenantProbe('org-weak-signup-lab')).toThrow(ForbiddenException)
  })

  it('does not require MFA for formula approval when role is allowed', () => {
    const service = createTestService()
    service.login(adminEmail, adminPassword)

    service.submitFormulaForReview('frm-0421', {
      reviewer: adminEmail,
      comment: 'Approval regression review',
    })
    const approved = service.approveFormula('frm-0421', {
      comment: 'Approved without MFA by admin role',
    }).data
    expect(approved.formula.workflowStatus).toBe('APPROVED')
    expect(approved.version.status).toBe('APPROVED')
  })

  it('requires Admin or Manager role to approve a Formula', () => {
    const service = createTestService()
    service.login(adminEmail, adminPassword)
    service.submitFormulaForReview('frm-0421', {
      reviewer: adminEmail,
      comment: 'Review ready for role-gate validation',
    })

    const internals = service as unknown as {
      sessions: Array<{ id: string; role: string }>
      activeSessionId: string | null
    }
    internals.sessions = internals.sessions.map((session) =>
      session.id === internals.activeSessionId
        ? { ...session, role: 'Owner' }
        : session,
    )
    expect(() =>
      service.approveFormula('frm-0421', { comment: 'Owner should not be able to approve' }),
    ).toThrow(ForbiddenException)

    internals.sessions = internals.sessions.map((session) =>
      session.id === internals.activeSessionId
        ? { ...session, role: 'Lab Manager' }
      : session,
    )
    const approvedByLabManager = service.approveFormula('frm-0421', { comment: 'Lab Manager can approve' }).data
    expect(approvedByLabManager.formula.workflowStatus).toBe('APPROVED')
    expect(approvedByLabManager.version.status).toBe('APPROVED')

    const managerDraft = service.createFormulaDraft({ name: 'Manager Approval draft', targetGrams: 100 }).data
    service.updateFormulaDraft(managerDraft.formula.id, {
      targetMarkets: ['GLOBAL'],
      lines: [{ id: 'mat-line-manager', label: 'Iso E Super', materialId: 'mat-iso', grams: 100 }],
    })
    service.submitFormulaForReview(managerDraft.formula.id, {
      reviewer: adminEmail,
      comment: 'Manager approval check',
    })
    internals.sessions = internals.sessions.map((session) =>
      session.id === internals.activeSessionId
        ? { ...session, role: 'Manager' }
        : session,
    )
    const approvedByManager = service.approveFormula(managerDraft.formula.id, { comment: 'Manager can approve' }).data
    const approved = approvedByManager
    expect(approved.formula.workflowStatus).toBe('APPROVED')
    expect(approved.version.status).toBe('APPROVED')
  })

  it('consumes each MFA recovery code once for a fresh session', () => {
    const service = createTestService()
    service.login(adminEmail, adminPassword)
    const setup = service.beginMfaEnrollment({ password: adminPassword }).data
    const recoveryCode = setup.recoveryCodes[0]!
    service.verifyMfa({ code: currentTestTotp(setup.secret) })

    const freshLogin = service.login(adminEmail, adminPassword).data
    expect(freshLogin.session.mfaVerified).toBe(false)

    const verified = service.verifyMfa({ code: recoveryCode.toLowerCase() }).data
    expect(verified).toMatchObject({
      method: 'recovery',
      remainingRecoveryCodes: 7,
      sessionVerified: true,
      session: {
        id: freshLogin.session.id,
        mfaVerified: true,
      },
    })
    expect(verified.invariant).toContain('consumed exactly once')

    const internals = service as unknown as {
      mfaEnrollmentRecords: Array<{ recoveryCodeHashes: string[] }>
    }
    expect(internals.mfaEnrollmentRecords[0]?.recoveryCodeHashes).toHaveLength(7)
    expect(() => service.verifyMfa({ code: recoveryCode })).toThrow(ForbiddenException)
    expect(internals.mfaEnrollmentRecords[0]?.recoveryCodeHashes).toHaveLength(7)
  })

  it('never stores signatures or credentials in the generic operation approval queue', () => {
    const service = createAuthenticatedService()

    expect(() =>
      service.requestOperationApproval({
        method: 'POST',
        path: '/formulas/frm-0421/approve',
        payload: { signature: 'Someone Else' },
      }),
    ).toThrow(UnprocessableEntityException)
    expect(() =>
      service.requestOperationApproval({
        method: 'POST',
        path: '/materials',
        payload: { name: 'Sensitive material request', currentPassword: 'NeverPersistThis' },
      }),
    ).toThrow(UnprocessableEntityException)
    expect(service.operationApprovalRequests().data.requests).toEqual([])
  })

  it('touches active sessions without changing absolute expiry', () => {
    const service = createAuthenticatedService()
    const before = service.tenantConsole().data.sessions.find((session) => session.id === 'SES-0002')
    const touched = service.touchSession('SES-0002').data

    expect(touched.session.status).toBe('ACTIVE')
    expect(touched.session.expiresAt).toBe(before?.expiresAt)
    expect(touched.audit.action).toBe('session.touch')
    expect(touched.invariant).toContain('idle timeout')
  })

  it('revokes all active sessions for a tenant member while keeping current admin session', () => {
    const service = createAuthenticatedService()
    const revoked = service.revokeAllSessions({ email: 'lab@example.test' }).data
    const consoleState = service.tenantConsole().data
    const activeLabSessions = consoleState.sessions.filter(
      (session) => session.email === 'lab@example.test' && session.status === 'ACTIVE',
    )

    expect(revoked.revokedSessions.length).toBeGreaterThanOrEqual(1)
    expect(revoked.audit.action).toBe('session.revokeAll')
    expect(activeLabSessions).toHaveLength(0)
    expect(consoleState.sessions.some((session) => session.email === adminEmail && session.status === 'ACTIVE')).toBe(true)
  })

  it('logs out the current session with audit evidence', () => {
    const service = createAuthenticatedService()
    const result = service.logout().data

    expect(result.session.status).toBe('REVOKED')
    expect(result.session.revokedReason).toBe('AUTH_LOGOUT')
    expect(result.audit.action).toBe('auth.logout')
    expect(result.invariant).toContain('current active session')
  })

  it('updates customization settings and increments numbering through the sequence service', () => {
    const service = createAuthenticatedService()

    const settings = service.updateSettings({ currency: 'EUR', defaultDilutionPercent: 12 }).data
    const first = service.nextNumber('formula').data
    const second = service.nextNumber('formula').data

    expect(settings.settings.currency).toBe('EUR')
    expect(settings.settings.organizationId).toBe('org-nxl')
    expect(settings.audit.action).toBe('customization.settings.update')
    expect(first.value).toBe('FRM-0422')
    expect(second.value).toBe('FRM-0423')
  })

  it('manages customization console flags, fields, sequences, and branding with audit evidence', () => {
    const service = createAuthenticatedService()

    const consoleState = service.customizationConsole().data
    const flag = service.updateFeatureFlag('formulaCostVisibility', false).data
    const previewBefore = service.previewNumber('formula').data
    const sequence = service.updateNumberingSequence('formula', { pattern: 'FRM-YY-####', nextValue: 430 }).data
    const previewAfter = service.previewNumber('formula').data
    const field = service.createCustomField({
      entity: 'supplier',
      label: 'IFRA review date',
      fieldType: 'date',
      required: true,
    }).data
    const branding = service.updateBranding({
      accentColor: '#37d6a0',
      displayName: 'NOXELIS Atelier',
      logoMode: 'image',
      logoImageUrl: 'https://assets.example.test/noxelis-atelier.svg',
    }).data

    expect(consoleState.customFields.length).toBeGreaterThan(0)
    expect(consoleState.branding.displayName).toBe('NOXELIS Lab')
    expect(flag.featureFlag.enabled).toBe(false)
    expect(flag.audit.action).toBe('customization.featureFlag.update')
    expect(previewBefore.value).toBe('FRM-0422')
    expect(sequence.sequence.nextValue).toBe(430)
    expect(sequence.preview).toBe('FRM-YY-0430')
    expect(previewAfter.value).toBe('FRM-YY-0430')
    expect(field.customField.key).toBe('ifra_review_date')
    expect(field.audit.action).toBe('customization.customField.create')
    expect(branding.branding.accentColor).toBe('#37d6a0')
    expect(branding.branding.logoMode).toBe('image')
    expect(branding.branding.logoImageUrl).toBe('https://assets.example.test/noxelis-atelier.svg')
    expect(branding.audit.action).toBe('customization.branding.update')
  })

  it('exposes workspace branding to signed-in members and validates shared names', () => {
    const service = createAuthenticatedService()

    const branding = service.workspaceBranding().data

    expect(branding.organizationId).toBe('org-nxl')
    expect(branding.displayName).toBe('NOXELIS Lab')
    expect(() => service.updateBranding({ displayName: 'x' })).toThrow(UnprocessableEntityException)
    expect(() => service.updateBranding({ logoMode: 'image' })).toThrow(UnprocessableEntityException)
    expect(() => service.updateBranding({ logoMode: 'image', logoImageUrl: 'http://assets.example.test/logo.png' })).toThrow(
      UnprocessableEntityException,
    )
    expect(() => service.updateBranding({ logoMode: 'image', logoImageUrl: 'https://user:pass@assets.example.test/logo.png' })).toThrow(
      UnprocessableEntityException,
    )
  })

  it('blocks unsafe customization changes', () => {
    const service = createAuthenticatedService()

    expect(() => service.updateNumberingSequence('formula', { pattern: 'FRM-YY', nextValue: 430 })).toThrow(
      UnprocessableEntityException,
    )
    expect(() => service.updateNumberingSequence('formula', { nextValue: 100 })).toThrow(UnprocessableEntityException)
    expect(() =>
      service.createCustomField({ entity: 'material', key: 'odorFamily', label: 'Odor family', fieldType: 'select' }),
    ).toThrow(UnprocessableEntityException)
    expect(() => service.updateBranding({ accentColor: 'blue' })).toThrow(UnprocessableEntityException)
  })

  it('creates materials with CAS duplicate guard and no stock side effect', () => {
    const service = createAuthenticatedService()
    const beforeStockRows = service.inventorySummary().data.length
    const result = service.createMaterial({
      name: 'Vetiveryl Acetate',
      cas: '68917-34-0',
      family: 'Woody vetiver',
      tier: 'Base',
      density: 0.99,
      vaporPressure: 0.002,
      mw: 254.37,
      logP: 4.8,
      source: 'Manual supplier onboarding',
    }).data
    const dedupe = service.materialDedupe('68917-34-0').data

    expect(result.material.id).toBe('mat-vetiveryl-acetate')
    expect(result.audit.action).toBe('material.create')
    expect(result.invariant).toContain('does not create stock')
    expect(dedupe.duplicate).toBe(true)
    expect(service.inventorySummary().data.length).toBe(beforeStockRows + 1)
    expect(() => service.createMaterial({ name: 'Duplicate Vetiver', cas: '68917-34-0' })).toThrow(
      UnprocessableEntityException,
    )
  })

  it('allows Manager role to update material metadata', () => {
    const service = createTestService()
    service.login(adminEmail, adminPassword)

    const internals = service as unknown as {
      sessions: Array<{ id: string; role: string }>
      activeSessionId: string | null
    }
    internals.sessions = internals.sessions.map((session) =>
      session.id === internals.activeSessionId ? { ...session, role: 'Manager' } : session,
    )

    const before = service.material('mat-iso').data
    const nextDensity = before.density + 0.01
    const updated = service.updateMaterial('mat-iso', {
      family: 'Citrus-Manager',
      density: nextDensity,
      costPerGram: before.costPerGram,
      ifraLimit: before.ifraLimit,
    }).data

    expect(updated.material.family).toBe('Citrus-Manager')
    expect(updated.material.density).toBe(nextDensity)
    expect(updated.audit.action).toBe('material.update')
    expect(updated.material.provenance.some((record) => record.field === 'family')).toBe(true)
  })

  it('stages SDS extraction for review and only writes approved provenance fields', () => {
    const service = createAuthenticatedService()
    const review = service.ingestMaterialDocument('mat-iso', {
      source: 'Iso E Super SDS v4',
      version: 'v4',
      fields: { density: 0.97, vaporPressure: 0.0052 },
    }).data
    const beforeApproval = service.material('mat-iso').data
    const approved = service.ingestMaterialDocument('mat-iso', {
      source: 'Iso E Super SDS v4',
      version: 'v4',
      approved: true,
      fields: { density: 0.97, vaporPressure: 0.0052 },
      odor: ['cedar', 'amber', 'transparent'],
    }).data
    const provenance = service.materialProvenance('mat-iso').data

    expect(review.ingestion.status).toBe('REVIEW_REQUIRED')
    expect(review.audit.outcome).toBe('review')
    expect(beforeApproval.density).toBe(0.96)
    expect(approved.ingestion.status).toBe('APPROVED')
    expect(approved.material.density).toBe(0.97)
    expect(approved.material.provenance[0]?.source).toContain('Iso E Super SDS v4')
    expect(provenance.provenance.some((item) => item.field === 'vaporPressure' && item.version === 'v4')).toBe(true)
  })

  it('fills curated PubChem data and returns molecule split for a material', () => {
    const service = createAuthenticatedService()
    const filled = service.pubchemFill('mat-iso').data
    const molecules = service.materialMolecules('mat-iso').data

    expect(filled.material.logP).toBe(4.72)
    expect(filled.audit.action).toBe('material.pubchemFill')
    expect(filled.invariant).toContain('not tenant-crossing scraping')
    expect(molecules.molecules.length).toBeGreaterThanOrEqual(2)
    expect(molecules.totalPercent).toBeGreaterThanOrEqual(100)
  })

  it('creates formula drafts without consuming inventory', () => {
    const service = createAuthenticatedService()
    const beforeMovements = service.inventoryMovements().data.length
    const result = service.createFormulaDraft({ name: 'Midnight Vetiver', targetGrams: 50 }).data

    expect(result.formula.code).toBe('FRM-0422')
    expect(result.formula.formulaType).toBe('FINE_FRAGRANCE')
    expect(result.formula.status).toBe('draft')
    expect(result.invariant).toContain('does not create inventory movement')
    expect(service.formulas().data[0]?.id).toBe(result.formula.id)
    const accord = service.createFormulaDraft({ name: 'Line Test Accord', targetGrams: 30, formulaType: 'ACCORD' }).data
    expect(accord.formula.code).toBe('ACC-0423')
    expect(accord.formula.formulaType).toBe('ACCORD')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
  })

  it('consumes the selected inventory lot when adding an inventory-sourced formula line', () => {
    const service = createAuthenticatedService()
    const formula = service.createFormulaDraft({ name: 'Line Test Accord', targetGrams: 80 }).data.formula
    const beforeLot = service.inventoryConsole().data.lots.find((lot) => lot.id === 'lot-hed-001')
    expect(beforeLot).toBeDefined()
    const result = service.addFormulaLine(formula.id, {
      materialId: 'mat-hedione',
      grams: 16,
      sourceLotId: 'lot-hed-001',
      inventoryConsumptionMode: 'CONSUMED',
    }).data
    const resolved = service.resolveFormula(formula.id).data
    const afterLot = service.inventoryConsole().data.lots.find((lot) => lot.id === 'lot-hed-001')

    expect(result.line.label).toBe('Hedione')
    expect(result.line.sourceLotNumber).toBe('L-HED-014')
    expect(result.line.sourceLocation).toBe('Amber Shelf 2')
    expect(result.line.inventoryConsumptionMode).toBe('CONSUMED')
    expect(result.line.inventoryConsumedGrams).toBe(16)
    expect(result.formula.lines).toHaveLength(1)
    expect(result.leaves[0]?.materialId).toBe('mat-hedione')
    expect(result.totals.totalGrams).toBe(16)
    expect(resolved.leaves[0]?.effectivePercent).toBe(20)
    expect(result.movements).toHaveLength(1)
    expect(result.movements[0]?.type).toBe('LAB_CONSUMPTION')
    expect(afterLot?.quantityGrams).toBe((beforeLot?.quantityGrams ?? 0) - 16)
    expect(result.invariant).toContain('LAB_CONSUMPTION')
    expect(() =>
      service.addFormulaLine(formula.id, {
        materialId: 'mat-hedione',
        grams: 1,
        sourceLotId: 'lot-iso-001',
      }),
    ).toThrow(UnprocessableEntityException)
  })

  it('edits, reorders, and deletes formula lines without consuming inventory', () => {
    const service = createAuthenticatedService()
    const formula = service.createFormulaDraft({ name: 'Editable Accord', targetGrams: 50 }).data.formula
    const firstLine = service.addFormulaLine(formula.id, { materialId: 'mat-hedione', grams: 12 }).data.line
    const secondLine = service.addFormulaLine(formula.id, { materialId: 'mat-iso', grams: 8 }).data.line
    const beforeMovements = service.inventoryMovements().data.length

    const updated = service.updateFormulaLine(formula.id, firstLine.id, { grams: 10, label: 'Hedione HC' }).data
    const moved = service.moveFormulaLine(formula.id, secondLine.id, { direction: 'up' }).data
    const deleted = service.deleteFormulaLine(formula.id, firstLine.id).data

    expect(updated.line.grams).toBe(10)
    expect(updated.line.label).toBe('Hedione HC')
    expect(moved.formula.lines[0]?.id).toBe(secondLine.id)
    expect(deleted.formula.lines).toHaveLength(1)
    expect(deleted.formula.lines[0]?.id).toBe(secondLine.id)
    expect(deleted.invariant).toContain('does not create inventory movement')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
  })

  it('adjusts and reverses inventory when a consumed formula line changes', () => {
    const service = createAuthenticatedService()
    const formula = service.createFormulaDraft({ name: 'Inventory-synced Accord', targetGrams: 60 }).data.formula
    const beforeLot = service.inventoryConsole().data.lots.find((lot) => lot.id === 'lot-hed-001')
    expect(beforeLot).toBeDefined()

    const added = service.addFormulaLine(formula.id, {
      materialId: 'mat-hedione',
      grams: 10,
      sourceLotId: 'lot-hed-001',
      inventoryConsumptionMode: 'CONSUMED',
    }).data
    const updated = service.updateFormulaLine(formula.id, added.line.id, { grams: 14 }).data
    const afterUpdate = service.inventoryConsole().data.lots.find((lot) => lot.id === 'lot-hed-001')
    const deleted = service.deleteFormulaLine(formula.id, added.line.id).data
    const afterDelete = service.inventoryConsole().data.lots.find((lot) => lot.id === 'lot-hed-001')

    expect(updated.movements[0]?.type).toBe('LAB_CONSUMPTION')
    expect(updated.movements[0]?.quantityGrams).toBe(4)
    expect(afterUpdate?.quantityGrams).toBe((beforeLot?.quantityGrams ?? 0) - 14)
    expect(deleted.movements[0]?.type).toBe('REVERSAL')
    expect(deleted.movements[0]?.quantityGrams).toBe(14)
    expect(afterDelete?.quantityGrams).toBe(beforeLot?.quantityGrams)
  })

  it('applies a batch scale to the draft and normalizes the composition', () => {
    const service = createAuthenticatedService()
    const formula = service.createFormulaDraft({ name: 'Scale Test Accord', targetGrams: 100 }).data.formula
    service.addFormulaLine(formula.id, { materialId: 'mat-hedione', grams: 70 })
    service.addFormulaLine(formula.id, { materialId: 'mat-iso', grams: 30 })

    const scaled = service.applyFormulaScale(formula.id, { targetGrams: 50, incrementGrams: 0.01 }).data

    expect(scaled.formula.targetGrams).toBe(50)
    expect(scaled.formula.lines.reduce((total, line) => total + line.grams, 0)).toBe(50)
    expect(scaled.formula.lines.map((line) => line.grams)).toEqual([35, 15])
    expect(scaled.invariant).toContain('without inventory movement')
  })

  it('resolves nested child formulas and blocks formula cycles', () => {
    const service = createAuthenticatedService()
    const parent = service.createFormulaDraft({ name: 'Nested Citrus Trial', targetGrams: 100 }).data.formula
    const nested = service.addFormulaLine(parent.id, {
      childFormulaId: 'frm-accord-citrus',
      grams: 25,
      label: 'Citrus top accord',
    }).data
    const resolved = service.resolveFormula(parent.id).data

    expect(nested.line.childFormulaId).toBe('frm-accord-citrus')
    expect(resolved.leaves.some((leaf) => leaf.materialId === 'mat-bergamot')).toBe(true)
    expect(resolved.leaves[0]?.sourcePath).toContain('Citrus top accord')
    expect(() =>
      service.addFormulaLine('frm-accord-citrus', { childFormulaId: parent.id, grams: 5 }),
    ).toThrow(UnprocessableEntityException)
  })

  it('reviews, approves, evaluates, compares, locks, forks, and exports formula versions without stock movement', () => {
    const service = createAuthenticatedService()
    const beforeMovements = service.inventoryMovements().data.length
    const updated = service.updateFormulaDraft('frm-0421', {
      expectedRevision: 13,
      brief: 'Bench QA brief with stronger drydown persistence.',
    }).data
    const submission = service.submitFormulaForReview('frm-0421', {
      reviewer: adminEmail,
      comment: 'Ready for compliance review',
    }).data
    const approval = service.approveFormula('frm-0421', {
      comment: 'Compliance evidence reviewed',
    }).data
    const evaluation = service.addFormulaEvaluation('frm-0421', approval.version.version, {
      day: 7,
      observation: 'Clear, stable, and aligned with the approved reference.',
      stability: 'PASS',
      rating: 5,
    }).data
    const diff = service.formulaVersionDiff('frm-0421', 'v12', approval.version.version).data
    const exported = service.exportFormula('frm-0421').data
    const forked = service.forkFormula('frm-0421', { comment: 'Continue exploration after approval' }).data
    const versions = service.formulaVersions('frm-0421').data

    expect(updated.formula.draftRevision).toBe(14)
    expect(submission.formula.version).toBe('v13')
    expect(submission.formula.workflowStatus).toBe('IN_REVIEW')
    expect(approval.formula.status).toBe('stable')
    expect(approval.formula.workflowStatus).toBe('APPROVED')
    expect(approval.version.status).toBe('APPROVED')
    expect(approval.ifra.blockerCount).toBe(0)
    expect(evaluation.version.evaluations).toHaveLength(1)
    expect(diff.diff.metadataChanges.some((change) => change.field === 'brief')).toBe(true)
    expect(() => service.addFormulaLine('frm-0421', { materialId: 'mat-hedione', grams: 1 })).toThrow(
      UnprocessableEntityException,
    )
    expect(forked.formula.parentFormulaId).toBe('frm-0421')
    expect(forked.formula.workflowStatus).toBe('DRAFT')
    expect(exported.document.type).toBe('Formula Export')
    expect(exported.document.storageKey).toContain('org-nxl/formulas/')
    expect(versions.versions[0]?.status).toBe('APPROVED')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
  })

  it('rejects stale autosaves and blocks IFRA failures at approval', () => {
    const service = createAuthenticatedService()
    const draft = service.createFormulaDraft({
      name: 'IFRA Blocker Trial',
      targetGrams: 100,
      finalProductConcentrationPercent: 100,
      targetMarkets: ['EU'],
      assignedReviewer: adminEmail,
    }).data.formula
    const saved = service.updateFormulaDraft(draft.id, { expectedRevision: 1, brief: 'First autosave' }).data.formula

    expect(saved.draftRevision).toBe(2)
    expect(() => service.updateFormulaDraft(draft.id, { expectedRevision: 1, brief: 'Stale tab write' })).toThrow(
      UnprocessableEntityException,
    )

    service.addFormulaLine(draft.id, { materialId: 'mat-muscenone', grams: 100 })
    service.submitFormulaForReview(draft.id, { reviewer: adminEmail })
    expect(() => service.approveFormula(draft.id, { comment: 'Should reject due IFRA blocker' })).toThrow(
      UnprocessableEntityException,
    )
  })

  it('keeps Formula records isolated between workspaces', () => {
    const service = createAuthenticatedService()
    const signup = service.signup({
      organizationName: 'Formula Isolation Lab',
      workspaceSlug: 'formula-isolation',
      email: 'owner@formula-isolation.test',
      name: 'Formula Owner',
      password: 'FormulaIsolation2026!',
    }).data
    const tenantFormula = service.createFormulaDraft({ name: 'Private Tenant Formula' }).data.formula

    expect(tenantFormula.organizationId).toBe(signup.organization.id)
    expect(service.formulas().data.some((formula) => formula.id === 'frm-0421')).toBe(false)
    expect(() => service.labUsagePlan('frm-0421', 10)).toThrowError('was not found')
    expect(() => service.createProductionBatch('frm-0421', 10)).toThrowError('was not found')
    expect(() => service.costingFormula('frm-0421')).toThrowError('was not found')
    expect(() => service.generateDocument({ type: 'Formula Spec Sheet', linkedTo: 'frm-0421' })).toThrowError('was not found')

    service.login(adminEmail, adminPassword)
    expect(service.formulas().data.some((formula) => formula.id === tenantFormula.id)).toBe(false)
    expect(() => service.resolveFormula(tenantFormula.id)).toThrowError('was not found')
    expect(() => service.labUsagePlan(tenantFormula.id, 10)).toThrowError('was not found')
    expect(() => service.createProductionBatch(tenantFormula.id, 10)).toThrowError('was not found')
    expect(() => service.costingFormula(tenantFormula.id)).toThrowError('was not found')
    expect(() => service.generateDocument({ type: 'Formula Spec Sheet', linkedTo: tenantFormula.id })).toThrowError('was not found')
  })

  it('scopes Formula inventory sources to the active workspace', () => {
    const service = createAuthenticatedService()
    const adminLotIds = service.inventoryConsole().data.lots.map((lot) => lot.id)
    const signup = service.signup({
      organizationName: 'Formula Inventory Lab',
      workspaceSlug: 'formula-inventory',
      email: 'owner@formula-inventory.test',
      name: 'Formula Inventory Owner',
      password: 'FormulaInventory2026!',
    }).data

    expect(service.inventoryConsole().data.lots).toEqual([])
    expect(service.inventoryConsole().data.movements).toEqual([])

    const formula = service.createFormulaDraft({ name: 'Workspace Lot Formula' }).data.formula
    expect(() =>
      service.addFormulaLine(formula.id, {
        materialId: 'mat-iso',
        grams: 10,
        sourceLotId: adminLotIds[0],
      }),
    ).toThrowError('was not found')
    expect(() =>
      service.adjustInventory({
        lotId: adminLotIds[0],
        direction: 'OUT',
        quantityGrams: 1,
        reason: 'Cross-workspace probe',
      }),
    ).toThrowError('was not found')

    const receipt = service.receiveInventoryReceipt({
      materialId: 'mat-iso',
      lotNumber: 'L-TENANT-ISO-001',
      quantityGrams: 25,
      expiryDate: '2028-01-01',
    }).data
    expect(receipt.lot.organizationId).toBe(signup.organization.id)
    expect(service.inventoryConsole().data.lots.map((lot) => lot.id)).toEqual([receipt.lot.id])

    const linked = service.addFormulaLine(formula.id, {
      materialId: 'mat-iso',
      grams: 10,
      sourceLotId: receipt.lot.id,
    }).data
    expect(linked.line.sourceLotId).toBe(receipt.lot.id)
    expect(linked.line.sourceLotNumber).toBe(receipt.lot.lotNumber)

    service.login(adminEmail, adminPassword)
    expect(service.inventoryConsole().data.lots.some((lot) => lot.id === receipt.lot.id)).toBe(false)
    expect(() => service.lotLabel(receipt.lot.id)).toThrowError('was not found')
  })

  it('receives direct inventory receipts through lot and IN movement', () => {
    const service = createAuthenticatedService()
    const beforeMovements = service.inventoryMovements().data.length
    const receipt = service.receiveInventoryReceipt({
      materialId: 'mat-iso',
      lotNumber: 'L-ISO-999',
      quantityGrams: 25,
      expiryDate: '2028-01-01',
    }).data

    expect(receipt.lot.lotNumber).toBe('L-ISO-999')
    expect(receipt.movement.direction).toBe('IN')
    expect(receipt.summary?.available).toBeGreaterThan(232)
    expect(receipt.invariant).toContain('immutable IN movement')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements + 1)
  })

  it('adjusts stock only through immutable adjustment movements and blocks negative availability', () => {
    const service = createAuthenticatedService()
    const beforeMovements = service.inventoryMovements().data.length
    const adjustment = service.adjustInventory({
      lotId: 'lot-hed-001',
      direction: 'OUT',
      quantityGrams: 6,
      reason: 'Cycle count variance',
    }).data

    expect(adjustment.lot.quantityGrams).toBe(180)
    expect(adjustment.movement.type).toBe('ADJUSTMENT')
    expect(adjustment.movement.direction).toBe('OUT')
    expect(adjustment.summary?.available).toBe(180)
    expect(adjustment.invariant).toContain('only through immutable movement')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements + 1)

    expect(() =>
      service.adjustInventory({
        lotId: 'lot-iso-001',
        direction: 'OUT',
        quantityGrams: 240,
        reason: 'Invalid write down',
      }),
    ).toThrow(UnprocessableEntityException)
  })

  it('transfers lots between storage locations without changing stock quantity', () => {
    const service = createAuthenticatedService()
    const beforeSummary = service.inventorySummary().data.find((item) => item.material.id === 'mat-ambroxan')
    const transfer = service.transferInventory({
      lotId: 'lot-amb-001',
      toLocation: 'Cold Room A',
    }).data
    const afterSummary = service.inventorySummary().data.find((item) => item.material.id === 'mat-ambroxan')

    expect(transfer.lot.location).toBe('Cold Room A')
    expect(transfer.movement.type).toBe('TRANSFER')
    expect(transfer.movement.direction).toBe('MOVE')
    expect(transfer.movement.balanceAfter).toBe(38)
    expect(afterSummary?.available).toBe(beforeSummary?.available)
    expect(afterSummary?.current).toBe(beforeSummary?.current)
    expect(transfer.invariant).toContain('without changing stock quantity')
  })

  it('changes lot quality eligibility without creating a stock movement', () => {
    const service = createAuthenticatedService()
    const beforeMovements = service.inventoryMovements().data.length
    const beforeSummary = service.inventorySummary().data.find((item) => item.material.id === 'mat-hedione')
    const quality = service.changeLotQuality('lot-hed-001', {
      qualityStatus: 'ON_HOLD',
      reason: 'Retest required',
    }).data
    const afterSummary = service.inventorySummary().data.find((item) => item.material.id === 'mat-hedione')

    expect(quality.lot.qualityStatus).toBe('ON_HOLD')
    expect(quality.movementCount).toBe(beforeMovements)
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
    expect(afterSummary?.available).toBeLessThan(beforeSummary?.available ?? 0)
    expect(quality.invariant).toContain('creates no inventory movement')
  })

  it('reconciles stock take variance through immutable adjustment movement', () => {
    const service = createAuthenticatedService()
    const beforeMovements = service.inventoryMovements().data.length
    const stockTake = service.performStockTake({
      lotId: 'lot-hed-001',
      countedGrams: 182.5,
      reason: 'Cycle count shelf A',
      actor: 'Inventory Manager',
    }).data

    expect(stockTake.lot.quantityGrams).toBe(182.5)
    expect(stockTake.stockTake.status).toBe('ADJUSTED')
    expect(stockTake.stockTake.varianceGrams).toBe(-3.5)
    expect(stockTake.movement?.type).toBe('ADJUSTMENT')
    expect(stockTake.movement?.direction).toBe('OUT')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements + 1)
    expect(stockTake.invariant).toContain('immutable ADJUSTMENT movement')

    expect(() =>
      service.performStockTake({
        lotId: 'lot-iso-001',
        countedGrams: 10,
        reason: 'Invalid cycle count',
      }),
    ).toThrow(UnprocessableEntityException)
  })

  it('records matched stock take without moving inventory', () => {
    const service = createAuthenticatedService()
    const beforeMovements = service.inventoryMovements().data.length
    const stockTake = service.performStockTake({
      lotId: 'lot-amb-001',
      countedGrams: 38,
      reason: 'Vault cycle count',
    }).data

    expect(stockTake.stockTake.status).toBe('MATCHED')
    expect(stockTake.movement).toBeUndefined()
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
    expect(stockTake.invariant).toContain('without changing stock quantity')
  })

  it('generates lot labels, genealogy, locations, and shopping list without stock movement', () => {
    const service = createAuthenticatedService()
    const beforeMovements = service.inventoryMovements().data.length
    const location = service.createStorageLocation({
      name: 'Retest Bin 1',
      zone: 'Quality',
      condition: 'Retest hold',
      capacityGrams: 600,
    }).data
    const label = service.lotLabel('lot-hed-001').data
    const genealogy = service.lotGenealogy('lot-hed-001').data
    const suggestions = service.inventoryReorderSuggestions().data

    expect(location.location.name).toBe('Retest Bin 1')
    expect(label.label.qrValue).toContain('OLFOPS|LOT|lot-hed-001')
    expect(genealogy.material.id).toBe('mat-hedione')
    expect(genealogy.documents.some((document) => document.id === 'DOC-119')).toBe(true)
    expect(suggestions.suggestions.length).toBeGreaterThan(0)
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
    expect(suggestions.invariant).toContain('without reserving or moving inventory')
  })

  it('runs production consumption separately from lab usage', () => {
    const service = createAuthenticatedService()
    const batch = service.createProductionBatch('frm-0421', 25).data
    const result = service.consumeProductionBatch(batch.id).data

    expect(batch.workOrder.steps.some((step) => step.label === 'Weigh raw materials')).toBe(true)
    expect(result.batchId).toBe(batch.id)
    expect(result.movements.length).toBeGreaterThan(0)
    expect(result.movements.every((movement) => movement.type === 'PRODUCTION_CONSUMPTION')).toBe(true)
    expect(service.productionBatches().data.find((item) => item.id === batch.id)?.genealogy.inputMovementIds).toEqual(
      result.movements.map((movement) => movement.id),
    )
    expect(result.invariant).toContain('separate from lab usage')
  })

  it('gates production batches by approved formula, consumption, QC, and release state', () => {
    const service = createAuthenticatedService()
    const draft = service.createFormulaDraft({ name: 'Unapproved production test' }).data.formula

    expect(() => service.createProductionBatch(draft.id, 25)).toThrow(/must be approved/)

    const batch = service.createProductionBatch('frm-0421', 25).data
    expect(() => service.updateProductionBatchStatus(batch.id, 'RELEASED')).toThrow(/must consume inventory/)
    expect(() => service.costingBatch(batch.id)).toThrow(/must be released/)

    service.consumeProductionBatch(batch.id)
    const filtration = service.updateProductionBatchStatus(batch.id, 'FILTRATION').data
    expect(filtration.batch.status).toBe('FILTRATION')

    const qc = service.updateProductionBatchStatus(batch.id, 'QC').data
    expect(qc.batch.status).toBe('QC')

    const passed = service.qcProductionBatch(batch.id, 'PASSED').data
    expect(passed.status).toBe('BOTTLING')
    expect(passed.qcChecks.every((check) => check.result === 'PASSED')).toBe(true)

    const released = service.updateProductionBatchStatus(batch.id, 'RELEASED').data
    expect(released.batch.status).toBe('RELEASED')
    expect(released.batch.outputLot?.id).toBe(`FG-${batch.id}`)
    expect(released.batch.genealogy.outputLotId).toBe(released.batch.outputLot?.id)
    expect(released.batch.yieldVariancePercent).toBeLessThan(0)
    expect(released.invariant).toContain('audited and gated')

    const costSheet = service.costingBatch(batch.id).data
    expect(costSheet.costingBasis).toBe('RELEASED_OUTPUT')
    expect(costSheet.materialCostBasis).toBe('ACTUAL_LOT_CONSUMPTION')
    expect(costSheet.outputGrams).toBe(released.batch.outputLot?.quantityGrams)
    expect(costSheet.costPerGram).toBeCloseTo(costSheet.totalCost / costSheet.outputGrams, 4)
  })

  it('receives purchase orders into inventory through lot and IN movement', () => {
    const service = createAuthenticatedService()
    const receipt = service.receivePurchaseOrder('PO-2026-014').data

    expect(receipt.lot.materialId).toBe('mat-bergamot')
    expect(receipt.movement.direction).toBe('IN')
    expect(receipt.priceHistory.source).toBe('PO_RECEIPT')
    expect(receipt.invariant).toContain('creates lot and IN movement')
  })

  it('runs procurement supplier, PO state, partial receipt, and price history workflow', () => {
    const service = createAuthenticatedService()
    const beforeMovements = service.inventoryMovements().data.length
    const supplier = service.createSupplier({
      name: 'North Aroma Cooperative',
      country: 'US',
      contactEmail: 'po@north-aroma.test',
      leadTimeDays: 10,
      preferredMaterialIds: ['mat-vanillin'],
    }).data

    expect(supplier.supplier.status).toBe('review')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)

    const draft = service.createPurchaseOrder({
      supplierId: supplier.supplier.id,
      materialId: 'mat-vanillin',
      quantityGrams: 80,
      unitCost: 0.12,
      expectedDate: '2026-07-22',
    }).data

    expect(draft.purchaseOrder.status).toBe('DRAFT')
    expect(draft.invariant).toContain('does not reserve or move inventory')
    expect(() => service.receivePurchaseOrder(draft.purchaseOrder.id, { receivedGrams: 20 })).toThrow(/must be sent/)

    const sent = service.updatePurchaseOrderStatus(draft.purchaseOrder.id, 'SENT').data
    expect(sent.purchaseOrder.status).toBe('SENT')

    const partial = service.receivePurchaseOrder(draft.purchaseOrder.id, { receivedGrams: 30 }).data
    expect(partial.purchaseOrder.status).toBe('PARTIAL')
    expect(partial.purchaseOrder.receivedGrams).toBe(30)
    expect(partial.priceHistory.unitCost).toBe(0.12)

    const finalReceipt = service.receivePurchaseOrder(draft.purchaseOrder.id).data
    expect(finalReceipt.purchaseOrder.status).toBe('RECEIVED')
    expect(finalReceipt.purchaseOrder.receivedGrams).toBe(80)

    const history = service.materialPriceHistory('mat-vanillin').data
    expect(history.filter((entry) => entry.purchaseOrderId === draft.purchaseOrder.id)).toHaveLength(2)
  })

  it('runs commerce SKU, price list, quote, and sample workflow without stock movement', () => {
    const service = createAuthenticatedService()
    const beforeMovements = service.inventoryMovements().data.length

    const skuCreate = service.createCatalogSku({
      materialId: 'mat-hedione',
      name: 'Hedione HC 10g',
      description: 'High clarity hedione studio pack',
      packSizeGrams: 10,
      price: 9,
      tier: 'Studio',
      moqPacks: 1,
    }).data
    expect(skuCreate.invariant).toContain('stores no stock')
    expect(skuCreate.sku.canSellPacks).toBeGreaterThan(0)

    const priceList = service.createPriceList({
      name: 'Studio Loyalty',
      customerGroup: 'Studio',
      multiplier: 0.9,
      sampleEligible: true,
    }).data
    expect(priceList.invariant).toContain('without mutating inventory')

    const quote = service.createQuote({
      skuId: skuCreate.sku.id,
      customer: 'Maison Trial Studio',
      customerGroup: 'Studio',
      quantityPacks: 2,
    }).data
    expect(quote.quote.status).toBe('SENT')
    expect(quote.quote.total).toBe(16.2)
    expect(quote.invariant).toContain('creates no reservation or movement')

    const sample = service.requestSample({
      skuId: skuCreate.sku.id,
      customer: 'Maison Trial Studio',
      packs: 1,
    }).data
    expect(sample.sample.status).toBe('REQUESTED')
    expect(sample.invariant).toContain('does not reserve or move stock')
    expect(service.inventoryMovements().data).toHaveLength(beforeMovements)
  })

  it('prices and reserves each line of a multi-SKU quote and order', () => {
    const service = createAuthenticatedService()
    const beforeMovements = service.inventoryMovements().data.length

    const quote = service.createQuote({
      customerId: 'CUS-DEMO',
      lines: [
        { skuId: 'SKU-ISO-050', quantityPacks: 1 },
        { skuId: 'SKU-BER-025', quantityPacks: 1 },
      ],
    }).data.quote

    expect(quote.lines).toEqual([
      { skuId: 'SKU-ISO-050', quantityPacks: 1, unitPrice: 18, lineTotal: 18 },
      { skuId: 'SKU-BER-025', quantityPacks: 1, unitPrice: 16, lineTotal: 16 },
    ])
    expect(quote.total).toBe(34)
    expect(service.inventoryMovements().data).toHaveLength(beforeMovements)

    const order = service.createOrder({
      customerId: 'CUS-DEMO',
      lines: [
        { skuId: 'SKU-ISO-050', quantity: 1 },
        { skuId: 'SKU-BER-025', quantity: 1 },
      ],
    }).data.order
    const reservation = service.reserveOrder(order.id).data
    const reservedOrder = service.orders().data.find((item) => item.id === order.id)

    expect(order.lines).toHaveLength(2)
    expect(order.total).toBe(34)
    expect(reservedOrder?.reservedGrams).toBe(75)
    expect(reservation.allocations.reduce((sum, allocation) => sum + allocation.allocatedGrams, 0)).toBe(75)
    expect(service.inventoryMovements().data).toHaveLength(beforeMovements)
  })

  it('runs order lifecycle through reserve, pack, ship, and fulfillment trace', () => {
    const service = createAuthenticatedService()
    const beforeMovements = service.inventoryMovements().data.length
    const order = service.createOrder({
      skuId: 'SKU-ISO-050',
      customerId: 'CUS-DEMO',
      quantity: 1,
      taxPercent: 8,
      shippingCost: 12,
    }).data.order
    expect(order.status).toBe('CONFIRMED')

    const reservation = service.reserveOrder(order.id).data
    const afterReserveMovements = service.inventoryMovements().data.length
    expect(() => service.reserveOrder(order.id)).toThrow(/cannot be reserved/)

    const pack = service.packOrder(order.id).data
    const ship = service.shipOrder(order.id, { carrier: 'DHL', trackingNumber: 'DHL-PHASE12' }).data
    const fulfillment = service.fulfillOrder(order.id).data

    expect(reservation.invariant).toContain('creates no InventoryMovement')
    expect(afterReserveMovements).toBe(beforeMovements)
    expect(pack.document.type).toBe('PACKING_SLIP')
    expect(ship.shipment?.trackingNumber).toBe('DHL-PHASE12')
    expect(fulfillment.movements.every((movement) => movement.direction === 'OUT')).toBe(true)
    expect(fulfillment.invariant).toContain('lot traceability')
    expect(service.orderDocuments().data.map((document) => document.type)).toEqual(
      expect.arrayContaining(['PICK_LIST', 'PACKING_SLIP', 'INVOICE', 'COA']),
    )
    expect(service.shipments().data[0]?.allocations.length).toBeGreaterThan(0)
  })

  it('cancels reserved orders by releasing reservation without movement', () => {
    const service = createAuthenticatedService()
    const order = service.createOrder({
      skuId: 'SKU-ISO-050',
      customerId: 'CUS-DEMO',
      quantity: 1,
    }).data.order
    const beforeMovements = service.inventoryMovements().data.length

    service.reserveOrder(order.id)
    const cancellation = service.cancelOrder(order.id).data

    expect(cancellation.invariant).toContain('without creating InventoryMovement')
    expect(cancellation.releasedAllocations.length).toBeGreaterThan(0)
    expect(service.inventoryMovements().data).toHaveLength(beforeMovements)
  })

  it('builds costing read models from formula, batch, SKU margin, valuation, and COGS', () => {
    const service = createAuthenticatedService()
    const releasedBatch = service.createProductionBatch('frm-0421', 25).data
    service.consumeProductionBatch(releasedBatch.id)
    service.updateProductionBatchStatus(releasedBatch.id, 'FILTRATION')
    service.updateProductionBatchStatus(releasedBatch.id, 'QC')
    service.qcProductionBatch(releasedBatch.id, 'PASSED')
    service.updateProductionBatchStatus(releasedBatch.id, 'RELEASED')
    const beforeCostingMovements = service.inventoryMovements().data.length
    const overview = service.costingOverview().data
    const formula = service.costingFormula('frm-0421').data
    const batch = service.costingBatch(releasedBatch.id).data
    const sku = service.costingSku('SKU-ISO-050').data
    const valuation = service.costingValuation().data

    expect(overview.formula.lines.length).toBeGreaterThan(0)
    expect(overview.methodPolicies.length).toBeGreaterThan(0)
    expect(overview.landedCosts.length).toBeGreaterThan(0)
    expect(overview.cogs.length).toBeGreaterThan(0)
    expect(formula.costPerGram).toBeGreaterThan(0)
    expect(formula.mostExpensiveMaterial).not.toBe('n/a')
    expect(batch.sourceFormulaCost.formulaId).toBe('frm-0421')
    expect(batch.costingBasis).toBe('RELEASED_OUTPUT')
    expect(batch.totalCost).toBeGreaterThan(batch.materialCost)
    expect(sku.marginPercent).toBeGreaterThan(0)
    expect(valuation.totalValue).toBeGreaterThan(0)
    expect(valuation.invariant).toContain('reconciles')
    expect(service.inventoryMovements().data).toHaveLength(beforeCostingMovements)
  })

  it('serves analytics read models and report runs without mutating the movement ledger', () => {
    const service = createAuthenticatedService()
    const beforeMovements = service.inventoryMovements().data.length
    const dashboard = service.analyticsDashboard().data
    const burnRate = service.analyticsBurnRate().data
    const forecast = service.analyticsLowStockForecast().data
    const expiry = service.analyticsExpiryRisk().data
    const ranking = service.analyticsCostRanking().data
    const inventory = service.analyticsInventory().data
    const reports = service.analyticsReports().data
    const run = service.runAnalyticsReport('RPT-FIN-WEEKLY').data

    expect(dashboard.invariant).toContain('read-only')
    expect(dashboard.roleWidgets.length).toBeGreaterThan(0)
    expect(burnRate.length).toBeGreaterThan(0)
    expect(forecast.length).toBeGreaterThan(0)
    expect(expiry.length).toBeGreaterThan(0)
    expect(ranking[0]?.rank).toBe(1)
    expect(inventory.length).toBeGreaterThan(0)
    expect(reports.some((report) => report.id === 'RPT-FIN-WEEKLY')).toBe(true)
    expect(run.report.lastRunAt).toBeDefined()
    expect(run.audit.action).toBe('analytics.report.run')
    expect(service.inventoryMovements().data).toHaveLength(beforeMovements)
  })

  it('queues enterprise audit export as a tenant-scoped control', () => {
    const service = createAuthenticatedService()
    const exportJob = service.auditExport().data

    expect(exportJob.status).toBe('READY')
    expect(exportJob.scope).toBe('org-nxl')
    expect(exportJob.checksum).toMatch(/^sha256:/)
    expect(exportJob.downloadUrl).toContain('/audit/exports/')
    expect(exportJob.audit.action).toBe('audit.export')
    expect(service.billingConsole().data.auditExports.some((job) => job.id === exportJob.id)).toBe(true)
  })

  it('manages enterprise trust layer lifecycle without exposing persisted secrets', () => {
    const service = createAuthenticatedService()

    expect(() =>
      service.updateSsoConfig({
        domain: 'labofscents.org',
        issuerUrl: 'https://idp.labofscents.org/oauth2/default',
        enforceSso: true,
        scim: { enabled: true },
      }),
    ).toThrow(ForbiddenException)

    service.selectBillingPlan({ planId: 'PLAN-MAISON' })
    const sso = service.updateSsoConfig({
      domain: 'labofscents.org',
      issuerUrl: 'https://idp.labofscents.org/oauth2/default',
      metadataUrl: 'https://idp.labofscents.org/.well-known/openid-configuration',
      clientId: 'oo-enterprise',
      enforceSso: true,
      scim: { enabled: true },
      roleMapping: { 'labofscents-admins': 'Owner', 'labofscents-lab': 'Lab Manager' },
    }).data
    const scim = service.rotateScimToken().data

    expect(sso.config.status).toBe('enforced')
    expect(sso.config.organizationId).toBe('org-nxl')
    expect(scim.secret).toMatch(/^scim_oo_/)
    expect(scim.config.scim.tokenLastFour).toBe(scim.secret?.slice(-4).toUpperCase())
    expect(scim.config.scim).not.toHaveProperty('tokenHash')

    const createdKey = service.createApiKey({
      label: 'ERP bridge',
      scopes: ['materials.read', 'orders.write', 'not.allowed'],
    }).data
    const rotatedKey = service.rotateApiKey(createdKey.apiKey.id).data
    const revokedKey = service.revokeApiKey(createdKey.apiKey.id).data

    expect(createdKey.secret).toMatch(/^oo_live_/)
    expect(createdKey.apiKey.scopes).toEqual(['materials.read', 'orders.write'])
    expect(createdKey.apiKey).not.toHaveProperty('secretHash')
    expect(rotatedKey.secret).toMatch(/^oo_live_/)
    expect(rotatedKey.secret).not.toBe(createdKey.secret)
    expect(revokedKey.apiKey.status).toBe('revoked')
    expect(revokedKey.apiKey).not.toHaveProperty('secretHash')

    const webhook = service.createWebhook({
      url: 'https://hooks.labofscents.org/ops',
      events: ['order.fulfilled', 'audit.export.ready', 'unsupported.event'],
    }).data
    const rotatedWebhook = service.rotateWebhookSecret(webhook.webhook.id).data
    const pausedWebhook = service.deleteWebhook(webhook.webhook.id).data

    expect(webhook.secret).toMatch(/^whsec_/)
    expect(webhook.webhook.events).toEqual(['order.fulfilled', 'audit.export.ready'])
    expect(rotatedWebhook.secret).toMatch(/^whsec_/)
    expect(rotatedWebhook.secret).not.toBe(webhook.secret)
    expect(pausedWebhook.webhook.status).toBe('paused')

    const consoleState = service.billingConsole().data
    expect(consoleState.sso.domain).toBe('labofscents.org')
    expect(consoleState.apiKeys.some((key) => key.id === createdKey.apiKey.id && key.status === 'revoked')).toBe(true)
    expect(consoleState.webhooks.some((item) => item.id === webhook.webhook.id && item.status === 'paused')).toBe(true)
    expect(consoleState.readiness.some((check) => check.key === 'audit-export-evidence')).toBe(true)
  })

  it('enforces commercial subscription freeze and plan capacity before writes', () => {
    const service = createAuthenticatedService()
    const consoleState = service.billingConsole().data

    expect(consoleState.plans.map((plan) => plan.id)).toEqual([
      'PLAN-APPRENTICE',
      'PLAN-ARTISAN',
      'PLAN-ATELIER',
      'PLAN-MAISON',
    ])
    expect(consoleState.invariant).toContain('server-side')
    expect(consoleState.limitChecks.every((check) => check.status !== 'blocked')).toBe(true)
    expect(() => service.assertPlanCapacity('materials', 999999)).toThrow(UnprocessableEntityException)

    const freeze = service.freezeSubscription({ reason: 'Dunning test' }).data
    expect(freeze.mode).toBe('freeze')
    expect(() => service.assertCommercialWriteAllowed('materials.create')).toThrow(ForbiddenException)

    const reactivation = service.reactivateSubscription().data
    expect(reactivation.mode).toBe('reactivate')
    expect(() => service.assertCommercialWriteAllowed('materials.create')).not.toThrow()
  })

  it('lets a new signup tenant choose a paid trial plan without leaking another tenant subscription', () => {
    const service = createTestService()
    const signup = service.signup({
      organizationName: 'Billing Onboarding Lab',
      workspaceSlug: 'billing-onboarding-lab',
      email: 'owner@billing-onboarding.test',
      name: 'Billing Owner',
      password: 'BillingOwner2026',
    }).data

    expect(signup.subscription.planId).toBe('PLAN-APPRENTICE')
    expect(service.billingConsole().data.plan.name).toBe('Apprentice')

    const selection = service.selectBillingPlan({ planId: 'PLAN-ARTISAN' }).data
    const consoleState = service.billingConsole().data

    expect(selection.mode).toBe('plan_selected')
    expect(consoleState.subscription.organizationId).toBe(signup.organization.id)
    expect(consoleState.sso.organizationId).toBe(signup.organization.id)
    expect(consoleState.sso.domain).toBe('billing-onboarding-lab.labofscents.org')
    expect(consoleState.sso.status).toBe('verified')
    expect(consoleState.apiKeys).toEqual([])
    expect(consoleState.webhooks).toEqual([])
    expect(consoleState.auditExports).toEqual([])
    expect(consoleState.subscription.planId).toBe('PLAN-ARTISAN')
    expect(consoleState.subscription.status).toBe('trialing')
    expect(consoleState.plan.name).toBe('Artisan')
    expect(consoleState.usage.activeSeats).toBe(1)
    expect(consoleState.invoices.some((invoice) => invoice.subscriptionId === consoleState.subscription.id)).toBe(true)
    expect(service.billingConsole().data.subscription.planId).toBe('PLAN-ARTISAN')
    expect(() => service.tenantProbe('org-nxl')).toThrow(ForbiddenException)
  })

  it('serves billing actions and webhook retry evidence for sell-ready operations', () => {
    const service = createAuthenticatedService()
    const checkout = service.startBillingCheckout({ mode: 'manual_sales' }).data
    const portal = service.openBillingPortal().data
    const retry = service.retryWebhookDelivery('WHD-0002').data
    const consoleState = service.billingConsole().data

    expect(checkout.mode).toBe('manual_sales')
    expect(checkout.url).toContain('sales@labofscents.org')
    expect(portal.mode).toBe('portal')
    expect(retry.delivery.status).toBe('delivered')
    expect(retry.delivery.idempotencyKey).toBe('whd_document_downloaded_DOC-121')
    expect(consoleState.webhookDeliveries.find((delivery) => delivery.id === 'WHD-0002')?.attempts).toBe(3)
  })
})

