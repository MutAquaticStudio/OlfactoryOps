import { ForbiddenException } from '@nestjs/common'
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

  it('issues short-lived document URLs only after permission check and logs access', () => {
    const service = new NorthStarService()
    const before = service.documents().data.find((document) => document.id === 'DOC-118')
    expect(before).toBeDefined()

    const result = service.requestDocumentSignedUrl('DOC-118').data

    expect(result.signedUrl.url).toContain('expires=')
    expect(result.signedUrl.ttlSeconds).toBe(300)
    expect(result.document.downloads).toBe(before!.downloads + 1)
    expect(result.audit.action).toBe('document.download')
    expect(result.audit.outcome).toBe('allowed')
    expect(service.documentDownloadAudit().data[0]?.entity).toBe('DOC-118')
  })

  it('blocks highly confidential document downloads without sensitive permission and keeps audit evidence', () => {
    const service = new NorthStarService()

    expect(() =>
      service.requestDocumentSignedUrl('DOC-121', {
        actor: 'api:viewer',
        permissions: ['documents.download'],
      }),
    ).toThrow(ForbiddenException)

    const latestAudit = service.documentDownloadAudit().data[0]
    expect(latestAudit?.entity).toBe('DOC-121')
    expect(latestAudit?.outcome).toBe('blocked')
  })
})
