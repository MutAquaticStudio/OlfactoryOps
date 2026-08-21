import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  AGENT_PROTOCOL_VERSION,
  AGENT_MAX_EVENT_BYTES,
  agentArtifactSchema,
  designCandidateEvaluationSchema,
  agentFormulaProposalSchema,
  agentNodeDefinitions,
  formulaDesignBriefFromStructuredBrief,
  formulaDesignBriefSchema,
  formulaDesignProjectCreateSchema,
  formulaDirectionFeedbackSchema,
  formulaDirectionShareSchema,
  formulaOptimizerRequestSchema,
  rawBriefFromProjectCreate,
  type FormulaDesignBriefVersionState,
  type StructuredFormulaDesignBrief,
  toSafeAgentRuntimeError,
  validateStructuredFormulaDesignBrief,
  type AgentArtifact,
  type AgentFormulaProposal,
  type AgentRuntimeEvent,
  type AgentRunStatus,
  type DesignCandidateEvaluation,
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
  optimizerBaselineLines,
  optimizerParetoState,
  proposalFromFormulaVersion,
  sensoryMemoryEvidenceForDirection,
} from '../../../src/data/formulaIntelligence.js'
import type { AuthSession, FormulaIntelligenceTrialSource } from '../../../src/data/northStar.js'
import { NorthStarService } from './northstar.service.js'

type LocalNode = { id: string; node_type: string; status: string; attempt: number }
type LocalMessage = { id: string; role: 'user' | 'assistant'; content: string; status: 'STREAMING' | 'COMPLETED'; created_at: string; completed_at?: string }
type LocalRun = {
  id: string; organization_id: string; user_id: string; session_id: string; status: AgentRunStatus
  input_brief: string; progress: number; provider: string; model_name: string; created_at: string; updated_at: string
  last_event_sequence: number; nodes: LocalNode[]; messages: LocalMessage[]; artifacts: Array<{ id: string; type: string; version: number; data: AgentArtifact; status: string }>
  events: AgentRuntimeEvent[]; confirmation?: { id: string; status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'; summary: string; proposal: AgentFormulaProposal; expiresAt: string; savedFormulaId?: string }
  intelligence?: { workflowKind: 'DESIGN_STUDIO' | 'REFORMULATION_OPTIMIZER'; projectId?: string; briefVersionId?: string; constraintSnapshotId?: string; materialUniverseHash?: string; request?: FormulaOptimizerRequest }
  pendingSave?: { kind: 'design' | 'optimizer'; projectId?: string; directionId?: string; candidateId?: string }
}
type LocalDesignDirection = DesignDirectionArtifact & { runId: string; status: 'DRAFT' | 'SHARED' | 'SELECTED' | 'SAVED'; evaluation?: DesignCandidateEvaluation; sharedAt?: string; savedFormulaId?: string; trialId?: string; shares?: Array<{ recipientUserId: string; allowMaterialNames: boolean; sharedAt: string; revokedAt?: string }> }
type LocalDesignFeedback = { id: string; directionId: string; userId: string; rating?: number; comment: string; selected: boolean; createdAt: string }
type LocalDesignBriefVersion = {
  id: string; versionNumber: number; state: FormulaDesignBriefVersionState; schemaVersion: number; rawBrief: string
  structuredBrief?: StructuredFormulaDesignBrief; unresolvedQuestions: Array<{ field: string; reason: string; importance: 'LOW' | 'MEDIUM' | 'HIGH' }>
  compilerMode: 'MANUAL' | 'NOT_CONFIGURED' | 'LEGACY'; checksum: string; createdByUserId: string; createdAt: string
}
type LocalDesignConstraintSnapshot = {
  id: string; briefVersionId: string; constraintsHash: string; materialUniverseHash?: string
  materialUniverseState: 'NOT_EVALUATED' | 'PINNED'; materialUniverse?: Array<{ id: string; family: string; tier: string; availabilityRank: number }>; createdAt: string
}
type LocalDesignProject = {
  id: string; organizationId: string; brandId: string; createdByUserId: string; name: string; brief?: FormulaDesignBrief
  briefVersions: LocalDesignBriefVersion[]; currentBriefVersionId?: string; constraintSnapshots?: LocalDesignConstraintSnapshot[]
  status: 'BRIEFED' | 'IN_PROGRESS' | 'IN_REVIEW' | 'SELECTED' | 'ARCHIVED'; selectedDirectionId?: string; formulaTypeHint?: 'ACCORD' | 'FINE_FRAGRANCE'
  archivedAt?: string; archivedByUserId?: string; archivePreviousStatus?: 'BRIEFED' | 'IN_PROGRESS' | 'IN_REVIEW' | 'SELECTED'; purgeAfter?: string
  directions: LocalDesignDirection[]; feedback: LocalDesignFeedback[]; createdAt: string; updatedAt: string
}
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
function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalJson(nested)]))
  }
  return value
}

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

  async listDesignProjects(service: NorthStarService, session: AuthSession, canViewPrivate: boolean, includeArchived = false, canApproveBrief = false) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.view')
    const current = actor(session)
    return {
      data: this.state.projects
        .filter((project) => includeArchived || project.status !== 'ARCHIVED')
        .filter((project) => project.organizationId === current.organizationId && (
          project.createdByUserId === current.userId ||
          this.isProjectProducer(current.userId, project.id) ||
          project.directions.some((direction) => direction.shares?.some((share) => share.recipientUserId === current.userId && !share.revokedAt)) ||
          (canViewPrivate && project.status === 'BRIEFED' && project.brandId === session.brandId) ||
          (canApproveBrief && project.status === 'BRIEFED')
        ))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((project) => this.exposeProject(project, session, canViewPrivate)),
    }
  }

  async createDesignProject(service: NorthStarService, session: AuthSession, body: Record<string, unknown>) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.view')
    const current = actor(session)
    const input = formulaDesignProjectCreateSchema.parse(body)
    const rawBrief = rawBriefFromProjectCreate(input)
    const timestamp = now()
    const initialVersion: LocalDesignBriefVersion = {
      id: crypto.randomUUID(), versionNumber: 1, state: 'RAW', schemaVersion: 1, rawBrief,
      unresolvedQuestions: [{ field: 'structuredBrief', reason: 'Complete the structured review before generation.', importance: 'HIGH' }],
      compilerMode: 'MANUAL', checksum: this.briefChecksum({ schemaVersion: 1, rawBrief, state: 'RAW' }), createdByUserId: current.userId, createdAt: timestamp,
    }
    const project: LocalDesignProject = {
      id: crypto.randomUUID(), organizationId: current.organizationId, brandId: session.brandId, createdByUserId: current.userId,
      name: input.name, briefVersions: [initialVersion], currentBriefVersionId: initialVersion.id,
      status: 'BRIEFED', formulaTypeHint: input.formulaType, directions: [], feedback: [], createdAt: timestamp, updatedAt: timestamp,
    }
    this.state.projects.unshift(project)
    service.recordIntegrationAudit('formula-intelligence.design.project.create', project.id)
    await this.persist()
    return { data: { project: this.exposeProject(project, session, false) } }
  }

  async designProject(service: NorthStarService, session: AuthSession, projectId: string, canViewPrivate: boolean, canApproveBrief = false) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.view')
    const project = this.projectFor(session, projectId, false, false, canApproveBrief)
    return { data: { project: this.exposeProject(project, session, canViewPrivate) } }
  }

  async archiveDesignProject(service: NorthStarService, session: AuthSession, projectId: string) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.view')
    const project = this.projectForLifecycle(session, projectId)
    if (project.status === 'ARCHIVED') {
      return { data: { projectId: project.id, status: 'ARCHIVED', purgeAfter: project.purgeAfter, duplicate: true } }
    }
    const timestamp = now()
    const purgeAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    project.archivePreviousStatus = project.status === 'IN_PROGRESS' ? 'BRIEFED' : project.status
    project.status = 'ARCHIVED'
    project.archivedAt = timestamp
    project.archivedByUserId = session.userId
    project.purgeAfter = purgeAfter
    project.updatedAt = timestamp
    for (const direction of project.directions) {
      for (const share of direction.shares ?? []) {
        if (!share.revokedAt) share.revokedAt = timestamp
      }
    }
    for (const run of this.state.runs.filter((candidate) => candidate.organization_id === session.organizationId && candidate.intelligence?.workflowKind === 'DESIGN_STUDIO' && candidate.intelligence.projectId === project.id && ['QUEUED', 'RUNNING', 'WAITING_FOR_CONFIRMATION', 'PAUSED'].includes(candidate.status))) {
      run.status = 'CANCELLED'
      run.updated_at = timestamp
      if (run.confirmation?.status === 'PENDING') run.confirmation.status = 'EXPIRED'
      this.event(run, 'run.cancelled', { status: 'CANCELLED', progress: run.progress, reason: 'design-project-archived' })
    }
    service.recordIntegrationAudit('formula-intelligence.design.project.archive', project.id)
    await this.persist()
    return { data: { projectId: project.id, status: 'ARCHIVED', purgeAfter, duplicate: false } }
  }

  async restoreDesignProject(service: NorthStarService, session: AuthSession, projectId: string) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.view')
    const project = this.projectForLifecycle(session, projectId)
    if (project.status !== 'ARCHIVED') throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_PROJECT_NOT_ARCHIVED')
    const restoredStatus = project.archivePreviousStatus && project.archivePreviousStatus !== 'IN_PROGRESS' ? project.archivePreviousStatus : 'BRIEFED'
    project.status = restoredStatus
    delete project.archivedAt
    delete project.archivedByUserId
    delete project.archivePreviousStatus
    delete project.purgeAfter
    project.updatedAt = now()
    service.recordIntegrationAudit('formula-intelligence.design.project.restore', project.id)
    await this.persist()
    return { data: { projectId: project.id, status: restoredStatus, duplicate: false } }
  }

  async designBriefVersions(service: NorthStarService, session: AuthSession, projectId: string, canViewPrivate: boolean, canApproveBrief = false) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.view')
    const project = this.projectFor(session, projectId, true, false, canApproveBrief)
    if (!canViewPrivate && project.createdByUserId !== session.userId) throw new NotFoundException('Design project was not found')
    return { data: { currentBriefVersionId: project.currentBriefVersionId, versions: project.briefVersions.map((version) => this.exposeBriefVersion(version)) } }
  }

  async designBriefCompilerStatus(service: NorthStarService, session: AuthSession, projectId: string, canViewPrivate: boolean, canApproveBrief = false) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.view')
    const project = this.projectFor(session, projectId, true, false, canApproveBrief)
    if (!canViewPrivate && project.createdByUserId !== session.userId) throw new NotFoundException('Design project was not found')
    return { data: { mode: 'MANUAL', status: 'NOT_CONFIGURED', message: 'AI brief compilation is not configured. Review the structured brief manually.' } }
  }

  async designMaterialCatalog(service: NorthStarService, _session: AuthSession) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.viewSensitive')
    this.requireFormulaPermission(service, 'materials.view')
    const workspaceMaterials = service.materials().data
    return { data: {
      materials: this.approvedMaterials(service),
      reviewedOnly: true as const,
      sourceReferenceCount: 0,
      workspaceMaterialCount: workspaceMaterials.length,
    } }
  }

  async saveDesignBriefVersion(service: NorthStarService, session: AuthSession, projectId: string, body: unknown) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.edit')
    const canApproveBrief = this.canApproveBrief(service, session)
    const project = this.projectFor(session, projectId, true, false, canApproveBrief)
    const canEdit = project.createdByUserId === session.userId || (project.status === 'BRIEFED' && project.brandId === session.brandId) || (canApproveBrief && project.status === 'BRIEFED')
    if (!canEdit) throw new NotFoundException('Design project was not found')
    const validation = validateStructuredFormulaDesignBrief(body)
    this.assertDesignBriefMaterialConstraints(service, validation.brief)
    const prior = this.currentBriefVersion(project)
    const timestamp = now()
    const version: LocalDesignBriefVersion = {
      id: crypto.randomUUID(), versionNumber: Math.max(0, ...project.briefVersions.map((item) => item.versionNumber)) + 1,
      state: validation.state, schemaVersion: validation.brief.schemaVersion, rawBrief: prior?.rawBrief ?? '', structuredBrief: validation.brief,
      unresolvedQuestions: validation.unresolvedQuestions, compilerMode: 'MANUAL',
      checksum: this.briefChecksum({ schemaVersion: validation.brief.schemaVersion, rawBrief: prior?.rawBrief ?? '', structuredBrief: validation.brief, unresolvedQuestions: validation.unresolvedQuestions }),
      createdByUserId: session.userId, createdAt: timestamp,
    }
    project.briefVersions.unshift(version)
    project.currentBriefVersionId = version.id
    project.formulaTypeHint = validation.brief.product.formulaType ?? project.formulaTypeHint
    if (validation.state === 'REVIEWED') project.brief = formulaDesignBriefFromStructuredBrief(project.name, validation.brief)
    project.updatedAt = timestamp
    service.recordIntegrationAudit(
      validation.state === 'REVIEWED' && canApproveBrief
        ? 'formula-intelligence.design.brief.approve'
        : 'formula-intelligence.design.brief.version.create',
      `${project.id}:${version.id}`,
      validation.state === 'REVIEWED' ? 'allowed' : 'review',
    )
    await this.persist()
    return { data: { version: this.exposeBriefVersion(version) } }
  }

  async designRecipients(service: NorthStarService, session: AuthSession, projectId: string) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.edit')
    const project = this.projectFor(session, projectId, true)
    this.requireProjectProducer(session, project)
    return { data: service.formulaDesignRecipients(project.brandId).data }
  }

  async generateDesignDirections(service: NorthStarService, session: AuthSession, projectId: string) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.edit')
    this.requireFormulaPermission(service, 'formulas.viewSensitive')
    this.requireFormulaPermission(service, 'materials.view')
    if (!service.formulaIntelligenceFeatureEnabled('designStudioCandidateGeneration')) {
      throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_FEATURE_DISABLED')
    }
    const project = this.projectFor(session, projectId, true, false, this.canApproveBrief(service, session))
    if (project.status !== 'BRIEFED') throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_PROJECT_ALREADY_GENERATED')
    const briefVersion = this.currentBriefVersion(project)
    if (briefVersion?.state === 'RAW' || briefVersion?.state === 'REVIEW_REQUIRED') {
      throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_REVIEWED_BRIEF_REQUIRED')
    }
    if (briefVersion?.state === 'REVIEWED' && briefVersion.structuredBrief) {
      this.assertDesignBriefMaterialConstraints(service, briefVersion.structuredBrief)
      project.brief = formulaDesignBriefFromStructuredBrief(project.name, briefVersion.structuredBrief)
    }
    if (!project.brief) throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_REVIEWED_BRIEF_REQUIRED')
    const constraintSnapshot = briefVersion?.state === 'REVIEWED' ? this.ensureConstraintSnapshot(project, briefVersion) : undefined
    let run: LocalRun
    try {
      run = this.createIntelligenceRun(session, project.brief.creativeBrief, {
        workflowKind: 'DESIGN_STUDIO',
        projectId,
        ...(briefVersion?.state === 'REVIEWED' ? { briefVersionId: briefVersion.id } : {}),
        ...(constraintSnapshot ? { constraintSnapshotId: constraintSnapshot.id } : {}),
      })
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

  async createTrialFromDesignDirection(service: NorthStarService, session: AuthSession, projectId: string, directionId: string, body: unknown) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.edit')
    this.requireFormulaPermission(service, 'formulas.viewSensitive')
    this.requireFormulaPermission(service, 'materials.view')
    const project = this.projectFor(session, projectId, true)
    const direction = project.directions.find((item) => item.directionId === directionId)
    if (!direction) throw new NotFoundException('Design direction was not found')
    if (!this.state.runs.some((run) => run.id === direction.runId && run.user_id === session.userId)) {
      throw new ForbiddenException('Only the perfumer who generated a direction can plan its trial')
    }
    if (!direction.savedFormulaId || direction.status !== 'SAVED') {
      throw new UnprocessableEntityException('Save this direction as a formula draft before planning a trial')
    }
    if (direction.trialId) {
      return { data: { trial: service.trialDetail(direction.trialId).data.trial, duplicate: true, invariant: 'a design direction maps to one planned trial and never reserves or consumes inventory' } }
    }
    const run = this.runFor(session, direction.runId)
    const snapshot = project.constraintSnapshots?.find((item) => item.id === run.intelligence?.constraintSnapshotId)
    if (!direction.evaluation || !run.intelligence?.briefVersionId || !snapshot?.materialUniverseHash || direction.evaluation.materialUniverse.hash !== snapshot.materialUniverseHash) {
      throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_CANDIDATE_LINEAGE_REQUIRED')
    }
    if (direction.evaluation.constraints.state === 'BLOCKED') {
      throw new UnprocessableEntityException('A blocked direction cannot be planned as a trial')
    }
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
    const source: FormulaIntelligenceTrialSource = {
      kind: 'DESIGN_DIRECTION',
      projectId,
      directionId,
      runId: direction.runId,
      briefVersionId: run.intelligence.briefVersionId,
      constraintSnapshotId: snapshot.id,
      materialUniverseHash: snapshot.materialUniverseHash,
      evaluationHash: this.briefChecksum(direction.evaluation),
    }
    const result = service.createTrialFromFormulaIntelligenceCandidate({
      formulaId: direction.savedFormulaId,
      ...(typeof input.title === 'string' ? { title: input.title } : {}),
      ...(typeof input.sampleCode === 'string' ? { sampleCode: input.sampleCode } : {}),
    }, source)
    direction.trialId = result.data.trial.id
    project.updatedAt = now()
    service.recordIntegrationAudit('formula-intelligence.design.direction.trial.create', directionId)
    await this.persist()
    return { data: { ...result.data, duplicate: false, invariant: 'a direction trial preserves immutable candidate lineage and creates no reservation or inventory movement' } }
  }

  async startOptimizer(service: NorthStarService, session: AuthSession, body: Record<string, unknown>) {
    await this.ready()
    this.requireFormulaPermission(service, 'formulas.viewSensitive')
    this.requireFormulaPermission(service, 'materials.view')
    if (!service.formulaIntelligenceFeatureEnabled('designStudioOptimizer')) {
      throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_FEATURE_DISABLED')
    }
    const request = formulaOptimizerRequestSchema.parse(body)
    if ((request.objectives?.targetCostReductionPercent !== undefined || request.objectives?.maxTotalCost !== undefined) && !service.me().data.permissions.includes('costing.view')) {
      throw new ForbiddenException('Formula Intelligence cost objectives require costing.view')
    }
    if (request.requireEligibleInventory && !service.me().data.permissions.includes('inventory.view')) {
      throw new ForbiddenException('Eligible inventory gating requires inventory.view')
    }
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
    const preserved = [...new Set([...request.lockedMaterialIds, ...(request.objectives?.preserveMaterialIds ?? [])])]
    if (preserved.some((materialId) => !candidateMaterialIds.has(materialId))) throw new UnprocessableEntityException('Candidate does not preserve all locked materials')
    if ((request.objectives?.prohibitedMaterialIds ?? []).some((materialId) => candidateMaterialIds.has(materialId))) throw new UnprocessableEntityException('Candidate contains a prohibited material')
    const versions = service.formulaVersions(request.baselineFormulaId).data
    const baseline = versions.versions.find((version) => version.version === request.baselineVersion)
    if (!baseline) throw new UnprocessableEntityException('The immutable optimizer baseline is no longer available')
    const baselineLines = optimizerBaselineLines(baseline)
    if (baselineLines.length === 0) throw new UnprocessableEntityException('Optimizer baseline cannot be resolved to raw materials')
    const baselineProposal = proposalFromFormulaVersion(versions.formula, baselineLines)
    if (compositionChangePercent(baselineProposal, candidate.proposal) < 0.005) throw new UnprocessableEntityException('Candidate matches the immutable baseline and cannot create a duplicate draft')
    const baselinePercentages = new Map(baselineProposal.ingredients.map((ingredient) => [ingredient.materialId, ingredient.percentage]))
    const candidatePercentages = new Map(candidate.proposal.ingredients.map((ingredient) => [ingredient.materialId, ingredient.percentage]))
    if (request.lockedMaterialIds.some((materialId) => Math.abs((candidatePercentages.get(materialId) ?? -1) - (baselinePercentages.get(materialId) ?? -2)) > 0.005)) {
      throw new UnprocessableEntityException('Candidate changes a material percentage that was locked by the optimizer request')
    }
    const preview = service.previewFormulaIntelligence(candidate.proposal).data
    if (preview.compliance.status !== 'APPROVED' || preview.ifra.blockerCount > 0) throw new UnprocessableEntityException('Only a compliance-passing candidate can be saved as a formula draft')
    this.assertOptimizerCostObjectives(service, request, preview.cost)
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
    if (confirmation.status === 'EXPIRED') throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_CONFIRMATION_EXPIRED')
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
      ifraCategory: confirmation.proposal.ifraCategory, requiresFinalProductContext: confirmation.proposal.requiresFinalProductContext, brief: confirmation.proposal.brief,
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

  private projectForLifecycle(session: AuthSession, projectId: string) {
    const project = this.state.projects.find((candidate) => candidate.id === projectId && candidate.organizationId === session.organizationId)
    if (!project) throw new NotFoundException('Design project was not found')
    const role = session.role.trim().toLowerCase()
    if (project.createdByUserId !== session.userId && role !== 'owner' && role !== 'admin') {
      throw new ForbiddenException('Only the brief creator or a workspace Owner/Admin can archive this project')
    }
    return project
  }

  private projectFor(session: AuthSession, projectId: string, allowBrandBrief: boolean, includeArchived = false, canApproveBrief = false) {
    const current = actor(session)
    const project = this.state.projects.find((candidate) => candidate.id === projectId && candidate.organizationId === current.organizationId && (
      candidate.createdByUserId === current.userId ||
      this.isProjectProducer(current.userId, candidate.id) ||
      candidate.directions.some((direction) => direction.shares?.some((share) => share.recipientUserId === current.userId && !share.revokedAt)) ||
      (allowBrandBrief && candidate.status === 'BRIEFED' && candidate.brandId === session.brandId) ||
      (canApproveBrief && candidate.status === 'BRIEFED')
    ))
    if (!project || (!includeArchived && project.status === 'ARCHIVED')) throw new NotFoundException('Design project was not found')
    return project
  }

  private canApproveBrief(service: NorthStarService, session: AuthSession) {
    const context = service.me().data
    return context.session.id === session.id
      && context.session.userId === session.userId
      && context.session.organizationId === session.organizationId
      && context.permissions.includes('formulas.approve')
  }

  private isProjectProducer(userId: string, projectId: string) {
    return this.state.runs.some((run) => run.user_id === userId && run.intelligence?.workflowKind === 'DESIGN_STUDIO' && run.intelligence.projectId === projectId)
  }

  private currentBriefVersion(project: LocalDesignProject) {
    return project.briefVersions.find((version) => version.id === project.currentBriefVersionId)
      ?? project.briefVersions[0]
  }

  private ensureConstraintSnapshot(project: LocalDesignProject, briefVersion: LocalDesignBriefVersion) {
    if (!briefVersion.structuredBrief) return undefined
    project.constraintSnapshots ??= []
    const existing = project.constraintSnapshots.find((snapshot) => snapshot.briefVersionId === briefVersion.id)
    if (existing) return existing
    const snapshot: LocalDesignConstraintSnapshot = {
      id: crypto.randomUUID(),
      briefVersionId: briefVersion.id,
      constraintsHash: this.briefChecksum({ product: briefVersion.structuredBrief.product, constraints: briefVersion.structuredBrief.constraints }),
      materialUniverseState: 'NOT_EVALUATED',
      createdAt: now(),
    }
    project.constraintSnapshots.push(snapshot)
    return snapshot
  }

  private pinMaterialUniverse(project: LocalDesignProject, snapshotId: string, materials: Array<{ id: string; family: string; tier: string; availabilityRank?: number }>) {
    const snapshot = project.constraintSnapshots?.find((item) => item.id === snapshotId)
    if (!snapshot) throw new NotFoundException('Design constraint snapshot was not found')
    const universe = materials.map((material) => ({
      id: material.id,
      family: material.family,
      tier: material.tier,
      availabilityRank: Number((material.availabilityRank ?? 0).toFixed(4)),
    })).sort((left, right) => left.id.localeCompare(right.id))
    const hash = this.briefChecksum(universe)
    if (snapshot.materialUniverseState === 'PINNED' && snapshot.materialUniverseHash !== hash) {
      throw new ConflictException('Design material universe was already pinned for this reviewed brief')
    }
    snapshot.materialUniverseState = 'PINNED'
    snapshot.materialUniverseHash = hash
    snapshot.materialUniverse = universe
    return snapshot
  }

  private evaluateDesignCandidates(
    directions: LocalDesignDirection[],
    previews: Array<ReturnType<NorthStarService['previewFormulaIntelligence']>['data']>,
    brief: FormulaDesignBrief,
    snapshot: LocalDesignConstraintSnapshot,
  ) {
    const materialUniverse = snapshot.materialUniverse
    if (!snapshot.materialUniverseHash || !materialUniverse) throw new ConflictException('Design material universe is not pinned')
    const candidates = directions.map((direction, index) => {
      const preview = previews[index]!
      const requiredMaterialsSatisfied = brief.lockedMaterialIds.every((materialId) => direction.proposal.ingredients.some((ingredient) => ingredient.materialId === materialId))
      const constraintState: DesignCandidateEvaluation['constraints']['state'] = !requiredMaterialsSatisfied || direction.complianceStatus === 'BLOCKED'
        ? 'BLOCKED'
        : direction.complianceStatus === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'PASS'
      return designCandidateEvaluationSchema.parse({
        directionId: direction.directionId,
        rank: 1,
        proposalChecksum: this.briefChecksum(direction.proposal),
        composition: { state: 'VALID', totalPercentage: Number(direction.proposal.ingredients.reduce((sum, ingredient) => sum + ingredient.percentage, 0).toFixed(4)) },
        constraints: { state: constraintState, requiredMaterialsSatisfied },
        complianceStatus: direction.complianceStatus,
        availability: direction.availability,
        cost: preview.cost ? { state: 'EVALUATED', totalCost: Number(preview.cost.totalCost.toFixed(4)) } : { state: 'NOT_EVALUATED' },
        materialUniverse: { hash: snapshot.materialUniverseHash, materialCount: materialUniverse.length },
        warnings: direction.warnings,
      })
    })
    const rankConstraint = (value: DesignCandidateEvaluation['constraints']['state']) => value === 'PASS' ? 3 : value === 'REVIEW_REQUIRED' ? 2 : 1
    const rankCompliance = (value: DesignCandidateEvaluation['complianceStatus']) => value === 'PASS' ? 3 : value === 'REVIEW_REQUIRED' ? 2 : 1
    const rankAvailability = (value: DesignCandidateEvaluation['availability']) => value === 'AVAILABLE' ? 3 : value === 'MIXED' ? 2 : 1
    return candidates.sort((left, right) => {
      const constraints = rankConstraint(right.constraints.state) - rankConstraint(left.constraints.state)
      if (constraints) return constraints
      const compliance = rankCompliance(right.complianceStatus) - rankCompliance(left.complianceStatus)
      if (compliance) return compliance
      const availability = rankAvailability(right.availability) - rankAvailability(left.availability)
      if (availability) return availability
      const costEvidence = Number(right.cost.state === 'EVALUATED') - Number(left.cost.state === 'EVALUATED')
      if (costEvidence) return costEvidence
      if (left.cost.totalCost !== undefined && right.cost.totalCost !== undefined && left.cost.totalCost !== right.cost.totalCost) return left.cost.totalCost - right.cost.totalCost
      return left.proposalChecksum.localeCompare(right.proposalChecksum)
    }).map((candidate, index) => ({ ...candidate, rank: index + 1 }))
  }

  private exposeBriefVersion(version: LocalDesignBriefVersion) {
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      state: version.state,
      schemaVersion: version.schemaVersion,
      rawBrief: version.rawBrief,
      structuredBrief: version.structuredBrief,
      unresolvedQuestions: version.unresolvedQuestions,
      compilerMode: version.compilerMode,
      checksum: version.checksum,
      createdAt: version.createdAt,
    }
  }

  private briefChecksum(value: unknown) {
    return createHash('sha256').update(JSON.stringify(canonicalJson(value))).digest('hex')
  }

  private requireProjectProducer(session: AuthSession, project: LocalDesignProject) {
    if (!this.isProjectProducer(session.userId, project.id)) {
      throw new ForbiddenException('Only the generating perfumer can manage direction recipients')
    }
  }

  private exposeProject(project: LocalDesignProject, session: AuthSession, canViewPrivate: boolean) {
    const current = actor(session)
    const canViewBriefDetails = canViewPrivate || project.createdByUserId === current.userId
    const briefVersion = this.currentBriefVersion(project)
    return {
      id: project.id, name: project.name, status: project.status, createdByUserId: project.createdByUserId,
      selectedDirectionId: project.selectedDirectionId,
      formulaTypeHint: project.formulaTypeHint,
      ...(project.status === 'ARCHIVED' ? { archivedAt: project.archivedAt, purgeAfter: project.purgeAfter } : {}),
      ...(project.brief && canViewBriefDetails ? { brief: project.brief } : {}),
      currentBriefVersionId: project.currentBriefVersionId,
      briefVersion: canViewBriefDetails && briefVersion ? this.exposeBriefVersion(briefVersion) : undefined,
      briefStatus: briefVersion?.state ?? 'LEGACY_UNSTRUCTURED',
      createdAt: project.createdAt, updatedAt: project.updatedAt,
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
          trialId: privateDirection ? direction.trialId : undefined,
          ...(privateDirection ? { runId: direction.runId, proposal: direction.proposal, evaluation: direction.evaluation, shares: direction.shares?.filter((item) => !item.revokedAt) } : {}),
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
    const isAccordAwaitingFinalUse = proposal.formulaType === 'ACCORD' && proposal.requiresFinalProductContext
    if (preview.compliance.blockedMaterialIds.length > 0 || (!isAccordAwaitingFinalUse && (preview.compliance.status === 'BLOCKED' || preview.ifra.blockerCount > 0))) {
      throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_DRAFT_BLOCKED')
    }
    if (run.pendingSave?.kind === 'design' && run.pendingSave.projectId) {
      const project = this.state.projects.find((item) => item.id === run.pendingSave?.projectId && item.organizationId === run.organization_id)
      const materials = new Set(proposal.ingredients.map((ingredient) => ingredient.materialId))
      if (!project || (project.brief?.lockedMaterialIds ?? []).some((materialId) => !materials.has(materialId))) {
        throw new UnprocessableEntityException('Formula draft does not preserve locked materials from the design brief')
      }
    }
    if (run.pendingSave?.kind === 'optimizer') {
      const request = run.intelligence?.request
      const materials = new Set(proposal.ingredients.map((ingredient) => ingredient.materialId))
      const preserved = request ? [...new Set([...request.lockedMaterialIds, ...(request.objectives?.preserveMaterialIds ?? [])])] : []
      if (!request || preserved.some((materialId) => !materials.has(materialId))) {
        throw new UnprocessableEntityException('Candidate does not preserve all locked materials')
      }
      if ((request.objectives?.prohibitedMaterialIds ?? []).some((materialId) => materials.has(materialId))) {
        throw new UnprocessableEntityException('Candidate contains a prohibited material')
      }
      this.assertOptimizerCostObjectives(service, request, preview.cost)
      if (request.requireEligibleInventory) {
        if (!preview.visibility.canViewInventory) throw new ForbiddenException('Inventory permission is required when eligible inventory is mandatory')
        if (preview.availability.some((item) => item.status !== 'AVAILABLE')) throw new UnprocessableEntityException('Candidate does not have eligible inventory for every material')
      }
    }
    return preview
  }

  private assertOptimizerCostObjectives(
    service: NorthStarService,
    request: FormulaOptimizerRequest,
    candidateCost: { totalCost: number } | undefined,
  ) {
    const targetReductionPercent = request.objectives?.targetCostReductionPercent ?? 0
    const maxTotalCost = request.objectives?.maxTotalCost
    if (targetReductionPercent === 0 && maxTotalCost === undefined) return
    const versions = service.formulaVersions(request.baselineFormulaId).data
    const baseline = versions.versions.find((version) => version.version === request.baselineVersion)
    if (!candidateCost || !baseline) throw new UnprocessableEntityException('Cost evidence is required before this constrained candidate can be saved')
    const baselineCost = service.previewFormulaIntelligence(proposalFromFormulaVersion(versions.formula, baseline.lines)).data.cost?.totalCost
    if (targetReductionPercent > 0 && (!baselineCost || ((baselineCost - candidateCost.totalCost) / baselineCost) * 100 + 0.0001 < targetReductionPercent)) {
      throw new UnprocessableEntityException('Candidate does not meet the requested cost reduction target')
    }
    if (maxTotalCost !== undefined && candidateCost.totalCost - maxTotalCost > 0.0001) {
      throw new UnprocessableEntityException('Candidate exceeds the maximum total cost objective')
    }
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
    return service.materials().data.filter((material) => (
      service.materialCompliance(material.id).data?.status === 'APPROVED'
    ))
  }

  private assertDesignBriefMaterialConstraints(service: NorthStarService, structured: StructuredFormulaDesignBrief) {
    const required = [...new Set(structured.constraints.requiredMaterialIds)]
    const prohibited = [...new Set(structured.constraints.prohibitedMaterialIds)]
    const overlap = required.filter((materialId) => prohibited.includes(materialId))
    if (overlap.length) throw new UnprocessableEntityException('A material cannot be both required and prohibited in the same brief')

    const workspaceMaterialIds = new Set(service.materials().data.map((material) => material.id))
    const outsideWorkspace = [...new Set([...required, ...prohibited])].filter((materialId) => !workspaceMaterialIds.has(materialId))
    if (outsideWorkspace.length) throw new UnprocessableEntityException('Design brief material constraints must reference Materials in this workspace')

    const reviewedMaterialIds = new Set(this.approvedMaterials(service).map((material) => material.id))
    const notReviewed = required.filter((materialId) => !reviewedMaterialIds.has(materialId))
    if (notReviewed.length) {
      throw new UnprocessableEntityException('Required materials must be reviewed and approved in Materials before direction generation')
    }
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
      const failure = toSafeAgentRuntimeError(error)
      run.status = 'FAILED'; run.updated_at = now(); this.event(run, 'run.failed', { status: 'FAILED', error: failure.message, errorInfo: failure })
    }
    await this.persist()
  }

  private async executeDesignStudio(service: NorthStarService, run: LocalRun) {
    const project = this.state.projects.find((item) => item.id === run.intelligence?.projectId && item.organizationId === run.organization_id)
    if (!project) throw new NotFoundException('Design project was not found')
    if (!project.brief) throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_REVIEWED_BRIEF_REQUIRED')
    this.addNode(run, 'analyze_brief', 12, { projectId: project.id })
    const availableByMaterial = new Map<string, number>()
    for (const lot of service.lotsList().data) {
      if (lot.qualityStatus === 'APPROVED') availableByMaterial.set(lot.materialId, (availableByMaterial.get(lot.materialId) ?? 0) + Math.max(0, lot.quantityGrams - lot.reservedGrams))
    }
    const materials = this.approvedMaterials(service).map((material) => ({ ...material, availabilityRank: availableByMaterial.get(material.id) ?? 0 }))
    if (!materials.length) throw new UnprocessableEntityException('No compliance-approved workspace materials are available for this design brief')
    const constraintSnapshot = run.intelligence?.constraintSnapshotId
      ? this.pinMaterialUniverse(project, run.intelligence.constraintSnapshotId, materials)
      : undefined
    if (constraintSnapshot?.materialUniverseHash && run.intelligence) run.intelligence.materialUniverseHash = constraintSnapshot.materialUniverseHash
    this.addNode(run, 'search_materials', 28, { materialCount: materials.length })
    this.addNode(run, 'check_inventory', 42, { visibility: service.me().data.permissions.includes('inventory.view') ? 'full' : 'redacted' })
    const permissions = new Set(service.me().data.permissions)
    const sensoryMemory = service.formulaIntelligenceFeatureEnabled('designStudioSensoryMemory') && permissions.has('trials.view')
      ? service.workspaceSensoryMemory().data
      : undefined
    const proposals = buildDesignDirectionProposals(project.brief, materials)
      .map((proposal) => ({
        ...proposal,
        historicalEvidence: sensoryMemory
          ? sensoryMemoryEvidenceForDirection(proposal, sensoryMemory.profile, sensoryMemory.enabled)
          : { state: 'NOT_EVALUATED' as const, evidenceCount: 0, adjustment: 0, explanation: 'Private sensory evidence is not available to this role.' },
      }))
      .sort((left, right) => right.historicalEvidence.adjustment - left.historicalEvidence.adjustment || left.title.localeCompare(right.title))
    this.addNode(run, 'generate_formula', 58, { directionCount: proposals.length })
    this.addNode(run, 'calculate_cost', 68, { visibility: service.me().data.permissions.includes('costing.view') ? 'full' : 'redacted' })
    const previews = proposals.map((proposal) => service.previewFormulaIntelligence(proposal.proposal).data)
    this.addNode(run, 'validate_compliance', 80, { statuses: previews.map((preview) => preview.compliance.status) })
    const directions: LocalDesignDirection[] = proposals.map((proposal, index) => {
      const preview = previews[index]!
      const requiresFinalUseReview = proposal.proposal.formulaType === 'ACCORD' && proposal.proposal.requiresFinalProductContext
      return {
        directionId: crypto.randomUUID(), runId: run.id, title: proposal.title, narrative: proposal.narrative, pyramidSummary: proposal.pyramidSummary,
        availability: preview.visibility.canViewInventory ? (preview.availability.every((item) => item.status === 'AVAILABLE') ? 'AVAILABLE' : 'MIXED') : 'UNKNOWN',
        complianceStatus: requiresFinalUseReview ? 'REVIEW_REQUIRED' : preview.compliance.status === 'APPROVED' ? 'PASS' : preview.compliance.status === 'BLOCKED' ? 'BLOCKED' : 'REVIEW_REQUIRED',
        proposal: proposal.proposal,
        warnings: [
          ...(requiresFinalUseReview ? ['Final-product concentration and IFRA use context are required before review.'] : []),
          ...preview.ifra.rows.filter((row) => row.status !== 'PASS' && row.status !== 'NO_LIMIT').map((row) => `${row.materialName}: ${row.status}`),
        ].slice(0, 20),
        historicalEvidence: proposal.historicalEvidence,
        status: 'DRAFT',
      }
    })
    const evaluations = constraintSnapshot ? this.evaluateDesignCandidates(directions, previews, project.brief, constraintSnapshot) : []
    const evaluationByDirectionId = new Map(evaluations.map((evaluation) => [evaluation.directionId, evaluation]))
    directions.forEach((direction) => { direction.evaluation = evaluationByDirectionId.get(direction.directionId) })
    project.directions = directions; project.status = 'IN_REVIEW'; project.updatedAt = now()
    this.persistArtifact(run, { type: 'design_directions', version: 1, data: { projectId: project.id, directions } })
    if (constraintSnapshot?.materialUniverseHash && run.intelligence?.briefVersionId) {
      this.persistArtifact(run, {
        type: 'design_candidate_comparison',
        version: 1,
        data: {
          projectId: project.id,
          briefVersionId: run.intelligence.briefVersionId,
          constraintSnapshotId: constraintSnapshot.id,
          materialUniverseHash: constraintSnapshot.materialUniverseHash,
          candidates: evaluations,
        },
      })
    }
    this.addNode(run, 'prepare_result', 94, { directionCount: directions.length })
    this.assistantMessage(run, 'I prepared three deterministic design directions. A perfumer can share a direction for brand feedback or request an explicit draft save.')
  }

  private async executeOptimizer(service: NorthStarService, run: LocalRun) {
    const request = run.intelligence?.request
    if (!request) throw new UnprocessableEntityException('Optimizer request is missing')
    const versions = service.formulaVersions(request.baselineFormulaId).data
    const baseline = versions.versions.find((version) => version.version === request.baselineVersion)
    const baselineLines = baseline ? optimizerBaselineLines(baseline) : []
    if (!baseline || baselineLines.length === 0) throw new UnprocessableEntityException('Optimizer requires an immutable baseline version that resolves to raw materials')
    const baselineProposal = proposalFromFormulaVersion(versions.formula, baselineLines)
    this.addNode(run, 'analyze_brief', 12, { baselineFormulaId: request.baselineFormulaId, baselineVersion: request.baselineVersion })
    const materials = this.approvedMaterials(service)
    this.addNode(run, 'search_materials', 28, { materialCount: materials.length })
    const available = new Set<string>()
    if (service.me().data.permissions.includes('inventory.view')) {
      service.lotsList().data.filter((lot) => lot.qualityStatus === 'APPROVED' && lot.quantityGrams > lot.reservedGrams).forEach((lot) => available.add(lot.materialId))
    }
    this.addNode(run, 'check_inventory', 42, { visibility: available.size ? 'full' : 'redacted' })
    const proposals = buildOptimizerProposals(baselineProposal, materials, request.intent, request.lockedMaterialIds, available, request.objectives, service.approvedMaterialSubstitutions().data)
    if (proposals.length === 0) throw new UnprocessableEntityException('No optimizer candidate satisfies the locked, prohibited, and approved-substitution constraints')
    this.addNode(run, 'generate_formula', 58, { candidateCount: proposals.length })
    const baselinePreview = service.previewFormulaIntelligence(baselineProposal).data
    const evaluated = proposals.map((candidate) => ({ candidate, preview: service.previewFormulaIntelligence(candidate.proposal).data }))
      .filter(({ preview }) => {
        if (request.objectives?.complianceRequired && preview.compliance.status === 'BLOCKED') return false
        if (request.requireEligibleInventory && preview.availability.some((item) => item.status !== 'AVAILABLE')) return false
        const baselineCost = baselinePreview.cost?.totalCost
        if (request.objectives?.targetCostReductionPercent !== undefined && (baselineCost === undefined || !preview.cost || ((baselineCost - preview.cost.totalCost) / baselineCost) * 100 + 0.0001 < request.objectives.targetCostReductionPercent)) return false
        if (request.objectives?.maxTotalCost !== undefined && (!preview.cost || preview.cost.totalCost - request.objectives.maxTotalCost > 0.0001)) return false
        return true
      })
    if (evaluated.length === 0) throw new UnprocessableEntityException('No optimizer candidate satisfies the requested compliance, inventory, and cost gates')
    const qualifiedProposals = evaluated.map(({ candidate }) => candidate)
    const previews = evaluated.map(({ preview }) => preview)
    this.addNode(run, 'calculate_cost', 70, { visibility: service.me().data.permissions.includes('costing.view') ? 'full' : 'redacted' })
    this.addNode(run, 'validate_compliance', 80, { statuses: previews.map((preview) => preview.compliance.status) })
    const baselineCost = baselinePreview.cost?.totalCost
    const baseCandidates: LocalOptimizerCandidate[] = qualifiedProposals.map((candidate, index) => {
      const preview = previews[index]!
      const complianceStatus: LocalOptimizerCandidate['complianceStatus'] = preview.compliance.status === 'APPROVED' ? 'PASS' : preview.compliance.status === 'BLOCKED' ? 'BLOCKED' : 'REVIEW_REQUIRED'
      const availability: LocalOptimizerCandidate['availability'] = preview.visibility.canViewInventory ? (preview.availability.every((item) => item.status === 'AVAILABLE') ? 'AVAILABLE' : 'MIXED') : 'UNKNOWN'
      const costDelta = preview.cost && baselineCost !== undefined ? Number((preview.cost.totalCost - baselineCost).toFixed(4)) : undefined
      const change = compositionChangePercent(baselineProposal, candidate.proposal)
      const score = Number(Math.max(0, Math.min(100, (complianceStatus === 'PASS' ? 60 : complianceStatus === 'REVIEW_REQUIRED' ? 30 : 0) + (availability === 'AVAILABLE' ? 20 : availability === 'MIXED' ? 5 : 0) + (costDelta === undefined ? 0 : costDelta <= 0 ? 15 : 0) + Math.max(0, 5 - change / 20))).toFixed(2))
      return { candidateId: crypto.randomUUID(), title: candidate.title, proposal: candidate.proposal, complianceStatus, availability, costDelta, compositionChangePercent: change, score, status: 'READY' as const, summary: [`Compliance: ${complianceStatus}.`, `Inventory: ${availability === 'UNKNOWN' ? 'Not evaluated for this role.' : availability.toLowerCase() + '.'}`, costDelta === undefined ? 'Cost: Not evaluated for this role.' : `Cost delta: ${costDelta.toFixed(2)}.`, `Composition change: ${change.toFixed(2)}%.`] }
    })
    const optimizerInputs = baseCandidates.map((candidate) => ({ ...candidate, inventoryEvaluated: candidate.availability !== 'UNKNOWN' }))
    const candidates = baseCandidates.map((candidate, index) => {
      const state = optimizerParetoState(optimizerInputs[index]!, optimizerInputs)
      return {
        ...candidate,
        pareto: {
          state,
          tradeoff: state === 'PARETO'
            ? 'No evaluated candidate improves compliance, inventory, cost, and composition change at the same time.'
            : state === 'DOMINATED'
              ? 'Another evaluated candidate is no worse on every deterministic objective and better on at least one.'
              : 'Pareto state is not evaluated because cost or inventory evidence is unavailable to this role.',
        },
      }
    }).sort((left, right) => compareOptimizerCandidates({ ...left, inventoryEvaluated: left.availability !== 'UNKNOWN' }, { ...right, inventoryEvaluated: right.availability !== 'UNKNOWN' }))
    this.state.optimizerCandidates[run.id] = candidates
    this.persistArtifact(run, { type: 'optimizer_candidates', version: 1, data: { baselineFormulaId: request.baselineFormulaId, baselineVersion: request.baselineVersion, intent: request.intent, candidates } })
    this.addNode(run, 'prepare_result', 94, { candidateCount: candidates.length })
    this.assistantMessage(run, 'I ranked deterministic reformulation candidates by compliance, inventory evidence, cost evidence when permitted, and composition change.')
  }

  private async execute(service: NorthStarService, run: LocalRun) {
    run.status = 'RUNNING'; run.updated_at = now(); this.event(run, 'run.started', { status: 'RUNNING', progress: 0 })
    try {
      const candidates = service.materials().data
        .sort((left, right) => left.name.localeCompare(right.name))
        .slice(0, 4)
      if (!candidates.length) throw new UnprocessableEntityException('No workspace materials are available for this research run')
      const weights = candidates.length === 1 ? [100] : candidates.length === 2 ? [60, 40] : candidates.length === 3 ? [45, 30, 25] : [40, 25, 20, 15]
      const isAccord = /\baccord\b/i.test(run.input_brief)
      const proposal = agentFormulaProposalSchema.parse({
        name: `${run.input_brief.slice(0, 52).replace(/\s+/g, ' ')} proposal`, formulaType: isAccord ? 'ACCORD' : 'FINE_FRAGRANCE',
        targetGrams: 100, concentrationType: isAccord ? 'OTHER' : 'EDP', finalProductConcentrationPercent: isAccord ? 100 : 20, ifraCategory: '4', requiresFinalProductContext: isAccord, brief: run.input_brief,
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
      const failure = toSafeAgentRuntimeError(error, 'Formula research failed')
      run.status = 'FAILED'; run.updated_at = now(); this.event(run, 'run.failed', { status: 'FAILED', error: failure.message, errorInfo: failure })
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
    if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > AGENT_MAX_EVENT_BYTES) {
      throw new UnprocessableEntityException('Agent event payload exceeds the 64 KB limit')
    }
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
        projects: Array.isArray(parsed.projects) ? parsed.projects.map((candidate) => this.restoreProject(candidate)) : [],
        optimizerCandidates: parsed.optimizerCandidates && typeof parsed.optimizerCandidates === 'object' ? parsed.optimizerCandidates : {},
        idempotency: parsed.idempotency && typeof parsed.idempotency === 'object' ? parsed.idempotency : {},
      }
      this.pruneIdempotencyRecords()
      if (this.pruneExpiredArchivedProjects()) await this.persist()
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

  private pruneExpiredArchivedProjects() {
    const cutoff = Date.now()
    const retained = this.state.projects.filter((project) => {
      if (project.status !== 'ARCHIVED' || !project.purgeAfter || Date.parse(project.purgeAfter) > cutoff) return true
      const hasDirection = project.directions.length > 0
      const hasRun = this.state.runs.some((run) => run.organization_id === project.organizationId && run.intelligence?.workflowKind === 'DESIGN_STUDIO' && run.intelligence.projectId === project.id)
      // Keep operational lineage intact even after the archive window; only a
      // standalone, unused brief is eligible for destructive local cleanup.
      return hasDirection || hasRun
    })
    if (retained.length === this.state.projects.length) return false
    this.state.projects = retained
    return true
  }

  private restoreProject(candidate: LocalDesignProject) {
    if (Array.isArray(candidate.briefVersions) && candidate.briefVersions.length) return candidate
    const legacyBrief = candidate.brief && formulaDesignBriefSchema.safeParse(candidate.brief)
    const rawBrief = legacyBrief?.success ? legacyBrief.data.creativeBrief : candidate.name
    const version: LocalDesignBriefVersion = {
      id: `legacy-brief-${candidate.id}`,
      versionNumber: 1,
      state: 'LEGACY_UNSTRUCTURED',
      schemaVersion: 0,
      rawBrief,
      unresolvedQuestions: [],
      compilerMode: 'LEGACY',
      checksum: `legacy:${candidate.id}`,
      createdByUserId: candidate.createdByUserId,
      createdAt: candidate.createdAt,
    }
    return { ...candidate, briefVersions: [version], currentBriefVersionId: version.id }
  }
}
