import { randomUUID } from 'node:crypto'
import { hostnameRecordSchema, platformRoleSchema, type BillingCapabilityProjection, type HostnameRecord, type InvitationRecord, type MemberProjection, type NotificationPreference, type ObservabilityProjection, type PlatformAuthResponse, type PlatformRole, type PushSubscriptionInput, type SessionSummary, type TenantMembership } from '../../../packages/contracts/src/index.js'
import { V2_PERMISSION_KEYS } from '../../../packages/permissions/src/registry.js'
import { hashPassword, hashSecret, randomSecret, sealSecret, verifyPassword } from './crypto.js'
import type { PlatformRepository } from './repository.js'
import type { MembershipRecord, OrganizationRecord, PlatformContext, PlatformUser, SessionRecord } from './types.js'

export class PlatformError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message) }
}

const RESERVED_SLUGS = new Set(['api', 'www', 'beta', 'customers', 'saas-origin', 'admin', 'app', 'login', 'signup', 'v2'])
const DEFAULT_ROLE_PERMISSIONS: Record<PlatformRole, string[]> = {
  Owner: [...V2_PERMISSION_KEYS],
  Admin: V2_PERMISSION_KEYS.filter((key) => !['billing.manage', 'workspace.export.request', 'observability.view'].includes(key)),
  'Lab Manager': ['tenant.view', 'tenant.switch', 'members.view', 'materials.view', 'materials.edit', 'inventory.view', 'inventory.receive', 'inventory.reserve', 'inventory.consume', 'inventory.adjust', 'inventory.transfer', 'inventory.reverse', 'procurement.view', 'procurement.create', 'procurement.receive', 'procurement.inspect', 'trials.viewAll', 'trials.create', 'trials.release', 'trials.decide', 'sensory.view', 'sensory.evaluate', 'sensory.manage', 'production.view', 'production.create', 'production.plan', 'production.allocate', 'production.weigh', 'production.process', 'production.qc', 'production.qc.record', 'production.qc.approve', 'production.deviation.manage', 'production.cancel', 'production.close', 'production.finishedGoods.view', 'production.documents.view', 'production.documents.manage', 'agent.view', 'agent.execute', 'notifications.view', 'notifications.manage', 'security.sessions.view', 'security.sessions.revoke'],
  Perfumer: ['tenant.view', 'tenant.switch', 'materials.view', 'materials.viewSensitive', 'formula.view', 'formula.viewSensitive', 'formula.edit', 'formula.review', 'trials.viewAll', 'trials.create', 'sensory.view', 'sensory.evaluate', 'sensory.unblind', 'production.view', 'production.documents.view', 'agent.view', 'agent.execute', 'agent.confirmWrite', 'notifications.view', 'security.sessions.view'],
  'R&D Scientist': ['tenant.view', 'materials.view', 'materials.viewSensitive', 'formula.view', 'formula.viewSensitive', 'formula.edit', 'formula.review', 'scientific_ai.use', 'scientific_ai.similarity', 'rag.view', 'sentiment.view', 'sentiment.analyze', 'agent.view', 'agent.execute', 'agent.evaluate', 'notifications.view', 'security.sessions.view'],
  'Lab Technician': ['tenant.view', 'materials.view', 'inventory.view', 'inventory.reserve', 'inventory.consume', 'trials.viewAll', 'sensory.view', 'sensory.evaluate', 'production.view', 'production.weigh', 'production.process', 'production.qc.record', 'production.finishedGoods.view', 'production.documents.view', 'agent.view', 'agent.execute', 'notifications.view', 'security.sessions.view'],
  Procurement: ['tenant.view', 'materials.view', 'suppliers.view', 'suppliers.edit', 'procurement.view', 'procurement.create', 'procurement.receive', 'agent.view', 'agent.execute', 'notifications.view', 'security.sessions.view'],
  'Sensory Panelist': ['tenant.view', 'trials.viewAssigned', 'sensory.view', 'sensory.evaluate', 'security.sessions.view'],
  // Brand reviewers use explicitly issued, token-scoped scorecards. They are
  // not granted broad tenant Trial or sensory record access by default.
  Brand: ['tenant.view', 'tenant.switch', 'notifications.view', 'security.sessions.view'],
  Supplier: ['tenant.view', 'suppliers.view', 'procurement.view', 'notifications.view', 'security.sessions.view'],
  Finance: ['tenant.view', 'billing.view', 'billing.capabilities', 'costing.view', 'costing.viewMargin', 'orders.view', 'agent.view', 'agent.execute', 'notifications.view', 'security.sessions.view'],
  Viewer: ['tenant.view', 'materials.view', 'inventory.view', 'formula.view', 'trials.viewAll', 'agent.view', 'notifications.view', 'security.sessions.view'],
}
const ACCOUNT_PERMISSIONS = ['security.profile.view', 'security.profile.changeEmail', 'security.profile.changePassword', 'security.sessions.revoke']
for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS) as PlatformRole[]) {
  DEFAULT_ROLE_PERMISSIONS[role] = [...new Set([...DEFAULT_ROLE_PERMISSIONS[role], ...ACCOUNT_PERMISSIONS])]
}

function iso(date = new Date()) { return date.toISOString() }
function addMinutes(date: Date, minutes: number) { return new Date(date.getTime() + minutes * 60_000) }
function addDays(date: Date, days: number) { return new Date(date.getTime() + days * 86_400_000) }
function slugify(value: string) { return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63) }
function normalizeEmail(value: string) { return value.trim().toLowerCase() }
function normalizeHost(value: string) { return value.trim().toLowerCase().replace(/\.$/, '') }
function correlationId() { return `v2_${randomUUID()}` }

export type PlatformServiceConfig = {
  baseDomain?: string
  sessionPepper?: string
  passwordPepper?: string
  invitationEncryptionKey?: string
  cookieName?: string
}

export type SignupInput = { organizationName: string; workspaceSlug?: string; email: string; displayName: string; password: string; hostname?: string }
export type LoginInput = { email: string; password: string; hostname?: string; organizationId?: string; userAgent?: string; ip?: string; deviceLabel?: string }

export class PlatformService {
  private readonly baseDomain: string
  private readonly sessionPepper: string
  private readonly passwordPepper: string
  private readonly invitationEncryptionKey: string
  readonly cookieName: string

  constructor(private readonly repository: PlatformRepository, config: PlatformServiceConfig = {}) {
    this.baseDomain = (config.baseDomain ?? 'olfactoryops.com').toLowerCase()
    this.sessionPepper = config.sessionPepper ?? 'local-v2-session-pepper'
    this.passwordPepper = config.passwordPepper ?? 'local-v2-password-pepper'
    this.invitationEncryptionKey = config.invitationEncryptionKey ?? 'local-v2-invitation-key'
    this.cookieName = config.cookieName ?? 'oo_v2_session'
  }

  validateSlug(value: string) {
    const slug = value.trim().toLowerCase()
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) throw new PlatformError('INVALID_HOSTNAME', 'Use lowercase letters, numbers, and single hyphens in the workspace address.', 422)
    if (!slug || RESERVED_SLUGS.has(slug)) throw new PlatformError('HOSTNAME_RESERVED', 'Choose another workspace address.', 409)
    return slug
  }

  defaultHostname(slug: string) { return `${this.validateSlug(slug)}.${this.baseDomain}` }

  async signup(input: SignupInput): Promise<PlatformAuthResponse & { rawSessionToken: string; verificationToken: string }> {
    const email = normalizeEmail(input.email)
    if (!email.includes('@') || input.password.length < 12) throw new PlatformError('INVALID_CREDENTIALS', 'Use a valid email and a password of at least 12 characters.', 422)
    const slug = input.workspaceSlug?.trim() ? this.validateSlug(input.workspaceSlug) : this.validateSlug(slugify(input.organizationName))
    const organizationId = `org_${slug}_${randomUUID().slice(0, 8)}`
    const userId = `usr_${randomUUID().slice(0, 12)}`
    const membershipId = `mem_${randomUUID().slice(0, 12)}`
    const hostnameId = `host_${randomUUID().slice(0, 12)}`
    const createdAt = iso()
    const user: PlatformUser = { id: userId, email, displayName: input.displayName.trim().slice(0, 160) || email.split('@')[0], passwordHash: hashPassword(email, input.password, this.passwordPepper), status: 'ACTIVE' }
    const organization: OrganizationRecord = { id: organizationId, slug, name: input.organizationName.trim().slice(0, 160) || slug, status: 'ACTIVE' }
    const membership: MembershipRecord = { id: membershipId, organizationId, organizationName: organization.name, organizationSlug: slug, userId, role: 'Owner', status: 'ACTIVE' }
    const hostname = hostnameRecordSchema.parse({ id: hostnameId, organizationId, hostname: input.hostname ? normalizeHost(input.hostname) : this.defaultHostname(slug), kind: 'DEFAULT', status: 'ACTIVE' })
    const billing: BillingCapabilityProjection = { mode: 'MANAGED_BETA', status: 'ACTIVE', capabilities: { 'workspace.access': true, 'notifications.in_app': true, 'privacy.export.self': true }, limits: { members: 25, storageMb: 1024, aiRuns: 0 } }
    let seed
    try {
      seed = await this.repository.transaction((tx) => tx.createSignup({ user, organization, membership, hostname, rolePermissions: DEFAULT_ROLE_PERMISSIONS.Owner, rolePolicies: DEFAULT_ROLE_PERMISSIONS, billing }))
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      const target = error && typeof error === 'object' && 'meta' in error ? JSON.stringify((error as { meta?: unknown }).meta) : ''
      if (code === 'SLUG_CONFLICT' || code === 'HOSTNAME_CONFLICT') throw new PlatformError('HOSTNAME_CONFLICT', 'That workspace address is already registered.', 409)
      if (target.includes('slug') || target.includes('hostname')) throw new PlatformError('HOSTNAME_CONFLICT', 'That workspace address is already registered.', 409)
      if (code === 'EMAIL_CONFLICT' || code.includes('P2002') || code.includes('Unique constraint')) throw new PlatformError('EMAIL_CONFLICT', 'That email or workspace address is already registered.', 409)
      throw error
    }
    const sessionTokens = this.newSession(userId, organizationId, hostname.hostname, undefined, undefined, undefined, undefined)
    const verificationToken = randomSecret('verify_')
    await this.repository.transaction(async (tx) => {
      await tx.createSession(sessionTokens.record)
      await tx.saveVerification({ id: `verify_${randomUUID().slice(0, 12)}`, userId, organizationId, email, tokenHash: hashSecret(verificationToken, this.sessionPepper), expiresAt: iso(addDays(new Date(), 1)), createdAt })
      await tx.enqueueNotification({ userId, organizationId, eventType: 'EMAIL_VERIFICATION', channel: 'EMAIL', idempotencyKey: `email-verification:${userId}:${createdAt}`, payload: { email, verificationRequired: true } })
      await tx.appendAudit({ organizationId, actorUserId: userId, action: 'platform.signup', outcome: 'allowed', subjectType: 'organization', subjectId: organizationId, correlationId: correlationId() })
    }, { organizationId, userId })
    return { ...await this.authProjection(seed.user, seed.membership, [seed.membership], hostname, sessionTokens.record, sessionTokens.csrfToken, sessionTokens.rawToken, billing), rawSessionToken: sessionTokens.rawToken, verificationToken }
  }

  async login(input: LoginInput): Promise<PlatformAuthResponse & { rawSessionToken: string }> {
    const email = normalizeEmail(input.email)
    const user = await this.repository.findUserByEmail(email)
    if (!user || user.status !== 'ACTIVE' || !verifyPassword(email, input.password, user.passwordHash, this.passwordPepper)) throw new PlatformError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401)
    const memberships = await this.repository.transaction((tx) => tx.listMemberships(user.id), { userId: user.id })
    if (!memberships.length) throw new PlatformError('TENANT_ACCESS_DENIED', 'No active workspace membership was found.', 403)
    let membership = input.organizationId ? memberships.find((item) => item.organizationId === input.organizationId) : undefined
    let hostname: HostnameRecord | null = null
    if (input.hostname && !this.isPublicHost(input.hostname)) {
      hostname = await this.repository.findHostname(normalizeHost(input.hostname))
      if (!hostname || hostname.status !== 'ACTIVE') throw new PlatformError('HOSTNAME_NOT_ACTIVE', 'This workspace address is not active.', 403)
      membership = memberships.find((item) => item.organizationId === hostname?.organizationId)
    }
    membership ??= memberships[0]
    if (!membership) throw new PlatformError('TENANT_ACCESS_DENIED', 'Workspace membership is not active.', 403)
    hostname ??= await this.repository.transaction((tx) => tx.findDefaultHostname(membership.organizationId), { organizationId: membership.organizationId, userId: user.id })
    if (!hostname) throw new PlatformError('TENANT_NOT_FOUND', 'Workspace address was not found.', 404)
    const sessionTokens = this.newSession(user.id, membership.organizationId, hostname.hostname, input.userAgent, input.ip, input.deviceLabel, undefined)
    const billing = await this.repository.transaction(async (tx) => { await tx.createSession(sessionTokens.record); await tx.appendAudit({ organizationId: membership.organizationId, actorUserId: user.id, action: 'platform.login', outcome: 'allowed', subjectType: 'session', subjectId: sessionTokens.record.id, correlationId: correlationId() }); return tx.getBilling(membership.organizationId) }, { organizationId: membership.organizationId, userId: user.id })
    return { ...await this.authProjection(user, membership, memberships, hostname, sessionTokens.record, sessionTokens.csrfToken, sessionTokens.rawToken, billing), rawSessionToken: sessionTokens.rawToken }
  }

  async contextFromToken(rawToken: string, hostname: string, options: { allowUnverified?: boolean } = {}): Promise<{ context: PlatformContext; user: PlatformUser; membership: MembershipRecord; session: SessionRecord }> {
    const session = await this.repository.findSessionByHash(hashSecret(rawToken, this.sessionPepper))
    const now = Date.now()
    if (!session || session.revokedAt || new Date(session.absoluteExpiresAt).getTime() <= now || new Date(session.idleExpiresAt).getTime() <= now) throw new PlatformError('SESSION_EXPIRED', 'Your session has expired. Sign in again.', 401)
    const resolved = await this.repository.transaction(async (tx) => ({ user: await tx.findUserById(session.userId), membership: await tx.findMembership(session.userId, session.organizationId), host: await tx.findHostname(normalizeHost(hostname)) ?? (this.isPublicHost(hostname) ? await tx.findDefaultHostname(session.organizationId) : null) }), { organizationId: session.organizationId, userId: session.userId })
    const user = resolved.user
    const membership = resolved.membership
    const host = resolved.host
    if (!user || !membership || !host || host.status !== 'ACTIVE' || host.organizationId !== session.organizationId) throw new PlatformError('TENANT_ACCESS_DENIED', 'This session cannot access the requested workspace.', 403)
    if (!user.verifiedAt && !options.allowUnverified) throw new PlatformError('EMAIL_NOT_VERIFIED', 'Verify your email before opening the workspace.', 403)
    await this.repository.transaction((tx) => tx.touchSession(session.id, session.organizationId, iso(), iso(addMinutes(new Date(), 60))), { organizationId: session.organizationId, userId: session.userId })
    return { context: { userId: user.id, organizationId: membership.organizationId, sessionId: session.id, role: membership.role, hostname: host.hostname }, user, membership, session }
  }

  async switchWorkspace(rawToken: string, hostname: string, organizationId: string) {
    const current = await this.contextFromToken(rawToken, hostname)
    const membership = await this.repository.transaction((tx) => tx.findMembership(current.user.id, organizationId), { organizationId, userId: current.user.id })
    if (!membership) throw new PlatformError('TENANT_ACCESS_DENIED', 'You do not have access to that workspace.', 403)
    const host = await this.repository.transaction((tx) => tx.findDefaultHostname(organizationId), { organizationId, userId: current.user.id })
    if (!host) throw new PlatformError('TENANT_NOT_FOUND', 'Workspace address was not found.', 404)
    return { hostname: host, membership }
  }

  async logout(context: PlatformContext) { await this.scoped(context, async (tx) => { await tx.revokeSession(context.sessionId, context.organizationId, 'logout'); await tx.appendAudit({ organizationId: context.organizationId, actorUserId: context.userId, action: 'platform.session.revoke', outcome: 'allowed', subjectType: 'session', subjectId: context.sessionId, correlationId: correlationId() }) }) }
  async listSessions(context: PlatformContext): Promise<SessionSummary[]> { const sessions = await this.scoped(context, (tx) => tx.listSessions(context.userId, context.organizationId)); return sessions.map((item) => this.sessionSummary(item, item.id === context.sessionId)) }
  async revokeSession(context: PlatformContext, sessionId: string) { await this.scoped(context, async (tx) => { await tx.revokeSession(sessionId, context.organizationId, 'user_requested'); await tx.appendAudit({ organizationId: context.organizationId, actorUserId: context.userId, action: 'platform.session.revoke', outcome: 'allowed', subjectType: 'session', subjectId: sessionId, correlationId: correlationId() }) }) }
  async revokeAllSessions(context: PlatformContext, keepCurrent = true) { await this.scoped(context, async (tx) => { await tx.revokeAllSessions(context.userId, context.organizationId, keepCurrent ? context.sessionId : undefined, 'user_requested'); await tx.appendAudit({ organizationId: context.organizationId, actorUserId: context.userId, action: 'platform.session.revoke_all', outcome: 'allowed', subjectType: 'user', subjectId: context.userId, correlationId: correlationId() }) }) }
  async assertCsrf(context: PlatformContext, rawToken: string, csrfToken: string | undefined) { if (!csrfToken || hashSecret(csrfToken, this.sessionPepper) !== (await this.repository.findSessionByHash(hashSecret(rawToken, this.sessionPepper)))?.csrfVerifierHash) throw new PlatformError('CSRF_DENIED', 'Security verification failed. Refresh and try again.', 403) }
  async verifyEmail(token: string) { const record = await this.repository.findVerification(hashSecret(token, this.sessionPepper)); if (!record || record.revokedAt || record.verifiedAt) throw new PlatformError('INVALID_CREDENTIALS', 'This verification link is no longer valid.', 400); if (new Date(record.expiresAt).getTime() <= Date.now()) throw new PlatformError('INVALID_CREDENTIALS', 'This verification link has expired.', 400); const completedAt = iso(); await this.repository.transaction(async (tx) => { await tx.markVerificationComplete(record.id, completedAt); await tx.markUserVerified(record.userId, completedAt); await tx.appendAudit({ organizationId: record.organizationId, actorUserId: record.userId, action: 'platform.email.verify', outcome: 'allowed', subjectType: 'user', subjectId: record.userId, correlationId: correlationId() }) }, { organizationId: record.organizationId, userId: record.userId }); return { verified: true, verifiedAt: completedAt } }
  async verificationStatus(rawToken: string, hostname: string) { const resolved = await this.contextFromToken(rawToken, hostname, { allowUnverified: true }); return { verified: Boolean(resolved.user.verifiedAt), email: resolved.user.email } }
  async resendVerification(rawToken: string, hostname: string) {
    const resolved = await this.contextFromToken(rawToken, hostname, { allowUnverified: true })
    if (resolved.user.verifiedAt) return { sent: false, alreadyVerified: true }
    const latest = await this.scoped(resolved.context, (tx) => tx.findLatestVerification(resolved.user.id, resolved.context.organizationId))
    if (latest && Date.now() - new Date(latest.createdAt).getTime() < 60_000) throw new PlatformError('RATE_LIMITED', 'Wait before requesting another verification email.', 429)
    await this.scoped(resolved.context, (tx) => tx.revokeVerifications(resolved.user.id, resolved.context.organizationId))
    const token = randomSecret('verify_')
    const createdAt = iso()
    await this.scoped(resolved.context, async (tx) => { await tx.saveVerification({ id: `verify_${randomUUID().slice(0, 12)}`, userId: resolved.user.id, organizationId: resolved.context.organizationId, email: resolved.user.email, tokenHash: hashSecret(token, this.sessionPepper), expiresAt: iso(addDays(new Date(), 1)), createdAt }); await tx.enqueueNotification({ userId: resolved.user.id, organizationId: resolved.context.organizationId, eventType: 'EMAIL_VERIFICATION', channel: 'EMAIL', idempotencyKey: `email-verification:${resolved.user.id}:${createdAt}`, payload: { email: resolved.user.email, verificationRequired: true } }); await tx.appendAudit({ organizationId: resolved.context.organizationId, actorUserId: resolved.user.id, action: 'platform.email.verify.resend', outcome: 'allowed', subjectType: 'user', subjectId: resolved.user.id, correlationId: correlationId() }) })
    return { sent: true }
  }

  async changePassword(context: PlatformContext, rawToken: string, currentPassword: string, nextPassword: string) {
    await this.requirePermission(context, 'security.profile.changePassword')
    if (nextPassword.length < 12) throw new PlatformError('INVALID_CREDENTIALS', 'Use a password of at least 12 characters.', 422)
    const user = await this.scoped(context, (tx) => tx.findUserById(context.userId))
    if (!user || !verifyPassword(user.email, currentPassword, user.passwordHash, this.passwordPepper)) throw new PlatformError('REAUTH_REQUIRED', 'Confirm your current password to continue.', 403)
    await this.scoped(context, (tx) => tx.updatePassword(context.userId, hashPassword(user.email, nextPassword, this.passwordPepper)))
    const rotated = await this.rotateSession(context, rawToken, 'credential_change')
    await this.scoped(context, (tx) => tx.appendAudit({ organizationId: context.organizationId, actorUserId: context.userId, action: 'platform.password.change', outcome: 'allowed', subjectType: 'user', subjectId: context.userId, correlationId: correlationId() }))
    return rotated
  }

  async changeEmail(context: PlatformContext, rawToken: string, currentPassword: string, nextEmail: string) {
    await this.requirePermission(context, 'security.profile.changeEmail')
    const user = await this.scoped(context, (tx) => tx.findUserById(context.userId))
    const email = normalizeEmail(nextEmail)
    if (!user || !verifyPassword(user.email, currentPassword, user.passwordHash, this.passwordPepper)) throw new PlatformError('REAUTH_REQUIRED', 'Confirm your current password to continue.', 403)
    if (!email.includes('@')) throw new PlatformError('INVALID_CREDENTIALS', 'Use a valid email address.', 422)
    const existing = await this.repository.findUserByEmail(email)
    if (existing && existing.id !== context.userId) throw new PlatformError('HOSTNAME_CONFLICT', 'That email is already in use.', 409)
    await this.scoped(context, async (tx) => { await tx.updateEmail(context.userId, email); await tx.updatePassword(context.userId, hashPassword(email, currentPassword, this.passwordPepper)); await tx.markUserUnverified(context.userId); await tx.revokeVerifications(context.userId, context.organizationId) })
    const token = randomSecret('verify_')
    const createdAt = iso()
    await this.scoped(context, async (tx) => { await tx.saveVerification({ id: `verify_${randomUUID().slice(0, 12)}`, userId: context.userId, organizationId: context.organizationId, email, tokenHash: hashSecret(token, this.sessionPepper), expiresAt: iso(addDays(new Date(), 1)), createdAt }); await tx.enqueueNotification({ userId: context.userId, organizationId: context.organizationId, eventType: 'EMAIL_VERIFICATION', channel: 'EMAIL', idempotencyKey: `email-verification:${context.userId}:${createdAt}`, payload: { email, verificationRequired: true } }) })
    const rotated = await this.rotateSession(context, rawToken, 'email_change')
    await this.scoped(context, (tx) => tx.appendAudit({ organizationId: context.organizationId, actorUserId: context.userId, action: 'platform.email.change', outcome: 'allowed', subjectType: 'user', subjectId: context.userId, correlationId: correlationId() }))
    return rotated
  }

  async members(context: PlatformContext): Promise<MemberProjection[]> { await this.requirePermission(context, 'members.view'); return this.scoped(context, (tx) => tx.listOrganizationMembers(context.organizationId)) }

  async invitations(context: PlatformContext): Promise<InvitationRecord[]> {
    await this.requirePermission(context, 'members.view')
    return this.scoped(context, (tx) => tx.listInvitations(context.organizationId))
  }

  async inviteMember(context: PlatformContext, emailValue: string, role: PlatformRole) {
    await this.requirePermission(context, 'members.invite')
    const email = emailValue.trim().toLowerCase()
    if (!email.includes('@') || email.length > 320) throw new PlatformError('INVITATION_INVALID', 'Enter a valid member email address.', 422)
    const parsedRole = platformRoleSchema.safeParse(role)
    if (!parsedRole.success) throw new PlatformError('INVITATION_INVALID', 'Choose a registered workspace role.', 422)
    const existingUser = await this.repository.findUserByEmail(email)
    if (existingUser && await this.scoped(context, (tx) => tx.findMembership(existingUser.id, context.organizationId))) throw new PlatformError('INVITATION_CONFLICT', 'This person is already a workspace member.', 409)
    const current = await this.scoped(context, (tx) => tx.findPendingInvitation(context.organizationId, email))
    if (current) await this.scoped(context, async (tx) => { await tx.revokeInvitation(current.id, context.organizationId, 'reissued'); await tx.appendAudit({ organizationId: context.organizationId, actorUserId: context.userId, action: 'platform.invitation.revoke', outcome: 'allowed', subjectType: 'invitation', subjectId: current.id, correlationId: correlationId() }) })
    const invitationToken = randomSecret('invite_')
    const createdAt = iso()
    const invitation = { id: `invite_${randomUUID().slice(0, 12)}`, organizationId: context.organizationId, email, role: parsedRole.data, status: 'PENDING' as const, tokenHash: hashSecret(invitationToken, this.sessionPepper), invitedBy: context.userId, expiresAt: iso(addDays(new Date(), 7)), createdAt }
    await this.scoped(context, async (tx) => {
      await tx.createInvitation(invitation)
      await tx.enqueueNotification({
        userId: existingUser?.id,
        organizationId: context.organizationId,
        eventType: 'MEMBER_INVITATION',
        channel: 'EMAIL',
        idempotencyKey: `member-invitation:${invitation.id}`,
        payload: { invitationId: invitation.id, email, role: invitation.role, tokenCiphertext: sealSecret(invitationToken, this.invitationEncryptionKey) },
      })
      await tx.appendAudit({ organizationId: context.organizationId, actorUserId: context.userId, action: 'platform.invitation.create', outcome: 'allowed', subjectType: 'invitation', subjectId: invitation.id, correlationId: correlationId() })
    })
    const { tokenHash: _hash, invitedBy: _by, ...safe } = invitation
    return safe
  }

  async resendInvitation(context: PlatformContext, invitationId: string) {
    await this.requirePermission(context, 'members.invite')
    const invitations = await this.scoped(context, (tx) => tx.listInvitations(context.organizationId))
    const existing = invitations.find((item) => item.id === invitationId)
    if (!existing || existing.status !== 'PENDING') throw new PlatformError('INVITATION_INVALID', 'This invitation is no longer pending.', 409)
    return this.inviteMember(context, existing.email, existing.role)
  }

  async revokeMemberInvitation(context: PlatformContext, invitationId: string) {
    await this.requirePermission(context, 'members.invite')
    await this.scoped(context, async (tx) => { await tx.revokeInvitation(invitationId, context.organizationId, 'user_requested'); await tx.appendAudit({ organizationId: context.organizationId, actorUserId: context.userId, action: 'platform.invitation.revoke', outcome: 'allowed', subjectType: 'invitation', subjectId: invitationId, correlationId: correlationId() }) })
    return { revoked: true }
  }

  async acceptInvitation(input: { token: string; email: string; password: string; displayName: string; hostname?: string }) {
    const invitation = await this.repository.findInvitationByHash(hashSecret(input.token, this.sessionPepper))
    if (!invitation) throw new PlatformError('INVITATION_INVALID', 'This invitation link is invalid.', 400)
    if (invitation.status === 'REVOKED') throw new PlatformError('INVITATION_REVOKED', 'This invitation has been revoked.', 410)
    if (invitation.status === 'ACCEPTED') throw new PlatformError('INVITATION_CONFLICT', 'This invitation has already been accepted.', 409)
    if (invitation.status === 'EXPIRED' || new Date(invitation.expiresAt).getTime() <= Date.now()) {
      await this.repository.transaction((tx) => tx.expireInvitation(invitation.id, invitation.organizationId), { organizationId: invitation.organizationId })
      throw new PlatformError('INVITATION_EXPIRED', 'This invitation has expired.', 410)
    }
    const email = input.email.trim().toLowerCase()
    if (email !== invitation.email) throw new PlatformError('INVITATION_INVALID', 'Use the invited email address to accept this invitation.', 403)
    if (input.password.length < 12) throw new PlatformError('INVALID_CREDENTIALS', 'Use a password of at least 12 characters.', 422)
    let user = await this.repository.findUserByEmail(email)
    if (user && !verifyPassword(email, input.password, user.passwordHash, this.passwordPepper)) throw new PlatformError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401)
    const acceptedAt = iso()
    const userId = user?.id ?? `usr_${randomUUID().slice(0, 12)}`
    if (!user) user = { id: userId, email, displayName: input.displayName.trim().slice(0, 160), passwordHash: hashPassword(email, input.password, this.passwordPepper), status: 'ACTIVE', verifiedAt: acceptedAt }
    const host = await this.repository.transaction((tx) => tx.findDefaultHostname(invitation.organizationId), { organizationId: invitation.organizationId, userId })
    if (!host) throw new PlatformError('TENANT_NOT_FOUND', 'Workspace address was not found.', 404)
    const sessionTokens = this.newSession(userId, invitation.organizationId, host.hostname, undefined, undefined, undefined, undefined)
    const result = await this.repository.transaction(async (tx) => {
      if (!await tx.findUserById(userId)) await tx.createUser(user!)
      if (!user?.verifiedAt) await tx.markUserVerified(userId, acceptedAt)
      const existingMembership = await tx.findMembership(userId, invitation.organizationId)
      if (existingMembership) throw new PlatformError('INVITATION_CONFLICT', 'This person is already a workspace member.', 409)
      const membership = await tx.createMembership({ id: `mem_${randomUUID().slice(0, 12)}`, organizationId: invitation.organizationId, userId, role: invitation.role })
      await tx.acceptInvitation(invitation.id, invitation.organizationId, userId, acceptedAt)
      await tx.createSession(sessionTokens.record)
      await tx.appendAudit({ organizationId: invitation.organizationId, actorUserId: userId, action: 'platform.invitation.accept', outcome: 'allowed', subjectType: 'invitation', subjectId: invitation.id, correlationId: correlationId() })
      const memberships = await tx.listMemberships(userId)
      const billing = await tx.getBilling(invitation.organizationId)
      return { membership, memberships, billing }
    }, { organizationId: invitation.organizationId, userId })
    return { ...await this.authProjection(user, result.membership, result.memberships, host, sessionTokens.record, sessionTokens.csrfToken, sessionTokens.rawToken, result.billing), rawSessionToken: sessionTokens.rawToken }
  }

  async subscribePush(context: PlatformContext, input: PushSubscriptionInput) { await this.requirePermission(context, 'notifications.manage'); const endpointHash = hashSecret(input.endpoint, this.sessionPepper); await this.scoped(context, async (tx) => { await tx.savePushSubscription({ ...input, userId: context.userId, organizationId: context.organizationId, endpointHash }); await tx.appendAudit({ organizationId: context.organizationId, actorUserId: context.userId, action: 'platform.push.subscribe', outcome: 'allowed', subjectType: 'push_subscription', subjectId: endpointHash, correlationId: correlationId() }) }); return { subscribed: true } }
  async unsubscribePush(context: PlatformContext, endpoint: string) { await this.requirePermission(context, 'notifications.manage'); const endpointHash = hashSecret(endpoint, this.sessionPepper); await this.scoped(context, (tx) => tx.revokePushSubscription(context.userId, context.organizationId, endpointHash)); return { unsubscribed: true } }
  async requirePermission(context: PlatformContext, permission: string) { const permissions = await this.scoped(context, (tx) => tx.getRolePermissions(context.organizationId, context.role)); if (!permissions.includes(permission)) { await this.scoped(context, (tx) => tx.appendAudit({ organizationId: context.organizationId, actorUserId: context.userId, action: 'platform.permission.denied', outcome: 'blocked', subjectType: 'permission', subjectId: permission, correlationId: correlationId() })); throw new PlatformError('TENANT_ACCESS_DENIED', 'You do not have permission for this action.', 403) } }
  async capabilityProjection(context: PlatformContext) {
    const granted = new Set(await this.scoped(context, (tx) => tx.getRolePermissions(context.organizationId, context.role)))
    return Object.fromEntries(V2_PERMISSION_KEYS.map((permission) => [permission, granted.has(permission)])) as Record<string, boolean>
  }
  async setRolePermissions(context: PlatformContext, role: PlatformRole, permissions: string[]) { await this.requirePermission(context, 'members.manageRoles'); const next = permissions.filter((item) => V2_PERMISSION_KEYS.includes(item as never)); if (role === 'Owner' && !next.includes('tenant.manage')) throw new PlatformError('OWNER_LOCKOUT', 'Owner policy must retain workspace management.', 409); const result = await this.scoped(context, async (tx) => { const version = await tx.setRolePermissions(context.organizationId, role, next, context.userId); await tx.appendAudit({ organizationId: context.organizationId, actorUserId: context.userId, action: 'platform.role_policy.update', outcome: 'allowed', subjectType: 'role_policy', subjectId: role, correlationId: correlationId() }); return version }); return { role, permissions: next, version: result } }
  async rolePermissions(context: PlatformContext, role: string) { await this.requirePermission(context, 'members.view'); return this.scoped(context, (tx) => tx.getRolePermissions(context.organizationId, role)) }
  async billing(context: PlatformContext) { await this.requirePermission(context, 'billing.capabilities'); return this.scoped(context, (tx) => tx.getBilling(context.organizationId)) }
  async branding(context: PlatformContext) { await this.requirePermission(context, 'tenant.view'); return this.scoped(context, (tx) => tx.getBranding(context.organizationId)) }
  async updateBranding(context: PlatformContext, branding: { displayName?: string; logoObjectRef?: string; faviconObjectRef?: string; accentColor?: string; footerText?: string; locale?: string }) { await this.requirePermission(context, 'tenant.manage'); const current = await this.scoped(context, (tx) => tx.getBranding(context.organizationId)); const next = { ...current, ...branding, displayName: branding.displayName?.trim().slice(0, 120) || current.displayName, locale: branding.locale === 'vi-VN' ? 'vi-VN' : 'en-US' }; await this.scoped(context, async (tx) => { await tx.saveBranding(context.organizationId, next); await tx.appendAudit({ organizationId: context.organizationId, actorUserId: context.userId, action: 'platform.branding.update', outcome: 'allowed', subjectType: 'organization', subjectId: context.organizationId, correlationId: correlationId() }) }); return next }
  async notifications(context: PlatformContext) { await this.requirePermission(context, 'notifications.view'); return this.scoped(context, async (tx) => ({ deliveries: await tx.getNotifications(context.userId, context.organizationId), preferences: await tx.getNotificationPreferences(context.userId, context.organizationId) })) }
  async updateNotificationPreference(context: PlatformContext, preference: NotificationPreference) { await this.requirePermission(context, 'notifications.manage'); await this.scoped(context, (tx) => tx.setNotificationPreference(context.userId, context.organizationId, preference)); return this.notifications(context) }
  async consent(context: PlatformContext, purpose: 'TERMS' | 'PRIVACY' | 'COOKIES' | 'EMAIL_SECURITY' | 'WEB_PUSH', policyVersion: string) { await this.requirePermission(context, 'consent.manage'); return this.scoped(context, (tx) => tx.createConsent(context.userId, context.organizationId, purpose, policyVersion, iso())) }
  async exports(context: PlatformContext) { await this.requirePermission(context, 'security.profile.view'); return this.scoped(context, (tx) => tx.listExports(context.userId, context.organizationId)) }
  async requestPrivacyExport(context: PlatformContext) { await this.requirePermission(context, 'privacy.export.self'); const result = await this.scoped(context, (tx) => tx.createExport({ kind: 'PRIVACY', userId: context.userId, organizationId: context.organizationId, requestedAt: iso() })); await this.scoped(context, (tx) => tx.appendAudit({ organizationId: context.organizationId, actorUserId: context.userId, action: 'platform.privacy.export.request', outcome: 'allowed', subjectType: 'privacy_export', subjectId: result.id, correlationId: correlationId() })); return result }
  async requestWorkspaceExport(context: PlatformContext) { await this.requirePermission(context, 'workspace.export.request'); const result = await this.scoped(context, (tx) => tx.createExport({ kind: 'WORKSPACE', userId: context.userId, organizationId: context.organizationId, requestedAt: iso() })); await this.scoped(context, (tx) => tx.appendAudit({ organizationId: context.organizationId, actorUserId: context.userId, action: 'platform.workspace.export.request', outcome: 'allowed', subjectType: 'workspace_export', subjectId: result.id, correlationId: correlationId() })); return result }
  async requestErasureReview(context: PlatformContext) { await this.requirePermission(context, 'privacy.export.self'); return this.scoped(context, (tx) => tx.createExport({ kind: 'ERASURE_REVIEW', userId: context.userId, organizationId: context.organizationId, requestedAt: iso() })) }
  async observability(context: PlatformContext): Promise<ObservabilityProjection> { await this.requirePermission(context, 'observability.view'); return this.scoped(context, (tx) => tx.getObservability(context.organizationId)) }
  async requestCustomHostname(context: PlatformContext, hostnameValue: string) { await this.requirePermission(context, 'domains.manage'); const hostname = normalizeHost(hostnameValue); if (!hostname || hostname.length > 253 || !hostname.includes('.') || hostname === this.baseDomain) throw new PlatformError('HOSTNAME_CONFLICT', 'Enter a valid customer-owned hostname.', 422); const existing = await this.repository.findHostname(hostname); if (existing) throw new PlatformError('HOSTNAME_CONFLICT', 'That hostname is already registered.', 409); const record: HostnameRecord = { id: `host_${randomUUID().slice(0, 12)}`, organizationId: context.organizationId, hostname, kind: 'CUSTOM', status: 'PENDING_VALIDATION', validationStatus: 'NOT_CONFIGURED', sslStatus: 'NOT_CONFIGURED' }; return this.scoped(context, (tx) => tx.createHostname(record)) }

  private async rotateSession(context: PlatformContext, rawToken: string, reason: string) {
    await this.scoped(context, async (tx) => { await tx.revokeAllSessions(context.userId, context.organizationId, undefined, reason) })
    const rotated = this.newSession(context.userId, context.organizationId, context.hostname, undefined, undefined, undefined, context.sessionId)
    await this.scoped(context, async (tx) => { await tx.createSession(rotated.record) })
    return { csrfToken: rotated.csrfToken, rawSessionToken: rotated.rawToken, session: this.sessionSummary(rotated.record, true) }
  }

  private scoped<T>(context: PlatformContext, callback: (repository: PlatformRepository) => Promise<T>) {
    return this.repository.transaction(callback, { organizationId: context.organizationId, userId: context.userId })
  }

  private isPublicHost(hostname: string) {
    const host = normalizeHost(hostname)
    return new Set([this.baseDomain, `www.${this.baseDomain}`, 'labofscents.org', 'www.labofscents.org', 'localhost', '127.0.0.1']).has(host)
  }

  private newSession(userId: string, organizationId: string, _hostname: string, userAgent?: string, ip?: string, deviceLabel?: string, rotatedFromId?: string) { const rawToken = randomSecret('sess_'); const csrfToken = randomSecret('csrf_'); const createdAt = new Date(); const record: SessionRecord = { id: `ses_${randomUUID().slice(0, 12)}`, userId, organizationId, tokenVerifierHash: hashSecret(rawToken, this.sessionPepper), csrfVerifierHash: hashSecret(csrfToken, this.sessionPepper), deviceLabel: deviceLabel?.slice(0, 160), userAgent: userAgent?.slice(0, 512), createdAt: iso(createdAt), lastSeenAt: iso(createdAt), idleExpiresAt: iso(addMinutes(createdAt, 60)), absoluteExpiresAt: iso(addDays(createdAt, 30)), rotatedFromId }; return { rawToken, csrfToken, record } }
  private sessionSummary(item: SessionRecord, current = false): SessionSummary { return { id: item.id, organizationId: item.organizationId, userId: item.userId, deviceLabel: item.deviceLabel, userAgent: item.userAgent, createdAt: item.createdAt, lastSeenAt: item.lastSeenAt, idleExpiresAt: item.idleExpiresAt, absoluteExpiresAt: item.absoluteExpiresAt, current } }
  private async authProjection(user: PlatformUser, membership: MembershipRecord, memberships: MembershipRecord[], hostname: HostnameRecord, session: SessionRecord, csrfToken: string, rawToken: string, _billing: BillingCapabilityProjection): Promise<PlatformAuthResponse & { rawSessionToken: string }> { return { user: { id: user.id, email: user.email, displayName: user.displayName, verified: Boolean(user.verifiedAt) }, membership: this.membershipProjection(membership), memberships: memberships.map((item) => this.membershipProjection(item)), hostname, csrfToken, session: this.sessionSummary(session, true), workspaceUrl: `https://${hostname.hostname}/v2/workspace`, rawSessionToken: rawToken } }
  private membershipProjection(item: MembershipRecord): TenantMembership { return { id: item.id, organizationId: item.organizationId, organizationName: item.organizationName, organizationSlug: item.organizationSlug, role: item.role, status: item.status } }
}
