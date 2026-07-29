import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  AGENT_PROTOCOL_VERSION,
  agentArtifactSchema,
  agentFormulaProposalSchema,
  agentNodeDefinitions,
  formulaDesignBriefSchema,
  formulaDirectionFeedbackSchema,
  formulaDirectionShareSchema,
  formulaOptimizerRequestSchema,
  type AgentArtifact,
  type AgentFormulaProposal,
  type AgentRuntimeEvent,
  type AgentRunStatus,
  type DesignDirectionArtifact,
  type FormulaDesignBrief,
  type FormulaOptimizerRequest,
  type OptimizerCandidateArtifact,
} from '../../../src/data/agentRuntime.js'
import {
  buildDesignDirectionProposals,
  buildOptimizerProposals,
  compareOptimizerCandidates,
  compositionChangePercent,
  proposalFromFormulaVersion,
} from '../../../src/data/formulaIntelligence.js'
import type { AuthSession } from '../../../src/data/northStar.js'
import { NorthStarService } from './northstar.service.js'

type LocalNode = { id: string; node_type: string; status: string; attempt: number }
type LocalMessage = { id: string; role: 'user' | 'assistant'; content: string; status: 'STREAMING' | 'COMPLETED'; created_at: string; completed_at?: string }
type LocalRun = {
  id: string; organization_id: string; user_id: string; session_id: string; status: AgentRunStatus
  input_brief: string; progress: number; provider: string; model_name: string; created_at: string; updated_at: string
  last_event_sequence: number; nodes: LocalNode[]; messages: LocalMessage[]; artifacts: Array<{ id: string; type: string; version: number; data: AgentArtifact; status: string }>
  events: AgentRuntimeEvent[]; confirmation?: { id: string; status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'; summary: string; proposal: AgentFormulaProposal; expiresAt: string; savedFormulaId?: string }
  intelligence?: { workflowKind: 'DESIGN_STUDIO' | 'REFORMULATION_OPTIMIZER'; projectId?: string; request?: FormulaOptimizerRequest }
  pendingSave?: { kind: 'design' | 'optimizer'; projectId?: string; directionId?: string; candidateId?: string }
}
type LocalDesignDirection = DesignDirectionArtifact & { runId: string; status: 'DRAFT' | 'SHARED' | 'SELECTED' | 'SAVED'; sharedAt?: string; savedFormulaId?: string; shares?: Array<{ recipientUserId: string; allowMaterialNames: boolean; sharedAt: string; revokedAt?: string }> }
type LocalDesignFeedback = { id: string; directionId: string; userId: string; rating?: number; comment: string; selected: boolean; createdAt: string }
type LocalDesignProject = { id: string; organizationId: string; brandId: string; createdByUserId: string; name: string; brief: FormulaDesignBrief; status: 'BRIEFED' | 'IN_PROGRESS' | 'IN_REVIEW' | 'SELECTED'; selectedDirectionId?: string; directions: LocalDesignDirection[]; feedback: LocalDesignFeedback[]; createdAt: string; updatedAt: string }
type LocalOptimizerCandidate = OptimizerCandidateArtifact & { status: 'READY' | 'PENDING_SAVE' | 'SAVED'; savedFormulaId?: string }
type LocalIdempotencyRecord = { requestHash: string; response: unknown; createdAt: string }
type LocalState = {
  runs: LocalRun[]
  projects: LocalDesignProject[]
  optimizerCandidates: Record<string, LocalOptimizerCandidate[]>
  idempotency: Record<string, LocalIdempotencyRecord>
}

function now() { return new Date().toISOString() }
function actor(session: AuthSession) { return { organizationId: session.organizationId, userId: session.userId, sessionId: session.id } }

@Injectable()
export class AgentLocalRuntimeService {
  private readonly storagePath = join(process.cwd(), '.olfactoryops-agent.local.json')
  private state: LocalState = { runs: [], projects: [], optimizerCandidates: {}, idempotency: {} }
  private initialized = false
  private writeQueue: Promise<void> = Promise.resolve()
  private mutationQueue: Promise<void> = Promise.resolve()

  /**
   * The local API uses the same identity scope as the Worker so a retry cannot
   * silently create a second project, run, share, feedback entry, or draft.
   */
  async idempotentMutation<T>(
    session: AuthSession,
    route: string,
    idempotencyKey: string | undefined,
    request: unknown,
    mutation: () => Promise<T>,
  ) {
    await this.ready()
    const key = idempotencyKey?.trim() ?? ''
    if (key.length < 8 || key.length > 160) {
      throw new UnprocessableEntityException('Idempotency-Key header must be between 8 and 160 characters')
    }
    const current = actor(session)
    const scope = `${current.organizationId}:${current.userId}:${route}:${key}`
    const requestHash = createHash('sha256').update(JSON.stringify(request ?? {})).digest('hex')
    let release: (() => void) | undefined
    const predecessor = this.mutationQueue
    this.mutationQueue = new Promise<void>((resolve) => { release = resolve })
    await predecessor
    try {
      const existing = this.state.idempotency[scope]
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException('Idempotency-Key was already used for a different request')
        }
        return existing.response as T
      }
      const response = await mutation()
      this.state.idempotency[scope] = { requestHash, response, createdAt: now() }
      await this.persist()
      return response
    } finally {
      release?.()
    }
  }

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

  async listDesignProjects(service: NorthStarService, session: AuthSession, canViewPrivate: boolean) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.view')
    const current = actor(session)
    return {
      data: this.state.projects
        .filter((project) => project.organizationId === current.organizationId && (
          project.createdByUserId === current.userId ||
          this.isProjectProducer(current.userId, project.id) ||
          project.directions.some((direction) => direction.shares?.some((share) => share.recipientUserId === current.userId && !share.revokedAt))
        ))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((project) => this.exposeProject(project, session, canViewPrivate)),
    }
  }

  async createDesignProject(service: NorthStarService, session: AuthSession, body: Record<string, unknown>) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.view')
    const current = actor(session)
    const brief = formulaDesignBriefSchema.parse(body)
    const timestamp = now()
    const project: LocalDesignProject = {
      id: crypto.randomUUID(), organizationId: current.organizationId, brandId: session.brandId, createdByUserId: current.userId,
      name: brief.name, brief, status: 'BRIEFED', directions: [], feedback: [], createdAt: timestamp, updatedAt: timestamp,
    }
    this.state.projects.unshift(project)
    service.recordIntegrationAudit('formula-intelligence.design.project.create', project.id)
    await this.persist()
    return { data: { project: this.exposeProject(project, session, false) } }
  }

  async designProject(service: NorthStarService, session: AuthSession, projectId: string, canViewPrivate: boolean) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.view')
    const project = this.projectFor(session, projectId, false)
    return { data: { project: this.exposeProject(project, session, canViewPrivate) } }
  }

  async designRecipients(service: NorthStarService, session: AuthSession, projectId: string) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.edit')
    const project = this.projectFor(session, projectId, true)
    return { data: service.formulaDesignRecipients(project.brandId).data }
  }

  async generateDesignDirections(service: NorthStarService, session: AuthSession, projectId: string) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.edit')
    this.requireFormulaPermission(service, 'formulas.viewSensitive')
    this.requireFormulaPermission(service, 'materials.view')
    const project = this.projectFor(session, projectId, true)
    let run: LocalRun
    try {
      run = this.createIntelligenceRun(session, project.brief.creativeBrief, { workflowKind: 'DESIGN_STUDIO', projectId })
    } catch (error) {
      service.recordIntegrationAudit('formula-intelligence.run.quota.denied', projectId, 'blocked')
      throw error
    }
    project.status = 'IN_PROGRESS'; project.updatedAt = now()
    await this.executeIntelligence(service, run)
    service.recordIntegrationAudit('formula-intelligence.design.run.create', project.id)
    return { data: { run: this.runSummary(run), project: this.exposeProject(project, session, true) } }
  }

  async shareDesignDirection(service: NorthStarService, session: AuthSession, projectId: string, directionId: string, body: unknown) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.edit')
    const project = this.projectFor(session, projectId, true)
    const direction = project.directions.find((item) => item.directionId === directionId)
    if (!direction) throw new NotFoundException('Design direction was not found')
    if (!this.state.runs.some((run) => run.id === direction.runId && run.user_id === session.userId)) throw new ForbiddenException('Only the generating perfumer can share a direction')
    const input = formulaDirectionShareSchema.parse(body)
    const eligibleRecipientIds = new Set(service.formulaDesignRecipients(project.brandId).data.map((recipient) => recipient.userId))
    if (input.recipientUserIds.some((recipientUserId) => !eligibleRecipientIds.has(recipientUserId))) {
      service.recordIntegrationAudit('formula-intelligence.design.direction.share.denied', directionId, 'blocked')
      throw new UnprocessableEntityException('Every recipient must be an active member of this project brand')
    }
    const timestamp = now()
    const shares = direction.shares ?? []
    for (const recipientUserId of input.recipientUserIds) {
      const existing = shares.find((share) => share.recipientUserId === recipientUserId)
      if (existing) { existing.allowMaterialNames = input.allowMaterialNames; existing.sharedAt = timestamp; delete existing.revokedAt }
      else shares.push({ recipientUserId, allowMaterialNames: input.allowMaterialNames, sharedAt: timestamp })
    }
    direction.shares = shares; direction.status = 'SHARED'; direction.sharedAt = timestamp; project.updatedAt = timestamp
    service.recordIntegrationAudit('formula-intelligence.design.direction.share', directionId)
    await this.persist()
    return { data: { shared: true } }
  }

  async feedbackDesignDirection(service: NorthStarService, session: AuthSession, projectId: string, directionId: string, body: Record<string, unknown>) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.view')
    const project = this.projectFor(session, projectId, false)
    const current = actor(session)
    const direction = project.directions.find((item) => item.directionId === directionId && item.shares?.some((share) => share.recipientUserId === current.userId && !share.revokedAt))
    if (!direction) throw new NotFoundException('Shared design direction was not found')
    const input = formulaDirectionFeedbackSchema.parse(body)
    const rating = input.rating
    const comment = input.comment ?? ''
    const selected = input.selected
    if (selected) {
      project.directions = project.directions.map((item) => item.directionId === directionId ? { ...item, status: 'SELECTED' } : item)
      project.feedback = project.feedback.map((item) => ({ ...item, selected: false }))
      project.selectedDirectionId = directionId; project.status = 'SELECTED'
    }
    const existing = project.feedback.find((item) => item.directionId === directionId && item.userId === current.userId)
    const entry: LocalDesignFeedback = { id: existing?.id ?? crypto.randomUUID(), directionId, userId: current.userId, rating, comment, selected, createdAt: existing?.createdAt ?? now() }
    project.feedback = [...project.feedback.filter((item) => item !== existing), entry]
    project.updatedAt = now(); service.recordIntegrationAudit('formula-intelligence.design.feedback.create', directionId)
    await this.persist()
    return { data: { accepted: true } }
  }

  async revokeDesignDirectionShare(service: NorthStarService, session: AuthSession, projectId: string, directionId: string, recipientUserId: string) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.edit')
    const project = this.projectFor(session, projectId, true)
    const direction = project.directions.find((item) => item.directionId === directionId)
    if (!direction) throw new NotFoundException('Design direction was not found')
    if (!this.state.runs.some((run) => run.id === direction.runId && run.user_id === session.userId)) throw new ForbiddenException('Only the generating perfumer can revoke a share')
    const share = direction.shares?.find((item) => item.recipientUserId === recipientUserId && !item.revokedAt)
    if (!share) throw new NotFoundException('Active direction share was not found')
    share.revokedAt = now(); project.updatedAt = now()
    service.recordIntegrationAudit('formula-intelligence.design.direction.revoke', directionId)
    await this.persist()
    return { data: { revoked: true } }
  }

  async requestDesignDraftSave(service: NorthStarService, session: AuthSession, projectId: string, directionId: string) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.edit')
    const project = this.projectFor(session, projectId, true)
    const direction = project.directions.find((item) => item.directionId === directionId)
    if (!direction) throw new NotFoundException('Design direction was not found')
    if (!this.state.runs.some((run) => run.id === direction.runId && run.user_id === session.userId)) throw new ForbiddenException('Only the generating perfumer can save a direction')
    const run = this.runFor(session, direction.runId)
    return this.requestLocalConfirmation(run, direction.proposal, { kind: 'design', projectId, directionId }, service, `formula-intelligence.design.direction.save.requested:${directionId}`)
  }

  async startOptimizer(service: NorthStarService, session: AuthSession, body: Record<string, unknown>) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.viewSensitive')
    this.requireFormulaPermission(service, 'materials.view')
    const request = formulaOptimizerRequestSchema.parse(body)
    const versions = service.formulaVersions(request.baselineFormulaId).data
    if (!versions.versions.some((version) => version.version === request.baselineVersion)) throw new UnprocessableEntityException('Select an immutable formula version before optimizing')
    let run: LocalRun
    try {
      run = this.createIntelligenceRun(session, `Optimize ${versions.formula.name} ${request.baselineVersion}`, { workflowKind: 'REFORMULATION_OPTIMIZER', request })
    } catch (error) {
      service.recordIntegrationAudit('formula-intelligence.run.quota.denied', `${request.baselineFormulaId}:${request.baselineVersion}`, 'blocked')
      throw error
    }
    await this.executeIntelligence(service, run)
    service.recordIntegrationAudit('formula-intelligence.reformulation.run.create', `${request.baselineFormulaId}:${request.baselineVersion}`)
    return { data: { run: this.runSummary(run), baseline: { formulaId: request.baselineFormulaId, version: request.baselineVersion } } }
  }

  async requestOptimizerDraftSave(service: NorthStarService, session: AuthSession, runId: string, candidateId: string) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.edit')
    const run = this.runFor(session, runId)
    const candidate = this.state.optimizerCandidates[runId]?.find((item) => item.candidateId === candidateId)
    if (!candidate) throw new NotFoundException('Optimizer candidate was not found')
    const request = run.intelligence?.request
    if (!request) throw new UnprocessableEntityException('Optimizer request is missing')
    const total = candidate.proposal.ingredients.reduce((sum, ingredient) => sum + ingredient.percentage, 0)
    if (Math.abs(total - 100) > 0.05) throw new UnprocessableEntityException('Candidate composition must total 100% before it can be saved')
    const candidateMaterialIds = new Set(candidate.proposal.ingredients.map((ingredient) => ingredient.materialId))
    if (request.lockedMaterialIds.some((materialId) => !candidateMaterialIds.has(materialId))) throw new UnprocessableEntityException('Candidate does not preserve all locked materials')
    const preview = service.previewFormulaIntelligence(candidate.proposal).data
    if (preview.compliance.status !== 'APPROVED' || preview.ifra.blockerCount > 0) throw new UnprocessableEntityException('Only a compliance-passing candidate can be saved as a formula draft')
    if (request.requireEligibleInventory) {
      if (!preview.visibility.canViewInventory) throw new ForbiddenException('Inventory permission is required when eligible inventory is mandatory')
      if (preview.availability.some((item) => item.status !== 'AVAILABLE')) throw new UnprocessableEntityException('Candidate does not have eligible inventory for every material')
    }
    candidate.status = 'PENDING_SAVE'
    return this.requestLocalConfirmation(run, candidate.proposal, { kind: 'optimizer', candidateId }, service, `formula-intelligence.optimizer.candidate.save.requested:${candidateId}`)
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
    run.status = 'QUEUED'; run.updated_at = now(); this.event(run, 'run.resumed', { status: 'QUEUED', progress: run.progress })
    if (run.intelligence) await this.executeIntelligence(service, run)
    else await this.execute(service, run)
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
    if (run.intelligence) await this.executeIntelligence(service, run)
    else await this.execute(service, run)
    return this.detail(session, runId)
  }

  async restart(service: NorthStarService, session: AuthSession, runId: string) {
    const prior = this.runFor(session, runId)
    if (prior.intelligence?.workflowKind === 'DESIGN_STUDIO' && prior.intelligence.projectId) {
      return this.generateDesignDirections(service, session, prior.intelligence.projectId)
    }
    if (prior.intelligence?.workflowKind === 'REFORMULATION_OPTIMIZER' && prior.intelligence.request) {
      return this.startOptimizer(service, session, prior.intelligence.request)
    }
    const result = await this.create(service, session, { brief: prior.input_brief })
    return { data: { previousRunId: runId, run: result.data.run } }
  }

  async resolveConfirmation(service: NorthStarService, session: AuthSession, runId: string, confirmationId: string, decision: unknown) {
    await this.ready()
    const run = this.runFor(session, runId)
    const confirmation = run.confirmation
    if (!confirmation || confirmation.id !== confirmationId) throw new NotFoundException('Agent confirmation was not found')
    if (confirmation.status === 'PENDING' && confirmation.expiresAt <= now()) {
      confirmation.status = 'EXPIRED'; service.recordIntegrationAudit('formula-intelligence.confirmation.expired', confirmationId, 'blocked'); await this.persist(); throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_CONFIRMATION_EXPIRED')
    }
    if (confirmation.status !== 'PENDING') return { data: { duplicate: true, formulaId: confirmation.savedFormulaId } }
    if (decision === 'reject') {
      confirmation.status = 'REJECTED'; run.status = 'COMPLETED'; run.progress = 100
      this.event(run, 'confirmation.rejected', { confirmationId, summary: 'Formula draft was not saved' })
      this.event(run, 'run.completed', { status: 'COMPLETED', progress: 100 }); await this.persist(); return { data: { rejected: true } }
    }
    try {
      this.revalidateDraftSave(service, run, confirmation.proposal)
    } catch (error) {
      service.recordIntegrationAudit('formula-intelligence.draft.save.denied', confirmationId, 'blocked')
      throw error
    }
    const created = service.createAgentFormulaDraft(confirmationId, {
      name: confirmation.proposal.name, formulaType: confirmation.proposal.formulaType, targetGrams: confirmation.proposal.targetGrams,
      concentrationType: confirmation.proposal.concentrationType, finalProductConcentrationPercent: confirmation.proposal.finalProductConcentrationPercent,
      ifraCategory: confirmation.proposal.ifraCategory, brief: confirmation.proposal.brief,
    }).data.formula
    const names = new Map(service.materials().data.map((material) => [material.id, material.name]))
    const formula = service.updateFormulaDraft(created.id, {
      expectedRevision: created.draftRevision,
      lines: confirmation.proposal.ingredients.map((ingredient, index) => ({ id: `agent-${index + 1}`, label: names.get(ingredient.materialId) ?? ingredient.materialId, materialId: ingredient.materialId, grams: Number((confirmation.proposal.targetGrams * ingredient.percentage / 100).toFixed(4)), concentration: ingredient.dilution ?? 100, pyramidNote: ingredient.pyramidNote })),
    }).data.formula
    if (run.pendingSave?.kind === 'design' && run.pendingSave.projectId && run.pendingSave.directionId) {
      const project = this.state.projects.find((item) => item.id === run.pendingSave?.projectId && item.organizationId === run.organization_id)
      const direction = project?.directions.find((item) => item.directionId === run.pendingSave?.directionId)
      if (direction) { direction.status = 'SAVED'; direction.savedFormulaId = formula.id }
      if (project) project.updatedAt = now()
    }
    if (run.pendingSave?.kind === 'optimizer' && run.pendingSave.candidateId) {
      const candidate = this.state.optimizerCandidates[run.id]?.find((item) => item.candidateId === run.pendingSave?.candidateId)
      if (candidate) { candidate.status = 'SAVED'; candidate.savedFormulaId = formula.id }
    }
    run.pendingSave = undefined
    confirmation.status = 'ACCEPTED'; confirmation.savedFormulaId = formula.id; run.status = 'COMPLETED'; run.progress = 100; run.updated_at = now()
    this.event(run, 'confirmation.accepted', { confirmationId, summary: confirmation.summary })
    this.event(run, 'run.completed', { status: 'COMPLETED', progress: 100 }); await this.persist()
    return { data: { formula, confirmationId, invariant: 'agent confirmation creates one editable draft and does not reserve or consume inventory' } }
  }

  private createIntelligenceRun(session: AuthSession, brief: string, intelligence: NonNullable<LocalRun['intelligence']>) {
    const current = actor(session)
    const timestamp = now()
    this.assertRunStartAllowed(current, intelligence.workflowKind === 'DESIGN_STUDIO' ? intelligence.projectId : undefined)
    const run: LocalRun = {
      id: crypto.randomUUID(), organization_id: current.organizationId, user_id: current.userId, session_id: current.sessionId,
      status: 'QUEUED', input_brief: brief, progress: 0, provider: 'mock', model_name: 'deterministic-v1',
      created_at: timestamp, updated_at: timestamp, last_event_sequence: 0, nodes: [],
      messages: [{ id: crypto.randomUUID(), role: 'user', content: brief, status: 'COMPLETED', created_at: timestamp, completed_at: timestamp }], artifacts: [], events: [], intelligence,
    }
    this.state.runs.unshift(run)
    this.event(run, 'run.created', { status: 'QUEUED', progress: 0 })
    this.event(run, 'run.queued', { status: 'QUEUED', progress: 0 })
    return run
  }

  private assertRunStartAllowed(current: ReturnType<typeof actor>, projectId?: string) {
    const activeStatuses = new Set<AgentRunStatus>(['QUEUED', 'RUNNING', 'WAITING_FOR_CONFIRMATION'])
    const activeRuns = this.state.runs.filter((run) => run.organization_id === current.organizationId && activeStatuses.has(run.status))
    if (activeRuns.filter((run) => run.user_id === current.userId).length >= 2 || activeRuns.length >= 10) {
      throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_RUN_QUOTA_EXHAUSTED')
    }
    const cutoff = Date.now() - 15 * 60 * 1000
    if (this.state.runs.filter((run) => run.organization_id === current.organizationId && run.user_id === current.userId && new Date(run.created_at).getTime() >= cutoff).length >= 5) {
      throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_START_RATE_LIMITED')
    }
    if (projectId && activeRuns.some((run) => run.intelligence?.workflowKind === 'DESIGN_STUDIO' && run.intelligence.projectId === projectId)) {
      throw new ConflictException('FORMULA_INTELLIGENCE_PROJECT_GENERATION_IN_PROGRESS')
    }
  }

  private projectFor(session: AuthSession, projectId: string, includeTenantProjects: boolean) {
    const current = actor(session)
    const project = this.state.projects.find((candidate) => candidate.id === projectId && candidate.organizationId === current.organizationId && (
      includeTenantProjects ||
      candidate.createdByUserId === current.userId ||
      this.isProjectProducer(current.userId, candidate.id) ||
      candidate.directions.some((direction) => direction.shares?.some((share) => share.recipientUserId === current.userId && !share.revokedAt))
    ))
    if (!project) throw new NotFoundException('Design project was not found')
    return project
  }

  private isProjectProducer(userId: string, projectId: string) {
    return this.state.runs.some((run) => run.user_id === userId && run.intelligence?.workflowKind === 'DESIGN_STUDIO' && run.intelligence.projectId === projectId)
  }

  private exposeProject(project: LocalDesignProject, session: AuthSession, canViewPrivate: boolean) {
    const current = actor(session)
    return {
      id: project.id, name: project.name, status: project.status, createdByUserId: project.createdByUserId,
      selectedDirectionId: project.selectedDirectionId, brief: project.brief, createdAt: project.createdAt, updatedAt: project.updatedAt,
      directions: project.directions.flatMap((direction) => {
        const privateDirection = canViewPrivate && this.state.runs.some((run) => run.id === direction.runId && run.user_id === current.userId)
        const share = direction.shares?.find((item) => item.recipientUserId === current.userId && !item.revokedAt)
        if (!privateDirection && !share) return []
        const exposeNames = privateDirection || Boolean(share?.allowMaterialNames)
        return [{
          directionId: direction.directionId,
          title: direction.title,
          narrative: exposeNames ? direction.narrative : 'A perfumer prepared this creative direction for review.',
          pyramidSummary: exposeNames ? direction.pyramidSummary : 'Creative pyramid available to the assigned reviewer.',
          availability: direction.availability,
          complianceStatus: direction.complianceStatus,
          warnings: privateDirection ? direction.warnings : [],
          status: direction.status,
          sharedAt: share?.sharedAt ?? direction.sharedAt,
          savedFormulaId: privateDirection ? direction.savedFormulaId : undefined,
          ...(privateDirection ? { runId: direction.runId, proposal: direction.proposal, shares: direction.shares?.filter((item) => !item.revokedAt) } : {}),
        }]
      }),
      feedback: canViewPrivate ? project.feedback : project.feedback.filter((item) => item.userId === current.userId),
    }
  }

  private requireFormulaPermission(service: NorthStarService, permission: string) {
    if (!service.me().data.permissions.includes(permission)) {
      service.recordIntegrationAudit('formula-intelligence.access.denied', permission, 'blocked')
      throw new ForbiddenException(`Formula Intelligence requires ${permission}`)
    }
  }

  private revalidateDraftSave(service: NorthStarService, run: LocalRun, proposal: AgentFormulaProposal) {
    this.requireFormulaPermission(service, 'formulas.edit')
    this.requireFormulaPermission(service, 'formulas.viewSensitive')
    this.requireFormulaPermission(service, 'materials.view')
    const total = proposal.ingredients.reduce((sum, item) => sum + item.percentage, 0)
    if (Math.abs(total - 100) > 0.05) throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_DRAFT_BLOCKED')
    const preview = service.previewFormulaIntelligence(proposal).data
    if (preview.compliance.status === 'BLOCKED' || preview.ifra.blockerCount > 0) {
      throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_DRAFT_BLOCKED')
    }
    if (run.pendingSave?.kind === 'design' && run.pendingSave.projectId) {
      const project = this.state.projects.find((item) => item.id === run.pendingSave?.projectId && item.organizationId === run.organization_id)
      const materials = new Set(proposal.ingredients.map((ingredient) => ingredient.materialId))
      if (!project || project.brief.lockedMaterialIds.some((materialId) => !materials.has(materialId))) {
        throw new UnprocessableEntityException('Formula draft does not preserve locked materials from the design brief')
      }
    }
    if (run.pendingSave?.kind === 'optimizer') {
      const request = run.intelligence?.request
      const materials = new Set(proposal.ingredients.map((ingredient) => ingredient.materialId))
      if (!request || request.lockedMaterialIds.some((materialId) => !materials.has(materialId))) {
        throw new UnprocessableEntityException('Candidate does not preserve all locked materials')
      }
      if (request.requireEligibleInventory) {
        if (!preview.visibility.canViewInventory) throw new ForbiddenException('Inventory permission is required when eligible inventory is mandatory')
        if (preview.availability.some((item) => item.status !== 'AVAILABLE')) throw new UnprocessableEntityException('Candidate does not have eligible inventory for every material')
      }
    }
    return preview
  }

  private async requestLocalConfirmation(
    run: LocalRun,
    proposal: AgentFormulaProposal,
    pendingSave: NonNullable<LocalRun['pendingSave']>,
    service: NorthStarService,
    auditAction: string,
  ) {
    if (run.confirmation?.status === 'PENDING') throw new UnprocessableEntityException('A draft confirmation is already pending for this run')
    const saveNode: LocalNode = { id: crypto.randomUUID(), node_type: 'save_formula_draft', status: 'WAITING_FOR_CONFIRMATION', attempt: 1 }
    run.nodes.push(saveNode)
    run.confirmation = { id: crypto.randomUUID(), status: 'PENDING', summary: `Save ${proposal.name} as a non-consuming formula draft`, proposal, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
    run.pendingSave = pendingSave; run.status = 'WAITING_FOR_CONFIRMATION'; run.progress = 95; run.updated_at = now()
    this.event(run, 'node.progress', { nodeId: saveNode.id, nodeType: saveNode.node_type, status: saveNode.status, progress: 95 })
    this.event(run, 'confirmation.requested', { confirmationId: run.confirmation.id, summary: run.confirmation.summary, nodeId: saveNode.id, nodeType: saveNode.node_type, status: run.status, progress: 95 })
    service.recordIntegrationAudit(auditAction, run.id)
    await this.persist()
    return { data: { confirmationId: run.confirmation.id, summary: run.confirmation.summary } }
  }

  private addNode(run: LocalRun, nodeType: string, progress: number, payload: Record<string, unknown>) {
    const node: LocalNode = { id: crypto.randomUUID(), node_type: nodeType, status: 'COMPLETED', attempt: 1 }
    run.nodes.push(node)
    this.event(run, 'node.completed', { nodeId: node.id, nodeType, status: 'COMPLETED', progress, ...payload })
  }

  private approvedMaterials(service: NorthStarService) {
    return service.materials().data.filter((material) => service.materialCompliance(material.id).data?.status === 'APPROVED')
  }

  private async executeIntelligence(service: NorthStarService, run: LocalRun) {
    run.status = 'RUNNING'; run.progress = 0; run.updated_at = now(); this.event(run, 'run.started', { status: 'RUNNING', progress: 0 })
    try {
      this.requireFormulaPermission(service, 'formulas.viewSensitive')
      this.requireFormulaPermission(service, 'materials.view')
      if (run.intelligence?.workflowKind === 'DESIGN_STUDIO') await this.executeDesignStudio(service, run)
      else if (run.intelligence?.workflowKind === 'REFORMULATION_OPTIMIZER') await this.executeOptimizer(service, run)
      else throw new UnprocessableEntityException('Unsupported Formula Intelligence workflow')
      run.status = 'COMPLETED'; run.progress = 100; run.updated_at = now(); this.event(run, 'run.completed', { status: 'COMPLETED', progress: 100 })
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Formula Intelligence execution failed'
      run.status = 'FAILED'; run.updated_at = now(); this.event(run, 'run.failed', { status: 'FAILED', error: message })
    }
    await this.persist()
  }

  private async executeDesignStudio(service: NorthStarService, run: LocalRun) {
    const project = this.state.projects.find((item) => item.id === run.intelligence?.projectId && item.organizationId === run.organization_id)
    if (!project) throw new NotFoundException('Design project was not found')
    this.addNode(run, 'analyze_brief', 12, { projectId: project.id })
    const availableByMaterial = new Map<string, number>()
    for (const lot of service.lotsList().data) {
      if (lot.qualityStatus === 'APPROVED') availableByMaterial.set(lot.materialId, (availableByMaterial.get(lot.materialId) ?? 0) + Math.max(0, lot.quantityGrams - lot.reservedGrams))
    }
    const materials = this.approvedMaterials(service).map((material) => ({ ...material, availabilityRank: availableByMaterial.get(material.id) ?? 0 }))
    if (!materials.length) throw new UnprocessableEntityException('No compliance-approved workspace materials are available for this design brief')
    this.addNode(run, 'search_materials', 28, { materialCount: materials.length })
    this.addNode(run, 'check_inventory', 42, { visibility: service.me().data.permissions.includes('inventory.view') ? 'full' : 'redacted' })
    const proposals = buildDesignDirectionProposals(project.brief, materials)
    this.addNode(run, 'generate_formula', 58, { directionCount: proposals.length })
    this.addNode(run, 'calculate_cost', 68, { visibility: service.me().data.permissions.includes('costing.view') ? 'full' : 'redacted' })
    const previews = proposals.map((proposal) => service.previewFormulaIntelligence(proposal.proposal).data)
    this.addNode(run, 'validate_compliance', 80, { statuses: previews.map((preview) => preview.compliance.status) })
    const directions: LocalDesignDirection[] = proposals.map((proposal, index) => {
      const preview = previews[index]!
      return {
        directionId: crypto.randomUUID(), runId: run.id, title: proposal.title, narrative: proposal.narrative, pyramidSummary: proposal.pyramidSummary,
        availability: preview.visibility.canViewInventory ? (preview.availability.every((item) => item.status === 'AVAILABLE') ? 'AVAILABLE' : 'MIXED') : 'UNKNOWN',
        complianceStatus: preview.compliance.status === 'APPROVED' ? 'PASS' : preview.compliance.status === 'BLOCKED' ? 'BLOCKED' : 'REVIEW_REQUIRED',
        proposal: proposal.proposal,
        warnings: preview.ifra.rows.filter((row) => row.status !== 'PASS' && row.status !== 'NO_LIMIT').map((row) => `${row.materialName}: ${row.status}`).slice(0, 20),
        status: 'DRAFT',
      }
    })
    project.directions = directions; project.status = 'IN_REVIEW'; project.updatedAt = now()
    this.persistArtifact(run, { type: 'design_directions', version: 1, data: { projectId: project.id, directions } })
    this.addNode(run, 'prepare_result', 94, { directionCount: directions.length })
    this.assistantMessage(run, 'I prepared three deterministic design directions. A perfumer can share a direction for brand feedback or request an explicit draft save.')
  }

  private async executeOptimizer(service: NorthStarService, run: LocalRun) {
    const request = run.intelligence?.request
    if (!request) throw new UnprocessableEntityException('Optimizer request is missing')
    const versions = service.formulaVersions(request.baselineFormulaId).data
    const baseline = versions.versions.find((version) => version.version === request.baselineVersion)
    if (!baseline || baseline.lines.some((line) => line.childFormulaId)) throw new UnprocessableEntityException('Optimizer requires a material-only immutable baseline version')
    const baselineProposal = proposalFromFormulaVersion(versions.formula, baseline.lines)
    this.addNode(run, 'analyze_brief', 12, { baselineFormulaId: request.baselineFormulaId, baselineVersion: request.baselineVersion })
    const materials = this.approvedMaterials(service)
    this.addNode(run, 'search_materials', 28, { materialCount: materials.length })
    const available = new Set<string>()
    if (service.me().data.permissions.includes('inventory.view')) {
      service.lotsList().data.filter((lot) => lot.qualityStatus === 'APPROVED' && lot.quantityGrams > lot.reservedGrams).forEach((lot) => available.add(lot.materialId))
    }
    this.addNode(run, 'check_inventory', 42, { visibility: available.size ? 'full' : 'redacted' })
    const proposals = buildOptimizerProposals(baselineProposal, materials, request.intent, request.lockedMaterialIds, available)
    this.addNode(run, 'generate_formula', 58, { candidateCount: proposals.length })
    const previews = proposals.map((candidate) => service.previewFormulaIntelligence(candidate.proposal).data)
    this.addNode(run, 'calculate_cost', 70, { visibility: service.me().data.permissions.includes('costing.view') ? 'full' : 'redacted' })
    this.addNode(run, 'validate_compliance', 80, { statuses: previews.map((preview) => preview.compliance.status) })
    const baselineCost = previews[0]?.cost?.totalCost
    const candidates: LocalOptimizerCandidate[] = proposals.map((candidate, index) => {
      const preview = previews[index]!
      const complianceStatus: LocalOptimizerCandidate['complianceStatus'] = preview.compliance.status === 'APPROVED' ? 'PASS' : preview.compliance.status === 'BLOCKED' ? 'BLOCKED' : 'REVIEW_REQUIRED'
      const availability: LocalOptimizerCandidate['availability'] = preview.visibility.canViewInventory ? (preview.availability.every((item) => item.status === 'AVAILABLE') ? 'AVAILABLE' : 'MIXED') : 'UNKNOWN'
      const costDelta = preview.cost && baselineCost !== undefined ? Number((preview.cost.totalCost - baselineCost).toFixed(4)) : undefined
      const change = compositionChangePercent(baselineProposal, candidate.proposal)
      const score = Number(Math.max(0, Math.min(100, (complianceStatus === 'PASS' ? 60 : complianceStatus === 'REVIEW_REQUIRED' ? 30 : 0) + (availability === 'AVAILABLE' ? 20 : availability === 'MIXED' ? 5 : 0) + (costDelta === undefined ? 0 : costDelta <= 0 ? 15 : 0) + Math.max(0, 5 - change / 20))).toFixed(2))
      return { candidateId: crypto.randomUUID(), title: candidate.title, proposal: candidate.proposal, complianceStatus, availability, costDelta, compositionChangePercent: change, score, status: 'READY' as const, summary: [`Compliance: ${complianceStatus}.`, `Inventory: ${availability === 'UNKNOWN' ? 'Not evaluated for this role.' : availability.toLowerCase() + '.'}`, costDelta === undefined ? 'Cost: Not evaluated for this role.' : `Cost delta: ${costDelta.toFixed(2)}.`, `Composition change: ${change.toFixed(2)}%.`] }
    }).sort((left, right) => compareOptimizerCandidates({ ...left, inventoryEvaluated: left.availability !== 'UNKNOWN' }, { ...right, inventoryEvaluated: right.availability !== 'UNKNOWN' }))
    this.state.optimizerCandidates[run.id] = candidates
    this.persistArtifact(run, { type: 'optimizer_candidates', version: 1, data: { baselineFormulaId: request.baselineFormulaId, baselineVersion: request.baselineVersion, intent: request.intent, candidates } })
    this.addNode(run, 'prepare_result', 94, { candidateCount: candidates.length })
    this.assistantMessage(run, 'I ranked deterministic reformulation candidates by compliance, inventory evidence, cost evidence when permitted, and composition change.')
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
      if (!preview.cost) throw new UnprocessableEntityException('Legacy formula research requires costing access')
      const cost = preview.cost
      for (const [index, definition] of agentNodeDefinitions.entries()) {
        const node: LocalNode = { id: crypto.randomUUID(), node_type: definition.type, status: definition.type === 'save_formula_draft' ? 'WAITING_FOR_CONFIRMATION' : 'COMPLETED', attempt: 1 }
        run.nodes.push(node)
        const progress = definition.type === 'save_formula_draft' ? 95 : Math.min(90, (index + 1) * 13)
        this.event(run, definition.type === 'save_formula_draft' ? 'node.progress' : 'node.completed', { nodeId: node.id, nodeType: definition.type, status: node.status, progress })
      }
      const materialById = new Map(candidates.map((material) => [material.id, material]))
      const costById = new Map(cost.lines.map((line) => [line.materialId, line]))
      this.persistArtifact(run, { type: 'formula_table', version: 1, data: { formulaName: proposal.name, formulaType: proposal.formulaType, targetGrams: proposal.targetGrams, finalProductConcentrationPercent: proposal.finalProductConcentrationPercent, ingredients: proposal.ingredients.map((ingredient) => { const material = materialById.get(ingredient.materialId)!; const availability = preview.availability.find((item) => item.materialId === ingredient.materialId); const lineCost = costById.get(ingredient.materialId); return { materialId: material.id, materialName: material.name, percentage: ingredient.percentage, weightGrams: proposal.targetGrams * ingredient.percentage / 100, availableGrams: availability?.availableGrams, estimatedUnitCost: lineCost?.unitCost, estimatedCost: lineCost?.lineCost, currency: 'USD', warnings: [] } }), totalPercentage: 100, totalWeightGrams: proposal.targetGrams, totalEstimatedCost: cost.totalCost, currency: 'USD' } })
      this.persistArtifact(run, { type: 'inventory_report', version: 1, data: { eligible: preview.availability } })
      this.persistArtifact(run, { type: 'cost_summary', version: 1, data: { totalCost: cost.totalCost, costPerGram: cost.costPerGram, currency: 'USD', mostExpensiveMaterial: cost.mostExpensiveMaterial } })
      this.persistArtifact(run, { type: 'compliance_report', version: 1, data: { ifraCategory: proposal.ifraCategory, status: preview.compliance.status === 'BLOCKED' ? 'BLOCKED' : preview.compliance.status === 'REVIEW_REQUIRED' ? 'NEAR_LIMIT' : 'PASS', sourceLabel: preview.ifra.label, warnings: preview.ifra.rows.filter((row) => row.status !== 'PASS' && row.status !== 'NO_LIMIT').map((row) => `${row.materialName}: ${row.status}`) } })
      this.persistArtifact(run, { type: 'assumptions', version: 1, data: { assumptions: ['Local deterministic mock uses real workspace tools and does not send data to a model provider.'], warnings: preview.availability.filter((item) => item.status !== 'AVAILABLE').map((item) => `${item.materialName}: ${item.status}`) } })
      const saveNode = run.nodes.at(-1)!
      this.assistantMessage(run, 'I prepared a deterministic formula proposal from your workspace data. Review the structured evidence and explicitly confirm before a draft is created.')
      run.confirmation = { id: crypto.randomUUID(), status: 'PENDING', summary: `Save ${proposal.name} as a non-consuming formula draft`, proposal, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
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
      this.state = {
        runs: Array.isArray(parsed.runs) ? parsed.runs : [],
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        optimizerCandidates: parsed.optimizerCandidates && typeof parsed.optimizerCandidates === 'object' ? parsed.optimizerCandidates : {},
        idempotency: parsed.idempotency && typeof parsed.idempotency === 'object' ? parsed.idempotency : {},
      }
      this.pruneIdempotencyRecords()
    } catch { this.state = { runs: [], projects: [], optimizerCandidates: {}, idempotency: {} } }
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

  private pruneIdempotencyRecords() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    for (const [scope, record] of Object.entries(this.state.idempotency)) {
      if (!record?.createdAt || Date.parse(record.createdAt) < cutoff) delete this.state.idempotency[scope]
    }
  }
}
