import { describe, expect, it, vi } from 'vitest'
import { DefaultAgentDomainTools } from './domain-tools.js'

const context = {
  organizationId: 'org_commerce_agent',
  userId: 'user_commerce_agent',
  sessionId: 'session_commerce_agent',
  role: 'Owner',
  hostname: 'commerce-agent.olfactoryops.com',
} as const

describe('Commerce agent domain adapter', () => {
  it('uses the tenant-scoped Commerce service and returns only a bounded status projection', async () => {
    const platform = { requirePermission: vi.fn().mockResolvedValue(undefined) }
    const tools = new DefaultAgentDomainTools({} as never, platform as never)
    const listOrders = vi.fn().mockResolvedValue([
      {
        id: 'order_visible', orderNumber: 'SO-1001', customerName: 'Sensitive customer', status: 'ALLOCATED',
        currencyCode: 'USD', total: 9999, createdAt: '2026-08-10T00:00:00.000Z',
      },
      {
        id: 'order_other', orderNumber: 'SO-1002', customerName: 'Another customer', status: 'DRAFT',
        currencyCode: 'EUR', total: 1, createdAt: '2026-08-09T00:00:00.000Z',
      },
    ])
    Object.assign(tools as unknown as { commerce: { listOrders: typeof listOrders } }, {
      commerce: { listOrders },
    })

    const result = await tools.commerceStatus(context, { query: 'so-1001' })

    expect(listOrders).toHaveBeenCalledWith(context)
    expect(result).toEqual({
      state: 'VERIFIED',
      resultCount: 1,
      orders: [{
        id: 'order_visible', orderNumber: 'SO-1001', status: 'ALLOCATED', currencyCode: 'USD', createdAt: '2026-08-10T00:00:00.000Z',
      }],
    })
    expect(JSON.stringify(result)).not.toContain('Sensitive customer')
    expect(JSON.stringify(result)).not.toContain('9999')
  })

  it('does not invent an order result when the authorized Commerce service has no matching record', async () => {
    const platform = { requirePermission: vi.fn().mockResolvedValue(undefined) }
    const tools = new DefaultAgentDomainTools({} as never, platform as never)
    const listOrders = vi.fn().mockResolvedValue([])
    Object.assign(tools as unknown as { commerce: { listOrders: typeof listOrders } }, {
      commerce: { listOrders },
    })

    await expect(tools.commerceStatus(context, { query: 'SO-MISSING' })).resolves.toEqual({
      state: 'NOT_ENOUGH_EVIDENCE', resultCount: 0, orders: [],
    })
  })
})
