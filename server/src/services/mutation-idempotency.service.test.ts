import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { MutationIdempotencyService } from './mutation-idempotency.service.js'

const session = {
  id: 'sess-test', userId: 'usr-test', email: 'test@example.test', organizationId: 'org-test',
  role: 'Owner', status: 'active', issuedAt: '', lastSeenAt: '', idleExpiresAt: '', expiresAt: '',
} as any

describe('MutationIdempotencyService', () => {
  it('replays an identical mutation and rejects conflicting reuse', async () => {
    const service = new MutationIdempotencyService()
    const key = `cleanup-test-${randomUUID()}`
    let writes = 0
    const first = await service.idempotentMutation(session, 'POST:/formulas/compose', key, { value: 1 }, async () => ({ writes: ++writes }))
    const replay = await service.idempotentMutation(session, 'POST:/formulas/compose', key, { value: 1 }, async () => ({ writes: ++writes }))
    expect(replay).toEqual(first)
    expect(writes).toBe(1)
    await expect(service.idempotentMutation(session, 'POST:/formulas/compose', key, { value: 2 }, async () => ({ writes: ++writes }))).rejects.toThrow(/different request/i)
  })
})
