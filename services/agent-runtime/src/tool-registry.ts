import { z } from 'zod'
import { PlatformError } from '../../platform/src/service.js'

export const formulaAgentToolKeySchema = z.enum([
  'material.search',
  'material.get',
  'inventory.visibility',
  'compliance.status',
  'evidence.search',
  'scientific.identity',
  'scientific.odorPrediction',
  'scientific.molecularSimilarity',
  'scientific.odorSimilarity',
  'scientific.explain',
  'consumer.preference',
])

export type FormulaAgentToolKey = z.infer<typeof formulaAgentToolKeySchema>
export type ToolPolicy = Readonly<{ permission: string; timeoutMs: number; maxOutputBytes: number; destructive: false }>

export const FORMULA_AGENT_TOOL_POLICIES: Readonly<Record<FormulaAgentToolKey, ToolPolicy>> = {
  'material.search': { permission: 'materials.view', timeoutMs: 2_000, maxOutputBytes: 16_384, destructive: false },
  'material.get': { permission: 'materials.view', timeoutMs: 2_000, maxOutputBytes: 16_384, destructive: false },
  'inventory.visibility': { permission: 'inventory.view', timeoutMs: 2_000, maxOutputBytes: 12_288, destructive: false },
  'compliance.status': { permission: 'materials.view', timeoutMs: 2_000, maxOutputBytes: 8_192, destructive: false },
  'evidence.search': { permission: 'rag.view', timeoutMs: 3_000, maxOutputBytes: 16_384, destructive: false },
  'scientific.identity': { permission: 'scientific_ai.use', timeoutMs: 3_000, maxOutputBytes: 12_288, destructive: false },
  'scientific.odorPrediction': { permission: 'scientific_ai.use', timeoutMs: 3_000, maxOutputBytes: 12_288, destructive: false },
  'scientific.molecularSimilarity': { permission: 'scientific_ai.similarity', timeoutMs: 3_000, maxOutputBytes: 12_288, destructive: false },
  'scientific.odorSimilarity': { permission: 'scientific_ai.similarity', timeoutMs: 3_000, maxOutputBytes: 12_288, destructive: false },
  'scientific.explain': { permission: 'scientific_ai.use', timeoutMs: 3_000, maxOutputBytes: 12_288, destructive: false },
  'consumer.preference': { permission: 'sentiment.view', timeoutMs: 2_000, maxOutputBytes: 8_192, destructive: false },
}

/** Fail closed before any adapter, SQL query, URL fetch, or model call. */
export function formulaAgentToolPolicy(value: unknown): ToolPolicy {
  const parsed = formulaAgentToolKeySchema.safeParse(value)
  if (!parsed.success) throw new PlatformError('AGENT_TOOL_DENIED', 'This research tool is not available.', 403)
  return FORMULA_AGENT_TOOL_POLICIES[parsed.data]
}

export function boundedToolPayload<T>(value: T, maxBytes: number): T {
  const encoded = JSON.stringify(value)
  if (Buffer.byteLength(encoded, 'utf8') > maxBytes) throw new PlatformError('AGENT_TOOL_OUTPUT_TOO_LARGE', 'The research result exceeded its approved output limit.', 422)
  return value
}
