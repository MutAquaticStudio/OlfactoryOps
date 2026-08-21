import { z } from 'zod'

export const platformRoleSchema = z.enum([
  'Owner', 'Admin', 'Lab Manager', 'Perfumer', 'R&D Scientist', 'Lab Technician',
  'Procurement', 'Sensory Panelist', 'Brand', 'Supplier', 'Finance', 'Viewer',
])
export type PlatformRole = z.infer<typeof platformRoleSchema>

export const hostnameKindSchema = z.enum(['DEFAULT', 'CUSTOM'])
export const hostnameStatusSchema = z.enum(['PENDING', 'PENDING_VALIDATION', 'PENDING_SSL', 'ACTIVE', 'FAILED', 'ARCHIVED'])
export const hostnameRecordSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  hostname: z.string().min(1).max(253),
  kind: hostnameKindSchema,
  status: hostnameStatusSchema,
  validationStatus: z.string().max(80).nullable().optional(),
  sslStatus: z.string().max(80).nullable().optional(),
})
export type HostnameRecord = z.infer<typeof hostnameRecordSchema>

export const sessionSummarySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  deviceLabel: z.string().max(160).nullable().optional(),
  userAgent: z.string().max(512).nullable().optional(),
  createdAt: z.string().datetime({ offset: true }),
  lastSeenAt: z.string().datetime({ offset: true }),
  idleExpiresAt: z.string().datetime({ offset: true }),
  absoluteExpiresAt: z.string().datetime({ offset: true }),
  current: z.boolean().default(false),
})
export type SessionSummary = z.infer<typeof sessionSummarySchema>

export const tenantMembershipSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  organizationName: z.string().min(1).max(160),
  organizationSlug: z.string().min(1).max(63),
  role: platformRoleSchema,
  status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED', 'REMOVED']),
})
export type TenantMembership = z.infer<typeof tenantMembershipSchema>

export const platformAuthResponseSchema = z.object({
  user: z.object({ id: z.string(), email: z.string().email(), displayName: z.string(), verified: z.boolean() }),
  membership: tenantMembershipSchema,
  memberships: z.array(tenantMembershipSchema),
  hostname: hostnameRecordSchema,
  csrfToken: z.string().min(16),
  session: sessionSummarySchema,
  workspaceUrl: z.string().url(),
})
export type PlatformAuthResponse = z.infer<typeof platformAuthResponseSchema>

export const billingCapabilitySchema = z.object({
  mode: z.literal('MANAGED_BETA'),
  status: z.enum(['ACTIVE', 'PAST_DUE', 'FROZEN', 'NOT_CONFIGURED']),
  capabilities: z.record(z.string(), z.boolean()),
  limits: z.record(z.string(), z.number().int().nonnegative()),
})
export type BillingCapabilityProjection = z.infer<typeof billingCapabilitySchema>

export const notificationChannelSchema = z.enum(['IN_APP', 'EMAIL', 'WEB_PUSH'])
export const notificationPreferenceSchema = z.object({
  eventType: z.string().min(1).max(100),
  channel: notificationChannelSchema,
  enabled: z.boolean(),
})
export const notificationDeliverySchema = z.object({
  id: z.string().min(1),
  eventType: z.string().min(1),
  channel: notificationChannelSchema,
  status: z.enum(['QUEUED', 'SENDING', 'SENT', 'RETRYING', 'FAILED', 'DISABLED']),
  attempts: z.number().int().nonnegative(),
  nextAttemptAt: z.string().datetime({ offset: true }).nullable().optional(),
})
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>
export type NotificationDelivery = z.infer<typeof notificationDeliverySchema>

export const pushSubscriptionInputSchema = z.object({
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(16).max(256),
  auth: z.string().min(8).max(256),
  userAgent: z.string().max(512).optional(),
})
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>

export const memberProjectionSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1).max(160),
  role: platformRoleSchema,
  status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED', 'REMOVED']),
})
export type MemberProjection = z.infer<typeof memberProjectionSchema>

export const invitationStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'])
export const invitationRecordSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  email: z.string().email(),
  role: platformRoleSchema,
  status: invitationStatusSchema,
  expiresAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
  acceptedAt: z.string().datetime({ offset: true }).nullable().optional(),
  revokedAt: z.string().datetime({ offset: true }).nullable().optional(),
})
export type InvitationRecord = z.infer<typeof invitationRecordSchema>

export const inviteMemberInputSchema = z.object({
  email: z.string().email().max(320),
  role: platformRoleSchema,
})
export type InviteMemberInput = z.infer<typeof inviteMemberInputSchema>

export const acceptInvitationInputSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(12).max(256),
  displayName: z.string().trim().min(1).max(160),
})
export type AcceptInvitationInput = z.infer<typeof acceptInvitationInputSchema>

export const consentRecordSchema = z.object({
  id: z.string().min(1),
  purpose: z.enum(['TERMS', 'PRIVACY', 'COOKIES', 'EMAIL_SECURITY', 'WEB_PUSH']),
  policyVersion: z.string().min(1).max(80),
  acceptedAt: z.string().datetime({ offset: true }),
  withdrawnAt: z.string().datetime({ offset: true }).nullable().optional(),
})
export type ConsentRecord = z.infer<typeof consentRecordSchema>

export const exportRequestSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['PRIVACY', 'WORKSPACE', 'ERASURE_REVIEW']),
  status: z.enum(['REQUESTED', 'QUEUED', 'PROCESSING', 'READY', 'REVIEW_REQUIRED', 'REJECTED', 'EXPIRED']),
  requestedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).nullable().optional(),
})
export type ExportRequest = z.infer<typeof exportRequestSchema>

export const observabilityProjectionSchema = z.object({
  api: z.enum(['PASS', 'DEGRADED', 'NOT_CONFIGURED']),
  database: z.enum(['PASS', 'DEGRADED', 'NOT_CONFIGURED']),
  queue: z.enum(['PASS', 'DEGRADED', 'NOT_CONFIGURED']),
  email: z.enum(['PASS', 'DEGRADED', 'NOT_CONFIGURED']),
  push: z.enum(['PASS', 'DEGRADED', 'NOT_CONFIGURED']),
  billing: z.enum(['PASS', 'DEGRADED', 'NOT_CONFIGURED']),
  domains: z.enum(['PASS', 'DEGRADED', 'NOT_CONFIGURED']),
  degradedCount: z.number().int().nonnegative(),
  capturedAt: z.string().datetime({ offset: true }),
})
export type ObservabilityProjection = z.infer<typeof observabilityProjectionSchema>

export const platformErrorCodeSchema = z.enum([
  'V2_DATABASE_NOT_CONFIGURED', 'INVALID_CREDENTIALS', 'EMAIL_NOT_VERIFIED', 'SESSION_EXPIRED',
  'CSRF_DENIED', 'ORIGIN_DENIED', 'TENANT_NOT_FOUND', 'TENANT_ACCESS_DENIED', 'HOSTNAME_NOT_ACTIVE',
  'HOSTNAME_RESERVED', 'HOSTNAME_CONFLICT', 'INVALID_HOSTNAME', 'EMAIL_CONFLICT', 'REAUTH_REQUIRED', 'RATE_LIMITED', 'BILLING_MANAGED_BETA',
  'EXPORT_FORBIDDEN', 'OWNER_LOCKOUT', 'INVITATION_INVALID', 'INVITATION_EXPIRED',
  'INVITATION_REVOKED', 'INVITATION_CONFLICT', 'NOTIFICATION_DISABLED', 'NOTIFICATION_DELIVERY_FAILED', 'NOT_CONFIGURED',
])
export type PlatformErrorCode = z.infer<typeof platformErrorCodeSchema>

export const platformErrorEnvelopeSchema = z.object({
  error: z.object({
    code: platformErrorCodeSchema,
    message: z.string().min(1).max(300),
    requestId: z.string().min(1),
  }),
})
export type PlatformErrorEnvelope = z.infer<typeof platformErrorEnvelopeSchema>
