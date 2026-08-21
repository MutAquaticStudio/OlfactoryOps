import { ArgumentsHost, Body, Catch, Controller, Delete, ExceptionFilter, Get, Headers, Param, Post, Req, UseFilters } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { TrialSensoryService } from '../../../services/trials-sensory/src/service.js'
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
class TrialsErrorFilter implements ExceptionFilter {
  catch(error: PlatformError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<FastifyReply>().status(error.status).send({ error: { code: error.code, message: error.message } })
  }
}

@Controller('v2/trials')
@UseFilters(TrialsErrorFilter)
export class V2TrialsSensoryController {
  constructor(private readonly platform: PlatformService, private readonly trials: TrialSensoryService) {}

  @Get() async list(@Req() request: FastifyRequest) { return { trials: await this.trials.listTrials((await this.context(request)).context) } }
  @Post() async create(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { trial: await this.trials.createTrial(context, body, key) } }
  @Get('forms') async forms(@Req() request: FastifyRequest) { return { forms: await this.trials.listSensoryForms((await this.context(request)).context) } }
  @Post('forms') async createForm(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { form: await this.trials.createSensoryForm(context, body, key) } }
  @Get('formula-versions') async formulaVersions(@Req() request: FastifyRequest) { return { versions: await this.trials.approvedFormulaVersions((await this.context(request)).context) } }
  @Get('formula-versions/:formulaVersionId/memory') async memory(@Req() request: FastifyRequest, @Param('formulaVersionId') formulaVersionId: string) { return { memory: await this.trials.retrieveTrialMemory((await this.context(request)).context, formulaVersionId) } }
  @Get(':id/preparation/:sessionId') async preparationDetail(@Req() request: FastifyRequest, @Param('id') id: string, @Param('sessionId') sessionId: string) { return this.trials.preparationDetail((await this.context(request)).context, id, sessionId) }
  @Get(':id') async detail(@Req() request: FastifyRequest, @Param('id') id: string) { return this.trials.detail((await this.context(request)).context, id) }
  @Post(':id/plan') async plan(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { trial: await this.trials.planTrial(context, id, body, key) } }
  @Post(':id/release') async release(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { trial: await this.trials.releaseTrial(context, id, body, key) } }
  @Post(':id/cancel') async cancel(@Req() request: FastifyRequest, @Param('id') id: string, @Body('rationale') rationale: string, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { trial: await this.trials.cancelTrial(context, id, rationale ?? '', key) } }
  @Post(':id/preparation') async startPreparation(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { preparation: await this.trials.startPreparation(context, id, body, key) } }
  @Post(':id/preparation/:sessionId/confirm') async confirmPreparation(@Req() request: FastifyRequest, @Param('id') id: string, @Param('sessionId') sessionId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { preparation: await this.trials.confirmPreparation(context, id, sessionId, body, key) } }
  @Post(':id/preparation/movements/:movementId/reverse') async reversePreparation(@Req() request: FastifyRequest, @Param('id') id: string, @Param('movementId') movementId: string, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { reversal: await this.trials.reversePreparationConsumption(context, id, movementId, key) } }
  @Post(':id/samples') async sample(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { sample: await this.trials.createSample(context, id, body, key) } }
  @Post(':id/evidence') async attachEvidence(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { evidence: await this.trials.attachEvidence(context, id, body, key) } }
  @Post(':id/sessions') async session(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { session: await this.trials.createSensorySession(context, id, body, key) } }
  @Get('sessions/:id/assignments') async assignments(@Req() request: FastifyRequest, @Param('id') id: string) { return { assignments: await this.trials.sensoryAssignments((await this.context(request)).context, id) } }
  @Get('sessions/:id/assignments/me') async myAssignments(@Req() request: FastifyRequest, @Param('id') id: string) { return this.trials.sensoryAssignmentsForCurrent((await this.context(request)).context, id) }
  @Get('sessions/:id/panelists') async panelists(@Req() request: FastifyRequest, @Param('id') id: string) { return { panelists: await this.trials.sensoryPanelists((await this.context(request)).context, id) } }
  @Get('sessions/:id/public-links') async publicLinks(@Req() request: FastifyRequest, @Param('id') id: string) { return { links: await this.trials.publicLinks((await this.context(request)).context, id) } }
  @Post('sessions/:id/panelists') async assignPanelist(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { assignment: await this.trials.assignPanelist(context, id, body, key) } }
  @Post('sessions/:id/samples') async assignSample(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { assignment: await this.trials.assignSample(context, id, body, key) } }
  @Post('sessions/:id/samples/:sampleAssignmentId/unblind') async unblind(@Req() request: FastifyRequest, @Param('id') id: string, @Param('sampleAssignmentId') sampleAssignmentId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { assignment: await this.trials.unblindSample(context, id, sampleAssignmentId, body, key) } }
  @Post('sessions/:id/transition/:target') async transitionSession(@Req() request: FastifyRequest, @Param('id') id: string, @Param('target') target: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const normalized = target.toUpperCase()
    if (!['SCHEDULED', 'OPEN', 'CLOSED', 'VOIDED'].includes(normalized)) throw new PlatformError('SENSORY_SESSION_STATE_INVALID', 'This session transition is not available.', 422)
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { session: await this.trials.transitionSession(context, id, normalized as 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'VOIDED', body, key) }
  }
  @Post('sessions/:id/evaluations') async evaluate(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { evaluation: await this.trials.submitEvaluation(context, id, body, key) } }
  @Post('sessions/:id/public-links') async publicLink(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { link: await this.trials.createPublicLink(context, id, body, key) } }
  @Delete('public-links/:id') async revokePublicLink(@Req() request: FastifyRequest, @Param('id') id: string, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { link: await this.trials.revokePublicLink(context, id, key) } }
  @Post(':id/decision') async decision(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { decision: await this.trials.decideTrial(context, id, body, key) } }

  private async context(request: FastifyRequest) {
    if (!request.headers.cookie) throw new PlatformError('SESSION_EXPIRED', 'Sign in is required.', 401)
    return this.platform.contextFromToken(cookieValue(request, this.platform.cookieName) ?? '', requestHost(request))
  }
  private async mutation(request: FastifyRequest, context: PlatformContext, csrf?: string) {
    if (!requestOriginAllowed(request)) throw new PlatformError('ORIGIN_DENIED', 'Request origin is not allowed.', 403)
    await this.platform.assertCsrf(context, cookieValue(request, this.platform.cookieName) ?? '', csrf)
  }
}

@Controller('v2/public/sensory')
@UseFilters(TrialsErrorFilter)
export class V2PublicSensoryController {
  constructor(private readonly trials: TrialSensoryService) {}
  @Get(':token') async presentation(@Param('token') token: string) { return { presentation: await this.trials.publicPresentation(token) } }
  @Post(':token/evaluations') async evaluate(@Param('token') token: string, @Body() body: unknown, @Headers('idempotency-key') key?: string) { return { evaluation: await this.trials.submitPublicEvaluation(token, body, key) } }
}
