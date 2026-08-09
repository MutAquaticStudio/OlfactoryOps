export type CapabilityMap = Record<string, boolean>

export type Customer = { id: string; code: string; name: string; status: string; contactCount?: number; orderCount?: number }
export type Product = { id: string; sku: string; name: string; productKind: 'FINISHED_GOOD' | 'SERVICE' | string; status: string; formulaVersionId?: string | null; packSizeGrams?: number | null; packLabel?: string | null; activePrice?: number | null; currencyCode?: string | null }
export type Quote = { id: string; quoteNumber: string; customerName: string; status: string; currencyCode: string; validUntil: string; total: number }
export type Order = { id: string; orderNumber: string; customerName: string; status: string; currencyCode: string; total: number; createdAt: string }
export type AllocationSuggestion = { orderLineId: string; finishedGoodLotId: string; lotNumber: string; availableQuantityGrams: number; suggestedQuantityGrams: number; expiresAt?: string | null }
export type CommerceOrderDetail = {
  order: { id: string; orderNumber: string; status: string; currencyCode: string; requestedDeliveryAt?: string | null }
  customer: { id: string; code: string; name: string } | null
  lines: Array<{ id: string; sku: string; productName: string; quantityUnits: number; requestedQuantityGrams: number; allocatedQuantityGrams: number; fulfilledQuantityGrams: number; returnedQuantityGrams: number; unitPrice: number; currencyCode: string }>
  reservations: Array<{ id: string; orderLineId: string; lotId: string; lotNumber: string; quantityGrams: number; fulfilledQuantityGrams: number; status: string }>
  fulfillments: Array<{ id: string; fulfillmentNumber: string; status: string; carrier?: string | null; service?: string | null; trackingNumber?: string | null; shippedAt?: string | null; deliveredAt?: string | null }>
  returns: Array<{ id: string; returnNumber: string; status: string; reason: string; createdAt: string }>
  documents: Array<{ id: string; documentKind: string; objectRef: string; createdAt: string }>
  traceability: Array<{ fromType: string; toType: string; edgeType: string; createdAt: string }>
  commercial: { currency: string; grossRevenue: number; costStatus: 'NOT_EVALUATED' | 'REDACTED'; estimatedMargin?: number | null }
}

export type CommerceDashboard = {
  counts: { customers: number; quotes: number; orders: number; fulfillments: number }
  shipmentExceptions: Array<{ id: string; trackingNumber?: string | null; status: string }>
}

export type CommerceReturnDetail = {
  returnRequest: { id: string; returnNumber: string; orderId: string; status: string; reason: string; authorizationRationale?: string | null; inspectionNotes?: string | null; createdAt: string }
  lines: Array<{ id: string; orderLineId: string; sku: string; productName: string; requestedQuantityGrams: number; receivedQuantityGrams: number }>
  receipts: Array<{ id: string; returnLineId: string; finishedGoodLotId: string; lotNumber: string; quantityGrams: number; disposition: 'QUARANTINE' | string; ledgerEntryId: string; receivedAt: string }>
  eligibleLots: Array<{ returnLineId: string; finishedGoodLotId: string; lotNumber: string; shippedQuantityGrams: number; receivedQuantityGrams: number }>
  documents: Array<{ id: string; documentKind: string; objectRef: string; createdAt: string }>
  disposition: { id: string; disposition: 'HOLD_FOR_QUALITY' | 'REJECT_TO_WASTE' | 'RELEASE_TO_AVAILABLE' | string; evidenceDocumentSnapshotIds?: string[]; outcomeSnapshot?: Record<string, unknown>; decidedAt: string } | null
}
