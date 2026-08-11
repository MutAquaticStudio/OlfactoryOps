import { PrismaClient } from '@prisma/client'
import type { BillingRecord, InvitationRepositoryRecord, MembershipRecord, OrganizationRecord, PlatformUser, SessionRecord, VerificationRecord } from './types.js'
import { SignupWriteError, type PlatformRepository, type RepositoryContext, type SessionCreate, type SignupSeed } from './repository.js'
import type { ConsentRecord, ExportRequest, HostnameRecord, InvitationRecord, MemberProjection, NotificationDelivery, NotificationPreference, ObservabilityProjection, PushSubscriptionInput, PlatformRole } from '../../../packages/contracts/src/index.js'

type PrismaLike = PrismaClient
const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : value

export function signupWriteFailureCategory(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  const code = error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : ''
  const name = error && typeof error === 'object' && 'name' in error && typeof (error as { name?: unknown }).name === 'string'
    ? (error as { name: string }).name
    : ''
  const nested = error && typeof error === 'object' && 'cause' in error
    ? (error as { cause?: unknown }).cause
    : undefined
  const databaseCode = [error, nested].find((candidate) => candidate && typeof candidate === 'object' && 'meta' in candidate
    && typeof (candidate as { meta?: { code?: unknown } }).meta?.code === 'string') as { meta?: { code?: string } } | undefined
  const causeCode = nested && typeof nested === 'object' && 'code' in nested && typeof (nested as { code?: unknown }).code === 'string'
    ? (nested as { code: string }).code
    : ''
  const sqlState = databaseCode?.meta?.code ?? causeCode
  if (sqlState === '42501' || /row-level security/i.test(message)) return 'RLS'
  if (/permission denied/i.test(message)) return 'PERMISSION'
  if (sqlState === '23503' || /foreign key/i.test(message) || code === 'P2003') return 'FOREIGN_KEY'
  if (sqlState === '23505' || /unique constraint/i.test(message) || code === 'P2002') return 'CONFLICT'
  if (sqlState === '23502' || /not-null constraint/i.test(message) || code === 'P2011') return 'NOT_NULL'
  if (sqlState === '23514' || /check constraint/i.test(message) || code === 'P2004') return 'CHECK'
  if (sqlState === '22P02' || /invalid input syntax/i.test(message) || code === 'P2000') return 'INVALID'
  if (code === 'P2021' || code === 'P2022' || /relation .* does not exist|column .* does not exist/i.test(message)) return 'SCHEMA'
  if (code === 'P2010' || /prepared statement|bind message|postgres/i.test(message)) return 'DATABASE'
  if (/driveradapter|adapter/i.test(name)) return 'ADAPTER'
  if (/prismaclient.*request/i.test(name)) return 'PRISMA_REQUEST'
  if (name === 'TypeError') return 'TYPE'
  return 'FAILED'
}

async function signupWrite<T>(step: string, operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    throw new SignupWriteError(`SIGNUP_WRITE_${step}_${signupWriteFailureCategory(error)}`)
  }
}

export class PrismaPlatformRepository implements PlatformRepository {
  constructor(private readonly client: PrismaLike) {}

  async transaction<T>(callback: (repository: PlatformRepository) => Promise<T>, context?: RepositoryContext): Promise<T> {
    return this.client.$transaction(async (tx): Promise<T> => {
      if (context?.organizationId) await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true)`
      if (context?.userId) await tx.$executeRaw`SELECT set_config('app.user_id', ${context.userId}, true)`
      return callback(new PrismaPlatformRepository(tx as unknown as PrismaClient))
    }, {
      // Signup seeds a complete tenant, security state, and default policies.
      // The Worker-to-Hyperdrive round trips can exceed Prisma's 5s default
      // interactive-transaction budget, while remaining below the Worker CPU cap.
      maxWait: 10_000,
      timeout: 20_000,
    })
  }

  async findUserByEmail(email: string) { const run = async (client: PrismaClient) => { await client.$executeRawUnsafe(`SELECT set_config('app.login_email', $1, true)`, email); return client.user.findUnique({ where: { email } }) }; const row = typeof (this.client as unknown as { $transaction?: unknown }).$transaction === 'function' ? await this.client.$transaction((tx) => run(tx as unknown as PrismaClient)) : await run(this.client); return row ? this.user(row) : null }
  async findUserById(id: string) { const row = await this.client.user.findUnique({ where: { id } }); return row ? this.user(row) : null }
  async createUser(user: PlatformUser) { const row = await this.client.user.create({ data: { id: user.id, email: user.email, displayName: user.displayName, passwordHash: user.passwordHash, status: user.status, verifiedAt: user.verifiedAt ? new Date(user.verifiedAt) : undefined } }); return this.user(row) }

  async createSignup(input: { user: PlatformUser; organization: OrganizationRecord; membership: MembershipRecord; hostname: HostnameRecord; rolePermissions: string[]; rolePolicies?: Record<string, string[]>; billing: BillingRecord }): Promise<SignupSeed> {
    await signupWrite('CONTEXT_ORGANIZATION', () => this.client.$executeRaw`SELECT set_config('app.organization_id', ${input.organization.id}, true)`)
    await signupWrite('CONTEXT_USER', () => this.client.$executeRaw`SELECT set_config('app.user_id', ${input.user.id}, true)`)
    const [context] = await signupWrite('CONTEXT_READ', () => this.client.$queryRaw<Array<{ organizationId: string | null; userId: string | null }>>`SELECT current_setting('app.organization_id', true) AS "organizationId", current_setting('app.user_id', true) AS "userId"`)
    if (context?.organizationId !== input.organization.id || context.userId !== input.user.id) {
      throw new SignupWriteError('SIGNUP_WRITE_CONTEXT_MISMATCH')
    }
    await signupWrite('ORGANIZATION', () => this.client.organization.create({ data: { id: input.organization.id, slug: input.organization.slug, name: input.organization.name, status: input.organization.status } }))
    await signupWrite('USER', () => this.client.user.create({ data: { id: input.user.id, email: input.user.email, displayName: input.user.displayName, passwordHash: input.user.passwordHash, status: input.user.status } }))
    await signupWrite('MEMBERSHIP', () => this.client.membership.create({ data: { id: input.membership.id, organizationId: input.membership.organizationId, userId: input.membership.userId, roleKey: input.membership.role, status: input.membership.status } }))
    await signupWrite('HOSTNAME', () => this.client.workspaceHostname.create({ data: { id: input.hostname.id, organizationId: input.hostname.organizationId, hostname: input.hostname.hostname, kind: input.hostname.kind, status: input.hostname.status, validationStatus: input.hostname.validationStatus, sslStatus: input.hostname.sslStatus } }))
    // Prisma's Worker adapter serializes JSON write results differently from its
    // Node runtime. Keep the bootstrap write RLS-scoped, parameterized, and
    // batched so a tenant signup does not make one Hyperdrive round trip per role.
    const rolePolicies = Object.entries(input.rolePolicies ?? { Owner: input.rolePermissions }).map(([role, permissions]) => ({
      id: `policy_${input.organization.id}_${role}`,
      role_key: role,
      permissions,
    }))
    await signupWrite('ROLE_POLICY', () => this.client.$executeRaw`
      INSERT INTO v2_role_policies (id, organization_id, role_key, permissions, version, updated_by)
      SELECT payload.id, ${input.organization.id}, payload.role_key, payload.permissions, 1, ${input.user.id}
      FROM jsonb_to_recordset(CAST(${JSON.stringify(rolePolicies)} AS jsonb))
      AS payload(id TEXT, role_key TEXT, permissions JSONB)
    `)
    await signupWrite('SUBSCRIPTION', () => this.client.subscription.create({ data: { id: `sub_${input.organization.id}`, organizationId: input.organization.id, planId: 'managed_beta', status: input.billing.status } }))
    const entitlements = Object.entries(input.billing.capabilities).map(([capability, enabled]) => ({
      id: `ent_${input.organization.id}_${capability.replace(/[^a-z0-9]/gi, '_')}`,
      capability,
      enabled,
    }))
    await signupWrite('ENTITLEMENT', () => this.client.$executeRaw`
      INSERT INTO v2_entitlements (id, organization_id, capability, enabled, source)
      SELECT payload.id, ${input.organization.id}, payload.capability, payload.enabled, 'MANAGED_BETA'
      FROM jsonb_to_recordset(CAST(${JSON.stringify(entitlements)} AS jsonb))
      AS payload(id TEXT, capability TEXT, enabled BOOLEAN)
    `)
    return { user: input.user, organization: input.organization, membership: input.membership, hostname: input.hostname }
  }
  async listMemberships(userId: string) { const rows = await this.client.membership.findMany({ where: { userId, status: 'ACTIVE' }, include: { organization: true } }); return rows.map((row) => this.membership(row)) }
  async findMembership(userId: string, organizationId: string) { const row = await this.client.membership.findFirst({ where: { userId, organizationId, status: 'ACTIVE' }, include: { organization: true } }); return row ? this.membership(row) : null }
  async findHostname(hostname: string) { const run = async (client: PrismaClient) => { await client.$executeRawUnsafe(`SELECT set_config('app.request_hostname', $1, true)`, hostname); return client.workspaceHostname.findUnique({ where: { hostname } }) }; const row = typeof (this.client as unknown as { $transaction?: unknown }).$transaction === 'function' ? await this.client.$transaction((tx) => run(tx as unknown as PrismaClient)) : await run(this.client); return row ? this.hostname(row) : null }
  async findDefaultHostname(organizationId: string) { const row = await this.client.workspaceHostname.findFirst({ where: { organizationId, kind: 'DEFAULT' } }); return row ? this.hostname(row) : null }
  async createHostname(record: HostnameRecord) { const row = await this.client.workspaceHostname.create({ data: { id: record.id, organizationId: record.organizationId, hostname: record.hostname, kind: record.kind, status: record.status, validationStatus: record.validationStatus, sslStatus: record.sslStatus } }); return this.hostname(row) }
  async updateHostname(id: string, organizationId: string, patch: Partial<Pick<HostnameRecord, 'status' | 'validationStatus' | 'sslStatus'>> & { providerRef?: string }) { const row = await this.client.workspaceHostname.update({ where: { id }, data: { ...patch, providerRef: patch.providerRef } }); if (row.organizationId !== organizationId) throw new Error('TENANT_ACCESS_DENIED'); return this.hostname(row) }
  async getBranding(organizationId: string) { const row = await this.client.workspaceBranding.findUnique({ where: { organizationId } }); return row ? { displayName: row.displayName, logoObjectRef: row.logoObjectRef ?? undefined, faviconObjectRef: row.faviconObjectRef ?? undefined, accentColor: row.accentColor ?? undefined, footerText: row.footerText ?? undefined, locale: row.locale } : { displayName: 'OlfactoryOps', locale: 'en-US' } }
  async saveBranding(organizationId: string, branding: { displayName: string; logoObjectRef?: string; faviconObjectRef?: string; accentColor?: string; footerText?: string; locale: string }) { await this.client.workspaceBranding.upsert({ where: { organizationId }, create: { id: `brand_${organizationId}`, organizationId, ...branding }, update: branding }) }
  async createSession(input: SessionCreate) { const row = await this.client.session.create({ data: { id: input.id, userId: input.userId, organizationId: input.organizationId, tokenVerifierHash: input.tokenVerifierHash, csrfVerifierHash: input.csrfVerifierHash, deviceLabel: input.deviceLabel, userAgent: input.userAgent, createdAt: new Date(input.createdAt), lastSeenAt: new Date(input.lastSeenAt ?? input.createdAt), idleExpiresAt: new Date(input.idleExpiresAt), absoluteExpiresAt: new Date(input.absoluteExpiresAt), rotatedFromId: input.rotatedFromId } }); return this.session(row) }
  async findSessionByHash(tokenVerifierHash: string) { const run = async (client: PrismaClient) => { await client.$executeRawUnsafe(`SELECT set_config('app.session_hash', $1, true)`, tokenVerifierHash); return client.session.findUnique({ where: { tokenVerifierHash } }) }; const row = typeof (this.client as unknown as { $transaction?: unknown }).$transaction === 'function' ? await this.client.$transaction((tx) => run(tx as unknown as PrismaClient)) : await run(this.client); return row ? this.session(row) : null }
  async listSessions(userId: string, organizationId: string) { const rows = await this.client.session.findMany({ where: { userId, organizationId, revokedAt: null }, orderBy: { lastSeenAt: 'desc' } }); return rows.map((row) => this.session(row)) }
  async revokeSession(sessionId: string, organizationId: string, reason: string) { await this.client.session.updateMany({ where: { id: sessionId, organizationId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } }) }
  async revokeAllSessions(userId: string, organizationId: string, keepSessionId?: string, reason = 'revoke-all') { await this.client.session.updateMany({ where: { userId, organizationId, revokedAt: null, ...(keepSessionId ? { NOT: { id: keepSessionId } } : {}) }, data: { revokedAt: new Date(), revokeReason: reason } }) }
  async touchSession(sessionId: string, organizationId: string, lastSeenAt: string, idleExpiresAt: string) { await this.client.session.updateMany({ where: { id: sessionId, organizationId, revokedAt: null }, data: { lastSeenAt: new Date(lastSeenAt), idleExpiresAt: new Date(idleExpiresAt) } }) }
  async saveVerification(record: VerificationRecord) { await this.client.emailVerification.create({ data: { id: record.id, userId: record.userId, organizationId: record.organizationId, email: record.email, tokenHash: record.tokenHash, expiresAt: new Date(record.expiresAt), createdAt: new Date(record.createdAt) } }) }
  async findLatestVerification(userId: string, organizationId: string) { const row = await this.client.emailVerification.findFirst({ where: { userId, organizationId }, orderBy: { createdAt: 'desc' } }); return row ? this.verification(row) : null }
  async findVerification(tokenHash: string) { const run = async (client: PrismaClient) => { await client.$executeRawUnsafe(`SELECT set_config('app.verification_hash', $1, true)`, tokenHash); return client.emailVerification.findUnique({ where: { tokenHash } }) }; const row = typeof (this.client as unknown as { $transaction?: unknown }).$transaction === 'function' ? await this.client.$transaction((tx) => run(tx as unknown as PrismaClient)) : await run(this.client); return row ? this.verification(row) : null }
  async revokeVerifications(userId: string, organizationId: string) { await this.client.emailVerification.updateMany({ where: { userId, organizationId, verifiedAt: null, revokedAt: null }, data: { revokedAt: new Date() } }) }
  async markVerificationComplete(id: string, completedAt: string) { await this.client.emailVerification.update({ where: { id }, data: { verifiedAt: new Date(completedAt) } }) }
  async markUserVerified(userId: string, verifiedAt: string) { await this.client.user.update({ where: { id: userId }, data: { verifiedAt: new Date(verifiedAt) } }) }
  async markUserUnverified(userId: string) { await this.client.user.update({ where: { id: userId }, data: { verifiedAt: null } }) }
  async updateEmail(userId: string, email: string) { await this.client.user.update({ where: { id: userId }, data: { email } }) }
  async updatePassword(userId: string, passwordHash: string) { await this.client.user.update({ where: { id: userId }, data: { passwordHash } }) }
  async getRolePermissions(organizationId: string, role: string) { const row = await this.client.rolePolicy.findUnique({ where: { organizationId_roleKey: { organizationId, roleKey: role } } }); return Array.isArray(row?.permissions) ? row.permissions.filter((item): item is string => typeof item === 'string') : [] }
  async setRolePermissions(organizationId: string, role: string, permissions: string[], actorId: string) { const row = await this.client.rolePolicy.upsert({ where: { organizationId_roleKey: { organizationId, roleKey: role } }, create: { id: `policy_${organizationId}_${role}`, organizationId, roleKey: role, permissions, version: 1, updatedBy: actorId }, update: { permissions, updatedBy: actorId, version: { increment: 1 } } }); return row.version }
  async countActiveOwners(organizationId: string) { return this.client.membership.count({ where: { organizationId, roleKey: 'Owner', status: 'ACTIVE' } }) }
  async getBilling(organizationId: string): Promise<BillingRecord> { const subscription = await this.client.subscription.findFirst({ where: { organizationId }, include: { plan: true } }); const entitlements = await this.client.entitlement.findMany({ where: { organizationId } }); const limits = await this.client.usageLimit.findMany({ where: { organizationId } }); return { mode: 'MANAGED_BETA', status: subscription?.status === 'MANAGED_BETA' ? 'ACTIVE' : 'NOT_CONFIGURED', capabilities: Object.fromEntries(entitlements.map((item) => [item.capability, item.enabled])), limits: Object.fromEntries(limits.map((item) => [item.key, item.value])) } }
  async getNotifications(userId: string, organizationId: string) { const rows = await this.client.notificationOutbox.findMany({ where: { organizationId, recipientUserId: userId }, orderBy: { createdAt: 'desc' } }); return rows.map((row) => ({ id: row.id, eventType: row.eventType, channel: row.channel as NotificationDelivery['channel'], status: row.status as NotificationDelivery['status'], attempts: row.attempts, nextAttemptAt: row.nextAttemptAt.toISOString() })) }
  async getNotificationPreferences(userId: string, organizationId: string) { const rows = await this.client.notificationPreference.findMany({ where: { userId, organizationId } }); return rows.map((row) => ({ eventType: row.eventType, channel: row.channel as NotificationPreference['channel'], enabled: row.enabled })) }
  async setNotificationPreference(userId: string, organizationId: string, preference: NotificationPreference) { await this.client.notificationPreference.upsert({ where: { organizationId_userId_eventType_channel: { organizationId, userId, eventType: preference.eventType, channel: preference.channel } }, create: { id: `pref_${organizationId}_${userId}_${preference.eventType}_${preference.channel}`, organizationId, userId, eventType: preference.eventType, channel: preference.channel, enabled: preference.enabled }, update: { enabled: preference.enabled } }) }
  async enqueueNotification(input: { userId?: string; organizationId: string; eventType: string; channel: NotificationPreference['channel']; idempotencyKey: string; payload: Record<string, unknown> }) { await this.client.notificationOutbox.upsert({ where: { organizationId_idempotencyKey_channel: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey, channel: input.channel } }, create: { id: `out_${input.organizationId}_${input.idempotencyKey}`, organizationId: input.organizationId, recipientUserId: input.userId, eventType: input.eventType, channel: input.channel, payload: input.payload as never, idempotencyKey: input.idempotencyKey }, update: {} }) }
  async listOrganizationMembers(organizationId: string): Promise<MemberProjection[]> { const rows = await this.client.membership.findMany({ where: { organizationId }, include: { user: true } }); return rows.map((row) => ({ id: row.id, userId: row.userId, email: row.user.email, displayName: row.user.displayName, role: row.roleKey as MemberProjection['role'], status: row.status as MemberProjection['status'] })) }
  async createInvitation(record: InvitationRepositoryRecord) { const row = await this.client.invitation.create({ data: { id: record.id, organizationId: record.organizationId, email: record.email, roleKey: record.role, tokenHash: record.tokenHash, status: record.status, invitedBy: record.invitedBy, expiresAt: new Date(record.expiresAt), createdAt: new Date(record.createdAt), acceptedAt: record.acceptedAt ? new Date(record.acceptedAt) : undefined, acceptedUserId: record.acceptedUserId, revokedAt: record.revokedAt ? new Date(record.revokedAt) : undefined } }); return this.invitation(row) }
  async listInvitations(organizationId: string): Promise<InvitationRecord[]> { const rows = await this.client.invitation.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } }); return rows.map((row) => this.invitationProjection(row)) }
  async findPendingInvitation(organizationId: string, email: string) { const row = await this.client.invitation.findFirst({ where: { organizationId, email, status: 'PENDING' }, orderBy: { createdAt: 'desc' } }); return row ? this.invitation(row) : null }
  async findInvitationByHash(tokenHash: string) { const run = async (client: PrismaClient) => { await client.$executeRawUnsafe(`SELECT set_config('app.invitation_hash', $1, true)`, tokenHash); return client.invitation.findUnique({ where: { tokenHash } }) }; const row = typeof (this.client as unknown as { $transaction?: unknown }).$transaction === 'function' ? await this.client.$transaction((tx) => run(tx as unknown as PrismaClient)) : await run(this.client); return row ? this.invitation(row) : null }
  async revokeInvitation(id: string, organizationId: string, _reason: string) { await this.client.invitation.updateMany({ where: { id, organizationId, status: 'PENDING' }, data: { status: 'REVOKED', revokedAt: new Date() } }) }
  async expireInvitation(id: string, organizationId: string) { await this.client.invitation.updateMany({ where: { id, organizationId, status: 'PENDING' }, data: { status: 'EXPIRED' } }) }
  async acceptInvitation(id: string, organizationId: string, userId: string, acceptedAt: string) { await this.client.invitation.updateMany({ where: { id, organizationId, status: 'PENDING' }, data: { status: 'ACCEPTED', acceptedAt: new Date(acceptedAt), acceptedUserId: userId } }) }
  async createMembership(input: { id: string; organizationId: string; userId: string; role: PlatformRole }) { const row = await this.client.membership.create({ data: { id: input.id, organizationId: input.organizationId, userId: input.userId, roleKey: input.role, status: 'ACTIVE' }, include: { organization: true } }); return this.membership(row) }
  async savePushSubscription(input: PushSubscriptionInput & { userId: string; organizationId: string; endpointHash: string }) { await this.client.pushSubscription.upsert({ where: { organizationId_endpointHash: { organizationId: input.organizationId, endpointHash: input.endpointHash } }, create: { id: `push_${input.organizationId}_${input.endpointHash.slice(0, 24)}`, organizationId: input.organizationId, userId: input.userId, endpointHash: input.endpointHash, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent }, update: { userId: input.userId, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent, revokedAt: null } }) }
  async revokePushSubscription(userId: string, organizationId: string, endpointHash: string) { await this.client.pushSubscription.updateMany({ where: { userId, organizationId, endpointHash }, data: { revokedAt: new Date() } }) }
  async createConsent(userId: string, organizationId: string | undefined, purpose: ConsentRecord['purpose'], policyVersion: string, acceptedAt: string) { const row = await this.client.consentRecord.create({ data: { id: `consent_${userId}_${purpose}_${Date.now()}`, userId, organizationId, purpose, policyVersion, acceptedAt: new Date(acceptedAt) } }); return { id: row.id, purpose: row.purpose as ConsentRecord['purpose'], policyVersion: row.policyVersion, acceptedAt: row.acceptedAt.toISOString(), withdrawnAt: row.withdrawnAt?.toISOString() } }
  async listConsents(userId: string, organizationId: string) { const rows = await this.client.consentRecord.findMany({ where: { userId, OR: [{ organizationId }, { organizationId: null }] } }); return rows.map((row) => ({ id: row.id, purpose: row.purpose as ConsentRecord['purpose'], policyVersion: row.policyVersion, acceptedAt: row.acceptedAt.toISOString(), withdrawnAt: row.withdrawnAt?.toISOString() })) }
  async createExport(input: { kind: ExportRequest['kind']; userId: string; organizationId?: string; requestedAt: string }) { const row = input.kind === 'WORKSPACE' ? await this.client.workspaceExportRequest.create({ data: { id: `export_${input.userId}_${Date.now()}`, organizationId: input.organizationId!, requestedBy: input.userId, requestedAt: new Date(input.requestedAt) } }) : input.kind === 'ERASURE_REVIEW' ? await this.client.erasureReviewRequest.create({ data: { id: `export_${input.userId}_${Date.now()}`, userId: input.userId, organizationId: input.organizationId, requestedAt: new Date(input.requestedAt) } }) : await this.client.privacyExportRequest.create({ data: { id: `export_${input.userId}_${Date.now()}`, userId: input.userId, organizationId: input.organizationId, requestedAt: new Date(input.requestedAt) } }); return { id: row.id, kind: input.kind, status: (row.status === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'REQUESTED') as ExportRequest['status'], requestedAt: row.requestedAt.toISOString(), completedAt: 'completedAt' in row && row.completedAt ? row.completedAt.toISOString() : undefined } }
  async listExports(userId: string, organizationId: string) { const [privacy, workspace, erasure] = await Promise.all([this.client.privacyExportRequest.findMany({ where: { userId, organizationId } }), this.client.workspaceExportRequest.findMany({ where: { organizationId } }), this.client.erasureReviewRequest.findMany({ where: { userId, organizationId } })]); return [...privacy.map((row) => ({ id: row.id, kind: 'PRIVACY' as const, status: row.status as ExportRequest['status'], requestedAt: row.requestedAt.toISOString(), completedAt: row.completedAt?.toISOString() })), ...workspace.map((row) => ({ id: row.id, kind: 'WORKSPACE' as const, status: row.status as ExportRequest['status'], requestedAt: row.requestedAt.toISOString(), completedAt: row.completedAt?.toISOString() })), ...erasure.map((row) => ({ id: row.id, kind: 'ERASURE_REVIEW' as const, status: row.status as ExportRequest['status'], requestedAt: row.requestedAt.toISOString(), completedAt: row.reviewedAt?.toISOString() }))] }
  async getObservability(_organizationId: string): Promise<ObservabilityProjection> { return { api: 'PASS', database: 'PASS', queue: 'NOT_CONFIGURED', email: 'NOT_CONFIGURED', push: 'NOT_CONFIGURED', billing: 'PASS', domains: 'PASS', degradedCount: 2, capturedAt: new Date().toISOString() } }
  async appendAudit(input: { organizationId: string; actorUserId?: string; action: string; outcome: string; subjectType: string; subjectId: string; correlationId: string; payloadHash?: string }) { await this.client.auditEvent.create({ data: { id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, ...input } }) }

  private user(row: { id: string; email: string; displayName: string; passwordHash: string; status: string; verifiedAt: Date | null }): PlatformUser { return { id: row.id, email: row.email, displayName: row.displayName, passwordHash: row.passwordHash, status: row.status as PlatformUser['status'], verifiedAt: row.verifiedAt?.toISOString() } }
  private membership(row: { id: string; organizationId: string; userId: string; roleKey: string; status: string; organization: { name: string; slug: string } }): MembershipRecord { return { id: row.id, organizationId: row.organizationId, organizationName: row.organization.name, organizationSlug: row.organization.slug, userId: row.userId, role: row.roleKey as MembershipRecord['role'], status: row.status as MembershipRecord['status'] } }
  private hostname(row: { id: string; organizationId: string; hostname: string; kind: string; status: string; validationStatus: string | null; sslStatus: string | null }): HostnameRecord { return { id: row.id, organizationId: row.organizationId, hostname: row.hostname, kind: row.kind as HostnameRecord['kind'], status: row.status as HostnameRecord['status'], validationStatus: row.validationStatus, sslStatus: row.sslStatus } }
  private session(row: { id: string; userId: string; organizationId: string; tokenVerifierHash: string; csrfVerifierHash: string; deviceLabel: string | null; userAgent: string | null; createdAt: Date; lastSeenAt: Date; idleExpiresAt: Date; absoluteExpiresAt: Date; rotatedFromId: string | null; revokedAt: Date | null; revokeReason: string | null }): SessionRecord { return { id: row.id, userId: row.userId, organizationId: row.organizationId, tokenVerifierHash: row.tokenVerifierHash, csrfVerifierHash: row.csrfVerifierHash, deviceLabel: row.deviceLabel ?? undefined, userAgent: row.userAgent ?? undefined, createdAt: iso(row.createdAt), lastSeenAt: iso(row.lastSeenAt), idleExpiresAt: iso(row.idleExpiresAt), absoluteExpiresAt: iso(row.absoluteExpiresAt), rotatedFromId: row.rotatedFromId ?? undefined, revokedAt: row.revokedAt?.toISOString(), revokeReason: row.revokeReason ?? undefined } }
  private verification(row: { id: string; userId: string; organizationId: string; email: string; tokenHash: string; expiresAt: Date; createdAt: Date; verifiedAt: Date | null; revokedAt: Date | null }): VerificationRecord { return { id: row.id, userId: row.userId, organizationId: row.organizationId, email: row.email, tokenHash: row.tokenHash, expiresAt: iso(row.expiresAt), createdAt: iso(row.createdAt), verifiedAt: row.verifiedAt?.toISOString(), revokedAt: row.revokedAt?.toISOString() } }
  private invitation(row: { id: string; organizationId: string; email: string; roleKey: string; tokenHash: string; status: string; invitedBy: string; expiresAt: Date; createdAt: Date; acceptedAt: Date | null; acceptedUserId: string | null; revokedAt: Date | null }): InvitationRepositoryRecord { return { id: row.id, organizationId: row.organizationId, email: row.email, role: row.roleKey as PlatformRole, tokenHash: row.tokenHash, status: row.status as InvitationRecord['status'], invitedBy: row.invitedBy, expiresAt: iso(row.expiresAt), createdAt: iso(row.createdAt), acceptedAt: row.acceptedAt?.toISOString(), acceptedUserId: row.acceptedUserId ?? undefined, revokedAt: row.revokedAt?.toISOString() } }
  private invitationProjection(row: { id: string; organizationId: string; email: string; roleKey: string; status: string; expiresAt: Date; createdAt: Date; acceptedAt: Date | null; revokedAt: Date | null }): InvitationRecord { return { id: row.id, organizationId: row.organizationId, email: row.email, role: row.roleKey as PlatformRole, status: row.status as InvitationRecord['status'], expiresAt: iso(row.expiresAt), createdAt: iso(row.createdAt), acceptedAt: row.acceptedAt?.toISOString(), revokedAt: row.revokedAt?.toISOString() } }
}
