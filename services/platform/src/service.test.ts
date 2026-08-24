import { describe, expect, it, vi } from 'vitest'
import { pbkdf2Sync } from 'node:crypto'
import { MemoryPlatformRepository } from './memory-repository.js'
import { hashPassword, hashSecret, openSecret, verifyPassword } from './crypto.js'
import { PlatformError, PlatformService } from './service.js'

function makeService(overrides: ConstructorParameters<typeof PlatformService>[1] = {}) { const repository = new MemoryPlatformRepository(); return { repository, service: new PlatformService(repository, { baseDomain: 'olfactoryops.com', sessionPepper: 'test-session', passwordPepper: 'test-password', passwordResetEncryptionKey: 'test-password-reset-key', ...overrides }) } }
async function verifySignup(service: PlatformService, signup: Awaited<ReturnType<PlatformService['signup']>>) { await service.verifyEmail(signup.verificationToken); return service.contextFromToken(signup.rawSessionToken, signup.hostname.hostname) }

describe('V2 platform security core', () => {
  it('creates an isolated owner workspace and never stores raw credentials', async () => {
    const { repository, service } = makeService()
    const result = await service.signup({ organizationName: 'Atelier One', workspaceSlug: 'atelier-one', email: 'owner@example.test', displayName: 'Owner', password: 'Correct Horse Battery 12!' })
    expect(result.workspaceUrl).toBe('https://atelier-one.olfactoryops.com/v2/workspace')
    expect(result.membership.role).toBe('Owner')
    expect(repository.users[0]?.passwordHash).not.toContain('Correct Horse Battery 12!')
    expect(repository.sessions[0]?.tokenVerifierHash).not.toContain(result.rawSessionToken)
    expect(repository.verifications[0]?.tokenHash).not.toContain(result.verificationToken)
  })

  it('rejects reserved workspace slugs and cross-tenant workspace access', async () => {
    const { service } = makeService()
    await expect(service.signup({ organizationName: 'API', workspaceSlug: 'api', email: 'a@example.test', displayName: 'A', password: 'Correct Horse Battery 12!' })).rejects.toMatchObject({ code: 'HOSTNAME_RESERVED' })
    const first = await service.signup({ organizationName: 'First', workspaceSlug: 'first', email: 'first@example.test', displayName: 'First', password: 'Correct Horse Battery 12!' })
    const second = await service.signup({ organizationName: 'Second', workspaceSlug: 'second', email: 'second@example.test', displayName: 'Second', password: 'Correct Horse Battery 12!' })
    const context = await verifySignup(service, first)
    await expect(service.switchWorkspace(first.rawSessionToken, 'first.olfactoryops.com', second.membership.organizationId)).rejects.toMatchObject({ code: 'TENANT_ACCESS_DENIED' })
    expect(context.context.organizationId).toBe(first.membership.organizationId)
  })

  it('rejects invalid explicit host syntax and duplicate email atomically', async () => {
    const { service } = makeService()
    await expect(service.signup({ organizationName: 'Invalid', workspaceSlug: 'Bad Workspace', email: 'invalid@example.test', displayName: 'Invalid', password: 'Correct Horse Battery 12!' })).rejects.toMatchObject({ code: 'INVALID_HOSTNAME' })
    await service.signup({ organizationName: 'Taken', workspaceSlug: 'taken', email: 'taken@example.test', displayName: 'Taken', password: 'Correct Horse Battery 12!' })
    await expect(service.signup({ organizationName: 'Other', workspaceSlug: 'other', email: 'taken@example.test', displayName: 'Other', password: 'Correct Horse Battery 12!' })).rejects.toMatchObject({ code: 'EMAIL_CONFLICT' })
  })

  it('requires valid CSRF for unsafe actions and supports session revocation', async () => {
    const { service } = makeService()
    const signup = await service.signup({ organizationName: 'Security', workspaceSlug: 'security', email: 'security@example.test', displayName: 'Security', password: 'Correct Horse Battery 12!' })
    const resolved = await verifySignup(service, signup)
    await expect(service.assertCsrf(resolved.context, signup.rawSessionToken, 'wrong')).rejects.toMatchObject({ code: 'CSRF_DENIED' })
    await service.assertCsrf(resolved.context, signup.rawSessionToken, signup.csrfToken)
    await service.revokeSession(resolved.context, resolved.session.id)
    await expect(service.contextFromToken(signup.rawSessionToken, 'security.olfactoryops.com')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
  })

  it('rotates the verifier through an authenticated workspace bootstrap', async () => {
    const { service } = makeService()
    const signup = await service.signup({ organizationName: 'Bootstrap', workspaceSlug: 'bootstrap', email: 'bootstrap@example.test', displayName: 'Bootstrap', password: 'Correct Horse Battery 12!' })
    await service.verifyEmail(signup.verificationToken)
    const bootstrapped = await service.bootstrapCsrf(signup.rawSessionToken, signup.hostname.hostname)
    expect(bootstrapped.rawSessionToken).not.toBe(signup.rawSessionToken)
    const resolved = await service.contextFromToken(bootstrapped.rawSessionToken, signup.hostname.hostname)
    await service.assertCsrf(resolved.context, bootstrapped.rawSessionToken, bootstrapped.csrfToken)
    await expect(service.contextFromToken(signup.rawSessionToken, signup.hostname.hostname)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
  })

  it('verifies Web Crypto password hashes with constant-time comparison and rejects malformed hashes', async () => {
    const hash = await hashPassword('person@example.test', 'Correct Horse Battery 12!', 'pepper')
    expect(await verifyPassword('person@example.test', 'Correct Horse Battery 12!', hash, 'pepper')).toBe(true)
    expect(await verifyPassword('person@example.test', 'wrong password', hash, 'pepper')).toBe(false)
    expect(await verifyPassword('person@example.test', 'Correct Horse Battery 12!', 'not-a-hash', 'pepper')).toBe(false)
    const legacySalt = Buffer.alloc(16).toString('base64url')
    const legacyDigest = pbkdf2Sync('pepper:person@example.test:Correct Horse Battery 12!', legacySalt, 120_000, 32, 'sha256').toString('base64url')
    expect(await verifyPassword('person@example.test', 'Correct Horse Battery 12!', `pbkdf2:v2:sha256:120000:${legacySalt}:${legacyDigest}`, 'pepper')).toBe(true)
    expect(hashSecret('session', 'pepper')).not.toContain('session')
  })

  it('enforces owner governance and managed-beta billing projection', async () => {
    const { service } = makeService()
    const signup = await service.signup({ organizationName: 'Governance', workspaceSlug: 'governance', email: 'governance@example.test', displayName: 'Governance', password: 'Correct Horse Battery 12!' })
    const resolved = await verifySignup(service, signup)
    await expect(service.setRolePermissions(resolved.context, 'Owner', ['tenant.view'])).rejects.toMatchObject({ code: 'OWNER_LOCKOUT' })
    await expect(service.billing(resolved.context)).resolves.toMatchObject({ mode: 'MANAGED_BETA', status: 'ACTIVE' })
  })

  it('creates separated privacy and workspace export requests', async () => {
    const { service } = makeService()
    const signup = await service.signup({ organizationName: 'Privacy', workspaceSlug: 'privacy', email: 'privacy@example.test', displayName: 'Privacy', password: 'Correct Horse Battery 12!' })
    const resolved = await verifySignup(service, signup)
    const personal = await service.requestPrivacyExport(resolved.context)
    const workspace = await service.requestWorkspaceExport(resolved.context)
    expect(personal.kind).toBe('PRIVACY')
    expect(workspace.kind).toBe('WORKSPACE')
    expect(personal.id).not.toBe(workspace.id)
  })

  it('returns normalized platform errors for invalid actions', () => {
    const error = new PlatformError('ORIGIN_DENIED', 'blocked', 403)
    expect(error.status).toBe(403)
    expect(error.code).toBe('ORIGIN_DENIED')
  })

  it('blocks unverified workspace access and supports credential rotation', async () => {
    const { service, repository } = makeService()
    const signup = await service.signup({ organizationName: 'Account', workspaceSlug: 'account', email: 'account@example.test', displayName: 'Account', password: 'Correct Horse Battery 12!' })
    await expect(service.contextFromToken(signup.rawSessionToken, 'account.olfactoryops.com')).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' })
    const resolved = await verifySignup(service, signup)
    const password = await service.changePassword(resolved.context, signup.rawSessionToken, 'Correct Horse Battery 12!', 'New Correct Horse Battery 99!')
    expect(password.rawSessionToken).not.toBe(signup.rawSessionToken)
    expect(repository.sessions.filter((item) => !item.revokedAt)).toHaveLength(1)
    const login = await service.login({ email: 'account@example.test', password: 'New Correct Horse Battery 99!', hostname: 'account.olfactoryops.com' })
    expect(login.membership.role).toBe('Owner')
    const rootLogin = await service.login({ email: 'account@example.test', password: 'New Correct Horse Battery 99!', hostname: 'labofscents.org' })
    expect(rootLogin.hostname.hostname).toBe('account.olfactoryops.com')
    await expect(service.contextFromToken(rootLogin.rawSessionToken, 'labofscents.org')).resolves.toMatchObject({ context: { organizationId: signup.membership.organizationId } })
    const rotated = await service.changeEmail((await service.contextFromToken(rootLogin.rawSessionToken, 'labofscents.org')).context, rootLogin.rawSessionToken, 'New Correct Horse Battery 99!', 'account-renamed@example.test')
    expect(rotated.rawSessionToken).not.toBe(rootLogin.rawSessionToken)
    const changed = await service.login({ email: 'account-renamed@example.test', password: 'New Correct Horse Battery 99!', hostname: 'labofscents.org' })
    expect(changed.user.verified).toBe(false)
  })

  it('keeps login auth-critical when billing is unavailable', async () => {
    const { service, repository } = makeService()
    await service.signup({ organizationName: 'Billing Deferred', workspaceSlug: 'billing-deferred', email: 'billing-deferred@example.test', displayName: 'Billing Deferred', password: 'Correct Horse Battery 12!' })
    let billingCalls = 0
    repository.getBilling = async () => { billingCalls += 1; throw new Error('billing unavailable') }
    const sessionsBefore = repository.sessions.length
    const login = await service.login({ email: 'billing-deferred@example.test', password: 'Correct Horse Battery 12!', hostname: 'billing-deferred.olfactoryops.com' })
    expect(login).toEqual(expect.objectContaining({ user: expect.any(Object), membership: expect.any(Object), memberships: expect.any(Array), hostname: expect.any(Object), csrfToken: expect.any(String), session: expect.any(Object), workspaceUrl: 'https://billing-deferred.olfactoryops.com/v2/workspace' }))
    expect(billingCalls).toBe(0)
    expect(repository.sessions).toHaveLength(sessionsBefore + 1)
    expect(repository.audits.some((audit) => audit.action === 'platform.login' && audit.outcome === 'allowed')).toBe(true)
  })

  it('rate limits verification resend and exposes tenant-scoped members and push subscriptions', async () => {
    const { service, repository } = makeService()
    const signup = await service.signup({ organizationName: 'Notify', workspaceSlug: 'notify', email: 'notify@example.test', displayName: 'Notify', password: 'Correct Horse Battery 12!' })
    await expect(service.resendVerification(signup.rawSessionToken, 'notify.olfactoryops.com')).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    await service.verifyEmail(signup.verificationToken)
    const resolved = await service.contextFromToken(signup.rawSessionToken, 'notify.olfactoryops.com')
    await expect(service.members(resolved.context)).resolves.toHaveLength(1)
    await service.subscribePush(resolved.context, { endpoint: 'https://push.example.test/endpoint', p256dh: 'p'.repeat(32), auth: 'a'.repeat(16) })
    expect(repository.pushSubscriptions).toHaveLength(1)
    await service.unsubscribePush(resolved.context, 'https://push.example.test/endpoint')
    expect(repository.pushSubscriptions).toHaveLength(0)
  })

  it('uses an encrypted, single-use V2 reset token and revokes every V2 session', async () => {
    const { service, repository } = makeService()
    const signup = await service.signup({ organizationName: 'Recovery', workspaceSlug: 'recovery', email: 'recovery@example.test', displayName: 'Recovery', password: 'Correct Horse Battery 12!' })
    await service.verifyEmail(signup.verificationToken)
    const additionalSession = await service.login({ email: 'recovery@example.test', password: 'Correct Horse Battery 12!', hostname: signup.hostname.hostname })

    await expect(service.requestPasswordReset('missing@example.test')).resolves.toEqual({ accepted: true })
    expect(repository.passwordResets).toHaveLength(0)
    await expect(service.requestPasswordReset('recovery@example.test')).resolves.toEqual({ accepted: true })
    expect(repository.passwordResets).toHaveLength(1)
    const reset = repository.passwordResets[0]!
    const outbox = repository.notifications.at(-1)!
    const payload = repository.notificationPayloads.get(outbox.id)!
    const serializedPayload = JSON.stringify(payload)
    expect(serializedPayload).not.toContain('recovery@example.test')
    const decrypted = JSON.parse(openSecret(String(payload.payloadCiphertext), 'test-password-reset-key')) as { email: string; token: string; resetPath: string }
    expect(decrypted).toMatchObject({ email: 'recovery@example.test', resetPath: '/v2/reset-password' })
    expect(reset.tokenHash).not.toContain(decrypted.token)

    await expect(service.completePasswordReset(decrypted.token, 'Reset Correct Horse Battery 99!')).resolves.toEqual({ accepted: true })
    expect(repository.passwordResets[0]?.usedAt).toBeTruthy()
    expect(repository.sessions.filter((item) => item.userId === signup.user.id && !item.revokedAt)).toHaveLength(0)
    await expect(service.contextFromToken(signup.rawSessionToken, signup.hostname.hostname)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
    await expect(service.contextFromToken(additionalSession.rawSessionToken, signup.hostname.hostname)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
    await expect(service.login({ email: 'recovery@example.test', password: 'Reset Correct Horse Battery 99!', hostname: signup.hostname.hostname })).resolves.toMatchObject({ user: { email: 'recovery@example.test' } })
    await expect(service.completePasswordReset(decrypted.token, 'Another Correct Horse Battery 99!')).rejects.toMatchObject({ code: 'PASSWORD_RESET_INVALID' })
  })

  it('keeps reset responses generic while rejecting expiry and rate-limiting delivery creation', async () => {
    const { service, repository } = makeService()
    const signup = await service.signup({ organizationName: 'Reset expiry', workspaceSlug: 'reset-expiry', email: 'expiry@example.test', displayName: 'Expiry', password: 'Correct Horse Battery 12!' })
    const initial = await service.requestPasswordReset('expiry@example.test')
    const repeated = await service.requestPasswordReset('expiry@example.test')
    expect(initial).toEqual(repeated)
    expect(repository.passwordResets).toHaveLength(1)
    const payload = repository.notificationPayloads.get(repository.notifications.at(-1)!.id)!
    const token = (JSON.parse(openSecret(String(payload.payloadCiphertext), 'test-password-reset-key')) as { token: string }).token
    repository.passwordResets[0]!.expiresAt = new Date(Date.now() - 1_000).toISOString()
    await expect(service.completePasswordReset(token, 'Expired Correct Horse Battery 99!')).rejects.toMatchObject({ code: 'PASSWORD_RESET_INVALID' })
    expect(repository.users.find((user) => user.id === signup.user.id)?.passwordHash).not.toContain('Expired Correct Horse Battery 99!')
  })

  it('keeps an outbox delivery failure indistinguishable from an unknown account', async () => {
    const { service, repository } = makeService()
    await service.signup({ organizationName: 'Delivery failure', workspaceSlug: 'delivery-failure', email: 'delivery@example.test', displayName: 'Delivery', password: 'Correct Horse Battery 12!' })
    repository.enqueueNotification = async () => { throw new Error('PROVIDER_DETAIL_MUST_NOT_ESCAPE') }

    await expect(service.requestPasswordReset('delivery@example.test')).resolves.toEqual({ accepted: true })
    await expect(service.requestPasswordReset('unknown@example.test')).resolves.toEqual({ accepted: true })
  })

  it('dispatches only an opaque committed reset reference to the internal delivery adapter', async () => {
    const dispatchPasswordReset = vi.fn().mockResolvedValue(undefined)
    const { service } = makeService({ passwordResetDispatcher: { dispatchPasswordReset } })
    await service.signup({ organizationName: 'Dispatch', workspaceSlug: 'dispatch', email: 'dispatch@example.test', displayName: 'Dispatch', password: 'Correct Horse Battery 12!' })

    await expect(service.requestPasswordReset('dispatch@example.test')).resolves.toEqual({ accepted: true })
    expect(dispatchPasswordReset).toHaveBeenCalledTimes(1)
    const input = dispatchPasswordReset.mock.calls[0]?.[0]
    expect(JSON.stringify(input)).not.toContain('dispatch@example.test')
    expect(input).toEqual(expect.objectContaining({ outboxRef: expect.stringMatching(/^reset_/), idempotencyKey: expect.stringMatching(/^password-reset:reset_/) }))
  })

  it('materializes independent role policies without cross-tenant defaults', async () => {
    const { service, repository } = makeService()
    const signup = await service.signup({ organizationName: 'Roles', workspaceSlug: 'roles', email: 'roles@example.test', displayName: 'Roles', password: 'Correct Horse Battery 12!' })
    const expectedRoles = ['Owner', 'Admin', 'Lab Manager', 'Perfumer', 'R&D Scientist', 'Lab Technician', 'Procurement', 'Sensory Panelist', 'Brand', 'Supplier', 'Finance', 'Viewer']
    for (const role of expectedRoles) expect(repository.rolePolicies.has(`${signup.membership.organizationId}:${role}`)).toBe(true)
    expect(repository.rolePolicies.get(`${signup.membership.organizationId}:Viewer`)).not.toContain('billing.manage')
    expect(repository.rolePolicies.get(`${signup.membership.organizationId}:Viewer`)).toContain('agent.view')
    expect(repository.rolePolicies.get(`${signup.membership.organizationId}:Viewer`)).not.toContain('agent.execute')
    expect(repository.rolePolicies.get(`${signup.membership.organizationId}:Perfumer`)).toEqual(expect.arrayContaining(['agent.view', 'agent.execute', 'agent.confirmWrite']))
    expect(repository.rolePolicies.get(`${signup.membership.organizationId}:R&D Scientist`)).toEqual(expect.arrayContaining(['agent.view', 'agent.execute', 'agent.evaluate']))
    expect(repository.rolePolicies.get(`${signup.membership.organizationId}:Sensory Panelist`)).not.toContain('agent.execute')
    expect(repository.rolePolicies.get(`${signup.membership.organizationId}:Brand`)).not.toContain('agent.view')
  })

  it('creates, reissues, revokes, and accepts one-time member invitations without storing raw tokens', async () => {
    const { service, repository } = makeService()
    const signup = await service.signup({ organizationName: 'Invites', workspaceSlug: 'invites', email: 'owner@invites.test', displayName: 'Owner', password: 'Correct Horse Battery 12!' })
    await service.verifyEmail(signup.verificationToken)
    const owner = await service.contextFromToken(signup.rawSessionToken, signup.hostname.hostname)
    const first = await service.inviteMember(owner.context, 'member@invites.test', 'Perfumer')
    expect(first.status).toBe('PENDING')
    const firstOutbox = repository.notifications.at(-1)!
    const firstPayload = repository.notificationPayloads.get(firstOutbox.id)!
    const firstToken = openSecret(String(firstPayload.tokenCiphertext), 'local-v2-invitation-key')
    expect(repository.invitations[0]?.tokenHash).not.toContain(firstToken)
    const reissued = await service.resendInvitation(owner.context, first.id)
    expect(repository.invitations.find((item) => item.id === first.id)?.status).toBe('REVOKED')
    const secondOutbox = repository.notifications.at(-1)!
    const secondToken = openSecret(String(repository.notificationPayloads.get(secondOutbox.id)?.tokenCiphertext), 'local-v2-invitation-key')
    let billingCalls = 0
    repository.getBilling = async () => { billingCalls += 1; throw new Error('billing unavailable') }
    const accepted = await service.acceptInvitation({ token: secondToken, email: 'member@invites.test', password: 'Member Correct Horse 12!', displayName: 'Invited Perfumer' })
    expect(accepted.membership.role).toBe('Perfumer')
    expect(billingCalls).toBe(0)
    expect(accepted).toEqual(expect.objectContaining({ user: expect.any(Object), membership: expect.any(Object), memberships: expect.any(Array), hostname: expect.any(Object), csrfToken: expect.any(String), session: expect.any(Object), workspaceUrl: expect.any(String) }))
    expect(repository.audits.some((audit) => audit.action === 'platform.invitation.accept' && audit.outcome === 'allowed')).toBe(true)
    expect(repository.invitations.find((item) => item.id === reissued.id)?.status).toBe('ACCEPTED')
    await expect(service.acceptInvitation({ token: secondToken, email: 'member@invites.test', password: 'Member Correct Horse 12!', displayName: 'Invited Perfumer' })).rejects.toMatchObject({ code: 'INVITATION_CONFLICT' })
    await expect(service.acceptInvitation({ token: firstToken, email: 'member@invites.test', password: 'Member Correct Horse 12!', displayName: 'Invited Perfumer' })).rejects.toMatchObject({ code: 'INVITATION_REVOKED' })
  })
})
