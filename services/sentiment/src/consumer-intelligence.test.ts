import { describe, expect, it } from 'vitest'
import { createPreferenceVectorRequestSchema, ingestFeedbackRequestSchema, recordSentimentAnalysisRequestSchema } from '../../../packages/contracts/src/consumer-intelligence.js'

describe('consumer intelligence contracts', () => {
  it('accepts hashes and a private reference but not raw text', () => {
    const valid = ingestFeedbackRequestSchema.safeParse({ sourceId: 'source_1', externalRefHash: 'a'.repeat(64), contentHash: 'b'.repeat(64), privateContentRef: 'private://feedback/1', collectedAt: '2026-08-08T00:00:00.000Z' })
    expect(valid.success).toBe(true)
    expect(ingestFeedbackRequestSchema.safeParse({ ...valid.data, rawText: 'do not persist me' }).success).toBe(false)
  })

  it('bounds manual derived signals and requires an explicit evidence status', () => {
    expect(recordSentimentAnalysisRequestSchema.safeParse({ feedbackItemId: 'item_1', extractionVersion: 'manual-v1', provider: 'manual-review', modelVersion: 'manual-v1', language: 'EN', languageConfidence: 1, overall: { label: 'POSITIVE', score: 0.5, confidence: 0.8 }, descriptors: [{ id: 'woody', value: 0.6, confidence: 0.8 }], evidenceStatus: 'VERIFIED' }).success).toBe(true)
  })

  it('deduplicates and orders source ids before a preference aggregation', () => {
    const parsed = createPreferenceVectorRequestSchema.parse({ sourceIds: ['source_b', 'source_a', 'source_b'], sourceScope: 'project_1', vocabularyVersion: 'v1', aggregationVersion: 'v1' })
    expect(parsed.sourceIds).toEqual(['source_a', 'source_b'])
  })
})
