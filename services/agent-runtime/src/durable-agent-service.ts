import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'
import {
  agentDefinitionCreateRequestSchema,
  agentDefinitionVersionCreateRequestSchema,
  agentEvaluationCreateRequestSchema,
  agentPolicyVersionCreateRequestSchema,
} from '../../../packages/contracts/src/agent-runtime.js'
import { agentConfirmationDecisionSchema, agentRunRequestSchema } from '../../../packages/contracts/src/formula-intelligence.js'
import { PlatformError, PlatformService } from '../../platform/src/service.js'
import type { PlatformContext } from '../../platform/src/types.js'
import { AGENT_RUNTIME_LIMITS } from '../contracts.js'
import { BUILTIN_AGENT_CATALOG, BUILTIN_AGENT_TOOLS, builtinAgentTemplates, type BuiltinAgentKey } from './builtin-agent-catalog.js'
import { builtinAgentToolAdapters, DefaultAgentDomainTools, type AgentDomainTools } from './domain-tools.js'
import { reconcileAgentEventReplay } from './event-replay.js'
import { summarizeAgentObservability } from './observability.js'
import { normalizeAgentProviderResult, NotConfiguredAgentProviderGateway, NotConfiguredFormulaLlmGateway, type AgentProviderGateway, type FormulaLlmGateway } from './provider-gateway.js'
import { inspectAgentTextSafety, redactedAgentTextReference } from './context-safety.js'
import { boundedToolPayload, compileAgentToolRegistry, formulaAgentToolPolicy, type CompiledAgentToolRegistry } from './tool-registry.js'

type Transaction = Prisma.TransactionClient
type JsonRecord = Record<string, unknown>
type IdempotencyRow = { requestHash: string; response: unknown }
type ConfirmationRow = { id: string; status: string; actionKey: string; expiresAt: Date; resultRef: string | null; decidedBy: string | null }
const identifier = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '')}`
const digest = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const bytesToBase64Url = (value: Uint8Array) => {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const confirmationAction = 'RESEARCH_REVIEW'
const p9Protocol = 'agent-runtime/v1'
const p9SchemaVersion = '1.0.0'
const p9StartSchema = z.object({ definitionKey: z.enum(['formula-research', 'material-intelligence', 'inventory-assistant', 'sensory-analysis', 'production-assistant', 'commerce-assistant', 'qa-traceability']), input: z.record(z.string(), z.unknown()).default({}) }).strict()
const p9ConfirmSchema = z.object({ decision: z.enum(['APPROVE', 'REJECT']), rationale: z.string().trim().max(1_000).optional() }).strict()
const forbiddenPayloadKeys = new Set([
  'prompt', 'systemprompt', 'systemmessage', 'developermessage', 'instruction', 'messages', 'reasoning', 'chainofthought',
  'rawresponse', 'rawprovidererror', 'rawproviderpayload', 'rawcompletion', 'completion',
  'apikey', 'accesskey', 'authorization', 'secret', 'clientsecret', 'token', 'accesstoken', 'refreshtoken', 'sessiontoken',
  'password', 'credential', 'privatekey', 'cookie', 'bearer',
])
const safeRunInputKeys = new Set(['query', 'materialId', 'designProjectId', 'candidateId', 'formulaProjectId', 'formulaVersionId', 'trialId', 'productionOrderId', 'finishedGoodLotId'])
const safeReference = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,159}$/
const terminalConfirmationEffectCodes = new Set([
  'DESIGN_CANDIDATE_NOT_FOUND',
  'DESIGN_CANDIDATE_FORMULA_PROJECT_MISMATCH',
  'FORMULA_PROJECT_NOT_FOUND',
  'FORMULA_PROJECT_ARCHIVED',
  'FORMULA_MATH_INVALID',
  'FORMULA_MATERIAL_NOT_FOUND',
  'FORMULA_MATERIAL_INELIGIBLE',
])

type SafePayloadProjection = Readonly<{ value: unknown; encoded: string; redacted: boolean }>

function projectSafeAgentRuntimePayload(value: unknown, maxBytes = AGENT_RUNTIME_LIMITS.maxArtifactBytes): SafePayloadProjection {
  let redacted = false
  const inspect = (item: unknown, depth: number): unknown => {
    if (depth > 8) throw new PlatformError('AGENT_PAYLOAD_INVALID', 'Agent payload nesting is too deep.', 422)
    if (item === null || typeof item === 'boolean') return item
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new PlatformError('AGENT_PAYLOAD_INVALID', 'Agent payload numbers must be finite.', 422)
      return item
    }
    if (typeof item === 'string') {
      if (inspectAgentTextSafety(item).unsafe) {
        redacted = true
        return redactedAgentTextReference(item)
      }
      return item
    }
    if (Array.isArray(item)) return item.map((child) => inspect(child, depth + 1))
    if (!item || typeof item !== 'object') throw new PlatformError('AGENT_PAYLOAD_INVALID', 'Agent payloads must contain JSON values only.', 422)
    const record: JsonRecord = {}
    for (const [key, child] of Object.entries(item as JsonRecord)) {
      if (forbiddenPayloadKeys.has(key.replaceAll(/[^a-z]/gi, '').toLowerCase())) {
        throw new PlatformError('AGENT_PAYLOAD_UNSAFE', 'Raw prompts, reasoning, provider errors, and credentials cannot be persisted.', 422)
      }
      record[key] = inspect(child, depth + 1)
    }
    return record
  }
  let encoded: string
  try { encoded = JSON.stringify(inspect(value, 0)) } catch { throw new PlatformError('AGENT_PAYLOAD_INVALID', 'Agent payloads must be serializable JSON.', 422) }
  if (Buffer.byteLength(encoded, 'utf8') > maxBytes) throw new PlatformError('AGENT_PAYLOAD_TOO_LARGE', `The agent payload exceeds ${maxBytes === AGENT_RUNTIME_LIMITS.maxArtifactBytes ? '64 KiB' : 'its approved persistence bound'}.`, 422)
  return Object.freeze({ value: JSON.parse(encoded), encoded, redacted })
}

export function assertSafeAgentRuntimePayload(value: unknown, maxBytes = AGENT_RUNTIME_LIMITS.maxArtifactBytes) {
  const projected = projectSafeAgentRuntimePayload(value, maxBytes)
  if (projected.redacted) throw new PlatformError('AGENT_PAYLOAD_UNSAFE', 'Prompt-like or credential-like text cannot be persisted in an agent payload.', 422)
  return projected.encoded
}

/** Converts untrusted tool/provider output into a hash-only redacted projection. */
export function redactUnsafeAgentRuntimePayload(value: unknown, maxBytes = AGENT_RUNTIME_LIMITS.maxArtifactBytes) {
  return projectSafeAgentRuntimePayload(value, maxBytes).value
}

/** Run inputs are durable routing references, never free-form prompts or source prose. */
export function sanitizeAgentRunInput(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PlatformError('AGENT_INPUT_INVALID', 'Agent run input must be a reference object.', 422)
  const input: JsonRecord = {}
  for (const [key, raw] of Object.entries(value as JsonRecord)) {
    if (!safeRunInputKeys.has(key) || typeof raw !== 'string' || !safeReference.test(raw) || inspectAgentTextSafety(raw).unsafe) {
      throw new PlatformError('AGENT_INPUT_REFERENCE_REQUIRED', 'Agent run input may contain only bounded server-safe references.', 422)
    }
    input[key] = raw
  }
  assertSafeAgentRuntimePayload(input, 8 * 1024)
  return Object.freeze(input)
}

const deterministicId = (prefix: string, organizationId: string, key: string) => `${prefix}_${digest(`${organizationId}:${key}`).slice(0, 32)}`

/**
 * The durable runtime owns only read-only research. Confirmation completes a
 * research run; it never saves a formula, reserves inventory, or bypasses the
 * FormulaService approval path.
 */
export class DurableAgentService {
  private readonly domainTools: AgentDomainTools
  private readonly toolRegistry: CompiledAgentToolRegistry

  constructor(
    private readonly client: PrismaClient,
    private readonly platform: PlatformService,
    private readonly gateway: FormulaLlmGateway = new NotConfiguredFormulaLlmGateway(),
    private readonly agentGateway: AgentProviderGateway = new NotConfiguredAgentProviderGateway(),
    domainTools?: AgentDomainTools,
    toolRegistry?: CompiledAgentToolRegistry,
  ) {
    this.domainTools = domainTools ?? new DefaultAgentDomainTools(client, platform)
    this.toolRegistry = toolRegistry ?? compileAgentToolRegistry(builtinAgentToolAdapters(this.domainTools))
  }

  private async scoped<T>(context: PlatformContext, action: (tx: Transaction) => Promise<T>) {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true), set_config('app.user_id', ${context.userId}, true)`
      return action(tx)
    })
  }

  private async audit(tx: Transaction, context: PlatformContext, action: string, outcome: 'allowed' | 'blocked', subjectId: string, payload: unknown) {
    await tx.$executeRaw`INSERT INTO v2_audit_events (id, organization_id, actor_user_id, action, outcome, subject_type, subject_id, correlation_id, payload_hash)
      VALUES (${identifier('audit')}, ${context.organizationId}, ${context.userId}, ${action}, ${outcome}, 'agent_run', ${subjectId}, ${identifier('corr')}, ${digest(payload)})`
  }

  private async idempotent<T extends JsonRecord>(context: PlatformContext, route: string, key: string | undefined, request: unknown, action: (tx: Transaction) => Promise<T>) {
    if (!key || key.length < 12 || key.length > 200) throw new PlatformError('IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key for this operation.', 428)
    const requestHash = digest(request)
    return this.scoped(context, async (tx) => {
      const previous = await tx.$queryRaw<IdempotencyRow[]>`SELECT request_hash AS "requestHash", response FROM v2_operation_idempotency WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}`
      if (previous[0]) {
        if (previous[0].requestHash !== requestHash) throw new PlatformError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request.', 409)
        if (!previous[0].response) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
        return previous[0].response as T
      }
      const claim = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO v2_operation_idempotency (id, organization_id, actor_user_id, route, idempotency_key, request_hash) VALUES (${identifier('idem')}, ${context.organizationId}, ${context.userId}, ${route}, ${key}, ${requestHash}) ON CONFLICT (organization_id, actor_user_id, route, idempotency_key) DO NOTHING RETURNING id`
      if (!claim[0]) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
      const result = await action(tx)
      await tx.$executeRaw`UPDATE v2_operation_idempotency SET response = ${JSON.stringify(result)}::jsonb WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}`
      return result
    })
  }

  /** Claims a durable operation without holding its transaction over external work. */
  private async claimOperation<T extends JsonRecord>(tx: Transaction, context: PlatformContext, route: string, key: string | undefined, request: unknown): Promise<T | undefined> {
    if (!key || key.length < 12 || key.length > 200) throw new PlatformError('IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key for this operation.', 428)
    const requestHash = digest(request)
    const previous = await tx.$queryRaw<IdempotencyRow[]>`SELECT request_hash AS "requestHash", response FROM v2_operation_idempotency WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key} FOR UPDATE`
    if (previous[0]) {
      if (previous[0].requestHash !== requestHash) throw new PlatformError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request.', 409)
      if (previous[0].response) return previous[0].response as T
      return undefined
    }
    const claim = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO v2_operation_idempotency (id, organization_id, actor_user_id, route, idempotency_key, request_hash) VALUES (${identifier('idem')}, ${context.organizationId}, ${context.userId}, ${route}, ${key}, ${requestHash}) ON CONFLICT (organization_id, actor_user_id, route, idempotency_key) DO NOTHING RETURNING id`
    if (!claim[0]) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
    return undefined
  }

  private async completeOperation(tx: Transaction, context: PlatformContext, route: string, key: string | undefined, result: JsonRecord) {
    if (!key) return
    await tx.$executeRaw`UPDATE v2_operation_idempotency SET response = ${JSON.stringify(result)}::jsonb WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key} AND response IS NULL`
  }

  private async abandonOperation(tx: Transaction, context: PlatformContext, route: string, key: string | undefined) {
    if (!key) return
    await tx.$executeRaw`DELETE FROM v2_operation_idempotency WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key} AND response IS NULL`
  }

  /**
   * Serializes quota decisions at tenant and actor scope, then leaves a durable
   * reservation attached to the run. Counting alone is not a concurrency
   * control; both advisory locks are held until the surrounding transaction
   * commits with the new run and reservation.
   */
  private async reserveRunQuota(tx: Transaction, context: PlatformContext, runId: string, limits: Readonly<{ maxRunsPerActor: number; maxRunsPerTenant: number }>) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-quota:tenant:${context.organizationId}`}), hashtext('agent-runtime-tenant'))`
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-quota:actor:${context.organizationId}:${context.userId}`}), hashtext('agent-runtime-actor'))`
    const activeActor = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND creator_user_id = ${context.userId} AND protocol_version = ${p9Protocol} AND status IN ('QUEUED','RUNNING','WAITING_FOR_CONFIRMATION')`
    if (Number(activeActor[0]?.count ?? 0) >= limits.maxRunsPerActor) throw new PlatformError('AGENT_RUN_QUOTA_EXCEEDED', 'The active run quota has been reached.', 429)
    const activeTenant = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND protocol_version = ${p9Protocol} AND status IN ('QUEUED','RUNNING','WAITING_FOR_CONFIRMATION')`
    if (Number(activeTenant[0]?.count ?? 0) >= limits.maxRunsPerTenant) throw new PlatformError('AGENT_TENANT_RUN_QUOTA_EXCEEDED', 'The workspace active run quota has been reached.', 429)
    await tx.$executeRaw`INSERT INTO v2_agent_run_quota_reservations (id, organization_id, actor_user_id, run_id, status) VALUES (${identifier('agent_quota')}, ${context.organizationId}, ${context.userId}, ${runId}, 'ACTIVE') ON CONFLICT (organization_id, run_id) DO UPDATE SET status = 'ACTIVE', released_at = NULL WHERE v2_agent_run_quota_reservations.status = 'RELEASED'`
  }

  private async releaseRunQuota(tx: Transaction, context: PlatformContext, runId: string) {
    await tx.$executeRaw`UPDATE v2_agent_run_quota_reservations SET status = 'RELEASED', released_at = COALESCE(released_at, now()) WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND status = 'ACTIVE'`
  }

  private async assertLease(tx: Transaction, context: PlatformContext, runId: string, leaseHash: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId} AND lease_token_hash = ${leaseHash} AND lease_expires_at > now() FOR UPDATE`
    if (!rows[0]) throw new PlatformError('AGENT_LEASE_STALE', 'The research job lease is no longer valid.', 409)
  }

  private async event(tx: Transaction, context: PlatformContext, runId: string, type: string, payload: JsonRecord, leaseHash?: string) {
    const safePayload = redactUnsafeAgentRuntimePayload(payload, AGENT_RUNTIME_LIMITS.maxEventPayloadBytes) as JsonRecord
    if (leaseHash) await this.assertLease(tx, context, runId, leaseHash)
    const sequence = await tx.$queryRaw<Array<{ sequence: number; protocolVersion: string; correlationId: string }>>`UPDATE v2_agent_runs SET next_sequence = next_sequence + 1, version = version + 1, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId} RETURNING next_sequence - 1 AS sequence, protocol_version AS "protocolVersion", correlation_id AS "correlationId"`
    if (!sequence[0]) throw new PlatformError('AGENT_RUN_NOT_FOUND', 'The research run is not available.', 404)
    await tx.$executeRaw`INSERT INTO v2_agent_events (id, organization_id, run_id, sequence, event_type, payload, protocol_version, event_schema_version, correlation_id) VALUES (${identifier('agent_event')}, ${context.organizationId}, ${runId}, ${sequence[0].sequence}, ${type}, ${JSON.stringify(safePayload)}::jsonb, ${sequence[0].protocolVersion}, ${sequence[0].protocolVersion === p9Protocol ? p9SchemaVersion : 'phase6/v1'}, ${sequence[0].correlationId})`
  }

  /** Server-owned, transactionally idempotent catalog bootstrap for one tenant. */
  async bootstrap(context: PlatformContext) {
    return this.scoped(context, async (tx) => {
      for (const [toolKey, tool] of Object.entries(BUILTIN_AGENT_TOOLS)) {
        const toolId = deterministicId('agent_tooldef', context.organizationId, toolKey)
        const versionId = deterministicId('agent_toolver', context.organizationId, `${toolKey}@${tool.tool.version}`)
        const versionHash = digest(tool)
        await tx.$executeRaw`INSERT INTO v2_agent_tools (id, organization_id, tool_key, display_name, source_kind, bootstrap_key, created_by)
          VALUES (${toolId}, ${context.organizationId}, ${toolKey}, ${tool.description.slice(0, 200)}, 'SYSTEM', ${`tool-${digest(toolKey).slice(0, 24)}`}, ${context.userId})
          ON CONFLICT (organization_id, tool_key) DO NOTHING`
        await tx.$executeRaw`INSERT INTO v2_agent_tool_versions (id, organization_id, tool_id, version_number, mode, adapter_key, required_permissions, input_schema, output_schema, timeout_ms, retry_policy, confirmation_policy, content_hash, status, published_by, published_at, created_by)
          VALUES (${versionId}, ${context.organizationId}, ${toolId}, 1, ${tool.mode}, ${toolKey}, ${JSON.stringify(tool.permissions.filter((permission) => permission.required).map((permission) => permission.permissionKey))}::jsonb, ${JSON.stringify(tool.input)}::jsonb, ${JSON.stringify(tool.output)}::jsonb, ${tool.timeout.timeoutMs}, ${JSON.stringify({ maxAttempts: tool.retry.maxAttempts, backoffMs: tool.retry.backoffMs, retryableCodes: tool.retry.retryableErrors })}::jsonb, ${JSON.stringify(tool.confirmation)}::jsonb, ${versionHash}, 'PUBLISHED', ${context.userId}, now(), ${context.userId})
          ON CONFLICT (organization_id, tool_id, version_number) DO NOTHING`
        await tx.$executeRaw`UPDATE v2_agent_tools SET active_version_id = ${versionId}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${toolId} AND active_version_id IS NULL`
      }

      for (const template of builtinAgentTemplates()) {
        const definitionId = deterministicId('agent_def', context.organizationId, template.key)
        const definitionVersionId = deterministicId('agent_defver', context.organizationId, `${template.key}@${template.version}`)
        const policyId = deterministicId('agent_policy', context.organizationId, template.key)
        const policyVersionId = deterministicId('agent_policyver', context.organizationId, `${template.key}@${template.policyVersion}`)
        const workflowId = deterministicId('agent_workflow', context.organizationId, template.workflow.workflowKey)
        const workflowVersionId = deterministicId('agent_workflowver', context.organizationId, `${template.workflow.workflowKey}@${template.version}`)
        await tx.$executeRaw`INSERT INTO v2_agent_definitions (id, organization_id, agent_key, display_name, description, source_kind, bootstrap_key, created_by)
          VALUES (${definitionId}, ${context.organizationId}, ${template.key}, ${template.displayName}, ${template.description}, 'SYSTEM', ${template.key}, ${context.userId}) ON CONFLICT (organization_id, agent_key) DO NOTHING`
        await tx.$executeRaw`INSERT INTO v2_agent_definition_versions (id, organization_id, agent_definition_id, version_number, protocol_version, instruction_template_key, instruction_template_version, instruction_template_hash, input_schema, output_schema, model_policy, content_hash, status, published_by, published_at, created_by)
          VALUES (${definitionVersionId}, ${context.organizationId}, ${definitionId}, 1, ${p9Protocol}, ${`builtin.${template.key}`}, '1.0.0', ${digest(`builtin.${template.key}:1`)}, ${JSON.stringify({ schemaVersion: p9SchemaVersion, jsonSchema: { type: 'object', additionalProperties: true } })}::jsonb, ${JSON.stringify({ schemaVersion: p9SchemaVersion, jsonSchema: { type: 'object' } })}::jsonb, ${JSON.stringify({ providerAllowlist: [], modelAllowlist: [], maxInputTokens: 0, maxOutputTokens: 0 })}::jsonb, ${digest({ template: template.key, version: template.version })}, 'PUBLISHED', ${context.userId}, now(), ${context.userId}) ON CONFLICT (organization_id, agent_definition_id, version_number) DO NOTHING`
        await tx.$executeRaw`UPDATE v2_agent_definitions SET active_version_id = ${definitionVersionId}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${definitionId} AND active_version_id IS NULL`
        await tx.$executeRaw`INSERT INTO v2_agent_policies (id, organization_id, policy_key, display_name, source_kind, bootstrap_key, created_by)
          VALUES (${policyId}, ${context.organizationId}, ${template.key}, ${`${template.displayName} policy`}, 'SYSTEM', ${`policy-${digest(template.key).slice(0, 24)}`}, ${context.userId}) ON CONFLICT (organization_id, policy_key) DO NOTHING`
        const policyDocument = { allowedToolKeys: template.policy.allowedToolKeys, allowedProviderKeys: template.policy.allowedProviderKeys, maxRunsPerActor: template.policy.maxRunsPerActor, maxRunsPerTenant: template.policy.maxRunsPerTenant }
        await tx.$executeRaw`INSERT INTO v2_agent_policy_versions (id, organization_id, policy_id, version_number, allowed_capabilities, provider_policy, data_handling_policy, confirmation_policy, content_hash, status, published_by, published_at, created_by)
          VALUES (${policyVersionId}, ${context.organizationId}, ${policyId}, 1, ${JSON.stringify(template.policy.allowedToolKeys)}::jsonb, ${JSON.stringify({ providers: [] })}::jsonb, ${JSON.stringify({ persistRawProviderPayloads: false, persistReasoning: false, redactionMode: 'OMITTED', retentionDays: 90, ...policyDocument })}::jsonb, ${JSON.stringify({ requireConfirmationForMutations: true, defaultExpiresInSeconds: 86400 })}::jsonb, ${digest(policyDocument)}, 'PUBLISHED', ${context.userId}, now(), ${context.userId}) ON CONFLICT (organization_id, policy_id, version_number) DO NOTHING`
        await tx.$executeRaw`UPDATE v2_agent_policies SET active_version_id = ${policyVersionId}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${policyId} AND active_version_id IS NULL`
        await tx.$executeRaw`INSERT INTO v2_agent_workflows (id, organization_id, workflow_key, display_name, description, source_kind, bootstrap_key, created_by)
          VALUES (${workflowId}, ${context.organizationId}, ${template.workflow.workflowKey}, ${template.displayName}, ${template.description}, 'SYSTEM', ${`workflow-${digest(template.key).slice(0, 24)}`}, ${context.userId}) ON CONFLICT (organization_id, workflow_key) DO NOTHING`
        await tx.$executeRaw`INSERT INTO v2_agent_workflow_versions (id, organization_id, workflow_id, version_number, agent_definition_version_id, policy_version_id, workflow_graph, input_schema, output_schema, content_hash, status, published_by, published_at, created_by)
          VALUES (${workflowVersionId}, ${context.organizationId}, ${workflowId}, 1, ${definitionVersionId}, ${policyVersionId}, ${JSON.stringify(template.workflow)}::jsonb, ${JSON.stringify({ schemaVersion: p9SchemaVersion, jsonSchema: { type: 'object', additionalProperties: true } })}::jsonb, ${JSON.stringify({ schemaVersion: p9SchemaVersion, jsonSchema: { type: 'object' } })}::jsonb, ${digest(template.workflow)}, 'PUBLISHED', ${context.userId}, now(), ${context.userId}) ON CONFLICT (organization_id, workflow_id, version_number) DO NOTHING`
        for (const node of template.workflow.nodes.filter((candidate) => candidate.kind === 'TOOL')) {
          const toolVersionId = deterministicId('agent_toolver', context.organizationId, `${node.toolKey}@${BUILTIN_AGENT_TOOLS[node.toolKey as keyof typeof BUILTIN_AGENT_TOOLS].tool.version}`)
          await tx.$executeRaw`INSERT INTO v2_agent_workflow_tool_bindings (id, organization_id, workflow_version_id, tool_version_id, node_key, max_invocations, confirmation_required)
            VALUES (${deterministicId('agent_binding', context.organizationId, `${template.key}:${node.key}`)}, ${context.organizationId}, ${workflowVersionId}, ${toolVersionId}, ${node.key}, ${node.maxAttempts}, false) ON CONFLICT (organization_id, workflow_version_id, node_key) DO NOTHING`
        }
        await tx.$executeRaw`UPDATE v2_agent_workflows SET active_version_id = ${workflowVersionId}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${workflowId} AND active_version_id IS NULL`
      }
      return { definitions: builtinAgentTemplates().length, status: 'READY' }
    })
  }

  async listDefinitions(context: PlatformContext) {
    await this.platform.requirePermission(context, 'agent.view')
    await this.bootstrap(context)
    return this.scoped(context, (tx) => tx.$queryRaw<Array<{ key: string; name: string; description: string | null; status: string; activeVersion: string | null; updatedAt: Date }>>`SELECT d.agent_key AS key, d.display_name AS name, d.description, d.status, v.version_number::text AS "activeVersion", d.updated_at AS "updatedAt" FROM v2_agent_definitions d LEFT JOIN v2_agent_definition_versions v ON v.organization_id = d.organization_id AND v.id = d.active_version_id WHERE d.organization_id = ${context.organizationId} ORDER BY d.source_kind DESC, d.agent_key ASC`)
  }

  async definitionDetail(context: PlatformContext, definitionKey: string) {
    await this.platform.requirePermission(context, 'agent.view')
    await this.bootstrap(context)
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<JsonRecord[]>`SELECT d.id, d.agent_key AS "definitionKey", d.display_name AS "displayName", d.description, d.source_kind AS "sourceKind", d.status, d.active_version_id AS "activeVersionId", d.created_at AS "createdAt", d.updated_at AS "updatedAt" FROM v2_agent_definitions d WHERE d.organization_id = ${context.organizationId} AND d.agent_key = ${definitionKey}`
      if (!rows[0]) throw new PlatformError('AGENT_DEFINITION_NOT_FOUND', 'The agent definition is not available.', 404)
      return rows[0]
    })
  }

  async createDefinition(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'agent.manageTools')
    const parsed = agentDefinitionCreateRequestSchema.safeParse(rawInput)
    if (!parsed.success || parsed.data.sourceKind !== 'TENANT' || parsed.data.bootstrapKey || (BUILTIN_AGENT_CATALOG as Readonly<Record<string, unknown>>)[parsed.data.agentKey]) throw new PlatformError('AGENT_DEFINITION_INVALID', 'Only tenant-owned, non-system definition identities may be created from the API.', 422)
    await this.bootstrap(context)
    return this.idempotent(context, 'agent.definitions.create', key, parsed.data, async (tx) => {
      const id = identifier('agent_def')
      const rows = await tx.$queryRaw<JsonRecord[]>`INSERT INTO v2_agent_definitions (id, organization_id, agent_key, display_name, description, source_kind, created_by) VALUES (${id}, ${context.organizationId}, ${parsed.data.agentKey}, ${parsed.data.displayName}, ${parsed.data.description ?? null}, 'TENANT', ${context.userId}) RETURNING id, agent_key AS "definitionKey", display_name AS "displayName", description, source_kind AS "sourceKind", status`
      await this.audit(tx, context, 'agent.definition.create', 'allowed', id, { definitionKey: parsed.data.agentKey })
      return rows[0] as JsonRecord
    })
  }

  async listDefinitionVersions(context: PlatformContext, definitionKey: string) {
    await this.platform.requirePermission(context, 'agent.view')
    await this.bootstrap(context)
    return this.scoped(context, (tx) => tx.$queryRaw<JsonRecord[]>`SELECT v.id, v.version_number AS "versionNumber", v.protocol_version AS "protocolVersion", v.instruction_template_key AS "instructionTemplateKey", v.instruction_template_version AS "instructionTemplateVersion", v.content_hash AS "contentHash", v.status, v.published_at AS "publishedAt", v.created_at AS "createdAt" FROM v2_agent_definition_versions v JOIN v2_agent_definitions d ON d.organization_id = v.organization_id AND d.id = v.agent_definition_id WHERE v.organization_id = ${context.organizationId} AND d.agent_key = ${definitionKey} ORDER BY v.version_number DESC`)
  }

  async createDefinitionVersion(context: PlatformContext, definitionKey: string, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'agent.manageTools')
    const parsed = agentDefinitionVersionCreateRequestSchema.safeParse(rawInput)
    if (!parsed.success || parsed.data.protocolVersion !== p9Protocol || parsed.data.modelPolicy.providerAllowlist.some((provider) => provider !== 'none') || parsed.data.modelPolicy.modelAllowlist.some((model) => model !== 'not-configured') || parsed.data.instructionTemplate.key !== `tenant.${definitionKey}`) {
      throw new PlatformError('AGENT_CONFIGURATION_UNSAFE', 'Tenant versions may reference only the server-approved not-configured provider and definition template key.', 422)
    }
    return this.idempotent(context, 'agent.definition-versions.create', key, { definitionKey, ...parsed.data }, async (tx) => {
      const definition = await tx.$queryRaw<Array<{ id: string; sourceKind: string }>>`SELECT id, source_kind AS "sourceKind" FROM v2_agent_definitions WHERE organization_id = ${context.organizationId} AND agent_key = ${definitionKey} FOR UPDATE`
      if (!definition[0]) throw new PlatformError('AGENT_DEFINITION_NOT_FOUND', 'The agent definition is not available.', 404)
      if (definition[0].sourceKind === 'SYSTEM' || definition[0].id !== parsed.data.agentDefinitionId) throw new PlatformError('AGENT_SYSTEM_IMMUTABLE', 'System agent definitions cannot be changed from the API.', 403)
      const id = identifier('agent_defver'); const published = parsed.data.publication.status === 'PUBLISHED'
      await tx.$executeRaw`INSERT INTO v2_agent_definition_versions (id, organization_id, agent_definition_id, version_number, protocol_version, instruction_template_key, instruction_template_version, instruction_template_hash, input_schema, output_schema, model_policy, content_hash, status, published_by, published_at, created_by) VALUES (${id}, ${context.organizationId}, ${definition[0].id}, ${parsed.data.versionNumber}, ${parsed.data.protocolVersion}, ${parsed.data.instructionTemplate.key}, ${parsed.data.instructionTemplate.version}, ${parsed.data.instructionTemplate.contentHash}, ${JSON.stringify(parsed.data.inputSchema)}::jsonb, ${JSON.stringify(parsed.data.outputSchema)}::jsonb, ${JSON.stringify(parsed.data.modelPolicy)}::jsonb, ${parsed.data.contentHash}, ${parsed.data.publication.status}, ${published ? context.userId : null}, ${published ? parsed.data.publication.publishedAt ?? new Date().toISOString() : null}::timestamptz, ${context.userId})`
      if (published) await tx.$executeRaw`UPDATE v2_agent_definitions SET active_version_id = ${id}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${definition[0].id}`
      await this.audit(tx, context, 'agent.definition.version.create', 'allowed', id, { definitionKey, versionNumber: parsed.data.versionNumber })
      return { id, definitionKey, versionNumber: parsed.data.versionNumber, status: parsed.data.publication.status }
    })
  }

  async definitionPolicy(context: PlatformContext, definitionKey: string) {
    await this.platform.requirePermission(context, 'agent.view')
    await this.bootstrap(context)
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<JsonRecord[]>`SELECT p.id, p.policy_key AS "policyKey", p.source_kind AS "sourceKind", p.status, pv.id AS "activeVersionId", pv.version_number AS "versionNumber", pv.allowed_capabilities AS "allowedCapabilities", pv.provider_policy AS "providerPolicy", pv.data_handling_policy AS "dataHandlingPolicy", pv.confirmation_policy AS "confirmationPolicy", pv.content_hash AS "contentHash" FROM v2_agent_definitions d JOIN v2_agent_definition_versions dv ON dv.organization_id = d.organization_id AND dv.id = d.active_version_id JOIN v2_agent_workflow_versions wv ON wv.organization_id = d.organization_id AND wv.agent_definition_version_id = dv.id JOIN v2_agent_policies p ON p.organization_id = d.organization_id JOIN v2_agent_policy_versions pv ON pv.organization_id = p.organization_id AND pv.id = wv.policy_version_id AND pv.policy_id = p.id WHERE d.organization_id = ${context.organizationId} AND d.agent_key = ${definitionKey} ORDER BY wv.version_number DESC LIMIT 1`
      if (!rows[0]) throw new PlatformError('AGENT_POLICY_NOT_FOUND', 'The agent policy is not available.', 404)
      return rows[0]
    })
  }

  async updateDefinitionPolicy(context: PlatformContext, definitionKey: string, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'agent.manageTools')
    const parsed = agentPolicyVersionCreateRequestSchema.safeParse(rawInput)
    if (!parsed.success || parsed.data.providerPolicy.providers.some((provider) => provider.providerKey !== 'none') || parsed.data.dataHandlingPolicy.persistRawProviderPayloads || parsed.data.dataHandlingPolicy.persistReasoning) {
      throw new PlatformError('AGENT_POLICY_UNSAFE', 'The policy may use only the server-owned not-configured provider boundary and redacted metadata.', 422)
    }
    return this.idempotent(context, 'agent.policies.update', key, { definitionKey, ...parsed.data }, async (tx) => {
      const policy = await tx.$queryRaw<Array<{ id: string; sourceKind: string }>>`SELECT p.id, p.source_kind AS "sourceKind" FROM v2_agent_definitions d JOIN v2_agent_policies p ON p.organization_id = d.organization_id AND p.policy_key = d.agent_key WHERE d.organization_id = ${context.organizationId} AND d.agent_key = ${definitionKey} FOR UPDATE OF p`
      if (!policy[0]) throw new PlatformError('AGENT_POLICY_NOT_FOUND', 'The agent policy is not available.', 404)
      if (policy[0].sourceKind === 'SYSTEM' || policy[0].id !== parsed.data.policyId) throw new PlatformError('AGENT_SYSTEM_IMMUTABLE', 'System policies cannot be changed from the API.', 403)
      const id = identifier('agent_policyver'); const published = parsed.data.publication.status === 'PUBLISHED'
      await tx.$executeRaw`INSERT INTO v2_agent_policy_versions (id, organization_id, policy_id, version_number, allowed_capabilities, provider_policy, data_handling_policy, confirmation_policy, content_hash, status, published_by, published_at, created_by) VALUES (${id}, ${context.organizationId}, ${policy[0].id}, ${parsed.data.versionNumber}, ${JSON.stringify(parsed.data.allowedCapabilities)}::jsonb, ${JSON.stringify(parsed.data.providerPolicy)}::jsonb, ${JSON.stringify(parsed.data.dataHandlingPolicy)}::jsonb, ${JSON.stringify(parsed.data.confirmationPolicy)}::jsonb, ${parsed.data.contentHash}, ${parsed.data.publication.status}, ${published ? context.userId : null}, ${published ? parsed.data.publication.publishedAt ?? new Date().toISOString() : null}::timestamptz, ${context.userId})`
      if (published) await tx.$executeRaw`UPDATE v2_agent_policies SET active_version_id = ${id}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${policy[0].id}`
      await this.audit(tx, context, 'agent.policy.version.create', 'allowed', id, { definitionKey, versionNumber: parsed.data.versionNumber })
      return { id, definitionKey, versionNumber: parsed.data.versionNumber, status: parsed.data.publication.status }
    })
  }

  async start(context: PlatformContext, rawInput: unknown, key?: string) {
    if (agentRunRequestSchema.safeParse(rawInput).success) return this.legacyStart(context, rawInput, key)
    await this.platform.requirePermission(context, 'agent.execute')
    const parsed = p9StartSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a registered agent definition and bounded input object.', 422)
    const safeInput = sanitizeAgentRunInput(parsed.data.input)
    await this.bootstrap(context)
    return this.idempotent(context, 'agent.runtime.runs.start', key, { ...parsed.data, input: safeInput }, async (tx) => {
      const template = BUILTIN_AGENT_CATALOG[parsed.data.definitionKey]
      const config = await tx.$queryRaw<Array<{ definitionVersionId: string; workflowVersionId: string; policyVersionId: string; workflowKey: string }>>`SELECT dv.id AS "definitionVersionId", wv.id AS "workflowVersionId", wv.policy_version_id AS "policyVersionId", w.workflow_key AS "workflowKey" FROM v2_agent_definitions d JOIN v2_agent_definition_versions dv ON dv.organization_id = d.organization_id AND dv.id = d.active_version_id AND dv.status = 'PUBLISHED' JOIN v2_agent_workflow_versions wv ON wv.organization_id = d.organization_id AND wv.agent_definition_version_id = dv.id AND wv.status = 'PUBLISHED' JOIN v2_agent_workflows w ON w.organization_id = wv.organization_id AND w.id = wv.workflow_id AND w.active_version_id = wv.id JOIN v2_agent_policy_versions pv ON pv.organization_id = wv.organization_id AND pv.id = wv.policy_version_id AND pv.status = 'PUBLISHED' WHERE d.organization_id = ${context.organizationId} AND d.agent_key = ${parsed.data.definitionKey} AND d.status = 'ACTIVE' ORDER BY wv.version_number DESC LIMIT 1`
      if (!config[0]) throw new PlatformError('AGENT_NOT_CONFIGURED', 'The selected agent has no published active configuration.', 409)
      const runId = identifier('agent_run'); const jobId = identifier('agent_job'); const correlationId = identifier('corr'); const inputHash = digest(safeInput)
      await this.reserveRunQuota(tx, context, runId, template.policy)
      await tx.$executeRaw`INSERT INTO v2_agent_runs (id, organization_id, creator_user_id, workflow_key, workflow_version, status, request_hash, correlation_id, protocol_version, agent_definition_version_id, workflow_version_id, policy_version_id, trace_id) VALUES (${runId}, ${context.organizationId}, ${context.userId}, ${config[0].workflowKey}, '1.0.0', 'QUEUED', ${inputHash}, ${correlationId}, ${p9Protocol}, ${config[0].definitionVersionId}, ${config[0].workflowVersionId}, ${config[0].policyVersionId}, ${identifier('trace')})`
      await tx.$executeRaw`INSERT INTO v2_agent_jobs (id, organization_id, run_id, status, protocol_version, policy_version_id, correlation_id) VALUES (${jobId}, ${context.organizationId}, ${runId}, 'QUEUED', ${p9Protocol}, ${config[0].policyVersionId}, ${correlationId})`
      const inputArtifactId = identifier('agent_artifact')
      await tx.$executeRaw`INSERT INTO v2_agent_artifacts (id, organization_id, run_id, artifact_type, payload, payload_hash, protocol_version, schema_version, redaction_status, correlation_id) VALUES (${inputArtifactId}, ${context.organizationId}, ${runId}, 'run_input', ${JSON.stringify(safeInput)}::jsonb, ${inputHash}, ${p9Protocol}, ${p9SchemaVersion}, 'REDACTED', ${correlationId})`
      let rootCount = 0
      for (const node of template.workflow.nodes) {
        const isRoot = node.dependsOn.length === 0; if (isRoot) rootCount += 1
        await tx.$executeRaw`INSERT INTO v2_agent_run_nodes (id, organization_id, run_id, workflow_node_key, node_kind, status, attempt, input_hash, correlation_id) VALUES (${identifier('agent_node')}, ${context.organizationId}, ${runId}, ${node.key}, ${node.kind}, ${isRoot ? 'READY' : 'PENDING'}, 1, ${inputHash}, ${correlationId})`
      }
      const messagePayload = { summary: 'Bounded run input recorded.', hashes: { inputHash }, metadata: { definitionKey: parsed.data.definitionKey } }
      await tx.$executeRaw`INSERT INTO v2_agent_run_messages (id, organization_id, run_id, sequence, message_role, message_kind, schema_version, payload, payload_hash, redaction_status, correlation_id) VALUES (${identifier('agent_message')}, ${context.organizationId}, ${runId}, 1, 'USER', 'INPUT', ${p9SchemaVersion}, ${JSON.stringify(messagePayload)}::jsonb, ${digest(messagePayload)}, 'REDACTED', ${correlationId})`
      await tx.$executeRaw`INSERT INTO v2_agent_lineage_refs (id, organization_id, run_id, source_kind, source_ref, target_kind, target_ref, relation_type, source_content_hash, target_content_hash, metadata, correlation_id) VALUES (${identifier('agent_lineage')}, ${context.organizationId}, ${runId}, 'RUN_INPUT', ${runId}, 'ARTIFACT', ${inputArtifactId}, 'PRODUCED', ${inputHash}, ${inputHash}, ${JSON.stringify({ schemaVersion: p9SchemaVersion })}::jsonb, ${correlationId})`
      await this.event(tx, context, runId, 'run.created', { status: 'QUEUED', references: [config[0].definitionVersionId, config[0].workflowVersionId, config[0].policyVersionId], hashes: { inputHash }, metrics: { nodeCount: template.workflow.nodes.length, readyNodes: rootCount } })
      await this.event(tx, context, runId, 'job.queued', { status: 'QUEUED', references: [jobId] })
      await this.audit(tx, context, 'agent.run.start', 'allowed', runId, { definitionKey: parsed.data.definitionKey, inputHash })
      return { id: runId, status: 'QUEUED', definitionKey: parsed.data.definitionKey, workflowKey: config[0].workflowKey }
    })
  }

  private async legacyStart(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'agent.execute')
    const parsed = agentRunRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide an authorized Design Studio research request.', 422)
    return this.idempotent(context, 'agent.runs.start', key, parsed.data, async (tx) => {
      const active = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND creator_user_id = ${context.userId} AND status IN ('QUEUED','RUNNING','WAITING_FOR_CONFIRMATION')`
      if (Number(active[0]?.count ?? 0) >= 2) throw new PlatformError('AGENT_RUN_QUOTA_EXCEEDED', 'At most two research runs may be active for a user.', 429)
      const project = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_design_projects WHERE organization_id = ${context.organizationId} AND id = ${parsed.data.designProjectId} AND status = 'ACTIVE'`
      if (!project[0]) throw new PlatformError('DESIGN_PROJECT_NOT_FOUND', 'The selected Design Studio project is not available.', 404)
      const runId = identifier('agent_run'); const jobId = identifier('agent_job'); const requestHash = digest(parsed.data)
      await tx.$executeRaw`INSERT INTO v2_agent_runs (id, organization_id, creator_user_id, workflow_key, workflow_version, status, request_hash, correlation_id) VALUES (${runId}, ${context.organizationId}, ${context.userId}, ${parsed.data.workflowKey}, '1.0.0', 'QUEUED', ${requestHash}, ${identifier('corr')})`
      await tx.$executeRaw`INSERT INTO v2_agent_jobs (id, organization_id, run_id, status) VALUES (${jobId}, ${context.organizationId}, ${runId}, 'QUEUED')`
      await tx.$executeRaw`INSERT INTO v2_agent_artifacts (id, organization_id, run_id, artifact_type, payload, payload_hash) VALUES (${identifier('agent_artifact')}, ${context.organizationId}, ${runId}, 'run_input', ${JSON.stringify({ designProjectId: parsed.data.designProjectId, workflowKey: parsed.data.workflowKey })}::jsonb, ${requestHash})`
      await this.event(tx, context, runId, 'run.created', { status: 'QUEUED', workflow: parsed.data.workflowKey })
      await this.event(tx, context, runId, 'job.queued', { status: 'QUEUED' })
      await this.audit(tx, context, 'agent.run.start', 'allowed', runId, { workflow: parsed.data.workflowKey, requestHash })
      return { id: runId, status: 'QUEUED', workflowKey: parsed.data.workflowKey }
    })
  }

  async execute(context: PlatformContext, runId: string, key?: string) {
    await this.platform.requirePermission(context, 'agent.execute')
    const protocol = await this.scoped(context, (tx) => tx.$queryRaw<Array<{ protocolVersion: string }>>`SELECT protocol_version AS "protocolVersion" FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId}`)
    if (!protocol[0]) throw new PlatformError('AGENT_RUN_NOT_FOUND', 'The agent run is not available.', 404)
    if (protocol[0].protocolVersion !== p9Protocol) return this.legacyExecute(context, runId, key)
    let recoveryClaim: Readonly<{ nodeId: string; leaseHash: string }> | undefined
    try {
      const claim = await this.scoped(context, async (tx) => {
        const replay = await this.claimOperation<JsonRecord>(tx, context, 'agent.runtime.runs.execute', key, { runId })
        if (replay) return { kind: 'REPLAY' as const, replay }
        const runRows = await tx.$queryRaw<Array<{ id: string; status: string; workflowKey: string; correlationId: string; policyVersionId: string; requestHash: string }>>`SELECT id, status, workflow_key AS "workflowKey", correlation_id AS "correlationId", policy_version_id AS "policyVersionId", request_hash AS "requestHash" FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId} AND protocol_version = ${p9Protocol} FOR UPDATE`
        const run = runRows[0]
        if (!run) throw new PlatformError('AGENT_RUN_NOT_FOUND', 'The agent run is not available.', 404)
        if (!['QUEUED', 'RUNNING'].includes(run.status)) throw new PlatformError('AGENT_RUN_STATE_INVALID', 'This agent run cannot be executed from its current state.', 409)
        const leaseHash = digest(bytesToBase64Url(randomBytes(32)))
        const jobs = await tx.$queryRaw<Array<{ id: string }>>`WITH claim AS (SELECT id FROM v2_agent_jobs WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND (status = 'QUEUED' OR (status = 'LEASED' AND lease_expires_at <= now())) ORDER BY available_at ASC FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE v2_agent_jobs j SET status = 'LEASED', lease_token_hash = ${leaseHash}, lease_expires_at = now() + interval '60 seconds', updated_at = now() FROM claim WHERE j.id = claim.id RETURNING j.id`
        if (!jobs[0]) throw new PlatformError('AGENT_JOB_UNAVAILABLE', 'Another worker owns this agent run or no job is ready.', 409)
        await tx.$executeRaw`UPDATE v2_agent_runs SET status = 'RUNNING', lease_token_hash = ${leaseHash}, lease_expires_at = now() + interval '60 seconds', updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId}`
        const nodes = await tx.$queryRaw<Array<{ id: string; workflowNodeKey: string; nodeKind: string; attempt: number }>>`SELECT id, workflow_node_key AS "workflowNodeKey", node_kind AS "nodeKind", attempt FROM v2_agent_run_nodes WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND status = 'READY' ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1`
        const node = nodes[0]
        if (!node) throw new PlatformError('AGENT_NODE_UNAVAILABLE', 'No workflow node is ready for execution.', 409)
        const definitionKey = run.workflowKey.split('/')[0] as BuiltinAgentKey
        const template = BUILTIN_AGENT_CATALOG[definitionKey]
        if (!template) throw new PlatformError('AGENT_CONFIGURATION_INVALID', 'The persisted workflow is not registered by the server.', 500)
        const nodeDefinition = template.workflow.nodes.find((candidate) => candidate.key === node.workflowNodeKey)
        if (!nodeDefinition || nodeDefinition.kind !== node.nodeKind) throw new PlatformError('AGENT_CONFIGURATION_INVALID', 'The persisted workflow node does not match its published definition.', 500)
        await tx.$executeRaw`UPDATE v2_agent_run_nodes SET status = 'RUNNING', started_at = COALESCE(started_at, now()), updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${node.id}`
        await this.event(tx, context, runId, 'step.started', { status: 'RUNNING', references: [node.id], metadata: { nodeKey: node.workflowNodeKey, nodeKind: node.nodeKind } }, leaseHash)
        const inputs = await tx.$queryRaw<Array<{ payload: JsonRecord }>>`SELECT payload FROM v2_agent_artifacts WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND artifact_type = 'run_input' ORDER BY created_at ASC LIMIT 1`
        const input = sanitizeAgentRunInput(inputs[0]?.payload ?? {})
        let toolCallId: string | undefined
        let providerRequest: Readonly<{ providerKey: string; model: string | null; correlationId: string; workflowKey: string; workflowVersion: string; contextHash: string; toolContextHash: string }> | undefined
        let toolArtifacts: Array<{ id: string; payloadHash: string }> = []
        if (nodeDefinition.kind === 'TOOL' && nodeDefinition.toolKey) {
          const binding = await tx.$queryRaw<Array<{ toolVersionId: string }>>`SELECT tool_version_id AS "toolVersionId" FROM v2_agent_workflow_tool_bindings WHERE organization_id = ${context.organizationId} AND workflow_version_id = (SELECT workflow_version_id FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId}) AND node_key = ${node.workflowNodeKey}`
          if (!binding[0]) throw new PlatformError('AGENT_TOOL_DENIED', 'The workflow tool binding is unavailable.', 403)
          toolCallId = identifier('agent_toolcall')
          await tx.$executeRaw`INSERT INTO v2_agent_tool_calls (id, organization_id, run_id, tool_key, input_hash, status, tool_version_id, policy_version_id, run_node_id, invocation_key, attempt, input_schema_version, correlation_id) VALUES (${toolCallId}, ${context.organizationId}, ${runId}, ${nodeDefinition.toolKey}, ${digest(input)}, 'REQUESTED', ${binding[0].toolVersionId}, ${run.policyVersionId}, ${node.id}, ${digest({ runId, node: node.id, attempt: node.attempt })}, ${node.attempt}, 'tool/1', ${run.correlationId})`
          await this.event(tx, context, runId, 'tool.requested', { status: 'REQUESTED', references: [toolCallId], metadata: { toolKey: nodeDefinition.toolKey } }, leaseHash)
        } else if (nodeDefinition.kind === 'ARTIFACT') {
          toolArtifacts = await tx.$queryRaw<Array<{ id: string; payloadHash: string }>>`SELECT id, payload_hash AS "payloadHash" FROM v2_agent_artifacts WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND artifact_type = 'tool_output' ORDER BY created_at ASC`
          providerRequest = { providerKey: 'none', model: null, correlationId: run.correlationId, workflowKey: run.workflowKey, workflowVersion: '1.0.0', contextHash: run.requestHash, toolContextHash: digest(toolArtifacts) }
        }
        return { kind: 'CLAIMED' as const, run, node, nodeDefinition, template, definitionKey, leaseHash, input, toolCallId, providerRequest, toolArtifacts }
      })
      if (claim.kind === 'REPLAY') return claim.replay
      recoveryClaim = { nodeId: claim.node.id, leaseHash: claim.leaseHash }

      let safeToolOutput: JsonRecord | undefined
      let toolResult: Awaited<ReturnType<CompiledAgentToolRegistry['invoke']>> | undefined
      let providerResult: Awaited<ReturnType<AgentProviderGateway['invoke']>> | undefined
      if (claim.nodeDefinition.kind === 'CONFIRMATION' && claim.definitionKey === 'formula-research') {
        const candidateId = typeof claim.input.candidateId === 'string' ? claim.input.candidateId : undefined
        const formulaProjectId = typeof claim.input.formulaProjectId === 'string' ? claim.input.formulaProjectId : undefined
        if (candidateId && formulaProjectId) await this.domainTools.verifyCandidateReference(context, candidateId, formulaProjectId)
      } else if (claim.nodeDefinition.kind === 'TOOL' && claim.nodeDefinition.toolKey) {
        const executionContext = {
          organizationId: context.organizationId, actorUserId: context.userId, runId, stepId: claim.node.id, correlationId: claim.run.correlationId,
          sessionId: context.sessionId, role: context.role, hostname: context.hostname,
          requirePermission: (permission: string) => this.platform.requirePermission(context, permission), context: [] as const,
        }
        toolResult = await this.toolRegistry.invoke(executionContext, { toolKey: claim.nodeDefinition.toolKey, value: claim.input, allowedToolKeys: claim.template.policy.allowedToolKeys })
        const projected = redactUnsafeAgentRuntimePayload(toolResult.output)
        if (!projected || typeof projected !== 'object' || Array.isArray(projected)) throw new PlatformError('AGENT_TOOL_OUTPUT_INVALID', 'A tool must return a safe structured output object.', 422)
        safeToolOutput = projected as JsonRecord
      } else if (claim.nodeDefinition.kind === 'ARTIFACT') {
        if (!claim.providerRequest) throw new PlatformError('AGENT_PROVIDER_REQUEST_INVALID', 'The provider request could not be prepared.', 500)
        providerResult = normalizeAgentProviderResult(claim.providerRequest, await this.agentGateway.invoke(claim.providerRequest))
        if (providerResult.status === 'COMPLETED' && !/^[a-f0-9]{64}$/i.test(providerResult.responseHash ?? '')) {
          throw new PlatformError('AGENT_PROVIDER_RESPONSE_PROVENANCE_REQUIRED', 'A completed provider response requires immutable provenance.', 502)
        }
      }

      return await this.scoped(context, async (tx) => {
        await this.assertLease(tx, context, runId, claim.leaseHash)
        let outputHash = digest({ node: claim.node.workflowNodeKey, status: 'SKIPPED' })
        if (toolResult && safeToolOutput && claim.toolCallId) {
          outputHash = digest(safeToolOutput)
          await tx.$executeRaw`UPDATE v2_agent_tool_calls SET status = 'SUCCEEDED', output_hash = ${outputHash}, output_schema_version = 'tool/1' WHERE organization_id = ${context.organizationId} AND id = ${claim.toolCallId} AND run_node_id = ${claim.node.id}`
          const artifactId = identifier('agent_artifact')
          await tx.$executeRaw`INSERT INTO v2_agent_artifacts (id, organization_id, run_id, artifact_type, payload, payload_hash, protocol_version, schema_version, run_node_id, redaction_status, correlation_id) VALUES (${artifactId}, ${context.organizationId}, ${runId}, 'tool_output', ${JSON.stringify(safeToolOutput)}::jsonb, ${outputHash}, ${p9Protocol}, 'tool/1', ${claim.node.id}, 'REDACTED', ${claim.run.correlationId})`
          await tx.$executeRaw`INSERT INTO v2_agent_lineage_refs (id, organization_id, run_id, source_kind, source_ref, target_kind, target_ref, relation_type, source_content_hash, target_content_hash, metadata, correlation_id) VALUES (${identifier('agent_lineage')}, ${context.organizationId}, ${runId}, 'RUN_INPUT', ${runId}, 'TOOL_OUTPUT', ${claim.toolCallId}, 'PRODUCED', ${claim.run.requestHash}, ${outputHash}, ${JSON.stringify({ toolKey: claim.nodeDefinition.toolKey })}::jsonb, ${claim.run.correlationId}) ON CONFLICT DO NOTHING`
          await this.event(tx, context, runId, 'tool.completed', { status: 'SUCCEEDED', references: [claim.toolCallId, artifactId], hashes: { outputHash }, metrics: { outputBytes: toolResult.metadata.outputBytes }, metadata: { toolKey: toolResult.toolKey, toolVersion: toolResult.version } }, claim.leaseHash)
        } else if (providerResult) {
          const responseHash = providerResult.status === 'COMPLETED' ? providerResult.responseHash : null
          const usageStatus = providerResult.status === 'COMPLETED' && responseHash ? 'RECORDED' : providerResult.status
          const usageId = identifier('agent_usage')
          const requestHash = digest(claim.providerRequest)
          await tx.$executeRaw`INSERT INTO v2_agent_provider_usages (id, organization_id, run_id, run_node_id, provider_key, model_identifier, usage_status, request_hash, response_hash, input_tokens, output_tokens, cached_input_tokens, total_cost_micros, currency_code, started_at, completed_at, correlation_id) VALUES (${usageId}, ${context.organizationId}, ${runId}, ${claim.node.id}, ${providerResult.provider.toLowerCase()}, ${providerResult.model ?? 'not-configured'}, ${usageStatus}, ${requestHash}, ${responseHash}, ${providerResult.metadata.inputTokens ?? 0}, ${providerResult.metadata.outputTokens ?? 0}, 0, ${providerResult.metadata.costMicros ?? 0}, 'USD', now(), now(), ${claim.run.correlationId}) ON CONFLICT DO NOTHING`
          const safeProviderCode = providerResult.errorCode && /^[A-Z][A-Z0-9_]{1,119}$/.test(providerResult.errorCode) ? providerResult.errorCode : undefined
          const artifact = { state: providerResult.status, definitionKey: claim.definitionKey, evidenceReferences: claim.toolArtifacts.map((item) => item.id), ...(safeProviderCode ? { providerCode: safeProviderCode } : {}) }
          assertSafeAgentRuntimePayload(artifact)
          outputHash = digest(artifact)
          const artifactId = identifier('agent_artifact')
          await tx.$executeRaw`INSERT INTO v2_agent_artifacts (id, organization_id, run_id, artifact_type, payload, payload_hash, protocol_version, schema_version, run_node_id, redaction_status, correlation_id) VALUES (${artifactId}, ${context.organizationId}, ${runId}, ${claim.nodeDefinition.artifactType ?? 'agent_summary'}, ${JSON.stringify(artifact)}::jsonb, ${outputHash}, ${p9Protocol}, ${claim.nodeDefinition.outputSchemaVersion}, ${claim.node.id}, 'REDACTED', ${claim.run.correlationId})`
          await this.event(tx, context, runId, 'artifact.created', { status: providerResult.status, references: [artifactId, usageId], hashes: { outputHash }, metadata: { artifactType: claim.nodeDefinition.artifactType ?? 'agent_summary' } }, claim.leaseHash)
        } else if (claim.nodeDefinition.kind === 'CONFIRMATION') {
          const candidateId = typeof claim.input.candidateId === 'string' ? claim.input.candidateId : undefined
          const formulaProjectId = typeof claim.input.formulaProjectId === 'string' ? claim.input.formulaProjectId : undefined
          if (claim.definitionKey === 'formula-research' && candidateId && formulaProjectId) {
            const actionPayload = { candidateId, formulaProjectId, adapterKey: 'formula.candidate_save_draft' }
            assertSafeAgentRuntimePayload(actionPayload)
            const actionHash = digest(actionPayload); const intentId = identifier('agent_intent'); const confirmationId = identifier('agent_confirm')
            await tx.$executeRaw`INSERT INTO v2_agent_confirmation_intents (id, organization_id, run_id, run_node_id, policy_version_id, intent_key, intent_type, risk_level, action_payload, payload_hash, expires_at, created_by, correlation_id) VALUES (${intentId}, ${context.organizationId}, ${runId}, ${claim.node.id}, ${claim.run.policyVersionId}, 'CANDIDATE_SAVE_DRAFT', 'DOMAIN_MUTATION', 'HIGH', ${JSON.stringify(actionPayload)}::jsonb, ${actionHash}, now() + interval '24 hours', ${context.userId}, ${claim.run.correlationId})`
            await tx.$executeRaw`INSERT INTO v2_agent_confirmations (id, organization_id, run_id, action_key, status, expires_at, protocol_version, confirmation_intent_id, policy_version_id, correlation_id) VALUES (${confirmationId}, ${context.organizationId}, ${runId}, 'CANDIDATE_SAVE_DRAFT', 'PENDING', now() + interval '24 hours', ${p9Protocol}, ${intentId}, ${claim.run.policyVersionId}, ${claim.run.correlationId})`
            await tx.$executeRaw`UPDATE v2_agent_run_nodes SET status = 'WAITING_FOR_CONFIRMATION', output_hash = ${actionHash}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${claim.node.id} AND status = 'RUNNING'`
            await tx.$executeRaw`UPDATE v2_agent_runs SET status = 'WAITING_FOR_CONFIRMATION', lease_token_hash = NULL, lease_expires_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId} AND lease_token_hash = ${claim.leaseHash}`
            await tx.$executeRaw`UPDATE v2_agent_jobs SET status = 'SUCCEEDED', run_node_id = ${claim.node.id}, lease_token_hash = NULL, lease_expires_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND lease_token_hash = ${claim.leaseHash}`
            await this.event(tx, context, runId, 'confirmation.requested', { status: 'WAITING_FOR_CONFIRMATION', references: [confirmationId, intentId], hashes: { actionHash }, metadata: { intent: 'CANDIDATE_SAVE_DRAFT' } })
            const result = { id: runId, status: 'WAITING_FOR_CONFIRMATION', node: claim.node.workflowNodeKey }
            await this.completeOperation(tx, context, 'agent.runtime.runs.execute', key, result)
            return result
          }
          await tx.$executeRaw`UPDATE v2_agent_run_nodes SET status = 'SKIPPED', completed_at = now(), updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${claim.node.id} AND status = 'RUNNING'`
        }
        if (claim.nodeDefinition.kind !== 'CONFIRMATION') await tx.$executeRaw`UPDATE v2_agent_run_nodes SET status = 'SUCCEEDED', output_hash = ${outputHash}, completed_at = now(), updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${claim.node.id} AND status = 'RUNNING'`
        await this.event(tx, context, runId, 'step.completed', { status: claim.nodeDefinition.kind === 'CONFIRMATION' ? 'SKIPPED' : 'SUCCEEDED', references: [claim.node.id], hashes: { outputHash }, metadata: { nodeKey: claim.node.workflowNodeKey } }, claim.leaseHash)
        const states = await tx.$queryRaw<Array<{ workflowNodeKey: string; status: string }>>`SELECT workflow_node_key AS "workflowNodeKey", status FROM v2_agent_run_nodes WHERE organization_id = ${context.organizationId} AND run_id = ${runId}`
        for (const candidate of claim.template.workflow.nodes) {
          const current = states.find((state) => state.workflowNodeKey === candidate.key)
          if (current?.status !== 'PENDING') continue
          if (candidate.dependsOn.every((dependency) => ['SUCCEEDED', 'SKIPPED'].includes(states.find((state) => state.workflowNodeKey === dependency)?.status ?? ''))) {
            await tx.$executeRaw`UPDATE v2_agent_run_nodes SET status = 'READY', updated_at = now() WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND workflow_node_key = ${candidate.key} AND status = 'PENDING'`
          }
        }
        const unfinished = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM v2_agent_run_nodes WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND status IN ('PENDING','READY','RUNNING','WAITING_FOR_TOOL','WAITING_FOR_CONFIRMATION')`
        const completed = Number(unfinished[0]?.count ?? 0) === 0
        if (completed) await this.event(tx, context, runId, 'run.completed', { status: 'SUCCEEDED', references: [runId] }, claim.leaseHash)
        await tx.$executeRaw`UPDATE v2_agent_jobs SET status = ${completed ? 'SUCCEEDED' : 'QUEUED'}, run_node_id = ${claim.node.id}, lease_token_hash = NULL, lease_expires_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND lease_token_hash = ${claim.leaseHash}`
        await tx.$executeRaw`UPDATE v2_agent_runs SET status = ${completed ? 'SUCCEEDED' : 'RUNNING'}, lease_token_hash = NULL, lease_expires_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId} AND lease_token_hash = ${claim.leaseHash}`
        if (completed) await this.releaseRunQuota(tx, context, runId)
        await this.audit(tx, context, 'agent.run.execute', 'allowed', runId, { node: claim.node.workflowNodeKey, completed })
        const result = { id: runId, status: completed ? 'SUCCEEDED' : 'RUNNING', node: claim.node.workflowNodeKey }
        await this.completeOperation(tx, context, 'agent.runtime.runs.execute', key, result)
        return result
      })
    } catch (error) {
      const code = error instanceof PlatformError ? error.code : 'AGENT_EXECUTION_FAILED'
      const nonExecutionCodes = new Set(['AGENT_RUN_NOT_FOUND', 'AGENT_RUN_STATE_INVALID', 'AGENT_JOB_UNAVAILABLE', 'AGENT_NODE_UNAVAILABLE', 'IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_CONFLICT', 'OPERATION_IN_PROGRESS', 'TENANT_ACCESS_DENIED'])
      const activeClaim = recoveryClaim
      if (!nonExecutionCodes.has(code) && activeClaim) {
        await this.scoped(context, async (tx) => {
          const failed = await tx.$queryRaw<Array<{ id: string }>>`UPDATE v2_agent_run_nodes n SET status = 'FAILED', error_code = ${code.slice(0, 120)}, completed_at = now(), updated_at = now() WHERE n.organization_id = ${context.organizationId} AND n.run_id = ${runId} AND n.id = ${activeClaim.nodeId} AND n.status IN ('READY','RUNNING') AND EXISTS (SELECT 1 FROM v2_agent_runs r WHERE r.organization_id = n.organization_id AND r.id = n.run_id AND r.lease_token_hash = ${activeClaim.leaseHash} AND r.lease_expires_at > now()) RETURNING n.id`
          if (failed[0]) {
            await tx.$executeRaw`UPDATE v2_agent_jobs SET status = 'FAILED', lease_token_hash = NULL, lease_expires_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND lease_token_hash = ${activeClaim.leaseHash}`
            await tx.$executeRaw`UPDATE v2_agent_runs SET status = 'FAILED', lease_token_hash = NULL, lease_expires_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId} AND lease_token_hash = ${activeClaim.leaseHash}`
            await this.releaseRunQuota(tx, context, runId)
            await this.event(tx, context, runId, 'step.failed', { status: 'FAILED', code, references: [failed[0].id] })
            await this.event(tx, context, runId, 'run.failed', { status: 'FAILED', code, references: [runId] })
            await this.audit(tx, context, 'agent.run.execute', 'blocked', runId, { code, runNodeId: failed[0].id })
          }
          await this.abandonOperation(tx, context, 'agent.runtime.runs.execute', key)
        })
      }
      throw error
    }
  }

  private async legacyExecute(context: PlatformContext, runId: string, key?: string) {
    await this.platform.requirePermission(context, 'agent.execute')
    return this.idempotent(context, 'agent.runs.execute', key, { runId }, async (tx) => {
      const run = await tx.$queryRaw<Array<{ status: string; workflowKey: string; correlationId: string }>>`SELECT status, workflow_key AS "workflowKey", correlation_id AS "correlationId" FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId} AND creator_user_id = ${context.userId} FOR UPDATE`
      if (!run[0]) throw new PlatformError('AGENT_RUN_NOT_FOUND', 'The research run is not available.', 404)
      if (run[0].status !== 'QUEUED') throw new PlatformError('AGENT_RUN_STATE_INVALID', 'This research run cannot be executed from its current state.', 409)
      const leaseHash = digest(bytesToBase64Url(randomBytes(32)))
      const job = await tx.$queryRaw<Array<{ id: string }>>`UPDATE v2_agent_jobs SET status = 'LEASED', attempts = attempts + 1, lease_token_hash = ${leaseHash}, lease_expires_at = now() + interval '60 seconds', updated_at = now() WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND status = 'QUEUED' AND attempts < 3 RETURNING id`
      if (!job[0]) throw new PlatformError('AGENT_JOB_UNAVAILABLE', 'No executable job is available for this research run.', 409)
      await tx.$executeRaw`UPDATE v2_agent_runs SET status = 'RUNNING', lease_token_hash = ${leaseHash}, lease_expires_at = now() + interval '60 seconds', updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId} AND creator_user_id = ${context.userId}`
      await this.event(tx, context, runId, 'job.leased', { status: 'RUNNING' }, leaseHash)
      await this.event(tx, context, runId, 'run.started', { status: 'RUNNING' }, leaseHash)
      await this.event(tx, context, runId, 'node.started', { node: 'analyze_brief' }, leaseHash)
      const input = await tx.$queryRaw<Array<{ payload: { designProjectId?: string } }>>`SELECT payload FROM v2_agent_artifacts WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND artifact_type = 'run_input' ORDER BY created_at ASC LIMIT 1`
      const projectId = input[0]?.payload?.designProjectId
      const project = projectId ? await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_design_projects WHERE organization_id = ${context.organizationId} AND id = ${projectId} AND status = 'ACTIVE'` : []
      if (!project[0]) throw new PlatformError('DESIGN_PROJECT_NOT_FOUND', 'The Design Studio project is no longer available.', 404)
      await this.event(tx, context, runId, 'node.completed', { node: 'analyze_brief' }, leaseHash)
      await this.event(tx, context, runId, 'node.started', { node: 'search_materials' }, leaseHash)
      const materialSearchPolicy = formulaAgentToolPolicy('material.search')
      await this.platform.requirePermission(context, materialSearchPolicy.permission)
      const toolCallId = identifier('agent_tool')
      await this.assertLease(tx, context, runId, leaseHash)
      await tx.$executeRaw`INSERT INTO v2_agent_tool_calls (id, organization_id, run_id, tool_key, input_hash, status) VALUES (${toolCallId}, ${context.organizationId}, ${runId}, 'material.search', ${digest({ projectId })}, 'REQUESTED')`
      const materials = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM v2_materials WHERE organization_id = ${context.organizationId} AND status = 'ACTIVE'`
      const materialResult = boundedToolPayload({ activeMaterialCount: Number(materials[0]?.count ?? 0) }, materialSearchPolicy.maxOutputBytes)
      await this.assertLease(tx, context, runId, leaseHash)
      await tx.$executeRaw`UPDATE v2_agent_tool_calls SET status = 'SUCCEEDED', output_hash = ${digest(materialResult)} WHERE organization_id = ${context.organizationId} AND id = ${toolCallId}`
      await this.event(tx, context, runId, 'node.completed', { node: 'search_materials', ...materialResult }, leaseHash)
      const provider = await this.gateway.research({ correlationId: run[0].correlationId, workflowKey: run[0].workflowKey, toolContextHash: digest(materialResult) })
      const artifact = { provider: provider.status, workflow: run[0].workflowKey, activeMaterialCount: materialResult.activeMaterialCount, result: provider.message }
      const artifactId = identifier('agent_artifact')
      await this.assertLease(tx, context, runId, leaseHash)
      await tx.$executeRaw`INSERT INTO v2_agent_artifacts (id, organization_id, run_id, artifact_type, payload, payload_hash) VALUES (${artifactId}, ${context.organizationId}, ${runId}, 'research_summary', ${JSON.stringify(artifact)}::jsonb, ${digest(artifact)})`
      const confirmationId = identifier('agent_confirm')
      await tx.$executeRaw`INSERT INTO v2_agent_confirmations (id, organization_id, run_id, action_key, status, expires_at) VALUES (${confirmationId}, ${context.organizationId}, ${runId}, ${confirmationAction}, 'PENDING', now() + interval '24 hours')`
      await this.event(tx, context, runId, 'artifact.created', { artifactType: 'research_summary', provider: 'NOT_CONFIGURED' }, leaseHash)
      await this.event(tx, context, runId, 'confirmation.requested', { status: 'WAITING_FOR_CONFIRMATION', confirmationId, action: confirmationAction }, leaseHash)
      await tx.$executeRaw`UPDATE v2_agent_jobs SET status = 'SUCCEEDED', lease_token_hash = NULL, lease_expires_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND lease_token_hash = ${leaseHash}`
      await tx.$executeRaw`UPDATE v2_agent_runs SET status = 'WAITING_FOR_CONFIRMATION', lease_token_hash = NULL, lease_expires_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId} AND creator_user_id = ${context.userId} AND lease_token_hash = ${leaseHash}`
      await this.audit(tx, context, 'agent.run.execute', 'allowed', runId, { activeMaterialCount: artifact.activeMaterialCount, provider: 'NOT_CONFIGURED', confirmationId })
      return { id: runId, status: 'WAITING_FOR_CONFIRMATION', confirmation: { id: confirmationId, action: confirmationAction }, artifact }
    })
  }

  async confirm(context: PlatformContext, runId: string, confirmationId: string, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'agent.confirmWrite')
    const protocol = await this.scoped(context, (tx) => tx.$queryRaw<Array<{ protocolVersion: string }>>`SELECT protocol_version AS "protocolVersion" FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId}`)
    if (!protocol[0]) throw new PlatformError('AGENT_RUN_NOT_FOUND', 'The agent run is not available.', 404)
    if (protocol[0].protocolVersion !== p9Protocol) return this.legacyConfirm(context, runId, confirmationId, rawInput, key)
    const parsed = p9ConfirmSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide APPROVE or REJECT for the pending write.', 422)
    if (parsed.data.decision === 'APPROVE') await this.platform.requirePermission(context, 'formula.edit')
    const request = { runId, confirmationId, ...parsed.data }
    const staged = await this.scoped(context, async (tx) => {
      const replay = await this.claimOperation<JsonRecord>(tx, context, 'agent.runtime.confirm', key, request)
      if (replay) return { kind: 'REPLAY' as const, replay }
      // Every confirmation/cancellation path locks the run before its
      // confirmation rows. That ordering serializes a human approval against
      // cancellation before an external Formula write can be staged.
      const runs = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId} FOR UPDATE`
      if (!runs[0]) throw new PlatformError('AGENT_RUN_NOT_FOUND', 'The agent run is not available.', 404)
      const rows = await tx.$queryRaw<Array<ConfirmationRow & { intentId: string; actionPayload: JsonRecord; runNodeId: string }>>`SELECT c.id, c.status, c.action_key AS "actionKey", c.expires_at AS "expiresAt", c.result_ref AS "resultRef", c.decided_by AS "decidedBy", i.id AS "intentId", i.action_payload AS "actionPayload", i.run_node_id AS "runNodeId" FROM v2_agent_confirmations c JOIN v2_agent_confirmation_intents i ON i.organization_id = c.organization_id AND i.id = c.confirmation_intent_id WHERE c.organization_id = ${context.organizationId} AND c.run_id = ${runId} AND c.id = ${confirmationId} FOR UPDATE OF c`
      const confirmation = rows[0]
      if (!confirmation) throw new PlatformError('AGENT_CONFIRMATION_NOT_FOUND', 'The confirmation is not available.', 404)
      if (confirmation.status !== 'PENDING' && confirmation.status !== 'PROCESSING') {
        const result = { id: confirmation.id, status: confirmation.status, resultRef: confirmation.resultRef, alreadyDecided: true }
        await this.completeOperation(tx, context, 'agent.runtime.confirm', key, result)
        return { kind: 'REPLAY' as const, replay: result }
      }
      if (runs[0].status !== 'WAITING_FOR_CONFIRMATION') {
        throw new PlatformError('AGENT_RUN_NOT_CONFIRMABLE', 'The agent run is no longer waiting for this confirmation.', 409)
      }
      // Once APPROVE is durably staged, the recorded effect must be allowed to
      // finish/recover with the same Formula idempotency key; expiring it here
      // could orphan an already committed domain draft.
      if (confirmation.status === 'PENDING' && confirmation.expiresAt.getTime() <= Date.now()) {
        await tx.$executeRaw`UPDATE v2_agent_confirmations SET status = 'EXPIRED', decided_by = ${context.userId}, decided_at = now() WHERE organization_id = ${context.organizationId} AND id = ${confirmationId} AND status IN ('PENDING','PROCESSING')`
        await tx.$executeRaw`UPDATE v2_agent_run_nodes SET status = 'FAILED', error_code = 'AGENT_CONFIRMATION_EXPIRED', completed_at = now(), updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${confirmation.runNodeId}`
        await tx.$executeRaw`UPDATE v2_agent_runs SET status = 'FAILED', updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId}`
        await this.releaseRunQuota(tx, context, runId)
        await this.event(tx, context, runId, 'confirmation.expired', { status: 'FAILED', references: [confirmationId], code: 'AGENT_CONFIRMATION_EXPIRED' })
        const result = { id: confirmation.id, status: 'EXPIRED', alreadyDecided: false }
        await this.completeOperation(tx, context, 'agent.runtime.confirm', key, result)
        return { kind: 'REPLAY' as const, replay: result }
      }
      if (confirmation.actionKey !== 'CANDIDATE_SAVE_DRAFT' || confirmation.actionPayload.adapterKey !== 'formula.candidate_save_draft' || typeof confirmation.actionPayload.candidateId !== 'string' || typeof confirmation.actionPayload.formulaProjectId !== 'string' || !safeReference.test(confirmation.actionPayload.candidateId) || !safeReference.test(confirmation.actionPayload.formulaProjectId)) {
        throw new PlatformError('AGENT_CONFIRMATION_INVALID', 'The confirmed action is not an approved bounded write.', 409)
      }
      if (parsed.data.decision === 'REJECT') {
        if (confirmation.status !== 'PENDING') throw new PlatformError('AGENT_CONFIRMATION_PROCESSING', 'The approved draft effect is already being applied.', 409)
        await tx.$executeRaw`UPDATE v2_agent_confirmations SET status = 'REJECTED', decided_by = ${context.userId}, decided_at = now(), decision_rationale_hash = ${parsed.data.rationale ? digest(parsed.data.rationale) : null} WHERE organization_id = ${context.organizationId} AND id = ${confirmationId} AND status = 'PENDING'`
        await tx.$executeRaw`UPDATE v2_agent_run_nodes SET status = 'CANCELLED', output_hash = ${digest({ confirmationId, decision: 'REJECT' })}, completed_at = now(), updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${confirmation.runNodeId}`
        await tx.$executeRaw`UPDATE v2_agent_runs SET status = 'CANCELLED', updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId} AND status = 'WAITING_FOR_CONFIRMATION'`
        await this.releaseRunQuota(tx, context, runId)
        await this.event(tx, context, runId, 'confirmation.decided', { status: 'CANCELLED', references: [confirmationId], metadata: { decision: 'REJECT' } })
        await this.event(tx, context, runId, 'run.cancelled', { status: 'CANCELLED', references: [runId] })
        await this.audit(tx, context, 'agent.confirmation.decide', 'allowed', runId, { confirmationId, decision: 'REJECT' })
        const result = { id: confirmation.id, status: 'REJECTED', resultRef: null, alreadyDecided: false }
        await this.completeOperation(tx, context, 'agent.runtime.confirm', key, result)
        return { kind: 'REPLAY' as const, replay: result }
      }
      const effectKey = `effect_${digest({ confirmationId, intentId: confirmation.intentId, action: confirmation.actionPayload })}`
      await tx.$executeRaw`INSERT INTO v2_agent_confirmation_effects (id, organization_id, run_id, confirmation_id, confirmation_intent_id, effect_key, status, correlation_id) SELECT ${identifier('agent_effect')}, organization_id, ${runId}, ${confirmationId}, ${confirmation.intentId}, ${effectKey}, 'PENDING', correlation_id FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId} ON CONFLICT (organization_id, confirmation_id) DO NOTHING`
      await tx.$executeRaw`UPDATE v2_agent_confirmations SET status = 'PROCESSING', decided_by = COALESCE(decided_by, ${context.userId}), decision_rationale_hash = COALESCE(decision_rationale_hash, ${parsed.data.rationale ? digest(parsed.data.rationale) : null}) WHERE organization_id = ${context.organizationId} AND id = ${confirmationId} AND status = 'PENDING'`
      const effectClaimHash = digest(bytesToBase64Url(randomBytes(32)))
      const effect = await tx.$queryRaw<Array<{ id: string }>>`UPDATE v2_agent_confirmation_effects
        SET status = 'APPLYING', attempts = attempts + 1, claim_token_hash = ${effectClaimHash}, claim_expires_at = now() + interval '5 minutes', started_at = now(), completed_at = NULL, error_code = NULL, updated_at = now()
        WHERE organization_id = ${context.organizationId} AND confirmation_id = ${confirmationId}
          AND (status IN ('PENDING','FAILED') OR (status = 'APPLYING' AND (claim_expires_at IS NULL OR claim_expires_at <= now())))
        RETURNING id`
      if (!effect[0]) throw new PlatformError('AGENT_CONFIRMATION_PROCESSING', 'The draft effect is already being applied.', 409)
      await this.audit(tx, context, 'agent.confirmation.effect.stage', 'allowed', runId, { confirmationId, effectKey })
      return { kind: 'STAGED' as const, intentId: confirmation.intentId, runNodeId: confirmation.runNodeId, candidateId: confirmation.actionPayload.candidateId, formulaProjectId: confirmation.actionPayload.formulaProjectId, effectKey, effectClaimHash }
    })
    if (staged.kind === 'REPLAY') return staged.replay

    let resultRef: string
    try {
      const saved = await this.domainTools.saveCandidateDraft(context, staged.candidateId, staged.formulaProjectId, `agent-confirm-${confirmationId}`)
      const candidateResult = typeof saved.id === 'string' ? saved.id : typeof saved.draftId === 'string' ? saved.draftId : null
      if (!candidateResult || !safeReference.test(candidateResult)) throw new PlatformError('AGENT_CONFIRMATION_EFFECT_RESULT_INVALID', 'The formula draft effect did not return a safe domain reference.', 502)
      resultRef = candidateResult
    } catch (error) {
      const code = error instanceof PlatformError ? error.code : 'AGENT_CONFIRMATION_EFFECT_FAILED'
      await this.scoped(context, async (tx) => {
        const failed = await tx.$queryRaw<Array<{ id: string }>>`UPDATE v2_agent_confirmation_effects SET status = 'FAILED', error_code = ${code.slice(0, 120)}, completed_at = now(), claim_token_hash = NULL, claim_expires_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND confirmation_id = ${confirmationId} AND status = 'APPLYING' AND claim_token_hash = ${staged.effectClaimHash} RETURNING id`
        if (failed[0] && terminalConfirmationEffectCodes.has(code)) {
          await tx.$executeRaw`UPDATE v2_agent_confirmations SET status = 'CANCELLED', decided_at = COALESCE(decided_at, now()) WHERE organization_id = ${context.organizationId} AND id = ${confirmationId} AND status = 'PROCESSING'`
          await tx.$executeRaw`UPDATE v2_agent_run_nodes SET status = 'FAILED', error_code = ${code.slice(0, 120)}, completed_at = now(), updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${staged.runNodeId} AND status = 'WAITING_FOR_CONFIRMATION'`
          await tx.$executeRaw`UPDATE v2_agent_runs SET status = 'FAILED', updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId} AND status = 'WAITING_FOR_CONFIRMATION'`
          await this.releaseRunQuota(tx, context, runId)
          await this.event(tx, context, runId, 'confirmation.failed', { status: 'FAILED', references: [confirmationId], code })
          await this.event(tx, context, runId, 'run.failed', { status: 'FAILED', references: [runId], code })
        }
        await this.audit(tx, context, 'agent.confirmation.effect.failed', 'blocked', runId, { confirmationId, effectKey: staged.effectKey, code })
      })
      throw error
    }

    return this.scoped(context, async (tx) => {
      const runs = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId} FOR UPDATE`
      if (!runs[0]) throw new PlatformError('AGENT_RUN_NOT_FOUND', 'The agent run is not available.', 404)
      const effects = await tx.$queryRaw<Array<{ status: string; resultRef: string | null; claimTokenHash: string | null }>>`SELECT e.status, e.result_ref AS "resultRef", e.claim_token_hash AS "claimTokenHash" FROM v2_agent_confirmation_effects e JOIN v2_agent_confirmations c ON c.organization_id = e.organization_id AND c.id = e.confirmation_id WHERE e.organization_id = ${context.organizationId} AND e.confirmation_id = ${confirmationId} AND e.run_id = ${runId} FOR UPDATE OF e, c`
      if (!effects[0]) throw new PlatformError('AGENT_CONFIRMATION_EFFECT_NOT_FOUND', 'The confirmed draft effect is not available for recovery.', 409)
      const confirmation = await tx.$queryRaw<Array<ConfirmationRow & { intentId: string; runNodeId: string }>>`SELECT c.id, c.status, c.action_key AS "actionKey", c.expires_at AS "expiresAt", c.result_ref AS "resultRef", c.decided_by AS "decidedBy", i.id AS "intentId", i.run_node_id AS "runNodeId" FROM v2_agent_confirmations c JOIN v2_agent_confirmation_intents i ON i.organization_id = c.organization_id AND i.id = c.confirmation_intent_id WHERE c.organization_id = ${context.organizationId} AND c.run_id = ${runId} AND c.id = ${confirmationId} FOR UPDATE OF c`
      if (!confirmation[0]) throw new PlatformError('AGENT_CONFIRMATION_NOT_FOUND', 'The confirmation is not available.', 404)
      if (confirmation[0].status === 'ACCEPTED') {
        const replay = { id: confirmation[0].id, status: 'ACCEPTED', resultRef: confirmation[0].resultRef, alreadyDecided: true }
        await this.completeOperation(tx, context, 'agent.runtime.confirm', key, replay)
        return replay
      }
      if (runs[0].status !== 'WAITING_FOR_CONFIRMATION') {
        throw new PlatformError('AGENT_RUN_NOT_CONFIRMABLE', 'The agent run is no longer waiting for this confirmation.', 409)
      }
      if (confirmation[0].status !== 'PROCESSING') throw new PlatformError('AGENT_CONFIRMATION_PROCESSING', 'The formula draft effect cannot be finalized from the current confirmation state.', 409)
      if (effects[0].status !== 'APPLYING' || effects[0].claimTokenHash !== staged.effectClaimHash) {
        throw new PlatformError('AGENT_CONFIRMATION_EFFECT_STALE', 'This draft effect lease is no longer current.', 409)
      }
      const completedRun = await tx.$queryRaw<Array<{ id: string }>>`UPDATE v2_agent_runs SET status = 'SUCCEEDED', updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId} AND status = 'WAITING_FOR_CONFIRMATION' RETURNING id`
      if (!completedRun[0]) throw new PlatformError('AGENT_RUN_NOT_CONFIRMABLE', 'The agent run changed before confirmation could be finalized.', 409)
      await tx.$executeRaw`UPDATE v2_agent_confirmation_effects SET status = 'APPLIED', result_ref = ${resultRef}, error_code = NULL, completed_at = now(), claim_token_hash = NULL, claim_expires_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND confirmation_id = ${confirmationId} AND status = 'APPLYING' AND claim_token_hash = ${staged.effectClaimHash}`
      await tx.$executeRaw`UPDATE v2_agent_confirmations SET status = 'ACCEPTED', result_ref = ${resultRef}, decided_by = COALESCE(decided_by, ${context.userId}), decided_at = now() WHERE organization_id = ${context.organizationId} AND id = ${confirmationId} AND status = 'PROCESSING'`
      await tx.$executeRaw`UPDATE v2_agent_run_nodes SET status = 'SUCCEEDED', output_hash = ${digest({ confirmationId, resultRef, decision: 'APPROVE' })}, completed_at = now(), updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${confirmation[0].runNodeId}`
      await this.releaseRunQuota(tx, context, runId)
      await tx.$executeRaw`INSERT INTO v2_agent_lineage_refs (id, organization_id, run_id, source_kind, source_ref, target_kind, target_ref, relation_type, metadata, correlation_id) SELECT ${identifier('agent_lineage')}, organization_id, id, 'ARTIFACT', ${confirmation[0].intentId}, 'DOMAIN_RECORD', ${resultRef}, 'CONFIRMED_BY', ${JSON.stringify({ confirmationId })}::jsonb, correlation_id FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId} ON CONFLICT DO NOTHING`
      await this.event(tx, context, runId, 'confirmation.decided', { status: 'SUCCEEDED', references: [confirmationId, resultRef], metadata: { decision: 'APPROVE' } })
      await this.event(tx, context, runId, 'run.completed', { status: 'SUCCEEDED', references: [runId] })
      await this.audit(tx, context, 'agent.confirmation.decide', 'allowed', runId, { confirmationId, decision: 'APPROVE', resultRef, effectKey: staged.effectKey })
      const result = { id: confirmation[0].id, status: 'ACCEPTED', resultRef, alreadyDecided: false }
      await this.completeOperation(tx, context, 'agent.runtime.confirm', key, result)
      return result
    })
  }

  /**
   * Human confirmation is a sensitive Formula boundary. This projection is
   * deliberately hash/reference-only so a confirmer can verify intent without
   * receiving raw provider content, formula composition, or prompt text.
   */
  async confirmationPreview(context: PlatformContext, runId: string, confirmationId: string) {
    await this.platform.requirePermission(context, 'agent.confirmWrite')
    await this.platform.requirePermission(context, 'formula.viewSensitive')
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: string
        actionKey: string
        status: string
        expiresAt: Date
        actionPayload: JsonRecord
        actionHash: string
        initiatorUserId: string
      }>>`SELECT c.id, c.action_key AS "actionKey", c.status, c.expires_at AS "expiresAt", i.action_payload AS "actionPayload", i.payload_hash AS "actionHash", i.created_by AS "initiatorUserId" FROM v2_agent_confirmations c JOIN v2_agent_confirmation_intents i ON i.organization_id = c.organization_id AND i.id = c.confirmation_intent_id WHERE c.organization_id = ${context.organizationId} AND c.run_id = ${runId} AND c.id = ${confirmationId}`
      const confirmation = rows[0]
      if (!confirmation) throw new PlatformError('AGENT_CONFIRMATION_NOT_FOUND', 'The confirmation is not available.', 404)
      const lineage = await tx.$queryRaw<Array<{ sourceHash: string | null; targetHash: string | null }>>`SELECT source_content_hash AS "sourceHash", target_content_hash AS "targetHash" FROM v2_agent_lineage_refs WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND (source_content_hash IS NOT NULL OR target_content_hash IS NOT NULL) ORDER BY created_at ASC LIMIT 32`
      const evidenceHashes = [
        ...( /^[a-f0-9]{64}$/i.test(confirmation.actionHash) ? [{ kind: 'confirmation_intent', hash: confirmation.actionHash.toLowerCase() }] : []),
        ...lineage.flatMap((item) => [
          ...(item.sourceHash && /^[a-f0-9]{64}$/i.test(item.sourceHash) ? [{ kind: 'lineage_source', hash: item.sourceHash.toLowerCase() }] : []),
          ...(item.targetHash && /^[a-f0-9]{64}$/i.test(item.targetHash) ? [{ kind: 'lineage_target', hash: item.targetHash.toLowerCase() }] : []),
        ]),
      ].filter((item, index, list) => list.findIndex((candidate) => candidate.kind === item.kind && candidate.hash === item.hash) === index)
      const candidateId = typeof confirmation.actionPayload.candidateId === 'string' && safeReference.test(confirmation.actionPayload.candidateId) ? confirmation.actionPayload.candidateId : undefined
      const formulaProjectId = typeof confirmation.actionPayload.formulaProjectId === 'string' && safeReference.test(confirmation.actionPayload.formulaProjectId) ? confirmation.actionPayload.formulaProjectId : undefined
      return {
        runId,
        confirmationId: confirmation.id,
        actionKey: confirmation.actionKey,
        status: confirmation.status,
        expiresAt: confirmation.expiresAt.toISOString(),
        ...(candidateId ? { candidateId } : {}),
        ...(formulaProjectId ? { formulaProjectId } : {}),
        ...( /^[a-f0-9]{64}$/i.test(confirmation.actionHash) ? { actionHash: confirmation.actionHash.toLowerCase() } : {}),
        ...(safeReference.test(confirmation.initiatorUserId) ? { initiatorUserId: confirmation.initiatorUserId } : {}),
        evidenceHashes,
      }
    })
  }

  private async legacyConfirm(context: PlatformContext, runId: string, confirmationId: string, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'agent.confirmWrite')
    const parsed = agentConfirmationDecisionSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide an explicit research confirmation decision.', 422)
    return this.idempotent(context, 'agent.runs.confirm', key, { runId, confirmationId, ...parsed.data }, async (tx) => {
      const confirmation = await tx.$queryRaw<ConfirmationRow[]>`SELECT c.id, c.status, c.action_key AS "actionKey", c.expires_at AS "expiresAt", c.result_ref AS "resultRef" FROM v2_agent_confirmations c JOIN v2_agent_runs r ON r.id = c.run_id AND r.organization_id = c.organization_id WHERE c.organization_id = ${context.organizationId} AND c.run_id = ${runId} AND c.id = ${confirmationId} AND r.creator_user_id = ${context.userId} FOR UPDATE`
      if (!confirmation[0]) throw new PlatformError('AGENT_CONFIRMATION_NOT_FOUND', 'The research confirmation is not available.', 404)
      const current = confirmation[0]
      if (current.status !== 'PENDING') return { id: current.id, status: current.status, resultRef: current.resultRef, alreadyDecided: true }
      if (current.expiresAt.getTime() <= Date.now()) {
        await tx.$executeRaw`UPDATE v2_agent_confirmations SET status = 'EXPIRED', decided_by = ${context.userId}, decided_at = now() WHERE organization_id = ${context.organizationId} AND id = ${confirmationId} AND status = 'PENDING'`
        await tx.$executeRaw`UPDATE v2_agent_runs SET status = 'FAILED', updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId} AND status = 'WAITING_FOR_CONFIRMATION'`
        await tx.$executeRaw`UPDATE v2_agent_jobs SET status = 'FAILED', updated_at = now() WHERE organization_id = ${context.organizationId} AND run_id = ${runId}`
        await this.event(tx, context, runId, 'confirmation.expired', { status: 'FAILED', confirmationId })
        await this.audit(tx, context, 'agent.confirmation.expire', 'blocked', runId, { confirmationId })
        return { id: current.id, status: 'EXPIRED', code: 'AGENT_CONFIRMATION_EXPIRED', alreadyDecided: false }
      }
      const result = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_agent_artifacts WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND artifact_type = 'research_summary' ORDER BY created_at DESC LIMIT 1`
      const nextStatus = parsed.data.accept ? 'ACCEPTED' : 'REJECTED'
      const runStatus = parsed.data.accept ? 'SUCCEEDED' : 'CANCELLED'
      await tx.$executeRaw`UPDATE v2_agent_confirmations SET status = ${nextStatus}, result_ref = ${result[0]?.id ?? null}, decided_by = ${context.userId}, decided_at = now() WHERE organization_id = ${context.organizationId} AND id = ${confirmationId} AND status = 'PENDING'`
      await tx.$executeRaw`UPDATE v2_agent_runs SET status = ${runStatus}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId} AND creator_user_id = ${context.userId} AND status = 'WAITING_FOR_CONFIRMATION'`
      await this.event(tx, context, runId, 'confirmation.decided', { status: runStatus, confirmationId, decision: nextStatus })
      await this.event(tx, context, runId, parsed.data.accept ? 'run.completed' : 'run.cancelled', { status: runStatus })
      await this.audit(tx, context, 'agent.confirmation.decide', 'allowed', runId, { confirmationId, decision: nextStatus, resultRef: result[0]?.id ?? null })
      return { id: current.id, status: nextStatus, resultRef: result[0]?.id ?? null, alreadyDecided: false }
    })
  }

  async retry(context: PlatformContext, runId: string, key?: string) {
    await this.platform.requirePermission(context, 'agent.execute')
    return this.idempotent(context, 'agent.runs.retry', key, { runId }, async (tx) => {
      const run = await tx.$queryRaw<Array<{ id: string; protocolVersion: string; workflowKey: string }>>`SELECT id, protocol_version AS "protocolVersion", workflow_key AS "workflowKey" FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId} AND (protocol_version = ${p9Protocol} OR creator_user_id = ${context.userId}) AND status = 'FAILED' FOR UPDATE`
      if (!run[0]) throw new PlatformError('AGENT_RUN_NOT_RETRYABLE', 'Only a failed research run can be retried.', 409)
      const retryLimit = run[0].protocolVersion === p9Protocol ? 2 : 3
      if (run[0].protocolVersion === p9Protocol) {
        const definitionKey = run[0].workflowKey.split('/')[0] as BuiltinAgentKey
        const template = BUILTIN_AGENT_CATALOG[definitionKey]
        if (!template) throw new PlatformError('AGENT_CONFIGURATION_INVALID', 'The persisted workflow is not registered by the server.', 500)
        await this.reserveRunQuota(tx, context, runId, template.policy)
      }
      const job = await tx.$queryRaw<Array<{ id: string }>>`UPDATE v2_agent_jobs SET status = 'QUEUED', attempts = CASE WHEN protocol_version = ${p9Protocol} THEN attempts + 1 ELSE attempts END, available_at = now(), lease_token_hash = NULL, lease_expires_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND attempts < ${retryLimit} RETURNING id`
      if (!job[0]) throw new PlatformError('AGENT_RETRY_LIMIT', 'This research run has reached its retry limit.', 409)
      if (run[0].protocolVersion === p9Protocol) await tx.$executeRaw`UPDATE v2_agent_run_nodes SET status = 'READY', attempt = attempt + 1, error_code = NULL, started_at = NULL, completed_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND status = 'FAILED' AND attempt < 3`
      await tx.$executeRaw`UPDATE v2_agent_runs SET status = 'QUEUED', lease_token_hash = NULL, lease_expires_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId}`
      await this.event(tx, context, runId, 'job.retrying', { status: 'QUEUED' })
      await this.event(tx, context, runId, 'run.resumed', { status: 'QUEUED' })
      await this.audit(tx, context, 'agent.run.retry', 'allowed', runId, { attemptsRemaining: 3 })
      return { id: runId, status: 'QUEUED' }
    })
  }

  async cancel(context: PlatformContext, runId: string, key?: string) {
    await this.platform.requirePermission(context, 'agent.execute')
    return this.idempotent(context, 'agent.runs.cancel', key, { runId }, async (tx) => {
      const runs = await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT id, status FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId} AND (protocol_version = ${p9Protocol} OR creator_user_id = ${context.userId}) FOR UPDATE`
      const run = runs[0]
      if (!run || !['QUEUED', 'RUNNING', 'WAITING_FOR_CONFIRMATION'].includes(run.status)) {
        throw new PlatformError('AGENT_RUN_NOT_CANCELLABLE', 'The research run is not active or is not available.', 409)
      }
      const activeConfirmations = await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT id, status FROM v2_agent_confirmations WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND status IN ('PENDING','PROCESSING') FOR UPDATE`
      if (activeConfirmations.some((confirmation) => confirmation.status === 'PROCESSING')) {
        throw new PlatformError('AGENT_CONFIRMATION_PROCESSING', 'A confirmed Formula draft effect is being applied and cannot be cancelled.', 409)
      }
      const updated = await tx.$executeRaw`UPDATE v2_agent_runs SET status = 'CANCELLED', lease_token_hash = NULL, lease_expires_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId} AND status IN ('QUEUED','RUNNING','WAITING_FOR_CONFIRMATION')`
      if (!updated) throw new PlatformError('AGENT_RUN_NOT_CANCELLABLE', 'The research run is not active or is not available.', 409)
      await tx.$executeRaw`UPDATE v2_agent_jobs SET status = 'CANCELLED', lease_token_hash = NULL, lease_expires_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND run_id = ${runId}`
      await tx.$executeRaw`UPDATE v2_agent_confirmations SET status = 'CANCELLED', decided_by = ${context.userId}, decided_at = now() WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND status = 'PENDING'`
      await tx.$executeRaw`UPDATE v2_agent_run_nodes SET status = 'CANCELLED', completed_at = now(), updated_at = now() WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND status IN ('PENDING','READY','RUNNING','WAITING_FOR_TOOL','WAITING_FOR_CONFIRMATION')`
      await this.releaseRunQuota(tx, context, runId)
      await this.event(tx, context, runId, 'job.cancelled', { status: 'CANCELLED' })
      await this.event(tx, context, runId, 'run.cancelled', { status: 'CANCELLED' })
      await this.audit(tx, context, 'agent.run.cancel', 'allowed', runId, {})
      return { id: runId, status: 'CANCELLED' }
    })
  }

  private async legacyDetail(context: PlatformContext, runId: string, afterSequence = 0) {
    await this.platform.requirePermission(context, 'agent.view')
    return this.scoped(context, async (tx) => {
      const run = await tx.$queryRaw<Array<{ id: string; status: string; nextSequence: number; createdAt: Date; updatedAt: Date }>>`SELECT id, status, next_sequence AS "nextSequence", created_at AS "createdAt", updated_at AS "updatedAt" FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId} AND creator_user_id = ${context.userId}`
      if (!run[0]) throw new PlatformError('AGENT_RUN_NOT_FOUND', 'The research run is not available.', 404)
      const events = await tx.$queryRaw<Array<{ id: string; sequence: number; type: string; payload: JsonRecord; createdAt: Date }>>`SELECT id, sequence, event_type AS type, payload, created_at AS "createdAt" FROM v2_agent_events WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND sequence > ${Math.max(0, afterSequence)} ORDER BY sequence ASC LIMIT 200`
      const artifacts = await tx.$queryRaw<Array<{ id: string; type: string; payload: JsonRecord }>>`SELECT id, artifact_type AS type, payload FROM v2_agent_artifacts WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND artifact_type <> 'run_input' ORDER BY created_at ASC`
      const confirmations = await tx.$queryRaw<Array<{ id: string; actionKey: string; status: string; expiresAt: Date; resultRef: string | null }>>`SELECT id, action_key AS "actionKey", status, expires_at AS "expiresAt", result_ref AS "resultRef" FROM v2_agent_confirmations WHERE organization_id = ${context.organizationId} AND run_id = ${runId} ORDER BY created_at ASC`
      return { run: run[0], events, artifacts, confirmations }
    })
  }

  async listRuns(context: PlatformContext, query: Readonly<{ after?: string; limit: number; definitionKey?: string; status?: string }>) {
    await this.platform.requirePermission(context, 'agent.view')
    const limit = Math.max(1, Math.min(100, Math.trunc(query.limit || 50)))
    return this.scoped(context, async (tx) => {
      const cursor = query.after ? await tx.$queryRaw<Array<{ createdAt: Date }>>`SELECT created_at AS "createdAt" FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${query.after}` : []
      return tx.$queryRaw<JsonRecord[]>`SELECT r.id, r.status, r.workflow_key AS "workflowKey", split_part(r.workflow_key, '/', 1) AS "definitionKey", r.protocol_version AS "protocolVersion", r.correlation_id AS "correlationId", r.next_sequence AS "nextSequence", r.created_at AS "createdAt", r.updated_at AS "updatedAt" FROM v2_agent_runs r WHERE r.organization_id = ${context.organizationId} AND (${query.definitionKey ?? null}::text IS NULL OR split_part(r.workflow_key, '/', 1) = ${query.definitionKey ?? null}) AND (${query.status ?? null}::text IS NULL OR r.status = ${query.status ?? null}) AND (${cursor[0]?.createdAt ?? null}::timestamptz IS NULL OR r.created_at < ${cursor[0]?.createdAt ?? null}) ORDER BY r.created_at DESC LIMIT ${limit}`
    })
  }

  async detail(context: PlatformContext, runId: string, afterSequence = 0) {
    await this.platform.requirePermission(context, 'agent.view')
    const protocol = await this.scoped(context, (tx) => tx.$queryRaw<Array<{ protocolVersion: string }>>`SELECT protocol_version AS "protocolVersion" FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId}`)
    if (!protocol[0]) throw new PlatformError('AGENT_RUN_NOT_FOUND', 'The agent run is not available.', 404)
    if (protocol[0].protocolVersion !== p9Protocol) return this.legacyDetail(context, runId, afterSequence)
    return this.scoped(context, async (tx) => {
      const runs = await tx.$queryRaw<JsonRecord[]>`SELECT r.id, r.status, r.workflow_key AS "workflowKey", split_part(r.workflow_key, '/', 1) AS "definitionKey", r.protocol_version AS "protocolVersion", r.correlation_id AS "correlationId", r.next_sequence AS "nextSequence", r.created_at AS "createdAt", r.updated_at AS "updatedAt" FROM v2_agent_runs r WHERE r.organization_id = ${context.organizationId} AND r.id = ${runId}`
      const events = await tx.$queryRaw<JsonRecord[]>`SELECT id, sequence, event_type AS type, payload, created_at AS "createdAt" FROM v2_agent_events WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND sequence > ${Math.max(0, afterSequence)} ORDER BY sequence ASC LIMIT 200`
      const artifacts = await tx.$queryRaw<JsonRecord[]>`SELECT id, artifact_type AS type, payload_hash AS "payloadHash", schema_version AS "schemaVersion", redaction_status AS "redactionStatus", run_node_id AS "runNodeId", created_at AS "createdAt" FROM v2_agent_artifacts WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND artifact_type <> 'run_input' ORDER BY created_at ASC`
      const confirmations = await tx.$queryRaw<JsonRecord[]>`SELECT id, action_key AS "actionKey", status, expires_at AS "expiresAt", result_ref AS "resultRef", created_at AS "createdAt" FROM v2_agent_confirmations WHERE organization_id = ${context.organizationId} AND run_id = ${runId} ORDER BY created_at ASC`
      const toolCalls = await tx.$queryRaw<JsonRecord[]>`SELECT id, tool_key AS "toolKey", status, input_hash AS "inputHash", output_hash AS "outputHash", attempt, run_node_id AS "runNodeId", created_at AS "createdAt" FROM v2_agent_tool_calls WHERE organization_id = ${context.organizationId} AND run_id = ${runId} ORDER BY created_at ASC`
      const nodes = await tx.$queryRaw<JsonRecord[]>`SELECT id, workflow_node_key AS "nodeKey", node_kind AS kind, status, attempt, error_code AS "errorCode", started_at AS "startedAt", completed_at AS "completedAt" FROM v2_agent_run_nodes WHERE organization_id = ${context.organizationId} AND run_id = ${runId} ORDER BY created_at ASC`
      return { run: { ...runs[0], nodes }, events, artifacts, confirmations, toolCalls }
    })
  }

  async replay(context: PlatformContext, runId: string, query: Readonly<{ afterSequence: number; limit: number }>) {
    await this.platform.requirePermission(context, 'agent.view')
    return this.scoped(context, async (tx) => {
      const runs = await tx.$queryRaw<Array<{ id: string; status: string; workflowKey: string; nextSequence: number; createdAt: Date; updatedAt: Date }>>`SELECT id, status, workflow_key AS "workflowKey", next_sequence AS "nextSequence", created_at AS "createdAt", updated_at AS "updatedAt" FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId}`
      if (!runs[0]) throw new PlatformError('AGENT_RUN_NOT_FOUND', 'The agent run is not available.', 404)
      const rows = await tx.$queryRaw<Array<{ id: string; sequence: number; type: string; payload: JsonRecord; createdAt: Date }>>`SELECT id, sequence, event_type AS type, payload, created_at AS "createdAt" FROM v2_agent_events WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND sequence > ${query.afterSequence} ORDER BY sequence ASC LIMIT ${Math.max(1, Math.min(query.limit, AGENT_RUNTIME_LIMITS.maxReplayEvents))}`
      const events = rows.map((event) => ({ ...event, runId, createdAt: event.createdAt.toISOString() }))
      const reconciled = reconcileAgentEventReplay(events, { afterSequence: query.afterSequence, latestSequence: runs[0].nextSequence - 1, maxEvents: Math.max(1, Math.min(query.limit, AGENT_RUNTIME_LIMITS.maxReplayEvents)) })
      return { run: runs[0], events: reconciled.events, cursor: String(reconciled.nextSequence), resyncRequired: reconciled.resyncRequired }
    })
  }

  async evidence(context: PlatformContext, runId: string) {
    await this.platform.requirePermission(context, 'agent.view')
    return this.scoped(context, async (tx) => {
      const exists = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId}`
      if (!exists[0]) throw new PlatformError('AGENT_RUN_NOT_FOUND', 'The agent run is not available.', 404)
      const lineage = await tx.$queryRaw<JsonRecord[]>`SELECT id, source_kind AS "sourceKind", source_ref AS "sourceRef", target_kind AS "targetKind", target_ref AS "targetRef", relation_type AS "relationType", source_content_hash AS "sourceContentHash", target_content_hash AS "targetContentHash", metadata, created_at AS "createdAt" FROM v2_agent_lineage_refs WHERE organization_id = ${context.organizationId} AND run_id = ${runId} ORDER BY created_at ASC`
      const providerUsage = await tx.$queryRaw<JsonRecord[]>`SELECT id, provider_key AS "providerKey", model_identifier AS "modelIdentifier", usage_status AS "usageStatus", request_hash AS "requestHash", response_hash AS "responseHash", input_tokens AS "inputTokens", output_tokens AS "outputTokens", total_cost_micros::text AS "totalCostMicros", created_at AS "createdAt" FROM v2_agent_provider_usages WHERE organization_id = ${context.organizationId} AND run_id = ${runId} ORDER BY created_at ASC`
      return { runId, lineage, providerUsage }
    })
  }

  async listEvaluations(context: PlatformContext, query: Readonly<{ after?: string; limit: number }>) {
    await this.platform.requirePermission(context, 'agent.evaluate')
    const limit = Math.max(1, Math.min(100, Math.trunc(query.limit || 50)))
    return this.scoped(context, (tx) => tx.$queryRaw<JsonRecord[]>`SELECT e.id, e.run_id AS "runId", split_part(r.workflow_key, '/', 1) AS "definitionKey", e.evaluation_key AS "evaluationKey", e.subject_kind AS "subjectKind", e.subject_ref AS "subjectRef", e.evaluator_kind AS "evaluatorKind", e.status, e.score::float8 AS score, e.result_hash AS "resultHash", e.created_at AS "createdAt" FROM v2_agent_evaluations e JOIN v2_agent_runs r ON r.organization_id = e.organization_id AND r.id = e.run_id WHERE e.organization_id = ${context.organizationId} AND (${query.after ?? null}::text IS NULL OR e.id < ${query.after ?? null}) ORDER BY e.created_at DESC LIMIT ${limit}`)
  }

  async createEvaluation(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'agent.evaluate')
    const parsed = agentEvaluationCreateRequestSchema.safeParse(rawInput)
    if (!parsed.success || parsed.data.subjectKind !== 'RUN' || parsed.data.evaluatorKind === 'PROVIDER' || parsed.data.subjectRef.length > 160) throw new PlatformError('AGENT_EVALUATION_INVALID', 'Only bounded rule or human run evaluations may be recorded.', 422)
    assertSafeAgentRuntimePayload(parsed.data.resultSummary, AGENT_RUNTIME_LIMITS.maxEventPayloadBytes)
    return this.idempotent(context, 'agent.evaluations.create', key, parsed.data, async (tx) => {
      const run = await tx.$queryRaw<Array<{ id: string; policyVersionId: string }>>`SELECT id, policy_version_id AS "policyVersionId" FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${parsed.data.subjectRef}`
      if (!run[0] || run[0].policyVersionId !== parsed.data.policyVersionId) throw new PlatformError('AGENT_RUN_NOT_FOUND', 'The evaluated run is not available under this policy.', 404)
      if (parsed.data.runNodeId) {
        const node = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_agent_run_nodes WHERE organization_id = ${context.organizationId} AND run_id = ${run[0].id} AND id = ${parsed.data.runNodeId}`
        if (!node[0]) throw new PlatformError('AGENT_RUN_NODE_NOT_FOUND', 'The evaluation node does not belong to the evaluated run.', 404)
      }
      const id = identifier('agent_eval')
      await tx.$executeRaw`INSERT INTO v2_agent_evaluations (id, organization_id, run_id, run_node_id, policy_version_id, evaluation_key, subject_kind, subject_ref, evaluator_kind, status, score, result_summary, result_hash, evaluated_by, correlation_id) VALUES (${id}, ${context.organizationId}, ${run[0].id}, ${parsed.data.runNodeId ?? null}, ${parsed.data.policyVersionId}, ${parsed.data.evaluationKey}, ${parsed.data.subjectKind}, ${parsed.data.subjectRef}, ${parsed.data.evaluatorKind}, ${parsed.data.status}, ${parsed.data.score ?? null}, ${JSON.stringify(parsed.data.resultSummary)}::jsonb, ${parsed.data.resultHash}, ${context.userId}, ${parsed.data.correlationId})`
      await this.audit(tx, context, 'agent.evaluation.create', 'allowed', run[0].id, { evaluationId: id, resultHash: parsed.data.resultHash })
      return { id, runId: run[0].id, status: parsed.data.status, score: parsed.data.score ?? null }
    })
  }

  async evaluationDetail(context: PlatformContext, evaluationId: string) {
    await this.platform.requirePermission(context, 'agent.evaluate')
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<JsonRecord[]>`SELECT id, run_id AS "runId", run_node_id AS "runNodeId", policy_version_id AS "policyVersionId", evaluation_key AS "evaluationKey", subject_kind AS "subjectKind", subject_ref AS "subjectRef", evaluator_kind AS "evaluatorKind", status, score::float8 AS score, result_summary AS "resultSummary", result_hash AS "resultHash", correlation_id AS "correlationId", created_at AS "createdAt" FROM v2_agent_evaluations WHERE organization_id = ${context.organizationId} AND id = ${evaluationId}`
      if (!rows[0]) throw new PlatformError('AGENT_EVALUATION_NOT_FOUND', 'The evaluation is not available.', 404)
      return rows[0]
    })
  }

  async observability(context: PlatformContext) {
    await this.platform.requirePermission(context, 'agent.observe')
    return this.scoped(context, async (tx) => {
      const runs = await tx.$queryRaw<Array<{ id: string; status: string; startedAt: Date | null; completedAt: Date | null; retryCount: number }>>`SELECT r.id, r.status, min(n.started_at) AS "startedAt", max(n.completed_at) AS "completedAt", GREATEST(max(j.attempts), 0)::int AS "retryCount" FROM v2_agent_runs r LEFT JOIN v2_agent_run_nodes n ON n.organization_id = r.organization_id AND n.run_id = r.id LEFT JOIN v2_agent_jobs j ON j.organization_id = r.organization_id AND j.run_id = r.id WHERE r.organization_id = ${context.organizationId} GROUP BY r.id ORDER BY r.created_at DESC LIMIT 100`
      const snapshots = []
      for (const run of runs) {
        const toolCalls = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM v2_agent_tool_calls WHERE organization_id = ${context.organizationId} AND run_id = ${run.id}`
        const providerUsages = await tx.$queryRaw<Array<{ status: string; inputTokens: number; outputTokens: number; costMicros: bigint; latencyMs: number | null }>>`SELECT usage_status AS status, input_tokens AS "inputTokens", output_tokens AS "outputTokens", total_cost_micros AS "costMicros", CASE WHEN completed_at IS NULL THEN NULL ELSE floor(extract(epoch from (completed_at - started_at)) * 1000)::int END AS "latencyMs" FROM v2_agent_provider_usages WHERE organization_id = ${context.organizationId} AND run_id = ${run.id}`
        const confirmations = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM v2_agent_confirmations WHERE organization_id = ${context.organizationId} AND run_id = ${run.id}`
        snapshots.push(summarizeAgentObservability({ runId: run.id, status: run.status, startedAt: run.startedAt?.toISOString() ?? null, completedAt: run.completedAt?.toISOString() ?? null, toolCalls, providerUsages: providerUsages.map((usage) => ({ ...usage, costMicros: Number(usage.costMicros) })), confirmations, retryCount: run.retryCount }))
      }
      return { runs: snapshots, generatedAt: new Date().toISOString() }
    })
  }
}
