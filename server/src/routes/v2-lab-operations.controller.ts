import { ArgumentsHost, Body, Catch, Controller, ExceptionFilter, Get, Headers, Param, Patch, Post, Query, Req, UseFilters } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ZodType } from 'zod'
import {
  complianceFacetSchema,
  goodsReceiptCreateSchema,
  inspectionCreateSchema,
  inventoryAdjustmentCreateSchema,
  inventoryTransferSchema,
  inventoryReservationCreateSchema,
  labWeighingConfirmSchema,
  labWeighingSessionCreateSchema,
  materialCreateSchema,
  materialDocumentCreateSchema,
  materialStatusChangeSchema,
  materialUpdateSchema,
  purchaseOrderCreateSchema,
  purchaseOrderStatusChangeSchema,
  purchaseRequestCreateSchema,
  purchaseRequestStatusChangeSchema,
  shipmentCreateSchema,
  shipmentStatusChangeSchema,
  supplierCreateSchema,
  supplierDocumentCreateSchema,
  supplierOfferCreateSchema,
  supplierOfferPriceSchema,
  supplierOfferStatusChangeSchema,
  supplierStatusChangeSchema,
} from '../../../packages/contracts/src/lab-operations.js'
import { LabOperationsService } from '../../../services/lab-ops/src/service.js'
import { PlatformError, PlatformService } from '../../../services/platform/src/service.js'
import type { PlatformContext } from '../../../services/platform/src/types.js'

function cookieValue(request: FastifyRequest, name: string) {
  const item = (request.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return item ? decodeURIComponent(item.slice(name.length + 1)) : undefined
}

function requestHost(request: FastifyRequest) {
  const forwarded = request.headers['x-forwarded-host']
  return (typeof forwarded === 'string' ? forwarded : request.headers.host ?? 'localhost').split(',')[0]?.split(':')[0]?.toLowerCase() ?? 'localhost'
}

function requestOriginAllowed(request: FastifyRequest) {
  const origin = request.headers.origin
  if (!origin) return true
  return new Set([`https://${requestHost(request)}`, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173', 'https://labofscents.org', 'https://www.labofscents.org']).has(origin)
}

function validated<T>(schema: ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Check the required fields and try again.', 422)
  return parsed.data
}

@Catch(PlatformError)
class LabOperationsErrorFilter implements ExceptionFilter {
  catch(error: PlatformError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<FastifyReply>().status(error.status).send({ error: { code: error.code, message: error.message } })
  }
}

@Controller('v2/lab')
@UseFilters(LabOperationsErrorFilter)
export class V2LabOperationsController {
  constructor(private readonly platform: PlatformService, private readonly lab: LabOperationsService) {}

  @Get('materials')
  async materials(@Req() request: FastifyRequest) { return { materials: await this.lab.listMaterials((await this.context(request)).context) } }

  @Post('materials')
  async createMaterial(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { material: await this.lab.createMaterial(context, validated(materialCreateSchema, body), key) }
  }

  @Patch('materials/:id/status')
  async materialStatus(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { material: await this.lab.changeMaterialStatus(context, id, validated(materialStatusChangeSchema, body).status, key) }
  }

  @Patch('materials/:id')
  async updateMaterial(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { material: await this.lab.updateMaterial(context, id, validated(materialUpdateSchema, body), key) }
  }

  @Post('materials/:id/documents')
  async materialDocument(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { document: await this.lab.addMaterialDocument(context, id, validated(materialDocumentCreateSchema, body), key) }
  }

  @Post('materials/:id/compliance')
  async materialCompliance(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { compliance: await this.lab.saveCompliance(context, id, validated(complianceFacetSchema, body), key) }
  }

  @Get('suppliers')
  async suppliers(@Req() request: FastifyRequest) { return { suppliers: await this.lab.listSuppliers((await this.context(request)).context) } }

  @Get('supplier-offers')
  async supplierOffers(@Req() request: FastifyRequest, @Query('supplierId') supplierId?: string) { return { offers: await this.lab.listSupplierOffers((await this.context(request)).context, supplierId) } }

  @Post('suppliers')
  async createSupplier(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { supplier: await this.lab.createSupplier(context, validated(supplierCreateSchema, body), key) }
  }

  @Patch('suppliers/:id/status')
  async supplierStatus(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { supplier: await this.lab.changeSupplierStatus(context, id, validated(supplierStatusChangeSchema, body).status, key) }
  }

  @Get('suppliers/:id/performance')
  async supplierPerformance(@Req() request: FastifyRequest, @Param('id') id: string) { return { performance: await this.lab.supplierPerformance((await this.context(request)).context, id) } }

  @Post('suppliers/:id/documents')
  async supplierDocument(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { document: await this.lab.addSupplierDocument(context, id, validated(supplierDocumentCreateSchema, body), key) }
  }

  @Post('supplier-offers')
  async createOffer(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { offer: await this.lab.createSupplierOffer(context, validated(supplierOfferCreateSchema, body), key) }
  }

  @Patch('supplier-offers/:id/status')
  async offerStatus(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { offer: await this.lab.changeSupplierOfferStatus(context, id, validated(supplierOfferStatusChangeSchema, body).status, key) }
  }

  @Post('supplier-offers/:id/prices')
  async offerPrice(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { offer: await this.lab.reviseSupplierOfferPrice(context, id, validated(supplierOfferPriceSchema, body), key) }
  }

  @Get('inventory/lots')
  async lots(@Req() request: FastifyRequest) { return { lots: await this.lab.listLots((await this.context(request)).context) } }

  @Get('inventory/summary')
  async inventorySummary(@Req() request: FastifyRequest) { return { summary: await this.lab.inventorySummary((await this.context(request)).context) } }

  @Get('inventory/lots/:id')
  async lotDetail(@Req() request: FastifyRequest, @Param('id') id: string) { return { lot: await this.lab.lotDetail((await this.context(request)).context, id) } }

  @Post('inventory/lots/:id/transfer')
  async transferLot(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { lot: await this.lab.transferLot(context, id, validated(inventoryTransferSchema, body), key) }
  }

  @Get('inventory/fefo')
  async fefo(@Req() request: FastifyRequest, @Query('materialId') materialId: string, @Query('targetGrams') targetGrams: string) {
    const parsed = Number(targetGrams)
    if (!materialId || !Number.isFinite(parsed) || parsed <= 0) throw new PlatformError('INVALID_INPUT', 'Provide a material and positive target weight.', 422)
    return { allocation: await this.lab.fefo((await this.context(request)).context, materialId, parsed) }
  }

  @Post('inventory/reservations')
  async reserve(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return this.lab.reserve(context, validated(inventoryReservationCreateSchema, body), key)
  }

  @Post('inventory/reservations/:id/release')
  async releaseReservation(@Req() request: FastifyRequest, @Param('id') id: string, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { reservation: await this.lab.releaseReservation(context, id, key) }
  }

  @Post('inventory/reservations/expire')
  async expireReservations(@Req() request: FastifyRequest, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return this.lab.expireReservations(context, key)
  }

  @Post('inventory/adjustments')
  async adjustInventory(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { movement: await this.lab.adjustInventory(context, validated(inventoryAdjustmentCreateSchema, body), key) }
  }

  @Post('inventory/movements/:id/reverse')
  async reverseMovement(@Req() request: FastifyRequest, @Param('id') id: string, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { movement: await this.lab.reverseMovement(context, id, key) }
  }

  @Post('weighing-sessions')
  async createWeighing(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { session: await this.lab.createWeighingSession(context, validated(labWeighingSessionCreateSchema, body), key) }
  }

  @Post('weighing-sessions/:id/confirm')
  async confirmWeighing(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { session: await this.lab.confirmWeighing(context, id, validated(labWeighingConfirmSchema, body).lines, key) }
  }

  @Post('procurement/requests')
  async createRequest(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { request: await this.lab.createPurchaseRequest(context, validated(purchaseRequestCreateSchema, body), key) }
  }

  @Get('procurement/overview')
  async procurementOverview(@Req() request: FastifyRequest) { return this.lab.listProcurement((await this.context(request)).context) }

  @Patch('procurement/requests/:id/status')
  async requestStatus(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { request: await this.lab.changePurchaseRequestStatus(context, id, validated(purchaseRequestStatusChangeSchema, body).status, key) }
  }

  @Post('procurement/orders')
  async createOrder(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { order: await this.lab.createPurchaseOrder(context, validated(purchaseOrderCreateSchema, body), key) }
  }

  @Patch('procurement/orders/:id/status')
  async orderStatus(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { order: await this.lab.changePurchaseOrderStatus(context, id, validated(purchaseOrderStatusChangeSchema, body).status, key) }
  }

  @Post('procurement/shipments')
  async createShipment(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { shipment: await this.lab.createShipment(context, validated(shipmentCreateSchema, body), key) }
  }

  @Patch('procurement/shipments/:id/status')
  async shipmentStatus(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    const input = validated(shipmentStatusChangeSchema, body)
    return { shipment: await this.lab.changeShipmentStatus(context, id, input.status, input.deliveredAt, key) }
  }

  @Post('procurement/receipts')
  async receive(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { receipt: await this.lab.receiveGoods(context, validated(goodsReceiptCreateSchema, body), key) }
  }

  @Post('procurement/receipts/:receiptId/lines/:lineId/inspection')
  async inspect(@Req() request: FastifyRequest, @Param('receiptId') receiptId: string, @Param('lineId') lineId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { inspection: await this.lab.inspectReceiptLine(context, receiptId, lineId, validated(inspectionCreateSchema, body), key) }
  }

  @Post('procurement/receipts/:receiptId/landed-cost')
  async landedCost(@Req() request: FastifyRequest, @Param('receiptId') receiptId: string, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { landedCost: await this.lab.postLandedCost(context, receiptId, key) }
  }

  private async context(request: FastifyRequest) {
    if (!request.headers.cookie) throw new PlatformError('SESSION_EXPIRED', 'Sign in is required.', 401)
    return this.platform.contextFromToken(cookieValue(request, this.platform.cookieName) ?? '', requestHost(request))
  }

  private async mutateGuard(request: FastifyRequest, context: PlatformContext, csrf?: string) {
    if (!requestOriginAllowed(request)) throw new PlatformError('ORIGIN_DENIED', 'Request origin is not allowed.', 403)
    await this.platform.assertCsrf(context, cookieValue(request, this.platform.cookieName) ?? '', csrf)
  }
}
