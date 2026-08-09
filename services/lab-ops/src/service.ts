import { createHash, randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import type {
  ComplianceFacet,
  MaterialCreateInput,
  SupplierCreateInput,
  SupplierOfferCreateInput,
} from '../../../packages/contracts/src/lab-operations.js'
import { allocateLandedCost, selectFefo } from './ledger.js'
import { PlatformError, PlatformService } from '../../platform/src/service.js'
import type { PlatformContext } from '../../platform/src/types.js'

export type LabOperationsTransaction = Prisma.TransactionClient
type Transaction = LabOperationsTransaction
type JsonRecord = Record<string, unknown>
type IdempotencyRow = { requestHash: string; response: unknown }
type LotRow = {
  id: string; materialId: string; status: string; qualityStatus: string; expiresAt: Date | null; createdAt: Date
  supplierId: string | null; supplierOfferId: string | null; supplierLot: string | null; location: string; landedUnitCost: Prisma.Decimal | null; currency: string | null
}

const EPSILON = 0.000001

export type LabWeighingSessionInput = {
  contextType: 'FORMULA' | 'TRIAL' | 'PRODUCTION' | 'AD_HOC'
  contextId?: string
  lines: Array<{ materialId: string; requestedGrams: number; lotId?: string; reservationId?: string; actualGrams?: number; toleranceGrams: number }>
}

export type LabWeighingSessionRecord = { id: string; contextType: LabWeighingSessionInput['contextType']; contextId: string | null; status: string }
export type LabWeighingCreatedLine = { id: string; materialId: string; requestedGrams: number }
export type LabWeighingConfirmedLine = { lineId: string; materialId: string; lotId: string; actualGrams: number; movementId: string; landedUnitCost: number | null; currency: string | null }

/**
 * Domain modules attach their own immutable lineage inside the same inventory
 * transaction. This avoids a successful consumption without its Trial or
 * Production evidence when a process is interrupted between writes.
 */
export type LabWeighingCreateHook = {
  beforeCreate?: (tx: LabOperationsTransaction, session: Omit<LabWeighingSessionRecord, 'status'>, input: LabWeighingSessionInput) => Promise<void>
  afterCreate?: (tx: LabOperationsTransaction, session: LabWeighingSessionRecord, lines: LabWeighingCreatedLine[]) => Promise<unknown>
}
export type LabWeighingConfirmationHook = {
  beforeConfirm?: (tx: LabOperationsTransaction, session: LabWeighingSessionRecord, lines: Array<{ id: string; materialId: string; requestedGrams: number; toleranceGrams: number }>) => Promise<void>
  afterConfirm?: (tx: LabOperationsTransaction, session: LabWeighingSessionRecord, lines: LabWeighingConfirmedLine[]) => Promise<unknown>
}
export type LabMovementReversalHook = {
  afterReverse?: (tx: LabOperationsTransaction, original: { id: string; lotId: string; materialId: string; movementType: string }, reversal: { id: string; reversalOfId: string }) => Promise<unknown>
}

/**
 * Production chooses lots through its controlled allocation workflow. Lab
 * Operations remains the inventory authority: it validates exact lots and
 * writes both reservations and their zero-quantity ledger evidence in one
 * transaction, while the Production hook writes its linked allocation rows.
 */
export type LabProductionReservationInput = {
  contextType: 'PRODUCTION'
  contextId: string
  lines: Array<{ materialId: string; lotId: string; quantityGrams: number }>
  expiresAt?: string
}
export type LabProductionReservation = { id: string; materialId: string; lotId: string; quantityGrams: number }
export type LabProductionReservationHook = {
  beforeReserve?: (tx: LabOperationsTransaction, input: LabProductionReservationInput) => Promise<void>
  afterReserve?: (tx: LabOperationsTransaction, reservations: LabProductionReservation[]) => Promise<unknown>
}
export type LabProductionReservationReleaseHook = {
  beforeRelease?: (tx: LabOperationsTransaction, reservations: LabProductionReservation[]) => Promise<void>
  afterRelease?: (tx: LabOperationsTransaction, reservations: LabProductionReservation[]) => Promise<unknown>
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as JsonRecord).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value: unknown) { return createHash('sha256').update(stableJson(value)).digest('hex') }
function identifier(prefix: string) { return `${prefix}_${randomUUID().replaceAll('-', '')}` }
function asNumber(value: Prisma.Decimal | number | string | null | undefined) { return Number(value ?? 0) }
function iso(value: Date | null | undefined) { return value?.toISOString() }

/**
 * Phase 2 tenant-owned lab operations. The service never accepts an organization
 * identifier from a browser payload: every query is executed with authenticated RLS context.
 */
export class LabOperationsService {
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

  private async require(context: PlatformContext, permission: string) {
    await this.platform.requirePermission(context, permission)
  }

  private async idempotent<T extends JsonRecord>(context: PlatformContext, route: string, key: string | undefined, request: unknown, action: (tx: Transaction) => Promise<T>) {
    if (!key || key.length < 12 || key.length > 200) throw new PlatformError('IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key for this operation.', 428)
    const requestHash = digest(request)
    return this.scoped(context, async (tx) => {
      const existing = await tx.$queryRaw<IdempotencyRow[]>`
        SELECT request_hash AS "requestHash", response FROM v2_operation_idempotency
        WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}
      `
      if (existing.length) {
        if (existing[0].requestHash !== requestHash) throw new PlatformError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request.', 409)
        if (!existing[0].response) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
        return existing[0].response as T
      }
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO v2_operation_idempotency (id, organization_id, actor_user_id, route, idempotency_key, request_hash)
        VALUES (${identifier('idem')}, ${context.organizationId}, ${context.userId}, ${route}, ${key}, ${requestHash})
        ON CONFLICT (organization_id, actor_user_id, route, idempotency_key) DO NOTHING
        RETURNING id
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

  private async material(tx: Transaction, context: PlatformContext, materialId: string, requireActive = false) {
    const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status FROM v2_materials WHERE id = ${materialId} AND organization_id = ${context.organizationId}
    `
    const material = rows[0]
    if (!material) throw new PlatformError('MATERIAL_NOT_FOUND', 'The requested material is not available in this workspace.', 404)
    if (requireActive && material.status !== 'ACTIVE') throw new PlatformError('MATERIAL_NOT_ELIGIBLE', 'Only active materials may be used in inventory operations.', 409)
    if (requireActive) {
      const blockers = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_material_compliance WHERE organization_id = ${context.organizationId} AND material_id = ${materialId} AND status = 'BLOCKED' LIMIT 1`
      if (blockers.length) throw new PlatformError('MATERIAL_COMPLIANCE_BLOCKED', 'A blocked compliance record prevents this material from operational use.', 409)
    }
    return material
  }

  async listMaterials(context: PlatformContext) {
    await this.require(context, 'materials.view')
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; name: string; internalCode: string | null; description: string | null; status: string; sensoryMetadata: JsonRecord; createdAt: Date; reviewedAt: Date | null }>>`
        SELECT id, name, internal_code AS "internalCode", description, status, sensory_metadata AS "sensoryMetadata", created_at AS "createdAt", reviewed_at AS "reviewedAt"
        FROM v2_materials WHERE organization_id = ${context.organizationId} ORDER BY name ASC, id ASC
      `
      return rows.map((row) => ({ ...row, scope: 'TENANT', createdAt: row.createdAt.toISOString(), reviewedAt: iso(row.reviewedAt) }))
    })
  }

  async createMaterial(context: PlatformContext, input: MaterialCreateInput, idempotencyKey?: string) {
    await this.require(context, 'materials.edit')
    return this.idempotent(context, 'materials.create', idempotencyKey, input, async (tx) => {
      const id = identifier('mat')
      await tx.$executeRaw`
        INSERT INTO v2_materials (id, organization_id, scope, name, internal_code, description, sensory_metadata, created_by)
        VALUES (${id}, ${context.organizationId}, 'TENANT', ${input.name}, ${input.internalCode ?? null}, ${input.description ?? null}, ${JSON.stringify(input.sensoryMetadata ?? {})}::jsonb, ${context.userId})
      `
      for (const item of input.identifiers) {
        await tx.$executeRaw`
          INSERT INTO v2_material_identifiers (id, organization_id, material_id, identifier_type, identifier_value, source)
          VALUES (${identifier('matid')}, ${context.organizationId}, ${id}, ${item.type}, ${item.value}, ${item.source ?? null})
        `
      }
      await this.audit(tx, context, 'lab_ops.material.create', 'allowed', 'material', id, input)
      return { id, status: 'DRAFT', scope: 'TENANT' }
    })
  }

  async changeMaterialStatus(context: PlatformContext, materialId: string, status: string, idempotencyKey?: string) {
    if (status === 'ACTIVE' || status === 'BLOCKED') await this.require(context, 'materials.approve')
    else await this.require(context, 'materials.edit')
    return this.idempotent(context, 'materials.status', idempotencyKey, { materialId, status }, async (tx) => {
      await this.material(tx, context, materialId)
      await tx.$executeRaw`
        UPDATE v2_materials SET status = ${status}, reviewed_by = ${context.userId}, reviewed_at = now(), updated_at = now()
        WHERE id = ${materialId} AND organization_id = ${context.organizationId}
      `
      await this.audit(tx, context, 'lab_ops.material.status', 'allowed', 'material', materialId, { status })
      return { id: materialId, status }
    })
  }

  async updateMaterial(context: PlatformContext, materialId: string, input: Partial<Pick<MaterialCreateInput, 'name' | 'internalCode' | 'description' | 'sensoryMetadata'>>, idempotencyKey?: string) {
    await this.require(context, 'materials.edit')
    return this.idempotent(context, 'materials.update', idempotencyKey, { materialId, ...input }, async (tx) => {
      await this.material(tx, context, materialId)
      await tx.$executeRaw`
        UPDATE v2_materials
        SET name = COALESCE(${input.name ?? null}, name), internal_code = COALESCE(${input.internalCode ?? null}, internal_code),
            description = COALESCE(${input.description ?? null}, description),
            sensory_metadata = COALESCE(${input.sensoryMetadata ? JSON.stringify(input.sensoryMetadata) : null}::jsonb, sensory_metadata), updated_at = now()
        WHERE id = ${materialId} AND organization_id = ${context.organizationId}
      `
      await this.audit(tx, context, 'lab_ops.material.update', 'allowed', 'material', materialId, input)
      return { id: materialId }
    })
  }

  async addMaterialDocument(context: PlatformContext, materialId: string, input: { kind: string; objectRef: string; contentHash?: string; version?: string }, idempotencyKey?: string) {
    await this.require(context, 'materials.edit')
    return this.idempotent(context, 'materials.documents.create', idempotencyKey, { materialId, ...input }, async (tx) => {
      await this.material(tx, context, materialId)
      const id = identifier('matdoc')
      await tx.$executeRaw`
        INSERT INTO v2_material_documents (id, organization_id, material_id, kind, object_ref, content_hash, version, created_by)
        VALUES (${id}, ${context.organizationId}, ${materialId}, ${input.kind}, ${input.objectRef}, ${input.contentHash ?? null}, ${input.version ?? null}, ${context.userId})
      `
      await this.audit(tx, context, 'lab_ops.material.document.create', 'allowed', 'material_document', id, { materialId, kind: input.kind, contentHash: input.contentHash ?? null })
      return { id, status: 'REVIEW_REQUIRED' }
    })
  }

  async saveCompliance(context: PlatformContext, materialId: string, input: ComplianceFacet, idempotencyKey?: string) {
    if (input.status === 'APPROVED' || input.status === 'BLOCKED') await this.require(context, 'materials.approve')
    else await this.require(context, 'materials.edit')
    return this.idempotent(context, 'materials.compliance.save', idempotencyKey, { materialId, ...input }, async (tx) => {
      await this.material(tx, context, materialId)
      const id = identifier('compliance')
      await tx.$executeRaw`
        INSERT INTO v2_material_compliance (id, organization_id, material_id, jurisdiction, category, status, source, source_version, effective_at, limits, evidence_ref, reviewed_by, reviewed_at)
        VALUES (${id}, ${context.organizationId}, ${materialId}, ${input.jurisdiction}, ${input.category}, ${input.status}, ${input.source}, ${input.sourceVersion}, ${input.effectiveDate ? new Date(input.effectiveDate) : null}, ${JSON.stringify(input.limits)}::jsonb, ${input.evidenceRef ?? null}, ${context.userId}, now())
        ON CONFLICT (organization_id, material_id, jurisdiction, category, source_version)
        DO UPDATE SET status = EXCLUDED.status, limits = EXCLUDED.limits, evidence_ref = EXCLUDED.evidence_ref, effective_at = EXCLUDED.effective_at, reviewed_by = EXCLUDED.reviewed_by, reviewed_at = EXCLUDED.reviewed_at, updated_at = now()
      `
      await this.audit(tx, context, 'lab_ops.material.compliance.save', 'allowed', 'material', materialId, input)
      return { id, materialId, status: input.status }
    })
  }

  async listSuppliers(context: PlatformContext) {
    await this.require(context, 'suppliers.view')
    return this.scoped(context, async (tx) => tx.$queryRaw<Array<{ id: string; legalName: string; tradeName: string | null; currency: string; leadTimeDays: number | null; status: string }>>`
      SELECT id, legal_name AS "legalName", trade_name AS "tradeName", currency, lead_time_days AS "leadTimeDays", status
      FROM v2_suppliers WHERE organization_id = ${context.organizationId} ORDER BY legal_name ASC
    `)
  }

  async listSupplierOffers(context: PlatformContext, supplierId?: string) {
    await this.require(context, 'suppliers.view')
    return this.scoped(context, async (tx) => tx.$queryRaw<Array<{ id: string; supplierId: string; materialId: string; productCode: string; unitPrice: Prisma.Decimal; currency: string; status: string }>>`
      SELECT id, supplier_id AS "supplierId", material_id AS "materialId", product_code AS "productCode", unit_price AS "unitPrice", currency, status
      FROM v2_supplier_offers WHERE organization_id = ${context.organizationId} AND (${supplierId ?? null}::text IS NULL OR supplier_id = ${supplierId ?? null}) ORDER BY created_at DESC, id ASC
    `.then((rows) => rows.map((row) => ({ ...row, unitPrice: asNumber(row.unitPrice) }))))
  }

  async createSupplier(context: PlatformContext, input: SupplierCreateInput, idempotencyKey?: string) {
    await this.require(context, 'suppliers.edit')
    return this.idempotent(context, 'suppliers.create', idempotencyKey, input, async (tx) => {
      const id = identifier('sup')
      await tx.$executeRaw`
        INSERT INTO v2_suppliers (id, organization_id, legal_name, trade_name, primary_email, primary_phone, currency, lead_time_days, payment_terms, created_by)
        VALUES (${id}, ${context.organizationId}, ${input.legalName}, ${input.tradeName ?? null}, ${input.primaryEmail ?? null}, ${input.primaryPhone ?? null}, ${input.currency}, ${input.leadTimeDays ?? null}, ${JSON.stringify(input.paymentTerms)}::jsonb, ${context.userId})
      `
      await this.audit(tx, context, 'lab_ops.supplier.create', 'allowed', 'supplier', id, input)
      return { id, status: 'DRAFT' }
    })
  }

  async changeSupplierStatus(context: PlatformContext, supplierId: string, status: string, idempotencyKey?: string) {
    if (status === 'ACTIVE' || status === 'SUSPENDED') await this.require(context, 'suppliers.approve')
    else await this.require(context, 'suppliers.edit')
    return this.idempotent(context, 'suppliers.status', idempotencyKey, { supplierId, status }, async (tx) => {
      const suppliers = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_suppliers WHERE id = ${supplierId} AND organization_id = ${context.organizationId}`
      if (!suppliers.length) throw new PlatformError('SUPPLIER_NOT_FOUND', 'The selected supplier is not available in this workspace.', 404)
      await tx.$executeRaw`UPDATE v2_suppliers SET status = ${status}, updated_at = now() WHERE id = ${supplierId} AND organization_id = ${context.organizationId}`
      await this.audit(tx, context, 'lab_ops.supplier.status', 'allowed', 'supplier', supplierId, { status })
      return { id: supplierId, status }
    })
  }

  async createSupplierOffer(context: PlatformContext, input: SupplierOfferCreateInput, idempotencyKey?: string) {
    await this.require(context, 'suppliers.edit')
    return this.idempotent(context, 'suppliers.offers.create', idempotencyKey, input, async (tx) => {
      await this.material(tx, context, input.materialId)
      const suppliers = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_suppliers WHERE id = ${input.supplierId} AND organization_id = ${context.organizationId}`
      if (!suppliers.length) throw new PlatformError('SUPPLIER_NOT_FOUND', 'The selected supplier is not available in this workspace.', 404)
      const id = identifier('offer')
      await tx.$executeRaw`
        INSERT INTO v2_supplier_offers (id, organization_id, supplier_id, material_id, product_code, trade_name, grade, minimum_order_quantity, unit, unit_price, currency, lead_time_days, pack_size, valid_from, valid_until, created_by)
        VALUES (${id}, ${context.organizationId}, ${input.supplierId}, ${input.materialId}, ${input.productCode}, ${input.tradeName ?? null}, ${input.grade ?? null}, ${input.minimumOrderQuantity}, ${input.unit}, ${input.unitPrice}, ${input.currency}, ${input.leadTimeDays ?? null}, ${input.packSize ?? null}, ${input.validFrom ? new Date(input.validFrom) : null}, ${input.validUntil ? new Date(input.validUntil) : null}, ${context.userId})
      `
      await tx.$executeRaw`
        INSERT INTO v2_supplier_offer_price_history (id, organization_id, supplier_offer_id, unit_price, currency, valid_from, valid_until, changed_by, reason)
        VALUES (${identifier('offer_price')}, ${context.organizationId}, ${id}, ${input.unitPrice}, ${input.currency}, ${input.validFrom ? new Date(input.validFrom) : null}, ${input.validUntil ? new Date(input.validUntil) : null}, ${context.userId}, 'Initial offer')
      `
      await this.audit(tx, context, 'lab_ops.supplier_offer.create', 'allowed', 'supplier_offer', id, input)
      return { id, status: 'DRAFT' }
    })
  }

  async addSupplierDocument(context: PlatformContext, supplierId: string, input: { kind: string; objectRef: string; contentHash?: string; version?: string }, idempotencyKey?: string) {
    await this.require(context, 'suppliers.edit')
    return this.idempotent(context, 'suppliers.documents.create', idempotencyKey, { supplierId, ...input }, async (tx) => {
      const supplier = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_suppliers WHERE id = ${supplierId} AND organization_id = ${context.organizationId}`
      if (!supplier.length) throw new PlatformError('SUPPLIER_NOT_FOUND', 'The selected supplier is not available in this workspace.', 404)
      const id = identifier('supdoc')
      await tx.$executeRaw`
        INSERT INTO v2_supplier_documents (id, organization_id, supplier_id, kind, object_ref, content_hash, version, created_by)
        VALUES (${id}, ${context.organizationId}, ${supplierId}, ${input.kind}, ${input.objectRef}, ${input.contentHash ?? null}, ${input.version ?? null}, ${context.userId})
      `
      await this.audit(tx, context, 'lab_ops.supplier.document.create', 'allowed', 'supplier_document', id, { supplierId, kind: input.kind, contentHash: input.contentHash ?? null })
      return { id, status: 'REVIEW_REQUIRED' }
    })
  }

  async reviseSupplierOfferPrice(context: PlatformContext, offerId: string, input: { unitPrice: number; currency: string; validFrom?: string; validUntil?: string; reason: string }, idempotencyKey?: string) {
    await this.require(context, 'suppliers.edit')
    return this.idempotent(context, 'suppliers.offers.price', idempotencyKey, { offerId, ...input }, async (tx) => {
      const offers = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_supplier_offers WHERE id = ${offerId} AND organization_id = ${context.organizationId} FOR UPDATE`
      if (!offers.length) throw new PlatformError('SUPPLIER_OFFER_NOT_FOUND', 'The selected supplier offer is not available in this workspace.', 404)
      await tx.$executeRaw`
        UPDATE v2_supplier_offers SET unit_price = ${input.unitPrice}, currency = ${input.currency}, valid_from = ${input.validFrom ? new Date(input.validFrom) : null}, valid_until = ${input.validUntil ? new Date(input.validUntil) : null}, updated_at = now()
        WHERE id = ${offerId} AND organization_id = ${context.organizationId}
      `
      const historyId = identifier('offer_price')
      await tx.$executeRaw`
        INSERT INTO v2_supplier_offer_price_history (id, organization_id, supplier_offer_id, unit_price, currency, valid_from, valid_until, changed_by, reason)
        VALUES (${historyId}, ${context.organizationId}, ${offerId}, ${input.unitPrice}, ${input.currency}, ${input.validFrom ? new Date(input.validFrom) : null}, ${input.validUntil ? new Date(input.validUntil) : null}, ${context.userId}, ${input.reason})
      `
      await this.audit(tx, context, 'lab_ops.supplier_offer.price.revise', 'allowed', 'supplier_offer', offerId, { unitPrice: input.unitPrice, currency: input.currency, reason: input.reason })
      return { id: offerId, priceHistoryId: historyId }
    })
  }

  async supplierPerformance(context: PlatformContext, supplierId: string) {
    await this.require(context, 'suppliers.view')
    return this.scoped(context, async (tx) => {
      const result = await tx.$queryRaw<Array<{ receivedLines: bigint; acceptedLines: bigint; returnedLines: bigint }>>`
        SELECT COUNT(grl.id) AS "receivedLines",
               COUNT(grl.id) FILTER (WHERE grl.inspection_disposition = 'ACCEPT') AS "acceptedLines",
               COUNT(grl.id) FILTER (WHERE grl.inspection_disposition = 'RETURN') AS "returnedLines"
        FROM v2_suppliers s
        LEFT JOIN v2_supplier_offers so ON so.supplier_id = s.id AND so.organization_id = s.organization_id
        LEFT JOIN v2_goods_receipt_lines grl ON grl.supplier_offer_id = so.id AND grl.organization_id = s.organization_id
        WHERE s.id = ${supplierId} AND s.organization_id = ${context.organizationId}
      `
      if (!result.length) throw new PlatformError('SUPPLIER_NOT_FOUND', 'The selected supplier is not available in this workspace.', 404)
      return { receivedLines: Number(result[0].receivedLines), acceptedLines: Number(result[0].acceptedLines), returnedLines: Number(result[0].returnedLines) }
    })
  }

  async changeSupplierOfferStatus(context: PlatformContext, offerId: string, status: string, idempotencyKey?: string) {
    if (status === 'ACTIVE') await this.require(context, 'suppliers.approve')
    else await this.require(context, 'suppliers.edit')
    return this.idempotent(context, 'suppliers.offers.status', idempotencyKey, { offerId, status }, async (tx) => {
      const offers = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_supplier_offers WHERE id = ${offerId} AND organization_id = ${context.organizationId}`
      if (!offers.length) throw new PlatformError('SUPPLIER_OFFER_NOT_FOUND', 'The selected supplier offer is not available in this workspace.', 404)
      await tx.$executeRaw`UPDATE v2_supplier_offers SET status = ${status}, updated_at = now() WHERE id = ${offerId} AND organization_id = ${context.organizationId}`
      await this.audit(tx, context, 'lab_ops.supplier_offer.status', 'allowed', 'supplier_offer', offerId, { status })
      return { id: offerId, status }
    })
  }

  private async lotProjection(tx: Transaction, context: PlatformContext, lotId: string) {
    const amounts = await tx.$queryRaw<Array<{ onHand: Prisma.Decimal | null; reserved: Prisma.Decimal | null }>>`
      SELECT
        COALESCE(SUM(m.quantity_delta_g), 0) AS "onHand",
        COALESCE((SELECT SUM(r.quantity_g - r.consumed_quantity_g) FROM v2_inventory_reservations r WHERE r.organization_id = ${context.organizationId} AND r.lot_id = ${lotId} AND r.status = 'ACTIVE'), 0) AS reserved
      FROM v2_inventory_movements m WHERE m.organization_id = ${context.organizationId} AND m.lot_id = ${lotId}
    `
    const onHandGrams = asNumber(amounts[0]?.onHand)
    const reservedGrams = asNumber(amounts[0]?.reserved)
    return { onHandGrams, reservedGrams, availableGrams: onHandGrams - reservedGrams }
  }

  private async lot(tx: Transaction, context: PlatformContext, lotId: string, lock = false) {
    const clause = lock ? Prisma.sql` FOR UPDATE` : Prisma.empty
    const rows = await tx.$queryRaw<LotRow[]>(Prisma.sql`
      SELECT id, material_id AS "materialId", status, quality_status AS "qualityStatus", expires_at AS "expiresAt", created_at AS "createdAt",
             supplier_id AS "supplierId", supplier_offer_id AS "supplierOfferId", supplier_lot AS "supplierLot", location, landed_unit_cost AS "landedUnitCost", currency
      FROM v2_inventory_lots WHERE id = ${lotId} AND organization_id = ${context.organizationId}${clause}
    `)
    if (!rows.length) throw new PlatformError('LOT_NOT_FOUND', 'The selected lot is not available in this workspace.', 404)
    return rows[0]
  }

  async listLots(context: PlatformContext) {
    await this.require(context, 'inventory.view')
    return this.scoped(context, async (tx) => {
      const lots = await tx.$queryRaw<LotRow[]>`
        SELECT id, material_id AS "materialId", status, quality_status AS "qualityStatus", expires_at AS "expiresAt", created_at AS "createdAt",
               supplier_id AS "supplierId", supplier_offer_id AS "supplierOfferId", supplier_lot AS "supplierLot", location, landed_unit_cost AS "landedUnitCost", currency
        FROM v2_inventory_lots WHERE organization_id = ${context.organizationId} ORDER BY created_at DESC, id ASC
      `
      return Promise.all(lots.map(async (lot) => ({
        id: lot.id, materialId: lot.materialId, status: lot.status, qualityStatus: lot.qualityStatus, expiresAt: iso(lot.expiresAt), createdAt: lot.createdAt.toISOString(),
        supplierId: lot.supplierId, supplierOfferId: lot.supplierOfferId, supplierLot: lot.supplierLot, location: lot.location, landedUnitCost: lot.landedUnitCost ? asNumber(lot.landedUnitCost) : null, currency: lot.currency,
        projection: await this.lotProjection(tx, context, lot.id),
      })))
    })
  }

  async lotDetail(context: PlatformContext, lotId: string) {
    await this.require(context, 'inventory.view')
    return this.scoped(context, async (tx) => {
      const lot = await this.lot(tx, context, lotId)
      const movements = await tx.$queryRaw<Array<{ id: string; movementType: string; quantityDeltaGrams: Prisma.Decimal; referenceType: string; referenceId: string; createdAt: Date; reversalOfId: string | null }>>`
        SELECT id, movement_type AS "movementType", quantity_delta_g AS "quantityDeltaGrams", reference_type AS "referenceType", reference_id AS "referenceId", created_at AS "createdAt", reversal_of_id AS "reversalOfId"
        FROM v2_inventory_movements WHERE organization_id = ${context.organizationId} AND lot_id = ${lotId} ORDER BY created_at DESC, id DESC LIMIT 200
      `
      return { id: lot.id, materialId: lot.materialId, location: lot.location, status: lot.status, qualityStatus: lot.qualityStatus, projection: await this.lotProjection(tx, context, lot.id), movements: movements.map((movement) => ({ ...movement, quantityDeltaGrams: asNumber(movement.quantityDeltaGrams), createdAt: movement.createdAt.toISOString() })) }
    })
  }

  async inventorySummary(context: PlatformContext) {
    await this.require(context, 'inventory.view')
    const lots = await this.listLots(context)
    return {
      lotCount: lots.length,
      onHandGrams: lots.reduce((total, lot) => total + lot.projection.onHandGrams, 0),
      reservedGrams: lots.reduce((total, lot) => total + lot.projection.reservedGrams, 0),
      availableGrams: lots.reduce((total, lot) => total + lot.projection.availableGrams, 0),
      quarantineLots: lots.filter((lot) => lot.status === 'QUARANTINE' || lot.status === 'HOLD').length,
    }
  }

  async fefo(context: PlatformContext, materialId: string, targetGrams: number) {
    await this.require(context, 'inventory.view')
    return this.scoped(context, async (tx) => {
      await this.material(tx, context, materialId, true)
      const lots = await tx.$queryRaw<LotRow[]>`
        SELECT id, material_id AS "materialId", status, quality_status AS "qualityStatus", expires_at AS "expiresAt", created_at AS "createdAt",
               supplier_id AS "supplierId", supplier_offer_id AS "supplierOfferId", supplier_lot AS "supplierLot", location, landed_unit_cost AS "landedUnitCost", currency
        FROM v2_inventory_lots WHERE organization_id = ${context.organizationId} AND material_id = ${materialId}
      `
      const candidates = await Promise.all(lots.map(async (lot) => ({ lotId: lot.id, materialId: lot.materialId, status: lot.status as 'AVAILABLE', qualityStatus: lot.qualityStatus as 'PASSED', expiresAt: iso(lot.expiresAt), createdAt: lot.createdAt.toISOString(), availableGrams: (await this.lotProjection(tx, context, lot.id)).availableGrams })))
      let selected
      try { selected = selectFefo(candidates, materialId, targetGrams) }
      catch { throw new PlatformError('LOT_NOT_ELIGIBLE', 'No eligible quality-approved lot can satisfy the requested quantity.', 409) }
      let remaining = targetGrams
      return selected.map((candidate) => {
        const allocatedGrams = Math.min(candidate.availableGrams, remaining)
        remaining -= allocatedGrams
        return { ...candidate, allocatedGrams }
      })
    })
  }

  async createPurchaseRequest(context: PlatformContext, input: { notes?: string; lines: Array<{ materialId: string; requestedGrams: number; preferredSupplierId?: string; requiredAt?: string; reason?: string }> }, idempotencyKey?: string) {
    await this.require(context, 'procurement.create')
    return this.idempotent(context, 'procurement.requests.create', idempotencyKey, input, async (tx) => {
      const id = identifier('pr')
      await tx.$executeRaw`INSERT INTO v2_purchase_requests (id, organization_id, requested_by, notes) VALUES (${id}, ${context.organizationId}, ${context.userId}, ${input.notes ?? null})`
      for (const line of input.lines) {
        await this.material(tx, context, line.materialId, true)
        if (line.preferredSupplierId) {
          const suppliers = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_suppliers WHERE id = ${line.preferredSupplierId} AND organization_id = ${context.organizationId}`
          if (!suppliers.length) throw new PlatformError('SUPPLIER_NOT_FOUND', 'The preferred supplier is not available in this workspace.', 404)
        }
        await tx.$executeRaw`
          INSERT INTO v2_purchase_request_lines (id, organization_id, purchase_request_id, material_id, requested_quantity_g, preferred_supplier_id, required_at, reason)
          VALUES (${identifier('prl')}, ${context.organizationId}, ${id}, ${line.materialId}, ${line.requestedGrams}, ${line.preferredSupplierId ?? null}, ${line.requiredAt ? new Date(line.requiredAt) : null}, ${line.reason ?? null})
        `
      }
      await this.audit(tx, context, 'lab_ops.purchase_request.create', 'allowed', 'purchase_request', id, input)
      return { id, status: 'DRAFT' }
    })
  }

  async changePurchaseRequestStatus(context: PlatformContext, requestId: string, status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED', idempotencyKey?: string) {
    if (status === 'APPROVED' || status === 'REJECTED') await this.require(context, 'procurement.approve')
    else await this.require(context, 'procurement.create')
    return this.idempotent(context, 'procurement.requests.status', idempotencyKey, { requestId, status }, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM v2_purchase_requests WHERE id = ${requestId} AND organization_id = ${context.organizationId} FOR UPDATE`
      const current = rows[0]?.status
      const allowed: Record<string, string[]> = { DRAFT: ['SUBMITTED', 'CANCELLED'], SUBMITTED: ['APPROVED', 'REJECTED', 'CANCELLED'], APPROVED: [], REJECTED: [], CANCELLED: [] }
      if (!current) throw new PlatformError('PURCHASE_REQUEST_NOT_FOUND', 'The selected purchase request is not available in this workspace.', 404)
      if (!allowed[current]?.includes(status)) throw new PlatformError('PURCHASE_REQUEST_TRANSITION_INVALID', 'This purchase request transition is not allowed.', 409)
      await tx.$executeRaw`UPDATE v2_purchase_requests SET status = ${status}, approved_by = ${status === 'APPROVED' ? context.userId : null}, updated_at = now() WHERE id = ${requestId} AND organization_id = ${context.organizationId}`
      await this.audit(tx, context, 'lab_ops.purchase_request.status', 'allowed', 'purchase_request', requestId, { from: current, to: status })
      return { id: requestId, status }
    })
  }

  async createPurchaseOrder(context: PlatformContext, input: { supplierId: string; purchaseRequestId?: string; currency: string; lines: Array<{ materialId: string; supplierOfferId?: string; orderedGrams: number; unitPrice?: number }> }, idempotencyKey?: string) {
    await this.require(context, 'procurement.create')
    return this.idempotent(context, 'procurement.orders.create', idempotencyKey, input, async (tx) => {
      const supplier = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_suppliers WHERE id = ${input.supplierId} AND organization_id = ${context.organizationId} AND status = 'ACTIVE'`
      if (!supplier.length) throw new PlatformError('SUPPLIER_NOT_FOUND', 'The selected supplier is not available in this workspace.', 404)
      if (input.purchaseRequestId) {
        const requests = await tx.$queryRaw<Array<{ id: string; status: string }>>`
          SELECT id, status FROM v2_purchase_requests WHERE id = ${input.purchaseRequestId} AND organization_id = ${context.organizationId}
        `
        if (!requests.length) throw new PlatformError('PURCHASE_REQUEST_NOT_FOUND', 'The selected purchase request is not available in this workspace.', 404)
        if (requests[0].status !== 'APPROVED') throw new PlatformError('PURCHASE_REQUEST_NOT_APPROVED', 'A purchase order requires an approved purchase request.', 409)
      }
      const id = identifier('po')
      await tx.$executeRaw`INSERT INTO v2_purchase_orders (id, organization_id, supplier_id, purchase_request_id, currency, created_by) VALUES (${id}, ${context.organizationId}, ${input.supplierId}, ${input.purchaseRequestId ?? null}, ${input.currency}, ${context.userId})`
      for (const line of input.lines) {
        await this.material(tx, context, line.materialId, true)
        if (line.supplierOfferId) {
          const offers = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM v2_supplier_offers WHERE id = ${line.supplierOfferId} AND organization_id = ${context.organizationId} AND supplier_id = ${input.supplierId} AND material_id = ${line.materialId} AND status = 'ACTIVE'
          `
          if (!offers.length) throw new PlatformError('SUPPLIER_OFFER_NOT_ELIGIBLE', 'Select an active supplier offer for the matching supplier and material.', 409)
        }
        await tx.$executeRaw`INSERT INTO v2_purchase_order_lines (id, organization_id, purchase_order_id, material_id, supplier_offer_id, ordered_quantity_g, unit_price) VALUES (${identifier('pol')}, ${context.organizationId}, ${id}, ${line.materialId}, ${line.supplierOfferId ?? null}, ${line.orderedGrams}, ${line.unitPrice ?? null})`
      }
      await this.audit(tx, context, 'lab_ops.purchase_order.create', 'allowed', 'purchase_order', id, input)
      return { id, status: 'DRAFT' }
    })
  }

  async changePurchaseOrderStatus(context: PlatformContext, purchaseOrderId: string, status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SENT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED', idempotencyKey?: string) {
    if (status === 'APPROVED') await this.require(context, 'procurement.approve')
    else await this.require(context, 'procurement.create')
    return this.idempotent(context, 'procurement.orders.status', idempotencyKey, { purchaseOrderId, status }, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM v2_purchase_orders WHERE id = ${purchaseOrderId} AND organization_id = ${context.organizationId} FOR UPDATE`
      const current = rows[0]?.status
      const allowed: Record<string, string[]> = { DRAFT: ['PENDING_APPROVAL', 'CANCELLED'], PENDING_APPROVAL: ['APPROVED', 'CANCELLED'], APPROVED: ['SENT', 'CANCELLED'], SENT: [], PARTIALLY_RECEIVED: [], RECEIVED: [], CANCELLED: [] }
      if (!current) throw new PlatformError('PURCHASE_ORDER_NOT_FOUND', 'The selected purchase order is not available in this workspace.', 404)
      if (!allowed[current]?.includes(status)) throw new PlatformError('PURCHASE_ORDER_TRANSITION_INVALID', 'This purchase order transition is not allowed.', 409)
      await tx.$executeRaw`UPDATE v2_purchase_orders SET status = ${status}, approved_by = ${status === 'APPROVED' ? context.userId : null}, updated_at = now() WHERE id = ${purchaseOrderId} AND organization_id = ${context.organizationId}`
      await this.audit(tx, context, 'lab_ops.purchase_order.status', 'allowed', 'purchase_order', purchaseOrderId, { from: current, to: status })
      return { id: purchaseOrderId, status }
    })
  }

  async createShipment(context: PlatformContext, input: { purchaseOrderId: string; carrier?: string; trackingReference?: string; shippedAt?: string }, idempotencyKey?: string) {
    await this.require(context, 'procurement.create')
    return this.idempotent(context, 'procurement.shipments.create', idempotencyKey, input, async (tx) => {
      const order = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM v2_purchase_orders WHERE id = ${input.purchaseOrderId} AND organization_id = ${context.organizationId} FOR UPDATE`
      if (!order.length) throw new PlatformError('PURCHASE_ORDER_NOT_FOUND', 'The selected purchase order is not available in this workspace.', 404)
      if (!['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(order[0].status)) throw new PlatformError('SHIPMENT_ORDER_NOT_READY', 'A shipment requires an approved or sent purchase order.', 409)
      const id = identifier('shipment')
      await tx.$executeRaw`
        INSERT INTO v2_shipments (id, organization_id, purchase_order_id, status, carrier, tracking_reference, shipped_at)
        VALUES (${id}, ${context.organizationId}, ${input.purchaseOrderId}, ${input.shippedAt ? 'IN_TRANSIT' : 'PLANNED'}, ${input.carrier ?? null}, ${input.trackingReference ?? null}, ${input.shippedAt ? new Date(input.shippedAt) : null})
      `
      if (order[0].status === 'APPROVED' && input.shippedAt) await tx.$executeRaw`UPDATE v2_purchase_orders SET status = 'SENT', updated_at = now() WHERE id = ${input.purchaseOrderId} AND organization_id = ${context.organizationId}`
      await this.audit(tx, context, 'lab_ops.shipment.create', 'allowed', 'shipment', id, input)
      return { id, status: input.shippedAt ? 'IN_TRANSIT' : 'PLANNED' }
    })
  }

  async changeShipmentStatus(context: PlatformContext, shipmentId: string, status: 'PLANNED' | 'IN_TRANSIT' | 'DELIVERED' | 'LOST' | 'CANCELLED', deliveredAt: string | undefined, idempotencyKey?: string) {
    await this.require(context, 'procurement.receive')
    return this.idempotent(context, 'procurement.shipments.status', idempotencyKey, { shipmentId, status, deliveredAt }, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: string; purchaseOrderId: string }>>`SELECT status, purchase_order_id AS "purchaseOrderId" FROM v2_shipments WHERE id = ${shipmentId} AND organization_id = ${context.organizationId} FOR UPDATE`
      const current = rows[0]?.status
      const allowed: Record<string, string[]> = { PLANNED: ['IN_TRANSIT', 'CANCELLED'], IN_TRANSIT: ['DELIVERED', 'LOST', 'CANCELLED'], DELIVERED: [], LOST: [], CANCELLED: [] }
      if (!current) throw new PlatformError('SHIPMENT_NOT_FOUND', 'The selected shipment is not available in this workspace.', 404)
      if (!allowed[current]?.includes(status)) throw new PlatformError('SHIPMENT_TRANSITION_INVALID', 'This shipment transition is not allowed.', 409)
      await tx.$executeRaw`UPDATE v2_shipments SET status = ${status}, shipped_at = CASE WHEN ${status} = 'IN_TRANSIT' THEN now() ELSE shipped_at END, delivered_at = CASE WHEN ${status} = 'DELIVERED' THEN ${deliveredAt ? new Date(deliveredAt) : new Date()} ELSE delivered_at END WHERE id = ${shipmentId} AND organization_id = ${context.organizationId}`
      if (status === 'IN_TRANSIT') await tx.$executeRaw`UPDATE v2_purchase_orders SET status = 'SENT', updated_at = now() WHERE id = ${rows[0].purchaseOrderId} AND organization_id = ${context.organizationId} AND status = 'APPROVED'`
      await this.audit(tx, context, 'lab_ops.shipment.status', 'allowed', 'shipment', shipmentId, { from: current, to: status })
      return { id: shipmentId, status }
    })
  }

  async listProcurement(context: PlatformContext) {
    await this.require(context, 'procurement.view')
    return this.scoped(context, async (tx) => {
      const [requests, orders, shipments] = await Promise.all([
        tx.$queryRaw<Array<{ id: string; status: string; createdAt: Date }>>`SELECT id, status, created_at AS "createdAt" FROM v2_purchase_requests WHERE organization_id = ${context.organizationId} ORDER BY created_at DESC, id DESC LIMIT 100`,
        tx.$queryRaw<Array<{ id: string; supplierId: string; status: string; currency: string; createdAt: Date }>>`SELECT id, supplier_id AS "supplierId", status, currency, created_at AS "createdAt" FROM v2_purchase_orders WHERE organization_id = ${context.organizationId} ORDER BY created_at DESC, id DESC LIMIT 100`,
        tx.$queryRaw<Array<{ id: string; purchaseOrderId: string; status: string; carrier: string | null; trackingReference: string | null; createdAt: Date }>>`SELECT id, purchase_order_id AS "purchaseOrderId", status, carrier, tracking_reference AS "trackingReference", created_at AS "createdAt" FROM v2_shipments WHERE organization_id = ${context.organizationId} ORDER BY created_at DESC, id DESC LIMIT 100`,
      ])
      const isoRows = <T extends { createdAt: Date }>(rows: T[]) => rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
      return { requests: isoRows(requests), orders: isoRows(orders), shipments: isoRows(shipments) }
    })
  }

  async receiveGoods(context: PlatformContext, input: { purchaseOrderId?: string; shipmentId?: string; freightCost: number; dutyCost: number; insuranceCost: number; currency: string; lines: Array<{ materialId: string; supplierOfferId?: string; supplierLot?: string; quantity: number; unit: 'G' | 'KG'; location: string; manufacturedAt?: string; expiresAt?: string; unitPrice?: number }> }, idempotencyKey?: string) {
    await this.require(context, 'procurement.receive')
    return this.idempotent(context, 'procurement.receipts.receive', idempotencyKey, input, async (tx) => {
      const receiptId = identifier('receipt')
      if (input.purchaseOrderId) {
        const orders = await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT id, status FROM v2_purchase_orders WHERE id = ${input.purchaseOrderId} AND organization_id = ${context.organizationId} FOR UPDATE`
        if (!orders.length) throw new PlatformError('PURCHASE_ORDER_NOT_FOUND', 'The selected purchase order is not available in this workspace.', 404)
        if (!['SENT', 'PARTIALLY_RECEIVED'].includes(orders[0].status)) throw new PlatformError('PURCHASE_ORDER_NOT_READY_FOR_RECEIPT', 'A receipt requires a sent purchase order.', 409)
      }
      if (input.shipmentId) {
        const shipments = await tx.$queryRaw<Array<{ id: string; purchaseOrderId: string }>>`
          SELECT id, purchase_order_id AS "purchaseOrderId" FROM v2_shipments WHERE id = ${input.shipmentId} AND organization_id = ${context.organizationId}
        `
        if (!shipments.length) throw new PlatformError('SHIPMENT_NOT_FOUND', 'The selected shipment is not available in this workspace.', 404)
        if (input.purchaseOrderId && shipments[0].purchaseOrderId !== input.purchaseOrderId) throw new PlatformError('SHIPMENT_PURCHASE_ORDER_MISMATCH', 'The shipment does not belong to the selected purchase order.', 409)
      }
      await tx.$executeRaw`
        INSERT INTO v2_goods_receipts (id, organization_id, purchase_order_id, shipment_id, freight_cost, duty_cost, insurance_cost, currency, received_by)
        VALUES (${receiptId}, ${context.organizationId}, ${input.purchaseOrderId ?? null}, ${input.shipmentId ?? null}, ${input.freightCost}, ${input.dutyCost}, ${input.insuranceCost}, ${input.currency}, ${context.userId})
      `
      const lines: Array<{ id: string; lotId: string; materialId: string; quantityGrams: number }> = []
      for (const line of input.lines) {
        await this.material(tx, context, line.materialId, true)
        let supplierId: string | null = null
        if (line.supplierOfferId) {
          const offers = await tx.$queryRaw<Array<{ supplierId: string }>>`
            SELECT supplier_id AS "supplierId" FROM v2_supplier_offers
            WHERE id = ${line.supplierOfferId} AND organization_id = ${context.organizationId} AND material_id = ${line.materialId} AND status = 'ACTIVE'
          `
          if (!offers.length) throw new PlatformError('SUPPLIER_OFFER_NOT_ELIGIBLE', 'Select an active supplier offer for the matching material.', 409)
          supplierId = offers[0].supplierId
        }
        const quantityGrams = line.unit === 'KG' ? line.quantity * 1000 : line.quantity
        if (input.purchaseOrderId) {
          const orderLines = await tx.$queryRaw<Array<{ id: string; orderedGrams: Prisma.Decimal; receivedGrams: Prisma.Decimal }>>`
            SELECT id, ordered_quantity_g AS "orderedGrams", received_quantity_g AS "receivedGrams"
            FROM v2_purchase_order_lines
            WHERE purchase_order_id = ${input.purchaseOrderId} AND organization_id = ${context.organizationId}
              AND material_id = ${line.materialId} AND (${line.supplierOfferId ?? null}::text IS NULL OR supplier_offer_id = ${line.supplierOfferId ?? null})
            FOR UPDATE
          `
          const orderLine = orderLines[0]
          if (!orderLine || asNumber(orderLine.receivedGrams) + quantityGrams > asNumber(orderLine.orderedGrams) + EPSILON) {
            throw new PlatformError('PURCHASE_ORDER_RECEIPT_EXCEEDS_ORDERED', 'This receipt line is not available on the purchase order or exceeds the ordered quantity.', 409)
          }
          await tx.$executeRaw`UPDATE v2_purchase_order_lines SET received_quantity_g = received_quantity_g + ${quantityGrams} WHERE id = ${orderLine.id} AND organization_id = ${context.organizationId}`
        }
        const lotId = identifier('lot')
        const lineId = identifier('receipt_line')
        await tx.$executeRaw`
          INSERT INTO v2_inventory_lots (id, organization_id, material_id, supplier_id, supplier_offer_id, supplier_lot, received_at, manufactured_at, expires_at, location, status, quality_status, created_by, currency)
          VALUES (${lotId}, ${context.organizationId}, ${line.materialId}, ${supplierId}, ${line.supplierOfferId ?? null}, ${line.supplierLot ?? null}, now(), ${line.manufacturedAt ? new Date(line.manufacturedAt) : null}, ${line.expiresAt ? new Date(line.expiresAt) : null}, ${line.location}, 'QUARANTINE', 'PENDING', ${context.userId}, ${input.currency})
        `
        await tx.$executeRaw`
          INSERT INTO v2_goods_receipt_lines (id, organization_id, goods_receipt_id, material_id, supplier_offer_id, inventory_lot_id, supplier_lot, quantity_g, unit_price)
          VALUES (${lineId}, ${context.organizationId}, ${receiptId}, ${line.materialId}, ${line.supplierOfferId ?? null}, ${lotId}, ${line.supplierLot ?? null}, ${quantityGrams}, ${line.unitPrice ?? null})
        `
        await tx.$executeRaw`
          INSERT INTO v2_inventory_movements (id, organization_id, lot_id, material_id, movement_type, quantity_delta_g, reference_type, reference_id, idempotency_key, actor_user_id)
          VALUES (${identifier('move')}, ${context.organizationId}, ${lotId}, ${line.materialId}, 'RECEIPT', ${quantityGrams}, 'GOODS_RECEIPT', ${receiptId}, ${`${idempotencyKey}:${lineId}`}, ${context.userId})
        `
        lines.push({ id: lineId, lotId, materialId: line.materialId, quantityGrams })
      }
      if (input.purchaseOrderId) {
        const totals = await tx.$queryRaw<Array<{ ordered: Prisma.Decimal; received: Prisma.Decimal }>>`
          SELECT COALESCE(SUM(ordered_quantity_g), 0) AS ordered, COALESCE(SUM(received_quantity_g), 0) AS received
          FROM v2_purchase_order_lines WHERE purchase_order_id = ${input.purchaseOrderId} AND organization_id = ${context.organizationId}
        `
        const nextStatus = asNumber(totals[0].received) + EPSILON >= asNumber(totals[0].ordered) ? 'RECEIVED' : 'PARTIALLY_RECEIVED'
        await tx.$executeRaw`UPDATE v2_purchase_orders SET status = ${nextStatus}, updated_at = now() WHERE id = ${input.purchaseOrderId} AND organization_id = ${context.organizationId}`
      }
      if (input.shipmentId) await tx.$executeRaw`UPDATE v2_shipments SET status = 'DELIVERED', delivered_at = COALESCE(delivered_at, now()) WHERE id = ${input.shipmentId} AND organization_id = ${context.organizationId} AND status IN ('PLANNED', 'IN_TRANSIT')`
      await this.audit(tx, context, 'lab_ops.goods_receipt.receive', 'allowed', 'goods_receipt', receiptId, input)
      return { id: receiptId, status: 'RECEIVED', lines }
    })
  }

  async inspectReceiptLine(context: PlatformContext, receiptId: string, lineId: string, input: { disposition: 'ACCEPT' | 'REJECT' | 'RETURN' | 'HOLD' | 'REVIEW_REQUIRED'; findings: JsonRecord; reason?: string }, idempotencyKey?: string) {
    await this.require(context, 'procurement.inspect')
    return this.idempotent(context, 'procurement.receipts.inspect', idempotencyKey, { receiptId, lineId, ...input }, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; lotId: string; materialId: string; quantityGrams: Prisma.Decimal; disposition: string }>>`
        SELECT id, inventory_lot_id AS "lotId", material_id AS "materialId", quantity_g AS "quantityGrams", inspection_disposition AS disposition
        FROM v2_goods_receipt_lines WHERE id = ${lineId} AND goods_receipt_id = ${receiptId} AND organization_id = ${context.organizationId} FOR UPDATE
      `
      const line = rows[0]
      if (!line) throw new PlatformError('RECEIPT_LINE_NOT_FOUND', 'The receipt line is not available in this workspace.', 404)
      if (['ACCEPT', 'REJECT', 'RETURN'].includes(line.disposition)) throw new PlatformError('INSPECTION_ALREADY_DECIDED', 'This receipt line already has a final inspection decision.', 409)
      await this.lot(tx, context, line.lotId, true)
      const lotStatus = input.disposition === 'ACCEPT' ? 'AVAILABLE' : input.disposition === 'HOLD' ? 'HOLD' : input.disposition === 'REVIEW_REQUIRED' ? 'QUARANTINE' : 'REJECTED'
      const quality = input.disposition === 'ACCEPT' ? 'PASSED' : input.disposition === 'HOLD' || input.disposition === 'REVIEW_REQUIRED' ? 'PENDING' : 'FAILED'
      await tx.$executeRaw`UPDATE v2_inventory_lots SET status = ${lotStatus}, quality_status = ${quality}, updated_at = now() WHERE id = ${line.lotId} AND organization_id = ${context.organizationId}`
      await tx.$executeRaw`UPDATE v2_goods_receipt_lines SET inspection_disposition = ${input.disposition} WHERE id = ${lineId} AND organization_id = ${context.organizationId}`
      await tx.$executeRaw`INSERT INTO v2_receipt_inspections (id, organization_id, goods_receipt_line_id, disposition, findings, inspected_by) VALUES (${identifier('inspect')}, ${context.organizationId}, ${lineId}, ${input.disposition}, ${JSON.stringify(input.findings)}::jsonb, ${context.userId})`
      if (input.disposition === 'RETURN') {
        await tx.$executeRaw`INSERT INTO v2_inventory_movements (id, organization_id, lot_id, material_id, movement_type, quantity_delta_g, reference_type, reference_id, idempotency_key, actor_user_id) VALUES (${identifier('move')}, ${context.organizationId}, ${line.lotId}, ${line.materialId}, 'RETURN', ${-asNumber(line.quantityGrams)}, 'GOODS_RECEIPT_LINE', ${lineId}, ${`${idempotencyKey}:return`}, ${context.userId})`
        await tx.$executeRaw`INSERT INTO v2_return_authorizations (id, organization_id, goods_receipt_line_id, inventory_lot_id, reason, created_by) VALUES (${identifier('rma')}, ${context.organizationId}, ${lineId}, ${line.lotId}, ${input.reason ?? 'Inspection return'}, ${context.userId})`
      }
      await this.audit(tx, context, 'lab_ops.goods_receipt.inspect', 'allowed', 'goods_receipt_line', lineId, input)
      return { id: lineId, disposition: input.disposition, lotStatus, qualityStatus: quality }
    })
  }

  async postLandedCost(context: PlatformContext, receiptId: string, idempotencyKey?: string) {
    await this.require(context, 'procurement.receive')
    return this.idempotent(context, 'procurement.receipts.landed_cost', idempotencyKey, { receiptId }, async (tx) => {
      const receipt = await tx.$queryRaw<Array<{ freight: Prisma.Decimal; duty: Prisma.Decimal; insurance: Prisma.Decimal; currency: string }>>`
        SELECT freight_cost AS freight, duty_cost AS duty, insurance_cost AS insurance, currency FROM v2_goods_receipts WHERE id = ${receiptId} AND organization_id = ${context.organizationId} FOR UPDATE
      `
      if (!receipt.length) throw new PlatformError('RECEIPT_NOT_FOUND', 'The selected receipt is not available in this workspace.', 404)
      const lines = await tx.$queryRaw<Array<{ id: string; lotId: string; quantityGrams: Prisma.Decimal; unitPrice: Prisma.Decimal | null }>>`
        SELECT id, inventory_lot_id AS "lotId", quantity_g AS "quantityGrams", unit_price AS "unitPrice" FROM v2_goods_receipt_lines WHERE goods_receipt_id = ${receiptId} AND organization_id = ${context.organizationId}
      `
      const alreadyPosted = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_landed_cost_allocations WHERE goods_receipt_id = ${receiptId} AND organization_id = ${context.organizationId} LIMIT 1`
      if (alreadyPosted.length) throw new PlatformError('LANDED_COST_ALREADY_POSTED', 'Landed cost was already posted for this receipt.', 409)
      const cost = asNumber(receipt[0].freight) + asNumber(receipt[0].duty) + asNumber(receipt[0].insurance)
      const allocated = allocateLandedCost(lines.map((line) => ({ id: line.id, quantityGrams: asNumber(line.quantityGrams), receivedValue: asNumber(line.quantityGrams) * asNumber(line.unitPrice) })), cost)
      for (const entry of allocated) {
        const source = lines.find((line) => line.id === entry.id)!
        // Receipt lines are normalized to grams before posting; unit prices are therefore stored per gram.
        const baseUnitCost = asNumber(source.unitPrice)
        const landedUnitCost = baseUnitCost + entry.landedUnitCost
        await tx.$executeRaw`
          INSERT INTO v2_landed_cost_allocations (id, organization_id, goods_receipt_id, goods_receipt_line_id, inventory_lot_id, allocated_cost, landed_unit_cost, currency, posted_by)
          VALUES (${identifier('landed')}, ${context.organizationId}, ${receiptId}, ${entry.id}, ${source.lotId}, ${entry.allocatedCost}, ${landedUnitCost}, ${receipt[0].currency}, ${context.userId})
        `
        await tx.$executeRaw`UPDATE v2_inventory_lots SET landed_unit_cost = ${landedUnitCost}, currency = ${receipt[0].currency}, updated_at = now() WHERE id = ${source.lotId} AND organization_id = ${context.organizationId}`
      }
      await this.audit(tx, context, 'lab_ops.goods_receipt.landed_cost.post', 'allowed', 'goods_receipt', receiptId, { cost, allocation: allocated })
      return { receiptId, totalCost: cost, allocations: allocated }
    })
  }

  async createWeighingSession(context: PlatformContext, input: LabWeighingSessionInput, idempotencyKey?: string, hook?: LabWeighingCreateHook) {
    await this.require(context, 'inventory.consume')
    if (input.contextType === 'TRIAL' && !hook) throw new PlatformError('TRIAL_WEIGHING_WORKFLOW_REQUIRED', 'Trial weighing must be started from the Trial workflow.', 409)
    if (input.contextType === 'PRODUCTION' && !hook) throw new PlatformError('PRODUCTION_WEIGHING_WORKFLOW_REQUIRED', 'Production weighing must be started from the controlled Production workflow.', 409)
    return this.idempotent(context, 'inventory.weighing.create', idempotencyKey, input, async (tx) => {
      const id = identifier('weigh')
      const session = { id, contextType: input.contextType, contextId: input.contextId ?? null }
      await hook?.beforeCreate?.(tx, session, input)
      await tx.$executeRaw`INSERT INTO v2_lab_weighing_sessions (id, organization_id, context_type, context_id, created_by) VALUES (${id}, ${context.organizationId}, ${input.contextType}, ${input.contextId ?? null}, ${context.userId})`
      const lines: Array<{ id: string; materialId: string; requestedGrams: number }> = []
      for (const line of input.lines) {
        await this.material(tx, context, line.materialId, true)
        if (line.reservationId) {
          const reservations = await tx.$queryRaw<Array<{ lotId: string; materialId: string; quantityGrams: Prisma.Decimal; consumedGrams: Prisma.Decimal; status: string }>>`
            SELECT lot_id AS "lotId", material_id AS "materialId", quantity_g AS "quantityGrams", consumed_quantity_g AS "consumedGrams", status
            FROM v2_inventory_reservations WHERE id = ${line.reservationId} AND organization_id = ${context.organizationId} FOR UPDATE
          `
          const reservation = reservations[0]
          if (!reservation || reservation.status !== 'ACTIVE' || reservation.materialId !== line.materialId || (line.lotId && reservation.lotId !== line.lotId) || asNumber(reservation.quantityGrams) - asNumber(reservation.consumedGrams) + EPSILON < line.requestedGrams) {
            throw new PlatformError('RESERVATION_NOT_ELIGIBLE', 'The selected reservation cannot cover this weighing request.', 409)
          }
        }
        const lineId = identifier('weigh_line')
        await tx.$executeRaw`INSERT INTO v2_lab_weighing_lines (id, organization_id, session_id, material_id, lot_id, reservation_id, requested_g, actual_g, tolerance_g) VALUES (${lineId}, ${context.organizationId}, ${id}, ${line.materialId}, ${line.lotId ?? null}, ${line.reservationId ?? null}, ${line.requestedGrams}, ${line.actualGrams ?? null}, ${line.toleranceGrams})`
        lines.push({ id: lineId, materialId: line.materialId, requestedGrams: line.requestedGrams })
      }
      const integration = await hook?.afterCreate?.(tx, { ...session, status: 'PLANNED' }, lines)
      await this.audit(tx, context, 'lab_ops.weighing.create', 'allowed', 'weighing_session', id, input)
      return { id, status: 'PLANNED', lines, integration }
    })
  }

  async confirmWeighing(context: PlatformContext, sessionId: string, lines: Array<{ lineId: string; lotId: string; actualGrams: number }>, idempotencyKey?: string, hook?: LabWeighingConfirmationHook) {
    await this.require(context, 'inventory.consume')
    return this.idempotent(context, 'inventory.weighing.confirm', idempotencyKey, { sessionId, lines }, async (tx) => {
      const sessions = await tx.$queryRaw<Array<{ id: string; status: string; contextType: LabWeighingSessionInput['contextType']; contextId: string | null }>>`SELECT id, status, context_type AS "contextType", context_id AS "contextId" FROM v2_lab_weighing_sessions WHERE id = ${sessionId} AND organization_id = ${context.organizationId} FOR UPDATE`
      if (!sessions.length) throw new PlatformError('WEIGHING_NOT_FOUND', 'The weighing session is not available in this workspace.', 404)
      if (sessions[0].status !== 'PLANNED' && sessions[0].status !== 'IN_PROGRESS') throw new PlatformError('WEIGHING_ALREADY_CONFIRMED', 'This weighing session cannot be confirmed again.', 409)
      const session: LabWeighingSessionRecord = sessions[0]
      if (session.contextType === 'TRIAL' && !hook) throw new PlatformError('TRIAL_WEIGHING_WORKFLOW_REQUIRED', 'Trial weighing must be confirmed from the Trial workflow.', 409)
      if (session.contextType === 'PRODUCTION' && !hook) throw new PlatformError('PRODUCTION_WEIGHING_WORKFLOW_REQUIRED', 'Production weighing must be confirmed from the controlled Production workflow.', 409)
      const sessionLines = await tx.$queryRaw<Array<{ id: string; materialId: string; reservationId: string | null; requestedGrams: Prisma.Decimal; toleranceGrams: Prisma.Decimal }>>`
        SELECT id, material_id AS "materialId", reservation_id AS "reservationId", requested_g AS "requestedGrams", tolerance_g AS "toleranceGrams" FROM v2_lab_weighing_lines WHERE session_id = ${sessionId} AND organization_id = ${context.organizationId}
      `
      if (sessionLines.length !== lines.length) throw new PlatformError('WEIGHING_LINES_MISMATCH', 'Provide one actual amount for every weighing line.', 422)
      await hook?.beforeConfirm?.(tx, session, sessionLines.map((line) => ({ id: line.id, materialId: line.materialId, requestedGrams: asNumber(line.requestedGrams), toleranceGrams: asNumber(line.toleranceGrams) })))
      const confirmedLines: LabWeighingConfirmedLine[] = []
      for (const confirmed of lines) {
        const line = sessionLines.find((candidate) => candidate.id === confirmed.lineId)
        if (!line) throw new PlatformError('WEIGHING_LINES_MISMATCH', 'The weighing line is not part of this session.', 422)
        if (Math.abs(confirmed.actualGrams - asNumber(line.requestedGrams)) > asNumber(line.toleranceGrams) + EPSILON) throw new PlatformError('WEIGHING_TOLERANCE_EXCEEDED', 'Actual weight is outside the approved tolerance.', 422)
        const lot = await this.lot(tx, context, confirmed.lotId, true)
        if (lot.materialId !== line.materialId || lot.status !== 'AVAILABLE' || lot.qualityStatus !== 'PASSED' || (lot.expiresAt && lot.expiresAt.getTime() <= Date.now())) throw new PlatformError('LOT_NOT_ELIGIBLE', 'Choose an available, quality-approved, unexpired lot for the matching material.', 409)
        let reservationCapacity = 0
        if (line.reservationId) {
          const reservations = await tx.$queryRaw<Array<{ lotId: string; materialId: string; quantityGrams: Prisma.Decimal; consumedGrams: Prisma.Decimal; status: string }>>`
            SELECT lot_id AS "lotId", material_id AS "materialId", quantity_g AS "quantityGrams", consumed_quantity_g AS "consumedGrams", status
            FROM v2_inventory_reservations WHERE id = ${line.reservationId} AND organization_id = ${context.organizationId} FOR UPDATE
          `
          const reservation = reservations[0]
          if (!reservation || reservation.status !== 'ACTIVE' || reservation.lotId !== lot.id || reservation.materialId !== line.materialId || asNumber(reservation.quantityGrams) - asNumber(reservation.consumedGrams) + EPSILON < confirmed.actualGrams) {
            throw new PlatformError('RESERVATION_NOT_ELIGIBLE', 'The selected reservation no longer covers this weighing confirmation.', 409)
          }
          reservationCapacity = asNumber(reservation.quantityGrams) - asNumber(reservation.consumedGrams)
          const projection = await this.lotProjection(tx, context, lot.id)
          if (projection.availableGrams + reservationCapacity + EPSILON < confirmed.actualGrams) throw new PlatformError('LOT_INSUFFICIENT_STOCK', 'The selected lot does not have enough available stock.', 409)
          const nextConsumed = asNumber(reservation.consumedGrams) + confirmed.actualGrams
          await tx.$executeRaw`UPDATE v2_inventory_reservations SET consumed_quantity_g = ${nextConsumed}, status = ${nextConsumed + EPSILON >= asNumber(reservation.quantityGrams) ? 'CONSUMED' : 'ACTIVE'} WHERE id = ${line.reservationId} AND organization_id = ${context.organizationId}`
        } else {
          const projection = await this.lotProjection(tx, context, lot.id)
          if (projection.availableGrams + EPSILON < confirmed.actualGrams) throw new PlatformError('LOT_INSUFFICIENT_STOCK', 'The selected lot does not have enough available stock.', 409)
        }
        const movementId = identifier('move')
        await tx.$executeRaw`INSERT INTO v2_inventory_movements (id, organization_id, lot_id, material_id, movement_type, quantity_delta_g, reference_type, reference_id, idempotency_key, actor_user_id) VALUES (${movementId}, ${context.organizationId}, ${lot.id}, ${line.materialId}, 'CONSUMPTION', ${-confirmed.actualGrams}, 'LAB_WEIGHING', ${sessionId}, ${`${idempotencyKey}:${confirmed.lineId}`}, ${context.userId})`
        await tx.$executeRaw`UPDATE v2_lab_weighing_lines SET lot_id = ${lot.id}, actual_g = ${confirmed.actualGrams}, consumption_movement_id = ${movementId} WHERE id = ${line.id} AND organization_id = ${context.organizationId}`
        confirmedLines.push({ lineId: line.id, materialId: line.materialId, lotId: lot.id, actualGrams: confirmed.actualGrams, movementId, landedUnitCost: lot.landedUnitCost === null ? null : asNumber(lot.landedUnitCost), currency: lot.currency })
        const after = await this.lotProjection(tx, context, lot.id)
        if (after.onHandGrams <= EPSILON) await tx.$executeRaw`UPDATE v2_inventory_lots SET status = 'EXHAUSTED', updated_at = now() WHERE id = ${lot.id} AND organization_id = ${context.organizationId}`
      }
      await tx.$executeRaw`UPDATE v2_lab_weighing_sessions SET status = 'CONFIRMED', confirmed_by = ${context.userId}, confirmed_at = now(), updated_at = now() WHERE id = ${sessionId} AND organization_id = ${context.organizationId}`
      const integration = await hook?.afterConfirm?.(tx, { ...session, status: 'CONFIRMED' }, confirmedLines)
      await this.audit(tx, context, 'lab_ops.weighing.confirm', 'allowed', 'weighing_session', sessionId, { lines })
      return { id: sessionId, status: 'CONFIRMED', lines: confirmedLines, integration }
    })
  }

  async reserve(context: PlatformContext, input: { materialId: string; quantityGrams: number; contextType: 'PRODUCTION_OUTPUT' | 'SHIPMENT'; contextId: string; expiresAt?: string }, idempotencyKey?: string) {
    await this.require(context, 'inventory.reserve')
    return this.idempotent(context, 'inventory.reservations.create', idempotencyKey, input, async (tx) => {
      await this.material(tx, context, input.materialId, true)
      const lots = await this.fefoWithinTransaction(tx, context, input.materialId, input.quantityGrams)
      let remaining = input.quantityGrams
      const reservations: Array<{ id: string; lotId: string; quantityGrams: number }> = []
      for (const lot of lots) {
        await this.lot(tx, context, lot.lotId, true)
        const quantityGrams = Math.min(lot.availableGrams, remaining)
        remaining -= quantityGrams
        const id = identifier('reserve')
        await tx.$executeRaw`INSERT INTO v2_inventory_reservations (id, organization_id, lot_id, material_id, quantity_g, context_type, context_id, expires_at, created_by) VALUES (${id}, ${context.organizationId}, ${lot.lotId}, ${input.materialId}, ${quantityGrams}, ${input.contextType}, ${input.contextId}, ${input.expiresAt ? new Date(input.expiresAt) : null}, ${context.userId})`
        await tx.$executeRaw`INSERT INTO v2_inventory_movements (id, organization_id, lot_id, material_id, movement_type, quantity_delta_g, reference_type, reference_id, idempotency_key, actor_user_id) VALUES (${identifier('move')}, ${context.organizationId}, ${lot.lotId}, ${input.materialId}, 'RESERVE', 0, ${input.contextType}, ${input.contextId}, ${`${idempotencyKey}:${id}`}, ${context.userId})`
        reservations.push({ id, lotId: lot.lotId, quantityGrams })
      }
      await this.audit(tx, context, 'lab_ops.inventory.reserve', 'allowed', 'reservation', input.contextId, input)
      return { reservations }
    })
  }

  /**
   * Internal bridge for Production only. It intentionally has no standalone
   * HTTP route: production allocations must have a linked Production Order,
   * capability checks, lineage, and idempotency receipt from their caller.
   */
  async reserveProductionLots(context: PlatformContext, input: LabProductionReservationInput, idempotencyKey?: string, hook?: LabProductionReservationHook) {
    await this.require(context, 'inventory.reserve')
    if (!hook || input.contextType !== 'PRODUCTION') throw new PlatformError('PRODUCTION_RESERVATION_WORKFLOW_REQUIRED', 'Production lots must be reserved from the controlled Production workflow.', 409)
    if (!input.contextId || input.lines.length === 0 || input.lines.length > 500) throw new PlatformError('PRODUCTION_RESERVATION_INVALID', 'Provide a bounded controlled production reservation.', 422)
    return this.idempotent(context, 'inventory.reservations.production', idempotencyKey, input, async (tx) => {
      await hook.beforeReserve?.(tx, input)
      const seen = new Set<string>()
      const reservations: LabProductionReservation[] = []
      for (const line of input.lines) {
        if (!Number.isFinite(line.quantityGrams) || line.quantityGrams <= 0) throw new PlatformError('PRODUCTION_RESERVATION_INVALID', 'Every reserved production quantity must be positive.', 422)
        const identity = `${line.materialId}:${line.lotId}`
        if (seen.has(identity)) throw new PlatformError('PRODUCTION_RESERVATION_DUPLICATE_LOT', 'A material lot may appear only once in a controlled production reservation.', 422)
        seen.add(identity)
        await this.material(tx, context, line.materialId, true)
        const lot = await this.lot(tx, context, line.lotId, true)
        if (lot.materialId !== line.materialId || lot.status !== 'AVAILABLE' || lot.qualityStatus !== 'PASSED' || (lot.expiresAt && lot.expiresAt.getTime() <= Date.now())) {
          throw new PlatformError('LOT_NOT_ELIGIBLE', 'A selected production lot is not available, quality-approved, and unexpired.', 409)
        }
        const projection = await this.lotProjection(tx, context, lot.id)
        if (projection.availableGrams + EPSILON < line.quantityGrams) throw new PlatformError('LOT_INSUFFICIENT_STOCK', 'A selected production lot no longer has sufficient available stock.', 409)
        const id = identifier('reserve')
        await tx.$executeRaw`
          INSERT INTO v2_inventory_reservations (id, organization_id, lot_id, material_id, quantity_g, context_type, context_id, expires_at, created_by)
          VALUES (${id}, ${context.organizationId}, ${lot.id}, ${line.materialId}, ${line.quantityGrams}, 'PRODUCTION', ${input.contextId}, ${input.expiresAt ? new Date(input.expiresAt) : null}, ${context.userId})
        `
        await tx.$executeRaw`
          INSERT INTO v2_inventory_movements (id, organization_id, lot_id, material_id, movement_type, quantity_delta_g, reference_type, reference_id, idempotency_key, actor_user_id)
          VALUES (${identifier('move')}, ${context.organizationId}, ${lot.id}, ${line.materialId}, 'RESERVE', 0, 'PRODUCTION', ${input.contextId}, ${`${idempotencyKey}:${id}`}, ${context.userId})
        `
        reservations.push({ id, materialId: line.materialId, lotId: lot.id, quantityGrams: line.quantityGrams })
      }
      const integration = await hook.afterReserve?.(tx, reservations)
      await this.audit(tx, context, 'lab_ops.inventory.reserve.production', 'allowed', 'reservation', input.contextId, { reservationCount: reservations.length })
      return { reservations, integration }
    })
  }

  /**
   * Matches the controlled production allocation bridge above. Cancellation
   * releases every selected raw-material reservation in the same transaction
   * as the Production Order state transition, so a cancelled order cannot keep
   * stock silently reserved.
   */
  async releaseProductionReservations(context: PlatformContext, input: { contextId: string; reservationIds: string[] }, idempotencyKey?: string, hook?: LabProductionReservationReleaseHook) {
    await this.require(context, 'inventory.reserve')
    if (!hook || !input.contextId || input.reservationIds.length === 0 || input.reservationIds.length > 500) throw new PlatformError('PRODUCTION_RESERVATION_RELEASE_INVALID', 'Provide a bounded controlled production reservation release.', 422)
    const uniqueIds = [...new Set(input.reservationIds)]
    if (uniqueIds.length !== input.reservationIds.length) throw new PlatformError('PRODUCTION_RESERVATION_RELEASE_INVALID', 'A production reservation may be released only once per request.', 422)
    return this.idempotent(context, 'inventory.reservations.production.release', idempotencyKey, { ...input, reservationIds: uniqueIds }, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; materialId: string; lotId: string; quantityGrams: Prisma.Decimal; contextType: string; contextId: string; status: string }>>`
        SELECT id, material_id AS "materialId", lot_id AS "lotId", quantity_g AS "quantityGrams", context_type AS "contextType", context_id AS "contextId", status
        FROM v2_inventory_reservations
        WHERE organization_id = ${context.organizationId} AND id IN (${Prisma.join(uniqueIds)})
        ORDER BY id ASC FOR UPDATE
      `
      if (rows.length !== uniqueIds.length || rows.some((row) => row.contextType !== 'PRODUCTION' || row.contextId !== input.contextId || row.status !== 'ACTIVE')) {
        throw new PlatformError('PRODUCTION_RESERVATION_RELEASE_INVALID', 'Only active reservations belonging to this Production Order can be released.', 409)
      }
      const reservations: LabProductionReservation[] = rows.map((row) => ({ id: row.id, materialId: row.materialId, lotId: row.lotId, quantityGrams: asNumber(row.quantityGrams) }))
      await hook.beforeRelease?.(tx, reservations)
      for (const reservation of reservations) {
        await tx.$executeRaw`UPDATE v2_inventory_reservations SET status = 'RELEASED', released_at = now() WHERE id = ${reservation.id} AND organization_id = ${context.organizationId} AND status = 'ACTIVE'`
        await tx.$executeRaw`
          INSERT INTO v2_inventory_movements (id, organization_id, lot_id, material_id, movement_type, quantity_delta_g, reference_type, reference_id, idempotency_key, actor_user_id)
          VALUES (${identifier('move')}, ${context.organizationId}, ${reservation.lotId}, ${reservation.materialId}, 'RELEASE_RESERVATION', 0, 'PRODUCTION', ${input.contextId}, ${`${idempotencyKey}:${reservation.id}`}, ${context.userId})
        `
      }
      const integration = await hook.afterRelease?.(tx, reservations)
      await this.audit(tx, context, 'lab_ops.inventory.reserve.production.release', 'allowed', 'reservation', input.contextId, { reservationCount: reservations.length })
      return { reservations, integration }
    })
  }

  async releaseReservation(context: PlatformContext, reservationId: string, idempotencyKey?: string) {
    await this.require(context, 'inventory.reserve')
    return this.idempotent(context, 'inventory.reservations.release', idempotencyKey, { reservationId }, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; lotId: string; materialId: string; quantityGrams: Prisma.Decimal; contextType: string; contextId: string; status: string }>>`
        SELECT id, lot_id AS "lotId", material_id AS "materialId", quantity_g AS "quantityGrams", context_type AS "contextType", context_id AS "contextId", status
        FROM v2_inventory_reservations WHERE id = ${reservationId} AND organization_id = ${context.organizationId} FOR UPDATE
      `
      const reservation = rows[0]
      if (!reservation) throw new PlatformError('RESERVATION_NOT_FOUND', 'The selected reservation is not available in this workspace.', 404)
      if (reservation.status !== 'ACTIVE') throw new PlatformError('RESERVATION_NOT_ACTIVE', 'Only active reservations can be released.', 409)
      await tx.$executeRaw`UPDATE v2_inventory_reservations SET status = 'RELEASED', released_at = now() WHERE id = ${reservationId} AND organization_id = ${context.organizationId}`
      await tx.$executeRaw`INSERT INTO v2_inventory_movements (id, organization_id, lot_id, material_id, movement_type, quantity_delta_g, reference_type, reference_id, idempotency_key, actor_user_id) VALUES (${identifier('move')}, ${context.organizationId}, ${reservation.lotId}, ${reservation.materialId}, 'RELEASE_RESERVATION', 0, ${reservation.contextType}, ${reservation.contextId}, ${idempotencyKey}, ${context.userId})`
      await this.audit(tx, context, 'lab_ops.inventory.reservation.release', 'allowed', 'reservation', reservationId, { quantityGrams: asNumber(reservation.quantityGrams) })
      return { id: reservationId, status: 'RELEASED' }
    })
  }

  async expireReservations(context: PlatformContext, idempotencyKey?: string) {
    await this.require(context, 'inventory.reserve')
    return this.idempotent(context, 'inventory.reservations.expire', idempotencyKey, {}, async (tx) => {
      const reservations = await tx.$queryRaw<Array<{ id: string; lotId: string; materialId: string; contextType: string; contextId: string }>>`
        SELECT id, lot_id AS "lotId", material_id AS "materialId", context_type AS "contextType", context_id AS "contextId"
        FROM v2_inventory_reservations WHERE organization_id = ${context.organizationId} AND status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at <= now() FOR UPDATE
      `
      for (const reservation of reservations) {
        await tx.$executeRaw`UPDATE v2_inventory_reservations SET status = 'EXPIRED', released_at = now() WHERE id = ${reservation.id} AND organization_id = ${context.organizationId}`
        await tx.$executeRaw`INSERT INTO v2_inventory_movements (id, organization_id, lot_id, material_id, movement_type, quantity_delta_g, reference_type, reference_id, idempotency_key, actor_user_id) VALUES (${identifier('move')}, ${context.organizationId}, ${reservation.lotId}, ${reservation.materialId}, 'RELEASE_RESERVATION', 0, ${reservation.contextType}, ${reservation.contextId}, ${`${idempotencyKey}:${reservation.id}`}, ${context.userId})`
      }
      await this.audit(tx, context, 'lab_ops.inventory.reservations.expire', 'allowed', 'reservation_batch', context.organizationId, { count: reservations.length })
      return { expired: reservations.length }
    })
  }

  async transferLot(context: PlatformContext, lotId: string, input: { location: string; reason: string }, idempotencyKey?: string) {
    await this.require(context, 'inventory.transfer')
    return this.idempotent(context, 'inventory.lots.transfer', idempotencyKey, { lotId, ...input }, async (tx) => {
      const lot = await this.lot(tx, context, lotId, true)
      if (lot.location === input.location) throw new PlatformError('LOT_TRANSFER_NO_CHANGE', 'Select a different destination location.', 422)
      await tx.$executeRaw`UPDATE v2_inventory_lots SET location = ${input.location}, updated_at = now() WHERE id = ${lotId} AND organization_id = ${context.organizationId}`
      const movementId = identifier('move')
      await tx.$executeRaw`INSERT INTO v2_inventory_movements (id, organization_id, lot_id, material_id, movement_type, quantity_delta_g, reference_type, reference_id, idempotency_key, actor_user_id) VALUES (${movementId}, ${context.organizationId}, ${lotId}, ${lot.materialId}, 'TRANSFER', 0, 'LOCATION_TRANSFER', ${input.reason}, ${idempotencyKey}, ${context.userId})`
      await this.audit(tx, context, 'lab_ops.inventory.lot.transfer', 'allowed', 'inventory_lot', lotId, { from: lot.location, to: input.location, reason: input.reason })
      return { id: lotId, location: input.location, movementId }
    })
  }

  async adjustInventory(context: PlatformContext, input: { lotId: string; quantityDeltaGrams: number; reason: string; kind: 'ADJUSTMENT' | 'WASTE' }, idempotencyKey?: string) {
    await this.require(context, input.kind === 'WASTE' ? 'inventory.adjust' : 'inventory.adjust')
    return this.idempotent(context, 'inventory.adjustments.create', idempotencyKey, input, async (tx) => {
      const lot = await this.lot(tx, context, input.lotId, true)
      if (input.kind === 'WASTE' && input.quantityDeltaGrams > 0) throw new PlatformError('INVALID_WASTE_ADJUSTMENT', 'Waste must reduce stock.', 422)
      const projection = await this.lotProjection(tx, context, lot.id)
      if (projection.availableGrams + input.quantityDeltaGrams < -EPSILON) throw new PlatformError('LOT_INSUFFICIENT_STOCK', 'This adjustment would reduce stock below active reservations.', 409)
      const id = identifier('move')
      await tx.$executeRaw`INSERT INTO v2_inventory_movements (id, organization_id, lot_id, material_id, movement_type, quantity_delta_g, reference_type, reference_id, idempotency_key, actor_user_id) VALUES (${id}, ${context.organizationId}, ${lot.id}, ${lot.materialId}, ${input.kind}, ${input.quantityDeltaGrams}, 'CONTROLLED_ADJUSTMENT', ${input.reason}, ${idempotencyKey}, ${context.userId})`
      await this.audit(tx, context, 'lab_ops.inventory.adjust', 'allowed', 'inventory_lot', lot.id, input)
      return { id, lotId: lot.id, movementType: input.kind, quantityDeltaGrams: input.quantityDeltaGrams }
    })
  }

  private async fefoWithinTransaction(tx: Transaction, context: PlatformContext, materialId: string, targetGrams: number) {
    const lots = await tx.$queryRaw<LotRow[]>`
      SELECT id, material_id AS "materialId", status, quality_status AS "qualityStatus", expires_at AS "expiresAt", created_at AS "createdAt",
             supplier_id AS "supplierId", supplier_offer_id AS "supplierOfferId", supplier_lot AS "supplierLot", location, landed_unit_cost AS "landedUnitCost", currency
      FROM v2_inventory_lots WHERE organization_id = ${context.organizationId} AND material_id = ${materialId} FOR UPDATE
    `
    const candidates = await Promise.all(lots.map(async (lot) => ({ lotId: lot.id, materialId: lot.materialId, status: lot.status as 'AVAILABLE', qualityStatus: lot.qualityStatus as 'PASSED', expiresAt: iso(lot.expiresAt), createdAt: lot.createdAt.toISOString(), availableGrams: (await this.lotProjection(tx, context, lot.id)).availableGrams })))
    try { return selectFefo(candidates, materialId, targetGrams) }
    catch { throw new PlatformError('LOT_NOT_ELIGIBLE', 'No eligible quality-approved lot can satisfy the requested quantity.', 409) }
  }

  async reverseMovement(context: PlatformContext, movementId: string, idempotencyKey?: string, hook?: LabMovementReversalHook) {
    await this.require(context, 'inventory.reverse')
    return this.idempotent(context, 'inventory.movements.reverse', idempotencyKey, { movementId }, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; lotId: string; materialId: string; movementType: string; quantityDelta: Prisma.Decimal; reversalOfId: string | null; referenceId: string | null }>>`
        SELECT id, lot_id AS "lotId", material_id AS "materialId", movement_type AS "movementType", quantity_delta_g AS "quantityDelta", reversal_of_id AS "reversalOfId", reference_id AS "referenceId"
        FROM v2_inventory_movements WHERE id = ${movementId} AND organization_id = ${context.organizationId} FOR UPDATE
      `
      const original = rows[0]
      if (!original || original.reversalOfId || ['RESERVE', 'RELEASE_RESERVATION'].includes(original.movementType)) throw new PlatformError('MOVEMENT_NOT_REVERSIBLE', 'Only stock movements may be corrected with a compensating entry.', 409)
      if (original.referenceId) {
        const sessions = await tx.$queryRaw<Array<{ contextType: string }>>`SELECT context_type AS "contextType" FROM v2_lab_weighing_sessions WHERE id = ${original.referenceId} AND organization_id = ${context.organizationId}`
        if (sessions[0]?.contextType === 'TRIAL' && !hook) throw new PlatformError('TRIAL_REVERSAL_WORKFLOW_REQUIRED', 'Reverse Trial consumption through its controlled Trial workflow.', 409)
        if (sessions[0]?.contextType === 'PRODUCTION' && !hook) throw new PlatformError('PRODUCTION_REVERSAL_WORKFLOW_REQUIRED', 'Reverse Production consumption through its controlled Production workflow.', 409)
      }
      const reversed = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_inventory_movements WHERE organization_id = ${context.organizationId} AND reversal_of_id = ${movementId}`
      if (reversed.length) throw new PlatformError('MOVEMENT_ALREADY_REVERSED', 'This movement already has a compensating reversal.', 409)
      await this.lot(tx, context, original.lotId, true)
      const projection = await this.lotProjection(tx, context, original.lotId)
      const reversalDelta = -asNumber(original.quantityDelta)
      if (projection.onHandGrams + reversalDelta < -EPSILON || projection.availableGrams + reversalDelta < -EPSILON) {
        throw new PlatformError('MOVEMENT_REVERSAL_WOULD_BREAK_STOCK', 'This correction would make stock or an active reservation invalid.', 409)
      }
      const id = identifier('move')
      await tx.$executeRaw`INSERT INTO v2_inventory_movements (id, organization_id, lot_id, material_id, movement_type, quantity_delta_g, reference_type, reference_id, idempotency_key, actor_user_id, reversal_of_id) VALUES (${id}, ${context.organizationId}, ${original.lotId}, ${original.materialId}, 'ADJUSTMENT', ${reversalDelta}, 'MOVEMENT_REVERSAL', ${movementId}, ${idempotencyKey}, ${context.userId}, ${movementId})`
      // Consumption can be backed by a reservation. A compensating movement
      // must restore that reservation's remaining capacity before a controlled
      // Trial or Production correction can be weighed again.
      const consumedLines = await tx.$queryRaw<Array<{ reservationId: string | null; actualGrams: Prisma.Decimal | null }>>`
        SELECT reservation_id AS "reservationId", actual_g AS "actualGrams"
        FROM v2_lab_weighing_lines
        WHERE organization_id = ${context.organizationId} AND consumption_movement_id = ${movementId}
        LIMIT 1 FOR UPDATE
      `
      const consumedLine = consumedLines[0]
      if (consumedLine?.reservationId && consumedLine.actualGrams !== null) {
        const reservations = await tx.$queryRaw<Array<{ id: string; quantityGrams: Prisma.Decimal; consumedGrams: Prisma.Decimal; status: string }>>`
          SELECT id, quantity_g AS "quantityGrams", consumed_quantity_g AS "consumedGrams", status
          FROM v2_inventory_reservations
          WHERE id = ${consumedLine.reservationId} AND organization_id = ${context.organizationId}
          FOR UPDATE
        `
        const reservation = reservations[0]
        if (reservation && ['ACTIVE', 'CONSUMED'].includes(reservation.status)) {
          const nextConsumed = Math.max(0, asNumber(reservation.consumedGrams) - asNumber(consumedLine.actualGrams))
          await tx.$executeRaw`
            UPDATE v2_inventory_reservations
            SET consumed_quantity_g = ${nextConsumed}, status = ${nextConsumed + EPSILON >= asNumber(reservation.quantityGrams) ? 'CONSUMED' : 'ACTIVE'}
            WHERE id = ${reservation.id} AND organization_id = ${context.organizationId}
          `
        }
      }
      const integration = hook?.afterReverse ? await hook.afterReverse(tx, original, { id, reversalOfId: movementId }) : undefined
      await this.audit(tx, context, 'lab_ops.inventory.movement.reverse', 'allowed', 'inventory_movement', movementId, { reversalId: id })
      return { id, reversalOfId: movementId, ...(integration === undefined ? {} : { integration }) }
    })
  }
}
