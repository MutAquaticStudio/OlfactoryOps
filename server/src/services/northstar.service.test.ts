import { describe, expect, it } from 'vitest'
import { NorthStarService } from './northstar.service'

describe('NorthStarService', () => {
  it('commits lab usage through OUT movements and reverses by compensation', () => {
    const service = new NorthStarService()
    const commit = service.commitLabUsage('frm-0421', 12.5).data

    expect(commit.usage.status).toBe('COMMITTED')
    expect(commit.movements.length).toBeGreaterThan(0)
    expect(commit.movements.every((movement) => movement.direction === 'OUT')).toBe(true)

    const reverse = service.reverseLatestLabUsage().data

    expect(reverse.usageId).toBe(commit.usage.id)
    expect(reverse.movements.every((movement) => movement.direction === 'IN')).toBe(true)
    expect(reverse.invariant).toContain('reverse by compensation')
  })
})
