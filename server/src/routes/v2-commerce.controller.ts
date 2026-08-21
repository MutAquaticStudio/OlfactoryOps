import { ArgumentsHost, Body, Catch, Controller, ExceptionFilter, Get, Headers, Param, Post, Req, UseFilters } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { CommerceService } from '../../../services/commerce/src/commerce-service.js'
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
  return typeof origin === 'string' && new Set([
    `https://${requestHost(request)}`,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ]).has(origin)
}

@Catch(PlatformError)
class CommerceErrorFilter implements ExceptionFilter {
  catch(error: PlatformError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<FastifyReply>().status(error.status).send({ error: { code: error.code, message: error.message } })
  }
}

/**
 * The Commerce controller carries no commercial state. It establishes the
 * authenticated tenant context and CSRF/Origin boundary, then delegates all
 * lifecycle, inventory, idempotency and audit decisions to CommerceService.
 */
@Controller('v2/commerce')
@UseFilters(CommerceErrorFilter)
export class V2CommerceController {
  constructor(private readonly platform: PlatformService, private readonly commerce: CommerceService) {}

  @Get('dashboard')
  async dashboard(@Req() request: FastifyRequest) { return this.commerce.dashboard((await this.context(request)).context) }

  @Get('customers')
  async customers(@Req() request: FastifyRequest) { return { customers: await this.commerce.listCustomers((await this.context(request)).context) } }

  @Post('customers')
  async createCustomer(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { customer: await this.commerce.createCustomer(context, body, key) }
  }

  @Post('customers/:customerId/contacts')
  async addCustomerContact(@Req() request: FastifyRequest, @Param('customerId') customerId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { contact: await this.commerce.addCustomerContact(context, customerId, body, key) }
  }

  @Post('customers/:customerId/addresses')
  async addCustomerAddress(@Req() request: FastifyRequest, @Param('customerId') customerId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { address: await this.commerce.addCustomerAddress(context, customerId, body, key) }
  }

  @Get('products')
  async products(@Req() request: FastifyRequest) { return { products: await this.commerce.listProducts((await this.context(request)).context) } }

  @Post('products')
  async createProduct(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { product: await this.commerce.createProduct(context, body, key) }
  }

  @Post('products/:productId/prices')
  async setProductPrice(@Req() request: FastifyRequest, @Param('productId') productId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { price: await this.commerce.setProductPrice(context, productId, body, key) }
  }

  @Get('quotes')
  async quotes(@Req() request: FastifyRequest) { return { quotes: await this.commerce.listQuotes((await this.context(request)).context) } }

  @Post('quotes')
  async createQuote(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { quote: await this.commerce.createQuote(context, body, key) }
  }

  @Post('quotes/:quoteId/:action')
  async transitionQuote(@Req() request: FastifyRequest, @Param('quoteId') quoteId: string, @Param('action') action: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const transition = ({ send: 'SEND', accept: 'ACCEPT', reject: 'REJECT', cancel: 'CANCEL' } as const)[action]
    if (!transition) throw new PlatformError('QUOTE_ACTION_INVALID', 'The quote action is not recognized.', 404)
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { quote: await this.commerce.transitionQuote(context, quoteId, transition, body, key) }
  }

  @Get('orders')
  async orders(@Req() request: FastifyRequest) { return { orders: await this.commerce.listOrders((await this.context(request)).context) } }

  @Post('orders')
  async createOrder(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { order: await this.commerce.createOrder(context, body, key) }
  }

  @Get('orders/:orderId')
  async orderDetail(@Req() request: FastifyRequest, @Param('orderId') orderId: string) { return this.commerce.detail((await this.context(request)).context, orderId) }

  @Post('orders/:orderId/confirm')
  async confirmOrder(@Req() request: FastifyRequest, @Param('orderId') orderId: string, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { order: await this.commerce.confirmOrder(context, orderId, key) }
  }

  @Get('orders/:orderId/allocation-suggestions')
  async allocationSuggestions(@Req() request: FastifyRequest, @Param('orderId') orderId: string) {
    return { suggestions: await this.commerce.allocationSuggestions((await this.context(request)).context, orderId) }
  }

  @Post('orders/:orderId/allocations')
  async allocateOrder(@Req() request: FastifyRequest, @Param('orderId') orderId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { allocation: await this.commerce.allocateOrder(context, orderId, body, key) }
  }

  @Post('orders/:orderId/cancel')
  async cancelOrder(@Req() request: FastifyRequest, @Param('orderId') orderId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { order: await this.commerce.cancelOrder(context, orderId, body, key) }
  }

  @Post('orders/:orderId/close')
  async closeOrder(@Req() request: FastifyRequest, @Param('orderId') orderId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { order: await this.commerce.closeOrder(context, orderId, body, key) }
  }

  @Post('orders/:orderId/fulfillments')
  async createFulfillment(@Req() request: FastifyRequest, @Param('orderId') orderId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { fulfillment: await this.commerce.createFulfillment(context, orderId, body, key) }
  }

  @Post('fulfillments/:fulfillmentId/:action')
  async transitionFulfillment(@Req() request: FastifyRequest, @Param('fulfillmentId') fulfillmentId: string, @Param('action') action: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const transition = ({ 'start-picking': 'START_PICKING', pack: 'PACK', ship: 'SHIP', deliver: 'DELIVER', cancel: 'CANCEL' } as const)[action]
    if (!transition) throw new PlatformError('FULFILLMENT_ACTION_INVALID', 'The fulfillment action is not recognized.', 404)
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { fulfillment: await this.commerce.transitionFulfillment(context, fulfillmentId, transition, body, key) }
  }

  @Post('returns')
  async createReturn(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { returnRequest: await this.commerce.createReturn(context, body, key) }
  }

  @Post('returns/:returnId/authorize')
  async authorizeReturn(@Req() request: FastifyRequest, @Param('returnId') returnId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { returnRequest: await this.commerce.authorizeReturn(context, returnId, body, key) }
  }

  @Get('returns/:returnId')
  async returnDetail(@Req() request: FastifyRequest, @Param('returnId') returnId: string) {
    return this.commerce.returnDetail((await this.context(request)).context, returnId)
  }

  @Post('returns/:returnId/receive')
  async receiveReturn(@Req() request: FastifyRequest, @Param('returnId') returnId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { returnRequest: await this.commerce.receiveReturn(context, returnId, body, key) }
  }

  @Post('returns/:returnId/disposition')
  async disposeReturn(@Req() request: FastifyRequest, @Param('returnId') returnId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { returnRequest: await this.commerce.disposeReturn(context, returnId, body, key) }
  }

  @Post('returns/:returnId/close')
  async closeReturn(@Req() request: FastifyRequest, @Param('returnId') returnId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { returnRequest: await this.commerce.closeReturn(context, returnId, body, key) }
  }

  @Post('documents')
  async attachDocument(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { document: await this.commerce.attachDocument(context, body, key) }
  }

  private async context(request: FastifyRequest) {
    if (!request.headers.cookie) throw new PlatformError('SESSION_EXPIRED', 'Sign in is required.', 401)
    return this.platform.contextFromToken(cookieValue(request, this.platform.cookieName) ?? '', requestHost(request))
  }

  private async mutation(request: FastifyRequest, context: PlatformContext, csrf?: string) {
    if (!requestOriginAllowed(request)) throw new PlatformError('ORIGIN_DENIED', 'Request origin is not allowed.', 403)
    await this.platform.assertCsrf(context, cookieValue(request, this.platform.cookieName) ?? '', csrf)
  }
}
