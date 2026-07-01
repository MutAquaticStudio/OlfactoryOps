export type DomainStatus = 'stable' | 'active' | 'testing' | 'review' | 'draft' | 'alert'

export type DomainKey =
  | 'dashboard'
  | 'platform'
  | 'identity'
  | 'customization'
  | 'materials'
  | 'formulas'
  | 'inventory'
  | 'labUsage'
  | 'documents'
  | 'production'
  | 'procurement'
  | 'commerce'
  | 'orders'
  | 'costing'
  | 'analytics'
  | 'saas'

export type MaterialTier = 'Top' | 'Heart' | 'Base'

export interface Phase {
  id: number
  name: string
  domain: DomainKey
  goal: string
  gate: string
  status: DomainStatus
  securityLayer: string
  coverage: number
}

export interface DomainModule {
  key: DomainKey
  phase: string
  name: string
  shortName: string
  responsibility: string
  status: DomainStatus
  health: number
  risk: string
  owner: string
  entities: string[]
  features: string[]
  invariants: string[]
  apis: string[]
  permissions: string[]
  screens: string[]
  activity: string
}

export interface Material {
  id: string
  name: string
  cas: string
  family: string
  tier: MaterialTier
  vaporPressure: number
  density: number
  mw: number
  logP: number
  substantivityHours: number
  ifraLimit: number
  costPerGram: number
  odor: string[]
  provenance: {
    field: string
    source: string
    version: string
    date: string
  }[]
}

export interface FormulaLine {
  id: string
  label: string
  grams: number
  materialId?: string
  childFormulaId?: string
  dilution?: number
}

export interface Formula {
  id: string
  code: string
  name: string
  version: string
  status: DomainStatus
  targetGrams: number
  owner: string
  lines: FormulaLine[]
}

export interface ResolvedLeaf {
  materialId: string
  materialName: string
  grams: number
  effectivePercent: number
  cost: number
  tier: MaterialTier
  vaporPressure: number
  sourcePath: string
}

export interface InventoryLot {
  id: string
  materialId: string
  lotNumber: string
  quantityGrams: number
  reservedGrams: number
  receivedDate: string
  expiryDate: string
  qualityStatus: 'APPROVED' | 'QUARANTINE' | 'EXPIRED'
  location: string
  unitCost: number
}

export interface InventoryMovement {
  id: string
  at: string
  type:
    | 'RECEIPT'
    | 'LAB_CONSUMPTION'
    | 'REVERSAL'
    | 'PRODUCTION_CONSUMPTION'
    | 'FULFILLMENT'
    | 'ADJUSTMENT'
  direction: 'IN' | 'OUT'
  materialId: string
  lotId: string
  quantityGrams: number
  balanceAfter: number
  ref: string
  actor: string
}

export interface DocumentRecord {
  id: string
  type: 'SDS' | 'CoA' | 'IFRA' | 'Invoice' | 'Formula Export' | 'Batch Record'
  title: string
  linkedTo: string
  version: string
  sensitivity: 'Internal' | 'Confidential' | 'Highly Confidential'
  lastAccessed: string
  downloads: number
}

export interface AuditEvent {
  id: string
  at: string
  actor: string
  action: string
  entity: string
  requestId: string
  outcome: 'allowed' | 'blocked' | 'review'
}

export interface BusinessRecord {
  id: string
  label: string
  status: DomainStatus
  amount: string
  owner: string
}

export interface Allocation {
  materialId: string
  materialName: string
  requiredGrams: number
  lotId: string
  lotNumber: string
  allocatedGrams: number
  balanceAfter: number
}

export interface LabUsagePlan {
  allocations: Allocation[]
  shortfalls: {
    materialId: string
    materialName: string
    requiredGrams: number
    availableGrams: number
  }[]
}

export const statusMeta: Record<DomainStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: '#4d9bff' },
  stable: { label: 'Stable', color: '#37d6a0' },
  testing: { label: 'Testing', color: '#f5b04c' },
  review: { label: 'Review', color: '#c4a86a' },
  draft: { label: 'Draft', color: 'rgba(110,118,132,0.72)' },
  alert: { label: 'Alert', color: '#f2585f' },
}

export const phases: Phase[] = [
  { id: 0, name: 'Architecture Blueprint', domain: 'platform', goal: 'Bounded contexts, invariants, permission map', gate: 'Baseline approved', status: 'stable', securityLayer: 'L0', coverage: 100 },
  { id: 1, name: 'Platform Foundation', domain: 'platform', goal: 'Shell, API convention, health, logging', gate: 'Health and shell green', status: 'active', securityLayer: 'L1', coverage: 88 },
  { id: 2, name: 'Tenant/Auth/Security', domain: 'identity', goal: 'Org, brand, user, session, RBAC, audit', gate: 'Tenant isolation tests pass', status: 'review', securityLayer: 'L2/L4', coverage: 74 },
  { id: 3, name: 'Customization Core', domain: 'customization', goal: 'Settings, flags, fields, numbering, branding', gate: 'Config without fork', status: 'testing', securityLayer: 'L0', coverage: 64 },
  { id: 4, name: 'Material Intelligence', domain: 'materials', goal: 'Material master, SDS, provenance, molecules', gate: 'Searchable, sourced data', status: 'active', securityLayer: 'L5', coverage: 82 },
  { id: 5, name: 'Formula R&D', domain: 'formulas', goal: 'Nested formulas, resolve, version, IFRA, cost', gate: 'Save does not consume stock', status: 'active', securityLayer: 'L4/L5', coverage: 78 },
  { id: 6, name: 'Lab Inventory Core', domain: 'inventory', goal: 'Lots, movements, FEFO, summary', gate: 'Only movement changes stock', status: 'active', securityLayer: 'L5', coverage: 80 },
  { id: 7, name: 'Lab Usage Traceability', domain: 'labUsage', goal: 'Commit and reverse usage with audit', gate: 'OUT and IN compensation verified', status: 'testing', securityLayer: 'L5', coverage: 70 },
  { id: 8, name: 'Documents & Compliance', domain: 'documents', goal: 'Private docs, signed URL, download audit', gate: 'Access and download logged', status: 'testing', securityLayer: 'L5', coverage: 62 },
  { id: 9, name: 'Production Batch', domain: 'production', goal: 'Approved formula to batch, QC, lifecycle', gate: 'Production separate from lab trial', status: 'draft', securityLayer: 'L5', coverage: 48 },
  { id: 10, name: 'Procurement', domain: 'procurement', goal: 'Supplier, PO, goods receipt, price history', gate: 'Low stock to receipt works', status: 'draft', securityLayer: 'L4/L5', coverage: 44 },
  { id: 11, name: 'Commerce', domain: 'commerce', goal: 'SKU, pack size, price list, quote/sample', gate: 'Commerce stock reads inventory', status: 'draft', securityLayer: 'L4', coverage: 42 },
  { id: 12, name: 'Orders & Fulfillment', domain: 'orders', goal: 'Orders, reservation, shipment, fulfillment', gate: 'Reservation is not movement', status: 'draft', securityLayer: 'L5', coverage: 40 },
  { id: 13, name: 'Costing & Finance', domain: 'costing', goal: 'Formula, batch, SKU costs, valuation', gate: 'Cost trace reconciles', status: 'testing', securityLayer: 'L4/L5', coverage: 58 },
  { id: 14, name: 'Analytics', domain: 'analytics', goal: 'Burn rate, forecast, expiry, compare', gate: 'Read-only dashboard', status: 'testing', securityLayer: 'L4', coverage: 56 },
  { id: 15, name: 'SaaS Readiness', domain: 'saas', goal: 'Billing, SSO, SCIM, API keys, audit export', gate: 'Enterprise controls present', status: 'review', securityLayer: 'L6/L7/L8', coverage: 52 },
]

export const domains: DomainModule[] = [
  {
    key: 'platform',
    phase: '0-1',
    name: 'Platform Core',
    shortName: 'Platform',
    responsibility: 'Organizations, brands, settings, audit spine, request conventions',
    status: 'active',
    health: 88,
    risk: 'Health green, audit schema pending backend persistence',
    owner: 'Core Team',
    entities: ['Organization', 'Brand', 'TenantSettings', 'FeatureFlag', 'AuditLog'],
    features: ['App shell', 'API envelope', 'Request ID', 'Structured logs', 'Health checks'],
    invariants: ['INV-001 tenant isolation', 'INV-009 audit high-risk', 'INV-010 config not fork'],
    apis: ['/api/v1/health', '/api/v1/version', '/api/v1/audit-logs'],
    permissions: ['platform.view', 'audit.view'],
    screens: ['Dashboard', 'Audit dashboard', 'Phase roadmap'],
    activity: 'Request ID propagated through shell demo',
  },
  {
    key: 'identity',
    phase: '2',
    name: 'Identity & Security',
    shortName: 'Security',
    responsibility: 'Auth, sessions, MFA, permission guard, tenant and brand guard',
    status: 'review',
    health: 74,
    risk: 'UI policy modeled; backend guard implementation is next gate',
    owner: 'Security',
    entities: ['User', 'Membership', 'Role', 'Permission', 'Session', 'MFASecret'],
    features: ['Secure sessions', 'RBAC matrix', 'MFA enforcement', 'Suspicious login alert'],
    invariants: ['INV-SEC-001 auth default', 'INV-SEC-004 tenant query scope', 'INV-SEC-011 no deploy if tenant tests fail'],
    apis: ['/api/v1/auth/login', '/api/v1/auth/mfa/verify', '/api/v1/me'],
    permissions: ['security.manageUsers', 'security.viewAuditLog'],
    screens: ['Login', 'MFA', 'Users and roles', 'Security policy'],
    activity: 'Owner MFA required for billing and SSO changes',
  },
  {
    key: 'customization',
    phase: '3',
    name: 'Customization Core',
    shortName: 'Customization',
    responsibility: 'Tenant settings, feature flags, custom fields, numbering, branding',
    status: 'testing',
    health: 64,
    risk: 'Numbering preview present; atomic backend increment pending',
    owner: 'Product Ops',
    entities: ['CustomFieldDefinition', 'NumberingSequence', 'BrandingConfig', 'WorkflowDefinition'],
    features: ['Numbering pattern', 'Workflow policy', 'Feature flags', 'Export branding'],
    invariants: ['INV-010 config not fork', 'Config changes audit logged'],
    apis: ['/api/v1/settings', '/api/v1/custom-fields', '/api/v1/numbering-sequences'],
    permissions: ['customization.manage'],
    screens: ['Tenant settings', 'Fields', 'Branding', 'Workflow'],
    activity: 'Formula sequence FRM-#### bound to brand NXL',
  },
  {
    key: 'materials',
    phase: '4',
    name: 'Material Intelligence',
    shortName: 'Materials',
    responsibility: 'Material master, SDS/CoA ingestion, provenance, molecule data',
    status: 'active',
    health: 82,
    risk: 'Provenance modeled; AI extract stays review-only',
    owner: 'Lab Data',
    entities: ['Material', 'Molecule', 'OdorProfile', 'IFRADataRef', 'CostSnapshot'],
    features: ['Material inspector', 'SDS ingestion', 'PubChem fill', 'Molecule split', 'Field provenance'],
    invariants: ['INV-003 material has no stock', 'INV-014 vapor pressure on leaf', 'INV-015 provenance required'],
    apis: ['/api/v1/materials', '/api/v1/materials/:id/ingest', '/api/v1/materials/:id/provenance'],
    permissions: ['materials.view', 'materials.create', 'materials.update'],
    screens: ['Material list', 'Inspector', 'Ingestion wizard'],
    activity: 'Iso E Super SDS v3 verified against supplier CoA',
  },
  {
    key: 'formulas',
    phase: '5',
    name: 'Formula R&D',
    shortName: 'Formulas',
    responsibility: 'Formula tree, nested accords, versions, resolve, IFRA, evaporation',
    status: 'active',
    health: 78,
    risk: 'Resolve/cost client engine implemented; backend service pending',
    owner: 'Perfumer Team',
    entities: ['Formula', 'FormulaLine', 'FormulaVersion', 'ReviewRecord'],
    features: ['Gram-first editor', 'Nested accord', 'Version diff', 'Cost roll-up', 'Evaporation curve'],
    invariants: ['INV-006 save non-consuming', 'INV-007 explicit consumption only', 'INV-013 resolve before compute'],
    apis: ['/api/v1/formulas', '/api/v1/formulas/:id/resolve', '/api/v1/formulas/:id/cost'],
    permissions: ['formulas.view', 'formulas.viewSensitive', 'formulas.export'],
    screens: ['Formula table', 'Nested editor', 'Resolve preview', 'Version diff'],
    activity: 'FRM-0421 resolves child accord leaves before cost and vapor model',
  },
  {
    key: 'inventory',
    phase: '6',
    name: 'Lab Inventory Core',
    shortName: 'Inventory',
    responsibility: 'Receipt, lot, immutable movement ledger, FEFO, summary',
    status: 'active',
    health: 80,
    risk: 'Client ledger demonstrates no direct stock edit',
    owner: 'Inventory',
    entities: ['InventoryReceipt', 'InventoryLot', 'InventoryMovement', 'StockReservation'],
    features: ['Receive stock', 'Movement ledger', 'Adjustment', 'Transfer', 'Shortfall list'],
    invariants: ['INV-004 ledger source of truth', 'INV-005 no negative', 'INV-016 reservation != movement'],
    apis: ['/api/v1/inventory/receipts', '/api/v1/lots', '/api/v1/inventory/adjustments'],
    permissions: ['inventory.view', 'inventory.receive', 'inventory.adjust'],
    screens: ['Lots', 'Ledger', 'Receipt form', 'Summary'],
    activity: 'FEFO allocator excludes expired and quarantine lots',
  },
  {
    key: 'labUsage',
    phase: '7',
    name: 'Lab Usage Traceability',
    shortName: 'Lab Usage',
    responsibility: 'Commit and reverse lab usage from formula version to lot movements',
    status: 'testing',
    health: 70,
    risk: 'Compensation flow modeled in UI; needs transaction API',
    owner: 'Lab Ops',
    entities: ['FormulaLabUsage', 'InventoryMovement'],
    features: ['Commit usage', 'Reverse usage', 'Multi-lot allocation', 'Usage history'],
    invariants: ['INV-007 explicit consumption', 'INV-008 reverse by compensation'],
    apis: ['/api/v1/lab-usage/commit', '/api/v1/lab-usage/:id/reverse'],
    permissions: ['inventory.commitLabUsage', 'inventory.reverseLabUsage'],
    screens: ['Commit flow', 'Reverse popup', 'History'],
    activity: 'Trial commit preview ready for 12.5g FRM-0421',
  },
  {
    key: 'documents',
    phase: '8',
    name: 'Documents & Compliance',
    shortName: 'Documents',
    responsibility: 'Private file storage, signed URLs, versioning, download audit',
    status: 'testing',
    health: 62,
    risk: 'Signed URL policy represented; object storage pending',
    owner: 'Compliance',
    entities: ['Document', 'DocumentVersion', 'DownloadAuditLog'],
    features: ['Document center', 'Signed URL', 'Versioning', 'Download audit', 'Export'],
    invariants: ['INV-011 documents private', 'SEC-DATA-001 private bucket'],
    apis: ['/api/v1/documents', '/api/v1/documents/:id/signed-url'],
    permissions: ['documents.view', 'documents.download', 'documents.manage'],
    screens: ['Document center', 'Download audit', 'Formula export'],
    activity: 'Formula export marked Highly Confidential',
  },
  {
    key: 'production',
    phase: '9',
    name: 'Production Batch',
    shortName: 'Production',
    responsibility: 'Approved formula to production batch, QC, lifecycle, yield',
    status: 'draft',
    health: 48,
    risk: 'Lifecycle and QC objects scaffolded',
    owner: 'Manufacturing',
    entities: ['ProductionBatch', 'BatchConsumption', 'QCRecord'],
    features: ['Scale batch', 'Consume lots', 'QC checkpoint', 'Yield reconcile'],
    invariants: ['Production movement separated from lab usage', 'Batch records no hard-delete'],
    apis: ['/api/v1/batches', '/api/v1/batches/:id/consume', '/api/v1/batches/:id/qc'],
    permissions: ['production.view', 'production.consume', 'production.qc'],
    screens: ['Batch timeline', 'QC record', 'Batch cost'],
    activity: 'BTH-2025-118 waiting for filtration checkpoint',
  },
  {
    key: 'procurement',
    phase: '10',
    name: 'Procurement',
    shortName: 'Procurement',
    responsibility: 'Supplier, PO, goods receipt, inventory receipt, price history',
    status: 'draft',
    health: 44,
    risk: 'PO state machine shell ready',
    owner: 'Procurement',
    entities: ['Supplier', 'PurchaseOrder', 'POLine', 'GoodsReceipt', 'PriceHistory'],
    features: ['Low-stock to PO', 'Goods receipt', 'Price history', 'Supplier master'],
    invariants: ['Goods receipt creates lot and IN movement', 'Price history immutable'],
    apis: ['/api/v1/suppliers', '/api/v1/purchase-orders', '/api/v1/purchase-orders/:id/receive'],
    permissions: ['procurement.view', 'procurement.manage'],
    screens: ['Supplier list', 'PO board', 'Goods receipt'],
    activity: 'PO-2026-014 queued for Ambroxan restock',
  },
  {
    key: 'commerce',
    phase: '11',
    name: 'Aroma Materials Commerce',
    shortName: 'Commerce',
    responsibility: 'SKU, pack size, price list, quote, sample, neutral labels',
    status: 'draft',
    health: 42,
    risk: 'Catalog uses inventory availability, no separate stock',
    owner: 'Commercial',
    entities: ['CommercialSKU', 'PackSize', 'PriceList', 'Sample', 'Quote'],
    features: ['SKU availability', 'Pack conversion', 'Price tiers', 'Quote/sample'],
    invariants: ['SKU does not hold separate stock', 'Label uses tenant branding'],
    apis: ['/api/v1/catalog/skus', '/api/v1/price-lists', '/api/v1/quotes'],
    permissions: ['commerce.view', 'commerce.manage'],
    screens: ['Catalog', 'Quote builder', 'Sample queue'],
    activity: 'SKU-ISO-050 price tier linked to lot valuation',
  },
  {
    key: 'orders',
    phase: '12',
    name: 'Orders & Fulfillment',
    shortName: 'Orders',
    responsibility: 'Sales order, reservation, shipment, fulfillment movement',
    status: 'draft',
    health: 40,
    risk: 'Reservation model shown separately from movement',
    owner: 'Fulfillment',
    entities: ['SalesOrder', 'OrderLine', 'StockReservation', 'Shipment'],
    features: ['Reserve stock', 'Release reservation', 'Fulfill OUT', 'Partial/backorder'],
    invariants: ['INV-016 reservation != movement', 'No negative stock'],
    apis: ['/api/v1/orders', '/api/v1/orders/:id/reserve', '/api/v1/orders/:id/fulfill'],
    permissions: ['orders.view', 'orders.reserve', 'orders.fulfill'],
    screens: ['Order queue', 'Reservation drawer', 'Shipment'],
    activity: 'SO-2026-092 reserved 3 packs without movement',
  },
  {
    key: 'costing',
    phase: '13',
    name: 'Costing & Finance',
    shortName: 'Costing',
    responsibility: 'Material, formula, batch, SKU cost, valuation, margin',
    status: 'testing',
    health: 58,
    risk: 'Formula cost roll-up live from resolved leaves',
    owner: 'Finance',
    entities: ['FormulaCost', 'BatchCost', 'SKUCost', 'Valuation'],
    features: ['Cost per gram', 'Cost per bottle', 'Valuation', 'Margin view'],
    invariants: ['INV-012 costing reconciles', 'Resolve before compute'],
    apis: ['/api/v1/costing/formulas/:id', '/api/v1/costing/valuation'],
    permissions: ['costing.view', 'finance.viewMargin'],
    screens: ['Formula cost', 'Inventory valuation', 'SKU margin'],
    activity: 'FRM-0421 cost recalculated from lot snapshots',
  },
  {
    key: 'analytics',
    phase: '14',
    name: 'Analytics & Intelligence',
    shortName: 'Analytics',
    responsibility: 'Burn rate, low-stock forecast, expiry risk, compare',
    status: 'testing',
    health: 56,
    risk: 'Read-only widgets, no mutation entry points',
    owner: 'Insights',
    entities: ['ReadModel', 'Aggregate', 'Forecast'],
    features: ['Burn rate', 'Cost ranking', 'Expiry risk', 'Forecast PO suggestion'],
    invariants: ['Dashboard read-only', 'Analytics reconciles movement ledger'],
    apis: ['/api/v1/analytics/burn-rate', '/api/v1/analytics/expiry-risk'],
    permissions: ['analytics.view'],
    screens: ['Analytics dashboard', 'Compare panel'],
    activity: 'Expiry risk flags L-BER-032 within 34 days',
  },
  {
    key: 'saas',
    phase: '15',
    name: 'SaaS & Enterprise Readiness',
    shortName: 'SaaS',
    responsibility: 'Billing, plans, SSO, SCIM, API keys, webhooks, audit export, platform admin',
    status: 'review',
    health: 52,
    risk: 'Enterprise readiness map present; live integrations pending',
    owner: 'Enterprise',
    entities: ['Plan', 'Subscription', 'UsageMeter', 'SSOConfig', 'SCIMToken', 'ApiKey', 'Webhook'],
    features: ['Plan limit', 'SSO/SCIM', 'API key rotation', 'Audit export', 'Platform admin'],
    invariants: ['Tenant admin never crosses org', 'Platform actions audited'],
    apis: ['/api/v1/billing/plan', '/api/v1/sso-config', '/api/v1/audit/export', '/api/v1/platform/tenants'],
    permissions: ['billing.manage', 'security.sso.manage', 'audit.export'],
    screens: ['Billing', 'SSO/SCIM', 'API keys', 'Platform console'],
    activity: 'Audit export JSON queued for SOC 2 evidence',
  },
]

export const materials: Material[] = [
  {
    id: 'mat-iso',
    name: 'Iso E Super',
    cas: '54464-57-2',
    family: 'Woody amber',
    tier: 'Base',
    vaporPressure: 0.0048,
    density: 0.96,
    mw: 234.38,
    logP: 4.7,
    substantivityHours: 124,
    ifraLimit: 21.4,
    costPerGram: 0.082,
    odor: ['cedar', 'amber', 'velvet'],
    provenance: [
      { field: 'CAS', source: 'SDS Iso E Super', version: 'v3', date: '2026-02-18' },
      { field: 'vaporPressure', source: 'Supplier SDS section 9', version: 'v3', date: '2026-02-18' },
    ],
  },
  {
    id: 'mat-hedione',
    name: 'Hedione',
    cas: '24851-98-7',
    family: 'Jasmine diffusion',
    tier: 'Heart',
    vaporPressure: 0.011,
    density: 1.03,
    mw: 226.31,
    logP: 3.1,
    substantivityHours: 74,
    ifraLimit: 48,
    costPerGram: 0.064,
    odor: ['jasmine', 'tea', 'radiant'],
    provenance: [
      { field: 'density', source: 'CoA HED-2026-011', version: 'v1', date: '2026-03-02' },
      { field: 'cost', source: 'PO-2026-004', version: 'v1', date: '2026-03-01' },
    ],
  },
  {
    id: 'mat-bergamot',
    name: 'Bergamot FCF',
    cas: '8007-75-8',
    family: 'Citrus oil',
    tier: 'Top',
    vaporPressure: 0.92,
    density: 0.88,
    mw: 154.25,
    logP: 2.9,
    substantivityHours: 6,
    ifraLimit: 15,
    costPerGram: 0.19,
    odor: ['sparkling', 'peel', 'green'],
    provenance: [
      { field: 'IFRA', source: 'Curated IFRA baseline', version: '2025-Q4', date: '2025-12-19' },
    ],
  },
  {
    id: 'mat-ambroxan',
    name: 'Ambroxan',
    cas: '6790-58-5',
    family: 'Ambergris',
    tier: 'Base',
    vaporPressure: 0.0008,
    density: 1.02,
    mw: 236.39,
    logP: 5.2,
    substantivityHours: 210,
    ifraLimit: 100,
    costPerGram: 0.31,
    odor: ['ambergris', 'mineral', 'warm'],
    provenance: [
      { field: 'purity', source: 'CoA AMB-2026-006', version: 'v2', date: '2026-02-11' },
    ],
  },
  {
    id: 'mat-muscenone',
    name: 'Muscenone Delta',
    cas: '82356-51-2',
    family: 'Musk',
    tier: 'Base',
    vaporPressure: 0.0003,
    density: 0.94,
    mw: 238.41,
    logP: 5.4,
    substantivityHours: 190,
    ifraLimit: 10,
    costPerGram: 0.48,
    odor: ['musk', 'skin', 'powder'],
    provenance: [
      { field: 'SDS', source: 'SDS Muscenone Delta', version: 'v1', date: '2026-01-21' },
    ],
  },
  {
    id: 'mat-roseoxide',
    name: 'Rose Oxide',
    cas: '16409-43-1',
    family: 'Rosy metallic',
    tier: 'Top',
    vaporPressure: 0.34,
    density: 0.86,
    mw: 154.25,
    logP: 2.7,
    substantivityHours: 12,
    ifraLimit: 2.2,
    costPerGram: 0.27,
    odor: ['rose', 'metallic', 'green'],
    provenance: [
      { field: 'IFRA', source: 'Curated IFRA baseline', version: '2025-Q4', date: '2025-12-19' },
    ],
  },
  {
    id: 'mat-vanillin',
    name: 'Vanillin',
    cas: '121-33-5',
    family: 'Gourmand',
    tier: 'Base',
    vaporPressure: 0.0021,
    density: 1.06,
    mw: 152.15,
    logP: 1.2,
    substantivityHours: 118,
    ifraLimit: 100,
    costPerGram: 0.038,
    odor: ['vanilla', 'creamy', 'sweet'],
    provenance: [
      { field: 'cost', source: 'PO-2026-002', version: 'v1', date: '2026-02-03' },
    ],
  },
  {
    id: 'mat-ethanol',
    name: 'Ethanol 96%',
    cas: '64-17-5',
    family: 'Carrier',
    tier: 'Top',
    vaporPressure: 5.95,
    density: 0.789,
    mw: 46.07,
    logP: -0.3,
    substantivityHours: 1,
    ifraLimit: 100,
    costPerGram: 0.012,
    odor: ['neutral', 'volatile', 'carrier'],
    provenance: [
      { field: 'density', source: 'Supplier SDS section 9', version: 'v5', date: '2026-01-04' },
    ],
  },
]

export const formulas: Formula[] = [
  {
    id: 'frm-accord-citrus',
    code: 'ACC-0007',
    name: 'Citrus Lift Accord',
    version: 'v4',
    status: 'stable',
    targetGrams: 100,
    owner: 'Thuan Le Minh',
    lines: [
      { id: 'acc-l1', label: 'Bergamot FCF', materialId: 'mat-bergamot', grams: 35 },
      { id: 'acc-l2', label: 'Hedione', materialId: 'mat-hedione', grams: 30 },
      { id: 'acc-l3', label: 'Iso E Super', materialId: 'mat-iso', grams: 20 },
      { id: 'acc-l4', label: 'Rose Oxide', materialId: 'mat-roseoxide', grams: 15 },
    ],
  },
  {
    id: 'frm-0421',
    code: 'FRM-0421',
    name: 'Nocturne 17',
    version: 'v12',
    status: 'active',
    targetGrams: 100,
    owner: 'Thuan Le Minh',
    lines: [
      { id: 'frm-l1', label: 'Citrus Lift Accord', childFormulaId: 'frm-accord-citrus', grams: 20 },
      { id: 'frm-l2', label: 'Iso E Super', materialId: 'mat-iso', grams: 24 },
      { id: 'frm-l3', label: 'Hedione', materialId: 'mat-hedione', grams: 18 },
      { id: 'frm-l4', label: 'Ambroxan', materialId: 'mat-ambroxan', grams: 14 },
      { id: 'frm-l5', label: 'Muscenone Delta', materialId: 'mat-muscenone', grams: 2 },
      { id: 'frm-l6', label: 'Vanillin', materialId: 'mat-vanillin', grams: 4 },
      { id: 'frm-l7', label: 'Ethanol 96%', materialId: 'mat-ethanol', grams: 18 },
    ],
  },
]

export const initialLots: InventoryLot[] = [
  { id: 'lot-iso-001', materialId: 'mat-iso', lotNumber: 'L-ISO-031', quantityGrams: 250, reservedGrams: 18, receivedDate: '2026-01-12', expiryDate: '2027-01-12', qualityStatus: 'APPROVED', location: 'Cold Room A', unitCost: 0.081 },
  { id: 'lot-hed-001', materialId: 'mat-hedione', lotNumber: 'L-HED-014', quantityGrams: 186, reservedGrams: 0, receivedDate: '2026-03-04', expiryDate: '2028-03-04', qualityStatus: 'APPROVED', location: 'Amber Shelf 2', unitCost: 0.064 },
  { id: 'lot-ber-001', materialId: 'mat-bergamot', lotNumber: 'L-BER-032', quantityGrams: 42, reservedGrams: 4, receivedDate: '2025-11-22', expiryDate: '2026-08-04', qualityStatus: 'APPROVED', location: 'Fridge B', unitCost: 0.19 },
  { id: 'lot-amb-001', materialId: 'mat-ambroxan', lotNumber: 'L-AMB-006', quantityGrams: 38, reservedGrams: 0, receivedDate: '2026-02-11', expiryDate: '2029-02-11', qualityStatus: 'APPROVED', location: 'Vault C', unitCost: 0.31 },
  { id: 'lot-mus-001', materialId: 'mat-muscenone', lotNumber: 'L-MUS-009', quantityGrams: 12, reservedGrams: 0, receivedDate: '2026-01-22', expiryDate: '2028-01-22', qualityStatus: 'APPROVED', location: 'Vault C', unitCost: 0.48 },
  { id: 'lot-rose-001', materialId: 'mat-roseoxide', lotNumber: 'L-ROX-005', quantityGrams: 9, reservedGrams: 0, receivedDate: '2026-04-02', expiryDate: '2027-04-02', qualityStatus: 'QUARANTINE', location: 'QC Tray', unitCost: 0.27 },
  { id: 'lot-rose-002', materialId: 'mat-roseoxide', lotNumber: 'L-ROX-006', quantityGrams: 6, reservedGrams: 0, receivedDate: '2026-04-18', expiryDate: '2027-04-18', qualityStatus: 'APPROVED', location: 'Vault C', unitCost: 0.28 },
  { id: 'lot-van-001', materialId: 'mat-vanillin', lotNumber: 'L-VAN-021', quantityGrams: 80, reservedGrams: 3, receivedDate: '2026-02-03', expiryDate: '2029-02-03', qualityStatus: 'APPROVED', location: 'Dry Shelf 1', unitCost: 0.038 },
  { id: 'lot-eth-001', materialId: 'mat-ethanol', lotNumber: 'L-ETH-210', quantityGrams: 1400, reservedGrams: 100, receivedDate: '2026-02-01', expiryDate: '2028-02-01', qualityStatus: 'APPROVED', location: 'Flammable Cabinet', unitCost: 0.012 },
]

export const initialMovements: InventoryMovement[] = [
  { id: 'MOV-1028', at: '2026-06-29 14:22', type: 'RECEIPT', direction: 'IN', materialId: 'mat-iso', lotId: 'lot-iso-001', quantityGrams: 250, balanceAfter: 250, ref: 'GR-2026-041', actor: 'Inventory Manager' },
  { id: 'MOV-1027', at: '2026-06-29 11:10', type: 'LAB_CONSUMPTION', direction: 'OUT', materialId: 'mat-hedione', lotId: 'lot-hed-001', quantityGrams: 1.5, balanceAfter: 186, ref: 'LAB-2026-088', actor: 'Perfumer' },
  { id: 'MOV-1026', at: '2026-06-28 17:42', type: 'FULFILLMENT', direction: 'OUT', materialId: 'mat-vanillin', lotId: 'lot-van-001', quantityGrams: 12, balanceAfter: 80, ref: 'SO-2026-092', actor: 'Fulfillment' },
  { id: 'MOV-1025', at: '2026-06-28 09:18', type: 'RECEIPT', direction: 'IN', materialId: 'mat-ambroxan', lotId: 'lot-amb-001', quantityGrams: 40, balanceAfter: 40, ref: 'GR-2026-039', actor: 'Inventory Manager' },
]

export const documents: DocumentRecord[] = [
  { id: 'DOC-118', type: 'SDS', title: 'Iso E Super SDS', linkedTo: 'mat-iso', version: 'v3', sensitivity: 'Confidential', lastAccessed: '2026-06-29 10:44', downloads: 8 },
  { id: 'DOC-119', type: 'CoA', title: 'Hedione CoA HED-2026-011', linkedTo: 'lot-hed-001', version: 'v1', sensitivity: 'Confidential', lastAccessed: '2026-06-30 08:31', downloads: 3 },
  { id: 'DOC-121', type: 'Formula Export', title: 'FRM-0421 v12 Export', linkedTo: 'frm-0421', version: 'v12', sensitivity: 'Highly Confidential', lastAccessed: '2026-06-30 09:22', downloads: 2 },
  { id: 'DOC-124', type: 'Batch Record', title: 'BTH-2025-118 QC Record', linkedTo: 'BTH-2025-118', version: 'v2', sensitivity: 'Internal', lastAccessed: '2026-06-27 16:45', downloads: 5 },
]

export const auditEvents: AuditEvent[] = [
  { id: 'AUD-9144', at: '2026-06-30 09:24', actor: 'Thuan Le Minh', action: 'formula.export', entity: 'FRM-0421', requestId: 'req_8f4d21', outcome: 'allowed' },
  { id: 'AUD-9143', at: '2026-06-30 09:02', actor: 'Owner', action: 'sso.update', entity: 'SSOConfig', requestId: 'req_3920aa', outcome: 'review' },
  { id: 'AUD-9142', at: '2026-06-29 17:18', actor: 'Inventory Manager', action: 'inventory.adjust', entity: 'L-AMB-006', requestId: 'req_a919f2', outcome: 'allowed' },
  { id: 'AUD-9141', at: '2026-06-29 15:38', actor: 'Viewer', action: 'document.download', entity: 'DOC-121', requestId: 'req_49fb11', outcome: 'blocked' },
]

export const records: Record<DomainKey, BusinessRecord[]> = {
  dashboard: [],
  platform: [
    { id: 'ORG-NXL', label: 'NOXELIS Lab Tenant', status: 'active', amount: '2 brands', owner: 'Owner' },
    { id: 'AUD-EXP-006', label: 'Audit export job', status: 'review', amount: 'JSON', owner: 'Security' },
  ],
  identity: [
    { id: 'USR-018', label: 'Owner MFA enforced', status: 'stable', amount: 'TOTP', owner: 'Security' },
    { id: 'ROLE-LAB', label: 'Lab Manager role', status: 'active', amount: '18 permissions', owner: 'Admin' },
  ],
  customization: [
    { id: 'SEQ-FRM', label: 'Formula numbering', status: 'stable', amount: 'FRM-####', owner: 'Admin' },
    { id: 'FLAG-COST', label: 'Hide costing for perfumer', status: 'testing', amount: 'Enabled', owner: 'Finance' },
  ],
  materials: [
    { id: 'MAT-ISO', label: 'Iso E Super', status: 'active', amount: '250g stock', owner: 'Lab Data' },
    { id: 'MAT-BER', label: 'Bergamot FCF', status: 'alert', amount: '34d expiry', owner: 'QC' },
  ],
  formulas: [
    { id: 'FRM-0421', label: 'Nocturne 17', status: 'active', amount: 'v12', owner: 'Perfumer' },
    { id: 'ACC-0007', label: 'Citrus Lift Accord', status: 'stable', amount: '4 leaves', owner: 'Perfumer' },
  ],
  inventory: [
    { id: 'L-ISO-031', label: 'Iso E Super lot', status: 'stable', amount: '250g', owner: 'Inventory' },
    { id: 'L-ROX-005', label: 'Rose Oxide lot', status: 'review', amount: 'QC hold', owner: 'QC' },
  ],
  labUsage: [
    { id: 'LAB-2026-088', label: 'FRM-0421 trial usage', status: 'stable', amount: '1.5g OUT', owner: 'Perfumer' },
    { id: 'LAB-PLAN', label: '12.5g usage preview', status: 'testing', amount: 'FEFO', owner: 'Lab Ops' },
  ],
  documents: [
    { id: 'DOC-121', label: 'FRM-0421 export', status: 'review', amount: 'Highly Confidential', owner: 'Compliance' },
    { id: 'DOC-118', label: 'Iso E Super SDS', status: 'stable', amount: 'v3', owner: 'Lab Data' },
  ],
  production: [
    { id: 'BTH-2025-118', label: 'Nocturne pilot batch', status: 'testing', amount: 'QC', owner: 'Manufacturing' },
    { id: 'QC-0048', label: 'GC-MS checkpoint', status: 'draft', amount: 'Pending', owner: 'QC' },
  ],
  procurement: [
    { id: 'PO-2026-014', label: 'Ambroxan restock', status: 'review', amount: '250g', owner: 'Procurement' },
    { id: 'SUP-003', label: 'Aroma Supplier EU', status: 'stable', amount: 'Preferred', owner: 'Procurement' },
  ],
  commerce: [
    { id: 'SKU-ISO-050', label: 'Iso E Super 50g', status: 'active', amount: '4 tiers', owner: 'Commercial' },
    { id: 'QTE-2026-033', label: 'Studio sample quote', status: 'testing', amount: '$214', owner: 'Sales' },
  ],
  orders: [
    { id: 'SO-2026-092', label: 'Discovery kit order', status: 'active', amount: 'Reserved', owner: 'Fulfillment' },
    { id: 'SHP-2026-041', label: 'Partial shipment', status: 'draft', amount: 'Awaiting CoA', owner: 'Fulfillment' },
  ],
  costing: [
    { id: 'COST-FRM-0421', label: 'Nocturne 17 cost', status: 'testing', amount: '$9.12 / 100g', owner: 'Finance' },
    { id: 'VAL-INV', label: 'Inventory valuation', status: 'stable', amount: '$1,482', owner: 'Finance' },
  ],
  analytics: [
    { id: 'FC-LOW-003', label: 'Low stock forecast', status: 'alert', amount: 'Bergamot', owner: 'Insights' },
    { id: 'BRN-ISO', label: 'Iso E Super burn rate', status: 'stable', amount: '18g / wk', owner: 'Insights' },
  ],
  saas: [
    { id: 'PLAN-GROWTH', label: 'Growth tenant plan', status: 'active', amount: '12 seats', owner: 'Owner' },
    { id: 'SSO-NXL', label: 'OIDC SSO config', status: 'review', amount: 'Domain verified', owner: 'Enterprise' },
  ],
}

const materialById = new Map(materials.map((material) => [material.id, material]))
const formulaById = new Map(formulas.map((formula) => [formula.id, formula]))

export function formatGrams(value: number) {
  return `${value.toFixed(value >= 10 ? 1 : 2)}g`
}

export function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`
}

export function resolveFormula(formulaId: string): ResolvedLeaf[] {
  const root = formulaById.get(formulaId)
  if (!root) {
    return []
  }
  const rootFormula = root

  const leaves: ResolvedLeaf[] = []

  function walk(formula: Formula, scale: number, path: string[]) {
    formula.lines.forEach((line) => {
      const lineGrams = line.grams * scale
      if (line.materialId) {
        const material = materialById.get(line.materialId)
        if (!material) {
          return
        }
        leaves.push({
          materialId: material.id,
          materialName: material.name,
          grams: lineGrams,
          effectivePercent: (lineGrams / rootFormula.targetGrams) * 100,
          cost: lineGrams * material.costPerGram,
          tier: material.tier,
          vaporPressure: material.vaporPressure,
          sourcePath: [...path, line.label].join(' / '),
        })
        return
      }

      if (line.childFormulaId) {
        const child = formulaById.get(line.childFormulaId)
        if (!child) {
          return
        }
        walk(child, lineGrams / child.targetGrams, [...path, line.label])
      }
    })
  }

  walk(root, 1, [root.code])

  return Array.from(
    leaves.reduce((map, leaf) => {
      const existing = map.get(leaf.materialId)
      if (existing) {
        existing.grams += leaf.grams
        existing.effectivePercent += leaf.effectivePercent
        existing.cost += leaf.cost
        existing.sourcePath = `${existing.sourcePath}; ${leaf.sourcePath}`
      } else {
        map.set(leaf.materialId, { ...leaf })
      }
      return map
    }, new Map<string, ResolvedLeaf>()).values(),
  ).sort((a, b) => b.effectivePercent - a.effectivePercent)
}

export function formulaTotals(leaves: ResolvedLeaf[]) {
  const totalCost = leaves.reduce((sum, leaf) => sum + leaf.cost, 0)
  const totalGrams = leaves.reduce((sum, leaf) => sum + leaf.grams, 0)
  const costPerGram = totalGrams > 0 ? totalCost / totalGrams : 0
  const costPerBottle = costPerGram * 50
  return { totalCost, totalGrams, costPerGram, costPerBottle }
}

export function evaporationCurve(leaves: ResolvedLeaf[]) {
  const timepoints = [0, 1, 2, 4, 8, 12, 18, 24]
  const initialByTier: Record<MaterialTier, number> = { Top: 0, Heart: 0, Base: 0 }
  leaves.forEach((leaf) => {
    initialByTier[leaf.tier] += leaf.effectivePercent
  })

  return timepoints.map((hour) => {
    const remaining: Record<MaterialTier, number> = { Top: 0, Heart: 0, Base: 0 }
    leaves.forEach((leaf) => {
      const tau = Math.max(0.7, 7 / Math.sqrt(Math.max(leaf.vaporPressure, 0.0001)))
      const amount = leaf.effectivePercent * Math.exp(-hour / tau)
      remaining[leaf.tier] += amount
    })

    return {
      hour,
      Top: initialByTier.Top ? Math.round((remaining.Top / initialByTier.Top) * 100) : 0,
      Heart: initialByTier.Heart ? Math.round((remaining.Heart / initialByTier.Heart) * 100) : 0,
      Base: initialByTier.Base ? Math.round((remaining.Base / initialByTier.Base) * 100) : 0,
    }
  })
}

export function stockSummary(lots: InventoryLot[]) {
  return materials.map((material) => {
    const materialLots = lots.filter((lot) => lot.materialId === material.id)
    const current = materialLots.reduce((sum, lot) => sum + lot.quantityGrams, 0)
    const reserved = materialLots.reduce((sum, lot) => sum + lot.reservedGrams, 0)
    const available = materialLots
      .filter((lot) => lot.qualityStatus === 'APPROVED')
      .reduce((sum, lot) => sum + Math.max(0, lot.quantityGrams - lot.reservedGrams), 0)
    return { material, current, reserved, available }
  })
}

export function planLabUsage(leaves: ResolvedLeaf[], lots: InventoryLot[], batchGrams: number, formulaTargetGrams: number): LabUsagePlan {
  const allocations: Allocation[] = []
  const shortfalls: LabUsagePlan['shortfalls'] = []
  const remainingByLot = new Map(lots.map((lot) => [lot.id, lot.quantityGrams - lot.reservedGrams]))
  const multiplier = batchGrams / formulaTargetGrams

  leaves.forEach((leaf) => {
    const required = leaf.grams * multiplier
    let remaining = required
    const eligibleLots = lots
      .filter((lot) => lot.materialId === leaf.materialId && lot.qualityStatus === 'APPROVED')
      .sort((a, b) => {
        const expirySort = a.expiryDate.localeCompare(b.expiryDate)
        return expirySort || a.receivedDate.localeCompare(b.receivedDate)
      })

    eligibleLots.forEach((lot) => {
      if (remaining <= 0) {
        return
      }
      const available = Math.max(0, remainingByLot.get(lot.id) ?? 0)
      const allocated = Math.min(available, remaining)
      if (allocated <= 0) {
        return
      }
      remaining -= allocated
      remainingByLot.set(lot.id, available - allocated)
      allocations.push({
        materialId: leaf.materialId,
        materialName: leaf.materialName,
        requiredGrams: required,
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        allocatedGrams: allocated,
        balanceAfter: lot.quantityGrams - allocated,
      })
    })

    if (remaining > 0.0001) {
      shortfalls.push({
        materialId: leaf.materialId,
        materialName: leaf.materialName,
        requiredGrams: required,
        availableGrams: required - remaining,
      })
    }
  })

  return { allocations, shortfalls }
}

export function readinessStats() {
  const done = phases.filter((phase) => phase.status === 'stable' || phase.status === 'active').length
  const avgCoverage = Math.round(phases.reduce((sum, phase) => sum + phase.coverage, 0) / phases.length)
  const risks = domains.filter((domain) => domain.status === 'alert' || domain.health < 55).length
  return { done, avgCoverage, risks }
}
