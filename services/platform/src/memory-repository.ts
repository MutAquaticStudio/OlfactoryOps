import { randomUUID } from 'node:crypto'
import type { BillingRecord, InvitationRepositoryRecord, MembershipRecord, OrganizationRecord, PlatformUser, SessionRecord, VerificationRecord } from './types.js'
import type { HostnameRecord, InvitationRecord, MemberProjection, NotificationDelivery, NotificationPreference, ObservabilityProjection, ConsentRecord, ExportRequest, PushSubscriptionInput, PlatformRole } from '../../../packages/contracts/src/index.js'
import type { PlatformRepository, SessionCreate, SignupSeed } from './repository.js'

function clone<T>(value: T): T { return structuredClone(value) }
function now() { return new Date().toISOString() }

export class MemoryPlatformRepository implements PlatformRepository {
  users: PlatformUser[] = []
  organizations: OrganizationRecord[] = []
  memberships: MembershipRecord[] = []
  invitations: InvitationRepositoryRecord[] = []
  hostnames: HostnameRecord[] = []
  branding = new Map<string, { displayName: string; logoObjectRef?: string; faviconObjectRef?: string; accentColor?: string; footerText?: string; locale: string }>()
  sessions: SessionRecord[] = []
  verifications: VerificationRecord[] = []
  rolePolicies = new Map<string, string[]>()
  billing = new Map<string, BillingRecord>()
  notificationPreferences: Array<NotificationPreference & { userId: string; organizationId: string }> = []
  notifications: Array<NotificationDelivery & { userId?: string; organizationId: string }> = []
  notificationPayloads = new Map<string, Record<string, unknown>>()
  consents: Array<ConsentRecord & { userId: string; organizationId?: string }> = []
  exports: Array<ExportRequest & { userId: string; organizationId?: string }> = []
  audits: Array<{ organizationId: string; action: string; outcome: string; subjectType: string; subjectId: string }> = []
  pushSubscriptions: Array<PushSubscriptionInput & { userId: string; organizationId: string; endpointHash: string }> = []

  async transaction<T>(callback: (repository: PlatformRepository) => Promise<T>): Promise<T> { return callback(this) }
  async findUserByEmail(email: string) { return clone(this.users.find((item) => item.email === email.toLowerCase()) ?? null) }
  async findUserById(id: string) { return clone(this.users.find((item) => item.id === id) ?? null) }
  async createUser(user: PlatformUser) { if (this.users.some((item) => item.email === user.email)) throw new Error('EMAIL_CONFLICT'); this.users.push(clone(user)); return clone(user) }

  async createSignup(input: { user: PlatformUser; organization: OrganizationRecord; membership: MembershipRecord; hostname: HostnameRecord; rolePermissions: string[]; rolePolicies?: Record<string, string[]>; billing: BillingRecord }): Promise<SignupSeed> {
    if (this.users.some((item) => item.email === input.user.email)) throw new Error('EMAIL_CONFLICT')
    if (this.organizations.some((item) => item.slug === input.organization.slug)) throw new Error('SLUG_CONFLICT')
    if (this.hostnames.some((item) => item.hostname === input.hostname.hostname)) throw new Error('HOSTNAME_CONFLICT')
    this.users.push(clone(input.user)); this.organizations.push(clone(input.organization)); this.memberships.push(clone(input.membership)); this.hostnames.push(clone(input.hostname))
    for (const [role, permissions] of Object.entries(input.rolePolicies ?? { Owner: input.rolePermissions })) this.rolePolicies.set(`${input.organization.id}:${role}`, [...permissions])
    this.billing.set(input.organization.id, clone(input.billing))
    return { user: clone(input.user), organization: clone(input.organization), membership: clone(input.membership), hostname: clone(input.hostname) }
  }
  async listMemberships(userId: string) { return clone(this.memberships.filter((item) => item.userId === userId && item.status === 'ACTIVE')) }
  async findMembership(userId: string, organizationId: string) { return clone(this.memberships.find((item) => item.userId === userId && item.organizationId === organizationId && item.status === 'ACTIVE') ?? null) }
  async findHostname(hostname: string) { return clone(this.hostnames.find((item) => item.hostname === hostname.toLowerCase()) ?? null) }
  async findDefaultHostname(organizationId: string) { return clone(this.hostnames.find((item) => item.organizationId === organizationId && item.kind === 'DEFAULT') ?? null) }
  async createHostname(record: HostnameRecord) { if (this.hostnames.some((item) => item.hostname === record.hostname)) throw new Error('HOSTNAME_CONFLICT'); this.hostnames.push(clone(record)); return clone(record) }
  async updateHostname(id: string, organizationId: string, patch: Partial<Pick<HostnameRecord, 'status' | 'validationStatus' | 'sslStatus'>> & { providerRef?: string }) { const found = this.hostnames.find((item) => item.id === id && item.organizationId === organizationId); if (!found) throw new Error('TENANT_NOT_FOUND'); Object.assign(found, patch); return clone(found) }
  async getBranding(organizationId: string) { return clone(this.branding.get(organizationId) ?? { displayName: 'OlfactoryOps', locale: 'en-US' }) }
  async saveBranding(organizationId: string, branding: { displayName: string; logoObjectRef?: string; faviconObjectRef?: string; accentColor?: string; footerText?: string; locale: string }) { this.branding.set(organizationId, clone(branding)) }
  async createSession(input: SessionCreate) { const record = { ...input, lastSeenAt: input.lastSeenAt ?? now() }; this.sessions.push(clone(record)); return clone(record) }
  async findSessionByHash(tokenVerifierHash: string) { return clone(this.sessions.find((item) => item.tokenVerifierHash === tokenVerifierHash) ?? null) }
  async listSessions(userId: string, organizationId: string) { return clone(this.sessions.filter((item) => item.userId === userId && item.organizationId === organizationId && !item.revokedAt)) }
  async revokeSession(sessionId: string, organizationId: string, reason: string) { this.sessions = this.sessions.map((item) => item.id === sessionId && item.organizationId === organizationId ? { ...item, revokedAt: now(), revokeReason: reason } : item) }
  async revokeAllSessions(userId: string, organizationId: string, keepSessionId?: string, reason = 'revoke-all') { this.sessions = this.sessions.map((item) => item.userId === userId && item.organizationId === organizationId && item.id !== keepSessionId && !item.revokedAt ? { ...item, revokedAt: now(), revokeReason: reason } : item) }
  async touchSession(sessionId: string, organizationId: string, lastSeenAt: string, idleExpiresAt: string) { this.sessions = this.sessions.map((item) => item.id === sessionId && item.organizationId === organizationId ? { ...item, lastSeenAt, idleExpiresAt } : item) }
  async saveVerification(record: VerificationRecord) { this.verifications.push(clone(record)) }
  async findLatestVerification(userId: string, organizationId: string) { const rows = this.verifications.filter((item) => item.userId === userId && item.organizationId === organizationId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); return clone(rows[0] ?? null) }
  async findVerification(tokenHash: string) { return clone(this.verifications.find((item) => item.tokenHash === tokenHash) ?? null) }
  async revokeVerifications(userId: string, organizationId: string) { this.verifications = this.verifications.map((item) => item.userId === userId && item.organizationId === organizationId && !item.verifiedAt ? { ...item, revokedAt: now() } : item) }
  async markVerificationComplete(id: string, completedAt: string) { this.verifications = this.verifications.map((item) => item.id === id ? { ...item, verifiedAt: completedAt } : item) }
  async markUserVerified(userId: string, verifiedAt: string) { this.users = this.users.map((item) => item.id === userId ? { ...item, verifiedAt } : item) }
  async markUserUnverified(userId: string) { this.users = this.users.map((item) => item.id === userId ? { ...item, verifiedAt: undefined } : item) }
  async updateEmail(userId: string, email: string) { this.users = this.users.map((item) => item.id === userId ? { ...item, email } : item) }
  async updatePassword(userId: string, passwordHash: string) { this.users = this.users.map((item) => item.id === userId ? { ...item, passwordHash } : item) }
  async getRolePermissions(organizationId: string, role: string) { return [...(this.rolePolicies.get(`${organizationId}:${role}`) ?? [])] }
  async setRolePermissions(organizationId: string, role: string, permissions: string[], _actorId: string) { this.rolePolicies.set(`${organizationId}:${role}`, [...permissions]); return 1 }
  async countActiveOwners(organizationId: string) { return this.memberships.filter((item) => item.organizationId === organizationId && item.role === 'Owner' && item.status === 'ACTIVE').length }
  async getBilling(organizationId: string): Promise<BillingRecord> { return clone(this.billing.get(organizationId) ?? { mode: 'MANAGED_BETA', status: 'NOT_CONFIGURED', capabilities: {}, limits: {} } as BillingRecord) }
  async getNotifications(userId: string, organizationId: string) { return clone(this.notifications.filter((item) => item.organizationId === organizationId && item.userId === userId)) }
  async getNotificationPreferences(userId: string, organizationId: string) { return clone(this.notificationPreferences.filter((item) => item.userId === userId && item.organizationId === organizationId).map(({ userId: _u, organizationId: _o, ...item }) => item)) }
  async setNotificationPreference(userId: string, organizationId: string, preference: NotificationPreference) { this.notificationPreferences = this.notificationPreferences.filter((item) => !(item.userId === userId && item.organizationId === organizationId && item.eventType === preference.eventType && item.channel === preference.channel)); this.notificationPreferences.push({ ...preference, userId, organizationId }) }
  async enqueueNotification(input: { userId?: string; organizationId: string; eventType: string; channel: NotificationPreference['channel']; idempotencyKey: string; payload: Record<string, unknown> }) { if (this.notifications.some((item) => item.organizationId === input.organizationId && item.id === input.idempotencyKey)) return; const id = input.idempotencyKey || randomUUID(); this.notifications.push({ id, eventType: input.eventType, channel: input.channel, status: 'QUEUED', attempts: 0, nextAttemptAt: now(), userId: input.userId, organizationId: input.organizationId }); this.notificationPayloads.set(id, clone(input.payload)) }
  async listOrganizationMembers(organizationId: string): Promise<MemberProjection[]> { return clone(this.memberships.filter((item) => item.organizationId === organizationId).map((membership) => { const user = this.users.find((candidate) => candidate.id === membership.userId); return { id: membership.id, userId: membership.userId, email: user?.email ?? 'unknown@example.invalid', displayName: user?.displayName ?? 'Unknown user', role: membership.role, status: membership.status } })) }
  async createInvitation(record: InvitationRepositoryRecord) { if (this.invitations.some((item) => item.id === record.id || item.tokenHash === record.tokenHash)) throw new Error('INVITATION_CONFLICT'); this.invitations.push(clone(record)); return clone(record) }
  async listInvitations(organizationId: string): Promise<InvitationRecord[]> { return clone(this.invitations.filter((item) => item.organizationId === organizationId).map(({ tokenHash: _hash, invitedBy: _by, acceptedUserId: _user, ...item }) => item)) }
  async findPendingInvitation(organizationId: string, email: string) { return clone(this.invitations.find((item) => item.organizationId === organizationId && item.email === email.toLowerCase() && item.status === 'PENDING') ?? null) }
  async findInvitationByHash(tokenHash: string) { return clone(this.invitations.find((item) => item.tokenHash === tokenHash) ?? null) }
  async revokeInvitation(id: string, organizationId: string, reason: string) { this.invitations = this.invitations.map((item) => item.id === id && item.organizationId === organizationId && item.status === 'PENDING' ? { ...item, status: 'REVOKED', revokedAt: now() } : item); void reason }
  async expireInvitation(id: string, organizationId: string) { this.invitations = this.invitations.map((item) => item.id === id && item.organizationId === organizationId && item.status === 'PENDING' ? { ...item, status: 'EXPIRED' } : item) }
  async acceptInvitation(id: string, organizationId: string, userId: string, acceptedAt: string) { this.invitations = this.invitations.map((item) => item.id === id && item.organizationId === organizationId && item.status === 'PENDING' ? { ...item, status: 'ACCEPTED', acceptedAt, acceptedUserId: userId } : item) }
  async createMembership(input: { id: string; organizationId: string; userId: string; role: PlatformRole }) { const org = this.organizations.find((item) => item.id === input.organizationId); if (!org) throw new Error('TENANT_NOT_FOUND'); if (this.memberships.some((item) => item.organizationId === input.organizationId && item.userId === input.userId)) throw new Error('INVITATION_CONFLICT'); const record: MembershipRecord = { id: input.id, organizationId: input.organizationId, organizationName: org.name, organizationSlug: org.slug, userId: input.userId, role: input.role, status: 'ACTIVE' }; this.memberships.push(clone(record)); return clone(record) }
  async savePushSubscription(input: PushSubscriptionInput & { userId: string; organizationId: string; endpointHash: string }) { this.pushSubscriptions = this.pushSubscriptions.filter((item) => !(item.organizationId === input.organizationId && item.endpointHash === input.endpointHash)); this.pushSubscriptions.push(clone(input)) }
  async revokePushSubscription(userId: string, organizationId: string, endpointHash: string) { this.pushSubscriptions = this.pushSubscriptions.filter((item) => !(item.userId === userId && item.organizationId === organizationId && item.endpointHash === endpointHash)) }
  async createConsent(userId: string, organizationId: string | undefined, purpose: ConsentRecord['purpose'], policyVersion: string, acceptedAt: string) { const result = { id: randomUUID(), purpose, policyVersion, acceptedAt, userId, organizationId }; this.consents.push(result); return clone(result) }
  async listConsents(userId: string, organizationId: string) { return clone(this.consents.filter((item) => item.userId === userId && (!item.organizationId || item.organizationId === organizationId)).map(({ userId: _u, organizationId: _o, ...item }) => item)) }
  async createExport(input: { kind: ExportRequest['kind']; userId: string; organizationId?: string; requestedAt: string }): Promise<ExportRequest> { const result: ExportRequest & { userId: string; organizationId?: string } = { id: randomUUID(), kind: input.kind, status: input.kind === 'ERASURE_REVIEW' ? 'REVIEW_REQUIRED' : 'REQUESTED', requestedAt: input.requestedAt, userId: input.userId, organizationId: input.organizationId }; this.exports.push(result); return clone(result) }
  async listExports(userId: string, organizationId: string) { return clone(this.exports.filter((item) => item.userId === userId || item.organizationId === organizationId).map(({ userId: _u, organizationId: _o, ...item }) => item)) }
  async getObservability(_organizationId: string): Promise<ObservabilityProjection> { return { api: 'PASS', database: 'PASS', queue: 'NOT_CONFIGURED', email: 'NOT_CONFIGURED', push: 'NOT_CONFIGURED', billing: 'PASS', domains: 'PASS', degradedCount: 2, capturedAt: now() } }
  async appendAudit(input: { organizationId: string; actorUserId?: string; action: string; outcome: string; subjectType: string; subjectId: string; correlationId: string; payloadHash?: string }) { this.audits.push(clone(input)) }
}
