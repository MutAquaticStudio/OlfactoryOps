import { z } from 'zod'

const id = z.string().trim().min(1).max(160)
const requiredText = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) => z.string().trim().max(max).optional()
const quantity = z.number().finite().positive().max(1_000_000_000)
const money = z.number().finite().nonnegative().max(1_000_000_000)
const currency = z.string().trim().regex(/^[A-Z]{3}$/)
const iso = z.string().datetime({ offset: true })

export const customerStatusSchema = z.enum(['ACTIVE', 'ON_HOLD', 'ARCHIVED'])
export const customerAddressKindSchema = z.enum(['BILLING', 'SHIPPING'])
export const commerceProductStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED'])
export const commerceProductKindSchema = z.enum(['FINISHED_GOOD', 'SERVICE'])
export const quoteStatusSchema = z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'])
export const salesOrderStatusSchema = z.enum(['DRAFT', 'CONFIRMED', 'ALLOCATING', 'PARTIALLY_ALLOCATED', 'ALLOCATED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED', 'CLOSED'])
export const salesReservationStatusSchema = z.enum(['ACTIVE', 'RELEASED', 'CONSUMED', 'EXPIRED'])
export const fulfillmentStatusSchema = z.enum(['DRAFT', 'PICKING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
export const returnStatusSchema = z.enum(['REQUESTED', 'AUTHORIZED', 'RECEIVED', 'INSPECTING', 'DISPOSITIONED', 'CLOSED', 'REJECTED', 'CANCELLED'])
export const customerCreateRequestSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9._-]{1,63}$/).optional(),
  name: requiredText(200),
  status: customerStatusSchema.default('ACTIVE'),
  paymentTerms: optionalText(160),
  commercialNotes: optionalText(2_000),
}).strict()
export type CustomerCreateRequest = z.infer<typeof customerCreateRequestSchema>

export const customerContactRequestSchema = z.object({
  name: requiredText(160),
  email: z.string().trim().email().max(320).optional(),
  phone: optionalText(80),
  roleLabel: optionalText(120),
  primary: z.boolean().default(false),
}).strict().refine((value) => Boolean(value.email || value.phone), 'A contact needs email or phone.')
export type CustomerContactRequest = z.infer<typeof customerContactRequestSchema>

export const customerAddressRequestSchema = z.object({
  kind: customerAddressKindSchema,
  label: requiredText(120),
  recipientName: requiredText(160),
  line1: requiredText(200),
  line2: optionalText(200),
  city: requiredText(120),
  region: optionalText(120),
  postalCode: optionalText(40),
  countryCode: z.string().trim().regex(/^[A-Z]{2}$/),
  primary: z.boolean().default(false),
}).strict()
export type CustomerAddressRequest = z.infer<typeof customerAddressRequestSchema>

export const commerceProductCreateRequestSchema = z.object({
  name: requiredText(200),
  sku: z.string().trim().regex(/^[A-Z0-9][A-Z0-9._-]{1,79}$/),
  kind: commerceProductKindSchema.default('FINISHED_GOOD'),
  status: commerceProductStatusSchema.default('DRAFT'),
  formulaVersionId: id.optional(),
  description: optionalText(2_000),
  packSizeGrams: quantity.optional(),
  packLabel: optionalText(120),
  availabilityPolicy: z.enum(['RELEASED_LOTS_ONLY', 'ALLOW_BACKORDER']).default('RELEASED_LOTS_ONLY'),
}).strict().superRefine((value, context) => {
  if (value.kind === 'FINISHED_GOOD' && !value.formulaVersionId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['formulaVersionId'], message: 'A finished-good SKU must pin an approved Formula Version.' })
  }
  if (value.kind === 'FINISHED_GOOD' && !value.packSizeGrams) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['packSizeGrams'], message: 'A finished-good SKU must define a positive pack size.' })
  }
  if (value.kind === 'SERVICE' && value.formulaVersionId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['formulaVersionId'], message: 'A service SKU cannot attach a Formula Version.' })
  }
  if (value.kind === 'SERVICE' && (value.packSizeGrams || value.packLabel)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['packSizeGrams'], message: 'A service SKU cannot carry a finished-good pack configuration.' })
  }
})
export type CommerceProductCreateRequest = z.infer<typeof commerceProductCreateRequestSchema>

export const productPriceSetRequestSchema = z.object({
  currency,
  unitPrice: money,
  effectiveFrom: iso.optional(),
  effectiveUntil: iso.optional(),
}).strict().superRefine((value, context) => {
  if (value.effectiveFrom && value.effectiveUntil && value.effectiveUntil <= value.effectiveFrom) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveUntil'], message: 'The end of a price period must follow its start.' })
  }
})
export type ProductPriceSetRequest = z.infer<typeof productPriceSetRequestSchema>

const commercialLineSchema = z.object({
  productId: id,
  quantity: quantity,
  unitPrice: money.optional(),
  currency: currency.optional(),
  notes: optionalText(500),
}).strict()

export const quoteCreateRequestSchema = z.object({
  customerId: id,
  currency,
  validUntil: iso,
  paymentTerms: optionalText(160),
  shippingTerms: optionalText(160),
  notes: optionalText(2_000),
  lines: z.array(commercialLineSchema).min(1).max(200),
}).strict().superRefine((value, context) => {
  if (new Date(value.validUntil).getTime() <= Date.now()) context.addIssue({ code: z.ZodIssueCode.custom, path: ['validUntil'], message: 'Quote validity must be in the future.' })
  if (new Set(value.lines.map((line) => line.productId)).size !== value.lines.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['lines'], message: 'A product may appear only once in a quote.' })
})
export type QuoteCreateRequest = z.infer<typeof quoteCreateRequestSchema>

export const quoteTransitionRequestSchema = z.object({ rationale: optionalText(2_000) }).strict()
export type QuoteTransitionRequest = z.infer<typeof quoteTransitionRequestSchema>

export const salesOrderCreateRequestSchema = z.object({
  customerId: id,
  quoteId: id.optional(),
  currency,
  billingAddressId: id.optional(),
  shippingAddressId: id.optional(),
  paymentTerms: optionalText(160),
  shippingTerms: optionalText(160),
  requestedDeliveryAt: iso.optional(),
  notes: optionalText(2_000),
  lines: z.array(commercialLineSchema).min(1).max(200).optional(),
}).strict().superRefine((value, context) => {
  if (!value.quoteId && !value.lines?.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['lines'], message: 'An order needs accepted quote lines or direct commercial lines.' })
  if (value.lines && new Set(value.lines.map((line) => line.productId)).size !== value.lines.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['lines'], message: 'A product may appear only once in an order.' })
})
export type SalesOrderCreateRequest = z.infer<typeof salesOrderCreateRequestSchema>

export const salesAllocationLineSchema = z.object({
  orderLineId: id,
  finishedGoodLotId: id,
  quantityGrams: quantity,
}).strict()
export const salesOrderAllocationRequestSchema = z.object({ lines: z.array(salesAllocationLineSchema).min(1).max(400) }).strict().superRefine((value, context) => {
  if (new Set(value.lines.map((line) => `${line.orderLineId}:${line.finishedGoodLotId}`)).size !== value.lines.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['lines'], message: 'A lot may be allocated once per order line.' })
})
export type SalesOrderAllocationRequest = z.infer<typeof salesOrderAllocationRequestSchema>

export const fulfillmentCreateRequestSchema = z.object({
  carrier: optionalText(120),
  service: optionalText(120),
  trackingNumber: optionalText(200),
  packageCount: z.number().int().positive().max(10_000).default(1),
  lines: z.array(z.object({ reservationId: id, quantityGrams: quantity }).strict()).min(1).max(400),
  notes: optionalText(1_000),
}).strict().superRefine((value, context) => {
  if (new Set(value.lines.map((line) => line.reservationId)).size !== value.lines.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['lines'], message: 'A reservation may appear only once in a fulfillment.' })
})
export type FulfillmentCreateRequest = z.infer<typeof fulfillmentCreateRequestSchema>

export const fulfillmentTransitionRequestSchema = z.object({
  occurredAt: iso.optional(),
  trackingNumber: optionalText(200),
  rationale: optionalText(1_000),
}).strict()
export type FulfillmentTransitionRequest = z.infer<typeof fulfillmentTransitionRequestSchema>

export const salesOrderCancelRequestSchema = z.object({ rationale: requiredText(2_000) }).strict()
export type SalesOrderCancelRequest = z.infer<typeof salesOrderCancelRequestSchema>

export const salesOrderCloseRequestSchema = z.object({ rationale: requiredText(2_000) }).strict()
export type SalesOrderCloseRequest = z.infer<typeof salesOrderCloseRequestSchema>

export const returnRequestCreateSchema = z.object({
  orderId: id,
  reason: requiredText(2_000),
  lines: z.array(z.object({ orderLineId: id, quantityGrams: quantity }).strict()).min(1).max(200),
}).strict().superRefine((value, context) => {
  if (new Set(value.lines.map((line) => line.orderLineId)).size !== value.lines.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['lines'], message: 'A sales-order line may appear only once in a return request.' })
  }
})
export type ReturnRequestCreate = z.infer<typeof returnRequestCreateSchema>

export const returnAuthorizeRequestSchema = z.object({ rationale: requiredText(2_000) }).strict()
export type ReturnAuthorizeRequest = z.infer<typeof returnAuthorizeRequestSchema>

export const returnReceiveRequestSchema = z.object({
  lines: z.array(z.object({ returnLineId: id, finishedGoodLotId: id, quantityGrams: quantity }).strict()).min(1).max(200),
  inspectionNotes: optionalText(2_000),
}).strict().superRefine((value, context) => {
  if (new Set(value.lines.map((line) => `${line.returnLineId}:${line.finishedGoodLotId}`)).size !== value.lines.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['lines'], message: 'A return line and finished-good lot pair may be received only once per request.' })
  }
})
export type ReturnReceiveRequest = z.infer<typeof returnReceiveRequestSchema>

export const returnDispositionSchema = z.enum(['HOLD_FOR_QUALITY', 'REJECT_TO_WASTE', 'RELEASE_TO_AVAILABLE'])
export const returnDispositionRequestSchema = z.object({
  disposition: returnDispositionSchema,
  rationale: requiredText(2_000),
  evidenceDocumentSnapshotIds: z.array(id).min(1).max(40),
}).strict().superRefine((value, context) => {
  if (new Set(value.evidenceDocumentSnapshotIds).size !== value.evidenceDocumentSnapshotIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidenceDocumentSnapshotIds'], message: 'Each quality evidence document may appear only once.' })
  }
})
export type ReturnDispositionRequest = z.infer<typeof returnDispositionRequestSchema>

export const returnCloseRequestSchema = z.object({ rationale: requiredText(2_000) }).strict()
export type ReturnCloseRequest = z.infer<typeof returnCloseRequestSchema>

export const commerceDocumentCreateRequestSchema = z.object({
  documentKind: z.enum(['QUOTE', 'ORDER_CONFIRMATION', 'PACKING_LIST', 'SHIPMENT_STATUS', 'RETURN_AUTHORIZATION', 'RETURN_QC']),
  objectRef: z.string().trim().min(1).max(2_048),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  subjectType: z.enum(['QUOTE', 'ORDER', 'FULFILLMENT', 'RETURN']),
  subjectId: id,
}).strict().superRefine((value, context) => {
  const allowed: Record<typeof value.subjectType, ReadonlyArray<typeof value.documentKind>> = {
    QUOTE: ['QUOTE'],
    ORDER: ['ORDER_CONFIRMATION', 'PACKING_LIST'],
    FULFILLMENT: ['PACKING_LIST', 'SHIPMENT_STATUS'],
    RETURN: ['RETURN_AUTHORIZATION', 'RETURN_QC'],
  }
  if (!allowed[value.subjectType].includes(value.documentKind)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['documentKind'], message: 'This document kind cannot be attached to the selected commerce record.' })
  }
})
export type CommerceDocumentCreateRequest = z.infer<typeof commerceDocumentCreateRequestSchema>
