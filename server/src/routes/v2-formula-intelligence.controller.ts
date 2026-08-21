import { ArgumentsHost, Body, Catch, Controller, Delete, ExceptionFilter, Get, Headers, Param, Post, Put, Req, UseFilters } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { FormulaService } from '../../../services/formula/src/formula-service.js'
import { PlatformError, PlatformService } from '../../../services/platform/src/service.js'
import type { PlatformContext } from '../../../services/platform/src/types.js'

function cookieValue(request: FastifyRequest, name: string) {
  const item = (request.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return item ? decodeURIComponent(item.slice(name.length + 1)) : undefined
}
function requestHost(request: FastifyRequest) {
  const forwarded = request.headers['x-forwarded-host']
  return (typeof forwarded === 'string' ? forwarded : request.headers.host ?? 'localhost').split(',')[0]?.split(':')[0]?.toLowerCase() ?? 'localhost'
}
function requestOriginAllowed(request: FastifyRequest) {
  const origin = request.headers.origin
  return !origin || new Set([`https://${requestHost(request)}`, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']).has(origin)
}

@Catch(PlatformError)
class FormulaErrorFilter implements ExceptionFilter {
  catch(error: PlatformError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<FastifyReply>().status(error.status).send({ error: { code: error.code, message: error.message } })
  }
}

@Controller('v2/formula-intelligence')
@UseFilters(FormulaErrorFilter)
export class V2FormulaIntelligenceController {
  constructor(private readonly platform: PlatformService, private readonly formula: FormulaService) {}

  @Get('projects') async projects(@Req() request: FastifyRequest) { return { projects: await this.formula.listProjects((await this.context(request)).context) } }
  @Post('projects') async createProject(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { project: await this.formula.createProject(context, body, key) } }
  @Get('projects/:id') async project(@Req() request: FastifyRequest, @Param('id') id: string) { return { project: await this.formula.projectDetail((await this.context(request)).context, id) } }
  @Post('projects/:id/drafts') async createDraft(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { draft: await this.formula.createDraft(context, id, body, key) } }
  @Put('drafts/:id/components') async replaceComponents(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { draft: await this.formula.replaceDraftComponents(context, id, body, key) } }
  @Get('drafts/:id') async draft(@Req() request: FastifyRequest, @Param('id') id: string) { return { draft: await this.formula.draftDetail((await this.context(request)).context, id) } }
  @Get('drafts/:id/validation') async validate(@Req() request: FastifyRequest, @Param('id') id: string) { return { validation: await this.formula.validateDraft((await this.context(request)).context, id) } }
  @Post('drafts/:id/submit-review') async submit(@Req() request: FastifyRequest, @Param('id') id: string, @Body('rationale') rationale: string, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { draft: await this.formula.submitReview(context, id, rationale, key) } }
  @Post('drafts/:id/approve') async approve(@Req() request: FastifyRequest, @Param('id') id: string, @Body('rationale') rationale: string, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { version: await this.formula.approveDraft(context, id, rationale, key) } }
  @Post('drafts/:id/reject') async reject(@Req() request: FastifyRequest, @Param('id') id: string, @Body('rationale') rationale: string, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { draft: await this.formula.rejectDraft(context, id, rationale, key) } }

  @Post('design-projects') async createDesignProject(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { project: await this.formula.createDesignProject(context, body, key) } }
  @Get('design-projects') async designProjects(@Req() request: FastifyRequest) { return { projects: await this.formula.listDesignProjects((await this.context(request)).context) } }
  @Post('design-projects/:id/review-brief') async reviewBrief(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { brief: await this.formula.reviewBrief(context, id, body, key) } }
  @Post('design-projects/:id/material-universe') async universe(@Req() request: FastifyRequest, @Param('id') id: string, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { universe: await this.formula.buildMaterialUniverse(context, id, key) } }
  @Post('design-projects/:id/candidates') async createCandidate(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { candidate: await this.formula.createCandidate(context, id, body, key) } }
  @Get('candidates/:id') async candidate(@Req() request: FastifyRequest, @Param('id') id: string) { return { candidate: await this.formula.candidateDetail((await this.context(request)).context, id) } }
  @Post('candidates/:id/save-draft/:formulaProjectId') async saveCandidate(@Req() request: FastifyRequest, @Param('id') id: string, @Param('formulaProjectId') formulaProjectId: string, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { draft: await this.formula.saveCandidateAsDraft(context, id, formulaProjectId, key) } }
  @Post('candidates/:id/shares') async share(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { share: await this.formula.shareCandidate(context, id, body, key) } }
  @Delete('candidates/:id/shares/:recipientUserId') async revoke(@Req() request: FastifyRequest, @Param('id') id: string, @Param('recipientUserId') recipientUserId: string, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { share: await this.formula.revokeShare(context, id, recipientUserId, key) } }
  @Post('candidates/:id/feedback') async feedback(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { feedback: await this.formula.addFeedback(context, id, body, key) } }

  private async context(request: FastifyRequest) {
    if (!request.headers.cookie) throw new PlatformError('SESSION_EXPIRED', 'Sign in is required.', 401)
    return this.platform.contextFromToken(cookieValue(request, this.platform.cookieName) ?? '', requestHost(request))
  }
  private async mutation(request: FastifyRequest, context: PlatformContext, csrf?: string) {
    if (!requestOriginAllowed(request)) throw new PlatformError('ORIGIN_DENIED', 'Request origin is not allowed.', 403)
    await this.platform.assertCsrf(context, cookieValue(request, this.platform.cookieName) ?? '', csrf)
  }
}
