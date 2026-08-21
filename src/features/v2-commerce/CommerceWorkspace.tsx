import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, Check, ClipboardList, FileText, PackageCheck, Plus, RefreshCw, ShoppingCart, Truck, Users } from 'lucide-react'
import { commerceRequest, defaultCommerceApiBase } from './api'
import type { AllocationSuggestion, CapabilityMap, CommerceDashboard, CommerceOrderDetail, CommerceReturnDetail, Customer, Order, Product, Quote } from './types'
import './commerceWorkspace.css'

type CommerceScreen = 'overview' | 'customers' | 'products' | 'quotes' | 'orders' | 'detail'

export type CommerceWorkspaceProps = {
  apiBase?: string
  capabilities?: CapabilityMap
  initialOrderId?: string
  onNavigate?: (path: string) => void
}

function allowed(capabilities: CapabilityMap, permission: string) {
  return capabilities[permission] === true
}

function humanize(value: string | null | undefined) {
  return value ? value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Not set'
}

function money(value: number | null | undefined, currency = 'USD') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not evaluated'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

function quantity(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' g' : 'Not set'
}

function compact(value: string | null | undefined) {
  if (!value) return 'Not set'
  return value.length > 18 ? value.slice(0, 15) + '...' : value
}

function Status({ value }: { value: string }) {
  return <span className={'v2-commerce-status v2-commerce-status-' + value.toLowerCase()}>{humanize(value)}</span>
}

export function CommerceWorkspace({ apiBase = defaultCommerceApiBase, capabilities = {}, initialOrderId, onNavigate }: CommerceWorkspaceProps) {
  const [screen, setScreen] = useState<CommerceScreen>(initialOrderId ? 'detail' : 'overview')
  const [selectedOrderId, setSelectedOrderId] = useState(initialOrderId ?? '')
  const [dashboard, setDashboard] = useState<CommerceDashboard | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const canCommerce = allowed(capabilities, 'commerce.view')
  const canOrders = allowed(capabilities, 'orders.view')
  const canManage = allowed(capabilities, 'commerce.manage')
  const canCreateOrders = allowed(capabilities, 'orders.create')
  const canPrice = canManage && allowed(capabilities, 'costing.manage')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const tasks: Array<Promise<void>> = []
      if (canCommerce) {
        tasks.push(commerceRequest<CommerceDashboard>(apiBase, 'dashboard').then(setDashboard))
        tasks.push(commerceRequest<{ customers: Customer[] }>(apiBase, 'customers').then((payload) => setCustomers(payload.customers)))
        tasks.push(commerceRequest<{ products: Product[] }>(apiBase, 'products').then((payload) => setProducts(payload.products)))
        tasks.push(commerceRequest<{ quotes: Quote[] }>(apiBase, 'quotes').then((payload) => setQuotes(payload.quotes)))
      }
      if (canOrders) tasks.push(commerceRequest<{ orders: Order[] }>(apiBase, 'orders').then((payload) => setOrders(payload.orders)))
      await Promise.all(tasks)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Commerce data could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [apiBase, canCommerce, canOrders])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (initialOrderId) { setSelectedOrderId(initialOrderId); setScreen('detail') }
  }, [initialOrderId])

  const openOrder = (orderId: string) => {
    setSelectedOrderId(orderId)
    setScreen('detail')
    onNavigate?.('/v2/workspace/commerce/' + encodeURIComponent(orderId))
  }
  const back = () => {
    setScreen('orders')
    setSelectedOrderId('')
    onNavigate?.('/v2/workspace/commerce')
  }

  if (!canCommerce && !canOrders) return <section className="v2-commerce-workspace" data-testid="v2-commerce-restricted"><div className="v2-commerce-panel"><h2>Commerce access</h2><p>Your workspace role does not include commerce or order visibility.</p></div></section>

  const navigation = [
    { key: 'overview' as const, label: 'Overview', visible: canCommerce },
    { key: 'customers' as const, label: 'Customers', visible: canCommerce },
    { key: 'products' as const, label: 'Products & SKUs', visible: canCommerce },
    { key: 'quotes' as const, label: 'Quotes', visible: canCommerce },
    { key: 'orders' as const, label: 'Orders & fulfillment', visible: canOrders },
  ]

  return <section className="v2-commerce-workspace" data-testid="v2-commerce-dashboard">
    <header className="v2-commerce-heading">
      <div><span className="v2-eyebrow">Commerce</span><h2>Orders & fulfillment</h2><p>Commercial records use released Finished Goods only. Returns always enter quarantine for quality review.</p></div>
      <button type="button" className="v2-commerce-icon-button" title="Refresh commerce records" onClick={() => void refresh()} disabled={loading}><RefreshCw size={17} /></button>
    </header>
    <nav className="v2-commerce-tabs" aria-label="Commerce views">
      {navigation.filter((item) => item.visible).map((item) => <button type="button" key={item.key} className={screen === item.key ? 'is-active' : ''} onClick={() => { setScreen(item.key); onNavigate?.('/v2/workspace/commerce') }}>{item.label}</button>)}
    </nav>
    {error ? <div className="v2-commerce-alert is-error" role="alert">{error}</div> : null}
    {notice ? <div className="v2-commerce-alert" role="status">{notice}</div> : null}
    {screen === 'overview' ? <Overview dashboard={dashboard} loading={loading} onOpenOrders={() => setScreen('orders')} /> : null}
    {screen === 'customers' ? <CustomersPanel apiBase={apiBase} customers={customers} canManage={canManage} onChanged={async (message) => { setNotice(message); await refresh() }} onError={setError} /> : null}
    {screen === 'products' ? <ProductsPanel apiBase={apiBase} products={products} canManage={canManage} canPrice={canPrice} onChanged={async (message) => { setNotice(message); await refresh() }} onError={setError} /> : null}
    {screen === 'quotes' ? <QuotesPanel apiBase={apiBase} quotes={quotes} customers={customers} products={products} canManage={canManage} onChanged={async (message) => { setNotice(message); await refresh() }} onError={setError} /> : null}
    {screen === 'orders' ? <OrdersPanel apiBase={apiBase} orders={orders} customers={customers} products={products} canCreate={canCreateOrders} onOpen={openOrder} onChanged={async (message) => { setNotice(message); await refresh() }} onError={setError} /> : null}
    {screen === 'detail' && selectedOrderId ? <OrderDetail apiBase={apiBase} orderId={selectedOrderId} capabilities={capabilities} onBack={back} onChanged={async (message) => { setNotice(message); await refresh() }} onError={setError} /> : null}
  </section>
}

function Overview({ dashboard, loading, onOpenOrders }: { dashboard: CommerceDashboard | null; loading: boolean; onOpenOrders: () => void }) {
  const metrics = [
    { label: 'Active customers', value: dashboard?.counts.customers ?? 0, icon: Users },
    { label: 'Open quotes', value: dashboard?.counts.quotes ?? 0, icon: FileText },
    { label: 'Open orders', value: dashboard?.counts.orders ?? 0, icon: ShoppingCart },
    { label: 'Live fulfillments', value: dashboard?.counts.fulfillments ?? 0, icon: Truck },
  ]
  return <div className="v2-commerce-stack">
    <div className="v2-commerce-summary-grid">{metrics.map((metric) => { const Icon = metric.icon; return <div className="v2-commerce-metric" key={metric.label}><span><Icon size={15} />{metric.label}</span><strong>{loading ? '...' : metric.value}</strong></div> })}</div>
    <div className="v2-commerce-panel"><div className="v2-commerce-panel-heading"><div><h3>Shipping exceptions</h3><p>Carrier integration is provider-neutral. Exceptions are evidence, not silent delivery assumptions.</p></div><button type="button" className="v2-secondary-button" onClick={onOpenOrders}>Open orders</button></div>{dashboard?.shipmentExceptions.length ? <div className="v2-commerce-list">{dashboard.shipmentExceptions.map((shipment) => <div className="v2-commerce-row" key={shipment.id}><strong>{shipment.trackingNumber || compact(shipment.id)}</strong><Status value={shipment.status} /></div>)}</div> : <p className="v2-commerce-empty">No carrier exception is recorded.</p>}</div>
  </div>
}

function CustomersPanel({ apiBase, customers, canManage, onChanged, onError }: { apiBase: string; customers: Customer[]; canManage: boolean; onChanged: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const [customer, setCustomer] = useState({ code: '', name: '', paymentTerms: 'Net 30' })
  const [contact, setContact] = useState({ customerId: '', name: '', email: '', phone: '' })
  const [address, setAddress] = useState({ customerId: '', label: 'Primary shipping', recipientName: '', line1: '', city: '', countryCode: 'US' })
  const submit = async (event: FormEvent, operation: string, path: string, body: unknown, success: string) => {
    event.preventDefault(); onError('')
    try { await commerceRequest(apiBase, path, { method: 'POST', body: JSON.stringify(body) }, operation); await onChanged(success) } catch (error) { onError(error instanceof Error ? error.message : 'Commerce action failed.') }
  }
  return <div className="v2-commerce-stack">
    {canManage ? <div className="v2-commerce-panel"><h3>Add customer</h3><form className="v2-commerce-form-grid" onSubmit={(event) => void submit(event, 'commerce-customer-create', 'customers', { name: customer.name, code: customer.code || undefined, paymentTerms: customer.paymentTerms || undefined }, 'Customer created.')}><label>Customer name<input required value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} /></label><label>Customer code<input value={customer.code} onChange={(event) => setCustomer({ ...customer, code: event.target.value.toUpperCase() })} /></label><label>Payment terms<input value={customer.paymentTerms} onChange={(event) => setCustomer({ ...customer, paymentTerms: event.target.value })} /></label><button className="v2-primary-button" type="submit"><Plus size={16} />Create customer</button></form></div> : null}
    {canManage && customers.length ? <div className="v2-commerce-panel"><h3>Customer contacts & address</h3><div className="v2-commerce-two-forms"><form className="v2-commerce-form-grid" onSubmit={(event) => void submit(event, 'commerce-contact-create', 'customers/' + contact.customerId + '/contacts', { name: contact.name, email: contact.email || undefined, phone: contact.phone || undefined, primary: true }, 'Customer contact saved.')}><label>Customer<select required value={contact.customerId} onChange={(event) => setContact({ ...contact, customerId: event.target.value })}><option value="">Select customer</option>{customers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Contact name<input required value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} /></label><label>Email<input type="email" value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} /></label><label>Phone<input value={contact.phone} onChange={(event) => setContact({ ...contact, phone: event.target.value })} /></label><button className="v2-secondary-button" type="submit">Add contact</button></form><form className="v2-commerce-form-grid" onSubmit={(event) => void submit(event, 'commerce-address-create', 'customers/' + address.customerId + '/addresses', { kind: 'SHIPPING', label: address.label, recipientName: address.recipientName, line1: address.line1, city: address.city, countryCode: address.countryCode, primary: true }, 'Shipping address saved.')}><label>Customer<select required value={address.customerId} onChange={(event) => setAddress({ ...address, customerId: event.target.value })}><option value="">Select customer</option>{customers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Recipient<input required value={address.recipientName} onChange={(event) => setAddress({ ...address, recipientName: event.target.value })} /></label><label>Address line<input required value={address.line1} onChange={(event) => setAddress({ ...address, line1: event.target.value })} /></label><label>City<input required value={address.city} onChange={(event) => setAddress({ ...address, city: event.target.value })} /></label><button className="v2-secondary-button" type="submit">Add shipping address</button></form></div></div> : null}
    <div className="v2-commerce-panel"><h3>Customers</h3><div className="v2-commerce-list">{customers.length ? customers.map((item) => <div className="v2-commerce-row" key={item.id}><div><strong>{item.name}</strong><span>{item.code}</span></div><span>{item.contactCount ?? 0} contacts</span><span>{item.orderCount ?? 0} orders</span><Status value={item.status} /></div>) : <p className="v2-commerce-empty">No customer has been created.</p>}</div></div>
  </div>
}

function ProductsPanel({ apiBase, products, canManage, canPrice, onChanged, onError }: { apiBase: string; products: Product[]; canManage: boolean; canPrice: boolean; onChanged: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const [product, setProduct] = useState({ name: '', sku: '', formulaVersionId: '', packSizeGrams: '50' })
  const [price, setPrice] = useState({ productId: '', unitPrice: '', currency: 'USD' })
  const submit = async (event: FormEvent, operation: string, path: string, body: unknown, message: string) => {
    event.preventDefault(); onError('')
    try { await commerceRequest(apiBase, path, { method: 'POST', body: JSON.stringify(body) }, operation); await onChanged(message) } catch (error) { onError(error instanceof Error ? error.message : 'Product action failed.') }
  }
  return <div className="v2-commerce-stack">
    {canManage ? <div className="v2-commerce-panel"><h3>Create Finished Good SKU</h3><p className="v2-commerce-help">A SKU pins one immutable approved Formula Version. It can allocate only released Finished Good lots with that formula.</p><form className="v2-commerce-form-grid" onSubmit={(event) => void submit(event, 'commerce-product-create', 'products', { name: product.name, sku: product.sku, kind: 'FINISHED_GOOD', status: 'ACTIVE', formulaVersionId: product.formulaVersionId, packSizeGrams: Number(product.packSizeGrams), packLabel: product.packSizeGrams + ' g', availabilityPolicy: 'RELEASED_LOTS_ONLY' }, 'Finished Good SKU created.')}><label>SKU name<input required value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} /></label><label>SKU code<input required value={product.sku} onChange={(event) => setProduct({ ...product, sku: event.target.value.toUpperCase() })} /></label><label>Approved Formula Version ID<input required value={product.formulaVersionId} onChange={(event) => setProduct({ ...product, formulaVersionId: event.target.value })} /></label><label>Pack size (g)<input required type="number" min="0.001" value={product.packSizeGrams} onChange={(event) => setProduct({ ...product, packSizeGrams: event.target.value })} /></label><button className="v2-primary-button" type="submit"><PackageCheck size={16} />Create SKU</button></form></div> : null}
    {canPrice && products.length ? <div className="v2-commerce-panel"><h3>Set active price</h3><form className="v2-commerce-form-grid" onSubmit={(event) => void submit(event, 'commerce-price-set', 'products/' + price.productId + '/prices', { currency: price.currency, unitPrice: Number(price.unitPrice) }, 'Price revision saved.')}><label>Product<select required value={price.productId} onChange={(event) => setPrice({ ...price, productId: event.target.value })}><option value="">Select SKU</option>{products.map((item) => <option value={item.id} key={item.id}>{item.sku} - {item.name}</option>)}</select></label><label>Currency<input required value={price.currency} maxLength={3} onChange={(event) => setPrice({ ...price, currency: event.target.value.toUpperCase() })} /></label><label>Unit price<input required type="number" min="0" step="0.01" value={price.unitPrice} onChange={(event) => setPrice({ ...price, unitPrice: event.target.value })} /></label><button className="v2-secondary-button" type="submit">Save price</button></form></div> : null}
    <div className="v2-commerce-panel"><h3>Products & SKUs</h3><div className="v2-commerce-list">{products.length ? products.map((item) => <div className="v2-commerce-row" key={item.id}><div><strong>{item.sku}</strong><span>{item.name}</span></div><span>{item.packSizeGrams ? quantity(item.packSizeGrams) : item.productKind}</span><span>{item.activePrice === null || item.activePrice === undefined ? 'No active price' : money(item.activePrice, item.currencyCode || 'USD')}</span><Status value={item.status} /></div>) : <p className="v2-commerce-empty">No sellable SKU is configured.</p>}</div></div>
  </div>
}

function QuotesPanel({ apiBase, quotes, customers, products, canManage, onChanged, onError }: { apiBase: string; quotes: Quote[]; customers: Customer[]; products: Product[]; canManage: boolean; onChanged: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const [form, setForm] = useState({ customerId: '', productId: '', quantity: '1', currency: 'USD' })
  const create = async (event: FormEvent) => {
    event.preventDefault(); onError('')
    try {
      await commerceRequest(apiBase, 'quotes', { method: 'POST', body: JSON.stringify({ customerId: form.customerId, currency: form.currency, validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(), lines: [{ productId: form.productId, quantity: Number(form.quantity) }] }) }, 'commerce-quote-create')
      await onChanged('Quote created as a draft.')
    } catch (error) { onError(error instanceof Error ? error.message : 'Quote could not be created.') }
  }
  const transition = async (quoteId: string, action: 'send' | 'accept' | 'reject' | 'cancel') => {
    onError('')
    try { await commerceRequest(apiBase, 'quotes/' + quoteId + '/' + action, { method: 'POST', body: JSON.stringify({ rationale: 'Recorded in Commerce workspace.' }) }, 'commerce-quote-' + action + '-' + quoteId); await onChanged('Quote ' + action + 'ed.') } catch (error) { onError(error instanceof Error ? error.message : 'Quote action failed.') }
  }
  return <div className="v2-commerce-stack">
    {canManage ? <div className="v2-commerce-panel"><h3>Create quote</h3><form className="v2-commerce-form-grid" onSubmit={create}><label>Customer<select required value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}><option value="">Select customer</option>{customers.filter((item) => item.status === 'ACTIVE').map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>SKU<select required value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })}><option value="">Select active SKU</option>{products.filter((item) => item.status === 'ACTIVE').map((item) => <option value={item.id} key={item.id}>{item.sku} - {item.name}</option>)}</select></label><label>Quantity<input required type="number" min="1" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></label><button className="v2-primary-button" type="submit"><FileText size={16} />Create quote</button></form></div> : null}
    <div className="v2-commerce-panel"><h3>Quotes</h3><div className="v2-commerce-list">{quotes.length ? quotes.map((item) => <div className="v2-commerce-row is-actions" key={item.id}><div><strong>{item.quoteNumber}</strong><span>{item.customerName} - {money(item.total, item.currencyCode)}</span></div><span>Valid {new Date(item.validUntil).toLocaleDateString()}</span><Status value={item.status} />{canManage ? <div className="v2-commerce-actions">{item.status === 'DRAFT' ? <button type="button" className="v2-secondary-button" onClick={() => void transition(item.id, 'send')}>Send</button> : null}{item.status === 'SENT' ? <><button type="button" className="v2-primary-button" onClick={() => void transition(item.id, 'accept')}><Check size={15} />Accept</button><button type="button" className="v2-text-button" onClick={() => void transition(item.id, 'reject')}>Reject</button></> : null}</div> : null}</div>) : <p className="v2-commerce-empty">No quote has been created.</p>}</div></div>
  </div>
}

function OrdersPanel({ apiBase, orders, customers, products, canCreate, onOpen, onChanged, onError }: { apiBase: string; orders: Order[]; customers: Customer[]; products: Product[]; canCreate: boolean; onOpen: (orderId: string) => void; onChanged: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const [form, setForm] = useState({ customerId: '', productId: '', quantity: '1', currency: 'USD' })
  const create = async (event: FormEvent) => {
    event.preventDefault(); onError('')
    try {
      const response = await commerceRequest<{ order: { id: string } }>(apiBase, 'orders', { method: 'POST', body: JSON.stringify({ customerId: form.customerId, currency: form.currency, lines: [{ productId: form.productId, quantity: Number(form.quantity) }] }) }, 'commerce-order-create')
      await onChanged('Sales order created as a draft.')
      onOpen(response.order.id)
    } catch (error) { onError(error instanceof Error ? error.message : 'Order could not be created.') }
  }
  return <div className="v2-commerce-stack">
    {canCreate ? <div className="v2-commerce-panel"><h3>Create direct sales order</h3><form className="v2-commerce-form-grid" onSubmit={create}><label>Customer<select required value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}><option value="">Select customer</option>{customers.filter((item) => item.status === 'ACTIVE').map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>SKU<select required value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })}><option value="">Select active SKU</option>{products.filter((item) => item.status === 'ACTIVE').map((item) => <option value={item.id} key={item.id}>{item.sku} - {item.name}</option>)}</select></label><label>Quantity<input required type="number" min="1" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></label><button className="v2-primary-button" type="submit"><ShoppingCart size={16} />Create order</button></form></div> : null}
    <div className="v2-commerce-panel"><h3>Sales orders</h3><div className="v2-commerce-list">{orders.length ? orders.map((item) => <button type="button" className="v2-commerce-order-row" key={item.id} onClick={() => onOpen(item.id)}><span><strong>{item.orderNumber}</strong><small>{item.customerName}</small></span><span>{money(item.total, item.currencyCode)}</span><Status value={item.status} /></button>) : <p className="v2-commerce-empty">No sales order is available.</p>}</div></div>
  </div>
}

function OrderDetail({ apiBase, orderId, capabilities, onBack, onChanged, onError }: { apiBase: string; orderId: string; capabilities: CapabilityMap; onBack: () => void; onChanged: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const [detail, setDetail] = useState<CommerceOrderDetail | null>(null)
  const [suggestions, setSuggestions] = useState<AllocationSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedReturnId, setSelectedReturnId] = useState('')
  const [returnDetail, setReturnDetail] = useState<CommerceReturnDetail | null>(null)
  const [selectedReturnReceiptKey, setSelectedReturnReceiptKey] = useState('')
  const canCreate = allowed(capabilities, 'orders.create')
  const canReserve = allowed(capabilities, 'orders.reserve')
  const canFulfill = allowed(capabilities, 'orders.fulfill')
  const canDocuments = allowed(capabilities, 'documents.manage')
  const canViewDocuments = allowed(capabilities, 'documents.view')
  const canQualityApprove = canFulfill && canViewDocuments && allowed(capabilities, 'production.qc.approve')
  const canReleaseReturnedGood = canQualityApprove && allowed(capabilities, 'production.release')
  const canManageCommerce = allowed(capabilities, 'commerce.manage')

  const reload = useCallback(async () => {
    setLoading(true)
    try { setDetail(await commerceRequest<CommerceOrderDetail>(apiBase, 'orders/' + orderId)) } catch (error) { onError(error instanceof Error ? error.message : 'Order detail could not be loaded.') } finally { setLoading(false) }
  }, [apiBase, onError, orderId])
  useEffect(() => { void reload() }, [reload])

  const loadReturn = useCallback(async (returnId: string) => {
    try {
      const response = await commerceRequest<CommerceReturnDetail>(apiBase, 'returns/' + returnId)
      setSelectedReturnId(returnId)
      setReturnDetail(response)
      const firstOpenLot = response.eligibleLots.find((lot) => lot.shippedQuantityGrams > lot.receivedQuantityGrams)
      setSelectedReturnReceiptKey(firstOpenLot ? `${firstOpenLot.returnLineId}:${firstOpenLot.finishedGoodLotId}` : '')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Return detail could not be loaded.')
    }
  }, [apiBase, onError])

  const mutate = async (operation: string, path: string, body: unknown, message: string) => {
    onError('')
    try { await commerceRequest(apiBase, path, { method: 'POST', body: JSON.stringify(body) }, operation); await reload(); await onChanged(message) } catch (error) { onError(error instanceof Error ? error.message : 'Order action failed.') }
  }
  const suggest = async () => {
    onError('')
    try { const response = await commerceRequest<{ suggestions: AllocationSuggestion[] }>(apiBase, 'orders/' + orderId + '/allocation-suggestions'); setSuggestions(response.suggestions) } catch (error) { onError(error instanceof Error ? error.message : 'Allocation suggestions could not be loaded.') }
  }
  const receiveReturn = async () => {
    const selectedLot = returnDetail?.eligibleLots.find((lot) => `${lot.returnLineId}:${lot.finishedGoodLotId}` === selectedReturnReceiptKey)
    const returnLine = returnDetail?.lines.find((line) => line.id === selectedLot?.returnLineId)
    if (!selectedLot || !returnLine) return
    const quantityGrams = Math.min(
      selectedLot.shippedQuantityGrams - selectedLot.receivedQuantityGrams,
      returnLine.requestedQuantityGrams - returnLine.receivedQuantityGrams,
    )
    if (quantityGrams <= 0) {
      onError('This shipped lot has no remaining authorized quantity to receive.')
      return
    }
    onError('')
    try {
      await commerceRequest(apiBase, 'returns/' + selectedReturnId + '/receive', {
        method: 'POST',
        body: JSON.stringify({
          lines: [{ returnLineId: returnLine.id, finishedGoodLotId: selectedLot.finishedGoodLotId, quantityGrams }],
          inspectionNotes: 'Received to quarantine for quality disposition.',
        }),
      }, 'commerce-return-receive-' + selectedReturnId)
      await reload()
      await onChanged('Return received into quarantine.')
      await loadReturn(selectedReturnId)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Return could not be received into quarantine.')
    }
  }
  const activeFulfillment = detail?.fulfillments.find((item) => !['DELIVERED', 'CANCELLED'].includes(item.status))
  const nextFulfillmentAction = activeFulfillment?.status === 'DRAFT' ? { key: 'start-picking', label: 'Start picking' } : activeFulfillment?.status === 'PICKING' ? { key: 'pack', label: 'Pack' } : activeFulfillment?.status === 'PACKED' ? { key: 'ship', label: 'Ship' } : activeFulfillment?.status === 'SHIPPED' ? { key: 'deliver', label: 'Mark delivered' } : null
  const availableReturnLots = (returnDetail?.eligibleLots ?? []).filter((lot) => lot.shippedQuantityGrams > lot.receivedQuantityGrams)

  if (loading && !detail) return <div className="v2-commerce-panel"><p className="v2-commerce-empty">Loading sales order...</p></div>
  if (!detail) return <div className="v2-commerce-panel"><button type="button" className="v2-text-button" onClick={onBack}><ArrowLeft size={15} />Back to orders</button></div>
  return <div className="v2-commerce-stack" data-testid="v2-commerce-order-detail">
    <div className="v2-commerce-detail-heading"><button type="button" className="v2-text-button" onClick={onBack}><ArrowLeft size={15} />Orders</button><div><span className="v2-eyebrow">Sales order</span><h3>{detail.order.orderNumber}</h3><p>{detail.customer?.name || 'Customer record unavailable'} - <Status value={detail.order.status} /></p></div></div>
    <div className="v2-commerce-summary-grid"><div className="v2-commerce-metric"><span>Revenue</span><strong>{money(detail.commercial.grossRevenue, detail.commercial.currency)}</strong></div><div className="v2-commerce-metric"><span>Cost</span><strong>{detail.commercial.costStatus === 'REDACTED' ? 'Redacted' : 'Not evaluated'}</strong></div><div className="v2-commerce-metric"><span>Lines</span><strong>{detail.lines.length}</strong></div></div>
    <div className="v2-commerce-panel"><div className="v2-commerce-panel-heading"><div><h3>Order lines</h3><p>Finished Good quantities are shown in their physical gram basis for allocation and fulfillment.</p></div>{canCreate && detail.order.status === 'DRAFT' ? <button type="button" className="v2-primary-button" onClick={() => void mutate('commerce-order-confirm-' + orderId, 'orders/' + orderId + '/confirm', {}, 'Sales order confirmed.')}><Check size={15} />Confirm order</button> : null}</div><div className="v2-commerce-list">{detail.lines.map((line) => <div className="v2-commerce-row" key={line.id}><div><strong>{line.sku}</strong><span>{line.productName}</span></div><span>{line.quantityUnits} units - {quantity(line.requestedQuantityGrams)}</span><span>{quantity(line.allocatedQuantityGrams)} allocated - {quantity(line.fulfilledQuantityGrams)} fulfilled</span><span>{money(line.unitPrice, line.currencyCode)}</span></div>)}</div></div>
    {canReserve && ['CONFIRMED', 'ALLOCATING', 'PARTIALLY_ALLOCATED', 'ALLOCATED'].includes(detail.order.status) ? <div className="v2-commerce-panel"><div className="v2-commerce-panel-heading"><div><h3>Finished Good allocation</h3><p>Suggestions use released matching lots, FEFO where an expiry is available. Allocation writes a RESERVED ledger movement.</p></div><button type="button" className="v2-secondary-button" onClick={() => void suggest()}>Find eligible lots</button></div>{suggestions.length ? <div className="v2-commerce-list">{suggestions.map((suggestion) => <div className="v2-commerce-row is-actions" key={suggestion.orderLineId + suggestion.finishedGoodLotId}><div><strong>{suggestion.lotNumber}</strong><span>{quantity(suggestion.availableQuantityGrams)} available</span></div><span>{quantity(suggestion.suggestedQuantityGrams)} suggested</span><button type="button" className="v2-primary-button" onClick={() => void mutate('commerce-allocation-' + suggestion.orderLineId + '-' + suggestion.finishedGoodLotId, 'orders/' + orderId + '/allocations', { lines: [{ orderLineId: suggestion.orderLineId, finishedGoodLotId: suggestion.finishedGoodLotId, quantityGrams: suggestion.suggestedQuantityGrams }] }, 'Finished Good reserved for this order.')}>Reserve</button></div>)}</div> : <p className="v2-commerce-empty">No suggestion loaded yet.</p>}</div> : null}
    <div className="v2-commerce-panel"><div className="v2-commerce-panel-heading"><div><h3>Fulfillment & shipment</h3><p>Only a reserved Finished Good lot can ship. A shipment records an immutable FULFILLMENT ledger movement.</p></div>{canFulfill && detail.reservations.length && !activeFulfillment ? <button type="button" className="v2-primary-button" onClick={() => { const reservation = detail.reservations.find((item) => item.status === 'ACTIVE'); if (reservation) void mutate('commerce-fulfillment-create-' + reservation.id, 'orders/' + orderId + '/fulfillments', { carrier: 'Manual carrier', packageCount: 1, lines: [{ reservationId: reservation.id, quantityGrams: reservation.quantityGrams - reservation.fulfilledQuantityGrams }] }, 'Fulfillment created.') }}><Truck size={15} />Create fulfillment</button> : null}</div>{detail.fulfillments.length ? <div className="v2-commerce-list">{detail.fulfillments.map((item) => <div className="v2-commerce-row is-actions" key={item.id}><div><strong>{item.fulfillmentNumber}</strong><span>{item.carrier || 'Carrier not assigned'} - {item.trackingNumber || 'Tracking not assigned'}</span></div><Status value={item.status} />{canFulfill && nextFulfillmentAction && activeFulfillment?.id === item.id ? <button type="button" className="v2-secondary-button" onClick={() => void mutate('commerce-fulfillment-' + nextFulfillmentAction.key + '-' + item.id, 'fulfillments/' + item.id + '/' + nextFulfillmentAction.key, {}, nextFulfillmentAction.label + ' recorded.')}>{nextFulfillmentAction.label}</button> : null}</div>)}</div> : <p className="v2-commerce-empty">No fulfillment is open.</p>}</div>
    {canFulfill ? <div className="v2-commerce-panel"><h3>Returns</h3><p>Returned stock never becomes sellable automatically. Each receipt selects a shipped lot and enters quarantine for Quality.</p><div className="v2-commerce-actions">{detail.lines.some((line) => line.fulfilledQuantityGrams > line.returnedQuantityGrams) ? <button type="button" className="v2-secondary-button" onClick={() => { const line = detail.lines.find((item) => item.fulfilledQuantityGrams > item.returnedQuantityGrams); if (line) void mutate('commerce-return-create-' + line.id, 'returns', { orderId, reason: 'Customer return awaiting quality disposition.', lines: [{ orderLineId: line.id, quantityGrams: Math.min(1, line.fulfilledQuantityGrams - line.returnedQuantityGrams) }] }, 'Return request created.') }}>Create return request</button> : null}{detail.returns.map((item) => <button type="button" className="v2-text-button" key={item.id} onClick={() => void loadReturn(item.id)}>{item.returnNumber} - {humanize(item.status)}</button>)}</div>{returnDetail ? <div className="v2-commerce-return-actions"><strong>{returnDetail.returnRequest.returnNumber}</strong>{returnDetail.returnRequest.status === 'REQUESTED' ? <button type="button" className="v2-secondary-button" onClick={() => void (async () => { await mutate('commerce-return-authorize-' + selectedReturnId, 'returns/' + selectedReturnId + '/authorize', { rationale: 'Controlled return authorization.' }, 'Return authorized.'); await loadReturn(selectedReturnId) })()}>Authorize</button> : null}{returnDetail.returnRequest.status === 'AUTHORIZED' && availableReturnLots.length ? <><label>Shipped lot<select value={selectedReturnReceiptKey} onChange={(event) => setSelectedReturnReceiptKey(event.target.value)}>{availableReturnLots.map((lot) => <option value={`${lot.returnLineId}:${lot.finishedGoodLotId}`} key={`${lot.returnLineId}:${lot.finishedGoodLotId}`}>{lot.lotNumber} - {quantity(lot.shippedQuantityGrams - lot.receivedQuantityGrams)} remaining</option>)}</select></label><button type="button" className="v2-primary-button" onClick={() => void receiveReturn()}>Receive to quarantine</button></> : null}{returnDetail.receipts.length ? <span>{returnDetail.receipts.length} immutable receipt{returnDetail.receipts.length === 1 ? '' : 's'} recorded.</span> : null}<ReturnQualityControls apiBase={apiBase} detail={returnDetail} canDocuments={canDocuments} canQualityApprove={canQualityApprove} canReleaseReturnedGood={canReleaseReturnedGood} canManageCommerce={canManageCommerce} refreshReturn={() => loadReturn(selectedReturnId)} onReloadOrder={reload} onChanged={onChanged} onError={onError} /></div> : null}</div> : null}
    {canDocuments ? <DocumentForm apiBase={apiBase} orderId={orderId} onChanged={onChanged} onError={onError} /> : null}
    {canCreate && !['CLOSED', 'FULFILLED'].includes(detail.order.status) ? <div className="v2-commerce-actions"><button type="button" className="v2-text-button is-danger" onClick={() => void mutate('commerce-order-cancel-' + orderId, 'orders/' + orderId + '/cancel', { rationale: 'Controlled commercial cancellation.' }, 'Sales order cancelled and unfulfilled reservations released.')}>Cancel order</button></div> : null}
  </div>
}

function ReturnQualityControls({ apiBase, detail, canDocuments, canQualityApprove, canReleaseReturnedGood, canManageCommerce, refreshReturn, onReloadOrder, onChanged, onError }: {
  apiBase: string
  detail: CommerceReturnDetail
  canDocuments: boolean
  canQualityApprove: boolean
  canReleaseReturnedGood: boolean
  canManageCommerce: boolean
  refreshReturn: () => Promise<void>
  onReloadOrder: () => Promise<void>
  onChanged: (message: string) => Promise<void>
  onError: (message: string) => void
}) {
  const [form, setForm] = useState({ objectRef: '', contentHash: '', rationale: 'Quality disposition recorded with controlled return evidence.' })
  const qcDocuments = useMemo(
    () => detail.documents.filter((document) => document.documentKind === 'RETURN_QC'),
    [detail.documents],
  )
  const [evidenceDocumentId, setEvidenceDocumentId] = useState('')
  useEffect(() => {
    setEvidenceDocumentId((current) => qcDocuments.some((document) => document.id === current) ? current : (qcDocuments[0]?.id ?? ''))
  }, [detail.returnRequest.id, qcDocuments])

  const afterMutation = async (message: string) => {
    await refreshReturn()
    await onReloadOrder()
    await onChanged(message)
  }
  const attachQualityEvidence = async (event: FormEvent) => {
    event.preventDefault()
    onError('')
    try {
      const response = await commerceRequest<{ document: { id: string } }>(apiBase, 'documents', {
        method: 'POST',
        body: JSON.stringify({
          documentKind: 'RETURN_QC', objectRef: form.objectRef, contentHash: form.contentHash,
          subjectType: 'RETURN', subjectId: detail.returnRequest.id,
        }),
      }, 'commerce-return-qc-document-' + detail.returnRequest.id)
      setEvidenceDocumentId(response.document.id)
      await afterMutation('Return QC evidence attached.')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Return QC evidence could not be attached.')
    }
  }
  const dispose = async (disposition: 'HOLD_FOR_QUALITY' | 'REJECT_TO_WASTE' | 'RELEASE_TO_AVAILABLE') => {
    if (!evidenceDocumentId) {
      onError('Attach and select an active return QC evidence document before disposition.')
      return
    }
    onError('')
    try {
      await commerceRequest(apiBase, 'returns/' + detail.returnRequest.id + '/disposition', {
        method: 'POST',
        body: JSON.stringify({ disposition, rationale: form.rationale, evidenceDocumentSnapshotIds: [evidenceDocumentId] }),
      }, 'commerce-return-disposition-' + detail.returnRequest.id + '-' + disposition)
      await afterMutation(disposition === 'RELEASE_TO_AVAILABLE' ? 'Returned quantity released to available Finished Goods.' : disposition === 'REJECT_TO_WASTE' ? 'Returned quantity rejected to controlled waste.' : 'Returned quantity remains in Quality quarantine.')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Return quality disposition could not be recorded.')
    }
  }
  const close = async () => {
    onError('')
    try {
      await commerceRequest(apiBase, 'returns/' + detail.returnRequest.id + '/close', {
        method: 'POST', body: JSON.stringify({ rationale: form.rationale }),
      }, 'commerce-return-close-' + detail.returnRequest.id)
      await afterMutation('Return workflow closed.')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Return could not be closed.')
    }
  }

  if (!['INSPECTING', 'DISPOSITIONED', 'REJECTED'].includes(detail.returnRequest.status)) return null
  return <div className="v2-commerce-quality-controls">
    <h4>Quality disposition</h4>
    {canDocuments && detail.returnRequest.status === 'INSPECTING' ? <form className="v2-commerce-form-grid" onSubmit={attachQualityEvidence}>
      <label>QC evidence reference<input required value={form.objectRef} placeholder="storage://returns/qc-report.pdf" onChange={(event) => setForm({ ...form, objectRef: event.target.value })} /></label>
      <label>QC evidence SHA-256<input required pattern="[a-fA-F0-9]{64}" value={form.contentHash} onChange={(event) => setForm({ ...form, contentHash: event.target.value.toLowerCase() })} /></label>
      <button className="v2-secondary-button" type="submit"><ClipboardList size={15} />Attach QC evidence</button>
    </form> : null}
    {qcDocuments.length ? <label>QC evidence<select value={evidenceDocumentId} onChange={(event) => setEvidenceDocumentId(event.target.value)}>{qcDocuments.map((document) => <option value={document.id} key={document.id}>{compact(document.objectRef)}</option>)}</select></label> : null}
    {detail.returnRequest.status === 'INSPECTING' ? <div className="v2-commerce-actions"><label>Disposition rationale<input required value={form.rationale} onChange={(event) => setForm({ ...form, rationale: event.target.value })} /></label>{canQualityApprove ? <button type="button" className="v2-secondary-button" onClick={() => void dispose('HOLD_FOR_QUALITY')}>Keep in quarantine</button> : null}{canQualityApprove ? <button type="button" className="v2-text-button is-danger" onClick={() => void dispose('REJECT_TO_WASTE')}>Reject to waste</button> : null}{canReleaseReturnedGood ? <button type="button" className="v2-primary-button" onClick={() => void dispose('RELEASE_TO_AVAILABLE')}>Release to available</button> : null}</div> : null}
    {detail.disposition ? <p>Disposition: {humanize(detail.disposition.disposition)} at {new Date(detail.disposition.decidedAt).toLocaleString()}.</p> : null}
    {canManageCommerce && ['DISPOSITIONED', 'REJECTED'].includes(detail.returnRequest.status) ? <button type="button" className="v2-secondary-button" onClick={() => void close()}>Close return</button> : null}
  </div>
}

function DocumentForm({ apiBase, orderId, onChanged, onError }: { apiBase: string; orderId: string; onChanged: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const [form, setForm] = useState({ objectRef: '', contentHash: '' })
  const submit = async (event: FormEvent) => {
    event.preventDefault(); onError('')
    try { await commerceRequest(apiBase, 'documents', { method: 'POST', body: JSON.stringify({ documentKind: 'ORDER_CONFIRMATION', objectRef: form.objectRef, contentHash: form.contentHash, subjectType: 'ORDER', subjectId: orderId }) }, 'commerce-document-order-' + orderId); await onChanged('Customer-safe order document attached.') } catch (error) { onError(error instanceof Error ? error.message : 'Document could not be attached.') }
  }
  return <div className="v2-commerce-panel"><h3>Customer-safe order document</h3><form className="v2-commerce-form-grid" onSubmit={submit}><label>Object reference<input required value={form.objectRef} placeholder="storage://orders/confirmation.pdf" onChange={(event) => setForm({ ...form, objectRef: event.target.value })} /></label><label>SHA-256 content hash<input required pattern="[a-fA-F0-9]{64}" value={form.contentHash} onChange={(event) => setForm({ ...form, contentHash: event.target.value.toLowerCase() })} /></label><button className="v2-secondary-button" type="submit"><ClipboardList size={15} />Attach document</button></form></div>
}
