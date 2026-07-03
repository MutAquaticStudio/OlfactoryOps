import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  Atom,
  BadgeDollarSign,
  BarChart3,
  Beaker,
  Bell,
  Boxes,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Command,
  Database,
  FileLock2,
  FlaskConical,
  Gauge,
  KeyRound,
  Layers3,
  LockKeyhole,
  Menu,
  PackageCheck,
  PackageSearch,
  Plus,
  Play,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  auditEvents,
  authSessions,
  brandingConfig,
  brands,
  customFields,
  documents,
  domains,
  evaporationCurve,
  featureFlags,
  formatCurrency,
  formatGrams,
  formatSequenceValue,
  formulaTotals,
  formulas,
  initialLots,
  initialMovements,
  materials,
  memberships,
  moleculeComponents,
  numberingSequences,
  permissionCatalog,
  phases,
  planLabUsage,
  readinessStats,
  records,
  resolveFormulaWithCatalog,
  rolePolicies,
  statusMeta,
  storageLocations,
  stockSummary,
  tenantSettings,
  tenantSecurityPolicy,
  organizations,
  type Allocation,
  type AuditEvent,
  type AuthSession,
  type BrandRecord,
  type BrandingConfig,
  type CustomFieldDefinition,
  type DocumentRecord,
  type DomainKey,
  type DomainModule,
  type DomainStatus,
  type FeatureFlagRecord,
  type Formula,
  type FormulaLine,
  type FormulaVersionRecord,
  type InventoryReorderSuggestion,
  type InventoryLot,
  type InventoryMovement,
  type LabWeighingSession,
  type LabUsagePurpose,
  type LabUsageRecord,
  type LotLabelPayload,
  type LotQualityStatus,
  type Material,
  type MembershipRecord,
  type MoleculeComponent,
  type NumberingSequenceRecord,
  type OrganizationRecord,
  type PermissionDefinition,
  type ResolvedLeaf,
  type RolePolicy,
  type SignedDocumentUrl,
  type StockTakeRecord,
  type StorageLocation,
  type TenantSettingsRecord,
  type TenantSecurityPolicy,
} from './data/northStar'

type UsageRecord = LabUsageRecord

type ModalKind =
  | 'commit'
  | 'auditExport'
  | 'ssoPolicy'
  | 'newFormula'
  | 'formulaLine'
  | 'receiveStock'
  | 'inventoryAdjustment'
  | 'inventoryTransfer'
  | null

type ApiEnvelope<T> = {
  data: T
}

type DocumentDownloadResponse = {
  document: DocumentRecord
  signedUrl: SignedDocumentUrl
  audit: AuditEvent
  invariant: string
}

type TenantConsoleResponse = {
  organization: OrganizationRecord
  brands: BrandRecord[]
  memberships: MembershipRecord[]
  sessions: AuthSession[]
  rolePolicies: RolePolicy[]
  permissionCatalog: PermissionDefinition[]
  permissionMatrix: RolePermissionMatrix[]
  securityPolicy: TenantSecurityPolicy
  audit: AuditEvent[]
  invariant: string
}

type CustomizationConsoleResponse = {
  settings: TenantSettingsRecord
  featureFlags: FeatureFlagRecord[]
  numberingSequences: NumberingSequenceRecord[]
  customFields: CustomFieldDefinition[]
  branding: BrandingConfig
  audit: AuditEvent[]
  invariant: string
}

type SettingsUpdateResponse = {
  settings: TenantSettingsRecord
  audit: AuditEvent
  invariant: string
}

type FeatureFlagUpdateResponse = {
  featureFlag: FeatureFlagRecord
  audit: AuditEvent
  invariant: string
}

type NumberingUpdateResponse = {
  sequence: NumberingSequenceRecord
  preview: string
  audit: AuditEvent
  invariant: string
}

type NumberingPreviewResponse = {
  key: string
  value: string
  nextValue: number
}

type CustomFieldCreateResponse = {
  customField: CustomFieldDefinition
  audit: AuditEvent
  invariant: string
}

type BrandingUpdateResponse = {
  branding: BrandingConfig
  audit: AuditEvent
  invariant: string
}

type MaterialDedupeResponse = {
  cas: string
  matches: Material[]
  duplicate: boolean
  invariant: string
}

type MaterialMutationResponse = {
  material: Material
  audit: AuditEvent
  invariant: string
}

type MaterialIngestionResponse = MaterialMutationResponse & {
  ingestion: {
    id: string
    materialId: string
    documentType: 'SDS' | 'CoA'
    source: string
    version: string
    status: 'REVIEW_REQUIRED' | 'APPROVED'
    extractedFields: string[]
  }
}

type MaterialMoleculesResponse = {
  materialId: string
  molecules: MoleculeComponent[]
  totalPercent: number
  invariant: string
}

type MaterialProvenanceResponse = {
  materialId: string
  provenance: Material['provenance']
  documents: DocumentRecord[]
  invariant: string
}

type PubChemFillResponse = MaterialMutationResponse & {
  molecules: MoleculeComponent[]
}

type FormulaCreateResponse = {
  formula: Formula
  invariant: string
}

type FormulaMutationResponse = {
  formula: Formula
  line?: FormulaLine
  leaves?: ResolvedLeaf[]
  totals?: ReturnType<typeof formulaTotals>
  audit?: AuditEvent
  invariant: string
}

type FormulaVersionListResponse = {
  formula: Formula
  versions: FormulaVersionRecord[]
  invariant: string
}

type FormulaVersionResponse = {
  formula: Formula
  version: FormulaVersionRecord
  audit: AuditEvent
  invariant: string
}

type FormulaExportResponse = {
  formula: Formula
  document: DocumentRecord
  audit: AuditEvent
  invariant: string
}

type InventoryReceiptResponse = {
  lot: InventoryLot
  movement: InventoryMovement
  summary?: ReturnType<typeof stockSummary>[number]
  invariant: string
}

type InventoryAdjustmentResponse = InventoryReceiptResponse

type InventoryTransferResponse = InventoryReceiptResponse

type InventoryConsoleResponse = {
  lots: InventoryLot[]
  movements: InventoryMovement[]
  locations: StorageLocation[]
  stockTakes: StockTakeRecord[]
  summary: ReturnType<typeof stockSummary>
  reorderSuggestions: InventoryReorderSuggestion[]
  invariant: string
}

type LotQualityResponse = {
  lot: InventoryLot
  audit: AuditEvent
  summary?: ReturnType<typeof stockSummary>[number]
  movementCount: number
  reason: string
  invariant: string
}

type StockTakeResponse = {
  lot: InventoryLot
  movement?: InventoryMovement
  stockTake: StockTakeRecord
  summary?: ReturnType<typeof stockSummary>[number]
  invariant: string
}

type LotLabelResponse = {
  label: LotLabelPayload
  invariant: string
}

type LotGenealogyResponse = {
  lot: InventoryLot
  material: Material
  agingDays: number
  movements: InventoryMovement[]
  documents: DocumentRecord[]
  downstreamRefs: {
    ref: string
    type: InventoryMovement['type']
    quantityGrams: number
    at: string
  }[]
  eligibility: 'ELIGIBLE' | 'BLOCKED'
  invariant: string
}

type InventoryReorderResponse = {
  suggestions: InventoryReorderSuggestion[]
  invariant: string
}

type StorageLocationCreateResponse = {
  location: StorageLocation
  invariant: string
}

type LabUsageHistoryResponse = {
  usages: UsageRecord[]
  invariant: string
}

type LabUsageCommitResponse = {
  usage: UsageRecord
  movements: InventoryMovement[]
  lots: InventoryLot[]
  usageHistory: UsageRecord[]
  message: string
  invariant: string
}

type LabUsageReverseResponse = {
  usageId: string
  usage: UsageRecord
  movements: InventoryMovement[]
  lots: InventoryLot[]
  usageHistory: UsageRecord[]
  reason: string
  invariant: string
}

type RolePermissionMatrix = {
  role: string
  scope: RolePolicy['scope']
  mfaRequired: boolean
  allowedPermissions: string[]
  deniedPermissions: string[]
  highRiskPermissions: string[]
}

type SecurityProbeResult = {
  status: 'allowed' | 'blocked' | 'review'
  title: string
  detail: string
}

const domainIcons: Record<DomainKey, LucideIcon> = {
  dashboard: Gauge,
  platform: Building2,
  identity: LockKeyhole,
  customization: Settings,
  materials: Atom,
  formulas: FlaskConical,
  inventory: Boxes,
  labUsage: Beaker,
  documents: FileLock2,
  production: PackageCheck,
  procurement: Truck,
  commerce: BadgeDollarSign,
  orders: ShoppingCart,
  costing: Database,
  analytics: BarChart3,
  saas: ShieldCheck,
}

const navGroups: { title: string; keys: DomainKey[] }[] = [
  { title: 'Command', keys: ['dashboard', 'platform', 'identity', 'customization'] },
  { title: 'R&D Spine', keys: ['materials', 'formulas', 'inventory', 'labUsage', 'documents'] },
  { title: 'Operations', keys: ['production', 'procurement', 'commerce', 'orders'] },
  { title: 'Enterprise', keys: ['costing', 'analytics', 'saas'] },
]

const workflowNodes: { key: DomainKey; label: string; detail: string }[] = [
  { key: 'materials', label: 'Material', detail: 'SDS, CoA, provenance' },
  { key: 'formulas', label: 'Formula', detail: 'Nested resolve engine' },
  { key: 'inventory', label: 'Inventory', detail: 'Lot and movement ledger' },
  { key: 'labUsage', label: 'Lab Usage', detail: 'Commit and reverse' },
  { key: 'production', label: 'Production', detail: 'Batch and QC' },
  { key: 'orders', label: 'Orders', detail: 'Reserve then fulfill' },
  { key: 'analytics', label: 'Analytics', detail: 'Read-only intelligence' },
]

const shellMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35 },
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:4000/api/v1'

async function requestApi<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${apiBaseUrl}${path}`, init)
  if (!response.ok) {
    let message = `API request failed with ${response.status}`
    try {
      const payload = (await response.json()) as { message?: unknown }
      if (typeof payload.message === 'string') {
        message = payload.message
      }
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(message)
  }
  const payload = (await response.json()) as ApiEnvelope<T>
  return payload.data
}

function mergeMovements(newMovements: InventoryMovement[], currentMovements: InventoryMovement[]) {
  const incomingIds = new Set(newMovements.map((movement) => movement.id))
  return [...newMovements, ...currentMovements.filter((movement) => !incomingIds.has(movement.id))]
}

function allocationKey(allocation: Pick<Allocation, 'materialId' | 'lotId'>) {
  return `${allocation.materialId}:${allocation.lotId}`
}

function buildWeighingSessionPreview({
  formula,
  plan,
  lots,
  batchGrams,
  actualWeights,
  tolerancePercent,
  operator,
}: {
  formula: Formula
  plan: ReturnType<typeof planLabUsage>
  lots: InventoryLot[]
  batchGrams: number
  actualWeights: Record<string, number>
  tolerancePercent: number
  operator: string
}): LabWeighingSession {
  const safeTolerance = Number.isFinite(tolerancePercent) && tolerancePercent >= 0 ? tolerancePercent : 0
  const remainingAvailableByLot = new Map(
    lots.map((lot) => [lot.id, Math.max(0, lot.quantityGrams - lot.reservedGrams)]),
  )
  const lines = plan.allocations.map((allocation) => {
    const actualGrams = Number(actualWeights[allocationKey(allocation)] ?? allocation.allocatedGrams)
    const available = remainingAvailableByLot.get(allocation.lotId) ?? 0
    remainingAvailableByLot.set(allocation.lotId, available - actualGrams)
    const deviationGrams = actualGrams - allocation.allocatedGrams
    const deviationPercent =
      allocation.allocatedGrams > 0 ? Math.abs(deviationGrams / allocation.allocatedGrams) * 100 : 0

    return {
      materialId: allocation.materialId,
      materialName: allocation.materialName,
      lotId: allocation.lotId,
      lotNumber: allocation.lotNumber,
      targetGrams: allocation.allocatedGrams,
      actualGrams,
      deviationGrams,
      deviationPercent,
      withinTolerance:
        Number.isFinite(actualGrams) &&
        actualGrams > 0 &&
        actualGrams <= available + 0.0001 &&
        deviationPercent <= safeTolerance + 0.0001,
    }
  })

  return {
    id: 'WGH-UI-PREVIEW',
    formulaId: formula.id,
    formulaCode: formula.code,
    targetBatchGrams: batchGrams,
    tolerancePercent: safeTolerance,
    operator: operator.trim() || 'Perfumer',
    status:
      plan.shortfalls.length === 0 && lines.length > 0 && lines.every((line) => line.withinTolerance)
        ? 'READY'
        : 'NEEDS_REVIEW',
    lines,
    createdAt: 'preview',
  }
}

function WeighingEvidence({ session, compact = false }: { session: LabWeighingSession; compact?: boolean }) {
  const actualTotal = session.lines.reduce((sum, line) => sum + line.actualGrams, 0)
  const maxDeviation = session.lines.reduce((max, line) => Math.max(max, line.deviationPercent), 0)

  return (
    <div className={`weighing-evidence ${compact ? 'is-compact' : ''}`}>
      <div className="weighing-evidence-head">
        <div>
          <strong>Actual weighing evidence</strong>
          <span>
            {session.operator} / {session.status}
          </span>
        </div>
        <DataTag label="Actual" value={formatGrams(actualTotal)} tone="blue" />
        <DataTag label="Deviation" value={`${maxDeviation.toFixed(2)}%`} tone={session.status === 'READY' ? 'green' : 'amber'} />
      </div>
      {session.lines.map((line) => (
        <div className="weighing-evidence-row" key={allocationKey(line)}>
          <div>
            <strong>{line.materialName}</strong>
            <span>{line.lotNumber}</span>
          </div>
          <span className="mono-value">{formatGrams(line.actualGrams)}</span>
          <span className={`deviation-pill ${line.withinTolerance ? 'is-ok' : 'is-alert'}`}>
            {line.deviationPercent.toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  )
}

function App() {
  const [activeKey, setActiveKey] = useState<DomainKey>('dashboard')
  const [commandOpen, setCommandOpen] = useState(false)
  const [modal, setModal] = useState<ModalKind>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [selectedMaterialId, setSelectedMaterialId] = useState('mat-iso')
  const [materialRecords, setMaterialRecords] = useState<Material[]>(() => structuredClone(materials))
  const [formulaRecords, setFormulaRecords] = useState<Formula[]>(() => structuredClone(formulas))
  const [activeFormulaId, setActiveFormulaId] = useState('frm-0421')
  const [lots, setLots] = useState<InventoryLot[]>(initialLots)
  const [movements, setMovements] = useState<InventoryMovement[]>(initialMovements)
  const [storageLocationRecords, setStorageLocationRecords] = useState<StorageLocation[]>(storageLocations)
  const [usageHistory, setUsageHistory] = useState<UsageRecord[]>([])
  const [batchGrams, setBatchGrams] = useState(12.5)
  const [actualWeights, setActualWeights] = useState<Record<string, number>>({})
  const [weighingTolerancePercent, setWeighingTolerancePercent] = useState(2)
  const [weighingOperator, setWeighingOperator] = useState('Thuan Le Minh')
  const [labUsagePurpose, setLabUsagePurpose] = useState<LabUsagePurpose>('trial')
  const [labUsageProjectCode, setLabUsageProjectCode] = useState('NXL-RD-0421')
  const [labUsageSampleCode, setLabUsageSampleCode] = useState('SMP-0421-A')
  const [labUsageStatusMessage, setLabUsageStatusMessage] = useState('Live API sync pending')
  const [labUsageBusy, setLabUsageBusy] = useState(false)
  const [newFormulaName, setNewFormulaName] = useState('Untitled Accord')
  const [newFormulaTargetGrams, setNewFormulaTargetGrams] = useState(100)
  const [newLineMaterialId, setNewLineMaterialId] = useState(materials[0]?.id ?? '')
  const [newLineGrams, setNewLineGrams] = useState(5)
  const [receiveMaterialId, setReceiveMaterialId] = useState(materials[0]?.id ?? '')
  const [receiveLotNumber, setReceiveLotNumber] = useState('L-NEW-001')
  const [receiveQuantityGrams, setReceiveQuantityGrams] = useState(25)
  const [receiveExpiryDate, setReceiveExpiryDate] = useState('2028-12-31')
  const [adjustmentLotId, setAdjustmentLotId] = useState(initialLots[0]?.id ?? '')
  const [adjustmentDirection, setAdjustmentDirection] = useState<'IN' | 'OUT'>('OUT')
  const [adjustmentQuantityGrams, setAdjustmentQuantityGrams] = useState(5)
  const [adjustmentReason, setAdjustmentReason] = useState('Cycle count correction')
  const [transferLotId, setTransferLotId] = useState(initialLots[0]?.id ?? '')
  const [transferLocation, setTransferLocation] = useState(storageLocations[1]?.name ?? 'Amber Shelf 2')

  const selectedDomain = domains.find((domain) => domain.key === activeKey)
  const selectedFormula = useMemo(() => {
    const fallbackFormula = formulas.find((formula) => formula.id === 'frm-0421')!
    return formulaRecords.find((formula) => formula.id === activeFormulaId) ?? fallbackFormula
  }, [activeFormulaId, formulaRecords])
  const resolvedLeaves = useMemo(
    () => resolveFormulaWithCatalog(selectedFormula.id, formulaRecords, materialRecords),
    [formulaRecords, materialRecords, selectedFormula.id],
  )
  const totals = useMemo(() => formulaTotals(resolvedLeaves), [resolvedLeaves])
  const curve = useMemo(() => evaporationCurve(resolvedLeaves), [resolvedLeaves])
  const labPlan = useMemo(
    () => planLabUsage(resolvedLeaves, lots, batchGrams, selectedFormula.targetGrams),
    [resolvedLeaves, lots, batchGrams, selectedFormula.targetGrams],
  )
  const weighingSessionPreview = useMemo(
    () =>
      buildWeighingSessionPreview({
        formula: selectedFormula,
        plan: labPlan,
        lots,
        batchGrams,
        actualWeights,
        tolerancePercent: weighingTolerancePercent,
        operator: weighingOperator,
      }),
    [actualWeights, batchGrams, labPlan, lots, selectedFormula, weighingOperator, weighingTolerancePercent],
  )
  const weighingReady = weighingSessionPreview.status === 'READY'
  const stock = useMemo(() => stockSummary(lots, materialRecords), [lots, materialRecords])
  const stats = useMemo(() => readinessStats(), [])
  const selectedAdjustmentLot = lots.find((lot) => lot.id === adjustmentLotId)
  const selectedTransferLot = lots.find((lot) => lot.id === transferLotId)
  const adjustmentWouldGoNegative =
    adjustmentDirection === 'OUT' &&
    selectedAdjustmentLot !== undefined &&
    selectedAdjustmentLot.quantityGrams - adjustmentQuantityGrams < selectedAdjustmentLot.reservedGrams

  useEffect(() => {
    const nextWeights: Record<string, number> = {}
    labPlan.allocations.forEach((allocation) => {
      nextWeights[allocationKey(allocation)] = Number(allocation.allocatedGrams.toFixed(3))
    })
    setActualWeights(nextWeights)
  }, [labPlan.allocations])

  useEffect(() => {
    const controller = new AbortController()

    async function loadLabUsageHistory() {
      try {
        const payload = await requestApi<LabUsageHistoryResponse>('/lab-usage', { signal: controller.signal })
        setUsageHistory(payload.usages)
        setLabUsageStatusMessage('Synced from live Lab Usage API')
      } catch {
        if (!controller.signal.aborted) {
          setLabUsageStatusMessage('Using local Lab Usage state until API is reachable')
        }
      }
    }

    void loadLabUsageHistory()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    function handleKeys(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
      }
      if (event.key === 'Escape') {
        setCommandOpen(false)
        setModal(null)
      }
    }

    window.addEventListener('keydown', handleKeys)
    return () => window.removeEventListener('keydown', handleKeys)
  }, [])

  function setTargetWeights() {
    const nextWeights: Record<string, number> = {}
    labPlan.allocations.forEach((allocation) => {
      nextWeights[allocationKey(allocation)] = Number(allocation.allocatedGrams.toFixed(3))
    })
    setActualWeights(nextWeights)
  }

  async function commitLabUsage() {
    if (!weighingReady || resolvedLeaves.length === 0) {
      return
    }

    setLabUsageBusy(true)
    try {
      const payload = await requestApi<LabUsageCommitResponse>('/lab-usage/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formulaId: selectedFormula.id,
          grams: batchGrams,
          actuals: weighingSessionPreview.lines.map((line) => ({
            materialId: line.materialId,
            lotId: line.lotId,
            actualGrams: line.actualGrams,
          })),
          tolerancePercent: weighingTolerancePercent,
          operator: weighingOperator,
          purpose: labUsagePurpose,
          projectCode: labUsageProjectCode,
          sampleCode: labUsageSampleCode,
        }),
      })

      setLots(payload.lots)
      setMovements((current) => mergeMovements(payload.movements, current))
      setUsageHistory(payload.usageHistory)
      setLabUsageStatusMessage(payload.message)
      setActiveKey('labUsage')
      setModal(null)
    } catch (error) {
      setLabUsageStatusMessage(error instanceof Error ? error.message : 'Lab Usage commit failed')
    } finally {
      setLabUsageBusy(false)
    }
  }

  async function reverseLatestUsage() {
    const latest = usageHistory.find((usage) => usage.status === 'COMMITTED')
    if (!latest) {
      return
    }

    setLabUsageBusy(true)
    try {
      const payload = await requestApi<LabUsageReverseResponse>(`/lab-usage/${encodeURIComponent(latest.id)}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: weighingOperator || 'Lab Manager',
          reason: 'Compensation reversal from Lab Usage workspace',
        }),
      })

      setLots(payload.lots)
      setMovements((current) => mergeMovements(payload.movements, current))
      setUsageHistory(payload.usageHistory)
      setLabUsageStatusMessage(`${payload.usageId} reversed by compensation`)
    } catch (error) {
      setLabUsageStatusMessage(error instanceof Error ? error.message : 'Lab Usage reverse failed')
    } finally {
      setLabUsageBusy(false)
    }
  }

  async function createFormulaDraft() {
    const targetGrams = Math.max(1, Number(newFormulaTargetGrams) || 100)
    try {
      const payload = await requestApi<FormulaCreateResponse>('/formulas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFormulaName.trim() || 'Untitled Formula',
          targetGrams,
          owner: 'Thuan Le Minh',
        }),
      })
      setFormulaRecords((current) => [
        payload.formula,
        ...current.filter((formula) => formula.id !== payload.formula.id),
      ])
      setActiveFormulaId(payload.formula.id)
      setNewFormulaName('Untitled Accord')
      setNewFormulaTargetGrams(100)
      setActiveKey('formulas')
      setModal(null)
    } catch {
      setActiveKey('formulas')
    }
  }

  async function addFormulaMaterialLine() {
    const material = materialRecords.find((item) => item.id === newLineMaterialId)
    const formula = formulaRecords.find((item) => item.id === activeFormulaId)
    const grams = Number(newLineGrams)

    if (!material || !formula || !Number.isFinite(grams) || grams <= 0) {
      return
    }

    try {
      const payload = await requestApi<FormulaMutationResponse>(`/formulas/${encodeURIComponent(formula.id)}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId: material.id, grams }),
      })
      setFormulaRecords((current) =>
        current.map((item) => (item.id === formula.id ? payload.formula : item)),
      )
      setSelectedMaterialId(material.id)
      setNewLineGrams(5)
      setActiveKey('formulas')
      setModal(null)
    } catch {
      setActiveKey('formulas')
    }
  }

  async function receiveStockLot() {
    const material = materialRecords.find((item) => item.id === receiveMaterialId)
    const quantityGrams = Number(receiveQuantityGrams)

    if (!material || !Number.isFinite(quantityGrams) || quantityGrams <= 0) {
      return
    }

    try {
      const payload = await requestApi<InventoryReceiptResponse>('/inventory/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materialId: material.id,
          lotNumber: receiveLotNumber.trim() || `L-${material.cas.replaceAll('-', '')}`,
          quantityGrams,
          expiryDate: receiveExpiryDate || '2028-12-31',
          location: 'Receiving Bay',
          qualityStatus: 'APPROVED',
          container: 'Receiving container',
        }),
      })

      setLots((current) => [payload.lot, ...current.filter((lot) => lot.id !== payload.lot.id)])
      setMovements((current) => [payload.movement, ...current.filter((movement) => movement.id !== payload.movement.id)])
      setReceiveLotNumber(`L-NEW-${String(lots.length + 2).padStart(3, '0')}`)
      setReceiveQuantityGrams(25)
      setActiveKey('inventory')
      setModal(null)
    } catch {
      setActiveKey('inventory')
    }
  }

  async function adjustInventoryLot() {
    const lot = lots.find((item) => item.id === adjustmentLotId)
    const quantityGrams = Number(adjustmentQuantityGrams)

    if (!lot || !Number.isFinite(quantityGrams) || quantityGrams <= 0) {
      return
    }

    const nextQuantity =
      adjustmentDirection === 'IN' ? lot.quantityGrams + quantityGrams : lot.quantityGrams - quantityGrams
    if (nextQuantity < lot.reservedGrams) {
      return
    }

    try {
      const payload = await requestApi<InventoryAdjustmentResponse>('/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lotId: lot.id,
          direction: adjustmentDirection,
          quantityGrams,
          reason: adjustmentReason.trim() || 'Cycle count correction',
        }),
      })

      setLots((current) => current.map((item) => (item.id === payload.lot.id ? payload.lot : item)))
      setMovements((current) => [payload.movement, ...current.filter((movement) => movement.id !== payload.movement.id)])
      setAdjustmentQuantityGrams(5)
      setActiveKey('inventory')
      setModal(null)
    } catch {
      setActiveKey('inventory')
    }
  }

  async function transferInventoryLot() {
    const lot = lots.find((item) => item.id === transferLotId)
    const toLocation = transferLocation.trim()

    if (!lot || !toLocation || lot.location === toLocation) {
      return
    }

    try {
      const payload = await requestApi<InventoryTransferResponse>('/inventory/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lotId: lot.id, toLocation }),
      })

      setLots((current) => current.map((item) => (item.id === payload.lot.id ? payload.lot : item)))
      setMovements((current) => [payload.movement, ...current.filter((movement) => movement.id !== payload.movement.id)])
      setActiveKey('inventory')
      setModal(null)
    } catch {
      setActiveKey('inventory')
    }
  }

  return (
    <div className="min-h-screen bg-lab-bg text-[var(--text)]">
      <LabBackdrop />
      <div className={`app-shell ${sidebarCollapsed ? 'is-rail' : ''}`}>
        <Sidebar
          activeKey={activeKey}
          collapsed={sidebarCollapsed}
          onNavigate={setActiveKey}
          onToggle={() => setSidebarCollapsed((value) => !value)}
        />
        <main className="workspace">
          <Topbar
            activeDomain={selectedDomain}
            onCommand={() => setCommandOpen(true)}
            onMenu={() => setSidebarCollapsed((value) => !value)}
          />
          <AnimatePresence mode="wait">
            {activeKey === 'dashboard' ? (
              <motion.div key="dashboard" {...shellMotion}>
                <Dashboard
                  stats={stats}
                  movements={movements}
                  activeKey={activeKey}
                  onNavigate={setActiveKey}
                  onOpenModal={setModal}
                />
              </motion.div>
            ) : selectedDomain ? (
              <motion.div key={activeKey} {...shellMotion}>
                <DomainWorkspace
                  domain={selectedDomain}
                  lots={lots}
                  movements={movements}
                  storageLocations={storageLocationRecords}
                  stock={stock}
                  materialRecords={materialRecords}
                  onLotsChange={setLots}
                  onMovementsChange={setMovements}
                  onStorageLocationsChange={setStorageLocationRecords}
                  setMaterialRecords={setMaterialRecords}
                  formulaRecords={formulaRecords}
                  setFormulaRecords={setFormulaRecords}
                  activeFormulaId={activeFormulaId}
                  setActiveFormulaId={setActiveFormulaId}
                  resolvedLeaves={resolvedLeaves}
                  totals={totals}
                  curve={curve}
                  selectedMaterialId={selectedMaterialId}
                  setSelectedMaterialId={setSelectedMaterialId}
                  labPlan={labPlan}
                  batchGrams={batchGrams}
                  setBatchGrams={setBatchGrams}
                  usageHistory={usageHistory}
                  weighingSession={weighingSessionPreview}
                  actualWeights={actualWeights}
                  onActualWeightChange={(key, value) =>
                    setActualWeights((current) => ({
                      ...current,
                      [key]: value,
                    }))
                  }
                  weighingTolerancePercent={weighingTolerancePercent}
                  setWeighingTolerancePercent={setWeighingTolerancePercent}
                  weighingOperator={weighingOperator}
                  setWeighingOperator={setWeighingOperator}
                  labUsagePurpose={labUsagePurpose}
                  setLabUsagePurpose={setLabUsagePurpose}
                  labUsageProjectCode={labUsageProjectCode}
                  setLabUsageProjectCode={setLabUsageProjectCode}
                  labUsageSampleCode={labUsageSampleCode}
                  setLabUsageSampleCode={setLabUsageSampleCode}
                  labUsageStatusMessage={labUsageStatusMessage}
                  labUsageBusy={labUsageBusy}
                  weighingReady={weighingReady}
                  onUseTargetWeights={setTargetWeights}
                  onCommit={() => setModal('commit')}
                  onReverse={reverseLatestUsage}
                  onOpenModal={setModal}
                  onNewFormula={() => setModal('newFormula')}
                  onAddFormulaLine={() => setModal('formulaLine')}
                  onReceiveStock={() => setModal('receiveStock')}
                  onAdjustStock={() => setModal('inventoryAdjustment')}
                  onTransferStock={() => setModal('inventoryTransfer')}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </main>
      </div>

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onNavigate={setActiveKey}
        onCommit={() => setModal('commit')}
      />

      <BlackPopup
        open={modal === 'commit'}
        title="Commit lab usage"
        description="This creates immutable OUT movements for eligible lots. Formula save/review stays non-consuming."
        actionLabel="Create movements"
        onClose={() => setModal(null)}
        onAction={commitLabUsage}
        actionDisabled={!weighingReady || labUsageBusy}
      >
        <UsagePreview allocations={labPlan.allocations} shortfalls={labPlan.shortfalls} compact />
        <WeighingEvidence session={weighingSessionPreview} compact />
      </BlackPopup>

      <BlackPopup
        open={modal === 'newFormula'}
        title="New formula draft"
        description="Creates a draft formula shell. Saving a formula never consumes inventory; only lab usage or production movements do."
        actionLabel="Create Formula"
        onClose={() => setModal(null)}
        onAction={createFormulaDraft}
        actionDisabled={!newFormulaName.trim() || newFormulaTargetGrams <= 0}
      >
        <div className="form-grid">
          <label className="field-row">
            <span>Formula name</span>
            <input
              aria-label="Formula name"
              value={newFormulaName}
              onChange={(event) => setNewFormulaName(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Target grams</span>
            <input
              aria-label="Formula target grams"
              min={1}
              step={1}
              type="number"
              value={newFormulaTargetGrams}
              onChange={(event) => setNewFormulaTargetGrams(Number(event.target.value))}
            />
          </label>
        </div>
      </BlackPopup>

      <BlackPopup
        open={modal === 'formulaLine'}
        title="Add formula ingredient"
        description="Adds a raw material line to the active formula. This recalculates resolve, cost, and evaporation without touching stock."
        actionLabel="Add Ingredient"
        onClose={() => setModal(null)}
        onAction={addFormulaMaterialLine}
        actionDisabled={!newLineMaterialId || newLineGrams <= 0}
      >
        <div className="form-grid">
          <label className="field-row">
            <span>Material</span>
            <select
              aria-label="Formula line material"
              value={newLineMaterialId}
              onChange={(event) => setNewLineMaterialId(event.target.value)}
            >
              {materialRecords.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Line grams</span>
            <input
              aria-label="Formula line grams"
              min={0.01}
              step={0.01}
              type="number"
              value={newLineGrams}
              onChange={(event) => setNewLineGrams(Number(event.target.value))}
            />
          </label>
          <div className="popup-grid">
            <Metric label="Active formula" value={selectedFormula.code} />
            <Metric label="Target" value={formatGrams(selectedFormula.targetGrams)} />
          </div>
        </div>
      </BlackPopup>

      <BlackPopup
        open={modal === 'receiveStock'}
        title="Receive stock / create lot"
        description="Creates an approved inventory lot and a matching immutable RECEIPT movement."
        actionLabel="Create Lot"
        onClose={() => setModal(null)}
        onAction={receiveStockLot}
        actionDisabled={!receiveMaterialId || receiveQuantityGrams <= 0}
      >
        <div className="form-grid">
          <label className="field-row">
            <span>Material</span>
            <select
              aria-label="Receipt material"
              value={receiveMaterialId}
              onChange={(event) => setReceiveMaterialId(event.target.value)}
            >
              {materialRecords.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Lot number</span>
            <input
              aria-label="Receipt lot number"
              value={receiveLotNumber}
              onChange={(event) => setReceiveLotNumber(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Quantity grams</span>
            <input
              aria-label="Receipt quantity grams"
              min={0.1}
              step={0.1}
              type="number"
              value={receiveQuantityGrams}
              onChange={(event) => setReceiveQuantityGrams(Number(event.target.value))}
            />
          </label>
          <label className="field-row">
            <span>Expiry date</span>
            <input
              aria-label="Receipt expiry date"
              type="date"
              value={receiveExpiryDate}
              onChange={(event) => setReceiveExpiryDate(event.target.value)}
            />
          </label>
        </div>
      </BlackPopup>

      <BlackPopup
        open={modal === 'inventoryAdjustment'}
        title="Adjust stock"
        description="Creates an immutable ADJUSTMENT movement. Available stock cannot go negative."
        actionLabel="Create Adjustment"
        onClose={() => setModal(null)}
        onAction={adjustInventoryLot}
        actionDisabled={!adjustmentLotId || adjustmentQuantityGrams <= 0 || adjustmentWouldGoNegative}
      >
        <div className="form-grid">
          <label className="field-row">
            <span>Lot</span>
            <select
              aria-label="Adjustment lot"
              value={adjustmentLotId}
              onChange={(event) => setAdjustmentLotId(event.target.value)}
            >
              {lots.map((lot) => {
                const material = materialRecords.find((item) => item.id === lot.materialId)
                return (
                  <option key={lot.id} value={lot.id}>
                    {lot.lotNumber} / {material?.name} / {formatGrams(lot.quantityGrams)}
                  </option>
                )
              })}
            </select>
          </label>
          <label className="field-row">
            <span>Direction</span>
            <select
              aria-label="Adjustment direction"
              value={adjustmentDirection}
              onChange={(event) => setAdjustmentDirection(event.target.value as 'IN' | 'OUT')}
            >
              <option value="OUT">OUT - write down</option>
              <option value="IN">IN - correction gain</option>
            </select>
          </label>
          <label className="field-row">
            <span>Quantity grams</span>
            <input
              aria-label="Adjustment quantity grams"
              min={0.1}
              step={0.1}
              type="number"
              value={adjustmentQuantityGrams}
              onChange={(event) => setAdjustmentQuantityGrams(Number(event.target.value))}
            />
          </label>
          <label className="field-row">
            <span>Reason</span>
            <input
              aria-label="Adjustment reason"
              value={adjustmentReason}
              onChange={(event) => setAdjustmentReason(event.target.value)}
            />
          </label>
          {adjustmentWouldGoNegative && (
            <div className="empty-state compact">
              <strong>Blocked by INV-005 no negative stock.</strong>
              <span>Reduce the write-down or release reservations first.</span>
            </div>
          )}
        </div>
      </BlackPopup>

      <BlackPopup
        open={modal === 'inventoryTransfer'}
        title="Transfer lot"
        description="Moves a lot between storage locations and records TRANSFER / MOVE evidence without changing stock."
        actionLabel="Confirm Transfer"
        onClose={() => setModal(null)}
        onAction={transferInventoryLot}
        actionDisabled={!transferLotId || !transferLocation.trim() || selectedTransferLot?.location === transferLocation}
      >
        <div className="form-grid">
          <label className="field-row">
            <span>Lot</span>
            <select
              aria-label="Transfer lot"
              value={transferLotId}
              onChange={(event) => setTransferLotId(event.target.value)}
            >
              {lots.map((lot) => {
                const material = materialRecords.find((item) => item.id === lot.materialId)
                return (
                  <option key={lot.id} value={lot.id}>
                    {lot.lotNumber} / {material?.name} / {lot.location}
                  </option>
                )
              })}
            </select>
          </label>
          <label className="field-row">
            <span>To location</span>
            <select
              aria-label="Transfer location"
              value={transferLocation}
              onChange={(event) => setTransferLocation(event.target.value)}
            >
              {storageLocationRecords.map((location) => (
                <option key={location.id} value={location.name}>
                  {location.name} / {location.condition}
                </option>
              ))}
            </select>
          </label>
          <div className="popup-grid">
            <Metric label="Movement type" value="TRANSFER" />
            <Metric label="Quantity effect" value="No stock delta" />
          </div>
        </div>
      </BlackPopup>

      <BlackPopup
        open={modal === 'auditExport'}
        title="Audit export"
        description="Enterprise export is scoped to the current tenant and every download is logged."
        actionLabel="Queue JSON export"
        onClose={() => setModal(null)}
        onAction={() => setModal(null)}
      >
        <div className="popup-grid">
          <Metric label="Events" value="9,144" />
          <Metric label="Format" value="JSON" />
          <Metric label="Scope" value="ORG-NXL" />
        </div>
      </BlackPopup>

      <BlackPopup
        open={modal === 'ssoPolicy'}
        title="SSO and tenant security"
        description="Owner/Admin actions require MFA. SSO group mapping never bypasses tenant scope."
        actionLabel="Mark reviewed"
        onClose={() => setModal(null)}
        onAction={() => setModal(null)}
      >
        <ul className="policy-list">
          <li>OIDC domain verified for noxelis.lab</li>
          <li>SCIM deprovisioning revokes sessions immediately</li>
          <li>API key rotation raises a security alert</li>
        </ul>
      </BlackPopup>
    </div>
  )
}

function Sidebar({
  activeKey,
  collapsed,
  onNavigate,
  onToggle,
}: {
  activeKey: DomainKey
  collapsed: boolean
  onNavigate: (key: DomainKey) => void
  onToggle: () => void
}) {
  return (
    <aside className="sidebar glass">
      <div className="brand-row">
        <div className="brand-mark">
          <Sparkles size={18} />
        </div>
        {!collapsed && (
          <div>
            <div className="wordmark">OlfactoryOps</div>
            <div className="mono-small">North Star OS</div>
          </div>
        )}
        <button className="icon-button sidebar-toggle" type="button" onClick={onToggle} aria-label="Toggle sidebar">
          <Menu size={18} />
        </button>
      </div>

      <nav className="nav-stack" aria-label="Main modules">
        {navGroups.map((group) => (
          <div className="nav-group" key={group.title}>
            {!collapsed && <div className="nav-title">{group.title}</div>}
            {group.keys.map((key) => {
              const domain = key === 'dashboard' ? undefined : domains.find((item) => item.key === key)
              const Icon = domainIcons[key]
              const label = key === 'dashboard' ? 'North Star Console' : domain?.shortName ?? key
              const isActive = activeKey === key
              return (
                <button
                  key={key}
                  className={`nav-item ${isActive ? 'is-active' : ''}`}
                  type="button"
                  onClick={() => onNavigate(key)}
                  title={label}
                >
                  <Icon size={18} />
                  {!collapsed && <span>{label}</span>}
                  {!collapsed && domain && <StatusDot status={domain.status} />}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="sidebar-footer">
          <div className="mono-small">Tenant isolation</div>
          <div className="footer-status">
            <CheckCircle2 size={16} />
            <span>Session scoped to ORG-NXL</span>
          </div>
        </div>
      )}
    </aside>
  )
}

function Topbar({
  activeDomain,
  onCommand,
  onMenu,
}: {
  activeDomain?: DomainModule
  onCommand: () => void
  onMenu: () => void
}) {
  return (
    <header className="topbar glass">
      <button className="icon-button mobile-menu" type="button" onClick={onMenu} aria-label="Open navigation">
        <Menu size={18} />
      </button>
      <div>
        <div className="mono-small">ORG-NXL / Noxelis Fine Fragrance</div>
        <h1>{activeDomain ? activeDomain.name : 'North Star Console'}</h1>
      </div>
      <button className="command-button" type="button" onClick={onCommand}>
        <Search size={17} />
        <span>Search modules, records, actions</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="topbar-actions">
        <DataTag icon={ShieldCheck} label="Tenant guard" value="On" tone="green" />
        <button className="icon-button" type="button" aria-label="Notifications">
          <Bell size={18} />
        </button>
      </div>
    </header>
  )
}

function Dashboard({
  stats,
  movements,
  onNavigate,
  onOpenModal,
}: {
  stats: { done: number; avgCoverage: number; risks: number }
  movements: InventoryMovement[]
  activeKey: DomainKey
  onNavigate: (key: DomainKey) => void
  onOpenModal: (modal: ModalKind) => void
}) {
  return (
    <div className="dashboard-grid">
      <Panel className="hero-panel" title="North Star Console" icon={Gauge} right={<StatusBadge status="active" />}>
        <div className="hero-content">
          <div>
            <p className="lead">
              Full SaaS operating layer across all 15 phases, with the core R&D value stream live inside the
              broader enterprise product surface.
            </p>
            <div className="hero-actions">
              <button className="primary-button" type="button" onClick={() => onNavigate('formulas')}>
                Open Formula R&D
                <ChevronRight size={16} />
              </button>
              <button className="ghost-button" type="button" onClick={() => onOpenModal('auditExport')}>
                Audit export
              </button>
            </div>
          </div>
          <div className="hero-metrics">
            <Metric label="Phases active/stable" value={`${stats.done}/16`} />
            <Metric label="Avg coverage" value={`${stats.avgCoverage}%`} />
            <Metric label="Risk flags" value={String(stats.risks)} />
          </div>
        </div>
      </Panel>

      <Panel className="phase-panel" title="Phase Roadmap" icon={Layers3}>
        <PhaseRoadmap onNavigate={onNavigate} />
      </Panel>

      <Panel className="workflow-panel" title="Operating Value Stream" icon={Activity}>
        <WorkflowGraph onNavigate={onNavigate} />
      </Panel>

      <Panel className="matrix-panel" title="Domain Health Matrix" icon={Database}>
        <DomainMatrix onNavigate={onNavigate} />
      </Panel>

      <EnterpriseReadiness onOpenModal={onOpenModal} />

      <Panel className="ledger-panel" title="Movement Ledger" icon={Boxes}>
        <MovementTable movements={movements.slice(0, 6)} />
      </Panel>

      <Panel className="audit-panel" title="Audit Trail" icon={KeyRound}>
        <AuditList events={auditEvents} />
      </Panel>
    </div>
  )
}

function DomainWorkspace({
  domain,
  lots,
  movements,
  storageLocations,
  stock,
  materialRecords,
  onLotsChange,
  onMovementsChange,
  onStorageLocationsChange,
  setMaterialRecords,
  formulaRecords,
  setFormulaRecords,
  activeFormulaId,
  setActiveFormulaId,
  resolvedLeaves,
  totals,
  curve,
  selectedMaterialId,
  setSelectedMaterialId,
  labPlan,
  batchGrams,
  setBatchGrams,
  usageHistory,
  weighingSession,
  actualWeights,
  onActualWeightChange,
  weighingTolerancePercent,
  setWeighingTolerancePercent,
  weighingOperator,
  setWeighingOperator,
  labUsagePurpose,
  setLabUsagePurpose,
  labUsageProjectCode,
  setLabUsageProjectCode,
  labUsageSampleCode,
  setLabUsageSampleCode,
  labUsageStatusMessage,
  labUsageBusy,
  weighingReady,
  onUseTargetWeights,
  onCommit,
  onReverse,
  onOpenModal,
  onNewFormula,
  onAddFormulaLine,
  onReceiveStock,
  onAdjustStock,
  onTransferStock,
}: {
  domain: DomainModule
  lots: InventoryLot[]
  movements: InventoryMovement[]
  storageLocations: StorageLocation[]
  stock: ReturnType<typeof stockSummary>
  materialRecords: Material[]
  onLotsChange: Dispatch<SetStateAction<InventoryLot[]>>
  onMovementsChange: Dispatch<SetStateAction<InventoryMovement[]>>
  onStorageLocationsChange: Dispatch<SetStateAction<StorageLocation[]>>
  setMaterialRecords: (materials: Material[]) => void
  formulaRecords: Formula[]
  setFormulaRecords: Dispatch<SetStateAction<Formula[]>>
  activeFormulaId: string
  setActiveFormulaId: (id: string) => void
  resolvedLeaves: ResolvedLeaf[]
  totals: ReturnType<typeof formulaTotals>
  curve: ReturnType<typeof evaporationCurve>
  selectedMaterialId: string
  setSelectedMaterialId: (id: string) => void
  labPlan: ReturnType<typeof planLabUsage>
  batchGrams: number
  setBatchGrams: (value: number) => void
  usageHistory: UsageRecord[]
  weighingSession: LabWeighingSession
  actualWeights: Record<string, number>
  onActualWeightChange: (key: string, value: number) => void
  weighingTolerancePercent: number
  setWeighingTolerancePercent: (value: number) => void
  weighingOperator: string
  setWeighingOperator: (value: string) => void
  labUsagePurpose: LabUsagePurpose
  setLabUsagePurpose: (value: LabUsagePurpose) => void
  labUsageProjectCode: string
  setLabUsageProjectCode: (value: string) => void
  labUsageSampleCode: string
  setLabUsageSampleCode: (value: string) => void
  labUsageStatusMessage: string
  labUsageBusy: boolean
  weighingReady: boolean
  onUseTargetWeights: () => void
  onCommit: () => void
  onReverse: () => void
  onOpenModal: (modal: ModalKind) => void
  onNewFormula: () => void
  onAddFormulaLine: () => void
  onReceiveStock: () => void
  onAdjustStock: () => void
  onTransferStock: () => void
}) {
  return (
    <div className="domain-page">
      <DomainHeader domain={domain} onOpenModal={onOpenModal} />

      {domain.key === 'materials' && (
        <MaterialWorkspace
          materialRecords={materialRecords}
          onMaterialsChange={setMaterialRecords}
          selectedMaterialId={selectedMaterialId}
          onSelectMaterial={setSelectedMaterialId}
          stock={stock}
        />
      )}
      {domain.key === 'formulas' && (
        <FormulaWorkspace
          formulaRecords={formulaRecords}
          materialRecords={materialRecords}
          activeFormulaId={activeFormulaId}
          onSelectFormula={setActiveFormulaId}
          onFormulaRecordsChange={setFormulaRecords}
          resolvedLeaves={resolvedLeaves}
          totals={totals}
          curve={curve}
          onSelectMaterial={setSelectedMaterialId}
          onNewFormula={onNewFormula}
          onAddLine={onAddFormulaLine}
        />
      )}
      {domain.key === 'inventory' && (
        <InventoryWorkspace
          lots={lots}
          movements={movements}
          storageLocations={storageLocations}
          stock={stock}
          materialRecords={materialRecords}
          onLotsChange={onLotsChange}
          onMovementsChange={onMovementsChange}
          onStorageLocationsChange={onStorageLocationsChange}
          onReceiveStock={onReceiveStock}
          onAdjustStock={onAdjustStock}
          onTransferStock={onTransferStock}
        />
      )}
      {domain.key === 'labUsage' && (
        <LabUsageWorkspace
          labPlan={labPlan}
          batchGrams={batchGrams}
          setBatchGrams={setBatchGrams}
          usageHistory={usageHistory}
          weighingSession={weighingSession}
          actualWeights={actualWeights}
          onActualWeightChange={onActualWeightChange}
          weighingTolerancePercent={weighingTolerancePercent}
          setWeighingTolerancePercent={setWeighingTolerancePercent}
          weighingOperator={weighingOperator}
          setWeighingOperator={setWeighingOperator}
          labUsagePurpose={labUsagePurpose}
          setLabUsagePurpose={setLabUsagePurpose}
          labUsageProjectCode={labUsageProjectCode}
          setLabUsageProjectCode={setLabUsageProjectCode}
          labUsageSampleCode={labUsageSampleCode}
          setLabUsageSampleCode={setLabUsageSampleCode}
          statusMessage={labUsageStatusMessage}
          busy={labUsageBusy}
          weighingReady={weighingReady}
          onUseTargetWeights={onUseTargetWeights}
          onCommit={onCommit}
          onReverse={onReverse}
        />
      )}
      {domain.key === 'documents' && <DocumentsWorkspace />}
      {domain.key === 'costing' && <CostingWorkspace totals={totals} stock={stock} />}
      {domain.key === 'analytics' && <AnalyticsWorkspace curve={curve} stock={stock} />}
      {domain.key === 'identity' && <IdentityWorkspace />}
      {domain.key === 'customization' && <CustomizationWorkspace />}
      {![
        'identity',
        'customization',
        'materials',
        'formulas',
        'inventory',
        'labUsage',
        'documents',
        'costing',
        'analytics',
      ].includes(domain.key) && (
        <GenericDomainWorkspace domain={domain} onOpenModal={onOpenModal} />
      )}
    </div>
  )
}

function DomainHeader({ domain, onOpenModal }: { domain: DomainModule; onOpenModal: (modal: ModalKind) => void }) {
  const Icon = domainIcons[domain.key]
  return (
    <Panel className="domain-header" title={domain.name} icon={Icon} right={<StatusBadge status={domain.status} />}>
      <div className="domain-header-grid">
        <div>
          <p className="lead">{domain.responsibility}</p>
          <div className="tag-row">
            <DataTag icon={Layers3} label="Phase" value={domain.phase} />
            <DataTag icon={UsersRound} label="Owner" value={domain.owner} />
            <DataTag icon={Gauge} label="Health" value={`${domain.health}%`} tone={domain.health > 70 ? 'green' : 'amber'} />
          </div>
        </div>
        <div className="risk-card">
          <div className="mono-small">Current gate</div>
          <strong>{domain.risk}</strong>
          <button
            className="ghost-button small"
            type="button"
            onClick={() => onOpenModal(domain.key === 'saas' || domain.key === 'identity' ? 'ssoPolicy' : 'auditExport')}
          >
            Review controls
          </button>
        </div>
      </div>
    </Panel>
  )
}

function MaterialWorkspace({
  materialRecords,
  onMaterialsChange,
  selectedMaterialId,
  onSelectMaterial,
  stock,
}: {
  materialRecords: Material[]
  onMaterialsChange: (materials: Material[]) => void
  selectedMaterialId: string
  onSelectMaterial: (id: string) => void
  stock: ReturnType<typeof stockSummary>
}) {
  const selected = materialRecords.find((material) => material.id === selectedMaterialId) ?? materialRecords[0] ?? materials[0]!
  const selectedStock = stock.find((item) => item.material.id === selected.id)
  const [materialStatus, setMaterialStatus] = useState('Loading material intelligence')
  const [createName, setCreateName] = useState('Vetiveryl Acetate')
  const [createCas, setCreateCas] = useState('68917-34-0')
  const [createFamily, setCreateFamily] = useState('Woody vetiver')
  const [createTier, setCreateTier] = useState<Material['tier']>('Base')
  const [editDraft, setEditDraft] = useState({
    family: selected.family,
    tier: selected.tier,
    density: selected.density,
    vaporPressure: selected.vaporPressure,
    costPerGram: selected.costPerGram,
    ifraLimit: selected.ifraLimit,
    odor: selected.odor.join(', '),
  })
  const [ingestDraft, setIngestDraft] = useState({
    documentType: 'SDS' as 'SDS' | 'CoA',
    source: `${selected.name} SDS v4`,
    version: 'v4',
    density: selected.density,
    vaporPressure: selected.vaporPressure,
  })
  const [moleculeRows, setMoleculeRows] = useState<MoleculeComponent[]>(() =>
    moleculeComponents.filter((molecule) => molecule.materialId === selected.id),
  )
  const [provenanceRows, setProvenanceRows] = useState<Material['provenance']>(selected.provenance)
  const [linkedDocuments, setLinkedDocuments] = useState<DocumentRecord[]>(() =>
    documents.filter((document) => document.linkedTo === selected.id),
  )

  useEffect(() => {
    async function loadMaterials() {
      try {
        const response = await fetch(`${apiBaseUrl}/materials`)
        if (!response.ok) {
          throw new Error('Material catalog API failed')
        }
        const payload = (await response.json()) as ApiEnvelope<Material[]>
        onMaterialsChange(payload.data)
        if (!payload.data.some((material) => material.id === selectedMaterialId) && payload.data[0]) {
          onSelectMaterial(payload.data[0].id)
        }
        setMaterialStatus('Material catalog synced from API')
      } catch {
        setMaterialStatus('Using local material seed until API is reachable')
      }
    }
    void loadMaterials()
  }, [onMaterialsChange, onSelectMaterial, selectedMaterialId])

  useEffect(() => {
    let active = true
    setEditDraft({
      family: selected.family,
      tier: selected.tier,
      density: selected.density,
      vaporPressure: selected.vaporPressure,
      costPerGram: selected.costPerGram,
      ifraLimit: selected.ifraLimit,
      odor: selected.odor.join(', '),
    })
    setIngestDraft((current) => ({
      ...current,
      source: `${selected.name} ${current.documentType} review`,
      density: selected.density,
      vaporPressure: selected.vaporPressure,
    }))
    setMoleculeRows(moleculeComponents.filter((molecule) => molecule.materialId === selected.id))
    setProvenanceRows(selected.provenance)
    setLinkedDocuments(documents.filter((document) => document.linkedTo === selected.id))

    async function loadIntelligence() {
      try {
        const [moleculeResponse, provenanceResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/materials/${encodeURIComponent(selected.id)}/molecules`),
          fetch(`${apiBaseUrl}/materials/${encodeURIComponent(selected.id)}/provenance`),
        ])
        if (!moleculeResponse.ok || !provenanceResponse.ok) {
          throw new Error('Material intelligence API failed')
        }
        const moleculePayload = (await moleculeResponse.json()) as ApiEnvelope<MaterialMoleculesResponse>
        const provenancePayload = (await provenanceResponse.json()) as ApiEnvelope<MaterialProvenanceResponse>
        if (!active) {
          return
        }
        setMoleculeRows(moleculePayload.data.molecules)
        setProvenanceRows(provenancePayload.data.provenance)
        setLinkedDocuments(provenancePayload.data.documents)
      } catch {
        if (active) {
          setMaterialStatus('Using local molecule/provenance seed until API is reachable')
        }
      }
    }

    void loadIntelligence()
    return () => {
      active = false
    }
  }, [selected])

  function upsertMaterial(nextMaterial: Material) {
    const exists = materialRecords.some((material) => material.id === nextMaterial.id)
    onMaterialsChange(
      exists
        ? materialRecords.map((material) => (material.id === nextMaterial.id ? nextMaterial : material))
        : [nextMaterial, ...materialRecords],
    )
    onSelectMaterial(nextMaterial.id)
    setProvenanceRows(nextMaterial.provenance)
  }

  async function checkCasDuplicate() {
    try {
      const response = await fetch(`${apiBaseUrl}/materials/dedupe?cas=${encodeURIComponent(createCas)}`)
      if (!response.ok) {
        throw new Error('Dedupe check failed')
      }
      const payload = (await response.json()) as ApiEnvelope<MaterialDedupeResponse>
      setMaterialStatus(
        payload.data.duplicate
          ? `${payload.data.matches.length} duplicate candidate found for ${payload.data.cas}`
          : `No CAS duplicate found for ${payload.data.cas}`,
      )
    } catch {
      setMaterialStatus('CAS duplicate check unavailable')
    }
  }

  async function createMaterialRecord() {
    try {
      const response = await fetch(`${apiBaseUrl}/materials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName,
          cas: createCas,
          family: createFamily,
          tier: createTier,
          density: 1,
          vaporPressure: 0.01,
          mw: 100,
          logP: 1,
          substantivityHours: 24,
          ifraLimit: 100,
          costPerGram: 0.05,
          odor: createFamily.split(' ').filter(Boolean),
          source: 'Material intelligence console',
          version: 'v1',
        }),
      })
      if (!response.ok) {
        throw new Error('Material create failed')
      }
      const payload = (await response.json()) as ApiEnvelope<MaterialMutationResponse>
      upsertMaterial(payload.data.material)
      setCreateName('')
      setMaterialStatus(`${payload.data.material.name} created without stock movement`)
    } catch {
      setMaterialStatus('Material create blocked; check required fields or duplicate CAS')
    }
  }

  async function saveMaterialUpdate() {
    try {
      const response = await fetch(`${apiBaseUrl}/materials/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          family: editDraft.family,
          tier: editDraft.tier,
          density: Number(editDraft.density),
          vaporPressure: Number(editDraft.vaporPressure),
          costPerGram: Number(editDraft.costPerGram),
          ifraLimit: Number(editDraft.ifraLimit),
          odor: editDraft.odor.split(',').map((tag) => tag.trim()).filter(Boolean),
          source: 'Material inspector update',
          version: 'manual-ui',
        }),
      })
      if (!response.ok) {
        throw new Error('Material update failed')
      }
      const payload = (await response.json()) as ApiEnvelope<MaterialMutationResponse>
      upsertMaterial(payload.data.material)
      setMaterialStatus(`${payload.data.material.name} metadata saved with provenance`)
    } catch {
      setMaterialStatus('Material update blocked by validation or permission')
    }
  }

  async function approveIngestion() {
    try {
      const response = await fetch(`${apiBaseUrl}/materials/${encodeURIComponent(selected.id)}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType: ingestDraft.documentType,
          source: ingestDraft.source,
          version: ingestDraft.version,
          approved: true,
          fields: {
            density: Number(ingestDraft.density),
            vaporPressure: Number(ingestDraft.vaporPressure),
          },
          odor: editDraft.odor.split(',').map((tag) => tag.trim()).filter(Boolean),
        }),
      })
      if (!response.ok) {
        throw new Error('Material ingest failed')
      }
      const payload = (await response.json()) as ApiEnvelope<MaterialIngestionResponse>
      upsertMaterial(payload.data.material)
      setMaterialStatus(`${payload.data.ingestion.source} approved and written to material provenance`)
    } catch {
      setMaterialStatus('SDS/CoA ingest blocked; review extracted fields')
    }
  }

  async function fillFromPubChem() {
    try {
      const response = await fetch(`${apiBaseUrl}/materials/${encodeURIComponent(selected.id)}/pubchem-fill`, {
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error('PubChem fill failed')
      }
      const payload = (await response.json()) as ApiEnvelope<PubChemFillResponse>
      upsertMaterial(payload.data.material)
      setMoleculeRows(payload.data.molecules)
      setMaterialStatus(`${payload.data.material.name} enriched from curated PubChem profile`)
    } catch {
      setMaterialStatus('PubChem fill unavailable for this material')
    }
  }

  return (
    <div className="workspace-grid material-intelligence-grid">
      <Panel title="Material Library" icon={Atom}>
        <div className="material-form-grid">
          <label className="field-row">
            <span>Name</span>
            <input aria-label="New material name" value={createName} onChange={(event) => setCreateName(event.target.value)} />
          </label>
          <label className="field-row">
            <span>CAS</span>
            <input aria-label="New material CAS" value={createCas} onChange={(event) => setCreateCas(event.target.value)} />
          </label>
          <label className="field-row">
            <span>Family</span>
            <input
              aria-label="New material family"
              value={createFamily}
              onChange={(event) => setCreateFamily(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Tier</span>
            <select
              aria-label="New material tier"
              value={createTier}
              onChange={(event) => setCreateTier(event.target.value as Material['tier'])}
            >
              <option value="Top">Top</option>
              <option value="Heart">Heart</option>
              <option value="Base">Base</option>
            </select>
          </label>
          <button className="ghost-button" type="button" onClick={() => void checkCasDuplicate()}>
            Check CAS
          </button>
          <button className="primary-button" type="button" onClick={() => void createMaterialRecord()} disabled={!createName.trim() || !createCas.trim()}>
            <Plus size={16} />
            Create material
          </button>
        </div>
        <ul className="policy-list">
          <li>{materialStatus}</li>
          <li>Material master changes do not create stock. Lots and movements stay in Inventory.</li>
        </ul>
        <div className="material-list">
          {materialRecords.map((material) => {
            const summary = stock.find((item) => item.material.id === material.id)
            return (
              <button
                key={material.id}
                className={`material-row ${selected.id === material.id ? 'is-active' : ''}`}
                type="button"
                onClick={() => onSelectMaterial(material.id)}
              >
                <div>
                  <strong>{material.name}</strong>
                  <span>{material.family}</span>
                </div>
                <DataTag label={material.tier} value={material.cas} tone="blue" />
                <div className="mono-value">{summary ? formatGrams(summary.available) : '0g'}</div>
              </button>
            )
          })}
        </div>
      </Panel>

      <Panel title="Material Inspector" icon={PackageSearch} right={<DataTag label="CAS" value={selected.cas} />}>
        <div className="tag-row">
          <DataTag label="Available" value={selectedStock ? formatGrams(selectedStock.available) : '0g'} tone="green" />
          <DataTag label="Provenance" value={String(selected.provenance.length)} tone="blue" />
          <DataTag label="Molecules" value={String(moleculeRows.length)} />
        </div>
        <div className="inspector-grid">
          <Metric label="Vapor pressure" value={`${selected.vaporPressure}`} />
          <Metric label="Density" value={`${selected.density} g/ml`} />
          <Metric label="MW" value={String(selected.mw)} />
          <Metric label="LogP" value={String(selected.logP)} />
          <Metric label="IFRA ref" value={`${selected.ifraLimit}%`} />
          <Metric label="Available" value={selectedStock ? formatGrams(selectedStock.available) : '0g'} />
        </div>
        <div className="odor-row">
          {selected.odor.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div className="material-form-grid">
          <label className="field-row">
            <span>Family</span>
            <input
              aria-label="Material family"
              value={editDraft.family}
              onChange={(event) => setEditDraft((current) => ({ ...current, family: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Tier</span>
            <select
              aria-label="Material tier"
              value={editDraft.tier}
              onChange={(event) => setEditDraft((current) => ({ ...current, tier: event.target.value as Material['tier'] }))}
            >
              <option value="Top">Top</option>
              <option value="Heart">Heart</option>
              <option value="Base">Base</option>
            </select>
          </label>
          <label className="field-row">
            <span>Density</span>
            <input
              aria-label="Material density"
              step={0.001}
              type="number"
              value={editDraft.density}
              onChange={(event) => setEditDraft((current) => ({ ...current, density: Number(event.target.value) }))}
            />
          </label>
          <label className="field-row">
            <span>Vapor pressure</span>
            <input
              aria-label="Material vapor pressure"
              step={0.0001}
              type="number"
              value={editDraft.vaporPressure}
              onChange={(event) => setEditDraft((current) => ({ ...current, vaporPressure: Number(event.target.value) }))}
            />
          </label>
          <label className="field-row">
            <span>Cost / gram</span>
            <input
              aria-label="Material cost per gram"
              step={0.001}
              type="number"
              value={editDraft.costPerGram}
              onChange={(event) => setEditDraft((current) => ({ ...current, costPerGram: Number(event.target.value) }))}
            />
          </label>
          <label className="field-row">
            <span>IFRA limit %</span>
            <input
              aria-label="Material IFRA limit"
              step={0.1}
              type="number"
              value={editDraft.ifraLimit}
              onChange={(event) => setEditDraft((current) => ({ ...current, ifraLimit: Number(event.target.value) }))}
            />
          </label>
          <label className="field-row wide-field">
            <span>Odor tags</span>
            <input
              aria-label="Material odor tags"
              value={editDraft.odor}
              onChange={(event) => setEditDraft((current) => ({ ...current, odor: event.target.value }))}
            />
          </label>
          <button className="primary-button" type="button" onClick={() => void saveMaterialUpdate()}>
            Save metadata
          </button>
          <button className="ghost-button" type="button" onClick={() => void fillFromPubChem()}>
            PubChem fill
          </button>
        </div>
      </Panel>

      <Panel title="SDS / CoA Review" icon={FileLock2}>
        <div className="material-form-grid">
          <label className="field-row">
            <span>Document type</span>
            <select
              aria-label="Material ingest document type"
              value={ingestDraft.documentType}
              onChange={(event) =>
                setIngestDraft((current) => ({ ...current, documentType: event.target.value as 'SDS' | 'CoA' }))
              }
            >
              <option value="SDS">SDS</option>
              <option value="CoA">CoA</option>
            </select>
          </label>
          <label className="field-row">
            <span>Version</span>
            <input
              aria-label="Material ingest version"
              value={ingestDraft.version}
              onChange={(event) => setIngestDraft((current) => ({ ...current, version: event.target.value }))}
            />
          </label>
          <label className="field-row wide-field">
            <span>Source</span>
            <input
              aria-label="Material ingest source"
              value={ingestDraft.source}
              onChange={(event) => setIngestDraft((current) => ({ ...current, source: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Extracted density</span>
            <input
              aria-label="Material ingest density"
              step={0.001}
              type="number"
              value={ingestDraft.density}
              onChange={(event) => setIngestDraft((current) => ({ ...current, density: Number(event.target.value) }))}
            />
          </label>
          <label className="field-row">
            <span>Extracted vapor pressure</span>
            <input
              aria-label="Material ingest vapor pressure"
              step={0.0001}
              type="number"
              value={ingestDraft.vaporPressure}
              onChange={(event) =>
                setIngestDraft((current) => ({ ...current, vaporPressure: Number(event.target.value) }))
              }
            />
          </label>
          <button className="primary-button" type="button" onClick={() => void approveIngestion()}>
            Approve ingest
          </button>
        </div>
        <div className="empty-state">
          <strong>Review-first ingestion</strong>
          <span>Extracted SDS/CoA fields are written only after this explicit approval step.</span>
        </div>
      </Panel>

      <Panel title="Molecule Split" icon={Layers3}>
        <div className="tag-row">
          <DataTag label="Components" value={String(moleculeRows.length)} />
          <DataTag label="Total" value={`${moleculeRows.reduce((sum, molecule) => sum + molecule.percent, 0).toFixed(1)}%`} tone="blue" />
        </div>
        <div className="provenance-list">
          {moleculeRows.length > 0 ? (
            moleculeRows.map((molecule) => (
              <div className="provenance-item" key={molecule.id}>
                <div>
                  <strong>{molecule.name}</strong>
                  <span>{molecule.cas} / {molecule.source}</span>
                </div>
                <DataTag label="Pct" value={`${molecule.percent}%`} tone="green" />
                <StatusBadge status={molecule.status === 'VERIFIED' ? 'stable' : 'review'} label={molecule.status} />
              </div>
            ))
          ) : (
            <div className="empty-state">
              <strong>No molecule split yet.</strong>
              <span>Run PubChem fill or approve SDS section 3 extraction to seed components.</span>
            </div>
          )}
        </div>
      </Panel>

      <Panel className="wide" title="Field Provenance" icon={ClipboardCheck}>
        <div className="provenance-list">
          {provenanceRows.map((source, index) => (
            <div className="provenance-item" key={`${source.field}-${source.version}-${index}`}>
              <div>
                <strong>{source.field}</strong>
                <span>{source.source}</span>
              </div>
              <span className="mono-value">{source.version}</span>
              <span className="mono-small">{index === 0 ? 'latest' : source.date}</span>
            </div>
          ))}
          {linkedDocuments.map((document) => (
            <div className="provenance-item" key={document.id}>
              <div>
                <strong>{document.type} document</strong>
                <span>{document.title} / {document.sensitivity}</span>
              </div>
              <span className="mono-value">{document.version}</span>
              <StatusBadge status="stable" label="private" />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function FormulaWorkspace({
  formulaRecords,
  materialRecords,
  activeFormulaId,
  onSelectFormula,
  onFormulaRecordsChange,
  resolvedLeaves,
  totals,
  curve,
  onSelectMaterial,
  onNewFormula,
  onAddLine,
}: {
  formulaRecords: Formula[]
  materialRecords: Material[]
  activeFormulaId: string
  onSelectFormula: (id: string) => void
  onFormulaRecordsChange: Dispatch<SetStateAction<Formula[]>>
  resolvedLeaves: ResolvedLeaf[]
  totals: ReturnType<typeof formulaTotals>
  curve: ReturnType<typeof evaporationCurve>
  onSelectMaterial: (id: string) => void
  onNewFormula: () => void
  onAddLine: () => void
}) {
  const fallbackFormula = formulas.find((item) => item.id === 'frm-0421')!
  const formula = formulaRecords.find((item) => item.id === activeFormulaId) ?? formulaRecords[0] ?? fallbackFormula
  const activeLeaves = resolvedLeaves
  const activeTotals = totals
  const activeCurve = curve
  const selectableChildFormulas = useMemo(
    () => formulaRecords.filter((item) => item.id !== formula.id),
    [formula.id, formulaRecords],
  )
  const [formulaStatus, setFormulaStatus] = useState('Formula R&D ready')
  const [lineDrafts, setLineDrafts] = useState<Record<string, number>>({})
  const [nestedFormulaId, setNestedFormulaId] = useState(selectableChildFormulas[0]?.id ?? '')
  const [nestedGrams, setNestedGrams] = useState(10)
  const [versionNote, setVersionNote] = useState(`Snapshot ${formula.code} ${formula.version}`)
  const [versions, setVersions] = useState<FormulaVersionRecord[]>([])

  useEffect(() => {
    setLineDrafts(Object.fromEntries(formula.lines.map((line) => [line.id, line.grams])))
    setVersionNote(`Snapshot ${formula.code} ${formula.version}`)
  }, [formula.code, formula.id, formula.lines, formula.version])

  useEffect(() => {
    if (!selectableChildFormulas.some((item) => item.id === nestedFormulaId)) {
      setNestedFormulaId(selectableChildFormulas[0]?.id ?? '')
    }
  }, [nestedFormulaId, selectableChildFormulas])

  useEffect(() => {
    let active = true
    async function loadVersions() {
      try {
        const payload = await requestApi<FormulaVersionListResponse>(
          `/formulas/${encodeURIComponent(formula.id)}/versions`,
        )
        if (!active) {
          return
        }
        setVersions(payload.versions)
        setFormulaStatus(`${formula.code} version history synced`)
      } catch {
        if (active) {
          setVersions([])
          setFormulaStatus('Formula version history unavailable until API is reachable')
        }
      }
    }
    void loadVersions()
    return () => {
      active = false
    }
  }, [formula.code, formula.id, formula.version])

  function upsertFormula(nextFormula: Formula) {
    onFormulaRecordsChange((current) => {
      const exists = current.some((item) => item.id === nextFormula.id)
      return exists
        ? current.map((item) => (item.id === nextFormula.id ? nextFormula : item))
        : [nextFormula, ...current]
    })
  }

  async function saveLine(line: FormulaLine) {
    const grams = Number(lineDrafts[line.id] ?? line.grams)
    if (!Number.isFinite(grams) || grams <= 0) {
      setFormulaStatus('Line grams must be greater than 0')
      return
    }
    try {
      const payload = await requestApi<FormulaMutationResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/lines/${encodeURIComponent(line.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grams, label: line.label }),
        },
      )
      upsertFormula(payload.formula)
      setFormulaStatus(`${line.label} saved without inventory movement`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula line update failed')
    }
  }

  async function deleteLine(line: FormulaLine) {
    try {
      const payload = await requestApi<FormulaMutationResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/lines/${encodeURIComponent(line.id)}`,
        { method: 'DELETE' },
      )
      upsertFormula(payload.formula)
      setFormulaStatus(`${line.label} removed without inventory movement`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula line delete failed')
    }
  }

  async function moveLine(line: FormulaLine, direction: 'up' | 'down') {
    try {
      const payload = await requestApi<FormulaMutationResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/lines/${encodeURIComponent(line.id)}/move`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction }),
        },
      )
      upsertFormula(payload.formula)
      setFormulaStatus(`${line.label} reordered`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula line reorder failed')
    }
  }

  async function addNestedFormulaLine() {
    const grams = Number(nestedGrams)
    if (!nestedFormulaId || !Number.isFinite(grams) || grams <= 0) {
      setFormulaStatus('Choose a child formula and grams before adding nested accord')
      return
    }
    try {
      const payload = await requestApi<FormulaMutationResponse>(`/formulas/${encodeURIComponent(formula.id)}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childFormulaId: nestedFormulaId, grams }),
      })
      upsertFormula(payload.formula)
      setNestedGrams(10)
      setFormulaStatus('Nested accord added and cycle guard passed')
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Nested formula add failed')
    }
  }

  async function snapshotVersion() {
    try {
      const payload = await requestApi<FormulaVersionResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/versions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: versionNote, actor: formula.owner }),
        },
      )
      upsertFormula(payload.formula)
      setVersions((current) => [
        payload.version,
        ...current.filter((version) => version.id !== payload.version.id),
      ])
      setFormulaStatus(`${payload.formula.code} ${payload.version.version} snapshot saved`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula snapshot failed')
    }
  }

  async function approveFormulaVersion() {
    try {
      const payload = await requestApi<FormulaVersionResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor: formula.owner }),
        },
      )
      upsertFormula(payload.formula)
      setVersions((current) =>
        current.map((version) => (version.id === payload.version.id ? payload.version : version)),
      )
      setFormulaStatus(`${payload.formula.code} ${payload.version.version} approved`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula approval failed')
    }
  }

  async function exportFormulaRecord() {
    try {
      const payload = await requestApi<FormulaExportResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/export`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor: formula.owner }),
        },
      )
      setFormulaStatus(`${payload.document.id} exported with ${payload.audit.action} audit`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula export failed')
    }
  }

  return (
    <div className="workspace-grid formula-grid">
      <Panel
        className="wide"
        title="Formula Library"
        icon={FlaskConical}
        right={
          <button className="primary-button" type="button" onClick={onNewFormula}>
            <Plus size={15} />
            New Formula
          </button>
        }
      >
        <div className="formula-library">
          {formulaRecords.map((item) => (
            <button
              className={`formula-card ${item.id === formula.id ? 'is-active' : ''}`}
              key={item.id}
              type="button"
              onClick={() => onSelectFormula(item.id)}
            >
              <div>
                <strong>{item.code}</strong>
                <span>{item.name}</span>
              </div>
              <StatusBadge status={item.status} />
              <span className="mono-value">{formatGrams(item.targetGrams)}</span>
              <span className="mono-value">{item.version}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel
        className="formula-editor"
        title={`${formula.code} ${formula.name}`}
        icon={FlaskConical}
        right={
          <div className="action-row">
            <StatusBadge status={formula.status} />
            <button className="ghost-button small" type="button" onClick={onAddLine}>
              <Plus size={14} />
              Add Line
            </button>
          </div>
        }
      >
        <div className="formula-status-row">
          <DataTag label="Version" value={formula.version} tone="blue" />
          <DataTag label="Lines" value={String(formula.lines.length)} />
          <span>{formulaStatus}</span>
        </div>
        <div className="formula-lines">
          {formula.lines.length > 0 ? (
            formula.lines.map((line, index) => (
              <div className="formula-line is-editable" key={line.id}>
                <div>
                  <strong>{line.label}</strong>
                  <span>
                    {line.childFormulaId ? 'Nested accord' : 'Raw material leaf'}
                    {line.materialId ? ` / ${materialRecords.find((material) => material.id === line.materialId)?.cas ?? 'material'}` : ''}
                  </span>
                </div>
                <label className="compact-input">
                  <span>g</span>
                  <input
                    aria-label={`${line.label} grams`}
                    min={0.01}
                    step={0.01}
                    type="number"
                    value={lineDrafts[line.id] ?? line.grams}
                    onChange={(event) =>
                      setLineDrafts((current) => ({ ...current, [line.id]: Number(event.target.value) }))
                    }
                  />
                </label>
                <div className="mono-value">{((Number(lineDrafts[line.id] ?? line.grams) / formula.targetGrams) * 100).toFixed(1)}%</div>
                <div className="line-actions">
                  <button className="ghost-button tiny" type="button" onClick={() => void moveLine(line, 'up')} disabled={index === 0}>
                    Up
                  </button>
                  <button className="ghost-button tiny" type="button" onClick={() => void moveLine(line, 'down')} disabled={index === formula.lines.length - 1}>
                    Down
                  </button>
                  <button className="ghost-button tiny" type="button" onClick={() => void saveLine(line)}>
                    Save
                  </button>
                  <button className="ghost-button tiny danger" type="button" onClick={() => void deleteLine(line)}>
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <strong>Draft created. No formula lines yet.</strong>
              <span>Use Add Line to add raw materials. Formula editing does not consume stock.</span>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Nested Accord" icon={Layers3}>
        <div className="material-form-grid">
          <label className="field-row">
            <span>Child formula</span>
            <select
              aria-label="Nested child formula"
              value={nestedFormulaId}
              onChange={(event) => setNestedFormulaId(event.target.value)}
            >
              {selectableChildFormulas.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.code} / {child.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Nested grams</span>
            <input
              aria-label="Nested formula grams"
              min={0.01}
              step={0.01}
              type="number"
              value={nestedGrams}
              onChange={(event) => setNestedGrams(Number(event.target.value))}
            />
          </label>
          <button className="primary-button" type="button" onClick={() => void addNestedFormulaLine()} disabled={!nestedFormulaId}>
            Add Nested
          </button>
        </div>
        <ul className="policy-list">
          <li>Cycle guard blocks parent-child loops before saving.</li>
          <li>Nested save recalculates resolve and cost but creates no stock movement.</li>
        </ul>
      </Panel>

      <Panel title="Resolved Leaves" icon={Layers3}>
        <div className="resolved-table">
          {activeLeaves.length > 0 ? (
            activeLeaves.map((leaf) => (
              <button className="resolved-row" key={leaf.materialId} type="button" onClick={() => onSelectMaterial(leaf.materialId)}>
                <div>
                  <strong>{leaf.materialName}</strong>
                  <span>{leaf.sourcePath}</span>
                </div>
                <span className="mono-value">{leaf.effectivePercent.toFixed(2)}%</span>
                <span className="mono-value">{formatCurrency(leaf.cost)}</span>
              </button>
            ))
          ) : (
            <div className="empty-state">
              <strong>No resolved leaves yet.</strong>
              <span>Create ingredients in the formula editor before cost and IFRA rollups run.</span>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Cost Roll-up" icon={BadgeDollarSign}>
        <div className="metric-grid">
          <Metric label="Target" value={formatGrams(formula.targetGrams)} />
          <Metric label="Resolved grams" value={formatGrams(activeTotals.totalGrams)} />
          <Metric label="Formula cost" value={formatCurrency(activeTotals.totalCost)} />
          <Metric label="Cost / gram" value={formatCurrency(activeTotals.costPerGram)} />
        </div>
      </Panel>

      <Panel className="wide" title="Version, Approval, Export" icon={FileLock2}>
        <div className="material-form-grid">
          <label className="field-row wide-field">
            <span>Snapshot note</span>
            <input
              aria-label="Formula version note"
              value={versionNote}
              onChange={(event) => setVersionNote(event.target.value)}
            />
          </label>
          <button className="primary-button" type="button" onClick={() => void snapshotVersion()} disabled={formula.lines.length === 0}>
            Snapshot Version
          </button>
          <button className="ghost-button" type="button" onClick={() => void approveFormulaVersion()}>
            Approve Formula
          </button>
          <button className="ghost-button" type="button" onClick={() => void exportFormulaRecord()} disabled={formula.lines.length === 0}>
            Export + Audit
          </button>
        </div>
        <div className="version-list">
          {versions.length > 0 ? (
            versions.map((version) => (
              <div className="version-row" key={version.id}>
                <div>
                  <strong>{version.formulaCode} {version.version}</strong>
                  <span>{version.note}</span>
                </div>
                <StatusBadge status={version.status === 'APPROVED' ? 'stable' : 'review'} label={version.status} />
                <span className="mono-value">{formatGrams(version.totalGrams)}</span>
                <span className="mono-value">{formatCurrency(version.totalCost)}</span>
                <span className="mono-value">{version.checksum}</span>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <strong>No version snapshots loaded.</strong>
              <span>Create a snapshot before approval/export evidence review.</span>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Evaporation Curve" icon={Activity}>
        {activeLeaves.length > 0 ? (
          <>
            <EvaporationChart curve={activeCurve} />
            <p className="caveat">Raoult ideal-mix. Directional model, not lab-measured perception.</p>
          </>
        ) : (
          <div className="empty-state">
            <strong>Curve waits for resolved ingredients.</strong>
            <span>The volatility model will activate after the draft has material lines.</span>
          </div>
        )}
      </Panel>
    </div>
  )
}

function InventoryWorkspace({
  lots,
  movements,
  storageLocations,
  stock,
  materialRecords,
  onLotsChange,
  onMovementsChange,
  onStorageLocationsChange,
  onReceiveStock,
  onAdjustStock,
  onTransferStock,
}: {
  lots: InventoryLot[]
  movements: InventoryMovement[]
  storageLocations: StorageLocation[]
  stock: ReturnType<typeof stockSummary>
  materialRecords: Material[]
  onLotsChange: Dispatch<SetStateAction<InventoryLot[]>>
  onMovementsChange: Dispatch<SetStateAction<InventoryMovement[]>>
  onStorageLocationsChange: Dispatch<SetStateAction<StorageLocation[]>>
  onReceiveStock: () => void
  onAdjustStock: () => void
  onTransferStock: () => void
}) {
  const [selectedLotId, setSelectedLotId] = useState(lots[0]?.id ?? '')
  const [qualityStatus, setQualityStatus] = useState<LotQualityStatus>('APPROVED')
  const [qualityReason, setQualityReason] = useState('QC release review')
  const [stockTakeCount, setStockTakeCount] = useState(0)
  const [stockTakeReason, setStockTakeReason] = useState('Cycle count reconciliation')
  const [stockTakeRecords, setStockTakeRecords] = useState<StockTakeRecord[]>([])
  const [labelPayload, setLabelPayload] = useState<LotLabelPayload | null>(null)
  const [genealogy, setGenealogy] = useState<LotGenealogyResponse | null>(null)
  const [reorderSuggestions, setReorderSuggestions] = useState<InventoryReorderSuggestion[]>([])
  const [newLocationName, setNewLocationName] = useState('Retest Bin 1')
  const [newLocationZone, setNewLocationZone] = useState('Quality')
  const [newLocationCapacity, setNewLocationCapacity] = useState(600)
  const [inventoryStatus, setInventoryStatus] = useState('Phase 6 console ready')
  const selectedLot = lots.find((lot) => lot.id === selectedLotId) ?? lots[0]
  const selectedMaterial = selectedLot ? materialRecords.find((material) => material.id === selectedLot.materialId) : undefined
  const selectedLocation = selectedLot ? storageLocations.find((location) => location.name === selectedLot.location) : undefined

  useEffect(() => {
    if (lots.length === 0) {
      setSelectedLotId('')
      return
    }
    if (!selectedLotId || !lots.some((lot) => lot.id === selectedLotId)) {
      setSelectedLotId(lots[0]?.id ?? '')
    }
  }, [lots, selectedLotId])

  useEffect(() => {
    if (!selectedLot) {
      return
    }
    setQualityStatus(selectedLot.qualityStatus)
    setStockTakeCount(Number(selectedLot.quantityGrams.toFixed(3)))
  }, [selectedLot])

  useEffect(() => {
    let active = true
    requestApi<InventoryConsoleResponse>('/inventory/console')
      .then((payload) => {
        if (!active) {
          return
        }
        onLotsChange(payload.lots)
        onMovementsChange(payload.movements)
        onStorageLocationsChange(payload.locations)
        setStockTakeRecords(payload.stockTakes)
        setReorderSuggestions(payload.reorderSuggestions)
        setInventoryStatus('Inventory console synced with API')
      })
      .catch(() => {
        if (active) {
          setInventoryStatus('API sync unavailable, showing local seed data')
        }
      })
    return () => {
      active = false
    }
  }, [onLotsChange, onMovementsChange, onStorageLocationsChange])

  function upsertLot(lot: InventoryLot) {
    onLotsChange((current) => current.map((item) => (item.id === lot.id ? lot : item)))
  }

  function prependMovement(movement?: InventoryMovement) {
    if (!movement) {
      return
    }
    onMovementsChange((current) => [movement, ...current.filter((item) => item.id !== movement.id)])
  }

  async function updateLotQuality() {
    if (!selectedLot) {
      return
    }
    try {
      const payload = await requestApi<LotQualityResponse>(`/lots/${encodeURIComponent(selectedLot.id)}/quality`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qualityStatus, reason: qualityReason }),
      })
      upsertLot(payload.lot)
      setInventoryStatus(`${payload.lot.lotNumber} moved to ${payload.lot.qualityStatus} with no stock movement`)
    } catch (error) {
      setInventoryStatus(error instanceof Error ? error.message : 'QC status update failed')
    }
  }

  async function reconcileStockTake() {
    if (!selectedLot) {
      return
    }
    try {
      const payload = await requestApi<StockTakeResponse>('/inventory/stock-takes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lotId: selectedLot.id,
          countedGrams: stockTakeCount,
          reason: stockTakeReason,
          actor: 'Inventory Manager',
        }),
      })
      upsertLot(payload.lot)
      prependMovement(payload.movement)
      setStockTakeRecords((current) => [payload.stockTake, ...current.filter((item) => item.id !== payload.stockTake.id)])
      setInventoryStatus(payload.invariant)
    } catch (error) {
      setInventoryStatus(error instanceof Error ? error.message : 'Stock take failed')
    }
  }

  async function createLocation() {
    try {
      const payload = await requestApi<StorageLocationCreateResponse>('/storage-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newLocationName,
          zone: newLocationZone,
          condition: 'Retest hold / controlled ambient',
          capacityGrams: newLocationCapacity,
          kind: 'Bin',
          light: 'Amber',
          temperatureRange: '18-22C',
        }),
      })
      onStorageLocationsChange((current) => [payload.location, ...current.filter((item) => item.id !== payload.location.id)])
      setNewLocationName(`Retest Bin ${storageLocations.length + 1}`)
      setInventoryStatus(payload.invariant)
    } catch (error) {
      setInventoryStatus(error instanceof Error ? error.message : 'Location create failed')
    }
  }

  async function printLotLabel() {
    if (!selectedLot) {
      return
    }
    try {
      const payload = await requestApi<LotLabelResponse>(`/lots/${encodeURIComponent(selectedLot.id)}/label`, {
        method: 'POST',
      })
      setLabelPayload(payload.label)
      setInventoryStatus(payload.invariant)
    } catch (error) {
      setInventoryStatus(error instanceof Error ? error.message : 'Label generation failed')
    }
  }

  async function loadLotGenealogy() {
    if (!selectedLot) {
      return
    }
    try {
      const payload = await requestApi<LotGenealogyResponse>(`/lots/${encodeURIComponent(selectedLot.id)}/genealogy`)
      setGenealogy(payload)
      setInventoryStatus(payload.invariant)
    } catch (error) {
      setInventoryStatus(error instanceof Error ? error.message : 'Genealogy lookup failed')
    }
  }

  async function generateShoppingList() {
    try {
      const payload = await requestApi<InventoryReorderResponse>('/inventory/reorder-suggestions')
      setReorderSuggestions(payload.suggestions)
      setInventoryStatus(payload.invariant)
    } catch (error) {
      setInventoryStatus(error instanceof Error ? error.message : 'Shopping list generation failed')
    }
  }

  return (
    <div className="workspace-grid inventory-grid">
      <Panel
        title="Stock Summary"
        icon={Boxes}
        right={
          <div className="action-row">
            <button className="primary-button" type="button" onClick={onReceiveStock}>
              <Plus size={15} />
              Create New
            </button>
            <button className="ghost-button small" type="button" onClick={onAdjustStock}>
              Adjust Stock
            </button>
            <button className="ghost-button small" type="button" onClick={onTransferStock}>
              Transfer Lot
            </button>
          </div>
        }
      >
        <div className="stock-grid">
          {stock.map((item) => (
            <div className="stock-card" key={item.material.id}>
              <div>
                <strong>{item.material.name}</strong>
                <span>{item.material.family}</span>
              </div>
              <div className="mono-value">{formatGrams(item.available)}</div>
              <span>current {formatGrams(item.current)} / reserved {formatGrams(item.reserved)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Inventory Operations" icon={ClipboardCheck} right={<DataTag label="Status" value={inventoryStatus} tone="blue" />}>
        {selectedLot ? (
          <div className="inventory-ops">
            <label className="field-row wide-field">
              <span>Active lot</span>
              <select
                aria-label="Inventory active lot"
                value={selectedLot.id}
                onChange={(event) => setSelectedLotId(event.target.value)}
              >
                {lots.map((lot) => {
                  const material = materialRecords.find((item) => item.id === lot.materialId)
                  return (
                    <option key={lot.id} value={lot.id}>
                      {lot.lotNumber} / {material?.name ?? lot.materialId} / {lot.qualityStatus}
                    </option>
                  )
                })}
              </select>
            </label>
            <div className="lot-detail-card">
              <div>
                <strong>{selectedLot.lotNumber}</strong>
                <span>{selectedMaterial?.name ?? selectedLot.materialId}</span>
              </div>
              <DataTag label="Qty" value={formatGrams(selectedLot.quantityGrams)} />
              <DataTag label="Reserved" value={formatGrams(selectedLot.reservedGrams)} />
              <DataTag label="Expiry" value={selectedLot.expiryDate} tone="amber" />
              <DataTag label="Location" value={selectedLot.location} tone="blue" />
              <DataTag label="Supplier" value={selectedLot.supplierLotRef ?? 'Not set'} />
              <DataTag label="Retest" value={selectedLot.retestDate ?? 'Not set'} />
            </div>

            <div className="inventory-form-grid">
              <label className="field-row">
                <span>QC status</span>
                <select
                  aria-label="Lot quality status"
                  value={qualityStatus}
                  onChange={(event) => setQualityStatus(event.target.value as LotQualityStatus)}
                >
                  <option value="APPROVED">APPROVED - eligible</option>
                  <option value="QUARANTINE">QUARANTINE - receiving hold</option>
                  <option value="ON_HOLD">ON_HOLD - retest</option>
                  <option value="REJECTED">REJECTED - blocked</option>
                  <option value="EXPIRED">EXPIRED - blocked</option>
                </select>
              </label>
              <label className="field-row">
                <span>QC reason</span>
                <input
                  aria-label="Lot quality reason"
                  value={qualityReason}
                  onChange={(event) => setQualityReason(event.target.value)}
                />
              </label>
              <button className="primary-button" type="button" onClick={() => void updateLotQuality()}>
                Update QC
              </button>
            </div>

            <div className="inventory-form-grid">
              <label className="field-row">
                <span>Counted grams</span>
                <input
                  aria-label="Stock take counted grams"
                  min={0}
                  step={0.1}
                  type="number"
                  value={stockTakeCount}
                  onChange={(event) => setStockTakeCount(Number(event.target.value))}
                />
              </label>
              <label className="field-row">
                <span>Count reason</span>
                <input
                  aria-label="Stock take reason"
                  value={stockTakeReason}
                  onChange={(event) => setStockTakeReason(event.target.value)}
                />
              </label>
              <button className="primary-button" type="button" onClick={() => void reconcileStockTake()}>
                Stock Take
              </button>
            </div>

            <div className="action-row">
              <button className="ghost-button small" type="button" onClick={() => void printLotLabel()}>
                Print QR Label
              </button>
              <button className="ghost-button small" type="button" onClick={() => void loadLotGenealogy()}>
                View Genealogy
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-state">No inventory lots are available yet.</div>
        )}
      </Panel>

      <Panel title="Storage Locations" icon={PackageSearch}>
        <div className="inventory-form-grid">
          <label className="field-row">
            <span>New location</span>
            <input
              aria-label="New storage location name"
              value={newLocationName}
              onChange={(event) => setNewLocationName(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Zone</span>
            <input
              aria-label="New storage location zone"
              value={newLocationZone}
              onChange={(event) => setNewLocationZone(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Capacity grams</span>
            <input
              aria-label="New storage location capacity"
              min={1}
              type="number"
              value={newLocationCapacity}
              onChange={(event) => setNewLocationCapacity(Number(event.target.value))}
            />
          </label>
          <button className="primary-button" type="button" onClick={() => void createLocation()} disabled={!newLocationName.trim() || newLocationCapacity <= 0}>
            New Location
          </button>
        </div>
        <div className="material-list">
          {storageLocations.slice(0, 8).map((location) => {
            const storedGrams = lots
              .filter((lot) => lot.location === location.name)
              .reduce((sum, lot) => sum + lot.quantityGrams, 0)
            return (
              <div className="material-row static" key={location.id}>
                <div>
                  <strong>{location.name}</strong>
                  <span>{location.zone} / {location.kind ?? 'Location'} / {location.condition}</span>
                </div>
                <div className="mono-value">{formatGrams(storedGrams)}</div>
                <StatusBadge status={location.status === 'IN_TRANSIT' ? 'review' : 'stable'} label={location.status ?? 'ACTIVE'} />
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel title="Labels, Genealogy & Shopping List" icon={ShoppingCart}>
        <div className="action-row">
          <button className="primary-button" type="button" onClick={() => void generateShoppingList()}>
            Generate Shopping List
          </button>
          {selectedLocation && <DataTag label="Storage" value={selectedLocation.condition} tone="blue" />}
        </div>
        {labelPayload && (
          <div className="label-preview-card">
            <strong>{labelPayload.materialName}</strong>
            <span>{labelPayload.lotNumber} / {labelPayload.storageText}</span>
            <code>{labelPayload.qrValue}</code>
          </div>
        )}
        {genealogy && (
          <div className="genealogy-list">
            <div className="genealogy-row">
              <strong>{genealogy.material.name}</strong>
              <span>{genealogy.eligibility} / aging {genealogy.agingDays}d</span>
            </div>
            <div className="genealogy-row">
              <strong>Ledger events</strong>
              <span>{genealogy.movements.length} movement(s), {genealogy.documents.length} document(s)</span>
            </div>
            {genealogy.downstreamRefs.slice(0, 3).map((ref) => (
              <div className="genealogy-row" key={`${ref.ref}-${ref.at}`}>
                <strong>{ref.type}</strong>
                <span>{ref.ref} / {formatGrams(ref.quantityGrams)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="shopping-list">
          {reorderSuggestions.length === 0 ? (
            <div className="empty-state compact">No reorder suggestions generated yet.</div>
          ) : (
            reorderSuggestions.slice(0, 5).map((suggestion) => (
              <div className="shopping-row" key={suggestion.materialId}>
                <div>
                  <strong>{suggestion.materialName}</strong>
                  <span>{suggestion.reason}</span>
                </div>
                <span className="mono-value">{formatGrams(suggestion.suggestedOrderGrams)}</span>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel
        className="wide"
        title="Lots"
        icon={PackageCheck}
        right={
          <div className="action-row">
            <button className="ghost-button small" type="button" onClick={onReceiveStock}>
              Receive Stock
            </button>
            <button className="ghost-button small" type="button" onClick={onAdjustStock}>
              Adjust
            </button>
            <button className="ghost-button small" type="button" onClick={onTransferStock}>
              Transfer
            </button>
          </div>
        }
      >
        <div className="lot-table">
          {lots.map((lot) => {
            const material = materialRecords.find((item) => item.id === lot.materialId)
            return (
              <div className="lot-row" key={lot.id}>
                <div>
                  <strong>{lot.lotNumber}</strong>
                  <span>{material?.name} / {lot.location}</span>
                </div>
                <StatusBadge status={lot.qualityStatus === 'APPROVED' ? 'stable' : 'review'} label={lot.qualityStatus} />
                <span className="mono-value">{formatGrams(lot.quantityGrams)}</span>
                <span className="mono-value">reserved {formatGrams(lot.reservedGrams)}</span>
                <span className="mono-value">{lot.expiryDate}</span>
                <button className="ghost-button tiny" type="button" onClick={() => setSelectedLotId(lot.id)}>
                  Select
                </button>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel className="wide" title="Stock Take Evidence" icon={ClipboardCheck}>
        <div className="movement-table">
          {stockTakeRecords.length === 0 ? (
            <div className="empty-state">No stock take records synced yet.</div>
          ) : (
            stockTakeRecords.slice(0, 5).map((record) => (
              <div className="movement-row" key={record.id}>
                <span className="mono-value">{record.id}</span>
                <div>
                  <strong>{record.lotNumber}</strong>
                  <span>{record.reason}</span>
                </div>
                <StatusBadge status={record.status === 'MATCHED' ? 'stable' : 'review'} label={record.status} />
                <span className="mono-value">expected {formatGrams(record.expectedGrams)}</span>
                <span className="mono-value">counted {formatGrams(record.countedGrams)}</span>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel className="wide" title="Immutable Movement Ledger" icon={Database}>
        <MovementTable movements={movements} materialRecords={materialRecords} />
      </Panel>
    </div>
  )
}

function LabUsageWorkspace({
  labPlan,
  batchGrams,
  setBatchGrams,
  usageHistory,
  weighingSession,
  actualWeights,
  onActualWeightChange,
  weighingTolerancePercent,
  setWeighingTolerancePercent,
  weighingOperator,
  setWeighingOperator,
  labUsagePurpose,
  setLabUsagePurpose,
  labUsageProjectCode,
  setLabUsageProjectCode,
  labUsageSampleCode,
  setLabUsageSampleCode,
  statusMessage,
  busy,
  weighingReady,
  onUseTargetWeights,
  onCommit,
  onReverse,
}: {
  labPlan: ReturnType<typeof planLabUsage>
  batchGrams: number
  setBatchGrams: (value: number) => void
  usageHistory: UsageRecord[]
  weighingSession: LabWeighingSession
  actualWeights: Record<string, number>
  onActualWeightChange: (key: string, value: number) => void
  weighingTolerancePercent: number
  setWeighingTolerancePercent: (value: number) => void
  weighingOperator: string
  setWeighingOperator: (value: string) => void
  labUsagePurpose: LabUsagePurpose
  setLabUsagePurpose: (value: LabUsagePurpose) => void
  labUsageProjectCode: string
  setLabUsageProjectCode: (value: string) => void
  labUsageSampleCode: string
  setLabUsageSampleCode: (value: string) => void
  statusMessage: string
  busy: boolean
  weighingReady: boolean
  onUseTargetWeights: () => void
  onCommit: () => void
  onReverse: () => void
}) {
  const latestCommitted = usageHistory.find((usage) => usage.status === 'COMMITTED')
  const actualTotal = weighingSession.lines.reduce((sum, line) => sum + line.actualGrams, 0)
  const maxDeviation = weighingSession.lines.reduce((max, line) => Math.max(max, line.deviationPercent), 0)
  return (
    <div className="workspace-grid lab-grid">
      <Panel
        title="Commit Preview"
        icon={ClipboardCheck}
        right={<DataTag label="Formula" value={weighingSession.formulaCode} />}
      >
        <label className="slider-row">
          <span>Trial batch grams</span>
          <input
            min={5}
            max={40}
            step={0.5}
            type="range"
            value={batchGrams}
            onChange={(event) => setBatchGrams(Number(event.target.value))}
          />
          <strong className="mono-value">{formatGrams(batchGrams)}</strong>
        </label>
        <UsagePreview allocations={labPlan.allocations} shortfalls={labPlan.shortfalls} />
        <div className="empty-state compact">{statusMessage}</div>
        <div className="action-row">
          <button className="primary-button" type="button" onClick={onCommit} disabled={!weighingReady || busy}>
            <Play size={16} />
            {busy ? 'Working' : 'Commit Actual Usage'}
          </button>
          <button className="ghost-button" type="button" onClick={onReverse} disabled={!latestCommitted || busy}>
            <RotateCcw size={16} />
            Reverse latest
          </button>
        </div>
      </Panel>

      <Panel
        title="Actual Weighing Session"
        icon={Beaker}
        right={
          <StatusBadge
            status={weighingSession.status === 'READY' ? 'stable' : 'review'}
            label={weighingSession.status}
          />
        }
      >
        <div className="weighing-controls">
          <label className="field-row">
            <span>Operator</span>
            <input
              aria-label="Weighing operator"
              value={weighingOperator}
              onChange={(event) => setWeighingOperator(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Tolerance %</span>
            <input
              aria-label="Weighing tolerance percent"
              min={0}
              step={0.1}
              type="number"
              value={weighingTolerancePercent}
              onChange={(event) => setWeighingTolerancePercent(Number(event.target.value))}
            />
          </label>
          <button className="ghost-button small" type="button" onClick={onUseTargetWeights}>
            Use target weights
          </button>
        </div>
        <div className="form-grid">
          <label className="field-row">
            <span>Purpose</span>
            <select
              aria-label="Lab usage purpose"
              value={labUsagePurpose}
              onChange={(event) => setLabUsagePurpose(event.target.value as LabUsagePurpose)}
            >
              <option value="trial">Trial</option>
              <option value="sample">Sample</option>
              <option value="production-prep">Production prep</option>
              <option value="qc">QC</option>
              <option value="waste">Waste</option>
            </select>
          </label>
          <label className="field-row">
            <span>Project code</span>
            <input
              aria-label="Lab usage project code"
              value={labUsageProjectCode}
              onChange={(event) => setLabUsageProjectCode(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Sample code</span>
            <input
              aria-label="Lab usage sample code"
              value={labUsageSampleCode}
              onChange={(event) => setLabUsageSampleCode(event.target.value)}
            />
          </label>
        </div>

        <div className="weighing-table">
          {weighingSession.lines.length === 0 ? (
            <div className="empty-state">No eligible allocations to weigh yet.</div>
          ) : (
            weighingSession.lines.map((line) => {
              const key = allocationKey(line)
              return (
                <label className="weighing-row" key={key}>
                  <div>
                    <strong>{line.materialName}</strong>
                    <span>
                      {line.lotNumber} / target {formatGrams(line.targetGrams)}
                    </span>
                  </div>
                  <input
                    aria-label={`Actual grams for ${line.materialName} ${line.lotNumber}`}
                    min={0}
                    step={0.001}
                    type="number"
                    value={actualWeights[key] ?? line.actualGrams}
                    onChange={(event) => onActualWeightChange(key, Number(event.target.value))}
                  />
                  <span className={`deviation-pill ${line.withinTolerance ? 'is-ok' : 'is-alert'}`}>
                    {line.deviationPercent.toFixed(2)}%
                  </span>
                </label>
              )
            })
          )}
        </div>

        <div className="weighing-summary">
          <DataTag label="Actual total" value={formatGrams(actualTotal)} tone="blue" />
          <DataTag label="Max deviation" value={`${maxDeviation.toFixed(2)}%`} tone={weighingReady ? 'green' : 'amber'} />
        </div>
      </Panel>

      <Panel title="Usage History" icon={Activity}>
        <div className="history-list">
          {usageHistory.length === 0 ? (
            <div className="empty-state">No lab usage committed in this session.</div>
          ) : (
            usageHistory.map((usage) => (
              <div className="history-row" key={usage.id}>
                <div>
                  <strong>{usage.id}</strong>
                  <span>
                    {usage.formulaCode} / {formatGrams(usage.batchGrams)}
                    {usage.purpose ? ` / ${usage.purpose}` : ''}
                    {usage.sampleCode ? ` / ${usage.sampleCode}` : ''}
                    {usage.weighingSession
                      ? ` / actual ${formatGrams(
                          usage.weighingSession.lines.reduce((sum, line) => sum + line.actualGrams, 0),
                        )}`
                      : ''}
                  </span>
                </div>
                <StatusBadge status={usage.status === 'COMMITTED' ? 'stable' : 'review'} label={usage.status} />
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  )
}

function DocumentsWorkspace() {
  const [documentRows, setDocumentRows] = useState<DocumentRecord[]>(documents)
  const [downloadAudits, setDownloadAudits] = useState<AuditEvent[]>(
    auditEvents.filter((event) => event.action === 'document.download'),
  )
  const [downloadResult, setDownloadResult] = useState<DocumentDownloadResponse | null>(null)
  const [loadingDocumentId, setLoadingDocumentId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('Live API sync pending')

  useEffect(() => {
    const controller = new AbortController()

    async function loadDocuments() {
      try {
        const [documentsResponse, auditResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/documents`, { signal: controller.signal }),
          fetch(`${apiBaseUrl}/documents/download-audit`, { signal: controller.signal }),
        ])

        if (!documentsResponse.ok || !auditResponse.ok) {
          throw new Error('Documents API returned a non-OK response')
        }

        const documentsPayload = (await documentsResponse.json()) as ApiEnvelope<DocumentRecord[]>
        const auditPayload = (await auditResponse.json()) as ApiEnvelope<AuditEvent[]>

        setDocumentRows(documentsPayload.data)
        setDownloadAudits(auditPayload.data)
        setStatusMessage('Synced from live Documents API')
      } catch {
        if (!controller.signal.aborted) {
          setStatusMessage('Using local seed until Documents API is reachable')
        }
      }
    }

    void loadDocuments()

    return () => controller.abort()
  }, [])

  async function requestSignedUrl(documentId: string) {
    setLoadingDocumentId(documentId)
    setStatusMessage('Checking permission before signing URL')

    try {
      const response = await fetch(`${apiBaseUrl}/documents/${documentId}/signed-url`, { method: 'POST' })
      if (!response.ok) {
        throw new Error('Signed URL request was blocked')
      }

      const payload = (await response.json()) as ApiEnvelope<DocumentDownloadResponse>
      setDocumentRows((current) =>
        current.map((document) => (document.id === documentId ? payload.data.document : document)),
      )
      setDownloadAudits((current) => [payload.data.audit, ...current.filter((event) => event.id !== payload.data.audit.id)])
      setDownloadResult(payload.data)
      setStatusMessage('Signed URL issued and download audit recorded')
    } catch {
      setStatusMessage('Could not sign URL from API; permission gate or server unavailable')
    } finally {
      setLoadingDocumentId(null)
    }
  }

  return (
    <div className="workspace-grid documents-grid">
      <Panel title="Document Center" icon={FileLock2}>
        <div className="document-list">
          {documentRows.map((document) => (
            <div className="document-row" key={document.id}>
              <span className="mono-value">{document.id}</span>
              <div>
                <strong>{document.title}</strong>
                <span>
                  {document.type} / {document.linkedTo} / {document.sizeKb}KB
                </span>
              </div>
              <DataTag label={document.sensitivity} value={document.version} />
              <span className="mono-value">{document.downloads} downloads</span>
              <button
                className="ghost-button small"
                type="button"
                onClick={() => void requestSignedUrl(document.id)}
                disabled={loadingDocumentId === document.id}
              >
                <KeyRound size={14} />
                {loadingDocumentId === document.id ? 'Signing' : 'Sign URL'}
              </button>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Signed Access" icon={KeyRound}>
        {downloadResult ? (
          <div className="signed-card">
            <div>
              <span className="mono-small">{downloadResult.document.id}</span>
              <strong>{downloadResult.document.title}</strong>
              <span>{downloadResult.invariant}</span>
            </div>
            <div className="signed-url">{downloadResult.signedUrl.url}</div>
            <div className="tag-row">
              <DataTag label="TTL" value={`${downloadResult.signedUrl.ttlSeconds}s`} tone="blue" />
              <DataTag label="Expires" value={new Date(downloadResult.signedUrl.expiresAt).toLocaleTimeString()} />
              <DataTag label="Audit" value={downloadResult.audit.requestId} tone="green" />
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <strong>No signed URL yet</strong>
            <span>Select a document to create a short-lived tenant-scoped access URL.</span>
          </div>
        )}
      </Panel>
      <Panel title="Download Policy" icon={ShieldCheck}>
        <div className="policy-list">
          <li>{statusMessage}</li>
          <li>Private bucket only, no public object URL</li>
          <li>Signed URL created after permission check</li>
          <li>Formula exports are Highly Confidential</li>
          <li>DownloadAuditLog records actor, IP, requestId</li>
        </div>
      </Panel>
      <Panel title="Download Audit" icon={ClipboardCheck}>
        <AuditList events={downloadAudits.slice(0, 4)} />
      </Panel>
    </div>
  )
}

function CostingWorkspace({
  totals,
  stock,
}: {
  totals: ReturnType<typeof formulaTotals>
  stock: ReturnType<typeof stockSummary>
}) {
  const valuation = stock.reduce((sum, item) => sum + item.current * item.material.costPerGram, 0)
  return (
    <div className="workspace-grid two-one">
      <Panel title="Cost Trace" icon={BadgeDollarSign}>
        <div className="metric-grid">
          <Metric label="FRM-0421 / 100g" value={formatCurrency(totals.totalCost)} />
          <Metric label="Cost / gram" value={formatCurrency(totals.costPerGram)} />
          <Metric label="50g bottle" value={formatCurrency(totals.costPerBottle)} />
          <Metric label="Inventory valuation" value={formatCurrency(valuation)} />
        </div>
      </Panel>
      <Panel title="Finance Guardrails" icon={ShieldCheck}>
        <ul className="policy-list">
          <li>Margin hidden from perfumer role by feature flag</li>
          <li>Formula ratio requires formulas.viewSensitive</li>
          <li>Cost snapshots are point-in-time sources</li>
        </ul>
      </Panel>
    </div>
  )
}

function AnalyticsWorkspace({
  curve,
  stock,
}: {
  curve: ReturnType<typeof evaporationCurve>
  stock: ReturnType<typeof stockSummary>
}) {
  const lowStock = stock
    .filter((item) => item.available < 50)
    .sort((a, b) => a.available - b.available)
    .slice(0, 4)
  return (
    <div className="workspace-grid two-one">
      <Panel title="Read-only Intelligence" icon={BarChart3}>
        <EvaporationChart curve={curve} />
      </Panel>
      <Panel title="Low Stock Forecast" icon={Gauge}>
        <div className="material-list">
          {lowStock.map((item) => (
            <div className="material-row static" key={item.material.id}>
              <div>
                <strong>{item.material.name}</strong>
                <span>Suggested PO if burn rate holds</span>
              </div>
              <div className="mono-value">{formatGrams(item.available)}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function GenericDomainWorkspace({
  domain,
  onOpenModal,
}: {
  domain: DomainModule
  onOpenModal: (modal: ModalKind) => void
}) {
  return (
    <div className="workspace-grid generic-grid">
      <Panel title="Feature Set" icon={Layers3}>
        <CardList items={domain.features} />
      </Panel>
      <Panel title="Entities" icon={Database}>
        <CardList items={domain.entities} mono />
      </Panel>
      <Panel title="Invariants" icon={ShieldCheck}>
        <CardList items={domain.invariants} />
      </Panel>
      <Panel title="API Surface" icon={Command}>
        <CardList items={domain.apis} mono />
      </Panel>
      <Panel title="Records" icon={Activity} className="wide">
        <div className="record-grid">
          {records[domain.key].map((record) => (
            <div className="record-card" key={record.id}>
              <div>
                <span className="mono-small">{record.id}</span>
                <strong>{record.label}</strong>
                <span>{record.owner}</span>
              </div>
              <StatusBadge status={record.status} />
              <span className="mono-value">{record.amount}</span>
            </div>
          ))}
        </div>
        <div className="action-row">
          <button className="ghost-button" type="button" onClick={() => onOpenModal('auditExport')}>
            Audit this module
          </button>
          {(domain.key === 'identity' || domain.key === 'saas') && (
            <button className="primary-button" type="button" onClick={() => onOpenModal('ssoPolicy')}>
              <ShieldCheck size={16} />
              Security policy
            </button>
          )}
        </div>
      </Panel>
    </div>
  )
}

function buildCustomizationFallback(): CustomizationConsoleResponse {
  return {
    settings: { ...tenantSettings },
    featureFlags: featureFlags.map((flag) => ({ ...flag })),
    numberingSequences: numberingSequences.map((sequence) => ({ ...sequence })),
    customFields: customFields.map((field) => ({ ...field, options: [...field.options] })),
    branding: { ...brandingConfig },
    audit: auditEvents.filter((event) => event.action.startsWith('customization.')).slice(0, 8),
    invariant: 'local customization seed fallback',
  }
}

function fieldStatus(status: CustomFieldDefinition['status']): DomainStatus {
  return status === 'ACTIVE' ? 'stable' : 'draft'
}

function CustomizationWorkspace() {
  const fallbackCustomization = useMemo(buildCustomizationFallback, [])
  const initialSequence = fallbackCustomization.numberingSequences[0]!
  const [customizationData, setCustomizationData] = useState<CustomizationConsoleResponse>(fallbackCustomization)
  const [customizationStatus, setCustomizationStatus] = useState('Loading customization console')
  const [settingsDraft, setSettingsDraft] = useState<TenantSettingsRecord>(fallbackCustomization.settings)
  const [brandingDraft, setBrandingDraft] = useState<BrandingConfig>(fallbackCustomization.branding)
  const [selectedSequenceKey, setSelectedSequenceKey] = useState(initialSequence.key)
  const [sequenceDraft, setSequenceDraft] = useState<NumberingSequenceRecord>(initialSequence)
  const [sequencePreview, setSequencePreview] = useState(formatSequenceValue(initialSequence))
  const [fieldEntity, setFieldEntity] = useState<CustomFieldDefinition['entity']>('material')
  const [fieldType, setFieldType] = useState<CustomFieldDefinition['fieldType']>('text')
  const [fieldLabel, setFieldLabel] = useState('Regulatory review code')
  const [fieldKey, setFieldKey] = useState('regulatoryReviewCode')
  const [fieldRequired, setFieldRequired] = useState(false)
  const [fieldOptions, setFieldOptions] = useState('citrus, floral, woody')

  const syncCustomizationData = useCallback((next: CustomizationConsoleResponse, nextStatus: string) => {
    setCustomizationData(next)
    setSettingsDraft(next.settings)
    setBrandingDraft(next.branding)
    const nextSequence =
      next.numberingSequences.find((sequence) => sequence.key === selectedSequenceKey) ?? next.numberingSequences[0]
    if (nextSequence) {
      setSelectedSequenceKey(nextSequence.key)
      setSequenceDraft(nextSequence)
      setSequencePreview(formatSequenceValue(nextSequence))
    }
    setCustomizationStatus(nextStatus)
  }, [selectedSequenceKey])

  const refreshCustomizationConsole = useCallback(async (nextStatus = 'Customization console synced from API') => {
    try {
      const response = await fetch(`${apiBaseUrl}/customization-console`)
      if (!response.ok) {
        throw new Error('Customization console API failed')
      }
      const payload = (await response.json()) as ApiEnvelope<CustomizationConsoleResponse>
      syncCustomizationData(payload.data, nextStatus)
    } catch {
      setCustomizationStatus('Using local customization seed until API is reachable')
    }
  }, [syncCustomizationData])

  useEffect(() => {
    void refreshCustomizationConsole()
  }, [refreshCustomizationConsole])

  function selectSequence(key: string) {
    const nextSequence = customizationData.numberingSequences.find((sequence) => sequence.key === key)
    if (!nextSequence) {
      return
    }
    setSelectedSequenceKey(nextSequence.key)
    setSequenceDraft(nextSequence)
    setSequencePreview(formatSequenceValue(nextSequence))
  }

  function addAudit(current: AuditEvent[], audit: AuditEvent) {
    return [audit, ...current].slice(0, 8)
  }

  async function saveSettings() {
    try {
      const response = await fetch(`${apiBaseUrl}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settingsDraft,
          defaultDilutionPercent: Number(settingsDraft.defaultDilutionPercent),
        }),
      })
      if (!response.ok) {
        throw new Error('Settings update failed')
      }
      const payload = (await response.json()) as ApiEnvelope<SettingsUpdateResponse>
      setCustomizationData((current) => ({
        ...current,
        settings: payload.data.settings,
        audit: addAudit(current.audit, payload.data.audit),
      }))
      setSettingsDraft(payload.data.settings)
      setCustomizationStatus('Tenant settings saved with audit evidence')
    } catch {
      setCustomizationStatus('Settings update blocked by customization policy')
    }
  }

  async function toggleFeatureFlag(flag: FeatureFlagRecord, enabled: boolean) {
    setCustomizationData((current) => ({
      ...current,
      featureFlags: current.featureFlags.map((item) => (item.key === flag.key ? { ...item, enabled } : item)),
    }))
    try {
      const response = await fetch(`${apiBaseUrl}/feature-flags/${encodeURIComponent(flag.key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!response.ok) {
        throw new Error('Feature flag update failed')
      }
      const payload = (await response.json()) as ApiEnvelope<FeatureFlagUpdateResponse>
      setCustomizationData((current) => ({
        ...current,
        featureFlags: current.featureFlags.map((item) =>
          item.key === payload.data.featureFlag.key ? payload.data.featureFlag : item,
        ),
        audit: addAudit(current.audit, payload.data.audit),
      }))
      setCustomizationStatus(`${payload.data.featureFlag.label} is now ${enabled ? 'enabled' : 'disabled'}`)
    } catch {
      setCustomizationData((current) => ({
        ...current,
        featureFlags: current.featureFlags.map((item) => (item.key === flag.key ? flag : item)),
      }))
      setCustomizationStatus('Feature flag update blocked by customization policy')
    }
  }

  async function previewSequence() {
    try {
      const response = await fetch(`${apiBaseUrl}/numbering-sequences/${encodeURIComponent(selectedSequenceKey)}/preview`)
      if (!response.ok) {
        throw new Error('Numbering preview failed')
      }
      const payload = (await response.json()) as ApiEnvelope<NumberingPreviewResponse>
      setSequencePreview(payload.data.value)
      setCustomizationStatus(`Preview generated without incrementing ${payload.data.key}`)
    } catch {
      setCustomizationStatus('Number preview unavailable')
    }
  }

  async function saveSequence() {
    try {
      const response = await fetch(`${apiBaseUrl}/numbering-sequences/${encodeURIComponent(selectedSequenceKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pattern: sequenceDraft.pattern,
          nextValue: Number(sequenceDraft.nextValue),
          scope: sequenceDraft.scope,
        }),
      })
      if (!response.ok) {
        throw new Error('Numbering update failed')
      }
      const payload = (await response.json()) as ApiEnvelope<NumberingUpdateResponse>
      setCustomizationData((current) => ({
        ...current,
        numberingSequences: current.numberingSequences.map((sequence) =>
          sequence.key === payload.data.sequence.key ? payload.data.sequence : sequence,
        ),
        audit: addAudit(current.audit, payload.data.audit),
      }))
      setSequenceDraft(payload.data.sequence)
      setSequencePreview(payload.data.preview)
      setCustomizationStatus('Numbering sequence saved with monotonic guard')
    } catch {
      setCustomizationStatus('Numbering update blocked; check pattern and next value')
    }
  }

  async function issueNextNumber() {
    try {
      const response = await fetch(`${apiBaseUrl}/numbering-sequences/${encodeURIComponent(selectedSequenceKey)}/next`, {
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error('Number issue failed')
      }
      const payload = (await response.json()) as ApiEnvelope<{ key: string; value: string; invariant: string }>
      await refreshCustomizationConsole(`Issued ${payload.data.value} through the sequence service`)
      setSequencePreview(`Issued ${payload.data.value}`)
    } catch {
      setCustomizationStatus('Numbering issue blocked by sequence service')
    }
  }

  async function createField() {
    try {
      const response = await fetch(`${apiBaseUrl}/custom-fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: fieldEntity,
          key: fieldKey,
          label: fieldLabel,
          fieldType,
          required: fieldRequired,
          options: fieldOptions
            .split(',')
            .map((option) => option.trim())
            .filter(Boolean),
        }),
      })
      if (!response.ok) {
        throw new Error('Custom field create failed')
      }
      const payload = (await response.json()) as ApiEnvelope<CustomFieldCreateResponse>
      setCustomizationData((current) => ({
        ...current,
        customFields: [payload.data.customField, ...current.customFields],
        audit: addAudit(current.audit, payload.data.audit),
      }))
      setFieldLabel('')
      setFieldKey('')
      setCustomizationStatus(`${payload.data.customField.label} custom field created`)
    } catch {
      setCustomizationStatus('Custom field create blocked; check entity and duplicate key')
    }
  }

  async function saveBranding() {
    try {
      const response = await fetch(`${apiBaseUrl}/branding`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brandingDraft),
      })
      if (!response.ok) {
        throw new Error('Branding update failed')
      }
      const payload = (await response.json()) as ApiEnvelope<BrandingUpdateResponse>
      setCustomizationData((current) => ({
        ...current,
        branding: payload.data.branding,
        audit: addAudit(current.audit, payload.data.audit),
      }))
      setBrandingDraft(payload.data.branding)
      setCustomizationStatus('Export branding saved as tenant configuration')
    } catch {
      setCustomizationStatus('Branding update blocked; accent color must be hex')
    }
  }

  return (
    <div className="workspace-grid customization-grid">
      <Panel title="Tenant Settings" icon={Settings}>
        <div className="tag-row">
          <DataTag label="Locale" value={customizationData.settings.locale} />
          <DataTag label="Currency" value={customizationData.settings.currency} tone="blue" />
          <DataTag label="Default unit" value={customizationData.settings.defaultUnit} tone="green" />
        </div>
        <div className="customization-form-grid">
          <label className="field-row">
            <span>Locale</span>
            <input
              aria-label="Customization locale"
              value={settingsDraft.locale}
              onChange={(event) => setSettingsDraft((current) => ({ ...current, locale: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Timezone</span>
            <input
              aria-label="Customization timezone"
              value={settingsDraft.timezone}
              onChange={(event) => setSettingsDraft((current) => ({ ...current, timezone: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Currency</span>
            <input
              aria-label="Customization currency"
              value={settingsDraft.currency}
              onChange={(event) => setSettingsDraft((current) => ({ ...current, currency: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Default unit</span>
            <select
              aria-label="Customization default unit"
              value={settingsDraft.defaultUnit}
              onChange={(event) =>
                setSettingsDraft((current) => ({
                  ...current,
                  defaultUnit: event.target.value as TenantSettingsRecord['defaultUnit'],
                }))
              }
            >
              <option value="g">g</option>
              <option value="ml">ml</option>
            </select>
          </label>
          <label className="field-row">
            <span>Default dilution %</span>
            <input
              aria-label="Customization default dilution"
              min={0}
              step={0.1}
              type="number"
              value={settingsDraft.defaultDilutionPercent}
              onChange={(event) =>
                setSettingsDraft((current) => ({
                  ...current,
                  defaultDilutionPercent: Number(event.target.value),
                }))
              }
            />
          </label>
          <button className="primary-button" type="button" onClick={() => void saveSettings()}>
            Save settings
          </button>
        </div>
        <ul className="policy-list">
          <li>{customizationStatus}</li>
          <li>{customizationData.invariant}</li>
        </ul>
      </Panel>

      <Panel title="Feature Flags" icon={Play}>
        <div className="flag-list">
          {customizationData.featureFlags.map((flag) => (
            <label className={`flag-row ${flag.enabled ? 'is-enabled' : ''}`} key={flag.key}>
              <div>
                <strong>{flag.label}</strong>
                <span>{flag.key}</span>
              </div>
              <DataTag label="Phase" value={`P${flag.phase}`} tone="blue" />
              <input
                aria-label={`Toggle ${flag.label}`}
                checked={flag.enabled}
                type="checkbox"
                onChange={(event) => void toggleFeatureFlag(flag, event.target.checked)}
              />
            </label>
          ))}
        </div>
      </Panel>

      <Panel title="Numbering Sequences" icon={Command}>
        <div className="customization-form-grid">
          <label className="field-row">
            <span>Sequence</span>
            <select
              aria-label="Numbering sequence"
              value={selectedSequenceKey}
              onChange={(event) => selectSequence(event.target.value)}
            >
              {customizationData.numberingSequences.map((sequence) => (
                <option key={sequence.key} value={sequence.key}>
                  {sequence.key}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Pattern</span>
            <input
              aria-label="Numbering pattern"
              value={sequenceDraft.pattern}
              onChange={(event) => setSequenceDraft((current) => ({ ...current, pattern: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Next value</span>
            <input
              aria-label="Numbering next value"
              min={0}
              step={1}
              type="number"
              value={sequenceDraft.nextValue}
              onChange={(event) =>
                setSequenceDraft((current) => ({ ...current, nextValue: Number(event.target.value) }))
              }
            />
          </label>
          <label className="field-row">
            <span>Scope</span>
            <select
              aria-label="Numbering scope"
              value={sequenceDraft.scope}
              onChange={(event) =>
                setSequenceDraft((current) => ({
                  ...current,
                  scope: event.target.value as NumberingSequenceRecord['scope'],
                }))
              }
            >
              <option value="brand">brand</option>
              <option value="organization">organization</option>
            </select>
          </label>
        </div>
        <div className="sequence-preview">
          <strong>{sequencePreview}</strong>
          <span>Preview is read-only until you issue the next value.</span>
        </div>
        <div className="action-row">
          <button className="ghost-button" type="button" onClick={() => void previewSequence()}>
            Preview
          </button>
          <button className="primary-button" type="button" onClick={() => void saveSequence()}>
            Save sequence
          </button>
          <button className="ghost-button" type="button" onClick={() => void issueNextNumber()}>
            Issue next
          </button>
        </div>
        <div className="sequence-list">
          {customizationData.numberingSequences.map((sequence) => (
            <button
              className={`sequence-row ${sequence.key === selectedSequenceKey ? 'is-selected' : ''}`}
              key={sequence.key}
              type="button"
              onClick={() => selectSequence(sequence.key)}
            >
              <div>
                <strong>{sequence.key}</strong>
                <span>{sequence.pattern}</span>
              </div>
              <DataTag label="Next" value={String(sequence.nextValue)} />
              <DataTag label="Scope" value={sequence.scope} tone="blue" />
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Custom Fields" icon={Layers3}>
        <div className="customization-form-grid">
          <label className="field-row">
            <span>Entity</span>
            <select
              aria-label="Custom field entity"
              value={fieldEntity}
              onChange={(event) => setFieldEntity(event.target.value as CustomFieldDefinition['entity'])}
            >
              {['material', 'formula', 'lot', 'document', 'supplier', 'order'].map((entity) => (
                <option key={entity} value={entity}>
                  {entity}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Field type</span>
            <select
              aria-label="Custom field type"
              value={fieldType}
              onChange={(event) => setFieldType(event.target.value as CustomFieldDefinition['fieldType'])}
            >
              {['text', 'number', 'select', 'date', 'boolean'].map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Label</span>
            <input
              aria-label="Custom field label"
              value={fieldLabel}
              onChange={(event) => setFieldLabel(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Key</span>
            <input
              aria-label="Custom field key"
              value={fieldKey}
              onChange={(event) => setFieldKey(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Select options</span>
            <input
              aria-label="Custom field options"
              disabled={fieldType !== 'select'}
              value={fieldOptions}
              onChange={(event) => setFieldOptions(event.target.value)}
            />
          </label>
          <label className="toggle-row">
            <input
              checked={fieldRequired}
              type="checkbox"
              onChange={(event) => setFieldRequired(event.target.checked)}
            />
            Required
          </label>
          <button className="primary-button" type="button" onClick={() => void createField()} disabled={!fieldLabel.trim()}>
            <Plus size={16} />
            Create field
          </button>
        </div>
        <div className="custom-field-list">
          {customizationData.customFields.map((field) => (
            <div className="custom-field-row" key={field.id}>
              <div>
                <strong>{field.label}</strong>
                <span>
                  {field.entity}.{field.key} / {field.fieldType}
                </span>
              </div>
              <DataTag label="Required" value={field.required ? 'yes' : 'no'} tone={field.required ? 'amber' : 'green'} />
              <StatusBadge status={fieldStatus(field.status)} label={field.status} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Export Branding" icon={Sparkles}>
        <div className="customization-form-grid">
          <label className="field-row">
            <span>Display name</span>
            <input
              aria-label="Branding display name"
              value={brandingDraft.displayName}
              onChange={(event) => setBrandingDraft((current) => ({ ...current, displayName: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Accent color</span>
            <input
              aria-label="Branding accent color"
              type="color"
              value={brandingDraft.accentColor}
              onChange={(event) => setBrandingDraft((current) => ({ ...current, accentColor: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Logo mode</span>
            <select
              aria-label="Branding logo mode"
              value={brandingDraft.logoMode}
              onChange={(event) =>
                setBrandingDraft((current) => ({
                  ...current,
                  logoMode: event.target.value as BrandingConfig['logoMode'],
                }))
              }
            >
              <option value="wordmark">wordmark</option>
              <option value="monogram">monogram</option>
            </select>
          </label>
          <label className="field-row">
            <span>Label template</span>
            <input
              aria-label="Branding label template"
              value={brandingDraft.labelTemplate}
              onChange={(event) => setBrandingDraft((current) => ({ ...current, labelTemplate: event.target.value }))}
            />
          </label>
          <label className="field-row wide-field">
            <span>Document footer</span>
            <input
              aria-label="Branding document footer"
              value={brandingDraft.documentFooter}
              onChange={(event) =>
                setBrandingDraft((current) => ({ ...current, documentFooter: event.target.value }))
              }
            />
          </label>
          <button className="primary-button" type="button" onClick={() => void saveBranding()}>
            Save branding
          </button>
        </div>
        <div className="branding-preview" style={{ borderColor: `${brandingDraft.accentColor}66` }}>
          <div>
            <span className="mono-small">Export preview</span>
            <strong style={{ color: brandingDraft.accentColor }}>{brandingDraft.displayName}</strong>
            <span>{brandingDraft.documentFooter}</span>
          </div>
          <span className="label-preview">
            {brandingDraft.labelTemplate.replace('{brand}', 'NXL').replace('{sequence}', '0430')}
          </span>
        </div>
      </Panel>

      <Panel className="wide" title="Customization Audit" icon={ClipboardCheck}>
        <AuditList events={customizationData.audit.length > 0 ? customizationData.audit : auditEvents.slice(0, 4)} />
      </Panel>
    </div>
  )
}

function memberStatus(status: MembershipRecord['status']): DomainStatus {
  if (status === 'ACTIVE') {
    return 'stable'
  }
  if (status === 'INVITED') {
    return 'review'
  }
  return 'draft'
}

function sessionStatus(status: AuthSession['status']): DomainStatus {
  if (status === 'ACTIVE') {
    return 'stable'
  }
  if (status === 'EXPIRED') {
    return 'review'
  }
  return 'draft'
}

const ownerLockedPermissionKeys = ['security.manageUsers', 'security.viewAuditLog', 'security.sessions.manage']

function buildRolePermissionMatrix(
  policies: RolePolicy[],
  catalog: PermissionDefinition[],
): RolePermissionMatrix[] {
  const organizationCatalog = catalog.filter((permission) => permission.scope === 'organization')
  const highRiskPermissionKeys = new Set(
    organizationCatalog
      .filter((permission) => permission.risk === 'high' || permission.risk === 'critical')
      .map((permission) => permission.key),
  )

  return policies.map((policy) => {
    const allowedSet = new Set(policy.permissions)
    const allowedPermissions = organizationCatalog
      .map((permission) => permission.key)
      .filter((permission) => allowedSet.has(permission))
    return {
      role: policy.role,
      scope: policy.scope,
      mfaRequired: policy.mfaRequired,
      allowedPermissions,
      deniedPermissions: organizationCatalog
        .map((permission) => permission.key)
        .filter((permission) => !allowedSet.has(permission)),
      highRiskPermissions: allowedPermissions.filter((permission) => highRiskPermissionKeys.has(permission)),
    }
  })
}

function permissionRiskTone(risk: PermissionDefinition['risk']): 'green' | 'amber' | 'blue' {
  if (risk === 'low') {
    return 'green'
  }
  if (risk === 'medium') {
    return 'blue'
  }
  return 'amber'
}

function IdentityWorkspace() {
  const fallbackTenant = useMemo<TenantConsoleResponse>(() => {
    const organization = organizations.find((item) => item.id === 'org-nxl') ?? organizations[0]!
    const organizationRolePolicies = rolePolicies.filter((item) => item.scope === 'organization')
    const organizationPermissionCatalog = permissionCatalog.filter((permission) => permission.scope === 'organization')
    return {
      organization,
      brands: brands.filter((item) => item.organizationId === organization.id),
      memberships: memberships.filter((item) => item.organizationId === organization.id),
      sessions: authSessions.filter((item) => item.organizationId === organization.id),
      rolePolicies: organizationRolePolicies,
      permissionCatalog: organizationPermissionCatalog,
      permissionMatrix: buildRolePermissionMatrix(organizationRolePolicies, organizationPermissionCatalog),
      securityPolicy: tenantSecurityPolicy,
      audit: auditEvents.filter((event) => event.action.includes('auth') || event.action.includes('security')),
      invariant: 'local tenant seed fallback',
    }
  }, [])
  const [tenantData, setTenantData] = useState<TenantConsoleResponse>(fallbackTenant)
  const [tenantStatus, setTenantStatus] = useState('Loading tenant console')
  const [inviteEmail, setInviteEmail] = useState('new.viewer@noxel.is')
  const [inviteRole, setInviteRole] = useState('Viewer')
  const [permissionRole, setPermissionRole] = useState('Viewer')
  const [permissionName, setPermissionName] = useState('inventory.adjust')
  const [probeResult, setProbeResult] = useState<SecurityProbeResult | null>(null)
  const permissionOptions = tenantData.permissionCatalog.map((permission) => permission.key)
  const selectedRolePolicy = tenantData.rolePolicies.find((policy) => policy.role === permissionRole) ?? tenantData.rolePolicies[0]
  const selectedRoleMatrix =
    tenantData.permissionMatrix.find((matrix) => matrix.role === selectedRolePolicy?.role) ?? tenantData.permissionMatrix[0]
  const selectedPermissionKeys = new Set(selectedRolePolicy?.permissions ?? [])

  async function refreshTenantConsole(nextStatus = 'Tenant console synced from API') {
    try {
      const response = await fetch(`${apiBaseUrl}/security/tenant-console`)
      if (!response.ok) {
        throw new Error('Tenant console API failed')
      }
      const payload = (await response.json()) as ApiEnvelope<TenantConsoleResponse>
      setTenantData(payload.data)
      setTenantStatus(nextStatus)
    } catch {
      setTenantStatus('Using local tenant seed until API is reachable')
    }
  }

  useEffect(() => {
    void refreshTenantConsole()
  }, [])

  async function inviteTenantMember() {
    try {
      const response = await fetch(`${apiBaseUrl}/security/members/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          brandIds: [tenantData.brands[0]?.id ?? 'brand-nxl'],
        }),
      })
      if (!response.ok) {
        throw new Error('Invite failed')
      }
      setInviteEmail('')
      await refreshTenantConsole('Invite created; credential remains invite-only')
    } catch {
      setTenantStatus('Invite blocked by tenant membership policy')
    }
  }

  async function updateMemberStatus(memberId: string, status: MembershipRecord['status']) {
    try {
      const response = await fetch(`${apiBaseUrl}/security/members/${memberId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) {
        throw new Error('Membership status update failed')
      }
      await refreshTenantConsole(status === 'DEACTIVATED' ? 'Member deactivated and sessions revoked' : 'Member activated')
    } catch {
      setTenantStatus('Membership status update blocked by tenant policy')
    }
  }

  async function revokeTenantSession(sessionId: string) {
    try {
      const response = await fetch(`${apiBaseUrl}/security/sessions/${sessionId}/revoke`, { method: 'POST' })
      if (!response.ok) {
        throw new Error('Session revoke failed')
      }
      await refreshTenantConsole('Session revoked and audit event recorded')
    } catch {
      setTenantStatus('Session revoke blocked by tenant policy')
    }
  }

  async function revokeAllTenantSessions(email: string) {
    try {
      const response = await fetch(`${apiBaseUrl}/security/sessions/revoke-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, keepCurrent: true }),
      })
      if (!response.ok) {
        throw new Error('Session revoke-all failed')
      }
      await refreshTenantConsole(`All active sessions revoked for ${email}`)
    } catch {
      setTenantStatus('Revoke-all blocked by tenant policy')
    }
  }

  async function touchTenantSession(sessionId: string) {
    try {
      const response = await fetch(`${apiBaseUrl}/security/sessions/${sessionId}/touch`, { method: 'POST' })
      if (!response.ok) {
        throw new Error('Session touch failed')
      }
      await refreshTenantConsole('Session idle timeout extended')
    } catch {
      setTenantStatus('Session touch blocked by lifecycle policy')
    }
  }

  async function logoutCurrentSession() {
    try {
      const response = await fetch(`${apiBaseUrl}/auth/logout`, { method: 'POST' })
      if (!response.ok) {
        throw new Error('Logout failed')
      }
      await refreshTenantConsole('Current session logged out; demo created a fresh owner session')
    } catch {
      setTenantStatus('Logout blocked by session lifecycle policy')
    }
  }

  async function runTenantProbe(organizationId: string) {
    try {
      const response = await fetch(
        `${apiBaseUrl}/security/tenant-probe?organizationId=${encodeURIComponent(organizationId)}`,
      )
      if (!response.ok) {
        throw new Error('Tenant probe blocked')
      }
      setProbeResult({
        status: 'allowed',
        title: 'Tenant probe allowed',
        detail: `Current session can access ${organizationId}`,
      })
    } catch {
      setProbeResult({
        status: 'blocked',
        title: 'Tenant probe blocked',
        detail: `Current session cannot access ${organizationId}`,
      })
    } finally {
      void refreshTenantConsole('Tenant probe recorded in audit trail')
    }
  }

  async function runPermissionProbe() {
    try {
      const response = await fetch(
        `${apiBaseUrl}/security/permission-probe?role=${encodeURIComponent(permissionRole)}&permission=${encodeURIComponent(permissionName)}`,
      )
      if (!response.ok) {
        throw new Error('Permission probe blocked')
      }
      setProbeResult({
        status: 'allowed',
        title: 'Permission allowed',
        detail: `${permissionRole} can perform ${permissionName}`,
      })
    } catch {
      setProbeResult({
        status: 'blocked',
        title: 'Permission blocked',
        detail: `${permissionRole} cannot perform ${permissionName}`,
      })
    } finally {
      void refreshTenantConsole('Permission probe recorded in audit trail')
    }
  }

  async function updateRolePermission(permissionKey: string, enabled: boolean) {
    if (!selectedRolePolicy) {
      return
    }
    const nextPermissions = enabled
      ? Array.from(new Set([...selectedRolePolicy.permissions, permissionKey]))
      : selectedRolePolicy.permissions.filter((permission) => permission !== permissionKey)
    try {
      const response = await fetch(
        `${apiBaseUrl}/security/roles/${encodeURIComponent(selectedRolePolicy.role)}/permissions`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions: nextPermissions }),
        },
      )
      if (!response.ok) {
        throw new Error('Role permission update failed')
      }
      await refreshTenantConsole(`${selectedRolePolicy.role} permission matrix updated`)
      setProbeResult({
        status: 'allowed',
        title: 'Permission matrix updated',
        detail: `${selectedRolePolicy.role} ${enabled ? 'now includes' : 'no longer includes'} ${permissionKey}`,
      })
    } catch {
      setTenantStatus('Permission update blocked by role policy guard')
      setProbeResult({
        status: 'blocked',
        title: 'Permission update blocked',
        detail: `${selectedRolePolicy.role} cannot be changed to that permission set`,
      })
    }
  }

  return (
    <div className="workspace-grid identity-grid">
      <Panel title="Tenant Boundary" icon={Building2}>
        <div className="tenant-summary">
          <span className="mono-small">{tenantData.organization.id}</span>
          <strong>{tenantData.organization.name}</strong>
          <span>
            {tenantData.organization.plan} / {tenantData.organization.status} / {tenantData.organization.slug}.olfactoryops
          </span>
        </div>
        <div className="tag-row">
          <DataTag label="Contact" value={tenantData.organization.primaryContact} />
          <DataTag label="Brands" value={String(tenantData.brands.length)} tone="blue" />
          <DataTag label="Idle TTL" value={`${tenantData.securityPolicy.idleTimeoutMinutes}m`} tone="green" />
          <DataTag label="Max length" value={`${Math.round(tenantData.securityPolicy.absoluteSessionMinutes / 60)}h`} tone="blue" />
          <DataTag label="Concurrent" value={String(tenantData.securityPolicy.concurrentSessionLimit)} tone="amber" />
        </div>
        <div className="brand-list">
          {tenantData.brands.map((brand) => (
            <div className="brand-row-card" key={brand.id}>
              <div>
                <strong>{brand.name}</strong>
                <span>{brand.id}</span>
              </div>
              <StatusBadge status={brand.status === 'ACTIVE' ? 'stable' : 'draft'} label={brand.status} />
            </div>
          ))}
        </div>
        <div className="action-row">
          <button className="primary-button" type="button" onClick={() => void runTenantProbe('org-nxl')}>
            Probe current tenant
          </button>
          <button className="ghost-button" type="button" onClick={() => void runTenantProbe('org-other')}>
            Probe external tenant
          </button>
        </div>
        {probeResult && (
          <div className={`security-result is-${probeResult.status}`}>
            <strong>{probeResult.title}</strong>
            <span>{probeResult.detail}</span>
          </div>
        )}
      </Panel>

      <Panel title="Members & Roles" icon={UsersRound}>
        <div className="tenant-form-row">
          <label className="field-row">
            <span>Invite email</span>
            <input
              aria-label="Invite email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Role</span>
            <select aria-label="Invite role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
              {tenantData.rolePolicies.map((policy) => (
                <option key={policy.role} value={policy.role}>
                  {policy.role}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" type="button" onClick={() => void inviteTenantMember()} disabled={!inviteEmail.trim()}>
            <Plus size={16} />
            Invite
          </button>
        </div>

        <div className="member-list">
          {tenantData.memberships.map((member) => (
            <div className="member-row" key={member.id}>
              <div>
                <strong>{member.name}</strong>
                <span>
                  {member.email} / {member.role}
                </span>
              </div>
              <StatusBadge status={memberStatus(member.status)} label={member.status} />
              <DataTag label="MFA" value={member.mfaEnabled ? 'On' : 'Pending'} tone={member.mfaEnabled ? 'green' : 'amber'} />
              {member.status === 'ACTIVE' ? (
                <button
                  className="ghost-button small"
                  type="button"
                  onClick={() => void updateMemberStatus(member.id, 'DEACTIVATED')}
                  disabled={member.role === 'Owner'}
                >
                  Deactivate
                </button>
              ) : (
                <button
                  className="ghost-button small"
                  type="button"
                  onClick={() => void updateMemberStatus(member.id, 'ACTIVE')}
                >
                  Activate
                </button>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Session Control"
        icon={LockKeyhole}
        right={
          <button className="ghost-button small" type="button" onClick={() => void logoutCurrentSession()}>
            Logout current
          </button>
        }
      >
        <div className="tag-row">
          <DataTag label="Idle timeout" value={`${tenantData.securityPolicy.idleTimeoutMinutes}m`} tone="green" />
          <DataTag label="Absolute timeout" value={`${tenantData.securityPolicy.absoluteSessionMinutes}m`} tone="blue" />
          <DataTag label="Max sessions" value={String(tenantData.securityPolicy.concurrentSessionLimit)} tone="amber" />
          <DataTag label="New device alert" value={tenantData.securityPolicy.newDeviceAlertEnabled ? 'On' : 'Off'} tone="green" />
        </div>
        <div className="session-list">
          {tenantData.sessions.map((session) => (
            <div className="session-row" key={session.id}>
              <div>
                <strong>{session.email}</strong>
                <span>
                  {session.location} / {session.ipAddress} / {session.userAgent}
                </span>
                <span>
                  Last seen {new Date(session.lastSeenAt).toLocaleTimeString()} / idle until {new Date(session.idleExpiresAt).toLocaleTimeString()}
                </span>
                {session.revokedReason && <span>Reason: {session.revokedReason}</span>}
              </div>
              <StatusBadge status={sessionStatus(session.status)} label={session.status} />
              <span className="mono-value">{new Date(session.expiresAt).toLocaleTimeString()}</span>
              <button
                className="ghost-button small"
                type="button"
                onClick={() => void touchTenantSession(session.id)}
                disabled={session.status !== 'ACTIVE'}
              >
                Touch
              </button>
              <button
                className="ghost-button small"
                type="button"
                onClick={() => void revokeTenantSession(session.id)}
                disabled={session.status === 'REVOKED'}
              >
                Revoke
              </button>
              <button
                className="ghost-button small"
                type="button"
                onClick={() => void revokeAllTenantSessions(session.email)}
                disabled={session.status !== 'ACTIVE'}
              >
                Revoke all
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="wide" title="Permission Matrix" icon={ShieldCheck}>
        <div className="tenant-form-row">
          <label className="field-row">
            <span>Role</span>
            <select
              aria-label="Permission role"
              value={permissionRole}
              onChange={(event) => setPermissionRole(event.target.value)}
            >
              {tenantData.rolePolicies.map((policy) => (
                <option key={policy.role} value={policy.role}>
                  {policy.role}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Permission</span>
            <select
              aria-label="Permission name"
              value={permissionName}
              onChange={(event) => setPermissionName(event.target.value)}
            >
              {permissionOptions.map((permission) => (
                <option key={permission} value={permission}>
                  {permission}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" type="button" onClick={() => void runPermissionProbe()}>
            Run probe
          </button>
        </div>
        <div className="permission-role-strip">
          {tenantData.permissionMatrix.map((matrix) => (
            <button
              className={`permission-role-card ${matrix.role === permissionRole ? 'is-selected' : ''}`}
              key={matrix.role}
              type="button"
              onClick={() => setPermissionRole(matrix.role)}
            >
              <strong>{matrix.role}</strong>
              <span>{matrix.allowedPermissions.length} granted / {matrix.deniedPermissions.length} denied</span>
              <span>{matrix.highRiskPermissions.length} high-risk permissions</span>
            </button>
          ))}
        </div>
        {selectedRoleMatrix && (
          <div className="tag-row">
            <DataTag label="Granted" value={String(selectedRoleMatrix.allowedPermissions.length)} tone="green" />
            <DataTag label="Denied" value={String(selectedRoleMatrix.deniedPermissions.length)} tone="blue" />
            <DataTag label="High risk" value={String(selectedRoleMatrix.highRiskPermissions.length)} tone="amber" />
            <DataTag label="MFA" value={selectedRoleMatrix.mfaRequired ? 'Required' : 'Optional'} tone={selectedRoleMatrix.mfaRequired ? 'amber' : 'green'} />
          </div>
        )}
        <div className="permission-grid">
          {tenantData.permissionCatalog.map((permission) => {
            const granted = selectedPermissionKeys.has(permission.key)
            const locked = permissionRole === 'Owner' && ownerLockedPermissionKeys.includes(permission.key)
            return (
              <label className={`permission-row-card ${granted ? 'is-granted' : ''}`} key={permission.key}>
                <input
                  type="checkbox"
                  checked={granted}
                  disabled={locked}
                  onChange={(event) => void updateRolePermission(permission.key, event.target.checked)}
                />
                <span>
                  <strong>{permission.label}</strong>
                  <small>{permission.key}</small>
                  <small>{permission.description}</small>
                </span>
                <DataTag label={permission.category} value={permission.risk} tone={permissionRiskTone(permission.risk)} />
              </label>
            )
          })}
        </div>
        <ul className="policy-list">
          <li>{tenantStatus}</li>
          <li>{tenantData.invariant}</li>
          <li>MFA required for Owner/Admin: {tenantData.securityPolicy.mfaRequiredForOwnerAdmin ? 'yes' : 'no'}</li>
          <li>IP allowlist: {tenantData.securityPolicy.ipAllowlist.join(', ')}</li>
        </ul>
      </Panel>

      <Panel className="wide" title="Tenant Security Audit" icon={ClipboardCheck}>
        <AuditList events={tenantData.audit.length > 0 ? tenantData.audit : auditEvents} />
      </Panel>
    </div>
  )
}

function PhaseRoadmap({ onNavigate }: { onNavigate: (key: DomainKey) => void }) {
  return (
    <div className="phase-strip">
      {phases.map((phase) => (
        <button className="phase-card" key={phase.id} type="button" onClick={() => onNavigate(phase.domain)}>
          <span className="mono-value">P{phase.id}</span>
          <strong>{phase.name}</strong>
          <span>{phase.gate}</span>
          <div className="phase-footer">
            <StatusDot status={phase.status} />
            <span className="mono-small">{phase.coverage}% / {phase.securityLayer}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

function WorkflowGraph({ onNavigate }: { onNavigate: (key: DomainKey) => void }) {
  return (
    <div className="workflow-graph">
      {workflowNodes.map((node, index) => {
        const Icon = domainIcons[node.key]
        return (
          <div className="workflow-step-wrap" key={node.key}>
            <button className="workflow-step" type="button" onClick={() => onNavigate(node.key)}>
              <Icon size={18} />
              <strong>{node.label}</strong>
              <span>{node.detail}</span>
            </button>
            {index < workflowNodes.length - 1 && <ChevronRight className="workflow-arrow" size={18} />}
          </div>
        )
      })}
    </div>
  )
}

function DomainMatrix({ onNavigate }: { onNavigate: (key: DomainKey) => void }) {
  return (
    <div className="domain-matrix">
      {domains.map((domain) => {
        const Icon = domainIcons[domain.key]
        return (
          <button className="domain-cell" key={domain.key} type="button" onClick={() => onNavigate(domain.key)}>
            <Icon size={18} />
            <div>
              <strong>{domain.shortName}</strong>
              <span>{domain.phase}</span>
            </div>
            <div className="health-bar">
              <span style={{ width: `${domain.health}%` }} />
            </div>
          </button>
        )
      })}
    </div>
  )
}

function EnterpriseReadiness({ onOpenModal }: { onOpenModal: (modal: ModalKind) => void }) {
  return (
    <Panel className="enterprise-panel" title="Enterprise Readiness" icon={ShieldCheck}>
      <div className="enterprise-stack">
        <div className="readiness-item">
          <span>SSO/SCIM</span>
          <StatusBadge status="review" />
        </div>
        <div className="readiness-item">
          <span>API key rotation</span>
          <StatusBadge status="testing" />
        </div>
        <div className="readiness-item">
          <span>Audit export</span>
          <StatusBadge status="active" />
        </div>
        <div className="readiness-item">
          <span>Dedicated tenant option</span>
          <StatusBadge status="draft" />
        </div>
      </div>
      <button className="primary-button full" type="button" onClick={() => onOpenModal('ssoPolicy')}>
        Review trust layer
      </button>
    </Panel>
  )
}

function EvaporationChart({ curve }: { curve: ReturnType<typeof evaporationCurve> }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={curve} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="topGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#4d9bff" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#4d9bff" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="heartGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#c4a86a" stopOpacity={0.32} />
              <stop offset="95%" stopColor="#c4a86a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
          <XAxis dataKey="hour" stroke="rgba(158,166,180,.62)" tickLine={false} axisLine={false} />
          <YAxis stroke="rgba(158,166,180,.62)" tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ stroke: 'rgba(77,155,255,.32)' }}
            contentStyle={{
              background: 'rgba(9,10,13,.92)',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 14,
              color: 'rgba(233,236,243,.92)',
            }}
          />
          <Area type="monotone" dataKey="Top" stroke="#4d9bff" fill="url(#topGradient)" strokeWidth={2} />
          <Area type="monotone" dataKey="Heart" stroke="#c4a86a" fill="url(#heartGradient)" strokeWidth={2} />
          <Area type="monotone" dataKey="Base" stroke="#37d6a0" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function MovementTable({
  movements,
  materialRecords = materials,
}: {
  movements: InventoryMovement[]
  materialRecords?: Material[]
}) {
  return (
    <div className="movement-table">
      {movements.map((movement) => {
        const material = materialRecords.find((item) => item.id === movement.materialId)
        return (
          <div className="movement-row" key={movement.id}>
            <span className="mono-value">{movement.id}</span>
            <div>
              <strong>{movement.type}</strong>
              <span>{material?.name}</span>
            </div>
            <StatusBadge status={movement.direction === 'IN' ? 'stable' : 'active'} label={movement.direction} />
            <span className="mono-value">{formatGrams(movement.quantityGrams)}</span>
            <span className="mono-value">{movement.ref}</span>
          </div>
        )
      })}
    </div>
  )
}

function AuditList({ events }: { events: AuditEvent[] }) {
  return (
    <div className="audit-list">
      {events.map((event) => (
        <div className="audit-row" key={event.id}>
          <div>
            <strong>{event.action}</strong>
            <span>{event.actor} / {event.entity}</span>
          </div>
          <StatusBadge
            status={event.outcome === 'allowed' ? 'stable' : event.outcome === 'blocked' ? 'alert' : 'review'}
            label={event.outcome}
          />
          <span className="mono-value">{event.requestId}</span>
        </div>
      ))}
    </div>
  )
}

function UsagePreview({
  allocations,
  shortfalls,
  compact = false,
}: {
  allocations: Allocation[]
  shortfalls: ReturnType<typeof planLabUsage>['shortfalls']
  compact?: boolean
}) {
  return (
    <div className={`usage-preview ${compact ? 'is-compact' : ''}`}>
      {shortfalls.length > 0 && (
        <div className="shortfall-box">
          <strong>Shortfall</strong>
          {shortfalls.map((shortfall) => (
            <span key={shortfall.materialId}>
              {shortfall.materialName}: need {formatGrams(shortfall.requiredGrams)}, available{' '}
              {formatGrams(shortfall.availableGrams)}
            </span>
          ))}
        </div>
      )}
      {allocations.map((allocation) => (
        <div className="allocation-row" key={`${allocation.materialId}-${allocation.lotId}`}>
          <div>
            <strong>{allocation.materialName}</strong>
            <span>{allocation.lotNumber}</span>
          </div>
          <span className="mono-value">{formatGrams(allocation.allocatedGrams)}</span>
          <span className="mono-value">after {formatGrams(allocation.balanceAfter)}</span>
        </div>
      ))}
    </div>
  )
}

function CommandPalette({
  open,
  onClose,
  onNavigate,
  onCommit,
}: {
  open: boolean
  onClose: () => void
  onNavigate: (key: DomainKey) => void
  onCommit: () => void
}) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const commands = useMemo(
    () => [
      { label: 'Open North Star Console', detail: 'Dashboard', action: () => onNavigate('dashboard') },
      ...domains.map((domain) => ({
        label: `Open ${domain.name}`,
        detail: `Phase ${domain.phase}`,
        action: () => onNavigate(domain.key),
      })),
      { label: 'Commit FRM-0421 lab usage', detail: 'Create OUT movements', action: onCommit },
      { label: 'Review audit export', detail: 'Enterprise evidence', action: () => onNavigate('saas') },
    ],
    [onCommit, onNavigate],
  )
  const filtered = commands.filter((command) =>
    `${command.label} ${command.detail}`.toLowerCase().includes(query.toLowerCase()),
  )

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [open])

  function run(index: number) {
    filtered[index]?.action()
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="command-palette glass"
            initial={{ scale: 0.96, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 12 }}
          >
            <div className="command-input-row">
              <Command size={18} />
              <input
                autoFocus
                value={query}
                placeholder="Navigate, create, inspect..."
                onChange={(event) => {
                  setQuery(event.target.value)
                  setSelectedIndex(0)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setSelectedIndex((index) => Math.min(index + 1, filtered.length - 1))
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setSelectedIndex((index) => Math.max(index - 1, 0))
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    run(selectedIndex)
                  }
                  if (event.key === 'Escape') {
                    onClose()
                  }
                }}
              />
              <button className="icon-button" type="button" onClick={onClose} aria-label="Close command palette">
                <X size={18} />
              </button>
            </div>
            <div className="command-results">
              {filtered.map((command, index) => (
                <button
                  className={`command-result ${index === selectedIndex ? 'is-selected' : ''}`}
                  key={`${command.label}-${command.detail}`}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => run(index)}
                >
                  <span>{command.label}</span>
                  <span>{command.detail}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function BlackPopup({
  open,
  title,
  description,
  actionLabel,
  actionDisabled = false,
  onClose,
  onAction,
  children,
}: {
  open: boolean
  title: string
  description: string
  actionLabel: string
  actionDisabled?: boolean
  onClose: () => void
  onAction: () => void | Promise<void>
  children: ReactNode
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="black-popup glass"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
          >
            <div className="popup-header">
              <div>
                <h2>{title}</h2>
                <p>{description}</p>
              </div>
              <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
                <X size={18} />
              </button>
            </div>
            <div className="popup-body">{children}</div>
            <div className="popup-actions">
              <button className="ghost-button" type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="primary-button" type="button" onClick={() => void onAction()} disabled={actionDisabled}>
                {actionLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Panel({
  title,
  icon: Icon,
  right,
  children,
  className = '',
}: {
  title: string
  icon: LucideIcon
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`panel glass glass-hover ${className}`}>
      <div className="panel-header">
        <div className="panel-title-row">
          <span className="icon-chip">
            <Icon size={17} />
          </span>
          <h2>{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function StatusDot({ status }: { status: DomainStatus }) {
  return <span className="status-dot" style={{ background: statusMeta[status].color }} />
}

function StatusBadge({ status, label }: { status: DomainStatus; label?: string }) {
  return (
    <span className="status-badge" style={{ ['--status' as string]: statusMeta[status].color }}>
      <StatusDot status={status} />
      {label ?? statusMeta[status].label}
    </span>
  )
}

function DataTag({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon?: LucideIcon
  tone?: 'green' | 'amber' | 'blue'
}) {
  return (
    <span className={`data-tag ${tone ? `tone-${tone}` : ''}`}>
      {Icon && <Icon size={14} />}
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  )
}

function CardList({ items, mono = false }: { items: string[]; mono?: boolean }) {
  return (
    <div className="card-list">
      {items.map((item) => (
        <div className={mono ? 'mono-card' : 'text-card'} key={item}>
          {item}
        </div>
      ))}
    </div>
  )
}

function LabBackdrop() {
  return (
    <div className="lab-backdrop" aria-hidden="true">
      <div className="orb orb-one" />
      <div className="orb orb-two" />
      <div className="orb orb-three" />
      <div className="blueprint-grid" />
      <svg className="molecule-linework" viewBox="0 0 640 420" role="presentation">
        <path d="M120 156 205 108 289 156 289 252 205 300 120 252Z" />
        <path d="M289 156 374 108 458 156 458 252 374 300 289 252" />
        <path d="M205 108V45M374 300v72M458 156l72-42M120 252l-72 42" />
        <circle cx="205" cy="108" r="10" />
        <circle cx="374" cy="300" r="10" className="gold-node" />
      </svg>
      <svg className="flask-linework" viewBox="0 0 220 260" role="presentation">
        <path d="M86 20h48M100 20v72L44 214c-8 18 4 34 24 34h84c20 0 32-16 24-34L120 92V20" />
        <path d="M68 196c26 18 58-18 92 0" />
      </svg>
      <div className="scanline" />
    </div>
  )
}

export default App
