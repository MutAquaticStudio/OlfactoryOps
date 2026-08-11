import { Container } from '@cloudflare/containers'
import { env } from 'cloudflare:workers'
import { scientificContainerEnvironment, scientificContainerHealthEndpoint } from './scientific-container-env.js'

type CloudRuntimeSecretBindings = {
  SCIENTIFIC_CONTAINER_SHARED_SECRET?: string
}

const runtimeSecrets = env as unknown as CloudRuntimeSecretBindings

/**
 * These Durable Object bindings are internal-only. The worker workflow is the
 * sole caller and forwards only a bounded reference envelope to localhost.
 */
export class ScientificFeatureContainer extends Container {
  defaultPort = 8099
  requiredPorts = [8099]
  pingEndpoint = scientificContainerHealthEndpoint
  sleepAfter = '10m'
  enableInternet = false
  envVars = scientificContainerEnvironment(runtimeSecrets.SCIENTIFIC_CONTAINER_SHARED_SECRET)
}

export class ScientificModelContainer extends Container {
  defaultPort = 8100
  requiredPorts = [8100]
  pingEndpoint = scientificContainerHealthEndpoint
  sleepAfter = '10m'
  enableInternet = false
  envVars = scientificContainerEnvironment(runtimeSecrets.SCIENTIFIC_CONTAINER_SHARED_SECRET)
}
