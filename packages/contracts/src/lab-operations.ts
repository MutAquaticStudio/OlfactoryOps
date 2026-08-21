import { z } from 'zod'

const id = z.string().trim().min(1).max(160)
const nonNegative = z.number().finite().nonnegative()

export const materialStatusSchema = z.enum(['DRAFT', 'REVIEW_REQUIRED', 'ACTIVE', 'BLOCKED', 'ARCHIVED'])
// V2 Phase 2 deliberately has no shared/global catalogue. A later governed
// import may add a scope only with an explicit migration and review policy.
export const materialScopeSchema = z.literal('TENANT')
export const complianceStatusSchema = z.enum(['APPROVED', 'REVIEW_REQUIRED', 'BLOCKED', 'NOT_EVALUATED'])
export const supplierStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'])
export const supplierOfferStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'ARCHIVED'])
export const inventoryLotStatusSchema = z.enum(['QUARANTINE', 'AVAILABLE', 'HOLD', 'REJECTED', 'EXHAUSTED', 'EXPIRED', 'ARCHIVED'])
export const qualityStatusSchema = z.enum(['PENDING', 'PASSED', 'FAILED', 'NOT_REQUIRED'])
export const movementTypeSchema = z.enum(['RECEIPT', 'TRANSFER', 'RESERVE', 'RELEASE_RESERVATION', 'CONSUMPTION', 'ADJUSTMENT', 'RETURN', 'WASTE'])
export const reservationStatusSchema = z.enum(['ACTIVE', 'RELEASED', 'CONSUMED', 'EXPIRED', 'CANCELLED'])
export const weighingStatusSchema = z.enum(['PLANNED', 'IN_PROGRESS', 'CONFIRMED', 'ABORTED', 'CORRECTED'])
export const purchaseRequestStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'])
export const purchaseOrderStatusSchema = z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'])
export const shipmentStatusSchema = z.enum(['PLANNED', 'IN_TRANSIT', 'DELIVERED', 'LOST', 'CANCELLED'])
export const receiptStatusSchema = z.enum(['DRAFT', 'RECEIVED', 'INSPECTING', 'CLOSED', 'RETURNED'])
export const inspectionDispositionSchema = z.enum(['PENDING', 'ACCEPT', 'REJECT', 'RETURN', 'HOLD', 'REVIEW_REQUIRED'])

export const materialCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  internalCode: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(2000).optional(),
  sensoryMetadata: z.record(z.string(), z.unknown()).optional(),
  identifiers: z.array(z.object({ type: z.enum(['CAS', 'INCI', 'FEMA', 'EINECS', 'CUSTOM']), value: z.string().trim().min(1).max(160), source: z.string().trim().max(240).optional() })).max(40).default([]),
})
export type MaterialCreateInput = z.infer<typeof materialCreateSchema>
export const materialUpdateSchema = materialCreateSchema.pick({ name: true, internalCode: true, description: true, sensoryMetadata: true }).partial().refine((value) => Object.keys(value).length > 0, 'At least one material field is required.')
export const materialDocumentCreateSchema = z.object({
  kind: z.enum(['SDS', 'COA', 'SPECIFICATION', 'COMPLIANCE', 'OTHER']),
  objectRef: z.string().trim().min(1).max(500),
  contentHash: z.string().trim().min(8).max(256).optional(),
  version: z.string().trim().max(120).optional(),
})

export const complianceFacetSchema = z.object({
  jurisdiction: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(80),
  status: complianceStatusSchema,
  source: z.string().trim().min(1).max(240),
  sourceVersion: z.string().trim().min(1).max(120),
  effectiveDate: z.string().datetime({ offset: true }).optional(),
  limits: z.record(z.string(), z.unknown()).default({}),
  evidenceRef: z.string().trim().max(500).optional(),
})
export type ComplianceFacet = z.infer<typeof complianceFacetSchema>

export const supplierCreateSchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  tradeName: z.string().trim().max(200).optional(),
  primaryEmail: z.string().email().max(320).optional(),
  primaryPhone: z.string().trim().max(80).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  leadTimeDays: z.number().int().min(0).max(3650).optional(),
  paymentTerms: z.record(z.string(), z.unknown()).default({}),
})
export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>
export const supplierDocumentCreateSchema = z.object({
  kind: z.enum(['CERTIFICATE', 'SPECIFICATION', 'QUALITY', 'OTHER']),
  objectRef: z.string().trim().min(1).max(500),
  contentHash: z.string().trim().min(8).max(256).optional(),
  version: z.string().trim().max(120).optional(),
})

export const supplierOfferCreateSchema = z.object({
  supplierId: id,
  materialId: id,
  productCode: z.string().trim().min(1).max(160),
  tradeName: z.string().trim().max(200).optional(),
  grade: z.string().trim().max(120).optional(),
  minimumOrderQuantity: nonNegative,
  unit: z.enum(['G', 'KG']).default('G'),
  unitPrice: nonNegative,
  currency: z.string().regex(/^[A-Z]{3}$/),
  leadTimeDays: z.number().int().min(0).max(3650).optional(),
  packSize: nonNegative.optional(),
  validFrom: z.string().datetime({ offset: true }).optional(),
  validUntil: z.string().datetime({ offset: true }).optional(),
})
export type SupplierOfferCreateInput = z.infer<typeof supplierOfferCreateSchema>
export const supplierOfferPriceSchema = z.object({
  unitPrice: nonNegative,
  currency: z.string().regex(/^[A-Z]{3}$/),
  validFrom: z.string().datetime({ offset: true }).optional(),
  validUntil: z.string().datetime({ offset: true }).optional(),
  reason: z.string().trim().min(3).max(500),
})

export const inventoryLotCreateSchema = z.object({
  materialId: id,
  supplierId: id.optional(),
  supplierOfferId: id.optional(),
  supplierLot: z.string().trim().max(160).optional(),
  receivedAt: z.string().datetime({ offset: true }),
  manufacturedAt: z.string().datetime({ offset: true }).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  location: z.string().trim().min(1).max(160),
  landedUnitCost: nonNegative.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
})
export type InventoryLotCreateInput = z.infer<typeof inventoryLotCreateSchema>

export const receiptLineInputSchema = z.object({
  materialId: id,
  supplierOfferId: id.optional(),
  supplierLot: z.string().trim().max(160).optional(),
  quantity: z.number().finite().positive(),
  unit: z.enum(['G', 'KG']).default('G'),
  location: z.string().trim().min(1).max(160),
  manufacturedAt: z.string().datetime({ offset: true }).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  unitPrice: nonNegative.optional(),
})
export type ReceiptLineInput = z.infer<typeof receiptLineInputSchema>

export const labWeighingLineSchema = z.object({
  materialId: id,
  requestedGrams: z.number().finite().positive(),
  lotId: id.optional(),
  reservationId: id.optional(),
  actualGrams: z.number().finite().positive().optional(),
  toleranceGrams: nonNegative.default(0),
})
export type LabWeighingLine = z.infer<typeof labWeighingLineSchema>

export const materialStatusChangeSchema = z.object({ status: materialStatusSchema })
export const supplierStatusChangeSchema = z.object({ status: supplierStatusSchema })
export const supplierOfferStatusChangeSchema = z.object({ status: supplierOfferStatusSchema })
export const purchaseRequestCreateSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(z.object({ materialId: id, requestedGrams: z.number().finite().positive(), preferredSupplierId: id.optional(), requiredAt: z.string().datetime({ offset: true }).optional(), reason: z.string().trim().max(1000).optional() })).min(1).max(200),
})
export const purchaseRequestStatusChangeSchema = z.object({ status: purchaseRequestStatusSchema })
export const purchaseOrderCreateSchema = z.object({
  supplierId: id,
  purchaseRequestId: id.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  lines: z.array(z.object({ materialId: id, supplierOfferId: id.optional(), orderedGrams: z.number().finite().positive(), unitPrice: nonNegative.optional() })).min(1).max(200),
})
export const purchaseOrderStatusChangeSchema = z.object({ status: purchaseOrderStatusSchema })
export const shipmentCreateSchema = z.object({
  purchaseOrderId: id,
  carrier: z.string().trim().max(160).optional(),
  trackingReference: z.string().trim().max(240).optional(),
  shippedAt: z.string().datetime({ offset: true }).optional(),
})
export const shipmentStatusChangeSchema = z.object({ status: shipmentStatusSchema, deliveredAt: z.string().datetime({ offset: true }).optional() })
export const goodsReceiptCreateSchema = z.object({
  purchaseOrderId: id.optional(),
  shipmentId: id.optional(),
  freightCost: nonNegative.default(0),
  dutyCost: nonNegative.default(0),
  insuranceCost: nonNegative.default(0),
  currency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  lines: z.array(receiptLineInputSchema).min(1).max(200),
})
export const inspectionCreateSchema = z.object({
  disposition: z.enum(['ACCEPT', 'REJECT', 'RETURN', 'HOLD', 'REVIEW_REQUIRED']),
  findings: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().trim().min(1).max(1000).optional(),
})
export const landedCostPostSchema = z.object({}).strict()
export const labWeighingSessionCreateSchema = z.object({
  contextType: z.enum(['FORMULA', 'TRIAL', 'PRODUCTION', 'AD_HOC']).default('AD_HOC'),
  contextId: id.optional(),
  lines: z.array(labWeighingLineSchema).min(1).max(100),
})
export const labWeighingConfirmSchema = z.object({
  lines: z.array(z.object({ lineId: id, lotId: id, actualGrams: z.number().finite().positive() })).min(1).max(100),
})
export const inventoryReservationCreateSchema = z.object({
  materialId: id,
  quantityGrams: z.number().finite().positive(),
  contextType: z.enum(['PRODUCTION_OUTPUT', 'SHIPMENT']),
  contextId: id,
  expiresAt: z.string().datetime({ offset: true }).optional(),
})
export const inventoryAdjustmentCreateSchema = z.object({
  lotId: id,
  quantityDeltaGrams: z.number().finite().refine((value) => value !== 0, 'Adjustment cannot be zero.'),
  reason: z.string().trim().min(3).max(1000),
  kind: z.enum(['ADJUSTMENT', 'WASTE']).default('ADJUSTMENT'),
})
export const inventoryTransferSchema = z.object({
  location: z.string().trim().min(1).max(160),
  reason: z.string().trim().min(3).max(1000),
})

export type FefoCandidate = {
  lotId: string
  materialId: string
  status: z.infer<typeof inventoryLotStatusSchema>
  qualityStatus: z.infer<typeof qualityStatusSchema>
  expiresAt?: string
  availableGrams: number
  createdAt: string
}

export type LotProjection = {
  receivedGrams: number
  consumedGrams: number
  reservedGrams: number
  wastedGrams: number
  returnedGrams: number
  onHandGrams: number
  availableGrams: number
}
