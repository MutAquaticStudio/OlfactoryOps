import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import {
  sensoryEvaluationSubmitRequestSchema,
  sensoryFormCreateRequestSchema,
  sensoryPanelAssignmentRequestSchema,
  sensoryPublicEvaluationRequestSchema,
  sensoryPublicLinkCreateRequestSchema,
  sensorySampleAssignmentRequestSchema,
  sensorySessionCreateRequestSchema,
  sensorySessionTransitionRequestSchema,
  sensoryUnblindRequestSchema,
  trialCreateRequestSchema,
  trialDecisionCreateRequestSchema,
  trialEvidenceCreateRequestSchema,
  trialPlanRequestSchema,
  trialReleaseRequestSchema,
  trialSampleCreateRequestSchema,
  trialStartPreparationRequestSchema,
  trialWeighingConfirmRequestSchema,
  type PrivateSensoryMemoryProjection,
  type SensoryEvaluationSubmitRequest,
} from '../../../packages/contracts/src/trials-sensory.js'
import {
  LabOperationsService,
  type LabOperationsTransaction,
  type LabWeighingConfirmedLine,
} from '../../lab-ops/src/service.js'
import { PlatformError, PlatformService } from '../../platform/src/service.js'
import type { PlatformContext } from '../../platform/src/types.js'

type Transaction = LabOperationsTransaction
type JsonRecord = Record<string, unknown>
type IdempotencyRow = { requestHash: string; response: unknown }
type TrialRow = {
  id: string; sourceKind: 'FORMULA_VERSION' | 'MANUAL_EXPERIMENT'; formulaVersionId: string | null; formulaSnapshot: JsonRecord; formulaContentHash: string | null
  manualSource: JsonRecord | null; title: string; plannedMassGrams: Prisma.Decimal; status: string; revision: number; createdBy: string; createdAt: Date; updatedAt: Date
}
type SensoryFormRow = { id: string; schema: { timepoints?: string[]; dimensions?: Array<{ key: string; kind: string; minimum: number; maximum: number; required: boolean; options?: string[] }>; descriptorVocabulary?: string[] }; minimumEvidenceCount: number; status: string }
type PublicLinkRow = { id: string; organizationId: string; sensorySessionId: string; sampleAssignmentId: string; presentationMode: 'BLIND' | 'BRAND_REVIEW'; expiresAt: Date; maxSubmissions: number; submissionCount: number }

const EPSILON = 0.000001
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as JsonRecord).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`
  return JSON.stringify(value)
}
const digest = (value: unknown) => createHash('sha256').update(stableJson(value)).digest('hex')
const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex')
const identifier = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '')}`
const bytesToBase64Url = (value: Uint8Array) => {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const bytesToHex = (value: Uint8Array) => {
  let output = ''
  for (const byte of value) output += byte.toString(16).padStart(2, '0')
  return output
}
const asNumber = (value: Prisma.Decimal | number | string | null | undefined) => Number(value ?? 0)
const iso = (value: Date | null | undefined) => value?.toISOString() ?? null

const allowedTrialTransitions: Record<string, readonly string[]> = {
  DRAFT: ['PLANNED', 'CANCELLED'],
  PLANNED: ['READY', 'CANCELLED'],
  READY: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PREPARED'],
  PREPARED: ['EVALUATION_READY'],
  EVALUATION_READY: ['EVALUATED'],
  EVALUATED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
}

function requireTransition(current: string, next: string) {
  if (!allowedTrialTransitions[current]?.includes(next)) throw new PlatformError('TRIAL_STATE_INVALID', 'This action is not available in the current Trial state.', 409)
}

function json(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

/**
 * Phase 7 Trial and Sensory domain service. All mutable state is tenant scoped,
 * permission checked, idempotent, and written under the same transaction-local
 * RLS context as the Phase 2 immutable inventory ledger.
 */
export class TrialSensoryService {
  constructor(private readonly client: PrismaClient, private readonly platform: PlatformService, private readonly lab: LabOperationsService) {}

  private async scoped<T>(context: PlatformContext, action: (tx: Transaction) => Promise<T>) {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true), set_config('app.user_id', ${context.userId}, true)`
      return action(tx)
    })
  }

  private async audit(tx: Transaction, context: PlatformContext, action: string, outcome: 'allowed' | 'blocked', subjectType: string, subjectId: string, payload?: unknown) {
    await tx.$executeRaw`
      INSERT INTO v2_audit_events (id, organization_id, actor_user_id, action, outcome, subject_type, subject_id, correlation_id, payload_hash)
      VALUES (${identifier('audit')}, ${context.organizationId}, ${context.userId}, ${action}, ${outcome}, ${subjectType}, ${subjectId}, ${identifier('corr')}, ${payload === undefined ? null : digest(payload)})
    `
  }

  private async idempotent<T extends JsonRecord>(context: PlatformContext, route: string, key: string | undefined, request: unknown, action: (tx: Transaction) => Promise<T>) {
    if (!key || key.length < 12 || key.length > 200) throw new PlatformError('IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key for this operation.', 428)
    const requestHash = digest(request)
    return this.scoped(context, async (tx) => {
      const existing = await tx.$queryRaw<IdempotencyRow[]>`
        SELECT request_hash AS "requestHash", response FROM v2_operation_idempotency
        WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}
      `
      if (existing[0]) {
        if (existing[0].requestHash !== requestHash) throw new PlatformError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request.', 409)
        if (!existing[0].response) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
        return existing[0].response as T
      }
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO v2_operation_idempotency (id, organization_id, actor_user_id, route, idempotency_key, request_hash)
        VALUES (${identifier('idem')}, ${context.organizationId}, ${context.userId}, ${route}, ${key}, ${requestHash})
        ON CONFLICT (organization_id, actor_user_id, route, idempotency_key) DO NOTHING RETURNING id
      `
      if (!inserted.length) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
      const result = await action(tx)
      await tx.$executeRaw`
        UPDATE v2_operation_idempotency SET response = ${JSON.stringify(result)}::jsonb
        WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}
      `
      return result
    })
  }

  private async require(context: PlatformContext, permission: string) { await this.platform.requirePermission(context, permission) }

  private async can(context: PlatformContext, permission: string) {
    try { await this.platform.requirePermission(context, permission); return true } catch (error) { if (error instanceof PlatformError && error.code === 'TENANT_ACCESS_DENIED') return false; throw error }
  }

  /**
   * A sensory panelist is not a general Trial reader. Keep the distinction in
   * the service so a future UI route cannot turn a blind assignment into a
   * tenant-wide metadata disclosure.
   */
  private async trialReadScope(context: PlatformContext): Promise<'ALL' | 'ASSIGNED'> {
    if (await this.can(context, 'trials.viewAll')) return 'ALL'
    if (await this.can(context, 'trials.viewAssigned')) return 'ASSIGNED'
    throw new PlatformError('TENANT_ACCESS_DENIED', 'Your workspace role cannot view Trial records.', 403)
  }

  private async assertAssignedTrial(tx: Transaction, context: PlatformContext, trialId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT t.id
      FROM v2_trials t
      JOIN v2_sensory_sessions s ON s.organization_id = t.organization_id AND s.trial_id = t.id
      JOIN v2_sensory_panel_assignments panel ON panel.organization_id = s.organization_id AND panel.sensory_session_id = s.id
      WHERE t.organization_id = ${context.organizationId} AND t.id = ${trialId}
        AND panel.panelist_user_id = ${context.userId} AND panel.status = 'ACTIVE'
      LIMIT 1
    `
    if (!rows[0]) throw new PlatformError('TENANT_ACCESS_DENIED', 'This Trial has not been assigned to the current sensory panelist.', 403)
  }

  private async trial(tx: Transaction, context: PlatformContext, trialId: string, lock = false): Promise<TrialRow> {
    const rows = await tx.$queryRaw<TrialRow[]>`
      SELECT id, source_kind AS "sourceKind", formula_version_id AS "formulaVersionId", formula_snapshot AS "formulaSnapshot", formula_content_hash AS "formulaContentHash",
             manual_source AS "manualSource", title, planned_mass_g AS "plannedMassGrams", status, revision, created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM v2_trials WHERE id = ${trialId} AND organization_id = ${context.organizationId}${lock ? Prisma.sql` FOR UPDATE` : Prisma.empty}
    `
    if (!rows[0]) throw new PlatformError('TRIAL_NOT_FOUND', 'The requested Trial is not available in this workspace.', 404)
    return rows[0]
  }

  private async formulaSnapshot(tx: Transaction, context: PlatformContext, formulaVersionId: string) {
    const versions = await tx.$queryRaw<Array<{ id: string; formulaProjectId: string; formulaType: string; contentHash: string; totalPercentage: Prisma.Decimal; approvalStatus: string }>>`
      SELECT id, formula_project_id AS "formulaProjectId", formula_type AS "formulaType", content_hash AS "contentHash", total_percentage AS "totalPercentage", approval_status AS "approvalStatus"
      FROM v2_formula_versions WHERE id = ${formulaVersionId} AND organization_id = ${context.organizationId}
    `
    const version = versions[0]
    if (!version) throw new PlatformError('FORMULA_VERSION_NOT_FOUND', 'The selected Formula Version is not available in this workspace.', 404)
    if (version.approvalStatus !== 'APPROVED') throw new PlatformError('FORMULA_VERSION_NOT_APPROVED', 'Only an approved immutable Formula Version can be released for a Trial.', 409)
    const components = await tx.$queryRaw<Array<{ materialId: string; name: string; percentage: Prisma.Decimal; position: number; note: string | null; materialStatus: string }>>`
      SELECT c.material_id AS "materialId", m.name, c.percentage, c.position, c.note, m.status AS "materialStatus"
      FROM v2_formula_version_components c
      JOIN v2_materials m ON m.id = c.material_id AND m.organization_id = c.organization_id
      WHERE c.organization_id = ${context.organizationId} AND c.formula_version_id = ${formulaVersionId}
      ORDER BY c.position ASC, c.id ASC
    `
    if (!components.length) throw new PlatformError('FORMULA_VERSION_EMPTY', 'A Trial Formula Version must contain a composition.', 409)
    const total = components.reduce((sum, component) => sum + asNumber(component.percentage), 0)
    if (Math.abs(total - 100) > EPSILON || Math.abs(asNumber(version.totalPercentage) - 100) > EPSILON) throw new PlatformError('FORMULA_MATH_INVALID', 'The Formula Version cannot be used for a Trial until its composition totals 100 percent.', 409)
    if (components.some((component) => component.materialStatus !== 'ACTIVE')) throw new PlatformError('TRIAL_MATERIAL_NOT_ACTIVE', 'Every Trial material must remain active.', 409)
    return {
      versionId: version.id,
      formulaProjectId: version.formulaProjectId,
      formulaType: version.formulaType,
      contentHash: version.contentHash,
      totalPercentage: total,
      components: components.map((component) => ({ materialId: component.materialId, name: component.name, percentage: asNumber(component.percentage), position: component.position, note: component.note ?? undefined })),
    }
  }

  private async releaseReview(tx: Transaction, context: PlatformContext, snapshot: JsonRecord) {
    const components = Array.isArray(snapshot.components) ? snapshot.components as Array<{ materialId?: string }> : []
    const materialIds = components.map((component) => component.materialId).filter((value): value is string => Boolean(value))
    if (!materialIds.length) return { status: 'NOT_EVALUATED' as const, reason: 'The manual experimental source has no deterministic formula compliance dataset.' }
    const rows = await tx.$queryRaw<Array<{ materialId: string; blocked: boolean; hasIfraEvidence: boolean; approvedCompliance: boolean }>>`
      SELECT m.id AS "materialId",
        EXISTS(SELECT 1 FROM v2_material_compliance c WHERE c.organization_id = m.organization_id AND c.material_id = m.id AND c.status = 'BLOCKED') AS blocked,
        EXISTS(SELECT 1 FROM v2_material_compliance c WHERE c.organization_id = m.organization_id AND c.material_id = m.id AND c.status = 'APPROVED' AND lower(c.category) LIKE '%ifra%') AS "hasIfraEvidence",
        EXISTS(SELECT 1 FROM v2_material_compliance c WHERE c.organization_id = m.organization_id AND c.material_id = m.id AND c.status = 'APPROVED') AS "approvedCompliance"
      FROM v2_materials m WHERE m.organization_id = ${context.organizationId} AND m.id IN (${Prisma.join(materialIds)})
    `
    if (rows.length !== materialIds.length) throw new PlatformError('TRIAL_MATERIAL_NOT_FOUND', 'A Trial Formula material is no longer visible to this workspace.', 409)
    if (rows.some((row) => row.blocked)) throw new PlatformError('TRIAL_COMPLIANCE_BLOCKED', 'A blocked material cannot be released for Trial preparation.', 409)
    if (rows.some((row) => !row.hasIfraEvidence || !row.approvedCompliance)) return { status: 'REVIEW_REQUIRED' as const, reason: 'IFRA or compliance evidence is incomplete; the release records this review requirement without fabricating a pass.' }
    return { status: 'VERIFIED' as const, reason: 'All current formula materials have approved IFRA and compliance facets.' }
  }

  private async createTrialVersion(tx: Transaction, context: PlatformContext, trial: TrialRow, lifecycle: string, patch: JsonRecord) {
    const version = trial.revision + 1
    const snapshot = { sourceKind: trial.sourceKind, formulaVersionId: trial.formulaVersionId, formulaContentHash: trial.formulaContentHash, formula: trial.formulaSnapshot, manualSource: trial.manualSource, title: trial.title, plannedMassGrams: asNumber(trial.plannedMassGrams), lifecycle, ...patch }
    const id = identifier('trialver')
    await tx.$executeRaw`UPDATE v2_trial_versions SET status = 'SUPERSEDED' WHERE organization_id = ${context.organizationId} AND trial_id = ${trial.id} AND status = 'CURRENT'`
    await tx.$executeRaw`
      INSERT INTO v2_trial_versions (id, organization_id, trial_id, version_number, status, formula_version_id, snapshot, content_hash, change_reason, created_by)
      VALUES (${id}, ${context.organizationId}, ${trial.id}, ${version}, 'CURRENT', ${trial.formulaVersionId}, ${JSON.stringify(snapshot)}::jsonb, ${digest(snapshot)}, ${lifecycle}, ${context.userId})
    `
    await tx.$executeRaw`UPDATE v2_trials SET revision = ${version}, updated_at = now() WHERE id = ${trial.id} AND organization_id = ${context.organizationId}`
    return { id, version, snapshot }
  }

  private async assertFormulaWeighingMatches(snapshot: JsonRecord, plannedMassGrams: number, lines: Array<{ materialId: string; requestedGrams: number }>) {
    const components = Array.isArray(snapshot.components) ? snapshot.components as Array<{ materialId?: string; percentage?: number }> : []
    if (!components.length) return
    if (components.length !== lines.length) throw new PlatformError('TRIAL_WEIGHING_COMPOSITION_MISMATCH', 'The Trial weighing plan must include every material from the immutable Formula Version.', 422)
    for (const component of components) {
      if (!component.materialId || typeof component.percentage !== 'number') throw new PlatformError('TRIAL_FORMULA_SNAPSHOT_INVALID', 'The immutable Formula snapshot is incomplete.', 409)
      const line = lines.find((candidate) => candidate.materialId === component.materialId)
      const expected = plannedMassGrams * component.percentage / 100
      if (!line || Math.abs(line.requestedGrams - expected) > EPSILON) throw new PlatformError('TRIAL_WEIGHING_COMPOSITION_MISMATCH', 'The Trial weighing plan must use the deterministic Formula scale calculation.', 422)
    }
  }

  async listTrials(context: PlatformContext) {
    const scope = await this.trialReadScope(context)
    return this.scoped(context, async (tx) => {
      const assignmentClause = scope === 'ASSIGNED' ? Prisma.sql`
        AND EXISTS (
          SELECT 1
          FROM v2_sensory_sessions session
          JOIN v2_sensory_panel_assignments panel ON panel.organization_id = session.organization_id AND panel.sensory_session_id = session.id
          WHERE session.organization_id = t.organization_id AND session.trial_id = t.id
            AND panel.panelist_user_id = ${context.userId} AND panel.status = 'ACTIVE'
        )
      ` : Prisma.empty
      const rows = await tx.$queryRaw<Array<{ id: string; title: string; status: string; sourceKind: string; formulaVersionId: string | null; plannedMassGrams: Prisma.Decimal; revision: number; createdAt: Date; decision: string | null }>>`
        SELECT t.id, t.title, t.status, t.source_kind AS "sourceKind", t.formula_version_id AS "formulaVersionId", t.planned_mass_g AS "plannedMassGrams", t.revision, t.created_at AS "createdAt",
          (SELECT decision FROM v2_trial_decisions d WHERE d.organization_id = t.organization_id AND d.trial_id = t.id ORDER BY d.decided_at DESC LIMIT 1) AS decision
        FROM v2_trials t WHERE t.organization_id = ${context.organizationId} ${assignmentClause} ORDER BY t.updated_at DESC, t.id DESC
      `
      return rows.map((row) => scope === 'ALL'
        ? { ...row, plannedMassGrams: asNumber(row.plannedMassGrams), createdAt: row.createdAt.toISOString() }
        : { id: row.id, title: 'Assigned sensory evaluation', status: row.status, sourceKind: 'BLIND_PRESENTATION', formulaVersionId: null, plannedMassGrams: 0, revision: 0, createdAt: row.createdAt.toISOString(), decision: null })
    })
  }

  async approvedFormulaVersions(context: PlatformContext) {
    await this.require(context, 'trials.create')
    await this.require(context, 'formula.view')
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; formulaProjectId: string; name: string; formulaType: string; versionNumber: number; contentHash: string; approvedAt: Date }>>`
        SELECT v.id, v.formula_project_id AS "formulaProjectId", p.name, v.formula_type AS "formulaType", v.version_number AS "versionNumber", v.content_hash AS "contentHash", v.approved_at AS "approvedAt"
        FROM v2_formula_versions v
        JOIN v2_formula_projects p ON p.id = v.formula_project_id AND p.organization_id = v.organization_id
        WHERE v.organization_id = ${context.organizationId} AND v.approval_status = 'APPROVED'
        ORDER BY v.approved_at DESC, v.id DESC LIMIT 200
      `
      return rows.map((row) => ({ ...row, approvedAt: row.approvedAt.toISOString() }))
    })
  }

  async createTrial(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.require(context, 'trials.create')
    const parsed = trialCreateRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a bounded Trial source and plan.', 422)
    return this.idempotent(context, 'trials.create', key, parsed.data, async (tx) => {
      let formulaSnapshot: JsonRecord = {}
      let formulaContentHash: string | null = null
      if (parsed.data.sourceKind === 'FORMULA_VERSION') {
        const formula = await this.formulaSnapshot(tx, context, parsed.data.formulaVersionId!)
        formulaSnapshot = formula
        formulaContentHash = formula.contentHash
      }
      const id = identifier('trial')
      await tx.$executeRaw`
        INSERT INTO v2_trials (id, organization_id, source_kind, formula_version_id, formula_snapshot, formula_content_hash, manual_source, title, planned_mass_g, status, revision, created_by)
        VALUES (${id}, ${context.organizationId}, ${parsed.data.sourceKind}, ${parsed.data.formulaVersionId ?? null}, ${JSON.stringify(formulaSnapshot)}::jsonb, ${formulaContentHash}, ${parsed.data.manualSource ? JSON.stringify({ source: parsed.data.manualSource }) : null}::jsonb, ${parsed.data.title}, ${parsed.data.plannedMassGrams}, 'DRAFT', 1, ${context.userId})
      `
      const trial = await this.trial(tx, context, id, true)
      const initialSnapshot = { sourceKind: trial.sourceKind, formulaVersionId: trial.formulaVersionId, formulaContentHash: trial.formulaContentHash, formula: trial.formulaSnapshot, manualSource: trial.manualSource, title: trial.title, plannedMassGrams: asNumber(trial.plannedMassGrams), lifecycle: 'DRAFT', notes: parsed.data.notes ?? null }
      const versionId = identifier('trialver')
      await tx.$executeRaw`
        INSERT INTO v2_trial_versions (id, organization_id, trial_id, version_number, status, formula_version_id, snapshot, content_hash, change_reason, created_by)
        VALUES (${versionId}, ${context.organizationId}, ${id}, 1, 'CURRENT', ${trial.formulaVersionId}, ${JSON.stringify(initialSnapshot)}::jsonb, ${digest(initialSnapshot)}, 'DRAFT', ${context.userId})
      `
      await this.audit(tx, context, 'trials.create', 'allowed', 'trial', id, { sourceKind: parsed.data.sourceKind, formulaVersionId: parsed.data.formulaVersionId ?? null, title: parsed.data.title })
      return { id, status: 'DRAFT', versionId }
    })
  }

  async planTrial(context: PlatformContext, trialId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'trials.create')
    const parsed = trialPlanRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a bounded Trial plan.', 422)
    return this.idempotent(context, 'trials.plan', key, { trialId, ...parsed.data }, async (tx) => {
      const trial = await this.trial(tx, context, trialId, true)
      requireTransition(trial.status, 'PLANNED')
      const version = await this.createTrialVersion(tx, context, trial, 'PLANNED', { plan: parsed.data })
      await tx.$executeRaw`UPDATE v2_trials SET status = 'PLANNED', planned_at = ${parsed.data.plannedAt ? new Date(parsed.data.plannedAt) : new Date()}, updated_at = now() WHERE id = ${trialId} AND organization_id = ${context.organizationId}`
      await this.audit(tx, context, 'trials.plan', 'allowed', 'trial', trialId, parsed.data)
      return { id: trialId, status: 'PLANNED', versionId: version.id }
    })
  }

  async releaseTrial(context: PlatformContext, trialId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'trials.release')
    await this.require(context, 'formula.approve')
    const parsed = trialReleaseRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a release rationale.', 422)
    return this.idempotent(context, 'trials.release', key, { trialId, ...parsed.data }, async (tx) => {
      const trial = await this.trial(tx, context, trialId, true)
      requireTransition(trial.status, 'READY')
      const review = await this.releaseReview(tx, context, trial.formulaSnapshot)
      const version = await this.createTrialVersion(tx, context, trial, 'READY', { releaseReview: review, releaseRationale: parsed.data.rationale })
      const releaseId = identifier('trialrelease')
      const gateSnapshot = { review, rationale: parsed.data.rationale, formulaContentHash: trial.formulaContentHash, trialVersionId: version.id }
      await tx.$executeRaw`
        INSERT INTO v2_trial_releases (id, organization_id, trial_id, trial_version_id, status, gate_snapshot, gate_checksum, released_by, released_at, rationale)
        VALUES (${releaseId}, ${context.organizationId}, ${trialId}, ${version.id}, 'RELEASED', ${JSON.stringify(gateSnapshot)}::jsonb, ${digest(gateSnapshot)}, ${context.userId}, now(), ${parsed.data.rationale})
      `
      await tx.$executeRaw`UPDATE v2_trials SET status = 'READY', released_by = ${context.userId}, released_at = now(), updated_at = now() WHERE id = ${trialId} AND organization_id = ${context.organizationId}`
      await this.audit(tx, context, 'trials.release', 'allowed', 'trial', trialId, { releaseReview: review.status, rationale: parsed.data.rationale })
      return { id: trialId, status: 'READY', compliance: review, versionId: version.id, releaseId }
    })
  }

  async cancelTrial(context: PlatformContext, trialId: string, rationale: string, key?: string) {
    await this.require(context, 'trials.create')
    if (!rationale.trim() || rationale.length > 2_000) throw new PlatformError('INVALID_INPUT', 'Provide a bounded cancellation rationale.', 422)
    return this.idempotent(context, 'trials.cancel', key, { trialId, rationale }, async (tx) => {
      const trial = await this.trial(tx, context, trialId, true)
      requireTransition(trial.status, 'CANCELLED')
      await this.createTrialVersion(tx, context, trial, 'CANCELLED', { cancellationRationale: rationale.trim() })
      await tx.$executeRaw`UPDATE v2_trials SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = ${rationale.trim()}, updated_at = now() WHERE id = ${trialId} AND organization_id = ${context.organizationId}`
      await this.audit(tx, context, 'trials.cancel', 'allowed', 'trial', trialId, { rationale })
      return { id: trialId, status: 'CANCELLED' }
    })
  }

  async startPreparation(context: PlatformContext, trialId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'trials.create')
    const parsed = trialStartPreparationRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a valid Trial weighing plan.', 422)
    return this.lab.createWeighingSession(context, { contextType: 'TRIAL', contextId: trialId, lines: parsed.data.lines }, key, {
      beforeCreate: async (tx, session, input) => {
        const trial = await this.trial(tx, context, trialId, true)
        if (session.contextId !== trial.id) throw new PlatformError('TRIAL_CONTEXT_MISMATCH', 'The Trial weighing context is invalid.', 409)
        requireTransition(trial.status, 'IN_PROGRESS')
        await this.assertFormulaWeighingMatches(trial.formulaSnapshot, asNumber(trial.plannedMassGrams), input.lines)
        const active = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_trial_preparations WHERE organization_id = ${context.organizationId} AND trial_id = ${trialId} AND status IN ('PLANNED','WEIGHING') LIMIT 1 FOR UPDATE`
        if (active[0]) throw new PlatformError('TRIAL_PREPARATION_IN_PROGRESS', 'This Trial already has an active weighing preparation.', 409)
      },
      afterCreate: async (tx, session) => {
        const trial = await this.trial(tx, context, trialId, true)
        const versionRows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_trial_versions WHERE organization_id = ${context.organizationId} AND trial_id = ${trialId} AND status = 'CURRENT' ORDER BY version_number DESC LIMIT 1`
        if (!versionRows[0]) throw new PlatformError('TRIAL_VERSION_NOT_FOUND', 'The Trial has no immutable plan snapshot.', 409)
        const releases = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_trial_releases WHERE organization_id = ${context.organizationId} AND trial_id = ${trialId} AND trial_version_id = ${versionRows[0].id} AND status = 'RELEASED' ORDER BY released_at DESC LIMIT 1`
        if (!releases[0]) throw new PlatformError('TRIAL_RELEASE_REQUIRED', 'A released Trial gate is required before preparation can begin.', 409)
        const preparationId = identifier('trialprep')
        await tx.$executeRaw`
          INSERT INTO v2_trial_preparations (id, organization_id, trial_id, trial_version_id, trial_release_id, lab_weighing_session_id, status, planned_scale_g, created_by, started_at)
          VALUES (${preparationId}, ${context.organizationId}, ${trialId}, ${versionRows[0].id}, ${releases[0].id}, ${session.id}, 'WEIGHING', ${asNumber(trial.plannedMassGrams)}, ${context.userId}, now())
        `
        await tx.$executeRaw`UPDATE v2_trials SET status = 'IN_PROGRESS', updated_at = now() WHERE id = ${trialId} AND organization_id = ${context.organizationId}`
        await this.audit(tx, context, 'trials.preparation.start', 'allowed', 'trial_preparation', preparationId, { trialId, weighingSessionId: session.id })
        return { trialId, preparationId, status: 'WEIGHING' }
      },
    })
  }

  async confirmPreparation(context: PlatformContext, trialId: string, sessionId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'trials.create')
    const parsed = trialWeighingConfirmRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide one actual amount for each Trial weighing line.', 422)
    return this.lab.confirmWeighing(context, sessionId, parsed.data.lines, key, {
      beforeConfirm: async (tx, session) => {
        if (session.contextType !== 'TRIAL' || session.contextId !== trialId) throw new PlatformError('TRIAL_CONTEXT_MISMATCH', 'The weighing session does not belong to this Trial.', 409)
        const trial = await this.trial(tx, context, trialId, true)
        if (trial.status !== 'IN_PROGRESS') throw new PlatformError('TRIAL_STATE_INVALID', 'Only an in-progress Trial can confirm preparation.', 409)
        const preparations = await tx.$queryRaw<Array<{ id: string; status: string }>>`
          SELECT id, status FROM v2_trial_preparations WHERE organization_id = ${context.organizationId} AND trial_id = ${trialId} AND lab_weighing_session_id = ${sessionId} FOR UPDATE
        `
        if (!preparations[0] || preparations[0].status !== 'WEIGHING') throw new PlatformError('TRIAL_PREPARATION_NOT_ACTIVE', 'The Trial preparation is not active.', 409)
      },
      afterConfirm: async (tx, session, confirmedLines) => this.attachConfirmedPreparation(tx, context, trialId, session.id, confirmedLines),
    })
  }

  async reversePreparationConsumption(context: PlatformContext, trialId: string, movementId: string, key?: string) {
    await this.require(context, 'trials.create')
    return this.lab.reverseMovement(context, movementId, key, {
      afterReverse: async (tx, original, reversal) => {
        const usages = await tx.$queryRaw<Array<{ usageLinkId: string; preparationId: string }>>`
          SELECT u.usage_link_id AS "usageLinkId", u.trial_preparation_id AS "preparationId"
          FROM v2_trial_material_usages u
          WHERE u.organization_id = ${context.organizationId} AND u.trial_id = ${trialId} AND u.inventory_movement_id = ${original.id} FOR UPDATE
        `
        if (!usages[0]) throw new PlatformError('TRIAL_USAGE_LINK_NOT_FOUND', 'The movement is not linked to this Trial preparation.', 404)
        await tx.$executeRaw`UPDATE v2_trial_usage_links SET status = 'REVERSED', reversed_at = now(), reversal_movement_id = ${reversal.id} WHERE id = ${usages[0].usageLinkId} AND organization_id = ${context.organizationId}`
        await tx.$executeRaw`UPDATE v2_trial_preparations SET status = 'REVERSED', updated_at = now() WHERE id = ${usages[0].preparationId} AND organization_id = ${context.organizationId}`
        await this.audit(tx, context, 'trials.preparation.reverse', 'allowed', 'trial_preparation', usages[0].preparationId, { trialId, originalMovementId: original.id, reversalMovementId: reversal.id })
        return { trialId, preparationId: usages[0].preparationId, status: 'REVERSED' }
      },
    })
  }

  private async attachConfirmedPreparation(tx: Transaction, context: PlatformContext, trialId: string, sessionId: string, lines: LabWeighingConfirmedLine[]) {
    const preparations = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM v2_trial_preparations WHERE organization_id = ${context.organizationId} AND trial_id = ${trialId} AND lab_weighing_session_id = ${sessionId} FOR UPDATE
    `
    const preparation = preparations[0]
    if (!preparation) throw new PlatformError('TRIAL_PREPARATION_NOT_FOUND', 'The Trial preparation cannot be linked to its confirmed weighing session.', 409)
    const existing = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_trial_material_usages WHERE organization_id = ${context.organizationId} AND trial_preparation_id = ${preparation.id} LIMIT 1`
    if (existing[0]) throw new PlatformError('TRIAL_PREPARATION_ALREADY_CONFIRMED', 'The Trial preparation has already been linked to inventory consumption.', 409)
    const trial = await this.trial(tx, context, trialId, true)
    // A documented manual experiment has no Formula Version, but still needs
    // a stable immutable checksum in the usage provenance record.
    const formulaChecksum = trial.formulaContentHash ?? digest({ manualSource: trial.manualSource, trialId: trial.id })
    const linePlans = await tx.$queryRaw<Array<{ id: string; requestedGrams: Prisma.Decimal }>>`SELECT id, requested_g AS "requestedGrams" FROM v2_lab_weighing_lines WHERE organization_id = ${context.organizationId} AND session_id = ${sessionId}`
    const actualWeightSnapshot = { lines: lines.map((line) => ({ lineId: line.lineId, materialId: line.materialId, lotId: line.lotId, actualGrams: line.actualGrams, movementId: line.movementId })) }
    const costSnapshot = { lines: lines.map((line) => ({ movementId: line.movementId, landedUnitCost: line.landedUnitCost, currency: line.currency, actualGrams: line.actualGrams })) }
    const usageLinkId = identifier('trialusage')
    await tx.$executeRaw`
      INSERT INTO v2_trial_usage_links (id, organization_id, trial_id, preparation_id, lab_weighing_session_id, formula_checksum, actual_weight_snapshot, cost_snapshot, linked_by)
        VALUES (${usageLinkId}, ${context.organizationId}, ${trialId}, ${preparation.id}, ${sessionId}, ${formulaChecksum}, ${JSON.stringify(actualWeightSnapshot)}::jsonb, ${JSON.stringify(costSnapshot)}::jsonb, ${context.userId})
    `
    for (const line of lines) {
      const costSnapshot = { landedUnitCost: line.landedUnitCost, currency: line.currency, actualGrams: line.actualGrams, movementId: line.movementId }
      const planned = linePlans.find((candidate) => candidate.id === line.lineId)?.requestedGrams
      await tx.$executeRaw`
        INSERT INTO v2_trial_material_usages (id, organization_id, trial_id, trial_preparation_id, usage_link_id, material_id, lot_id, lab_weighing_line_id, inventory_movement_id, planned_quantity_g, actual_g, landed_unit_cost, currency, cost_snapshot, cost_snapshot_hash)
        VALUES (${identifier('trialuse')}, ${context.organizationId}, ${trialId}, ${preparation.id}, ${usageLinkId}, ${line.materialId}, ${line.lotId}, ${line.lineId}, ${line.movementId}, ${planned ?? null}, ${line.actualGrams}, ${line.landedUnitCost}, ${line.currency}, ${JSON.stringify(costSnapshot)}::jsonb, ${digest(costSnapshot)})
      `
    }
    const actualTotal = lines.reduce((sum, line) => sum + line.actualGrams, 0)
    await tx.$executeRaw`UPDATE v2_trial_preparations SET status = 'CONFIRMED', actual_total_g = ${actualTotal}, confirmed_by = ${context.userId}, confirmed_at = now(), updated_at = now() WHERE id = ${preparation.id} AND organization_id = ${context.organizationId}`
    await tx.$executeRaw`UPDATE v2_trials SET status = 'PREPARED', prepared_at = now(), updated_at = now() WHERE id = ${trialId} AND organization_id = ${context.organizationId}`
    await this.audit(tx, context, 'trials.preparation.confirm', 'allowed', 'trial_preparation', preparation.id, { trialId, sessionId, movementCount: lines.length })
    return { trialId, preparationId: preparation.id, status: 'CONFIRMED', movementIds: lines.map((line) => line.movementId) }
  }

  async createSample(context: PlatformContext, trialId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'trials.create')
    const parsed = trialSampleCreateRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a valid controlled sample identity.', 422)
    return this.idempotent(context, 'trials.samples.create', key, { trialId, ...parsed.data }, async (tx) => {
      const trial = await this.trial(tx, context, trialId, true)
      if (!['PREPARED', 'EVALUATION_READY'].includes(trial.status)) {
        throw new PlatformError('TRIAL_STATE_INVALID', 'Samples can be created only after confirmed preparation and before the sensory session is closed.', 409)
      }
      const preparation = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_trial_preparations WHERE organization_id = ${context.organizationId} AND trial_id = ${trialId} AND status = 'CONFIRMED' ORDER BY confirmed_at DESC LIMIT 1`
      if (!preparation[0]) throw new PlatformError('TRIAL_PREPARATION_REQUIRED', 'A Trial sample can be created only after actual weighing is confirmed.', 409)
      const duplicate = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_trial_samples WHERE organization_id = ${context.organizationId} AND sample_code = ${parsed.data.sampleCode} LIMIT 1`
      if (duplicate[0]) throw new PlatformError('TRIAL_SAMPLE_CODE_EXISTS', 'This controlled sample code is already in use in the workspace.', 409)
      const id = identifier('sample')
      const blindCode = bytesToHex(randomBytes(5)).toUpperCase()
      await tx.$executeRaw`
        INSERT INTO v2_trial_samples (id, organization_id, trial_id, trial_preparation_id, sample_code, blind_code, blind_code_hash, concentration_percent, carrier, storage_location, expires_at, status, prepared_by, prepared_at, notes)
        VALUES (${id}, ${context.organizationId}, ${trialId}, ${preparation[0].id}, ${parsed.data.sampleCode}, ${blindCode}, ${tokenHash(blindCode)}, ${parsed.data.concentrationPercent ?? null}, ${parsed.data.carrier ?? null}, ${parsed.data.storageLocation ?? null}, ${parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null}, 'AVAILABLE', ${context.userId}, now(), ${parsed.data.notes ?? null})
      `
      await tx.$executeRaw`UPDATE v2_trials SET status = 'EVALUATION_READY', evaluation_ready_at = now(), updated_at = now() WHERE id = ${trialId} AND organization_id = ${context.organizationId}`
      await this.audit(tx, context, 'trials.sample.create', 'allowed', 'trial_sample', id, { trialId, sampleCode: parsed.data.sampleCode })
      return { id, trialId, status: 'AVAILABLE', blindCode }
    })
  }

  async attachEvidence(context: PlatformContext, trialId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'trials.create')
    await this.require(context, 'documents.manage')
    const parsed = trialEvidenceCreateRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a bounded evidence reference and content checksum.', 422)
    return this.idempotent(context, 'trials.evidence.attach', key, { trialId, ...parsed.data }, async (tx) => {
      await this.trial(tx, context, trialId, true)
      if (parsed.data.preparationId) {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_trial_preparations WHERE id = ${parsed.data.preparationId} AND organization_id = ${context.organizationId} AND trial_id = ${trialId}`
        if (!rows[0]) throw new PlatformError('TRIAL_PREPARATION_NOT_FOUND', 'The evidence preparation is not part of this Trial.', 404)
      }
      if (parsed.data.sampleId) {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_trial_samples WHERE id = ${parsed.data.sampleId} AND organization_id = ${context.organizationId} AND trial_id = ${trialId}`
        if (!rows[0]) throw new PlatformError('TRIAL_SAMPLE_NOT_FOUND', 'The evidence sample is not part of this Trial.', 404)
      }
      const id = identifier('trialevidence')
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO v2_trial_evidence (id, organization_id, trial_id, preparation_id, sample_id, evidence_kind, object_ref, content_hash, status, created_by)
        VALUES (${id}, ${context.organizationId}, ${trialId}, ${parsed.data.preparationId ?? null}, ${parsed.data.sampleId ?? null}, ${parsed.data.evidenceKind}, ${parsed.data.objectRef}, ${parsed.data.contentHash}, 'ACTIVE', ${context.userId})
        ON CONFLICT (organization_id, trial_id, evidence_kind, object_ref, content_hash) DO NOTHING
        RETURNING id
      `
      const evidenceId = inserted[0]?.id ?? (await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM v2_trial_evidence WHERE organization_id = ${context.organizationId} AND trial_id = ${trialId}
          AND evidence_kind = ${parsed.data.evidenceKind} AND object_ref = ${parsed.data.objectRef} AND content_hash = ${parsed.data.contentHash}
      `)[0]?.id
      if (!evidenceId) throw new PlatformError('TRIAL_EVIDENCE_UNAVAILABLE', 'The evidence reference could not be recorded.', 409)
      await this.audit(tx, context, 'trials.evidence.attach', 'allowed', 'trial_evidence', evidenceId, { trialId, evidenceKind: parsed.data.evidenceKind, contentHash: parsed.data.contentHash })
      return { id: evidenceId, trialId, status: 'ACTIVE' }
    })
  }

  async createSensoryForm(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.require(context, 'sensory.manage')
    const parsed = sensoryFormCreateRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a versioned and bounded sensory form.', 422)
    return this.idempotent(context, 'sensory.forms.create', key, parsed.data, async (tx) => {
      const id = identifier('sform')
      const schema = { timepoints: parsed.data.timepoints, dimensions: parsed.data.dimensions, descriptorVocabulary: parsed.data.descriptorVocabulary }
      await tx.$executeRaw`
        INSERT INTO v2_sensory_form_versions (id, organization_id, name, version_label, schema, content_hash, minimum_evidence_count, status, created_by)
        VALUES (${id}, ${context.organizationId}, ${parsed.data.name}, ${parsed.data.versionLabel}, ${JSON.stringify(schema)}::jsonb, ${digest(schema)}, ${parsed.data.minimumEvidenceCount}, 'ACTIVE', ${context.userId})
      `
      await this.audit(tx, context, 'sensory.form.create', 'allowed', 'sensory_form_version', id, { name: parsed.data.name, versionLabel: parsed.data.versionLabel })
      return { id, status: 'ACTIVE', contentHash: digest(schema) }
    })
  }

  async listSensoryForms(context: PlatformContext) {
    await this.require(context, 'sensory.view')
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; name: string; versionLabel: string; minimumEvidenceCount: number; status: string; createdAt: Date }>>`
        SELECT id, name, version_label AS "versionLabel", minimum_evidence_count AS "minimumEvidenceCount", status, created_at AS "createdAt"
        FROM v2_sensory_form_versions WHERE organization_id = ${context.organizationId} AND status = 'ACTIVE' ORDER BY created_at DESC, id DESC
      `
      return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
    })
  }

  async createSensorySession(context: PlatformContext, trialId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'sensory.manage')
    const parsed = sensorySessionCreateRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a valid sensory session setup.', 422)
    return this.idempotent(context, 'sensory.sessions.create', key, { trialId, ...parsed.data }, async (tx) => {
      const trial = await this.trial(tx, context, trialId, true)
      if (trial.status !== 'EVALUATION_READY') throw new PlatformError('TRIAL_NOT_READY_FOR_EVALUATION', 'Create samples before opening a sensory session.', 409)
      const forms = await tx.$queryRaw<SensoryFormRow[]>`SELECT id, schema, minimum_evidence_count AS "minimumEvidenceCount", status FROM v2_sensory_form_versions WHERE id = ${parsed.data.formVersionId} AND organization_id = ${context.organizationId}`
      if (!forms[0] || forms[0].status !== 'ACTIVE') throw new PlatformError('SENSORY_FORM_NOT_FOUND', 'The selected sensory form is not active in this workspace.', 404)
      const id = identifier('ssession')
      await tx.$executeRaw`
        INSERT INTO v2_sensory_sessions (id, organization_id, trial_id, form_version_id, title, status, blind_mode, allow_peer_results_after_close, scheduled_at, instructions, created_by)
        VALUES (${id}, ${context.organizationId}, ${trialId}, ${parsed.data.formVersionId}, ${parsed.data.title}, 'DRAFT', ${parsed.data.blindMode}, ${parsed.data.allowPeerResultsAfterClose}, ${parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null}, ${parsed.data.instructions ?? null}, ${context.userId})
      `
      await this.audit(tx, context, 'sensory.session.create', 'allowed', 'sensory_session', id, { trialId, blindMode: parsed.data.blindMode })
      return { id, trialId, status: 'DRAFT' }
    })
  }

  async sensoryAssignments(context: PlatformContext, sessionId: string) {
    await this.require(context, 'sensory.view')
    const canManage = await this.can(context, 'sensory.manage')
    return this.scoped(context, async (tx) => {
      const sessions = await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT id, status FROM v2_sensory_sessions WHERE id = ${sessionId} AND organization_id = ${context.organizationId}`
      if (!sessions[0]) throw new PlatformError('SENSORY_SESSION_NOT_FOUND', 'The sensory session is not available in this workspace.', 404)
      if (!canManage) {
        const panel = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM v2_sensory_panel_assignments
          WHERE organization_id = ${context.organizationId} AND sensory_session_id = ${sessionId}
            AND panelist_user_id = ${context.userId} AND status = 'ACTIVE'
          LIMIT 1
        `
        if (!panel[0]) throw new PlatformError('TENANT_ACCESS_DENIED', 'You are not assigned to this sensory session.', 403)
      }
      const rows = await tx.$queryRaw<Array<{ id: string; panelAssignmentId: string | null; blindCode: string | null; blindingStatus: string; sampleStatus: string; panelistUserId: string | null }>>`
        SELECT a.id, a.panel_assignment_id AS "panelAssignmentId", a.presentation ->> 'blindCode' AS "blindCode", a.blinding_status AS "blindingStatus", sample.status AS "sampleStatus", panel.panelist_user_id AS "panelistUserId"
        FROM v2_sensory_sample_assignments a
        LEFT JOIN v2_sensory_panel_assignments panel ON panel.id = a.panel_assignment_id AND panel.organization_id = a.organization_id
        JOIN v2_trial_samples sample ON sample.id = a.sample_id AND sample.organization_id = a.organization_id
        WHERE a.organization_id = ${context.organizationId} AND a.sensory_session_id = ${sessionId}
          AND (${canManage} OR panel.panelist_user_id = ${context.userId})
        ORDER BY a.created_at ASC, a.id ASC
      `
      return rows.map((row) => ({ id: row.id, blindCode: row.blindCode ?? 'BLIND', blindingStatus: row.blindingStatus, sampleStatus: row.sampleStatus, ...(canManage ? { panelAssignmentId: row.panelAssignmentId, panelistUserId: row.panelistUserId } : {}) }))
    })
  }

  async preparationDetail(context: PlatformContext, trialId: string, sessionId: string) {
    await this.require(context, 'trials.viewAll')
    await this.require(context, 'inventory.view')
    return this.scoped(context, async (tx) => {
      const preparations = await tx.$queryRaw<Array<{ id: string; status: string; plannedScaleGrams: Prisma.Decimal; actualTotalGrams: Prisma.Decimal | null; confirmedAt: Date | null }>>`
        SELECT id, status, planned_scale_g AS "plannedScaleGrams", actual_total_g AS "actualTotalGrams", confirmed_at AS "confirmedAt"
        FROM v2_trial_preparations
        WHERE organization_id = ${context.organizationId} AND trial_id = ${trialId} AND lab_weighing_session_id = ${sessionId}
      `
      const preparation = preparations[0]
      if (!preparation) throw new PlatformError('TRIAL_PREPARATION_NOT_FOUND', 'The weighing session is not linked to this Trial.', 404)
      const lines = await tx.$queryRaw<Array<{ id: string; materialId: string; materialName: string; requestedGrams: Prisma.Decimal; toleranceGrams: Prisma.Decimal; lotId: string | null; actualGrams: Prisma.Decimal | null; movementId: string | null }>>`
        SELECT line.id, line.material_id AS "materialId", material.name AS "materialName", line.requested_g AS "requestedGrams", line.tolerance_g AS "toleranceGrams",
          line.lot_id AS "lotId", line.actual_g AS "actualGrams", line.consumption_movement_id AS "movementId"
        FROM v2_lab_weighing_lines line
        JOIN v2_materials material ON material.id = line.material_id AND material.organization_id = line.organization_id
        WHERE line.organization_id = ${context.organizationId} AND line.session_id = ${sessionId}
        ORDER BY line.created_at ASC, line.id ASC
      `
      return {
        preparation: { id: preparation.id, status: preparation.status, plannedScaleGrams: asNumber(preparation.plannedScaleGrams), actualTotalGrams: preparation.actualTotalGrams === null ? null : asNumber(preparation.actualTotalGrams), confirmedAt: iso(preparation.confirmedAt) },
        lines: lines.map((line) => ({ id: line.id, materialId: line.materialId, materialName: line.materialName, requestedGrams: asNumber(line.requestedGrams), toleranceGrams: asNumber(line.toleranceGrams), lotId: line.lotId, actualGrams: line.actualGrams === null ? null : asNumber(line.actualGrams), movementId: line.movementId })),
      }
    })
  }

  async sensoryPanelists(context: PlatformContext, sessionId: string) {
    await this.require(context, 'sensory.manage')
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; userId: string; status: string; invitedAt: Date }>>`
        SELECT panel.id, panel.panelist_user_id AS "userId", panel.status, panel.invited_at AS "invitedAt"
        FROM v2_sensory_panel_assignments panel
        WHERE panel.organization_id = ${context.organizationId} AND panel.sensory_session_id = ${sessionId}
        ORDER BY panel.invited_at ASC, panel.id ASC
      `
      return rows.map((row) => ({ ...row, invitedAt: row.invitedAt.toISOString() }))
    })
  }

  async publicLinks(context: PlatformContext, sessionId: string) {
    await this.require(context, 'sensory.manage')
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; sampleAssignmentId: string; presentationMode: string; maxSubmissions: number; submissionCount: number; expiresAt: Date; revokedAt: Date | null; issuedAt: Date }>>`
        SELECT id, sample_assignment_id AS "sampleAssignmentId", presentation_mode AS "presentationMode", max_submissions AS "maxSubmissions", submission_count AS "submissionCount",
          expires_at AS "expiresAt", revoked_at AS "revokedAt", issued_at AS "issuedAt"
        FROM v2_sensory_public_links
        WHERE organization_id = ${context.organizationId} AND sensory_session_id = ${sessionId}
        ORDER BY issued_at DESC, id DESC
      `
      return rows.map((row) => ({ ...row, expiresAt: row.expiresAt.toISOString(), revokedAt: iso(row.revokedAt), issuedAt: row.issuedAt.toISOString() }))
    })
  }

  async sensoryAssignmentsForCurrent(context: PlatformContext, sessionId: string) {
    await this.require(context, 'sensory.evaluate')
    return this.scoped(context, async (tx) => {
      const sessions = await tx.$queryRaw<Array<{ id: string; title: string; status: string; blindMode: boolean; schema: JsonRecord }>>`
        SELECT s.id, s.title, s.status, s.blind_mode AS "blindMode", f.schema
        FROM v2_sensory_sessions s
        JOIN v2_sensory_form_versions f ON f.id = s.form_version_id AND f.organization_id = s.organization_id
        WHERE s.id = ${sessionId} AND s.organization_id = ${context.organizationId}
      `
      const session = sessions[0]
      if (!session) throw new PlatformError('SENSORY_SESSION_NOT_FOUND', 'The sensory session is not available in this workspace.', 404)
      const panel = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM v2_sensory_panel_assignments
        WHERE organization_id = ${context.organizationId} AND sensory_session_id = ${sessionId} AND panelist_user_id = ${context.userId} AND status = 'ACTIVE'
      `
      if (!panel[0]) throw new PlatformError('SENSORY_PANEL_ASSIGNMENT_REQUIRED', 'You are not assigned to evaluate this sensory session.', 403)
      const assignments = await tx.$queryRaw<Array<{ id: string; blindCode: string | null; blindingStatus: string; sampleStatus: string; final: boolean }>>`
        SELECT a.id, a.presentation ->> 'blindCode' AS "blindCode", a.blinding_status AS "blindingStatus", sample.status AS "sampleStatus",
          EXISTS(
            SELECT 1 FROM v2_sensory_evaluations evaluation
            WHERE evaluation.organization_id = a.organization_id AND evaluation.sample_assignment_id = a.id
              AND evaluation.panel_assignment_id = ${panel[0].id} AND evaluation.status = 'SUBMITTED'
          ) AS final
        FROM v2_sensory_sample_assignments a
        JOIN v2_trial_samples sample ON sample.id = a.sample_id AND sample.organization_id = a.organization_id
        WHERE a.organization_id = ${context.organizationId} AND a.sensory_session_id = ${sessionId} AND a.panel_assignment_id = ${panel[0].id}
        ORDER BY a.created_at ASC, a.id ASC
      `
      return {
        session: { id: session.id, title: session.title, status: session.status, blindMode: session.blindMode },
        form: {
          timepoints: Array.isArray(session.schema.timepoints) ? session.schema.timepoints : [],
          dimensions: Array.isArray(session.schema.dimensions) ? session.schema.dimensions : [],
          descriptorVocabulary: Array.isArray(session.schema.descriptorVocabulary) ? session.schema.descriptorVocabulary : [],
        },
        assignments: assignments.map((assignment) => ({ id: assignment.id, blindCode: assignment.blindCode ?? 'BLIND', blindingStatus: assignment.blindingStatus, sampleStatus: assignment.sampleStatus, final: assignment.final })),
      }
    })
  }

  async assignPanelist(context: PlatformContext, sessionId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'sensory.manage')
    const parsed = sensoryPanelAssignmentRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Select an active panelist.', 422)
    return this.idempotent(context, 'sensory.panel.assign', key, { sessionId, ...parsed.data }, async (tx) => {
      const session = await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT id, status FROM v2_sensory_sessions WHERE id = ${sessionId} AND organization_id = ${context.organizationId} FOR UPDATE`
      if (!session[0] || ['CLOSED', 'VOIDED'].includes(session[0].status)) throw new PlatformError('SENSORY_SESSION_NOT_ASSIGNABLE', 'This sensory session is not available for panel assignment.', 409)
      const membership = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_memberships WHERE organization_id = ${context.organizationId} AND user_id = ${parsed.data.userId} AND status = 'ACTIVE'`
      if (!membership[0]) throw new PlatformError('SENSORY_PANELIST_INVALID', 'The selected panelist must be an active workspace member.', 409)
      const assigned = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO v2_sensory_panel_assignments (id, organization_id, sensory_session_id, panelist_user_id, status, invited_by)
        VALUES (${identifier('panel')}, ${context.organizationId}, ${sessionId}, ${parsed.data.userId}, 'ACTIVE', ${context.userId})
        ON CONFLICT (organization_id, sensory_session_id, panelist_user_id) DO UPDATE SET status = 'ACTIVE', revoked_at = NULL, revoked_by = NULL
        RETURNING id
      `
      const id = assigned[0]?.id
      if (!id) throw new PlatformError('SENSORY_PANELIST_INVALID', 'The panelist assignment could not be recorded.', 409)
      await this.audit(tx, context, 'sensory.panel.assign', 'allowed', 'sensory_panel_assignment', id, { sessionId, recipientUserId: parsed.data.userId })
      return { id, sessionId, userId: parsed.data.userId, status: 'ACTIVE' }
    })
  }

  async assignSample(context: PlatformContext, sessionId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'sensory.manage')
    const parsed = sensorySampleAssignmentRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a unique blind code for a Trial sample.', 422)
    return this.idempotent(context, 'sensory.samples.assign', key, { sessionId, ...parsed.data }, async (tx) => {
      const sessions = await tx.$queryRaw<Array<{ id: string; trialId: string; status: string }>>`SELECT id, trial_id AS "trialId", status FROM v2_sensory_sessions WHERE id = ${sessionId} AND organization_id = ${context.organizationId} FOR UPDATE`
      if (!sessions[0] || ['CLOSED', 'VOIDED'].includes(sessions[0].status)) throw new PlatformError('SENSORY_SESSION_NOT_ASSIGNABLE', 'This sensory session is not available for sample assignment.', 409)
      const samples = await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT id, status FROM v2_trial_samples WHERE id = ${parsed.data.sampleId} AND organization_id = ${context.organizationId} AND trial_id = ${sessions[0].trialId} FOR UPDATE`
      if (!samples[0] || samples[0].status === 'EXPIRED' || samples[0].status === 'DISPOSED') throw new PlatformError('TRIAL_SAMPLE_NOT_ELIGIBLE', 'Choose an available Trial sample from this session\'s Trial.', 409)
      const duplicateBlindCode = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM v2_sensory_sample_assignments
        WHERE organization_id = ${context.organizationId} AND sensory_session_id = ${sessionId}
          AND presentation ->> 'blindCode' = ${parsed.data.blindCode} AND sample_id <> ${parsed.data.sampleId}
        LIMIT 1 FOR UPDATE
      `
      if (duplicateBlindCode[0]) throw new PlatformError('SENSORY_BLIND_CODE_EXISTS', 'Choose a different blind code for this sensory session.', 409)
      const panelists = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_sensory_panel_assignments WHERE organization_id = ${context.organizationId} AND sensory_session_id = ${sessionId} AND status = 'ACTIVE' ORDER BY id ASC`
      // A null panel assignment is a deliberately separate public/brand-safe slot;
      // each internal panelist receives a distinct sample assignment for isolation.
      const targets = [null, ...panelists.map((item) => item.id)]
      const assignmentIds: string[] = []
      for (const panelAssignmentId of targets) {
        if (panelAssignmentId === null) {
          const existingPublic = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM v2_sensory_sample_assignments WHERE organization_id = ${context.organizationId} AND sensory_session_id = ${sessionId} AND sample_id = ${parsed.data.sampleId} AND panel_assignment_id IS NULL FOR UPDATE
          `
          if (existingPublic[0]) {
            await tx.$executeRaw`UPDATE v2_sensory_sample_assignments SET presentation = ${JSON.stringify({ blindCode: parsed.data.blindCode })}::jsonb WHERE id = ${existingPublic[0].id} AND organization_id = ${context.organizationId}`
            assignmentIds.push(existingPublic[0].id)
            continue
          }
        }
        const assigned = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO v2_sensory_sample_assignments (id, organization_id, sensory_session_id, sample_id, panel_assignment_id, presentation)
          VALUES (${identifier('sampleassign')}, ${context.organizationId}, ${sessionId}, ${parsed.data.sampleId}, ${panelAssignmentId}, ${JSON.stringify({ blindCode: parsed.data.blindCode })}::jsonb)
          ON CONFLICT (organization_id, sensory_session_id, sample_id, panel_assignment_id) DO UPDATE SET presentation = EXCLUDED.presentation
          RETURNING id
        `
        if (assigned[0]) assignmentIds.push(assigned[0].id)
      }
      if (!assignmentIds.length) throw new PlatformError('SENSORY_SAMPLE_ASSIGNMENT_INVALID', 'The sample could not be assigned to the sensory session.', 409)
      await tx.$executeRaw`UPDATE v2_trial_samples SET status = 'ASSIGNED' WHERE id = ${parsed.data.sampleId} AND organization_id = ${context.organizationId}`
      await this.audit(tx, context, 'sensory.sample.assign', 'allowed', 'sensory_sample_assignment', assignmentIds[0], { sessionId, sampleId: parsed.data.sampleId, assignmentCount: assignmentIds.length })
      return { id: assignmentIds[0], assignmentIds, sessionId, sampleId: parsed.data.sampleId, blindCode: parsed.data.blindCode }
    })
  }

  async unblindSample(context: PlatformContext, sessionId: string, sampleAssignmentId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'sensory.unblind')
    const parsed = sensoryUnblindRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a reason before unblinding a controlled sample.', 422)
    return this.idempotent(context, 'sensory.samples.unblind', key, { sessionId, sampleAssignmentId, ...parsed.data }, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; blindingStatus: string }>>`
        SELECT id, blinding_status AS "blindingStatus" FROM v2_sensory_sample_assignments
        WHERE id = ${sampleAssignmentId} AND organization_id = ${context.organizationId} AND sensory_session_id = ${sessionId} FOR UPDATE
      `
      if (!rows[0]) throw new PlatformError('SENSORY_SAMPLE_ASSIGNMENT_INVALID', 'The sensory sample assignment is not available.', 404)
      if (rows[0].blindingStatus === 'UNBLINDED') return { id: sampleAssignmentId, status: 'UNBLINDED', alreadyUnblinded: true }
      await tx.$executeRaw`
        UPDATE v2_sensory_sample_assignments
        SET blinding_status = 'UNBLINDED', unblinded_by = ${context.userId}, unblinded_at = now(), unblinding_reason = ${parsed.data.rationale}
        WHERE id = ${sampleAssignmentId} AND organization_id = ${context.organizationId}
      `
      await this.audit(tx, context, 'sensory.sample.unblind', 'allowed', 'sensory_sample_assignment', sampleAssignmentId, { sessionId, rationale: parsed.data.rationale })
      return { id: sampleAssignmentId, status: 'UNBLINDED', alreadyUnblinded: false }
    })
  }

  async transitionSession(context: PlatformContext, sessionId: string, target: 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'VOIDED', rawInput: unknown, key?: string) {
    await this.require(context, 'sensory.manage')
    const parsed = sensorySessionTransitionRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide bounded session transition details.', 422)
    return this.idempotent(context, `sensory.sessions.${target.toLowerCase()}`, key, { sessionId, target, ...parsed.data }, async (tx) => {
      const sessions = await tx.$queryRaw<Array<{ id: string; trialId: string; status: string }>>`SELECT id, trial_id AS "trialId", status FROM v2_sensory_sessions WHERE id = ${sessionId} AND organization_id = ${context.organizationId} FOR UPDATE`
      const session = sessions[0]
      if (!session) throw new PlatformError('SENSORY_SESSION_NOT_FOUND', 'The sensory session is not available in this workspace.', 404)
      const valid: Record<string, string[]> = { DRAFT: ['SCHEDULED', 'OPEN', 'VOIDED'], SCHEDULED: ['OPEN', 'VOIDED'], OPEN: ['CLOSED', 'VOIDED'], IN_PROGRESS: ['CLOSED', 'VOIDED'], CLOSED: [], VOIDED: [] }
      if (!valid[session.status]?.includes(target)) throw new PlatformError('SENSORY_SESSION_STATE_INVALID', 'This session transition is not allowed.', 409)
      if (target === 'CLOSED') {
        const observations = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_sensory_evaluations WHERE organization_id = ${context.organizationId} AND sensory_session_id = ${sessionId} AND status = 'SUBMITTED' LIMIT 1`
        if (!observations[0]) throw new PlatformError('SENSORY_OBSERVATION_REQUIRED', 'At least one final scorecard is required before closing a sensory session.', 409)
      }
      await tx.$executeRaw`
        UPDATE v2_sensory_sessions SET status = ${target}, scheduled_at = CASE WHEN ${target} = 'SCHEDULED' THEN COALESCE(scheduled_at, now()) ELSE scheduled_at END,
          opened_at = CASE WHEN ${target} = 'OPEN' THEN now() ELSE opened_at END, closed_at = CASE WHEN ${target} IN ('CLOSED','VOIDED') THEN now() ELSE closed_at END,
          closed_by = CASE WHEN ${target} IN ('CLOSED','VOIDED') THEN ${context.userId} ELSE closed_by END, updated_at = now()
        WHERE id = ${sessionId} AND organization_id = ${context.organizationId}
      `
      if (target === 'CLOSED') await tx.$executeRaw`UPDATE v2_trials SET status = 'EVALUATED', evaluated_at = now(), updated_at = now() WHERE id = ${session.trialId} AND organization_id = ${context.organizationId} AND status = 'EVALUATION_READY'`
      await this.audit(tx, context, `sensory.session.${target.toLowerCase()}`, 'allowed', 'sensory_session', sessionId, parsed.data)
      return { id: sessionId, status: target }
    })
  }

  private validateEvaluation(form: SensoryFormRow, input: SensoryEvaluationSubmitRequest) {
    const timepoints = form.schema.timepoints ?? []
    if (!timepoints.includes(input.timepoint)) throw new PlatformError('SENSORY_TIMEPOINT_INVALID', 'This scorecard timepoint is not part of the versioned form.', 422)
    const dimensions = form.schema.dimensions ?? []
    const ratings = input.ratings
    for (const dimension of dimensions.filter((item) => item.kind === 'RATING')) {
      const value = ratings[dimension.key]
      if (input.final && dimension.required && value === undefined) throw new PlatformError('SENSORY_RATING_REQUIRED', 'Complete all required numeric sensory dimensions before final submission.', 422)
      if (value !== undefined && (value < dimension.minimum || value > dimension.maximum)) throw new PlatformError('SENSORY_RATING_INVALID', 'A sensory rating is outside the approved form range.', 422)
    }
    for (const key of Object.keys(ratings)) if (!dimensions.some((dimension) => dimension.key === key && dimension.kind === 'RATING')) throw new PlatformError('SENSORY_DIMENSION_INVALID', 'The scorecard contains an unrecognized numeric dimension.', 422)
    const controlled = input.controlledResponses
    for (const dimension of dimensions.filter((item) => item.kind !== 'RATING')) {
      const value = controlled[dimension.key]
      if (input.final && dimension.required && value === undefined) throw new PlatformError('SENSORY_RESPONSE_REQUIRED', 'Complete all required controlled sensory dimensions before final submission.', 422)
      if (value === undefined) continue
      const values = Array.isArray(value) ? value : [value]
      if (dimension.kind === 'TEXT') {
        if (Array.isArray(value)) throw new PlatformError('SENSORY_RESPONSE_INVALID', 'A text sensory response must be a single bounded observation.', 422)
        continue
      }
      if (!dimension.options?.length) throw new PlatformError('SENSORY_FORM_INVALID', 'The versioned sensory form has no controlled options for this dimension.', 409)
      if (values.some((item) => !dimension.options?.includes(item))) throw new PlatformError('SENSORY_RESPONSE_INVALID', 'A controlled sensory response is outside the approved form vocabulary.', 422)
      if (dimension.kind === 'ORDINAL' && Array.isArray(value)) throw new PlatformError('SENSORY_RESPONSE_INVALID', 'An ordinal sensory response must select one approved option.', 422)
    }
    for (const key of Object.keys(controlled)) if (!dimensions.some((dimension) => dimension.key === key && dimension.kind !== 'RATING')) throw new PlatformError('SENSORY_DIMENSION_INVALID', 'The scorecard contains an unrecognized controlled dimension.', 422)
    const vocabulary = new Set((form.schema.descriptorVocabulary ?? []).map((item) => item.toLowerCase()))
    if (vocabulary.size && input.descriptors.some((item) => !vocabulary.has(item.toLowerCase()))) throw new PlatformError('SENSORY_DESCRIPTOR_INVALID', 'Descriptors must use the controlled form vocabulary.', 422)
  }

  async submitEvaluation(context: PlatformContext, sessionId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'sensory.evaluate')
    const parsed = sensoryEvaluationSubmitRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a bounded scorecard for an assigned sample.', 422)
    return this.idempotent(context, 'sensory.evaluations.submit', key, { sessionId, ...parsed.data }, async (tx) => this.writeEvaluation(tx, context, sessionId, parsed.data, { evaluatorUserId: context.userId }))
  }

  private async writeEvaluation(tx: Transaction, context: PlatformContext, sessionId: string, input: SensoryEvaluationSubmitRequest, actor: { evaluatorUserId?: string; publicLinkId?: string }) {
    const sessions = await tx.$queryRaw<Array<{ id: string; status: string; formVersionId: string }>>`
      SELECT id, status, form_version_id AS "formVersionId" FROM v2_sensory_sessions WHERE id = ${sessionId} AND organization_id = ${context.organizationId} FOR UPDATE
    `
    const session = sessions[0]
    if (!session || !['OPEN', 'IN_PROGRESS'].includes(session.status)) throw new PlatformError('SENSORY_SESSION_NOT_OPEN', 'This sensory session is not open for evaluation.', 409)
    let panelAssignmentId: string | null = null
    if (actor.evaluatorUserId) {
      const panelist = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_sensory_panel_assignments WHERE organization_id = ${context.organizationId} AND sensory_session_id = ${sessionId} AND panelist_user_id = ${actor.evaluatorUserId} AND status = 'ACTIVE'`
      if (!panelist[0]) throw new PlatformError('SENSORY_PANELIST_NOT_ASSIGNED', 'Only an assigned panelist can submit this internal scorecard.', 403)
      panelAssignmentId = panelist[0].id
    }
    const assignments = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM v2_sensory_sample_assignments WHERE id = ${input.sampleAssignmentId} AND organization_id = ${context.organizationId} AND sensory_session_id = ${sessionId}
        AND panel_assignment_id IS NOT DISTINCT FROM ${panelAssignmentId}
    `
    if (!assignments[0]) throw new PlatformError('SENSORY_SAMPLE_ASSIGNMENT_INVALID', 'The sample is not assigned to this evaluator in the sensory session.', 404)
    const forms = await tx.$queryRaw<SensoryFormRow[]>`SELECT id, schema, minimum_evidence_count AS "minimumEvidenceCount", status FROM v2_sensory_form_versions WHERE id = ${session.formVersionId} AND organization_id = ${context.organizationId}`
    if (!forms[0] || forms[0].status !== 'ACTIVE') throw new PlatformError('SENSORY_FORM_NOT_FOUND', 'The session form is not available.', 409)
    this.validateEvaluation(forms[0], input)
    const current = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status FROM v2_sensory_evaluations WHERE organization_id = ${context.organizationId} AND sensory_session_id = ${sessionId} AND sample_assignment_id = ${input.sampleAssignmentId}
        AND panel_assignment_id IS NOT DISTINCT FROM ${panelAssignmentId} AND public_link_id IS NOT DISTINCT FROM ${actor.publicLinkId ?? null} AND timepoint_key = ${input.timepoint} FOR UPDATE
    `
    // Internal final submissions are immutable. A token-scoped public link may
    // correct its own timepoint while the session remains open; the change is
    // revisioned and separately audited below.
    if (current[0]?.status === 'SUBMITTED' && !actor.publicLinkId) throw new PlatformError('SENSORY_EVALUATION_FINAL', 'A submitted scorecard cannot be overwritten.', 409)
    const payload = { ratings: input.ratings, controlledResponses: input.controlledResponses, descriptors: input.descriptors, observation: input.observation ?? null, comparison: input.comparison ?? null, preferenceRank: input.preferenceRank ?? null }
    const id = current[0]?.id ?? identifier('seval')
    const status = input.final || (Boolean(actor.publicLinkId) && current[0]?.status === 'SUBMITTED') ? 'SUBMITTED' : 'DRAFT'
    const comparisons = { controlledResponses: input.controlledResponses, comparison: input.comparison ?? null }
    if (current[0]) {
      await tx.$executeRaw`
        UPDATE v2_sensory_evaluations SET ratings = ${JSON.stringify(input.ratings)}::jsonb, descriptors = ${JSON.stringify(input.descriptors)}::jsonb,
          observations = ${input.observation ?? null}, comparisons = ${JSON.stringify(comparisons)}::jsonb, preference_rank = ${input.preferenceRank ?? null}, status = ${status},
          revision = revision + 1, submitted_at = CASE WHEN ${status} = 'SUBMITTED' THEN now() ELSE submitted_at END, updated_at = now()
        WHERE id = ${id} AND organization_id = ${context.organizationId}
      `
    } else {
      await tx.$executeRaw`
        INSERT INTO v2_sensory_evaluations (id, organization_id, sensory_session_id, form_version_id, sample_assignment_id, panel_assignment_id, evaluator_user_id, public_link_id, timepoint_key, ratings, descriptors, observations, comparisons, preference_rank, status, revision, submitted_at)
        VALUES (${id}, ${context.organizationId}, ${sessionId}, ${session.formVersionId}, ${input.sampleAssignmentId}, ${panelAssignmentId}, ${actor.evaluatorUserId ?? null}, ${actor.publicLinkId ?? null}, ${input.timepoint}, ${JSON.stringify(input.ratings)}::jsonb, ${JSON.stringify(input.descriptors)}::jsonb, ${input.observation ?? null}, ${JSON.stringify(comparisons)}::jsonb, ${input.preferenceRank ?? null}, ${status}, 1, ${input.final ? new Date() : null})
      `
    }
    if (session.status === 'OPEN') await tx.$executeRaw`UPDATE v2_sensory_sessions SET status = 'IN_PROGRESS', updated_at = now() WHERE id = ${sessionId} AND organization_id = ${context.organizationId}`
    await this.audit(tx, context, actor.publicLinkId ? 'sensory.public_evaluation.submit' : 'sensory.evaluation.submit', 'allowed', 'sensory_evaluation', id, { sessionId, sampleAssignmentId: input.sampleAssignmentId, timepoint: input.timepoint, final: input.final, payloadHash: digest(payload) })
    return { id, sessionId, timepoint: input.timepoint, final: input.final }
  }

  async createPublicLink(context: PlatformContext, sessionId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'sensory.manage')
    const parsed = sensoryPublicLinkCreateRequestSchema.safeParse(rawInput)
    if (!parsed.success || new Date(parsed.data.expiresAt).getTime() <= Date.now()) throw new PlatformError('INVALID_INPUT', 'Provide a future, bounded public scorecard link.', 422)
    return this.idempotent(context, 'sensory.public_links.create', key, { sessionId, ...parsed.data }, async (tx) => {
      const assignment = await tx.$queryRaw<Array<{ id: string; timepoints: unknown }>>`
        SELECT a.id, f.schema -> 'timepoints' AS timepoints
        FROM v2_sensory_sample_assignments a
        JOIN v2_sensory_sessions s ON s.id = a.sensory_session_id AND s.organization_id = a.organization_id
        JOIN v2_sensory_form_versions f ON f.id = s.form_version_id AND f.organization_id = s.organization_id
        WHERE a.id = ${parsed.data.sampleAssignmentId} AND a.organization_id = ${context.organizationId} AND a.sensory_session_id = ${sessionId}
          AND a.panel_assignment_id IS NULL AND s.status IN ('DRAFT','SCHEDULED','OPEN','IN_PROGRESS')
      `
      if (!assignment[0]) throw new PlatformError('SENSORY_SAMPLE_ASSIGNMENT_INVALID', 'The selected sensory sample is not eligible for a public link.', 409)
      const token = bytesToBase64Url(randomBytes(32))
      const id = identifier('spublic')
      await tx.$executeRaw`
        INSERT INTO v2_sensory_public_links (id, organization_id, sensory_session_id, sample_assignment_id, token_hash, presentation_mode, allowed_timepoints, expires_at, max_submissions, submission_count, issued_by)
        VALUES (${id}, ${context.organizationId}, ${sessionId}, ${parsed.data.sampleAssignmentId}, ${tokenHash(token)}, ${parsed.data.presentationMode}, ${JSON.stringify(Array.isArray(assignment[0].timepoints) ? assignment[0].timepoints : [])}::jsonb, ${new Date(parsed.data.expiresAt)}, ${parsed.data.maxSubmissions}, 0, ${context.userId})
      `
      await this.audit(tx, context, 'sensory.public_link.create', 'allowed', 'sensory_public_link', id, { sessionId, sampleAssignmentId: parsed.data.sampleAssignmentId, presentationMode: parsed.data.presentationMode, expiresAt: parsed.data.expiresAt })
      return { id, token, expiresAt: parsed.data.expiresAt, presentationMode: parsed.data.presentationMode }
    })
  }

  async revokePublicLink(context: PlatformContext, linkId: string, key?: string) {
    await this.require(context, 'sensory.manage')
    return this.idempotent(context, 'sensory.public_links.revoke', key, { linkId }, async (tx) => {
      const count = await tx.$executeRaw`UPDATE v2_sensory_public_links SET revoked_at = now(), revoked_by = ${context.userId} WHERE id = ${linkId} AND organization_id = ${context.organizationId} AND revoked_at IS NULL`
      if (!count) throw new PlatformError('SENSORY_PUBLIC_LINK_NOT_FOUND', 'The active public scorecard link is not available.', 404)
      await this.audit(tx, context, 'sensory.public_link.revoke', 'allowed', 'sensory_public_link', linkId)
      return { id: linkId, status: 'REVOKED' }
    })
  }

  private async withPublicLink<T>(token: string, action: (tx: Transaction, link: PublicLinkRow) => Promise<T>) {
    if (!token || token.length < 32 || token.length > 256) throw new PlatformError('PUBLIC_LINK_INVALID', 'This scorecard link is invalid or unavailable.', 404)
    return this.client.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<PublicLinkRow[]>`SELECT id, organization_id AS "organizationId", sensory_session_id AS "sensorySessionId", sample_assignment_id AS "sampleAssignmentId", presentation_mode AS "presentationMode", expires_at AS "expiresAt", max_submissions AS "maxSubmissions", submission_count AS "submissionCount" FROM v2_resolve_sensory_public_link(${tokenHash(token)})`
      const link = rows[0]
      if (!link || link.expiresAt.getTime() <= Date.now()) throw new PlatformError('PUBLIC_LINK_INVALID', 'This scorecard link is invalid or unavailable.', 404)
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${link.organizationId}, true), set_config('app.user_id', ${`public_${link.id}`}, true)`
      return action(tx, link)
    })
  }

  private async publicIdempotent<T extends JsonRecord>(tx: Transaction, link: PublicLinkRow, key: string | undefined, request: unknown, action: () => Promise<T>) {
    if (!key || key.length < 12 || key.length > 200) throw new PlatformError('IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key for this scorecard submission.', 428)
    const requestHash = digest(request)
    const existing = await tx.$queryRaw<Array<{ requestHash: string; response: unknown }>>`
      SELECT request_hash AS "requestHash", response
      FROM v2_sensory_public_submission_requests
      WHERE organization_id = ${link.organizationId} AND public_link_id = ${link.id} AND idempotency_key = ${key}
    `
    if (existing[0]) {
      if (existing[0].requestHash !== requestHash) throw new PlatformError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different scorecard submission.', 409)
      if (!existing[0].response) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original scorecard submission is still being completed.', 409)
      return existing[0].response as T
    }
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO v2_sensory_public_submission_requests (id, organization_id, public_link_id, idempotency_key, request_hash)
      VALUES (${identifier('publicidem')}, ${link.organizationId}, ${link.id}, ${key}, ${requestHash})
      ON CONFLICT (organization_id, public_link_id, idempotency_key) DO NOTHING
      RETURNING id
    `
    if (!inserted[0]) {
      const concurrent = await tx.$queryRaw<Array<{ requestHash: string; response: unknown }>>`
        SELECT request_hash AS "requestHash", response
        FROM v2_sensory_public_submission_requests
        WHERE organization_id = ${link.organizationId} AND public_link_id = ${link.id} AND idempotency_key = ${key}
      `
      if (concurrent[0]?.requestHash !== requestHash) throw new PlatformError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different scorecard submission.', 409)
      if (!concurrent[0]?.response) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original scorecard submission is still being completed.', 409)
      return concurrent[0].response as T
    }
    const result = await action()
    await tx.$executeRaw`
      UPDATE v2_sensory_public_submission_requests SET response = ${JSON.stringify(result)}::jsonb
      WHERE organization_id = ${link.organizationId} AND public_link_id = ${link.id} AND idempotency_key = ${key}
    `
    return result
  }

  async publicPresentation(token: string) {
    return this.withPublicLink(token, async (tx, link) => {
      const rows = await tx.$queryRaw<Array<{ sessionId: string; sessionStatus: string; blindCode: string | null; sampleCode: string; trialTitle: string; instructions: string | null; formSchema: JsonRecord }>>`
        SELECT s.id AS "sessionId", s.status AS "sessionStatus", a.presentation ->> 'blindCode' AS "blindCode", sample.sample_code AS "sampleCode", t.title AS "trialTitle", s.instructions, f.schema AS "formSchema"
        FROM v2_sensory_public_links l
        JOIN v2_sensory_sample_assignments a ON a.id = l.sample_assignment_id AND a.organization_id = l.organization_id
        JOIN v2_sensory_sessions s ON s.id = a.sensory_session_id AND s.organization_id = a.organization_id
        JOIN v2_sensory_form_versions f ON f.id = s.form_version_id AND f.organization_id = s.organization_id
        JOIN v2_trial_samples sample ON sample.id = a.sample_id AND sample.organization_id = a.organization_id
        JOIN v2_trials t ON t.id = s.trial_id AND t.organization_id = s.organization_id
        WHERE l.id = ${link.id} AND l.organization_id = ${link.organizationId}
      `
      const row = rows[0]
      if (!row || !['OPEN', 'IN_PROGRESS'].includes(row.sessionStatus)) throw new PlatformError('PUBLIC_LINK_NOT_OPEN', 'This scorecard session is not open.', 409)
      return {
        presentationMode: link.presentationMode,
        sampleCode: link.presentationMode === 'BLIND' ? (row.blindCode ?? 'BLIND') : row.sampleCode,
        title: link.presentationMode === 'BRAND_REVIEW' ? row.trialTitle : 'Blind sensory sample',
        instructions: row.instructions ?? 'Record your sensory observations using the approved scorecard.',
        form: { timepoints: Array.isArray(row.formSchema.timepoints) ? row.formSchema.timepoints : [], dimensions: Array.isArray(row.formSchema.dimensions) ? row.formSchema.dimensions : [], descriptorVocabulary: Array.isArray(row.formSchema.descriptorVocabulary) ? row.formSchema.descriptorVocabulary : [] },
      }
    })
  }

  async submitPublicEvaluation(token: string, rawInput: unknown, key?: string) {
    const parsed = sensoryPublicEvaluationRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a bounded public sensory scorecard.', 422)
    return this.withPublicLink(token, async (tx, link) => this.publicIdempotent(tx, link, key, parsed.data, async () => {
      const locked = await tx.$queryRaw<Array<{ maxSubmissions: number; submissionCount: number; allowedTimepoints: unknown }>>`
        SELECT max_submissions AS "maxSubmissions", submission_count AS "submissionCount", allowed_timepoints AS "allowedTimepoints"
        FROM v2_sensory_public_links WHERE id = ${link.id} AND organization_id = ${link.organizationId} AND revoked_at IS NULL FOR UPDATE
      `
      if (!locked[0] || locked[0].submissionCount >= locked[0].maxSubmissions) throw new PlatformError('PUBLIC_LINK_RATE_LIMITED', 'This scorecard link has reached its allowed submission limit.', 429)
      const allowedTimepoints = Array.isArray(locked[0].allowedTimepoints) ? locked[0].allowedTimepoints : []
      if (!allowedTimepoints.includes(parsed.data.timepoint)) throw new PlatformError('SENSORY_TIMEPOINT_INVALID', 'This timepoint is not available through this scorecard link.', 422)
      const sessionRows = await tx.$queryRaw<Array<{ sessionId: string }>>`SELECT sensory_session_id AS "sessionId" FROM v2_sensory_sample_assignments WHERE id = ${link.sampleAssignmentId} AND organization_id = ${link.organizationId}`
      if (!sessionRows[0]) throw new PlatformError('PUBLIC_LINK_INVALID', 'This scorecard link is invalid or unavailable.', 404)
      const publicContext: PlatformContext = { userId: `public_${link.id}`, organizationId: link.organizationId, sessionId: `public_${link.id}`, role: 'Brand', hostname: 'public-link' }
      const result = await this.writeEvaluation(tx, publicContext, sessionRows[0].sessionId, { ...parsed.data, sampleAssignmentId: link.sampleAssignmentId }, { publicLinkId: link.id })
      await tx.$executeRaw`UPDATE v2_sensory_public_links SET submission_count = submission_count + 1, last_used_at = now() WHERE id = ${link.id} AND organization_id = ${link.organizationId} AND submission_count < max_submissions`
      return result
    }))
  }

  async decideTrial(context: PlatformContext, trialId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'trials.decide')
    const parsed = trialDecisionCreateRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a human decision and rationale.', 422)
    return this.idempotent(context, 'trials.decide', key, { trialId, ...parsed.data }, async (tx) => {
      const trial = await this.trial(tx, context, trialId, true)
      requireTransition(trial.status, 'CLOSED')
      const sessions = await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT id, status FROM v2_sensory_sessions WHERE organization_id = ${context.organizationId} AND trial_id = ${trialId} FOR UPDATE`
      if (!sessions.length || sessions.some((session) => session.status !== 'CLOSED')) throw new PlatformError('TRIAL_SENSORY_NOT_CLOSED', 'Close all Trial sensory sessions before recording a decision.', 409)
      const preparations = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_trial_preparations WHERE organization_id = ${context.organizationId} AND trial_id = ${trialId} AND status = 'CONFIRMED' LIMIT 1`
      if (!preparations[0]) throw new PlatformError('TRIAL_PREPARATION_REQUIRED', 'A Trial decision requires confirmed actual preparation.', 409)
      const id = identifier('trialdecision')
      const evidenceSnapshot = await this.memoryProjection(tx, context, trialId)
      const currentVersion = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_trial_versions WHERE organization_id = ${context.organizationId} AND trial_id = ${trialId} AND status = 'CURRENT' ORDER BY version_number DESC LIMIT 1 FOR UPDATE`
      if (!currentVersion[0]) throw new PlatformError('TRIAL_VERSION_NOT_FOUND', 'The Trial does not have a current immutable version.', 409)
      await tx.$executeRaw`
        INSERT INTO v2_trial_decisions (id, organization_id, trial_id, trial_version_id, decision, rationale, evidence_snapshot, evidence_hash, decided_by)
        VALUES (${id}, ${context.organizationId}, ${trialId}, ${currentVersion[0].id}, ${parsed.data.decision}, ${parsed.data.rationale}, ${JSON.stringify(evidenceSnapshot)}::jsonb, ${digest(evidenceSnapshot)}, ${context.userId})
      `
      await this.persistMemory(tx, context, trialId, evidenceSnapshot, id)
      await this.createTrialVersion(tx, context, trial, 'CLOSED', { decision: parsed.data.decision, rationale: parsed.data.rationale, evidenceHash: digest(evidenceSnapshot) })
      await tx.$executeRaw`UPDATE v2_trials SET status = 'CLOSED', updated_at = now() WHERE id = ${trialId} AND organization_id = ${context.organizationId}`
      await this.audit(tx, context, 'trials.decide', 'allowed', 'trial_decision', id, { trialId, decision: parsed.data.decision, evidenceStatus: evidenceSnapshot.confidence })
      return { id, trialId, status: 'CLOSED', decision: parsed.data.decision, evidence: evidenceSnapshot }
    })
  }

  private async memoryProjection(tx: Transaction, context: PlatformContext, trialId: string): Promise<PrivateSensoryMemoryProjection> {
    const rows = await tx.$queryRaw<Array<{ ratings: JsonRecord; descriptors: unknown; evaluatorUserId: string | null; publicLinkId: string | null; timepoint: string; minimumEvidenceCount: number }>>`
      SELECT e.ratings, e.descriptors, e.evaluator_user_id AS "evaluatorUserId", e.public_link_id AS "publicLinkId", e.timepoint_key AS timepoint, f.minimum_evidence_count AS "minimumEvidenceCount"
      FROM v2_sensory_evaluations e
      JOIN v2_sensory_sessions s ON s.id = e.sensory_session_id AND s.organization_id = e.organization_id
      JOIN v2_sensory_form_versions f ON f.id = s.form_version_id AND f.organization_id = s.organization_id
      WHERE e.organization_id = ${context.organizationId} AND s.trial_id = ${trialId} AND s.status = 'CLOSED' AND e.status = 'SUBMITTED'
      ORDER BY e.created_at ASC, e.id ASC
    `
    const identity = new Set(rows.map((row) => row.evaluatorUserId ?? row.publicLinkId).filter((value): value is string => Boolean(value)))
    const minimumEvidenceCount = rows.length ? Math.max(...rows.map((row) => row.minimumEvidenceCount)) : 3
    const aggregate = (source: Array<[string, number]>) => {
      const grouped = new Map<string, number[]>()
      for (const [key, value] of source) grouped.set(key, [...(grouped.get(key) ?? []), value])
      return Object.fromEntries([...grouped.entries()].map(([key, values]) => [key, Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4))]))
    }
    const ratings: Array<[string, number]> = []
    const timepoints: Array<[string, string, number]> = []
    const descriptorCount = new Map<string, number>()
    for (const row of rows) {
      for (const [key, value] of Object.entries(json(row.ratings))) if (typeof value === 'number' && Number.isFinite(value)) { ratings.push([key, value]); timepoints.push([row.timepoint, key, value]) }
      if (Array.isArray(row.descriptors)) for (const descriptor of row.descriptors) if (typeof descriptor === 'string') descriptorCount.set(descriptor.toLowerCase(), (descriptorCount.get(descriptor.toLowerCase()) ?? 0) + 1)
    }
    const timepointProfile = Object.fromEntries([...new Set(timepoints.map(([timepoint]) => timepoint))].map((timepoint) => [timepoint, aggregate(timepoints.filter(([item]) => item === timepoint).map(([, key, value]) => [key, value]))]))
    const evidenceCount = identity.size
    const confidence = evidenceCount < minimumEvidenceCount ? 'NOT_ENOUGH_EVIDENCE' as const : 'VERIFIED' as const
    return {
      evidenceCount,
      minimumEvidenceCount,
      confidence,
      descriptorProfile: Object.fromEntries([...descriptorCount.entries()].map(([descriptor, count]) => [descriptor, Number((Math.min(10, count / Math.max(1, evidenceCount) * 10)).toFixed(4))])),
      performanceProfile: aggregate(ratings),
      timepointProfile,
      conclusion: confidence === 'NOT_ENOUGH_EVIDENCE' ? 'Not enough independent scorecards to infer a tenant sensory conclusion.' : 'Tenant-private aggregate derived from completed, versioned sensory scorecards.',
    }
  }

  private async persistMemory(tx: Transaction, context: PlatformContext, trialId: string, projection: PrivateSensoryMemoryProjection, decisionId: string) {
    const current = await tx.$queryRaw<Array<{ id: string; currentVersionNumber: number }>>`SELECT id, current_version_number AS "currentVersionNumber" FROM v2_private_sensory_memories WHERE organization_id = ${context.organizationId} AND memory_kind = 'TRIAL_OUTCOME' AND subject_type = 'TRIAL' AND subject_id = ${trialId} FOR UPDATE`
    const memoryId = current[0]?.id ?? identifier('smemory')
    const sourceRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT e.id FROM v2_sensory_evaluations e JOIN v2_sensory_sessions s ON s.id = e.sensory_session_id AND s.organization_id = e.organization_id
      WHERE e.organization_id = ${context.organizationId} AND s.trial_id = ${trialId} AND s.status = 'CLOSED' AND e.status = 'SUBMITTED' ORDER BY e.id ASC
    `
    const sourceSetHash = digest(sourceRows.map((row) => row.id))
    const nextVersion = (current[0]?.currentVersionNumber ?? 0) + 1
    if (!current[0]) await tx.$executeRaw`
      INSERT INTO v2_private_sensory_memories (id, organization_id, memory_kind, subject_type, subject_id, current_version_number)
      VALUES (${memoryId}, ${context.organizationId}, 'TRIAL_OUTCOME', 'TRIAL', ${trialId}, 0)
    `
    const versionId = identifier('smemoryver')
    const evidenceStatus = projection.confidence === 'NOT_ENOUGH_EVIDENCE' ? 'NOT_ENOUGH_EVIDENCE' : 'SUFFICIENT'
    const numericConfidence = projection.evidenceCount < projection.minimumEvidenceCount ? 0 : Math.min(1, Number((projection.evidenceCount / Math.max(1, projection.minimumEvidenceCount)).toFixed(4)))
    await tx.$executeRaw`
      INSERT INTO v2_private_sensory_memory_versions (id, organization_id, memory_id, version_number, aggregation_algorithm_version, input_evidence_hash, source_set_hash, profile, evidence_count, confidence, evidence_status, generated_by)
      VALUES (${versionId}, ${context.organizationId}, ${memoryId}, ${nextVersion}, 'private-sensory-memory/1', ${digest(projection)}, ${sourceSetHash}, ${JSON.stringify({ ...projection, decisionId })}::jsonb, ${projection.evidenceCount}, ${numericConfidence}, ${evidenceStatus}, ${context.userId})
    `
    for (const source of sourceRows) await tx.$executeRaw`INSERT INTO v2_private_sensory_memory_sources (id, organization_id, memory_version_id, source_kind, source_id, source_hash) VALUES (${identifier('smemsrc')}, ${context.organizationId}, ${versionId}, 'SENSORY_EVALUATION', ${source.id}, ${digest({ source: source.id })})`
    await tx.$executeRaw`UPDATE v2_private_sensory_memories SET current_version_number = ${nextVersion}, updated_at = now() WHERE id = ${memoryId} AND organization_id = ${context.organizationId}`
    return { memoryId, versionId, versionNumber: nextVersion }
  }

  async retrieveTrialMemory(context: PlatformContext, formulaVersionId: string) {
    if (await this.trialReadScope(context) !== 'ALL') throw new PlatformError('TENANT_ACCESS_DENIED', 'Private sensory memory is not available to assignment-scoped reviewers.', 403)
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ trialId: string; title: string; decision: string | null; evidence: PrivateSensoryMemoryProjection; generatedAt: Date }>>`
        SELECT t.id AS "trialId", t.title, d.decision, mv.profile AS evidence, mv.generated_at AS "generatedAt"
        FROM v2_trials t
        JOIN v2_private_sensory_memories m ON m.subject_id = t.id AND m.subject_type = 'TRIAL' AND m.memory_kind = 'TRIAL_OUTCOME' AND m.organization_id = t.organization_id
        JOIN v2_private_sensory_memory_versions mv ON mv.memory_id = m.id AND mv.organization_id = m.organization_id AND mv.version_number = m.current_version_number
        LEFT JOIN LATERAL (SELECT decision FROM v2_trial_decisions d WHERE d.organization_id = t.organization_id AND d.trial_id = t.id ORDER BY d.decided_at DESC LIMIT 1) d ON true
        WHERE t.organization_id = ${context.organizationId} AND t.formula_version_id = ${formulaVersionId} AND t.status = 'CLOSED'
        ORDER BY mv.generated_at DESC, t.id DESC LIMIT 20
      `
      return rows.map((row) => ({ trialId: row.trialId, title: row.title, decision: row.decision, evidence: row.evidence, generatedAt: row.generatedAt.toISOString(), provenance: { family: 'PRIVATE_SENSORY_MEMORY', aggregation: 'private-sensory-memory/1' } }))
    })
  }

  async detail(context: PlatformContext, trialId: string) {
    const scope = await this.trialReadScope(context)
    const [viewSensitive, viewInventory, viewCost, viewSensory, viewDocuments] = await Promise.all(['formula.viewSensitive', 'inventory.view', 'costing.view', 'sensory.view', 'documents.view'].map((permission) => this.can(context, permission)))
    return this.scoped(context, async (tx) => {
      const trial = await this.trial(tx, context, trialId)
      if (scope === 'ASSIGNED') await this.assertAssignedTrial(tx, context, trialId)
      const preparations = scope === 'ALL' ? await tx.$queryRaw<Array<{ id: string; status: string; weighingSessionId: string; confirmedAt: Date | null }>>`
        SELECT id, status, lab_weighing_session_id AS "weighingSessionId", confirmed_at AS "confirmedAt" FROM v2_trial_preparations WHERE organization_id = ${context.organizationId} AND trial_id = ${trialId} ORDER BY created_at ASC
      ` : []
      const samples = scope === 'ALL' ? await tx.$queryRaw<Array<{ id: string; sampleCode: string; status: string; concentrationPercent: Prisma.Decimal | null; expiresAt: Date | null }>>`
        SELECT id, sample_code AS "sampleCode", status, concentration_percent AS "concentrationPercent", expires_at AS "expiresAt" FROM v2_trial_samples WHERE organization_id = ${context.organizationId} AND trial_id = ${trialId} ORDER BY created_at ASC
      ` : []
      const sessions = await tx.$queryRaw<Array<{ id: string; title: string; status: string; blindMode: boolean; formVersionId: string; allowPeerResultsAfterClose: boolean }>>`
        SELECT id, title, status, blind_mode AS "blindMode", form_version_id AS "formVersionId", allow_peer_results_after_close AS "allowPeerResultsAfterClose" FROM v2_sensory_sessions WHERE organization_id = ${context.organizationId} AND trial_id = ${trialId} ORDER BY created_at ASC
      `
      const assignedSessions = scope === 'ALL' ? sessions : await tx.$queryRaw<Array<{ id: string; title: string; status: string; blindMode: boolean; formVersionId: string; allowPeerResultsAfterClose: boolean }>>`
        SELECT session.id, session.title, session.status, session.blind_mode AS "blindMode", session.form_version_id AS "formVersionId", session.allow_peer_results_after_close AS "allowPeerResultsAfterClose"
        FROM v2_sensory_sessions session
        JOIN v2_sensory_panel_assignments panel ON panel.organization_id = session.organization_id AND panel.sensory_session_id = session.id
        WHERE session.organization_id = ${context.organizationId} AND session.trial_id = ${trialId}
          AND panel.panelist_user_id = ${context.userId} AND panel.status = 'ACTIVE'
        ORDER BY session.created_at ASC, session.id ASC
      `
      const decisions = scope === 'ALL' ? await tx.$queryRaw<Array<{ id: string; decision: string; rationale: string; decidedAt: Date }>>`SELECT id, decision, rationale, decided_at AS "decidedAt" FROM v2_trial_decisions WHERE organization_id = ${context.organizationId} AND trial_id = ${trialId} ORDER BY decided_at DESC` : []
      const evidence = scope === 'ALL' ? await tx.$queryRaw<Array<{ id: string; evidenceKind: string; objectRef: string; contentHash: string; status: string; createdAt: Date }>>`
        SELECT id, evidence_kind AS "evidenceKind", object_ref AS "objectRef", content_hash AS "contentHash", status, created_at AS "createdAt"
        FROM v2_trial_evidence WHERE organization_id = ${context.organizationId} AND trial_id = ${trialId} AND status = 'ACTIVE' ORDER BY created_at ASC, id ASC
      ` : []
      const usages = scope === 'ALL' && viewInventory ? await tx.$queryRaw<Array<{ materialId: string; lotId: string; actualGrams: Prisma.Decimal; landedUnitCost: Prisma.Decimal | null; currency: string | null }>>`
        SELECT material_id AS "materialId", lot_id AS "lotId", actual_g AS "actualGrams", landed_unit_cost AS "landedUnitCost", currency FROM v2_trial_material_usages u JOIN v2_trial_preparations p ON p.id = u.trial_preparation_id AND p.organization_id = u.organization_id WHERE u.organization_id = ${context.organizationId} AND p.trial_id = ${trialId}
      ` : []
      let ownEvaluations: Array<{ sessionId: string; sampleAssignmentId: string; timepoint: string; final: boolean }> = []
      if (viewSensory) ownEvaluations = await tx.$queryRaw<Array<{ sessionId: string; sampleAssignmentId: string; timepoint: string; final: boolean }>>`
        SELECT e.sensory_session_id AS "sessionId", e.sample_assignment_id AS "sampleAssignmentId", e.timepoint_key AS timepoint, (e.status = 'SUBMITTED') AS final FROM v2_sensory_evaluations e WHERE e.organization_id = ${context.organizationId} AND e.evaluator_user_id = ${context.userId} AND e.sensory_session_id IN (${Prisma.join(assignedSessions.map((session) => session.id).length ? assignedSessions.map((session) => session.id) : ['__none__'])}) ORDER BY e.created_at ASC
      `
      return {
        trial: {
          id: trial.id, title: scope === 'ALL' ? trial.title : 'Assigned sensory evaluation', sourceKind: scope === 'ALL' ? trial.sourceKind : 'BLIND_PRESENTATION', formulaVersionId: scope === 'ALL' && viewSensitive ? trial.formulaVersionId : undefined,
          formula: scope === 'ALL' && viewSensitive ? trial.formulaSnapshot : undefined, plannedMassGrams: scope === 'ALL' ? asNumber(trial.plannedMassGrams) : 0, status: trial.status, revision: scope === 'ALL' ? trial.revision : 0,
          createdAt: trial.createdAt.toISOString(), updatedAt: trial.updatedAt.toISOString(),
        },
        preparations: preparations.map((item) => ({ ...item, confirmedAt: iso(item.confirmedAt) })),
        samples: samples.map((item) => ({ ...item, concentrationPercent: item.concentrationPercent === null ? null : asNumber(item.concentrationPercent), expiresAt: iso(item.expiresAt) })),
        sessions: assignedSessions,
        decisions: decisions.map((item) => ({ ...item, decidedAt: item.decidedAt.toISOString() })),
        evidence: evidence.map((item) => ({ id: item.id, evidenceKind: item.evidenceKind, contentHash: item.contentHash, status: item.status, createdAt: item.createdAt.toISOString(), ...(viewDocuments ? { objectRef: item.objectRef } : {}) })),
        usages: usages.map((item) => ({ materialId: item.materialId, lotId: item.lotId, actualGrams: asNumber(item.actualGrams), ...(viewCost ? { landedUnitCost: item.landedUnitCost === null ? null : asNumber(item.landedUnitCost), currency: item.currency } : {}) })),
        evaluations: ownEvaluations,
      }
    })
  }
}
