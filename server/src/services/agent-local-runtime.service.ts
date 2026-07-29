import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  AGENT_PROTOCOL_VERSION,
  agentArtifactSchema,
  agentFormulaProposalSchema,
  agentNodeDefinitions,
  type AgentArtifact,
  type AgentFormulaProposal,
  type AgentRuntimeEvent,
  type AgentRunStatus,
} from '../../../src/data/agentRuntime.js'
import type { AuthSession } from '../../../src/data/northStar.js'
import { NorthStarService } from './northstar.service.js'

type LocalNode = { id: string; node_type: string; status: string; attempt: number }
type LocalMessage = { id: string; role: 'user' | 'assistant'; content: string; status: 'STREAMING' | 'COMPLETED'; created_at: string; completed_at?: string }
type LocalRun = {
  id: string; organization_id: string; user_id: string; session_id: string; status: AgentRunStatus
  input_brief: string; progress: number; provider: string; model_name: string; created_at: string; updated_at: string
  last_event_sequence: number; nodes: LocalNode[]; messages: LocalMessage[]; artifacts: Array<{ id: string; type: string; version: number; data: AgentArtifact; status: string }>
  events: AgentRuntimeEvent[]; confirmation?: { id: string; status: 'PENDING' | 'ACCEPTED' | 'REJECTED'; summary: string; proposal: AgentFormulaProposal; savedFormulaId?: string }
}
type LocalState = { runs: LocalRun[] }

function now() { return new Date().toISOString() }
function actor(session: AuthSession) { return { organizationId: session.organizationId, userId: session.userId, sessionId: session.id } }

@Injectable()
export class AgentLocalRuntimeService {
  private readonly storagePath = join(process.cwd(), '.olfactoryops-agent.local.json')
  private state: LocalState = { runs: [] }
  private initialized = false
  private writeQueue: Promise<void> = Promise.resolve()

  async list(session: AuthSession) {
    await this.ready()
    const current = actor(session)
    return { data: this.state.runs.filter((run) => run.organization_id === current.organizationId && run.user_id === current.userId).map((run) => this.runSummary(run)) }
  }

  async create(service: NorthStarService, session: AuthSession, body: Record<string, unknown>) {
    await this.ready()
    const current = actor(session)
    const brief = typeof body.brief === 'string' ? body.brief.trim().slice(0, 6000) : ''
    if (brief.length < 8) throw new UnprocessableEntityException('Formula research brief must contain at least 8 characters')
    const timestamp = now()
    const run: LocalRun = {
      id: crypto.randomUUID(), organization_id: current.organizationId, user_id: current.userId, session_id: current.sessionId,
      status: 'QUEUED', input_brief: brief, progress: 0, provider: 'mock', model_name: 'deterministic-v1',
      created_at: timestamp, updated_at: timestamp, last_event_sequence: 0, nodes: [], messages: [{ id: crypto.randomUUID(), role: 'user', content: brief, status: 'COMPLETED', created_at: timestamp, completed_at: timestamp }], artifacts: [], events: [],
    }
    this.state.runs.unshift(run)
    this.event(run, 'run.created', { status: 'QUEUED', progress: 0 })
    this.event(run, 'run.queued', { status: 'QUEUED', progress: 0 })
    await this.persist()
    await this.execute(service, run)
    return this.detail(session, run.id)
  }

  async detail(session: AuthSession, runId: string) {
    await this.ready()
    const run = this.runFor(session, runId)
    return { data: { run: this.runSummary(run), nodes: run.nodes, messages: run.messages ?? [], toolCalls: [], artifacts: run.artifacts, confirmation: run.confirmation } }
  }

  async events(session: AuthSession, runId: string, afterSequence = 0) {
    await this.ready()
    return this.runFor(session, runId).events.filter((event) => event.sequence > afterSequence)
  }

  async artifacts(session: AuthSession, runId: string) {
    await this.ready()
    return { data: this.runFor(session, runId).artifacts }
  }

  async artifact(session: AuthSession, runId: string, artifactId: string) {
    await this.ready()
    const record = this.runFor(session, runId).artifacts.find((artifact) => artifact.id === artifactId)
    if (!record) throw new NotFoundException('Agent artifact was not found')
    return { data: record }
  }

  async cancel(session: AuthSession, runId: string) {
    await this.ready()
    const run = this.runFor(session, runId)
    if (!['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)) {
      run.status = 'CANCELLED'; run.updated_at = now(); this.event(run, 'run.cancelled', { status: 'CANCELLED', progress: run.progress }); await this.persist()
    }
    return this.detail(session, runId)
  }

  async resume(service: NorthStarService, session: AuthSession, runId: string) {
    await this.ready()
    const run = this.runFor(session, runId)
    if (!['PAUSED', 'FAILED'].includes(run.status)) throw new UnprocessableEntityException('Only paused or failed runs can be resumed')
    run.status = 'QUEUED'; run.updated_at = now(); this.event(run, 'run.resumed', { status: 'QUEUED', progress: run.progress }); await this.execute(service, run)
    return this.detail(session, runId)
  }

  async retryNode(service: NorthStarService, session: AuthSession, runId: string, nodeId: string) {
    await this.ready()
    const run = this.runFor(session, runId)
    const node = run.nodes.find((candidate) => candidate.id === nodeId)
    if (!node) throw new NotFoundException('Agent workflow node was not found')
    if (node.status !== 'FAILED') throw new UnprocessableEntityException('Only failed workflow nodes can be retried')
    if (node.attempt >= 2) throw new UnprocessableEntityException('This node has reached its retry limit')
    node.status = 'RETRYING'; node.attempt += 1; run.status = 'QUEUED'; run.updated_at = now()
    this.event(run, 'node.retrying', { nodeId, nodeType: node.node_type, status: 'RETRYING', progress: run.progress })
    await this.execute(service, run)
    return this.detail(session, runId)
  }

  async restart(service: NorthStarService, session: AuthSession, runId: string) {
    const prior = this.runFor(session, runId)
    const result = await this.create(service, session, { brief: prior.input_brief })
    return { data: { previousRunId: runId, run: result.data.run } }
  }

  async resolveConfirmation(service: NorthStarService, session: AuthSession, runId: string, confirmationId: string, decision: unknown) {
    await this.ready()
    const run = this.runFor(session, runId)
    const confirmation = run.confirmation
    if (!confirmation || confirmation.id !== confirmationId) throw new NotFoundException('Agent confirmation was not found')
    if (confirmation.status !== 'PENDING') return { data: { duplicate: true, formulaId: confirmation.savedFormulaId } }
    if (decision === 'reject') {
      confirmation.status = 'REJECTED'; run.status = 'COMPLETED'; run.progress = 100
      this.event(run, 'confirmation.rejected', { confirmationId, summary: 'Formula draft was not saved' })
      this.event(run, 'run.completed', { status: 'COMPLETED', progress: 100 }); await this.persist(); return { data: { rejected: true } }
    }
    const created = service.createFormulaDraft({
      name: confirmation.proposal.name, formulaType: confirmation.proposal.formulaType, targetGrams: confirmation.proposal.targetGrams,
      concentrationType: confirmation.proposal.concentrationType, finalProductConcentrationPercent: confirmation.proposal.finalProductConcentrationPercent,
      ifraCategory: confirmation.proposal.ifraCategory, brief: confirmation.proposal.brief,
    }).data.formula
    const names = new Map(service.materials().data.map((material) => [material.id, material.name]))
    const formula = service.updateFormulaDraft(created.id, {
      expectedRevision: created.draftRevision,
      lines: confirmation.proposal.ingredients.map((ingredient, index) => ({ id: `agent-${index + 1}`, label: names.get(ingredient.materialId) ?? ingredient.materialId, materialId: ingredient.materialId, grams: Number((confirmation.proposal.targetGrams * ingredient.percentage / 100).toFixed(4)), concentration: ingredient.dilution ?? 100, pyramidNote: ingredient.pyramidNote })),
    }).data.formula
    confirmation.status = 'ACCEPTED'; confirmation.savedFormulaId = formula.id; run.status = 'COMPLETED'; run.progress = 100; run.updated_at = now()
    this.event(run, 'confirmation.accepted', { confirmationId, summary: confirmation.summary })
    this.event(run, 'run.completed', { status: 'COMPLETED', progress: 100 }); await this.persist()
    return { data: { formula, confirmationId, invariant: 'agent confirmation creates one editable draft and does not reserve or consume inventory' } }
  }

  private async execute(service: NorthStarService, run: LocalRun) {
    run.status = 'RUNNING'; run.updated_at = now(); this.event(run, 'run.started', { status: 'RUNNING', progress: 0 })
    try {
      const candidates = [...service.materials().data].sort((left, right) => left.name.localeCompare(right.name)).slice(0, 4)
      if (!candidates.length) throw new UnprocessableEntityException('No workspace materials are available for this research run')
      const weights = candidates.length === 1 ? [100] : candidates.length === 2 ? [60, 40] : candidates.length === 3 ? [45, 30, 25] : [40, 25, 20, 15]
      const proposal = agentFormulaProposalSchema.parse({
        name: `${run.input_brief.slice(0, 52).replace(/\s+/g, ' ')} proposal`, formulaType: /\baccord\b/i.test(run.input_brief) ? 'ACCORD' : 'FINE_FRAGRANCE',
        targetGrams: 100, concentrationType: 'EDP', finalProductConcentrationPercent: /\baccord\b/i.test(run.input_brief) ? 100 : 20, ifraCategory: '4', brief: run.input_brief,
        ingredients: candidates.map((material, index) => ({ materialId: material.id, percentage: weights[index], pyramidNote: material.tier === 'Heart' ? 'Middle' : material.tier })),
      })
      const preview = service.previewAgentFormula(proposal).data
      for (const [index, definition] of agentNodeDefinitions.entries()) {
        const node: LocalNode = { id: crypto.randomUUID(), node_type: definition.type, status: definition.type === 'save_formula_draft' ? 'WAITING_FOR_CONFIRMATION' : 'COMPLETED', attempt: 1 }
        run.nodes.push(node)
        const progress = definition.type === 'save_formula_draft' ? 95 : Math.min(90, (index + 1) * 13)
        this.event(run, definition.type === 'save_formula_draft' ? 'node.progress' : 'node.completed', { nodeId: node.id, nodeType: definition.type, status: node.status, progress })
      }
      const materialById = new Map(candidates.map((material) => [material.id, material]))
      const costById = new Map(preview.cost.lines.map((line) => [line.materialId, line]))
      this.persistArtifact(run, { type: 'formula_table', version: 1, data: { formulaName: proposal.name, formulaType: proposal.formulaType, targetGrams: proposal.targetGrams, finalProductConcentrationPercent: proposal.finalProductConcentrationPercent, ingredients: proposal.ingredients.map((ingredient) => { const material = materialById.get(ingredient.materialId)!; const availability = preview.availability.find((item) => item.materialId === ingredient.materialId); const cost = costById.get(ingredient.materialId); return { materialId: material.id, materialName: material.name, percentage: ingredient.percentage, weightGrams: proposal.targetGrams * ingredient.percentage / 100, availableGrams: availability?.availableGrams, estimatedUnitCost: cost?.unitCost, estimatedCost: cost?.lineCost, currency: 'USD', warnings: [] } }), totalPercentage: 100, totalWeightGrams: proposal.targetGrams, totalEstimatedCost: preview.cost.totalCost, currency: 'USD' } })
      this.persistArtifact(run, { type: 'inventory_report', version: 1, data: { eligible: preview.availability } })
      this.persistArtifact(run, { type: 'cost_summary', version: 1, data: { totalCost: preview.cost.totalCost, costPerGram: preview.cost.costPerGram, currency: 'USD', mostExpensiveMaterial: preview.cost.mostExpensiveMaterial } })
      this.persistArtifact(run, { type: 'compliance_report', version: 1, data: { ifraCategory: proposal.ifraCategory, status: preview.compliance.status === 'BLOCKED' ? 'BLOCKED' : preview.compliance.status === 'REVIEW_REQUIRED' ? 'NEAR_LIMIT' : 'PASS', sourceLabel: preview.ifra.label, warnings: preview.ifra.rows.filter((row) => row.status !== 'PASS' && row.status !== 'NO_LIMIT').map((row) => `${row.materialName}: ${row.status}`) } })
      this.persistArtifact(run, { type: 'assumptions', version: 1, data: { assumptions: ['Local deterministic mock uses real workspace tools and does not send data to a model provider.'], warnings: preview.availability.filter((item) => item.status !== 'AVAILABLE').map((item) => `${item.materialName}: ${item.status}`) } })
      const saveNode = run.nodes.at(-1)!
      this.assistantMessage(run, 'I prepared a deterministic formula proposal from your workspace data. Review the structured evidence and explicitly confirm before a draft is created.')
      run.confirmation = { id: crypto.randomUUID(), status: 'PENDING', summary: `Save ${proposal.name} as a non-consuming formula draft`, proposal }
      run.status = 'WAITING_FOR_CONFIRMATION'; run.progress = 95; run.updated_at = now()
      this.event(run, 'confirmation.requested', { confirmationId: run.confirmation.id, summary: run.confirmation.summary, nodeId: saveNode.id, nodeType: 'save_formula_draft', status: 'WAITING_FOR_CONFIRMATION', progress: 95 })
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Formula research failed'
      run.status = 'FAILED'; run.updated_at = now(); this.event(run, 'run.failed', { status: 'FAILED', error: message })
    }
    await this.persist()
  }

  private persistArtifact(run: LocalRun, candidate: AgentArtifact) {
    const data = agentArtifactSchema.parse(candidate)
    const record = { id: crypto.randomUUID(), type: data.type, version: data.version, data, status: 'COMPLETED' }
    run.artifacts = [...run.artifacts.filter((artifact) => artifact.type !== data.type), record]
    this.event(run, 'artifact.created', { artifactId: record.id, artifact: data })
  }

  private assistantMessage(run: LocalRun, content: string) {
    const id = crypto.randomUUID()
    const timestamp = now()
    run.messages ??= []
    run.messages.push({ id, role: 'assistant', content, status: 'STREAMING', created_at: timestamp })
    this.event(run, 'message.started', { messageId: id })
    this.event(run, 'message.delta', { messageId: id, delta: content })
    run.messages[run.messages.length - 1] = { ...run.messages[run.messages.length - 1], status: 'COMPLETED', completed_at: timestamp }
    this.event(run, 'message.completed', { messageId: id })
  }

  private event(run: LocalRun, type: AgentRuntimeEvent['type'], payload: Record<string, unknown>) {
    const sequence = run.last_event_sequence + 1
    run.last_event_sequence = sequence
    run.events.push({ protocolVersion: AGENT_PROTOCOL_VERSION, eventId: crypto.randomUUID(), tenantId: run.organization_id, runId: run.id, sequence, type, timestamp: now(), payload })
  }

  private runFor(session: AuthSession, id: string) {
    const current = actor(session)
    const run = this.state.runs.find((candidate) => candidate.id === id && candidate.organization_id === current.organizationId && candidate.user_id === current.userId)
    if (!run) throw new NotFoundException('Formula research run was not found')
    return run
  }

  private runSummary(run: LocalRun) {
    const { nodes: _nodes, messages: _messages, artifacts: _artifacts, events: _events, confirmation: _confirmation, ...summary } = run
    return summary
  }

  private async ready() {
    if (this.initialized) return
    this.initialized = true
    try {
      const parsed = JSON.parse(await readFile(this.storagePath, 'utf8')) as LocalState
      this.state = { runs: Array.isArray(parsed.runs) ? parsed.runs : [] }
    } catch { this.state = { runs: [] } }
  }

  private async persist() {
    const payload = JSON.stringify(this.state)
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.storagePath), { recursive: true })
      const temp = `${this.storagePath}.${crypto.randomUUID()}.tmp`
      await writeFile(temp, payload, 'utf8')
      await rename(temp, this.storagePath)
    })
    return this.writeQueue
  }
}
