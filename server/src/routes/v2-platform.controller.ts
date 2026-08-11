import { ArgumentsHost, Body, Catch, Controller, Delete, ExceptionFilter, Get, Headers, Param, Patch, Post, Req, Res, UseFilters } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { acceptInvitationInputSchema, inviteMemberInputSchema, notificationPreferenceSchema, platformRoleSchema, pushSubscriptionInputSchema } from '../../../packages/contracts/src/index.js'
import { PlatformError, PlatformService } from '../../../services/platform/src/service.js'
import type { PlatformContext } from '../../../services/platform/src/types.js'

function cookieValue(request: FastifyRequest, name: string) {
  const header = request.headers.cookie ?? ''
  const entry = header.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined
}

function setSessionCookie(reply: FastifyReply, name: string, token: string) {
  reply.header('Set-Cookie', `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`)
}

function setCsrfCookie(reply: FastifyReply, token: string) {
  reply.header('Set-Cookie', [`oo_v2_csrf=${encodeURIComponent(token)}; Path=/; Secure; SameSite=Lax; Max-Age=2592000`])
}

function clearSessionCookie(reply: FastifyReply, name: string) {
  reply.header('Set-Cookie', `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)
}

function requestHost(request: FastifyRequest) {
  const forwarded = request.headers['x-forwarded-host']
  return (typeof forwarded === 'string' ? forwarded : request.headers.host ?? 'localhost').split(',')[0]?.split(':')[0]?.toLowerCase() ?? 'localhost'
}

function requestOriginAllowed(request: FastifyRequest) {
  const origin = request.headers.origin
  if (!origin) return true
  const allowed = new Set([
    `https://${requestHost(request)}`,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'https://labofscents.org',
    'https://www.labofscents.org',
  ])
  return allowed.has(origin)
}

function platformRuntimeFailureCode(error: unknown) {
  if (!error || typeof error !== 'object') return 'UNKNOWN'
  const candidate = error as { code?: unknown; message?: unknown; name?: unknown }
  const code = typeof candidate.code === 'string' ? candidate.code : ''
  if (/^P\d{4}$/.test(code)) return `PRISMA_${code}`
  if (/^[A-Z][A-Z0-9_]{2,80}$/.test(code)) return code
  const message = typeof candidate.message === 'string' ? candidate.message : ''
  if (/row-level security/i.test(message)) return 'POSTGRES_RLS_DENIED'
  if (/permission denied/i.test(message)) return 'POSTGRES_PERMISSION_DENIED'
  if (/transaction/i.test(message)) return 'POSTGRES_TRANSACTION_FAILED'
  if (/connection|hyperdrive|database/i.test(message)) return 'POSTGRES_CONNECTION_FAILED'
  return 'UNCLASSIFIED'
}

@Catch(PlatformError)
class V2PlatformErrorFilter implements ExceptionFilter {
  catch(error: PlatformError, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>()
    reply.status(error.status).send({ error: { code: error.code, message: error.message } })
  }
}

export type V2DatabaseHealth = () => Promise<'PASS' | 'DEGRADED' | 'NOT_CONFIGURED'>

@Controller('v2/platform')
@UseFilters(V2PlatformErrorFilter)
export class V2PlatformController {
  constructor(private readonly platform: PlatformService, private readonly databaseHealth?: V2DatabaseHealth) {}

  @Get('health')
  async health() {
    const database = this.databaseHealth
      ? await this.databaseHealth()
      : process.env.DATABASE_URL ? 'PASS' : 'NOT_CONFIGURED'
    return { status: database === 'DEGRADED' ? 'DEGRADED' : 'PASS', scope: 'v2-platform', database }
  }

  @Post('auth/signup')
  async signup(@Body() body: { organizationName?: string; workspaceSlug?: string; email?: string; displayName?: string; password?: string }, @Res({ passthrough: true }) reply: FastifyReply) {
    try {
      const result = await this.platform.signup({ organizationName: body.organizationName ?? '', workspaceSlug: body.workspaceSlug, email: body.email ?? '', displayName: body.displayName ?? '', password: body.password ?? '' })
      setSessionCookie(reply, this.platform.cookieName, result.rawSessionToken)
      setCsrfCookie(reply, result.csrfToken)
      const { rawSessionToken: _raw, verificationToken: _verification, ...safe } = result
      return safe
    } catch (error) { throw this.normalize(error) }
  }

  @Post('auth/login')
  async login(@Body() body: { email?: string; password?: string }, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    try {
      const result = await this.platform.login({ email: body.email ?? '', password: body.password ?? '', hostname: requestHost(request), userAgent: request.headers['user-agent'], ip: request.ip })
      setSessionCookie(reply, this.platform.cookieName, result.rawSessionToken)
      setCsrfCookie(reply, result.csrfToken)
      const { rawSessionToken: _raw, ...safe } = result
      return safe
    } catch (error) { throw this.normalize(error) }
  }

  @Post('auth/logout')
  async logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) { const { context } = await this.context(request); await this.platform.logout(context); clearSessionCookie(reply, this.platform.cookieName); return { loggedOut: true } }

  @Post('auth/email-verification/confirm')
  async verifyEmail(@Body() body: { token?: string }) { return this.platform.verifyEmail(body.token ?? '') }

  @Post('auth/invitations/accept')
  async acceptInvitation(@Body() rawBody: unknown, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    try {
      const body = acceptInvitationInputSchema.parse(rawBody)
      const email = typeof (rawBody as { email?: unknown })?.email === 'string' ? (rawBody as { email: string }).email : ''
      const result = await this.platform.acceptInvitation({ ...body, email, hostname: requestHost(request) })
      setSessionCookie(reply, this.platform.cookieName, result.rawSessionToken)
      setCsrfCookie(reply, result.csrfToken)
      const { rawSessionToken: _raw, ...safe } = result
      return safe
    } catch (error) { throw this.normalize(error) }
  }

  @Post('auth/email-verification/resend')
  async resendEmail(@Req() request: FastifyRequest) {
    try {
      const token = cookieValue(request, this.platform.cookieName) ?? ''
      const resolved = await this.platform.contextFromToken(token, requestHost(request), { allowUnverified: true })
      const csrf = request.headers['x-csrf-token']
      await this.mutateGuard(request, resolved.context, typeof csrf === 'string' ? csrf : undefined)
      return await this.platform.resendVerification(token, requestHost(request))
    } catch (error) { throw this.normalize(error) }
  }

  @Get('auth/email-verification/status')
  async verificationStatus(@Req() request: FastifyRequest) { return this.platform.verificationStatus(cookieValue(request, this.platform.cookieName) ?? '', requestHost(request)) }

  @Get('me')
  async me(@Req() request: FastifyRequest) { const { context, user, membership, session } = await this.context(request); return { user: { id: user.id, email: user.email, displayName: user.displayName, verified: Boolean(user.verifiedAt) }, membership, session: { id: session.id, organizationId: session.organizationId, userId: session.userId, current: true, createdAt: session.createdAt, lastSeenAt: session.lastSeenAt, idleExpiresAt: session.idleExpiresAt, absoluteExpiresAt: session.absoluteExpiresAt }, capabilities: await this.platformCapabilities(context) } }

  @Post('workspace/switch')
  async switchWorkspace(@Req() request: FastifyRequest, @Body() body: { organizationId?: string }) { const { context } = await this.context(request); return this.platform.switchWorkspace(cookieValue(request, this.platform.cookieName) ?? '', requestHost(request), body.organizationId ?? context.organizationId) }

  @Get('security/sessions')
  async sessions(@Req() request: FastifyRequest) { const { context } = await this.context(request); return { sessions: await this.platform.listSessions(context) } }

  @Post('security/sessions/:id/revoke')
  async revokeSession(@Req() request: FastifyRequest, @Param('id') id: string, @Headers('x-csrf-token') csrfToken?: string) { const { context } = await this.context(request); await this.mutateGuard(request, context, csrfToken); await this.platform.revokeSession(context, id); return { revoked: true } }

  @Post('security/sessions/revoke-all')
  async revokeAll(@Req() request: FastifyRequest, @Body() body: { keepCurrent?: boolean }, @Headers('x-csrf-token') csrfToken?: string) { const { context } = await this.context(request); await this.mutateGuard(request, context, csrfToken); await this.platform.revokeAllSessions(context, body.keepCurrent !== false); return { revoked: true } }

  @Post('security/password')
  async changePassword(@Req() request: FastifyRequest, @Body() body: { currentPassword?: string; newPassword?: string }, @Headers('x-csrf-token') csrfToken?: string, @Res({ passthrough: true }) reply?: FastifyReply) { const { context } = await this.context(request); await this.mutateGuard(request, context, csrfToken); const result = await this.platform.changePassword(context, cookieValue(request, this.platform.cookieName) ?? '', body.currentPassword ?? '', body.newPassword ?? ''); if (reply) { setSessionCookie(reply, this.platform.cookieName, result.rawSessionToken); setCsrfCookie(reply, result.csrfToken) } return { session: result.session, csrfToken: result.csrfToken } }

  @Post('security/email')
  async changeEmail(@Req() request: FastifyRequest, @Body() body: { currentPassword?: string; newEmail?: string }, @Headers('x-csrf-token') csrfToken?: string, @Res({ passthrough: true }) reply?: FastifyReply) { const { context } = await this.context(request); await this.mutateGuard(request, context, csrfToken); const result = await this.platform.changeEmail(context, cookieValue(request, this.platform.cookieName) ?? '', body.currentPassword ?? '', body.newEmail ?? ''); if (reply) { setSessionCookie(reply, this.platform.cookieName, result.rawSessionToken); setCsrfCookie(reply, result.csrfToken) } return { session: result.session, csrfToken: result.csrfToken, verificationRequired: true } }

  @Get('workspace/branding')
  async branding(@Req() request: FastifyRequest) { const { context } = await this.context(request); return { branding: await this.platform.branding(context) } }

  @Patch('workspace/branding')
  async updateBranding(@Req() request: FastifyRequest, @Body() body: { displayName?: string; logoObjectRef?: string; faviconObjectRef?: string; accentColor?: string; footerText?: string; locale?: string }, @Headers('x-csrf-token') csrfToken?: string) { const { context } = await this.context(request); await this.mutateGuard(request, context, csrfToken); return { branding: await this.platform.updateBranding(context, body) } }

  @Get('workspace/billing')
  async billing(@Req() request: FastifyRequest) { const { context } = await this.context(request); return { billing: await this.platform.billing(context) } }

  @Get('workspace/notifications')
  async notifications(@Req() request: FastifyRequest) { const { context } = await this.context(request); return this.platform.notifications(context) }

  @Patch('workspace/notifications')
  async updateNotification(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('x-csrf-token') csrfToken?: string) { const { context } = await this.context(request); await this.mutateGuard(request, context, csrfToken); return this.platform.updateNotificationPreference(context, notificationPreferenceSchema.parse(body)) }

  @Post('workspace/notifications/push')
  async subscribePush(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('x-csrf-token') csrfToken?: string) { const { context } = await this.context(request); await this.mutateGuard(request, context, csrfToken); return this.platform.subscribePush(context, pushSubscriptionInputSchema.parse(body)) }

  @Delete('workspace/notifications/push')
  async unsubscribePush(@Req() request: FastifyRequest, @Body() body: { endpoint?: string }, @Headers('x-csrf-token') csrfToken?: string) { const { context } = await this.context(request); await this.mutateGuard(request, context, csrfToken); return this.platform.unsubscribePush(context, body.endpoint ?? '') }

  @Post('workspace/consents')
  async consent(@Req() request: FastifyRequest, @Body() body: { purpose?: 'TERMS' | 'PRIVACY' | 'COOKIES' | 'EMAIL_SECURITY' | 'WEB_PUSH'; policyVersion?: string }, @Headers('x-csrf-token') csrfToken?: string) { const { context } = await this.context(request); await this.mutateGuard(request, context, csrfToken); return this.platform.consent(context, body.purpose ?? 'PRIVACY', body.policyVersion ?? 'v2-2026-08') }

  @Get('workspace/exports')
  async exports(@Req() request: FastifyRequest) { const { context } = await this.context(request); return { exports: await this.platform.exports(context) } }

  @Get('workspace/members')
  async members(@Req() request: FastifyRequest) { const { context } = await this.context(request); return { members: await this.platform.members(context) } }

  @Get('workspace/invitations')
  async invitations(@Req() request: FastifyRequest) { const { context } = await this.context(request); return { invitations: await this.platform.invitations(context) } }

  @Post('workspace/invitations')
  async invite(@Req() request: FastifyRequest, @Body() rawBody: unknown, @Headers('x-csrf-token') csrfToken?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrfToken)
    const body = inviteMemberInputSchema.parse(rawBody)
    return { invitation: await this.platform.inviteMember(context, body.email, body.role) }
  }

  @Post('workspace/invitations/:id/resend')
  async resendInvitation(@Req() request: FastifyRequest, @Param('id') id: string, @Headers('x-csrf-token') csrfToken?: string) { const { context } = await this.context(request); await this.mutateGuard(request, context, csrfToken); return { invitation: await this.platform.resendInvitation(context, id) } }

  @Post('workspace/invitations/:id/revoke')
  async revokeInvitation(@Req() request: FastifyRequest, @Param('id') id: string, @Headers('x-csrf-token') csrfToken?: string) { const { context } = await this.context(request); await this.mutateGuard(request, context, csrfToken); return this.platform.revokeMemberInvitation(context, id) }

  @Post('workspace/exports/privacy')
  async privacyExport(@Req() request: FastifyRequest, @Headers('x-csrf-token') csrfToken?: string) { const { context } = await this.context(request); await this.mutateGuard(request, context, csrfToken); return this.platform.requestPrivacyExport(context) }

  @Post('workspace/exports/workspace')
  async workspaceExport(@Req() request: FastifyRequest, @Headers('x-csrf-token') csrfToken?: string) { const { context } = await this.context(request); await this.mutateGuard(request, context, csrfToken); return this.platform.requestWorkspaceExport(context) }

  @Post('workspace/exports/erasure-review')
  async erasureReview(@Req() request: FastifyRequest, @Headers('x-csrf-token') csrfToken?: string) { const { context } = await this.context(request); await this.mutateGuard(request, context, csrfToken); return this.platform.requestErasureReview(context) }

  @Get('workspace/observability')
  async observability(@Req() request: FastifyRequest) { const { context } = await this.context(request); return { observability: await this.platform.observability(context) } }

  @Get('workspace/roles/:role/permissions')
  async permissions(@Req() request: FastifyRequest, @Param('role') role: string) { const { context } = await this.context(request); return { role, permissions: await this.platform.rolePermissions(context, role) } }

  @Patch('workspace/roles/:role/permissions')
  async updatePermissions(@Req() request: FastifyRequest, @Param('role') role: string, @Body() body: { permissions?: string[] }, @Headers('x-csrf-token') csrfToken?: string) { const { context } = await this.context(request); await this.mutateGuard(request, context, csrfToken); return this.platform.setRolePermissions(context, platformRoleSchema.parse(role), body.permissions ?? []) }

  @Post('workspace/domains/custom')
  async customDomain(@Req() request: FastifyRequest, @Body() body: { hostname?: string }, @Headers('x-csrf-token') csrfToken?: string) { const { context } = await this.context(request); await this.mutateGuard(request, context, csrfToken); return { hostname: await this.platform.requestCustomHostname(context, body.hostname ?? '') } }

  private async context(request: FastifyRequest): Promise<{ context: PlatformContext; user: import('../../../services/platform/src/types.js').PlatformUser; membership: import('../../../services/platform/src/types.js').MembershipRecord; session: import('../../../services/platform/src/types.js').SessionRecord }> {
    if (!request.headers.cookie) throw new PlatformError('SESSION_EXPIRED', 'Sign in is required.', 401)
    if (!requestHost(request)) throw new PlatformError('TENANT_NOT_FOUND', 'Workspace address is required.', 404)
    return this.platform.contextFromToken(cookieValue(request, this.platform.cookieName) ?? '', requestHost(request))
  }

  private async mutateGuard(request: FastifyRequest, context: PlatformContext, csrfToken?: string) { if (!requestOriginAllowed(request)) throw new PlatformError('ORIGIN_DENIED', 'Request origin is not allowed.', 403); await this.platform.assertCsrf(context, cookieValue(request, this.platform.cookieName) ?? '', csrfToken) }
  private async platformCapabilities(context: PlatformContext) {
    return this.platform.capabilityProjection(context)
  }
  private normalize(error: unknown) {
    if (error instanceof PlatformError) return error
    const code = platformRuntimeFailureCode(error)
    // Deliberately log only a stable classification: request data and provider details stay out of Worker logs.
    console.error(JSON.stringify({ event: 'v2_platform_runtime_failure', code }))
    if (error instanceof Error && error.message === 'V2_DATABASE_NOT_CONFIGURED') return new PlatformError('V2_DATABASE_NOT_CONFIGURED', 'V2 platform database is not configured for this environment.', 503)
    return new PlatformError('NOT_CONFIGURED', 'The platform request could not be completed.', 503)
  }
}
