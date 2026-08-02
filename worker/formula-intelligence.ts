import {
  agentFormulaProposalSchema,
  designCandidateEvaluationSchema,
  formulaDesignBriefFromStructuredBrief,
  formulaDesignBriefSchema,
  formulaDesignProjectCreateSchema,
  formulaDirectionFeedbackSchema,
  formulaDirectionShareSchema,
  formulaIntelligenceRunConfigSchema,
  formulaOptimizerRequestSchema,
  rawBriefFromProjectCreate,
  structuredFormulaDesignBriefSchema,
  toSafeAgentRuntimeError,
  validateStructuredFormulaDesignBrief,
  type DesignDirectionArtifact,
  type DesignCandidateEvaluation,
  type FormulaIntelligenceRunConfig,
  type FormulaOptimizerRequest,
  type OptimizerCandidateArtifact,
} from '../src/data/agentRuntime.js'
import {
  buildDesignDirectionProposals,
  buildOptimizerProposals,
  compareOptimizerCandidates,
  compositionChangePercent,
  optimizerBaselineLines,
  optimizerParetoState,
  proposalFromFormulaVersion,
  sensoryMemoryEvidenceForDirection,
} from '../src/data/formulaIntelligence.js'
import { rankLluchCatalogueGlobalMasterMaterials } from '../src/data/lluch-catalogue-2026.js'
import type { FormulaIntelligenceTrialSource, Material } from '../src/data/northStar.js'
import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '../server/src/shared/http-error.js'
import type { NorthStarService } from '../server/src/services/northstar.service.js'
import {
  AgentRuntimeStore,
  DeterministicMockFormulaProvider,
  agentFunctionTools,
  type AgentActor,
  type AgentModelProvider,
  type AgentRunRow,
} from './agent-runtime.js'
import type { MaterialEvidenceRag } from './material-evidence-rag.js'

type ProjectRow = {
  id: string
  organization_id: string
  brand_id: string | null
  created_by_user_id: string
  status: string
  name: string
  brief_json: string
  current_brief_version_id: string | null
  selected_direction_id: string | null
  formula_type_hint?: 'ACCORD' | 'FINE_FRAGRANCE' | null
  archived_at?: string | null
  archived_by_user_id?: string | null
  archive_previous_status?: string | null
  purge_after?: string | null
  created_at: string
  updated_at: string
}

type BriefVersionRow = {
  id: string
  organization_id: string
  project_id: string
  version_number: number
  state: 'RAW' | 'REVIEW_REQUIRED' | 'REVIEWED' | 'LEGACY_UNSTRUCTURED'
  schema_version: number
  raw_brief: string
  structured_brief_json: string | null
  unresolved_questions_json: string
  compiler_mode: 'MANUAL' | 'NOT_CONFIGURED' | 'LEGACY'
  checksum: string
  created_by_user_id: string
  created_at: string
}

type ConstraintSnapshotRow = {
  id: string
  organization_id: string
  project_id: string
  brief_version_id: string
  snapshot_json: string
  constraints_hash: string
  material_universe_hash: string | null
  material_universe_state: 'NOT_EVALUATED' | 'PINNED'
  created_by_user_id: string
  created_at: string
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

type GenerationContextLinkRow = {
  brief_version_id: string
  constraint_snapshot_id: string
  material_universe_hash: string
}

type DirectionEvaluationLinkRow = {
  constraint_snapshot_id: string
  evaluation_json: string
  evaluation_hash: string
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

function isWorkspaceOwnerOrAdmin(role: string) {
  const normalized = role.trim().toLowerCase()
  return normalized === 'owner' || normalized === 'admin'
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

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalJson(nested)]))
  }
  return value
}

async function checksum(value: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonicalJson(value))))
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, '0')).join('')
}

function permissions(service: NorthStarService) {
  return new Set(service.me().data.permissions)
}

function requirePermission(service: NorthStarService, permission: string) {
  if (!permissions(service).has(permission)) {
    throw new ForbiddenException(`Formula Intelligence requires ${permission}`)
  }
}

function requireFormulaIntelligenceFeature(service: NorthStarService, key: string) {
  if (!service.formulaIntelligenceFeatureEnabled(key)) {
    throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_FEATURE_DISABLED')
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
  const materialNames = new Map(preview.formula.lines.map((line) => [line.materialId, line.label]))
  return [
    ...preview.ifra.rows
      .filter((row) => row.status !== 'PASS' && row.status !== 'NO_LIMIT')
      .map((row) => `${row.materialName}: ${row.status}`),
    ...preview.compliance.reviewMaterialIds.map((id) => `Compliance review required for ${materialNames.get(id) ?? id}`),
    ...(preview.visibility.canViewInventory
      ? preview.availability.filter((item) => item.status !== 'AVAILABLE').map((item) => `${item.materialName}: ${item.status.toLowerCase()}`)
      : ['Inventory detail is hidden by the current role.']),
  ].slice(0, 40)
}

function designCandidateConstraintState(direction: DesignDirectionArtifact, brief: Extract<FormulaIntelligenceRunConfig, { workflowKind: 'DESIGN_STUDIO' }>['brief']) {
  const proposalMaterialIds = new Set(direction.proposal.ingredients.map((ingredient) => ingredient.materialId))
  const requiredMaterialsSatisfied = brief.lockedMaterialIds.every((materialId) => proposalMaterialIds.has(materialId))
  const state = !requiredMaterialsSatisfied || direction.complianceStatus === 'BLOCKED'
    ? 'BLOCKED' as const
    : direction.complianceStatus === 'REVIEW_REQUIRED'
      ? 'REVIEW_REQUIRED' as const
      : 'PASS' as const
  return { state, requiredMaterialsSatisfied }
}

function compareDesignCandidateEvaluations(left: DesignCandidateEvaluation, right: DesignCandidateEvaluation) {
  const constraintRank = (value: DesignCandidateEvaluation['constraints']['state']) => value === 'PASS' ? 3 : value === 'REVIEW_REQUIRED' ? 2 : 1
  const complianceRank = (value: DesignCandidateEvaluation['complianceStatus']) => value === 'PASS' ? 3 : value === 'REVIEW_REQUIRED' ? 2 : 1
  const availabilityRank = (value: DesignCandidateEvaluation['availability']) => value === 'AVAILABLE' ? 3 : value === 'MIXED' ? 2 : 1
  const constraint = constraintRank(right.constraints.state) - constraintRank(left.constraints.state)
  if (constraint) return constraint
  const compliance = complianceRank(right.complianceStatus) - complianceRank(left.complianceStatus)
  if (compliance) return compliance
  const availability = availabilityRank(right.availability) - availabilityRank(left.availability)
  if (availability) return availability
  const costEvidence = Number(right.cost.state === 'EVALUATED') - Number(left.cost.state === 'EVALUATED')
  if (costEvidence) return costEvidence
  if (left.cost.totalCost !== undefined && right.cost.totalCost !== undefined && left.cost.totalCost !== right.cost.totalCost) {
    return left.cost.totalCost - right.cost.totalCost
  }
  return left.proposalChecksum.localeCompare(right.proposalChecksum)
}

async function evaluateDesignCandidates(
  directions: DesignDirectionArtifact[],
  previews: Preview[],
  brief: Extract<FormulaIntelligenceRunConfig, { workflowKind: 'DESIGN_STUDIO' }>['brief'],
  materialUniverseHash: string,
  materialCount: number,
) {
  const evaluations = await Promise.all(directions.map(async (direction, index) => {
    const preview = previews[index]!
    const totalPercentage = Number(direction.proposal.ingredients.reduce((sum, ingredient) => sum + ingredient.percentage, 0).toFixed(4))
    const constraints = designCandidateConstraintState(direction, brief)
    return designCandidateEvaluationSchema.parse({
      directionId: direction.directionId,
      rank: 1,
      proposalChecksum: await checksum(direction.proposal),
      composition: { state: 'VALID', totalPercentage },
      constraints,
      complianceStatus: direction.complianceStatus,
      availability: direction.availability,
      cost: preview.cost
        ? { state: 'EVALUATED', totalCost: Number(preview.cost.totalCost.toFixed(4)) }
        : { state: 'NOT_EVALUATED' },
      materialUniverse: { hash: materialUniverseHash, materialCount },
      warnings: direction.warnings,
    })
  }))
  return evaluations
    .sort(compareDesignCandidateEvaluations)
    .map((evaluation, index) => ({ ...evaluation, rank: index + 1 }))
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
    const input = formulaDesignProjectCreateSchema.parse(briefInput)
    const rawBrief = rawBriefFromProjectCreate(input)
    const rawKey = idempotencyKey.trim().slice(0, 160)
    const key = `design-project:${actor.userId}:${rawKey}`
    if (!rawKey) throw new UnprocessableEntityException('Idempotency-Key is required for a design brief')
    const existing = await this.db.prepare(
      `SELECT id, organization_id, brand_id, created_by_user_id, status, name, brief_json, current_brief_version_id, selected_direction_id, formula_type_hint, archived_at, archived_by_user_id, archive_previous_status, purge_after, created_at, updated_at
       FROM formula_design_projects WHERE organization_id = ? AND idempotency_key = ?`,
    ).bind(actor.organizationId, key).first<ProjectRow>()
    if (existing) return this.projectPayload(existing, actor, false)
    const timestamp = now()
    const briefVersionId = uuid()
    const rawChecksum = await checksum({ schemaVersion: 1, rawBrief, state: 'RAW' })
    const project: ProjectRow = {
      id: uuid(), organization_id: actor.organizationId, brand_id: brandId || null, created_by_user_id: actor.userId,
      status: 'BRIEFED', name: input.name, brief_json: '{}', current_brief_version_id: briefVersionId, selected_direction_id: null,
      formula_type_hint: input.formulaType ?? null, archived_at: null, archived_by_user_id: null, archive_previous_status: null, purge_after: null,
      created_at: timestamp, updated_at: timestamp,
    }
    await this.db.batch([
      this.db.prepare(
        `INSERT INTO formula_design_projects (id, organization_id, brand_id, created_by_user_id, status, name, brief_json, current_brief_version_id, formula_type_hint, idempotency_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(project.id, project.organization_id, project.brand_id, project.created_by_user_id, project.status, project.name, project.brief_json, project.current_brief_version_id, project.formula_type_hint, key, timestamp, timestamp),
      this.db.prepare(
        `INSERT INTO formula_design_brief_versions (
          id, organization_id, project_id, version_number, state, schema_version, raw_brief,
          structured_brief_json, unresolved_questions_json, compiler_mode, compiler_template_version,
          checksum, idempotency_key, created_by_user_id, created_at
        ) VALUES (?, ?, ?, 1, 'RAW', 1, ?, NULL, ?, 'MANUAL', NULL, ?, ?, ?, ?)`,
      ).bind(briefVersionId, actor.organizationId, project.id, rawBrief, JSON.stringify([{ field: 'structuredBrief', reason: 'Complete the structured review before generation.', importance: 'HIGH' }]), rawChecksum, `brief-raw:${actor.userId}:${rawKey}`, actor.userId, timestamp),
    ])
    return this.projectPayload(project, actor, false)
  }

  async listDesignProjects(actor: AgentActor, canViewPrivate: boolean, includeArchived = false) {
    const archivedFilter = includeArchived ? '' : `AND p.status <> 'ARCHIVED'`
    const result = await this.db.prepare(
      `SELECT DISTINCT p.id, p.organization_id, p.brand_id, p.created_by_user_id, p.status, p.name, p.brief_json, p.current_brief_version_id, p.selected_direction_id, p.formula_type_hint, p.archived_at, p.archived_by_user_id, p.archive_previous_status, p.purge_after, p.created_at, p.updated_at
       FROM formula_design_projects p
       LEFT JOIN formula_design_direction_shares s
         ON s.project_id = p.id AND s.organization_id = p.organization_id AND s.recipient_user_id = ? AND s.revoked_at IS NULL
       LEFT JOIN formula_intelligence_runs r
         ON r.project_id = p.id AND r.organization_id = p.organization_id AND r.created_by_user_id = ?
       WHERE p.organization_id = ? AND (p.created_by_user_id = ? OR s.id IS NOT NULL OR r.run_id IS NOT NULL) ${archivedFilter}
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
          `SELECT id, organization_id, brand_id, created_by_user_id, status, name, brief_json, current_brief_version_id, selected_direction_id, formula_type_hint, archived_at, archived_by_user_id, archive_previous_status, purge_after, created_at, updated_at
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

  async archiveDesignProject(actor: AgentActor, projectId: string) {
    const project = await this.projectForLifecycle(actor, projectId)
    if (project.status === 'ARCHIVED') {
      return { projectId: project.id, status: 'ARCHIVED' as const, purgeAfter: project.purge_after ?? undefined, duplicate: true }
    }
    const timestamp = now()
    const purgeAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const restoreStatus = project.status === 'IN_PROGRESS' ? 'BRIEFED' : project.status
    const activeRuns = await this.db.prepare(
      `SELECT r.id, r.progress
       FROM agent_runs r
       INNER JOIN formula_intelligence_runs fi ON fi.run_id = r.id AND fi.organization_id = r.organization_id
       WHERE r.organization_id = ? AND fi.project_id = ?
         AND r.status IN ('QUEUED', 'RUNNING', 'WAITING_FOR_CONFIRMATION', 'PAUSED')`,
    ).bind(actor.organizationId, project.id).all<{ id: string; progress: number }>()
    await this.db.batch([
      this.db.prepare(
        `UPDATE formula_design_projects
         SET status = 'ARCHIVED', archived_at = ?, archived_by_user_id = ?, archive_previous_status = ?, purge_after = ?, updated_at = ?
         WHERE id = ? AND organization_id = ? AND status <> 'ARCHIVED'`,
      ).bind(timestamp, actor.userId, restoreStatus, purgeAfter, timestamp, project.id, actor.organizationId),
      this.db.prepare(
        `UPDATE formula_design_direction_shares
         SET revoked_at = ?, revoked_by_user_id = ?, updated_at = ?
         WHERE organization_id = ? AND project_id = ? AND revoked_at IS NULL`,
      ).bind(timestamp, actor.userId, timestamp, actor.organizationId, project.id),
      this.db.prepare(
        `UPDATE agent_runs
         SET status = 'CANCELLED', cancel_requested_at = ?, completed_at = ?, updated_at = ?, version = version + 1
         WHERE organization_id = ? AND id IN (
           SELECT run_id FROM formula_intelligence_runs WHERE organization_id = ? AND project_id = ?
         ) AND status IN ('QUEUED', 'RUNNING', 'WAITING_FOR_CONFIRMATION', 'PAUSED')`,
      ).bind(timestamp, timestamp, timestamp, actor.organizationId, actor.organizationId, project.id),
      this.db.prepare(
        `UPDATE agent_jobs
         SET status = 'CANCELLED', lease_token = NULL, lease_expires_at = NULL, updated_at = ?
         WHERE organization_id = ? AND run_id IN (
           SELECT run_id FROM formula_intelligence_runs WHERE organization_id = ? AND project_id = ?
         ) AND status IN ('QUEUED', 'RUNNING', 'WAITING_FOR_CONFIRMATION', 'PAUSED')`,
      ).bind(timestamp, actor.organizationId, actor.organizationId, project.id),
      this.db.prepare(
        `UPDATE agent_confirmations
         SET status = 'EXPIRED', responded_at = ?
         WHERE organization_id = ? AND run_id IN (
           SELECT run_id FROM formula_intelligence_runs WHERE organization_id = ? AND project_id = ?
         ) AND status = 'PENDING'`,
      ).bind(timestamp, actor.organizationId, actor.organizationId, project.id),
    ])
    const runtime = new AgentRuntimeStore(this.db)
    await Promise.all((activeRuns.results ?? []).map((run) => runtime.append(run.id, actor.organizationId, 'run.cancelled', {
      status: 'CANCELLED', progress: run.progress, reason: 'design-project-archived',
    }).catch(() => undefined)))
    await auditFormulaIntelligence(this.db, actor, 'formula-intelligence.design.project.archive', project.id)
    return { projectId: project.id, status: 'ARCHIVED' as const, purgeAfter, duplicate: false }
  }

  async restoreDesignProject(actor: AgentActor, projectId: string) {
    const project = await this.projectForLifecycle(actor, projectId)
    if (project.status !== 'ARCHIVED') {
      throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_PROJECT_NOT_ARCHIVED')
    }
    const restoredStatus = project.archive_previous_status && project.archive_previous_status !== 'IN_PROGRESS'
      ? project.archive_previous_status
      : 'BRIEFED'
    const timestamp = now()
    await this.db.prepare(
      `UPDATE formula_design_projects
       SET status = ?, archived_at = NULL, archived_by_user_id = NULL, archive_previous_status = NULL, purge_after = NULL, updated_at = ?
       WHERE id = ? AND organization_id = ? AND status = 'ARCHIVED'`,
    ).bind(restoredStatus, timestamp, project.id, actor.organizationId).run()
    await auditFormulaIntelligence(this.db, actor, 'formula-intelligence.design.project.restore', project.id)
    return { projectId: project.id, status: restoredStatus, duplicate: false }
  }

  async designProjectForGeneration(actor: AgentActor, projectId: string) {
    const project = await this.db.prepare(
      `SELECT id, organization_id, brand_id, created_by_user_id, status, name, brief_json, current_brief_version_id, selected_direction_id, formula_type_hint, archived_at, archived_by_user_id, archive_previous_status, purge_after, created_at, updated_at
       FROM formula_design_projects WHERE id = ? AND organization_id = ?`,
    ).bind(projectId, actor.organizationId).first<ProjectRow>()
    if (!project) throw new NotFoundException('Design project was not found')
    if (project.status === 'ARCHIVED') throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_PROJECT_ARCHIVED')
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
    const version = await this.currentBriefVersion(project)
    if (version?.state === 'RAW' || version?.state === 'REVIEW_REQUIRED') {
      throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_REVIEWED_BRIEF_REQUIRED')
    }
    if (version?.state === 'REVIEWED') {
      const structured = structuredFormulaDesignBriefSchema.parse(parseJson(version.structured_brief_json ?? '{}', {}))
      const snapshot = await this.ensureConstraintSnapshot(actor, project, version, structured)
      return { project, brief: formulaDesignBriefFromStructuredBrief(project.name, structured), briefVersion: version, constraintSnapshot: snapshot }
    }
    return {
      project,
      brief: formulaDesignBriefSchema.parse(parseJson(project.brief_json, {})),
      briefVersion: version,
      constraintSnapshot: undefined,
    }
  }

  async briefVersions(actor: AgentActor, projectId: string, canViewPrivate: boolean) {
    const project = await this.projectForActor(actor, projectId)
    if (!canViewPrivate && project.created_by_user_id !== actor.userId) throw new NotFoundException('Design project was not found')
    const versions = await this.db.prepare(
      `SELECT id, organization_id, project_id, version_number, state, schema_version, raw_brief, structured_brief_json,
        unresolved_questions_json, compiler_mode, checksum, created_by_user_id, created_at
       FROM formula_design_brief_versions WHERE organization_id = ? AND project_id = ? ORDER BY version_number DESC`,
    ).bind(actor.organizationId, projectId).all<BriefVersionRow>()
    return { currentBriefVersionId: project.current_brief_version_id, versions: (versions.results ?? []).map((version) => this.briefVersionPayload(version)) }
  }

  async briefCompilerStatus(actor: AgentActor, projectId: string, canViewPrivate: boolean) {
    const project = await this.projectForActor(actor, projectId)
    if (!canViewPrivate && project.created_by_user_id !== actor.userId) throw new NotFoundException('Design project was not found')
    return {
      mode: 'MANUAL',
      status: 'NOT_CONFIGURED',
      message: 'AI brief compilation is not configured. Review the structured brief manually.',
    }
  }

  async saveBriefVersion(service: NorthStarService, actor: AgentActor, projectId: string, input: unknown, idempotencyKey: string) {
    const project = await this.projectForBriefEdit(actor, projectId)
    const validation = validateStructuredFormulaDesignBrief(input)
    assertFormulaDesignBriefMaterialConstraints(service, validation.brief)
    const priorVersion = await this.currentBriefVersion(project)
    const latest = await this.db.prepare(
      `SELECT MAX(version_number) AS version_number FROM formula_design_brief_versions WHERE organization_id = ? AND project_id = ?`,
    ).bind(actor.organizationId, project.id).first<{ version_number: number | null }>()
    const timestamp = now()
    const versionNumber = Number(latest?.version_number ?? 0) + 1
    const versionId = uuid()
    const scopedIdempotencyKey = `design-brief-version:${actor.userId}:${idempotencyKey.trim().slice(0, 160)}`
    const versionChecksum = await checksum({
      schemaVersion: validation.brief.schemaVersion,
      rawBrief: priorVersion?.raw_brief ?? '',
      structuredBrief: validation.brief,
      unresolvedQuestions: validation.unresolvedQuestions,
    })
    const legacyProjection = validation.state === 'REVIEWED'
      ? JSON.stringify(formulaDesignBriefFromStructuredBrief(project.name, validation.brief))
      : project.brief_json
    await this.db.batch([
      this.db.prepare(
        `INSERT INTO formula_design_brief_versions (
          id, organization_id, project_id, version_number, state, schema_version, raw_brief,
          structured_brief_json, unresolved_questions_json, compiler_mode, compiler_template_version,
          checksum, idempotency_key, created_by_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 'MANUAL', 'competitive-moat.v1', ?, ?, ?, ?)`,
      ).bind(versionId, actor.organizationId, project.id, versionNumber, validation.state, priorVersion?.raw_brief ?? '', JSON.stringify(validation.brief), JSON.stringify(validation.unresolvedQuestions), versionChecksum, scopedIdempotencyKey, actor.userId, timestamp),
      this.db.prepare(
        `UPDATE formula_design_projects SET current_brief_version_id = ?, brief_json = ?, formula_type_hint = ?, updated_at = ?
         WHERE id = ? AND organization_id = ?`,
      ).bind(versionId, legacyProjection, validation.brief.product.formulaType ?? project.formula_type_hint ?? null, timestamp, project.id, actor.organizationId),
    ])
    await auditFormulaIntelligence(this.db, actor, 'formula-intelligence.design.brief.version.create', `${project.id}:${versionId}`, validation.state === 'REVIEWED' ? 'allowed' : 'review')
    return this.briefVersionPayload({
      id: versionId, organization_id: actor.organizationId, project_id: project.id, version_number: versionNumber,
      state: validation.state, schema_version: 1, raw_brief: priorVersion?.raw_brief ?? '', structured_brief_json: JSON.stringify(validation.brief),
      unresolved_questions_json: JSON.stringify(validation.unresolvedQuestions), compiler_mode: 'MANUAL', checksum: versionChecksum,
      created_by_user_id: actor.userId, created_at: timestamp,
    })
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

  async createGenerationContext(actor: AgentActor, runId: string, input: { project: ProjectRow; briefVersion: BriefVersionRow; constraintSnapshot: ConstraintSnapshotRow }) {
    await this.db.prepare(
      `INSERT OR IGNORE INTO formula_design_generation_contexts (
        id, organization_id, project_id, run_id, brief_version_id, constraint_snapshot_id,
        material_universe_hash, created_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      uuid(), actor.organizationId, input.project.id, runId, input.briefVersion.id, input.constraintSnapshot.id,
      input.constraintSnapshot.material_universe_hash, actor.userId, now(),
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

  async persistDesignDirections(
    actor: AgentActor,
    projectId: string,
    runId: string,
    directions: DesignDirectionArtifact[],
    evaluationContext?: { constraintSnapshotId: string; evaluations: DesignCandidateEvaluation[] },
  ) {
    const project = await this.db.prepare(
      `SELECT status FROM formula_design_projects WHERE id = ? AND organization_id = ?`,
    ).bind(projectId, actor.organizationId).first<{ status: string }>()
    if (!project || project.status === 'ARCHIVED') throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_PROJECT_ARCHIVED')
    const timestamp = now()
    const statements = directions.map((direction, index) => this.db.prepare(
      `INSERT INTO formula_design_directions (id, organization_id, project_id, run_id, sequence, title, status, safe_summary_json, proposal_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)
       ON CONFLICT(project_id, sequence) DO UPDATE SET run_id = excluded.run_id, title = excluded.title, status = 'DRAFT', safe_summary_json = excluded.safe_summary_json, proposal_json = excluded.proposal_json, updated_at = excluded.updated_at`,
    ).bind(direction.directionId, actor.organizationId, projectId, runId, index + 1, direction.title, JSON.stringify(safeDirection(direction)), JSON.stringify(direction.proposal), timestamp, timestamp))
    const evaluationStatements = evaluationContext
      ? await Promise.all(evaluationContext.evaluations.map(async (evaluation) => this.db.prepare(
        `INSERT OR IGNORE INTO formula_design_direction_evaluations (
          id, organization_id, project_id, run_id, direction_id, constraint_snapshot_id,
          evaluation_version, evaluation_json, evaluation_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      ).bind(
        uuid(), actor.organizationId, projectId, runId, evaluation.directionId, evaluationContext.constraintSnapshotId,
        JSON.stringify(evaluation), await checksum(evaluation), timestamp,
      )))
      : []
    await this.db.batch([
      ...statements,
      ...evaluationStatements,
      this.db.prepare(`UPDATE formula_design_projects SET status = 'IN_REVIEW', updated_at = ? WHERE id = ? AND organization_id = ?`)
        .bind(timestamp, projectId, actor.organizationId),
    ])
  }

  async returnUnresolvedProjectToBrief(actor: AgentActor, projectId: string) {
    const direction = await this.db.prepare(
      `SELECT id FROM formula_design_directions
       WHERE organization_id = ? AND project_id = ? LIMIT 1`,
    ).bind(actor.organizationId, projectId).first<{ id: string }>()
    if (direction) return
    await this.db.prepare(
      `UPDATE formula_design_projects
       SET status = 'BRIEFED', updated_at = ?
       WHERE id = ? AND organization_id = ? AND status = 'IN_PROGRESS'`,
    ).bind(now(), projectId, actor.organizationId).run()
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

  async createTrialFromDesignDirection(
    actor: AgentActor,
    projectId: string,
    directionId: string,
    body: unknown,
    service: NorthStarService,
  ) {
    await this.projectForActor(actor, projectId)
    const direction = await this.directionForProject(actor, projectId, directionId, true)
    if (!(await this.isDirectionProducer(actor, direction))) throw new ForbiddenException('Only the perfumer who generated a direction can plan its trial')
    if (!direction.saved_formula_id || direction.status !== 'SAVED') {
      throw new UnprocessableEntityException('Save this direction as a formula draft before planning a trial')
    }

    const [context, evaluation] = await Promise.all([
      this.db.prepare(
        `SELECT brief_version_id, constraint_snapshot_id, material_universe_hash
         FROM formula_design_generation_contexts
         WHERE organization_id = ? AND project_id = ? AND run_id = ?
         ORDER BY created_at DESC LIMIT 1`,
      ).bind(actor.organizationId, projectId, direction.run_id).first<GenerationContextLinkRow>(),
      this.db.prepare(
        `SELECT constraint_snapshot_id, evaluation_json, evaluation_hash
         FROM formula_design_direction_evaluations
         WHERE organization_id = ? AND project_id = ? AND run_id = ? AND direction_id = ?
         ORDER BY evaluation_version DESC LIMIT 1`,
      ).bind(actor.organizationId, projectId, direction.run_id, directionId).first<DirectionEvaluationLinkRow>(),
    ])
    const parsedEvaluation = evaluation && designCandidateEvaluationSchema.safeParse(parseJson(evaluation.evaluation_json, {}))
    if (!context || !evaluation || !parsedEvaluation?.success || evaluation.constraint_snapshot_id !== context.constraint_snapshot_id || parsedEvaluation.data.materialUniverse.hash !== context.material_universe_hash) {
      throw new UnprocessableEntityException('FORMULA_INTELLIGENCE_CANDIDATE_LINEAGE_REQUIRED')
    }
    if (parsedEvaluation.data.constraints.state === 'BLOCKED') {
      throw new UnprocessableEntityException('A blocked direction cannot be planned as a trial')
    }

    const existing = await this.db.prepare(
      `SELECT id FROM fragrance_trials
       WHERE organization_id = ? AND json_extract(record_json, '$.formulaIntelligenceSource.directionId') = ?
       ORDER BY created_at DESC LIMIT 1`,
    ).bind(actor.organizationId, directionId).first<{ id: string }>()
    if (existing) {
      return { trial: service.trialDetail(existing.id).data.trial, duplicate: true, invariant: 'a design direction maps to one planned trial and never reserves or consumes inventory' }
    }

    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
    const source: FormulaIntelligenceTrialSource = {
      kind: 'DESIGN_DIRECTION',
      projectId,
      directionId,
      runId: direction.run_id,
      briefVersionId: context.brief_version_id,
      constraintSnapshotId: context.constraint_snapshot_id,
      materialUniverseHash: context.material_universe_hash,
      evaluationHash: evaluation.evaluation_hash,
    }
    const result = service.createTrialFromFormulaIntelligenceCandidate({
      formulaId: direction.saved_formula_id,
      ...(typeof input.title === 'string' ? { title: input.title } : {}),
      ...(typeof input.sampleCode === 'string' ? { sampleCode: input.sampleCode } : {}),
    }, source)
    return { ...result.data, duplicate: false, invariant: 'a direction trial preserves immutable candidate lineage and creates no reservation or inventory movement' }
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
    const isAccordAwaitingFinalUse = proposal.formulaType === 'ACCORD' && proposal.requiresFinalProductContext
    if (preview.compliance.blockedMaterialIds.length > 0 || (!isAccordAwaitingFinalUse && (preview.compliance.status === 'BLOCKED' || preview.ifra.blockerCount > 0))) {
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

  private async projectForBriefEdit(actor: AgentActor, projectId: string) {
    const project = await this.db.prepare(
      `SELECT id, organization_id, brand_id, created_by_user_id, status, name, brief_json, current_brief_version_id, selected_direction_id, created_at, updated_at
       FROM formula_design_projects WHERE id = ? AND organization_id = ?`,
    ).bind(projectId, actor.organizationId).first<ProjectRow>()
    if (!project) throw new NotFoundException('Design project was not found')
    const brandIds = await this.activeBrandIds(actor)
    const canEdit = project.created_by_user_id === actor.userId || (
      project.status === 'BRIEFED' && Boolean(project.brand_id) && brandIds.includes(project.brand_id!)
    )
    if (!canEdit) throw new NotFoundException('Design project was not found')
    return project
  }

  private async currentBriefVersion(project: ProjectRow) {
    if (!project.current_brief_version_id) return undefined
    return this.db.prepare(
      `SELECT id, organization_id, project_id, version_number, state, schema_version, raw_brief, structured_brief_json,
        unresolved_questions_json, compiler_mode, checksum, created_by_user_id, created_at
       FROM formula_design_brief_versions WHERE id = ? AND organization_id = ? AND project_id = ?`,
    ).bind(project.current_brief_version_id, project.organization_id, project.id).first<BriefVersionRow>()
  }

  private async ensureConstraintSnapshot(
    actor: AgentActor,
    project: ProjectRow,
    version: BriefVersionRow,
    structured: ReturnType<typeof structuredFormulaDesignBriefSchema.parse>,
  ) {
    const existing = await this.db.prepare(
      `SELECT id, organization_id, project_id, brief_version_id, snapshot_json, constraints_hash, material_universe_hash,
        material_universe_state, created_by_user_id, created_at
       FROM formula_design_constraint_snapshots WHERE organization_id = ? AND brief_version_id = ?`,
    ).bind(actor.organizationId, version.id).first<ConstraintSnapshotRow>()
    if (existing) return existing
    const timestamp = now()
    const snapshotJson = JSON.stringify({ schemaVersion: 1, product: structured.product, constraints: structured.constraints })
    const constraintsHash = await checksum({ product: structured.product, constraints: structured.constraints })
    const candidate: ConstraintSnapshotRow = {
      id: uuid(), organization_id: actor.organizationId, project_id: project.id, brief_version_id: version.id,
      snapshot_json: snapshotJson, constraints_hash: constraintsHash, material_universe_hash: null,
      material_universe_state: 'NOT_EVALUATED', created_by_user_id: actor.userId, created_at: timestamp,
    }
    await this.db.prepare(
      `INSERT OR IGNORE INTO formula_design_constraint_snapshots (
        id, organization_id, project_id, brief_version_id, snapshot_json, constraints_hash,
        material_universe_hash, material_universe_state, created_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'NOT_EVALUATED', ?, ?)`,
    ).bind(candidate.id, candidate.organization_id, candidate.project_id, candidate.brief_version_id, candidate.snapshot_json, candidate.constraints_hash, candidate.created_by_user_id, candidate.created_at).run()
    return (await this.db.prepare(
      `SELECT id, organization_id, project_id, brief_version_id, snapshot_json, constraints_hash, material_universe_hash,
        material_universe_state, created_by_user_id, created_at
       FROM formula_design_constraint_snapshots WHERE organization_id = ? AND brief_version_id = ?`,
    ).bind(actor.organizationId, version.id).first<ConstraintSnapshotRow>()) ?? candidate
  }

  async pinMaterialUniverse(
    actor: AgentActor,
    runId: string,
    constraintSnapshotId: string,
    materials: Array<Material & { availabilityRank?: number }>,
  ) {
    const snapshot = await this.db.prepare(
      `SELECT id, organization_id, project_id, brief_version_id, snapshot_json, constraints_hash, material_universe_hash,
        material_universe_state, created_by_user_id, created_at
       FROM formula_design_constraint_snapshots
       WHERE id = ? AND organization_id = ?`,
    ).bind(constraintSnapshotId, actor.organizationId).first<ConstraintSnapshotRow>()
    if (!snapshot) throw new NotFoundException('Design constraint snapshot was not found')
    const universe = materials
      .map((material) => ({
        id: material.id,
        family: material.family,
        tier: material.tier,
        availabilityRank: Number((material.availabilityRank ?? 0).toFixed(4)),
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
    const materialUniverseHash = await checksum(universe)
    if (snapshot.material_universe_state === 'PINNED') {
      if (snapshot.material_universe_hash !== materialUniverseHash) {
        throw new ConflictException('Design material universe was already pinned for this reviewed brief')
      }
      await this.db.prepare(
        `UPDATE formula_design_generation_contexts
         SET material_universe_hash = ?
         WHERE organization_id = ? AND run_id = ? AND constraint_snapshot_id = ?`,
      ).bind(materialUniverseHash, actor.organizationId, runId, snapshot.id).run()
      return snapshot
    }
    const existingPayload = parseJson<Record<string, unknown>>(snapshot.snapshot_json, {})
    await this.db.prepare(
      `UPDATE formula_design_constraint_snapshots
       SET snapshot_json = ?, material_universe_hash = ?, material_universe_state = 'PINNED'
       WHERE id = ? AND organization_id = ? AND material_universe_state = 'NOT_EVALUATED'`,
    ).bind(
      JSON.stringify({ ...existingPayload, materialUniverse: { schemaVersion: 1, materials: universe } }),
      materialUniverseHash,
      snapshot.id,
      actor.organizationId,
    ).run()
    const pinned = await this.db.prepare(
      `SELECT id, organization_id, project_id, brief_version_id, snapshot_json, constraints_hash, material_universe_hash,
        material_universe_state, created_by_user_id, created_at
       FROM formula_design_constraint_snapshots
       WHERE id = ? AND organization_id = ?`,
    ).bind(snapshot.id, actor.organizationId).first<ConstraintSnapshotRow>()
    if (!pinned || pinned.material_universe_state !== 'PINNED' || pinned.material_universe_hash !== materialUniverseHash) {
      throw new ConflictException('Design material universe could not be pinned safely')
    }
    await this.db.prepare(
      `UPDATE formula_design_generation_contexts
       SET material_universe_hash = ?
       WHERE organization_id = ? AND run_id = ? AND constraint_snapshot_id = ?`,
    ).bind(materialUniverseHash, actor.organizationId, runId, snapshot.id).run()
    return pinned
  }

  private briefVersionPayload(version: BriefVersionRow) {
    const parsed = version.structured_brief_json
      ? structuredFormulaDesignBriefSchema.safeParse(parseJson(version.structured_brief_json, {}))
      : undefined
    return {
      id: version.id,
      versionNumber: version.version_number,
      state: version.state,
      schemaVersion: version.schema_version,
      rawBrief: version.raw_brief,
      structuredBrief: parsed?.success ? parsed.data : undefined,
      unresolvedQuestions: parseJson(version.unresolved_questions_json, [] as Array<{ field: string; reason: string; importance: 'LOW' | 'MEDIUM' | 'HIGH' }>),
      compilerMode: version.compiler_mode,
      checksum: version.checksum,
      createdAt: version.created_at,
    }
  }

  private async projectForLifecycle(actor: AgentActor, projectId: string) {
    const project = await this.db.prepare(
      `SELECT id, organization_id, brand_id, created_by_user_id, status, name, brief_json, current_brief_version_id, selected_direction_id, formula_type_hint, archived_at, archived_by_user_id, archive_previous_status, purge_after, created_at, updated_at
       FROM formula_design_projects WHERE id = ? AND organization_id = ?`,
    ).bind(projectId, actor.organizationId).first<ProjectRow>()
    if (!project) throw new NotFoundException('Design project was not found')
    if (project.created_by_user_id !== actor.userId && !isWorkspaceOwnerOrAdmin(actor.role)) {
      throw new ForbiddenException('Only the brief creator or a workspace Owner/Admin can archive this project')
    }
    return project
  }

  private async projectForActor(actor: AgentActor, projectId: string, includeArchived = false) {
    const project = await this.db.prepare(
      `SELECT id, organization_id, brand_id, created_by_user_id, status, name, brief_json, current_brief_version_id, selected_direction_id, formula_type_hint, archived_at, archived_by_user_id, archive_previous_status, purge_after, created_at, updated_at
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
    if (!includeArchived && project.status === 'ARCHIVED') throw new NotFoundException('Design project was not found')
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
    const canViewBriefDetails = canViewPrivate || project.created_by_user_id === actor.userId
    const currentBriefVersion = canViewBriefDetails ? await this.currentBriefVersion(project) : undefined
    const legacyBrief = formulaDesignBriefSchema.safeParse(parseJson(project.brief_json, {}))
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
      const evaluationRow = privateDirection
        ? await this.db.prepare(
          `SELECT evaluation_json FROM formula_design_direction_evaluations
           WHERE organization_id = ? AND direction_id = ?
           ORDER BY evaluation_version DESC LIMIT 1`,
        ).bind(actor.organizationId, direction.id).first<{ evaluation_json: string }>()
        : undefined
      const evaluation = evaluationRow
        ? designCandidateEvaluationSchema.safeParse(parseJson(evaluationRow.evaluation_json, {}))
        : undefined
      const trial = privateDirection && direction.saved_formula_id
        ? await this.db.prepare(
          `SELECT id FROM fragrance_trials
           WHERE organization_id = ? AND json_extract(record_json, '$.formulaIntelligenceSource.directionId') = ?
           ORDER BY created_at DESC LIMIT 1`,
        ).bind(actor.organizationId, direction.id).first<{ id: string }>()
        : undefined
      return {
        ...visible,
        status: direction.status,
        sharedAt: share?.shared_at ?? direction.shared_at,
        savedFormulaId: privateDirection ? direction.saved_formula_id : undefined,
        trialId: privateDirection ? trial?.id : undefined,
        ...(evaluation?.success ? { evaluation: evaluation.data } : {}),
        ...(shares ? { shares: (shares.results ?? []).map((item) => ({ recipientUserId: item.recipient_user_id, allowMaterialNames: Boolean(item.allow_material_names), sharedAt: item.shared_at })) } : {}),
      }
    }))
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      createdByUserId: project.created_by_user_id,
      selectedDirectionId: project.selected_direction_id,
      formulaTypeHint: project.formula_type_hint ?? undefined,
      ...(project.status === 'ARCHIVED' ? { archivedAt: project.archived_at ?? undefined, purgeAfter: project.purge_after ?? undefined } : {}),
      ...(legacyBrief.success && canViewBriefDetails ? { brief: legacyBrief.data } : {}),
      currentBriefVersionId: project.current_brief_version_id,
      briefVersion: currentBriefVersion ? this.briefVersionPayload(currentBriefVersion) : undefined,
      briefStatus: currentBriefVersion?.state ?? 'LEGACY_UNSTRUCTURED',
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
  const preserved = [...new Set([...request.lockedMaterialIds, ...(request.objectives?.preserveMaterialIds ?? [])])]
  if (preserved.some((materialId) => !candidateMaterialIds.has(materialId))) {
    throw new UnprocessableEntityException('Candidate does not preserve all locked materials')
  }
  if ((request.objectives?.prohibitedMaterialIds ?? []).some((materialId) => candidateMaterialIds.has(materialId))) {
    throw new UnprocessableEntityException('Candidate contains a prohibited material')
  }
  const preview = service.previewFormulaIntelligence(proposal).data
  if (preview.compliance.status !== 'APPROVED' || preview.ifra.blockerCount > 0) {
    throw new UnprocessableEntityException('Only a compliance-passing candidate can be saved as a formula draft')
  }
  const versions = service.formulaVersions(request.baselineFormulaId).data
  const baseline = versions.versions.find((version) => version.version === request.baselineVersion)
  const formula = versions.formula
  if (!baseline) throw new UnprocessableEntityException('The immutable optimizer baseline is no longer available')
  const baselineLines = optimizerBaselineLines(baseline)
  if (baselineLines.length === 0) throw new UnprocessableEntityException('Optimizer baseline cannot be resolved to raw materials')
  const baselineProposal = proposalFromFormulaVersion(formula, baselineLines)
  if (compositionChangePercent(baselineProposal, proposal) < 0.005) {
    throw new UnprocessableEntityException('Candidate matches the immutable baseline and cannot create a duplicate draft')
  }
  const baselinePercentages = new Map(baselineProposal.ingredients.map((ingredient) => [ingredient.materialId, ingredient.percentage]))
  const candidatePercentages = new Map(proposal.ingredients.map((ingredient) => [ingredient.materialId, ingredient.percentage]))
  if (request.lockedMaterialIds.some((materialId) => Math.abs((candidatePercentages.get(materialId) ?? -1) - (baselinePercentages.get(materialId) ?? -2)) > 0.005)) {
    throw new UnprocessableEntityException('Candidate changes a material percentage that was locked by the optimizer request')
  }
  if ((request.objectives?.targetCostReductionPercent !== undefined || request.objectives?.maxTotalCost !== undefined) && (!preview.cost || !baseline)) {
    throw new UnprocessableEntityException('Cost evidence is required before this constrained candidate can be saved')
  }
  if (preview.cost && baseline) {
    const baselinePreview = service.previewFormulaIntelligence(baselineProposal).data
    const baselineCost = baselinePreview.cost?.totalCost
    if ((request.objectives?.targetCostReductionPercent ?? 0) > 0 && (!baselineCost || ((baselineCost - preview.cost.totalCost) / baselineCost) * 100 + 0.0001 < request.objectives!.targetCostReductionPercent!)) {
      throw new UnprocessableEntityException('Candidate does not meet the requested cost reduction target')
    }
    if (request.objectives?.maxTotalCost !== undefined && preview.cost.totalCost - request.objectives.maxTotalCost > 0.0001) {
      throw new UnprocessableEntityException('Candidate exceeds the maximum total cost objective')
    }
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
  const failure = error instanceof ForbiddenException
    ? { code: 'FORMULA_INTELLIGENCE_AUTHORIZATION_CHANGED', message: 'Formula Intelligence authorization changed during execution', retryable: false }
    : toSafeAgentRuntimeError(error)
  const timestamp = now()
  await store.assertExecutionLease(run.id, run.organization_id)
  await store.database.batch([
    store.database.prepare(`UPDATE agent_runs SET status = 'FAILED', error_summary = ?, completed_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ?`)
      .bind(failure.message, timestamp, timestamp, run.id, run.organization_id),
    store.database.prepare(`UPDATE agent_jobs SET status = 'FAILED', last_error = ?, lease_token = NULL, lease_expires_at = NULL, updated_at = ? WHERE run_id = ? AND organization_id = ?`)
      .bind(failure.code, timestamp, run.id, run.organization_id),
  ])
  await store.append(run.id, run.organization_id, 'run.failed', { status: 'FAILED', error: failure.message, errorInfo: failure })
}

/**
 * Retention is deliberately conservative: only archived briefs with no
 * generated run or direction can be deleted. Anything that could support a
 * formula, trial, or audit investigation remains archived rather than being
 * destroyed by a scheduled job.
 */
export async function purgeExpiredArchivedDesignProjects(db: D1Database) {
  const cutoff = now()
  return db.prepare(
    `DELETE FROM formula_design_projects
     WHERE status = 'ARCHIVED' AND purge_after IS NOT NULL AND purge_after <= ?
       AND NOT EXISTS (
         SELECT 1 FROM formula_design_directions d
         WHERE d.organization_id = formula_design_projects.organization_id
           AND d.project_id = formula_design_projects.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM formula_intelligence_runs r
         WHERE r.organization_id = formula_design_projects.organization_id
           AND r.project_id = formula_design_projects.id
       )`,
  ).bind(cutoff).run()
}

export function formulaIntelligenceMaterialCatalog(service: NorthStarService) {
  const workspaceMaterials = service.materials().data
  const researchMaterials = workspaceMaterials.filter((material) => material.catalogueSource?.status === 'SOURCE_ONLY')
  const catalog = workspaceMaterials
    .filter((material) => material.catalogueSource?.status !== 'SOURCE_ONLY')
    .map((material) => ({ material, profile: service.materialCompliance(material.id).data }))
  const approved = catalog.filter(({ profile }) => profile?.status === 'APPROVED').map(({ material }) => material)
  return {
    materials: approved,
    researchMaterials,
    reviewedOnly: true as const,
    sourceReferenceCount: researchMaterials.length,
    workspaceMaterialCount: workspaceMaterials.length,
  }
}

export function assertFormulaDesignBriefMaterialConstraints(
  service: NorthStarService,
  structured: ReturnType<typeof structuredFormulaDesignBriefSchema.parse>,
) {
  const required = [...new Set(structured.constraints.requiredMaterialIds)]
  const prohibited = [...new Set(structured.constraints.prohibitedMaterialIds)]
  const overlap = required.filter((materialId) => prohibited.includes(materialId))
  if (overlap.length) throw new UnprocessableEntityException('A material cannot be both required and prohibited in the same brief')

  const workspaceMaterialIds = new Set(service.materials().data.map((material) => material.id))
  const outsideWorkspace = [...new Set([...required, ...prohibited])].filter((materialId) => !workspaceMaterialIds.has(materialId))
  if (outsideWorkspace.length) throw new UnprocessableEntityException('Design brief material constraints must reference Materials in this workspace')

  const reviewedMaterialIds = new Set(formulaIntelligenceMaterialCatalog(service).materials.map((material) => material.id))
  const notReviewed = required.filter((materialId) => !reviewedMaterialIds.has(materialId))
  if (notReviewed.length) {
    throw new UnprocessableEntityException('Required materials must be reviewed and approved in Materials before direction generation')
  }
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

async function runDesignStudio(
  store: AgentRuntimeStore,
  service: NorthStarService,
  actor: AgentActor,
  run: AgentRunRow,
  config: Extract<FormulaIntelligenceRunConfig, { workflowKind: 'DESIGN_STUDIO' }>,
  materialEvidence: MaterialEvidenceRag | undefined,
  modelProvider: AgentModelProvider,
) {
  const intelligence = new FormulaIntelligenceStore(store.database)
  const analyzeId = await store.createNode(run, 'analyze_brief', { brief: config.brief.creativeBrief })
  await store.startNode(run, analyzeId, 'analyze_brief')
  const researchPlan = await modelProvider.researchPlan({ brief: config.brief.creativeBrief, tools: agentFunctionTools })
  await store.completeNode(run, analyzeId, 'analyze_brief', {
    designProjectId: config.projectId,
    availabilityFirst: config.brief.availabilityFirst,
    provider: modelProvider.kind,
    model: modelProvider.model,
    summary: researchPlan.summary,
  }, 12)
  const searchId = await store.createNode(run, 'search_materials', { brief: config.brief.creativeBrief })
  await store.startNode(run, searchId, 'search_materials')
  const materialCatalog = formulaIntelligenceMaterialCatalog(service)
  const materials = availabilityRankedMaterials(service, materialCatalog.materials)
  if (!materials.length) throw new UnprocessableEntityException('No eligible workspace materials are available for this design brief')
  const masterReferences = rankLluchCatalogueGlobalMasterMaterials(
    [researchPlan.searchQuery, ...researchPlan.focusNotes].join(' '),
    8,
  ).filter((material) => materialCatalog.researchMaterials.some((candidate) => candidate.id === material.id))
  const evidenceMaterialIds = [...new Set([
    ...masterReferences.map((material) => material.id),
    ...materials.map((material) => material.id),
  ])].slice(0, 12)
  const constraintSnapshot = config.constraintSnapshotId && config.briefVersionId
    ? await intelligence.pinMaterialUniverse(actor, run.id, config.constraintSnapshotId, materials)
    : undefined
  await recordTool(store, run, searchId, 'search_materials', { query: researchPlan.searchQuery }, {
    approvedMaterialIds: materials.slice(0, 12).map((material) => material.id),
    masterReferenceIds: masterReferences.map((material) => material.id),
  })
  const granted = new Set(service.me().data.permissions)
  const evidence = materialEvidence && service.formulaIntelligenceFeatureEnabled('formulaIntelligenceRag') && granted.has('documents.view') && granted.has('materials.view')
    ? await materialEvidence.retrieve({ organizationId: actor.organizationId, userId: actor.userId, permissions: [...granted] }, { query: researchPlan.searchQuery, materialIds: evidenceMaterialIds, topK: 6 })
    : { state: 'NOT_EVALUATED' as const, citations: [], indexedSourceCount: 0 }
  if (materialEvidence && service.formulaIntelligenceFeatureEnabled('formulaIntelligenceRag') && granted.has('documents.view') && granted.has('materials.view')) {
    await recordTool(store, run, searchId, 'retrieve_material_evidence', { query: researchPlan.searchQuery, materialIds: evidenceMaterialIds }, { state: evidence.state, citationCount: evidence.citations.length })
  }
  await store.completeNode(run, searchId, 'search_materials', {
    materialCount: materials.length,
    masterReferenceCount: masterReferences.length,
    evidenceState: evidence.state,
  }, 28)
  const sensoryMemory = service.formulaIntelligenceFeatureEnabled('designStudioSensoryMemory') && granted.has('trials.view')
    ? service.workspaceSensoryMemory().data
    : undefined
  const proposals = buildDesignDirectionProposals(config.brief, materials, researchPlan.focusNotes)
    .map((proposal) => ({
      ...proposal,
      historicalEvidence: sensoryMemory
        ? sensoryMemoryEvidenceForDirection(proposal, sensoryMemory.profile, sensoryMemory.enabled)
        : { state: 'NOT_EVALUATED' as const, evidenceCount: 0, adjustment: 0, explanation: 'Private sensory evidence is not available to this role.' },
    }))
    .sort((left, right) => right.historicalEvidence.adjustment - left.historicalEvidence.adjustment || left.title.localeCompare(right.title))
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
  const directions: DesignDirectionArtifact[] = proposals.map((direction, index) => {
    const requiresFinalUseReview = direction.proposal.formulaType === 'ACCORD' && direction.proposal.requiresFinalProductContext
    return {
      directionId: uuid(),
      title: direction.title,
      narrative: direction.narrative,
      pyramidSummary: direction.pyramidSummary,
      availability: availabilityStatus(previews[index]!),
      complianceStatus: requiresFinalUseReview ? 'REVIEW_REQUIRED' : complianceStatus(previews[index]!),
      proposal: direction.proposal,
      warnings: [
        ...(requiresFinalUseReview ? ['Final-product concentration and IFRA use context are required before review.'] : []),
        ...candidateWarnings(previews[index]!),
      ].slice(0, 20),
      historicalEvidence: direction.historicalEvidence,
    }
  })
  const evaluations = constraintSnapshot?.material_universe_hash
    ? await evaluateDesignCandidates(directions, previews, config.brief, constraintSnapshot.material_universe_hash, materials.length)
    : []
  const resultId = await store.createNode(run, 'prepare_result', { projectId: config.projectId })
  await store.startNode(run, resultId, 'prepare_result')
  await store.createArtifact(run, { type: 'design_directions', version: 1, data: { projectId: config.projectId, directions } })
  if (constraintSnapshot?.material_universe_hash && config.briefVersionId) {
    await store.createArtifact(run, {
      type: 'design_candidate_comparison',
      version: 1,
      data: {
        projectId: config.projectId,
        briefVersionId: config.briefVersionId,
        constraintSnapshotId: constraintSnapshot.id,
        materialUniverseHash: constraintSnapshot.material_universe_hash,
        candidates: evaluations,
      },
    })
  }
  await store.createArtifact(run, { type: 'evidence_citations', version: 1, data: { state: evidence.state, citations: evidence.citations } })
  await store.assertExecutionLease(run.id, run.organization_id)
  await intelligence.persistDesignDirections(
    actor,
    config.projectId,
    run.id,
    directions,
    constraintSnapshot && evaluations.length ? { constraintSnapshotId: constraintSnapshot.id, evaluations } : undefined,
  )
  await store.completeNode(run, resultId, 'prepare_result', { artifactCount: constraintSnapshot ? 3 : 2, directionCount: directions.length }, 94)
  await store.createAssistantMessage(run, modelProvider.kind === 'workers_ai'
    ? `Cloudflare Workers AI interpreted the creative brief and searched ${masterReferences.length} global master references with governed evidence retrieval. Three directions were calculated only from reviewed workspace materials, inventory visibility, and compliance gates.`
    : `I reviewed ${masterReferences.length} global master references as evidence and prepared three deterministic directions from reviewed workspace materials. A perfumer can share a direction for brand review or explicitly save one as a draft.`)
}

async function runOptimizer(
  store: AgentRuntimeStore,
  service: NorthStarService,
  actor: AgentActor,
  run: AgentRunRow,
  config: Extract<FormulaIntelligenceRunConfig, { workflowKind: 'REFORMULATION_OPTIMIZER' }>,
  materialEvidence: MaterialEvidenceRag | undefined,
  modelProvider: AgentModelProvider,
) {
  const intelligence = new FormulaIntelligenceStore(store.database)
  const { request } = config
  const versions = service.formulaVersions(request.baselineFormulaId).data
  const baseline = versions.versions.find((version) => version.version === request.baselineVersion)
  if (!baseline) throw new UnprocessableEntityException('Select an immutable baseline formula version before optimizing')
  const analyzeId = await store.createNode(run, 'analyze_brief', { baselineFormulaId: request.baselineFormulaId, baselineVersion: request.baselineVersion })
  await store.startNode(run, analyzeId, 'analyze_brief')
  const researchPlan = await modelProvider.researchPlan({
    brief: `Reformulate ${versions.formula.name}. Intent: ${request.intent}. Preserve locked materials and deterministic compliance gates.`,
    tools: agentFunctionTools,
  })
  await store.completeNode(run, analyzeId, 'analyze_brief', {
    intent: request.intent,
    lockedMaterialIds: request.lockedMaterialIds,
    provider: modelProvider.kind,
    model: modelProvider.model,
    summary: researchPlan.summary,
  }, 12)
  const baselineLines = optimizerBaselineLines(baseline)
  if (baselineLines.length === 0) throw new UnprocessableEntityException('Optimizer requires an immutable baseline version that resolves to raw materials')
  const materialIdSet = new Set(baselineLines.map((line) => line.materialId).filter((id): id is string => Boolean(id)))
  const baselineProposal = proposalFromFormulaVersion(versions.formula, baselineLines)
  if (!baselineProposal.ingredients.length) throw new UnprocessableEntityException('Baseline version has no material composition to optimize')
  const searchId = await store.createNode(run, 'search_materials', { baselineFormulaId: request.baselineFormulaId })
  await store.startNode(run, searchId, 'search_materials')
  const materials = availabilityRankedMaterials(service, formulaIntelligenceMaterialCatalog(service).materials)
  await recordTool(store, run, searchId, 'search_materials', { baselineMaterialIds: [...materialIdSet] }, { candidateMaterialIds: materials.slice(0, 24).map((material) => material.id) })
  const granted = new Set(service.me().data.permissions)
  const evidenceMaterialIds = [...new Set([...materialIdSet, ...materials.slice(0, 12).map((material) => material.id)])].slice(0, 12)
  const evidence = materialEvidence && service.formulaIntelligenceFeatureEnabled('formulaIntelligenceRag') && granted.has('documents.view') && granted.has('materials.view')
    ? await materialEvidence.retrieve({ organizationId: actor.organizationId, userId: actor.userId, permissions: [...granted] }, { query: researchPlan.searchQuery, materialIds: evidenceMaterialIds, topK: 6 })
    : { state: 'NOT_EVALUATED' as const, citations: [], indexedSourceCount: 0 }
  if (materialEvidence && service.formulaIntelligenceFeatureEnabled('formulaIntelligenceRag') && granted.has('documents.view') && granted.has('materials.view')) {
    await recordTool(store, run, searchId, 'retrieve_material_evidence', { query: researchPlan.searchQuery, materialIds: evidenceMaterialIds }, { state: evidence.state, citationCount: evidence.citations.length })
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
  const substitutions = service.approvedMaterialSubstitutions().data
  const proposals = buildOptimizerProposals(baselineProposal, materials, request.intent, request.lockedMaterialIds, availableMaterialIds, request.objectives, substitutions)
  if (proposals.length === 0) {
    throw new UnprocessableEntityException('No optimizer candidate satisfies the locked, prohibited, and approved-substitution constraints')
  }
  const generateId = await store.createNode(run, 'generate_formula', { baselineFormulaId: request.baselineFormulaId })
  await store.startNode(run, generateId, 'generate_formula')
  await store.completeNode(run, generateId, 'generate_formula', { candidateCount: proposals.length }, 58)
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
  const costId = await store.createNode(run, 'calculate_cost', { baselineFormulaId: request.baselineFormulaId })
  await store.startNode(run, costId, 'calculate_cost')
  await recordTool(store, run, costId, 'calculate_formula_cost', { candidateCount: proposals.length }, { visibility: hasCostAccess(service) ? 'full' : 'redacted' })
  await store.completeNode(run, costId, 'calculate_cost', { visibility: hasCostAccess(service) ? 'full' : 'redacted' }, 70)
  const complianceId = await store.createNode(run, 'validate_compliance', { baselineFormulaId: request.baselineFormulaId })
  await store.startNode(run, complianceId, 'validate_compliance')
  await recordTool(store, run, complianceId, 'validate_compliance', { candidateCount: proposals.length }, { statuses: previews.map((preview) => preview.compliance.status) })
  await store.completeNode(run, complianceId, 'validate_compliance', { statuses: previews.map((preview) => preview.compliance.status) }, 80)
  const baseCandidates: OptimizerCandidateArtifact[] = qualifiedProposals.map((candidate, index) => {
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
  })
  const optimizerInputs = baseCandidates.map((candidate) => ({
    complianceStatus: candidate.complianceStatus,
    availability: candidate.availability,
    costDelta: candidate.costDelta,
    compositionChangePercent: candidate.compositionChangePercent,
    inventoryEvaluated: hasInventoryAccess(service),
  }))
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
  await store.createAssistantMessage(run, modelProvider.kind === 'workers_ai'
    ? 'Cloudflare Workers AI analyzed the reformulation intent and requested governed evidence. Candidate construction and ranking remain deterministic: compliance, eligible inventory, visible cost, then minimum change from the immutable baseline.'
    : 'I ranked deterministic reformulation candidates by compliance feasibility, eligible inventory, cost evidence when permitted, and minimum composition change. Select a candidate before saving a normal editable draft.')
}

export async function executeFormulaIntelligenceRun(
  store: AgentRuntimeStore,
  service: NorthStarService,
  actor: AgentActor,
  runId: string,
  materialEvidence?: MaterialEvidenceRag,
  modelProvider: AgentModelProvider = new DeterministicMockFormulaProvider(),
) {
  const intelligence = new FormulaIntelligenceStore(store.database)
  const { config } = await intelligence.configForRun(actor, runId)
  const run = await beginRun(store, actor, runId)
  if (!run) return
  try {
    requirePermission(service, 'formulas.viewSensitive')
    requirePermission(service, 'materials.view')
    if (config.workflowKind === 'DESIGN_STUDIO') await runDesignStudio(store, service, actor, run, config, materialEvidence, modelProvider)
    else await runOptimizer(store, service, actor, run, config, materialEvidence, modelProvider)
    await completeRun(store, run)
    await auditFormulaIntelligence(store.database, actor, `formula-intelligence.${config.workflowKind.toLowerCase()}.complete`, run.id)
  } catch (error) {
    await failRun(store, run, error)
    if (config.workflowKind === 'DESIGN_STUDIO') {
      await intelligence.returnUnresolvedProjectToBrief(actor, config.projectId)
    }
    await auditFormulaIntelligence(store.database, actor, `formula-intelligence.${config.workflowKind.toLowerCase()}.failed`, run.id, 'review')
  }
}

export async function createDesignProjectRun(
  db: D1Database,
  service: NorthStarService,
  actor: AgentActor,
  projectId: string,
  idempotencyKey: string,
  provider: { provider: string; model: string } = { provider: 'mock', model: 'deterministic-v1' },
) {
  requirePermission(service, 'formulas.edit')
  requireFormulaIntelligenceFeature(service, 'designStudioCandidateGeneration')
  const intelligence = new FormulaIntelligenceStore(db)
  const generation = await intelligence.designProjectForGeneration(actor, projectId)
  if (generation.briefVersion?.state === 'REVIEWED') {
    const structured = structuredFormulaDesignBriefSchema.parse(parseJson(generation.briefVersion.structured_brief_json ?? '{}', {}))
    assertFormulaDesignBriefMaterialConstraints(service, structured)
  }
  await intelligence.assertRunStartAllowed(actor, projectId)
  const store = new AgentRuntimeStore(db)
  const brief = generation.brief
  const result = await store.create(actor, { brief: brief.creativeBrief }, provider)
  const config = formulaIntelligenceRunConfigSchema.parse({
    workflowKind: 'DESIGN_STUDIO',
    projectId,
    ...(generation.briefVersion?.state === 'REVIEWED' ? { briefVersionId: generation.briefVersion.id, constraintSnapshotId: generation.constraintSnapshot?.id } : {}),
    brief,
  })
  await intelligence.createRunConfig(actor, result.data.run.id, config, idempotencyKey)
  if (generation.briefVersion?.state === 'REVIEWED' && generation.constraintSnapshot) {
    await intelligence.createGenerationContext(actor, result.data.run.id, {
      project: generation.project,
      briefVersion: generation.briefVersion,
      constraintSnapshot: generation.constraintSnapshot,
    })
  }
  await db.prepare(`UPDATE formula_design_projects SET status = 'IN_PROGRESS', updated_at = ? WHERE id = ? AND organization_id = ?`).bind(now(), projectId, actor.organizationId).run()
  await auditFormulaIntelligence(db, actor, 'formula-intelligence.design.run.create', projectId)
  return { run: result.data.run, project: generation.project }
}

export async function createOptimizerRun(
  db: D1Database,
  service: NorthStarService,
  actor: AgentActor,
  requestInput: unknown,
  idempotencyKey: string,
  provider: { provider: string; model: string } = { provider: 'mock', model: 'deterministic-v1' },
) {
  requirePermission(service, 'formulas.viewSensitive')
  requirePermission(service, 'materials.view')
  requireFormulaIntelligenceFeature(service, 'designStudioOptimizer')
  const request = formulaOptimizerRequestSchema.parse(requestInput)
  if ((request.objectives?.targetCostReductionPercent !== undefined || request.objectives?.maxTotalCost !== undefined) && !hasCostAccess(service)) {
    throw new ForbiddenException('Formula Intelligence cost objectives require costing.view')
  }
  if (request.requireEligibleInventory && !hasInventoryAccess(service)) {
    throw new ForbiddenException('Eligible inventory gating requires inventory.view')
  }
  const versions = service.formulaVersions(request.baselineFormulaId).data
  if (!versions.versions.some((version) => version.version === request.baselineVersion)) {
    throw new UnprocessableEntityException('Select an existing immutable formula version before optimizing')
  }
  const store = new AgentRuntimeStore(db)
  const intelligence = new FormulaIntelligenceStore(db)
  await intelligence.assertRunStartAllowed(actor)
  const result = await store.create(actor, { brief: `Optimize ${versions.formula.name} ${request.baselineVersion}` }, provider)
  const config = formulaIntelligenceRunConfigSchema.parse({ workflowKind: 'REFORMULATION_OPTIMIZER', request })
  await intelligence.createRunConfig(actor, result.data.run.id, config, idempotencyKey)
  await auditFormulaIntelligence(db, actor, 'formula-intelligence.reformulation.run.create', `${request.baselineFormulaId}:${request.baselineVersion}`)
  return { run: result.data.run, baseline: { formulaId: request.baselineFormulaId, version: request.baselineVersion } }
}
