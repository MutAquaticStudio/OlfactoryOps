import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { PlatformError, PlatformService } from './service.js'
import type { PlatformContext } from './types.js'
import type { PlatformOperatorRole } from '../../../packages/contracts/src/platform-admin.js'

type Operator = { id: string; userId: string; role: PlatformOperatorRole; status: 'ACTIVE' | 'DISABLED'; mfaRequired: boolean }
type Workspace = { id: string; name: string; slug: string; status: string; createdAt: string; hostname: string | null; members: number; sessions: number }

const allowed: Record<PlatformOperatorRole, readonly string[]> = {
  PLATFORM_OWNER: ['overview.read', 'workspaces.read', 'workspace.lifecycle', 'entitlements.manage', 'operators.read', 'operators.manage', 'infrastructure.read', 'audit.read'],
  PLATFORM_ADMIN: ['overview.read', 'workspaces.read', 'workspace.lifecycle', 'entitlements.manage', 'operators.read', 'infrastructure.read', 'audit.read'],
  PLATFORM_SUPPORT: ['overview.read', 'workspaces.read'],
  PLATFORM_BILLING: ['overview.read', 'workspaces.read', 'entitlements.manage'],
  PLATFORM_SECURITY_AUDITOR: ['overview.read', 'operators.read', 'infrastructure.read', 'audit.read'],
}

export class PlatformAdminService {
  constructor(private readonly prisma: PrismaClient, private readonly platform: PlatformService) {}

  async authenticated(rawToken: string, hostname: string) {
    const resolved = await this.platform.contextFromToken(rawToken, hostname)
    const operator = await this.withOperator(resolved.context, async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; user_id: string; role_key: PlatformOperatorRole; status: 'ACTIVE' | 'DISABLED'; mfa_required: boolean }>>(
        'SELECT id, user_id, role_key, status, mfa_required FROM v2_platform_operators WHERE user_id = current_setting(\'app.platform_user_id\', true) LIMIT 1',
      )
      const row = rows[0]
      return row ? { id: row.id, userId: row.user_id, role: row.role_key, status: row.status, mfaRequired: row.mfa_required } : null
    })
    if (!operator) throw new PlatformError('TENANT_ACCESS_DENIED', 'Platform access is not assigned to this account.', 403)
    if (operator.status !== 'ACTIVE') throw new PlatformError('TENANT_ACCESS_DENIED', 'Platform operator access is disabled.', 403)
    return { ...resolved, operator }
  }

  async overview(context: PlatformContext, operator: Operator) {
    this.require(operator, 'overview.read')
    return this.withOperator(context, async (tx) => {
      const [totals] = await tx.$queryRawUnsafe<Array<{ active_workspaces: number; suspended_workspaces: number; archived_workspaces: number; active_users: number; active_sessions: number; pending_privacy_reviews: number }>>(
        `SELECT
          count(*) FILTER (WHERE status = 'ACTIVE')::int AS active_workspaces,
          count(*) FILTER (WHERE status = 'SUSPENDED')::int AS suspended_workspaces,
          count(*) FILTER (WHERE status = 'ARCHIVED')::int AS archived_workspaces,
          (SELECT count(*)::int FROM v2_users WHERE status = 'ACTIVE') AS active_users,
          (SELECT count(*)::int FROM v2_sessions WHERE revoked_at IS NULL AND absolute_expires_at > now()) AS active_sessions,
          (SELECT count(*)::int FROM v2_erasure_review_requests WHERE status IN ('REQUESTED','REVIEW_REQUIRED')) AS pending_privacy_reviews
        FROM v2_organizations`,
      )
      return { ...totals, release: { environment: process.env.RELEASE_ENVIRONMENT ?? 'NOT_CONFIGURED', gitSha: process.env.RELEASE_GIT_SHA ?? 'NOT_CONFIGURED' }, capturedAt: new Date().toISOString() }
    })
  }

  async listWorkspaces(context: PlatformContext, operator: Operator, search = ''): Promise<Workspace[]> {
    this.require(operator, 'workspaces.read')
    return this.withOperator(context, async (tx) => tx.$queryRawUnsafe<Workspace[]>(
      `SELECT o.id, o.name, o.slug, o.status, o.created_at::text AS "createdAt",
        (SELECT hostname FROM v2_workspace_hostnames h WHERE h.organization_id = o.id AND h.kind = 'DEFAULT' ORDER BY h.created_at ASC LIMIT 1) AS hostname,
        (SELECT count(*)::int FROM v2_memberships m WHERE m.organization_id = o.id AND m.status = 'ACTIVE') AS members,
        (SELECT count(*)::int FROM v2_sessions s WHERE s.organization_id = o.id AND s.revoked_at IS NULL) AS sessions
       FROM v2_organizations o
       WHERE ($1 = '' OR o.name ILIKE '%' || $1 || '%' OR o.slug ILIKE '%' || $1 || '%')
       ORDER BY o.created_at DESC LIMIT 200`, search.trim().slice(0, 120),
    ))
  }

  async workspace(context: PlatformContext, operator: Operator, id: string) {
    const rows = await this.listWorkspaces(context, operator)
    const workspace = rows.find((item) => item.id === id)
    if (!workspace) throw new PlatformError('TENANT_NOT_FOUND', 'Workspace was not found.', 404)
    return workspace
  }

  async transition(context: PlatformContext, operator: Operator, organizationId: string, status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED', reason: string, idempotencyKey: string) {
    this.require(operator, 'workspace.lifecycle')
    this.requireMfa(operator)
    return this.withOperator(context, async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{ organization_id: string; status: string }>>(
        'SELECT * FROM v2_platform_set_tenant_state($1, $2, $3, $4, $5)', organizationId, status, reason, idempotencyKey, randomUUID(),
      )
      await this.audit(tx, context.userId, operator.role, `platform.workspace.${status.toLowerCase()}`, 'ALLOWED', 'organization', organizationId, reason)
      return rows[0]
    })
  }

  async setEntitlement(context: PlatformContext, operator: Operator, organizationId: string, capability: string, enabled: boolean, expiresAt: string | null, reason: string) {
    this.require(operator, 'entitlements.manage')
    this.requireMfa(operator)
    return this.withOperator(context, async (tx) => {
      const id = `pfo_${randomUUID().replace(/-/g, '').slice(0, 24)}`
      await tx.$executeRawUnsafe(
        `INSERT INTO v2_platform_feature_overrides (id, organization_id, capability, enabled, source, expires_at, updated_by)
         VALUES ($1, $2, $3, $4, 'PLATFORM', $5::timestamptz, $6)
         ON CONFLICT (organization_id, capability) DO UPDATE SET enabled = EXCLUDED.enabled, expires_at = EXCLUDED.expires_at, updated_by = EXCLUDED.updated_by, version = v2_platform_feature_overrides.version + 1, updated_at = now()`,
        id, organizationId, capability, enabled, expiresAt, context.userId,
      )
      await this.audit(tx, context.userId, operator.role, 'platform.entitlement.update', 'ALLOWED', 'organization', organizationId, reason)
      return { organizationId, capability, enabled, expiresAt }
    })
  }

  async operators(context: PlatformContext, operator: Operator) {
    this.require(operator, 'operators.read')
    return this.withOperator(context, (tx) => tx.$queryRawUnsafe<Array<{ id: string; userId: string; email: string; role: string; status: string; mfaRequired: boolean }>>(
      `SELECT p.id, p.user_id AS "userId", u.email, p.role_key AS role, p.status, p.mfa_required AS "mfaRequired"
       FROM v2_platform_operators p JOIN v2_users u ON u.id = p.user_id ORDER BY p.created_at ASC`,
    ))
  }

  async auditEvents(context: PlatformContext, operator: Operator) {
    this.require(operator, 'audit.read')
    return this.withOperator(context, (tx) => tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, actor_role AS "actorRole", action, outcome, subject_type AS "subjectType", subject_id AS "subjectId", reason, correlation_id AS "correlationId", created_at AS "createdAt"
       FROM v2_platform_audit_events ORDER BY created_at DESC LIMIT 200`,
    ))
  }

  private require(operator: Operator, permission: string) {
    if (!allowed[operator.role].includes(permission)) throw new PlatformError('TENANT_ACCESS_DENIED', 'Your platform role does not permit this action.', 403)
  }

  private requireMfa(operator: Operator) {
    if (operator.mfaRequired) throw new PlatformError('REAUTH_REQUIRED', 'A verified platform MFA step-up is required for this action.', 403)
  }

  private async withOperator<T>(context: PlatformContext, callback: (tx: PrismaClient) => Promise<T>) {
    return this.prisma.$transaction(async (client) => {
      await client.$executeRawUnsafe(`SELECT set_config('app.platform_user_id', $1, true)`, context.userId)
      return callback(client as unknown as PrismaClient)
    })
  }

  private async audit(tx: PrismaClient, actorUserId: string, actorRole: PlatformOperatorRole, action: string, outcome: 'ALLOWED' | 'DENIED' | 'FAILED', subjectType: string, subjectId: string, reason: string) {
    await tx.$executeRawUnsafe(
      `INSERT INTO v2_platform_audit_events (id, actor_user_id, actor_role, action, outcome, subject_type, subject_id, reason, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      `pae_${randomUUID().replace(/-/g, '').slice(0, 24)}`, actorUserId, actorRole, action, outcome, subjectType, subjectId, reason, randomUUID(),
    )
  }
}
