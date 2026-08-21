import { v2ControllerRoutes } from './controller-registry.js'
import { agentEventStreamResponse } from './agent-stream.js'
import { createV2ApiServices, disconnectV2ApiServices, type V2ApiServiceEnv } from './service-container.js'
import { invokeControllerRoute, matchControllerRoute, runtimeInitializationFailureResponse, trustedErrorCors, unmatchedRouteResponse } from './transport.js'

export type V2ApiWorkerEnv = V2ApiServiceEnv & {
  RELEASE_ENVIRONMENT?: string
  RELEASE_GIT_SHA?: string
  V2_API_PUBLIC_HOSTNAME: string
  V2_PUBLIC_PAGES_HOSTNAME?: string
  V2_PLATFORM_ADMIN_HOSTNAME?: string
}

function json(status: number, body: Record<string, unknown>, headers = new Headers({ 'cache-control': 'no-store' })) {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('content-type', 'application/json; charset=utf-8')
  responseHeaders.set('cache-control', responseHeaders.get('cache-control') ?? 'no-store')
  return new Response(JSON.stringify(body), { status, headers: responseHeaders })
}

export default {
  async fetch(request: Request, env: V2ApiWorkerEnv): Promise<Response> {
    const url = new URL(request.url)
    const transportConfig = { publicHostname: env.V2_API_PUBLIC_HOSTNAME, publicPageHostname: env.V2_PUBLIC_PAGES_HOSTNAME, platformAdminHostname: env.V2_PLATFORM_ADMIN_HOSTNAME, tenantBaseDomain: env.V2_WORKSPACE_BASE_DOMAIN }
    let services: ReturnType<typeof createV2ApiServices> | undefined
    try {
      services = createV2ApiServices(env)
      if (request.method === 'GET' && url.pathname === '/health') {
        await services.prisma.$queryRawUnsafe('SELECT 1')
        return json(200, {
          status: 'ok',
          runtime: 'v2-api-worker/1',
          environment: env.RELEASE_ENVIRONMENT ?? 'unconfigured',
          releaseGitSha: env.RELEASE_GIT_SHA ?? 'unconfigured',
          database: 'hyperdrive',
        }, trustedErrorCors(request, transportConfig))
      }
      const streamServices = services
      const stream = await agentEventStreamResponse({
        request,
        services: streamServices,
        config: transportConfig,
        onClose: () => disconnectV2ApiServices(streamServices),
      })
      if (stream) {
        services = undefined
        return stream
      }
      const routes = v2ControllerRoutes(services)
      const matchRequest = request.method === 'OPTIONS'
        ? new Request(request, { method: request.headers.get('access-control-request-method')?.toUpperCase() ?? 'OPTIONS' })
        : request
      const matched = matchControllerRoute(routes, matchRequest)
      if (!matched) return unmatchedRouteResponse(request, transportConfig)
      return await invokeControllerRoute({
        request,
        route: matched.route,
        params: matched.params,
        config: transportConfig,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const status = /HYPERDRIVE|RUNTIME_NOT_CONFIGURED|V2_.*required/i.test(message) ? 503 : 500
      return runtimeInitializationFailureResponse(request, transportConfig, status as 500 | 503)
    } finally {
      if (services) await disconnectV2ApiServices(services)
    }
  },
} satisfies ExportedHandler<V2ApiWorkerEnv>
