import { createHash, randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { PlatformError, PlatformService } from './service.js'
import type { PlatformContext } from './types.js'
import type { PlatformOperatorRole } from '../../../packages/contracts/src/platform-admin.js'

type Operator = { id: string; userId: string; role: PlatformOperatorRole; status: 'ACTIVE' | 'DISABLED'; mfaRequired: boolean }
type Workspace = { id: string; name: string; slug: string; status: string; createdAt: string; hostname: string | null; members: number; sessions: number; planId: string | null; planName: string | null; subscriptionStatus: string | null }
type PlatformWorkspaceRequestKind = 'WORKSPACE_EXPORT' | 'ERASURE_REVIEW' | 'HOSTNAME_REFRESH'

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
    const [row] = await this.withOperator(context, (tx) => tx.$queryRawUnsafe<Array<{ snapshot: Record<string, number> }>>(
      'SELECT v2_platform_overview_snapshot() AS snapshot',
    ))
    const snapshot = row?.snapshot ?? {}
    return { ...snapshot, release: { environment: process.env.RELEASE_ENVIRONMENT ?? 'NOT_CONFIGURED', gitSha: process.env.RELEASE_GIT_SHA ?? 'NOT_CONFIGURED' }, capturedAt: new Date().toISOString() }
  }

  async listWorkspaces(context: PlatformContext, operator: Operator, search = ''): Promise<Workspace[]> {
    this.require(operator, 'workspaces.read')
    return this.withOperator(context, (tx) => tx.$queryRawUnsafe<Workspace[]>(
      'SELECT id, name, slug, status, created_at::text AS "createdAt", hostname, members, sessions, plan_id AS "planId", plan_name AS "planName", subscription_status AS "subscriptionStatus" FROM v2_platform_workspace_directory($1)', search.trim().slice(0, 120),
    ))
  }

  async workspace(context: PlatformContext, operator: Operator, id: string) {
    this.require(operator, 'workspaces.read')
    const [row] = await this.withOperator(context, (tx) => tx.$queryRawUnsafe<Array<{ detail: Record<string, unknown> }>>(
      'SELECT v2_platform_workspace_detail($1) AS detail', id,
    ))
    if (!row?.detail) throw new PlatformError('TENANT_NOT_FOUND', 'Workspace was not found.', 404)
    return row.detail
  }

  async transition(context: PlatformContext, operator: Operator, organizationId: string, status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED', reason: string, idempotencyKey: string) {
    this.require(operator, 'workspace.lifecycle')
    this.requireMfa(operator)
    return this.mutate(context, `platform.workspace.${status.toLowerCase()}`, idempotencyKey, { organizationId, status, reason }, async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{ organization_id: string; status: string }>>(
        'SELECT * FROM v2_platform_set_tenant_state($1, $2, $3, $4, $5)', organizationId, status, reason, idempotencyKey, randomUUID(),
      )
      await this.audit(tx, context.userId, operator.role, `platform.workspace.${status.toLowerCase()}`, 'ALLOWED', 'organization', organizationId, reason)
      return rows[0]
    })
  }

  async revokeWorkspaceSessions(context: PlatformContext, operator: Operator, organizationId: string, reason: string, idempotencyKey: string) {
    this.require(operator, 'workspace.lifecycle')
    this.requireMfa(operator)
    return this.mutate(context, 'platform.workspace.revoke_sessions', idempotencyKey, { organizationId, reason }, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<Array<{ revoked: number }>>('SELECT v2_platform_revoke_workspace_sessions($1, $2)::int AS revoked', organizationId, reason)
      await this.audit(tx, context.userId, operator.role, 'platform.workspace.revoke_sessions', 'ALLOWED', 'organization', organizationId, reason)
      return { organizationId, revokedSessions: Number(row?.revoked ?? 0) }
    })
  }

  async requestWorkspaceAction(context: PlatformContext, operator: Operator, organizationId: string, kind: PlatformWorkspaceRequestKind, reason: string, idempotencyKey: string) {
    this.require(operator, 'workspace.lifecycle')
    this.requireMfa(operator)
    return this.mutate(context, `platform.workspace.${kind.toLowerCase()}`, idempotencyKey, { organizationId, kind, reason }, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<Array<{ request: Record<string, unknown> }>>(
        'SELECT v2_platform_request_workspace_action($1, $2, $3, $4, $5) AS request', organizationId, kind, reason, idempotencyKey, randomUUID(),
      )
      await this.audit(tx, context.userId, operator.role, `platform.workspace.${kind.toLowerCase()}`, 'ALLOWED', 'organization', organizationId, reason)
      return row?.request ?? {}
    })
  }

  async setEntitlement(context: PlatformContext, operator: Operator, organizationId: string, capability: string, enabled: boolean, expiresAt: string | null, reason: string, idempotencyKey: string) {
    this.require(operator, 'entitlements.manage')
    this.requireMfa(operator)
    return this.mutate(context, 'platform.workspace.entitlement', idempotencyKey, { organizationId, capability, enabled, expiresAt, reason }, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<Array<{ result: Record<string, unknown> }>>(
        'SELECT v2_platform_set_workspace_entitlement($1, $2, $3, $4::timestamptz) AS result', organizationId, capability, enabled, expiresAt,
      )
      await this.audit(tx, context.userId, operator.role, 'platform.entitlement.update', 'ALLOWED', 'organization', organizationId, reason)
      return row?.result ?? { organizationId, capability, enabled, expiresAt }
    })
  }

  async assignPlan(context: PlatformContext, operator: Operator, organizationId: string, planId: string, endsAt: string | null, reason: string, idempotencyKey: string) {
    this.require(operator, 'entitlements.manage')
    this.requireMfa(operator)
    return this.mutate(context, 'platform.workspace.plan', idempotencyKey, { organizationId, planId, endsAt, reason }, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<Array<{ result: Record<string, unknown> }>>(
        'SELECT v2_platform_assign_workspace_plan($1, $2, $3::timestamptz) AS result', organizationId, planId, endsAt,
      )
      await this.audit(tx, context.userId, operator.role, 'platform.plan.assign', 'ALLOWED', 'organization', organizationId, reason)
      return row?.result ?? { organizationId, planId, endsAt }
    })
  }

  async setLimit(context: PlatformContext, operator: Operator, organizationId: string, key: string, value: number, reason: string, idempotencyKey: string) {
    this.require(operator, 'entitlements.manage')
    this.requireMfa(operator)
    return this.mutate(context, 'platform.workspace.limit', idempotencyKey, { organizationId, key, value, reason }, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<Array<{ result: Record<string, unknown> }>>(
        'SELECT v2_platform_set_workspace_limit($1, $2, $3) AS result', organizationId, key, value,
      )
      await this.audit(tx, context.userId, operator.role, 'platform.limit.update', 'ALLOWED', 'organization', organizationId, reason)
      return row?.result ?? { organizationId, key, value }
    })
  }

  async operators(context: PlatformContext, operator: Operator) {
    this.require(operator, 'operators.read')
    return this.withOperator(context, (tx) => tx.$queryRawUnsafe<Array<{ id: string; userId: string; email: string; role: string; status: string; mfaRequired: boolean }>>(
      `SELECT p.id, p.user_id AS "userId", u.email, p.role_key AS role, p.status, p.mfa_required AS "mfaRequired"
       FROM v2_platform_operators p JOIN v2_users u ON u.id = p.user_id ORDER BY p.created_at ASC`,
    ))
  }

  async setOperatorStatus(context: PlatformContext, operator: Operator, operatorId: string, status: 'ACTIVE' | 'DISABLED', reason: string, idempotencyKey: string) {
    this.require(operator, 'operators.manage')
    this.requireMfa(operator)
    return this.mutate(context, 'platform.operator.status', idempotencyKey, { operatorId, status, reason }, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<Array<{ result: Record<string, unknown> }>>(
        'SELECT v2_platform_set_operator_status($1, $2) AS result', operatorId, status,
      )
      await this.audit(tx, context.userId, operator.role, `platform.operator.${status.toLowerCase()}`, 'ALLOWED', 'platform_operator', operatorId, reason)
      return row?.result ?? { id: operatorId, status }
    })
  }

  async setOperatorRole(context: PlatformContext, operator: Operator, operatorId: string, role: PlatformOperatorRole, reason: string, idempotencyKey: string) {
    this.require(operator, 'operators.manage')
    this.requireMfa(operator)
    return this.mutate(context, 'platform.operator.role', idempotencyKey, { operatorId, role, reason }, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<Array<{ result: Record<string, unknown> }>>(
        'SELECT v2_platform_set_operator_role($1, $2) AS result', operatorId, role,
      )
      await this.audit(tx, context.userId, operator.role, 'platform.operator.role.rotate', 'ALLOWED', 'platform_operator', operatorId, reason)
      return row?.result ?? { id: operatorId, role }
    })
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

  private async mutate<T>(context: PlatformContext, routeKey: string, idempotencyKey: string, payload: Record<string, unknown>, callback: (tx: PrismaClient) => Promise<T>) {
    const requestHash = createHash('sha256').update(JSON.stringify(payload, Object.keys(payload).sort())).digest('hex')
    return this.withOperator(context, async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', `${context.userId}:${routeKey}:${idempotencyKey}`)
      const existing = await tx.$queryRawUnsafe<Array<{ request_hash: string; response_json: T }>>(
        'SELECT request_hash, response_json FROM v2_platform_mutation_receipts WHERE actor_user_id = $1 AND route_key = $2 AND idempotency_key = $3', context.userId, routeKey, idempotencyKey,
      )
      if (existing[0]) {
        if (existing[0].request_hash !== requestHash) throw new PlatformError('IDEMPOTENCY_CONFLICT', 'The idempotency key belongs to a different platform request.', 409)
        return existing[0].response_json
      }
      const response = await callback(tx)
      await tx.$executeRawUnsafe(
        'INSERT INTO v2_platform_mutation_receipts (id, actor_user_id, route_key, idempotency_key, request_hash, response_json) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
        `pmr_${randomUUID().replace(/-/g, '').slice(0, 24)}`, context.userId, routeKey, idempotencyKey, requestHash, JSON.stringify(response),
      )
      return response
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
