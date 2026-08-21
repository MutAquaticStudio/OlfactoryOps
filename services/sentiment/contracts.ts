import { z } from 'zod'

const id = z.string().trim().min(1).max(160)
const tenant = z.string().trim().min(1).max(160)

export const feedbackSourceSchema = z.object({
  sourceId: id,
  organizationId: tenant,
  type: z.enum(['REVIEW', 'SURVEY', 'WORKSHOP', 'BRAND_PROJECT', 'INTERNAL_EVALUATION']),
  reference: id,
  usagePolicy: z.object({ purpose: id, consentRequired: z.boolean(), retentionDays: z.number().int().positive().max(36500) }),
  collectedAt: z.string().datetime({ offset: true }),
})
export type FeedbackSource = z.infer<typeof feedbackSourceSchema>

export const feedbackItemSchema = z.object({
  itemId: id,
  sourceId: id,
  organizationId: tenant,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  contentRef: id,
  languageHint: z.enum(['EN', 'VI', 'UNKNOWN']).optional(),
  redacted: z.boolean(),
})
export type FeedbackItem = z.infer<typeof feedbackItemSchema>

export const languageResultSchema = z.object({ language: z.enum(['EN', 'VI', 'OTHER', 'UNKNOWN']), confidence: z.number().min(0).max(1), extractionVersion: id })
export type LanguageResult = z.infer<typeof languageResultSchema>

export const sentimentEvidenceStatusSchema = z.enum(['VERIFIED', 'LOW_CONFIDENCE', 'NOT_ENOUGH_EVIDENCE', 'NOT_CONFIGURED', 'BLOCKED', 'INVALIDATED'])
export type SentimentEvidenceStatus = z.infer<typeof sentimentEvidenceStatusSchema>

export const sentimentResultSchema = z.object({
  label: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED', 'UNKNOWN']),
  score: z.number().min(-1).max(1),
  confidence: z.number().min(0).max(1),
  status: sentimentEvidenceStatusSchema,
  provider: id,
  modelVersion: id,
})
export type SentimentResult = z.infer<typeof sentimentResultSchema>

export const aspectSentimentSchema = z.object({
  aspectId: id,
  sentiment: sentimentResultSchema,
  evidenceRef: id.optional(),
})
export type AspectSentiment = z.infer<typeof aspectSentimentSchema>

export const perceptionSignalSchema = z.object({ signalId: id, label: id, value: z.number().min(0).max(1), confidence: z.number().min(0).max(1), status: sentimentEvidenceStatusSchema })
export type PerceptionSignal = z.infer<typeof perceptionSignalSchema>

export const olfactoryDescriptorSignalSchema = z.object({ descriptorId: id, intensity: z.number().min(0).max(1), confidence: z.number().min(0).max(1), status: sentimentEvidenceStatusSchema })
export type OlfactoryDescriptorSignal = z.infer<typeof olfactoryDescriptorSignalSchema>

export const consumerPreferenceVectorSchema = z.object({
  vectorId: id,
  organizationId: tenant,
  sourceScope: id,
  vocabularyVersion: id,
  dimensions: z.record(z.string(), z.number().min(-1).max(1)),
  evidenceCount: z.number().int().nonnegative(),
  status: sentimentEvidenceStatusSchema,
  aggregationVersion: id,
})
export type ConsumerPreferenceVector = z.infer<typeof consumerPreferenceVectorSchema>
