import { Container, type StopParams } from '@cloudflare/containers'
import {
  scientificContainerDiagnostic,
  scientificContainerEnvironment,
  scientificContainerHealthEndpoint,
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

  override onStop({ exitCode, reason }: StopParams): void {
    console.log(
      JSON.stringify({
        event: 'scientific_container_stop',
        container: this.diagnosticContainer,
        exitCode,
        reason,
      }),
    )
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
