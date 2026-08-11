import { Container, type StopParams } from '@cloudflare/containers'
import {
  scientificContainerDiagnostic,
  scientificContainerEnvironment,
  scientificFeatureContainerEntrypoint,
  scientificContainerHealthEndpoint,
  scientificContainerStartupPollIntervalMs,
  scientificContainerStartupTimeoutMs,
} from './scientific-container-env.js'

type CloudRuntimeSecretBindings = {
  SCIENTIFIC_CONTAINER_SHARED_SECRET?: string
}

abstract class ScientificContainer extends Container<CloudRuntimeSecretBindings> {
  abstract readonly diagnosticContainer: 'feature' | 'model'

  constructor(ctx: ConstructorParameters<typeof Container<CloudRuntimeSecretBindings>>[0], env: CloudRuntimeSecretBindings) {
    super(ctx, env)
    this.envVars = scientificContainerEnvironment(env.SCIENTIFIC_CONTAINER_SHARED_SECRET)
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
    console.log(
      JSON.stringify({
        event: 'scientific_container_stop',
        container: this.diagnosticContainer,
        exitCode,
      }),
    )
  }

  override async fetch(request: Request): Promise<Response> {
    if (this.defaultPort === undefined) throw new Error('SCIENTIFIC_CONTAINER_PORT_NOT_CONFIGURED')
    await this.startAndWaitForPorts({
      ports: this.defaultPort,
      cancellationOptions: {
        abort: request.signal,
        instanceGetTimeoutMS: scientificContainerStartupTimeoutMs,
        portReadyTimeoutMS: scientificContainerStartupTimeoutMs,
        waitInterval: scientificContainerStartupPollIntervalMs,
      },
    })
    return super.fetch(request)
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
