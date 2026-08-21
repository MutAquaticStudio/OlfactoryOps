import { describe, expect, it } from 'vitest'
import { createAdvancedOperationKeyCache } from './api'

describe('advanced operation idempotency cache', () => {
  it('retains a key while a client retry cannot know whether a mutation settled', () => {
    const cache = createAdvancedOperationKeyCache()
    const first = cache.acquire('import-preview', 'POST:{"kind":"MATERIALS"}')

    expect(cache.acquire('import-preview', 'POST:{"kind":"MATERIALS"}')).toBe(first)

    cache.settle('import-preview', 'POST:{"kind":"MATERIALS"}')
    expect(cache.acquire('import-preview', 'POST:{"kind":"MATERIALS"}')).not.toBe(first)
  })

  it('does not reuse an operation key after the request changes', () => {
    const cache = createAdvancedOperationKeyCache()
    const first = cache.acquire('optimizer-run', 'POST:{"seed":1}')

    expect(cache.acquire('optimizer-run', 'POST:{"seed":2}')).not.toBe(first)
  })
})
