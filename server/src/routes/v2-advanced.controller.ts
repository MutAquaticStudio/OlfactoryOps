import { ArgumentsHost, Body, Catch, Controller, ExceptionFilter, Get, Headers, Param, Post, Req, UseFilters } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { AdvancedOperationsService } from '../../../services/advanced/src/advanced-service.js'
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
  return typeof origin === 'string' && new Set([`https://${requestHost(request)}`, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']).has(origin)
}

@Catch(PlatformError)
class AdvancedErrorFilter implements ExceptionFilter {
  catch(error: PlatformError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<FastifyReply>().status(error.status).send({ error: { code: error.code, message: error.message } })
  }
}

/** Advanced routes are tenant-scoped delegates; no browser tenant ID is read. */
@Controller('v2/advanced')
@UseFilters(AdvancedErrorFilter)
export class V2AdvancedController {
  constructor(private readonly platform: PlatformService, private readonly advanced: AdvancedOperationsService) {}

  @Get('optimizer/runs')
  async optimizerRuns(@Req() request: FastifyRequest) { return { runs: await this.advanced.listOptimizerRuns((await this.context(request)).context) } }

  @Post('optimizer/runs')
  async createOptimizerRun(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { run: await this.advanced.createOptimizerRun(context, body, key) }
  }

  @Get('optimizer/runs/:runId')
  async optimizerDetail(@Req() request: FastifyRequest, @Param('runId') runId: string) { return this.advanced.optimizerDetail((await this.context(request)).context, runId) }

  @Post('optimizer/candidates/:candidateId/review')
  async reviewOptimizerCandidate(@Req() request: FastifyRequest, @Param('candidateId') candidateId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { review: await this.advanced.reviewOptimizerCandidate(context, candidateId, body, key) }
  }

  @Get('imports')
  async imports(@Req() request: FastifyRequest) { return { imports: await this.advanced.listImports((await this.context(request)).context) } }

  @Post('imports')
  async createImport(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { importJob: await this.advanced.createImport(context, body, key) }
  }

  @Get('imports/:jobId')
  async importDetail(@Req() request: FastifyRequest, @Param('jobId') jobId: string) { return this.advanced.importDetail((await this.context(request)).context, jobId) }

  @Post('imports/:jobId/commit')
  async commitImport(@Req() request: FastifyRequest, @Param('jobId') jobId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { importJob: await this.advanced.commitImport(context, jobId, body, key) }
  }

  @Post('dataops/runs')
  async dataOps(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { run: await this.advanced.runDataOps(context, body, key) }
  }

  @Get('dataops/runs')
  async dataOpsRuns(@Req() request: FastifyRequest) { return { runs: await this.advanced.listDataOpsRuns((await this.context(request)).context) } }

  @Post('bulk/preview')
  async previewBulk(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { operation: await this.advanced.previewBulkOperation(context, body, key) }
  }

  @Post('bulk/:operationId/commit')
  async commitBulk(@Req() request: FastifyRequest, @Param('operationId') operationId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { operation: await this.advanced.commitBulkOperation(context, operationId, body, key) }
  }

  private async context(request: FastifyRequest) {
    if (!request.headers.cookie) throw new PlatformError('SESSION_EXPIRED', 'Sign in is required.', 401)
    return this.platform.contextFromToken(cookieValue(request, this.platform.cookieName) ?? '', requestHost(request))
  }

  private async mutation(request: FastifyRequest, context: PlatformContext, csrf?: string) {
    if (!requestOriginAllowed(request)) throw new PlatformError('ORIGIN_DENIED', 'Request origin is not allowed.', 403)
    await this.platform.assertCsrf(context, cookieValue(request, this.platform.cookieName) ?? '', csrf)
  }
}
