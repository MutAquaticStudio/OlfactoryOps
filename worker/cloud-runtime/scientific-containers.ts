import { Container } from '@cloudflare/containers'

/**
 * These Durable Object bindings are internal-only. The worker workflow is the
 * sole caller and forwards only a bounded reference envelope to localhost.
 */
export class ScientificFeatureContainer extends Container {
  defaultPort = 8099
  requiredPorts = [8099]
  sleepAfter = '10m'
  enableInternet = false
}

export class ScientificModelContainer extends Container {
  defaultPort = 8100
  requiredPorts = [8100]
  sleepAfter = '10m'
  enableInternet = false
}
