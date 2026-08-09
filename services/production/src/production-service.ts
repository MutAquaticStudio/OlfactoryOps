import { createHash, randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import {
  productionAllocationCommitRequestSchema,
  productionCapaActionCompleteRequestSchema,
  productionCapaActionCreateRequestSchema,
  productionDeviationCreateRequestSchema,
  productionDeviationDispositionRequestSchema,
  productionDocumentSnapshotCreateRequestSchema,
  productionFinishedGoodQualityHoldRequestSchema,
  productionOrderCancellationRequestSchema,
  productionOrderCloseRequestSchema,
  productionOrderCreateRequestSchema,
  productionOrderPlanRequestSchema,
  productionProcessStageCompleteRequestSchema,
  productionProcessStageSchema,
  productionQcApprovalRequestSchema,
  productionQcResultRecordRequestSchema,
  productionQcSpecificationCreateRequestSchema,
  productionReleaseRequestSchema,
  productionReworkCreateRequestSchema,
  productionUsageReversalRequestSchema,
  productionWeighingConfirmRequestSchema,
  productionWeighingStartRequestSchema,
  productionYieldRecordRequestSchema,
} from '../../../packages/contracts/src/production.js'
import {
  LabOperationsService,
  type LabOperationsTransaction,
  type LabWeighingConfirmedLine,
} from '../../lab-ops/src/service.js'
import { PlatformError, PlatformService } from '../../platform/src/service.js'
import type { PlatformContext } from '../../platform/src/types.js'
import { calculateProductionRequirements, calculateYield, evaluateNumericSpecification, type FormulaComponent } from './math.js'
import { assertProductionUsageCorrectionAllowed } from './correction-policy.js'
import { evaluateProductionReleaseGate } from './release-gate.js'
import { assertProductionTransition, assertStageTransition, expectedPriorStage, isProductionOrderStatus, type ProductionOrderStatus, type ProductionStageKind } from './state.js'

type Transaction = LabOperationsTransaction
type JsonRecord = Record<string, unknown>
type IdempotencyRow = { requestHash: string; response: unknown }
type ProductionOrderRow = {
  id: string
  orderNumber: string
  formulaVersionId: string
  qcSpecificationId: string | null
  status: string
  targetBulkGrams: Prisma.Decimal
  targetOutputGrams: Prisma.Decimal | null
  plannedStartAt: Date | null
  dueAt: Date | null
  notes: string | null
  holdReason: string | null
  cancelReason: string | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
  releasedAt: Date | null
  closedAt: Date | null
}
type RequirementRow = {
  id: string
  materialId: string
  plannedQuantityGrams: Prisma.Decimal
  toleranceGrams: Prisma.Decimal
  status: string
  componentSnapshot: JsonRecord
}
type AllocationRow = {
  id: string
  requirementId: string
  materialId: string
  inventoryLotId: string
  inventoryReservationId: string | null
  allocatedQuantityGrams: Prisma.Decimal
  status: string
}
type ProductionUsageRow = {
  id: string
  inventoryMovementId: string
  allocationId: string
  requirementId: string
  weighingSessionId: string
  status: string
}
type ProductionWeighingRow = { id: string; labWeighingSessionId: string; status: string; productionOrderId: string }
type FinishedGoodLotRow = {
  id: string
  productionOrderId: string
  productionReleaseId: string
  formulaVersionId: string
  formulaSnapshotId: string
  lotNumber: string
  initialQuantityGrams: Prisma.Decimal
  location: string
  status: string
  releasedAt: Date | null
}
type FormulaSnapshot = {
  formulaVersionId: string
  formulaProjectId: string
  formulaName: string
  formulaType: string
  formulaContentHash: string
  components: Array<{ materialId: string; name: string; percentage: number; position: number; note: string | null }>
}

const EPSILON = 0.000001
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as JsonRecord).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`
  return JSON.stringify(value)
}
const digest = (value: unknown) => createHash('sha256').update(stableJson(value)).digest('hex')
const identifier = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '')}`
const childIdempotencyKey = (kind: string, value: unknown) => `p8_${kind}_${digest(value)}`
const asNumber = (value: Prisma.Decimal | number | string | null | undefined) => Number(value ?? 0)
const iso = (value: Date | null | undefined) => value?.toISOString() ?? null
const json = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const REWORK_STAGE_SEQUENCE: readonly ProductionStageKind[] = ['COMPOUNDING', 'CONDITIONING', 'FILTRATION', 'FILLING']

type ProductionDetailInventoryEvidence<
  Allocation,
  Weighing extends { labWeighingSessionId: string | null; actualTotalGrams: Prisma.Decimal | null },
  WeighingLine,
  MaterialUsage,
> = {
  allocations: Allocation[]
  weighing: Weighing[]
  weighingLines: WeighingLine[]
  materialUsages: MaterialUsage[]
}

type ProductionDetailWeighing<Weighing> = Omit<Weighing, 'labWeighingSessionId' | 'actualTotalGrams'> & {
  labWeighingSessionId: string | null
  actualTotalGrams: Prisma.Decimal | null
}

type ProductionDetailInventoryProjection<
  Allocation,
  Weighing extends { labWeighingSessionId: string | null; actualTotalGrams: Prisma.Decimal | null },
  WeighingLine,
  MaterialUsage,
> = {
  allocations: Allocation[]
  weighing: Array<ProductionDetailWeighing<Weighing>>
  weighingLines: WeighingLine[]
  materialUsages: MaterialUsage[]
}

/**
 * Production viewers without inventory visibility may follow the workflow, but
 * must not receive raw-lot, reservation, movement, or actual-consumption data.
 * Keep the high-level weighing state while removing its Lab session reference
 * and actual total as those are inventory-derived operational evidence.
 */
export function projectProductionDetailInventoryEvidence<
  Allocation,
  Weighing extends { labWeighingSessionId: string | null; actualTotalGrams: Prisma.Decimal | null },
  WeighingLine,
  MaterialUsage,
>(canViewInventory: boolean, evidence: ProductionDetailInventoryEvidence<Allocation, Weighing, WeighingLine, MaterialUsage>): ProductionDetailInventoryProjection<Allocation, Weighing, WeighingLine, MaterialUsage> {
  if (canViewInventory) return evidence
  return {
    allocations: [],
    weighing: evidence.weighing.map((item) => ({ ...item, labWeighingSessionId: null, actualTotalGrams: null })),
    weighingLines: [],
    materialUsages: [],
  }
}

function validated<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new PlatformError('PRODUCTION_REQUEST_INVALID', parsed.error.issues[0]?.message ?? 'The production request is invalid.', 422)
  return parsed.data
}

function stage(value: string): ProductionStageKind {
  const parsed = productionProcessStageSchema.safeParse(value.toUpperCase())
  if (!parsed.success) throw new PlatformError('PRODUCTION_STAGE_INVALID', 'The requested production stage is not recognized.', 422)
  return parsed.data as ProductionStageKind
}

function nextStage(value: ProductionStageKind): ProductionOrderStatus {
  switch (value) {
    case 'COMPOUNDING': return 'CONDITIONING'
    case 'CONDITIONING': return 'FILTRATION'
    case 'FILTRATION': return 'FILLING'
    case 'FILLING': return 'QC'
  }
}

/**
 * Phase 8 Production service. It is deliberately the only authority allowed
 * to bridge an approved Formula snapshot to Lab Operations consumption and to
 * create an independently traceable finished-good lot. Raw material stock is
 * never written here: LabOperationsService remains the immutable ledger owner.
 */
export class ProductionService {
  constructor(private readonly client: PrismaClient, private readonly platform: PlatformService, private readonly lab: LabOperationsService) {}

  private async scoped<T>(context: PlatformContext, action: (tx: Transaction) => Promise<T>) {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true), set_config('app.user_id', ${context.userId}, true)`
      return action(tx)
    })
  }

  private async require(context: PlatformContext, permission: string) { await this.platform.requirePermission(context, permission) }

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

  /**
   * A Lab Operations reversal owns its own transaction. These helpers keep the
   * Production idempotency receipt outside that transaction, so a client retry
   * can recover the durable child result after an interruption between the two
   * bounded transactions. Normal Production mutations use {@link idempotent}
   * and remain single-transaction operations.
   */
  private async delegatedIdempotentResponse<T extends JsonRecord>(context: PlatformContext, route: string, key: string | undefined, request: unknown): Promise<T | null> {
    if (!key || key.length < 12 || key.length > 200) throw new PlatformError('IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key for this operation.', 428)
    const requestHash = digest(request)
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<IdempotencyRow[]>`
        SELECT request_hash AS "requestHash", response FROM v2_operation_idempotency
        WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}
      `
      const existing = rows[0]
      if (!existing) return null
      if (existing.requestHash !== requestHash) throw new PlatformError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request.', 409)
      return existing.response ? existing.response as T : null
    })
  }

  private async completeDelegatedIdempotency<T extends JsonRecord>(context: PlatformContext, route: string, key: string | undefined, request: unknown, response: T): Promise<T> {
    if (!key || key.length < 12 || key.length > 200) throw new PlatformError('IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key for this operation.', 428)
    const requestHash = digest(request)
    return this.scoped(context, async (tx) => {
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO v2_operation_idempotency (id, organization_id, actor_user_id, route, idempotency_key, request_hash, response)
        VALUES (${identifier('idem')}, ${context.organizationId}, ${context.userId}, ${route}, ${key}, ${requestHash}, ${JSON.stringify(response)}::jsonb)
        ON CONFLICT (organization_id, actor_user_id, route, idempotency_key) DO NOTHING
        RETURNING id
      `
      if (inserted[0]) return response
      const rows = await tx.$queryRaw<IdempotencyRow[]>`
        SELECT request_hash AS "requestHash", response FROM v2_operation_idempotency
        WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}
        FOR UPDATE
      `
      const existing = rows[0]
      if (!existing) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
      if (existing.requestHash !== requestHash) throw new PlatformError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request.', 409)
      if (existing.response) return existing.response as T
      await tx.$executeRaw`
        UPDATE v2_operation_idempotency SET response = ${JSON.stringify(response)}::jsonb
        WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}
      `
      return response
    })
  }

  private async order(tx: Transaction, context: PlatformContext, orderId: string, lock = false): Promise<ProductionOrderRow> {
    const rows = await tx.$queryRaw<ProductionOrderRow[]>`
      SELECT id, order_number AS "orderNumber", formula_version_id AS "formulaVersionId", qc_specification_id AS "qcSpecificationId", status,
             target_bulk_g AS "targetBulkGrams", target_output_g AS "targetOutputGrams", planned_start_at AS "plannedStartAt", due_at AS "dueAt",
             notes, hold_reason AS "holdReason", cancel_reason AS "cancelReason", created_by AS "createdBy", created_at AS "createdAt",
             updated_at AS "updatedAt", released_at AS "releasedAt", closed_at AS "closedAt"
      FROM v2_production_orders
      WHERE id = ${orderId} AND organization_id = ${context.organizationId}${lock ? Prisma.sql` FOR UPDATE` : Prisma.empty}
    `
    if (!rows[0]) throw new PlatformError('PRODUCTION_ORDER_NOT_FOUND', 'The requested Production Order is not available in this workspace.', 404)
    return rows[0]
  }

  private orderProjection(row: ProductionOrderRow) {
    return {
      id: row.id, orderNumber: row.orderNumber, formulaVersionId: row.formulaVersionId, qcSpecificationId: row.qcSpecificationId,
      status: row.status, targetBulkGrams: asNumber(row.targetBulkGrams), targetOutputGrams: row.targetOutputGrams === null ? null : asNumber(row.targetOutputGrams),
      plannedStartAt: iso(row.plannedStartAt), dueAt: iso(row.dueAt), notes: row.notes, holdReason: row.holdReason, cancelReason: row.cancelReason,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), releasedAt: iso(row.releasedAt), closedAt: iso(row.closedAt),
    }
  }

  private async requirements(tx: Transaction, context: PlatformContext, orderId: string, lock = false) {
    return tx.$queryRaw<RequirementRow[]>`
      SELECT id, material_id AS "materialId", planned_quantity_g AS "plannedQuantityGrams", tolerance_g AS "toleranceGrams", status, component_snapshot AS "componentSnapshot"
      FROM v2_production_material_requirements WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId}
      ORDER BY id ASC${lock ? Prisma.sql` FOR UPDATE` : Prisma.empty}
    `
  }

  private async allocations(tx: Transaction, context: PlatformContext, orderId: string, lock = false) {
    return tx.$queryRaw<AllocationRow[]>`
      SELECT id, requirement_id AS "requirementId", material_id AS "materialId", inventory_lot_id AS "inventoryLotId", inventory_reservation_id AS "inventoryReservationId",
             allocated_quantity_g AS "allocatedQuantityGrams", status
      FROM v2_production_allocations WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId}
      ORDER BY id ASC${lock ? Prisma.sql` FOR UPDATE` : Prisma.empty}
    `
  }

  private async finishedGoodLot(tx: Transaction, context: PlatformContext, lotId: string, lock = false): Promise<FinishedGoodLotRow> {
    const rows = await tx.$queryRaw<FinishedGoodLotRow[]>`
      SELECT id, production_order_id AS "productionOrderId", production_release_id AS "productionReleaseId", formula_version_id AS "formulaVersionId",
             formula_snapshot_id AS "formulaSnapshotId", lot_number AS "lotNumber", initial_quantity_g AS "initialQuantityGrams", location, status, released_at AS "releasedAt"
      FROM v2_finished_good_lots
      WHERE id = ${lotId} AND organization_id = ${context.organizationId}${lock ? Prisma.sql` FOR UPDATE` : Prisma.empty}
    `
    if (!rows[0]) throw new PlatformError('FINISHED_GOOD_LOT_NOT_FOUND', 'The requested finished-good lot is not available in this workspace.', 404)
    return rows[0]
  }

  private async finishedGoodBucketBalance(tx: Transaction, context: PlatformContext, lotId: string, bucket: 'QUARANTINE' | 'AVAILABLE' | 'HOLD' | 'REWORK' | 'RESERVED') {
    const balances = await tx.$queryRaw<Array<{ quantity: Prisma.Decimal }>>`
      SELECT COALESCE(SUM(CASE WHEN to_bucket = ${bucket} THEN quantity_g ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN from_bucket = ${bucket} THEN quantity_g ELSE 0 END), 0) AS quantity
      FROM v2_finished_good_ledger_entries
      WHERE organization_id = ${context.organizationId} AND finished_good_lot_id = ${lotId}
    `
    return asNumber(balances[0]?.quantity)
  }

  private async moveFinishedGood(tx: Transaction, context: PlatformContext, input: {
    orderId: string
    lotId: string
    movementType: 'QUALITY_HOLD' | 'QUALITY_RELEASE' | 'REWORK_CONSUMPTION' | 'WASTE'
    quantityGrams: number
    fromBucket: 'AVAILABLE' | 'HOLD' | 'REWORK'
    toBucket: 'AVAILABLE' | 'HOLD' | 'REWORK' | null
    referenceType: string
    referenceId: string
    idempotencyScope: string
  }) {
    if (input.quantityGrams <= 0) throw new PlatformError('FINISHED_GOOD_QUANTITY_INVALID', 'A finished-good movement requires a positive controlled quantity.', 409)
    const id = identifier('fgle')
    await tx.$executeRaw`
      INSERT INTO v2_finished_good_ledger_entries (id, organization_id, finished_good_lot_id, production_order_id, movement_type, quantity_g, from_bucket, to_bucket, reference_type, reference_id, idempotency_key, actor_user_id)
      VALUES (${id}, ${context.organizationId}, ${input.lotId}, ${input.orderId}, ${input.movementType}, ${input.quantityGrams}, ${input.fromBucket}, ${input.toBucket}, ${input.referenceType}, ${input.referenceId}, ${childIdempotencyKey(input.idempotencyScope, input)}, ${context.userId})
    `
    await this.genealogy(tx, context, input.orderId, 'FINISHED_GOOD_LOT', input.lotId, 'FINISHED_GOOD_LEDGER_ENTRY', id, 'MOVES_FINISHED_GOOD', {
      movementType: input.movementType,
      fromBucket: input.fromBucket,
      toBucket: input.toBucket,
      quantityGrams: input.quantityGrams,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    })
    return id
  }

  private async productionUsageForCorrection(tx: Transaction, context: PlatformContext, orderId: string, usageId: string, lock = false): Promise<ProductionUsageRow> {
    const rows = await tx.$queryRaw<ProductionUsageRow[]>`
      SELECT id, inventory_movement_id AS "inventoryMovementId", allocation_id AS "allocationId", requirement_id AS "requirementId",
             weighing_session_id AS "weighingSessionId", status
      FROM v2_production_material_usages
      WHERE id = ${usageId} AND production_order_id = ${orderId} AND organization_id = ${context.organizationId}${lock ? Prisma.sql` FOR UPDATE` : Prisma.empty}
    `
    if (!rows[0]) throw new PlatformError('PRODUCTION_USAGE_NOT_FOUND', 'The requested material usage is not available for this Production Order.', 404)
    if (rows[0].status !== 'COMMITTED') throw new PlatformError('PRODUCTION_USAGE_NOT_REVERSIBLE', 'Only a committed Production material usage may be corrected once.', 409)
    return rows[0]
  }

  private async formulaSnapshot(tx: Transaction, context: PlatformContext, formulaVersionId: string): Promise<FormulaSnapshot> {
    const versions = await tx.$queryRaw<Array<{ id: string; formulaProjectId: string; formulaName: string; formulaType: string; contentHash: string; totalPercentage: Prisma.Decimal; approvalStatus: string }>>`
      SELECT v.id, v.formula_project_id AS "formulaProjectId", p.name AS "formulaName", v.formula_type AS "formulaType", v.content_hash AS "contentHash",
             v.total_percentage AS "totalPercentage", v.approval_status AS "approvalStatus"
      FROM v2_formula_versions v JOIN v2_formula_projects p ON p.id = v.formula_project_id AND p.organization_id = v.organization_id
      WHERE v.id = ${formulaVersionId} AND v.organization_id = ${context.organizationId}
    `
    const version = versions[0]
    if (!version) throw new PlatformError('FORMULA_VERSION_NOT_FOUND', 'The selected Formula Version is not available in this workspace.', 404)
    if (version.approvalStatus !== 'APPROVED') throw new PlatformError('FORMULA_VERSION_NOT_APPROVED', 'Only an approved Formula Version can be planned for production.', 409)
    const components = await tx.$queryRaw<Array<{ materialId: string; name: string; percentage: Prisma.Decimal; position: number; note: string | null; status: string; blocked: boolean }>>`
      SELECT c.material_id AS "materialId", m.name, c.percentage, c.position, c.note, m.status,
             EXISTS(SELECT 1 FROM v2_material_compliance mc WHERE mc.organization_id = m.organization_id AND mc.material_id = m.id AND mc.status = 'BLOCKED') AS blocked
      FROM v2_formula_version_components c JOIN v2_materials m ON m.id = c.material_id AND m.organization_id = c.organization_id
      WHERE c.formula_version_id = ${formulaVersionId} AND c.organization_id = ${context.organizationId}
      ORDER BY c.position ASC, c.id ASC
    `
    const numericComponents: FormulaComponent[] = components.map((component) => ({ materialId: component.materialId, percentage: asNumber(component.percentage) }))
    calculateProductionRequirements(numericComponents, 1)
    if (Math.abs(asNumber(version.totalPercentage) - 100) > EPSILON) throw new PlatformError('PRODUCTION_FORMULA_MATH_INVALID', 'The Formula Version composition is not eligible for production.', 409)
    if (components.some((component) => component.status !== 'ACTIVE' || component.blocked)) throw new PlatformError('PRODUCTION_MATERIAL_NOT_ELIGIBLE', 'Every production Formula material must be active and free of compliance blocks.', 409)
    return {
      formulaVersionId: version.id, formulaProjectId: version.formulaProjectId, formulaName: version.formulaName, formulaType: version.formulaType,
      formulaContentHash: version.contentHash,
      components: components.map((component) => ({ materialId: component.materialId, name: component.name, percentage: asNumber(component.percentage), position: component.position, note: component.note })),
    }
  }

  private async currentSnapshot(tx: Transaction, context: PlatformContext, orderId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string; formulaContentHash: string; snapshot: JsonRecord; snapshotHash: string }>>`
      SELECT id, formula_content_hash AS "formulaContentHash", snapshot, snapshot_hash AS "snapshotHash"
      FROM v2_production_formula_snapshots WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId}
      ORDER BY captured_at DESC, id DESC LIMIT 1
    `
    if (!rows[0]) throw new PlatformError('PRODUCTION_FORMULA_SNAPSHOT_MISSING', 'This Production Order has no immutable Formula snapshot.', 409)
    return rows[0]
  }

  private async transition(tx: Transaction, context: PlatformContext, row: ProductionOrderRow, next: ProductionOrderStatus, patch: { holdReason?: string | null; cancelReason?: string | null; released?: boolean; closed?: boolean } = {}) {
    if (!isProductionOrderStatus(row.status)) throw new PlatformError('PRODUCTION_ORDER_STATE_INVALID', 'The stored Production Order state is not recognized.', 409)
    assertProductionTransition(row.status, next)
    await tx.$executeRaw`
      UPDATE v2_production_orders SET status = ${next}, hold_reason = ${patch.holdReason === undefined ? row.holdReason : patch.holdReason},
        cancel_reason = ${patch.cancelReason === undefined ? row.cancelReason : patch.cancelReason},
        updated_by = ${context.userId}, updated_at = now(), released_at = ${patch.released ? new Date() : row.releasedAt}, closed_at = ${patch.closed ? new Date() : row.closedAt}
      WHERE id = ${row.id} AND organization_id = ${context.organizationId}
    `
  }

  async listOrders(context: PlatformContext) {
    await this.require(context, 'production.view')
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<ProductionOrderRow[]>`
        SELECT id, order_number AS "orderNumber", formula_version_id AS "formulaVersionId", qc_specification_id AS "qcSpecificationId", status,
               target_bulk_g AS "targetBulkGrams", target_output_g AS "targetOutputGrams", planned_start_at AS "plannedStartAt", due_at AS "dueAt",
               notes, hold_reason AS "holdReason", cancel_reason AS "cancelReason", created_by AS "createdBy", created_at AS "createdAt",
               updated_at AS "updatedAt", released_at AS "releasedAt", closed_at AS "closedAt"
        FROM v2_production_orders WHERE organization_id = ${context.organizationId} ORDER BY updated_at DESC, id DESC
      `
      return rows.map((row) => this.orderProjection(row))
    })
  }

  async approvedFormulaVersions(context: PlatformContext) {
    await this.require(context, 'production.create')
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; formulaProjectId: string; name: string; formulaType: string; versionNumber: number; approvedAt: Date | null }>>`
        SELECT v.id, v.formula_project_id AS "formulaProjectId", p.name, v.formula_type AS "formulaType", v.version_number AS "versionNumber", v.approved_at AS "approvedAt"
        FROM v2_formula_versions v JOIN v2_formula_projects p ON p.id = v.formula_project_id AND p.organization_id = v.organization_id
        WHERE v.organization_id = ${context.organizationId} AND v.approval_status = 'APPROVED' ORDER BY p.name ASC, v.version_number DESC
      `
      return rows.map((row) => ({ ...row, approvedAt: iso(row.approvedAt) }))
    })
  }

  async createOrder(context: PlatformContext, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.create')
    const input = validated(productionOrderCreateRequestSchema, rawInput)
    return this.idempotent(context, 'production.orders.create', idempotencyKey, input, async (tx) => {
      const formula = await this.formulaSnapshot(tx, context, input.formulaVersionId)
      if (input.qcSpecificationId) await this.assertQcSpecification(tx, context, input.qcSpecificationId, formula.formulaVersionId)
      const id = identifier('prod')
      const orderNumber = input.orderNumber ?? `MFG-${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`
      const snapshot = { schemaVersion: '1.0', formula }
      const snapshotId = identifier('prodsnap')
      await tx.$executeRaw`
        INSERT INTO v2_production_orders (id, organization_id, order_number, formula_version_id, qc_specification_id, status, target_bulk_g, target_output_g, planned_start_at, due_at, notes, created_by)
        VALUES (${id}, ${context.organizationId}, ${orderNumber}, ${formula.formulaVersionId}, ${input.qcSpecificationId ?? null}, 'DRAFT', ${input.targetBulkGrams}, ${input.targetOutputGrams ?? null},
                ${input.plannedStartAt ? new Date(input.plannedStartAt) : null}, ${input.dueAt ? new Date(input.dueAt) : null}, ${input.notes ?? null}, ${context.userId})
      `
      await tx.$executeRaw`
        INSERT INTO v2_production_formula_snapshots (id, organization_id, production_order_id, formula_version_id, formula_content_hash, snapshot, snapshot_hash, captured_by)
        VALUES (${snapshotId}, ${context.organizationId}, ${id}, ${formula.formulaVersionId}, ${formula.formulaContentHash}, ${JSON.stringify(snapshot)}::jsonb, ${digest(snapshot)}, ${context.userId})
      `
      await tx.$executeRaw`UPDATE v2_production_orders SET formula_snapshot_id = ${snapshotId}, updated_by = ${context.userId}, updated_at = now() WHERE id = ${id} AND organization_id = ${context.organizationId}`
      await this.genealogy(tx, context, id, 'PRODUCTION_ORDER', id, 'FORMULA_VERSION', formula.formulaVersionId, 'USES_FORMULA_VERSION', { formulaContentHash: formula.formulaContentHash })
      await this.genealogy(tx, context, id, 'PRODUCTION_ORDER', id, 'FORMULA_SNAPSHOT', snapshotId, 'SNAPSHOTS_FORMULA', { snapshotHash: digest(snapshot) })
      await this.audit(tx, context, 'production.order.create', 'allowed', 'production_order', id, { formulaVersionId: formula.formulaVersionId, targetBulkGrams: input.targetBulkGrams })
      return { id, orderNumber, status: 'DRAFT', formulaVersionId: formula.formulaVersionId, formulaSnapshotId: snapshotId }
    })
  }

  async planOrder(context: PlatformContext, orderId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.plan')
    const input = validated(productionOrderPlanRequestSchema, rawInput)
    return this.idempotent(context, 'production.orders.plan', idempotencyKey, { orderId, input }, async (tx) => {
      const row = await this.order(tx, context, orderId, true)
      if (row.status !== 'DRAFT') throw new PlatformError('PRODUCTION_ORDER_ALREADY_PLANNED', 'Only a draft Production Order can be planned.', 409)
      const snapshot = await this.currentSnapshot(tx, context, orderId)
      const formula = json(snapshot.snapshot).formula as FormulaSnapshot | undefined
      if (!formula || !Array.isArray(formula.components)) throw new PlatformError('PRODUCTION_FORMULA_SNAPSHOT_INVALID', 'The immutable Formula snapshot is invalid.', 409)
      const requirements = calculateProductionRequirements(formula.components.map((component) => ({ materialId: component.materialId, percentage: component.percentage })), asNumber(row.targetBulkGrams))
      for (const requirement of requirements) {
        const component = formula.components.find((candidate) => candidate.materialId === requirement.materialId)!
        const componentSnapshot = { materialId: component.materialId, name: component.name, percentage: component.percentage, position: component.position, note: component.note }
        const requirementId = identifier('prodreq')
        await tx.$executeRaw`
          INSERT INTO v2_production_material_requirements (id, organization_id, production_order_id, material_id, component_snapshot, formula_component_hash, planned_quantity_g, tolerance_g, status)
          VALUES (${requirementId}, ${context.organizationId}, ${orderId}, ${requirement.materialId}, ${JSON.stringify(componentSnapshot)}::jsonb, ${digest(componentSnapshot)}, ${requirement.requiredGrams}, 0, 'PENDING')
        `
        await this.genealogy(tx, context, orderId, 'PRODUCTION_ORDER', orderId, 'MATERIAL', requirement.materialId, 'REQUIRES_MATERIAL', { plannedQuantityGrams: requirement.requiredGrams })
      }
      for (const [index, processStage] of ['COMPOUNDING', 'CONDITIONING', 'FILTRATION', 'FILLING'].entries()) {
        const plannedParameters = { equipmentRef: input.equipmentRef ?? null }
        await tx.$executeRaw`
          INSERT INTO v2_production_process_steps (id, organization_id, production_order_id, stage, sequence_number, status, planned_parameters, notes)
          VALUES (${identifier('prodstep')}, ${context.organizationId}, ${orderId}, ${processStage}, ${index + 1}, 'NOT_STARTED', ${JSON.stringify(plannedParameters)}::jsonb, ${input.notes ?? null})
        `
      }
      await this.transition(tx, context, row, 'PLANNED')
      await tx.$executeRaw`UPDATE v2_production_orders SET planned_start_at = ${input.plannedStartAt ? new Date(input.plannedStartAt) : row.plannedStartAt}, due_at = ${input.dueAt ? new Date(input.dueAt) : row.dueAt}, equipment_ref = ${input.equipmentRef ?? null}, notes = ${input.notes ?? row.notes}, updated_by = ${context.userId}, updated_at = now() WHERE id = ${orderId} AND organization_id = ${context.organizationId}`
      await this.audit(tx, context, 'production.order.plan', 'allowed', 'production_order', orderId, { requirements: requirements.length, equipmentRef: input.equipmentRef ?? null })
      return { id: orderId, status: 'PLANNED', requirements: requirements.map((requirement) => ({ ...requirement, status: 'PENDING' })) }
    })
  }

  async cancelOrder(context: PlatformContext, orderId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.cancel')
    const input = validated(productionOrderCancellationRequestSchema, rawInput)
    const route = 'production.orders.cancel'
    const request = { orderId, input }
    const allocationSnapshot = await this.scoped(context, async (tx) => {
      const order = await this.order(tx, context, orderId)
      if (!['DRAFT', 'PLANNED', 'READY_FOR_WEIGHING'].includes(order.status)) throw new PlatformError('PRODUCTION_ORDER_CANCEL_STATE_INVALID', 'Only a pre-consumption Production Order may be cancelled.', 409)
      return this.allocations(tx, context, orderId)
    })
    const reservationIds = allocationSnapshot.map((item) => item.inventoryReservationId).filter((id): id is string => Boolean(id))
    if (!reservationIds.length) {
      return this.idempotent(context, route, idempotencyKey, request, async (tx) => {
        const order = await this.order(tx, context, orderId, true)
        if (!['DRAFT', 'PLANNED'].includes(order.status)) throw new PlatformError('PRODUCTION_ORDER_CANCEL_STATE_INVALID', 'An allocated Production Order must release its controlled reservations before cancellation.', 409)
        const usages = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM v2_production_material_usages
          WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND status = 'COMMITTED'
          LIMIT 1 FOR UPDATE
        `
        if (usages[0]) throw new PlatformError('PRODUCTION_ORDER_CANCEL_CONSUMPTION_EXISTS', 'A Production Order with committed raw-material usage must be held and corrected, not cancelled.', 409)
        await tx.$executeRaw`
          UPDATE v2_production_material_requirements SET status = 'CANCELLED', updated_at = now()
          WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND status IN ('PENDING', 'ALLOCATED', 'SHORT')
        `
        await this.transition(tx, context, order, 'CANCELLED', { cancelReason: input.rationale })
        await this.audit(tx, context, 'production.order.cancel', 'allowed', 'production_order', orderId, { rationale: input.rationale, allocationDisposition: 'NONE' })
        return { id: orderId, status: 'CANCELLED', cancelReason: input.rationale }
      })
    }
    await this.require(context, 'inventory.reserve')
    const replay = await this.delegatedIdempotentResponse<JsonRecord>(context, route, idempotencyKey, request)
    if (replay) return replay
    const lab = await this.lab.releaseProductionReservations(context, { contextId: orderId, reservationIds }, childIdempotencyKey('production_allocation_release', request), {
      beforeRelease: async (tx, reservations) => {
        const order = await this.order(tx, context, orderId, true)
        if (order.status !== 'READY_FOR_WEIGHING') throw new PlatformError('PRODUCTION_ORDER_CANCEL_STATE_INVALID', 'Only a pre-consumption Production Order with active reservations may be cancelled.', 409)
        const usages = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM v2_production_material_usages
          WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND status = 'COMMITTED'
          LIMIT 1 FOR UPDATE
        `
        if (usages[0]) throw new PlatformError('PRODUCTION_ORDER_CANCEL_CONSUMPTION_EXISTS', 'A Production Order with committed raw-material usage must be held and corrected, not cancelled.', 409)
        const allocations = await this.allocations(tx, context, orderId, true)
        if (allocations.length !== reservations.length || allocations.some((item) => item.status !== 'ALLOCATED' || !item.inventoryReservationId || !reservations.some((reservation) => reservation.id === item.inventoryReservationId))) {
          throw new PlatformError('PRODUCTION_RESERVATION_LINK_MISSING', 'The controlled allocation no longer matches its active inventory reservations.', 409)
        }
      },
      afterRelease: async (tx, reservations) => {
        const order = await this.order(tx, context, orderId, true)
        await tx.$executeRaw`
          UPDATE v2_production_allocations SET status = 'RELEASED', released_at = now()
          WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND inventory_reservation_id IN (${Prisma.join(reservations.map((reservation) => reservation.id))}) AND status = 'ALLOCATED'
        `
        await tx.$executeRaw`
          UPDATE v2_production_material_requirements SET status = 'CANCELLED', updated_at = now()
          WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND status IN ('PENDING', 'ALLOCATED', 'SHORT')
        `
        await this.transition(tx, context, order, 'CANCELLED', { cancelReason: input.rationale })
        await this.audit(tx, context, 'production.order.cancel', 'allowed', 'production_order', orderId, { rationale: input.rationale, releasedReservations: reservations.map((reservation) => reservation.id) })
        return { id: orderId, status: 'CANCELLED', cancelReason: input.rationale, releasedReservations: reservations.length }
      },
    })
    const integration = (lab as { integration?: unknown }).integration
    if (!integration || typeof integration !== 'object' || Array.isArray(integration)) {
      throw new PlatformError('PRODUCTION_RESERVATION_INTEGRATION_MISSING', 'The inventory reservation completed without its required Production allocation transition.', 409)
    }
    // The Lab boundary owns reservation rows, while this service owns the
    // resulting Production transition. Keep the public production result flat
    // so normal execution and the idempotent receipt expose the same state.
    const response = { ...(integration as JsonRecord), reservations: lab.reservations }
    return this.completeDelegatedIdempotency(context, route, idempotencyKey, request, response)
  }

  async closeOrder(context: PlatformContext, orderId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.close')
    const input = validated(productionOrderCloseRequestSchema, rawInput)
    return this.idempotent(context, 'production.orders.close', idempotencyKey, { orderId, input }, async (tx) => {
      const order = await this.order(tx, context, orderId, true)
      if (!['RELEASED', 'REJECTED'].includes(order.status)) throw new PlatformError('PRODUCTION_ORDER_CLOSE_STATE_INVALID', 'Only a released or rejected Production Order may be closed.', 409)
      let closureBasis: JsonRecord
      if (order.status === 'RELEASED') {
        const release = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM v2_production_releases
          WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND status = 'RELEASED'
          LIMIT 1 FOR UPDATE
        `
        if (!release[0]) throw new PlatformError('PRODUCTION_RELEASE_NOT_FOUND', 'This Production Order has no immutable release decision to close.', 409)
        closureBasis = { kind: 'RELEASE', releaseId: release[0].id }
      } else {
        const rejection = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM v2_production_deviations
          WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId}
            AND status = 'CLOSED' AND disposition = 'REJECT'
          LIMIT 1 FOR UPDATE
        `
        if (!rejection[0]) throw new PlatformError('PRODUCTION_REJECTION_EVIDENCE_MISSING', 'A rejected Production Order requires its immutable QC or deviation disposition evidence before closure.', 409)
        closureBasis = { kind: 'REJECTION_DEVIATION', deviationId: rejection[0].id }
      }
      await this.transition(tx, context, order, 'CLOSED', { closed: true })
      await this.audit(tx, context, 'production.order.close', 'allowed', 'production_order', orderId, { rationale: input.rationale, closureBasis })
      return { id: orderId, status: 'CLOSED', closedAt: new Date().toISOString() }
    })
  }

  async detail(context: PlatformContext, orderId: string) {
    await this.require(context, 'production.view')
    const capabilities = await this.platform.capabilityProjection(context)
    const canViewInventory = capabilities['inventory.view'] === true
    const canViewDocuments = capabilities['production.documents.view'] === true
    const canViewFinishedGoods = capabilities['production.finishedGoods.view'] === true
    return this.scoped(context, async (tx) => {
      const row = await this.order(tx, context, orderId)
      const [requirements, allocations, weighing, weighingLines, materialUsages, stages, qcSpecification, qcResults, deviations, capas, yields, reworks, documents, finishedLots] = await Promise.all([
        tx.$queryRaw<Array<{ id: string; materialId: string; materialName: string; plannedQuantityGrams: Prisma.Decimal; toleranceGrams: Prisma.Decimal; status: string }>>`
          SELECT r.id, r.material_id AS "materialId", m.name AS "materialName", r.planned_quantity_g AS "plannedQuantityGrams", r.tolerance_g AS "toleranceGrams", r.status
          FROM v2_production_material_requirements r JOIN v2_materials m ON m.id = r.material_id AND m.organization_id = r.organization_id
          WHERE r.production_order_id = ${orderId} AND r.organization_id = ${context.organizationId} ORDER BY m.name ASC, r.id ASC
        `,
        tx.$queryRaw<Array<{ id: string; requirementId: string; materialId: string; materialName: string; inventoryLotId: string; supplierLot: string | null; allocatedQuantityGrams: Prisma.Decimal; status: string; allocatedAt: Date }>>`
          SELECT a.id, a.requirement_id AS "requirementId", a.material_id AS "materialId", m.name AS "materialName", a.inventory_lot_id AS "inventoryLotId", l.supplier_lot AS "supplierLot",
                 a.allocated_quantity_g AS "allocatedQuantityGrams", a.status, a.allocated_at AS "allocatedAt"
          FROM v2_production_allocations a JOIN v2_materials m ON m.id = a.material_id AND m.organization_id = a.organization_id
          JOIN v2_inventory_lots l ON l.id = a.inventory_lot_id AND l.organization_id = a.organization_id
          WHERE a.production_order_id = ${orderId} AND a.organization_id = ${context.organizationId} ORDER BY a.allocated_at ASC, a.id ASC
        `,
        tx.$queryRaw<Array<{ id: string; labWeighingSessionId: string; status: string; plannedTotalGrams: Prisma.Decimal | null; actualTotalGrams: Prisma.Decimal | null; startedAt: Date | null; confirmedAt: Date | null }>>`
          SELECT id, lab_weighing_session_id AS "labWeighingSessionId", status, planned_total_g AS "plannedTotalGrams", actual_total_g AS "actualTotalGrams", started_at AS "startedAt", confirmed_at AS "confirmedAt"
          FROM v2_production_weighing_sessions WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} ORDER BY sequence_number ASC
        `,
        tx.$queryRaw<Array<{ productionWeighingSessionId: string; lineId: string; productionUsageId: string | null; materialId: string; materialName: string; lotId: string | null; requestedGrams: Prisma.Decimal; actualGrams: Prisma.Decimal | null; toleranceGrams: Prisma.Decimal; consumptionMovementId: string | null }>>`
          SELECT pws.id AS "productionWeighingSessionId", lwl.id AS "lineId", lwl.material_id AS "materialId", m.name AS "materialName", lwl.lot_id AS "lotId",
                 pu.id AS "productionUsageId", lwl.requested_g AS "requestedGrams", lwl.actual_g AS "actualGrams", lwl.tolerance_g AS "toleranceGrams", lwl.consumption_movement_id AS "consumptionMovementId"
          FROM v2_production_weighing_sessions pws
          JOIN v2_lab_weighing_lines lwl ON lwl.session_id = pws.lab_weighing_session_id AND lwl.organization_id = pws.organization_id
          JOIN v2_materials m ON m.id = lwl.material_id AND m.organization_id = lwl.organization_id
          LEFT JOIN v2_production_material_usages pu ON pu.lab_weighing_line_id = lwl.id AND pu.organization_id = lwl.organization_id
          WHERE pws.production_order_id = ${orderId} AND pws.organization_id = ${context.organizationId} ORDER BY pws.sequence_number ASC, lwl.id ASC
        `,
        tx.$queryRaw<Array<{ id: string; requirementId: string; allocationId: string; weighingSessionId: string; materialId: string; materialName: string; lotId: string; actualQuantityGrams: Prisma.Decimal; inventoryMovementId: string; status: string; reversalMovementId: string | null; createdAt: Date; reversedAt: Date | null }>>`
          SELECT u.id, u.requirement_id AS "requirementId", u.allocation_id AS "allocationId", u.weighing_session_id AS "weighingSessionId",
                 u.material_id AS "materialId", m.name AS "materialName", u.lot_id AS "lotId", u.actual_quantity_g AS "actualQuantityGrams",
                 u.inventory_movement_id AS "inventoryMovementId", u.status, u.reversal_movement_id AS "reversalMovementId", u.created_at AS "createdAt", u.reversed_at AS "reversedAt"
          FROM v2_production_material_usages u
          JOIN v2_materials m ON m.id = u.material_id AND m.organization_id = u.organization_id
          WHERE u.production_order_id = ${orderId} AND u.organization_id = ${context.organizationId}
          ORDER BY u.created_at ASC, u.id ASC
        `,
        tx.$queryRaw<Array<{ id: string; stage: string; sequenceNumber: number; status: string; plannedParameters: JsonRecord; actualParameters: JsonRecord; startedAt: Date | null; completedAt: Date | null; notes: string | null }>>`
          SELECT id, stage, sequence_number AS "sequenceNumber", status, planned_parameters AS "plannedParameters", actual_parameters AS "actualParameters", started_at AS "startedAt", completed_at AS "completedAt", notes
          FROM v2_production_process_steps WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} ORDER BY sequence_number ASC
        `,
        row.qcSpecificationId
          ? tx.$queryRaw<Array<{ id: string; name: string; versionLabel: string; specification: JsonRecord; status: string }>>`
              SELECT id, name, version_label AS "versionLabel", specification, status FROM v2_production_qc_specifications
              WHERE id = ${row.qcSpecificationId} AND organization_id = ${context.organizationId} LIMIT 1
            `.then((items) => items[0] ?? null)
          : Promise.resolve(null),
        tx.$queryRaw<Array<{ id: string; qcSpecificationId: string; checkKey: string; revision: number; supersedesResultId: string | null; resultStatus: string; observedValue: unknown; recordedAt: Date; approvedAt: Date | null }>>`
          SELECT id, qc_specification_id AS "qcSpecificationId", check_key AS "checkKey", revision, supersedes_result_id AS "supersedesResultId", result_status AS "resultStatus", observed_value AS "observedValue", recorded_at AS "recordedAt", approved_at AS "approvedAt"
          FROM v2_production_qc_results WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} ORDER BY recorded_at ASC
        `,
        tx.$queryRaw<Array<{ id: string; category: string; severity: string; status: string; disposition: string | null; reworkTargetStage: string | null; finishedGoodLotId: string | null; evidenceDocumentSnapshotIds: unknown; description: string; detectedAt: Date; closedAt: Date | null }>>`
          SELECT d.id, d.category, d.severity, d.status, d.disposition, d.rework_target_stage AS "reworkTargetStage", d.finished_good_lot_id AS "finishedGoodLotId",
                 COALESCE((
                   SELECT jsonb_agg(e.document_snapshot_id ORDER BY e.linked_at ASC, e.id ASC)
                   FROM v2_production_deviation_evidence e
                   WHERE e.organization_id = d.organization_id AND e.deviation_id = d.id
                 ), '[]'::jsonb) AS "evidenceDocumentSnapshotIds",
                 d.description, d.detected_at AS "detectedAt", d.closed_at AS "closedAt"
          FROM v2_production_deviations d WHERE d.production_order_id = ${orderId} AND d.organization_id = ${context.organizationId} ORDER BY d.detected_at DESC
        `,
        tx.$queryRaw<Array<{ id: string; deviationId: string; actionType: string; status: string; action: string; dueAt: Date | null; completedAt: Date | null; verifiedAt: Date | null }>>`
          SELECT c.id, c.deviation_id AS "deviationId", c.action_type AS "actionType", c.status, c.action, c.due_at AS "dueAt", c.completed_at AS "completedAt", c.verified_at AS "verifiedAt"
          FROM v2_production_capa_actions c JOIN v2_production_deviations d ON d.id = c.deviation_id AND d.organization_id = c.organization_id
          WHERE d.production_order_id = ${orderId} AND c.organization_id = ${context.organizationId} ORDER BY c.created_at ASC
        `,
        tx.$queryRaw<Array<{ id: string; revision: number; inputConsumedGrams: Prisma.Decimal; bulkOutputGrams: Prisma.Decimal; filledOutputGrams: Prisma.Decimal | null; wasteGrams: Prisma.Decimal; reworkGrams: Prisma.Decimal; reconciliationDeltaGrams: Prisma.Decimal; status: string; recordedAt: Date; reconciledAt: Date | null }>>`
          SELECT id, revision, input_consumed_g AS "inputConsumedGrams", bulk_output_g AS "bulkOutputGrams", filled_output_g AS "filledOutputGrams", waste_g AS "wasteGrams", rework_g AS "reworkGrams",
                 reconciliation_delta_g AS "reconciliationDeltaGrams", status, recorded_at AS "recordedAt", reconciled_at AS "reconciledAt"
          FROM v2_production_yield_records WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} ORDER BY revision DESC
        `,
        tx.$queryRaw<Array<{ id: string; deviationId: string | null; sourceFinishedGoodLotId: string | null; quantityGrams: Prisma.Decimal; targetStage: string; status: string; reason: string; createdAt: Date; completedAt: Date | null }>>`
          SELECT id, deviation_id AS "deviationId", source_finished_good_lot_id AS "sourceFinishedGoodLotId", quantity_g AS "quantityGrams", target_stage AS "targetStage", status, reason,
                 created_at AS "createdAt", completed_at AS "completedAt"
          FROM v2_production_rework_records
          WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId}
          ORDER BY created_at DESC, id DESC
        `,
        canViewDocuments ? tx.$queryRaw<Array<{ id: string; documentKind: string; objectRef: string; contentHash: string; versionLabel: string | null; metadata: JsonRecord; status: string; capturedAt: Date }>>`
          SELECT id, document_kind AS "documentKind", object_ref AS "objectRef", content_hash AS "contentHash", version_label AS "versionLabel", metadata, status, captured_at AS "capturedAt"
          FROM v2_production_document_snapshots WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND status = 'ACTIVE' ORDER BY captured_at DESC
        ` : Promise.resolve([] as Array<{ id: string; documentKind: string; objectRef: string; contentHash: string; versionLabel: string | null; metadata: JsonRecord; status: string; capturedAt: Date }>),
        canViewFinishedGoods ? tx.$queryRaw<Array<{ id: string; lotNumber: string; initialQuantityGrams: Prisma.Decimal; location: string; status: string; releasedAt: Date | null }>>`
          SELECT id, lot_number AS "lotNumber", initial_quantity_g AS "initialQuantityGrams", location, status, released_at AS "releasedAt"
          FROM v2_finished_good_lots WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} ORDER BY created_at DESC
        ` : Promise.resolve([] as Array<{ id: string; lotNumber: string; initialQuantityGrams: Prisma.Decimal; location: string; status: string; releasedAt: Date | null }>),
      ])
      const inventoryEvidence = projectProductionDetailInventoryEvidence(canViewInventory, { allocations, weighing, weighingLines, materialUsages })
      return {
        order: this.orderProjection(row),
        requirements: requirements.map((item) => ({ ...item, plannedQuantityGrams: asNumber(item.plannedQuantityGrams), toleranceGrams: asNumber(item.toleranceGrams) })),
        allocations: inventoryEvidence.allocations.map((item) => ({ ...item, allocatedQuantityGrams: asNumber(item.allocatedQuantityGrams), allocatedAt: item.allocatedAt.toISOString() })),
        weighing: inventoryEvidence.weighing.map((item) => ({ ...item, plannedTotalGrams: item.plannedTotalGrams === null ? null : asNumber(item.plannedTotalGrams), actualTotalGrams: item.actualTotalGrams === null ? null : asNumber(item.actualTotalGrams), startedAt: iso(item.startedAt), confirmedAt: iso(item.confirmedAt) })),
        weighingLines: inventoryEvidence.weighingLines.map((item) => ({ ...item, requestedGrams: asNumber(item.requestedGrams), actualGrams: item.actualGrams === null ? null : asNumber(item.actualGrams), toleranceGrams: asNumber(item.toleranceGrams) })),
        materialUsages: inventoryEvidence.materialUsages.map((item) => ({ ...item, actualQuantityGrams: asNumber(item.actualQuantityGrams), createdAt: item.createdAt.toISOString(), reversedAt: iso(item.reversedAt) })),
        stages: stages.map((item) => ({
          ...item,
          reworkId: typeof item.plannedParameters?.reworkId === 'string' ? item.plannedParameters.reworkId : null,
          startedAt: iso(item.startedAt),
          completedAt: iso(item.completedAt),
        })),
        qcSpecification: qcSpecification ?? null,
        qcResults: qcResults.map((item) => ({ ...item, recordedAt: item.recordedAt.toISOString(), approvedAt: iso(item.approvedAt) })),
        deviations: deviations.map((item) => ({ ...item, evidenceDocumentSnapshotIds: stringArray(item.evidenceDocumentSnapshotIds), detectedAt: item.detectedAt.toISOString(), closedAt: iso(item.closedAt) })),
        capas: capas.map((item) => ({ ...item, dueAt: iso(item.dueAt), completedAt: iso(item.completedAt), verifiedAt: iso(item.verifiedAt) })),
        yields: yields.map((item) => ({ ...item, inputConsumedGrams: asNumber(item.inputConsumedGrams), bulkOutputGrams: asNumber(item.bulkOutputGrams), filledOutputGrams: item.filledOutputGrams === null ? null : asNumber(item.filledOutputGrams), wasteGrams: asNumber(item.wasteGrams), reworkGrams: asNumber(item.reworkGrams), reconciliationDeltaGrams: asNumber(item.reconciliationDeltaGrams), recordedAt: item.recordedAt.toISOString(), reconciledAt: iso(item.reconciledAt) })),
        reworks: reworks.map((item) => ({ ...item, sourceKind: item.sourceFinishedGoodLotId ? 'FINISHED_GOOD_LOT' : 'IN_PROCESS', quantityGrams: asNumber(item.quantityGrams), createdAt: item.createdAt.toISOString(), completedAt: iso(item.completedAt) })),
        documents: documents.map((item) => ({ ...item, capturedAt: item.capturedAt.toISOString() })),
        finishedLots: finishedLots.map((item) => ({ ...item, initialQuantityGrams: asNumber(item.initialQuantityGrams), releasedAt: iso(item.releasedAt) })),
      }
    })
  }

  async allocationSuggestions(context: PlatformContext, orderId: string) {
    await this.require(context, 'production.allocate')
    const planned = await this.scoped(context, async (tx) => {
      const row = await this.order(tx, context, orderId)
      if (!['PLANNED', 'READY_FOR_WEIGHING'].includes(row.status)) throw new PlatformError('PRODUCTION_ALLOCATION_NOT_AVAILABLE', 'Materials can only be allocated while the Production Order is planned.', 409)
      return this.requirements(tx, context, orderId)
    })
    const suggestions = [] as Array<JsonRecord>
    for (const requirement of planned) {
      try {
        const lots = await this.lab.fefo(context, requirement.materialId, asNumber(requirement.plannedQuantityGrams))
        suggestions.push({ requirementId: requirement.id, materialId: requirement.materialId, requiredGrams: asNumber(requirement.plannedQuantityGrams), status: 'AVAILABLE', lots: lots.map((lot) => ({ ...lot, allocatedGrams: asNumber(lot.allocatedGrams) })) })
      } catch (error) {
        if (error instanceof PlatformError && error.code === 'TENANT_ACCESS_DENIED') {
          suggestions.push({ requirementId: requirement.id, materialId: requirement.materialId, requiredGrams: asNumber(requirement.plannedQuantityGrams), status: 'NOT_EVALUATED', reason: 'Inventory visibility is required to evaluate eligible lots.' })
        } else {
          suggestions.push({ requirementId: requirement.id, materialId: requirement.materialId, requiredGrams: asNumber(requirement.plannedQuantityGrams), status: 'SHORT', reason: 'No eligible FEFO lot can cover this material requirement.' })
        }
      }
    }
    return suggestions
  }

  async allocateMaterials(context: PlatformContext, orderId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.allocate')
    await this.require(context, 'inventory.reserve')
    const input = validated(productionAllocationCommitRequestSchema, rawInput)
    const route = 'production.orders.allocate'
    const request = { orderId, input }
    const replay = await this.delegatedIdempotentResponse<JsonRecord>(context, route, idempotencyKey, request)
    if (replay) return replay
    const plannedLines = await this.scoped(context, async (tx) => {
      const requirements = await this.requirements(tx, context, orderId)
      const requirementById = new Map(requirements.map((item) => [item.id, item]))
      return input.allocations.map((line) => {
        const requirement = requirementById.get(line.requirementId)
        if (!requirement) throw new PlatformError('PRODUCTION_REQUIREMENT_NOT_FOUND', 'An allocation references a requirement outside this Production Order.', 404)
        return { ...line, materialId: requirement.materialId }
      })
    })
    const lab = await this.lab.reserveProductionLots(context, {
      contextType: 'PRODUCTION',
      contextId: orderId,
      lines: plannedLines.map((line) => ({ materialId: line.materialId, lotId: line.lotId, quantityGrams: line.allocatedGrams })),
    }, childIdempotencyKey('production_allocation_reserve', request), {
      beforeReserve: async (tx) => {
        const row = await this.order(tx, context, orderId, true)
        if (row.status !== 'PLANNED') throw new PlatformError('PRODUCTION_ALLOCATION_STATE_INVALID', 'Materials may only be committed while the Production Order is planned.', 409)
        if (!row.qcSpecificationId) throw new PlatformError('PRODUCTION_QC_SPECIFICATION_REQUIRED', 'Attach an active QC specification before allocating lots for controlled production.', 409)
        await this.assertQcSpecification(tx, context, row.qcSpecificationId, row.formulaVersionId)
        const requirements = await this.requirements(tx, context, orderId, true)
        if (!requirements.length) throw new PlatformError('PRODUCTION_REQUIREMENTS_MISSING', 'Plan material requirements before allocating lots.', 409)
        const requirementById = new Map(requirements.map((item) => [item.id, item]))
        const allocationsByRequirement = new Map<string, number>()
        for (const line of input.allocations) {
          const requirement = requirementById.get(line.requirementId)
          if (!requirement) throw new PlatformError('PRODUCTION_REQUIREMENT_NOT_FOUND', 'An allocation references a requirement outside this Production Order.', 404)
          allocationsByRequirement.set(line.requirementId, (allocationsByRequirement.get(line.requirementId) ?? 0) + line.allocatedGrams)
        }
        for (const requirement of requirements) {
          const allocated = allocationsByRequirement.get(requirement.id) ?? 0
          const expected = asNumber(requirement.plannedQuantityGrams)
          if (Math.abs(allocated - expected) > Math.max(asNumber(requirement.toleranceGrams), EPSILON)) {
            throw new PlatformError('PRODUCTION_ALLOCATION_INCOMPLETE', 'Each production material must have a complete lot allocation before weighing can start.', 409)
          }
        }
        const existing = await this.allocations(tx, context, orderId, true)
        if (existing.length) throw new PlatformError('PRODUCTION_ALLOCATION_IMMUTABLE', 'A Production Order already has a controlled material allocation.', 409)
      },
      afterReserve: async (tx, reservations) => {
        const row = await this.order(tx, context, orderId, true)
        const requirements = await this.requirements(tx, context, orderId, true)
        const requirementById = new Map(requirements.map((item) => [item.id, item]))
        const lineByMaterialLot = new Map(plannedLines.map((line) => [`${line.materialId}:${line.lotId}`, line]))
        if (reservations.length !== plannedLines.length) throw new PlatformError('PRODUCTION_RESERVATION_LINK_MISSING', 'The controlled inventory reservation did not produce every requested allocation.', 409)
        for (const reservation of reservations) {
          const line = lineByMaterialLot.get(`${reservation.materialId}:${reservation.lotId}`)
          const requirement = line ? requirementById.get(line.requirementId) : undefined
          if (!line || !requirement || Math.abs(reservation.quantityGrams - line.allocatedGrams) > EPSILON) throw new PlatformError('PRODUCTION_RESERVATION_LINK_MISSING', 'The controlled inventory reservation no longer matches the selected production allocation.', 409)
          const allocationId = identifier('prodalloc')
          await tx.$executeRaw`
            INSERT INTO v2_production_allocations (id, organization_id, production_order_id, requirement_id, material_id, inventory_lot_id, inventory_reservation_id, allocated_quantity_g, status, allocated_by, allocated_at)
            VALUES (${allocationId}, ${context.organizationId}, ${orderId}, ${requirement.id}, ${requirement.materialId}, ${reservation.lotId}, ${reservation.id}, ${reservation.quantityGrams}, 'ALLOCATED', ${context.userId}, now())
          `
          await this.genealogy(tx, context, orderId, 'PRODUCTION_ORDER', orderId, 'RAW_MATERIAL_LOT', reservation.lotId, 'ALLOCATES_RAW_LOT', { requirementId: requirement.id, allocationId, inventoryReservationId: reservation.id, allocatedGrams: reservation.quantityGrams })
        }
        await tx.$executeRaw`UPDATE v2_production_material_requirements SET status = 'ALLOCATED', updated_at = now() WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId}`
        await this.transition(tx, context, row, 'READY_FOR_WEIGHING')
        await this.audit(tx, context, 'production.order.allocate', 'allowed', 'production_order', orderId, { allocationCount: reservations.length, reservationState: 'RESERVED' })
        return { orderId, status: 'READY_FOR_WEIGHING', allocationCount: reservations.length, reservationState: 'RESERVED' }
      },
    })
    const response = { reservations: lab.reservations, production: (lab as { integration?: unknown }).integration ?? null }
    return this.completeDelegatedIdempotency(context, route, idempotencyKey, request, response)
  }

  async startWeighing(context: PlatformContext, orderId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.weigh')
    const input = validated(productionWeighingStartRequestSchema, rawInput)
    const planned = await this.scoped(context, async (tx) => {
      const row = await this.order(tx, context, orderId)
      if (row.status !== 'READY_FOR_WEIGHING') throw new PlatformError('PRODUCTION_WEIGHING_STATE_INVALID', 'Production weighing can only start after complete material allocation.', 409)
      const allocations = await this.allocations(tx, context, orderId)
      const activeAllocations = allocations.filter((item) => item.status === 'ALLOCATED')
      if (activeAllocations.length !== input.lines.length || allocations.length !== activeAllocations.length) throw new PlatformError('PRODUCTION_WEIGHING_ALLOCATIONS_MISMATCH', 'The weighing plan must include every current production allocation exactly once.', 409)
      const allocationById = new Map(activeAllocations.map((item) => [item.id, item]))
      const seen = new Set<string>()
      const lines = input.lines.map((line) => {
        const allocation = allocationById.get(line.allocationId)
        if (!allocation || allocation.status !== 'ALLOCATED' || seen.has(allocation.id)) throw new PlatformError('PRODUCTION_WEIGHING_ALLOCATION_INVALID', 'The weighing plan references an unavailable allocation.', 409)
        seen.add(allocation.id)
        if (Math.abs(line.requestedGrams - asNumber(allocation.allocatedQuantityGrams)) > EPSILON) throw new PlatformError('PRODUCTION_WEIGHING_QUANTITY_INVALID', 'Weighing requested quantity must match the controlled allocation.', 409)
        return { allocation, requestedGrams: line.requestedGrams, toleranceGrams: line.toleranceGrams }
      })
      return { lines, plannedTotalGrams: lines.reduce((sum, line) => sum + line.requestedGrams, 0) }
    })
    const result = await this.lab.createWeighingSession(context, {
      contextType: 'PRODUCTION', contextId: orderId,
      lines: planned.lines.map((line) => ({ materialId: line.allocation.materialId, lotId: line.allocation.inventoryLotId, reservationId: line.allocation.inventoryReservationId ?? undefined, requestedGrams: line.requestedGrams, toleranceGrams: line.toleranceGrams })),
    }, idempotencyKey, {
      beforeCreate: async (tx) => {
        const row = await this.order(tx, context, orderId, true)
        if (row.status !== 'READY_FOR_WEIGHING') throw new PlatformError('PRODUCTION_WEIGHING_STATE_INVALID', 'Production weighing can only start after complete material allocation.', 409)
        if (!row.qcSpecificationId) throw new PlatformError('PRODUCTION_QC_SPECIFICATION_REQUIRED', 'An active QC specification is required before controlled weighing can begin.', 409)
        await this.assertQcSpecification(tx, context, row.qcSpecificationId, row.formulaVersionId)
        const allocations = await this.allocations(tx, context, orderId, true)
        const activeAllocations = allocations.filter((item) => item.status === 'ALLOCATED')
        const plannedByAllocationId = new Map(planned.lines.map((line) => [line.allocation.id, line]))
        if (
          activeAllocations.length !== planned.lines.length
          || allocations.length !== activeAllocations.length
          || activeAllocations.some((item) => item.status !== 'ALLOCATED'
            || !item.inventoryReservationId
            || !plannedByAllocationId.has(item.id)
            || Math.abs(asNumber(item.allocatedQuantityGrams) - plannedByAllocationId.get(item.id)!.requestedGrams) > EPSILON)
        ) throw new PlatformError('PRODUCTION_WEIGHING_ALLOCATIONS_CHANGED', 'The controlled allocation changed before weighing could begin.', 409)
      },
      afterCreate: async (tx, session) => {
        const sequenceRows = await tx.$queryRaw<Array<{ sequence: number }>>`
          SELECT COALESCE(MAX(sequence_number), 0) + 1 AS sequence FROM v2_production_weighing_sessions WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId}
        `
        const productionSessionId = identifier('prodweigh')
        await tx.$executeRaw`
          INSERT INTO v2_production_weighing_sessions (id, organization_id, production_order_id, lab_weighing_session_id, sequence_number, status, planned_total_g, started_by, started_at)
          VALUES (${productionSessionId}, ${context.organizationId}, ${orderId}, ${session.id}, ${sequenceRows[0]?.sequence ?? 1}, 'IN_PROGRESS', ${planned.plannedTotalGrams}, ${context.userId}, now())
        `
        const row = await this.order(tx, context, orderId, true)
        await this.transition(tx, context, row, 'WEIGHING')
        await this.genealogy(tx, context, orderId, 'PRODUCTION_ORDER', orderId, 'WEIGHING_SESSION', productionSessionId, 'WEIGHED_FROM_RAW_LOT', { labWeighingSessionId: session.id })
        await this.audit(tx, context, 'production.weighing.start', 'allowed', 'production_order', orderId, { productionSessionId, labWeighingSessionId: session.id })
        return { productionSessionId, labWeighingSessionId: session.id, status: 'IN_PROGRESS' }
      },
    })
    return { lab: result, production: (result as { integration?: unknown }).integration ?? null }
  }

  async confirmWeighing(context: PlatformContext, orderId: string, labSessionId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.weigh')
    const input = validated(productionWeighingConfirmRequestSchema, rawInput)
    const result = await this.lab.confirmWeighing(context, labSessionId, input.lines, idempotencyKey, {
      beforeConfirm: async (tx, session, lines) => {
        if (session.contextType !== 'PRODUCTION' || session.contextId !== orderId) throw new PlatformError('PRODUCTION_WEIGHING_SESSION_MISMATCH', 'This Lab weighing session is not attached to the requested Production Order.', 409)
        const productionSessions = await tx.$queryRaw<ProductionWeighingRow[]>`
          SELECT id, lab_weighing_session_id AS "labWeighingSessionId", status, production_order_id AS "productionOrderId"
          FROM v2_production_weighing_sessions WHERE lab_weighing_session_id = ${labSessionId} AND production_order_id = ${orderId} AND organization_id = ${context.organizationId} FOR UPDATE
        `
        if (!productionSessions[0] || productionSessions[0].status !== 'IN_PROGRESS') throw new PlatformError('PRODUCTION_WEIGHING_SESSION_INVALID', 'This Production weighing session cannot be confirmed.', 409)
        const row = await this.order(tx, context, orderId, true)
        if (row.status !== 'WEIGHING') throw new PlatformError('PRODUCTION_WEIGHING_STATE_INVALID', 'The Production Order is not awaiting weighing confirmation.', 409)
        const allocations = await this.allocations(tx, context, orderId, true)
        const activeAllocations = allocations.filter((item) => item.status === 'ALLOCATED')
        if (activeAllocations.length !== lines.length) throw new PlatformError('PRODUCTION_WEIGHING_ALLOCATIONS_MISMATCH', 'Every currently controlled allocation must be confirmed in the weighing session.', 409)
      },
      afterConfirm: async (tx, session, confirmed) => this.attachConfirmedWeighing(tx, context, orderId, session.id, confirmed),
    })
    return { lab: result, production: (result as { integration?: unknown }).integration ?? null }
  }

  /**
   * Corrects a raw-material consumption through the Lab Operations compensating
   * movement API. It deliberately cannot be used after a process stage is
   * complete: at that point rework is the only traceable remedy.
   */
  async reverseMaterialUsage(context: PlatformContext, orderId: string, usageId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.process')
    await this.require(context, 'inventory.reverse')
    const input = validated(productionUsageReversalRequestSchema, rawInput)
    const route = 'production.material_usage.reverse'
    const request = { orderId, usageId, input }
    const replay = await this.delegatedIdempotentResponse<JsonRecord>(context, route, idempotencyKey, request)
    if (replay) return replay
    // Do not lock the usage in a parent transaction: the Lab reversal hook
    // locks and mutates it atomically with the compensating inventory move.
    const usage = await this.scoped(context, (tx) => this.productionUsageForCorrection(tx, context, orderId, usageId))
    const childKey = childIdempotencyKey('usage_reverse', request)
    const lab = await this.lab.reverseMovement(context, usage.inventoryMovementId, childKey, {
        afterReverse: async (labTx, original, reversal) => {
          const current = await this.productionUsageForCorrection(labTx, context, orderId, usageId, true)
          if (current.inventoryMovementId !== original.id) throw new PlatformError('PRODUCTION_USAGE_MOVEMENT_MISMATCH', 'The selected usage no longer matches the controlled inventory movement.', 409)
          const completedStage = await labTx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM v2_production_process_steps
            WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND status = 'COMPLETED'
            LIMIT 1 FOR UPDATE
          `
          const order = await this.order(labTx, context, orderId, true)
          assertProductionUsageCorrectionAllowed({ orderStatus: order.status, hasCompletedProcessStage: Boolean(completedStage[0]) })
          const deviationId = identifier('proddev')
          await labTx.$executeRaw`
            UPDATE v2_production_material_usages
            SET status = 'REVERSED', reversal_movement_id = ${reversal.id}, reversed_at = now()
            WHERE id = ${usageId} AND organization_id = ${context.organizationId} AND status = 'COMMITTED'
          `
          await labTx.$executeRaw`
            UPDATE v2_production_allocations SET status = 'ALLOCATED'
            WHERE id = ${current.allocationId} AND organization_id = ${context.organizationId} AND status = 'CONSUMED'
          `
          await labTx.$executeRaw`
            UPDATE v2_production_material_requirements SET status = 'ALLOCATED', updated_at = now()
            WHERE id = ${current.requirementId} AND organization_id = ${context.organizationId}
          `
          await labTx.$executeRaw`
            UPDATE v2_production_weighing_sessions SET status = 'CORRECTED', updated_at = now()
            WHERE id = ${current.weighingSessionId} AND organization_id = ${context.organizationId}
          `
          await labTx.$executeRaw`
            INSERT INTO v2_production_deviations (id, organization_id, production_order_id, requirement_id, weighing_session_id, category, severity, status, description, immediate_action, detected_by, detected_at)
            VALUES (${deviationId}, ${context.organizationId}, ${orderId}, ${current.requirementId}, ${current.weighingSessionId}, 'WEIGHING', 'HIGH', 'OPEN',
                    ${`Controlled reversal of raw-material usage ${usageId}.`}, ${input.reason}, ${context.userId}, now())
          `
          if (order.status !== 'HOLD') await this.transition(labTx, context, order, 'HOLD', { holdReason: input.reason })
          await this.genealogy(labTx, context, orderId, 'RAW_MATERIAL_USAGE', usageId, 'DEVIATION', deviationId, 'HAS_DEVIATION', { reversalMovementId: reversal.id, reason: input.reason })
          await this.audit(labTx, context, 'production.material_usage.reverse', 'allowed', 'production_material_usage', usageId, { orderId, reversalMovementId: reversal.id, deviationId, reason: input.reason })
          return { usageId, status: 'REVERSED', reversalMovementId: reversal.id, deviationId, orderStatus: 'HOLD', nextAction: 'Resolve the weighing deviation, then resume the controlled correction weighing session.' }
        },
      })
    const response = { lab, production: (lab as { integration?: unknown }).integration ?? null }
    return this.completeDelegatedIdempotency(context, route, idempotencyKey, request, response)
  }

  private async attachConfirmedWeighing(tx: Transaction, context: PlatformContext, orderId: string, labSessionId: string, confirmed: LabWeighingConfirmedLine[]) {
    const productionSessions = await tx.$queryRaw<ProductionWeighingRow[]>`
      SELECT id, lab_weighing_session_id AS "labWeighingSessionId", status, production_order_id AS "productionOrderId"
      FROM v2_production_weighing_sessions WHERE lab_weighing_session_id = ${labSessionId} AND production_order_id = ${orderId} AND organization_id = ${context.organizationId} FOR UPDATE
    `
    const productionSession = productionSessions[0]
    if (!productionSession) throw new PlatformError('PRODUCTION_WEIGHING_SESSION_MISSING', 'The Production weighing record is missing.', 409)
    const [requirements, allocations] = await Promise.all([this.requirements(tx, context, orderId, true), this.allocations(tx, context, orderId, true)])
    const activeAllocations = allocations.filter((item) => item.status === 'ALLOCATED')
    const allocationByMaterialLot = new Map(activeAllocations.map((item) => [`${item.materialId}:${item.inventoryLotId}`, item]))
    const requirementById = new Map(requirements.map((item) => [item.id, item]))
    const usedAllocationIds = new Set<string>()
    let actualTotal = 0
    for (const line of confirmed) {
      const allocation = allocationByMaterialLot.get(`${line.materialId}:${line.lotId}`)
      if (!allocation || allocation.status !== 'ALLOCATED' || usedAllocationIds.has(allocation.id)) throw new PlatformError('PRODUCTION_WEIGHING_ALLOCATION_INVALID', 'A confirmed Lab line does not match its controlled production allocation.', 409)
      usedAllocationIds.add(allocation.id)
      const requirement = requirementById.get(allocation.requirementId)
      if (!requirement) throw new PlatformError('PRODUCTION_REQUIREMENT_NOT_FOUND', 'A confirmed allocation has no production requirement.', 409)
      const costSnapshot = { landedUnitCost: line.landedUnitCost, currency: line.currency, actualGrams: line.actualGrams, source: 'LAB_OPERATIONS_LEDGER' }
      const usageId = identifier('produsage')
      await tx.$executeRaw`
        INSERT INTO v2_production_material_usages (id, organization_id, production_order_id, requirement_id, allocation_id, weighing_session_id, material_id, lot_id, lab_weighing_line_id, inventory_movement_id, planned_quantity_g, actual_quantity_g, cost_snapshot, cost_snapshot_hash, status)
        VALUES (${usageId}, ${context.organizationId}, ${orderId}, ${requirement.id}, ${allocation.id}, ${productionSession.id}, ${line.materialId}, ${line.lotId}, ${line.lineId}, ${line.movementId},
                ${allocation.allocatedQuantityGrams}, ${line.actualGrams}, ${JSON.stringify(costSnapshot)}::jsonb, ${digest(costSnapshot)}, 'COMMITTED')
      `
      await tx.$executeRaw`UPDATE v2_production_allocations SET status = 'CONSUMED' WHERE id = ${allocation.id} AND organization_id = ${context.organizationId}`
      await this.genealogy(tx, context, orderId, 'RAW_MATERIAL_LOT', line.lotId, 'RAW_MATERIAL_USAGE', usageId, 'CONSUMES_RAW_LOT', { inventoryMovementId: line.movementId, actualGrams: line.actualGrams })
      actualTotal += line.actualGrams
    }
    if (usedAllocationIds.size !== activeAllocations.length) throw new PlatformError('PRODUCTION_WEIGHING_INCOMPLETE', 'Every currently controlled allocation must be confirmed before processing begins.', 409)
    await tx.$executeRaw`
      UPDATE v2_production_material_requirements r
      SET status = CASE
        WHEN EXISTS (
          SELECT 1 FROM v2_production_allocations a
          WHERE a.organization_id = r.organization_id AND a.production_order_id = r.production_order_id
            AND a.requirement_id = r.id AND a.status <> 'CONSUMED'
        ) THEN 'ALLOCATED' ELSE 'CONSUMED' END,
        updated_at = now()
      WHERE r.production_order_id = ${orderId} AND r.organization_id = ${context.organizationId}
    `
    await tx.$executeRaw`UPDATE v2_production_weighing_sessions SET status = 'CONFIRMED', actual_total_g = ${actualTotal}, confirmed_by = ${context.userId}, confirmed_at = now(), updated_at = now() WHERE id = ${productionSession.id} AND organization_id = ${context.organizationId}`
    const row = await this.order(tx, context, orderId, true)
    await this.transition(tx, context, row, 'COMPOUNDING')
    await this.audit(tx, context, 'production.weighing.confirm', 'allowed', 'production_order', orderId, { productionSessionId: productionSession.id, actualTotalGrams: actualTotal })
    return { productionSessionId: productionSession.id, labWeighingSessionId: labSessionId, status: 'CONFIRMED', actualTotalGrams: actualTotal }
  }

  async startStage(context: PlatformContext, orderId: string, rawStage: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.process')
    const processStage = stage(rawStage)
    const input = validated(productionProcessStageCompleteRequestSchema, rawInput)
    return this.idempotent(context, 'production.process.start', idempotencyKey, { orderId, processStage, input }, async (tx) => {
      const row = await this.order(tx, context, orderId, true)
      if (row.status !== processStage && row.status !== 'REWORK') throw new PlatformError('PRODUCTION_STAGE_STATE_INVALID', 'This production stage is not ready to start.', 409)
      const steps = await tx.$queryRaw<Array<{ id: string; stage: string; status: string; sequenceNumber: number }>>`
        SELECT id, stage, status, sequence_number AS "sequenceNumber" FROM v2_production_process_steps
        WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} ORDER BY sequence_number ASC FOR UPDATE
      `
      const current = [...steps].reverse().find((item) => item.stage === processStage && item.status === 'NOT_STARTED')
      if (!current || current.status !== 'NOT_STARTED') throw new PlatformError('PRODUCTION_STAGE_NOT_STARTABLE', 'This production stage has already started or is not planned.', 409)
      const prior = expectedPriorStage(processStage)
      if (prior && !steps.some((item) => item.stage === prior && item.status === 'COMPLETED')) throw new PlatformError('PRODUCTION_STAGE_PREREQUISITE_MISSING', 'The prior production stage must complete first.', 409)
      if (row.status === 'REWORK') {
        const rework = await tx.$queryRaw<Array<{ id: string; targetStage: string; status: string }>>`
          SELECT id, target_stage AS "targetStage", status FROM v2_production_rework_records
          WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND status IN ('PLANNED','IN_PROGRESS') ORDER BY created_at DESC LIMIT 1 FOR UPDATE
        `
        if (!rework[0] || rework[0].targetStage !== processStage) throw new PlatformError('PRODUCTION_REWORK_TARGET_INVALID', 'This stage is not the authorized target of the active rework record.', 409)
        await tx.$executeRaw`UPDATE v2_production_rework_records SET status = 'IN_PROGRESS' WHERE id = ${rework[0].id} AND organization_id = ${context.organizationId}`
      }
      await tx.$executeRaw`
        UPDATE v2_production_process_steps SET status = 'IN_PROGRESS', started_by = ${context.userId}, started_at = ${input.startedAt ? new Date(input.startedAt) : new Date()},
          actual_parameters = ${JSON.stringify(input.actualParameters)}::jsonb, notes = ${input.notes ?? null}, updated_at = now()
        WHERE id = ${current.id} AND organization_id = ${context.organizationId}
      `
      if (row.status === 'REWORK') await this.transition(tx, context, row, processStage)
      await this.genealogy(tx, context, orderId, 'PRODUCTION_ORDER', orderId, 'PROCESS_STEP', current.id, 'PROCESSED_BY', { stage: processStage, startedAt: input.startedAt ?? new Date().toISOString() })
      await this.audit(tx, context, 'production.process.start', 'allowed', 'production_order', orderId, { stage: processStage, processStepId: current.id })
      return { id: current.id, stage: processStage, status: 'IN_PROGRESS' }
    })
  }

  async completeStage(context: PlatformContext, orderId: string, rawStage: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.process')
    const processStage = stage(rawStage)
    const input = validated(productionProcessStageCompleteRequestSchema, rawInput)
    return this.idempotent(context, 'production.process.complete', idempotencyKey, { orderId, processStage, input }, async (tx) => {
      const row = await this.order(tx, context, orderId, true)
      if (row.status !== processStage) throw new PlatformError('PRODUCTION_STAGE_STATE_INVALID', 'The selected process stage is not currently active.', 409)
      await this.assertDocuments(tx, context, orderId, input.documentSnapshotIds)
      const steps = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM v2_production_process_steps
        WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND stage = ${processStage}
        ORDER BY sequence_number ASC FOR UPDATE
      `
      const current = [...steps].reverse().find((item) => item.status === 'IN_PROGRESS')
      if (!current || current.status !== 'IN_PROGRESS') throw new PlatformError('PRODUCTION_STAGE_NOT_ACTIVE', 'The selected process stage is not in progress.', 409)
      assertStageTransition(current.status, 'COMPLETED')
      await tx.$executeRaw`
        UPDATE v2_production_process_steps SET status = 'COMPLETED', completed_by = ${context.userId}, completed_at = ${input.completedAt ? new Date(input.completedAt) : new Date()},
          actual_parameters = ${JSON.stringify(input.actualParameters)}::jsonb, notes = ${input.notes ?? null}, updated_at = now()
        WHERE id = ${current.id} AND organization_id = ${context.organizationId}
      `
      const target = nextStage(processStage)
      await this.transition(tx, context, row, target)
      await this.audit(tx, context, 'production.process.complete', 'allowed', 'production_order', orderId, { stage: processStage, processStepId: current.id, nextState: target })
      return { id: current.id, stage: processStage, status: 'COMPLETED', nextState: target }
    })
  }

  async recordYield(context: PlatformContext, orderId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.process')
    const input = validated(productionYieldRecordRequestSchema, rawInput)
    return this.idempotent(context, 'production.yield.record', idempotencyKey, { orderId, input }, async (tx) => {
      const row = await this.order(tx, context, orderId, true)
      if (!['FILLING', 'QC', 'HOLD', 'REWORK'].includes(row.status)) throw new PlatformError('PRODUCTION_YIELD_STATE_INVALID', 'Yield can only be recorded after filling has begun.', 409)
      const usages = await tx.$queryRaw<Array<{ total: Prisma.Decimal }>>`
        SELECT COALESCE(SUM(actual_quantity_g), 0) AS total FROM v2_production_material_usages
        WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND status = 'COMMITTED'
      `
      const inputConsumedGrams = asNumber(usages[0]?.total)
      const yieldResult = calculateYield(inputConsumedGrams || asNumber(row.targetBulkGrams), input.bulkOutputGrams)
      const reconciliationDelta = Number((inputConsumedGrams - input.bulkOutputGrams - input.wasteGrams - input.reworkGrams).toFixed(6))
      const tolerance = Math.max(0.1, inputConsumedGrams * 0.005)
      const status = Math.abs(reconciliationDelta) <= tolerance ? 'RECONCILED' : 'REVIEW_REQUIRED'
      // The locked Production Order serializes revisions; lock the latest row
      // rather than applying FOR UPDATE to an aggregate (which PostgreSQL does
      // not allow).
      const revisions = await tx.$queryRaw<Array<{ revision: number }>>`
        SELECT revision FROM v2_production_yield_records
        WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId}
        ORDER BY revision DESC LIMIT 1 FOR UPDATE
      `
      const id = identifier('prodyield')
      await tx.$executeRaw`
        INSERT INTO v2_production_yield_records (id, organization_id, production_order_id, revision, input_consumed_g, bulk_output_g, filled_output_g, waste_g, rework_g, expected_loss_g, reconciliation_delta_g, status, rationale, recorded_by, recorded_at, reconciled_by, reconciled_at)
        VALUES (${id}, ${context.organizationId}, ${orderId}, ${(revisions[0]?.revision ?? 0) + 1}, ${inputConsumedGrams}, ${input.bulkOutputGrams}, ${input.filledOutputGrams ?? null}, ${input.wasteGrams}, ${input.reworkGrams}, ${input.expectedLossGrams}, ${reconciliationDelta}, ${status}, ${input.rationale ?? null}, ${context.userId}, now(), ${status === 'RECONCILED' ? context.userId : null}, ${status === 'RECONCILED' ? new Date() : null})
      `
      await this.genealogy(tx, context, orderId, 'PRODUCTION_ORDER', orderId, 'YIELD_RECORD', id, 'YIELDED', { ...yieldResult, reconciliationDelta, status })
      await this.audit(tx, context, 'production.yield.record', 'allowed', 'production_order', orderId, { yieldRecordId: id, status, reconciliationDelta })
      return { id, inputConsumedGrams, ...yieldResult, filledOutputGrams: input.filledOutputGrams ?? null, wasteGrams: input.wasteGrams, reworkGrams: input.reworkGrams, reconciliationDelta, status }
    })
  }

  async createQcSpecification(context: PlatformContext, orderId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.qc.approve')
    const input = validated(productionQcSpecificationCreateRequestSchema, rawInput)
    return this.idempotent(context, 'production.qc.specifications.create', idempotencyKey, { orderId, input }, async (tx) => {
      const order = await this.order(tx, context, orderId, true)
      if (!['DRAFT', 'PLANNED', 'READY_FOR_WEIGHING'].includes(order.status)) throw new PlatformError('PRODUCTION_QC_SPEC_STATE_INVALID', 'A QC specification must be selected before controlled weighing begins.', 409)
      const formulaVersionId = input.formulaVersionId ?? order.formulaVersionId
      if (formulaVersionId !== order.formulaVersionId) throw new PlatformError('PRODUCTION_QC_SPEC_FORMULA_MISMATCH', 'A Production Order QC specification must be tied to its pinned Formula Version.', 409)
      const specification = { schemaVersion: '1.0', checks: input.checks }
      const id = identifier('prodspec')
      await tx.$executeRaw`
        INSERT INTO v2_production_qc_specifications (id, organization_id, formula_version_id, name, version_label, specification, content_hash, status, created_by)
        VALUES (${id}, ${context.organizationId}, ${formulaVersionId}, ${input.name}, ${input.versionLabel}, ${JSON.stringify(specification)}::jsonb, ${digest(specification)}, 'ACTIVE', ${context.userId})
      `
      await tx.$executeRaw`UPDATE v2_production_orders SET qc_specification_id = ${id}, updated_by = ${context.userId}, updated_at = now() WHERE id = ${orderId} AND organization_id = ${context.organizationId}`
      await this.genealogy(tx, context, orderId, 'PRODUCTION_ORDER', orderId, 'QC_SPECIFICATION', id, 'INSPECTED_BY', { formulaVersionId, contentHash: digest(specification) })
      await this.audit(tx, context, 'production.qc.specification.create', 'allowed', 'production_order', orderId, { qcSpecificationId: id, checkCount: input.checks.length })
      return { id, status: 'ACTIVE', formulaVersionId, checks: input.checks.length }
    })
  }

  async recordQcResult(context: PlatformContext, orderId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.qc.record')
    const input = validated(productionQcResultRecordRequestSchema, rawInput)
    return this.idempotent(context, 'production.qc.results.record', idempotencyKey, { orderId, input }, async (tx) => {
      const order = await this.order(tx, context, orderId, true)
      if (!['QC', 'HOLD'].includes(order.status)) throw new PlatformError('PRODUCTION_QC_STATE_INVALID', 'QC results may only be recorded during QC review or a controlled hold.', 409)
      if (order.qcSpecificationId !== input.qcSpecificationId) throw new PlatformError('PRODUCTION_QC_SPECIFICATION_MISMATCH', 'This QC specification is not attached to the Production Order.', 409)
      const specification = await this.assertQcSpecification(tx, context, input.qcSpecificationId, order.formulaVersionId)
      const checks = Array.isArray(specification.specification.checks) ? specification.specification.checks as Array<JsonRecord> : []
      const check = checks.find((item) => item.key === input.checkKey)
      if (!check) throw new PlatformError('PRODUCTION_QC_CHECK_NOT_FOUND', 'The selected QC check is not defined by the active specification.', 404)
      await this.assertDocuments(tx, context, orderId, input.evidenceDocumentSnapshotIds)
      const evaluated = this.evaluateQcCheck(check, input.observedValue, input.notApplicableReason)
      const existing = await tx.$queryRaw<Array<{ id: string; resultStatus: string; revision: number }>>`
        SELECT id, result_status AS "resultStatus", revision
        FROM v2_production_qc_results
        WHERE production_order_id = ${orderId} AND qc_specification_id = ${input.qcSpecificationId} AND check_key = ${input.checkKey} AND organization_id = ${context.organizationId}
        ORDER BY revision DESC LIMIT 1 FOR UPDATE
      `
      const previous = existing[0]
      if (previous && previous.resultStatus !== 'INVALIDATED') throw new PlatformError('PRODUCTION_QC_RESULT_EXISTS', 'This QC check already has a controlled result. Invalidate it through the approval workflow before recording a replacement.', 409)
      const id = identifier('prodqc')
      const revision = (previous?.revision ?? 0) + 1
      const observedValue = input.observedValue === undefined ? { notApplicableReason: input.notApplicableReason } : input.observedValue
      const evaluationSnapshot = { schemaVersion: '1.0', check, proposedStatus: evaluated.status, notes: input.notes ?? null, notApplicableReason: input.notApplicableReason ?? null, supersedesResultId: previous?.id ?? null }
      await tx.$executeRaw`
        INSERT INTO v2_production_qc_results (id, organization_id, production_order_id, qc_specification_id, check_key, revision, supersedes_result_id, result_status, observed_value, evaluation_snapshot, evidence_snapshot_ids, recorded_by, recorded_at)
        VALUES (${id}, ${context.organizationId}, ${orderId}, ${input.qcSpecificationId}, ${input.checkKey}, ${revision}, ${previous?.id ?? null}, 'PENDING', ${JSON.stringify(observedValue)}::jsonb,
                ${JSON.stringify(evaluationSnapshot)}::jsonb, ${JSON.stringify(input.evidenceDocumentSnapshotIds)}::jsonb, ${context.userId}, now())
      `
      await this.genealogy(tx, context, orderId, 'PRODUCTION_ORDER', orderId, 'QC_RESULT', id, 'INSPECTED_BY', { qcSpecificationId: input.qcSpecificationId, checkKey: input.checkKey, revision, supersedesResultId: previous?.id ?? null, proposedStatus: evaluated.status })
      await this.audit(tx, context, 'production.qc.result.record', 'allowed', 'production_order', orderId, { qcResultId: id, checkKey: input.checkKey, revision, supersedesResultId: previous?.id ?? null })
      return { id, status: 'PENDING', proposedStatus: evaluated.status, checkKey: input.checkKey, revision, supersedesResultId: previous?.id ?? null }
    })
  }

  async approveQcResult(context: PlatformContext, orderId: string, resultId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.qc.approve')
    const input = validated(productionQcApprovalRequestSchema, rawInput)
    return this.idempotent(context, 'production.qc.results.approve', idempotencyKey, { orderId, resultId, input }, async (tx) => {
      const order = await this.order(tx, context, orderId, true)
      const results = await tx.$queryRaw<Array<{ id: string; resultStatus: string; evaluationSnapshot: JsonRecord; checkKey: string }>>`
        SELECT id, result_status AS "resultStatus", evaluation_snapshot AS "evaluationSnapshot", check_key AS "checkKey"
        FROM v2_production_qc_results WHERE id = ${resultId} AND production_order_id = ${orderId} AND organization_id = ${context.organizationId} FOR UPDATE
      `
      const result = results[0]
      if (!result || result.resultStatus !== 'PENDING') throw new PlatformError('PRODUCTION_QC_RESULT_NOT_PENDING', 'Only a pending QC result can be approved or rejected.', 409)
      const proposedStatus = result.evaluationSnapshot.proposedStatus
      if (!['PASSED', 'FAILED', 'NOT_APPLICABLE'].includes(String(proposedStatus))) throw new PlatformError('PRODUCTION_QC_EVALUATION_INVALID', 'The recorded QC result has no deterministic evaluation outcome.', 409)
      if (input.decision === 'HOLD') {
        if (order.status !== 'HOLD') await this.transition(tx, context, order, 'HOLD', { holdReason: input.rationale })
        await this.audit(tx, context, 'production.qc.result.hold', 'allowed', 'production_order', orderId, { qcResultId: resultId })
        return { id: resultId, status: 'PENDING', orderStatus: 'HOLD' }
      }
      if (input.decision === 'REJECT') {
        await tx.$executeRaw`UPDATE v2_production_qc_results SET result_status = 'INVALIDATED', approved_by = ${context.userId}, approved_at = now(), updated_at = now() WHERE id = ${resultId} AND organization_id = ${context.organizationId}`
        await this.audit(tx, context, 'production.qc.result.invalidate', 'allowed', 'production_order', orderId, { qcResultId: resultId, rationale: input.rationale })
        return { id: resultId, status: 'INVALIDATED' }
      }
      await tx.$executeRaw`UPDATE v2_production_qc_results SET result_status = ${String(proposedStatus)}, approved_by = ${context.userId}, approved_at = now(), updated_at = now() WHERE id = ${resultId} AND organization_id = ${context.organizationId}`
      if (proposedStatus === 'FAILED') {
        const deviationId = identifier('proddev')
        await tx.$executeRaw`
          INSERT INTO v2_production_deviations (id, organization_id, production_order_id, qc_result_id, category, severity, status, description, immediate_action, detected_by, detected_at)
          VALUES (${deviationId}, ${context.organizationId}, ${orderId}, ${resultId}, 'QC', 'HIGH', 'OPEN', ${`QC check ${result.checkKey} did not meet the approved specification.`}, ${input.rationale}, ${context.userId}, now())
        `
        if (order.status !== 'HOLD') await this.transition(tx, context, order, 'HOLD', { holdReason: `QC failed: ${result.checkKey}` })
        await this.genealogy(tx, context, orderId, 'QC_RESULT', resultId, 'DEVIATION', deviationId, 'HAS_DEVIATION', { checkKey: result.checkKey })
      }
      await this.audit(tx, context, 'production.qc.result.approve', 'allowed', 'production_order', orderId, { qcResultId: resultId, status: proposedStatus, rationale: input.rationale })
      return { id: resultId, status: proposedStatus, orderStatus: proposedStatus === 'FAILED' ? 'HOLD' : order.status }
    })
  }

  async recordDeviation(context: PlatformContext, orderId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.deviation.manage')
    const input = validated(productionDeviationCreateRequestSchema, rawInput)
    return this.idempotent(context, 'production.deviations.create', idempotencyKey, { orderId, input }, async (tx) => {
      const order = await this.order(tx, context, orderId, true)
      if (['DRAFT', 'PLANNED', 'READY_FOR_WEIGHING', 'RELEASED', 'CANCELLED', 'CLOSED'].includes(order.status)) {
        throw new PlatformError('PRODUCTION_DEVIATION_STATE_INVALID', order.status === 'RELEASED'
          ? 'Use the finished-good quality-hold workflow for a released batch so availability is moved through the immutable finished-good ledger.'
          : 'A deviation can only be attached to an active production workflow.', 409)
      }
      await this.assertDeviationReferences(tx, context, orderId, input)
      const id = identifier('proddev')
      await tx.$executeRaw`
        INSERT INTO v2_production_deviations (id, organization_id, production_order_id, requirement_id, process_step_id, qc_result_id, weighing_session_id, category, severity, status, description, immediate_action, detected_by, detected_at)
        VALUES (${id}, ${context.organizationId}, ${orderId}, ${input.requirementId ?? null}, ${input.processStepId ?? null}, ${input.qcResultId ?? null}, ${input.weighingSessionId ?? null},
                ${input.category}, ${input.severity}, 'OPEN', ${input.description}, ${input.immediateAction ?? null}, ${context.userId}, ${input.detectedAt ? new Date(input.detectedAt) : new Date()})
      `
      if (['HIGH', 'CRITICAL'].includes(input.severity) && order.status !== 'HOLD') await this.transition(tx, context, order, 'HOLD', { holdReason: `Open ${input.severity.toLowerCase()} deviation` })
      await this.genealogy(tx, context, orderId, 'PRODUCTION_ORDER', orderId, 'DEVIATION', id, 'HAS_DEVIATION', { category: input.category, severity: input.severity })
      await this.audit(tx, context, 'production.deviation.create', 'allowed', 'production_order', orderId, { deviationId: id, category: input.category, severity: input.severity })
      return { id, status: 'OPEN', orderStatus: ['HIGH', 'CRITICAL'].includes(input.severity) ? 'HOLD' : order.status }
    })
  }

  async createCapaAction(context: PlatformContext, orderId: string, deviationId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.deviation.manage')
    const input = validated(productionCapaActionCreateRequestSchema, rawInput)
    return this.idempotent(context, 'production.capa.create', idempotencyKey, { orderId, deviationId, input }, async (tx) => {
      const deviation = await this.deviation(tx, context, orderId, deviationId, true)
      if (['CLOSED', 'VOIDED'].includes(deviation.status)) throw new PlatformError('PRODUCTION_DEVIATION_NOT_ACTIONABLE', 'A closed or voided deviation cannot receive a CAPA action.', 409)
      if (input.ownerUserId) {
        const member = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_memberships WHERE organization_id = ${context.organizationId} AND user_id = ${input.ownerUserId} AND status = 'ACTIVE'`
        if (!member[0]) throw new PlatformError('PRODUCTION_CAPA_OWNER_INVALID', 'The selected CAPA owner is not an active workspace member.', 422)
      }
      const id = identifier('prodcapa')
      await tx.$executeRaw`
        INSERT INTO v2_production_capa_actions (id, organization_id, deviation_id, action_type, status, action, owner_user_id, due_at, verification_plan)
        VALUES (${id}, ${context.organizationId}, ${deviationId}, ${input.actionType}, 'OPEN', ${input.action}, ${input.ownerUserId ?? null}, ${input.dueAt ? new Date(input.dueAt) : null}, ${input.verificationPlan ?? null})
      `
      await tx.$executeRaw`UPDATE v2_production_deviations SET status = 'CAPA_REQUIRED', updated_at = now() WHERE id = ${deviationId} AND organization_id = ${context.organizationId}`
      await this.genealogy(tx, context, orderId, 'DEVIATION', deviationId, 'CAPA_ACTION', id, 'MITIGATED_BY', { actionType: input.actionType })
      await this.audit(tx, context, 'production.capa.create', 'allowed', 'production_deviation', deviationId, { capaId: id })
      return { id, deviationId, status: 'OPEN' }
    })
  }

  async completeCapaAction(context: PlatformContext, orderId: string, deviationId: string, capaId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.deviation.manage')
    const input = validated(productionCapaActionCompleteRequestSchema, rawInput)
    return this.idempotent(context, 'production.capa.complete', idempotencyKey, { orderId, deviationId, capaId, input }, async (tx) => {
      await this.deviation(tx, context, orderId, deviationId, true)
      await this.assertDocuments(tx, context, orderId, input.evidenceDocumentSnapshotIds)
      const actions = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM v2_production_capa_actions WHERE id = ${capaId} AND deviation_id = ${deviationId} AND organization_id = ${context.organizationId} FOR UPDATE
      `
      const action = actions[0]
      if (!action || !['OPEN', 'IN_PROGRESS'].includes(action.status)) throw new PlatformError('PRODUCTION_CAPA_NOT_COMPLETABLE', 'This CAPA action cannot be marked complete.', 409)
      await tx.$executeRaw`
        UPDATE v2_production_capa_actions SET status = 'EFFECTIVENESS_PENDING', completion_notes = ${input.completionNotes}, completed_by = ${context.userId}, completed_at = now(), updated_at = now()
        WHERE id = ${capaId} AND organization_id = ${context.organizationId}
      `
      await this.audit(tx, context, 'production.capa.complete', 'allowed', 'production_capa', capaId, { deviationId })
      return { id: capaId, status: 'EFFECTIVENESS_PENDING' }
    })
  }

  async verifyCapaAction(context: PlatformContext, orderId: string, deviationId: string, capaId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.qc.approve')
    const input = validated(productionQcApprovalRequestSchema, rawInput)
    return this.idempotent(context, 'production.capa.verify', idempotencyKey, { orderId, deviationId, capaId, input }, async (tx) => {
      await this.deviation(tx, context, orderId, deviationId, true)
      const actions = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM v2_production_capa_actions WHERE id = ${capaId} AND deviation_id = ${deviationId} AND organization_id = ${context.organizationId} FOR UPDATE
      `
      if (!actions[0] || actions[0].status !== 'EFFECTIVENESS_PENDING') throw new PlatformError('PRODUCTION_CAPA_NOT_VERIFIABLE', 'Only a completed CAPA action may be verified.', 409)
      if (input.decision === 'HOLD') return { id: capaId, status: 'EFFECTIVENESS_PENDING', rationale: input.rationale }
      const status = input.decision === 'APPROVE' ? 'EFFECTIVE' : 'INEFFECTIVE'
      await tx.$executeRaw`
        UPDATE v2_production_capa_actions SET status = ${status}, verified_by = ${context.userId}, verified_at = now(), updated_at = now()
        WHERE id = ${capaId} AND organization_id = ${context.organizationId}
      `
      await this.audit(tx, context, 'production.capa.verify', 'allowed', 'production_capa', capaId, { deviationId, status, rationale: input.rationale })
      return { id: capaId, status }
    })
  }

  async resolveDeviation(context: PlatformContext, orderId: string, deviationId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.deviation.manage')
    const input = validated(productionDeviationDispositionRequestSchema, rawInput)
    const qualityHoldDeviation = await this.scoped(context, async (tx) => this.deviation(tx, context, orderId, deviationId))
    if (qualityHoldDeviation.finishedGoodLotId) await this.require(context, 'production.qc.approve')
    return this.idempotent(context, 'production.deviations.disposition', idempotencyKey, { orderId, deviationId, input }, async (tx) => {
      const order = await this.order(tx, context, orderId, true)
      const deviation = await this.deviation(tx, context, orderId, deviationId, true)
      if (['CLOSED', 'VOIDED'].includes(deviation.status)) throw new PlatformError('PRODUCTION_DEVIATION_ALREADY_RESOLVED', 'This deviation is already closed or voided.', 409)
      const actions = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM v2_production_capa_actions WHERE deviation_id = ${deviationId} AND organization_id = ${context.organizationId} FOR UPDATE`
      if (actions.length && actions.some((item) => item.status !== 'EFFECTIVE')) throw new PlatformError('PRODUCTION_CAPA_NOT_EFFECTIVE', 'Every CAPA action must be verified effective before the deviation can close.', 409)

      if (deviation.finishedGoodLotId) {
        if (input.disposition === 'HOLD') throw new PlatformError('PRODUCTION_FINISHED_GOOD_HOLD_ALREADY_ACTIVE', 'A released finished-good deviation is already on controlled quality hold. Resolve it by release, rework, or rejection.', 409)
        if (order.status !== 'HOLD') throw new PlatformError('PRODUCTION_FINISHED_GOOD_HOLD_STATE_INVALID', 'The linked Production Order must remain on quality hold while its released lot deviation is resolved.', 409)
        const lot = await this.finishedGoodLot(tx, context, deviation.finishedGoodLotId, true)
        if (lot.productionOrderId !== orderId || lot.status !== 'HOLD') throw new PlatformError('PRODUCTION_FINISHED_GOOD_HOLD_STATE_INVALID', 'The linked finished-good lot is no longer in the controlled quality-hold state.', 409)
        const heldQuantityGrams = await this.finishedGoodBucketBalance(tx, context, lot.id, 'HOLD')
        if (heldQuantityGrams <= EPSILON) throw new PlatformError('PRODUCTION_FINISHED_GOOD_HOLD_EMPTY', 'The controlled finished-good quality hold has no remaining held quantity.', 409)

        await tx.$executeRaw`
          UPDATE v2_production_deviations
          SET status = 'CLOSED', disposition = ${input.disposition}, rework_target_stage = ${input.disposition === 'REWORK' ? input.reworkTargetStage! : null},
              root_cause = ${input.rationale}, closed_by = ${context.userId}, closed_at = now(), updated_at = now()
          WHERE id = ${deviationId} AND organization_id = ${context.organizationId}
        `
        if (input.disposition === 'CONTINUE') {
          const ledgerEntryId = await this.moveFinishedGood(tx, context, {
            orderId,
            lotId: lot.id,
            movementType: 'QUALITY_RELEASE',
            quantityGrams: heldQuantityGrams,
            fromBucket: 'HOLD',
            toBucket: 'AVAILABLE',
            referenceType: 'PRODUCTION_FINISHED_GOOD_QUALITY_RELEASE',
            referenceId: deviationId,
            idempotencyScope: 'fg_quality_release',
          })
          await tx.$executeRaw`UPDATE v2_finished_good_lots SET status = 'RELEASED', updated_at = now() WHERE id = ${lot.id} AND organization_id = ${context.organizationId}`
          await this.transition(tx, context, order, 'RELEASED', { holdReason: null })
          await this.audit(tx, context, 'production.finished_good.quality_release', 'allowed', 'finished_good_lot', lot.id, { orderId, deviationId, ledgerEntryId, quantityGrams: heldQuantityGrams, rationale: input.rationale })
        } else if (input.disposition === 'REJECT') {
          const ledgerEntryId = await this.moveFinishedGood(tx, context, {
            orderId,
            lotId: lot.id,
            movementType: 'WASTE',
            quantityGrams: heldQuantityGrams,
            fromBucket: 'HOLD',
            toBucket: null,
            referenceType: 'PRODUCTION_FINISHED_GOOD_REJECTION',
            referenceId: deviationId,
            idempotencyScope: 'fg_quality_reject',
          })
          await tx.$executeRaw`UPDATE v2_finished_good_lots SET status = 'REJECTED', updated_at = now() WHERE id = ${lot.id} AND organization_id = ${context.organizationId}`
          await this.transition(tx, context, order, 'REJECTED')
          await this.audit(tx, context, 'production.finished_good.reject', 'allowed', 'finished_good_lot', lot.id, { orderId, deviationId, ledgerEntryId, quantityGrams: heldQuantityGrams, rationale: input.rationale })
        }
        await this.audit(tx, context, 'production.deviation.resolve', 'allowed', 'production_deviation', deviationId, { disposition: input.disposition, reworkTargetStage: input.reworkTargetStage ?? null, rationale: input.rationale, finishedGoodLotId: lot.id })
        return { id: deviationId, status: 'CLOSED', disposition: input.disposition, reworkTargetStage: input.reworkTargetStage ?? null, finishedGoodLotId: lot.id }
      }

      await tx.$executeRaw`
        UPDATE v2_production_deviations
        SET status = 'CLOSED', disposition = ${input.disposition}, rework_target_stage = ${input.disposition === 'REWORK' ? input.reworkTargetStage! : null}, root_cause = ${input.rationale}, closed_by = ${context.userId}, closed_at = now(), updated_at = now()
        WHERE id = ${deviationId} AND organization_id = ${context.organizationId}
      `
      if (input.disposition === 'HOLD' && order.status !== 'HOLD') await this.transition(tx, context, order, 'HOLD', { holdReason: input.rationale })
      // A deviation disposition identifies the required remedy, but is not the
      // rework itself. Keeping the order held until a separately recorded
      // rework has source, quantity, and stage provenance prevents an empty
      // REWORK state from bypassing the controlled rework workflow.
      if (input.disposition === 'REWORK' && order.status !== 'HOLD') await this.transition(tx, context, order, 'HOLD', { holdReason: input.rationale })
      if (input.disposition === 'REJECT') {
        if (!['QC', 'HOLD'].includes(order.status)) throw new PlatformError('PRODUCTION_REJECTION_STATE_INVALID', 'A Production Order may only be rejected from QC review or a QC hold.', 409)
        if (deviation.category !== 'QC' || !deviation.qcResultId) throw new PlatformError('PRODUCTION_REJECTION_QC_EVIDENCE_REQUIRED', 'Production rejection requires the controlled QC deviation that caused the hold.', 409)
        await this.transition(tx, context, order, 'REJECTED')
      }
      await this.audit(tx, context, 'production.deviation.resolve', 'allowed', 'production_deviation', deviationId, { disposition: input.disposition, reworkTargetStage: input.reworkTargetStage ?? null, rationale: input.rationale })
      return { id: deviationId, status: 'CLOSED', disposition: input.disposition, reworkTargetStage: input.reworkTargetStage ?? null }
    })
  }

  async startRework(context: PlatformContext, orderId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.deviation.manage')
    await this.require(context, 'production.process')
    const input = validated(productionReworkCreateRequestSchema, rawInput)
    if (input.sourceKind === 'FINISHED_GOOD_LOT') await this.require(context, 'production.qc.approve')
    return this.idempotent(context, 'production.rework.create', idempotencyKey, { orderId, input }, async (tx) => {
      const order = await this.order(tx, context, orderId, true)
      if (!['QC', 'HOLD', 'REWORK'].includes(order.status)) throw new PlatformError('PRODUCTION_REWORK_STATE_INVALID', 'Rework may only begin from a controlled QC or hold state.', 409)
      const deviations = await tx.$queryRaw<Array<{ id: string; targetStage: string | null; finishedGoodLotId: string | null }>>`
        SELECT id, rework_target_stage AS "targetStage", finished_good_lot_id AS "finishedGoodLotId"
        FROM v2_production_deviations
        WHERE id = ${input.deviationId} AND production_order_id = ${orderId} AND organization_id = ${context.organizationId}
          AND status = 'CLOSED' AND disposition = 'REWORK'
        FOR UPDATE
      `
      const deviation = deviations[0]
      if (!deviation || deviation.targetStage !== input.targetStage) {
        throw new PlatformError('PRODUCTION_REWORK_DEVIATION_INVALID', 'Rework requires a closed REWORK deviation whose approved target stage matches this request.', 409)
      }
      if (input.sourceKind === 'FINISHED_GOOD_LOT') {
        if (order.status !== 'HOLD' || deviation.finishedGoodLotId !== input.sourceFinishedGoodLotId) {
          throw new PlatformError('PRODUCTION_REWORK_FINISHED_GOOD_HOLD_REQUIRED', 'Finished-good rework must start from the same released lot that is held by the approved quality deviation.', 409)
        }
      } else if (deviation.finishedGoodLotId) {
        throw new PlatformError('PRODUCTION_REWORK_SOURCE_MISMATCH', 'A released finished-good deviation must use its linked finished-good lot as the rework source.', 409)
      }
      const priorForDeviation = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM v2_production_rework_records
        WHERE organization_id = ${context.organizationId} AND deviation_id = ${input.deviationId}
        LIMIT 1 FOR UPDATE
      `
      if (priorForDeviation[0]) throw new PlatformError('PRODUCTION_REWORK_DEVIATION_ALREADY_USED', 'This deviation already has a controlled rework record. Create a new deviation for another rework attempt.', 409)
      const activeRework = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM v2_production_rework_records
        WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND status IN ('PLANNED', 'IN_PROGRESS')
        LIMIT 1 FOR UPDATE
      `
      if (activeRework[0]) throw new PlatformError('PRODUCTION_REWORK_ALREADY_ACTIVE', 'Complete or cancel the active rework before opening another controlled rework.', 409)
      const id = identifier('prodrework')
      const sequenceRows = await tx.$queryRaw<Array<{ sequence: number }>>`
        SELECT sequence_number AS sequence
        FROM v2_production_process_steps
        WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId}
        ORDER BY sequence_number DESC LIMIT 1 FOR UPDATE
      `
      await tx.$executeRaw`
        INSERT INTO v2_production_rework_records (id, organization_id, production_order_id, deviation_id, source_finished_good_lot_id, quantity_g, target_stage, status, reason, created_by)
        VALUES (${id}, ${context.organizationId}, ${orderId}, ${input.deviationId}, ${input.sourceFinishedGoodLotId ?? null}, ${input.quantityGrams}, ${input.targetStage}, 'PLANNED', ${input.reason}, ${context.userId})
      `
      const targetIndex = REWORK_STAGE_SEQUENCE.indexOf(input.targetStage)
      const reworkStages = REWORK_STAGE_SEQUENCE.slice(targetIndex)
      const processStepIds: Array<{ id: string; stage: ProductionStageKind }> = []
      for (const [offset, reworkStage] of reworkStages.entries()) {
        const processStepId = identifier('prodstep')
        processStepIds.push({ id: processStepId, stage: reworkStage })
        await tx.$executeRaw`
          INSERT INTO v2_production_process_steps (id, organization_id, production_order_id, stage, sequence_number, status, planned_parameters, notes)
          VALUES (${processStepId}, ${context.organizationId}, ${orderId}, ${reworkStage}, ${(sequenceRows[0]?.sequence ?? 0) + offset + 1}, 'NOT_STARTED',
                  ${JSON.stringify({ reworkId: id, deviationId: input.deviationId, sourceKind: input.sourceKind, quantityGrams: input.quantityGrams, reworkStage })}::jsonb, ${input.reason})
        `
      }
      if (input.sourceKind === 'FINISHED_GOOD_LOT') {
        const lot = await this.finishedGoodLot(tx, context, input.sourceFinishedGoodLotId!, true)
        if (lot.productionOrderId !== orderId || lot.status !== 'HOLD') throw new PlatformError('PRODUCTION_REWORK_LOT_INVALID', 'The selected finished-good lot must remain in the controlled quality-hold state before it can be reworked.', 409)
        const heldQuantityGrams = await this.finishedGoodBucketBalance(tx, context, lot.id, 'HOLD')
        if (Math.abs(heldQuantityGrams - input.quantityGrams) > EPSILON) throw new PlatformError('PRODUCTION_REWORK_QUANTITY_INVALID', 'Finished-good rework must consume the complete held lot balance; split the lot through an authorized future fulfillment workflow before partial rework.', 409)
        await this.moveFinishedGood(tx, context, {
          orderId,
          lotId: lot.id,
          movementType: 'REWORK_CONSUMPTION',
          quantityGrams: input.quantityGrams,
          fromBucket: 'HOLD',
          toBucket: 'REWORK',
          referenceType: 'PRODUCTION_REWORK',
          referenceId: id,
          idempotencyScope: 'fg_rework',
        })
        await tx.$executeRaw`UPDATE v2_finished_good_lots SET status = 'REWORK', updated_at = now() WHERE id = ${lot.id} AND organization_id = ${context.organizationId}`
        await this.genealogy(tx, context, orderId, 'FINISHED_GOOD_LOT', lot.id, 'REWORK_RECORD', id, 'REWORKS', { quantityGrams: input.quantityGrams })
      } else {
        const yields = await tx.$queryRaw<Array<{ available: Prisma.Decimal }>>`
          SELECT COALESCE(filled_output_g, bulk_output_g) AS available
          FROM v2_production_yield_records
          WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND status IN ('RECORDED', 'RECONCILED')
          ORDER BY revision DESC LIMIT 1
        `
        const controlledLimit = yields[0] ? asNumber(yields[0].available) : asNumber(order.targetBulkGrams)
        if (input.quantityGrams > controlledLimit + EPSILON) throw new PlatformError('PRODUCTION_REWORK_QUANTITY_INVALID', 'The in-process rework quantity exceeds the controlled batch quantity.', 409)
      }
      const invalidatedQc = await tx.$executeRaw`
        UPDATE v2_production_qc_results
        SET result_status = 'INVALIDATED', approved_by = ${context.userId}, approved_at = now(), updated_at = now()
        WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND result_status <> 'INVALIDATED'
      `
      const latestYieldRows = await tx.$queryRaw<Array<{
        revision: number; inputConsumedGrams: Prisma.Decimal; bulkOutputGrams: Prisma.Decimal; filledOutputGrams: Prisma.Decimal | null
        wasteGrams: Prisma.Decimal; reworkGrams: Prisma.Decimal; expectedLossGrams: Prisma.Decimal; reconciliationDeltaGrams: Prisma.Decimal
      }>>`
        SELECT revision, input_consumed_g AS "inputConsumedGrams", bulk_output_g AS "bulkOutputGrams", filled_output_g AS "filledOutputGrams",
               waste_g AS "wasteGrams", rework_g AS "reworkGrams", expected_loss_g AS "expectedLossGrams", reconciliation_delta_g AS "reconciliationDeltaGrams"
        FROM v2_production_yield_records
        WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId}
        ORDER BY revision DESC LIMIT 1 FOR UPDATE
      `
      const latestYield = latestYieldRows[0]
      let yieldReviewRecordId: string | null = null
      if (latestYield) {
        yieldReviewRecordId = identifier('prodyield')
        await tx.$executeRaw`
          INSERT INTO v2_production_yield_records (id, organization_id, production_order_id, revision, input_consumed_g, bulk_output_g, filled_output_g, waste_g, rework_g, expected_loss_g, reconciliation_delta_g, status, rationale, recorded_by, recorded_at)
          VALUES (${yieldReviewRecordId}, ${context.organizationId}, ${orderId}, ${latestYield.revision + 1}, ${latestYield.inputConsumedGrams}, ${latestYield.bulkOutputGrams}, ${latestYield.filledOutputGrams},
                  ${latestYield.wasteGrams}, ${latestYield.reworkGrams}, ${latestYield.expectedLossGrams}, ${latestYield.reconciliationDeltaGrams}, 'REVIEW_REQUIRED',
                  ${`Controlled rework ${id} requires a new yield reconciliation before release.`}, ${context.userId}, now())
        `
        await this.genealogy(tx, context, orderId, 'PRODUCTION_ORDER', orderId, 'YIELD_RECORD', yieldReviewRecordId, 'YIELDED', { reason: 'REWORK_RECONCILIATION_REQUIRED', reworkId: id })
      }
      if (order.status !== 'REWORK') await this.transition(tx, context, order, 'REWORK')
      await this.genealogy(tx, context, orderId, 'DEVIATION', input.deviationId, 'REWORK_RECORD', id, 'REWORKS', { targetStage: input.targetStage, quantityGrams: input.quantityGrams })
      await this.genealogy(tx, context, orderId, 'PRODUCTION_ORDER', orderId, 'REWORK_RECORD', id, 'REWORKS', { deviationId: input.deviationId, targetStage: input.targetStage, quantityGrams: input.quantityGrams })
      for (const processStep of processStepIds) {
        await this.genealogy(tx, context, orderId, 'REWORK_RECORD', id, 'PROCESS_STEP', processStep.id, 'PROCESSED_BY', { targetStage: input.targetStage, reworkStage: processStep.stage })
      }
      await this.audit(tx, context, 'production.rework.qc.invalidate', 'allowed', 'production_order', orderId, { reworkId: id, invalidatedQcCount: invalidatedQc, yieldReviewRecordId })
      await this.audit(tx, context, 'production.rework.create', 'allowed', 'production_order', orderId, { reworkId: id, deviationId: input.deviationId, targetStage: input.targetStage, reworkStages })
      return { id, deviationId: input.deviationId, status: 'PLANNED', targetStage: input.targetStage, reworkStages, qcRevalidationRequired: true, yieldReconciliationRequired: Boolean(latestYield) }
    })
  }

  async completeRework(context: PlatformContext, orderId: string, reworkId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.process')
    const input = validated(productionProcessStageCompleteRequestSchema, rawInput)
    return this.idempotent(context, 'production.rework.complete', idempotencyKey, { orderId, reworkId, input }, async (tx) => {
      const order = await this.order(tx, context, orderId, true)
      const records = await tx.$queryRaw<Array<{ id: string; targetStage: string; status: string }>>`
        SELECT id, target_stage AS "targetStage", status FROM v2_production_rework_records WHERE id = ${reworkId} AND production_order_id = ${orderId} AND organization_id = ${context.organizationId} FOR UPDATE
      `
      const rework = records[0]
      if (!rework || rework.status !== 'IN_PROGRESS') throw new PlatformError('PRODUCTION_REWORK_NOT_ACTIVE', 'This rework record is not active.', 409)
      const steps = await tx.$queryRaw<Array<{ id: string; stage: string; status: string }>>`
        SELECT id, stage, status FROM v2_production_process_steps
        WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId}
          AND planned_parameters ->> 'reworkId' = ${reworkId}
        ORDER BY sequence_number ASC FOR UPDATE
      `
      if (!steps.length || steps.some((step) => step.status !== 'COMPLETED')) {
        throw new PlatformError('PRODUCTION_REWORK_STAGE_INCOMPLETE', 'Complete every controlled process stage generated for this rework before closing it.', 409)
      }
      if (order.status !== 'QC') throw new PlatformError('PRODUCTION_REWORK_QC_REQUIRED', 'Controlled rework can close only after the regenerated process sequence returns to QC.', 409)
      await tx.$executeRaw`UPDATE v2_production_rework_records SET status = 'COMPLETED', completed_by = ${context.userId}, completed_at = ${input.completedAt ? new Date(input.completedAt) : new Date()} WHERE id = ${reworkId} AND organization_id = ${context.organizationId}`
      await this.audit(tx, context, 'production.rework.complete', 'allowed', 'production_rework', reworkId, { orderId, stages: steps.map((step) => step.stage), qcRevalidationRequired: true, yieldReconciliationRequired: true })
      return { id: reworkId, status: 'COMPLETED', targetStage: rework.targetStage, stages: steps.map((step) => step.stage), orderStatus: order.status, nextAction: 'Record a new reconciled yield and fresh QC results before requesting another release.' }
    })
  }

  async placeOnHold(context: PlatformContext, orderId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.deviation.manage')
    const input = validated(productionQcApprovalRequestSchema, rawInput)
    if (input.decision !== 'HOLD') throw new PlatformError('PRODUCTION_HOLD_REQUEST_INVALID', 'A hold request must use the HOLD decision.', 422)
    return this.idempotent(context, 'production.orders.hold', idempotencyKey, { orderId, input }, async (tx) => {
      const order = await this.order(tx, context, orderId, true)
      if (order.status === 'RELEASED') {
        throw new PlatformError('PRODUCTION_HOLD_FINISHED_GOOD_WORKFLOW_REQUIRED', 'Use the finished-good quality-hold workflow for a released batch so availability is moved through the immutable finished-good ledger.', 409)
      }
      if (order.status !== 'HOLD') await this.transition(tx, context, order, 'HOLD', { holdReason: input.rationale })
      await this.audit(tx, context, 'production.order.hold', 'allowed', 'production_order', orderId, { rationale: input.rationale })
      return { id: orderId, status: 'HOLD', holdReason: input.rationale }
    })
  }

  async resumeFromHold(context: PlatformContext, orderId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.deviation.manage')
    const target = typeof rawInput === 'object' && rawInput && typeof (rawInput as JsonRecord).targetStatus === 'string' ? String((rawInput as JsonRecord).targetStatus).toUpperCase() : ''
    if (!isProductionOrderStatus(target) || !['READY_FOR_WEIGHING', 'WEIGHING', 'COMPOUNDING', 'CONDITIONING', 'FILTRATION', 'FILLING', 'QC', 'REWORK'].includes(target)) throw new PlatformError('PRODUCTION_HOLD_RESUME_INVALID', 'Choose a valid controlled production state to resume.', 422)
    return this.idempotent(context, 'production.orders.resume', idempotencyKey, { orderId, target }, async (tx) => {
      const order = await this.order(tx, context, orderId, true)
      if (order.status !== 'HOLD') throw new PlatformError('PRODUCTION_NOT_ON_HOLD', 'Only a held Production Order can be resumed.', 409)
      const open = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_production_deviations WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND status NOT IN ('CLOSED','VOIDED') LIMIT 1`
      if (open[0]) throw new PlatformError('PRODUCTION_DEVIATION_OPEN', 'Resolve every blocking deviation before resuming production.', 409)
      if (target === 'READY_FOR_WEIGHING') {
        const usages = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM v2_production_material_usages
          WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND status = 'COMMITTED'
          LIMIT 1
        `
        if (usages[0]) throw new PlatformError('PRODUCTION_WEIGHING_RESTART_BLOCKED', 'A held batch may only restart weighing after every raw-material usage has been corrected through a compensating reversal.', 409)
        const corrected = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT pws.id FROM v2_production_weighing_sessions pws
          WHERE pws.production_order_id = ${orderId} AND pws.organization_id = ${context.organizationId} AND pws.status = 'CORRECTED'
            AND NOT EXISTS (
              SELECT 1 FROM v2_production_material_usages u
              WHERE u.weighing_session_id = pws.id AND u.organization_id = pws.organization_id AND u.status <> 'REVERSED'
            )
          LIMIT 1
        `
        if (!corrected[0]) throw new PlatformError('PRODUCTION_WEIGHING_CORRECTION_INCOMPLETE', 'A fresh weighing session requires a fully corrected prior weighing session.', 409)
        const started = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM v2_production_process_steps
          WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND status <> 'NOT_STARTED'
          LIMIT 1
        `
        if (started[0]) throw new PlatformError('PRODUCTION_WEIGHING_RESTART_TOO_LATE', 'A fresh weighing session is unavailable after a downstream production stage has started. Record controlled rework instead.', 409)
      }
      if (target === 'WEIGHING') {
        const sessions = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM v2_production_weighing_sessions
          WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND status = 'IN_PROGRESS'
          LIMIT 1
        `
        if (!sessions[0]) throw new PlatformError('PRODUCTION_WEIGHING_SESSION_NOT_ACTIVE', 'Only an interrupted active weighing session may resume weighing.', 409)
      }
      if (['COMPOUNDING', 'CONDITIONING', 'FILTRATION', 'FILLING'].includes(target)) {
        const steps = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM v2_production_process_steps
          WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND stage = ${target}
            AND status IN ('NOT_STARTED', 'IN_PROGRESS')
          ORDER BY sequence_number DESC LIMIT 1
        `
        if (!steps[0]) throw new PlatformError('PRODUCTION_HOLD_RESUME_STAGE_INVALID', 'The requested process stage is not an interrupted controlled stage for this Production Order.', 409)
      }
      if (target === 'QC') {
        const incomplete = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM v2_production_process_steps
          WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId}
            AND stage IN ('COMPOUNDING', 'CONDITIONING', 'FILTRATION', 'FILLING') AND status <> 'COMPLETED'
          LIMIT 1
        `
        if (incomplete[0]) throw new PlatformError('PRODUCTION_HOLD_RESUME_STAGE_INVALID', 'Every required process stage must be completed before QC can resume.', 409)
      }
      if (target === 'REWORK') {
        const rework = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM v2_production_rework_records
          WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} AND status IN ('PLANNED', 'IN_PROGRESS')
          LIMIT 1
        `
        if (!rework[0]) throw new PlatformError('PRODUCTION_REWORK_NOT_ACTIVE', 'A held Production Order can return to rework only when a controlled rework record is active.', 409)
      }
      await this.transition(tx, context, order, target as ProductionOrderStatus, { holdReason: null })
      await this.audit(tx, context, 'production.order.resume', 'allowed', 'production_order', orderId, { target })
      return { id: orderId, status: target }
    })
  }

  async releaseOrder(context: PlatformContext, orderId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.release')
    await this.require(context, 'production.qc.approve')
    const input = validated(productionReleaseRequestSchema, rawInput)
    return this.idempotent(context, 'production.orders.release', idempotencyKey, { orderId, input }, async (tx) => {
      const order = await this.order(tx, context, orderId, true)
      if (order.status !== 'QC') throw new PlatformError('PRODUCTION_RELEASE_STATE_INVALID', 'A Production Order may only be released from QC review.', 409)
      if (!input.documentSnapshotIds.length) throw new PlatformError('PRODUCTION_RELEASE_DOCUMENTATION_REQUIRED', 'Attach at least one active controlled document before requesting production release.', 422)
      await this.assertDocuments(tx, context, orderId, input.documentSnapshotIds)
      const gate = await this.releaseGate(tx, context, order, input.documentSnapshotIds)
      if (!gate.passed) {
        await this.audit(tx, context, 'production.order.release', 'blocked', 'production_order', orderId, gate)
        throw new PlatformError('PRODUCTION_RELEASE_GATE_BLOCKED', 'Production release is blocked until QC, traceability, deviations, and yield reconciliation are complete.', 409)
      }
      const snapshot = await this.currentSnapshot(tx, context, orderId)
      const priorReleases = await tx.$queryRaw<Array<{ id: string; revision: number }>>`
        SELECT id, revision
        FROM v2_production_releases
        WHERE organization_id = ${context.organizationId} AND production_order_id = ${orderId}
        ORDER BY revision DESC
        LIMIT 1
        FOR UPDATE
      `
      const priorRelease = priorReleases[0] ?? null
      const releaseRevision = (priorRelease?.revision ?? 0) + 1
      const releaseId = identifier('prodrel')
      const finishedGoodLotId = identifier('fglot')
      const quantityGrams = gate.finishedQuantityGrams
      const gateSnapshot = {
        schemaVersion: '1.1',
        ...gate,
        formulaSnapshotId: snapshot.id,
        formulaContentHash: snapshot.formulaContentHash,
        releaseRevision,
        supersedesReleaseId: priorRelease?.id ?? null,
        releasedAt: new Date().toISOString(),
      }
      await tx.$executeRaw`
        INSERT INTO v2_production_releases (id, organization_id, production_order_id, revision, supersedes_release_id, status, gate_snapshot, gate_checksum, rationale, released_by, released_at)
        VALUES (${releaseId}, ${context.organizationId}, ${orderId}, ${releaseRevision}, ${priorRelease?.id ?? null}, 'RELEASED', ${JSON.stringify(gateSnapshot)}::jsonb, ${digest(gateSnapshot)}, ${input.rationale}, ${context.userId}, now())
      `
      await tx.$executeRaw`
        INSERT INTO v2_finished_good_lots (id, organization_id, production_order_id, production_release_id, formula_version_id, formula_snapshot_id, lot_number, initial_quantity_g, location, status, manufactured_at, expires_at, released_by, released_at)
        VALUES (${finishedGoodLotId}, ${context.organizationId}, ${orderId}, ${releaseId}, ${order.formulaVersionId}, ${snapshot.id}, ${input.finishedGoodLotNumber}, ${quantityGrams}, ${input.location}, 'RELEASED',
                ${input.manufacturedAt ? new Date(input.manufacturedAt) : new Date()}, ${input.expiresAt ? new Date(input.expiresAt) : null}, ${context.userId}, now())
      `
      const outputEntryId = identifier('fgle')
      const releaseEntryId = identifier('fgle')
      const outputKey = childIdempotencyKey('fg_output', { orderId, releaseId, finishedGoodLotId })
      const qualityKey = childIdempotencyKey('fg_quality_release', { orderId, releaseId, finishedGoodLotId })
      await tx.$executeRaw`
        INSERT INTO v2_finished_good_ledger_entries (id, organization_id, finished_good_lot_id, production_order_id, movement_type, quantity_g, from_bucket, to_bucket, reference_type, reference_id, idempotency_key, actor_user_id)
        VALUES (${outputEntryId}, ${context.organizationId}, ${finishedGoodLotId}, ${orderId}, 'PRODUCTION_OUTPUT', ${quantityGrams}, NULL, 'QUARANTINE', 'PRODUCTION_RELEASE', ${releaseId}, ${outputKey}, ${context.userId})
      `
      await tx.$executeRaw`
        INSERT INTO v2_finished_good_ledger_entries (id, organization_id, finished_good_lot_id, production_order_id, movement_type, quantity_g, from_bucket, to_bucket, reference_type, reference_id, idempotency_key, actor_user_id)
        VALUES (${releaseEntryId}, ${context.organizationId}, ${finishedGoodLotId}, ${orderId}, 'QUALITY_RELEASE', ${quantityGrams}, 'QUARANTINE', 'AVAILABLE', 'PRODUCTION_RELEASE', ${releaseId}, ${qualityKey}, ${context.userId})
      `
      await this.transition(tx, context, order, 'RELEASED', { released: true })
      await this.genealogy(tx, context, orderId, 'PRODUCTION_ORDER', orderId, 'RELEASE', releaseId, 'RELEASED_AS', { gateChecksum: digest(gateSnapshot) })
      await this.genealogy(tx, context, orderId, 'RELEASE', releaseId, 'FINISHED_GOOD_LOT', finishedGoodLotId, 'RELEASED_AS', { quantityGrams })
      await this.genealogy(tx, context, orderId, 'FINISHED_GOOD_LOT', finishedGoodLotId, 'FINISHED_GOOD_LEDGER_ENTRY', outputEntryId, 'MOVES_FINISHED_GOOD', { toBucket: 'QUARANTINE', quantityGrams })
      await this.genealogy(tx, context, orderId, 'FINISHED_GOOD_LOT', finishedGoodLotId, 'FINISHED_GOOD_LEDGER_ENTRY', releaseEntryId, 'MOVES_FINISHED_GOOD', { toBucket: 'AVAILABLE', quantityGrams })
      await this.captureGeneratedReleaseDocuments(tx, context, orderId, releaseId, gateSnapshot)
      await this.audit(tx, context, 'production.order.release', 'allowed', 'production_order', orderId, { releaseId, releaseRevision, supersedesReleaseId: priorRelease?.id ?? null, finishedGoodLotId, quantityGrams })
      return { id: releaseId, status: 'RELEASED', revision: releaseRevision, supersedesReleaseId: priorRelease?.id ?? null, finishedGoodLot: { id: finishedGoodLotId, lotNumber: input.finishedGoodLotNumber, quantityGrams, status: 'RELEASED' } }
    })
  }

  async documents(context: PlatformContext, orderId: string) {
    await this.require(context, 'production.documents.view')
    return this.scoped(context, async (tx) => {
      await this.order(tx, context, orderId)
      const rows = await tx.$queryRaw<Array<{ id: string; documentKind: string; objectRef: string; contentHash: string; versionLabel: string | null; metadata: JsonRecord; status: string; capturedAt: Date }>>`
        SELECT id, document_kind AS "documentKind", object_ref AS "objectRef", content_hash AS "contentHash", version_label AS "versionLabel", metadata, status, captured_at AS "capturedAt"
        FROM v2_production_document_snapshots WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} ORDER BY captured_at DESC
      `
      return rows.map((row) => ({ ...row, capturedAt: row.capturedAt.toISOString() }))
    })
  }

  async createDocumentSnapshot(context: PlatformContext, orderId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.documents.manage')
    const input = validated(productionDocumentSnapshotCreateRequestSchema, rawInput)
    return this.idempotent(context, 'production.documents.create', idempotencyKey, { orderId, input }, async (tx) => {
      await this.order(tx, context, orderId, true)
      const existing = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM v2_production_document_snapshots WHERE production_order_id = ${orderId} AND document_kind = ${input.documentKind} AND object_ref = ${input.objectRef} AND content_hash = ${input.contentHash} AND organization_id = ${context.organizationId}
      `
      if (existing[0]) return { id: existing[0].id, status: 'ACTIVE', reused: true }
      const id = identifier('proddoc')
      await tx.$executeRaw`
        INSERT INTO v2_production_document_snapshots (id, organization_id, production_order_id, document_kind, object_ref, content_hash, version_label, metadata, status, captured_by)
        VALUES (${id}, ${context.organizationId}, ${orderId}, ${input.documentKind}, ${input.objectRef}, ${input.contentHash}, ${input.versionLabel ?? null}, ${JSON.stringify(input.metadata)}::jsonb, 'ACTIVE', ${context.userId})
      `
      await this.genealogy(tx, context, orderId, 'PRODUCTION_ORDER', orderId, 'DOCUMENT_SNAPSHOT', id, 'DOCUMENTED_BY', { documentKind: input.documentKind, contentHash: input.contentHash })
      await this.audit(tx, context, 'production.document.snapshot.create', 'allowed', 'production_order', orderId, { documentSnapshotId: id, documentKind: input.documentKind })
      return { id, status: 'ACTIVE' }
    })
  }

  async finishedGoodGenealogy(context: PlatformContext, finishedGoodLotId: string) {
    await this.require(context, 'production.finishedGoods.view')
    await this.require(context, 'production.documents.view')
    return this.scoped(context, async (tx) => {
      const lots = await tx.$queryRaw<Array<{ id: string; productionOrderId: string; lotNumber: string; status: string; initialQuantityGrams: Prisma.Decimal; location: string; releasedAt: Date | null }>>`
        SELECT id, production_order_id AS "productionOrderId", lot_number AS "lotNumber", status, initial_quantity_g AS "initialQuantityGrams", location, released_at AS "releasedAt"
        FROM v2_finished_good_lots WHERE id = ${finishedGoodLotId} AND organization_id = ${context.organizationId}
      `
      const lot = lots[0]
      if (!lot) throw new PlatformError('FINISHED_GOOD_LOT_NOT_FOUND', 'The requested finished-good lot is not available in this workspace.', 404)
      const [edges, usages, documents] = await Promise.all([
        tx.$queryRaw<Array<{ id: string; fromEntityType: string; fromEntityId: string; toEntityType: string; toEntityId: string; edgeType: string; evidenceSnapshot: JsonRecord; createdAt: Date }>>`
          SELECT id, from_entity_type AS "fromEntityType", from_entity_id AS "fromEntityId", to_entity_type AS "toEntityType", to_entity_id AS "toEntityId", edge_type AS "edgeType", evidence_snapshot AS "evidenceSnapshot", created_at AS "createdAt"
          FROM v2_production_genealogy_edges WHERE production_order_id = ${lot.productionOrderId} AND organization_id = ${context.organizationId} ORDER BY created_at ASC
        `,
        tx.$queryRaw<Array<{ usageId: string; materialId: string; materialName: string; lotId: string; supplierLot: string | null; actualQuantityGrams: Prisma.Decimal; inventoryMovementId: string }>>`
          SELECT u.id AS "usageId", u.material_id AS "materialId", m.name AS "materialName", u.lot_id AS "lotId", l.supplier_lot AS "supplierLot", u.actual_quantity_g AS "actualQuantityGrams", u.inventory_movement_id AS "inventoryMovementId"
          FROM v2_production_material_usages u JOIN v2_materials m ON m.id = u.material_id AND m.organization_id = u.organization_id
          JOIN v2_inventory_lots l ON l.id = u.lot_id AND l.organization_id = u.organization_id
          WHERE u.production_order_id = ${lot.productionOrderId} AND u.organization_id = ${context.organizationId} ORDER BY u.created_at ASC
        `,
        tx.$queryRaw<Array<{ id: string; documentKind: string; objectRef: string; contentHash: string; capturedAt: Date }>>`
          SELECT id, document_kind AS "documentKind", object_ref AS "objectRef", content_hash AS "contentHash", captured_at AS "capturedAt"
          FROM v2_production_document_snapshots WHERE production_order_id = ${lot.productionOrderId} AND organization_id = ${context.organizationId} AND status = 'ACTIVE' ORDER BY captured_at ASC
        `,
      ])
      return {
        finishedGoodLot: { id: lot.id, lotNumber: lot.lotNumber, status: lot.status, initialQuantityGrams: asNumber(lot.initialQuantityGrams), location: lot.location, releasedAt: iso(lot.releasedAt) },
        rawMaterialUsages: usages.map((item) => ({ ...item, actualQuantityGrams: asNumber(item.actualQuantityGrams) })),
        edges: edges.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
        documents: documents.map((item) => ({ ...item, capturedAt: item.capturedAt.toISOString() })),
      }
    })
  }

  async listFinishedGoodLots(context: PlatformContext) {
    await this.require(context, 'production.finishedGoods.view')
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: string; productionOrderId: string; orderNumber: string; lotNumber: string; initialQuantityGrams: Prisma.Decimal
        location: string; status: string; manufacturedAt: Date; expiresAt: Date | null; releasedAt: Date | null
      }>>`
        SELECT l.id, l.production_order_id AS "productionOrderId", o.order_number AS "orderNumber", l.lot_number AS "lotNumber",
               l.initial_quantity_g AS "initialQuantityGrams", l.location, l.status, l.manufactured_at AS "manufacturedAt",
               l.expires_at AS "expiresAt", l.released_at AS "releasedAt"
        FROM v2_finished_good_lots l
        JOIN v2_production_orders o ON o.id = l.production_order_id AND o.organization_id = l.organization_id
        WHERE l.organization_id = ${context.organizationId}
        ORDER BY l.manufactured_at DESC, l.id DESC
      `
      return rows.map((row) => ({
        ...row,
        initialQuantityGrams: asNumber(row.initialQuantityGrams),
        manufacturedAt: row.manufacturedAt.toISOString(),
        expiresAt: iso(row.expiresAt),
        releasedAt: iso(row.releasedAt),
      }))
    })
  }

  /**
   * A released finished-good lot cannot be placed on an order-only hold. This
   * path locks the lot, moves its entire available balance to HOLD through the
   * dedicated finished-good ledger, and opens a documented QC deviation in the
   * same transaction. It intentionally has no caller-controlled quantity.
   */
  async holdFinishedGoodLot(context: PlatformContext, finishedGoodLotId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context, 'production.deviation.manage')
    await this.require(context, 'production.qc.approve')
    await this.require(context, 'production.finishedGoods.view')
    await this.require(context, 'production.documents.view')
    const input = validated(productionFinishedGoodQualityHoldRequestSchema, rawInput)
    if (!input.evidenceDocumentSnapshotIds.length) {
      throw new PlatformError('PRODUCTION_FINISHED_GOOD_HOLD_EVIDENCE_REQUIRED', 'Attach at least one active controlled document before placing a released finished-good lot on quality hold.', 422)
    }
    return this.idempotent(context, 'production.finished_goods.quality_hold', idempotencyKey, { finishedGoodLotId, input }, async (tx) => {
      const lot = await this.finishedGoodLot(tx, context, finishedGoodLotId, true)
      const order = await this.order(tx, context, lot.productionOrderId, true)
      if (lot.status !== 'RELEASED' || order.status !== 'RELEASED') {
        throw new PlatformError('PRODUCTION_FINISHED_GOOD_HOLD_STATE_INVALID', 'Only a currently released finished-good lot from a released Production Order can enter controlled quality hold.', 409)
      }
      await this.assertDocuments(tx, context, order.id, input.evidenceDocumentSnapshotIds)
      const availableQuantityGrams = await this.finishedGoodBucketBalance(tx, context, lot.id, 'AVAILABLE')
      const nonAvailableBucketBalances = await Promise.all(
        (['QUARANTINE', 'HOLD', 'REWORK', 'RESERVED'] as const).map(async (bucket) => ({
          bucket,
          quantityGrams: await this.finishedGoodBucketBalance(tx, context, lot.id, bucket),
        })),
      )
      if (availableQuantityGrams <= EPSILON) {
        throw new PlatformError('PRODUCTION_FINISHED_GOOD_HOLD_EMPTY', 'The released finished-good lot has no available quantity that can be placed on quality hold.', 409)
      }
      if (
        Math.abs(availableQuantityGrams - asNumber(lot.initialQuantityGrams)) > EPSILON
        || nonAvailableBucketBalances.some((balance) => balance.quantityGrams > EPSILON)
      ) {
        throw new PlatformError('PRODUCTION_FINISHED_GOOD_HOLD_PARTIAL_LOT', 'A controlled quality hold must cover the complete released lot. Resolve any reservation, fulfillment, adjustment, or other non-available balance through its owning workflow first.', 409)
      }
      const deviationId = identifier('proddev')
      await tx.$executeRaw`
        INSERT INTO v2_production_deviations (id, organization_id, production_order_id, finished_good_lot_id, category, severity, status, description, immediate_action, detected_by, detected_at)
        VALUES (${deviationId}, ${context.organizationId}, ${order.id}, ${lot.id}, 'QC', 'HIGH', 'OPEN',
                ${`Released finished-good lot ${lot.lotNumber} was placed on controlled quality hold.`}, ${input.rationale}, ${context.userId}, now())
      `
      await this.linkDeviationEvidence(tx, context, order.id, deviationId, input.evidenceDocumentSnapshotIds)
      const ledgerEntryId = await this.moveFinishedGood(tx, context, {
        orderId: order.id,
        lotId: lot.id,
        movementType: 'QUALITY_HOLD',
        quantityGrams: availableQuantityGrams,
        fromBucket: 'AVAILABLE',
        toBucket: 'HOLD',
        referenceType: 'PRODUCTION_FINISHED_GOOD_QUALITY_HOLD',
        referenceId: deviationId,
        idempotencyScope: 'fg_quality_hold',
      })
      await tx.$executeRaw`UPDATE v2_finished_good_lots SET status = 'HOLD', updated_at = now() WHERE id = ${lot.id} AND organization_id = ${context.organizationId}`
      await this.transition(tx, context, order, 'HOLD', { holdReason: input.rationale })
      await this.genealogy(tx, context, order.id, 'FINISHED_GOOD_LOT', lot.id, 'DEVIATION', deviationId, 'HAS_DEVIATION', {
        kind: 'POST_RELEASE_QUALITY_HOLD',
        heldQuantityGrams: availableQuantityGrams,
        ledgerEntryId,
      })
      await this.audit(tx, context, 'production.finished_good.quality_hold', 'allowed', 'finished_good_lot', lot.id, {
        orderId: order.id,
        deviationId,
        heldQuantityGrams: availableQuantityGrams,
        evidenceDocumentSnapshotIds: input.evidenceDocumentSnapshotIds,
      })
      return {
        id: lot.id,
        status: 'HOLD',
        heldQuantityGrams: availableQuantityGrams,
        productionOrderId: order.id,
        deviationId,
        ledgerEntryId,
        evidenceDocumentSnapshotIds: input.evidenceDocumentSnapshotIds,
      }
    })
  }

  private async assertDocuments(tx: Transaction, context: PlatformContext, orderId: string, documentIds: readonly string[]) {
    if (!documentIds.length) return
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM v2_production_document_snapshots WHERE organization_id = ${context.organizationId} AND production_order_id = ${orderId} AND status = 'ACTIVE' AND id IN (${Prisma.join([...documentIds])})
    `
    if (rows.length !== documentIds.length) throw new PlatformError('PRODUCTION_DOCUMENT_NOT_FOUND', 'One or more document snapshots are unavailable for this Production Order.', 404)
  }

  private async linkDeviationEvidence(tx: Transaction, context: PlatformContext, orderId: string, deviationId: string, documentIds: readonly string[]) {
    await this.assertDocuments(tx, context, orderId, documentIds)
    for (const documentId of documentIds) {
      await tx.$executeRaw`
        INSERT INTO v2_production_deviation_evidence (id, organization_id, deviation_id, document_snapshot_id, linked_by)
        VALUES (${identifier('proddevev')}, ${context.organizationId}, ${deviationId}, ${documentId}, ${context.userId})
        ON CONFLICT (organization_id, deviation_id, document_snapshot_id) DO NOTHING
      `
      await this.genealogy(tx, context, orderId, 'DEVIATION', deviationId, 'DOCUMENT_SNAPSHOT', documentId, 'DOCUMENTED_BY', { relation: 'DEVIATION_EVIDENCE' })
    }
  }

  private async assertQcSpecification(tx: Transaction, context: PlatformContext, specificationId: string, formulaVersionId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string; formulaVersionId: string | null; specification: JsonRecord; status: string }>>`
      SELECT id, formula_version_id AS "formulaVersionId", specification, status FROM v2_production_qc_specifications
      WHERE id = ${specificationId} AND organization_id = ${context.organizationId}
    `
    const specification = rows[0]
    if (!specification || specification.status !== 'ACTIVE') throw new PlatformError('PRODUCTION_QC_SPECIFICATION_NOT_ACTIVE', 'The requested QC specification is not active in this workspace.', 409)
    if (specification.formulaVersionId && specification.formulaVersionId !== formulaVersionId) throw new PlatformError('PRODUCTION_QC_SPEC_FORMULA_MISMATCH', 'The QC specification is not compatible with the Production Order Formula Version.', 409)
    return specification
  }

  private evaluateQcCheck(check: JsonRecord, observedValue: unknown, notApplicableReason?: string) {
    if (notApplicableReason) return { status: 'NOT_APPLICABLE' as const }
    const kind = String(check.kind ?? '')
    if (kind === 'NUMERIC') {
      if (typeof observedValue !== 'number') throw new PlatformError('PRODUCTION_QC_VALUE_TYPE_INVALID', 'This QC check requires a numeric observed value.', 422)
      return { status: evaluateNumericSpecification(observedValue, typeof check.minimum === 'number' ? check.minimum : null, typeof check.maximum === 'number' ? check.maximum : null) === 'PASS' ? 'PASSED' as const : 'FAILED' as const }
    }
    if (kind === 'TEXT') {
      if (typeof observedValue !== 'string') throw new PlatformError('PRODUCTION_QC_VALUE_TYPE_INVALID', 'This QC check requires a text observed value.', 422)
      const expected = typeof check.expectedText === 'string' ? check.expectedText.trim().toLocaleLowerCase() : null
      return { status: !expected || observedValue.trim().toLocaleLowerCase() === expected ? 'PASSED' as const : 'FAILED' as const }
    }
    if (kind === 'BOOLEAN') {
      if (typeof observedValue !== 'boolean') throw new PlatformError('PRODUCTION_QC_VALUE_TYPE_INVALID', 'This QC check requires a boolean observed value.', 422)
      return { status: observedValue ? 'PASSED' as const : 'FAILED' as const }
    }
    if (kind === 'ENUM') {
      if (typeof observedValue !== 'string') throw new PlatformError('PRODUCTION_QC_VALUE_TYPE_INVALID', 'This QC check requires a controlled text value.', 422)
      const allowed = Array.isArray(check.allowedValues) ? check.allowedValues.filter((value): value is string => typeof value === 'string') : []
      return { status: allowed.includes(observedValue) ? 'PASSED' as const : 'FAILED' as const }
    }
    throw new PlatformError('PRODUCTION_QC_CHECK_INVALID', 'The QC check type is not supported by this runtime.', 409)
  }

  private async deviation(tx: Transaction, context: PlatformContext, orderId: string, deviationId: string, lock = false) {
    const rows = await tx.$queryRaw<Array<{ id: string; status: string; productionOrderId: string; category: string; qcResultId: string | null; finishedGoodLotId: string | null }>>`
      SELECT id, status, production_order_id AS "productionOrderId", category, qc_result_id AS "qcResultId", finished_good_lot_id AS "finishedGoodLotId" FROM v2_production_deviations
      WHERE id = ${deviationId} AND production_order_id = ${orderId} AND organization_id = ${context.organizationId}${lock ? Prisma.sql` FOR UPDATE` : Prisma.empty}
    `
    if (!rows[0]) throw new PlatformError('PRODUCTION_DEVIATION_NOT_FOUND', 'The requested deviation is not available for this Production Order.', 404)
    return rows[0]
  }

  private async assertDeviationReferences(tx: Transaction, context: PlatformContext, orderId: string, input: { requirementId?: string; processStepId?: string; qcResultId?: string; weighingSessionId?: string }) {
    const checks: Array<[string | undefined, string, string]> = [
      [input.requirementId, 'v2_production_material_requirements', 'requirement'],
      [input.processStepId, 'v2_production_process_steps', 'process step'],
      [input.qcResultId, 'v2_production_qc_results', 'QC result'],
      [input.weighingSessionId, 'v2_production_weighing_sessions', 'weighing session'],
    ]
    for (const [id, table, label] of checks) {
      if (!id) continue
      const safeTable = Prisma.raw(table)
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM ${safeTable} WHERE id = ${id} AND production_order_id = ${orderId} AND organization_id = ${context.organizationId}`
      if (!rows[0]) throw new PlatformError('PRODUCTION_DEVIATION_REFERENCE_INVALID', `The selected ${label} is not available for this Production Order.`, 422)
    }
  }

  private async releaseGate(tx: Transaction, context: PlatformContext, order: ProductionOrderRow, releaseDocumentSnapshotIds: readonly string[]) {
    const orderId = order.id
    const [requirements, allocations, processSteps, deviations, capas, yields, qcSpecification, qcResults, reworks] = await Promise.all([
      this.requirements(tx, context, orderId, true),
      this.allocations(tx, context, orderId, true),
      tx.$queryRaw<Array<{ stage: string; status: string }>>`SELECT stage, status FROM v2_production_process_steps WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} FOR UPDATE`,
      tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT id, status FROM v2_production_deviations WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} FOR UPDATE`,
      tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT c.id, c.status FROM v2_production_capa_actions c JOIN v2_production_deviations d ON d.id = c.deviation_id AND d.organization_id = c.organization_id
        WHERE d.production_order_id = ${orderId} AND c.organization_id = ${context.organizationId} FOR UPDATE
      `,
      tx.$queryRaw<Array<{ id: string; bulkOutputGrams: Prisma.Decimal; filledOutputGrams: Prisma.Decimal | null; status: string }>>`
        SELECT id, bulk_output_g AS "bulkOutputGrams", filled_output_g AS "filledOutputGrams", status FROM v2_production_yield_records
        WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} ORDER BY revision DESC LIMIT 1 FOR UPDATE
      `,
      order.qcSpecificationId ? this.assertQcSpecification(tx, context, order.qcSpecificationId, order.formulaVersionId) : Promise.resolve(null),
      tx.$queryRaw<Array<{ checkKey: string; resultStatus: string; revision: number }>>`
        SELECT check_key AS "checkKey", result_status AS "resultStatus", revision
        FROM v2_production_qc_results
        WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId}
        ORDER BY check_key ASC, revision ASC FOR UPDATE
      `,
      tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT id, status FROM v2_production_rework_records WHERE production_order_id = ${orderId} AND organization_id = ${context.organizationId} FOR UPDATE`,
    ])
    const requiredChecks = qcSpecification && Array.isArray(qcSpecification.specification.checks)
      ? (qcSpecification.specification.checks as Array<JsonRecord>).filter((check) => check.required !== false).map((check) => String(check.key))
      : []
    const yieldRecord = yields[0]
    const finishedQuantityGrams = yieldRecord ? asNumber(yieldRecord.filledOutputGrams ?? yieldRecord.bulkOutputGrams) : 0
    const decision = evaluateProductionReleaseGate({
      formulaSnapshotPresent: Boolean(await this.currentSnapshot(tx, context, orderId)),
      requirementStatuses: requirements.map((item) => item.status),
      allocationStatuses: allocations.map((item) => item.status),
      processSteps,
      qcRequiredCheckKeys: qcSpecification ? requiredChecks : [],
      qcResults,
      deviationStatuses: deviations.map((item) => item.status),
      capaStatuses: capas.map((item) => item.status),
      yieldStatus: yieldRecord?.status ?? null,
      reworkStatuses: reworks.map((item) => item.status),
      finishedQuantityGrams,
      releaseDocumentSnapshotIds,
    })
    return {
      ...decision,
      requirementCount: requirements.length, allocationCount: allocations.length, processStepCount: processSteps.length,
      deviationCount: deviations.length, capaCount: capas.length,
    }
  }

  private async captureGeneratedReleaseDocuments(tx: Transaction, context: PlatformContext, orderId: string, releaseId: string, gateSnapshot: JsonRecord) {
    const documents = [
      ['PROCESS_RECORD', `v2://production/${orderId}/batch-manufacturing-record`, { releaseId, gateChecksum: digest(gateSnapshot) }],
      ['RELEASE_EVIDENCE', `v2://production/${orderId}/release/${releaseId}`, { releaseId, gateSnapshot }],
    ] as const
    for (const [documentKind, objectRef, metadata] of documents) {
      const id = identifier('proddoc')
      const contentHash = digest(metadata)
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO v2_production_document_snapshots (id, organization_id, production_order_id, document_kind, object_ref, content_hash, metadata, status, captured_by)
        VALUES (${id}, ${context.organizationId}, ${orderId}, ${documentKind}, ${objectRef}, ${contentHash}, ${JSON.stringify(metadata)}::jsonb, 'ACTIVE', ${context.userId})
        ON CONFLICT (organization_id, production_order_id, document_kind, object_ref, content_hash) DO NOTHING
        RETURNING id
      `
      const documentId = inserted[0]?.id ?? (await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM v2_production_document_snapshots
        WHERE organization_id = ${context.organizationId} AND production_order_id = ${orderId} AND document_kind = ${documentKind}
          AND object_ref = ${objectRef} AND content_hash = ${contentHash}
        LIMIT 1
      `)[0]?.id
      if (documentId) await this.genealogy(tx, context, orderId, 'RELEASE', releaseId, 'DOCUMENT_SNAPSHOT', documentId, 'DOCUMENTED_BY', { documentKind, contentHash })
    }
  }

  private async genealogy(tx: Transaction, context: PlatformContext, orderId: string, fromType: string, fromId: string, toType: string, toId: string, edgeType: string, evidence: JsonRecord) {
    await tx.$executeRaw`
      INSERT INTO v2_production_genealogy_edges (id, organization_id, production_order_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, edge_type, evidence_snapshot, created_by)
      VALUES (${identifier('prodedge')}, ${context.organizationId}, ${orderId}, ${fromType}, ${fromId}, ${toType}, ${toId}, ${edgeType}, ${JSON.stringify(evidence)}::jsonb, ${context.userId})
      ON CONFLICT (organization_id, production_order_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, edge_type) DO NOTHING
    `
  }
}
