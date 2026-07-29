import {
  agentFormulaProposalSchema,
  formulaDesignBriefSchema,
  formulaIntelligenceRunConfigSchema,
  formulaOptimizerRequestSchema,
  type DesignDirectionArtifact,
  type FormulaIntelligenceRunConfig,
  type FormulaOptimizerRequest,
  type OptimizerCandidateArtifact,
} from '../src/data/agentRuntime.js'
import {
  buildDesignDirectionProposals,
  buildOptimizerProposals,
  compositionChangePercent,
  proposalFromFormulaVersion,
} from '../src/data/formulaIntelligence.js'
import type { Material } from '../src/data/northStar.js'
import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '../server/src/shared/http-error.js'
import type { NorthStarService } from '../server/src/services/northstar.service.js'
import { AgentRuntimeStore, type AgentActor, type AgentRunRow } from './agent-runtime.js'

type ProjectRow = {
  id: string
  organization_id: string
  brand_id: string | null
  created_by_user_id: string
  status: string
  name: string
  brief_json: string
  selected_direction_id: string | null
  created_at: string
  updated_at: string
}

type DirectionRow = {
  id: string
  project_id: string
  run_id: string
  sequence: number
  title: string
  status: string
  safe_summary_json: string
  proposal_json: string
  shared_by_user_id: string | null
  shared_at: string | null
  saved_formula_id: string | null
  created_at: string
  updated_at: string
}

type CandidateRow = {
  id: string
  run_id: string
  baseline_formula_id: string
  baseline_version: string
  sequence: number
  status: string
  summary_json: string
  proposal_json: string
  saved_formula_id: string | null
}

type RunConfigRow = {
  run_id: string
  workflow_kind: FormulaIntelligenceRunConfig['workflowKind']
  config_json: string
  project_id: string | null
  baseline_formula_id: string | null
  baseline_version: string | null
  created_by_user_id: string
}

type Preview = ReturnType<NorthStarService['previewFormulaIntelligence']>['data']

function now() {
  return new Date().toISOString()
}

function uuid() {
  return crypto.randomUUID()
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function permissions(service: NorthStarService) {
  return new Set(service.me().data.permissions)
}

function requirePermission(service: NorthStarService, permission: string) {
  if (!permissions(service).has(permission)) {
    throw new ForbiddenException(`Formula Intelligence requires ${permission}`)
  }
}

function hasInventoryAccess(service: NorthStarService) {
  return permissions(service).has('inventory.view')
}

function hasCostAccess(service: NorthStarService) {
  return permissions(service).has('costing.view')
}

function complianceStatus(preview: Preview) {
  return preview.compliance.status === 'APPROVED'
    ? 'PASS' as const
    : preview.compliance.status === 'BLOCKED'
      ? 'BLOCKED' as const
      : 'REVIEW_REQUIRED' as const
}

function availabilityStatus(preview: Preview) {
  if (!preview.visibility.canViewInventory) return 'UNKNOWN' as const
  return preview.availability.every((item) => item.status === 'AVAILABLE') ? 'AVAILABLE' as const : 'MIXED' as const
}

function candidateWarnings(preview: Preview) {
  return [
    ...preview.ifra.rows
      .filter((row) => row.status !== 'PASS' && row.status !== 'NO_LIMIT')
      .map((row) => `${row.materialName}: ${row.status}`),
    ...preview.compliance.reviewMaterialIds.map((id) => `Compliance review required for ${id}`),
    ...(preview.visibility.canViewInventory
      ? preview.availability.filter((item) => item.status !== 'AVAILABLE').map((item) => `${item.materialName}: ${item.status.toLowerCase()}`)
      : ['Inventory detail is hidden by the current role.']),
  ].slice(0, 40)
}

function safeDirection(direction: DesignDirectionArtifact) {
  return {
    id: direction.directionId,
    title: direction.title,
    narrative: direction.narrative,
    pyramidSummary: direction.pyramidSummary,
    availability: direction.availability,
    complianceStatus: direction.complianceStatus,
    warnings: direction.warnings,
  }
}

export async function auditFormulaIntelligence(db: D1Database, actor: AgentActor, action: string, entity: string, outcome = 'allowed') {
  const timestamp = now()
  const eventId = uuid()
  await db.prepare(
    `INSERT INTO tenant_audit_events (organization_id, id, at, actor, action, entity, request_id, outcome, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(organization_id, id) DO NOTHING`,
  ).bind(actor.organizationId, eventId, timestamp, actor.userId, action, entity.slice(0, 240), `formula-intelligence:${eventId}`, outcome, timestamp).run()
  await chainPendingAuditEvents(db, timestamp)
}

async function auditHash(organizationId: string, sequence: number, previousHash: string | null, event: { id: string; at: string; actor: string; action: string; entity: string; request_id: string; outcome: string }) {
  const payload = JSON.stringify(['olfactoryops.audit-chain.v1', organizationId, sequence, previousHash ?? '', event.id, event.at, event.actor, event.action, event.entity, event.request_id, event.outcome])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

async function chainPendingAuditEvents(db: D1Database, timestamp: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const pending = await db.prepare(
      `SELECT e.organization_id, e.id, e.at, e.actor, e.action, e.entity, e.request_id, e.outcome
       FROM tenant_audit_events e
       LEFT JOIN tenant_audit_chain_events c ON c.event_id = e.id
       WHERE c.event_id IS NULL
       ORDER BY e.at ASC, e.id ASC`,
    ).all<{ organization_id: string; id: string; at: string; actor: string; action: string; entity: string; request_id: string; outcome: string }>()
    if (!(pending.results?.length)) return
    const statements: D1PreparedStatement[] = []
    const tails = new Map<string, { sequence: number; event_hash: string }>()
    for (const event of pending.results) {
      let tail = tails.get(event.organization_id)
      if (!tail) {
        tail = await db.prepare(
          `SELECT sequence, event_hash FROM tenant_audit_chain_events WHERE organization_id = ? ORDER BY sequence DESC LIMIT 1`,
        ).bind(event.organization_id).first<{ sequence: number; event_hash: string }>() ?? { sequence: 0, event_hash: '' }
      }
      const sequence = tail.sequence + 1
      const previousHash = tail.sequence ? tail.event_hash : null
      const eventHash = await auditHash(event.organization_id, sequence, previousHash, event)
      statements.push(db.prepare(
        `INSERT INTO tenant_audit_chain_events (event_id, organization_id, sequence, previous_hash, event_hash, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(event.id, event.organization_id, sequence, previousHash, eventHash, timestamp))
      tails.set(event.organization_id, { sequence, event_hash: eventHash })
    }
    try {
      await db.batch(statements)
      return
    } catch (error) {
      if (attempt === 2) throw error
    }
  }
}

export class FormulaIntelligenceStore {
  constructor(private readonly db: D1Database) {}

  async createDesignProject(actor: AgentActor, briefInput: unknown, idempotencyKey: string, brandId: string) {
    const brief = formulaDesignBriefSchema.parse(briefInput)
    const key = idempotencyKey.trim().slice(0, 200)
    if (!key) throw new UnprocessableEntityException('Idempotency-Key is required for a design brief')
    const existing = await this.db.prepare(
      `SELECT id, organization_id, brand_id, created_by_user_id, status, name, brief_json, selected_direction_id, created_at, updated_at
       FROM formula_design_projects WHERE organization_id = ? AND idempotency_key = ?`,
    ).bind(actor.organizationId, key).first<ProjectRow>()
    if (existing) return this.projectPayload(existing, actor, false)
    const timestamp = now()
    const project: ProjectRow = {
      id: uuid(), organization_id: actor.organizationId, brand_id: brandId || null, created_by_user_id: actor.userId,
      status: 'BRIEFED', name: brief.name, brief_json: JSON.stringify(brief), selected_direction_id: null, created_at: timestamp, updated_at: timestamp,
    }
    await this.db.prepare(
      `INSERT INTO formula_design_projects (id, organization_id, brand_id, created_by_user_id, status, name, brief_json, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(project.id, project.organization_id, project.brand_id, project.created_by_user_id, project.status, project.name, project.brief_json, key, timestamp, timestamp).run()
    return this.projectPayload(project, actor, false)
  }

  async listDesignProjects(actor: AgentActor, includeTenantProjects: boolean) {
    const result = includeTenantProjects
      ? await this.db.prepare(
        `SELECT id, organization_id, brand_id, created_by_user_id, status, name, brief_json, selected_direction_id, created_at, updated_at
         FROM formula_design_projects WHERE organization_id = ? ORDER BY updated_at DESC LIMIT 80`,
      ).bind(actor.organizationId).all<ProjectRow>()
      : await this.db.prepare(
        `SELECT id, organization_id, brand_id, created_by_user_id, status, name, brief_json, selected_direction_id, created_at, updated_at
         FROM formula_design_projects WHERE organization_id = ? AND created_by_user_id = ? ORDER BY updated_at DESC LIMIT 80`,
      ).bind(actor.organizationId, actor.userId).all<ProjectRow>()
    return Promise.all((result.results ?? []).map((project) => this.projectPayload(project, actor, includeTenantProjects)))
  }

  async designProject(actor: AgentActor, projectId: string, includePrivate: boolean) {
    const project = await this.projectForActor(actor, projectId, includePrivate)
    return this.projectPayload(project, actor, includePrivate)
  }

  async createRunConfig(actor: AgentActor, runId: string, config: FormulaIntelligenceRunConfig, idempotencyKey: string) {
    const timestamp = now()
    await this.db.prepare(
      `INSERT INTO formula_intelligence_runs (run_id, organization_id, workflow_kind, config_json, project_id, baseline_formula_id, baseline_version, created_by_user_id, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      runId, actor.organizationId, config.workflowKind, JSON.stringify(config),
      config.workflowKind === 'DESIGN_STUDIO' ? config.projectId : null,
      config.workflowKind === 'REFORMULATION_OPTIMIZER' ? config.request.baselineFormulaId : null,
      config.workflowKind === 'REFORMULATION_OPTIMIZER' ? config.request.baselineVersion : null,
      actor.userId, idempotencyKey, timestamp, timestamp,
    ).run()
  }

  async configForRun(actor: AgentActor, runId: string) {
    const row = await this.db.prepare(
      `SELECT run_id, workflow_kind, config_json, project_id, baseline_formula_id, baseline_version, created_by_user_id
       FROM formula_intelligence_runs WHERE run_id = ? AND organization_id = ? AND created_by_user_id = ?`,
    ).bind(runId, actor.organizationId, actor.userId).first<RunConfigRow>()
    if (!row) throw new NotFoundException('Formula Intelligence run was not found')
    return { row, config: formulaIntelligenceRunConfigSchema.parse(parseJson(row.config_json, {})) }
  }

  async persistDesignDirections(actor: AgentActor, projectId: string, runId: string, directions: DesignDirectionArtifact[]) {
    const timestamp = now()
    const statements = directions.map((direction, index) => this.db.prepare(
      `INSERT INTO formula_design_directions (id, organization_id, project_id, run_id, sequence, title, status, safe_summary_json, proposal_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)
       ON CONFLICT(project_id, sequence) DO UPDATE SET run_id = excluded.run_id, title = excluded.title, status = 'DRAFT', safe_summary_json = excluded.safe_summary_json, proposal_json = excluded.proposal_json, updated_at = excluded.updated_at`,
    ).bind(direction.directionId, actor.organizationId, projectId, runId, index + 1, direction.title, JSON.stringify(safeDirection(direction)), JSON.stringify(direction.proposal), timestamp, timestamp))
    await this.db.batch([
      ...statements,
      this.db.prepare(`UPDATE formula_design_projects SET status = 'IN_REVIEW', updated_at = ? WHERE id = ? AND organization_id = ?`)
        .bind(timestamp, projectId, actor.organizationId),
    ])
  }

  async persistOptimizerCandidates(actor: AgentActor, runId: string, request: FormulaOptimizerRequest, candidates: OptimizerCandidateArtifact[]) {
    const timestamp = now()
    await this.db.batch(candidates.map((candidate, index) => this.db.prepare(
      `INSERT INTO formula_optimizer_candidates (id, organization_id, run_id, baseline_formula_id, baseline_version, sequence, status, summary_json, proposal_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'READY', ?, ?, ?, ?)
       ON CONFLICT(run_id, sequence) DO UPDATE SET summary_json = excluded.summary_json, proposal_json = excluded.proposal_json, status = 'READY', updated_at = excluded.updated_at`,
    ).bind(candidate.candidateId, actor.organizationId, runId, request.baselineFormulaId, request.baselineVersion, index + 1, JSON.stringify(candidate), JSON.stringify(candidate.proposal), timestamp, timestamp)))
  }

  async shareDirection(actor: AgentActor, projectId: string, directionId: string) {
    await this.projectForActor(actor, projectId, true)
    const timestamp = now()
    const result = await this.db.prepare(
      `UPDATE formula_design_directions SET status = 'SHARED', shared_by_user_id = ?, shared_at = ?, updated_at = ?
       WHERE id = ? AND project_id = ? AND organization_id = ?`,
    ).bind(actor.userId, timestamp, timestamp, directionId, projectId, actor.organizationId).run()
    if (!result.meta.changes) throw new NotFoundException('Design direction was not found')
  }

  async feedback(actor: AgentActor, projectId: string, directionId: string, body: Record<string, unknown>) {
    const project = await this.projectForActor(actor, projectId, false)
    const direction = await this.directionForProject(actor, projectId, directionId, false)
    if (!direction.shared_at) throw new ForbiddenException('A perfumer must share a direction before brand feedback is accepted')
    const rating = body.rating === undefined ? null : Math.max(1, Math.min(5, Math.round(Number(body.rating))))
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 1200) : ''
    const selected = body.selected === true
    if (!comment && !selected && rating === null) throw new UnprocessableEntityException('Add a rating, comment, or direction selection')
    const timestamp = now()
    await this.db.batch([
      ...(selected ? [
        this.db.prepare(`UPDATE formula_design_feedback SET selected = 0, updated_at = ? WHERE project_id = ? AND organization_id = ?`).bind(timestamp, projectId, actor.organizationId),
        this.db.prepare(`UPDATE formula_design_directions SET status = CASE WHEN id = ? THEN 'SELECTED' ELSE status END, updated_at = ? WHERE project_id = ? AND organization_id = ?`).bind(directionId, timestamp, projectId, actor.organizationId),
        this.db.prepare(`UPDATE formula_design_projects SET selected_direction_id = ?, status = 'SELECTED', updated_at = ? WHERE id = ? AND organization_id = ?`).bind(directionId, timestamp, projectId, actor.organizationId),
      ] : []),
      this.db.prepare(
        `INSERT INTO formula_design_feedback (id, organization_id, project_id, direction_id, user_id, rating, comment, selected, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(direction_id, user_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, selected = excluded.selected, updated_at = excluded.updated_at`,
      ).bind(uuid(), actor.organizationId, project.id, direction.id, actor.userId, rating, comment, selected ? 1 : 0, timestamp, timestamp),
    ])
  }

  async requestDirectionDraftSave(actor: AgentActor, projectId: string, directionId: string, agentStore: AgentRuntimeStore) {
    await this.projectForActor(actor, projectId, true)
    const direction = await this.directionForProject(actor, projectId, directionId, true)
    const run = await agentStore.runForActor(actor, direction.run_id)
    const proposal = agentFormulaProposalSchema.parse(parseJson(direction.proposal_json, {}))
    const pending = await this.pendingConfirmation(run)
    if (pending) return pending
    const nodeId = await agentStore.createNode(run, 'save_formula_draft', { proposal })
    await agentStore.startNode(run, nodeId, 'save_formula_draft')
    const confirmationId = await agentStore.createConfirmation(run, nodeId, proposal)
    await this.db.prepare(`UPDATE formula_design_directions SET status = 'SELECTED', updated_at = ? WHERE id = ? AND organization_id = ?`).bind(now(), directionId, actor.organizationId).run()
    return { confirmationId, summary: `Save ${proposal.name} as a non-consuming formula draft` }
  }

  async requestCandidateDraftSave(actor: AgentActor, runId: string, candidateId: string, agentStore: AgentRuntimeStore, service: NorthStarService) {
    const candidate = await this.candidateForRun(actor, runId, candidateId)
    const run = await agentStore.runForActor(actor, runId)
    const proposal = agentFormulaProposalSchema.parse(parseJson(candidate.proposal_json, {}))
    const { config } = await this.configForRun(actor, runId)
    if (config.workflowKind !== 'REFORMULATION_OPTIMIZER') throw new UnprocessableEntityException('Candidate does not belong to an optimizer run')
    assertCandidateSaveEligibility(service, proposal, config.request)
    const pending = await this.pendingConfirmation(run)
    if (pending) return pending
    const nodeId = await agentStore.createNode(run, 'save_formula_draft', { proposal })
    await agentStore.startNode(run, nodeId, 'save_formula_draft')
    const confirmationId = await agentStore.createConfirmation(run, nodeId, proposal)
    await this.db.prepare(`UPDATE formula_optimizer_candidates SET status = 'PENDING_SAVE', updated_at = ? WHERE id = ? AND organization_id = ?`).bind(now(), candidateId, actor.organizationId).run()
    return { confirmationId, summary: `Save ${proposal.name} as a non-consuming formula draft` }
  }

  async markSavedFormula(actor: AgentActor, runId: string, formulaId: string) {
    const timestamp = now()
    await this.db.batch([
      this.db.prepare(`UPDATE formula_design_directions SET status = 'SAVED', saved_formula_id = ?, updated_at = ? WHERE run_id = ? AND organization_id = ? AND status = 'SELECTED'`).bind(formulaId, timestamp, runId, actor.organizationId),
      this.db.prepare(`UPDATE formula_optimizer_candidates SET status = 'SAVED', saved_formula_id = ?, updated_at = ? WHERE run_id = ? AND organization_id = ? AND status = 'PENDING_SAVE'`).bind(formulaId, timestamp, runId, actor.organizationId),
    ])
  }

  private async projectForActor(actor: AgentActor, projectId: string, includeTenantProjects: boolean) {
    const project = await this.db.prepare(
      `SELECT id, organization_id, brand_id, created_by_user_id, status, name, brief_json, selected_direction_id, created_at, updated_at
       FROM formula_design_projects WHERE id = ? AND organization_id = ? ${includeTenantProjects ? '' : 'AND created_by_user_id = ?'}`,
    ).bind(...(includeTenantProjects ? [projectId, actor.organizationId] : [projectId, actor.organizationId, actor.userId])).first<ProjectRow>()
    if (!project) throw new NotFoundException('Design project was not found')
    return project
  }

  private async directionForProject(actor: AgentActor, projectId: string, directionId: string, includePrivate: boolean) {
    const direction = await this.db.prepare(
      `SELECT id, project_id, run_id, sequence, title, status, safe_summary_json, proposal_json, shared_by_user_id, shared_at, saved_formula_id, created_at, updated_at
       FROM formula_design_directions WHERE id = ? AND project_id = ? AND organization_id = ? ${includePrivate ? '' : "AND shared_at IS NOT NULL"}`,
    ).bind(directionId, projectId, actor.organizationId).first<DirectionRow>()
    if (!direction) throw new NotFoundException('Design direction was not found')
    return direction
  }

  private async candidateForRun(actor: AgentActor, runId: string, candidateId: string) {
    const row = await this.db.prepare(
      `SELECT id, run_id, baseline_formula_id, baseline_version, sequence, status, summary_json, proposal_json, saved_formula_id
       FROM formula_optimizer_candidates WHERE id = ? AND run_id = ? AND organization_id = ?`,
    ).bind(candidateId, runId, actor.organizationId).first<CandidateRow>()
    if (!row) throw new NotFoundException('Optimizer candidate was not found')
    return row
  }

  private async pendingConfirmation(run: AgentRunRow) {
    const existing = await this.db.prepare(
      `SELECT id, summary FROM agent_confirmations
       WHERE run_id = ? AND organization_id = ? AND status = 'PENDING'
       ORDER BY created_at DESC LIMIT 1`,
    ).bind(run.id, run.organization_id).first<{ id: string; summary: string }>()
    return existing ? { confirmationId: existing.id, summary: existing.summary } : undefined
  }

  private async projectPayload(project: ProjectRow, actor: AgentActor, includePrivate: boolean) {
    const directionRows = await this.db.prepare(
      `SELECT id, project_id, run_id, sequence, title, status, safe_summary_json, proposal_json, shared_by_user_id, shared_at, saved_formula_id, created_at, updated_at
       FROM formula_design_directions WHERE project_id = ? AND organization_id = ? ${includePrivate ? '' : 'AND shared_at IS NOT NULL'} ORDER BY sequence ASC`,
    ).bind(project.id, actor.organizationId).all<DirectionRow>()
    const feedback = await this.db.prepare(
      `SELECT id, direction_id, user_id, rating, comment, selected, created_at, updated_at
       FROM formula_design_feedback WHERE project_id = ? AND organization_id = ? ORDER BY created_at ASC`,
    ).bind(project.id, actor.organizationId).all<{ id: string; direction_id: string; user_id: string; rating: number | null; comment: string; selected: number; created_at: string; updated_at: string }>()
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      createdByUserId: project.created_by_user_id,
      selectedDirectionId: project.selected_direction_id,
      brief: formulaDesignBriefSchema.parse(parseJson(project.brief_json, {})),
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      directions: (directionRows.results ?? []).map((direction) => ({
        ...safeDirection({ ...parseJson(direction.safe_summary_json, {}) as Omit<DesignDirectionArtifact, 'proposal'>, directionId: direction.id, proposal: agentFormulaProposalSchema.parse(parseJson(direction.proposal_json, {})) }),
        status: direction.status,
        sharedAt: direction.shared_at,
        savedFormulaId: direction.saved_formula_id,
        ...(includePrivate ? { runId: direction.run_id, proposal: agentFormulaProposalSchema.parse(parseJson(direction.proposal_json, {})) } : {}),
      })),
      feedback: (feedback.results ?? []).map((item) => ({ id: item.id, directionId: item.direction_id, userId: item.user_id, rating: item.rating, comment: item.comment, selected: Boolean(item.selected), createdAt: item.created_at })),
    }
  }
}

function assertCandidateSaveEligibility(service: NorthStarService, proposal: ReturnType<typeof agentFormulaProposalSchema.parse>, request: FormulaOptimizerRequest) {
  const total = proposal.ingredients.reduce((sum, ingredient) => sum + ingredient.percentage, 0)
  if (Math.abs(total - 100) > 0.05) throw new UnprocessableEntityException('Candidate composition must total 100% before it can be saved')
  const candidateMaterialIds = new Set(proposal.ingredients.map((ingredient) => ingredient.materialId))
  if (request.lockedMaterialIds.some((materialId) => !candidateMaterialIds.has(materialId))) {
    throw new UnprocessableEntityException('Candidate does not preserve all locked materials')
  }
  const preview = service.previewFormulaIntelligence(proposal).data
  if (preview.compliance.status !== 'APPROVED' || preview.ifra.blockerCount > 0) {
    throw new UnprocessableEntityException('Only a compliance-passing candidate can be saved as a formula draft')
  }
  if (request.requireEligibleInventory) {
    if (!preview.visibility.canViewInventory) throw new ForbiddenException('Inventory permission is required when eligible inventory is mandatory')
    if (preview.availability.some((item) => item.status !== 'AVAILABLE')) throw new UnprocessableEntityException('Candidate does not have eligible inventory for every material')
  }
}

async function recordTool(store: AgentRuntimeStore, run: AgentRunRow, nodeId: string, name: string, input: Record<string, unknown>, output: Record<string, unknown>) {
  const id = uuid()
  const timestamp = now()
  await store.database.batch([
    store.database.prepare(
      `INSERT INTO agent_tool_calls (id, run_id, node_id, organization_id, tool_name, mode, status, input_json, output_json, started_at, completed_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'READ_ONLY', 'COMPLETED', ?, ?, ?, ?, ?)`,
    ).bind(id, run.id, nodeId, run.organization_id, name, JSON.stringify(input), JSON.stringify(output), timestamp, timestamp, timestamp),
  ])
  await store.append(run.id, run.organization_id, 'tool.completed', { toolId: id, nodeId, toolName: name, status: 'COMPLETED' })
}

async function beginRun(store: AgentRuntimeStore, actor: AgentActor, runId: string) {
  const job = await store.claimJob(runId)
  if (!job) return undefined
  const run = await store.runForActor(actor, runId)
  if (run.status === 'CANCELLED' || run.status === 'WAITING_FOR_CONFIRMATION') return undefined
  const timestamp = now()
  await store.database.prepare(`UPDATE agent_runs SET status = 'RUNNING', started_at = COALESCE(started_at, ?), updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ?`)
    .bind(timestamp, timestamp, run.id, run.organization_id).run()
  await store.append(run.id, run.organization_id, 'run.started', { status: 'RUNNING', progress: run.progress })
  return run
}

async function completeRun(store: AgentRuntimeStore, run: AgentRunRow) {
  const timestamp = now()
  await store.database.prepare(`UPDATE agent_runs SET status = 'COMPLETED', progress = 100, completed_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ?`)
    .bind(timestamp, timestamp, run.id, run.organization_id).run()
  await store.append(run.id, run.organization_id, 'run.completed', { status: 'COMPLETED', progress: 100 })
  await store.completeJob(run.id, run.organization_id, 'COMPLETED')
}

async function failRun(store: AgentRuntimeStore, run: AgentRunRow, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 500) : 'Formula Intelligence execution failed'
  const timestamp = now()
  await store.database.batch([
    store.database.prepare(`UPDATE agent_runs SET status = 'FAILED', error_summary = ?, completed_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ?`)
      .bind(message, timestamp, timestamp, run.id, run.organization_id),
    store.database.prepare(`UPDATE agent_jobs SET status = 'FAILED', last_error = ?, lease_token = NULL, lease_expires_at = NULL, updated_at = ? WHERE run_id = ? AND organization_id = ?`)
      .bind(message, timestamp, run.id, run.organization_id),
  ])
  await store.append(run.id, run.organization_id, 'run.failed', { status: 'FAILED', error: message })
}

function approvedMaterials(service: NorthStarService) {
  return service.materials().data.filter((material) => {
    const profile = service.materialCompliance(material.id).data
    return profile?.status === 'APPROVED'
  })
}

function availabilityRankedMaterials(service: NorthStarService, materials: Material[]) {
  if (!hasInventoryAccess(service)) return materials.map((material) => ({ ...material, availabilityRank: 0 }))
  const lots = service.lotsList().data
  const availableByMaterial = new Map<string, number>()
  for (const lot of lots) {
    if (lot.qualityStatus !== 'APPROVED') continue
    availableByMaterial.set(lot.materialId, (availableByMaterial.get(lot.materialId) ?? 0) + Math.max(0, lot.quantityGrams - lot.reservedGrams))
  }
  return [...materials]
    .map((material) => ({ ...material, availabilityRank: availableByMaterial.get(material.id) ?? 0 }))
    .sort((left, right) => right.availabilityRank - left.availabilityRank || left.name.localeCompare(right.name))
}

async function runDesignStudio(store: AgentRuntimeStore, service: NorthStarService, actor: AgentActor, run: AgentRunRow, config: Extract<FormulaIntelligenceRunConfig, { workflowKind: 'DESIGN_STUDIO' }>) {
  const intelligence = new FormulaIntelligenceStore(store.database)
  const analyzeId = await store.createNode(run, 'analyze_brief', { brief: config.brief.creativeBrief })
  await store.startNode(run, analyzeId, 'analyze_brief')
  await store.completeNode(run, analyzeId, 'analyze_brief', { designProjectId: config.projectId, availabilityFirst: config.brief.availabilityFirst }, 12)
  const searchId = await store.createNode(run, 'search_materials', { brief: config.brief.creativeBrief })
  await store.startNode(run, searchId, 'search_materials')
  const materials = availabilityRankedMaterials(service, approvedMaterials(service))
  if (!materials.length) throw new UnprocessableEntityException('No compliance-approved workspace materials are available for this design brief')
  await recordTool(store, run, searchId, 'search_materials', { query: config.brief.creativeBrief }, { materialIds: materials.slice(0, 12).map((material) => material.id) })
  await store.completeNode(run, searchId, 'search_materials', { materialCount: materials.length }, 28)
  const proposals = buildDesignDirectionProposals(config.brief, materials)
  const inventoryId = await store.createNode(run, 'check_inventory', { projectId: config.projectId })
  await store.startNode(run, inventoryId, 'check_inventory')
  await store.completeNode(run, inventoryId, 'check_inventory', { mode: hasInventoryAccess(service) ? 'availability-first' : 'redacted' }, 42)
  const generateId = await store.createNode(run, 'generate_formula', { projectId: config.projectId })
  await store.startNode(run, generateId, 'generate_formula')
  await store.completeNode(run, generateId, 'generate_formula', { directionCount: proposals.length }, 58)
  const costId = await store.createNode(run, 'calculate_cost', { projectId: config.projectId })
  await store.startNode(run, costId, 'calculate_cost')
  await store.completeNode(run, costId, 'calculate_cost', { visibility: hasCostAccess(service) ? 'full' : 'redacted' }, 68)
  const complianceId = await store.createNode(run, 'validate_compliance', { projectId: config.projectId })
  await store.startNode(run, complianceId, 'validate_compliance')
  const previews = proposals.map((direction) => service.previewFormulaIntelligence(direction.proposal).data)
  await recordTool(store, run, complianceId, 'validate_compliance', { directionCount: proposals.length }, { statuses: previews.map((preview) => preview.compliance.status) })
  await store.completeNode(run, complianceId, 'validate_compliance', { statuses: previews.map((preview) => preview.compliance.status) }, 80)
  const directions: DesignDirectionArtifact[] = proposals.map((direction, index) => ({
    directionId: uuid(),
    title: direction.title,
    narrative: direction.narrative,
    pyramidSummary: direction.pyramidSummary,
    availability: availabilityStatus(previews[index]!),
    complianceStatus: complianceStatus(previews[index]!),
    proposal: direction.proposal,
    warnings: candidateWarnings(previews[index]!),
  }))
  const resultId = await store.createNode(run, 'prepare_result', { projectId: config.projectId })
  await store.startNode(run, resultId, 'prepare_result')
  await store.createArtifact(run, { type: 'design_directions', version: 1, data: { projectId: config.projectId, directions } })
  await intelligence.persistDesignDirections(actor, config.projectId, run.id, directions)
  await store.completeNode(run, resultId, 'prepare_result', { artifactCount: 1, directionCount: directions.length }, 94)
  await store.createAssistantMessage(run, 'I prepared three deterministic design directions from compliance-approved workspace materials. A perfumer can share a direction for brand review or explicitly save one as a draft.')
}

async function runOptimizer(store: AgentRuntimeStore, service: NorthStarService, actor: AgentActor, run: AgentRunRow, config: Extract<FormulaIntelligenceRunConfig, { workflowKind: 'REFORMULATION_OPTIMIZER' }>) {
  const intelligence = new FormulaIntelligenceStore(store.database)
  const { request } = config
  const versions = service.formulaVersions(request.baselineFormulaId).data
  const baseline = versions.versions.find((version) => version.version === request.baselineVersion)
  if (!baseline) throw new UnprocessableEntityException('Select an immutable baseline formula version before optimizing')
  const analyzeId = await store.createNode(run, 'analyze_brief', { baselineFormulaId: request.baselineFormulaId, baselineVersion: request.baselineVersion })
  await store.startNode(run, analyzeId, 'analyze_brief')
  await store.completeNode(run, analyzeId, 'analyze_brief', { intent: request.intent, lockedMaterialIds: request.lockedMaterialIds }, 12)
  const materialIdSet = new Set(baseline.lines.map((line) => line.materialId).filter((id): id is string => Boolean(id)))
  if (materialIdSet.size !== baseline.lines.filter((line) => Boolean(line.materialId)).length || baseline.lines.some((line) => line.childFormulaId)) {
    throw new UnprocessableEntityException('Optimizer currently requires a resolved material-only baseline version')
  }
  const baselineProposal = proposalFromFormulaVersion(versions.formula, baseline.lines)
  if (!baselineProposal.ingredients.length) throw new UnprocessableEntityException('Baseline version has no material composition to optimize')
  const searchId = await store.createNode(run, 'search_materials', { baselineFormulaId: request.baselineFormulaId })
  await store.startNode(run, searchId, 'search_materials')
  const materials = availabilityRankedMaterials(service, approvedMaterials(service))
  await recordTool(store, run, searchId, 'search_materials', { baselineMaterialIds: [...materialIdSet] }, { candidateMaterialIds: materials.slice(0, 24).map((material) => material.id) })
  await store.completeNode(run, searchId, 'search_materials', { candidateMaterialCount: materials.length }, 28)
  const availableMaterialIds = new Set<string>()
  if (hasInventoryAccess(service)) {
    const lots = service.lotsList().data
    lots.filter((lot) => lot.qualityStatus === 'APPROVED' && lot.quantityGrams > lot.reservedGrams).forEach((lot) => availableMaterialIds.add(lot.materialId))
  }
  const inventoryId = await store.createNode(run, 'check_inventory', { baselineFormulaId: request.baselineFormulaId })
  await store.startNode(run, inventoryId, 'check_inventory')
  await store.completeNode(run, inventoryId, 'check_inventory', { visibility: hasInventoryAccess(service) ? 'full' : 'redacted', availableMaterialCount: availableMaterialIds.size }, 42)
  const proposals = buildOptimizerProposals(baselineProposal, materials, request.intent, request.lockedMaterialIds, availableMaterialIds)
  const generateId = await store.createNode(run, 'generate_formula', { baselineFormulaId: request.baselineFormulaId })
  await store.startNode(run, generateId, 'generate_formula')
  await store.completeNode(run, generateId, 'generate_formula', { candidateCount: proposals.length }, 58)
  const previews = proposals.map((candidate) => service.previewFormulaIntelligence(candidate.proposal).data)
  const baselinePreview = previews[0]!
  const costId = await store.createNode(run, 'calculate_cost', { baselineFormulaId: request.baselineFormulaId })
  await store.startNode(run, costId, 'calculate_cost')
  await recordTool(store, run, costId, 'calculate_formula_cost', { candidateCount: proposals.length }, { visibility: hasCostAccess(service) ? 'full' : 'redacted' })
  await store.completeNode(run, costId, 'calculate_cost', { visibility: hasCostAccess(service) ? 'full' : 'redacted' }, 70)
  const complianceId = await store.createNode(run, 'validate_compliance', { baselineFormulaId: request.baselineFormulaId })
  await store.startNode(run, complianceId, 'validate_compliance')
  await recordTool(store, run, complianceId, 'validate_compliance', { candidateCount: proposals.length }, { statuses: previews.map((preview) => preview.compliance.status) })
  await store.completeNode(run, complianceId, 'validate_compliance', { statuses: previews.map((preview) => preview.compliance.status) }, 80)
  const candidates: OptimizerCandidateArtifact[] = proposals.map((candidate, index) => {
    const preview = previews[index]!
    const status = complianceStatus(preview)
    const availability = availabilityStatus(preview)
    const baselineCost = baselinePreview.cost?.totalCost
    const costDelta = preview.cost && baselineCost !== undefined ? Number((preview.cost.totalCost - baselineCost).toFixed(4)) : undefined
    const change = compositionChangePercent(baselineProposal, candidate.proposal)
    const hardPass = status === 'PASS'
    const inventoryScore = availability === 'AVAILABLE' ? 20 : availability === 'MIXED' ? 5 : 10
    const costScore = costDelta === undefined ? 0 : costDelta <= 0 ? 15 : Math.max(0, 15 - costDelta * 10)
    const score = Number(Math.max(0, Math.min(100, (hardPass ? 60 : status === 'REVIEW_REQUIRED' ? 30 : 0) + inventoryScore + costScore + Math.max(0, 5 - change / 20))).toFixed(2))
    return {
      candidateId: uuid(), title: candidate.title, proposal: candidate.proposal, complianceStatus: status, availability,
      costDelta, compositionChangePercent: change, score,
      summary: [
        status === 'PASS' ? 'IFRA and material compliance gates pass.' : `Compliance status: ${status}.`,
        availability === 'UNKNOWN' ? 'Inventory detail is hidden by the current role.' : `Inventory: ${availability.toLowerCase()}.`,
        costDelta === undefined ? 'Cost detail is hidden by the current role.' : `${costDelta <= 0 ? 'Estimated cost reduction' : 'Estimated cost increase'}: ${Math.abs(costDelta).toFixed(2)}.`,
        `Composition change: ${change.toFixed(2)}%.`,
      ],
    }
  }).sort((left, right) => right.score - left.score || left.compositionChangePercent - right.compositionChangePercent)
  const resultId = await store.createNode(run, 'prepare_result', { baselineFormulaId: request.baselineFormulaId })
  await store.startNode(run, resultId, 'prepare_result')
  await store.createArtifact(run, { type: 'optimizer_candidates', version: 1, data: { baselineFormulaId: request.baselineFormulaId, baselineVersion: request.baselineVersion, intent: request.intent, candidates } })
  await intelligence.persistOptimizerCandidates(actor, run.id, request, candidates)
  await store.completeNode(run, resultId, 'prepare_result', { artifactCount: 1, candidateCount: candidates.length }, 94)
  await store.createAssistantMessage(run, 'I ranked deterministic reformulation candidates by compliance feasibility, eligible inventory, cost evidence when permitted, and minimum composition change. Select a candidate before saving a normal editable draft.')
}

export async function executeFormulaIntelligenceRun(store: AgentRuntimeStore, service: NorthStarService, actor: AgentActor, runId: string) {
  const intelligence = new FormulaIntelligenceStore(store.database)
  const { config } = await intelligence.configForRun(actor, runId)
  const run = await beginRun(store, actor, runId)
  if (!run) return
  try {
    requirePermission(service, 'formulas.viewSensitive')
    requirePermission(service, 'materials.view')
    if (config.workflowKind === 'DESIGN_STUDIO') await runDesignStudio(store, service, actor, run, config)
    else await runOptimizer(store, service, actor, run, config)
    await completeRun(store, run)
    await auditFormulaIntelligence(store.database, actor, `formula-intelligence.${config.workflowKind.toLowerCase()}.complete`, run.id)
  } catch (error) {
    await failRun(store, run, error)
    await auditFormulaIntelligence(store.database, actor, `formula-intelligence.${config.workflowKind.toLowerCase()}.failed`, run.id, 'review')
  }
}

export async function createDesignProjectRun(
  db: D1Database,
  service: NorthStarService,
  actor: AgentActor,
  projectId: string,
  idempotencyKey: string,
) {
  requirePermission(service, 'formulas.edit')
  const intelligence = new FormulaIntelligenceStore(db)
  const project = await intelligence.designProject(actor, projectId, true)
  const store = new AgentRuntimeStore(db)
  const result = await store.create(actor, { brief: project.brief.creativeBrief }, { provider: 'mock', model: 'deterministic-v1' })
  const config = formulaIntelligenceRunConfigSchema.parse({ workflowKind: 'DESIGN_STUDIO', projectId, brief: project.brief })
  await intelligence.createRunConfig(actor, result.data.run.id, config, idempotencyKey)
  await db.prepare(`UPDATE formula_design_projects SET status = 'IN_PROGRESS', updated_at = ? WHERE id = ? AND organization_id = ?`).bind(now(), projectId, actor.organizationId).run()
  await auditFormulaIntelligence(db, actor, 'formula-intelligence.design.run.create', projectId)
  return { run: result.data.run, project }
}

export async function createOptimizerRun(
  db: D1Database,
  service: NorthStarService,
  actor: AgentActor,
  requestInput: unknown,
  idempotencyKey: string,
) {
  requirePermission(service, 'formulas.viewSensitive')
  const request = formulaOptimizerRequestSchema.parse(requestInput)
  const versions = service.formulaVersions(request.baselineFormulaId).data
  if (!versions.versions.some((version) => version.version === request.baselineVersion)) {
    throw new UnprocessableEntityException('Select an existing immutable formula version before optimizing')
  }
  const store = new AgentRuntimeStore(db)
  const result = await store.create(actor, { brief: `Optimize ${versions.formula.name} ${request.baselineVersion}` }, { provider: 'mock', model: 'deterministic-v1' })
  const intelligence = new FormulaIntelligenceStore(db)
  const config = formulaIntelligenceRunConfigSchema.parse({ workflowKind: 'REFORMULATION_OPTIMIZER', request })
  await intelligence.createRunConfig(actor, result.data.run.id, config, idempotencyKey)
  await auditFormulaIntelligence(db, actor, 'formula-intelligence.reformulation.run.create', `${request.baselineFormulaId}:${request.baselineVersion}`)
  return { run: result.data.run, baseline: { formulaId: request.baselineFormulaId, version: request.baselineVersion } }
}
