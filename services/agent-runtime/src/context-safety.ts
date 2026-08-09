import { createHash } from 'node:crypto'
import { z } from 'zod'
import { AGENT_RUNTIME_LIMITS } from '../contracts.js'
import { PlatformError } from '../../platform/src/service.js'

const printableText = z.string().min(1).max(32_000)
const citationSchema = z.object({
  sourceType: z.string().trim().min(1).max(80),
  sourceId: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(240).optional(),
  version: z.string().trim().min(1).max(80).optional(),
}).strict()

export const agentContextCandidateSchema = z.object({
  organizationId: z.string().trim().min(1).max(160),
  sourceType: z.string().trim().min(1).max(80),
  sourceId: z.string().trim().min(1).max(160),
  excerpt: printableText,
  citation: citationSchema.optional(),
  trusted: z.boolean().default(false),
}).strict()
export type AgentContextCandidate = z.infer<typeof agentContextCandidateSchema>

export type SafeAgentContextItem = Readonly<{
  sourceType: string
  sourceId: string
  excerpt: string
  citation?: string
  trust: 'TRUSTED' | 'UNTRUSTED' | 'WITHHELD'
  flags: readonly string[]
}>

export type SafeAgentContext = Readonly<{
  items: readonly SafeAgentContextItem[]
  byteLength: number
  hash: string
  withheldCount: number
}>

const INJECTION_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['instruction_override', /\b(ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|system|developer)\s+(?:instructions?|rules?|messages?)\b/i],
  ['system_prompt_reference', /\b(?:system|developer)\s+(?:prompt|message|instruction)s?\b/i],
  ['tool_call_reference', /(?:<\/?tool|function[_ -]?call|tool[_ -]?call|invoke[_ -]?tool)/i],
  ['script_or_html', /<\s*script\b|javascript\s*:/i],
  ['shell_or_sql_instruction', /\b(?:powershell|cmd(?:\.exe)?|bash|curl|wget|drop\s+table|select\s+.+\s+from)\b/i],
]

const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(?:api[_ -]?key|password|secret|access[_ -]?token|refresh[_ -]?token)\s*[:=]/i,
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/,
]

function normalizeExcerpt(value: string) {
  return value
    .replace(/[\p{Cc}]/gu, (character) => character === '\r' || character === '\n' ? character : ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function flagsFor(value: string) {
  // Treat common token separators as whitespace so a persisted reference-like
  // string cannot evade safety checks with `ignore-previous-instructions`.
  const detectionValue = value.replace(/[_-]+/g, ' ')
  const flags = INJECTION_PATTERNS.filter(([, pattern]) => pattern.test(detectionValue)).map(([flag]) => flag)
  if (SECRET_PATTERNS.some((pattern) => pattern.test(detectionValue))) flags.push('possible_secret')
  return flags
}

/**
 * Classifies text before it reaches any durable agent record. Callers retain
 * only a hash/reference for unsafe text; the original value is never returned
 * from this boundary.
 */
export function inspectAgentTextSafety(value: string) {
  const normalized = normalizeExcerpt(value)
  const flags = Object.freeze(flagsFor(normalized))
  return Object.freeze({ unsafe: flags.length > 0, flags })
}

export function redactedAgentTextReference(value: string) {
  return Object.freeze({
    redaction: 'UNSAFE_TEXT_WITHHELD' as const,
    contentHash: createHash('sha256').update(value).digest('hex'),
  })
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  return JSON.stringify(value)
}

export function agentContextHash(context: Pick<SafeAgentContext, 'items'>) {
  return createHash('sha256').update(stableJson(context.items)).digest('hex')
}

/**
 * Context is evidence, never an instruction channel. Untrusted text that looks
 * executable, credential-bearing, or instruction-like is represented only by
 * a safe withheld marker plus its citation metadata.
 */
export function buildBoundedAgentContext(organizationId: string, rawItems: readonly unknown[], options: Readonly<{ maxBytes?: number; maxItems?: number; maxExcerptBytes?: number }> = {}): SafeAgentContext {
  const maxBytes = options.maxBytes ?? AGENT_RUNTIME_LIMITS.maxContextBytes
  const maxItems = options.maxItems ?? AGENT_RUNTIME_LIMITS.maxContextItems
  const maxExcerptBytes = options.maxExcerptBytes ?? 2_000
  if (!Number.isInteger(maxBytes) || maxBytes < 512 || maxBytes > AGENT_RUNTIME_LIMITS.maxContextBytes) throw new PlatformError('AGENT_CONTEXT_LIMIT_INVALID', 'The agent context limit is invalid.', 422)
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > AGENT_RUNTIME_LIMITS.maxContextItems) throw new PlatformError('AGENT_CONTEXT_LIMIT_INVALID', 'The agent context item limit is invalid.', 422)
  if (!Number.isInteger(maxExcerptBytes) || maxExcerptBytes < 128 || maxExcerptBytes > 8_000) throw new PlatformError('AGENT_CONTEXT_LIMIT_INVALID', 'The agent context excerpt limit is invalid.', 422)
  if (rawItems.length > maxItems) throw new PlatformError('AGENT_CONTEXT_TOO_LARGE', 'The requested agent context contains too many sources.', 422)

  const items: SafeAgentContextItem[] = []
  let byteLength = 0
  let withheldCount = 0
  for (const raw of rawItems) {
    const candidate = agentContextCandidateSchema.safeParse(raw)
    if (!candidate.success) throw new PlatformError('AGENT_CONTEXT_INVALID', 'An agent evidence item is invalid.', 422)
    if (candidate.data.organizationId !== organizationId) throw new PlatformError('TENANT_ACCESS_DENIED', 'Agent evidence must belong to the active workspace.', 403)
    const normalized = normalizeExcerpt(candidate.data.excerpt)
    const flags = inspectAgentTextSafety(normalized).flags
    const citation = candidate.data.citation ? [candidate.data.citation.sourceType, candidate.data.citation.sourceId, candidate.data.citation.version].filter(Boolean).join(':') : undefined
    const unsafe = flags.length > 0
    const excerpt = unsafe
      ? '[Untrusted evidence content withheld. Review the cited source directly.]'
      : Buffer.from(normalized, 'utf8').subarray(0, maxExcerptBytes).toString('utf8').trim()
    const item: SafeAgentContextItem = Object.freeze({
      sourceType: candidate.data.sourceType,
      sourceId: candidate.data.sourceId,
      excerpt,
      ...(citation ? { citation } : {}),
      trust: unsafe ? 'WITHHELD' : candidate.data.trusted ? 'TRUSTED' : 'UNTRUSTED',
      flags: Object.freeze(flags),
    })
    const itemBytes = Buffer.byteLength(JSON.stringify(item), 'utf8')
    if (byteLength + itemBytes > maxBytes) throw new PlatformError('AGENT_CONTEXT_TOO_LARGE', 'The requested agent context exceeds its approved bound.', 422)
    byteLength += itemBytes
    if (unsafe) withheldCount += 1
    items.push(item)
  }
  const frozenItems = Object.freeze(items)
  return Object.freeze({ items: frozenItems, byteLength, hash: agentContextHash({ items: frozenItems }), withheldCount })
}
