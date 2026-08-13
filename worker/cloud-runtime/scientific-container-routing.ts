import { getRandom, type Container } from '@cloudflare/containers'

/**
 * Each scientific runtime is stateless between requests. Keep the number of
 * named Container instances bounded to the matching Wrangler max_instances
 * value instead of creating a warm Container for every durable workflow job.
 */
export const scientificContainerPoolSize = 2

export function scientificContainerFor<T extends Container>(binding: DurableObjectNamespace<T>): Promise<DurableObjectStub<T>> {
  return getRandom(binding, scientificContainerPoolSize)
}
