import { createHash, randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import {
  commerceDocumentCreateRequestSchema,
  commerceProductCreateRequestSchema,
  customerAddressRequestSchema,
  customerContactRequestSchema,
  customerCreateRequestSchema,
  fulfillmentCreateRequestSchema,
  fulfillmentTransitionRequestSchema,
  productPriceSetRequestSchema,
  quoteCreateRequestSchema,
  quoteTransitionRequestSchema,
  returnAuthorizeRequestSchema,
  returnCloseRequestSchema,
  returnDispositionRequestSchema,
  returnReceiveRequestSchema,
  returnRequestCreateSchema,
  salesOrderAllocationRequestSchema,
  salesOrderCancelRequestSchema,
  salesOrderCloseRequestSchema,
  salesOrderCreateRequestSchema,
} from '../../../packages/contracts/src/commerce.js'
import { PlatformError, PlatformService } from '../../platform/src/service.js'
import type { PlatformContext } from '../../platform/src/types.js'

type Transaction = Prisma.TransactionClient
type JsonRecord = Record<string, unknown>
type IdempotencyRow = { requestHash: string; response: unknown }
type ProductRow = {
  id: string
  sku: string
  name: string
  productKind: string
  status: string
  formulaVersionId: string | null
  packSizeGrams: Prisma.Decimal | null
  packLabel: string | null
  availabilityPolicy: string
}
type OrderRow = {
  id: string
  orderNumber: string
  customerId: string
  status: string
  currencyCode: string
  quoteId: string | null
  quoteVersionId: string | null
  billingAddressId: string | null
  shippingAddressId: string | null
  paymentTerms: string | null
  shippingTerms: string | null
  requestedDeliveryAt: Date | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}
type FinishedGoodLotRow = {
  id: string
  lotNumber: string
  formulaVersionId: string
  productionOrderId: string
  initialQuantityGrams: Prisma.Decimal
  status: string
  expiresAt: Date | null
  manufacturedAt: Date
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
const childKey = (scope: string, value: unknown) => `p10_${scope}_${digest(value)}`
const withoutFormulaReference = (snapshot: JsonRecord): JsonRecord => {
  const { formulaVersionId: _formulaVersionId, ...safe } = snapshot
  return safe
}

function validated<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new PlatformError('COMMERCE_REQUEST_INVALID', parsed.error.issues[0]?.message ?? 'The commerce request is invalid.', 422)
  return parsed.data
}

/**
 * Commerce is the sole writer of sales reservations and fulfillment movements.
 * It never touches raw-material ledger rows or inbound procurement shipments.
 * Finished-good availability is reconstructed from the immutable Phase 8
 * ledger while every sales side effect carries idempotency and audit evidence.
 */
export class CommerceService {
  constructor(private readonly client: PrismaClient, private readonly platform: PlatformService) {}

  private async scoped<T>(context: PlatformContext, action: (tx: Transaction) => Promise<T>) {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true), set_config('app.user_id', ${context.userId}, true)`
      return action(tx)
    })
  }

  private async require(context: PlatformContext, permission: string) { await this.platform.requirePermission(context, permission) }

  private async has(context: PlatformContext, permission: string) {
    try { await this.require(context, permission); return true } catch { return false }
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

  private async customer(tx: Transaction, context: PlatformContext, customerId: string, lock = false) {
    const rows = await tx.$queryRaw<Array<{ id: string; name: string; status: string }>>`
      SELECT id, name, status FROM v2_customers
      WHERE organization_id = ${context.organizationId} AND id = ${customerId}${lock ? Prisma.sql` FOR UPDATE` : Prisma.empty}
    `
    if (!rows[0]) throw new PlatformError('CUSTOMER_NOT_FOUND', 'The customer is not available in this workspace.', 404)
    return rows[0]
  }

  private async product(tx: Transaction, context: PlatformContext, productId: string, lock = false): Promise<ProductRow> {
    const rows = await tx.$queryRaw<ProductRow[]>`
      SELECT id, sku, name, product_kind AS "productKind", status, formula_version_id AS "formulaVersionId",
             pack_size_g AS "packSizeGrams", pack_label AS "packLabel", availability_policy AS "availabilityPolicy"
      FROM v2_commerce_products WHERE organization_id = ${context.organizationId} AND id = ${productId}${lock ? Prisma.sql` FOR UPDATE` : Prisma.empty}
    `
    if (!rows[0]) throw new PlatformError('COMMERCE_PRODUCT_NOT_FOUND', 'The product is not available in this workspace.', 404)
    return rows[0]
  }

  private async order(tx: Transaction, context: PlatformContext, orderId: string, lock = false): Promise<OrderRow> {
    const rows = await tx.$queryRaw<OrderRow[]>`
      SELECT id, order_number AS "orderNumber", customer_id AS "customerId", status, currency_code AS "currencyCode",
             quote_id AS "quoteId", quote_version_id AS "quoteVersionId", billing_address_id AS "billingAddressId",
             shipping_address_id AS "shippingAddressId", payment_terms AS "paymentTerms", shipping_terms AS "shippingTerms",
             requested_delivery_at AS "requestedDeliveryAt", notes, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM v2_sales_orders WHERE organization_id = ${context.organizationId} AND id = ${orderId}${lock ? Prisma.sql` FOR UPDATE` : Prisma.empty}
    `
    if (!rows[0]) throw new PlatformError('SALES_ORDER_NOT_FOUND', 'The sales order is not available in this workspace.', 404)
    return rows[0]
  }

  private async finishedGoodLot(tx: Transaction, context: PlatformContext, lotId: string, lock = false): Promise<FinishedGoodLotRow> {
    const rows = await tx.$queryRaw<FinishedGoodLotRow[]>`
      SELECT id, lot_number AS "lotNumber", formula_version_id AS "formulaVersionId", production_order_id AS "productionOrderId",
             initial_quantity_g AS "initialQuantityGrams", status, expires_at AS "expiresAt", manufactured_at AS "manufacturedAt"
      FROM v2_finished_good_lots WHERE organization_id = ${context.organizationId} AND id = ${lotId}${lock ? Prisma.sql` FOR UPDATE` : Prisma.empty}
    `
    if (!rows[0]) throw new PlatformError('FINISHED_GOOD_LOT_NOT_FOUND', 'The finished-good lot is not available in this workspace.', 404)
    return rows[0]
  }

  private async finishedGoodBucketBalance(tx: Transaction, context: PlatformContext, lotId: string, bucket: 'AVAILABLE' | 'RESERVED' | 'QUARANTINE') {
    const rows = await tx.$queryRaw<Array<{ quantity: Prisma.Decimal | null }>>`
      SELECT COALESCE(SUM(CASE WHEN to_bucket = ${bucket} THEN quantity_g ELSE 0 END) - SUM(CASE WHEN from_bucket = ${bucket} THEN quantity_g ELSE 0 END), 0) AS quantity
      FROM v2_finished_good_ledger_entries
      WHERE organization_id = ${context.organizationId} AND finished_good_lot_id = ${lotId}
    `
    return asNumber(rows[0]?.quantity)
  }

  private async moveFinishedGood(tx: Transaction, context: PlatformContext, input: {
    lotId: string
    productionOrderId: string
    movementType: 'RESERVATION' | 'RELEASE_RESERVATION' | 'FULFILLMENT' | 'RETURN' | 'QUALITY_RELEASE' | 'WASTE'
    quantityGrams: number
    fromBucket: 'AVAILABLE' | 'RESERVED' | 'QUARANTINE' | null
    toBucket: 'RESERVED' | 'AVAILABLE' | 'QUARANTINE' | null
    referenceType: string
    referenceId: string
    idempotencyScope: string
  }) {
    if (input.quantityGrams <= EPSILON) throw new PlatformError('FINISHED_GOOD_QUANTITY_INVALID', 'A finished-good movement needs a positive quantity.', 422)
    if (input.fromBucket) {
      const available = await this.finishedGoodBucketBalance(tx, context, input.lotId, input.fromBucket)
      if (available + EPSILON < input.quantityGrams) throw new PlatformError('FINISHED_GOOD_INSUFFICIENT_STOCK', 'The finished-good lot no longer has enough eligible quantity.', 409)
    }
    const movementId = id('fgmove')
    const key = childKey(input.idempotencyScope, { lotId: input.lotId, movementType: input.movementType, quantityGrams: input.quantityGrams, referenceType: input.referenceType, referenceId: input.referenceId })
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO v2_finished_good_ledger_entries (id, organization_id, finished_good_lot_id, production_order_id, movement_type, quantity_g, from_bucket, to_bucket, reference_type, reference_id, idempotency_key, actor_user_id)
      VALUES (${movementId}, ${context.organizationId}, ${input.lotId}, ${input.productionOrderId}, ${input.movementType}, ${input.quantityGrams}, ${input.fromBucket}, ${input.toBucket}, ${input.referenceType}, ${input.referenceId}, ${key}, ${context.userId})
      ON CONFLICT (organization_id, idempotency_key) DO NOTHING RETURNING id
    `
    if (inserted[0]) return inserted[0].id
    const previous = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_finished_good_ledger_entries WHERE organization_id = ${context.organizationId} AND idempotency_key = ${key}`
    if (!previous[0]) throw new PlatformError('FINISHED_GOOD_MOVEMENT_CONFLICT', 'The finished-good movement could not be reconciled.', 409)
    return previous[0].id
  }

  private async orderEvent(tx: Transaction, context: PlatformContext, orderId: string, eventType: string, payload: JsonRecord) {
    await tx.$executeRaw`INSERT INTO v2_sales_order_events (id, organization_id, sales_order_id, event_type, payload, actor_user_id) VALUES (${id('soevt')}, ${context.organizationId}, ${orderId}, ${eventType}, ${JSON.stringify(payload)}::jsonb, ${context.userId})`
  }

  private async trace(tx: Transaction, context: PlatformContext, orderId: string, fromType: string, fromId: string, toType: string, toId: string, edgeType: string, evidence: JsonRecord) {
    await tx.$executeRaw`
      INSERT INTO v2_commerce_traceability_edges (id, organization_id, sales_order_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, edge_type, evidence_snapshot, created_by)
      VALUES (${id('comedge')}, ${context.organizationId}, ${orderId}, ${fromType}, ${fromId}, ${toType}, ${toId}, ${edgeType}, ${JSON.stringify(evidence)}::jsonb, ${context.userId})
      ON CONFLICT (organization_id, sales_order_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, edge_type) DO NOTHING
    `
  }

  async listCustomers(context: PlatformContext) {
    await this.require(context, 'commerce.view')
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; code: string; name: string; status: string; contactCount: bigint; orderCount: bigint }>>`
        SELECT c.id, c.customer_code AS code, c.name, c.status,
          (SELECT count(*) FROM v2_customer_contacts contact WHERE contact.organization_id = c.organization_id AND contact.customer_id = c.id AND contact.status = 'ACTIVE') AS "contactCount",
          (SELECT count(*) FROM v2_sales_orders order_record WHERE order_record.organization_id = c.organization_id AND order_record.customer_id = c.id) AS "orderCount"
        FROM v2_customers c WHERE c.organization_id = ${context.organizationId} ORDER BY c.name ASC
      `
      return rows.map((row) => ({ ...row, contactCount: Number(row.contactCount), orderCount: Number(row.orderCount) }))
    })
  }

  async createCustomer(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.require(context, 'commerce.manage')
    const input = validated(customerCreateRequestSchema, rawInput)
    return this.idempotent(context, 'commerce.customers.create', key, input, async (tx) => {
      const customerId = id('customer')
      const code = input.code ?? `CUS-${customerId.slice(-8).toUpperCase()}`
      await tx.$executeRaw`
        INSERT INTO v2_customers (id, organization_id, customer_code, name, status, payment_terms, commercial_notes, created_by)
        VALUES (${customerId}, ${context.organizationId}, ${code}, ${input.name}, ${input.status}, ${input.paymentTerms ?? null}, ${input.commercialNotes ?? null}, ${context.userId})
      `
      await this.audit(tx, context, 'commerce.customer.create', 'allowed', 'customer', customerId, { code })
      return { id: customerId, code, name: input.name, status: input.status }
    })
  }

  async addCustomerContact(context: PlatformContext, customerId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'commerce.manage')
    const input = validated(customerContactRequestSchema, rawInput)
    return this.idempotent(context, 'commerce.customers.contacts.create', key, { customerId, input }, async (tx) => {
      await this.customer(tx, context, customerId, true)
      if (input.primary) await tx.$executeRaw`UPDATE v2_customer_contacts SET is_primary = false, updated_at = now() WHERE organization_id = ${context.organizationId} AND customer_id = ${customerId}`
      const contactId = id('contact')
      await tx.$executeRaw`INSERT INTO v2_customer_contacts (id, organization_id, customer_id, name, email, phone, role_label, is_primary) VALUES (${contactId}, ${context.organizationId}, ${customerId}, ${input.name}, ${input.email ?? null}, ${input.phone ?? null}, ${input.roleLabel ?? null}, ${input.primary})`
      await this.audit(tx, context, 'commerce.customer.contact.create', 'allowed', 'customer', customerId, { contactId })
      return { id: contactId, customerId, ...input }
    })
  }

  async addCustomerAddress(context: PlatformContext, customerId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'commerce.manage')
    const input = validated(customerAddressRequestSchema, rawInput)
    return this.idempotent(context, 'commerce.customers.addresses.create', key, { customerId, input }, async (tx) => {
      await this.customer(tx, context, customerId, true)
      if (input.primary) await tx.$executeRaw`UPDATE v2_customer_addresses SET is_primary = false, updated_at = now() WHERE organization_id = ${context.organizationId} AND customer_id = ${customerId} AND address_kind = ${input.kind}`
      const addressId = id('address')
      await tx.$executeRaw`
        INSERT INTO v2_customer_addresses (id, organization_id, customer_id, address_kind, label, recipient_name, line1, line2, city, region, postal_code, country_code, is_primary)
        VALUES (${addressId}, ${context.organizationId}, ${customerId}, ${input.kind}, ${input.label}, ${input.recipientName}, ${input.line1}, ${input.line2 ?? null}, ${input.city}, ${input.region ?? null}, ${input.postalCode ?? null}, ${input.countryCode}, ${input.primary})
      `
      await this.audit(tx, context, 'commerce.customer.address.create', 'allowed', 'customer', customerId, { addressId, kind: input.kind })
      return { id: addressId, customerId, ...input }
    })
  }

  async listProducts(context: PlatformContext) {
    await this.require(context, 'commerce.view')
    const canViewFormula = await this.has(context, 'formula.viewSensitive')
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<ProductRow & { description: string | null; variantLabel: string | null; activePrice: Prisma.Decimal | null; currencyCode: string | null }>>`
        SELECT p.id, p.sku, p.name, p.product_kind AS "productKind", p.status, p.formula_version_id AS "formulaVersionId", p.pack_size_g AS "packSizeGrams", p.pack_label AS "packLabel", p.availability_policy AS "availabilityPolicy", p.description, p.variant_label AS "variantLabel",
          price.unit_price AS "activePrice", price.currency_code AS "currencyCode"
        FROM v2_commerce_products p
        LEFT JOIN LATERAL (
          SELECT unit_price, currency_code FROM v2_commerce_product_prices price
          WHERE price.organization_id = p.organization_id AND price.product_id = p.id AND price.status = 'ACTIVE'
            AND price.effective_from <= now() AND (price.effective_until IS NULL OR price.effective_until > now())
          ORDER BY price.effective_from DESC LIMIT 1
        ) price ON true
        WHERE p.organization_id = ${context.organizationId} ORDER BY p.sku ASC
      `
      return rows.map((row) => ({
        ...row,
        formulaVersionId: canViewFormula ? row.formulaVersionId : null,
        packSizeGrams: asNumber(row.packSizeGrams),
        activePrice: row.activePrice === null ? null : asNumber(row.activePrice),
      }))
    })
  }

  async createProduct(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.require(context, 'commerce.manage')
    const input = validated(commerceProductCreateRequestSchema, rawInput)
    if (input.formulaVersionId) await this.require(context, 'formula.viewSensitive')
    return this.idempotent(context, 'commerce.products.create', key, input, async (tx) => {
      if (input.formulaVersionId) {
        const versions = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_formula_versions WHERE organization_id = ${context.organizationId} AND id = ${input.formulaVersionId} AND approval_status = 'APPROVED'`
        if (!versions[0]) throw new PlatformError('COMMERCE_FORMULA_VERSION_NOT_APPROVED', 'A finished-good SKU needs an approved Formula Version.', 409)
      }
      const productId = id('product')
      await tx.$executeRaw`
        INSERT INTO v2_commerce_products (id, organization_id, sku, name, product_kind, status, formula_version_id, description, pack_size_g, pack_label, availability_policy, created_by)
        VALUES (${productId}, ${context.organizationId}, ${input.sku}, ${input.name}, ${input.kind}, ${input.status}, ${input.formulaVersionId ?? null}, ${input.description ?? null}, ${input.packSizeGrams ?? null}, ${input.packLabel ?? null}, ${input.availabilityPolicy}, ${context.userId})
      `
      await this.audit(tx, context, 'commerce.product.create', 'allowed', 'commerce_product', productId, { sku: input.sku, formulaVersionId: input.formulaVersionId ?? null })
      return { id: productId, ...input }
    })
  }

  async setProductPrice(context: PlatformContext, productId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'commerce.manage')
    await this.require(context, 'costing.manage')
    const input = validated(productPriceSetRequestSchema, rawInput)
    return this.idempotent(context, 'commerce.products.prices.set', key, { productId, input }, async (tx) => {
      await this.product(tx, context, productId, true)
      await tx.$executeRaw`UPDATE v2_commerce_product_prices SET status = 'SUPERSEDED' WHERE organization_id = ${context.organizationId} AND product_id = ${productId} AND status = 'ACTIVE' AND currency_code = ${input.currency}`
      const priceId = id('price')
      await tx.$executeRaw`INSERT INTO v2_commerce_product_prices (id, organization_id, product_id, currency_code, unit_price, effective_from, effective_until, created_by) VALUES (${priceId}, ${context.organizationId}, ${productId}, ${input.currency}, ${input.unitPrice}, ${input.effectiveFrom ? new Date(input.effectiveFrom) : new Date()}, ${input.effectiveUntil ? new Date(input.effectiveUntil) : null}, ${context.userId})`
      await this.audit(tx, context, 'commerce.product.price.set', 'allowed', 'commerce_product', productId, { priceId, currency: input.currency })
      return { id: priceId, productId, ...input, status: 'ACTIVE' }
    })
  }

  private async resolvedCommercialLines(tx: Transaction, context: PlatformContext, currencyCode: string, lines: ReadonlyArray<{ productId: string; quantity: number; unitPrice?: number; currency?: string; notes?: string }>) {
    const resolved: Array<{ product: ProductRow; quantity: number; unitPrice: number; currency: string; notes: string | undefined; requestedQuantityGrams: number; snapshot: JsonRecord }> = []
    for (const line of lines) {
      const product = await this.product(tx, context, line.productId)
      if (product.status !== 'ACTIVE') throw new PlatformError('COMMERCE_PRODUCT_INACTIVE', 'A quote or order needs an active product.', 409)
      const priceRows = await tx.$queryRaw<Array<{ unitPrice: Prisma.Decimal; currencyCode: string }>>`
        SELECT unit_price AS "unitPrice", currency_code AS "currencyCode" FROM v2_commerce_product_prices
        WHERE organization_id = ${context.organizationId} AND product_id = ${product.id} AND status = 'ACTIVE'
          AND effective_from <= now() AND (effective_until IS NULL OR effective_until > now())
          AND currency_code = ${line.currency ?? currencyCode}
        ORDER BY effective_from DESC LIMIT 1
      `
      const resolvedCurrency = line.currency ?? currencyCode
      if (resolvedCurrency !== currencyCode) throw new PlatformError('COMMERCE_CURRENCY_MISMATCH', 'Every commercial line must use the document currency.', 422)
      const unitPrice = line.unitPrice ?? (priceRows[0] ? asNumber(priceRows[0].unitPrice) : null)
      if (unitPrice === null) throw new PlatformError('COMMERCE_PRICE_NOT_FOUND', 'Set an active price or provide an explicit unit price for this product.', 409)
      const requestedQuantityGrams = product.productKind === 'FINISHED_GOOD' ? line.quantity * asNumber(product.packSizeGrams) : 0
      resolved.push({ product, quantity: line.quantity, unitPrice, currency: resolvedCurrency, notes: line.notes, requestedQuantityGrams, snapshot: { sku: product.sku, name: product.name, kind: product.productKind, formulaVersionId: product.formulaVersionId, packSizeGrams: asNumber(product.packSizeGrams), packLabel: product.packLabel, availabilityPolicy: product.availabilityPolicy } })
    }
    return resolved
  }

  async listQuotes(context: PlatformContext) {
    await this.require(context, 'commerce.view')
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; quoteNumber: string; customerName: string; status: string; currencyCode: string; validUntil: Date; total: Prisma.Decimal }>>`
        SELECT q.id, q.quote_number AS "quoteNumber", c.name AS "customerName", q.status, q.currency_code AS "currencyCode", q.valid_until AS "validUntil",
          COALESCE((SELECT SUM(line.quantity_units * line.unit_price) FROM v2_quote_lines line WHERE line.organization_id = q.organization_id AND line.quote_version_id = q.current_version_id), 0) AS total
        FROM v2_quotes q JOIN v2_customers c ON c.organization_id = q.organization_id AND c.id = q.customer_id
        WHERE q.organization_id = ${context.organizationId} ORDER BY q.created_at DESC
      `
      return rows.map((row) => ({ ...row, total: asNumber(row.total), validUntil: row.validUntil.toISOString() }))
    })
  }

  async createQuote(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.require(context, 'commerce.manage')
    const input = validated(quoteCreateRequestSchema, rawInput)
    return this.idempotent(context, 'commerce.quotes.create', key, input, async (tx) => {
      const customer = await this.customer(tx, context, input.customerId, true)
      if (customer.status !== 'ACTIVE') throw new PlatformError('CUSTOMER_NOT_ACTIVE', 'A quote requires an active customer.', 409)
      const lines = await this.resolvedCommercialLines(tx, context, input.currency, input.lines)
      const quoteId = id('quote'); const versionId = id('quotever'); const quoteNumber = `Q-${quoteId.slice(-8).toUpperCase()}`
      const snapshot = { customerId: input.customerId, currency: input.currency, validUntil: input.validUntil, paymentTerms: input.paymentTerms ?? null, shippingTerms: input.shippingTerms ?? null, notes: input.notes ?? null, lines: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity, unitPrice: line.unitPrice, currency: line.currency, notes: line.notes ?? null, productSnapshot: line.snapshot })) }
      const contentHash = digest(snapshot)
      await tx.$executeRaw`INSERT INTO v2_quotes (id, organization_id, quote_number, customer_id, status, currency_code, valid_until, payment_terms, shipping_terms, notes, created_by) VALUES (${quoteId}, ${context.organizationId}, ${quoteNumber}, ${input.customerId}, 'DRAFT', ${input.currency}, ${new Date(input.validUntil)}, ${input.paymentTerms ?? null}, ${input.shippingTerms ?? null}, ${input.notes ?? null}, ${context.userId})`
      await tx.$executeRaw`INSERT INTO v2_quote_versions (id, organization_id, quote_id, version_number, snapshot, content_hash, created_by) VALUES (${versionId}, ${context.organizationId}, ${quoteId}, 1, ${JSON.stringify(snapshot)}::jsonb, ${contentHash}, ${context.userId})`
      await tx.$executeRaw`UPDATE v2_quotes SET current_version_id = ${versionId}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${quoteId}`
      for (const [index, line] of lines.entries()) await tx.$executeRaw`INSERT INTO v2_quote_lines (id, organization_id, quote_version_id, product_id, line_number, quantity_units, unit_price, currency_code, notes, product_snapshot) VALUES (${id('qline')}, ${context.organizationId}, ${versionId}, ${line.product.id}, ${index + 1}, ${line.quantity}, ${line.unitPrice}, ${line.currency}, ${line.notes ?? null}, ${JSON.stringify(line.snapshot)}::jsonb)`
      await this.audit(tx, context, 'commerce.quote.create', 'allowed', 'quote', quoteId, { customerId: input.customerId, contentHash })
      return { id: quoteId, quoteNumber, versionId, status: 'DRAFT', contentHash }
    })
  }

  async transitionQuote(context: PlatformContext, quoteId: string, action: 'SEND' | 'ACCEPT' | 'REJECT' | 'CANCEL', rawInput: unknown, key?: string) {
    await this.require(context, 'commerce.manage')
    const input = validated(quoteTransitionRequestSchema, rawInput)
    return this.idempotent(context, 'commerce.quotes.transition', key, { quoteId, action, input }, async (tx) => {
      const quotes = await tx.$queryRaw<Array<{ id: string; status: string; validUntil: Date; customerId: string }>>`SELECT id, status, valid_until AS "validUntil", customer_id AS "customerId" FROM v2_quotes WHERE organization_id = ${context.organizationId} AND id = ${quoteId} FOR UPDATE`
      const quote = quotes[0]
      if (!quote) throw new PlatformError('QUOTE_NOT_FOUND', 'The quote is not available in this workspace.', 404)
      const expected: Record<typeof action, string[]> = { SEND: ['DRAFT'], ACCEPT: ['SENT'], REJECT: ['SENT'], CANCEL: ['DRAFT', 'SENT'] }
      if (!expected[action].includes(quote.status)) throw new PlatformError('QUOTE_STATE_INVALID', 'The requested quote transition is not allowed.', 409)
      if (action === 'ACCEPT' && quote.validUntil.getTime() <= Date.now()) throw new PlatformError('QUOTE_EXPIRED', 'An expired quote cannot be accepted.', 409)
      const status = action === 'SEND' ? 'SENT' : action === 'ACCEPT' ? 'ACCEPTED' : action === 'REJECT' ? 'REJECTED' : 'CANCELLED'
      await tx.$executeRaw`UPDATE v2_quotes SET status = ${status}, accepted_at = ${action === 'ACCEPT' ? new Date() : null}, accepted_by = ${action === 'ACCEPT' ? context.userId : null}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${quoteId}`
      await this.audit(tx, context, `commerce.quote.${action.toLowerCase()}`, 'allowed', 'quote', quoteId, { rationaleHash: input.rationale ? digest(input.rationale) : null })
      return { id: quoteId, status }
    })
  }

  private async customerAddress(tx: Transaction, context: PlatformContext, customerId: string, addressId: string | undefined, kind: 'BILLING' | 'SHIPPING') {
    if (!addressId) return null
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_customer_addresses WHERE organization_id = ${context.organizationId} AND id = ${addressId} AND customer_id = ${customerId} AND address_kind = ${kind} AND status = 'ACTIVE'`
    if (!rows[0]) throw new PlatformError('CUSTOMER_ADDRESS_NOT_FOUND', 'The selected customer address is not available.', 422)
    return rows[0].id
  }

  async listOrders(context: PlatformContext) {
    await this.require(context, 'orders.view')
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; orderNumber: string; customerName: string; status: string; currencyCode: string; total: Prisma.Decimal; createdAt: Date }>>`
        SELECT o.id, o.order_number AS "orderNumber", c.name AS "customerName", o.status, o.currency_code AS "currencyCode", o.created_at AS "createdAt",
          COALESCE((SELECT SUM(line.quantity_units * line.unit_price) FROM v2_sales_order_lines line WHERE line.organization_id = o.organization_id AND line.sales_order_id = o.id), 0) AS total
        FROM v2_sales_orders o JOIN v2_customers c ON c.organization_id = o.organization_id AND c.id = o.customer_id
        WHERE o.organization_id = ${context.organizationId} ORDER BY o.created_at DESC
      `
      return rows.map((row) => ({ ...row, total: asNumber(row.total), createdAt: row.createdAt.toISOString() }))
    })
  }

  async createOrder(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.require(context, 'orders.create')
    const input = validated(salesOrderCreateRequestSchema, rawInput)
    return this.idempotent(context, 'commerce.orders.create', key, input, async (tx) => {
      const customer = await this.customer(tx, context, input.customerId, true)
      if (customer.status !== 'ACTIVE') throw new PlatformError('CUSTOMER_NOT_ACTIVE', 'An order requires an active customer.', 409)
      const billingAddressId = await this.customerAddress(tx, context, input.customerId, input.billingAddressId, 'BILLING')
      const shippingAddressId = await this.customerAddress(tx, context, input.customerId, input.shippingAddressId, 'SHIPPING')
      let quoteId: string | null = null; let quoteVersionId: string | null = null
      let sourceLines = input.lines
      if (input.quoteId) {
        const quotes = await tx.$queryRaw<Array<{ id: string; customerId: string; status: string; currencyCode: string; currentVersionId: string | null }>>`SELECT id, customer_id AS "customerId", status, currency_code AS "currencyCode", current_version_id AS "currentVersionId" FROM v2_quotes WHERE organization_id = ${context.organizationId} AND id = ${input.quoteId} FOR UPDATE`
        const quote = quotes[0]
        if (!quote || quote.status !== 'ACCEPTED' || quote.customerId !== input.customerId || quote.currencyCode !== input.currency || !quote.currentVersionId) throw new PlatformError('QUOTE_NOT_ACCEPTED', 'An order quote must be accepted for this customer and currency.', 409)
        quoteId = quote.id; quoteVersionId = quote.currentVersionId
        const lines = await tx.$queryRaw<Array<{ productId: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; currency: string; notes: string | null }>>`SELECT product_id AS "productId", quantity_units AS quantity, unit_price AS "unitPrice", currency_code AS currency, notes FROM v2_quote_lines WHERE organization_id = ${context.organizationId} AND quote_version_id = ${quote.currentVersionId} ORDER BY line_number ASC`
        sourceLines = lines.map((line) => ({ productId: line.productId, quantity: asNumber(line.quantity), unitPrice: asNumber(line.unitPrice), currency: line.currency, notes: line.notes ?? undefined }))
      }
      if (!sourceLines?.length) throw new PlatformError('SALES_ORDER_LINES_REQUIRED', 'The order has no commercial lines.', 422)
      const lines = await this.resolvedCommercialLines(tx, context, input.currency, sourceLines)
      const orderId = id('order'); const orderNumber = `SO-${orderId.slice(-8).toUpperCase()}`
      await tx.$executeRaw`
        INSERT INTO v2_sales_orders (id, organization_id, order_number, customer_id, quote_id, quote_version_id, billing_address_id, shipping_address_id, status, currency_code, payment_terms, shipping_terms, requested_delivery_at, notes, created_by)
        VALUES (${orderId}, ${context.organizationId}, ${orderNumber}, ${input.customerId}, ${quoteId}, ${quoteVersionId}, ${billingAddressId}, ${shippingAddressId}, 'DRAFT', ${input.currency}, ${input.paymentTerms ?? null}, ${input.shippingTerms ?? null}, ${input.requestedDeliveryAt ? new Date(input.requestedDeliveryAt) : null}, ${input.notes ?? null}, ${context.userId})
      `
      for (const [index, line] of lines.entries()) {
        await tx.$executeRaw`INSERT INTO v2_sales_order_lines (id, organization_id, sales_order_id, product_id, line_number, quantity_units, requested_quantity_g, unit_price, currency_code, product_snapshot, notes) VALUES (${id('oline')}, ${context.organizationId}, ${orderId}, ${line.product.id}, ${index + 1}, ${line.quantity}, ${line.requestedQuantityGrams}, ${line.unitPrice}, ${line.currency}, ${JSON.stringify(line.snapshot)}::jsonb, ${line.notes ?? null})`
      }
      await this.orderEvent(tx, context, orderId, 'ORDER_CREATED', { quoteId, quoteVersionId, lineCount: lines.length })
      await this.audit(tx, context, 'commerce.order.create', 'allowed', 'sales_order', orderId, { customerId: input.customerId, quoteId })
      return { id: orderId, orderNumber, status: 'DRAFT', lineCount: lines.length }
    })
  }

  async confirmOrder(context: PlatformContext, orderId: string, key?: string) {
    await this.require(context, 'orders.create')
    return this.idempotent(context, 'commerce.orders.confirm', key, { orderId }, async (tx) => {
      const order = await this.order(tx, context, orderId, true)
      if (order.status !== 'DRAFT') throw new PlatformError('SALES_ORDER_STATE_INVALID', 'Only a draft sales order can be confirmed.', 409)
      await tx.$executeRaw`UPDATE v2_sales_orders SET status = 'CONFIRMED', confirmed_at = now(), updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${orderId} AND status = 'DRAFT'`
      await this.orderEvent(tx, context, orderId, 'ORDER_CONFIRMED', {})
      await this.audit(tx, context, 'commerce.order.confirm', 'allowed', 'sales_order', orderId)
      return { id: orderId, status: 'CONFIRMED' }
    })
  }

  async allocationSuggestions(context: PlatformContext, orderId: string) {
    await this.require(context, 'orders.reserve')
    return this.scoped(context, async (tx) => {
      const order = await this.order(tx, context, orderId)
      if (!['CONFIRMED', 'ALLOCATING', 'PARTIALLY_ALLOCATED', 'ALLOCATED'].includes(order.status)) throw new PlatformError('SALES_ORDER_STATE_INVALID', 'This order is not ready for finished-good allocation.', 409)
      const lines = await tx.$queryRaw<Array<{ id: string; productId: string; requestedQuantityGrams: Prisma.Decimal; allocatedQuantityGrams: Prisma.Decimal; productKind: string; formulaVersionId: string | null }>>`
        SELECT line.id, line.product_id AS "productId", line.requested_quantity_g AS "requestedQuantityGrams", line.allocated_quantity_g AS "allocatedQuantityGrams", product.product_kind AS "productKind", product.formula_version_id AS "formulaVersionId"
        FROM v2_sales_order_lines line JOIN v2_commerce_products product ON product.organization_id = line.organization_id AND product.id = line.product_id
        WHERE line.organization_id = ${context.organizationId} AND line.sales_order_id = ${orderId} ORDER BY line.line_number ASC
      `
      const suggestions: JsonRecord[] = []
      for (const line of lines) {
        if (line.productKind !== 'FINISHED_GOOD' || !line.formulaVersionId) continue
        let remaining = Math.max(0, asNumber(line.requestedQuantityGrams) - asNumber(line.allocatedQuantityGrams))
        if (remaining <= EPSILON) continue
        const lots = await tx.$queryRaw<Array<FinishedGoodLotRow>>`
          SELECT id, lot_number AS "lotNumber", formula_version_id AS "formulaVersionId", production_order_id AS "productionOrderId", initial_quantity_g AS "initialQuantityGrams", status, expires_at AS "expiresAt", manufactured_at AS "manufacturedAt"
          FROM v2_finished_good_lots WHERE organization_id = ${context.organizationId} AND formula_version_id = ${line.formulaVersionId} AND status = 'RELEASED'
          ORDER BY expires_at NULLS LAST, manufactured_at ASC, id ASC
        `
        for (const lot of lots) {
          if (remaining <= EPSILON) break
          const available = await this.finishedGoodBucketBalance(tx, context, lot.id, 'AVAILABLE')
          const quantityGrams = Math.min(remaining, available)
          if (quantityGrams <= EPSILON) continue
          suggestions.push({ orderLineId: line.id, finishedGoodLotId: lot.id, lotNumber: lot.lotNumber, availableQuantityGrams: available, suggestedQuantityGrams: quantityGrams, expiresAt: iso(lot.expiresAt) })
          remaining -= quantityGrams
        }
      }
      return suggestions
    })
  }

  async allocateOrder(context: PlatformContext, orderId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'orders.reserve')
    const input = validated(salesOrderAllocationRequestSchema, rawInput)
    return this.idempotent(context, 'commerce.orders.allocate', key, { orderId, input }, async (tx) => {
      const order = await this.order(tx, context, orderId, true)
      if (!['CONFIRMED', 'ALLOCATING', 'PARTIALLY_ALLOCATED', 'ALLOCATED'].includes(order.status)) throw new PlatformError('SALES_ORDER_STATE_INVALID', 'This order cannot receive allocations.', 409)
      await tx.$executeRaw`UPDATE v2_sales_orders SET status = 'ALLOCATING', updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${orderId}`
      const reservations: JsonRecord[] = []
      for (const lineInput of input.lines) {
        const lines = await tx.$queryRaw<Array<{ id: string; productId: string; requestedQuantityGrams: Prisma.Decimal; allocatedQuantityGrams: Prisma.Decimal; productKind: string; formulaVersionId: string | null }>>`
          SELECT line.id, line.product_id AS "productId", line.requested_quantity_g AS "requestedQuantityGrams", line.allocated_quantity_g AS "allocatedQuantityGrams", product.product_kind AS "productKind", product.formula_version_id AS "formulaVersionId"
          FROM v2_sales_order_lines line JOIN v2_commerce_products product ON product.organization_id = line.organization_id AND product.id = line.product_id
          WHERE line.organization_id = ${context.organizationId} AND line.sales_order_id = ${orderId} AND line.id = ${lineInput.orderLineId} FOR UPDATE OF line
        `
        const line = lines[0]
        if (!line || line.productKind !== 'FINISHED_GOOD' || !line.formulaVersionId) throw new PlatformError('SALES_ORDER_LINE_NOT_ALLOCATABLE', 'Only finished-good order lines can be allocated from stock.', 409)
        const remaining = asNumber(line.requestedQuantityGrams) - asNumber(line.allocatedQuantityGrams)
        if (lineInput.quantityGrams > remaining + EPSILON) throw new PlatformError('SALES_ORDER_ALLOCATION_EXCESS', 'The allocation exceeds the remaining order quantity.', 409)
        const lot = await this.finishedGoodLot(tx, context, lineInput.finishedGoodLotId, true)
        if (lot.status !== 'RELEASED' || lot.formulaVersionId !== line.formulaVersionId || (lot.expiresAt && lot.expiresAt.getTime() <= Date.now())) throw new PlatformError('FINISHED_GOOD_LOT_INELIGIBLE', 'The finished-good lot is not eligible for this SKU.', 409)
        const reservationId = id('reservation')
        const ledgerId = await this.moveFinishedGood(tx, context, { lotId: lot.id, productionOrderId: lot.productionOrderId, movementType: 'RESERVATION', quantityGrams: lineInput.quantityGrams, fromBucket: 'AVAILABLE', toBucket: 'RESERVED', referenceType: 'SALES_RESERVATION', referenceId: reservationId, idempotencyScope: 'sales_reserve' })
        await tx.$executeRaw`INSERT INTO v2_sales_finished_good_reservations (id, organization_id, sales_order_id, sales_order_line_id, finished_good_lot_id, quantity_g, reservation_ledger_entry_id, created_by) VALUES (${reservationId}, ${context.organizationId}, ${orderId}, ${line.id}, ${lot.id}, ${lineInput.quantityGrams}, ${ledgerId}, ${context.userId})`
        await tx.$executeRaw`UPDATE v2_sales_order_lines SET allocated_quantity_g = allocated_quantity_g + ${lineInput.quantityGrams}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${line.id}`
        await this.trace(tx, context, orderId, 'FINISHED_GOOD_LOT', lot.id, 'RESERVATION', reservationId, 'ALLOCATED_TO', { quantityGrams: lineInput.quantityGrams, ledgerId })
        await this.trace(tx, context, orderId, 'RESERVATION', reservationId, 'SALES_ORDER_LINE', line.id, 'ORDERED_AS', { quantityGrams: lineInput.quantityGrams })
        reservations.push({ id: reservationId, orderLineId: line.id, finishedGoodLotId: lot.id, quantityGrams: lineInput.quantityGrams, status: 'ACTIVE', ledgerId })
      }
      const outstanding = await tx.$queryRaw<Array<{ missing: bigint }>>`SELECT count(*)::bigint AS missing FROM v2_sales_order_lines WHERE organization_id = ${context.organizationId} AND sales_order_id = ${orderId} AND allocated_quantity_g + ${EPSILON} < requested_quantity_g`
      const status = Number(outstanding[0]?.missing ?? 0) === 0 ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED'
      await tx.$executeRaw`UPDATE v2_sales_orders SET status = ${status}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${orderId}`
      await this.orderEvent(tx, context, orderId, 'FINISHED_GOODS_ALLOCATED', { reservationCount: reservations.length, status })
      await this.audit(tx, context, 'commerce.order.allocate', 'allowed', 'sales_order', orderId, { reservationCount: reservations.length })
      return { orderId, status, reservations }
    })
  }

  async createFulfillment(context: PlatformContext, orderId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'orders.fulfill')
    const input = validated(fulfillmentCreateRequestSchema, rawInput)
    return this.idempotent(context, 'commerce.fulfillments.create', key, { orderId, input }, async (tx) => {
      const order = await this.order(tx, context, orderId, true)
      if (!['PARTIALLY_ALLOCATED', 'ALLOCATED', 'PARTIALLY_FULFILLED'].includes(order.status)) throw new PlatformError('SALES_ORDER_STATE_INVALID', 'A fulfillment needs allocated finished goods.', 409)
      const fulfillmentId = id('fulfillment'); const fulfillmentNumber = `FUL-${fulfillmentId.slice(-8).toUpperCase()}`
      await tx.$executeRaw`INSERT INTO v2_sales_fulfillments (id, organization_id, sales_order_id, fulfillment_number, carrier, service, tracking_number, package_count, notes, created_by) VALUES (${fulfillmentId}, ${context.organizationId}, ${orderId}, ${fulfillmentNumber}, ${input.carrier ?? null}, ${input.service ?? null}, ${input.trackingNumber ?? null}, ${input.packageCount}, ${input.notes ?? null}, ${context.userId})`
      for (const lineInput of input.lines) {
        const rows = await tx.$queryRaw<Array<{ id: string; salesOrderLineId: string; lotId: string; quantity: Prisma.Decimal; fulfilled: Prisma.Decimal; status: string }>>`
          SELECT id, sales_order_line_id AS "salesOrderLineId", finished_good_lot_id AS "lotId", quantity_g AS quantity, fulfilled_quantity_g AS fulfilled, status
          FROM v2_sales_finished_good_reservations WHERE organization_id = ${context.organizationId} AND sales_order_id = ${orderId} AND id = ${lineInput.reservationId} FOR UPDATE
        `
        const reservation = rows[0]
        if (!reservation || reservation.status !== 'ACTIVE' || lineInput.quantityGrams > asNumber(reservation.quantity) - asNumber(reservation.fulfilled) + EPSILON) throw new PlatformError('SALES_RESERVATION_UNAVAILABLE', 'The fulfillment line exceeds an active finished-good reservation.', 409)
        const openFulfillment = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT line.id
          FROM v2_sales_fulfillment_lines line
          JOIN v2_sales_fulfillments fulfillment
            ON fulfillment.organization_id = line.organization_id AND fulfillment.id = line.fulfillment_id
          WHERE line.organization_id = ${context.organizationId}
            AND line.reservation_id = ${reservation.id}
            AND fulfillment.status IN ('DRAFT','PICKING','PACKED')
          LIMIT 1
        `
        if (openFulfillment[0]) throw new PlatformError('SALES_RESERVATION_ALREADY_IN_FULFILLMENT', 'This reservation is already assigned to an open fulfillment.', 409)
        await tx.$executeRaw`INSERT INTO v2_sales_fulfillment_lines (id, organization_id, fulfillment_id, reservation_id, sales_order_line_id, finished_good_lot_id, quantity_g) VALUES (${id('fulline')}, ${context.organizationId}, ${fulfillmentId}, ${reservation.id}, ${reservation.salesOrderLineId}, ${reservation.lotId}, ${lineInput.quantityGrams})`
        await this.trace(tx, context, orderId, 'RESERVATION', reservation.id, 'FULFILLMENT', fulfillmentId, 'PICKED_FOR', { quantityGrams: lineInput.quantityGrams })
      }
      await this.orderEvent(tx, context, orderId, 'FULFILLMENT_CREATED', { fulfillmentId })
      await this.audit(tx, context, 'commerce.fulfillment.create', 'allowed', 'fulfillment', fulfillmentId, { orderId })
      return { id: fulfillmentId, fulfillmentNumber, orderId, status: 'DRAFT' }
    })
  }

  async transitionFulfillment(context: PlatformContext, fulfillmentId: string, action: 'START_PICKING' | 'PACK' | 'SHIP' | 'DELIVER' | 'CANCEL', rawInput: unknown, key?: string) {
    await this.require(context, 'orders.fulfill')
    const input = validated(fulfillmentTransitionRequestSchema, rawInput)
    return this.idempotent(context, 'commerce.fulfillments.transition', key, { fulfillmentId, action, input }, async (tx) => {
      const initial = await tx.$queryRaw<Array<{ orderId: string }>>`SELECT sales_order_id AS "orderId" FROM v2_sales_fulfillments WHERE organization_id = ${context.organizationId} AND id = ${fulfillmentId}`
      if (!initial[0]) throw new PlatformError('FULFILLMENT_NOT_FOUND', 'The fulfillment is not available in this workspace.', 404)
      const order = await this.order(tx, context, initial[0].orderId, true)
      if (['CANCELLED', 'CLOSED'].includes(order.status)) throw new PlatformError('SALES_ORDER_NOT_FULFILLABLE', 'A cancelled or closed sales order cannot be fulfilled.', 409)
      const rows = await tx.$queryRaw<Array<{ id: string; orderId: string; status: string; carrier: string | null; service: string | null; trackingNumber: string | null }>>`SELECT id, sales_order_id AS "orderId", status, carrier, service, tracking_number AS "trackingNumber" FROM v2_sales_fulfillments WHERE organization_id = ${context.organizationId} AND id = ${fulfillmentId} FOR UPDATE`
      const fulfillment = rows[0]
      if (!fulfillment) throw new PlatformError('FULFILLMENT_NOT_FOUND', 'The fulfillment is not available in this workspace.', 404)
      const transitions: Record<typeof action, { from: string[]; to: string }> = {
        START_PICKING: { from: ['DRAFT'], to: 'PICKING' }, PACK: { from: ['PICKING'], to: 'PACKED' }, SHIP: { from: ['PACKED'], to: 'SHIPPED' }, DELIVER: { from: ['SHIPPED'], to: 'DELIVERED' }, CANCEL: { from: ['DRAFT', 'PICKING', 'PACKED'], to: 'CANCELLED' },
      }
      const transition = transitions[action]
      if (!transition.from.includes(fulfillment.status)) throw new PlatformError('FULFILLMENT_STATE_INVALID', 'The requested fulfillment transition is not allowed.', 409)
      const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date()
      if (action === 'SHIP') {
        const lines = await tx.$queryRaw<Array<{ id: string; reservationId: string; orderLineId: string; lotId: string; quantity: Prisma.Decimal }>>`SELECT id, reservation_id AS "reservationId", sales_order_line_id AS "orderLineId", finished_good_lot_id AS "lotId", quantity_g AS quantity FROM v2_sales_fulfillment_lines WHERE organization_id = ${context.organizationId} AND fulfillment_id = ${fulfillmentId} FOR UPDATE`
        if (!lines.length) throw new PlatformError('FULFILLMENT_LINES_REQUIRED', 'A shipment needs at least one fulfillment line.', 409)
        const shipmentId = id('shipment')
        for (const line of lines) {
          const reservationRows = await tx.$queryRaw<Array<{ id: string; orderLineId: string; lotId: string; quantity: Prisma.Decimal; fulfilled: Prisma.Decimal; status: string }>>`SELECT id, sales_order_line_id AS "orderLineId", finished_good_lot_id AS "lotId", quantity_g AS quantity, fulfilled_quantity_g AS fulfilled, status FROM v2_sales_finished_good_reservations WHERE organization_id = ${context.organizationId} AND id = ${line.reservationId} FOR UPDATE`
          const reservation = reservationRows[0]
          if (!reservation || reservation.status !== 'ACTIVE' || reservation.lotId !== line.lotId || asNumber(reservation.quantity) - asNumber(reservation.fulfilled) + EPSILON < asNumber(line.quantity)) throw new PlatformError('SALES_RESERVATION_UNAVAILABLE', 'A shipment line is no longer covered by a reservation.', 409)
          const lot = await this.finishedGoodLot(tx, context, line.lotId, true)
          const ledgerId = await this.moveFinishedGood(tx, context, { lotId: lot.id, productionOrderId: lot.productionOrderId, movementType: 'FULFILLMENT', quantityGrams: asNumber(line.quantity), fromBucket: 'RESERVED', toBucket: null, referenceType: 'SALES_SHIPMENT', referenceId: shipmentId, idempotencyScope: 'sales_fulfillment' })
          await tx.$executeRaw`UPDATE v2_sales_fulfillment_lines SET fulfillment_ledger_entry_id = ${ledgerId} WHERE organization_id = ${context.organizationId} AND id = ${line.id}`
          await tx.$executeRaw`UPDATE v2_sales_finished_good_reservations SET fulfilled_quantity_g = fulfilled_quantity_g + ${asNumber(line.quantity)}, status = CASE WHEN fulfilled_quantity_g + ${asNumber(line.quantity)} >= quantity_g - ${EPSILON} THEN 'CONSUMED' ELSE 'ACTIVE' END WHERE organization_id = ${context.organizationId} AND id = ${reservation.id}`
          await tx.$executeRaw`UPDATE v2_sales_order_lines SET fulfilled_quantity_g = fulfilled_quantity_g + ${asNumber(line.quantity)}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${line.orderLineId}`
          await this.trace(tx, context, fulfillment.orderId, 'FINISHED_GOOD_LOT', lot.id, 'FULFILLMENT', fulfillmentId, 'FULFILLED_BY', { quantityGrams: asNumber(line.quantity), ledgerId })
          await this.trace(tx, context, fulfillment.orderId, 'FULFILLMENT', fulfillmentId, 'SHIPMENT', shipmentId, 'SHIPPED_AS', { quantityGrams: asNumber(line.quantity) })
        }
        await tx.$executeRaw`INSERT INTO v2_sales_shipments (id, organization_id, fulfillment_id, status, carrier, service, tracking_number, dispatched_at, status_metadata) VALUES (${shipmentId}, ${context.organizationId}, ${fulfillmentId}, 'DISPATCHED', ${fulfillment.carrier}, ${fulfillment.service}, ${input.trackingNumber ?? fulfillment.trackingNumber}, ${occurredAt}, ${JSON.stringify({ source: 'commerce', action: 'SHIP' })}::jsonb)`
        await tx.$executeRaw`UPDATE v2_sales_fulfillments SET status = 'SHIPPED', tracking_number = ${input.trackingNumber ?? fulfillment.trackingNumber}, shipped_at = ${occurredAt}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${fulfillmentId}`
        await this.refreshOrderFulfillmentStatus(tx, context, fulfillment.orderId)
        await this.orderEvent(tx, context, fulfillment.orderId, 'FULFILLMENT_SHIPPED', { fulfillmentId, shipmentId })
        await this.audit(tx, context, 'commerce.fulfillment.ship', 'allowed', 'fulfillment', fulfillmentId, { shipmentId })
        return { id: fulfillmentId, status: 'SHIPPED', shipmentId }
      }
      await tx.$executeRaw`
        UPDATE v2_sales_fulfillments
        SET status = ${transition.to}, tracking_number = COALESCE(${input.trackingNumber ?? null}, tracking_number),
            picked_at = CASE WHEN ${transition.to} = 'PICKING' THEN ${occurredAt} ELSE picked_at END,
            packed_at = CASE WHEN ${transition.to} = 'PACKED' THEN ${occurredAt} ELSE packed_at END,
            delivered_at = CASE WHEN ${transition.to} = 'DELIVERED' THEN ${occurredAt} ELSE delivered_at END,
            updated_at = now()
        WHERE organization_id = ${context.organizationId} AND id = ${fulfillmentId}
      `
      if (action === 'DELIVER') await tx.$executeRaw`UPDATE v2_sales_shipments SET status = 'DELIVERED', delivered_at = ${occurredAt}, updated_at = now() WHERE organization_id = ${context.organizationId} AND fulfillment_id = ${fulfillmentId}`
      await this.orderEvent(tx, context, fulfillment.orderId, `FULFILLMENT_${transition.to}`, { fulfillmentId })
      await this.audit(tx, context, `commerce.fulfillment.${action.toLowerCase()}`, 'allowed', 'fulfillment', fulfillmentId)
      return { id: fulfillmentId, status: transition.to }
    })
  }

  private async refreshOrderFulfillmentStatus(tx: Transaction, context: PlatformContext, orderId: string) {
    const rows = await tx.$queryRaw<Array<{ missing: bigint; anyFulfilled: bigint }>>`
      SELECT
        count(*) FILTER (WHERE fulfilled_quantity_g + ${EPSILON} < requested_quantity_g)::bigint AS missing,
        count(*) FILTER (WHERE fulfilled_quantity_g > ${EPSILON})::bigint AS "anyFulfilled"
      FROM v2_sales_order_lines WHERE organization_id = ${context.organizationId} AND sales_order_id = ${orderId}
    `
    const missing = Number(rows[0]?.missing ?? 0); const anyFulfilled = Number(rows[0]?.anyFulfilled ?? 0)
    const status = missing === 0 ? 'FULFILLED' : anyFulfilled > 0 ? 'PARTIALLY_FULFILLED' : 'ALLOCATED'
    await tx.$executeRaw`UPDATE v2_sales_orders SET status = ${status}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${orderId} AND status <> 'CANCELLED'`
    return status
  }

  async cancelOrder(context: PlatformContext, orderId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'orders.create')
    const input = validated(salesOrderCancelRequestSchema, rawInput)
    return this.idempotent(context, 'commerce.orders.cancel', key, { orderId, input }, async (tx) => {
      const order = await this.order(tx, context, orderId, true)
      if (['CANCELLED', 'CLOSED', 'FULFILLED'].includes(order.status)) throw new PlatformError('SALES_ORDER_NOT_CANCELLABLE', 'This sales order cannot be cancelled.', 409)
      const shipped = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_sales_fulfillments WHERE organization_id = ${context.organizationId} AND sales_order_id = ${orderId} AND status IN ('SHIPPED','DELIVERED') LIMIT 1`
      const cancelledFulfillments = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE v2_sales_fulfillments
        SET status = 'CANCELLED', updated_at = now()
        WHERE organization_id = ${context.organizationId} AND sales_order_id = ${orderId}
          AND status IN ('DRAFT','PICKING','PACKED')
        RETURNING id
      `
      const reservations = await tx.$queryRaw<Array<{ id: string; lotId: string; quantity: Prisma.Decimal; fulfilled: Prisma.Decimal; productionOrderId: string }>>`
        SELECT r.id, r.finished_good_lot_id AS "lotId", r.quantity_g AS quantity, r.fulfilled_quantity_g AS fulfilled, l.production_order_id AS "productionOrderId"
        FROM v2_sales_finished_good_reservations r JOIN v2_finished_good_lots l ON l.organization_id = r.organization_id AND l.id = r.finished_good_lot_id
        WHERE r.organization_id = ${context.organizationId} AND r.sales_order_id = ${orderId} AND r.status = 'ACTIVE' FOR UPDATE OF r, l
      `
      for (const reservation of reservations) {
        const remaining = asNumber(reservation.quantity) - asNumber(reservation.fulfilled)
        if (remaining <= EPSILON) continue
        const ledgerId = await this.moveFinishedGood(tx, context, { lotId: reservation.lotId, productionOrderId: reservation.productionOrderId, movementType: 'RELEASE_RESERVATION', quantityGrams: remaining, fromBucket: 'RESERVED', toBucket: 'AVAILABLE', referenceType: 'SALES_ORDER_CANCELLATION', referenceId: reservation.id, idempotencyScope: 'sales_cancel_release' })
        await tx.$executeRaw`UPDATE v2_sales_finished_good_reservations SET status = 'RELEASED', released_ledger_entry_id = ${ledgerId}, released_at = now() WHERE organization_id = ${context.organizationId} AND id = ${reservation.id}`
      }
      const status = 'CANCELLED'
      await tx.$executeRaw`UPDATE v2_sales_orders SET status = ${status}, cancelled_at = now(), cancelled_reason = ${input.rationale}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${orderId}`
      await this.orderEvent(tx, context, orderId, 'ORDER_CANCELLED', { rationaleHash: digest(input.rationale), releasedReservationCount: reservations.length, cancelledFulfillmentCount: cancelledFulfillments.length, hadShipment: Boolean(shipped[0]) })
      await this.audit(tx, context, 'commerce.order.cancel', 'allowed', 'sales_order', orderId, { releasedReservationCount: reservations.length })
      return { id: orderId, status, releasedReservationCount: reservations.length }
    })
  }

  async closeOrder(context: PlatformContext, orderId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'commerce.manage')
    const input = validated(salesOrderCloseRequestSchema, rawInput)
    return this.idempotent(context, 'commerce.orders.close', key, { orderId, input }, async (tx) => {
      const order = await this.order(tx, context, orderId, true)
      if (!['FULFILLED', 'CANCELLED'].includes(order.status)) throw new PlatformError('SALES_ORDER_NOT_CLOSABLE', 'Only a fulfilled or cancelled sales order can be closed.', 409)
      const [openFulfillment, openReturn] = await Promise.all([
        tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_sales_fulfillments WHERE organization_id = ${context.organizationId} AND sales_order_id = ${orderId} AND status IN ('DRAFT','PICKING','PACKED','SHIPPED') LIMIT 1`,
        tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_sales_return_requests WHERE organization_id = ${context.organizationId} AND sales_order_id = ${orderId} AND status IN ('REQUESTED','AUTHORIZED','RECEIVED','INSPECTING','DISPOSITIONED') LIMIT 1`,
      ])
      if (openFulfillment[0] || openReturn[0]) throw new PlatformError('SALES_ORDER_CLOSURE_BLOCKED', 'Close active fulfillments and return reviews before closing this sales order.', 409)
      await tx.$executeRaw`UPDATE v2_sales_orders SET status = 'CLOSED', updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${orderId}`
      await this.orderEvent(tx, context, orderId, 'ORDER_CLOSED', { rationaleHash: digest(input.rationale), priorStatus: order.status })
      await this.audit(tx, context, 'commerce.order.close', 'allowed', 'sales_order', orderId, { priorStatus: order.status })
      return { id: orderId, status: 'CLOSED' }
    })
  }

  async createReturn(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.require(context, 'orders.fulfill')
    const input = validated(returnRequestCreateSchema, rawInput)
    return this.idempotent(context, 'commerce.returns.create', key, input, async (tx) => {
      const order = await this.order(tx, context, input.orderId, true)
      if (!['PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED'].includes(order.status)) throw new PlatformError('RETURN_ORDER_NOT_ELIGIBLE', 'Returns require a fulfilled sales order.', 409)
      const returnId = id('return'); const returnNumber = `RET-${returnId.slice(-8).toUpperCase()}`
      await tx.$executeRaw`INSERT INTO v2_sales_return_requests (id, organization_id, return_number, sales_order_id, reason, requested_by) VALUES (${returnId}, ${context.organizationId}, ${returnNumber}, ${order.id}, ${input.reason}, ${context.userId})`
      for (const lineInput of input.lines) {
        const lines = await tx.$queryRaw<Array<{ id: string; fulfilled: Prisma.Decimal; returned: Prisma.Decimal }>>`SELECT id, fulfilled_quantity_g AS fulfilled, returned_quantity_g AS returned FROM v2_sales_order_lines WHERE organization_id = ${context.organizationId} AND sales_order_id = ${order.id} AND id = ${lineInput.orderLineId} FOR UPDATE`
        const line = lines[0]
        if (!line || lineInput.quantityGrams > asNumber(line.fulfilled) - asNumber(line.returned) + EPSILON) throw new PlatformError('RETURN_QUANTITY_EXCESS', 'The requested return exceeds fulfilled non-returned quantity.', 409)
        const claimed = await tx.$queryRaw<Array<{ quantity: Prisma.Decimal | null }>>`
          SELECT COALESCE(SUM(return_line.requested_quantity_g - return_line.received_quantity_g), 0) AS quantity
          FROM v2_sales_return_lines return_line
          JOIN v2_sales_return_requests return_request
            ON return_request.organization_id = return_line.organization_id AND return_request.id = return_line.return_request_id
          WHERE return_line.organization_id = ${context.organizationId}
            AND return_line.sales_order_line_id = ${line.id}
            AND return_request.status IN ('REQUESTED','AUTHORIZED','RECEIVED','INSPECTING','DISPOSITIONED')
        `
        if (lineInput.quantityGrams > asNumber(line.fulfilled) - asNumber(line.returned) - asNumber(claimed[0]?.quantity) + EPSILON) throw new PlatformError('RETURN_QUANTITY_ALREADY_CLAIMED', 'The requested return is already covered by another active return.', 409)
        await tx.$executeRaw`INSERT INTO v2_sales_return_lines (id, organization_id, return_request_id, sales_order_line_id, requested_quantity_g) VALUES (${id('retline')}, ${context.organizationId}, ${returnId}, ${line.id}, ${lineInput.quantityGrams})`
      }
      await this.orderEvent(tx, context, order.id, 'RETURN_REQUESTED', { returnId })
      await this.audit(tx, context, 'commerce.return.request', 'allowed', 'sales_return', returnId, { orderId: order.id })
      return { id: returnId, returnNumber, orderId: order.id, status: 'REQUESTED' }
    })
  }

  async authorizeReturn(context: PlatformContext, returnId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'orders.fulfill')
    const input = validated(returnAuthorizeRequestSchema, rawInput)
    return this.idempotent(context, 'commerce.returns.authorize', key, { returnId, input }, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; orderId: string; status: string }>>`SELECT id, sales_order_id AS "orderId", status FROM v2_sales_return_requests WHERE organization_id = ${context.organizationId} AND id = ${returnId} FOR UPDATE`
      const request = rows[0]
      if (!request) throw new PlatformError('RETURN_NOT_FOUND', 'The return request is not available.', 404)
      if (request.status !== 'REQUESTED') throw new PlatformError('RETURN_STATE_INVALID', 'Only a requested return can be authorized.', 409)
      await tx.$executeRaw`UPDATE v2_sales_return_requests SET status = 'AUTHORIZED', authorization_rationale = ${input.rationale}, authorized_by = ${context.userId}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${returnId}`
      await this.orderEvent(tx, context, request.orderId, 'RETURN_AUTHORIZED', { returnId })
      await this.audit(tx, context, 'commerce.return.authorize', 'allowed', 'sales_return', returnId, { rationaleHash: digest(input.rationale) })
      return { id: returnId, status: 'AUTHORIZED' }
    })
  }

  async returnDetail(context: PlatformContext, returnId: string) {
    await this.require(context, 'orders.fulfill')
    const canViewDocuments = await this.has(context, 'documents.view')
    const canViewFinishedGoods = (await this.has(context, 'production.finishedGoods.view')) && (await this.has(context, 'production.documents.view'))
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; returnNumber: string; orderId: string; status: string; reason: string; authorizationRationale: string | null; inspectionNotes: string | null; createdAt: Date }>>`
        SELECT id, return_number AS "returnNumber", sales_order_id AS "orderId", status, reason,
               authorization_rationale AS "authorizationRationale", inspection_notes AS "inspectionNotes", created_at AS "createdAt"
        FROM v2_sales_return_requests
        WHERE organization_id = ${context.organizationId} AND id = ${returnId}
      `
      const request = rows[0]
      if (!request) throw new PlatformError('RETURN_NOT_FOUND', 'The return request is not available in this workspace.', 404)
      const lines = await tx.$queryRaw<Array<{ id: string; orderLineId: string; sku: string; productName: string; requestedQuantityGrams: Prisma.Decimal; receivedQuantityGrams: Prisma.Decimal }>>`
        SELECT line.id, line.sales_order_line_id AS "orderLineId", product.sku, product.name AS "productName",
               line.requested_quantity_g AS "requestedQuantityGrams", line.received_quantity_g AS "receivedQuantityGrams"
        FROM v2_sales_return_lines line
        JOIN v2_sales_order_lines order_line ON order_line.organization_id = line.organization_id AND order_line.id = line.sales_order_line_id
        JOIN v2_commerce_products product ON product.organization_id = order_line.organization_id AND product.id = order_line.product_id
        WHERE line.organization_id = ${context.organizationId} AND line.return_request_id = ${returnId}
        ORDER BY line.created_at ASC
      `
      const [receipts, eligibleLots, documents, dispositions] = await Promise.all([
        tx.$queryRaw<Array<{ id: string; returnLineId: string; finishedGoodLotId: string; lotNumber: string; quantityGrams: Prisma.Decimal; disposition: string; ledgerEntryId: string; receivedAt: Date }>>`
          SELECT receipt.id, receipt.return_line_id AS "returnLineId", receipt.finished_good_lot_id AS "finishedGoodLotId",
                 lot.lot_number AS "lotNumber", receipt.quantity_g AS "quantityGrams", receipt.disposition,
                 receipt.return_ledger_entry_id AS "ledgerEntryId", receipt.received_at AS "receivedAt"
          FROM v2_sales_return_receipts receipt
          JOIN v2_finished_good_lots lot ON lot.organization_id = receipt.organization_id AND lot.id = receipt.finished_good_lot_id
          JOIN v2_sales_return_lines line ON line.organization_id = receipt.organization_id AND line.id = receipt.return_line_id
          WHERE receipt.organization_id = ${context.organizationId} AND line.return_request_id = ${returnId}
          ORDER BY receipt.received_at ASC, receipt.id ASC
        `,
        tx.$queryRaw<Array<{ returnLineId: string; finishedGoodLotId: string; lotNumber: string; shippedQuantityGrams: Prisma.Decimal; receivedQuantityGrams: Prisma.Decimal }>>`
          SELECT line.id AS "returnLineId", fulfillment_line.finished_good_lot_id AS "finishedGoodLotId", lot.lot_number AS "lotNumber",
                 COALESCE(SUM(fulfillment_line.quantity_g), 0) AS "shippedQuantityGrams",
                 COALESCE(MAX(receipt_summary.quantity), 0) AS "receivedQuantityGrams"
          FROM v2_sales_return_lines line
          JOIN v2_sales_fulfillment_lines fulfillment_line
            ON fulfillment_line.organization_id = line.organization_id AND fulfillment_line.sales_order_line_id = line.sales_order_line_id
          JOIN v2_sales_fulfillments fulfillment
            ON fulfillment.organization_id = fulfillment_line.organization_id AND fulfillment.id = fulfillment_line.fulfillment_id
          JOIN v2_finished_good_lots lot
            ON lot.organization_id = fulfillment_line.organization_id AND lot.id = fulfillment_line.finished_good_lot_id
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(receipt.quantity_g), 0) AS quantity
            FROM v2_sales_return_receipts receipt
            JOIN v2_sales_return_lines received_line
              ON received_line.organization_id = receipt.organization_id AND received_line.id = receipt.return_line_id
            WHERE receipt.organization_id = line.organization_id
              AND received_line.sales_order_line_id = line.sales_order_line_id
              AND receipt.finished_good_lot_id = fulfillment_line.finished_good_lot_id
          ) receipt_summary ON true
          WHERE line.organization_id = ${context.organizationId} AND line.return_request_id = ${returnId}
            AND fulfillment.status IN ('SHIPPED','DELIVERED')
          GROUP BY line.id, fulfillment_line.finished_good_lot_id, lot.lot_number
          ORDER BY line.id, lot.lot_number
        `,
        tx.$queryRaw<Array<{ id: string; documentKind: string; objectRef: string; createdAt: Date }>>`
          SELECT id, document_kind AS "documentKind", object_ref AS "objectRef", created_at AS "createdAt"
          FROM v2_commerce_documents
          WHERE organization_id = ${context.organizationId} AND subject_type = 'RETURN' AND subject_id = ${returnId} AND status = 'ACTIVE'
          ORDER BY created_at ASC
        `,
        tx.$queryRaw<Array<{ id: string; disposition: string; evidenceDocumentSnapshotIds: unknown; outcomeSnapshot: unknown; decidedAt: Date }>>`
          SELECT id, disposition, evidence_document_snapshot_ids AS "evidenceDocumentSnapshotIds",
                 outcome_snapshot AS "outcomeSnapshot", decided_at AS "decidedAt"
          FROM v2_sales_return_dispositions
          WHERE organization_id = ${context.organizationId} AND return_request_id = ${returnId}
          LIMIT 1
        `,
      ])
      return {
        returnRequest: { ...request, createdAt: request.createdAt.toISOString() },
        lines: lines.map((line) => ({
          ...line,
          requestedQuantityGrams: asNumber(line.requestedQuantityGrams),
          receivedQuantityGrams: asNumber(line.receivedQuantityGrams),
        })),
        receipts: receipts.map((receipt) => ({
          ...receipt,
          quantityGrams: asNumber(receipt.quantityGrams),
          receivedAt: receipt.receivedAt.toISOString(),
        })),
        eligibleLots: eligibleLots.map((lot) => ({
          ...lot,
          shippedQuantityGrams: asNumber(lot.shippedQuantityGrams),
          receivedQuantityGrams: asNumber(lot.receivedQuantityGrams),
        })),
        documents: canViewDocuments ? documents.map((document) => ({ ...document, createdAt: document.createdAt.toISOString() })) : [],
        disposition: dispositions[0] ? {
          id: dispositions[0].id,
          disposition: dispositions[0].disposition,
          decidedAt: dispositions[0].decidedAt.toISOString(),
          ...(canViewDocuments ? { evidenceDocumentSnapshotIds: dispositions[0].evidenceDocumentSnapshotIds } : {}),
          ...(canViewFinishedGoods ? { outcomeSnapshot: dispositions[0].outcomeSnapshot } : {}),
        } : null,
      }
    })
  }

  async receiveReturn(context: PlatformContext, returnId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'orders.fulfill')
    const input = validated(returnReceiveRequestSchema, rawInput)
    return this.idempotent(context, 'commerce.returns.receive', key, { returnId, input }, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; orderId: string; status: string }>>`SELECT id, sales_order_id AS "orderId", status FROM v2_sales_return_requests WHERE organization_id = ${context.organizationId} AND id = ${returnId} FOR UPDATE`
      const request = rows[0]
      if (!request) throw new PlatformError('RETURN_NOT_FOUND', 'The return request is not available.', 404)
      if (request.status !== 'AUTHORIZED') throw new PlatformError('RETURN_STATE_INVALID', 'Only an authorized return can be received.', 409)
      for (const inputLine of input.lines) {
        const returnLines = await tx.$queryRaw<Array<{ id: string; orderLineId: string; requested: Prisma.Decimal; received: Prisma.Decimal; fulfilled: Prisma.Decimal; returned: Prisma.Decimal; formulaVersionId: string | null }>>`
          SELECT r.id, r.sales_order_line_id AS "orderLineId", r.requested_quantity_g AS requested, r.received_quantity_g AS received,
                 line.fulfilled_quantity_g AS fulfilled, line.returned_quantity_g AS returned, product.formula_version_id AS "formulaVersionId"
          FROM v2_sales_return_lines r
          JOIN v2_sales_order_lines line ON line.organization_id = r.organization_id AND line.id = r.sales_order_line_id
          JOIN v2_commerce_products product ON product.organization_id = line.organization_id AND product.id = line.product_id
          WHERE r.organization_id = ${context.organizationId} AND r.return_request_id = ${returnId} AND r.id = ${inputLine.returnLineId} FOR UPDATE OF r, line
        `
        const returnLine = returnLines[0]
        if (!returnLine || inputLine.quantityGrams > asNumber(returnLine.requested) - asNumber(returnLine.received) + EPSILON) throw new PlatformError('RETURN_QUANTITY_EXCESS', 'The received quantity exceeds the authorized return.', 409)
        const lot = await this.finishedGoodLot(tx, context, inputLine.finishedGoodLotId, true)
        if (!returnLine.formulaVersionId || lot.formulaVersionId !== returnLine.formulaVersionId) throw new PlatformError('RETURN_LOT_MISMATCH', 'The returned lot does not match the ordered SKU formula.', 409)
        const shippedEvidence = await tx.$queryRaw<Array<{ quantity: Prisma.Decimal | null }>>`
          SELECT COALESCE(SUM(fulfillment_line.quantity_g), 0) AS quantity
          FROM v2_sales_fulfillment_lines fulfillment_line
          JOIN v2_sales_fulfillments fulfillment ON fulfillment.organization_id = fulfillment_line.organization_id AND fulfillment.id = fulfillment_line.fulfillment_id
          WHERE fulfillment_line.organization_id = ${context.organizationId} AND fulfillment.sales_order_id = ${request.orderId}
            AND fulfillment_line.sales_order_line_id = ${returnLine.orderLineId} AND fulfillment_line.finished_good_lot_id = ${lot.id}
            AND fulfillment.status IN ('SHIPPED','DELIVERED')
        `
        const alreadyReturnedForLot = await tx.$queryRaw<Array<{ quantity: Prisma.Decimal | null }>>`
          SELECT COALESCE(SUM(receipt.quantity_g), 0) AS quantity
          FROM v2_sales_return_receipts receipt
          JOIN v2_sales_return_lines return_line
            ON return_line.organization_id = receipt.organization_id AND return_line.id = receipt.return_line_id
          WHERE receipt.organization_id = ${context.organizationId}
            AND return_line.sales_order_line_id = ${returnLine.orderLineId}
            AND receipt.finished_good_lot_id = ${lot.id}
        `
        if (inputLine.quantityGrams > asNumber(shippedEvidence[0]?.quantity) - asNumber(alreadyReturnedForLot[0]?.quantity) + EPSILON) throw new PlatformError('RETURN_LOT_NOT_FULFILLED', 'The received return exceeds the quantity shipped from this finished-good lot.', 409)
        const receiptId = id('retrec')
        const ledgerId = await this.moveFinishedGood(tx, context, { lotId: lot.id, productionOrderId: lot.productionOrderId, movementType: 'RETURN', quantityGrams: inputLine.quantityGrams, fromBucket: null, toBucket: 'QUARANTINE', referenceType: 'SALES_RETURN', referenceId: receiptId, idempotencyScope: 'sales_return' })
        await tx.$executeRaw`INSERT INTO v2_sales_return_receipts (id, organization_id, return_line_id, finished_good_lot_id, quantity_g, disposition, return_ledger_entry_id, received_by) VALUES (${receiptId}, ${context.organizationId}, ${returnLine.id}, ${lot.id}, ${inputLine.quantityGrams}, 'QUARANTINE', ${ledgerId}, ${context.userId})`
        await tx.$executeRaw`UPDATE v2_sales_return_lines SET received_quantity_g = received_quantity_g + ${inputLine.quantityGrams}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${returnLine.id}`
        await tx.$executeRaw`UPDATE v2_sales_order_lines SET returned_quantity_g = returned_quantity_g + ${inputLine.quantityGrams}, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${returnLine.orderLineId}`
        await this.trace(tx, context, request.orderId, 'RETURN', returnId, 'FINISHED_GOOD_LOT', lot.id, 'RETURNED_FROM', { receiptId, quantityGrams: inputLine.quantityGrams, ledgerId, disposition: 'QUARANTINE' })
      }
      const incomplete = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count
        FROM v2_sales_return_lines
        WHERE organization_id = ${context.organizationId} AND return_request_id = ${returnId}
          AND received_quantity_g + ${EPSILON} < requested_quantity_g
      `
      const status = Number(incomplete[0]?.count ?? 0) === 0 ? 'INSPECTING' : 'AUTHORIZED'
      await tx.$executeRaw`
        UPDATE v2_sales_return_requests
        SET status = ${status}, inspection_notes = ${input.inspectionNotes ?? null}, received_by = ${context.userId}, updated_at = now()
        WHERE organization_id = ${context.organizationId} AND id = ${returnId}
      `
      await this.orderEvent(tx, context, request.orderId, status === 'INSPECTING' ? 'RETURN_RECEIVED_TO_QUARANTINE' : 'RETURN_PARTIALLY_RECEIVED_TO_QUARANTINE', { returnId, lineCount: input.lines.length, remainingLineCount: Number(incomplete[0]?.count ?? 0) })
      await this.audit(tx, context, 'commerce.return.receive', 'allowed', 'sales_return', returnId, { lineCount: input.lines.length })
      // A return is intentionally NOT released back to AVAILABLE here. It
      // remains AUTHORIZED until every requested line is received, then moves
      // to INSPECTING for Quality-owned disposition.
      return { id: returnId, status, releasedToSaleableStock: false }
    })
  }

  async disposeReturn(context: PlatformContext, returnId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'orders.fulfill')
    await this.require(context, 'production.qc.approve')
    await this.require(context, 'documents.view')
    const input = validated(returnDispositionRequestSchema, rawInput)
    if (input.disposition === 'RELEASE_TO_AVAILABLE') await this.require(context, 'production.release')
    return this.idempotent(context, 'commerce.returns.disposition', key, { returnId, input }, async (tx) => {
      const requests = await tx.$queryRaw<Array<{ id: string; orderId: string; status: string }>>`
        SELECT id, sales_order_id AS "orderId", status
        FROM v2_sales_return_requests
        WHERE organization_id = ${context.organizationId} AND id = ${returnId}
        FOR UPDATE
      `
      const request = requests[0]
      if (!request) throw new PlatformError('RETURN_NOT_FOUND', 'The return request is not available.', 404)
      if (request.status !== 'INSPECTING') throw new PlatformError('RETURN_DISPOSITION_STATE_INVALID', 'Only an inspecting return can receive a quality disposition.', 409)

      const incomplete = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count
        FROM v2_sales_return_lines
        WHERE organization_id = ${context.organizationId} AND return_request_id = ${returnId}
          AND received_quantity_g + ${EPSILON} < requested_quantity_g
      `
      if (Number(incomplete[0]?.count ?? 0) > 0) {
        throw new PlatformError('RETURN_DISPOSITION_RECEIPT_INCOMPLETE', 'All authorized return quantities must be received before disposition.', 409)
      }

      const evidenceIds = [...input.evidenceDocumentSnapshotIds].sort()
      for (const documentId of evidenceIds) {
        const evidence = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM v2_commerce_documents
          WHERE organization_id = ${context.organizationId} AND id = ${documentId}
            AND subject_type = 'RETURN' AND subject_id = ${returnId}
            AND document_kind = 'RETURN_QC' AND status = 'ACTIVE'
        `
        if (!evidence[0]) {
          throw new PlatformError('RETURN_QC_EVIDENCE_REQUIRED', 'An active return QC evidence document is required for disposition.', 422)
        }
      }

      const receipts = await tx.$queryRaw<Array<{ id: string; lotId: string; productionOrderId: string; lotStatus: string; expiresAt: Date | null; quantityGrams: Prisma.Decimal }>>`
        SELECT receipt.id, receipt.finished_good_lot_id AS "lotId", lot.production_order_id AS "productionOrderId",
               lot.status AS "lotStatus", lot.expires_at AS "expiresAt", receipt.quantity_g AS "quantityGrams"
        FROM v2_sales_return_receipts receipt
        JOIN v2_sales_return_lines line
          ON line.organization_id = receipt.organization_id AND line.id = receipt.return_line_id
        JOIN v2_finished_good_lots lot
          ON lot.organization_id = receipt.organization_id AND lot.id = receipt.finished_good_lot_id
        WHERE receipt.organization_id = ${context.organizationId} AND line.return_request_id = ${returnId}
        ORDER BY receipt.id
        FOR UPDATE OF receipt, lot
      `
      if (!receipts.length) throw new PlatformError('RETURN_DISPOSITION_RECEIPTS_REQUIRED', 'A return needs at least one received custody record before disposition.', 409)

      const dispositionId = id('retdisp')
      const ledgerEntryIds: string[] = []
      for (const receipt of receipts) {
        const quantityGrams = asNumber(receipt.quantityGrams)
        if (input.disposition === 'RELEASE_TO_AVAILABLE') {
          if (receipt.lotStatus !== 'RELEASED' || (receipt.expiresAt && receipt.expiresAt.getTime() <= Date.now())) {
            throw new PlatformError('RETURN_RELEASE_NOT_ELIGIBLE', 'Only an unexpired released finished-good lot can return to available stock.', 409)
          }
          const ledgerId = await this.moveFinishedGood(tx, context, {
            lotId: receipt.lotId,
            productionOrderId: receipt.productionOrderId,
            movementType: 'QUALITY_RELEASE',
            quantityGrams,
            fromBucket: 'QUARANTINE',
            toBucket: 'AVAILABLE',
            referenceType: 'SALES_RETURN_DISPOSITION',
            referenceId: dispositionId,
            idempotencyScope: 'sales_return_quality_release',
          })
          ledgerEntryIds.push(ledgerId)
          await this.trace(tx, context, request.orderId, 'RETURN', returnId, 'FINISHED_GOOD_LOT', receipt.lotId, 'RETURN_RELEASED_TO_AVAILABLE', { dispositionId, receiptId: receipt.id, ledgerId, quantityGrams })
        } else if (input.disposition === 'REJECT_TO_WASTE') {
          const ledgerId = await this.moveFinishedGood(tx, context, {
            lotId: receipt.lotId,
            productionOrderId: receipt.productionOrderId,
            movementType: 'WASTE',
            quantityGrams,
            fromBucket: 'QUARANTINE',
            toBucket: null,
            referenceType: 'SALES_RETURN_DISPOSITION',
            referenceId: dispositionId,
            idempotencyScope: 'sales_return_quality_reject',
          })
          ledgerEntryIds.push(ledgerId)
          await this.trace(tx, context, request.orderId, 'RETURN', returnId, 'FINISHED_GOOD_LOT', receipt.lotId, 'RETURN_REJECTED_TO_WASTE', { dispositionId, receiptId: receipt.id, ledgerId, quantityGrams })
        }
      }

      const status = input.disposition === 'REJECT_TO_WASTE' ? 'REJECTED' : 'DISPOSITIONED'
      const outcome = {
        disposition: input.disposition,
        receiptCount: receipts.length,
        ledgerEntryIds,
        evidenceDocumentSnapshotIds: evidenceIds,
      }
      await tx.$executeRaw`
        INSERT INTO v2_sales_return_dispositions
          (id, organization_id, return_request_id, disposition, rationale, evidence_document_snapshot_ids, outcome_snapshot, decided_by)
        VALUES (${dispositionId}, ${context.organizationId}, ${returnId}, ${input.disposition}, ${input.rationale}, ${JSON.stringify(evidenceIds)}::jsonb, ${JSON.stringify(outcome)}::jsonb, ${context.userId})
      `
      await tx.$executeRaw`
        UPDATE v2_sales_return_requests
        SET status = ${status}, updated_at = now()
        WHERE organization_id = ${context.organizationId} AND id = ${returnId} AND status = 'INSPECTING'
      `
      await this.orderEvent(tx, context, request.orderId, 'RETURN_DISPOSITIONED', { returnId, dispositionId, disposition: input.disposition, receiptCount: receipts.length })
      await this.audit(tx, context, 'commerce.return.disposition', 'allowed', 'sales_return', returnId, { dispositionId, disposition: input.disposition, evidenceDocumentSnapshotIds: evidenceIds, ledgerEntryIds })
      return { id: returnId, status, disposition: { id: dispositionId, action: input.disposition, ledgerEntryIds } }
    })
  }

  async closeReturn(context: PlatformContext, returnId: string, rawInput: unknown, key?: string) {
    await this.require(context, 'commerce.manage')
    const input = validated(returnCloseRequestSchema, rawInput)
    return this.idempotent(context, 'commerce.returns.close', key, { returnId, input }, async (tx) => {
      const requests = await tx.$queryRaw<Array<{ id: string; orderId: string; status: string }>>`
        SELECT id, sales_order_id AS "orderId", status
        FROM v2_sales_return_requests
        WHERE organization_id = ${context.organizationId} AND id = ${returnId}
        FOR UPDATE
      `
      const request = requests[0]
      if (!request) throw new PlatformError('RETURN_NOT_FOUND', 'The return request is not available.', 404)
      if (!['DISPOSITIONED', 'REJECTED'].includes(request.status)) {
        throw new PlatformError('RETURN_CLOSE_STATE_INVALID', 'Only a quality-dispositioned or rejected return can be closed.', 409)
      }
      await tx.$executeRaw`UPDATE v2_sales_return_requests SET status = 'CLOSED', updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${returnId}`
      await this.orderEvent(tx, context, request.orderId, 'RETURN_CLOSED', { returnId, rationaleHash: digest(input.rationale) })
      await this.audit(tx, context, 'commerce.return.close', 'allowed', 'sales_return', returnId, { rationaleHash: digest(input.rationale) })
      return { id: returnId, status: 'CLOSED' }
    })
  }

  async attachDocument(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.require(context, 'documents.manage')
    const input = validated(commerceDocumentCreateRequestSchema, rawInput)
    return this.idempotent(context, 'commerce.documents.create', key, input, async (tx) => {
      const allowedDocumentKinds: Record<typeof input.subjectType, ReadonlyArray<typeof input.documentKind>> = {
        QUOTE: ['QUOTE'],
        ORDER: ['ORDER_CONFIRMATION', 'PACKING_LIST'],
        FULFILLMENT: ['PACKING_LIST', 'SHIPMENT_STATUS'],
        RETURN: ['RETURN_AUTHORIZATION', 'RETURN_QC'],
      }
      if (!allowedDocumentKinds[input.subjectType].includes(input.documentKind)) throw new PlatformError('COMMERCE_DOCUMENT_SUBJECT_INVALID', 'This document kind cannot be attached to the selected commerce record.', 422)
      const subjectTable: Record<typeof input.subjectType, string> = {
        QUOTE: 'v2_quotes', ORDER: 'v2_sales_orders', FULFILLMENT: 'v2_sales_fulfillments', RETURN: 'v2_sales_return_requests',
      }
      const subjectRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM ${Prisma.raw(subjectTable[input.subjectType])} WHERE organization_id = ${context.organizationId} AND id = ${input.subjectId}`)
      if (!subjectRows[0]) throw new PlatformError('COMMERCE_DOCUMENT_SUBJECT_NOT_FOUND', 'The document subject is not available in this workspace.', 404)
      const documentId = id('comdoc')
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO v2_commerce_documents (id, organization_id, subject_type, subject_id, document_kind, object_ref, content_hash, created_by)
        VALUES (${documentId}, ${context.organizationId}, ${input.subjectType}, ${input.subjectId}, ${input.documentKind}, ${input.objectRef}, ${input.contentHash.toLowerCase()}, ${context.userId})
        ON CONFLICT (organization_id, subject_type, subject_id, document_kind, object_ref, content_hash) DO NOTHING RETURNING id
      `
      const resolvedId = rows[0]?.id ?? (await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_commerce_documents WHERE organization_id = ${context.organizationId} AND subject_type = ${input.subjectType} AND subject_id = ${input.subjectId} AND document_kind = ${input.documentKind} AND object_ref = ${input.objectRef} AND content_hash = ${input.contentHash.toLowerCase()} LIMIT 1`)[0]?.id
      if (!resolvedId) throw new PlatformError('COMMERCE_DOCUMENT_CONFLICT', 'The commerce document could not be reconciled.', 409)
      await this.audit(tx, context, 'commerce.document.attach', 'allowed', 'commerce_document', resolvedId, { subjectType: input.subjectType, subjectId: input.subjectId })
      return { id: resolvedId, status: 'ACTIVE', ...input }
    })
  }

  async detail(context: PlatformContext, orderId: string) {
    await this.require(context, 'orders.view')
    const canViewMargin = await this.has(context, 'costing.viewMargin')
    const canViewCost = await this.has(context, 'costing.view')
    const canViewFormula = await this.has(context, 'formula.viewSensitive')
    const canViewFinishedGoods = (await this.has(context, 'production.finishedGoods.view')) && (await this.has(context, 'production.documents.view'))
    const canViewDocuments = await this.has(context, 'documents.view')
    return this.scoped(context, async (tx) => {
      const order = await this.order(tx, context, orderId)
      const [customer, lines, reservations, fulfillments, returns, documents, edges] = await Promise.all([
        tx.$queryRaw<Array<{ id: string; code: string; name: string }>>`SELECT id, customer_code AS code, name FROM v2_customers WHERE organization_id = ${context.organizationId} AND id = ${order.customerId}`,
        tx.$queryRaw<Array<{ id: string; productId: string; sku: string; productName: string; quantityUnits: Prisma.Decimal; requestedQuantityGrams: Prisma.Decimal; allocatedQuantityGrams: Prisma.Decimal; fulfilledQuantityGrams: Prisma.Decimal; returnedQuantityGrams: Prisma.Decimal; unitPrice: Prisma.Decimal; currencyCode: string; productSnapshot: JsonRecord }>>`
          SELECT line.id, line.product_id AS "productId", product.sku, product.name AS "productName", line.quantity_units AS "quantityUnits", line.requested_quantity_g AS "requestedQuantityGrams", line.allocated_quantity_g AS "allocatedQuantityGrams", line.fulfilled_quantity_g AS "fulfilledQuantityGrams", line.returned_quantity_g AS "returnedQuantityGrams", line.unit_price AS "unitPrice", line.currency_code AS "currencyCode", line.product_snapshot AS "productSnapshot"
          FROM v2_sales_order_lines line JOIN v2_commerce_products product ON product.organization_id = line.organization_id AND product.id = line.product_id
          WHERE line.organization_id = ${context.organizationId} AND line.sales_order_id = ${orderId} ORDER BY line.line_number ASC
        `,
        tx.$queryRaw<Array<{ id: string; orderLineId: string; lotId: string; lotNumber: string; quantityGrams: Prisma.Decimal; fulfilledQuantityGrams: Prisma.Decimal; status: string; expiresAt: Date | null }>>`
          SELECT r.id, r.sales_order_line_id AS "orderLineId", r.finished_good_lot_id AS "lotId", lot.lot_number AS "lotNumber", r.quantity_g AS "quantityGrams", r.fulfilled_quantity_g AS "fulfilledQuantityGrams", r.status, lot.expires_at AS "expiresAt"
          FROM v2_sales_finished_good_reservations r JOIN v2_finished_good_lots lot ON lot.organization_id = r.organization_id AND lot.id = r.finished_good_lot_id
          WHERE r.organization_id = ${context.organizationId} AND r.sales_order_id = ${orderId} ORDER BY r.created_at ASC
        `,
        tx.$queryRaw<Array<{ id: string; fulfillmentNumber: string; status: string; carrier: string | null; service: string | null; trackingNumber: string | null; shippedAt: Date | null; deliveredAt: Date | null }>>`SELECT id, fulfillment_number AS "fulfillmentNumber", status, carrier, service, tracking_number AS "trackingNumber", shipped_at AS "shippedAt", delivered_at AS "deliveredAt" FROM v2_sales_fulfillments WHERE organization_id = ${context.organizationId} AND sales_order_id = ${orderId} ORDER BY created_at ASC`,
        tx.$queryRaw<Array<{ id: string; returnNumber: string; status: string; reason: string; createdAt: Date }>>`SELECT id, return_number AS "returnNumber", status, reason, created_at AS "createdAt" FROM v2_sales_return_requests WHERE organization_id = ${context.organizationId} AND sales_order_id = ${orderId} ORDER BY created_at ASC`,
        tx.$queryRaw<Array<{ id: string; documentKind: string; objectRef: string; createdAt: Date }>>`SELECT id, document_kind AS "documentKind", object_ref AS "objectRef", created_at AS "createdAt" FROM v2_commerce_documents WHERE organization_id = ${context.organizationId} AND subject_type = 'ORDER' AND subject_id = ${orderId} AND status = 'ACTIVE' ORDER BY created_at ASC`,
        tx.$queryRaw<Array<{ fromType: string; fromId: string; toType: string; toId: string; edgeType: string; createdAt: Date }>>`SELECT from_entity_type AS "fromType", from_entity_id AS "fromId", to_entity_type AS "toType", to_entity_id AS "toId", edge_type AS "edgeType", created_at AS "createdAt" FROM v2_commerce_traceability_edges WHERE organization_id = ${context.organizationId} AND sales_order_id = ${orderId} ORDER BY created_at ASC`,
      ])
      const grossRevenue = lines.reduce((total, line) => total + asNumber(line.quantityUnits) * asNumber(line.unitPrice), 0)
      return {
        order: { ...order, requestedDeliveryAt: iso(order.requestedDeliveryAt), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() },
        customer: customer[0] ?? null,
        lines: lines.map((line) => ({ ...line, productSnapshot: canViewFormula ? line.productSnapshot : withoutFormulaReference(line.productSnapshot), quantityUnits: asNumber(line.quantityUnits), requestedQuantityGrams: asNumber(line.requestedQuantityGrams), allocatedQuantityGrams: asNumber(line.allocatedQuantityGrams), fulfilledQuantityGrams: asNumber(line.fulfilledQuantityGrams), returnedQuantityGrams: asNumber(line.returnedQuantityGrams), unitPrice: asNumber(line.unitPrice) })),
        reservations: canViewFinishedGoods ? reservations.map((item) => ({ ...item, quantityGrams: asNumber(item.quantityGrams), fulfilledQuantityGrams: asNumber(item.fulfilledQuantityGrams), expiresAt: iso(item.expiresAt) })) : [],
        fulfillments: fulfillments.map((item) => ({ ...item, shippedAt: iso(item.shippedAt), deliveredAt: iso(item.deliveredAt) })),
        returns: returns.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
        documents: canViewDocuments ? documents.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })) : [],
        traceability: canViewFinishedGoods ? edges.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })) : [],
        commercial: { currency: order.currencyCode, grossRevenue, costStatus: canViewCost ? 'NOT_EVALUATED' : 'REDACTED', estimatedMargin: canViewMargin ? null : undefined },
      }
    })
  }

  async dashboard(context: PlatformContext) {
    await this.require(context, 'commerce.view')
    return this.scoped(context, async (tx) => {
      const [counts, shipmentExceptions] = await Promise.all([
        tx.$queryRaw<Array<{ customers: bigint; quotes: bigint; orders: bigint; fulfillments: bigint }>>`
          SELECT
            (SELECT count(*) FROM v2_customers WHERE organization_id = ${context.organizationId} AND status = 'ACTIVE') AS customers,
            (SELECT count(*) FROM v2_quotes WHERE organization_id = ${context.organizationId} AND status IN ('DRAFT','SENT')) AS quotes,
            (SELECT count(*) FROM v2_sales_orders WHERE organization_id = ${context.organizationId} AND status NOT IN ('CANCELLED','CLOSED','FULFILLED')) AS orders,
            (SELECT count(*) FROM v2_sales_fulfillments WHERE organization_id = ${context.organizationId} AND status IN ('DRAFT','PICKING','PACKED','SHIPPED')) AS fulfillments
        `,
        tx.$queryRaw<Array<{ id: string; trackingNumber: string | null; status: string }>>`SELECT id, tracking_number AS "trackingNumber", status FROM v2_sales_shipments WHERE organization_id = ${context.organizationId} AND status = 'EXCEPTION' ORDER BY updated_at DESC LIMIT 20`,
      ])
      return { counts: { customers: Number(counts[0]?.customers ?? 0), quotes: Number(counts[0]?.quotes ?? 0), orders: Number(counts[0]?.orders ?? 0), fulfillments: Number(counts[0]?.fulfillments ?? 0) }, shipmentExceptions }
    })
  }
}
