import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FlaskConical,
  GitBranch,
  LoaderCircle,
  PackageCheck,
  Plus,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Workflow,
} from 'lucide-react'
import { createProductionOperationKeyCache, defaultProductionApiBase, productionRequest } from './api'
import type {
  AllocationSuggestion,
  CapabilityMap,
  CapaRecord,
  DeviationRecord,
  FinishedGoodLot,
  FinishedLotGenealogy,
  FormulaVersion,
  ProductionAllocation,
  ProductionDocument,
  ProductionMaterialUsage,
  ProductionOrder,
  ProductionOrderDetail,
  ProductionOrderStatus,
  ProductionReworkRecord,
  ProductionRequirement,
  ProductionStageKind,
  ProductionStageStatus,
  QcResult,
  QcSpec,
  StageRecord,
  WeighingLine,
  WeighingSession,
  YieldRecord,
} from './types'
import './productionWorkspace.css'

type WorkspaceScreen =
  | { kind: 'dashboard' }
  | { kind: 'create' }
  | { kind: 'detail'; orderId: string }

export type ProductionWorkspaceProps = {
  apiBase?: string
  capabilities?: CapabilityMap
  initialOrderId?: string
  onNavigate?: (path: string) => void
}

type DetailTab = 'overview' | 'materials' | 'weighing' | 'process' | 'quality' | 'deviations' | 'release' | 'genealogy'

type DashboardProps = {
  apiBase: string
  capabilities: CapabilityMap
  onCreate: () => void
  onOpenOrder: (orderId: string) => void
}

type CreateOrderProps = {
  apiBase: string
  capabilities: CapabilityMap
  onCancel: () => void
  onCreated: (orderId: string) => void
}

type OrderDetailProps = {
  apiBase: string
  capabilities: CapabilityMap
  orderId: string
  onBack: () => void
}

type ActionButtonProps = {
  children: ReactNode
  actionId: string
  busyAction: string | null
  onClick: () => void
  kind?: 'primary' | 'secondary' | 'text'
  disabled?: boolean
}

type ProductionAction = (actionId: string, path: string, body?: unknown) => Promise<boolean>

const orderStatuses: ProductionOrderStatus[] = [
  'DRAFT',
  'PLANNED',
  'READY_FOR_WEIGHING',
  'WEIGHING',
  'COMPOUNDING',
  'CONDITIONING',
  'FILTRATION',
  'FILLING',
  'QC',
  'HOLD',
  'REWORK',
  'RELEASED',
  'REJECTED',
  'CANCELLED',
  'CLOSED',
]

const stageKinds: ProductionStageKind[] = ['COMPOUNDING', 'CONDITIONING', 'FILTRATION', 'FILLING']

const tabs: Array<{ id: DetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'materials', label: 'Materials' },
  { id: 'weighing', label: 'Weighing' },
  { id: 'process', label: 'Process' },
  { id: 'quality', label: 'QC' },
  { id: 'deviations', label: 'Deviations' },
  { id: 'release', label: 'Release' },
  { id: 'genealogy', label: 'Genealogy' },
]

function allowed(capabilities: CapabilityMap, permission: string) {
  return capabilities[permission] === true
}

function humanize(value: string | null | undefined) {
  if (!value) return 'Not set'
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

function formatQuantity(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not set'
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })} g`
}

function compactId(value: string | null | undefined) {
  if (!value) return 'Not assigned'
  return value.length > 16 ? `${value.slice(0, 13)}...` : value
}

function requirementRequired(requirement: ProductionRequirement) {
  return requirement.plannedQuantityGrams ?? requirement.requiredQuantityGrams ?? requirement.requiredGrams ?? null
}

function requirementAllocated(requirement: ProductionRequirement) {
  return requirement.allocatedQuantityGrams ?? requirement.allocatedGrams ?? null
}

function requirementWeighed(requirement: ProductionRequirement) {
  return requirement.weighedQuantityGrams ?? requirement.weighedGrams ?? null
}

function suggestionQuantity(suggestion: AllocationSuggestion) {
  return suggestion.suggestedQuantityGrams ?? suggestion.quantityGrams ?? null
}

function allocationQuantity(allocation: ProductionAllocation) {
  return allocation.allocatedQuantityGrams ?? allocation.allocatedGrams ?? suggestionQuantity(allocation)
}

function allocationLotId(allocation: ProductionAllocation) {
  return allocation.inventoryLotId ?? allocation.lotId
}

function yieldExpected(record: YieldRecord | null | undefined) {
  return record?.inputConsumedGrams ?? record?.expectedQuantityGrams ?? record?.expectedGrams ?? null
}

function yieldActual(record: YieldRecord | null | undefined) {
  return record?.bulkOutputGrams ?? record?.actualQuantityGrams ?? record?.actualGrams ?? null
}

function yieldWaste(record: YieldRecord | null | undefined) {
  return record?.wasteQuantityGrams ?? record?.wasteGrams ?? null
}

function orderQuantity(order: ProductionOrder) {
  return order.targetBulkGrams ?? order.targetQuantityGrams ?? order.plannedQuantityGrams ?? null
}

function statusClass(status: string | null | undefined) {
  return `v2-production-status is-${(status || 'unknown').toLowerCase().replaceAll('_', '-')}`
}

function getList<T>(payload: unknown, key: string): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (!payload || typeof payload !== 'object') return []
  const candidate = (payload as Record<string, unknown>)[key]
  return Array.isArray(candidate) ? candidate as T[] : []
}

function getObject<T>(payload: unknown, key: string): T | null {
  if (!payload || typeof payload !== 'object') return null
  const candidate = (payload as Record<string, unknown>)[key]
  return candidate && typeof candidate === 'object' ? candidate as T : null
}

function LoadingState({ label = 'Loading production work...' }: { label?: string }) {
  return <div className="v2-production-loading"><LoaderCircle aria-hidden="true" size={20} /><span>{label}</span></div>
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="v2-production-error" role="alert">
      <CircleAlert aria-hidden="true" size={18} />
      <span>{message}</span>
      {onRetry ? <button className="v2-secondary-button" type="button" onClick={onRetry}>Try again</button> : null}
    </div>
  )
}

function SuccessState({ message }: { message: string }) {
  return <div className="v2-production-success" data-testid="v2-production-success" role="status" aria-live="polite"><CheckCircle2 aria-hidden="true" size={18} /><span>{message}</span></div>
}

function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="v2-production-empty"><strong>{title}</strong><p>{children}</p></div>
}

function RestrictedState() {
  return (
    <section className="v2-production-workspace" data-testid="v2-production-restricted">
      <header className="v2-production-heading">
        <div>
          <span className="v2-eyebrow">Production</span>
          <h2>Production workspace</h2>
          <p>Your role does not include production records.</p>
        </div>
      </header>
      <div className="v2-production-panel v2-production-restricted">
        <ShieldAlert aria-hidden="true" size={26} />
        <div><h3>Access is restricted</h3><p>Ask a workspace administrator for the production access you need.</p></div>
      </div>
    </section>
  )
}

function ActionButton({ children, actionId, busyAction, onClick, kind = 'secondary', disabled = false }: ActionButtonProps) {
  const busy = busyAction === actionId
  const className = kind === 'primary' ? 'v2-primary-button' : kind === 'text' ? 'v2-text-button' : 'v2-secondary-button'
  return (
    <button className={className} type="button" onClick={onClick} disabled={disabled || busy}>
      {busy ? <LoaderCircle className="v2-production-inline-loader" aria-hidden="true" size={15} /> : null}
      {children}
    </button>
  )
}

export function ProductionWorkspace({
  apiBase = defaultProductionApiBase,
  capabilities = {},
  initialOrderId,
  onNavigate,
}: ProductionWorkspaceProps) {
  const [screen, setScreen] = useState<WorkspaceScreen>(initialOrderId ? { kind: 'detail', orderId: initialOrderId } : { kind: 'dashboard' })

  useEffect(() => {
    if (initialOrderId) setScreen({ kind: 'detail', orderId: initialOrderId })
  }, [initialOrderId])

  const openOrder = (orderId: string) => {
    setScreen({ kind: 'detail', orderId })
    onNavigate?.(`/v2/workspace/production/${encodeURIComponent(orderId)}`)
  }

  const openDashboard = () => {
    setScreen({ kind: 'dashboard' })
    onNavigate?.('/v2/workspace/production')
  }

  if (!allowed(capabilities, 'production.view')) return <RestrictedState />

  if (screen.kind === 'create') {
    return (
      <CreateProductionOrder
        apiBase={apiBase}
        capabilities={capabilities}
        onCancel={openDashboard}
        onCreated={openOrder}
      />
    )
  }

  if (screen.kind === 'detail') {
    return <ProductionOrderDetailView apiBase={apiBase} capabilities={capabilities} orderId={screen.orderId} onBack={openDashboard} />
  }

  return <ProductionDashboard apiBase={apiBase} capabilities={capabilities} onCreate={() => setScreen({ kind: 'create' })} onOpenOrder={openOrder} />
}

export function ProductionDashboard({ apiBase, capabilities, onCreate, onOpenOrder }: DashboardProps) {
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [filter, setFilter] = useState<'ALL' | ProductionOrderStatus>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const payload = await productionRequest<unknown>(apiBase)
      setOrders(getList<ProductionOrder>(payload, 'orders'))
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Production orders could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => { void refresh() }, [refresh])

  const filtered = useMemo(() => filter === 'ALL' ? orders : orders.filter((order) => order.status === filter), [filter, orders])
  const activeCount = useMemo(() => orders.filter((order) => !['RELEASED', 'CANCELLED'].includes(order.status)).length, [orders])
  const releaseReviewCount = useMemo(() => orders.filter((order) => order.status === 'QC').length, [orders])
  const heldCount = useMemo(() => orders.filter((order) => order.status === 'HOLD' || order.status === 'REWORK').length, [orders])

  return (
    <section className="v2-production-workspace" data-testid="v2-production-dashboard">
      <header className="v2-production-heading">
        <div>
          <span className="v2-eyebrow">Production</span>
          <h2>Production workspace</h2>
          <p>Plan the batch, assign materials, record actuals, and release only when the evidence is ready.</p>
        </div>
        <div className="v2-production-heading-actions">
          <button className="v2-production-icon-button" type="button" onClick={() => void refresh()} title="Refresh production orders" aria-label="Refresh production orders">
            <RefreshCw aria-hidden="true" size={17} />
          </button>
          {allowed(capabilities, 'production.create') ? <button className="v2-primary-button" type="button" onClick={onCreate}><Plus aria-hidden="true" size={16} /> Create order</button> : null}
        </div>
      </header>

      <div className="v2-production-summary-grid" aria-label="Production summary">
        <SummaryMetric label="Active orders" value={activeCount} icon={<Workflow aria-hidden="true" size={18} />} />
        <SummaryMetric label="Awaiting QC review" value={releaseReviewCount} icon={<ClipboardCheck aria-hidden="true" size={18} />} />
        <SummaryMetric label="Held or rework" value={heldCount} icon={<ShieldAlert aria-hidden="true" size={18} />} />
      </div>

      <section className="v2-production-panel" aria-labelledby="production-orders-heading">
        <div className="v2-production-panel-heading">
          <div><h3 id="production-orders-heading">Production orders</h3><p>Open an order to continue its controlled sequence.</p></div>
          <label className="v2-production-filter">Status
            <select value={filter} onChange={(event) => setFilter(event.target.value as 'ALL' | ProductionOrderStatus)}>
              <option value="ALL">All statuses</option>
              {orderStatuses.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}
            </select>
          </label>
        </div>

        {loading ? <LoadingState /> : null}
        {!loading && error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}
        {!loading && !error && !filtered.length ? (
          <EmptyState title={filter === 'ALL' ? 'No production orders yet' : 'No orders match this status'}>
            {filter === 'ALL' && allowed(capabilities, 'production.create') ? 'Create an order from an approved Formula Version to begin.' : 'Choose another status or refresh the list.'}
          </EmptyState>
        ) : null}
        {!loading && !error && filtered.length ? (
          <div className="v2-production-order-list">
            {filtered.map((order) => (
              <button className="v2-production-order-row" type="button" key={order.id} onClick={() => onOpenOrder(order.id)}>
                <span className="v2-production-order-title"><strong>{order.orderNumber || order.code || order.name || compactId(order.id)}</strong><small>{order.formulaVersionName || 'Formula version pending'}</small></span>
                <span className={statusClass(order.status)}>{humanize(order.status)}</span>
                <span>{formatQuantity(orderQuantity(order))}</span>
                <span>{formatDate(order.plannedStartAt || order.scheduledFor || order.updatedAt || order.createdAt)}</span>
                <ChevronRight aria-hidden="true" size={18} />
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </section>
  )
}

function SummaryMetric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return <div className="v2-production-summary-metric"><span>{icon}{label}</span><strong>{value}</strong></div>
}

function CreateProductionOrder({ apiBase, capabilities, onCancel, onCreated }: CreateOrderProps) {
  const [versions, setVersions] = useState<FormulaVersion[]>([])
  const [loadingVersions, setLoadingVersions] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ orderNumber: '', formulaVersionId: '', targetBulkGrams: '', targetOutputGrams: '', plannedStartAt: '', dueAt: '', notes: '' })

  useEffect(() => {
    let active = true
    setLoadingVersions(true)
    void productionRequest<unknown>(apiBase, 'formula-versions')
      .then((payload) => { if (active) setVersions(getList<FormulaVersion>(payload, 'versions')) })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Approved Formula Versions could not be loaded.') })
      .finally(() => { if (active) setLoadingVersions(false) })
    return () => { active = false }
  }, [apiBase])

  const createOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const targetBulkGrams = Number(form.targetBulkGrams)
    if (!form.formulaVersionId) {
      setError('Choose an approved Formula Version.')
      return
    }
    if (!Number.isFinite(targetBulkGrams) || targetBulkGrams <= 0) {
      setError('Target bulk quantity must be greater than zero.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const payload = await productionRequest<unknown>(apiBase, '', {
        method: 'POST',
        body: JSON.stringify({
          formulaVersionId: form.formulaVersionId,
          targetBulkGrams,
          ...(Number(form.targetOutputGrams) > 0 ? { targetOutputGrams: Number(form.targetOutputGrams) } : {}),
          ...(form.orderNumber.trim() ? { orderNumber: form.orderNumber.trim() } : {}),
          ...(form.plannedStartAt ? { plannedStartAt: new Date(form.plannedStartAt).toISOString() } : {}),
          ...(form.dueAt ? { dueAt: new Date(form.dueAt).toISOString() } : {}),
          ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        }),
      })
      const order = getObject<ProductionOrder>(payload, 'order')
      if (!order?.id) throw new Error('The order was created, but its record could not be opened.')
      onCreated(order.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The production order could not be created.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="v2-production-workspace" data-testid="v2-production-create-order">
      <header className="v2-production-heading">
        <div>
          <button className="v2-text-button v2-production-back" type="button" onClick={onCancel}><ArrowLeft aria-hidden="true" size={16} /> Production orders</button>
          <span className="v2-eyebrow">New production order</span>
          <h2>Start from an approved formula</h2>
          <p>Set the output target and the date the team will work to.</p>
        </div>
      </header>
      <section className="v2-production-panel v2-production-create-panel">
        {!allowed(capabilities, 'production.create') ? <ErrorState message="Your role cannot create production orders." /> : null}
        {error ? <ErrorState message={error} /> : null}
        {loadingVersions ? <LoadingState label="Loading approved Formula Versions..." /> : null}
        {!loadingVersions && allowed(capabilities, 'production.create') ? (
          <form className="v2-production-form-grid" onSubmit={createOrder}>
            <label className="v2-production-span-two">Approved Formula Version
              <select required value={form.formulaVersionId} onChange={(event) => setForm((current) => ({ ...current, formulaVersionId: event.target.value }))}>
                <option value="">Choose a Formula Version</option>
                {versions.map((version) => <option key={version.id} value={version.id}>{version.name}{version.versionNumber ? ` v${version.versionNumber}` : ''}</option>)}
              </select>
            </label>
            <label>Order number
              <input value={form.orderNumber} maxLength={120} onChange={(event) => setForm((current) => ({ ...current, orderNumber: event.target.value }))} placeholder="Optional order number" />
            </label>
            <label>Target bulk (g)
              <input type="number" required min="0.001" step="0.001" value={form.targetBulkGrams} onChange={(event) => setForm((current) => ({ ...current, targetBulkGrams: event.target.value }))} />
            </label>
            <label>Target finished output (g)
              <input type="number" min="0.001" step="0.001" value={form.targetOutputGrams} onChange={(event) => setForm((current) => ({ ...current, targetOutputGrams: event.target.value }))} />
            </label>
            <label>Planned start
              <input type="datetime-local" value={form.plannedStartAt} onChange={(event) => setForm((current) => ({ ...current, plannedStartAt: event.target.value }))} />
            </label>
            <label>Due date
              <input type="datetime-local" value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} />
            </label>
            <label className="v2-production-span-two">Order note
              <textarea maxLength={2000} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </label>
            <div className="v2-production-form-actions v2-production-span-two">
              <button className="v2-secondary-button" type="button" onClick={onCancel}>Cancel</button>
              <button className="v2-primary-button" type="submit" disabled={submitting || !versions.length}>
                {submitting ? <LoaderCircle className="v2-production-inline-loader" aria-hidden="true" size={15} /> : <Plus aria-hidden="true" size={16} />}
                Create order
              </button>
            </div>
          </form>
        ) : null}
        {!loadingVersions && !error && !versions.length ? <EmptyState title="No approved Formula Version is available">An approved formula is needed before a production order can start.</EmptyState> : null}
      </section>
    </section>
  )
}

function ProductionOrderDetailView({ apiBase, capabilities, orderId, onBack }: OrderDetailProps) {
  const [detail, setDetail] = useState<ProductionOrderDetail | null>(null)
  const [tab, setTab] = useState<DetailTab>('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const pendingOperationKeys = useRef(createProductionOperationKeyCache())

  const refresh = useCallback(async (): Promise<boolean> => {
    setLoading(true)
    try {
      const payload = await productionRequest<unknown>(apiBase, encodeURIComponent(orderId))
      const nested = getObject<ProductionOrderDetail>(payload, 'detail')
      const next = nested || payload as ProductionOrderDetail
      if (!next?.order?.id) throw new Error('Production order details are unavailable.')
      setDetail(next)
      setError(null)
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Production order details could not be loaded.')
      return false
    } finally {
      setLoading(false)
    }
  }, [apiBase, orderId])

  useEffect(() => { void refresh() }, [refresh])

  const runAction = useCallback(async (actionId: string, path: string, body?: unknown): Promise<boolean> => {
    setBusyAction(actionId)
    setError(null)
    setNotice(null)
    const fingerprint = `${path}\n${JSON.stringify(body ?? null)}`
    const key = pendingOperationKeys.current.acquire(actionId, fingerprint)
    try {
      await productionRequest(apiBase, path, {
        method: 'POST',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        headers: { 'Idempotency-Key': key },
      })
      if (!await refresh()) return false
      pendingOperationKeys.current.settle(actionId, fingerprint)
      setNotice('Production record updated.')
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This production action could not be completed.')
      return false
    } finally {
      setBusyAction(null)
    }
  }, [apiBase, refresh])

  if (loading && !detail) return <section className="v2-production-workspace"><LoadingState /></section>
  if (!detail) {
    return <section className="v2-production-workspace"><button className="v2-text-button v2-production-back" type="button" onClick={onBack}><ArrowLeft aria-hidden="true" size={16} /> Production orders</button>{error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}</section>
  }

  const order = detail.order
  const requirements = detail.requirements || []
  const allocations = detail.allocations || []
  const weighing = detail.weighing || []
  const weighingLines = detail.weighingLines || []
  const materialUsages = detail.materialUsages || []
  const stages = detail.stages || []
  const qcResults = detail.qcResults || []
  const deviations = detail.deviations || []
  const capas = detail.capas || []
  const reworks = detail.reworks || []
  const yieldRecord = detail.yields?.[0] || detail.yield || null
  const finishedLot = detail.finishedLots?.[0] || detail.finishedLot || null
  const finishedLots = detail.finishedLots || (detail.finishedLot ? [detail.finishedLot] : [])
  const qcSpecifications = detail.qcSpecification ? [detail.qcSpecification] : detail.qcSpecifications || detail.qcSpecs || []

  return (
    <section className="v2-production-workspace" data-testid="v2-production-order-detail">
      <header className="v2-production-heading v2-production-detail-heading">
        <div>
          <button className="v2-text-button v2-production-back" type="button" onClick={onBack}><ArrowLeft aria-hidden="true" size={16} /> Production orders</button>
          <span className="v2-eyebrow">Production order</span>
          <h2>{order.orderNumber || order.code || order.name || compactId(order.id)}</h2>
          <p>{order.formulaVersionName || 'Formula version'} / Target {formatQuantity(orderQuantity(order))}</p>
        </div>
        <div className="v2-production-heading-actions">
          <span className={statusClass(order.status)}>{humanize(order.status)}</span>
          <button className="v2-production-icon-button" type="button" onClick={() => void refresh()} title="Refresh order" aria-label="Refresh order"><RefreshCw aria-hidden="true" size={17} /></button>
        </div>
      </header>

      {error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}
      {notice ? <SuccessState message={notice} /> : null}

      <div className="v2-production-summary-grid v2-production-order-summary">
        <SummaryMetric label="Requirements" value={requirements.length} icon={<ClipboardList aria-hidden="true" size={18} />} />
        <SummaryMetric label="Weighing records" value={weighing.length} icon={<Scale aria-hidden="true" size={18} />} />
        <SummaryMetric label="QC results" value={qcResults.length} icon={<FlaskConical aria-hidden="true" size={18} />} />
      </div>

      <nav className="v2-production-tabs" aria-label="Production order sections">
        {tabs.map((item) => <button className={tab === item.id ? 'is-active' : ''} key={item.id} type="button" onClick={() => setTab(item.id)}>{item.label}</button>)}
      </nav>

      {tab === 'overview' ? <OverviewTab order={order} stages={stages} deviations={deviations} capas={capas} finishedLot={finishedLot} capabilities={capabilities} busyAction={busyAction} onAction={runAction} /> : null}
      {tab === 'materials' ? <MaterialsTab apiBase={apiBase} capabilities={capabilities} order={order} requirements={requirements} allocations={allocations} busyAction={busyAction} onAction={runAction} /> : null}
      {tab === 'weighing' ? <WeighingTab capabilities={capabilities} order={order} requirements={requirements} allocations={allocations} sessions={weighing} lines={weighingLines} materialUsages={materialUsages} busyAction={busyAction} onAction={runAction} /> : null}
      {tab === 'process' ? <ProcessTab capabilities={capabilities} order={order} stages={stages} deviations={deviations} reworks={reworks} finishedLots={finishedLots} materialUsages={materialUsages} busyAction={busyAction} onAction={runAction} /> : null}
      {tab === 'quality' ? <QualityTab apiBase={apiBase} capabilities={capabilities} order={order} embeddedSpecs={qcSpecifications} results={qcResults} busyAction={busyAction} onAction={runAction} onRefresh={refresh} /> : null}
      {tab === 'deviations' ? <DeviationsTab capabilities={capabilities} order={order} deviations={deviations} capas={capas} busyAction={busyAction} onAction={runAction} /> : null}
      {tab === 'release' ? <ReleaseTab capabilities={capabilities} order={order} yieldRecord={yieldRecord} documents={detail.documents || []} busyAction={busyAction} onAction={runAction} /> : null}
      {tab === 'genealogy' ? <GenealogyTab apiBase={apiBase} capabilities={capabilities} order={order} finishedLot={finishedLot} documents={detail.documents || []} busyAction={busyAction} onAction={runAction} /> : null}
    </section>
  )
}

function OverviewTab({ order, stages, deviations, capas, finishedLot, capabilities, busyAction, onAction }: {
  order: ProductionOrder
  stages: StageRecord[]
  deviations: DeviationRecord[]
  capas: CapaRecord[]
  finishedLot: ProductionOrderDetail['finishedLot']
  capabilities: CapabilityMap
  busyAction: string | null
  onAction: ProductionAction
}) {
  const [cancelRationale, setCancelRationale] = useState('')
  const [closeRationale, setCloseRationale] = useState('')
  const currentStage = stages.find((stage) => stage.status === 'IN_PROGRESS') || stages.find((stage) => stage.status === 'FAILED') || stages.find((stage) => stage.status === 'NOT_STARTED')
  const canCancel = allowed(capabilities, 'production.cancel') && ['DRAFT', 'PLANNED', 'READY_FOR_WEIGHING'].includes(order.status)
  const canClose = allowed(capabilities, 'production.close') && ['RELEASED', 'REJECTED'].includes(order.status)
  return (
    <div className="v2-production-tab-grid">
      <section className="v2-production-panel">
        <div className="v2-production-panel-heading"><div><h3>Order readiness</h3><p>Use the next section in the sequence to continue this order.</p></div><Workflow aria-hidden="true" size={21} /></div>
        <dl className="v2-production-detail-list">
          <div><dt>Formula Version</dt><dd>{order.formulaVersionName || compactId(order.formulaVersionId)}</dd></div>
          <div><dt>Target quantity</dt><dd>{formatQuantity(orderQuantity(order))}</dd></div>
          <div><dt>Planned work date</dt><dd>{formatDate(order.plannedStartAt || order.scheduledFor)}</dd></div>
          <div><dt>Current process</dt><dd>{currentStage ? humanize(currentStage.stage) : humanize(order.status)}</dd></div>
        </dl>
      </section>
      <section className="v2-production-panel">
        <div className="v2-production-panel-heading"><div><h3>Process sequence</h3><p>Each stage keeps its own operating record.</p></div></div>
        <div className="v2-production-stage-strip">
          {stageKinds.map((kind) => {
            const record = stages.find((stage) => stage.stage === kind)
            return <div key={kind} className={`v2-production-stage-step is-${(record?.status || 'NOT_STARTED').toLowerCase()}`}><span>{humanize(kind)}</span><strong>{humanize(record?.status || 'NOT_STARTED')}</strong></div>
          })}
        </div>
      </section>
      <section className="v2-production-panel v2-production-span-all">
        <div className="v2-production-panel-heading"><div><h3>Open quality work</h3><p>Track deviations and corrective actions alongside the batch.</p></div><ShieldCheck aria-hidden="true" size={21} /></div>
        <div className="v2-production-mini-grid">
          <div><span>Deviations</span><strong>{deviations.filter((item) => item.status !== 'CLOSED').length} open</strong></div>
          <div><span>CAPA actions</span><strong>{capas.filter((item) => item.status !== 'COMPLETED').length} open</strong></div>
          <div><span>Finished lot</span><strong>{finishedLot ? (finishedLot.lotNumber || compactId(finishedLot.id)) : 'Pending'}</strong></div>
        </div>
      </section>
      {canCancel || canClose ? <section className="v2-production-panel v2-production-span-all">
        <div className="v2-production-panel-heading"><div><h3>Order lifecycle</h3><p>Record a controlled rationale for the final order decision.</p></div><ShieldAlert aria-hidden="true" size={21} /></div>
        {canCancel ? <form className="v2-production-lifecycle-action" data-testid="v2-production-cancel-order" onSubmit={(event) => { event.preventDefault(); if (!cancelRationale.trim()) return; void onAction('cancel-order', `${encodeURIComponent(order.id)}/cancel`, { rationale: cancelRationale.trim() }).then((saved) => { if (saved) setCancelRationale('') }) }}><label>Cancellation rationale<input required maxLength={2000} value={cancelRationale} onChange={(event) => setCancelRationale(event.target.value)} /></label><button className="v2-secondary-button" type="submit" disabled={busyAction === 'cancel-order' || !cancelRationale.trim()}>{busyAction === 'cancel-order' ? <LoaderCircle className="v2-production-inline-loader" aria-hidden="true" size={15} /> : null}Cancel order</button></form> : null}
        {canClose ? <form className="v2-production-lifecycle-action" data-testid="v2-production-close-order" onSubmit={(event) => { event.preventDefault(); if (!closeRationale.trim()) return; void onAction('close-order', `${encodeURIComponent(order.id)}/close`, { rationale: closeRationale.trim() }).then((saved) => { if (saved) setCloseRationale('') }) }}><label>Closure rationale<input required maxLength={2000} value={closeRationale} onChange={(event) => setCloseRationale(event.target.value)} /></label><button className="v2-secondary-button" type="submit" disabled={busyAction === 'close-order' || !closeRationale.trim()}>{busyAction === 'close-order' ? <LoaderCircle className="v2-production-inline-loader" aria-hidden="true" size={15} /> : null}Close order</button></form> : null}
      </section> : null}
    </div>
  )
}

function MaterialsTab({ apiBase, capabilities, order, requirements, allocations, busyAction, onAction }: {
  apiBase: string
  capabilities: CapabilityMap
  order: ProductionOrder
  requirements: ProductionRequirement[]
  allocations: ProductionAllocation[]
  busyAction: string | null
  onAction: ProductionAction
}) {
  const [plan, setPlan] = useState({ plannedStartAt: (order.plannedStartAt || order.scheduledFor) ? (order.plannedStartAt || order.scheduledFor || '').slice(0, 16) : '', dueAt: order.dueAt ? order.dueAt.slice(0, 16) : '', equipmentRef: '', notes: order.notes || '' })
  const [suggestions, setSuggestions] = useState<AllocationSuggestion[]>([])
  const [suggestionError, setSuggestionError] = useState<string | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const canPlan = allowed(capabilities, 'production.plan')
  const canAllocate = allowed(capabilities, 'production.allocate')
  const allocationCandidates = useMemo(() => suggestions.flatMap((suggestion, requirementIndex) => (suggestion.lots || []).map((lot, lotIndex) => ({
    key: `${suggestion.requirementId || suggestion.materialId || requirementIndex}-${lot.lotId}-${lotIndex}`,
    requirementId: suggestion.requirementId,
    materialId: suggestion.materialId,
    materialName: suggestion.materialName,
    requiredGrams: suggestion.requiredGrams,
    lot,
  }))), [suggestions])

  const suggest = async () => {
    setSuggesting(true)
    setSuggestionError(null)
    try {
      const payload = await productionRequest<unknown>(apiBase, `${encodeURIComponent(order.id)}/allocations/suggestions`)
      const next = getList<AllocationSuggestion>(payload, 'suggestions')
      setSuggestions(next)
      setDrafts(Object.fromEntries(next.flatMap((item, requirementIndex) => (item.lots || []).map((lot, lotIndex) => [`${item.requirementId || item.materialId || requirementIndex}-${lot.lotId}-${lotIndex}`, String(lot.allocatedGrams ?? '')]))))
    } catch (reason) {
      setSuggestionError(reason instanceof Error ? reason.message : 'FEFO suggestions could not be prepared.')
    } finally {
      setSuggesting(false)
    }
  }

  const commitAllocations = async () => {
    const selected = allocationCandidates.map((item) => {
      const key = item.key
      return {
        requirementId: item.requirementId,
        lotId: item.lot.lotId,
        allocatedGrams: Number(drafts[key]),
      }
    }).filter((item) => item.requirementId && item.lotId && Number.isFinite(item.allocatedGrams) && item.allocatedGrams > 0)
    if (!selected.length) {
      setSuggestionError('Enter an allocation quantity for at least one suggested lot.')
      return
    }
    const committed = await onAction('commit-allocations', `${encodeURIComponent(order.id)}/allocations`, { allocations: selected })
    if (committed) setSuggestions([])
  }

  return (
    <div className="v2-production-tab-grid">
      <section className="v2-production-panel v2-production-span-all">
        <div className="v2-production-panel-heading"><div><h3>Requirements</h3><p>Compare formula demand with allocated and weighed quantities.</p></div><ClipboardList aria-hidden="true" size={21} /></div>
        {requirements.length ? <div className="v2-production-data-list v2-production-requirements-list">{requirements.map((requirement) => <div key={requirement.id || requirement.materialId} className="v2-production-data-row"><strong>{requirement.materialName || requirement.materialCode || compactId(requirement.materialId)}</strong><span>Required {formatQuantity(requirementRequired(requirement))}</span><span>Allocated {formatQuantity(requirementAllocated(requirement))}</span><span>Weighed {formatQuantity(requirementWeighed(requirement))}</span></div>)}</div> : <EmptyState title="Requirements will appear after planning">Plan this order to prepare its material requirements.</EmptyState>}
      </section>

      <section className="v2-production-panel">
        <div className="v2-production-panel-heading"><div><h3>Plan the order</h3><p>Set the working date before materials are assigned.</p></div><CalendarDays aria-hidden="true" size={21} /></div>
        {canPlan ? <form className="v2-production-form-grid" onSubmit={(event) => { event.preventDefault(); void onAction('plan-order', `${encodeURIComponent(order.id)}/plan`, { ...(plan.plannedStartAt ? { plannedStartAt: new Date(plan.plannedStartAt).toISOString() } : {}), ...(plan.dueAt ? { dueAt: new Date(plan.dueAt).toISOString() } : {}), ...(plan.equipmentRef.trim() ? { equipmentRef: plan.equipmentRef.trim() } : {}), ...(plan.notes.trim() ? { notes: plan.notes.trim() } : {}) }) }}>
          <label>Planned start<input type="datetime-local" value={plan.plannedStartAt} onChange={(event) => setPlan((current) => ({ ...current, plannedStartAt: event.target.value }))} /></label>
          <label>Due date<input type="datetime-local" value={plan.dueAt} onChange={(event) => setPlan((current) => ({ ...current, dueAt: event.target.value }))} /></label>
          <label className="v2-production-span-two">Equipment reference<input maxLength={240} value={plan.equipmentRef} onChange={(event) => setPlan((current) => ({ ...current, equipmentRef: event.target.value }))} /></label>
          <label className="v2-production-span-two">Planning note<input value={plan.notes} maxLength={2000} onChange={(event) => setPlan((current) => ({ ...current, notes: event.target.value }))} /></label>
          <div className="v2-production-form-actions v2-production-span-two"><button className="v2-primary-button" type="submit" disabled={busyAction === 'plan-order' || !plan.plannedStartAt}>{busyAction === 'plan-order' ? <LoaderCircle className="v2-production-inline-loader" aria-hidden="true" size={15} /> : <CalendarDays aria-hidden="true" size={16} />} Save plan</button></div>
        </form> : <PermissionHint label="Your role cannot plan this order." />}
      </section>

      <section className="v2-production-panel">
        <div className="v2-production-panel-heading"><div><h3>FEFO allocation</h3><p>Choose lots by expiry and available quantity.</p></div><SlidersHorizontal aria-hidden="true" size={21} /></div>
        {canAllocate ? <div className="v2-production-stack">
          <ActionButton actionId="suggest-fefo" busyAction={suggesting ? 'suggest-fefo' : busyAction} onClick={() => void suggest()} disabled={!requirements.length}>Suggest FEFO lots</ActionButton>
          {suggestionError ? <ErrorState message={suggestionError} /> : null}
          {suggestions.length && !allocationCandidates.length ? <EmptyState title="No eligible FEFO allocation">{suggestions.find((suggestion) => suggestion.reason)?.reason || 'No eligible lot can cover the remaining requirement.'}</EmptyState> : null}
          {allocationCandidates.length ? <div className="v2-production-allocation-drafts">{allocationCandidates.map((candidate) => <div className="v2-production-allocation-draft" key={candidate.key}><div><strong>{candidate.materialName || compactId(candidate.materialId)}</strong><span>{compactId(candidate.lot.lotId)} / expires {formatDate(candidate.lot.expiresAt)}</span><small>{formatQuantity(candidate.lot.availableGrams)} available / {formatQuantity(candidate.requiredGrams)} required</small></div><label>Allocate (g)<input type="number" min="0.001" step="0.001" value={drafts[candidate.key] || ''} onChange={(event) => setDrafts((current) => ({ ...current, [candidate.key]: event.target.value }))} /></label></div>)}</div> : null}
          {allocationCandidates.length ? <ActionButton actionId="commit-allocations" busyAction={busyAction} onClick={() => void commitAllocations()} kind="primary">Confirm allocations</ActionButton> : null}
        </div> : <PermissionHint label="Your role cannot allocate production materials." />}
        {allocations.length ? <div className="v2-production-data-list v2-production-allocation-list">{allocations.map((allocation, index) => <div key={allocation.id || `${allocationLotId(allocation) || 'lot'}-${index}`} className="v2-production-data-row"><strong>{allocation.materialName || compactId(allocation.materialId)}</strong><span>{allocation.supplierLot || allocation.lotCode || compactId(allocationLotId(allocation))}</span><span>{formatQuantity(allocationQuantity(allocation))}</span><span>{humanize(allocation.status || 'ALLOCATED')}</span></div>)}</div> : null}
      </section>
    </div>
  )
}

function WeighingTab({ capabilities, order, requirements, allocations, sessions, lines, materialUsages, busyAction, onAction }: {
  capabilities: CapabilityMap
  order: ProductionOrder
  requirements: ProductionRequirement[]
  allocations: ProductionAllocation[]
  sessions: WeighingSession[]
  lines: WeighingLine[]
  materialUsages: ProductionMaterialUsage[]
  busyAction: string | null
  onAction: ProductionAction
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [requested, setRequested] = useState<Record<string, string>>({})
  const [tolerances, setTolerances] = useState<Record<string, string>>({})
  const [actuals, setActuals] = useState<Record<string, string>>({})
  const [correctionReasons, setCorrectionReasons] = useState<Record<string, string>>({})
  const canWeigh = allowed(capabilities, 'production.weigh')
  const canCorrectUsage = allowed(capabilities, 'production.process') && allowed(capabilities, 'inventory.reverse')
  const activeSession = sessions.find((session) => session.status === 'IN_PROGRESS')
  const activeLines = activeSession ? lines.filter((line) => line.productionWeighingSessionId === activeSession.id) : []
  const reversibleUsages = materialUsages.filter((usage) => usage.status === 'COMMITTED')

  const startSession = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const lines = allocations.map((allocation, index) => {
      const allocationId = allocation.id || `${allocationLotId(allocation) || 'allocation'}-${index}`
      return {
        allocationId,
        requestedGrams: Number(requested[allocationId] || allocationQuantity(allocation)),
        ...(Number(tolerances[allocationId]) >= 0 ? { toleranceGrams: Number(tolerances[allocationId]) } : {}),
      }
    }).filter((line) => selected[line.allocationId] && Number.isFinite(line.requestedGrams) && line.requestedGrams > 0)
    if (!lines.length) return
    void onAction('start-weighing', `${encodeURIComponent(order.id)}/weighing`, { lines })
  }

  const confirmSession = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeSession) return
    const confirmedLines = activeLines.map((line) => ({
      lineId: line.lineId,
      lotId: line.lotId,
      actualGrams: Number(actuals[line.lineId] || line.actualGrams || ''),
    })).filter((line) => line.lotId && Number.isFinite(line.actualGrams) && line.actualGrams > 0)
    if (!confirmedLines.length || !activeSession.labWeighingSessionId) return
    void onAction('confirm-weighing', `${encodeURIComponent(order.id)}/weighing/${encodeURIComponent(activeSession.labWeighingSessionId)}/confirm`, { lines: confirmedLines })
  }

  return (
    <div className="v2-production-tab-grid">
      <section className="v2-production-panel">
        <div className="v2-production-panel-heading"><div><h3>Start weighing</h3><p>Select the allocated lots and planned weighing quantities.</p></div><Scale aria-hidden="true" size={21} /></div>
        {canWeigh ? <form className="v2-production-stack" onSubmit={startSession}>
          {allocations.length ? <div className="v2-production-allocation-drafts">{allocations.map((allocation, index) => {
            const allocationId = allocation.id || `${allocationLotId(allocation) || 'allocation'}-${index}`
            return <div className="v2-production-weighing-draft" key={allocationId}>
              <label className="v2-production-check"><input type="checkbox" checked={selected[allocationId] === true} onChange={(event) => setSelected((current) => ({ ...current, [allocationId]: event.target.checked }))} /><span><strong>{allocation.materialName || compactId(allocation.materialId)}</strong><small>{allocation.supplierLot || allocation.lotCode || compactId(allocationLotId(allocation))} / allocated {formatQuantity(allocationQuantity(allocation))}</small></span></label>
              <label>Requested (g)<input type="number" min="0.001" step="0.001" value={requested[allocationId] ?? String(allocationQuantity(allocation) ?? '')} onChange={(event) => setRequested((current) => ({ ...current, [allocationId]: event.target.value }))} disabled={!selected[allocationId]} /></label>
              <label>Tolerance (g)<input type="number" min="0" step="0.001" value={tolerances[allocationId] || ''} onChange={(event) => setTolerances((current) => ({ ...current, [allocationId]: event.target.value }))} disabled={!selected[allocationId]} /></label>
            </div>
          })}</div> : <EmptyState title="No allocated lot is ready to weigh">Allocate materials before starting a weighing session.</EmptyState>}
          {allocations.length ? <button className="v2-primary-button" type="submit" disabled={busyAction === 'start-weighing'}>{busyAction === 'start-weighing' ? <LoaderCircle className="v2-production-inline-loader" aria-hidden="true" size={15} /> : <Scale aria-hidden="true" size={16} />} Start weighing</button> : null}
        </form> : <PermissionHint label="Your role cannot record production weighing." />}
      </section>
      <section className="v2-production-panel">
        <div className="v2-production-panel-heading"><div><h3>Confirm actual weights</h3><p>Confirm each actual mass in the active session.</p></div><ClipboardCheck aria-hidden="true" size={21} /></div>
        {canWeigh && activeSession && activeLines.length ? <form className="v2-production-stack" onSubmit={confirmSession}>{activeLines.map((line) => <div className="v2-production-weighing-draft" key={line.lineId}><div><strong>{line.materialName}</strong><small>{compactId(line.lotId)} / requested {formatQuantity(line.requestedGrams)}</small></div><label>Actual (g)<input type="number" required min="0.001" step="0.001" value={actuals[line.lineId] ?? String(line.actualGrams ?? '')} onChange={(event) => setActuals((current) => ({ ...current, [line.lineId]: event.target.value }))} /></label></div>)}<button className="v2-primary-button" type="submit" disabled={busyAction === 'confirm-weighing' || !activeLines.length}>{busyAction === 'confirm-weighing' ? <LoaderCircle className="v2-production-inline-loader" aria-hidden="true" size={15} /> : <ClipboardCheck aria-hidden="true" size={16} />} Confirm weighing</button></form> : null}
        {!activeSession || !activeLines.length ? <EmptyState title={activeSession ? 'Weighing lines are not ready' : 'No active weighing session'}>{activeSession ? 'Refresh this order after the weighing plan is ready.' : 'Start a weighing session to confirm actual masses.'}</EmptyState> : null}
      </section>
      <section className="v2-production-panel v2-production-span-all">
        <div className="v2-production-panel-heading"><div><h3>Weighing record</h3><p>Confirmed actuals remain visible against the material requirement.</p></div></div>
        {sessions.length ? <div className="v2-production-data-list">{sessions.map((session) => <div className="v2-production-data-row" key={session.id}><strong>{compactId(session.id)}</strong><span className={statusClass(session.status)}>{humanize(session.status || 'PLANNED')}</span><span>Planned {formatQuantity(session.plannedTotalGrams)}</span><span>Actual {formatQuantity(session.actualTotalGrams)}</span></div>)}</div> : <EmptyState title="No weighing recorded">Weighing sessions will appear here after they start.</EmptyState>}
        {requirements.length ? <div className="v2-production-weighing-basis">{requirements.length} material requirement{requirements.length === 1 ? '' : 's'} on this order.</div> : null}
      </section>
      {canCorrectUsage && reversibleUsages.length ? <section className="v2-production-panel v2-production-span-all">
        <div className="v2-production-panel-heading"><div><h3>Material usage correction</h3><p>Reverse a committed raw-material use before downstream processing is complete.</p></div><ShieldAlert aria-hidden="true" size={21} /></div>
        <div className="v2-production-data-list">{reversibleUsages.map((usage) => <div className="v2-production-usage-correction" key={usage.id}><div className="v2-production-data-row"><strong>{usage.materialName}</strong><span>{compactId(usage.lotId)}</span><span>{formatQuantity(usage.actualQuantityGrams)}</span><span className={statusClass(usage.status)}>{humanize(usage.status)}</span></div><div className="v2-production-resolution-row"><label>Correction rationale<input required maxLength={2000} value={correctionReasons[usage.id] || ''} onChange={(event) => setCorrectionReasons((current) => ({ ...current, [usage.id]: event.target.value }))} /></label><ActionButton actionId={`reverse-usage-${usage.id}`} busyAction={busyAction} onClick={() => void onAction(`reverse-usage-${usage.id}`, `${encodeURIComponent(order.id)}/usages/${encodeURIComponent(usage.id)}/reverse`, { reason: correctionReasons[usage.id]?.trim() || '' }).then((saved) => { if (saved) setCorrectionReasons((current) => ({ ...current, [usage.id]: '' })) })} disabled={!correctionReasons[usage.id]?.trim()}>Reverse usage</ActionButton></div></div>)}</div>
      </section> : null}
    </div>
  )
}

function ProcessTab({ capabilities, order, stages, deviations, reworks, finishedLots, materialUsages, busyAction, onAction }: {
  capabilities: CapabilityMap
  order: ProductionOrder
  stages: StageRecord[]
  deviations: DeviationRecord[]
  reworks: ProductionReworkRecord[]
  finishedLots: FinishedGoodLot[]
  materialUsages: ProductionMaterialUsage[]
  busyAction: string | null
  onAction: ProductionAction
}) {
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [holdReason, setHoldReason] = useState('')
  const [resumeTarget, setResumeTarget] = useState<'READY_FOR_WEIGHING' | 'WEIGHING' | 'COMPOUNDING' | 'CONDITIONING' | 'FILTRATION' | 'FILLING' | 'QC' | 'REWORK'>('COMPOUNDING')
  const [rework, setRework] = useState({ deviationId: '', sourceKind: 'IN_PROCESS' as 'IN_PROCESS' | 'FINISHED_GOOD_LOT', sourceFinishedGoodLotId: '', quantityGrams: '', reason: '' })
  const canProcess = allowed(capabilities, 'production.process')
  const canManageDeviation = allowed(capabilities, 'production.deviation.manage')
  const activeRework = reworks.find((item) => ['PLANNED', 'IN_PROGRESS'].includes(item.status))
  const reworkDeviations = deviations.filter((item) => item.status === 'CLOSED' && item.disposition === 'REWORK' && item.reworkTargetStage && !reworks.some((record) => record.deviationId === item.id))
  const selectedReworkDeviation = reworkDeviations.find((item) => item.id === rework.deviationId)
  const approvedTargetStage = stageKinds.includes(selectedReworkDeviation?.reworkTargetStage as ProductionStageKind)
    ? selectedReworkDeviation?.reworkTargetStage as ProductionStageKind
    : null
  const activeReworkStages = activeRework ? stages.filter((item) => item.reworkId === activeRework.id) : []
  const reworkStagesComplete = activeReworkStages.length > 0 && activeReworkStages.every((item) => item.status === 'COMPLETED')
  const canStartRework = canProcess && canManageDeviation && !activeRework && ['QC', 'HOLD', 'REWORK'].includes(order.status)
  const canCompleteRework = canProcess && activeRework?.status === 'IN_PROGRESS' && order.status === 'QC' && reworkStagesComplete
  const canResumeFreshWeighing = materialUsages.some((usage) => usage.status === 'REVERSED')
  return (
    <section className="v2-production-panel" aria-labelledby="production-process-heading">
      <div className="v2-production-panel-heading"><div><h3 id="production-process-heading">Process execution</h3><p>Record each controlled stage in order.</p></div><Workflow aria-hidden="true" size={21} /></div>
      {!canProcess ? <PermissionHint label="Your role cannot record production stages." /> : null}
      <div className="v2-production-stage-list">
        {stageKinds.map((stage) => {
          const stageRecords = stages.filter((item) => item.stage === stage)
          const reworkStageRecords = activeRework ? stageRecords.filter((item) => item.reworkId === activeRework.id) : []
          const record = reworkStageRecords[reworkStageRecords.length - 1] || stageRecords[0]
          const status = (record?.status || 'NOT_STARTED') as ProductionStageStatus
          const stageReady = order.status === stage || (order.status === 'REWORK' && activeRework?.targetStage === stage)
          const choices: Array<{ endpoint: 'start' | 'complete'; label: string; primary?: boolean }> = stageReady && status === 'NOT_STARTED'
            ? [{ endpoint: 'start', label: 'Start stage', primary: true }]
            : stageReady && status === 'IN_PROGRESS'
              ? [{ endpoint: 'complete', label: 'Complete stage', primary: true }]
              : []
          return <article className="v2-production-stage-card" key={stage}>
            <div className="v2-production-stage-card-header"><div><span className="v2-production-stage-number">{stageKinds.indexOf(stage) + 1}</span><h4>{humanize(stage)}</h4></div><span className={statusClass(status)}>{humanize(status)}</span></div>
            <p>{record?.notes || record?.note || (status === 'NOT_STARTED' ? 'Awaiting the preceding production step.' : 'No stage note recorded.')}</p>
            <div className="v2-production-stage-meta"><span>Started {formatDate(record?.startedAt)}</span><span>Completed {formatDate(record?.completedAt)}</span></div>
            {canProcess && choices.length ? <div className="v2-production-stage-actions"><label>Stage note<input maxLength={2000} value={notes[stage] || ''} onChange={(event) => setNotes((current) => ({ ...current, [stage]: event.target.value }))} /></label><div>{choices.map((choice) => { const actionId = `stage-${stage}-${choice.endpoint}`; return <ActionButton key={choice.endpoint} actionId={actionId} busyAction={busyAction} onClick={() => void onAction(actionId, `${encodeURIComponent(order.id)}/stages/${encodeURIComponent(stage)}/${choice.endpoint}`, { ...(notes[stage]?.trim() ? { notes: notes[stage].trim() } : {}) })} kind={choice.primary ? 'primary' : 'secondary'}>{choice.label}</ActionButton> })}</div></div> : null}
          </article>
        })}
      </div>
      {reworks.length ? <div className="v2-production-process-rework-list">{reworks.map((record) => <div className="v2-production-rework-record" key={record.id}><div className="v2-production-data-row"><strong>{humanize(record.targetStage)} rework</strong><span>{formatQuantity(record.quantityGrams)}</span><span>{humanize(record.sourceKind)}</span><span className={statusClass(record.status)}>{humanize(record.status)}</span></div><p>{record.reason || 'No rework reason recorded.'}</p>{canCompleteRework && activeRework?.id === record.id ? <div className="v2-production-resolution-row"><ActionButton actionId={`complete-rework-${record.id}`} busyAction={busyAction} onClick={() => void onAction(`complete-rework-${record.id}`, `${encodeURIComponent(order.id)}/rework/${encodeURIComponent(record.id)}/complete`, {})} kind="primary">Complete rework</ActionButton></div> : null}{activeRework?.id === record.id && record.status === 'IN_PROGRESS' && !reworkStagesComplete ? <p className="v2-production-rework-pending">Complete every authorized rework stage before returning this batch to QC.</p> : null}</div>)}</div> : null}
      {canStartRework ? <form className="v2-production-process-rework" data-testid="v2-production-rework" onSubmit={(event) => { event.preventDefault(); const quantityGrams = Number(rework.quantityGrams); if (!rework.deviationId || !approvedTargetStage || !Number.isFinite(quantityGrams) || quantityGrams <= 0 || !rework.reason.trim() || (rework.sourceKind === 'FINISHED_GOOD_LOT' && !rework.sourceFinishedGoodLotId)) return; void onAction('start-rework', `${encodeURIComponent(order.id)}/rework`, { deviationId: rework.deviationId, sourceKind: rework.sourceKind, ...(rework.sourceKind === 'FINISHED_GOOD_LOT' ? { sourceFinishedGoodLotId: rework.sourceFinishedGoodLotId } : {}), quantityGrams, targetStage: approvedTargetStage, reason: rework.reason.trim() }).then((saved) => { if (saved) setRework({ deviationId: '', sourceKind: 'IN_PROCESS', sourceFinishedGoodLotId: '', quantityGrams: '', reason: '' }) }) }}>
        <div className="v2-production-panel-heading"><div><h4>Controlled rework</h4><p>Start only from an approved rework disposition.</p></div><RefreshCw aria-hidden="true" size={19} /></div>
        {reworkDeviations.length ? <div className="v2-production-form-grid"><label>Approved deviation<select required value={rework.deviationId} onChange={(event) => setRework((current) => ({ ...current, deviationId: event.target.value }))}><option value="">Choose a rework deviation</option>{reworkDeviations.map((item) => <option key={item.id} value={item.id}>{item.description || item.category || compactId(item.id)} / {humanize(item.reworkTargetStage)}</option>)}</select></label><label>Authorized target<strong className="v2-production-readonly-value">{approvedTargetStage ? humanize(approvedTargetStage) : 'Choose a deviation'}</strong></label><label>Source<select value={rework.sourceKind} onChange={(event) => setRework((current) => ({ ...current, sourceKind: event.target.value as 'IN_PROCESS' | 'FINISHED_GOOD_LOT', sourceFinishedGoodLotId: '' }))}><option value="IN_PROCESS">In-process material</option><option value="FINISHED_GOOD_LOT">Finished-good lot</option></select></label>{rework.sourceKind === 'FINISHED_GOOD_LOT' ? <label>Finished-good lot<select required value={rework.sourceFinishedGoodLotId} onChange={(event) => setRework((current) => ({ ...current, sourceFinishedGoodLotId: event.target.value }))}><option value="">Choose a finished-good lot</option>{finishedLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.lotNumber || compactId(lot.id)} / {humanize(lot.status)}</option>)}</select></label> : null}<label>Quantity (g)<input required type="number" min="0.001" step="0.001" value={rework.quantityGrams} onChange={(event) => setRework((current) => ({ ...current, quantityGrams: event.target.value }))} /></label><label className="v2-production-span-two">Rework reason<textarea required maxLength={2000} value={rework.reason} onChange={(event) => setRework((current) => ({ ...current, reason: event.target.value }))} /></label><div className="v2-production-form-actions v2-production-span-two"><button className="v2-primary-button" type="submit" disabled={busyAction === 'start-rework' || !rework.deviationId || !approvedTargetStage || !rework.reason.trim() || !rework.quantityGrams || (rework.sourceKind === 'FINISHED_GOOD_LOT' && !rework.sourceFinishedGoodLotId)}>{busyAction === 'start-rework' ? <LoaderCircle className="v2-production-inline-loader" aria-hidden="true" size={15} /> : <RefreshCw aria-hidden="true" size={16} />} Start rework</button></div></div> : <EmptyState title="No approved rework deviation">Resolve a deviation with a rework disposition before starting rework.</EmptyState>}
      </form> : null}
      {canManageDeviation ? <div className="v2-production-process-hold">
        {order.status === 'HOLD' ? <div className="v2-production-form-grid"><label>Resume at<select value={resumeTarget} onChange={(event) => setResumeTarget(event.target.value as typeof resumeTarget)}>{canResumeFreshWeighing ? <option value="READY_FOR_WEIGHING">Fresh weighing after correction</option> : null}<option value="WEIGHING">Weighing</option><option value="COMPOUNDING">Compounding</option><option value="CONDITIONING">Conditioning</option><option value="FILTRATION">Filtration</option><option value="FILLING">Filling</option><option value="QC">QC</option><option value="REWORK">Rework</option></select></label><div className="v2-production-form-actions"><ActionButton actionId="resume-order" busyAction={busyAction} onClick={() => void onAction('resume-order', `${encodeURIComponent(order.id)}/resume`, { targetStatus: resumeTarget })} kind="primary">Resume order</ActionButton></div></div> : <form className="v2-production-stack" onSubmit={(event) => { event.preventDefault(); if (!holdReason.trim()) return; void onAction('hold-order', `${encodeURIComponent(order.id)}/hold`, { decision: 'HOLD', rationale: holdReason.trim() }) }}><label>Hold rationale<input required maxLength={2000} value={holdReason} onChange={(event) => setHoldReason(event.target.value)} /></label><button className="v2-secondary-button" type="submit" disabled={busyAction === 'hold-order'}>{busyAction === 'hold-order' ? <LoaderCircle className="v2-production-inline-loader" aria-hidden="true" size={15} /> : <ShieldAlert aria-hidden="true" size={16} />} Place on hold</button></form>}
      </div> : null}
    </section>
  )
}

function QualityTab({ apiBase, capabilities, order, embeddedSpecs, results, busyAction, onAction, onRefresh }: {
  apiBase: string
  capabilities: CapabilityMap
  order: ProductionOrder
  embeddedSpecs: QcSpec[]
  results: QcResult[]
  busyAction: string | null
  onAction: ProductionAction
  onRefresh: () => Promise<boolean>
}) {
  const [form, setForm] = useState({ qcSpecificationId: order.qcSpecificationId || embeddedSpecs[0]?.id || '', checkKey: '', observedValue: '', notApplicableReason: '', notes: '' })
  const [specification, setSpecification] = useState({ name: '', versionLabel: '1.0', key: '', label: '', kind: 'NUMERIC', minimum: '', maximum: '', expectedText: '', allowedValues: '', unit: '' })
  const [rationales, setRationales] = useState<Record<string, string>>({})
  const [decisions, setDecisions] = useState<Record<string, 'APPROVE' | 'HOLD' | 'REJECT'>>({})
  const [specificationError, setSpecificationError] = useState<string | null>(null)
  const [specificationNotice, setSpecificationNotice] = useState<string | null>(null)
  const [creatingSpecification, setCreatingSpecification] = useState(false)
  const canRecordQc = allowed(capabilities, 'production.qc.record')
  const canApproveQc = allowed(capabilities, 'production.qc.approve')
  const selectedSpecification = embeddedSpecs.find((spec) => spec.id === form.qcSpecificationId) || embeddedSpecs[0]
  const selectedChecks = selectedSpecification?.checks || selectedSpecification?.specification?.checks || []
  const selectedCheck = selectedChecks.find((check) => check.key === form.checkKey)

  useEffect(() => {
    const attachedSpecificationId = order.qcSpecificationId || embeddedSpecs[0]?.id || ''
    if (!attachedSpecificationId) return
    setForm((current) => current.qcSpecificationId ? current : { ...current, qcSpecificationId: attachedSpecificationId })
  }, [embeddedSpecs, order.qcSpecificationId])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.qcSpecificationId || !form.checkKey.trim() || (!form.observedValue.trim() && !form.notApplicableReason.trim())) return
    const observedInput = form.observedValue.trim()
    let observedValue: string | number | boolean = observedInput
    if (selectedCheck?.kind === 'BOOLEAN') observedValue = observedInput === 'true'
    if (selectedCheck?.kind === 'NUMERIC') {
      const asNumber = Number(observedInput)
      if (!Number.isFinite(asNumber)) return
      observedValue = asNumber
    }
    void onAction('record-qc', `${encodeURIComponent(order.id)}/qc/results`, {
      qcSpecificationId: form.qcSpecificationId,
      checkKey: form.checkKey.trim(),
      ...(form.observedValue.trim() ? { observedValue } : {}),
      ...(form.notApplicableReason.trim() ? { notApplicableReason: form.notApplicableReason.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    }).then((saved) => { if (saved) setForm((current) => ({ ...current, checkKey: '', observedValue: '', notApplicableReason: '', notes: '' })) })
  }

  const createSpecification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!specification.name.trim() || !specification.versionLabel.trim() || !specification.key.trim() || !specification.label.trim()) return
    setCreatingSpecification(true)
    setSpecificationError(null)
    setSpecificationNotice(null)
    const minimum = Number(specification.minimum)
    const maximum = Number(specification.maximum)
    try {
      const payload = await productionRequest<unknown>(apiBase, `${encodeURIComponent(order.id)}/qc/specifications`, {
        method: 'POST',
        body: JSON.stringify({
          name: specification.name.trim(),
          versionLabel: specification.versionLabel.trim(),
          checks: [{
            key: specification.key.trim(),
            label: specification.label.trim(),
            kind: specification.kind,
            required: true,
            ...(specification.kind === 'NUMERIC' && Number.isFinite(minimum) ? { minimum } : {}),
            ...(specification.kind === 'NUMERIC' && Number.isFinite(maximum) ? { maximum } : {}),
            ...(specification.kind === 'NUMERIC' && specification.unit.trim() ? { unit: specification.unit.trim() } : {}),
            ...(specification.kind === 'TEXT' && specification.expectedText.trim() ? { expectedText: specification.expectedText.trim() } : {}),
            ...(specification.kind === 'ENUM' && specification.allowedValues.split(',').map((value) => value.trim()).filter(Boolean).length ? { allowedValues: specification.allowedValues.split(',').map((value) => value.trim()).filter(Boolean) } : {}),
          }],
        }),
      })
      const created = getObject<QcSpec>(payload, 'specification')
      const refreshed = await onRefresh()
      if (refreshed) {
        if (created?.id) setForm((current) => ({ ...current, qcSpecificationId: created.id }))
        setSpecification({ name: '', versionLabel: '1.0', key: '', label: '', kind: 'NUMERIC', minimum: '', maximum: '', expectedText: '', allowedValues: '', unit: '' })
        setSpecificationNotice('QC specification added.')
      }
    } catch (reason) {
      setSpecificationError(reason instanceof Error ? reason.message : 'QC specification could not be created.')
    } finally {
      setCreatingSpecification(false)
    }
  }

  return (
    <div className="v2-production-tab-grid">
      <section className="v2-production-panel">
        <div className="v2-production-panel-heading"><div><h3>QC specifications</h3><p>Review the checks required for this production order.</p></div><FlaskConical aria-hidden="true" size={21} /></div>
        {embeddedSpecs.length ? <div className="v2-production-data-list">{embeddedSpecs.map((spec) => <div className="v2-production-data-row" key={spec.id}><strong>{spec.name}</strong><span>{spec.stage ? humanize(spec.stage) : 'Final review'}</span><span>{spec.target || [spec.lowerLimit, spec.upperLimit].filter((value) => value !== null && value !== undefined).join(' - ') || 'Record value'}</span><span>{spec.required ? 'Required' : 'Optional'}</span></div>)}</div> : <EmptyState title="No QC specification is attached">Set the specification before controlled weighing begins.</EmptyState>}
        {canApproveQc ? <form className="v2-production-form-grid" onSubmit={createSpecification}>
          <label>Specification name<input required maxLength={200} value={specification.name} onChange={(event) => setSpecification((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>Version label<input required maxLength={120} value={specification.versionLabel} onChange={(event) => setSpecification((current) => ({ ...current, versionLabel: event.target.value }))} /></label>
          <label>Check key<input required pattern="[a-z][a-z0-9_]{1,63}" maxLength={64} value={specification.key} onChange={(event) => setSpecification((current) => ({ ...current, key: event.target.value }))} /></label>
          <label>Check label<input required maxLength={160} value={specification.label} onChange={(event) => setSpecification((current) => ({ ...current, label: event.target.value }))} /></label>
          <label>Check kind<select value={specification.kind} onChange={(event) => setSpecification((current) => ({ ...current, kind: event.target.value }))}><option value="NUMERIC">Numeric</option><option value="TEXT">Text</option><option value="BOOLEAN">Boolean</option><option value="ENUM">Enum</option></select></label>
          <label>Unit<input maxLength={40} value={specification.unit} onChange={(event) => setSpecification((current) => ({ ...current, unit: event.target.value }))} /></label>
          {specification.kind === 'NUMERIC' ? <><label>Minimum<input type="number" step="any" value={specification.minimum} onChange={(event) => setSpecification((current) => ({ ...current, minimum: event.target.value }))} /></label><label>Maximum<input type="number" step="any" value={specification.maximum} onChange={(event) => setSpecification((current) => ({ ...current, maximum: event.target.value }))} /></label></> : null}
          {specification.kind === 'TEXT' ? <label className="v2-production-span-two">Expected text<input maxLength={500} value={specification.expectedText} onChange={(event) => setSpecification((current) => ({ ...current, expectedText: event.target.value }))} /></label> : null}
          {specification.kind === 'ENUM' ? <label className="v2-production-span-two">Allowed values<input required maxLength={2000} value={specification.allowedValues} onChange={(event) => setSpecification((current) => ({ ...current, allowedValues: event.target.value }))} placeholder="Comma-separated values" /></label> : null}
          <div className="v2-production-form-actions v2-production-span-two"><button className="v2-secondary-button" type="submit" disabled={creatingSpecification}>{creatingSpecification ? <LoaderCircle className="v2-production-inline-loader" aria-hidden="true" size={15} /> : <Plus aria-hidden="true" size={16} />} Add QC specification</button></div>
        </form> : null}
        {specificationError ? <ErrorState message={specificationError} /> : null}
        {specificationNotice ? <SuccessState message={specificationNotice} /> : null}
      </section>
      <section className="v2-production-panel">
        <div className="v2-production-panel-heading"><div><h3>Record QC result</h3><p>Capture the observed value against its specification.</p></div><FlaskConical aria-hidden="true" size={21} /></div>
        {canRecordQc ? <form className="v2-production-form-grid" onSubmit={submit}>
          <label className="v2-production-span-two">QC specification<select required value={form.qcSpecificationId} onChange={(event) => setForm((current) => ({ ...current, qcSpecificationId: event.target.value }))}><option value="">Choose a specification</option>{order.qcSpecificationId ? <option value={order.qcSpecificationId}>Attached specification</option> : null}{embeddedSpecs.map((spec) => <option value={spec.id} key={spec.id}>{spec.name}{spec.unit ? ` (${spec.unit})` : ''}</option>)}</select></label>
          {selectedChecks.length ? <label>QC check<select required value={form.checkKey} onChange={(event) => setForm((current) => ({ ...current, checkKey: event.target.value, observedValue: '' }))}><option value="">Choose a QC check</option>{selectedChecks.map((check) => <option key={check.key} value={check.key}>{check.label}{check.unit ? ` (${check.unit})` : ''}</option>)}</select></label> : <label>Check key<input required pattern="[a-z][a-z0-9_]{1,63}" maxLength={64} value={form.checkKey} onChange={(event) => setForm((current) => ({ ...current, checkKey: event.target.value, observedValue: '' }))} /></label>}
          <label>Observed value
            {selectedCheck?.kind === 'BOOLEAN' ? <select value={form.observedValue} onChange={(event) => setForm((current) => ({ ...current, observedValue: event.target.value }))}><option value="">Choose a value</option><option value="true">Pass</option><option value="false">Fail</option></select> : null}
            {selectedCheck?.kind === 'ENUM' && selectedCheck.allowedValues?.length ? <select value={form.observedValue} onChange={(event) => setForm((current) => ({ ...current, observedValue: event.target.value }))}><option value="">Choose a value</option>{selectedCheck.allowedValues.map((value) => <option key={value} value={value}>{value}</option>)}</select> : null}
            {selectedCheck?.kind !== 'BOOLEAN' && !(selectedCheck?.kind === 'ENUM' && selectedCheck.allowedValues?.length) ? <input type={selectedCheck?.kind === 'NUMERIC' ? 'number' : 'text'} step={selectedCheck?.kind === 'NUMERIC' ? 'any' : undefined} maxLength={1000} value={form.observedValue} onChange={(event) => setForm((current) => ({ ...current, observedValue: event.target.value }))} /> : null}
          </label>
          <label className="v2-production-span-two">Not applicable reason<input maxLength={1000} value={form.notApplicableReason} onChange={(event) => setForm((current) => ({ ...current, notApplicableReason: event.target.value }))} /></label>
          <label className="v2-production-span-two">QC note<input maxLength={2000} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
          <div className="v2-production-form-actions v2-production-span-two"><button className="v2-primary-button" type="submit" disabled={busyAction === 'record-qc' || !form.qcSpecificationId}>{busyAction === 'record-qc' ? <LoaderCircle className="v2-production-inline-loader" aria-hidden="true" size={15} /> : <ClipboardCheck aria-hidden="true" size={16} />} Record result</button></div>
        </form> : <PermissionHint label="Your role cannot record QC results." />}
      </section>
      <section className="v2-production-panel v2-production-span-all">
        <div className="v2-production-panel-heading"><div><h3>QC results</h3><p>Review the recorded evidence before release.</p></div></div>
        {results.length ? <div className="v2-production-data-list">{results.map((result) => { const resultStatus = result.resultStatus || result.status || 'PENDING'; const decision = decisions[result.id] || 'APPROVE'; return <div className="v2-production-qc-result" key={result.id}><div className="v2-production-data-row"><strong>{result.checkKey || result.specName || compactId(result.qcSpecificationId || result.specId)}</strong><span>{typeof result.observedValue === 'string' ? result.observedValue : result.observedValue === undefined ? result.value ?? 'Not set' : JSON.stringify(result.observedValue)}</span><span className={statusClass(resultStatus)}>{humanize(resultStatus)}</span><span>{formatDate(result.recordedAt)}</span></div>{canApproveQc && resultStatus === 'PENDING' ? <div className="v2-production-approval-row"><label>Decision<select value={decision} onChange={(event) => setDecisions((current) => ({ ...current, [result.id]: event.target.value as 'APPROVE' | 'HOLD' | 'REJECT' }))}><option value="APPROVE">Approve</option><option value="HOLD">Hold</option><option value="REJECT">Reject</option></select></label><label>Approval rationale<input required maxLength={2000} value={rationales[result.id] || ''} onChange={(event) => setRationales((current) => ({ ...current, [result.id]: event.target.value }))} /></label><ActionButton actionId={`approve-qc-${result.id}`} busyAction={busyAction} onClick={() => void onAction(`approve-qc-${result.id}`, `${encodeURIComponent(order.id)}/qc/results/${encodeURIComponent(result.id)}/approve`, { decision, rationale: rationales[result.id] || '' })} disabled={!rationales[result.id]?.trim()}>Apply decision</ActionButton></div> : null}</div> })}</div> : <EmptyState title="No QC result has been recorded">Results will appear here as each specification is assessed.</EmptyState>}
      </section>
    </div>
  )
}

function DeviationsTab({ capabilities, order, deviations, capas, busyAction, onAction }: {
  capabilities: CapabilityMap
  order: ProductionOrder
  deviations: DeviationRecord[]
  capas: CapaRecord[]
  busyAction: string | null
  onAction: ProductionAction
}) {
  const [deviation, setDeviation] = useState({ category: 'PROCESS', description: '', severity: 'MEDIUM', detectedAt: '', immediateAction: '' })
  const [capa, setCapa] = useState({ deviationId: '', actionType: 'CORRECTIVE', action: '', dueAt: '', verificationPlan: '' })
  const [resolution, setResolution] = useState<Record<string, { disposition: 'CONTINUE' | 'HOLD' | 'REWORK' | 'REJECT'; rationale: string; reworkTargetStage: ProductionStageKind }>>({})
  const [completionNotes, setCompletionNotes] = useState<Record<string, string>>({})
  const [verification, setVerification] = useState<Record<string, { decision: 'APPROVE' | 'HOLD' | 'REJECT'; rationale: string }>>({})
  const canManage = allowed(capabilities, 'production.deviation.manage')
  const canQc = allowed(capabilities, 'production.qc.approve')
  return (
    <div className="v2-production-tab-grid">
      <section className="v2-production-panel">
        <div className="v2-production-panel-heading"><div><h3>Deviation</h3><p>Capture an event that needs quality follow-up.</p></div><ShieldAlert aria-hidden="true" size={21} /></div>
        {canManage ? <form className="v2-production-form-grid" onSubmit={(event) => { event.preventDefault(); if (!deviation.description.trim()) return; void onAction('create-deviation', `${encodeURIComponent(order.id)}/deviations`, { category: deviation.category, description: deviation.description.trim(), severity: deviation.severity, ...(deviation.detectedAt ? { detectedAt: new Date(deviation.detectedAt).toISOString() } : {}), ...(deviation.immediateAction.trim() ? { immediateAction: deviation.immediateAction.trim() } : {}) }).then((saved) => { if (saved) setDeviation({ category: 'PROCESS', description: '', severity: 'MEDIUM', detectedAt: '', immediateAction: '' }) }) }}>
          <label>Category<select value={deviation.category} onChange={(event) => setDeviation((current) => ({ ...current, category: event.target.value }))}><option value="MATERIAL">Material</option><option value="WEIGHING">Weighing</option><option value="PROCESS">Process</option><option value="QC">QC</option><option value="DOCUMENTATION">Documentation</option><option value="EQUIPMENT">Equipment</option><option value="OTHER">Other</option></select></label>
          <label>Severity<select value={deviation.severity} onChange={(event) => setDeviation((current) => ({ ...current, severity: event.target.value }))}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label>
          <label>Detected at<input type="datetime-local" value={deviation.detectedAt} onChange={(event) => setDeviation((current) => ({ ...current, detectedAt: event.target.value }))} /></label>
          <label>Immediate action<input maxLength={2000} value={deviation.immediateAction} onChange={(event) => setDeviation((current) => ({ ...current, immediateAction: event.target.value }))} /></label>
          <label className="v2-production-span-two">Description<textarea required maxLength={2000} value={deviation.description} onChange={(event) => setDeviation((current) => ({ ...current, description: event.target.value }))} /></label>
          <div className="v2-production-form-actions v2-production-span-two"><button className="v2-primary-button" type="submit" disabled={busyAction === 'create-deviation'}>{busyAction === 'create-deviation' ? <LoaderCircle className="v2-production-inline-loader" aria-hidden="true" size={15} /> : <ShieldAlert aria-hidden="true" size={16} />} Record deviation</button></div>
        </form> : <PermissionHint label="Your role cannot manage deviations or CAPA." />}
        {deviations.length ? <div className="v2-production-data-list">{deviations.map((item) => { const draft = resolution[item.id] || { disposition: 'CONTINUE' as const, rationale: '', reworkTargetStage: 'COMPOUNDING' as const }; return <div className="v2-production-deviation-record" key={item.id}><div className="v2-production-data-row"><strong>{item.category || item.description || compactId(item.id)}</strong><span>{humanize(item.severity || 'NOT SET')}</span><span className={statusClass(item.status)}>{humanize(item.status || 'OPEN')}</span><span>{formatDate(item.detectedAt || item.openedAt)}</span></div>{canManage && item.status !== 'CLOSED' && item.status !== 'VOIDED' ? <div className="v2-production-resolution-row"><label>Disposition<select value={draft.disposition} onChange={(event) => setResolution((current) => ({ ...current, [item.id]: { ...draft, disposition: event.target.value as typeof draft.disposition } }))}><option value="CONTINUE">Continue</option><option value="HOLD">Hold</option><option value="REWORK">Rework</option><option value="REJECT">Reject</option></select></label>{draft.disposition === 'REWORK' ? <label>Rework target<select value={draft.reworkTargetStage} onChange={(event) => setResolution((current) => ({ ...current, [item.id]: { ...draft, reworkTargetStage: event.target.value as ProductionStageKind } }))}>{stageKinds.map((stage) => <option key={stage} value={stage}>{humanize(stage)}</option>)}</select></label> : null}<label>Resolution rationale<input required maxLength={2000} value={draft.rationale} onChange={(event) => setResolution((current) => ({ ...current, [item.id]: { ...draft, rationale: event.target.value } }))} /></label><ActionButton actionId={`resolve-deviation-${item.id}`} busyAction={busyAction} onClick={() => void onAction(`resolve-deviation-${item.id}`, `${encodeURIComponent(order.id)}/deviations/${encodeURIComponent(item.id)}/resolve`, { disposition: draft.disposition, rationale: draft.rationale, ...(draft.disposition === 'REWORK' ? { reworkTargetStage: draft.reworkTargetStage } : {}) })} disabled={!draft.rationale.trim()}>Resolve deviation</ActionButton></div> : null}</div> })}</div> : <EmptyState title="No deviation recorded">Quality events will appear here.</EmptyState>}
      </section>
      <section className="v2-production-panel">
        <div className="v2-production-panel-heading"><div><h3>Corrective action</h3><p>Assign a clear action and its due date.</p></div><ClipboardCheck aria-hidden="true" size={21} /></div>
        {canManage ? <form className="v2-production-form-grid" onSubmit={(event) => { event.preventDefault(); if (!capa.deviationId || !capa.action.trim()) return; void onAction('create-capa', `${encodeURIComponent(order.id)}/deviations/${encodeURIComponent(capa.deviationId)}/capa`, { actionType: capa.actionType, action: capa.action.trim(), ...(capa.dueAt ? { dueAt: new Date(capa.dueAt).toISOString() } : {}), ...(capa.verificationPlan.trim() ? { verificationPlan: capa.verificationPlan.trim() } : {}) }).then((saved) => { if (saved) setCapa({ deviationId: '', actionType: 'CORRECTIVE', action: '', dueAt: '', verificationPlan: '' }) }) }}>
          <label>Linked deviation<select required value={capa.deviationId} onChange={(event) => setCapa((current) => ({ ...current, deviationId: event.target.value }))}><option value="">Choose a deviation</option>{deviations.map((item) => <option key={item.id} value={item.id}>{item.category || item.description || compactId(item.id)}</option>)}</select></label>
          <label>Action type<select value={capa.actionType} onChange={(event) => setCapa((current) => ({ ...current, actionType: event.target.value }))}><option value="CORRECTIVE">Corrective</option><option value="PREVENTIVE">Preventive</option></select></label>
          <label>Due date<input type="datetime-local" value={capa.dueAt} onChange={(event) => setCapa((current) => ({ ...current, dueAt: event.target.value }))} /></label>
          <label className="v2-production-span-two">Action detail<textarea required maxLength={2000} value={capa.action} onChange={(event) => setCapa((current) => ({ ...current, action: event.target.value }))} /></label>
          <label className="v2-production-span-two">Verification plan<textarea maxLength={2000} value={capa.verificationPlan} onChange={(event) => setCapa((current) => ({ ...current, verificationPlan: event.target.value }))} /></label>
          <div className="v2-production-form-actions v2-production-span-two"><button className="v2-primary-button" type="submit" disabled={busyAction === 'create-capa'}>{busyAction === 'create-capa' ? <LoaderCircle className="v2-production-inline-loader" aria-hidden="true" size={15} /> : <ClipboardCheck aria-hidden="true" size={16} />} Create action</button></div>
        </form> : null}
        {capas.length ? <div className="v2-production-data-list">{capas.map((item) => { const completion = completionNotes[item.id] || ''; const verificationDraft = verification[item.id] || { decision: 'APPROVE' as const, rationale: '' }; return <div className="v2-production-capa-record" key={item.id}><div className="v2-production-data-row"><strong>{item.action || compactId(item.id)}</strong><span>{humanize(item.actionType || 'CORRECTIVE')}</span><span>{humanize(item.status || 'OPEN')}</span><span>Due {formatDate(item.dueAt)}</span></div>{canManage && item.deviationId && ['OPEN', 'IN_PROGRESS'].includes(item.status || '') ? <div className="v2-production-resolution-row"><label>Completion note<input required maxLength={2000} value={completion} onChange={(event) => setCompletionNotes((current) => ({ ...current, [item.id]: event.target.value }))} /></label><ActionButton actionId={`complete-capa-${item.id}`} busyAction={busyAction} onClick={() => void onAction(`complete-capa-${item.id}`, `${encodeURIComponent(order.id)}/deviations/${encodeURIComponent(item.deviationId!)}/capa/${encodeURIComponent(item.id)}/complete`, { completionNotes: completion })} disabled={!completion.trim()}>Complete action</ActionButton></div> : null}{canQc && item.deviationId && item.status === 'EFFECTIVENESS_PENDING' ? <div className="v2-production-resolution-row"><label>Verification decision<select value={verificationDraft.decision} onChange={(event) => setVerification((current) => ({ ...current, [item.id]: { ...verificationDraft, decision: event.target.value as typeof verificationDraft.decision } }))}><option value="APPROVE">Effective</option><option value="HOLD">Hold</option><option value="REJECT">Ineffective</option></select></label><label>Verification rationale<input required maxLength={2000} value={verificationDraft.rationale} onChange={(event) => setVerification((current) => ({ ...current, [item.id]: { ...verificationDraft, rationale: event.target.value } }))} /></label><ActionButton actionId={`verify-capa-${item.id}`} busyAction={busyAction} onClick={() => void onAction(`verify-capa-${item.id}`, `${encodeURIComponent(order.id)}/deviations/${encodeURIComponent(item.deviationId!)}/capa/${encodeURIComponent(item.id)}/verify`, verificationDraft)} disabled={!verificationDraft.rationale.trim()}>Verify action</ActionButton></div> : null}</div> })}</div> : <EmptyState title="No corrective action recorded">Actions linked to this production order will appear here.</EmptyState>}
      </section>
    </div>
  )
}

function ReleaseTab({ capabilities, order, yieldRecord, documents, busyAction, onAction }: {
  capabilities: CapabilityMap
  order: ProductionOrder
  yieldRecord: YieldRecord | null
  documents: ProductionDocument[]
  busyAction: string | null
  onAction: ProductionAction
}) {
  const [yieldForm, setYieldForm] = useState({ bulkOutputGrams: String(yieldActual(yieldRecord) ?? ''), filledOutputGrams: '', wasteGrams: String(yieldWaste(yieldRecord) ?? ''), reworkGrams: '', expectedLossGrams: '', rationale: '' })
  const [releaseForm, setReleaseForm] = useState({ finishedGoodLotNumber: '', location: '', manufacturedAt: '', expiresAt: '', rationale: '' })
  const [documentSnapshotIds, setDocumentSnapshotIds] = useState<string[]>([])
  const canProcess = allowed(capabilities, 'production.process')
  const canRelease = allowed(capabilities, 'production.release')
  const canApproveQc = allowed(capabilities, 'production.qc.approve')
  const canViewDocuments = allowed(capabilities, 'production.documents.view')
  const activeDocuments = documents.filter((document) => !document.status || document.status === 'ACTIVE')
  const releaseEligible = order.status === 'QC' && canRelease && canApproveQc && canViewDocuments
  const recordYield = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const bulkOutputGrams = Number(yieldForm.bulkOutputGrams)
    const wasteGrams = Number(yieldForm.wasteGrams || 0)
    if (!Number.isFinite(bulkOutputGrams) || bulkOutputGrams <= 0 || !Number.isFinite(wasteGrams) || wasteGrams < 0) return
    void onAction('record-yield', `${encodeURIComponent(order.id)}/yield`, { bulkOutputGrams, wasteGrams, ...(Number(yieldForm.filledOutputGrams) >= 0 && yieldForm.filledOutputGrams !== '' ? { filledOutputGrams: Number(yieldForm.filledOutputGrams) } : {}), ...(Number(yieldForm.reworkGrams) >= 0 && yieldForm.reworkGrams !== '' ? { reworkGrams: Number(yieldForm.reworkGrams) } : {}), ...(Number(yieldForm.expectedLossGrams) >= 0 && yieldForm.expectedLossGrams !== '' ? { expectedLossGrams: Number(yieldForm.expectedLossGrams) } : {}), ...(yieldForm.rationale.trim() ? { rationale: yieldForm.rationale.trim() } : {}) })
  }
  return (
    <div className="v2-production-tab-grid">
      <section className="v2-production-panel">
        <div className="v2-production-panel-heading"><div><h3>Yield reconciliation</h3><p>Record actual finished quantity and unavoidable waste.</p></div><PackageCheck aria-hidden="true" size={21} /></div>
        {canProcess ? <form className="v2-production-form-grid" onSubmit={recordYield}>
          <label>Expected quantity<strong className="v2-production-readonly-value">{formatQuantity(yieldExpected(yieldRecord) ?? orderQuantity(order))}</strong></label>
          <label>Bulk output (g)<input required type="number" min="0.001" step="0.001" value={yieldForm.bulkOutputGrams} onChange={(event) => setYieldForm((current) => ({ ...current, bulkOutputGrams: event.target.value }))} /></label>
          <label>Filled output (g)<input type="number" min="0.001" step="0.001" value={yieldForm.filledOutputGrams} onChange={(event) => setYieldForm((current) => ({ ...current, filledOutputGrams: event.target.value }))} /></label>
          <label>Waste quantity (g)<input type="number" min="0" step="0.001" value={yieldForm.wasteGrams} onChange={(event) => setYieldForm((current) => ({ ...current, wasteGrams: event.target.value }))} /></label>
          <label>Rework quantity (g)<input type="number" min="0" step="0.001" value={yieldForm.reworkGrams} onChange={(event) => setYieldForm((current) => ({ ...current, reworkGrams: event.target.value }))} /></label>
          <label>Expected loss (g)<input type="number" min="0" step="0.001" value={yieldForm.expectedLossGrams} onChange={(event) => setYieldForm((current) => ({ ...current, expectedLossGrams: event.target.value }))} /></label>
          <label>Reconciliation rationale<input maxLength={2000} value={yieldForm.rationale} onChange={(event) => setYieldForm((current) => ({ ...current, rationale: event.target.value }))} /></label>
          <div className="v2-production-form-actions v2-production-span-two"><button className="v2-primary-button" type="submit" disabled={busyAction === 'record-yield'}>{busyAction === 'record-yield' ? <LoaderCircle className="v2-production-inline-loader" aria-hidden="true" size={15} /> : <PackageCheck aria-hidden="true" size={16} />} Record yield</button></div>
        </form> : <PermissionHint label="Your role cannot record production yield." />}
      </section>
      <section className="v2-production-panel v2-production-release-panel">
        <div className="v2-production-panel-heading"><div><h3>Release finished good</h3><p>Release creates the finished lot used for downstream genealogy.</p></div><CheckCircle2 aria-hidden="true" size={21} /></div>
        <span className={statusClass(order.status)}>{humanize(order.status)}</span>
        {order.status === 'RELEASED' ? <div className="v2-production-release-complete"><CheckCircle2 aria-hidden="true" size={20} /><span>Released at {formatDate(order.releasedAt)}.</span></div> : null}
        {releaseEligible ? <fieldset className="v2-production-release-evidence"><legend>Release evidence</legend>{activeDocuments.length ? activeDocuments.map((document) => <label className="v2-production-document-choice" key={document.id}><input type="checkbox" checked={documentSnapshotIds.includes(document.id)} onChange={(event) => setDocumentSnapshotIds((current) => event.target.checked ? [...new Set([...current, document.id])] : current.filter((id) => id !== document.id))} /><span><strong>{document.title || document.documentKind || compactId(document.id)}</strong><small>{document.versionLabel || humanize(document.status || 'ACTIVE')}</small></span></label>) : <p>At least one active controlled document is needed before release.</p>}</fieldset> : null}
        {releaseEligible ? <form className="v2-production-form-grid" onSubmit={(event) => { event.preventDefault(); if (!releaseForm.finishedGoodLotNumber.trim() || !releaseForm.location.trim() || !releaseForm.rationale.trim() || !documentSnapshotIds.length) return; void onAction('release-order', `${encodeURIComponent(order.id)}/release`, { finishedGoodLotNumber: releaseForm.finishedGoodLotNumber.trim().toUpperCase(), location: releaseForm.location.trim(), rationale: releaseForm.rationale.trim(), documentSnapshotIds, ...(releaseForm.manufacturedAt ? { manufacturedAt: new Date(releaseForm.manufacturedAt).toISOString() } : {}), ...(releaseForm.expiresAt ? { expiresAt: new Date(releaseForm.expiresAt).toISOString() } : {}) }) }}><label>Finished-good lot number<input required maxLength={120} value={releaseForm.finishedGoodLotNumber} onChange={(event) => setReleaseForm((current) => ({ ...current, finishedGoodLotNumber: event.target.value.toUpperCase() }))} /></label><label>Location<input required maxLength={240} value={releaseForm.location} onChange={(event) => setReleaseForm((current) => ({ ...current, location: event.target.value }))} /></label><label>Manufactured at<input type="datetime-local" value={releaseForm.manufacturedAt} onChange={(event) => setReleaseForm((current) => ({ ...current, manufacturedAt: event.target.value }))} /></label><label>Expiry date<input type="datetime-local" value={releaseForm.expiresAt} onChange={(event) => setReleaseForm((current) => ({ ...current, expiresAt: event.target.value }))} /></label><label className="v2-production-span-two">Release rationale<input required maxLength={2000} value={releaseForm.rationale} onChange={(event) => setReleaseForm((current) => ({ ...current, rationale: event.target.value }))} /></label><div className="v2-production-form-actions v2-production-span-two"><button className="v2-primary-button" type="submit" disabled={busyAction === 'release-order' || !documentSnapshotIds.length}>{busyAction === 'release-order' ? <LoaderCircle className="v2-production-inline-loader" aria-hidden="true" size={15} /> : <CheckCircle2 aria-hidden="true" size={16} />} Release finished good</button></div></form> : null}
        {canRelease && canApproveQc && canViewDocuments && order.status !== 'RELEASED' && order.status !== 'QC' ? <p className="v2-production-release-guidance">Complete the controlled production sequence and required QC before release is available.</p> : null}
        {canRelease && !canViewDocuments && order.status !== 'RELEASED' ? <PermissionHint label="Your role cannot view the controlled documents required for release." /> : null}
        {canRelease && canViewDocuments && !canApproveQc && order.status !== 'RELEASED' ? <PermissionHint label="Your role cannot approve the required QC disposition for release." /> : null}
        {!canRelease ? <PermissionHint label="Your role cannot release finished goods." /> : null}
      </section>
    </div>
  )
}

function GenealogyTab({ apiBase, capabilities, order, finishedLot, documents, busyAction, onAction }: { apiBase: string; capabilities: CapabilityMap; order: ProductionOrder; finishedLot: ProductionOrderDetail['finishedLot']; documents: ProductionDocument[]; busyAction: string | null; onAction: ProductionAction }) {
  const [genealogy, setGenealogy] = useState<FinishedLotGenealogy | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkedDocuments, setLinkedDocuments] = useState<ProductionDocument[]>(documents)
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const [documentFormError, setDocumentFormError] = useState<string | null>(null)
  const [documentForm, setDocumentForm] = useState({ documentKind: 'PROCESS_RECORD', objectRef: '', contentHash: '', versionLabel: '' })
  const [qualityHold, setQualityHold] = useState({ rationale: '', evidenceDocumentSnapshotIds: [] as string[] })
  const canViewDocuments = allowed(capabilities, 'production.documents.view')
  const canViewFinishedGoods = allowed(capabilities, 'production.finishedGoods.view')
  const canViewGenealogy = canViewDocuments && canViewFinishedGoods
  const canManageDocuments = allowed(capabilities, 'production.documents.manage')
  const finishedLotId = finishedLot?.id || null
  const loadGenealogy = useCallback(async () => {
    if (!finishedLotId || !canViewGenealogy) return
    setLoading(true)
    setError(null)
    try {
      const payload = await productionRequest<unknown>(apiBase, `finished-goods/${encodeURIComponent(finishedLotId)}/genealogy`)
      const nested = getObject<FinishedLotGenealogy>(payload, 'genealogy')
      setGenealogy(nested || payload as FinishedLotGenealogy)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Finished-good genealogy could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [apiBase, canViewGenealogy, finishedLotId])
  const loadDocuments = useCallback(async () => {
    if (!canViewDocuments) return
    setDocumentsError(null)
    try {
      const payload = await productionRequest<unknown>(apiBase, `${encodeURIComponent(order.id)}/documents`)
      setLinkedDocuments(getList<ProductionDocument>(payload, 'documents'))
    } catch (reason) {
      setDocumentsError(reason instanceof Error ? reason.message : 'Order documents could not be loaded.')
    }
  }, [apiBase, canViewDocuments, order.id])
  useEffect(() => { if (finishedLotId && canViewGenealogy) void loadGenealogy() }, [canViewGenealogy, finishedLotId, loadGenealogy])
  useEffect(() => { void loadDocuments() }, [loadDocuments])
  useEffect(() => { setLinkedDocuments(documents) }, [documents])
  const visibleDocuments = linkedDocuments.length ? linkedDocuments : genealogy?.documents || []
  const activeControlledDocuments = linkedDocuments.filter((document) => document.status === 'ACTIVE')
  const rawMaterialUsages = genealogy?.rawMaterialUsages || []
  const genealogyLot = finishedLot || genealogy?.finishedGoodLot
  const canHoldFinishedGood = Boolean(finishedLotId)
    && order.status === 'RELEASED'
    && finishedLot?.status === 'RELEASED'
    && allowed(capabilities, 'production.deviation.manage')
    && allowed(capabilities, 'production.qc.approve')
    && allowed(capabilities, 'production.finishedGoods.view')
    && canViewDocuments
  const createDocumentSnapshot = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const objectRef = documentForm.objectRef.trim()
    const contentHash = documentForm.contentHash.trim()
    if (!objectRef) {
      setDocumentFormError('Enter a document reference.')
      return
    }
    if (!/^[a-fA-F0-9]{64}$/.test(contentHash)) {
      setDocumentFormError('Enter a valid 64-character SHA-256 content hash.')
      return
    }
    setDocumentFormError(null)
    void onAction('create-document-snapshot', `${encodeURIComponent(order.id)}/documents`, {
      documentKind: documentForm.documentKind,
      objectRef,
      contentHash,
      ...(documentForm.versionLabel.trim() ? { versionLabel: documentForm.versionLabel.trim() } : {}),
      metadata: {},
    }).then((saved) => {
      if (saved) setDocumentForm({ documentKind: 'PROCESS_RECORD', objectRef: '', contentHash: '', versionLabel: '' })
    })
  }
  return (
    <div className="v2-production-tab-grid">
      <section className="v2-production-panel">
        <div className="v2-production-panel-heading"><div><h3>Finished-good genealogy</h3><p>Follow released output back to the production inputs.</p></div><GitBranch aria-hidden="true" size={21} /></div>
        {!finishedLotId ? <EmptyState title="Finished lot pending">A released order will create the finished lot and its genealogy.</EmptyState> : null}
        {finishedLotId && !canViewGenealogy ? <PermissionHint label="Your role cannot view finished-good genealogy." /> : null}
        {finishedLotId ? <div className="v2-production-stack"><div className="v2-production-genealogy-root"><span>Finished lot</span><strong>{genealogyLot?.lotNumber || finishedLot?.lotNumber || compactId(finishedLotId)}</strong><small>{humanize(genealogyLot?.status || finishedLot?.status || 'RELEASED')}</small></div>{loading ? <LoadingState label="Loading finished-good genealogy..." /> : null}{error ? <ErrorState message={error} onRetry={() => void loadGenealogy()} /> : null}{!loading && !error && rawMaterialUsages.length ? <div className="v2-production-genealogy-list">{rawMaterialUsages.map((usage) => <div className="v2-production-genealogy-row" key={usage.usageId}><GitBranch aria-hidden="true" size={16} /><div><strong>{usage.materialName}</strong><span>{usage.supplierLot || compactId(usage.lotId)}</span></div><span>{formatQuantity(usage.actualQuantityGrams)}</span></div>)}</div> : null}{canHoldFinishedGood ? <form className="v2-production-finished-good-hold" data-testid="v2-production-finished-good-quality-hold" onSubmit={(event) => { event.preventDefault(); const rationale = qualityHold.rationale.trim(); if (!rationale || !qualityHold.evidenceDocumentSnapshotIds.length) return; void onAction('quality-hold-finished-good', `finished-goods/${encodeURIComponent(finishedLotId)}/quality-hold`, { rationale, evidenceDocumentSnapshotIds: qualityHold.evidenceDocumentSnapshotIds }).then((saved) => { if (saved) setQualityHold({ rationale: '', evidenceDocumentSnapshotIds: [] }) }) }}><div className="v2-production-panel-heading"><div><h4>Quality hold</h4><p>Move this released finished lot to hold with controlled evidence.</p></div><ShieldAlert aria-hidden="true" size={19} /></div><label>Hold rationale<textarea required maxLength={2000} value={qualityHold.rationale} onChange={(event) => setQualityHold((current) => ({ ...current, rationale: event.target.value }))} /></label><fieldset className="v2-production-release-evidence"><legend>Controlled evidence</legend>{activeControlledDocuments.length ? activeControlledDocuments.map((document) => <label className="v2-production-document-choice" key={document.id}><input type="checkbox" checked={qualityHold.evidenceDocumentSnapshotIds.includes(document.id)} onChange={(event) => setQualityHold((current) => ({ ...current, evidenceDocumentSnapshotIds: event.target.checked ? [...new Set([...current.evidenceDocumentSnapshotIds, document.id])] : current.evidenceDocumentSnapshotIds.filter((id) => id !== document.id) }))} /><span><strong>{document.title || document.documentKind || compactId(document.id)}</strong><small>{document.versionLabel || humanize(document.status || 'ACTIVE')}</small></span></label>) : <p>No active controlled document is available for this hold.</p>}</fieldset><div className="v2-production-form-actions"><button className="v2-secondary-button" type="submit" disabled={busyAction === 'quality-hold-finished-good' || !qualityHold.rationale.trim() || !qualityHold.evidenceDocumentSnapshotIds.length}>{busyAction === 'quality-hold-finished-good' ? <LoaderCircle className="v2-production-inline-loader" aria-hidden="true" size={15} /> : <ShieldAlert aria-hidden="true" size={16} />} Place finished lot on hold</button></div></form> : null}</div> : null}
      </section>
      <section className="v2-production-panel">
        <div className="v2-production-panel-heading"><div><h3>Order documents</h3><p>Review the records linked to this production order.</p></div><FileText aria-hidden="true" size={21} /></div>
        {canManageDocuments ? <form className="v2-production-form-grid v2-production-document-form" data-testid="v2-production-document-snapshot" onSubmit={createDocumentSnapshot}>
          <label>Document type<select value={documentForm.documentKind} onChange={(event) => setDocumentForm((current) => ({ ...current, documentKind: event.target.value }))}><option value="FORMULA">Formula</option><option value="MATERIAL_SDS">Material SDS</option><option value="MATERIAL_COA">Material COA</option><option value="PROCESS_RECORD">Process record</option><option value="QC_EVIDENCE">QC evidence</option><option value="RELEASE_EVIDENCE">Release evidence</option><option value="OTHER">Other</option></select></label>
          <label>Version label<input maxLength={160} value={documentForm.versionLabel} onChange={(event) => setDocumentForm((current) => ({ ...current, versionLabel: event.target.value }))} /></label>
          <label className="v2-production-span-two">Document reference<input required maxLength={2048} value={documentForm.objectRef} onChange={(event) => setDocumentForm((current) => ({ ...current, objectRef: event.target.value }))} /></label>
          <label className="v2-production-span-two">Content hash (SHA-256)<input required pattern="[a-fA-F0-9]{64}" maxLength={64} value={documentForm.contentHash} onChange={(event) => setDocumentForm((current) => ({ ...current, contentHash: event.target.value }))} /></label>
          <div className="v2-production-form-actions v2-production-span-two"><button className="v2-secondary-button" type="submit" disabled={busyAction === 'create-document-snapshot'}>{busyAction === 'create-document-snapshot' ? <LoaderCircle className="v2-production-inline-loader" aria-hidden="true" size={15} /> : <FileText aria-hidden="true" size={16} />} Capture document snapshot</button></div>
        </form> : null}
        {documentFormError ? <ErrorState message={documentFormError} /> : null}
        {canViewDocuments && documentsError ? <ErrorState message={documentsError} onRetry={() => void loadDocuments()} /> : null}
        {canViewDocuments && !documentsError ? (visibleDocuments.length ? <div className="v2-production-document-list">{visibleDocuments.map((document) => <div className="v2-production-document-row" key={document.id}><FileText aria-hidden="true" size={17} /><div><strong>{document.title || document.documentKind || document.documentType || compactId(document.id)}</strong><span>{document.objectRef || document.reference || humanize(document.documentKind || document.documentType || 'DOCUMENT')} / {formatDate(document.capturedAt || document.createdAt)}</span></div></div>)}</div> : <EmptyState title="No linked document">Production records will appear here as the order progresses.</EmptyState>) : null}
        {!canViewDocuments ? <PermissionHint label="Your role cannot view production documents." /> : null}
      </section>
    </div>
  )
}

function PermissionHint({ label }: { label: string }) {
  return <div className="v2-production-permission-hint"><ShieldAlert aria-hidden="true" size={17} /><span>{label}</span></div>
}
