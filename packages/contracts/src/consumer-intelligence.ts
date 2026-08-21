import { z } from 'zod'

const id = z.string().trim().min(1).max(160)
const hash = z.string().regex(/^[a-f0-9]{64}$/i).transform((value) => value.toLowerCase())
const boundedSignals = z.array(z.object({ id, value: z.number().min(-1).max(1), confidence: z.number().min(0).max(1) })).max(32)
const evidenceStatus = z.enum(['VERIFIED', 'LOW_CONFIDENCE', 'NOT_ENOUGH_EVIDENCE', 'NOT_CONFIGURED', 'BLOCKED', 'INVALIDATED'])

export const createFeedbackSourceRequestSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_-]{1,79}$/),
  type: z.enum(['REVIEW', 'SURVEY', 'WORKSHOP', 'BRAND_PROJECT', 'INTERNAL_EVALUATION']),
  sourceScope: id,
  storageRef: z.string().trim().min(1).max(2048),
  purpose: z.string().trim().min(1).max(500),
  consentRequired: z.boolean(),
  retentionDays: z.number().int().min(1).max(36500),
}).strict()

export const ingestFeedbackRequestSchema = z.object({
  sourceId: id,
  externalRefHash: hash,
  contentHash: hash,
  privateContentRef: z.string().trim().min(1).max(2048),
  consentProofHash: hash.optional(),
  languageHint: z.enum(['EN', 'VI', 'UNKNOWN']).default('UNKNOWN'),
  collectedAt: z.string().datetime({ offset: true }),
}).strict()

export const recordSentimentAnalysisRequestSchema = z.object({
  feedbackItemId: id,
  extractionVersion: id,
  provider: z.literal('manual-review'),
  modelVersion: z.literal('manual-v1'),
  language: z.enum(['EN', 'VI', 'OTHER', 'UNKNOWN']),
  languageConfidence: z.number().min(0).max(1),
  overall: z.object({ label: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED', 'UNKNOWN']), score: z.number().min(-1).max(1), confidence: z.number().min(0).max(1) }),
  aspects: boundedSignals.default([]),
  perceptions: boundedSignals.default([]),
  descriptors: boundedSignals.default([]),
  evidenceStatus,
}).strict()

// Raw feedback is accepted only for this immediate, deterministic analysis
// boundary. It must never be persisted or returned by an API response.
export const analyzeTransientFeedbackRequestSchema = z.object({
  feedbackItemId: id,
  rawText: z.string().trim().min(1).max(8_000),
}).strict()

export const createPreferenceVectorRequestSchema = z.object({
  sourceIds: z.array(id).min(1).max(32).transform((items) => [...new Set(items)].sort()),
  sourceScope: id,
  vocabularyVersion: id,
  aggregationVersion: id,
  windowStart: z.string().datetime({ offset: true }).optional(),
  windowEnd: z.string().datetime({ offset: true }).optional(),
}).strict().refine((value) => !value.windowStart || !value.windowEnd || value.windowEnd >= value.windowStart, { message: 'The time window is invalid.', path: ['windowEnd'] })

export const invalidateFeedbackSourceRequestSchema = z.object({ reasonCode: z.string().trim().min(1).max(120) })
