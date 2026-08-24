import type { BillingCapabilityProjection, HostnameRecord, InvitationRecord, ObservabilityProjection, PlatformRole, SessionSummary, TenantMembership } from '../../../packages/contracts/src/index.js'

export type PlatformUser = {
  id: string
  email: string
  displayName: string
  passwordHash: string
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED'
  verifiedAt?: string
}

export type OrganizationRecord = {
  id: string
  slug: string
  name: string
  status: 'ACTIVE' | 'FROZEN' | 'ARCHIVED'
}

export type MembershipRecord = {
  id: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  userId: string
  role: PlatformRole
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'REMOVED'
}

export type SessionRecord = {
  id: string
  userId: string
  organizationId: string
  tokenVerifierHash: string
  csrfVerifierHash: string
  deviceLabel?: string
  userAgent?: string
  createdAt: string
  lastSeenAt: string
  idleExpiresAt: string
  absoluteExpiresAt: string
  rotatedFromId?: string
  revokedAt?: string
  revokeReason?: string
}

export type VerificationRecord = {
  id: string
  userId: string
  organizationId: string
  email: string
  tokenHash: string
  expiresAt: string
  createdAt: string
  verifiedAt?: string
  revokedAt?: string
}

/**
 * Opaque password-reset state. Only the verifier hash is persisted; the
 * delivery token remains encrypted inside the notification outbox payload.
 */
export type PasswordResetRecord = {
  id: string
  userId: string
  organizationId: string
  tokenHash: string
  expiresAt: string
  createdAt: string
  usedAt?: string
  revokedAt?: string
}

export type InvitationRepositoryRecord = InvitationRecord & { tokenHash: string; invitedBy: string; acceptedUserId?: string }

export type BillingRecord = BillingCapabilityProjection
export type { BillingCapabilityProjection, HostnameRecord, ObservabilityProjection, PlatformRole, SessionSummary, TenantMembership }

export type PlatformContext = {
  userId: string
  organizationId: string
  sessionId: string
  role: PlatformRole
  hostname: string
}
