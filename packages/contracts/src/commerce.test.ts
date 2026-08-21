import { describe, expect, it } from 'vitest'
import {
  commerceDocumentCreateRequestSchema,
  commerceProductCreateRequestSchema,
  quoteCreateRequestSchema,
  returnDispositionRequestSchema,
  returnRequestCreateSchema,
  returnReceiveRequestSchema,
  salesOrderAllocationRequestSchema,
  salesOrderCreateRequestSchema,
} from './commerce.js'

describe('Phase 10 commerce contracts', () => {
  const finishedGood = {
    name: 'Eau de Parfum 50 ml',
    sku: 'EDP-50-01',
    kind: 'FINISHED_GOOD' as const,
    formulaVersionId: 'formula-version-1',
    packSizeGrams: 50,
  }

  it('requires a formula and pack configuration for finished goods while keeping services non-formulated', () => {
    expect(commerceProductCreateRequestSchema.safeParse(finishedGood).success).toBe(true)
    expect(commerceProductCreateRequestSchema.safeParse({ ...finishedGood, packSizeGrams: undefined }).success).toBe(false)
    expect(commerceProductCreateRequestSchema.safeParse({ ...finishedGood, formulaVersionId: undefined }).success).toBe(false)
    expect(commerceProductCreateRequestSchema.safeParse({ name: 'Consultation', sku: 'SVC-01', kind: 'SERVICE', packSizeGrams: 1 }).success).toBe(false)
    expect(commerceProductCreateRequestSchema.safeParse({ name: 'Consultation', sku: 'SVC-01', kind: 'SERVICE' }).success).toBe(true)
  })

  it('keeps quotes and direct orders bounded and internally consistent', () => {
    expect(quoteCreateRequestSchema.safeParse({
      customerId: 'customer-1', currency: 'USD', validUntil: '2000-01-01T00:00:00.000Z',
      lines: [{ productId: 'product-1', quantity: 1 }],
    }).success).toBe(false)
    expect(salesOrderCreateRequestSchema.safeParse({ customerId: 'customer-1', currency: 'USD' }).success).toBe(false)
    expect(salesOrderCreateRequestSchema.safeParse({
      customerId: 'customer-1', currency: 'USD', quoteId: 'quote-1',
    }).success).toBe(true)
  })

  it('rejects duplicate allocation and duplicate receipt of one return line-lot pair while allowing split-lot receipts', () => {
    expect(salesOrderAllocationRequestSchema.safeParse({
      lines: [
        { orderLineId: 'line-1', finishedGoodLotId: 'lot-1', quantityGrams: 10 },
        { orderLineId: 'line-1', finishedGoodLotId: 'lot-1', quantityGrams: 5 },
      ],
    }).success).toBe(false)
    expect(returnReceiveRequestSchema.safeParse({
      lines: [
        { returnLineId: 'return-line-1', finishedGoodLotId: 'lot-1', quantityGrams: 10 },
        { returnLineId: 'return-line-1', finishedGoodLotId: 'lot-1', quantityGrams: 5 },
      ],
    }).success).toBe(false)
    expect(returnReceiveRequestSchema.safeParse({
      lines: [
        { returnLineId: 'return-line-1', finishedGoodLotId: 'lot-1', quantityGrams: 10 },
        { returnLineId: 'return-line-1', finishedGoodLotId: 'lot-2', quantityGrams: 5 },
      ],
    }).success).toBe(true)
    expect(returnReceiveRequestSchema.safeParse({
      lines: [{ returnLineId: 'return-line-1', finishedGoodLotId: 'lot-1', quantityGrams: 10, disposition: 'RESTOCK' }],
    }).success).toBe(false)
  })

  it('rejects duplicate sales-order lines before creating a return aggregate', () => {
    expect(returnRequestCreateSchema.safeParse({
      orderId: 'order-1', reason: 'Customer return has two parcel records.',
      lines: [{ orderLineId: 'line-1', quantityGrams: 5 }, { orderLineId: 'line-1', quantityGrams: 5 }],
    }).success).toBe(false)
  })

  it('requires an evidence-backed explicit quality disposition and keeps duplicate evidence out', () => {
    expect(returnDispositionRequestSchema.safeParse({
      disposition: 'RELEASE_TO_AVAILABLE', rationale: 'QC release evidence is approved.', evidenceDocumentSnapshotIds: ['document-1'],
    }).success).toBe(true)
    expect(returnDispositionRequestSchema.safeParse({
      disposition: 'REJECT_TO_WASTE', rationale: 'QC failed.', evidenceDocumentSnapshotIds: [],
    }).success).toBe(false)
    expect(returnDispositionRequestSchema.safeParse({
      disposition: 'HOLD_FOR_QUALITY', rationale: 'Additional review required.', evidenceDocumentSnapshotIds: ['document-1', 'document-1'],
    }).success).toBe(false)
  })

  it('limits customer-facing document kinds to their correct aggregate', () => {
    expect(commerceDocumentCreateRequestSchema.safeParse({
      documentKind: 'QUOTE', objectRef: 'r2://commerce/quote.pdf', contentHash: 'a'.repeat(64), subjectType: 'QUOTE', subjectId: 'quote-1',
    }).success).toBe(true)
    expect(commerceDocumentCreateRequestSchema.safeParse({
      documentKind: 'QUOTE', objectRef: 'r2://commerce/order.pdf', contentHash: 'a'.repeat(64), subjectType: 'ORDER', subjectId: 'order-1',
    }).success).toBe(false)
    expect(commerceDocumentCreateRequestSchema.safeParse({
      documentKind: 'RETURN_QC', objectRef: 'r2://commerce/return-qc.pdf', contentHash: 'a'.repeat(64), subjectType: 'RETURN', subjectId: 'return-1',
    }).success).toBe(true)
  })
})
