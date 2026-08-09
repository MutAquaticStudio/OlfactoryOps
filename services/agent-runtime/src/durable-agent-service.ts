import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { agentConfirmationDecisionSchema, agentRunRequestSchema } from '../../../packages/contracts/src/formula-intelligence.js'
import { PlatformError, PlatformService } from '../../platform/src/service.js'
import type { PlatformContext } from '../../platform/src/types.js'
import { NotConfiguredFormulaLlmGateway, type FormulaLlmGateway } from './provider-gateway.js'
import { boundedToolPayload, formulaAgentToolPolicy } from './tool-registry.js'

type Transaction = Prisma.TransactionClient
type JsonRecord = Record<string, unknown>
type IdempotencyRow = { requestHash: string; response: unknown }
type ConfirmationRow = { id: string; status: string; actionKey: string; expiresAt: Date; resultRef: string | null }
const identifier = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '')}`
const digest = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const confirmationAction = 'RESEARCH_REVIEW'

/**
 * The durable runtime owns only read-only research. Confirmation completes a
 * research run; it never saves a formula, reserves inventory, or bypasses the
 * FormulaService approval path.
 */
export class DurableAgentService {
  constructor(private readonly client: PrismaClient, private readonly platform: PlatformService, private readonly gateway: FormulaLlmGateway = new NotConfiguredFormulaLlmGateway()) {}

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

  private async assertLease(tx: Transaction, context: PlatformContext, runId: string, leaseHash: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId} AND creator_user_id = ${context.userId} AND lease_token_hash = ${leaseHash} AND lease_expires_at > now() FOR UPDATE`
    if (!rows[0]) throw new PlatformError('AGENT_LEASE_STALE', 'The research job lease is no longer valid.', 409)
  }

  private async event(tx: Transaction, context: PlatformContext, runId: string, type: string, payload: JsonRecord, leaseHash?: string) {
    if (leaseHash) await this.assertLease(tx, context, runId, leaseHash)
    const sequence = await tx.$queryRaw<Array<{ sequence: number }>>`UPDATE v2_agent_runs SET next_sequence = next_sequence + 1, version = version + 1, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId} AND creator_user_id = ${context.userId} RETURNING next_sequence - 1 AS sequence`
    if (!sequence[0]) throw new PlatformError('AGENT_RUN_NOT_FOUND', 'The research run is not available.', 404)
    await tx.$executeRaw`INSERT INTO v2_agent_events (id, organization_id, run_id, sequence, event_type, payload) VALUES (${identifier('agent_event')}, ${context.organizationId}, ${runId}, ${sequence[0].sequence}, ${type}, ${JSON.stringify(payload)}::jsonb)`
  }

  async start(context: PlatformContext, rawInput: unknown, key?: string) {
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
    return this.idempotent(context, 'agent.runs.execute', key, { runId }, async (tx) => {
      const run = await tx.$queryRaw<Array<{ status: string; workflowKey: string; correlationId: string }>>`SELECT status, workflow_key AS "workflowKey", correlation_id AS "correlationId" FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId} AND creator_user_id = ${context.userId} FOR UPDATE`
      if (!run[0]) throw new PlatformError('AGENT_RUN_NOT_FOUND', 'The research run is not available.', 404)
      if (run[0].status !== 'QUEUED') throw new PlatformError('AGENT_RUN_STATE_INVALID', 'This research run cannot be executed from its current state.', 409)
      const leaseHash = digest(randomBytes(32).toString('base64url'))
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
      const run = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId} AND creator_user_id = ${context.userId} AND status = 'FAILED' FOR UPDATE`
      if (!run[0]) throw new PlatformError('AGENT_RUN_NOT_RETRYABLE', 'Only a failed research run can be retried.', 409)
      const job = await tx.$queryRaw<Array<{ id: string }>>`UPDATE v2_agent_jobs SET status = 'QUEUED', available_at = now(), lease_token_hash = NULL, lease_expires_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND attempts < 3 RETURNING id`
      if (!job[0]) throw new PlatformError('AGENT_RETRY_LIMIT', 'This research run has reached its retry limit.', 409)
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
      const updated = await tx.$executeRaw`UPDATE v2_agent_runs SET status = 'CANCELLED', lease_token_hash = NULL, lease_expires_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId} AND creator_user_id = ${context.userId} AND status IN ('QUEUED','RUNNING','WAITING_FOR_CONFIRMATION')`
      if (!updated) throw new PlatformError('AGENT_RUN_NOT_CANCELLABLE', 'The research run is not active or is not available.', 409)
      await tx.$executeRaw`UPDATE v2_agent_jobs SET status = 'CANCELLED', lease_token_hash = NULL, lease_expires_at = NULL, updated_at = now() WHERE organization_id = ${context.organizationId} AND run_id = ${runId}`
      await tx.$executeRaw`UPDATE v2_agent_confirmations SET status = 'CANCELLED', decided_by = ${context.userId}, decided_at = now() WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND status = 'PENDING'`
      await this.event(tx, context, runId, 'job.cancelled', { status: 'CANCELLED' })
      await this.event(tx, context, runId, 'run.cancelled', { status: 'CANCELLED' })
      await this.audit(tx, context, 'agent.run.cancel', 'allowed', runId, {})
      return { id: runId, status: 'CANCELLED' }
    })
  }

  async detail(context: PlatformContext, runId: string, afterSequence = 0) {
    await this.platform.requirePermission(context, 'agent.execute')
    return this.scoped(context, async (tx) => {
      const run = await tx.$queryRaw<Array<{ id: string; status: string; nextSequence: number; createdAt: Date; updatedAt: Date }>>`SELECT id, status, next_sequence AS "nextSequence", created_at AS "createdAt", updated_at AS "updatedAt" FROM v2_agent_runs WHERE organization_id = ${context.organizationId} AND id = ${runId} AND creator_user_id = ${context.userId}`
      if (!run[0]) throw new PlatformError('AGENT_RUN_NOT_FOUND', 'The research run is not available.', 404)
      const events = await tx.$queryRaw<Array<{ id: string; sequence: number; type: string; payload: JsonRecord; createdAt: Date }>>`SELECT id, sequence, event_type AS type, payload, created_at AS "createdAt" FROM v2_agent_events WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND sequence > ${Math.max(0, afterSequence)} ORDER BY sequence ASC LIMIT 200`
      const artifacts = await tx.$queryRaw<Array<{ id: string; type: string; payload: JsonRecord }>>`SELECT id, artifact_type AS type, payload FROM v2_agent_artifacts WHERE organization_id = ${context.organizationId} AND run_id = ${runId} AND artifact_type <> 'run_input' ORDER BY created_at ASC`
      const confirmations = await tx.$queryRaw<Array<{ id: string; actionKey: string; status: string; expiresAt: Date; resultRef: string | null }>>`SELECT id, action_key AS "actionKey", status, expires_at AS "expiresAt", result_ref AS "resultRef" FROM v2_agent_confirmations WHERE organization_id = ${context.organizationId} AND run_id = ${runId} ORDER BY created_at ASC`
      return { run: run[0], events, artifacts, confirmations }
    })
  }
}
