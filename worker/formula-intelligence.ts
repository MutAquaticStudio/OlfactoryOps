import {
  agentFormulaProposalSchema,
  formulaDesignBriefSchema,
  formulaDirectionFeedbackSchema,
  formulaDirectionShareSchema,
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
  compareOptimizerCandidates,
  compositionChangePercent,
  proposalFromFormulaVersion,
} from '../src/data/formulaIntelligence.js'
import type { Material } from '../src/data/northStar.js'
import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '../server/src/shared/http-error.js'
import type { NorthStarService } from '../server/src/services/northstar.service.js'
import { AgentRuntimeStore, type AgentActor, type AgentRunRow } from './agent-runtime.js'
import type { MaterialEvidenceRag } from './material-evidence-rag.js'

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

type DirectionShareRow = {
  id: string
  recipient_user_id: string
  allow_material_names: number
  shared_at: string
  revoked_at: string | null
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
    // Brand projections deliberately omit material names and raw tool output.
    narrative: 'A perfumer prepared this creative direction for review.',
    pyramidSummary: 'Creative pyramid available to the assigned reviewer.',
    availability: direction.availability,
    complianceStatus: direction.complianceStatus,
    warnings: [],
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
  await chainAuditEvent(db, actor.organizationId, eventId, timestamp)
}

async function auditHash(organizationId: string, sequence: number, previousHash: string | null, event: { id: string; at: string; actor: string; action: string; entity: string; request_id: string; outcome: string }) {
  const payload = JSON.stringify(['olfactoryops.audit-chain.v1', organizationId, sequence, previousHash ?? '', event.id, event.at, event.actor, event.action, event.entity, event.request_id, event.outcome])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

async function chainAuditEvent(db: D1Database, organizationId: string, eventId: string, timestamp: string) {
  const event = await db.prepare(
    `SELECT id, at, actor, action, entity, request_id, outcome
     FROM tenant_audit_events WHERE id = ? AND organization_id = ?`,
  ).bind(eventId, organizationId).first<{ id: string; at: string; actor: string; action: string; entity: string; request_id: string; outcome: string }>()
  if (!event) return
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await db.prepare(
      `INSERT OR IGNORE INTO tenant_audit_chain_heads (organization_id, last_sequence, last_hash, updated_at)
       VALUES (?, 0, '', ?)`,
    ).bind(organizationId, timestamp).run()
    const head = await db.prepare(
      `SELECT last_sequence, last_hash FROM tenant_audit_chain_heads WHERE organization_id = ?`,
    ).bind(organizationId).first<{ last_sequence: number; last_hash: string }>()
    if (!head) return
    const sequence = head.last_sequence + 1
    const previousHash = head.last_sequence ? head.last_hash : null
    const eventHash = await auditHash(organizationId, sequence, previousHash, event)
    try {
      const result = await db.batch([
        db.prepare(
          `INSERT OR IGNORE INTO tenant_audit_chain_events (event_id, organization_id, sequence, previous_hash, event_hash, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(event.id, organizationId, sequence, previousHash, eventHash, timestamp),
        db.prepare(
          `UPDATE tenant_audit_chain_heads SET last_sequence = ?, last_hash = ?, updated_at = ?
           WHERE organization_id = ? AND last_sequence = ? AND last_hash = ?`,
        ).bind(sequence, eventHash, timestamp, organizationId, head.last_sequence, head.last_hash),
      ])
      if ((result[1]?.meta.changes ?? 0) === 1) return
      const existing = await db.prepare(`SELECT 1 AS found FROM tenant_audit_chain_events WHERE event_id = ?`).bind(event.id).first<{ found: number }>()
      if (existing) return
    } catch {
      if (attempt === 2) throw new UnprocessableEntityException('Audit evidence could not be recorded')
    }
  }
}

export class FormulaIntelligenceStore {
  constructor(private readonly db: D1Database) {}

  async createDesignProject(actor: AgentActor, briefInput: unknown, idempotencyKey: string, brandId: string) {
    const brief = formulaDesignBriefSchema.parse(briefInput)
    const rawKey = idempotencyKey.trim().slice(0, 160)
    const key = `design-project:${actor.userId}:${rawKey}`
    if (!rawKey) throw new UnprocessableEntityException('Idempotency-Key is required for a design brief')
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

  async listDesignProjects(actor: AgentActor, canViewPrivate: boolean) {
    const result = await this.db.prepare(
      `SELECT DISTINCT p.id, p.organization_id, p.brand_id, p.created_by_user_id, p.status, p.name, p.brief_json, p.selected_direction_id, p.created_at, p.updated_at
       FROM formula_design_projects p
       LEFT JOIN formula_design_direction_shares s
         ON s.project_id = p.id AND s.organization_id = p.organization_id AND s.recipient_user_id = ? AND s.revoked_at IS NULL
       LEFT JOIN formula_intelligence_runs r
         ON r.project_id = p.id AND r.organization_id = p.organization_id AND r.created_by_user_id = ?
       WHERE p.organization_id = ? AND (p.created_by_user_id = ? OR s.id IS NOT NULL OR r.run_id IS NOT NULL)
       ORDER BY p.updated_at DESC LIMIT 80`,
    ).bind(actor.userId, actor.userId, actor.organizationId, actor.userId).all<ProjectRow>()
    const visible = new Map((result.results ?? []).map((project) => [project.id, project]))
    // A perfumer may pick up an untouched brief in their active brand, but never
    // browse private directions that another perfumer has already generated.
    if (canViewPrivate) {
      const brandIds = await this.activeBrandIds(actor)
      if (brandIds.length) {
        const placeholders = brandIds.map(() => '?').join(', ')
        const queued = await this.db.prepare(
          `SELECT id, organization_id, brand_id, created_by_user_id, status, name, brief_json, selected_direction_id, created_at, updated_at
           FROM formula_design_projects
           WHERE organization_id = ? AND status = 'BRIEFED' AND brand_id IN (${placeholders})
           ORDER BY updated_at DESC LIMIT 80`,
        ).bind(actor.organizationId, ...brandIds).all<ProjectRow>()
        for (const project of queued.results ?? []) visible.set(project.id, project)
      }
    }
    return Promise.all([...visible.values()].sort((left, right) => right.updated_at.localeCompare(left.updated_at)).map((project) => this.projectPayload(project, actor, canViewPrivate)))
  }

  async designProject(actor: AgentActor, projectId: string, canViewPrivate: boolean) {
    const project = await this.projectForActor(actor, projectId)
    return this.projectPayload(project, actor, canViewPrivate)
  }

  async designProjectForGeneration(actor: AgentActor, projectId: string) {
    const project = await this.db.prepare(
      `SELECT id, organization_id, brand_id, created_by_user_id, status, name, brief_json, selected_direction_id, created_at, updated_at
       FROM formula_design_projects WHERE id = ? AND organization_id = ?`,
    ).bind(projectId, actor.organizationId).first<ProjectRow>()
    if (!project) throw new NotFoundException('Design project was not found')
    const brandIds = await this.activeBrandIds(actor)
    const canStart = project.created_by_user_id === actor.userId || (
      project.status === 'BRIEFED' && Boolean(project.brand_id) && brandIds.includes(project.brand_id!)
    )
    if (!canStart) throw new NotFoundException('Design project was not found')
    const existingRun = await this.db.prepare(
      `SELECT created_by_user_id FROM formula_intelligence_runs
       WHERE organization_id = ? AND project_id = ?
       ORDER BY created_at DESC LIMIT 1`,
    ).bind(actor.organizationId, project.id).first<{ created_by_user_id: string }>()
    if (existingRun && existingRun.created_by_user_id !== actor.userId) {
      // Do not disclose that a different perfumer is working on a project.
      throw new NotFoundException('Design project was not found')
    }
    if (existingRun || project.status !== 'BRIEFED') {
      throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_PROJECT_ALREADY_GENERATED')
    }
    return project
  }

  async createRunConfig(actor: AgentActor, runId: string, config: FormulaIntelligenceRunConfig, idempotencyKey: string) {
    const timestamp = now()
    const scopedKey = `formula-intelligence:${actor.userId}:${idempotencyKey.trim().slice(0, 160)}`
    await this.db.prepare(
      `INSERT INTO formula_intelligence_runs (run_id, organization_id, workflow_kind, config_json, project_id, baseline_formula_id, baseline_version, created_by_user_id, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      runId, actor.organizationId, config.workflowKind, JSON.stringify(config),
      config.workflowKind === 'DESIGN_STUDIO' ? config.projectId : null,
      config.workflowKind === 'REFORMULATION_OPTIMIZER' ? config.request.baselineFormulaId : null,
      config.workflowKind === 'REFORMULATION_OPTIMIZER' ? config.request.baselineVersion : null,
      actor.userId, scopedKey, timestamp, timestamp,
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

  async shareDirection(actor: AgentActor, projectId: string, directionId: string, body: unknown) {
    const project = await this.projectForActor(actor, projectId)
    const input = formulaDirectionShareSchema.parse(body)
    const direction = await this.directionForProject(actor, projectId, directionId, true)
    if (!(await this.isDirectionProducer(actor, direction))) throw new ForbiddenException('Only the perfumer who generated a direction can share it')
    const recipients = await this.activeRecipients(actor, project, input.recipientUserIds)
    if (recipients.length !== input.recipientUserIds.length) throw new UnprocessableEntityException('Every recipient must be an active member of this project brand')
    const timestamp = now()
    const statements = recipients.map((recipient) => this.db.prepare(
      `INSERT INTO formula_design_direction_shares (
        id, organization_id, project_id, direction_id, recipient_user_id, allow_material_names,
        shared_by_user_id, shared_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(direction_id, recipient_user_id) DO UPDATE SET
        allow_material_names = excluded.allow_material_names, shared_by_user_id = excluded.shared_by_user_id,
        shared_at = excluded.shared_at, revoked_at = NULL, revoked_by_user_id = NULL, updated_at = excluded.updated_at`,
    ).bind(uuid(), actor.organizationId, projectId, direction.id, recipient, input.allowMaterialNames ? 1 : 0, actor.userId, timestamp, timestamp, timestamp))
    statements.push(this.db.prepare(
      `UPDATE formula_design_directions SET status = 'SHARED', shared_by_user_id = ?, shared_at = ?, updated_at = ?
       WHERE id = ? AND project_id = ? AND organization_id = ?`,
    ).bind(actor.userId, timestamp, timestamp, directionId, projectId, actor.organizationId))
    await this.db.batch(statements)
    return { recipients: recipients.length, allowMaterialNames: input.allowMaterialNames }
  }

  async revokeDirectionShare(actor: AgentActor, projectId: string, directionId: string, recipientUserId: string) {
    await this.projectForActor(actor, projectId)
    const direction = await this.directionForProject(actor, projectId, directionId, true)
    if (!(await this.isDirectionProducer(actor, direction))) throw new ForbiddenException('Only the perfumer who generated a direction can revoke a share')
    const result = await this.db.prepare(
      `UPDATE formula_design_direction_shares SET revoked_at = ?, revoked_by_user_id = ?, updated_at = ?
       WHERE organization_id = ? AND project_id = ? AND direction_id = ? AND recipient_user_id = ? AND revoked_at IS NULL`,
    ).bind(now(), actor.userId, now(), actor.organizationId, projectId, directionId, recipientUserId).run()
    if (!result.meta.changes) throw new NotFoundException('Active direction share was not found')
  }

  async eligibleRecipients(actor: AgentActor, projectId: string) {
    const project = await this.projectForActor(actor, projectId)
    if (!(await this.isProjectProducer(actor, project.id))) throw new ForbiddenException('Only the generating perfumer can select direction recipients')
    const rows = await this.db.prepare(
      `SELECT user_id, name, email, brand_ids_json FROM tenant_memberships
       WHERE organization_id = ? AND status = 'ACTIVE' AND user_id != ? ORDER BY name ASC, email ASC`,
    ).bind(actor.organizationId, actor.userId).all<{ user_id: string; name: string; email: string; brand_ids_json: string }>()
    return (rows.results ?? []).filter((row) => !project.brand_id || parseJson<string[]>(row.brand_ids_json, []).includes(project.brand_id)).map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
    }))
  }

  async feedback(actor: AgentActor, projectId: string, directionId: string, body: unknown) {
    const project = await this.projectForActor(actor, projectId)
    const direction = await this.directionForProject(actor, projectId, directionId, false)
    const share = await this.activeShare(actor, direction.id)
    if (!share) throw new ForbiddenException('This direction is not shared with the current member')
    const input = formulaDirectionFeedbackSchema.parse(body)
    const rating = input.rating ?? null
    const comment = input.comment ?? ''
    const selected = input.selected
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
    await this.projectForActor(actor, projectId)
    const direction = await this.directionForProject(actor, projectId, directionId, true)
    if (!(await this.isDirectionProducer(actor, direction))) throw new ForbiddenException('Only the perfumer who generated a direction can save it as a draft')
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

  async assertRunStartAllowed(actor: AgentActor, projectId?: string) {
    const activeStatuses = ['QUEUED', 'RUNNING', 'WAITING_FOR_CONFIRMATION']
    const active = await this.db.prepare(
      `SELECT
        SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS user_count,
        COUNT(*) AS tenant_count
       FROM agent_runs
       WHERE organization_id = ? AND status IN (?, ?, ?)`,
    ).bind(actor.userId, actor.organizationId, ...activeStatuses).first<{ user_count: number | null; tenant_count: number | null }>()
    if (Number(active?.user_count ?? 0) >= 2 || Number(active?.tenant_count ?? 0) >= 10) {
      await auditFormulaIntelligence(this.db, actor, 'formula-intelligence.run.quota.denied', projectId ?? 'tenant', 'blocked')
      throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_RUN_QUOTA_EXHAUSTED')
    }
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const starts = await this.db.prepare(
      `SELECT COUNT(*) AS count FROM formula_intelligence_runs
       WHERE organization_id = ? AND created_by_user_id = ? AND created_at >= ?`,
    ).bind(actor.organizationId, actor.userId, cutoff).first<{ count: number }>()
    if (Number(starts?.count ?? 0) >= 5) {
      await auditFormulaIntelligence(this.db, actor, 'formula-intelligence.run.rate-limit.denied', projectId ?? 'tenant', 'blocked')
      throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_START_RATE_LIMITED')
    }
    if (projectId) {
      const projectRun = await this.db.prepare(
        `SELECT 1 AS found FROM formula_intelligence_runs fi
         JOIN agent_runs ar ON ar.id = fi.run_id AND ar.organization_id = fi.organization_id
         WHERE fi.organization_id = ? AND fi.project_id = ? AND ar.status IN (?, ?, ?) LIMIT 1`,
      ).bind(actor.organizationId, projectId, ...activeStatuses).first<{ found: number }>()
      if (projectRun) {
        await auditFormulaIntelligence(this.db, actor, 'formula-intelligence.project.generation.denied', projectId, 'blocked')
        throw new ConflictException('FORMULA_INTELLIGENCE_PROJECT_GENERATION_IN_PROGRESS')
      }
    }
  }

  async revalidateDraftSave(actor: AgentActor, runId: string, proposal: ReturnType<typeof agentFormulaProposalSchema.parse>, service: NorthStarService) {
    const { config } = await this.configForRun(actor, runId)
    const total = proposal.ingredients.reduce((sum, ingredient) => sum + ingredient.percentage, 0)
    if (Math.abs(total - 100) > 0.05) throw new UnprocessableEntityException('Formula composition must total 100% before it can be saved')
    const preview = service.previewFormulaIntelligence(proposal).data
    if (preview.compliance.status === 'BLOCKED' || preview.ifra.blockerCount > 0) {
      throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_DRAFT_BLOCKED')
    }
    if (config.workflowKind === 'REFORMULATION_OPTIMIZER') {
      assertCandidateSaveEligibility(service, proposal, config.request)
    } else {
      const candidateMaterialIds = new Set(proposal.ingredients.map((ingredient) => ingredient.materialId))
      if (config.brief.lockedMaterialIds.some((materialId) => !candidateMaterialIds.has(materialId))) {
        throw new UnprocessableEntityException('Formula draft does not preserve locked materials from the design brief')
      }
    }
    return preview
  }

  private async projectForActor(actor: AgentActor, projectId: string) {
    const project = await this.db.prepare(
      `SELECT id, organization_id, brand_id, created_by_user_id, status, name, brief_json, selected_direction_id, created_at, updated_at
       FROM formula_design_projects WHERE id = ? AND organization_id = ?`,
    ).bind(projectId, actor.organizationId).first<ProjectRow>()
    if (!project) throw new NotFoundException('Design project was not found')
    const isCreator = project.created_by_user_id === actor.userId
    const isProducer = await this.isProjectProducer(actor, project.id)
    const shared = await this.db.prepare(
      `SELECT 1 AS found FROM formula_design_direction_shares
       WHERE organization_id = ? AND project_id = ? AND recipient_user_id = ? AND revoked_at IS NULL LIMIT 1`,
    ).bind(actor.organizationId, project.id, actor.userId).first<{ found: number }>()
    if (!isCreator && !isProducer && !shared) throw new NotFoundException('Design project was not found')
    return project
  }

  private async directionForProject(actor: AgentActor, projectId: string, directionId: string, includePrivate: boolean) {
    const direction = await this.db.prepare(
      `SELECT id, project_id, run_id, sequence, title, status, safe_summary_json, proposal_json, shared_by_user_id, shared_at, saved_formula_id, created_at, updated_at
       FROM formula_design_directions WHERE id = ? AND project_id = ? AND organization_id = ?`,
    ).bind(directionId, projectId, actor.organizationId).first<DirectionRow>()
    if (!direction) throw new NotFoundException('Design direction was not found')
    if (!includePrivate && !(await this.activeShare(actor, direction.id))) throw new NotFoundException('Design direction was not found')
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
       WHERE run_id = ? AND organization_id = ? AND status = 'PENDING' AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
    ).bind(run.id, run.organization_id, now()).first<{ id: string; summary: string }>()
    return existing ? { confirmationId: existing.id, summary: existing.summary } : undefined
  }

  private async projectPayload(project: ProjectRow, actor: AgentActor, canViewPrivate: boolean) {
    const directionRows = await this.db.prepare(
      `SELECT d.id, d.project_id, d.run_id, d.sequence, d.title, d.status, d.safe_summary_json, d.proposal_json,
        d.shared_by_user_id, d.shared_at, d.saved_formula_id, d.created_at, d.updated_at
       FROM formula_design_directions d
       WHERE d.project_id = ? AND d.organization_id = ?
       ORDER BY d.sequence ASC`,
    ).bind(project.id, actor.organizationId).all<DirectionRow>()
    const feedback = await this.db.prepare(
      `SELECT id, direction_id, user_id, rating, comment, selected, created_at, updated_at
       FROM formula_design_feedback WHERE project_id = ? AND organization_id = ? ${canViewPrivate ? '' : 'AND user_id = ?'} ORDER BY created_at ASC`,
    ).bind(...(canViewPrivate ? [project.id, actor.organizationId] : [project.id, actor.organizationId, actor.userId])).all<{ id: string; direction_id: string; user_id: string; rating: number | null; comment: string; selected: number; created_at: string; updated_at: string }>()
    const directions = await Promise.all((directionRows.results ?? []).map(async (direction) => {
      const privateDirection = canViewPrivate && await this.isDirectionProducer(actor, direction)
      const share = privateDirection ? undefined : await this.activeShare(actor, direction.id)
      if (!privateDirection && !share) return undefined
      const stored = parseJson(direction.safe_summary_json, {} as ReturnType<typeof safeDirection>)
      const proposal = agentFormulaProposalSchema.parse(parseJson(direction.proposal_json, {}))
      const safeSource: DesignDirectionArtifact = {
        directionId: direction.id,
        title: direction.title,
        narrative: typeof (stored as { narrative?: unknown }).narrative === 'string' ? (stored as { narrative: string }).narrative : '',
        pyramidSummary: typeof (stored as { pyramidSummary?: unknown }).pyramidSummary === 'string' ? (stored as { pyramidSummary: string }).pyramidSummary : '',
        availability: (stored as { availability?: DesignDirectionArtifact['availability'] }).availability ?? 'UNKNOWN',
        complianceStatus: (stored as { complianceStatus?: DesignDirectionArtifact['complianceStatus'] }).complianceStatus ?? 'INSUFFICIENT_DATA',
        warnings: Array.isArray((stored as { warnings?: unknown }).warnings) ? (stored as { warnings: string[] }).warnings : [],
        proposal,
      }
      const visible = privateDirection
        ? {
            ...safeDirection(safeSource),
            narrative: (stored as { narrative?: string }).narrative ?? 'Private perfumer direction.',
            pyramidSummary: (stored as { pyramidSummary?: string }).pyramidSummary ?? '',
            warnings: (stored as { warnings?: string[] }).warnings ?? [],
            runId: direction.run_id,
            proposal,
          }
        : {
            ...safeDirection(safeSource),
            ...(share?.allow_material_names ? {
              narrative: (stored as { narrative?: string }).narrative ?? 'Creative direction shared for review.',
              pyramidSummary: (stored as { pyramidSummary?: string }).pyramidSummary ?? 'Material names are unavailable.',
            } : {}),
          }
      const shares = privateDirection
        ? await this.db.prepare(
          `SELECT recipient_user_id, allow_material_names, shared_at FROM formula_design_direction_shares
           WHERE organization_id = ? AND direction_id = ? AND revoked_at IS NULL ORDER BY shared_at ASC`,
        ).bind(actor.organizationId, direction.id).all<DirectionShareRow>()
        : undefined
      return {
        ...visible,
        status: direction.status,
        sharedAt: share?.shared_at ?? direction.shared_at,
        savedFormulaId: privateDirection ? direction.saved_formula_id : undefined,
        ...(shares ? { shares: (shares.results ?? []).map((item) => ({ recipientUserId: item.recipient_user_id, allowMaterialNames: Boolean(item.allow_material_names), sharedAt: item.shared_at })) } : {}),
      }
    }))
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      createdByUserId: project.created_by_user_id,
      selectedDirectionId: project.selected_direction_id,
      brief: formulaDesignBriefSchema.parse(parseJson(project.brief_json, {})),
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      directions: directions.filter((direction): direction is NonNullable<typeof direction> => Boolean(direction)),
      feedback: (feedback.results ?? []).map((item) => ({ id: item.id, directionId: item.direction_id, userId: item.user_id, rating: item.rating, comment: item.comment, selected: Boolean(item.selected), createdAt: item.created_at })),
    }
  }

  private async activeShare(actor: AgentActor, directionId: string) {
    return this.db.prepare(
      `SELECT id, recipient_user_id, allow_material_names, shared_at, revoked_at
       FROM formula_design_direction_shares
       WHERE organization_id = ? AND direction_id = ? AND recipient_user_id = ? AND revoked_at IS NULL`,
    ).bind(actor.organizationId, directionId, actor.userId).first<DirectionShareRow>()
  }

  private async isProjectProducer(actor: AgentActor, projectId: string) {
    const run = await this.db.prepare(
      `SELECT 1 AS found FROM formula_intelligence_runs
       WHERE organization_id = ? AND project_id = ? AND created_by_user_id = ? LIMIT 1`,
    ).bind(actor.organizationId, projectId, actor.userId).first<{ found: number }>()
    return Boolean(run)
  }

  private async isDirectionProducer(actor: AgentActor, direction: DirectionRow) {
    const run = await this.db.prepare(
      `SELECT 1 AS found FROM agent_runs WHERE id = ? AND organization_id = ? AND user_id = ? LIMIT 1`,
    ).bind(direction.run_id, actor.organizationId, actor.userId).first<{ found: number }>()
    return Boolean(run)
  }

  private async activeBrandIds(actor: AgentActor) {
    const membership = await this.db.prepare(
      `SELECT brand_ids_json FROM tenant_memberships
       WHERE organization_id = ? AND user_id = ? AND status = 'ACTIVE' LIMIT 1`,
    ).bind(actor.organizationId, actor.userId).first<{ brand_ids_json: string }>()
    return membership ? parseJson<string[]>(membership.brand_ids_json, []) : []
  }

  private async activeRecipients(actor: AgentActor, project: ProjectRow, recipientIds: string[]) {
    const unique = [...new Set(recipientIds)]
    if (unique.length !== recipientIds.length) throw new UnprocessableEntityException('A direction recipient can appear only once')
    const placeholders = unique.map(() => '?').join(', ')
    const rows = await this.db.prepare(
      `SELECT user_id, brand_ids_json FROM tenant_memberships
       WHERE organization_id = ? AND status = 'ACTIVE' AND user_id IN (${placeholders})`,
    ).bind(actor.organizationId, ...unique).all<{ user_id: string; brand_ids_json: string }>()
    return (rows.results ?? [])
      .filter((row) => {
        const brands = parseJson<string[]>(row.brand_ids_json, [])
        return !project.brand_id || brands.includes(project.brand_id)
      })
      .map((row) => row.user_id)
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
  await store.assertExecutionLease(run.id, run.organization_id)
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
  await store.assertExecutionLease(run.id, run.organization_id)
  const timestamp = now()
  await store.database.prepare(`UPDATE agent_runs SET status = 'RUNNING', started_at = COALESCE(started_at, ?), updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ?`)
    .bind(timestamp, timestamp, run.id, run.organization_id).run()
  await store.append(run.id, run.organization_id, 'run.started', { status: 'RUNNING', progress: run.progress })
  return run
}

async function completeRun(store: AgentRuntimeStore, run: AgentRunRow) {
  await store.assertExecutionLease(run.id, run.organization_id)
  const timestamp = now()
  await store.database.prepare(`UPDATE agent_runs SET status = 'COMPLETED', progress = 100, completed_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ?`)
    .bind(timestamp, timestamp, run.id, run.organization_id).run()
  await store.append(run.id, run.organization_id, 'run.completed', { status: 'COMPLETED', progress: 100 })
  await store.completeJob(run.id, run.organization_id, 'COMPLETED')
}

async function failRun(store: AgentRuntimeStore, run: AgentRunRow, error: unknown) {
  const message = error instanceof ForbiddenException ? 'Formula Intelligence authorization changed during execution' : 'Formula Intelligence execution failed'
  const timestamp = now()
  await store.assertExecutionLease(run.id, run.organization_id)
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

async function runDesignStudio(store: AgentRuntimeStore, service: NorthStarService, actor: AgentActor, run: AgentRunRow, config: Extract<FormulaIntelligenceRunConfig, { workflowKind: 'DESIGN_STUDIO' }>, materialEvidence?: MaterialEvidenceRag) {
  const intelligence = new FormulaIntelligenceStore(store.database)
  const analyzeId = await store.createNode(run, 'analyze_brief', { brief: config.brief.creativeBrief })
  await store.startNode(run, analyzeId, 'analyze_brief')
  await store.completeNode(run, analyzeId, 'analyze_brief', { designProjectId: config.projectId, availabilityFirst: config.brief.availabilityFirst }, 12)
  const searchId = await store.createNode(run, 'search_materials', { brief: config.brief.creativeBrief })
  await store.startNode(run, searchId, 'search_materials')
  const materials = availabilityRankedMaterials(service, approvedMaterials(service))
  if (!materials.length) throw new UnprocessableEntityException('No compliance-approved workspace materials are available for this design brief')
  await recordTool(store, run, searchId, 'search_materials', { query: config.brief.creativeBrief }, { materialIds: materials.slice(0, 12).map((material) => material.id) })
  const granted = new Set(service.me().data.permissions)
  const evidence = materialEvidence && granted.has('documents.view') && granted.has('materials.view')
    ? await materialEvidence.retrieve({ organizationId: actor.organizationId, userId: actor.userId, permissions: [...granted] }, { query: config.brief.creativeBrief, materialIds: materials.slice(0, 12).map((material) => material.id), topK: 6 })
    : { state: 'NOT_EVALUATED' as const, citations: [], indexedSourceCount: 0 }
  if (materialEvidence && granted.has('documents.view') && granted.has('materials.view')) {
    await recordTool(store, run, searchId, 'retrieve_material_evidence', { query: config.brief.creativeBrief, materialIds: materials.slice(0, 12).map((material) => material.id) }, { state: evidence.state, citationCount: evidence.citations.length })
  }
  await store.completeNode(run, searchId, 'search_materials', { materialCount: materials.length, evidenceState: evidence.state }, 28)
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
  await store.createArtifact(run, { type: 'evidence_citations', version: 1, data: { state: evidence.state, citations: evidence.citations } })
  await store.assertExecutionLease(run.id, run.organization_id)
  await intelligence.persistDesignDirections(actor, config.projectId, run.id, directions)
  await store.completeNode(run, resultId, 'prepare_result', { artifactCount: 2, directionCount: directions.length }, 94)
  await store.createAssistantMessage(run, 'I prepared three deterministic design directions from compliance-approved workspace materials. A perfumer can share a direction for brand review or explicitly save one as a draft.')
}

async function runOptimizer(store: AgentRuntimeStore, service: NorthStarService, actor: AgentActor, run: AgentRunRow, config: Extract<FormulaIntelligenceRunConfig, { workflowKind: 'REFORMULATION_OPTIMIZER' }>, materialEvidence?: MaterialEvidenceRag) {
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
  const granted = new Set(service.me().data.permissions)
  const evidenceMaterialIds = [...new Set([...materialIdSet, ...materials.slice(0, 12).map((material) => material.id)])].slice(0, 12)
  const evidence = materialEvidence && granted.has('documents.view') && granted.has('materials.view')
    ? await materialEvidence.retrieve({ organizationId: actor.organizationId, userId: actor.userId, permissions: [...granted] }, { query: `Optimize ${request.intent} for ${versions.formula.name}`, materialIds: evidenceMaterialIds, topK: 6 })
    : { state: 'NOT_EVALUATED' as const, citations: [], indexedSourceCount: 0 }
  if (materialEvidence && granted.has('documents.view') && granted.has('materials.view')) {
    await recordTool(store, run, searchId, 'retrieve_material_evidence', { query: `Optimize ${request.intent}`, materialIds: evidenceMaterialIds }, { state: evidence.state, citationCount: evidence.citations.length })
  }
  await store.completeNode(run, searchId, 'search_materials', { candidateMaterialCount: materials.length, evidenceState: evidence.state }, 28)
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
    // UI score is secondary. The final sort below is a strict lexical rank.
    const score = Number(Math.max(0, Math.min(100,
      (status === 'PASS' ? 60 : status === 'REVIEW_REQUIRED' ? 30 : 0)
      + (hasInventoryAccess(service) && availability === 'AVAILABLE' ? 20 : hasInventoryAccess(service) && availability === 'MIXED' ? 5 : 0)
      + (costDelta === undefined ? 0 : costDelta <= 0 ? 15 : Math.max(0, 15 - costDelta * 10))
      + Math.max(0, 5 - change / 20),
    )).toFixed(2))
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
  }).sort((left, right) => compareOptimizerCandidates(
    { ...left, inventoryEvaluated: hasInventoryAccess(service) },
    { ...right, inventoryEvaluated: hasInventoryAccess(service) },
  ))
  const resultId = await store.createNode(run, 'prepare_result', { baselineFormulaId: request.baselineFormulaId })
  await store.startNode(run, resultId, 'prepare_result')
  await store.createArtifact(run, { type: 'optimizer_candidates', version: 1, data: { baselineFormulaId: request.baselineFormulaId, baselineVersion: request.baselineVersion, intent: request.intent, candidates } })
  await store.createArtifact(run, { type: 'evidence_citations', version: 1, data: { state: evidence.state, citations: evidence.citations } })
  await store.assertExecutionLease(run.id, run.organization_id)
  await intelligence.persistOptimizerCandidates(actor, run.id, request, candidates)
  await store.completeNode(run, resultId, 'prepare_result', { artifactCount: 2, candidateCount: candidates.length }, 94)
  await store.createAssistantMessage(run, 'I ranked deterministic reformulation candidates by compliance feasibility, eligible inventory, cost evidence when permitted, and minimum composition change. Select a candidate before saving a normal editable draft.')
}

export async function executeFormulaIntelligenceRun(store: AgentRuntimeStore, service: NorthStarService, actor: AgentActor, runId: string, materialEvidence?: MaterialEvidenceRag) {
  const intelligence = new FormulaIntelligenceStore(store.database)
  const { config } = await intelligence.configForRun(actor, runId)
  const run = await beginRun(store, actor, runId)
  if (!run) return
  try {
    requirePermission(service, 'formulas.viewSensitive')
    requirePermission(service, 'materials.view')
    if (config.workflowKind === 'DESIGN_STUDIO') await runDesignStudio(store, service, actor, run, config, materialEvidence)
    else await runOptimizer(store, service, actor, run, config, materialEvidence)
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
  const project = await intelligence.designProjectForGeneration(actor, projectId)
  await intelligence.assertRunStartAllowed(actor, projectId)
  const store = new AgentRuntimeStore(db)
  const brief = formulaDesignBriefSchema.parse(parseJson(project.brief_json, {}))
  const result = await store.create(actor, { brief: brief.creativeBrief }, { provider: 'mock', model: 'deterministic-v1' })
  const config = formulaIntelligenceRunConfigSchema.parse({ workflowKind: 'DESIGN_STUDIO', projectId, brief })
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
  const intelligence = new FormulaIntelligenceStore(db)
  await intelligence.assertRunStartAllowed(actor)
  const result = await store.create(actor, { brief: `Optimize ${versions.formula.name} ${request.baselineVersion}` }, { provider: 'mock', model: 'deterministic-v1' })
  const config = formulaIntelligenceRunConfigSchema.parse({ workflowKind: 'REFORMULATION_OPTIMIZER', request })
  await intelligence.createRunConfig(actor, result.data.run.id, config, idempotencyKey)
  await auditFormulaIntelligence(db, actor, 'formula-intelligence.reformulation.run.create', `${request.baselineFormulaId}:${request.baselineVersion}`)
  return { run: result.data.run, baseline: { formulaId: request.baselineFormulaId, version: request.baselineVersion } }
}
