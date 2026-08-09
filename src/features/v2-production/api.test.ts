import { describe, expect, it } from 'vitest'
import { createProductionOperationKeyCache } from './api'

describe('production operation idempotency cache', () => {
  it('reuses an operation key until its response is reconciled', () => {
    const cache = createProductionOperationKeyCache()
    const first = cache.acquire('create-order', 'POST\n{"formulaVersionId":"fv_1"}')

    expect(cache.acquire('create-order', 'POST\n{"formulaVersionId":"fv_1"}')).toBe(first)

    cache.settle('create-order', 'POST\n{"formulaVersionId":"fv_1"}')
    expect(cache.acquire('create-order', 'POST\n{"formulaVersionId":"fv_1"}')).not.toBe(first)
  })

  it('does not reuse a key when a retry changes the operation payload', () => {
    const cache = createProductionOperationKeyCache()
    const first = cache.acquire('reverse-usage-1', 'usages/1/reverse\n{"reason":"Incorrect weight"}')

    expect(cache.acquire('reverse-usage-1', 'usages/1/reverse\n{"reason":"Corrected reason"}')).not.toBe(first)
  })
})
