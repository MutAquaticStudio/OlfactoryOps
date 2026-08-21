import { createHash } from 'node:crypto'
import { z } from 'zod'
import { AGENT_RUNTIME_LIMITS, type ToolDefinition, validateToolDefinition } from '../contracts.js'
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

export type AgentToolExecutionContext = Readonly<{
  organizationId: string
  actorUserId: string
  runId: string
  stepId: string
  correlationId: string
  /** A permission callback is intentionally the only authorization surface. */
  requirePermission: (permission: string) => Promise<void>
  /** Bounded, citation-backed context only. No database or provider handle. */
  context: ReadonlyArray<Readonly<{ sourceType: string; sourceId: string; excerpt: string; citation?: string }>>
  signal: AbortSignal
}>

export type AgentToolAdapter<Input = unknown, Output = unknown> = Readonly<{
  definition: ToolDefinition
  inputSchema: z.ZodType<Input>
  outputSchema: z.ZodType<Output>
  maxInputBytes: number
  maxOutputBytes: number
  execute: (context: AgentToolExecutionContext, input: Input) => Promise<Output>
}>

export type CompiledAgentToolRegistry = Readonly<{
  get: (toolKey: string, version?: string) => AgentToolAdapter
  has: (toolKey: string, version?: string) => boolean
  invoke: (context: Omit<AgentToolExecutionContext, 'signal'>, input: Readonly<{ toolKey: string; version?: string; value: unknown; allowedToolKeys: readonly string[] }>) => Promise<Readonly<{ toolKey: string; version: string; output: unknown; outputHash: string; metadata: { outputBytes: number } }>>
  manifest: () => ReadonlyArray<Readonly<{ key: string; version: string; mode: ToolDefinition['mode'] }>>
}>

const toolIdentity = (name: string, version: string) => `${name}@${version}`
const hashPayload = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const payloadBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8')

function asPlatformError(error: unknown, fallbackCode: string, fallbackMessage: string) {
  return error instanceof PlatformError ? error : new PlatformError(fallbackCode, fallbackMessage, 422)
}

async function invokeWithinTimeout<Output>(timeoutMs: number, action: (signal: AbortSignal) => Promise<Output>) {
  const controller = new AbortController()
  let timeout: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      action(controller.signal),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort()
          reject(new PlatformError('AGENT_TOOL_TIMEOUT', 'The approved tool did not complete before its deadline.', 504))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

/**
 * Compile server-owned adapters once at boot. Tool executors receive no Prisma
 * client, arbitrary URL, shell, or provider handle; they can only use their
 * explicit domain-service closure and the scoped execution context.
 */
export function compileAgentToolRegistry(adapters: readonly AgentToolAdapter[]): CompiledAgentToolRegistry {
  const byIdentity = new Map<string, AgentToolAdapter>()
  const newestByKey = new Map<string, AgentToolAdapter>()
  for (const adapter of adapters) {
    const definition = validateToolDefinition(adapter.definition)
    if (!Number.isInteger(adapter.maxInputBytes) || adapter.maxInputBytes < 1 || adapter.maxInputBytes > AGENT_RUNTIME_LIMITS.maxContextBytes) {
      throw new Error(`Invalid maximum input size for tool ${definition.tool.name}.`)
    }
    if (!Number.isInteger(adapter.maxOutputBytes) || adapter.maxOutputBytes < 1 || adapter.maxOutputBytes > AGENT_RUNTIME_LIMITS.maxArtifactBytes) {
      throw new Error(`Invalid maximum output size for tool ${definition.tool.name}.`)
    }
    const identity = toolIdentity(definition.tool.name, definition.tool.version)
    if (byIdentity.has(identity)) throw new Error(`Duplicate agent tool adapter: ${identity}.`)
    byIdentity.set(identity, adapter)
    const current = newestByKey.get(definition.tool.name)
    if (!current || current.definition.tool.version.localeCompare(definition.tool.version, undefined, { numeric: true }) < 0) newestByKey.set(definition.tool.name, adapter)
  }

  const get = (toolKey: string, version?: string): AgentToolAdapter => {
    const adapter = version ? byIdentity.get(toolIdentity(toolKey, version)) : newestByKey.get(toolKey)
    if (!adapter) throw new PlatformError('AGENT_TOOL_DENIED', 'This agent tool is not registered for the selected workflow.', 403)
    return adapter
  }

  return Object.freeze({
    get,
    has: (toolKey: string, version?: string) => version ? byIdentity.has(toolIdentity(toolKey, version)) : newestByKey.has(toolKey),
    manifest: () => [...byIdentity.values()].map((adapter) => ({ key: adapter.definition.tool.name, version: adapter.definition.tool.version, mode: adapter.definition.mode })),
    invoke: async (context, input) => {
      const adapter = get(input.toolKey, input.version)
      const definition = adapter.definition
      if (!input.allowedToolKeys.includes(definition.tool.name)) {
        throw new PlatformError('AGENT_TOOL_POLICY_DENIED', 'The selected agent policy does not allow this tool.', 403)
      }
      const inputSize = payloadBytes(input.value)
      if (inputSize > adapter.maxInputBytes) throw new PlatformError('AGENT_TOOL_INPUT_TOO_LARGE', 'The requested tool input exceeds its approved bound.', 422)
      const parsedInput = adapter.inputSchema.safeParse(input.value)
      if (!parsedInput.success) throw new PlatformError('AGENT_TOOL_INPUT_INVALID', 'The requested tool input is invalid.', 422)
      for (const permission of definition.permissions.filter((item) => item.required)) await context.requirePermission(permission.permissionKey)
      let output: unknown
      try {
        output = await invokeWithinTimeout(definition.timeout.timeoutMs, (signal) => adapter.execute({ ...context, signal }, parsedInput.data))
      } catch (error) {
        throw asPlatformError(error, 'AGENT_TOOL_EXECUTION_FAILED', 'The approved tool could not complete.')
      }
      const parsedOutput = adapter.outputSchema.safeParse(output)
      if (!parsedOutput.success) throw new PlatformError('AGENT_TOOL_OUTPUT_INVALID', 'The approved tool returned an invalid result.', 502)
      const outputBytes = payloadBytes(parsedOutput.data)
      if (outputBytes > adapter.maxOutputBytes) {
        throw new PlatformError('AGENT_TOOL_OUTPUT_TOO_LARGE', 'The research result exceeded its approved output limit.', 422)
      }
      boundedToolPayload(parsedOutput.data, AGENT_RUNTIME_LIMITS.maxArtifactBytes)
      return {
        toolKey: definition.tool.name,
        version: definition.tool.version,
        output: parsedOutput.data,
        outputHash: hashPayload(parsedOutput.data),
        metadata: { outputBytes },
      }
    },
  })
}
