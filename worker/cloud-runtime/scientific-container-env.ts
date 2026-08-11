/**
 * Container images intentionally accept a service-specific secret name. Keep
 * the Cloudflare Worker binding name private to the runtime boundary.
 */
export function scientificContainerEnvironment(sharedSecret: string | undefined): Record<string, string> {
  return sharedSecret ? { SCIENTIFIC_SERVICE_SHARED_SECRET: sharedSecret } : {}
}
