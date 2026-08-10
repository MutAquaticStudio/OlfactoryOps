import { createHash, randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import {
  createCandidateRequestSchema,
  createDesignProjectRequestSchema,
  createFormulaDraftRequestSchema,
  createFormulaProjectRequestSchema,
  feedbackRequestSchema,
  replaceFormulaDraftComponentsRequestSchema,
  reviewDesignBriefRequestSchema,
  shareCandidateRequestSchema,
  type CandidateEvidenceReferences,
  type FormulaComponent,
} from '../../../packages/contracts/src/formula-intelligence.js'
import { PlatformError, PlatformService } from '../../platform/src/service.js'
import type { PlatformContext } from '../../platform/src/types.js'
import { calculateFormulaMath } from './formula-math.js'

type Transaction = Prisma.TransactionClient
type JsonRecord = Record<string, unknown>
type IdempotencyRow = { requestHash: string; response: unknown }
type FormulaDraftRow = { id: string; formulaProjectId: string; name: string; targetGrams: number; status: string; originType: string; originReferenceId: string | null }
type FormulaProjectRow = { id: string; name: string; formulaType: 'ACCORD' | 'FINE_FRAGRANCE'; finalProductContext: unknown; concentratePercent: number | null; status: string }

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as JsonRecord).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`
  return JSON.stringify(value)
}
const digest = (value: unknown) => createHash('sha256').update(stableJson(value)).digest('hex')
const identifier = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '')}`

/**
 * Formula is a server-owned aggregate. Model output can propose a candidate,
 * but the only path to an approved version runs the deterministic calculator,
 * eligibility checks, permission checks, an immutable snapshot and audit.
 */
export class FormulaService {
  constructor(private readonly client: PrismaClient, private readonly platform: PlatformService) {}

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

  private async project(tx: Transaction, context: PlatformContext, projectId: string): Promise<FormulaProjectRow> {
    const rows = await tx.$queryRaw<FormulaProjectRow[]>`
      SELECT id, name, formula_type AS "formulaType", final_product_context AS "finalProductContext", concentrate_percent AS "concentratePercent", status
      FROM v2_formula_projects WHERE id = ${projectId} AND organization_id = ${context.organizationId}
    `
    if (!rows[0]) throw new PlatformError('FORMULA_PROJECT_NOT_FOUND', 'The requested formula project is not available in this workspace.', 404)
    return rows[0]
  }

  private async draft(tx: Transaction, context: PlatformContext, draftId: string): Promise<FormulaDraftRow> {
    const rows = await tx.$queryRaw<FormulaDraftRow[]>`
      SELECT id, formula_project_id AS "formulaProjectId", name, target_grams AS "targetGrams", status, origin_type AS "originType", origin_reference_id AS "originReferenceId"
      FROM v2_formula_drafts WHERE id = ${draftId} AND organization_id = ${context.organizationId}
    `
    if (!rows[0]) throw new PlatformError('FORMULA_DRAFT_NOT_FOUND', 'The requested formula draft is not available in this workspace.', 404)
    return rows[0]
  }

  private async draftComponents(tx: Transaction, context: PlatformContext, draftId: string): Promise<FormulaComponent[]> {
    return tx.$queryRaw<FormulaComponent[]>`
      SELECT material_id AS "materialId", percentage, position, note FROM v2_formula_draft_components
      WHERE draft_id = ${draftId} AND organization_id = ${context.organizationId} ORDER BY position ASC
    `
  }

  private async candidateForFormulaProject(tx: Transaction, context: PlatformContext, candidateId: string, formulaProjectId: string) {
    const candidate = await tx.$queryRaw<Array<{ narrative: string; components: FormulaComponent[]; designProjectId: string; linkedFormulaProjectId: string | null }>>`
      SELECT c.narrative, c.component_proposal AS components, c.design_project_id AS "designProjectId", d.formula_project_id AS "linkedFormulaProjectId"
      FROM v2_design_candidates c
      JOIN v2_design_projects d ON d.organization_id = c.organization_id AND d.id = c.design_project_id
      WHERE c.id = ${candidateId} AND c.organization_id = ${context.organizationId} AND c.status = 'ADVISORY'
    `
    if (!candidate[0]) throw new PlatformError('DESIGN_CANDIDATE_NOT_FOUND', 'The selected advisory candidate is not available.', 404)
    if (candidate[0].linkedFormulaProjectId !== formulaProjectId) {
      throw new PlatformError('DESIGN_CANDIDATE_FORMULA_PROJECT_MISMATCH', 'The Design Studio candidate must be linked to this Formula project before it can become a draft.', 409)
    }
    return candidate[0]
  }

  private async requireEligibleMaterials(tx: Transaction, context: PlatformContext, components: FormulaComponent[]) {
    const ids = components.map((component) => component.materialId)
    const rows = await tx.$queryRaw<Array<{ id: string; status: string; complianceStatus: string | null }>>`
      SELECT m.id, m.status,
        (SELECT mc.status FROM v2_material_compliance mc WHERE mc.organization_id = m.organization_id AND mc.material_id = m.id ORDER BY mc.updated_at DESC LIMIT 1) AS "complianceStatus"
      FROM v2_materials m WHERE m.organization_id = ${context.organizationId} AND m.id IN (${Prisma.join(ids)})
    `
    if (rows.length !== ids.length) throw new PlatformError('FORMULA_MATERIAL_NOT_FOUND', 'Each formula component must be a material visible in this workspace.', 409)
    const unavailable = rows.find((material) => material.status !== 'ACTIVE' || material.complianceStatus === 'BLOCKED')
    if (unavailable) throw new PlatformError('FORMULA_MATERIAL_INELIGIBLE', 'A formula component is blocked or not active for R&D use.', 409)
  }

  private async hasPermission(tx: Transaction, context: PlatformContext, permission: string) {
    const rows = await tx.$queryRaw<Array<{ allowed: boolean }>>`
      SELECT EXISTS(SELECT 1 FROM v2_role_policies WHERE organization_id = ${context.organizationId} AND role_key = ${context.role} AND permissions ? ${permission}) AS allowed
    `
    return rows[0]?.allowed === true
  }

  private async resolveCandidateEvidence(tx: Transaction, context: PlatformContext, components: FormulaComponent[], references: CandidateEvidenceReferences | undefined) {
    const sourceIds = references?.materialEvidenceSourceIds ?? []
    const artifactIds = references?.scientificArtifactIds ?? []
    const materialIds = components.map((component) => component.materialId)
    const evidence: JsonRecord = {
      briefAlignment: 'NOT_EVALUATED',
      scientificConfidence: 'NOT_EVALUATED',
      consumerPreference: 'NOT_ENOUGH_EVIDENCE',
      inventoryFeasibility: 'NOT_EVALUATED',
      complianceEligibility: 'NOT_EVALUATED',
      materialEligibilityGate: 'VERIFIED',
      evidenceQuality: 'LIMITED',
      references: { materialEvidenceSourceHashes: [], scientificArtifactHashes: [], consumerPreferenceHash: null },
    }
    if (sourceIds.length) {
      if (!await this.hasPermission(tx, context, 'rag.view')) throw new PlatformError('TENANT_ACCESS_DENIED', 'You do not have permission to use evidence citations.', 403)
      const sources = await tx.$queryRaw<Array<{ id: string; contentHash: string }>>`SELECT id, content_hash AS "contentHash" FROM v2_material_evidence_sources WHERE organization_id = ${context.organizationId} AND id IN (${Prisma.join(sourceIds)}) AND material_id IN (${Prisma.join(materialIds)}) AND status = 'APPROVED'`
      if (sources.length !== sourceIds.length) throw new PlatformError('DESIGN_CANDIDATE_EVIDENCE_DENIED', 'Every evidence citation must be approved and belong to a selected material.', 409)
      evidence.references = { ...(evidence.references as JsonRecord), materialEvidenceSourceHashes: sources.map((source) => digest({ id: source.id, contentHash: source.contentHash })).sort() }
      evidence.evidenceQuality = 'CITED'
    }
    if (artifactIds.length) {
      if (!await this.hasPermission(tx, context, 'scientific_ai.use')) throw new PlatformError('TENANT_ACCESS_DENIED', 'You do not have permission to use scientific evidence.', 403)
      const artifacts = await tx.$queryRaw<Array<{ id: string; contentHash: string; evidenceStatus: string }>>`SELECT id, content_hash AS "contentHash", evidence_status AS "evidenceStatus" FROM v2_scientific_artifacts WHERE organization_id = ${context.organizationId} AND id IN (${Prisma.join(artifactIds)}) AND material_id IN (${Prisma.join(materialIds)})`
      if (artifacts.length !== artifactIds.length) throw new PlatformError('DESIGN_CANDIDATE_EVIDENCE_DENIED', 'Every scientific reference must belong to a selected material.', 409)
      evidence.references = { ...(evidence.references as JsonRecord), scientificArtifactHashes: artifacts.map((artifact) => digest({ id: artifact.id, contentHash: artifact.contentHash, evidenceStatus: artifact.evidenceStatus })).sort() }
      evidence.scientificConfidence = artifacts.every((artifact) => artifact.evidenceStatus === 'VERIFIED') ? 'VERIFIED' : 'NOT_EVALUATED'
      evidence.evidenceQuality = evidence.scientificConfidence === 'VERIFIED' || evidence.evidenceQuality === 'CITED' ? 'CITED' : 'LIMITED'
    }
    if (references?.consumerPreferenceVectorId) {
      if (!await this.hasPermission(tx, context, 'sentiment.view')) throw new PlatformError('TENANT_ACCESS_DENIED', 'You do not have permission to use consumer evidence.', 403)
      const vectors = await tx.$queryRaw<Array<{ sourceSetHash: string; evidenceStatus: string }>>`SELECT source_set_hash AS "sourceSetHash", evidence_status AS "evidenceStatus" FROM v2_consumer_preference_vectors WHERE organization_id = ${context.organizationId} AND id = ${references.consumerPreferenceVectorId}`
      if (!vectors[0] || vectors[0].evidenceStatus === 'INVALIDATED') throw new PlatformError('DESIGN_CANDIDATE_EVIDENCE_DENIED', 'The selected consumer evidence is not available.', 409)
      evidence.references = { ...(evidence.references as JsonRecord), consumerPreferenceHash: digest({ id: references.consumerPreferenceVectorId, sourceSetHash: vectors[0].sourceSetHash }) }
      evidence.consumerPreference = vectors[0].evidenceStatus
      if (vectors[0].evidenceStatus === 'VERIFIED' || vectors[0].evidenceStatus === 'LOW_CONFIDENCE') evidence.evidenceQuality = 'CITED'
    }
    return evidence
  }

  private async writeComponents(tx: Transaction, context: PlatformContext, draftId: string, components: FormulaComponent[]) {
    await tx.$executeRaw`DELETE FROM v2_formula_draft_components WHERE draft_id = ${draftId} AND organization_id = ${context.organizationId}`
    for (const component of components) {
      await tx.$executeRaw`
        INSERT INTO v2_formula_draft_components (id, organization_id, draft_id, material_id, percentage, position, note)
        VALUES (${identifier('fcomp')}, ${context.organizationId}, ${draftId}, ${component.materialId}, ${component.percentage}, ${component.position}, ${component.note ?? null})
      `
    }
  }

  async createProject(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'formula.edit')
    const parsed = createFormulaProjectRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a valid formula project.', 422)
    return this.idempotent(context, 'formula.projects.create', key, parsed.data, async (tx) => {
      const id = identifier('fproject')
      await tx.$executeRaw`
        INSERT INTO v2_formula_projects (id, organization_id, name, formula_type, final_product_context, concentrate_percent, created_by)
        VALUES (${id}, ${context.organizationId}, ${parsed.data.name}, ${parsed.data.formulaType}, ${JSON.stringify({ finalProductContext: parsed.data.finalProductContext ?? null })}::jsonb, ${parsed.data.concentrationPercent ?? null}, ${context.userId})
      `
      await this.audit(tx, context, 'formula.project.create', 'allowed', 'formula_project', id, { formulaType: parsed.data.formulaType })
      return { id, name: parsed.data.name, formulaType: parsed.data.formulaType, status: 'ACTIVE' }
    })
  }

  async createDraft(context: PlatformContext, projectId: string, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'formula.edit')
    const parsed = createFormulaDraftRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide unique draft components and a positive target mass.', 422)
    const math = calculateFormulaMath(parsed.data.components, parsed.data.targetMassGrams)
    if (!math.valid) throw new PlatformError('FORMULA_MATH_INVALID', 'A formula draft must contain a valid 100 percent composition.', 422)
    return this.idempotent(context, 'formula.drafts.create', key, { projectId, ...parsed.data }, async (tx) => {
      const project = await this.project(tx, context, projectId)
      if (project.status !== 'ACTIVE') throw new PlatformError('FORMULA_PROJECT_ARCHIVED', 'An archived formula project cannot receive a draft.', 409)
      await this.requireEligibleMaterials(tx, context, math.components)
      const id = identifier('fdraft')
      const originType = parsed.data.origin === 'DESIGN_STUDIO' ? 'DESIGN_CANDIDATE' : parsed.data.origin === 'PARENT_VERSION' ? 'MANUAL' : 'MANUAL'
      await tx.$executeRaw`
        INSERT INTO v2_formula_drafts (id, organization_id, formula_project_id, name, target_grams, origin_type, origin_reference_id, created_by)
        VALUES (${id}, ${context.organizationId}, ${projectId}, ${project.name}, ${parsed.data.targetMassGrams}, ${originType}, ${parsed.data.originRef ?? null}, ${context.userId})
      `
      await this.writeComponents(tx, context, id, math.components)
      await tx.$executeRaw`
        INSERT INTO v2_formula_provenance (id, organization_id, formula_draft_id, origin_kind, origin_ref, payload_hash, created_by)
        VALUES (${identifier('fprov')}, ${context.organizationId}, ${id}, ${parsed.data.origin}, ${parsed.data.originRef ?? null}, ${digest({ projectId, components: math.components })}, ${context.userId})
      `
      await this.audit(tx, context, 'formula.draft.create', 'allowed', 'formula_draft', id, { projectId, origin: parsed.data.origin, contentHash: digest(math.components) })
      return { id, projectId, status: 'DRAFT', math }
    })
  }

  async replaceDraftComponents(context: PlatformContext, draftId: string, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'formula.edit')
    const parsed = replaceFormulaDraftComponentsRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide valid unique formula components.', 422)
    const math = calculateFormulaMath(parsed.data.components, parsed.data.targetMassGrams)
    if (!math.valid) throw new PlatformError('FORMULA_MATH_INVALID', 'A formula draft must contain exactly 100 percent before saving.', 422)
    return this.idempotent(context, 'formula.drafts.components.replace', key, { draftId, ...parsed.data }, async (tx) => {
      const draft = await this.draft(tx, context, draftId)
      if (!['DRAFT', 'REJECTED'].includes(draft.status)) throw new PlatformError('FORMULA_DRAFT_LOCKED', 'Only a draft or rejected draft can be edited.', 409)
      await this.requireEligibleMaterials(tx, context, math.components)
      await this.writeComponents(tx, context, draftId, math.components)
      await tx.$executeRaw`UPDATE v2_formula_drafts SET target_grams = ${parsed.data.targetMassGrams}, status = 'DRAFT', updated_at = now() WHERE id = ${draftId} AND organization_id = ${context.organizationId}`
      await this.audit(tx, context, 'formula.draft.components.replace', 'allowed', 'formula_draft', draftId, { contentHash: digest(math.components) })
      return { id: draftId, status: 'DRAFT', math }
    })
  }

  async validateDraft(context: PlatformContext, draftId: string) {
    await this.platform.requirePermission(context, 'formula.viewSensitive')
    return this.scoped(context, async (tx) => {
      const draft = await this.draft(tx, context, draftId)
      const components = await this.draftComponents(tx, context, draftId)
      const math = calculateFormulaMath(components, draft.targetGrams)
      if (math.valid) await this.requireEligibleMaterials(tx, context, math.components)
      return { id: draftId, status: draft.status, math }
    })
  }

  async draftDetail(context: PlatformContext, draftId: string) {
    await this.platform.requirePermission(context, 'formula.viewSensitive')
    return this.scoped(context, async (tx) => {
      const draft = await this.draft(tx, context, draftId)
      const components = await this.draftComponents(tx, context, draftId)
      const reviews = await tx.$queryRaw<Array<{ decision: string; rationale: string | null; createdAt: Date }>>`
        SELECT decision, rationale, created_at AS "createdAt" FROM v2_formula_reviews
        WHERE organization_id = ${context.organizationId} AND draft_id = ${draftId} ORDER BY created_at DESC
      `
      return { draft, components, math: calculateFormulaMath(components, draft.targetGrams), reviews }
    })
  }

  async submitReview(context: PlatformContext, draftId: string, rationale: string, key?: string) {
    await this.platform.requirePermission(context, 'formula.edit')
    if (!rationale.trim() || rationale.length > 2_000) throw new PlatformError('INVALID_INPUT', 'Provide a concise review request.', 422)
    return this.idempotent(context, 'formula.drafts.submit-review', key, { draftId, rationale }, async (tx) => {
      const draft = await this.draft(tx, context, draftId)
      if (draft.status !== 'DRAFT' && draft.status !== 'REJECTED') throw new PlatformError('FORMULA_REVIEW_STATE_INVALID', 'Only a draft can be submitted for review.', 409)
      const math = calculateFormulaMath(await this.draftComponents(tx, context, draftId), draft.targetGrams)
      if (!math.valid) throw new PlatformError('FORMULA_MATH_INVALID', 'Formula validation must pass before review.', 409)
      await this.requireEligibleMaterials(tx, context, math.components)
      await tx.$executeRaw`UPDATE v2_formula_drafts SET status = 'IN_REVIEW', updated_at = now() WHERE id = ${draftId} AND organization_id = ${context.organizationId}`
      await tx.$executeRaw`INSERT INTO v2_formula_reviews (id, organization_id, draft_id, decision, rationale, decided_by) VALUES (${identifier('freview')}, ${context.organizationId}, ${draftId}, 'SUBMITTED', ${rationale.trim()}, ${context.userId})`
      await this.audit(tx, context, 'formula.draft.submit_review', 'allowed', 'formula_draft', draftId, { contentHash: digest(math.components) })
      return { id: draftId, status: 'IN_REVIEW' }
    })
  }

  async approveDraft(context: PlatformContext, draftId: string, rationale: string, key?: string) {
    await this.platform.requirePermission(context, 'formula.approve')
    if (!rationale.trim() || rationale.length > 2_000) throw new PlatformError('INVALID_INPUT', 'Provide an approval rationale.', 422)
    return this.idempotent(context, 'formula.drafts.approve', key, { draftId, rationale }, async (tx) => {
      const draft = await this.draft(tx, context, draftId)
      if (draft.status !== 'IN_REVIEW') throw new PlatformError('FORMULA_REVIEW_STATE_INVALID', 'Only a submitted draft can be approved.', 409)
      const project = await this.project(tx, context, draft.formulaProjectId)
      const components = await this.draftComponents(tx, context, draftId)
      const math = calculateFormulaMath(components, draft.targetGrams)
      if (!math.valid) throw new PlatformError('FORMULA_MATH_INVALID', 'Formula validation must pass at the time of approval.', 409)
      await this.requireEligibleMaterials(tx, context, math.components)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${draft.formulaProjectId}))`
      const next = await tx.$queryRaw<Array<{ nextVersion: number }>>`SELECT COALESCE(MAX(version_number), 0) + 1 AS "nextVersion" FROM v2_formula_versions WHERE organization_id = ${context.organizationId} AND formula_project_id = ${draft.formulaProjectId}`
      const contentHash = digest({ projectId: draft.formulaProjectId, formulaType: project.formulaType, components: math.components, targetGrams: draft.targetGrams })
      const versionId = identifier('fversion')
      await tx.$executeRaw`
        INSERT INTO v2_formula_versions (id, organization_id, formula_project_id, source_draft_id, version_number, formula_type, total_percentage, content_hash, origin_provenance, approval_status, approved_by, approved_at, created_by)
        VALUES (${versionId}, ${context.organizationId}, ${draft.formulaProjectId}, ${draftId}, ${next[0]!.nextVersion}, ${project.formulaType}, ${math.totalPercentage}, ${contentHash}, ${JSON.stringify({ originType: draft.originType, originReferenceId: draft.originReferenceId })}::jsonb, 'APPROVED', ${context.userId}, now(), ${context.userId})
      `
      for (const component of math.components) await tx.$executeRaw`INSERT INTO v2_formula_version_components (id, organization_id, formula_version_id, material_id, percentage, position, note) VALUES (${identifier('fvcomp')}, ${context.organizationId}, ${versionId}, ${component.materialId}, ${component.percentage}, ${component.position}, ${component.note ?? null})`
      await tx.$executeRaw`UPDATE v2_formula_drafts SET status = 'APPROVED', updated_at = now() WHERE id = ${draftId} AND organization_id = ${context.organizationId}`
      await tx.$executeRaw`INSERT INTO v2_formula_reviews (id, organization_id, draft_id, decision, rationale, decided_by) VALUES (${identifier('freview')}, ${context.organizationId}, ${draftId}, 'APPROVED', ${rationale.trim()}, ${context.userId})`
      await tx.$executeRaw`INSERT INTO v2_formula_provenance (id, organization_id, formula_version_id, origin_kind, origin_ref, payload_hash, created_by) VALUES (${identifier('fprov')}, ${context.organizationId}, ${versionId}, ${draft.originType === 'DESIGN_CANDIDATE' ? 'DESIGN_STUDIO' : 'MANUAL'}, ${draft.originReferenceId}, ${contentHash}, ${context.userId})`
      await this.audit(tx, context, 'formula.version.approve', 'allowed', 'formula_version', versionId, { draftId, versionNumber: next[0]!.nextVersion, contentHash })
      return { id: versionId, draftId, versionNumber: next[0]!.nextVersion, status: 'APPROVED', contentHash }
    })
  }

  async rejectDraft(context: PlatformContext, draftId: string, rationale: string, key?: string) {
    await this.platform.requirePermission(context, 'formula.review')
    if (!rationale.trim() || rationale.length > 2_000) throw new PlatformError('INVALID_INPUT', 'Provide a rejection rationale.', 422)
    return this.idempotent(context, 'formula.drafts.reject', key, { draftId, rationale }, async (tx) => {
      const draft = await this.draft(tx, context, draftId)
      if (draft.status !== 'IN_REVIEW') throw new PlatformError('FORMULA_REVIEW_STATE_INVALID', 'Only a submitted draft can be rejected.', 409)
      await tx.$executeRaw`UPDATE v2_formula_drafts SET status = 'REJECTED', updated_at = now() WHERE id = ${draftId} AND organization_id = ${context.organizationId}`
      await tx.$executeRaw`INSERT INTO v2_formula_reviews (id, organization_id, draft_id, decision, rationale, decided_by) VALUES (${identifier('freview')}, ${context.organizationId}, ${draftId}, 'REJECTED', ${rationale.trim()}, ${context.userId})`
      await this.audit(tx, context, 'formula.draft.reject', 'allowed', 'formula_draft', draftId, { rationaleHash: digest(rationale) })
      return { id: draftId, status: 'REJECTED' }
    })
  }

  async listProjects(context: PlatformContext) {
    await this.platform.requirePermission(context, 'formula.view')
    return this.scoped(context, async (tx) => tx.$queryRaw<Array<{ id: string; name: string; formulaType: string; status: string; latestVersion: number }>>`
      SELECT p.id, p.name, p.formula_type AS "formulaType", p.status, COALESCE(MAX(v.version_number), 0)::int AS "latestVersion"
      FROM v2_formula_projects p LEFT JOIN v2_formula_versions v ON v.formula_project_id = p.id AND v.organization_id = p.organization_id
      WHERE p.organization_id = ${context.organizationId} GROUP BY p.id ORDER BY p.updated_at DESC
    `)
  }

  async projectDetail(context: PlatformContext, projectId: string) {
    await this.platform.requirePermission(context, 'formula.view')
    return this.scoped(context, async (tx) => {
      const sensitive = await this.hasPermission(tx, context, 'formula.viewSensitive')
      const project = await this.project(tx, context, projectId)
      const drafts = await tx.$queryRaw<Array<{ id: string; status: string; targetGrams: number; createdAt: Date }>>`SELECT id, status, target_grams AS "targetGrams", created_at AS "createdAt" FROM v2_formula_drafts WHERE organization_id = ${context.organizationId} AND formula_project_id = ${projectId} ORDER BY created_at DESC`
      const versions = await tx.$queryRaw<Array<{ id: string; versionNumber: number; approvalStatus: string; createdAt: Date }>>`SELECT id, version_number AS "versionNumber", approval_status AS "approvalStatus", created_at AS "createdAt" FROM v2_formula_versions WHERE organization_id = ${context.organizationId} AND formula_project_id = ${projectId} ORDER BY version_number DESC`
      return { project, drafts: sensitive ? drafts : drafts.map(({ id, status, createdAt }) => ({ id, status, createdAt })), versions }
    })
  }

  async createDesignProject(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'formula.edit')
    const parsed = createDesignProjectRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a bounded name and raw creative brief.', 422)
    return this.idempotent(context, 'design.projects.create', key, parsed.data, async (tx) => {
      if (parsed.data.formulaProjectId) await this.project(tx, context, parsed.data.formulaProjectId)
      const projectId = identifier('dproject'); const briefId = identifier('brief')
      const contentHash = digest({ rawBrief: parsed.data.rawBrief, structuredBrief: {} })
      await tx.$executeRaw`INSERT INTO v2_design_projects (id, organization_id, formula_project_id, name, created_by) VALUES (${projectId}, ${context.organizationId}, ${parsed.data.formulaProjectId ?? null}, ${parsed.data.name}, ${context.userId})`
      await tx.$executeRaw`INSERT INTO v2_design_brief_versions (id, organization_id, design_project_id, version_number, raw_brief, content_hash, created_by) VALUES (${briefId}, ${context.organizationId}, ${projectId}, 1, ${parsed.data.rawBrief}, ${contentHash}, ${context.userId})`
      await this.audit(tx, context, 'design.project.create', 'allowed', 'design_project', projectId, { rawBriefHash: digest(parsed.data.rawBrief) })
      return { id: projectId, briefId, status: 'DRAFT' }
    })
  }

  async listDesignProjects(context: PlatformContext) {
    await this.platform.requirePermission(context, 'formula.edit')
    return this.scoped(context, async (tx) => tx.$queryRaw<Array<{
      id: string; name: string; status: string; createdAt: Date; briefStatus: string; candidateCount: number
    }>>`
      SELECT p.id, p.name, p.status, p.created_at AS "createdAt",
        COALESCE((SELECT b.status FROM v2_design_brief_versions b
          WHERE b.organization_id = p.organization_id AND b.design_project_id = p.id
          ORDER BY b.version_number DESC LIMIT 1), 'DRAFT') AS "briefStatus",
        (SELECT count(*)::int FROM v2_design_candidates c
          WHERE c.organization_id = p.organization_id AND c.design_project_id = p.id) AS "candidateCount"
      FROM v2_design_projects p
      WHERE p.organization_id = ${context.organizationId} AND p.created_by = ${context.userId} AND p.status = 'ACTIVE'
      ORDER BY p.created_at DESC
    `)
  }

  async reviewBrief(context: PlatformContext, designProjectId: string, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'formula.edit')
    const parsed = reviewDesignBriefRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Review the structured brief and resolve material conflicts.', 422)
    return this.idempotent(context, 'design.briefs.review', key, { designProjectId, ...parsed.data }, async (tx) => {
      const design = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_design_projects WHERE id = ${designProjectId} AND organization_id = ${context.organizationId} AND status = 'ACTIVE'`
      if (!design[0]) throw new PlatformError('DESIGN_PROJECT_NOT_FOUND', 'The design project is not available in this workspace.', 404)
      const latest = await tx.$queryRaw<Array<{ versionNumber: number; rawBrief: string }>>`SELECT version_number AS "versionNumber", raw_brief AS "rawBrief" FROM v2_design_brief_versions WHERE organization_id = ${context.organizationId} AND design_project_id = ${designProjectId} ORDER BY version_number DESC LIMIT 1`
      const materialIds = [...parsed.data.structuredBrief.requiredMaterialIds, ...parsed.data.structuredBrief.prohibitedMaterialIds]
      if (materialIds.length) await this.requireEligibleMaterials(tx, context, materialIds.map((materialId, position) => ({ materialId, percentage: 100 / materialIds.length, position })))
      const id = identifier('brief'); const contentHash = digest({ rawBrief: latest[0]!.rawBrief, structuredBrief: parsed.data.structuredBrief })
      await tx.$executeRaw`INSERT INTO v2_design_brief_versions (id, organization_id, design_project_id, version_number, raw_brief, structured_brief, status, content_hash, reviewed_by, reviewed_at, created_by) VALUES (${id}, ${context.organizationId}, ${designProjectId}, ${latest[0]!.versionNumber + 1}, ${latest[0]!.rawBrief}, ${JSON.stringify(parsed.data.structuredBrief)}::jsonb, 'REVIEWED', ${contentHash}, ${context.userId}, now(), ${context.userId})`
      const constraints = { requiredMaterialIds: parsed.data.structuredBrief.requiredMaterialIds, prohibitedMaterialIds: parsed.data.structuredBrief.prohibitedMaterialIds, availabilityFirst: parsed.data.structuredBrief.availabilityFirst, ifraCategory: parsed.data.structuredBrief.ifraCategory ?? null, unresolvedQuestions: parsed.data.structuredBrief.unresolvedQuestions }
      await tx.$executeRaw`INSERT INTO v2_design_constraint_snapshots (id, organization_id, design_project_id, brief_version_id, constraints, constraint_hash, created_by) VALUES (${identifier('constraint')}, ${context.organizationId}, ${designProjectId}, ${id}, ${JSON.stringify(constraints)}::jsonb, ${digest(constraints)}, ${context.userId})`
      await this.audit(tx, context, 'design.brief.review', 'allowed', 'design_brief_version', id, { contentHash, unresolvedCount: constraints.unresolvedQuestions.length })
      return { id, status: 'REVIEWED', contentHash, unresolvedQuestions: constraints.unresolvedQuestions }
    })
  }

  async buildMaterialUniverse(context: PlatformContext, designProjectId: string, key?: string) {
    await this.platform.requirePermission(context, 'materials.view')
    return this.idempotent(context, 'design.universe.build', key, { designProjectId }, async (tx) => {
      const brief = await tx.$queryRaw<Array<{ id: string; structuredBrief: JsonRecord }>>`SELECT id, structured_brief AS "structuredBrief" FROM v2_design_brief_versions WHERE organization_id = ${context.organizationId} AND design_project_id = ${designProjectId} AND status = 'REVIEWED' ORDER BY version_number DESC LIMIT 1`
      if (!brief[0]) throw new PlatformError('DESIGN_BRIEF_REVIEW_REQUIRED', 'A reviewed structured brief is required before material selection.', 409)
      const prohibited = Array.isArray(brief[0].structuredBrief.prohibitedMaterialIds) ? brief[0].structuredBrief.prohibitedMaterialIds.filter((value): value is string => typeof value === 'string') : []
      const materials = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT m.id FROM v2_materials m
        WHERE m.organization_id = ${context.organizationId} AND m.status = 'ACTIVE' AND m.id NOT IN (${Prisma.join(prohibited.length ? prohibited : ['__none__'])})
          AND NOT EXISTS (SELECT 1 FROM v2_material_compliance c WHERE c.organization_id = m.organization_id AND c.material_id = m.id AND c.status = 'BLOCKED')
        ORDER BY m.id ASC
      `
      const materialIds = materials.map((material) => material.id); const universeHash = digest({ materialIds, structuredBrief: brief[0].structuredBrief })
      const existing = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_design_material_universe_snapshots WHERE organization_id = ${context.organizationId} AND design_project_id = ${designProjectId} AND brief_version_id = ${brief[0].id} AND universe_hash = ${universeHash}`
      const id = existing[0]?.id ?? identifier('universe')
      if (!existing[0]) await tx.$executeRaw`INSERT INTO v2_design_material_universe_snapshots (id, organization_id, design_project_id, brief_version_id, material_ids, universe_hash, created_by) VALUES (${id}, ${context.organizationId}, ${designProjectId}, ${brief[0].id}, ${JSON.stringify(materialIds)}::jsonb, ${universeHash}, ${context.userId})`
      await this.audit(tx, context, 'design.material_universe.build', 'allowed', 'design_material_universe', id, { materialCount: materialIds.length, universeHash })
      return { id, briefVersionId: brief[0].id, materialIds, universeHash }
    })
  }

  async createCandidate(context: PlatformContext, designProjectId: string, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'formula.edit')
    const parsed = createCandidateRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a bounded candidate narrative and unique components.', 422)
    const math = calculateFormulaMath(parsed.data.components, 100)
    if (!math.valid) throw new PlatformError('FORMULA_MATH_INVALID', 'A candidate component proposal must be exactly 100 percent.', 422)
    return this.idempotent(context, 'design.candidates.create', key, { designProjectId, ...parsed.data }, async (tx) => {
      const universe = await tx.$queryRaw<Array<{ id: string; briefVersionId: string; materialIds: unknown }>>`SELECT id, brief_version_id AS "briefVersionId", material_ids AS "materialIds" FROM v2_design_material_universe_snapshots WHERE organization_id = ${context.organizationId} AND design_project_id = ${designProjectId} ORDER BY created_at DESC LIMIT 1`
      if (!universe[0]) throw new PlatformError('DESIGN_MATERIAL_UNIVERSE_REQUIRED', 'Build an authorized material universe before creating a candidate.', 409)
      const allowed = new Set(Array.isArray(universe[0].materialIds) ? universe[0].materialIds.filter((value): value is string => typeof value === 'string') : [])
      if (math.components.some((component) => !allowed.has(component.materialId))) throw new PlatformError('DESIGN_CANDIDATE_MATERIAL_DENIED', 'A candidate references a material outside its pinned universe.', 409)
      await this.requireEligibleMaterials(tx, context, math.components)
      // Eligibility confirms only that no component is currently blocked. It
      // is not an IFRA or jurisdictional compliance conclusion.
      const evidence = await this.resolveCandidateEvidence(tx, context, math.components, parsed.data.evidenceReferences)
      const id = identifier('candidate')
      await tx.$executeRaw`INSERT INTO v2_design_candidates (id, organization_id, design_project_id, brief_version_id, universe_snapshot_id, narrative, component_proposal, deterministic_evidence, status, created_by) VALUES (${id}, ${context.organizationId}, ${designProjectId}, ${universe[0].briefVersionId}, ${universe[0].id}, ${parsed.data.narrative}, ${JSON.stringify(math.components)}::jsonb, ${JSON.stringify(evidence)}::jsonb, 'ADVISORY', ${context.userId})`
      await tx.$executeRaw`INSERT INTO v2_design_candidate_evaluations (id, organization_id, candidate_id, dimensions, evidence_hash) VALUES (${identifier('ceval')}, ${context.organizationId}, ${id}, ${JSON.stringify(evidence)}::jsonb, ${digest(evidence)})`
      await this.audit(tx, context, 'design.candidate.create', 'allowed', 'design_candidate', id, { evidenceHash: digest(evidence), componentHash: digest(math.components), citedSources: parsed.data.evidenceReferences?.materialEvidenceSourceIds.length ?? 0 })
      return { id, status: 'ADVISORY', math, evidence }
    })
  }

  async saveCandidateAsDraft(context: PlatformContext, candidateId: string, formulaProjectId: string, key?: string) {
    await this.platform.requirePermission(context, 'formula.edit')
    return this.idempotent(context, 'design.candidates.save-draft', key, { candidateId, formulaProjectId }, async (tx) => {
      const project = await this.project(tx, context, formulaProjectId)
      if (project.status !== 'ACTIVE') throw new PlatformError('FORMULA_PROJECT_ARCHIVED', 'An archived formula project cannot receive a candidate draft.', 409)
      const candidate = await this.candidateForFormulaProject(tx, context, candidateId, formulaProjectId)
      const math = calculateFormulaMath(candidate.components, 100)
      if (!math.valid) throw new PlatformError('FORMULA_MATH_INVALID', 'The candidate cannot become a formula draft until its math validates.', 409)
      await this.requireEligibleMaterials(tx, context, math.components)
      const existing = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_formula_drafts WHERE organization_id = ${context.organizationId} AND formula_project_id = ${formulaProjectId} AND origin_reference_id = ${candidateId} LIMIT 1`
      if (existing[0]) return { id: existing[0].id, status: 'DRAFT', alreadySaved: true }
      const id = identifier('fdraft')
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO v2_formula_drafts (id, organization_id, formula_project_id, name, target_grams, origin_type, origin_reference_id, created_by)
        VALUES (${id}, ${context.organizationId}, ${formulaProjectId}, ${project.name}, 100, 'DESIGN_CANDIDATE', ${candidateId}, ${context.userId})
        ON CONFLICT (organization_id, formula_project_id, origin_type, origin_reference_id) WHERE origin_reference_id IS NOT NULL DO NOTHING
        RETURNING id
      `
      if (!inserted[0]) {
        const concurrent = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_formula_drafts WHERE organization_id = ${context.organizationId} AND formula_project_id = ${formulaProjectId} AND origin_type = 'DESIGN_CANDIDATE' AND origin_reference_id = ${candidateId} LIMIT 1`
        if (concurrent[0]) return { id: concurrent[0].id, status: 'DRAFT', alreadySaved: true }
        throw new PlatformError('FORMULA_DRAFT_CONCURRENT_WRITE', 'The candidate draft could not be reconciled after a concurrent write.', 409)
      }
      await this.writeComponents(tx, context, id, math.components)
      await tx.$executeRaw`INSERT INTO v2_formula_provenance (id, organization_id, formula_draft_id, origin_kind, origin_ref, payload_hash, created_by) VALUES (${identifier('fprov')}, ${context.organizationId}, ${id}, 'DESIGN_STUDIO', ${candidateId}, ${digest(math.components)}, ${context.userId})`
      await this.audit(tx, context, 'design.candidate.save_draft', 'allowed', 'formula_draft', id, { candidateId, formulaProjectId })
      return { id, status: 'DRAFT', alreadySaved: false }
    })
  }

  private async persistReformulationCandidateAsDraftInTransaction(
    context: PlatformContext,
    tx: Transaction,
    candidateId: string,
    formulaProjectId: string,
  ) {
    const project = await this.project(tx, context, formulaProjectId)
    if (project.status !== 'ACTIVE') throw new PlatformError('FORMULA_PROJECT_ARCHIVED', 'An archived formula project cannot receive an optimizer draft.', 409)
    const candidates = await tx.$queryRaw<Array<{ components: FormulaComponent[]; status: string; runStatus: string; parentFormulaProjectId: string }>>`
      SELECT c.component_proposal AS components, c.status, r.status AS "runStatus", v.formula_project_id AS "parentFormulaProjectId"
      FROM v2_reformulation_candidates c
      JOIN v2_reformulation_runs r ON r.organization_id = c.organization_id AND r.id = c.reformulation_run_id
      JOIN v2_formula_versions v ON v.organization_id = r.organization_id AND v.id = r.parent_formula_version_id
      WHERE c.organization_id = ${context.organizationId} AND c.id = ${candidateId}
      FOR UPDATE
    `
    const candidate = candidates[0]
    if (!candidate) throw new PlatformError('REFORMULATION_CANDIDATE_NOT_FOUND', 'The selected optimizer candidate is not available in this workspace.', 404)
    if (candidate.status !== 'ADVISORY' || candidate.runStatus !== 'COMPLETED') throw new PlatformError('REFORMULATION_CANDIDATE_NOT_READY', 'Only a completed advisory optimizer candidate may become a Formula draft.', 409)
    if (candidate.parentFormulaProjectId !== formulaProjectId) throw new PlatformError('REFORMULATION_CANDIDATE_FORMULA_PROJECT_MISMATCH', 'A reformulation candidate may be saved only to the Formula Project that owns its approved parent version.', 409)
    const math = calculateFormulaMath(candidate.components, 100)
    if (!math.valid) throw new PlatformError('FORMULA_MATH_INVALID', 'The optimizer candidate no longer satisfies Formula math.', 409)
    await this.requireEligibleMaterials(tx, context, math.components)
    const existing = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM v2_formula_drafts
      WHERE organization_id = ${context.organizationId} AND formula_project_id = ${formulaProjectId}
        AND origin_type = 'REFORMULATION_OPTIMIZER' AND origin_reference_id = ${candidateId}
      LIMIT 1
    `
    if (existing[0]) return { id: existing[0].id, status: 'DRAFT', alreadySaved: true }
    const draftId = identifier('fdraft')
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO v2_formula_drafts (id, organization_id, formula_project_id, name, target_grams, origin_type, origin_reference_id, created_by)
      VALUES (${draftId}, ${context.organizationId}, ${formulaProjectId}, ${project.name}, 100, 'REFORMULATION_OPTIMIZER', ${candidateId}, ${context.userId})
      ON CONFLICT (organization_id, formula_project_id, origin_type, origin_reference_id) WHERE origin_reference_id IS NOT NULL DO NOTHING
      RETURNING id
    `
    if (!inserted[0]) {
      const concurrent = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM v2_formula_drafts
        WHERE organization_id = ${context.organizationId} AND formula_project_id = ${formulaProjectId}
          AND origin_type = 'REFORMULATION_OPTIMIZER' AND origin_reference_id = ${candidateId}
        LIMIT 1
      `
      if (concurrent[0]) return { id: concurrent[0].id, status: 'DRAFT', alreadySaved: true }
      throw new PlatformError('FORMULA_DRAFT_CONCURRENT_WRITE', 'The optimizer draft could not be reconciled after a concurrent write.', 409)
    }
    await this.writeComponents(tx, context, draftId, math.components)
    const contentHash = digest(math.components)
    await tx.$executeRaw`
      INSERT INTO v2_formula_provenance (id, organization_id, formula_draft_id, origin_kind, origin_ref, payload_hash, created_by)
      VALUES (${identifier('fprov')}, ${context.organizationId}, ${draftId}, 'REFORMULATION_OPTIMIZER', ${candidateId}, ${contentHash}, ${context.userId})
    `
    await this.audit(tx, context, 'reformulation.candidate.save_draft', 'allowed', 'formula_draft', draftId, { candidateId, formulaProjectId, contentHash })
    return { id: draftId, status: 'DRAFT', alreadySaved: false }
  }

  /**
   * Phase 11 candidates stay in the optimizer aggregate until a perfumer
   * deliberately invokes this bridge. Formula remains the only writer of its
   * draft/components/provenance tables, and repeats every math/eligibility
   * guard at the final persistence boundary.
   */
  async saveReformulationCandidateAsDraft(context: PlatformContext, candidateId: string, formulaProjectId: string, key?: string) {
    await this.platform.requirePermission(context, 'formula.edit')
    return this.idempotent(context, 'reformulation.candidates.save-draft', key, { candidateId, formulaProjectId }, async (tx) => {
      return this.persistReformulationCandidateAsDraftInTransaction(context, tx, candidateId, formulaProjectId)
    })
  }

  async saveReformulationCandidateAsDraftInTransaction(context: PlatformContext, tx: Transaction, candidateId: string, formulaProjectId: string) {
    return this.persistReformulationCandidateAsDraftInTransaction(context, tx, candidateId, formulaProjectId)
  }

  /**
   * A non-mutating preflight for cross-service callers. The save path repeats
   * this predicate transactionally, so a caller cannot use the preflight as a
   * substitute for the Formula aggregate's write-time guard.
   */
  async verifyCandidateDraftBinding(context: PlatformContext, candidateId: string, formulaProjectId: string) {
    await this.platform.requirePermission(context, 'formula.edit')
    return this.scoped(context, async (tx) => {
      await this.project(tx, context, formulaProjectId)
      const candidate = await this.candidateForFormulaProject(tx, context, candidateId, formulaProjectId)
      return { candidateId, formulaProjectId, designProjectId: candidate.designProjectId }
    })
  }

  async shareCandidate(context: PlatformContext, candidateId: string, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'formula.edit')
    const parsed = shareCandidateRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Select active recipient members.', 422)
    return this.idempotent(context, 'design.candidates.share', key, { candidateId, ...parsed.data }, async (tx) => {
      const candidate = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_design_candidates WHERE id = ${candidateId} AND organization_id = ${context.organizationId} AND status = 'ADVISORY'`
      if (!candidate[0]) throw new PlatformError('DESIGN_CANDIDATE_NOT_FOUND', 'The selected candidate is not available.', 404)
      const recipients = await tx.$queryRaw<Array<{ userId: string }>>`SELECT user_id AS "userId" FROM v2_memberships WHERE organization_id = ${context.organizationId} AND status = 'ACTIVE' AND user_id IN (${Prisma.join(parsed.data.recipientUserIds)})`
      if (recipients.length !== parsed.data.recipientUserIds.length) throw new PlatformError('DESIGN_SHARE_RECIPIENT_INVALID', 'Every recipient must be an active member of this workspace.', 409)
      for (const recipient of recipients) await tx.$executeRaw`INSERT INTO v2_design_recipient_shares (id, organization_id, candidate_id, recipient_user_id, allow_material_names, created_by) VALUES (${identifier('share')}, ${context.organizationId}, ${candidateId}, ${recipient.userId}, ${parsed.data.allowMaterialNames}, ${context.userId}) ON CONFLICT (organization_id, candidate_id, recipient_user_id) DO UPDATE SET allow_material_names = EXCLUDED.allow_material_names, status = 'ACTIVE', revoked_at = NULL`
      await this.audit(tx, context, 'design.candidate.share', 'allowed', 'design_candidate', candidateId, { recipientCount: recipients.length, allowMaterialNames: parsed.data.allowMaterialNames })
      return { candidateId, recipientCount: recipients.length, status: 'ACTIVE' }
    })
  }

  async revokeShare(context: PlatformContext, candidateId: string, recipientUserId: string, key?: string) {
    await this.platform.requirePermission(context, 'formula.edit')
    return this.idempotent(context, 'design.candidates.share.revoke', key, { candidateId, recipientUserId }, async (tx) => {
      const updated = await tx.$executeRaw`UPDATE v2_design_recipient_shares SET status = 'REVOKED', revoked_at = now() WHERE organization_id = ${context.organizationId} AND candidate_id = ${candidateId} AND recipient_user_id = ${recipientUserId} AND status = 'ACTIVE'`
      if (!updated) throw new PlatformError('DESIGN_SHARE_NOT_FOUND', 'The active recipient share is not available.', 404)
      await this.audit(tx, context, 'design.candidate.share.revoke', 'allowed', 'design_candidate', candidateId, { recipientUserId })
      return { candidateId, recipientUserId, status: 'REVOKED' }
    })
  }

  async addFeedback(context: PlatformContext, candidateId: string, rawInput: unknown, key?: string) {
    const parsed = feedbackRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide bounded design feedback.', 422)
    return this.idempotent(context, 'design.candidates.feedback', key, { candidateId, ...parsed.data }, async (tx) => {
      const access = await tx.$queryRaw<Array<{ creatorUserId: string; shared: boolean }>>`
        SELECT c.created_by AS "creatorUserId", EXISTS(SELECT 1 FROM v2_design_recipient_shares s WHERE s.organization_id = c.organization_id AND s.candidate_id = c.id AND s.recipient_user_id = ${context.userId} AND s.status = 'ACTIVE') AS shared
        FROM v2_design_candidates c WHERE c.id = ${candidateId} AND c.organization_id = ${context.organizationId}
      `
      if (!access[0] || (access[0].creatorUserId !== context.userId && !access[0].shared)) throw new PlatformError('DESIGN_CANDIDATE_NOT_FOUND', 'The selected candidate is not available.', 404)
      const id = identifier('feedback')
      await tx.$executeRaw`INSERT INTO v2_design_feedback (id, organization_id, candidate_id, author_user_id, rating, comment) VALUES (${id}, ${context.organizationId}, ${candidateId}, ${context.userId}, ${parsed.data.rating ?? null}, ${parsed.data.comment ?? null})`
      await this.audit(tx, context, 'design.candidate.feedback', 'allowed', 'design_candidate', candidateId, { feedbackHash: digest(parsed.data) })
      return { id, candidateId, status: 'RECORDED' }
    })
  }

  async candidateDetail(context: PlatformContext, candidateId: string) {
    return this.scoped(context, async (tx) => {
      const sensitive = await this.hasPermission(tx, context, 'formula.viewSensitive') && await this.hasPermission(tx, context, 'materials.view')
      const candidate = await tx.$queryRaw<Array<{ id: string; narrative: string; components: FormulaComponent[]; evidence: JsonRecord; creatorUserId: string }>>`SELECT id, narrative, component_proposal AS components, deterministic_evidence AS evidence, created_by AS "creatorUserId" FROM v2_design_candidates WHERE id = ${candidateId} AND organization_id = ${context.organizationId} AND status = 'ADVISORY'`
      if (!candidate[0]) throw new PlatformError('DESIGN_CANDIDATE_NOT_FOUND', 'The selected candidate is not available.', 404)
      const share = await tx.$queryRaw<Array<{ allowMaterialNames: boolean }>>`SELECT allow_material_names AS "allowMaterialNames" FROM v2_design_recipient_shares WHERE organization_id = ${context.organizationId} AND candidate_id = ${candidateId} AND recipient_user_id = ${context.userId} AND status = 'ACTIVE'`
      const owner = candidate[0].creatorUserId === context.userId
      if (!owner && !share[0] && !sensitive) throw new PlatformError('DESIGN_CANDIDATE_NOT_FOUND', 'The selected candidate is not available.', 404)
      if (sensitive) return { id: candidate[0].id, narrative: candidate[0].narrative, components: candidate[0].components, evidence: candidate[0].evidence, projection: 'PRIVATE' }
      let materialNames: string[] = []
      if (share[0]?.allowMaterialNames) {
        const ids = candidate[0].components.map((component) => component.materialId)
        materialNames = (await tx.$queryRaw<Array<{ name: string }>>`SELECT name FROM v2_materials WHERE organization_id = ${context.organizationId} AND id IN (${Prisma.join(ids)}) ORDER BY name ASC`).map((item) => item.name)
      }
      return { id: candidate[0].id, narrative: candidate[0].narrative, evidence: { complianceEligibility: candidate[0].evidence.complianceEligibility ?? 'NOT_EVALUATED', evidenceQuality: candidate[0].evidence.evidenceQuality ?? 'NOT_EVALUATED' }, materialNames, projection: 'SAFE_SHARE' }
    })
  }
}
