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
import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
  documents,
  domains,
  evaporationCurve,
  formatCurrency,
  formatGrams,
  formulaTotals,
  formulas,
  initialLots,
  initialMovements,
  materials,
  phases,
  planLabUsage,
  readinessStats,
  records,
  resolveFormulaWithCatalog,
  statusMeta,
  stockSummary,
  type Allocation,
  type AuditEvent,
  type DocumentRecord,
  type DomainKey,
  type DomainModule,
  type DomainStatus,
  type Formula,
  type FormulaLine,
  type InventoryLot,
  type InventoryMovement,
  type ResolvedLeaf,
  type SignedDocumentUrl,
} from './data/northStar'

type UsageRecord = {
  id: string
  at: string
  formulaCode: string
  batchGrams: number
  status: 'COMMITTED' | 'REVERSED'
  allocations: Allocation[]
}

type ModalKind = 'commit' | 'auditExport' | 'ssoPolicy' | 'newFormula' | 'formulaLine' | 'receiveStock' | null

type ApiEnvelope<T> = {
  data: T
}

type DocumentDownloadResponse = {
  document: DocumentRecord
  signedUrl: SignedDocumentUrl
  audit: AuditEvent
  invariant: string
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

function App() {
  const [activeKey, setActiveKey] = useState<DomainKey>('dashboard')
  const [commandOpen, setCommandOpen] = useState(false)
  const [modal, setModal] = useState<ModalKind>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [selectedMaterialId, setSelectedMaterialId] = useState('mat-iso')
  const [formulaRecords, setFormulaRecords] = useState<Formula[]>(() => structuredClone(formulas))
  const [activeFormulaId, setActiveFormulaId] = useState('frm-0421')
  const [lots, setLots] = useState<InventoryLot[]>(initialLots)
  const [movements, setMovements] = useState<InventoryMovement[]>(initialMovements)
  const [usageHistory, setUsageHistory] = useState<UsageRecord[]>([])
  const [batchGrams, setBatchGrams] = useState(12.5)
  const [newFormulaName, setNewFormulaName] = useState('Untitled Accord')
  const [newFormulaTargetGrams, setNewFormulaTargetGrams] = useState(100)
  const [newLineMaterialId, setNewLineMaterialId] = useState(materials[0]?.id ?? '')
  const [newLineGrams, setNewLineGrams] = useState(5)
  const [receiveMaterialId, setReceiveMaterialId] = useState(materials[0]?.id ?? '')
  const [receiveLotNumber, setReceiveLotNumber] = useState('L-NEW-001')
  const [receiveQuantityGrams, setReceiveQuantityGrams] = useState(25)
  const [receiveExpiryDate, setReceiveExpiryDate] = useState('2028-12-31')

  const selectedDomain = domains.find((domain) => domain.key === activeKey)
  const selectedFormula = useMemo(() => {
    const fallbackFormula = formulas.find((formula) => formula.id === 'frm-0421')!
    return formulaRecords.find((formula) => formula.id === activeFormulaId) ?? fallbackFormula
  }, [activeFormulaId, formulaRecords])
  const resolvedLeaves = useMemo(
    () => resolveFormulaWithCatalog(selectedFormula.id, formulaRecords),
    [formulaRecords, selectedFormula.id],
  )
  const totals = useMemo(() => formulaTotals(resolvedLeaves), [resolvedLeaves])
  const curve = useMemo(() => evaporationCurve(resolvedLeaves), [resolvedLeaves])
  const labPlan = useMemo(
    () => planLabUsage(resolvedLeaves, lots, batchGrams, selectedFormula.targetGrams),
    [resolvedLeaves, lots, batchGrams, selectedFormula.targetGrams],
  )
  const stock = useMemo(() => stockSummary(lots), [lots])
  const stats = useMemo(() => readinessStats(), [])

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

  function commitLabUsage() {
    if (labPlan.shortfalls.length > 0 || resolvedLeaves.length === 0) {
      return
    }

    const usageId = `LAB-2026-${String(usageHistory.length + 91).padStart(3, '0')}`
    const timestamp = '2026-07-01 06:48'
    const lotMap = new Map(lots.map((lot) => [lot.id, { ...lot }]))
    const createdMovements: InventoryMovement[] = []

    labPlan.allocations.forEach((allocation, index) => {
      const lot = lotMap.get(allocation.lotId)
      if (!lot) {
        return
      }
      lot.quantityGrams = Math.max(0, lot.quantityGrams - allocation.allocatedGrams)
      createdMovements.push({
        id: `MOV-LAB-${usageHistory.length + 1}-${index + 1}`,
        at: timestamp,
        type: 'LAB_CONSUMPTION',
        direction: 'OUT',
        materialId: allocation.materialId,
        lotId: allocation.lotId,
        quantityGrams: allocation.allocatedGrams,
        balanceAfter: lot.quantityGrams,
        ref: usageId,
        actor: 'Perfumer',
      })
    })

    setLots(Array.from(lotMap.values()))
    setMovements((current) => [...createdMovements, ...current])
    setUsageHistory((current) => [
      {
        id: usageId,
        at: timestamp,
        formulaCode: selectedFormula.code,
        batchGrams,
        status: 'COMMITTED',
        allocations: labPlan.allocations,
      },
      ...current,
    ])
    setActiveKey('labUsage')
    setModal(null)
  }

  function reverseLatestUsage() {
    const latest = usageHistory.find((usage) => usage.status === 'COMMITTED')
    if (!latest) {
      return
    }

    const timestamp = '2026-07-01 06:57'
    const lotMap = new Map(lots.map((lot) => [lot.id, { ...lot }]))
    const reversalMovements: InventoryMovement[] = []

    latest.allocations.forEach((allocation, index) => {
      const lot = lotMap.get(allocation.lotId)
      if (!lot) {
        return
      }
      lot.quantityGrams += allocation.allocatedGrams
      reversalMovements.push({
        id: `MOV-REV-${latest.id}-${index + 1}`,
        at: timestamp,
        type: 'REVERSAL',
        direction: 'IN',
        materialId: allocation.materialId,
        lotId: allocation.lotId,
        quantityGrams: allocation.allocatedGrams,
        balanceAfter: lot.quantityGrams,
        ref: latest.id,
        actor: 'Lab Manager',
      })
    })

    setLots(Array.from(lotMap.values()))
    setMovements((current) => [...reversalMovements, ...current])
    setUsageHistory((current) =>
      current.map((usage) => (usage.id === latest.id ? { ...usage, status: 'REVERSED' } : usage)),
    )
  }

  function nextFormulaCode() {
    const usedCodes = new Set(formulaRecords.map((formula) => formula.code))
    const nextNumber = formulaRecords.reduce((max, formula) => {
      const match = /^FRM-(\d+)$/.exec(formula.code)
      return match ? Math.max(max, Number(match[1]) + 1) : max
    }, 422)
    let candidate = nextNumber
    let code = `FRM-${String(candidate).padStart(4, '0')}`

    while (usedCodes.has(code)) {
      candidate += 1
      code = `FRM-${String(candidate).padStart(4, '0')}`
    }

    return code
  }

  function createFormulaDraft() {
    const targetGrams = Math.max(1, Number(newFormulaTargetGrams) || 100)
    const code = nextFormulaCode()
    const draft: Formula = {
      id: code.toLowerCase(),
      code,
      name: newFormulaName.trim() || 'Untitled Formula',
      version: 'v1',
      status: 'draft',
      targetGrams,
      owner: 'Thuan Le Minh',
      lines: [],
    }

    setFormulaRecords((current) => [draft, ...current])
    setActiveFormulaId(draft.id)
    setNewFormulaName('Untitled Accord')
    setNewFormulaTargetGrams(100)
    setActiveKey('formulas')
    setModal(null)
  }

  function addFormulaMaterialLine() {
    const material = materials.find((item) => item.id === newLineMaterialId)
    const formula = formulaRecords.find((item) => item.id === activeFormulaId)
    const grams = Number(newLineGrams)

    if (!material || !formula || !Number.isFinite(grams) || grams <= 0) {
      return
    }

    const line: FormulaLine = {
      id: `${formula.id}-line-${formula.lines.length + 1}-${Date.now()}`,
      label: material.name,
      materialId: material.id,
      grams,
    }

    setFormulaRecords((current) =>
      current.map((item) => (item.id === formula.id ? { ...item, lines: [...item.lines, line] } : item)),
    )
    setSelectedMaterialId(material.id)
    setNewLineGrams(5)
    setActiveKey('formulas')
    setModal(null)
  }

  function receiveStockLot() {
    const material = materials.find((item) => item.id === receiveMaterialId)
    const quantityGrams = Number(receiveQuantityGrams)

    if (!material || !Number.isFinite(quantityGrams) || quantityGrams <= 0) {
      return
    }

    const timestamp = new Date().toISOString()
    const lot: InventoryLot = {
      id: `lot-ui-${Date.now()}`,
      materialId: material.id,
      lotNumber: receiveLotNumber.trim() || `L-${material.cas.replaceAll('-', '')}`,
      quantityGrams,
      reservedGrams: 0,
      receivedDate: timestamp.slice(0, 10),
      expiryDate: receiveExpiryDate || '2028-12-31',
      qualityStatus: 'APPROVED',
      location: 'Receiving Bay',
      unitCost: material.costPerGram,
    }
    const movement: InventoryMovement = {
      id: `MOV-REC-${String(movements.length + 1029).padStart(4, '0')}`,
      at: timestamp,
      type: 'RECEIPT',
      direction: 'IN',
      materialId: material.id,
      lotId: lot.id,
      quantityGrams,
      balanceAfter: lot.quantityGrams,
      ref: `GR-UI-${String(lots.length + 42).padStart(3, '0')}`,
      actor: 'Inventory Manager',
    }

    setLots((current) => [lot, ...current])
    setMovements((current) => [movement, ...current])
    setReceiveLotNumber(`L-NEW-${String(lots.length + 2).padStart(3, '0')}`)
    setReceiveQuantityGrams(25)
    setActiveKey('inventory')
    setModal(null)
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
                  stock={stock}
                  formulaRecords={formulaRecords}
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
                  onCommit={() => setModal('commit')}
                  onReverse={reverseLatestUsage}
                  onOpenModal={setModal}
                  onNewFormula={() => setModal('newFormula')}
                  onAddFormulaLine={() => setModal('formulaLine')}
                  onReceiveStock={() => setModal('receiveStock')}
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
        actionDisabled={labPlan.shortfalls.length > 0}
      >
        <UsagePreview allocations={labPlan.allocations} shortfalls={labPlan.shortfalls} compact />
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
              {materials.map((material) => (
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
              {materials.map((material) => (
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
  stock,
  formulaRecords,
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
  onCommit,
  onReverse,
  onOpenModal,
  onNewFormula,
  onAddFormulaLine,
  onReceiveStock,
}: {
  domain: DomainModule
  lots: InventoryLot[]
  movements: InventoryMovement[]
  stock: ReturnType<typeof stockSummary>
  formulaRecords: Formula[]
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
  onCommit: () => void
  onReverse: () => void
  onOpenModal: (modal: ModalKind) => void
  onNewFormula: () => void
  onAddFormulaLine: () => void
  onReceiveStock: () => void
}) {
  return (
    <div className="domain-page">
      <DomainHeader domain={domain} onOpenModal={onOpenModal} />

      {domain.key === 'materials' && (
        <MaterialWorkspace selectedMaterialId={selectedMaterialId} onSelectMaterial={setSelectedMaterialId} stock={stock} />
      )}
      {domain.key === 'formulas' && (
        <FormulaWorkspace
          formulaRecords={formulaRecords}
          activeFormulaId={activeFormulaId}
          onSelectFormula={setActiveFormulaId}
          resolvedLeaves={resolvedLeaves}
          totals={totals}
          curve={curve}
          onSelectMaterial={setSelectedMaterialId}
          onNewFormula={onNewFormula}
          onAddLine={onAddFormulaLine}
        />
      )}
      {domain.key === 'inventory' && (
        <InventoryWorkspace lots={lots} movements={movements} stock={stock} onReceiveStock={onReceiveStock} />
      )}
      {domain.key === 'labUsage' && (
        <LabUsageWorkspace
          labPlan={labPlan}
          batchGrams={batchGrams}
          setBatchGrams={setBatchGrams}
          usageHistory={usageHistory}
          onCommit={onCommit}
          onReverse={onReverse}
        />
      )}
      {domain.key === 'documents' && <DocumentsWorkspace />}
      {domain.key === 'costing' && <CostingWorkspace totals={totals} stock={stock} />}
      {domain.key === 'analytics' && <AnalyticsWorkspace curve={curve} stock={stock} />}
      {!['materials', 'formulas', 'inventory', 'labUsage', 'documents', 'costing', 'analytics'].includes(domain.key) && (
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
  selectedMaterialId,
  onSelectMaterial,
  stock,
}: {
  selectedMaterialId: string
  onSelectMaterial: (id: string) => void
  stock: ReturnType<typeof stockSummary>
}) {
  const selected = materials.find((material) => material.id === selectedMaterialId) ?? materials[0]
  const selectedStock = stock.find((item) => item.material.id === selected.id)

  return (
    <div className="workspace-grid two-one">
      <Panel title="Material Library" icon={Atom}>
        <div className="material-list">
          {materials.map((material) => {
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
                <div className="mono-value">{summary ? formatGrams(summary.available) : '0g'}</div>
              </button>
            )
          })}
        </div>
      </Panel>

      <Panel title="Material Inspector" icon={PackageSearch} right={<DataTag label="CAS" value={selected.cas} />}>
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
        <div className="provenance-list">
          {selected.provenance.map((source) => (
            <div className="provenance-item" key={`${source.field}-${source.version}`}>
              <div>
                <strong>{source.field}</strong>
                <span>{source.source}</span>
              </div>
              <span className="mono-value">{source.version}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function FormulaWorkspace({
  formulaRecords,
  activeFormulaId,
  onSelectFormula,
  resolvedLeaves,
  totals,
  curve,
  onSelectMaterial,
  onNewFormula,
  onAddLine,
}: {
  formulaRecords: Formula[]
  activeFormulaId: string
  onSelectFormula: (id: string) => void
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
        <div className="formula-lines">
          {formula.lines.length > 0 ? (
            formula.lines.map((line) => (
              <div className="formula-line" key={line.id}>
                <div>
                  <strong>{line.label}</strong>
                  <span>{line.childFormulaId ? 'Nested accord' : 'Raw material leaf'}</span>
                </div>
                <div className="mono-value">{formatGrams(line.grams)}</div>
                <div className="mono-value">{((line.grams / formula.targetGrams) * 100).toFixed(1)}%</div>
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
  stock,
  onReceiveStock,
}: {
  lots: InventoryLot[]
  movements: InventoryMovement[]
  stock: ReturnType<typeof stockSummary>
  onReceiveStock: () => void
}) {
  return (
    <div className="workspace-grid inventory-grid">
      <Panel
        title="Stock Summary"
        icon={Boxes}
        right={
          <button className="primary-button" type="button" onClick={onReceiveStock}>
            <Plus size={15} />
            Create New
          </button>
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
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Lots"
        icon={PackageCheck}
        right={
          <button className="ghost-button small" type="button" onClick={onReceiveStock}>
            Receive Stock
          </button>
        }
      >
        <div className="lot-table">
          {lots.map((lot) => {
            const material = materials.find((item) => item.id === lot.materialId)
            return (
              <div className="lot-row" key={lot.id}>
                <div>
                  <strong>{lot.lotNumber}</strong>
                  <span>{material?.name}</span>
                </div>
                <StatusBadge status={lot.qualityStatus === 'APPROVED' ? 'stable' : 'review'} label={lot.qualityStatus} />
                <span className="mono-value">{formatGrams(lot.quantityGrams)}</span>
                <span className="mono-value">{lot.expiryDate}</span>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel className="wide" title="Immutable Movement Ledger" icon={Database}>
        <MovementTable movements={movements} />
      </Panel>
    </div>
  )
}

function LabUsageWorkspace({
  labPlan,
  batchGrams,
  setBatchGrams,
  usageHistory,
  onCommit,
  onReverse,
}: {
  labPlan: ReturnType<typeof planLabUsage>
  batchGrams: number
  setBatchGrams: (value: number) => void
  usageHistory: UsageRecord[]
  onCommit: () => void
  onReverse: () => void
}) {
  const latestCommitted = usageHistory.find((usage) => usage.status === 'COMMITTED')
  return (
    <div className="workspace-grid lab-grid">
      <Panel title="Commit Preview" icon={ClipboardCheck} right={<DataTag label="Formula" value="FRM-0421 v12" />}>
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
        <div className="action-row">
          <button className="primary-button" type="button" onClick={onCommit} disabled={labPlan.shortfalls.length > 0}>
            <Play size={16} />
            Commit Usage
          </button>
          <button className="ghost-button" type="button" onClick={onReverse} disabled={!latestCommitted}>
            <RotateCcw size={16} />
            Reverse latest
          </button>
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

function MovementTable({ movements }: { movements: InventoryMovement[] }) {
  return (
    <div className="movement-table">
      {movements.map((movement) => {
        const material = materials.find((item) => item.id === movement.materialId)
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
  onAction: () => void
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
            {children}
            <div className="popup-actions">
              <button className="ghost-button" type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="primary-button" type="button" onClick={onAction} disabled={actionDisabled}>
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
