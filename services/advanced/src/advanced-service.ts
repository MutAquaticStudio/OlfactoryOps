import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import {
  bulkOperationCommitSchema,
  bulkOperationPreviewSchema,
  dataOpsRunRequestSchema,
  importCommitSchema,
  importCreateSchema,
  optimizerCandidateDecisionSchema,
  optimizerRunCreateSchema,
  type CandidateComponentProposal,
  type OptimizerConstraint,
  type OptimizerObjectiveWeights,
} from '../../../packages/contracts/src/advanced.js'
import { calculateFormulaMath } from '../../formula/src/formula-math.js'
import { FormulaService } from '../../formula/src/formula-service.js'
import { LabOperationsService } from '../../lab-ops/src/service.js'
import { PlatformError, PlatformService } from '../../platform/src/service.js'
import type { PlatformContext } from '../../platform/src/types.js'
import { parseSpreadsheet, type SpreadsheetRecord } from './spreadsheet.js'

type Transaction = Prisma.TransactionClient
type JsonRecord = Record<string, unknown>
type IdempotencyRow = { requestHash: string; response: unknown }
type FormulaComponentRow = { materialId: string; percentage: Prisma.Decimal | number; position: number; note: string | null }
type MaterialRow = { id: string; name: string; internalCode: string | null; sensoryMetadata: JsonRecord; status: string }
type CandidateProjection = { id: string; candidateNumber: number; status: string; scorecard: JsonRecord; componentProposal: CandidateComponentProposal[]; savedFormulaDraftId: string | null; createdAt: Date }
type PreparedImportRow = { sourceRowNumber: number; normalized: JsonRecord; status: 'VALID' | 'INVALID' | 'DUPLICATE'; errors: string[] }
type CandidateVisibilityContext = { canViewFormulaSensitive: boolean; canViewCost: boolean }

export function sanitizeOptimizerCandidate(candidate: CandidateProjection, context: CandidateVisibilityContext) {
  const scorecard = { ...candidate.scorecard }
  if (!context.canViewCost) {
    delete scorecard.cost
  }
  return {
    ...candidate,
    createdAt: candidate.createdAt.toISOString(),
    componentProposal: context.canViewFormulaSensitive ? candidate.componentProposal : undefined,
    scorecard,
  }
}

const EPSILON = 0.000001
const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '')}`
const asNumber = (value: Prisma.Decimal | number | string | null | undefined) => Number(value ?? 0)
const iso = (value: Date | null | undefined) => value?.toISOString() ?? null
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as JsonRecord).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`).join(',')}}`
  return JSON.stringify(value)
}
const digest = (value: unknown) => createHash('sha256').update(stableJson(value)).digest('hex')
const finite = (value: string | undefined) => value === undefined || value.trim() === '' ? undefined : Number(value)
const normalizedHeader = (value: string) => value.trim().toLocaleLowerCase()

function validated<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }, value: unknown, code: string) {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new PlatformError(code, parsed.error.issues[0]?.message ?? 'The request is invalid.', 422)
  return parsed.data
}

function descriptorTokens(value: unknown, output = new Set<string>()) {
  if (typeof value === 'string') value.toLocaleLowerCase().split(/[^a-z0-9]+/i).filter((part) => part.length >= 3 && part.length <= 48).forEach((part) => output.add(part))
  else if (Array.isArray(value)) value.forEach((item) => descriptorTokens(item, output))
  else if (value && typeof value === 'object') Object.entries(value as JsonRecord).forEach(([key, child]) => {
    if (/odor|note|descriptor|family|sensory|accord|facet/i.test(key)) descriptorTokens(child, output)
  })
  return output
}

function jaccard(left: Set<string>, right: Set<string>) {
  const union = new Set([...left, ...right])
  if (!union.size) return 0
  let overlap = 0
  for (const token of left) if (right.has(token)) overlap += 1
  return overlap / union.size
}

function normalizeComponents(items: CandidateComponentProposal[]) {
  const total = items.reduce((sum, item) => sum + item.percentage, 0)
  if (total <= 0) throw new PlatformError('OPTIMIZER_COMPONENTS_INVALID', 'The optimizer produced an empty component proposal.', 409)
  const normalized = items.map((item, index) => ({ ...item, position: index, percentage: Number(((item.percentage / total) * 100).toFixed(6)) }))
  const drift = Number((100 - normalized.reduce((sum, item) => sum + item.percentage, 0)).toFixed(6))
  normalized[normalized.length - 1]!.percentage = Number((normalized[normalized.length - 1]!.percentage + drift).toFixed(6))
  const math = calculateFormulaMath(normalized, 100)
  if (!math.valid) throw new PlatformError('OPTIMIZER_MATH_INVALID', 'The optimizer could not produce a valid 100 percent candidate.', 409)
  return math.components.map((item) => ({ materialId: item.materialId, percentage: item.percentage, position: item.position, note: item.note }))
}

function base64Bytes(value: string) {
  const bytes = Buffer.from(value, 'base64')
  if (!bytes.length || bytes.byteLength > 5_000_000) throw new PlatformError('IMPORT_SOURCE_SIZE_INVALID', 'The import source is empty or exceeds the 5 MB upload limit.', 422)
  return new Uint8Array(bytes)
}

function valueFor(record: SpreadsheetRecord, mapping: Record<string, string>, target: string, aliases: string[]) {
  const requested = mapping[target]
  const keys = [requested, target, ...aliases].filter((item): item is string => Boolean(item)).map(normalizedHeader)
  for (const [header, value] of Object.entries(record.values)) if (keys.includes(normalizedHeader(header))) return value.trim()
  return ''
}

function optionalString(value: string) { return value.trim() || undefined }

const importMappingFields = {
  MATERIALS: new Set(['name', 'internalCode', 'description', 'cas']),
  SUPPLIERS: new Set(['legalName', 'tradeName', 'primaryEmail', 'currency', 'leadTimeDays']),
  SUPPLIER_OFFERS: new Set(['materialId', 'materialInternalCode', 'supplierId', 'supplierLegalName', 'productCode', 'unitPrice', 'minimumOrderQuantity', 'currency', 'unit', 'tradeName', 'grade', 'leadTimeDays', 'packSize']),
  OPENING_INVENTORY: new Set(['materialId', 'materialInternalCode', 'quantityGrams', 'location', 'supplierLot', 'currency', 'unitPrice', 'supplierOfferId', 'manufacturedAt', 'expiresAt']),
} as const

function validateImportMapping(kind: keyof typeof importMappingFields, mapping: Record<string, string>) {
  for (const target of Object.keys(mapping)) {
    if (!importMappingFields[kind].has(target as never)) {
      throw new PlatformError('IMPORT_MAPPING_INVALID', `The mapping target ${target} is not supported for this import kind.`, 422)
    }
  }
}

/**
 * Phase 11 keeps optimisation advisory and imports create-only. It owns only
 * its snapshots and reports; Formula and Lab Operations remain the sole
 * writers for Formula drafts, materials, suppliers, offers and inventory.
 */
export class AdvancedOperationsService {
  private readonly confirmationSecret: string

  constructor(
    private readonly client: PrismaClient,
    private readonly platform: PlatformService,
    private readonly formula: FormulaService,
    private readonly lab: LabOperationsService,
    config: { confirmationSecret?: string } = {},
  ) { this.confirmationSecret = config.confirmationSecret ?? 'local-v2-phase11-confirmation-secret' }

  private async scoped<T>(context: PlatformContext, action: (tx: Transaction) => Promise<T>) {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true), set_config('app.user_id', ${context.userId}, true)`
      return action(tx)
    })
  }

  private async has(context: PlatformContext, permission: string) {
    try { await this.platform.requirePermission(context, permission); return true } catch { return false }
  }

  private async audit(tx: Transaction, context: PlatformContext, action: string, outcome: 'allowed' | 'blocked', subjectType: string, subjectId: string, payload?: unknown) {
    await tx.$executeRaw`
      INSERT INTO v2_audit_events (id, organization_id, actor_user_id, action, outcome, subject_type, subject_id, correlation_id, payload_hash)
      VALUES (${id('audit')}, ${context.organizationId}, ${context.userId}, ${action}, ${outcome}, ${subjectType}, ${subjectId}, ${id('corr')}, ${payload === undefined ? null : digest(payload)})
    `
  }

  private async idempotent<T extends JsonRecord>(context: PlatformContext, route: string, key: string | undefined, request: unknown, action: (tx: Transaction) => Promise<T>) {
    if (!key || key.length < 12 || key.length > 200) throw new PlatformError('IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key for this operation.', 428)
    const requestHash = digest(request)
    return this.scoped(context, async (tx) => {
      const previous = await tx.$queryRaw<IdempotencyRow[]>`
        SELECT request_hash AS "requestHash", response FROM v2_operation_idempotency
        WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}
      `
      if (previous[0]) {
        if (previous[0].requestHash !== requestHash) throw new PlatformError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request.', 409)
        if (!previous[0].response) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
        return previous[0].response as T
      }
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO v2_operation_idempotency (id, organization_id, actor_user_id, route, idempotency_key, request_hash)
        VALUES (${id('idem')}, ${context.organizationId}, ${context.userId}, ${route}, ${key}, ${requestHash})
        ON CONFLICT (organization_id, actor_user_id, route, idempotency_key) DO NOTHING RETURNING id
      `
      if (!inserted[0]) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
      const result = await action(tx)
      await tx.$executeRaw`UPDATE v2_operation_idempotency SET response = ${JSON.stringify(result)}::jsonb WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}`
      return result
    })
  }

  private confirmationToken(scope: string, recordId: string, hash: string) {
    return createHmac('sha256', this.confirmationSecret).update(`${scope}:${recordId}:${hash}`).digest('hex')
  }

  private confirmationMatches(scope: string, recordId: string, hash: string, supplied: string) {
    const expected = createHash('sha256').update(this.confirmationToken(scope, recordId, hash)).digest()
    const actual = createHash('sha256').update(supplied).digest()
    return timingSafeEqual(expected, actual)
  }

  private async parentFormula(tx: Transaction, context: PlatformContext, formulaVersionId: string) {
    const versions = await tx.$queryRaw<Array<{ id: string; formulaProjectId: string; contentHash: string; approvalStatus: string }>>`
      SELECT id, formula_project_id AS "formulaProjectId", content_hash AS "contentHash", approval_status AS "approvalStatus"
      FROM v2_formula_versions WHERE organization_id = ${context.organizationId} AND id = ${formulaVersionId}
    `
    const version = versions[0]
    if (!version) throw new PlatformError('FORMULA_VERSION_NOT_FOUND', 'The selected Formula Version is not available in this workspace.', 404)
    if (version.approvalStatus !== 'APPROVED') throw new PlatformError('OPTIMIZER_FORMULA_NOT_APPROVED', 'The optimizer can start only from an approved Formula Version.', 409)
    const components = await tx.$queryRaw<FormulaComponentRow[]>`
      SELECT material_id AS "materialId", percentage, position, note
      FROM v2_formula_version_components WHERE organization_id = ${context.organizationId} AND formula_version_id = ${formulaVersionId}
      ORDER BY position ASC
    `
    if (!components.length) throw new PlatformError('OPTIMIZER_FORMULA_EMPTY', 'The approved Formula Version has no components.', 409)
    return { ...version, components: components.map((item) => ({ materialId: item.materialId, percentage: asNumber(item.percentage), position: item.position, note: item.note ?? undefined })) }
  }

  private async materialUniverse(tx: Transaction, context: PlatformContext, constraints: OptimizerConstraint) {
    const rows = await tx.$queryRaw<MaterialRow[]>`
      SELECT m.id, m.name, m.internal_code AS "internalCode", m.sensory_metadata AS "sensoryMetadata", m.status
      FROM v2_materials m
      WHERE m.organization_id = ${context.organizationId} AND m.status = 'ACTIVE'
        AND NOT EXISTS (SELECT 1 FROM v2_material_compliance c WHERE c.organization_id = m.organization_id AND c.material_id = m.id AND c.status = 'BLOCKED')
      ORDER BY m.id ASC
    `
    const allowed = constraints.allowedMaterialIds ? new Set(constraints.allowedMaterialIds) : undefined
    const prohibited = new Set(constraints.prohibitedMaterialIds)
    const universe = rows.filter((row) => (!allowed || allowed.has(row.id)) && !prohibited.has(row.id))
    if (!universe.length) throw new PlatformError('OPTIMIZER_UNIVERSE_EMPTY', 'No active, eligible materials match the optimizer constraints.', 409)
    for (const required of constraints.requiredMaterialIds) if (!universe.some((row) => row.id === required)) throw new PlatformError('OPTIMIZER_REQUIRED_MATERIAL_DENIED', 'A required material is not active or is outside the pinned optimizer universe.', 409)
    return universe
  }

  private async availabilityByMaterial(tx: Transaction, context: PlatformContext) {
    const rows = await tx.$queryRaw<Array<{ materialId: string; availableGrams: Prisma.Decimal }>>`
      SELECT l.material_id AS "materialId", COALESCE(SUM(
        CASE WHEN l.status = 'AVAILABLE' AND l.quality_status IN ('PASSED','NOT_REQUIRED')
                    AND (l.expires_at IS NULL OR l.expires_at > now())
             THEN COALESCE((SELECT SUM(m.quantity_delta_g) FROM v2_inventory_movements m WHERE m.organization_id = l.organization_id AND m.lot_id = l.id), 0)
             ELSE 0 END
      ), 0) AS "availableGrams"
      FROM v2_inventory_lots l WHERE l.organization_id = ${context.organizationId} GROUP BY l.material_id
    `
    return new Map(rows.map((row) => [row.materialId, Math.max(0, asNumber(row.availableGrams))]))
  }

  private async costByMaterial(tx: Transaction, context: PlatformContext, currency?: string) {
    const rows = await tx.$queryRaw<Array<{ materialId: string; unitPrice: Prisma.Decimal; unit: string; currency: string }>>`
      SELECT material_id AS "materialId", unit_price AS "unitPrice", unit, currency
      FROM v2_supplier_offers
      WHERE organization_id = ${context.organizationId} AND status = 'ACTIVE'
        AND (${currency ?? null}::text IS NULL OR currency = ${currency ?? null})
      ORDER BY material_id ASC, unit_price ASC, id ASC
    `
    const costs = new Map<string, number>()
    for (const row of rows) if (!costs.has(row.materialId)) costs.set(row.materialId, asNumber(row.unitPrice) * (row.unit === 'KG' ? 1 : 1000))
    return costs
  }

  private async complianceByMaterial(tx: Transaction, context: PlatformContext, category?: string) {
    if (!category) return new Map<string, 'NOT_EVALUATED'>()
    const rows = await tx.$queryRaw<Array<{ materialId: string; status: string }>>`
      SELECT material_id AS "materialId", status FROM v2_material_compliance
      WHERE organization_id = ${context.organizationId} AND category = ${category}
      ORDER BY material_id ASC, created_at DESC
    `
    const result = new Map<string, string>()
    for (const row of rows) if (!result.has(row.materialId)) result.set(row.materialId, row.status)
    return result
  }

  private async evidenceSnapshot(tx: Transaction, context: PlatformContext, formulaVersionId: string, universe: MaterialRow[]) {
    const [canSensory, canConsumer, canScience] = await Promise.all([
      this.has(context, 'sensory.view').then(async (allowed) => allowed && await this.has(context, 'trials.viewAll')),
      this.has(context, 'sentiment.view'),
      this.has(context, 'scientific_ai.use').then(async (allowed) => allowed && await this.has(context, 'materials.viewSensitive')),
    ])
    const sensory = canSensory ? await tx.$queryRaw<Array<{ evidenceCount: number; status: string }>>`
      SELECT COALESCE(SUM(mv.evidence_count), 0)::int AS "evidenceCount", COALESCE(MAX(mv.evidence_status), 'NOT_ENOUGH_EVIDENCE') AS status
      FROM v2_trials t
      JOIN v2_private_sensory_memories m ON m.organization_id = t.organization_id AND m.subject_type = 'TRIAL' AND m.subject_id = t.id AND m.status = 'ACTIVE'
      JOIN v2_private_sensory_memory_versions mv ON mv.organization_id = m.organization_id AND mv.memory_id = m.id AND mv.version_number = m.current_version_number
      WHERE t.organization_id = ${context.organizationId} AND t.formula_version_id = ${formulaVersionId} AND t.status = 'CLOSED'
    ` : []
    const consumer = canConsumer ? await tx.$queryRaw<Array<{ evidenceCount: number; status: string }>>`
      SELECT COALESCE(MAX(evidence_count), 0)::int AS "evidenceCount", COALESCE(MAX(evidence_status), 'NOT_ENOUGH_EVIDENCE') AS status
      FROM v2_consumer_preference_vectors WHERE organization_id = ${context.organizationId} AND evidence_status <> 'INVALIDATED'
    ` : []
    const scientific = canScience ? await tx.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM v2_scientific_artifacts
      WHERE organization_id = ${context.organizationId} AND material_id IN (${Prisma.join(universe.map((item) => item.id))}) AND evidence_status = 'VERIFIED'
    ` : []
    return {
      molecularOlfactory: canScience ? { status: scientific[0]?.count ? 'VERIFIED' : 'NOT_EVALUATED', verifiedArtifactCount: scientific[0]?.count ?? 0 } : { status: 'NOT_AUTHORIZED' },
      privateSensoryMemory: canSensory ? { status: sensory[0]?.status ?? 'NOT_ENOUGH_EVIDENCE', evidenceCount: sensory[0]?.evidenceCount ?? 0 } : { status: 'NOT_AUTHORIZED' },
      consumerIntelligence: canConsumer ? { status: consumer[0]?.status ?? 'NOT_ENOUGH_EVIDENCE', evidenceCount: consumer[0]?.evidenceCount ?? 0 } : { status: 'NOT_AUTHORIZED' },
      sustainability: { status: 'NOT_EVALUATED', reason: 'No governed sustainability facet is registered in V2.' },
    }
  }

  private candidateCompliance(components: CandidateComponentProposal[], constraints: OptimizerConstraint, compliance: Map<string, string>) {
    if (!constraints.requiredComplianceCategory) return 'NOT_EVALUATED'
    const statuses = components.map((component) => compliance.get(component.materialId) ?? 'NOT_EVALUATED')
    if (statuses.every((status) => status === 'APPROVED')) return 'VERIFIED'
    if (statuses.some((status) => status === 'BLOCKED')) return 'BLOCKED'
    if (statuses.every((status) => status === 'NOT_EVALUATED')) return 'NOT_EVALUATED'
    return 'REVIEW_REQUIRED'
  }

  private chooseReplacement(source: CandidateComponentProposal, materials: MaterialRow[], existing: Set<string>, constraints: OptimizerConstraint, availability: Map<string, number>, costs: Map<string, number>, offset = 0) {
    const sourceMaterial = materials.find((item) => item.id === source.materialId)
    const sourceTokens = descriptorTokens(sourceMaterial?.sensoryMetadata ?? {})
    const candidates = materials.filter((item) => !existing.has(item.id)
      && !constraints.prohibitedMaterialIds.includes(item.id)
      && !constraints.replaceMaterialIds.includes(item.id))
      .map((item) => {
        const odor = jaccard(sourceTokens, descriptorTokens(item.sensoryMetadata))
        const available = availability.get(item.id) && availability.get(item.id)! > EPSILON ? 1 : 0
        const cost = costs.get(item.id)
        const costScore = cost === undefined ? 0 : 1 / (1 + cost)
        return { item, score: odor * 0.75 + available * 0.2 + costScore * 0.05 }
      })
      .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id))
    return candidates[offset % Math.max(1, candidates.length)]?.item
  }

  private buildCandidate(parent: CandidateComponentProposal[], materials: MaterialRow[], constraints: OptimizerConstraint, availability: Map<string, number>, costs: Map<string, number>, strategy: 'BASELINE' | 'REPLACE' | 'COST' | 'AVAILABILITY' | 'DIVERSITY', offset = 0) {
    const remove = new Set([...constraints.prohibitedMaterialIds, ...constraints.replaceMaterialIds])
    if (strategy === 'AVAILABILITY') for (const component of parent) if (!(availability.get(component.materialId) && availability.get(component.materialId)! > EPSILON)) remove.add(component.materialId)
    if (strategy === 'COST' && costs.size) {
      const mostExpensive = [...parent].filter((component) => costs.has(component.materialId)).sort((left, right) => (costs.get(right.materialId)! - costs.get(left.materialId)!) || left.materialId.localeCompare(right.materialId))[0]
      if (mostExpensive) remove.add(mostExpensive.materialId)
    }
    if (strategy === 'BASELINE' && remove.size) return undefined
    const components = parent.filter((component) => !remove.has(component.materialId)).map((component) => ({ ...component }))
    const existing = new Set(components.map((component) => component.materialId))
    for (const source of parent.filter((component) => remove.has(component.materialId))) {
      const replacement = this.chooseReplacement(source, materials, existing, constraints, availability, costs, offset)
      if (!replacement) return undefined
      components.push({ materialId: replacement.id, percentage: source.percentage, position: components.length, note: `Advisory replacement for ${source.materialId}` })
      existing.add(replacement.id)
    }
    for (const required of constraints.requiredMaterialIds) {
      if (existing.has(required)) continue
      const material = materials.find((item) => item.id === required)
      if (!material) return undefined
      if (components.length >= constraints.maxComponentCount) return undefined
      const addedWeight = Math.min(5, 100 / Math.max(4, components.length + 1))
      for (const component of components) component.percentage *= (100 - addedWeight) / 100
      components.push({ materialId: material.id, percentage: addedWeight, position: components.length, note: 'Required material' })
      existing.add(material.id)
    }
    if (components.length < constraints.minComponentCount || components.length > constraints.maxComponentCount) return undefined
    const normalized = normalizeComponents(components)
    if (constraints.requireAvailableInventory && normalized.some((component) => !(availability.get(component.materialId) && availability.get(component.materialId)! > EPSILON))) return undefined
    return normalized
  }

  private candidateScore(parent: CandidateComponentProposal[], components: CandidateComponentProposal[], objectives: OptimizerObjectiveWeights, availability: Map<string, number>, costs: Map<string, number>, constraints: OptimizerConstraint, compliance: Map<string, string>, evidence: JsonRecord) {
    const parentByMaterial = new Map(parent.map((component) => [component.materialId, component.percentage]))
    const overlap = components.reduce((score, component) => score + Math.min(component.percentage, parentByMaterial.get(component.materialId) ?? 0), 0) / 100
    const availabilityScore = components.length ? components.filter((component) => (availability.get(component.materialId) ?? 0) > EPSILON).length / components.length : 0
    const knownCosts = components.map((component) => ({ component, cost: costs.get(component.materialId) })).filter((item): item is { component: CandidateComponentProposal; cost: number } => item.cost !== undefined)
    const costPerKg = knownCosts.length === components.length ? knownCosts.reduce((sum, item) => sum + (item.component.percentage / 100) * item.cost, 0) : undefined
    const costScore = constraints.targetCostPerKg === undefined ? 1 : costPerKg === undefined ? 0 : Math.min(1, constraints.targetCostPerKg / Math.max(constraints.targetCostPerKg, costPerKg))
    const sensoryCount = typeof (evidence.privateSensoryMemory as JsonRecord | undefined)?.evidenceCount === 'number' ? Number((evidence.privateSensoryMemory as JsonRecord).evidenceCount) : 0
    const consumerCount = typeof (evidence.consumerIntelligence as JsonRecord | undefined)?.evidenceCount === 'number' ? Number((evidence.consumerIntelligence as JsonRecord).evidenceCount) : 0
    const score = objectives.odorSimilarity * overlap + objectives.briefAlignment * overlap + objectives.availability * availabilityScore + objectives.cost * costScore + objectives.sensoryEvidence * Math.min(1, sensoryCount / 6) + objectives.consumerEvidence * Math.min(1, consumerCount / 25)
    return {
      total: Number(score.toFixed(6)), odorSimilarity: Number(overlap.toFixed(6)), briefAlignment: Number(overlap.toFixed(6)), availability: Number(availabilityScore.toFixed(6)), cost: { score: Number(costScore.toFixed(6)), estimatedPerKg: costPerKg === undefined ? null : Number(costPerKg.toFixed(6)), currency: constraints.currency ?? null, status: costPerKg === undefined ? 'NOT_EVALUATED' : 'ESTIMATED' },
      compliance: { category: constraints.requiredComplianceCategory ?? null, status: this.candidateCompliance(components, constraints, compliance) },
      evidenceFamilies: evidence,
      advisory: true,
    }
  }

  async listOptimizerRuns(context: PlatformContext) {
    await this.platform.requirePermission(context, 'optimizer.view')
    await this.platform.requirePermission(context, 'formula.view')
    return this.scoped(context, async (tx) => tx.$queryRaw<Array<{ id: string; parentFormulaVersionId: string; status: string; solverVersion: string; createdAt: Date; completedAt: Date | null; candidateCount: number }>>`
      SELECT r.id, r.parent_formula_version_id AS "parentFormulaVersionId", r.status, r.solver_version AS "solverVersion", r.created_at AS "createdAt", r.completed_at AS "completedAt",
        (SELECT count(*)::int FROM v2_reformulation_candidates c WHERE c.organization_id = r.organization_id AND c.reformulation_run_id = r.id) AS "candidateCount"
      FROM v2_reformulation_runs r WHERE r.organization_id = ${context.organizationId} ORDER BY r.created_at DESC LIMIT 100
    `.then((rows) => rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), completedAt: iso(row.completedAt) }))))
  }

  async optimizerDetail(context: PlatformContext, runId: string) {
    await this.platform.requirePermission(context, 'optimizer.view')
    await this.platform.requirePermission(context, 'formula.view')
    const sensitive = await this.has(context, 'formula.viewSensitive')
    const canViewCost = await this.has(context, 'costing.view')
    return this.scoped(context, async (tx) => {
      const runs = await tx.$queryRaw<Array<{ id: string; parentFormulaVersionId: string; status: string; constraintSnapshot: JsonRecord; objectiveWeights: JsonRecord; solverConfig: JsonRecord; evidenceSnapshot: JsonRecord; inputHash: string; resultHash: string | null; createdAt: Date; completedAt: Date | null }>>`
        SELECT id, parent_formula_version_id AS "parentFormulaVersionId", status, constraint_snapshot AS "constraintSnapshot", objective_weights AS "objectiveWeights", solver_config AS "solverConfig", evidence_snapshot AS "evidenceSnapshot", input_hash AS "inputHash", result_hash AS "resultHash", created_at AS "createdAt", completed_at AS "completedAt"
        FROM v2_reformulation_runs WHERE organization_id = ${context.organizationId} AND id = ${runId}
      `
      if (!runs[0]) throw new PlatformError('OPTIMIZER_RUN_NOT_FOUND', 'The requested optimizer run is not available in this workspace.', 404)
      const candidates = await tx.$queryRaw<CandidateProjection[]>`
        SELECT id, candidate_number AS "candidateNumber", status, scorecard, component_proposal AS "componentProposal", saved_formula_draft_id AS "savedFormulaDraftId", created_at AS "createdAt"
        FROM v2_reformulation_candidates WHERE organization_id = ${context.organizationId} AND reformulation_run_id = ${runId} ORDER BY candidate_number ASC
      `
      const run = runs[0]
      return {
        run: { ...run, createdAt: run.createdAt.toISOString(), completedAt: iso(run.completedAt) },
        candidates: candidates.map((candidate) => sanitizeOptimizerCandidate(candidate, {
          canViewFormulaSensitive: sensitive,
          canViewCost,
        })),
      }
    })
  }

  async createOptimizerRun(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'optimizer.run')
    await this.platform.requirePermission(context, 'formula.viewSensitive')
    await this.platform.requirePermission(context, 'materials.view')
    const input = validated(optimizerRunCreateSchema, rawInput, 'OPTIMIZER_REQUEST_INVALID')
    if (input.constraints.targetCostPerKg !== undefined) await this.platform.requirePermission(context, 'costing.view')
    if (input.objectives.cost > 0) await this.platform.requirePermission(context, 'costing.view')
    if (input.constraints.requireAvailableInventory) await this.platform.requirePermission(context, 'inventory.view')
    return this.idempotent(context, 'optimizer.runs.create', key, input, async (tx) => {
      const parent = await this.parentFormula(tx, context, input.parentFormulaVersionId)
      const universe = await this.materialUniverse(tx, context, input.constraints)
      const universeIds = new Set(universe.map((material) => material.id))
      if (parent.components.some((component) => !universeIds.has(component.materialId) && !input.constraints.replaceMaterialIds.includes(component.materialId) && !input.constraints.prohibitedMaterialIds.includes(component.materialId))) {
        throw new PlatformError('OPTIMIZER_PARENT_MATERIAL_INELIGIBLE', 'The parent Formula contains an ineligible material that must be explicitly replaced or prohibited.', 409)
      }
      const availability = input.constraints.requireAvailableInventory || input.objectives.availability > 0 ? await this.availabilityByMaterial(tx, context) : new Map<string, number>()
      const costs = input.constraints.targetCostPerKg !== undefined || input.objectives.cost > 0 ? await this.costByMaterial(tx, context, input.constraints.currency) : new Map<string, number>()
      if (input.constraints.targetCostPerKg !== undefined && parent.components.some((component) => !costs.has(component.materialId) && !input.constraints.replaceMaterialIds.includes(component.materialId))) throw new PlatformError('OPTIMIZER_COST_EVIDENCE_REQUIRED', 'A cost-constrained optimizer run requires cost evidence for every retained parent material.', 409)
      const compliance = await this.complianceByMaterial(tx, context, input.constraints.requiredComplianceCategory)
      const evidence = await this.evidenceSnapshot(tx, context, parent.id, universe)
      const parentComponents = parent.components.map((component) => ({ ...component }))
      const strategies: Array<'BASELINE' | 'REPLACE' | 'COST' | 'AVAILABILITY' | 'DIVERSITY'> = ['BASELINE', 'REPLACE', 'COST', 'AVAILABILITY', 'DIVERSITY']
      const proposals: Array<{ components: CandidateComponentProposal[]; scorecard: JsonRecord }> = []
      const seen = new Set<string>()
      for (let attempt = 0; proposals.length < input.solverConfig.candidateLimit && attempt < input.solverConfig.candidateLimit * 4; attempt += 1) {
        const strategy = strategies[attempt % strategies.length]!
        const components = this.buildCandidate(parentComponents, universe, input.constraints, availability, costs, strategy, input.solverConfig.randomSeed + attempt)
        if (!components) continue
        const componentHash = digest(components)
        if (seen.has(componentHash)) continue
        const scorecard = this.candidateScore(parentComponents, components, input.objectives, availability, costs, input.constraints, compliance, evidence)
        if (input.constraints.complianceMode === 'APPROVED_EVIDENCE_ONLY' && (scorecard.compliance as JsonRecord).status !== 'VERIFIED') continue
        if (input.constraints.targetCostPerKg !== undefined && ((scorecard.cost as JsonRecord).estimatedPerKg === null || Number((scorecard.cost as JsonRecord).estimatedPerKg) > input.constraints.targetCostPerKg + EPSILON)) continue
        seen.add(componentHash); proposals.push({ components, scorecard })
      }
      if (!proposals.length) throw new PlatformError('OPTIMIZER_NO_FEASIBLE_CANDIDATE', 'No candidate satisfies the explicit deterministic optimizer constraints.', 409)
      const universeSnapshot = { materialIds: universe.map((material) => material.id), materialMetadataHashes: universe.map((material) => ({ id: material.id, hash: digest({ name: material.name, internalCode: material.internalCode, sensoryMetadata: material.sensoryMetadata }) })) }
      const hashes = { parentFormulaContentHash: parent.contentHash, materialUniverseHash: digest(universeSnapshot), constraintHash: digest(input.constraints), objectiveHash: digest(input.objectives), solverConfigHash: digest(input.solverConfig), evidenceHash: digest(evidence) }
      const runId = id('opt_run'); const inputHash = digest({ parentFormulaVersionId: parent.id, ...hashes })
      await tx.$executeRaw`
        INSERT INTO v2_reformulation_runs (id, organization_id, parent_formula_version_id, status, parent_formula_content_hash, material_universe_snapshot, material_universe_hash, constraint_snapshot, constraint_hash, objective_weights, objective_hash, solver_config, solver_config_hash, evidence_snapshot, evidence_hash, input_hash, result_hash, solver_version, random_seed, created_by, completed_at)
        VALUES (${runId}, ${context.organizationId}, ${parent.id}, 'SOLVING', ${hashes.parentFormulaContentHash}, ${JSON.stringify(universeSnapshot)}::jsonb, ${hashes.materialUniverseHash}, ${JSON.stringify(input.constraints)}::jsonb, ${hashes.constraintHash}, ${JSON.stringify(input.objectives)}::jsonb, ${hashes.objectiveHash}, ${JSON.stringify(input.solverConfig)}::jsonb, ${hashes.solverConfigHash}, ${JSON.stringify(evidence)}::jsonb, ${hashes.evidenceHash}, ${inputHash}, NULL, ${input.solverConfig.algorithmVersion}, ${input.solverConfig.randomSeed}, ${context.userId}, NULL)
      `
      for (const [index, proposal] of proposals.entries()) {
        const candidateId = id('opt_candidate'); const componentHash = digest(proposal.components); const resultHash = digest({ componentHash, scorecard: proposal.scorecard, evidenceHash: hashes.evidenceHash })
        await tx.$executeRaw`
          INSERT INTO v2_reformulation_candidates (id, organization_id, reformulation_run_id, candidate_number, component_proposal, component_hash, scorecard, evidence_snapshot, result_hash, created_by)
          VALUES (${candidateId}, ${context.organizationId}, ${runId}, ${index + 1}, ${JSON.stringify(proposal.components)}::jsonb, ${componentHash}, ${JSON.stringify(proposal.scorecard)}::jsonb, ${JSON.stringify(evidence)}::jsonb, ${resultHash}, ${context.userId})
        `
      }
      const resultHash = digest(proposals.map((proposal) => ({ components: proposal.components, scorecard: proposal.scorecard })))
      await tx.$executeRaw`UPDATE v2_reformulation_runs SET status = 'COMPLETED', result_hash = ${resultHash}, completed_at = now(), updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${runId}`
      await this.audit(tx, context, 'optimizer.run.complete', 'allowed', 'reformulation_run', runId, { ...hashes, resultHash, candidateCount: proposals.length, advisory: true })
      return { id: runId, status: 'COMPLETED', candidateCount: proposals.length, inputHash, resultHash, advisory: true }
    })
  }

  async reviewOptimizerCandidate(context: PlatformContext, candidateId: string, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'optimizer.review')
    const input = validated(optimizerCandidateDecisionSchema, rawInput, 'OPTIMIZER_REVIEW_INVALID')
    return this.idempotent(context, 'optimizer.candidates.review', key, { candidateId, ...input }, async (tx) => {
      let savedDraft: { id: string; status: string; alreadySaved: boolean } | undefined
      const candidates = await tx.$queryRaw<Array<{ id: string; runId: string; status: string; resultHash: string }>>`
        SELECT c.id, c.reformulation_run_id AS "runId", c.status, c.result_hash AS "resultHash"
        FROM v2_reformulation_candidates c
        JOIN v2_reformulation_runs r ON r.organization_id = c.organization_id AND r.id = c.reformulation_run_id
        WHERE c.organization_id = ${context.organizationId} AND c.id = ${candidateId} AND r.status = 'COMPLETED'
        FOR UPDATE
      `
      const candidate = candidates[0]
      if (!candidate) throw new PlatformError('REFORMULATION_CANDIDATE_NOT_FOUND', 'The optimizer candidate is not available for review.', 404)
      if (candidate.status !== 'ADVISORY' && !(input.decision === 'SAVE_AS_DRAFT' && candidate.status === 'SAVED_AS_DRAFT')) throw new PlatformError('REFORMULATION_CANDIDATE_REVIEWED', 'This optimizer candidate has already received a final review decision.', 409)
      if (input.decision === 'SAVE_AS_DRAFT') {
        await this.platform.requirePermission(context, 'formula.edit')
        const draftResult = await this.formula.saveReformulationCandidateAsDraftInTransaction(context, tx, candidateId, input.formulaProjectId!)
        if (draftResult.status === 'DRAFT') savedDraft = draftResult
        else if (draftResult.status !== 'ALREADY_SAVED') {
          throw new PlatformError('OPTIMIZER_REVIEW_FAILURE', 'Unable to persist the optimizer draft review result.', 409)
        }
      }
      const nextStatus = input.decision === 'SAVE_AS_DRAFT' ? 'SAVED_AS_DRAFT' : input.decision === 'REJECT' ? 'REJECTED' : 'ARCHIVED'
      await tx.$executeRaw`
        UPDATE v2_reformulation_candidates SET status = ${nextStatus}, saved_formula_draft_id = ${savedDraft?.id ?? null}, updated_at = now()
        WHERE organization_id = ${context.organizationId} AND id = ${candidateId}
      `
      const reviewId = id('opt_review'); const evidenceHash = digest({ candidateResultHash: candidate.resultHash, decision: input, savedDraftId: savedDraft?.id ?? null })
      await tx.$executeRaw`
        INSERT INTO v2_reformulation_candidate_reviews (id, organization_id, reformulation_candidate_id, decision, formula_project_id, rationale, evidence_hash, decided_by)
        VALUES (${reviewId}, ${context.organizationId}, ${candidateId}, ${input.decision}, ${input.formulaProjectId ?? null}, ${input.rationale}, ${evidenceHash}, ${context.userId})
      `
      await this.audit(tx, context, 'optimizer.candidate.review', 'allowed', 'reformulation_candidate', candidateId, { decision: input.decision, savedDraftId: savedDraft?.id ?? null, evidenceHash })
      return { candidateId, status: nextStatus, reviewId, draft: savedDraft ?? null }
    })
  }

  private async prepareImportRows(tx: Transaction, context: PlatformContext, kind: 'MATERIALS' | 'SUPPLIERS' | 'SUPPLIER_OFFERS' | 'OPENING_INVENTORY', records: SpreadsheetRecord[], mapping: Record<string, string>) {
    const duplicateKeys = new Set<string>()
    const prepared: PreparedImportRow[] = []
    for (const record of records) {
      const errors: string[] = []; let normalized: JsonRecord = { sourceRowNumber: record.sourceRowNumber }
      if (kind === 'MATERIALS') {
        const name = valueFor(record, mapping, 'name', ['material', 'material name']); const internalCode = optionalString(valueFor(record, mapping, 'internalCode', ['internal code', 'code'])); const description = optionalString(valueFor(record, mapping, 'description', ['notes'])); const cas = optionalString(valueFor(record, mapping, 'cas', ['cas number']))
        if (!name) errors.push('Material name is required.')
        normalized = { ...normalized, name, internalCode, description, cas }
        const key = `material:${(internalCode ?? name).toLocaleLowerCase()}`
        if (duplicateKeys.has(key)) errors.push('Duplicate material row in this import.')
        duplicateKeys.add(key)
        if (!errors.length) {
          const existing = internalCode ? await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_materials WHERE organization_id = ${context.organizationId} AND internal_code = ${internalCode} LIMIT 1` : await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_materials WHERE organization_id = ${context.organizationId} AND lower(name) = lower(${name}) LIMIT 1`
          if (existing[0]) prepared.push({ sourceRowNumber: record.sourceRowNumber, normalized, status: 'DUPLICATE', errors: ['Create-only import does not overwrite an existing material.'] })
          else prepared.push({ sourceRowNumber: record.sourceRowNumber, normalized, status: 'VALID', errors })
          continue
        }
      } else if (kind === 'SUPPLIERS') {
        const legalName = valueFor(record, mapping, 'legalName', ['supplier', 'supplier name', 'legal name']); const tradeName = optionalString(valueFor(record, mapping, 'tradeName', ['trade name'])); const primaryEmail = optionalString(valueFor(record, mapping, 'primaryEmail', ['email'])); const currency = (optionalString(valueFor(record, mapping, 'currency', [])) ?? 'USD').toUpperCase(); const lead = finite(optionalString(valueFor(record, mapping, 'leadTimeDays', ['lead time days'])))
        if (!legalName) errors.push('Supplier legal name is required.')
        if (!/^[A-Z]{3}$/.test(currency)) errors.push('Currency must be an ISO code.')
        if (lead !== undefined && (!Number.isInteger(lead) || lead < 0 || lead > 3650)) errors.push('Lead time must be a whole number from zero to 3650.')
        normalized = { ...normalized, legalName, tradeName, primaryEmail, currency, leadTimeDays: lead }
        const key = `supplier:${legalName.toLocaleLowerCase()}`
        if (duplicateKeys.has(key)) errors.push('Duplicate supplier row in this import.')
        duplicateKeys.add(key)
        if (!errors.length) {
          const existing = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_suppliers WHERE organization_id = ${context.organizationId} AND lower(legal_name) = lower(${legalName}) LIMIT 1`
          if (existing[0]) prepared.push({ sourceRowNumber: record.sourceRowNumber, normalized, status: 'DUPLICATE', errors: ['Create-only import does not overwrite an existing supplier.'] })
          else prepared.push({ sourceRowNumber: record.sourceRowNumber, normalized, status: 'VALID', errors })
          continue
        }
      } else {
        const materialIdInput = optionalString(valueFor(record, mapping, 'materialId', [])); const materialCode = optionalString(valueFor(record, mapping, 'materialInternalCode', ['material code', 'internal code']));
        const materials = materialIdInput ? await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT id, status FROM v2_materials WHERE organization_id = ${context.organizationId} AND id = ${materialIdInput} LIMIT 1` : materialCode ? await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT id, status FROM v2_materials WHERE organization_id = ${context.organizationId} AND internal_code = ${materialCode} LIMIT 1` : []
        const material = materials[0]
        if (!material) errors.push('Material reference is not available in this workspace.')
        if (kind === 'SUPPLIER_OFFERS') {
          const supplierIdInput = optionalString(valueFor(record, mapping, 'supplierId', [])); const supplierName = optionalString(valueFor(record, mapping, 'supplierLegalName', ['supplier', 'supplier name', 'legal name'])); const suppliers = supplierIdInput ? await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_suppliers WHERE organization_id = ${context.organizationId} AND id = ${supplierIdInput} LIMIT 1` : supplierName ? await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_suppliers WHERE organization_id = ${context.organizationId} AND lower(legal_name) = lower(${supplierName}) LIMIT 1` : []
          const supplier = suppliers[0]; const productCode = valueFor(record, mapping, 'productCode', ['product code', 'supplier code']); const unitPrice = finite(optionalString(valueFor(record, mapping, 'unitPrice', ['price']))); const minimumOrderQuantity = finite(optionalString(valueFor(record, mapping, 'minimumOrderQuantity', ['moq']))); const currency = (optionalString(valueFor(record, mapping, 'currency', [])) ?? 'USD').toUpperCase(); const unit = (optionalString(valueFor(record, mapping, 'unit', [])) ?? 'G').toUpperCase()
          if (!supplier) errors.push('Supplier reference is not available in this workspace.')
          if (!productCode) errors.push('Supplier product code is required.')
          if (unitPrice === undefined || unitPrice < 0) errors.push('Unit price must be zero or greater.')
          if (minimumOrderQuantity === undefined || minimumOrderQuantity < 0) errors.push('Minimum order quantity must be zero or greater.')
          if (!/^[A-Z]{3}$/.test(currency) || !['G', 'KG'].includes(unit)) errors.push('Offer currency or unit is invalid.')
          normalized = { ...normalized, supplierId: supplier?.id, materialId: material?.id, productCode, unitPrice, minimumOrderQuantity, currency, unit, tradeName: optionalString(valueFor(record, mapping, 'tradeName', ['trade name'])), grade: optionalString(valueFor(record, mapping, 'grade', [])), leadTimeDays: finite(optionalString(valueFor(record, mapping, 'leadTimeDays', ['lead time days']))), packSize: finite(optionalString(valueFor(record, mapping, 'packSize', ['pack size']))) }
          const key = `offer:${supplier?.id ?? supplierName}:${material?.id ?? materialCode}:${productCode}`
          if (duplicateKeys.has(key)) errors.push('Duplicate supplier offer row in this import.')
          duplicateKeys.add(key)
          if (!errors.length) {
            const existing = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_supplier_offers WHERE organization_id = ${context.organizationId} AND supplier_id = ${supplier!.id} AND material_id = ${material!.id} AND product_code = ${productCode} LIMIT 1`
            if (existing[0]) prepared.push({ sourceRowNumber: record.sourceRowNumber, normalized, status: 'DUPLICATE', errors: ['Create-only import does not overwrite an existing supplier offer.'] })
            else prepared.push({ sourceRowNumber: record.sourceRowNumber, normalized, status: 'VALID', errors })
            continue
          }
        } else {
          const quantityGrams = finite(optionalString(valueFor(record, mapping, 'quantityGrams', ['quantity g', 'quantity', 'grams']))); const location = valueFor(record, mapping, 'location', []); const supplierLot = optionalString(valueFor(record, mapping, 'supplierLot', ['supplier lot', 'lot'])); const currency = (optionalString(valueFor(record, mapping, 'currency', [])) ?? 'USD').toUpperCase(); const unitPrice = finite(optionalString(valueFor(record, mapping, 'unitPrice', ['price']))); const supplierOfferId = optionalString(valueFor(record, mapping, 'supplierOfferId', []))
          if (material?.status !== 'ACTIVE') errors.push('Opening inventory requires an active material.')
          if (quantityGrams === undefined || quantityGrams <= 0) errors.push('Opening inventory quantity in grams must be positive.')
          if (!location) errors.push('Opening inventory location is required.')
          if (!/^[A-Z]{3}$/.test(currency)) errors.push('Currency must be an ISO code.')
          if (unitPrice !== undefined && unitPrice < 0) errors.push('Unit price must be zero or greater.')
          normalized = { ...normalized, materialId: material?.id, quantityGrams, location, supplierLot, currency, unitPrice, supplierOfferId, manufacturedAt: optionalString(valueFor(record, mapping, 'manufacturedAt', ['manufactured at'])), expiresAt: optionalString(valueFor(record, mapping, 'expiresAt', ['expires at'])) }
          const key = `opening:${material?.id ?? materialCode}:${supplierLot ?? ''}:${location}`
          if (duplicateKeys.has(key)) errors.push('Duplicate opening inventory row in this import.')
          duplicateKeys.add(key)
          if (!errors.length) prepared.push({ sourceRowNumber: record.sourceRowNumber, normalized, status: 'VALID', errors })
        }
      }
      prepared.push({ sourceRowNumber: record.sourceRowNumber, normalized, status: 'INVALID', errors })
    }
    return prepared
  }

  async listImports(context: PlatformContext) {
    await this.platform.requirePermission(context, 'imports.view')
    return this.scoped(context, async (tx) => tx.$queryRaw<Array<{ id: string; importKind: string; sourceFormat: string; sourceName: string; status: string; dryRun: boolean; parsedRowCount: number; validRowCount: number; invalidRowCount: number; duplicateRowCount: number; committedRowCount: number; createdAt: Date }>>`
      SELECT id, import_kind AS "importKind", source_format AS "sourceFormat", source_name AS "sourceName", status, dry_run AS "dryRun", parsed_row_count AS "parsedRowCount", valid_row_count AS "validRowCount", invalid_row_count AS "invalidRowCount", duplicate_row_count AS "duplicateRowCount", committed_row_count AS "committedRowCount", created_at AS "createdAt"
      FROM v2_import_jobs WHERE organization_id = ${context.organizationId} ORDER BY created_at DESC LIMIT 100
    `.then((rows) => rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))))
  }

  async importDetail(context: PlatformContext, jobId: string) {
    await this.platform.requirePermission(context, 'imports.view')
    return this.scoped(context, async (tx) => {
      const jobs = await tx.$queryRaw<Array<{ id: string; importKind: string; sourceFormat: string; sourceName: string; status: string; dryRun: boolean; mapping: JsonRecord; parsedRowCount: number; validRowCount: number; invalidRowCount: number; duplicateRowCount: number; committedRowCount: number; createdAt: Date; committedAt: Date | null }>>`
        SELECT id, import_kind AS "importKind", source_format AS "sourceFormat", source_name AS "sourceName", status, dry_run AS "dryRun", mapping, parsed_row_count AS "parsedRowCount", valid_row_count AS "validRowCount", invalid_row_count AS "invalidRowCount", duplicate_row_count AS "duplicateRowCount", committed_row_count AS "committedRowCount", created_at AS "createdAt", committed_at AS "committedAt"
        FROM v2_import_jobs WHERE organization_id = ${context.organizationId} AND id = ${jobId}
      `
      if (!jobs[0]) throw new PlatformError('IMPORT_JOB_NOT_FOUND', 'The requested import job is not available in this workspace.', 404)
      const rows = await tx.$queryRaw<Array<{ sourceRowNumber: number; normalizedRow: JsonRecord; validationErrors: string[]; status: string; targetType: string | null; targetId: string | null }>>`
        SELECT source_row_number AS "sourceRowNumber", normalized_row AS "normalizedRow", validation_errors AS "validationErrors", status, target_type AS "targetType", target_id AS "targetId"
        FROM v2_import_rows WHERE organization_id = ${context.organizationId} AND import_job_id = ${jobId} ORDER BY source_row_number ASC
      `
      return { job: { ...jobs[0], createdAt: jobs[0].createdAt.toISOString(), committedAt: iso(jobs[0].committedAt) }, rows }
    })
  }

  async listDataOpsRuns(context: PlatformContext) {
    await this.platform.requirePermission(context, 'dataops.view')
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; importJobId: string; adapter: string; status: string; failureCode: string | null; createdAt: Date }>>`
        SELECT id, import_job_id AS "importJobId", adapter_key AS adapter, status, failure_code AS "failureCode", created_at AS "createdAt"
        FROM v2_dataops_runs
        WHERE organization_id = ${context.organizationId}
        ORDER BY created_at DESC
        LIMIT 100
      `
      return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
    })
  }

  async createImport(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'imports.preview')
    const input = validated(importCreateSchema, rawInput, 'IMPORT_REQUEST_INVALID')
    validateImportMapping(input.kind, input.mapping)
    const sourceBytes = base64Bytes(input.contentBase64)
    const records = parseSpreadsheet(input.format, sourceBytes)
    const sourceHash = createHash('sha256').update(sourceBytes).digest('hex')
    const result = await this.idempotent(context, 'imports.create', key, { ...input, contentBase64: undefined, sourceHash }, async (tx) => {
      const prepared = await this.prepareImportRows(tx, context, input.kind, records, input.mapping)
      const counts = { valid: prepared.filter((row) => row.status === 'VALID').length, invalid: prepared.filter((row) => row.status === 'INVALID').length, duplicate: prepared.filter((row) => row.status === 'DUPLICATE').length }
      const validationHash = digest({ mapping: input.mapping, rows: prepared.map((row) => ({ row: row.sourceRowNumber, normalized: row.normalized, status: row.status, errors: row.errors })) })
      const existing = await tx.$queryRaw<Array<{ id: string; status: string; sourceHash: string; parsedRowCount: number; validRowCount: number; invalidRowCount: number; duplicateRowCount: number; confirmationExpiresAt: Date }>>`
        SELECT id, status, source_hash AS "sourceHash", parsed_row_count AS "parsedRowCount", valid_row_count AS "validRowCount", invalid_row_count AS "invalidRowCount", duplicate_row_count AS "duplicateRowCount", confirmation_expires_at AS "confirmationExpiresAt"
        FROM v2_import_jobs
        WHERE organization_id = ${context.organizationId}
          AND import_kind = ${input.kind}
          AND source_hash = ${sourceHash}
          AND validation_hash = ${validationHash}
          AND dry_run = ${input.dryRun}
        LIMIT 1
      `
      if (existing[0]) {
        const job = existing[0]
        if (!input.dryRun && job.status === 'VALIDATED' && job.confirmationExpiresAt.getTime() <= Date.now()) {
          await tx.$executeRaw`UPDATE v2_import_jobs SET confirmation_expires_at = now() + interval '30 minutes', updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${job.id} AND status = 'VALIDATED'`
          await this.audit(tx, context, 'imports.preview.renew_confirmation', 'allowed', 'import_job', job.id, { sourceHash, validationHash })
        }
        return { id: job.id, status: job.status, sourceHash: job.sourceHash, reused: true, parsedRowCount: job.parsedRowCount, validRowCount: job.validRowCount, invalidRowCount: job.invalidRowCount, duplicateRowCount: job.duplicateRowCount }
      }
      const jobId = id('import'); const tokenHash = digest(this.confirmationToken('import', jobId, sourceHash))
      await tx.$executeRaw`
        INSERT INTO v2_import_jobs (id, organization_id, import_kind, source_format, source_name, source_hash, mapping, status, dry_run, parsed_row_count, valid_row_count, invalid_row_count, duplicate_row_count, confirmation_token_hash, validation_hash, created_by)
        VALUES (${jobId}, ${context.organizationId}, ${input.kind}, ${input.format}, ${input.fileName}, ${sourceHash}, ${JSON.stringify(input.mapping)}::jsonb, 'VALIDATED', ${input.dryRun}, ${prepared.length}, ${counts.valid}, ${counts.invalid}, ${counts.duplicate}, ${tokenHash}, ${validationHash}, ${context.userId})
      `
      for (const row of prepared) await tx.$executeRaw`
        INSERT INTO v2_import_rows (id, organization_id, import_job_id, source_row_number, source_row_hash, normalized_row, validation_errors, status)
        VALUES (${id('import_row')}, ${context.organizationId}, ${jobId}, ${row.sourceRowNumber}, ${digest(row.normalized)}, ${JSON.stringify(row.normalized)}::jsonb, ${JSON.stringify(row.errors)}::jsonb, ${row.status})
      `
      await this.audit(tx, context, 'imports.preview.complete', counts.invalid ? 'blocked' : 'allowed', 'import_job', jobId, { kind: input.kind, sourceHash, rowCount: prepared.length, ...counts, validationHash })
      return { id: jobId, status: 'VALIDATED', sourceHash, reused: false, parsedRowCount: prepared.length, validRowCount: counts.valid, invalidRowCount: counts.invalid, duplicateRowCount: counts.duplicate }
    })
    return { ...result, confirmationToken: result.status === 'VALIDATED' ? this.confirmationToken('import', result.id, result.sourceHash) : undefined }
  }

  async commitImport(context: PlatformContext, jobId: string, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'imports.commit')
    const input = validated(importCommitSchema, rawInput, 'IMPORT_COMMIT_INVALID')
    const snapshot = await this.scoped(context, async (tx) => {
      const jobs = await tx.$queryRaw<Array<{ id: string; importKind: 'MATERIALS' | 'SUPPLIERS' | 'SUPPLIER_OFFERS' | 'OPENING_INVENTORY'; status: string; sourceHash: string; confirmationTokenHash: string | null; confirmationExpiresAt: Date; dryRun: boolean }>>`
        SELECT id, import_kind AS "importKind", status, source_hash AS "sourceHash", confirmation_token_hash AS "confirmationTokenHash", confirmation_expires_at AS "confirmationExpiresAt", dry_run AS "dryRun"
        FROM v2_import_jobs WHERE organization_id = ${context.organizationId} AND id = ${jobId}
      `
      const job = jobs[0]
      if (!job) throw new PlatformError('IMPORT_JOB_NOT_FOUND', 'The requested import job is not available in this workspace.', 404)
      if (job.status === 'COMMITTED') return { job, rows: [] as Array<{ sourceRowNumber: number; normalizedRow: JsonRecord }> }
      if (job.status !== 'VALIDATED') throw new PlatformError('IMPORT_JOB_NOT_READY', 'Only a validated import job may be committed.', 409)
      if (job.dryRun) throw new PlatformError('IMPORT_DRY_RUN_ONLY', 'This dry-run import cannot change business records. Create a confirmed import when ready.', 409)
      if (job.confirmationExpiresAt.getTime() < Date.now()) throw new PlatformError('IMPORT_CONFIRMATION_EXPIRED', 'The import confirmation has expired. Create a fresh preview before committing.', 409)
      if (!job.confirmationTokenHash || !this.confirmationMatches('import', jobId, job.sourceHash, input.confirmationToken)) throw new PlatformError('IMPORT_CONFIRMATION_INVALID', 'The import confirmation token is invalid or expired.', 409)
      const rows = await tx.$queryRaw<Array<{ sourceRowNumber: number; normalizedRow: JsonRecord }>>`
        SELECT source_row_number AS "sourceRowNumber", normalized_row AS "normalizedRow" FROM v2_import_rows
        WHERE organization_id = ${context.organizationId} AND import_job_id = ${jobId} AND status = 'VALID' ORDER BY source_row_number ASC
      `
      if (!rows.length) throw new PlatformError('IMPORT_NOTHING_TO_COMMIT', 'This import has no valid create-only rows to commit.', 409)
      return { job, rows }
    })
    if (snapshot.job.status === 'COMMITTED') return this.importDetail(context, jobId)
    const childKey = `p11_import_${jobId}_${digest(input.confirmationToken)}`
    const domainResult = await this.lab.applyCreateOnlyImport(context, snapshot.job.importKind, snapshot.rows.map((row) => row.normalizedRow), childKey)
    return this.idempotent(context, 'imports.commit', key, { jobId, confirmationHash: digest(input.confirmationToken), mode: input.mode }, async (tx) => {
      const jobs = await tx.$queryRaw<Array<{ status: string; sourceHash: string }>>`SELECT status, source_hash AS "sourceHash" FROM v2_import_jobs WHERE organization_id = ${context.organizationId} AND id = ${jobId} FOR UPDATE`
      if (!jobs[0]) throw new PlatformError('IMPORT_JOB_NOT_FOUND', 'The requested import job is not available in this workspace.', 404)
      if (jobs[0].status === 'COMMITTED') return { jobId, status: 'COMMITTED', alreadyCommitted: true }
      if (jobs[0].status !== 'VALIDATED') throw new PlatformError('IMPORT_JOB_NOT_READY', 'The import job is no longer ready to commit.', 409)
      const targetBySource = new Map(domainResult.targets.map((target) => [target.sourceRowNumber, target]))
      for (const row of snapshot.rows) {
        const target = targetBySource.get(row.sourceRowNumber)
        if (!target) throw new PlatformError('IMPORT_DOMAIN_RESULT_INVALID', 'The domain import did not return a target for every validated source row.', 409)
        await tx.$executeRaw`UPDATE v2_import_rows SET status = 'COMMITTED', target_type = ${target.targetType}, target_id = ${target.targetId}, updated_at = now() WHERE organization_id = ${context.organizationId} AND import_job_id = ${jobId} AND source_row_number = ${row.sourceRowNumber} AND status = 'VALID'`
      }
      const report: JsonRecord = { jobId, kind: snapshot.job.importKind, committedRows: snapshot.rows.length, targets: domainResult.targets, receiptId: 'receiptId' in domainResult ? domainResult.receiptId : null, mode: 'CREATE_ONLY' }
      const reportHash = digest(report)
      await tx.$executeRaw`INSERT INTO v2_import_commits (id, organization_id, import_job_id, request_hash, result_report, result_hash, committed_by) VALUES (${id('import_commit')}, ${context.organizationId}, ${jobId}, ${digest({ confirmation: digest(input.confirmationToken), mode: input.mode })}, ${JSON.stringify(report)}::jsonb, ${reportHash}, ${context.userId})`
      await tx.$executeRaw`UPDATE v2_import_jobs SET status = 'COMMITTED', committed_row_count = ${snapshot.rows.length}, committed_by = ${context.userId}, committed_at = now(), updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${jobId}`
      await this.audit(tx, context, 'imports.commit.complete', 'allowed', 'import_job', jobId, { reportHash, committedRows: snapshot.rows.length })
      return { jobId, status: 'COMMITTED', alreadyCommitted: false, report }
    })
  }

  async runDataOps(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'dataops.run')
    await this.platform.requirePermission(context, 'imports.view')
    const input = validated(dataOpsRunRequestSchema, rawInput, 'DATAOPS_REQUEST_INVALID')
    return this.idempotent(context, 'dataops.run', key, input, async (tx) => {
      const jobs = await tx.$queryRaw<Array<{ id: string; importKind: string; status: string; sourceHash: string; parsedRowCount: number; validRowCount: number; invalidRowCount: number; duplicateRowCount: number; validationHash: string | null }>>`
        SELECT id, import_kind AS "importKind", status, source_hash AS "sourceHash", parsed_row_count AS "parsedRowCount", valid_row_count AS "validRowCount", invalid_row_count AS "invalidRowCount", duplicate_row_count AS "duplicateRowCount", validation_hash AS "validationHash"
        FROM v2_import_jobs WHERE organization_id = ${context.organizationId} AND id = ${input.importJobId}
      `
      const job = jobs[0]
      if (!job) throw new PlatformError('IMPORT_JOB_NOT_FOUND', 'The selected import job is not available in this workspace.', 404)
      const inputHash = digest(job)
      const status = input.adapter === 'VEXO' ? 'NOT_CONFIGURED' : 'SUCCEEDED'
      const output = input.adapter === 'VEXO'
        ? { status: 'NOT_CONFIGURED', adapter: 'VEXO', reason: 'No Vexo provider credential or approved adapter binding is configured. V2 transactional and compliance authority remain local domain services.' }
        : { status: 'SUCCEEDED', adapter: 'LOCAL_QUALITY_GATE', sourceHash: job.sourceHash, importKind: job.importKind, validation: { parsed: job.parsedRowCount, valid: job.validRowCount, invalid: job.invalidRowCount, duplicate: job.duplicateRowCount }, qualityStatus: job.invalidRowCount ? 'REVIEW_REQUIRED' : job.validRowCount ? 'VERIFIED' : 'NOT_ENOUGH_EVIDENCE' }
      const runId = id('dataops'); const outputHash = digest(output)
      await tx.$executeRaw`INSERT INTO v2_dataops_runs (id, organization_id, import_job_id, adapter_key, status, input_hash, output_summary, output_hash, failure_code, created_by) VALUES (${runId}, ${context.organizationId}, ${job.id}, ${input.adapter}, ${status}, ${inputHash}, ${JSON.stringify(output)}::jsonb, ${outputHash}, ${status === 'NOT_CONFIGURED' ? 'VEXO_NOT_CONFIGURED' : null}, ${context.userId})`
      await this.audit(tx, context, 'dataops.run', status === 'SUCCEEDED' ? 'allowed' : 'blocked', 'dataops_run', runId, { inputHash, outputHash, adapter: input.adapter })
      return { id: runId, ...output, inputHash, outputHash }
    })
  }

  private async assertBulkPermission(context: PlatformContext, kind: 'MATERIAL_STATUS' | 'SUPPLIER_STATUS' | 'SUPPLIER_OFFER_STATUS', status: string) {
    if (kind === 'MATERIAL_STATUS') await this.platform.requirePermission(context, status === 'ACTIVE' || status === 'BLOCKED' ? 'materials.approve' : 'materials.edit')
    if (kind === 'SUPPLIER_STATUS') await this.platform.requirePermission(context, status === 'ACTIVE' || status === 'SUSPENDED' ? 'suppliers.approve' : 'suppliers.edit')
    if (kind === 'SUPPLIER_OFFER_STATUS') await this.platform.requirePermission(context, status === 'ACTIVE' ? 'suppliers.approve' : 'suppliers.edit')
  }

  async previewBulkOperation(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'bulk.preview')
    const input = validated(bulkOperationPreviewSchema, rawInput, 'BULK_REQUEST_INVALID')
    await this.assertBulkPermission(context, input.kind, input.payload.status)
    return this.idempotent(context, 'bulk.preview', key, input, async (tx) => {
      const table = input.kind === 'MATERIAL_STATUS' ? 'v2_materials' : input.kind === 'SUPPLIER_STATUS' ? 'v2_suppliers' : 'v2_supplier_offers'
      const targets = await tx.$queryRaw<Array<{ id: string; currentStatus: string }>>`SELECT id, status AS "currentStatus" FROM ${Prisma.raw(table)} WHERE organization_id = ${context.organizationId} AND id IN (${Prisma.join(input.targetIds)}) FOR UPDATE`
      if (targets.length !== input.targetIds.length) throw new PlatformError('BULK_TARGET_NOT_FOUND', 'Every bulk target must belong to this workspace.', 404)
      const report = { kind: input.kind, requestedStatus: input.payload.status, targetCount: input.targetIds.length, changeCount: targets.filter((target) => target.currentStatus !== input.payload.status).length, unchangedCount: targets.filter((target) => target.currentStatus === input.payload.status).length, targetIds: [...input.targetIds].sort() }
      const previewHash = digest({ input, report }); const operationId = id('bulk'); const tokenHash = digest(this.confirmationToken('bulk', operationId, previewHash))
      await tx.$executeRaw`
        INSERT INTO v2_bulk_operations (id, organization_id, operation_kind, target_ids, payload, rationale, preview_report, preview_hash, confirmation_token_hash, created_by)
        VALUES (${operationId}, ${context.organizationId}, ${input.kind}, ${JSON.stringify(input.targetIds)}::jsonb, ${JSON.stringify(input.payload)}::jsonb, ${input.rationale}, ${JSON.stringify(report)}::jsonb, ${previewHash}, ${tokenHash}, ${context.userId})
      `
      await this.audit(tx, context, 'bulk.preview', 'allowed', 'bulk_operation', operationId, { previewHash, targetCount: input.targetIds.length, kind: input.kind })
      return { id: operationId, status: 'PREVIEWED', previewHash, report }
    }).then((result) => ({ ...result, confirmationToken: this.confirmationToken('bulk', result.id, result.previewHash) }))
  }

  async commitBulkOperation(context: PlatformContext, operationId: string, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'bulk.execute')
    const input = validated(bulkOperationCommitSchema, rawInput, 'BULK_COMMIT_INVALID')
    const operation = await this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; kind: 'MATERIAL_STATUS' | 'SUPPLIER_STATUS' | 'SUPPLIER_OFFER_STATUS'; status: string; targetIds: string[]; payload: { status: string }; rationale: string; previewHash: string; confirmationExpiresAt: Date }>>`
        SELECT id, operation_kind AS kind, status, target_ids AS "targetIds", payload, rationale, preview_hash AS "previewHash", confirmation_expires_at AS "confirmationExpiresAt"
        FROM v2_bulk_operations WHERE organization_id = ${context.organizationId} AND id = ${operationId}
      `
      if (!rows[0]) throw new PlatformError('BULK_OPERATION_NOT_FOUND', 'The selected bulk operation is not available in this workspace.', 404)
      if (rows[0].status === 'COMPLETED') return rows[0]
      if (rows[0].status !== 'PREVIEWED') throw new PlatformError('BULK_OPERATION_NOT_READY', 'Only a previewed bulk operation may be confirmed.', 409)
      if (rows[0].confirmationExpiresAt.getTime() < Date.now()) throw new PlatformError('BULK_CONFIRMATION_EXPIRED', 'The bulk operation confirmation has expired. Create a fresh preview.', 409)
      if (!this.confirmationMatches('bulk', operationId, rows[0].previewHash, input.confirmationToken)) throw new PlatformError('BULK_CONFIRMATION_INVALID', 'The bulk operation confirmation token is invalid or expired.', 409)
      return rows[0]
    })
    if (operation.status === 'COMPLETED') return { operationId, status: 'COMPLETED', alreadyCompleted: true }
    await this.assertBulkPermission(context, operation.kind, operation.payload.status)
    const domain = await this.lab.applyBulkStatusOperation(context, operation.kind, operation.targetIds, operation.payload.status, operation.rationale, `p11_bulk_${operationId}_${digest(input.confirmationToken)}`)
    return this.idempotent(context, 'bulk.commit', key, { operationId, confirmationHash: digest(input.confirmationToken) }, async (tx) => {
      const current = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM v2_bulk_operations WHERE organization_id = ${context.organizationId} AND id = ${operationId} FOR UPDATE`
      if (!current[0]) throw new PlatformError('BULK_OPERATION_NOT_FOUND', 'The selected bulk operation is not available in this workspace.', 404)
      if (current[0].status === 'COMPLETED') return { operationId, status: 'COMPLETED', alreadyCompleted: true }
      const report = { ...domain, completedAt: new Date().toISOString() }; const resultHash = digest(report)
      await tx.$executeRaw`UPDATE v2_bulk_operations SET status = 'COMPLETED', result_report = ${JSON.stringify(report)}::jsonb, result_hash = ${resultHash}, executed_by = ${context.userId}, executed_at = now(), updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${operationId}`
      await this.audit(tx, context, 'bulk.commit', 'allowed', 'bulk_operation', operationId, { resultHash, changedCount: domain.changedCount })
      return { operationId, status: 'COMPLETED', alreadyCompleted: false, report }
    })
  }
}
