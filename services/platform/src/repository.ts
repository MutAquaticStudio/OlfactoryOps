import type { BillingRecord, InvitationRepositoryRecord, MembershipRecord, OrganizationRecord, PlatformUser, SessionRecord, VerificationRecord } from './types.js'
import type { HostnameRecord, InvitationRecord, MemberProjection, NotificationDelivery, NotificationPreference, ObservabilityProjection, ConsentRecord, ExportRequest, PushSubscriptionInput, PlatformRole } from '../../../packages/contracts/src/index.js'

export type SignupSeed = {
  user: PlatformUser
  organization: OrganizationRecord
  membership: MembershipRecord
  hostname: HostnameRecord
}

export type SessionCreate = Omit<SessionRecord, 'revokedAt' | 'revokeReason' | 'lastSeenAt'> & { lastSeenAt?: string }
export type RepositoryContext = { organizationId?: string; userId?: string }

export class SignupWriteError extends Error {
  constructor(readonly code: `SIGNUP_WRITE_${string}`) { super(code) }
}

export interface PlatformRepository {
  transaction<T>(callback: (repository: PlatformRepository) => Promise<T>, context?: RepositoryContext): Promise<T>
  findUserByEmail(email: string): Promise<PlatformUser | null>
  findUserById(id: string): Promise<PlatformUser | null>
  createUser(user: PlatformUser): Promise<PlatformUser>
  createSignup(input: {
    user: PlatformUser
    organization: OrganizationRecord
    membership: MembershipRecord
    hostname: HostnameRecord
    rolePermissions: string[]
    rolePolicies?: Record<string, string[]>
    billing: BillingRecord
  }): Promise<SignupSeed>
  listMemberships(userId: string): Promise<MembershipRecord[]>
  findMembership(userId: string, organizationId: string): Promise<MembershipRecord | null>
  findHostname(hostname: string): Promise<HostnameRecord | null>
  findDefaultHostname(organizationId: string): Promise<HostnameRecord | null>
  createHostname(record: HostnameRecord): Promise<HostnameRecord>
  updateHostname(id: string, organizationId: string, patch: Partial<Pick<HostnameRecord, 'status' | 'validationStatus' | 'sslStatus'>> & { providerRef?: string }): Promise<HostnameRecord>
  getBranding(organizationId: string): Promise<{ displayName: string; logoObjectRef?: string; faviconObjectRef?: string; accentColor?: string; footerText?: string; locale: string }>
  saveBranding(organizationId: string, branding: { displayName: string; logoObjectRef?: string; faviconObjectRef?: string; accentColor?: string; footerText?: string; locale: string }): Promise<void>
  createSession(session: SessionCreate): Promise<SessionRecord>
  findSessionByHash(tokenVerifierHash: string): Promise<SessionRecord | null>
  listSessions(userId: string, organizationId: string): Promise<SessionRecord[]>
  revokeSession(sessionId: string, organizationId: string, reason: string): Promise<void>
  revokeAllSessions(userId: string, organizationId: string, keepSessionId?: string, reason?: string): Promise<void>
  touchSession(sessionId: string, organizationId: string, lastSeenAt: string, idleExpiresAt: string): Promise<void>
  saveVerification(record: VerificationRecord): Promise<void>
  findLatestVerification(userId: string, organizationId: string): Promise<VerificationRecord | null>
  findVerification(tokenHash: string): Promise<VerificationRecord | null>
  revokeVerifications(userId: string, organizationId: string): Promise<void>
  markVerificationComplete(id: string, completedAt: string): Promise<void>
  markUserVerified(userId: string, verifiedAt: string): Promise<void>
  markUserUnverified(userId: string): Promise<void>
  updateEmail(userId: string, email: string): Promise<void>
  updatePassword(userId: string, passwordHash: string): Promise<void>
  getRolePermissions(organizationId: string, role: string): Promise<string[]>
  setRolePermissions(organizationId: string, role: string, permissions: string[], actorId: string): Promise<number>
  countActiveOwners(organizationId: string): Promise<number>
  getBilling(organizationId: string): Promise<BillingRecord>
  getNotifications(userId: string, organizationId: string): Promise<NotificationDelivery[]>
  getNotificationPreferences(userId: string, organizationId: string): Promise<NotificationPreference[]>
  setNotificationPreference(userId: string, organizationId: string, preference: NotificationPreference): Promise<void>
  enqueueNotification(input: { userId?: string; organizationId: string; eventType: string; channel: NotificationPreference['channel']; idempotencyKey: string; payload: Record<string, unknown> }): Promise<void>
  listOrganizationMembers(organizationId: string): Promise<MemberProjection[]>
  createInvitation(record: InvitationRepositoryRecord): Promise<InvitationRepositoryRecord>
  listInvitations(organizationId: string): Promise<InvitationRecord[]>
  findPendingInvitation(organizationId: string, email: string): Promise<InvitationRepositoryRecord | null>
  findInvitationByHash(tokenHash: string): Promise<InvitationRepositoryRecord | null>
  revokeInvitation(id: string, organizationId: string, reason: string): Promise<void>
  expireInvitation(id: string, organizationId: string): Promise<void>
  acceptInvitation(id: string, organizationId: string, userId: string, acceptedAt: string): Promise<void>
  createMembership(input: { id: string; organizationId: string; userId: string; role: PlatformRole }): Promise<MembershipRecord>
  savePushSubscription(input: PushSubscriptionInput & { userId: string; organizationId: string; endpointHash: string }): Promise<void>
  revokePushSubscription(userId: string, organizationId: string, endpointHash: string): Promise<void>
  createConsent(userId: string, organizationId: string | undefined, purpose: ConsentRecord['purpose'], policyVersion: string, acceptedAt: string): Promise<ConsentRecord>
  listConsents(userId: string, organizationId: string): Promise<ConsentRecord[]>
  createExport(input: { kind: ExportRequest['kind']; userId: string; organizationId?: string; requestedAt: string }): Promise<ExportRequest>
  listExports(userId: string, organizationId: string): Promise<ExportRequest[]>
  getObservability(organizationId: string): Promise<ObservabilityProjection>
  appendAudit(input: { organizationId: string; actorUserId?: string; action: string; outcome: string; subjectType: string; subjectId: string; correlationId: string; payloadHash?: string }): Promise<void>
}
