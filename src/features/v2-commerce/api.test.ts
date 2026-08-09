import { describe, expect, it } from 'vitest'
import { createCommerceOperationKeyCache } from './api'

describe('commerce operation idempotency cache', () => {
  it('reuses a key after an uncertain transport failure until HTTP settles it', () => {
    const cache = createCommerceOperationKeyCache()
    const first = cache.acquire('allocate-order-1', 'POST:{"quantityGrams":50}')

    expect(cache.acquire('allocate-order-1', 'POST:{"quantityGrams":50}')).toBe(first)

    cache.settle('allocate-order-1', 'POST:{"quantityGrams":50}')
    expect(cache.acquire('allocate-order-1', 'POST:{"quantityGrams":50}')).not.toBe(first)
  })

  it('does not reuse a key after an operation changes its payload', () => {
    const cache = createCommerceOperationKeyCache()
    const first = cache.acquire('return-1', 'POST:{"quantityGrams":10}')

    expect(cache.acquire('return-1', 'POST:{"quantityGrams":12}')).not.toBe(first)
  })
})
