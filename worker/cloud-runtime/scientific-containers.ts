import { Container, type StopParams } from '@cloudflare/containers'
import {
  scientificContainerDiagnostic,
  scientificContainerEnvironment,
  scientificFeatureContainerEntrypoint,
  scientificContainerHealthEndpoint,
  scientificContainerStartupPollIntervalMs,
  scientificContainerStartupTimeoutMs,
  scientificContainerStopPollAttempts,
  scientificContainerStopPollIntervalMs,
} from './scientific-container-env.js'
import { parseScientificContainerResponse, scientificContainerRequestSchema, type ScientificContainerRequest } from './contracts.js'
import { ScientificContainerLane, type ScientificContainerLaneCleanup } from './scientific-container-lane.js'
import { ScientificContainerStartup } from './scientific-container-startup.js'

type CloudRuntimeSecretBindings = {
  SCIENTIFIC_CONTAINER_SHARED_SECRET?: string
}

export type BufferedScientificContainerResponse = {
  status: number
  body: string
}

const scientificContainerMaximumResponseBytes = 1_000_000

async function readBoundedBody(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > scientificContainerMaximumResponseBytes) {
        await reader.cancel().catch(() => undefined)
        throw new Error('SCIENTIFIC_CONTAINER_RESPONSE_TOO_LARGE')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const output = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(output)
}

abstract class ScientificContainer extends Container<CloudRuntimeSecretBindings> {
  abstract readonly diagnosticContainer: 'feature' | 'model'
  private readonly startup = new ScientificContainerStartup()
  private readonly lane: ScientificContainerLane

  constructor(ctx: ConstructorParameters<typeof Container<CloudRuntimeSecretBindings>>[0], env: CloudRuntimeSecretBindings) {
    super(ctx, env)
    this.envVars = scientificContainerEnvironment(env.SCIENTIFIC_CONTAINER_SHARED_SECRET)
    this.lane = new ScientificContainerLane({
      getState: () => this.getState(),
      stop: () => this.stop(),
      destroy: () => this.destroy(),
    }, {
      pollAttempts: scientificContainerStopPollAttempts,
      pollIntervalMs: scientificContainerStopPollIntervalMs,
      onCleanup: (outcome) => this.logLaneCleanup(outcome),
    })
  }

  /**
   * RPC boundary for workflow-owned scientific jobs. The complete response is
   * buffered before the lane can be stopped, and queued callers wait through
   * that teardown before starting a new container request.
   */
  async runScientificJob(input: ScientificContainerRequest, sharedSecret: string): Promise<BufferedScientificContainerResponse> {
    const request = scientificContainerRequestSchema.parse(input)
    if (!sharedSecret) throw new Error('SCIENTIFIC_CONTAINER_NOT_CONFIGURED')

    return this.lane.run(async () => {
      const response = await this.invokeContainer(new Request('https://scientific.internal/v1/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-olfactoryops-scientific-key': sharedSecret },
        body: JSON.stringify(request),
      }))
      const body = await readBoundedBody(response)
      if (!response.ok) return { status: response.status, body }

      try {
        return { status: response.status, body: JSON.stringify(parseScientificContainerResponse(request, JSON.parse(body))) }
      } catch {
        throw new Error('SCIENTIFIC_CONTAINER_INVALID_RESPONSE')
      }
    })
  }

  override onError(error: unknown): void {
    const diagnostic = scientificContainerDiagnostic(error)
    console.error(
      JSON.stringify({
        event: 'scientific_container_error',
        container: this.diagnosticContainer,
        ...diagnostic,
        secretConfigured: Boolean(this.envVars?.SCIENTIFIC_SERVICE_SHARED_SECRET),
      }),
    )
  }

  override onStart(): void {
    console.log(
      JSON.stringify({
        event: 'scientific_container_ready',
        container: this.diagnosticContainer,
      }),
    )
  }

  override onStop({ exitCode }: StopParams): void {
    this.startup.reset()
    console.log(
      JSON.stringify({
        event: 'scientific_container_stop',
        container: this.diagnosticContainer,
        exitCode,
      }),
    )
  }

  override async onActivityExpired(): Promise<void> {
    // Explicit lane cleanup owns normal teardown. Keep the library idle timer
    // as a diagnostic fallback when an unexpected path leaves the lane idle.
    console.log(JSON.stringify({ event: 'scientific_container_idle_expired', container: this.diagnosticContainer }))
    await this.stop()
  }

  override async fetch(request: Request): Promise<Response> {
    return this.invokeContainer(request)
  }

  private async invokeContainer(request: Request): Promise<Response> {
    if (this.defaultPort === undefined) throw new Error('SCIENTIFIC_CONTAINER_PORT_NOT_CONFIGURED')
    await this.startup.ensure(async () => {
      await this.startAndWaitForPorts({
        ports: this.defaultPort,
        // Startup belongs to the shared pool lane rather than a single
        // request. A caller disconnecting must not abort the startup awaited
        // by other authorized workflow deliveries.
        cancellationOptions: {
          instanceGetTimeoutMS: scientificContainerStartupTimeoutMs,
          portReadyTimeoutMS: scientificContainerStartupTimeoutMs,
          waitInterval: scientificContainerStartupPollIntervalMs,
        },
      })
    })
    return super.fetch(request)
  }

  private logLaneCleanup(outcome: ScientificContainerLaneCleanup): void {
    console.log(JSON.stringify({ event: 'scientific_container_lane_cleanup', container: this.diagnosticContainer, outcome }))
  }
}

/**
 * These Durable Object bindings are internal-only. The worker workflow is the
 * sole caller and forwards only a bounded reference envelope to localhost.
 */
export class ScientificFeatureContainer extends ScientificContainer {
  readonly diagnosticContainer = 'feature'
  defaultPort = 8099
  requiredPorts = [8099]
  // Bypass the micromamba image shell entrypoint. The Container runtime starts
  // this exact pinned interpreter command, matching the production service.
  entrypoint = [...scientificFeatureContainerEntrypoint]
  pingEndpoint = scientificContainerHealthEndpoint
  sleepAfter = '10m'
  enableInternet = false
}

export class ScientificModelContainer extends ScientificContainer {
  readonly diagnosticContainer = 'model'
  defaultPort = 8100
  requiredPorts = [8100]
  pingEndpoint = scientificContainerHealthEndpoint
  sleepAfter = '10m'
  enableInternet = false
}
