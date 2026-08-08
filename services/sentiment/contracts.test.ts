import { describe, expect, it } from 'vitest'
import { consumerPreferenceVectorSchema, feedbackItemSchema, sentimentResultSchema } from './contracts'

describe('sentiment and consumer intelligence contract', () => {
  it('requires tenant-scoped, minimized feedback references', () => {
    expect(feedbackItemSchema.safeParse({ itemId: 'feedback-1', sourceId: 'source-1', organizationId: 'org-1', contentHash: 'a'.repeat(64), contentRef: 'private://feedback-1', redacted: true }).success).toBe(true)
    expect(feedbackItemSchema.safeParse({ itemId: 'feedback-1', sourceId: 'source-1', contentHash: 'a'.repeat(64), contentRef: 'private://feedback-1', redacted: true }).success).toBe(false)
  })

  it('represents unavailable or low-confidence analysis explicitly', () => {
    expect(sentimentResultSchema.parse({ label: 'UNKNOWN', score: 0, confidence: 0, status: 'NOT_CONFIGURED', provider: 'none', modelVersion: 'none' }).status).toBe('NOT_CONFIGURED')
    expect(consumerPreferenceVectorSchema.parse({ vectorId: 'pref-1', organizationId: 'org-1', sourceScope: 'project-1', vocabularyVersion: 'v1', dimensions: {}, evidenceCount: 0, status: 'NOT_ENOUGH_EVIDENCE', aggregationVersion: 'v1' }).status).toBe('NOT_ENOUGH_EVIDENCE')
  })
})
