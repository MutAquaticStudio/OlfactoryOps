import 'reflect-metadata'
import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppModule } from './modules/app.module.js'
import { resolveLocalApiConfig } from './modules/local-api-config.js'
import { isLocalWorkspaceOrigin, localWorkspaceUrl, workspaceSlugFromLocalOrigin } from './modules/local-workspace-hosts.js'
import { NorthStarService } from './services/northstar.service.js'
import { isAppHttpError } from './shared/http-error.js'
import { releaseHeaders, releaseMetadata } from '../../src/data/release.js'
import { isRemovedV1Path, removedV1RouteCode } from '../../src/data/appRoutes.js'

@Catch()
class AppHttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse()

    if (isAppHttpError(exception)) {
      response.status(exception.getStatus()).send(exception.getResponse())
      return
    }

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).send(exception.getResponse())
      return
    }

    console.error(exception)
    response.status(500).send({ statusCode: 500, message: 'Internal server error', error: 'Internal Server Error' })
  }
}

async function bootstrap() {
  const config = resolveLocalApiConfig()
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: ['log', 'warn', 'error'],
  })
  const release = releaseMetadata({
    fullGitSha: process.env.RELEASE_GIT_SHA,
    buildTimestampUtc: process.env.RELEASE_BUILD_TIMESTAMP_UTC,
    environment: process.env.RELEASE_ENVIRONMENT ?? 'local',
  })
  app.getHttpAdapter().getInstance().addHook('onSend', async (_request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    for (const [name, value] of Object.entries(releaseHeaders(release))) reply.header(name, value)
    return payload
  })

  app.enableCors({
    origin: (origin, callback) => {
      const allowed = !origin
        || config.corsOrigins.includes(origin)
        || (config.workspaceHostnamesEnabled && isLocalWorkspaceOrigin(origin))
      callback(null, allowed)
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Idempotency-Key'],
  })
  app.getHttpAdapter().getInstance().addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const pathname = request.url.split('?', 1)[0]?.replace(/^\/api\/v1(?=\/|$)/, '') || '/'
    if (!isRemovedV1Path(pathname)) return
    reply.status(410).send({
      statusCode: 410,
      code: removedV1RouteCode,
      message: 'This V1 product surface is no longer active. Use the current workspace modules after the V2 hand-off.',
    })
    return reply
  })
  if (config.workspaceHostnamesEnabled) {
    const northStar = app.get(NorthStarService)
    app.getHttpAdapter().getInstance().addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
      const origin = typeof request.headers.origin === 'string' ? request.headers.origin : undefined
      const requestedSlug = workspaceSlugFromLocalOrigin(origin)
      if (!requestedSlug || request.url.startsWith('/api/v1/auth/')) return
      try {
        const workspace = northStar.workspaceAccessForOrganization(northStar.me().data.session.organizationId)
        const expectedSlug = workspace.systemHostname.split('.')[0]
        if (requestedSlug !== expectedSlug && origin) {
          reply.status(403).send({
            statusCode: 403,
            code: 'WORKSPACE_HOST_MISMATCH',
            message: 'This session belongs to a different workspace address',
            workspaceUrl: localWorkspaceUrl(expectedSlug, origin),
          })
          return reply
        }
      } catch {
        // Authentication remains the responsibility of the existing route guards.
      }
    })
  }
  app.useGlobalFilters(new AppHttpErrorFilter())
  app.setGlobalPrefix('api/v1')

  await app.listen(config.port, config.host)
}

bootstrap().catch((error) => {
  console.error(error)
  process.exit(1)
})
