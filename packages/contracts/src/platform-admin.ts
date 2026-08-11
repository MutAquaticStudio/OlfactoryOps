import { z } from 'zod'

export const platformOperatorRoleSchema = z.enum(['PLATFORM_OWNER', 'PLATFORM_ADMIN', 'PLATFORM_SUPPORT', 'PLATFORM_BILLING', 'PLATFORM_SECURITY_AUDITOR'])
export type PlatformOperatorRole = z.infer<typeof platformOperatorRoleSchema>

export const platformOperatorStatusSchema = z.enum(['ACTIVE', 'DISABLED'])
export const platformWorkspaceStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED'])

export const platformMutationSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  confirmation: z.literal('CONFIRM_PLATFORM_ACTION'),
})

export const platformWorkspaceActionSchema = platformMutationSchema.extend({
  status: platformWorkspaceStatusSchema.optional(),
})

export const platformEntitlementUpdateSchema = platformMutationSchema.extend({
  capability: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/).max(160),
  enabled: z.boolean(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
})

export const platformOperatorStatusUpdateSchema = platformMutationSchema.extend({
  status: platformOperatorStatusSchema,
})

export const platformAdminErrorCodeSchema = z.enum(['PLATFORM_ACCESS_DENIED', 'PLATFORM_MFA_REQUIRED', 'PLATFORM_OPERATOR_DISABLED', 'PLATFORM_NOT_CONFIGURED', 'PLATFORM_ACTION_CONFLICT'])
export type PlatformAdminErrorCode = z.infer<typeof platformAdminErrorCodeSchema>
