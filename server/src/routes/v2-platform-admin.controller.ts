import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { platformEntitlementUpdateSchema, platformOperatorStatusUpdateSchema, platformWorkspaceActionSchema } from '../../../packages/contracts/src/platform-admin.js'
import { PlatformAdminService } from '../../../services/platform/src/platform-admin-service.js'
import { PlatformError, PlatformService } from '../../../services/platform/src/service.js'

function cookieValue(request: FastifyRequest, name: string) {
  const header = request.headers.cookie ?? ''
  const entry = header.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : ''
}

function requestHost(request: FastifyRequest) {
  const forwarded = request.headers['x-forwarded-host']
  return (typeof forwarded === 'string' ? forwarded : request.headers.host ?? 'localhost').split(',')[0]?.split(':')[0]?.toLowerCase() ?? 'localhost'
}

function requestOriginAllowed(request: FastifyRequest) {
  const origin = request.headers.origin
  if (!origin) return false
  const host = requestHost(request)
  return origin === `https://${host}` || origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173'
}

@Controller('v2/admin')
export class V2PlatformAdminController {
  constructor(private readonly admin: PlatformAdminService, private readonly platform: PlatformService) {}

  @Get('me')
  async me(@Req() request: FastifyRequest) {
    const resolved = await this.resolve(request)
    return { operator: resolved.operator, user: { id: resolved.user.id, email: resolved.user.email, displayName: resolved.user.displayName } }
  }

  @Get('overview')
  async overview(@Req() request: FastifyRequest) { const resolved = await this.resolve(request); return this.admin.overview(resolved.context, resolved.operator) }

  @Get('workspaces')
  async workspaces(@Req() request: FastifyRequest, @Query('search') search?: string) { const resolved = await this.resolve(request); return { workspaces: await this.admin.listWorkspaces(resolved.context, resolved.operator, search) } }

  @Get('workspaces/:id')
  async workspace(@Req() request: FastifyRequest, @Param('id') id: string) { const resolved = await this.resolve(request); return this.admin.workspace(resolved.context, resolved.operator, id) }

  @Post('workspaces/:id/suspend')
  async suspend(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) { return this.transition(request, id, 'SUSPENDED', body, idempotencyKey) }

  @Post('workspaces/:id/reactivate')
  async reactivate(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) { return this.transition(request, id, 'ACTIVE', body, idempotencyKey) }

  @Post('workspaces/:id/archive')
  async archive(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) { return this.transition(request, id, 'ARCHIVED', body, idempotencyKey) }

  @Patch('workspaces/:id/entitlements')
  async entitlement(@Req() request: FastifyRequest, @Param('id') id: string, @Body() raw: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    this.mutationShapeGuard(request, idempotencyKey)
    const body = platformEntitlementUpdateSchema.parse(raw)
    const resolved = await this.resolve(request)
    await this.mutationCsrfGuard(request, resolved.context)
    return this.admin.setEntitlement(resolved.context, resolved.operator, id, body.capability, body.enabled, body.expiresAt ?? null, body.reason)
  }

  @Get('operators')
  async operators(@Req() request: FastifyRequest) { const resolved = await this.resolve(request); return { operators: await this.admin.operators(resolved.context, resolved.operator) } }

  @Patch('operators/:id/status')
  async operatorStatus(@Req() request: FastifyRequest, @Param('id') _id: string, @Body() raw: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    this.mutationShapeGuard(request, idempotencyKey)
    // Status rotation is intentionally not active until the TOTP enrollment
    // and recovery ceremony are provisioned in the production environment.
    platformOperatorStatusUpdateSchema.parse(raw)
    throw new PlatformError('NOT_CONFIGURED', 'Platform operator rotation requires the production MFA enrollment ceremony.', 503)
  }

  @Get('infrastructure')
  async infrastructure(@Req() request: FastifyRequest) {
    const resolved = await this.resolve(request)
    await this.admin.overview(resolved.context, resolved.operator)
    return { environment: process.env.RELEASE_ENVIRONMENT ?? 'NOT_CONFIGURED', releaseGitSha: process.env.RELEASE_GIT_SHA ?? 'NOT_CONFIGURED', cloudflare: 'CONFIGURATION_REQUIRED', database: 'HYPERDRIVE_REQUIRED' }
  }

  @Get('audit')
  async audit(@Req() request: FastifyRequest) { const resolved = await this.resolve(request); return { events: await this.admin.auditEvents(resolved.context, resolved.operator) } }

  private async transition(request: FastifyRequest, id: string, status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED', raw: unknown, idempotencyKey?: string) {
    this.mutationShapeGuard(request, idempotencyKey)
    const body = platformWorkspaceActionSchema.parse(raw)
    const resolved = await this.resolve(request)
    await this.mutationCsrfGuard(request, resolved.context)
    return this.admin.transition(resolved.context, resolved.operator, id, status, body.reason, idempotencyKey!)
  }

  private async resolve(request: FastifyRequest) { return this.admin.authenticated(cookieValue(request, this.platform.cookieName), requestHost(request)) }
  private mutationShapeGuard(request: FastifyRequest, idempotencyKey?: string) {
    if (!requestOriginAllowed(request)) throw new PlatformError('ORIGIN_DENIED', 'A trusted platform origin is required.', 403)
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 200) throw new PlatformError('INVALID_CREDENTIALS', 'A valid idempotency key is required.', 422)
  }
  private async mutationCsrfGuard(request: FastifyRequest, context: import('../../../services/platform/src/types.js').PlatformContext) {
    const csrf = request.headers['x-csrf-token']
    await this.platform.assertCsrf(context, cookieValue(request, this.platform.cookieName), typeof csrf === 'string' ? csrf : undefined)
  }
}
