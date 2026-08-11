import { v2ControllerRoutes } from './controller-registry.js'
import { agentEventStreamResponse } from './agent-stream.js'
import { createV2ApiServices, disconnectV2ApiServices, type V2ApiServiceEnv } from './service-container.js'
import { invokeControllerRoute, matchControllerRoute } from './transport.js'

export type V2ApiWorkerEnv = V2ApiServiceEnv & {
  RELEASE_ENVIRONMENT?: string
  RELEASE_GIT_SHA?: string
  V2_API_PUBLIC_HOSTNAME: string
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

export default {
  async fetch(request: Request, env: V2ApiWorkerEnv): Promise<Response> {
    const url = new URL(request.url)
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
        })
      }
      const streamServices = services
      const stream = await agentEventStreamResponse({
        request,
        services: streamServices,
        config: { publicHostname: env.V2_API_PUBLIC_HOSTNAME, tenantBaseDomain: env.V2_WORKSPACE_BASE_DOMAIN },
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
      if (!matched) return json(404, { error: { code: 'NOT_FOUND', message: 'The requested V2 route was not found.' } })
      return await invokeControllerRoute({
        request,
        route: matched.route,
        params: matched.params,
        config: { publicHostname: env.V2_API_PUBLIC_HOSTNAME, tenantBaseDomain: env.V2_WORKSPACE_BASE_DOMAIN },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const status = /HYPERDRIVE|RUNTIME_NOT_CONFIGURED|V2_.*required/i.test(message) ? 503 : 500
      return json(status, { error: { code: status === 503 ? 'RUNTIME_NOT_CONFIGURED' : 'RUNTIME_UNAVAILABLE', message: status === 503 ? 'The staging runtime is not configured.' : 'The staging runtime could not be initialized.' } })
    } finally {
      if (services) await disconnectV2ApiServices(services)
    }
  },
} satisfies ExportedHandler<V2ApiWorkerEnv>
