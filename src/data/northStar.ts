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
  provenance: MaterialProvenance[]
}

export interface MaterialProvenance {
  field: string
  source: string
  version: string
  date: string
}

export interface MaterialIngestionRecord {
  id: string
  materialId: string
  documentType: 'SDS' | 'CoA'
  source: string
  version: string
  status: 'REVIEW_REQUIRED' | 'APPROVED'
  extractedFields: string[]
}

export interface MoleculeComponent {
  id: string
  materialId: string
  name: string
  cas: string
  percent: number
  source: string
  status: 'VERIFIED' | 'REVIEW'
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

export interface FormulaVersionRecord {
  id: string
  formulaId: string
  formulaCode: string
  version: string
  status: 'SNAPSHOT' | 'APPROVED'
  createdAt: string
  createdBy: string
  note: string
  lineCount: number
  totalGrams: number
  totalCost: number
  checksum: string
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

export type LotQualityStatus = 'APPROVED' | 'QUARANTINE' | 'ON_HOLD' | 'REJECTED' | 'EXPIRED'

export interface InventoryLot {
  id: string
  materialId: string
  lotNumber: string
  quantityGrams: number
  reservedGrams: number
  receivedDate: string
  expiryDate: string
  qualityStatus: LotQualityStatus
  location: string
  unitCost: number
  supplierLotRef?: string
  currency?: string
  retestDate?: string
  openedDate?: string
  shelfLifeAfterOpeningDays?: number
  container?: string
  packaging?: string
  coaDocumentId?: string
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
    | 'TRANSFER'
  direction: 'IN' | 'OUT' | 'MOVE'
  materialId: string
  lotId: string
  quantityGrams: number
  balanceAfter: number
  ref: string
  actor: string
}

export interface StorageLocation {
  id: string
  name: string
  zone: string
  condition: string
  capacityGrams: number
  parentId?: string
  kind?: 'Warehouse' | 'Room' | 'Shelf' | 'Bin' | 'Transit'
  light?: 'Dark' | 'Amber' | 'Ambient'
  temperatureRange?: string
  status?: 'ACTIVE' | 'IN_TRANSIT'
}

export interface StockTakeRecord {
  id: string
  at: string
  lotId: string
  lotNumber: string
  expectedGrams: number
  countedGrams: number
  varianceGrams: number
  reason: string
  actor: string
  status: 'MATCHED' | 'ADJUSTED'
  movementId?: string
}

export interface LotLabelPayload {
  lotId: string
  lotNumber: string
  materialName: string
  storageText: string
  qualityStatus: LotQualityStatus
  expiryDate: string
  qrValue: string
}

export interface InventoryReorderSuggestion {
  materialId: string
  materialName: string
  availableGrams: number
  reorderPointGrams: number
  suggestedOrderGrams: number
  reason: string
}

export type DocumentSensitivity = 'Internal' | 'Confidential' | 'Highly Confidential'

export type DocumentType =
  | 'SDS'
  | 'CoA'
  | 'IFRA'
  | 'Invoice'
  | 'Formula Export'
  | 'Batch Record'
  | 'Allergen Declaration'
  | 'GHS Label'
  | 'Formula Spec Sheet'
  | 'Finished Product SDS'

export type DocumentStatus = 'APPROVED' | 'REVIEW_REQUIRED' | 'EXPIRING' | 'EXPIRED' | 'SHARED'

export interface DocumentRecord {
  id: string
  type: DocumentType
  title: string
  linkedTo: string
  version: string
  sensitivity: DocumentSensitivity
  status: DocumentStatus
  issueDate?: string
  expiresAt?: string
  lastAccessed: string
  downloads: number
  storageKey: string
  mimeType: string
  sizeKb: number
  checksum: string
  owner: string
  generatedFrom?: string
}

export interface DocumentComplianceRequirement {
  id: string
  scope: 'material' | 'lot' | 'formula'
  linkedTo: string
  label: string
  requiredType: DocumentType
  status: 'met' | 'missing' | 'expiring' | 'review'
  documentId?: string
  dueDate?: string
}

export interface DocumentComplianceDashboard {
  coveragePercent: number
  totalRequired: number
  metCount: number
  missingCount: number
  expiringCount: number
  reviewCount: number
  generatedCount: number
  requirements: DocumentComplianceRequirement[]
  expiringDocuments: DocumentRecord[]
  invariant: string
}

export interface SignedDocumentUrl {
  url: string
  expiresAt: string
  ttlSeconds: number
  method: 'GET'
}

export interface DocumentShareLink {
  url: string
  recipient: string
  expiresAt: string
  ttlSeconds: number
  permission: 'external-view'
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

export interface OrganizationRecord {
  id: string
  name: string
  slug: string
  plan: 'Free' | 'Pro' | 'Team' | 'Enterprise'
  status: 'ACTIVE' | 'FROZEN' | 'SUSPENDED'
  primaryContact: string
  createdAt: string
}

export interface BrandRecord {
  id: string
  organizationId: string
  name: string
  status: 'ACTIVE' | 'ARCHIVED'
  defaultCurrency: string
}

export interface MembershipRecord {
  id: string
  userId: string
  email: string
  name: string
  organizationId: string
  brandIds: string[]
  role: string
  status: 'ACTIVE' | 'INVITED' | 'DEACTIVATED'
  mfaEnabled: boolean
  lastActiveAt: string
  invitedAt?: string
}

export interface RolePolicy {
  role: string
  scope: 'organization' | 'platform'
  mfaRequired: boolean
  permissions: string[]
}

export interface PermissionDefinition {
  key: string
  label: string
  category: string
  scope: 'organization' | 'platform'
  risk: 'low' | 'medium' | 'high' | 'critical'
  description: string
}

export interface TenantSecurityPolicy {
  organizationId: string
  mfaRequiredForOwnerAdmin: boolean
  sessionTimeoutMinutes: number
  idleTimeoutMinutes: number
  absoluteSessionMinutes: number
  concurrentSessionLimit: number
  newDeviceAlertEnabled: boolean
  ipAllowlist: string[]
  passwordPolicy: string
}

export interface AuthSession {
  id: string
  userId: string
  email: string
  organizationId: string
  brandId: string
  role: string
  issuedAt: string
  lastSeenAt: string
  idleExpiresAt: string
  expiresAt: string
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED'
  mfaVerified: boolean
  ipAddress: string
  userAgent: string
  deviceId: string
  location: string
  revokedAt?: string
  revokedReason?: string
}

export interface TenantSettingsRecord {
  organizationId: string
  locale: string
  timezone: string
  currency: string
  defaultUnit: 'g' | 'ml'
  defaultDilutionPercent: number
}

export interface FeatureFlagRecord {
  key: string
  label: string
  enabled: boolean
  phase: number
}

export interface NumberingSequenceRecord {
  key: string
  pattern: string
  nextValue: number
  scope: 'organization' | 'brand'
}

export interface CustomFieldDefinition {
  id: string
  entity: 'material' | 'formula' | 'lot' | 'document' | 'supplier' | 'order'
  key: string
  label: string
  fieldType: 'text' | 'number' | 'select' | 'date' | 'boolean'
  required: boolean
  options: string[]
  status: 'ACTIVE' | 'ARCHIVED'
}

export interface BrandingConfig {
  organizationId: string
  displayName: string
  accentColor: string
  documentFooter: string
  labelTemplate: string
  logoMode: 'wordmark' | 'monogram'
}

export interface ProductionBatchRecord {
  id: string
  formulaId: string
  formulaCode: string
  status: 'PLANNED' | 'WEIGHING' | 'MACERATION' | 'FILTRATION' | 'QC' | 'BOTTLING' | 'RELEASED' | 'HOLD'
  targetGrams: number
  consumedGrams: number
  qcStatus: 'PENDING' | 'PASSED' | 'FAILED'
  owner: string
}

export interface SupplierRecord {
  id: string
  name: string
  status: DomainStatus
  country: string
  leadTimeDays: number
  contactEmail: string
  paymentTerms: string
  preferredMaterialIds: string[]
}

export interface PurchaseOrderRecord {
  id: string
  supplierId: string
  materialId: string
  quantityGrams: number
  receivedGrams: number
  status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED'
  expectedDate: string
  unitCost: number
  currency: string
  createdAt: string
}

export interface PriceHistoryRecord {
  id: string
  materialId: string
  supplierId: string
  purchaseOrderId: string
  unitCost: number
  currency: string
  quantityGrams: number
  capturedAt: string
  source: 'PO_RECEIPT' | 'QUOTE'
}

export interface CommercialSkuRecord {
  id: string
  materialId: string
  name: string
  description: string
  packSizeGrams: number
  price: number
  currency: string
  tier: 'Studio' | 'Lab' | 'Bulk'
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  moqPacks: number
  labelTemplate: string
}

export interface PriceListRecord {
  id: string
  name: string
  customerGroup: 'Studio' | 'Lab' | 'Bulk' | 'Contract'
  currency: string
  multiplier: number
  sampleEligible: boolean
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
}

export interface QuoteRecord {
  id: string
  skuId: string
  customer: string
  customerGroup: PriceListRecord['customerGroup']
  quantityPacks: number
  unitPrice: number
  total: number
  currency: string
  status: 'DRAFT' | 'REVIEW' | 'SENT'
  createdAt: string
}

export interface SampleRequestRecord {
  id: string
  skuId: string
  customer: string
  packs: number
  status: 'REQUESTED' | 'APPROVED' | 'CONVERTED'
  createdAt: string
}

export interface SalesOrderRecord {
  id: string
  skuId: string
  customer: string
  quantity: number
  reservedGrams: number
  fulfilledGrams: number
  status: 'DRAFT' | 'RESERVED' | 'FULFILLED' | 'BACKORDER'
}

export interface BillingPlanRecord {
  id: string
  name: string
  seats: number
  storageGb: number
  apiQuota: number
  monthlyPrice: number
}

export interface SsoConfigRecord {
  id: string
  provider: 'OIDC' | 'SAML'
  domain: string
  status: 'draft' | 'verified'
  roleMapping: Record<string, string>
}

export interface ApiKeyRecord {
  id: string
  label: string
  lastFour: string
  scopes: string[]
  rotatedAt: string
  status: 'active' | 'revoked'
}

export interface WebhookRecord {
  id: string
  url: string
  events: string[]
  status: 'active' | 'paused'
  lastDelivery: string
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

export interface LabWeighingLine {
  materialId: string
  materialName: string
  lotId: string
  lotNumber: string
  targetGrams: number
  actualGrams: number
  deviationGrams: number
  deviationPercent: number
  withinTolerance: boolean
}

export interface LabWeighingSession {
  id: string
  formulaId: string
  formulaCode: string
  targetBatchGrams: number
  tolerancePercent: number
  operator: string
  status: 'READY' | 'NEEDS_REVIEW'
  lines: LabWeighingLine[]
  createdAt: string
}

export type LabUsagePurpose = 'trial' | 'sample' | 'production-prep' | 'qc' | 'waste'

export interface LabUsageRecord {
  id: string
  formulaId: string
  formulaCode: string
  grams: number
  batchGrams: number
  status: 'COMMITTED' | 'REVERSED'
  purpose: LabUsagePurpose
  projectCode?: string
  sampleCode?: string
  qcLink?: string
  allocations: Allocation[]
  weighingSession?: LabWeighingSession
  createdAt: string
  reversedAt?: string
  reversalMovements?: InventoryMovement[]
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
  { id: 2, name: 'Tenant/Auth/Security', domain: 'identity', goal: 'Org, brand, user, session, RBAC, audit', gate: 'Tenant isolation tests pass', status: 'active', securityLayer: 'L2/L4', coverage: 86 },
  { id: 3, name: 'Customization Core', domain: 'customization', goal: 'Settings, flags, fields, numbering, branding', gate: 'Config without fork', status: 'active', securityLayer: 'L0', coverage: 84 },
  { id: 4, name: 'Material Intelligence', domain: 'materials', goal: 'Material master, SDS, provenance, molecules', gate: 'Searchable, sourced data', status: 'active', securityLayer: 'L5', coverage: 90 },
  { id: 5, name: 'Formula R&D', domain: 'formulas', goal: 'Nested formulas, resolve, version, IFRA, cost', gate: 'Save does not consume stock', status: 'active', securityLayer: 'L4/L5', coverage: 90 },
  { id: 6, name: 'Lab Inventory Core', domain: 'inventory', goal: 'Lots, movements, FEFO, QC, stock take', gate: 'Only movement changes stock', status: 'active', securityLayer: 'L5', coverage: 92 },
  { id: 7, name: 'Lab Usage Traceability', domain: 'labUsage', goal: 'Commit and reverse usage with audit', gate: 'OUT and IN compensation verified', status: 'active', securityLayer: 'L5', coverage: 84 },
  { id: 8, name: 'Documents & Compliance', domain: 'documents', goal: 'Private docs, signed URL, generation, compliance coverage', gate: 'Access logged and coverage visible', status: 'active', securityLayer: 'L5', coverage: 76 },
  { id: 9, name: 'Production Batch', domain: 'production', goal: 'Approved formula to batch, QC, lifecycle', gate: 'Production separate from lab trial', status: 'active', securityLayer: 'L5', coverage: 78 },
  { id: 10, name: 'Procurement', domain: 'procurement', goal: 'Supplier, PO, goods receipt, price history', gate: 'Low stock to receipt works', status: 'active', securityLayer: 'L4/L5', coverage: 78 },
  { id: 11, name: 'Commerce', domain: 'commerce', goal: 'SKU, pack size, price list, quote/sample', gate: 'Commerce stock reads inventory', status: 'active', securityLayer: 'L4', coverage: 74 },
  { id: 12, name: 'Orders & Fulfillment', domain: 'orders', goal: 'Orders, reservation, shipment, fulfillment', gate: 'Reservation is not movement', status: 'testing', securityLayer: 'L5', coverage: 62 },
  { id: 13, name: 'Costing & Finance', domain: 'costing', goal: 'Formula, batch, SKU costs, valuation', gate: 'Cost trace reconciles', status: 'testing', securityLayer: 'L4/L5', coverage: 58 },
  { id: 14, name: 'Analytics', domain: 'analytics', goal: 'Burn rate, forecast, expiry, compare', gate: 'Read-only dashboard', status: 'testing', securityLayer: 'L4', coverage: 56 },
  { id: 15, name: 'SaaS Readiness', domain: 'saas', goal: 'Billing, SSO, SCIM, API keys, audit export', gate: 'Enterprise controls present', status: 'testing', securityLayer: 'L6/L7/L8', coverage: 66 },
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
    status: 'active',
    health: 86,
    risk: 'Tenant console, invite-only membership, session revocation, and probes live; secure cookies remain next gate',
    owner: 'Security',
    entities: ['User', 'Membership', 'Role', 'Permission', 'Session', 'MFASecret'],
    features: ['Tenant console', 'Invite-only membership', 'Session revocation', 'RBAC matrix', 'MFA enforcement', 'Suspicious login alert'],
    invariants: ['INV-SEC-001 auth default', 'INV-SEC-004 tenant query scope', 'INV-SEC-011 no deploy if tenant tests fail'],
    apis: ['/api/v1/auth/login', '/api/v1/me', '/api/v1/security/tenant-console', '/api/v1/security/members/invite', '/api/v1/security/sessions/:id/revoke'],
    permissions: ['security.manageUsers', 'security.viewAuditLog'],
    screens: ['Login', 'MFA', 'Tenant console', 'Users and roles', 'Security policy'],
    activity: 'Tenant console can invite members, block cross-org probes, and revoke sessions',
  },
  {
    key: 'customization',
    phase: '3',
    name: 'Customization Core',
    shortName: 'Customization',
    responsibility: 'Tenant settings, feature flags, custom fields, numbering, branding',
    status: 'active',
    health: 84,
    risk: 'Settings, flags, custom fields, numbering, and branding are live; workflow designer remains next gate',
    owner: 'Product Ops',
    entities: ['CustomFieldDefinition', 'NumberingSequence', 'BrandingConfig', 'WorkflowDefinition'],
    features: ['Tenant settings', 'Feature flags', 'Custom fields', 'Numbering pattern', 'Export branding'],
    invariants: ['INV-010 config not fork', 'Config changes audit logged'],
    apis: ['/api/v1/settings', '/api/v1/custom-fields', '/api/v1/numbering-sequences'],
    permissions: ['customization.manage'],
    screens: ['Tenant settings', 'Fields', 'Branding', 'Workflow'],
    activity: 'Customization workspace updates settings, flags, fields, numbering, and branding without code forks',
  },
  {
    key: 'materials',
    phase: '4',
    name: 'Material Intelligence',
    shortName: 'Materials',
    responsibility: 'Material master, SDS/CoA ingestion, provenance, molecule data',
    status: 'active',
    health: 90,
    risk: 'Material create/update, CAS duplicate guard, SDS review, PubChem fill, molecule split, and provenance are live',
    owner: 'Lab Data',
    entities: ['Material', 'Molecule', 'OdorProfile', 'IFRADataRef', 'CostSnapshot', 'MaterialIngestion'],
    features: ['Material CRUD', 'CAS duplicate guard', 'SDS/CoA review ingest', 'PubChem fill', 'Molecule split', 'Field provenance'],
    invariants: ['INV-003 material has no stock', 'INV-014 vapor pressure on leaf', 'INV-015 provenance required'],
    apis: ['/api/v1/materials', '/api/v1/materials/:id/ingest', '/api/v1/materials/:id/pubchem-fill', '/api/v1/materials/:id/molecules', '/api/v1/materials/:id/provenance'],
    permissions: ['materials.view', 'materials.create', 'materials.update'],
    screens: ['Material list', 'Intelligence console', 'SDS review', 'Molecule split'],
    activity: 'Iso E Super SDS v3 updates density/vapor pressure with reviewed provenance',
  },
  {
    key: 'formulas',
    phase: '5',
    name: 'Formula R&D',
    shortName: 'Formulas',
    responsibility: 'Formula tree, nested accords, versions, resolve, IFRA, evaporation',
    status: 'active',
    health: 90,
    risk: 'Nested line editing, version snapshots, approval, export audit, resolve, and cost roll-up are live',
    owner: 'Perfumer Team',
    entities: ['Formula', 'FormulaLine', 'FormulaVersion', 'ReviewRecord'],
    features: ['Gram-first editor', 'Nested accord', 'Line edit/delete/reorder', 'Version snapshot', 'Approval state', 'Formula export audit', 'Cost roll-up', 'Evaporation curve'],
    invariants: ['INV-006 save non-consuming', 'INV-007 explicit consumption only', 'INV-013 resolve before compute'],
    apis: ['/api/v1/formulas', '/api/v1/formulas/:id/lines', '/api/v1/formulas/:id/lines/:lineId', '/api/v1/formulas/:id/versions', '/api/v1/formulas/:id/approve', '/api/v1/formulas/:id/export', '/api/v1/formulas/:id/resolve', '/api/v1/formulas/:id/cost'],
    permissions: ['formulas.view', 'formulas.viewSensitive', 'formulas.export'],
    screens: ['Formula table', 'Nested editor', 'Line controls', 'Resolve preview', 'Version history', 'Approval and export'],
    activity: 'FRM-0421 can snapshot, approve, export, and resolve nested accord leaves without stock movement',
  },
  {
    key: 'inventory',
    phase: '6',
    name: 'Lab Inventory Core',
    shortName: 'Inventory',
    responsibility: 'Receipt, lot, QC status, stock take, locations, immutable movement ledger, FEFO',
    status: 'active',
    health: 92,
    risk: 'Stock take and QC changes are controlled; quantity deltas still require immutable movement evidence',
    owner: 'Inventory',
    entities: ['InventoryReceipt', 'InventoryLot', 'InventoryMovement', 'StorageLocation', 'StockTakeRecord', 'StockReservation'],
    features: ['Receive stock', 'Movement ledger', 'Adjustment', 'Transfer', 'QC workflow', 'Stock take', 'QR label', 'Lot genealogy', 'Reorder suggestion'],
    invariants: ['INV-004 ledger source of truth', 'INV-005 no negative', 'INV-016 reservation != movement'],
    apis: ['/api/v1/inventory/console', '/api/v1/inventory/receipts', '/api/v1/inventory/stock-takes', '/api/v1/lots/:id/quality', '/api/v1/lots/:id/label', '/api/v1/lots/:id/genealogy'],
    permissions: ['inventory.view', 'inventory.receive', 'inventory.adjust', 'inventory.qc', 'inventory.stockTake'],
    screens: ['Lots', 'Ledger', 'Receipt form', 'Summary', 'QC workflow', 'Stock take', 'Labels', 'Shopping list'],
    activity: 'QC release, stock take reconciliation, labels, genealogy, and reorder suggestions are live',
  },
  {
    key: 'labUsage',
    phase: '7',
    name: 'Lab Usage Traceability',
    shortName: 'Lab Usage',
    responsibility: 'Commit and reverse lab usage from formula version to lot movements',
    status: 'active',
    health: 84,
    risk: 'Transaction API, usage history, weighing evidence, and reverse-by-id are live; partial reverse and print sheets remain next gates',
    owner: 'Lab Ops',
    entities: ['FormulaLabUsage', 'InventoryMovement'],
    features: ['Commit usage', 'Reverse usage', 'Multi-lot allocation', 'Usage history', 'Actual weighing evidence', 'Purpose and sample metadata'],
    invariants: ['INV-007 explicit consumption', 'INV-008 reverse by compensation'],
    apis: ['/api/v1/lab-usage', '/api/v1/lab-usage/:id', '/api/v1/lab-usage/plan', '/api/v1/lab-usage/weighing-session', '/api/v1/lab-usage/commit', '/api/v1/lab-usage/:id/reverse'],
    permissions: ['inventory.commitLabUsage', 'inventory.reverseLabUsage'],
    screens: ['Commit flow', 'Actual weighing session', 'Reverse popup', 'History'],
    activity: 'FRM-0421 can commit actual weighed usage via API and reverse the committed record by compensation',
  },
  {
    key: 'documents',
    phase: '8',
    name: 'Documents & Compliance',
    shortName: 'Documents',
    responsibility: 'Private file storage, signed URLs, versioning, download audit',
    status: 'active',
    health: 76,
    risk: 'Signed URL, download audit, generated documents, and coverage dashboard are live; external sharing and approval workflow remain next gates',
    owner: 'Compliance',
    entities: ['Document', 'DocumentVersion', 'DownloadAuditLog'],
    features: ['Document center', 'Signed URL', 'Versioning', 'Download audit', 'Export', 'Generate documents', 'Compliance dashboard'],
    invariants: ['INV-011 documents private', 'SEC-DATA-001 private bucket'],
    apis: ['/api/v1/documents', '/api/v1/documents/compliance-dashboard', '/api/v1/documents/generate', '/api/v1/documents/:id/signed-url'],
    permissions: ['documents.view', 'documents.download', 'documents.manage'],
    screens: ['Document center', 'Compliance dashboard', 'Generate document', 'Download audit', 'Formula export'],
    activity: 'Compliance can generate a CoA/spec document, see missing/expiring coverage, and sign access only after permission',
  },
  {
    key: 'production',
    phase: '9',
    name: 'Production Batch',
    shortName: 'Production',
    responsibility: 'Approved formula to production batch, QC, lifecycle, yield',
    status: 'testing',
    health: 64,
    risk: 'Batch create, consume, QC, and lifecycle controls are live; persistence remains next gate',
    owner: 'Manufacturing',
    entities: ['ProductionBatch', 'BatchConsumption', 'QCRecord'],
    features: ['Scale batch', 'Consume lots', 'QC checkpoint', 'Lifecycle state machine', 'Yield reconcile'],
    invariants: ['Production movement separated from lab usage', 'Batch records no hard-delete'],
    apis: ['/api/v1/batches', '/api/v1/batches/:id/consume', '/api/v1/batches/:id/qc', '/api/v1/batches/:id/status'],
    permissions: ['production.view', 'production.consume', 'production.qc'],
    screens: ['Batch timeline', 'QC record', 'Batch cost'],
    activity: 'Production batches advance through consume, filtration, QC, bottling, and release gates',
  },
  {
    key: 'procurement',
    phase: '10',
    name: 'Procurement',
    shortName: 'Procurement',
    responsibility: 'Supplier, PO, goods receipt, inventory receipt, price history',
    status: 'active',
    health: 78,
    risk: 'Supplier master, low-stock PO, receipt, and price history controls are live; RFQ comparison remains next gate',
    owner: 'Procurement',
    entities: ['Supplier', 'PurchaseOrder', 'POLine', 'GoodsReceipt', 'PriceHistory'],
    features: ['Supplier master', 'Low-stock to PO', 'PO send/receive', 'Partial goods receipt', 'Price history'],
    invariants: ['Goods receipt creates lot and IN movement', 'Price history immutable'],
    apis: ['/api/v1/suppliers', '/api/v1/purchase-orders', '/api/v1/purchase-orders/:id/receive', '/api/v1/materials/:id/price-history'],
    permissions: ['procurement.view', 'procurement.manage'],
    screens: ['Supplier list', 'PO board', 'Goods receipt'],
    activity: 'Low-stock suggestion can create PO; goods receipt creates lot, RECEIPT movement, and price snapshot',
  },
  {
    key: 'commerce',
    phase: '11',
    name: 'Aroma Materials Commerce',
    shortName: 'Commerce',
    responsibility: 'SKU, pack size, price list, quote, sample, neutral labels',
    status: 'active',
    health: 74,
    risk: 'Catalog, price-list, quote, and sample flows read inventory availability without creating stock movement; storefront remains next gate',
    owner: 'Commercial',
    entities: ['CommercialSKU', 'PackSize', 'PriceList', 'Sample', 'Quote'],
    features: ['SKU availability', 'Pack conversion', 'Price tiers', 'Quote builder', 'Sample queue', 'White-label label'],
    invariants: ['SKU does not hold separate stock', 'Label uses tenant branding'],
    apis: ['/api/v1/catalog/skus', '/api/v1/price-lists', '/api/v1/quotes', '/api/v1/samples'],
    permissions: ['commerce.view', 'commerce.manage'],
    screens: ['Catalog', 'Quote builder', 'Sample queue'],
    activity: 'Commercial SKU cards, quote totals, and sample queue derive availability from approved lot summary',
  },
  {
    key: 'orders',
    phase: '12',
    name: 'Orders & Fulfillment',
    shortName: 'Orders',
    responsibility: 'Sales order, reservation, shipment, fulfillment movement',
    status: 'testing',
    health: 62,
    risk: 'Reserve and fulfill APIs live; shipment docs remain next gate',
    owner: 'Fulfillment',
    entities: ['SalesOrder', 'OrderLine', 'StockReservation', 'Shipment'],
    features: ['Reserve stock', 'Release reservation', 'Fulfill OUT', 'Partial/backorder'],
    invariants: ['INV-016 reservation != movement', 'No negative stock'],
    apis: ['/api/v1/orders', '/api/v1/orders/:id/reserve', '/api/v1/orders/:id/fulfill'],
    permissions: ['orders.view', 'orders.reserve', 'orders.fulfill'],
    screens: ['Order queue', 'Reservation drawer', 'Shipment'],
    activity: 'SO-2026-092 reserve creates no movement; fulfill creates OUT movement',
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
    status: 'testing',
    health: 66,
    risk: 'Plan, SSO, API key, webhook, audit export APIs live; external integrations pending',
    owner: 'Enterprise',
    entities: ['Plan', 'Subscription', 'UsageMeter', 'SSOConfig', 'SCIMToken', 'ApiKey', 'Webhook'],
    features: ['Plan limit', 'SSO/SCIM', 'API key rotation', 'Audit export', 'Platform admin'],
    invariants: ['Tenant admin never crosses org', 'Platform actions audited'],
    apis: ['/api/v1/billing/plan', '/api/v1/sso-config', '/api/v1/audit/export', '/api/v1/platform/tenants'],
    permissions: ['billing.manage', 'security.sso.manage', 'audit.export'],
    screens: ['Billing', 'SSO/SCIM', 'API keys', 'Platform console'],
    activity: 'Audit export queues tenant-scoped SOC 2 evidence job',
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

export const moleculeComponents: MoleculeComponent[] = [
  {
    id: 'mol-iso-001',
    materialId: 'mat-iso',
    name: 'Tetramethyl acetyloctahydronaphthalenes',
    cas: '54464-57-2',
    percent: 88,
    source: 'SDS Iso E Super section 3',
    status: 'VERIFIED',
  },
  {
    id: 'mol-iso-002',
    materialId: 'mat-iso',
    name: 'Amber woody isomer blend',
    cas: '54464-59-4',
    percent: 12,
    source: 'Supplier CoA note',
    status: 'REVIEW',
  },
  {
    id: 'mol-hed-001',
    materialId: 'mat-hedione',
    name: 'Methyl dihydrojasmonate',
    cas: '24851-98-7',
    percent: 94,
    source: 'CoA HED-2026-011',
    status: 'VERIFIED',
  },
  {
    id: 'mol-berg-001',
    materialId: 'mat-bergamot',
    name: 'Limonene',
    cas: '5989-27-5',
    percent: 38,
    source: 'Supplier SDS section 3',
    status: 'REVIEW',
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

export const formulaVersions: FormulaVersionRecord[] = [
  {
    id: 'FRM-0421-v12',
    formulaId: 'frm-0421',
    formulaCode: 'FRM-0421',
    version: 'v12',
    status: 'APPROVED',
    createdAt: '2026-06-30T09:16:00.000Z',
    createdBy: 'Thuan Le Minh',
    note: 'Approved Nocturne 17 working version for lab trial and export.',
    lineCount: 7,
    totalGrams: 100,
    totalCost: 9.12,
    checksum: 'sha256:frm0421-v12-approved',
    lines: structuredClone(formulas[1]?.lines ?? []),
  },
  {
    id: 'ACC-0007-v4',
    formulaId: 'frm-accord-citrus',
    formulaCode: 'ACC-0007',
    version: 'v4',
    status: 'APPROVED',
    createdAt: '2026-06-24T08:10:00.000Z',
    createdBy: 'Thuan Le Minh',
    note: 'Citrus Lift Accord approved as reusable nested accord.',
    lineCount: 4,
    totalGrams: 100,
    totalCost: 10.88,
    checksum: 'sha256:acc0007-v4-approved',
    lines: structuredClone(formulas[0]?.lines ?? []),
  },
]

export const initialLots: InventoryLot[] = [
  {
    id: 'lot-iso-001',
    materialId: 'mat-iso',
    lotNumber: 'L-ISO-031',
    quantityGrams: 250,
    reservedGrams: 18,
    receivedDate: '2026-01-12',
    expiryDate: '2027-01-12',
    qualityStatus: 'APPROVED',
    location: 'Cold Room A',
    unitCost: 0.081,
    supplierLotRef: 'SY-ISO-26-031',
    currency: 'USD',
    retestDate: '2026-10-12',
    openedDate: '2026-02-04',
    shelfLifeAfterOpeningDays: 365,
    container: 'Amber glass bottle',
    packaging: '250g bottle',
  },
  {
    id: 'lot-hed-001',
    materialId: 'mat-hedione',
    lotNumber: 'L-HED-014',
    quantityGrams: 186,
    reservedGrams: 0,
    receivedDate: '2026-03-04',
    expiryDate: '2028-03-04',
    qualityStatus: 'APPROVED',
    location: 'Amber Shelf 2',
    unitCost: 0.064,
    supplierLotRef: 'HED-2026-011',
    currency: 'USD',
    retestDate: '2027-03-04',
    container: 'HDPE canister',
    packaging: '500g canister',
    coaDocumentId: 'DOC-119',
  },
  {
    id: 'lot-ber-001',
    materialId: 'mat-bergamot',
    lotNumber: 'L-BER-032',
    quantityGrams: 42,
    reservedGrams: 4,
    receivedDate: '2025-11-22',
    expiryDate: '2026-08-04',
    qualityStatus: 'APPROVED',
    location: 'Fridge B',
    unitCost: 0.19,
    supplierLotRef: 'CIT-BO-090',
    currency: 'EUR',
    retestDate: '2026-07-21',
    openedDate: '2026-03-11',
    shelfLifeAfterOpeningDays: 180,
    container: 'Aluminum flask',
    packaging: '100g flask',
  },
  {
    id: 'lot-amb-001',
    materialId: 'mat-ambroxan',
    lotNumber: 'L-AMB-006',
    quantityGrams: 38,
    reservedGrams: 0,
    receivedDate: '2026-02-11',
    expiryDate: '2029-02-11',
    qualityStatus: 'APPROVED',
    location: 'Vault C',
    unitCost: 0.31,
    supplierLotRef: 'AMB-C-006',
    currency: 'USD',
    retestDate: '2028-02-11',
    container: 'Sealed tin',
    packaging: '50g tin',
  },
  {
    id: 'lot-mus-001',
    materialId: 'mat-muscenone',
    lotNumber: 'L-MUS-009',
    quantityGrams: 12,
    reservedGrams: 0,
    receivedDate: '2026-01-22',
    expiryDate: '2028-01-22',
    qualityStatus: 'APPROVED',
    location: 'Vault C',
    unitCost: 0.48,
    supplierLotRef: 'MUS-7781',
    currency: 'USD',
    retestDate: '2027-01-22',
    container: 'Amber vial',
    packaging: '25g vial',
  },
  {
    id: 'lot-rose-001',
    materialId: 'mat-roseoxide',
    lotNumber: 'L-ROX-005',
    quantityGrams: 9,
    reservedGrams: 0,
    receivedDate: '2026-04-02',
    expiryDate: '2027-04-02',
    qualityStatus: 'QUARANTINE',
    location: 'QC Tray',
    unitCost: 0.27,
    supplierLotRef: 'ROX-QC-005',
    currency: 'USD',
    retestDate: '2026-07-15',
    container: 'QC sample vial',
    packaging: '10g vial',
  },
  {
    id: 'lot-rose-002',
    materialId: 'mat-roseoxide',
    lotNumber: 'L-ROX-006',
    quantityGrams: 6,
    reservedGrams: 0,
    receivedDate: '2026-04-18',
    expiryDate: '2027-04-18',
    qualityStatus: 'APPROVED',
    location: 'Vault C',
    unitCost: 0.28,
    supplierLotRef: 'ROX-006',
    currency: 'USD',
    retestDate: '2027-01-18',
    container: 'Amber vial',
    packaging: '10g vial',
  },
  {
    id: 'lot-van-001',
    materialId: 'mat-vanillin',
    lotNumber: 'L-VAN-021',
    quantityGrams: 80,
    reservedGrams: 3,
    receivedDate: '2026-02-03',
    expiryDate: '2029-02-03',
    qualityStatus: 'APPROVED',
    location: 'Dry Shelf 1',
    unitCost: 0.038,
    supplierLotRef: 'VAN-2026-A',
    currency: 'USD',
    retestDate: '2028-02-03',
    container: 'Fiber drum',
    packaging: '1kg drum',
  },
  {
    id: 'lot-eth-001',
    materialId: 'mat-ethanol',
    lotNumber: 'L-ETH-210',
    quantityGrams: 1400,
    reservedGrams: 100,
    receivedDate: '2026-02-01',
    expiryDate: '2028-02-01',
    qualityStatus: 'APPROVED',
    location: 'Flammable Cabinet',
    unitCost: 0.012,
    supplierLotRef: 'ETH-96-210',
    currency: 'USD',
    retestDate: '2027-02-01',
    openedDate: '2026-05-14',
    shelfLifeAfterOpeningDays: 365,
    container: 'Safety can',
    packaging: '2L can',
  },
]

export const storageLocations: StorageLocation[] = [
  { id: 'loc-wh', name: 'Main Warehouse', zone: 'Warehouse', condition: 'Controlled receiving', capacityGrams: 25000, kind: 'Warehouse', light: 'Ambient', temperatureRange: '18-22C', status: 'ACTIVE' },
  { id: 'loc-cold-a', name: 'Cold Room A', zone: 'Warehouse', condition: '15-18C / dark', capacityGrams: 5000, parentId: 'loc-wh', kind: 'Room', light: 'Dark', temperatureRange: '15-18C', status: 'ACTIVE' },
  { id: 'loc-amber-2', name: 'Amber Shelf 2', zone: 'Lab', condition: 'Ambient / amber glass', capacityGrams: 2400, parentId: 'loc-wh', kind: 'Shelf', light: 'Amber', temperatureRange: '18-22C', status: 'ACTIVE' },
  { id: 'loc-fridge-b', name: 'Fridge B', zone: 'QC', condition: '4-8C / citrus oils', capacityGrams: 1600, parentId: 'loc-qc', kind: 'Room', light: 'Dark', temperatureRange: '4-8C', status: 'ACTIVE' },
  { id: 'loc-vault-c', name: 'Vault C', zone: 'Restricted', condition: 'Locked / high value', capacityGrams: 1200, parentId: 'loc-wh', kind: 'Room', light: 'Dark', temperatureRange: '18-20C', status: 'ACTIVE' },
  { id: 'loc-dry-1', name: 'Dry Shelf 1', zone: 'Warehouse', condition: 'Low humidity', capacityGrams: 3200, parentId: 'loc-wh', kind: 'Shelf', light: 'Ambient', temperatureRange: '18-22C', status: 'ACTIVE' },
  { id: 'loc-flammable', name: 'Flammable Cabinet', zone: 'Safety', condition: 'Fire-rated', capacityGrams: 10000, parentId: 'loc-wh', kind: 'Bin', light: 'Dark', temperatureRange: '18-22C', status: 'ACTIVE' },
  { id: 'loc-qc', name: 'QC Lab', zone: 'Quality', condition: 'Inspection and release', capacityGrams: 2600, kind: 'Room', light: 'Ambient', temperatureRange: '18-22C', status: 'ACTIVE' },
  { id: 'loc-qc-tray', name: 'QC Tray', zone: 'Quality', condition: 'Quarantine review', capacityGrams: 800, parentId: 'loc-qc', kind: 'Bin', light: 'Amber', temperatureRange: '18-22C', status: 'ACTIVE' },
  { id: 'loc-receiving', name: 'Receiving Bay', zone: 'Inbound', condition: 'Inspection pending', capacityGrams: 3000, parentId: 'loc-wh', kind: 'Transit', light: 'Ambient', temperatureRange: '18-25C', status: 'IN_TRANSIT' },
]

export const stockTakeRecords: StockTakeRecord[] = [
  {
    id: 'STK-2026-021',
    at: '2026-06-27T09:10:00.000Z',
    lotId: 'lot-ber-001',
    lotNumber: 'L-BER-032',
    expectedGrams: 42.3,
    countedGrams: 42,
    varianceGrams: -0.3,
    reason: 'Cycle count citrus fridge',
    actor: 'Inventory Manager',
    status: 'ADJUSTED',
    movementId: 'MOV-1024',
  },
]

export const initialMovements: InventoryMovement[] = [
  { id: 'MOV-1028', at: '2026-06-29 14:22', type: 'RECEIPT', direction: 'IN', materialId: 'mat-iso', lotId: 'lot-iso-001', quantityGrams: 250, balanceAfter: 250, ref: 'GR-2026-041', actor: 'Inventory Manager' },
  { id: 'MOV-1027', at: '2026-06-29 11:10', type: 'LAB_CONSUMPTION', direction: 'OUT', materialId: 'mat-hedione', lotId: 'lot-hed-001', quantityGrams: 1.5, balanceAfter: 186, ref: 'LAB-2026-088', actor: 'Perfumer' },
  { id: 'MOV-1026', at: '2026-06-28 17:42', type: 'FULFILLMENT', direction: 'OUT', materialId: 'mat-vanillin', lotId: 'lot-van-001', quantityGrams: 12, balanceAfter: 80, ref: 'SO-2026-092', actor: 'Fulfillment' },
  { id: 'MOV-1025', at: '2026-06-28 09:18', type: 'RECEIPT', direction: 'IN', materialId: 'mat-ambroxan', lotId: 'lot-amb-001', quantityGrams: 40, balanceAfter: 40, ref: 'GR-2026-039', actor: 'Inventory Manager' },
]

export const documents: DocumentRecord[] = [
  {
    id: 'DOC-118',
    type: 'SDS',
    title: 'Iso E Super SDS',
    linkedTo: 'mat-iso',
    version: 'v3',
    sensitivity: 'Confidential',
    status: 'EXPIRING',
    issueDate: '2025-02-01',
    expiresAt: '2026-08-15',
    lastAccessed: '2026-06-29 10:44',
    downloads: 8,
    storageKey: 'org-nxl/materials/mat-iso/sds-v3.pdf',
    mimeType: 'application/pdf',
    sizeKb: 412,
    checksum: 'sha256:9a41c4df0c-doc118',
    owner: 'Lab Data',
  },
  {
    id: 'DOC-119',
    type: 'CoA',
    title: 'Hedione CoA HED-2026-011',
    linkedTo: 'lot-hed-001',
    version: 'v1',
    sensitivity: 'Confidential',
    status: 'APPROVED',
    issueDate: '2026-02-11',
    expiresAt: '2028-02-11',
    lastAccessed: '2026-06-30 08:31',
    downloads: 3,
    storageKey: 'org-nxl/lots/lot-hed-001/coa-v1.pdf',
    mimeType: 'application/pdf',
    sizeKb: 188,
    checksum: 'sha256:20ce81ed11-doc119',
    owner: 'QC',
  },
  {
    id: 'DOC-121',
    type: 'Formula Export',
    title: 'FRM-0421 v12 Export',
    linkedTo: 'frm-0421',
    version: 'v12',
    sensitivity: 'Highly Confidential',
    status: 'APPROVED',
    issueDate: '2026-06-30',
    lastAccessed: '2026-06-30 09:22',
    downloads: 2,
    storageKey: 'org-nxl/formulas/frm-0421/export-v12.pdf',
    mimeType: 'application/pdf',
    sizeKb: 96,
    checksum: 'sha256:7cf4f54e21-doc121',
    owner: 'Compliance',
  },
  {
    id: 'DOC-124',
    type: 'Batch Record',
    title: 'BTH-2025-118 QC Record',
    linkedTo: 'BTH-2025-118',
    version: 'v2',
    sensitivity: 'Internal',
    status: 'APPROVED',
    issueDate: '2026-04-20',
    expiresAt: '2028-04-20',
    lastAccessed: '2026-06-27 16:45',
    downloads: 5,
    storageKey: 'org-nxl/batches/bth-2025-118/qc-record-v2.pdf',
    mimeType: 'application/pdf',
    sizeKb: 265,
    checksum: 'sha256:a8f6d0bb77-doc124',
    owner: 'Manufacturing',
  },
]

export const auditEvents: AuditEvent[] = [
  { id: 'AUD-9144', at: '2026-06-30 09:24', actor: 'Thuan Le Minh', action: 'formula.export', entity: 'FRM-0421', requestId: 'req_8f4d21', outcome: 'allowed' },
  { id: 'AUD-9143', at: '2026-06-30 09:02', actor: 'Owner', action: 'sso.update', entity: 'SSOConfig', requestId: 'req_3920aa', outcome: 'review' },
  { id: 'AUD-9142', at: '2026-06-29 17:18', actor: 'Inventory Manager', action: 'inventory.adjust', entity: 'L-AMB-006', requestId: 'req_a919f2', outcome: 'allowed' },
  { id: 'AUD-9141', at: '2026-06-29 15:38', actor: 'Viewer', action: 'document.download', entity: 'DOC-121', requestId: 'req_49fb11', outcome: 'blocked' },
]

export const organizations: OrganizationRecord[] = [
  {
    id: 'org-nxl',
    name: 'NOXELIS Lab',
    slug: 'noxelis',
    plan: 'Team',
    status: 'ACTIVE',
    primaryContact: 'owner@noxel.is',
    createdAt: '2026-01-08T03:20:00.000Z',
  },
  {
    id: 'org-other',
    name: 'External Demo Tenant',
    slug: 'external-demo',
    plan: 'Free',
    status: 'ACTIVE',
    primaryContact: 'owner@example.com',
    createdAt: '2026-02-14T08:00:00.000Z',
  },
]

export const brands: BrandRecord[] = [
  { id: 'brand-nxl', organizationId: 'org-nxl', name: 'NOXELIS', status: 'ACTIVE', defaultCurrency: 'USD' },
  { id: 'brand-atelier', organizationId: 'org-nxl', name: 'Atelier Trials', status: 'ACTIVE', defaultCurrency: 'USD' },
  { id: 'brand-other', organizationId: 'org-other', name: 'External Brand', status: 'ACTIVE', defaultCurrency: 'USD' },
]

export const memberships: MembershipRecord[] = [
  {
    id: 'MBR-OWNER',
    userId: 'usr-owner',
    email: 'owner@noxel.is',
    name: 'Thuan Le Minh',
    organizationId: 'org-nxl',
    brandIds: ['brand-nxl', 'brand-atelier'],
    role: 'Owner',
    status: 'ACTIVE',
    mfaEnabled: true,
    lastActiveAt: '2026-07-01T08:44:00.000Z',
  },
  {
    id: 'MBR-LAB',
    userId: 'usr-lab',
    email: 'lab@noxel.is',
    name: 'Bench Chemist',
    organizationId: 'org-nxl',
    brandIds: ['brand-nxl'],
    role: 'Lab Manager',
    status: 'ACTIVE',
    mfaEnabled: true,
    lastActiveAt: '2026-07-01T07:31:00.000Z',
  },
  {
    id: 'MBR-VIEWER',
    userId: 'usr-viewer',
    email: 'viewer@noxel.is',
    name: 'Read Only Reviewer',
    organizationId: 'org-nxl',
    brandIds: ['brand-nxl'],
    role: 'Viewer',
    status: 'INVITED',
    mfaEnabled: false,
    lastActiveAt: 'never',
    invitedAt: '2026-06-30T10:02:00.000Z',
  },
]

export const permissionCatalog: PermissionDefinition[] = [
  { key: 'platform.view', label: 'View platform shell', category: 'Platform', scope: 'organization', risk: 'low', description: 'Open the tenant-scoped North Star console.' },
  { key: 'audit.view', label: 'View audit trail', category: 'Audit', scope: 'organization', risk: 'medium', description: 'Read tenant audit events and security evidence.' },
  { key: 'audit.export', label: 'Export audit evidence', category: 'Audit', scope: 'organization', risk: 'high', description: 'Export regulated tenant audit data.' },
  { key: 'security.manageUsers', label: 'Manage members', category: 'Security', scope: 'organization', risk: 'critical', description: 'Invite, activate, deactivate, and assign tenant roles.' },
  { key: 'security.viewAuditLog', label: 'View security audit', category: 'Security', scope: 'organization', risk: 'high', description: 'Inspect security-sensitive tenant events.' },
  { key: 'security.policy.manage', label: 'Manage security policy', category: 'Security', scope: 'organization', risk: 'critical', description: 'Change MFA, session timeout, and IP allowlist policy.' },
  { key: 'security.sessions.manage', label: 'Manage sessions', category: 'Security', scope: 'organization', risk: 'high', description: 'Revoke active sessions for tenant members.' },
  { key: 'security.apiKeys.manage', label: 'Manage API keys', category: 'Security', scope: 'organization', risk: 'critical', description: 'Create, rotate, and revoke API credentials.' },
  { key: 'security.sso.manage', label: 'Manage SSO/SCIM', category: 'Security', scope: 'organization', risk: 'critical', description: 'Configure enterprise identity providers and provisioning.' },
  { key: 'customization.manage', label: 'Manage tenant config', category: 'Customization', scope: 'organization', risk: 'medium', description: 'Edit settings, flags, fields, numbering, and branding.' },
  { key: 'materials.view', label: 'View materials', category: 'Materials', scope: 'organization', risk: 'low', description: 'Read tenant material records.' },
  { key: 'materials.create', label: 'Create materials', category: 'Materials', scope: 'organization', risk: 'medium', description: 'Create new material records.' },
  { key: 'materials.update', label: 'Update materials', category: 'Materials', scope: 'organization', risk: 'medium', description: 'Edit material records and provenance.' },
  { key: 'formulas.view', label: 'View formulas', category: 'Formulas', scope: 'organization', risk: 'medium', description: 'Read formula records without sensitive export privileges.' },
  { key: 'formulas.viewSensitive', label: 'View sensitive formulas', category: 'Formulas', scope: 'organization', risk: 'high', description: 'View confidential ratios, nested formulas, and sensitive composition.' },
  { key: 'formulas.export', label: 'Export formulas', category: 'Formulas', scope: 'organization', risk: 'high', description: 'Export formula data outside the application.' },
  { key: 'inventory.view', label: 'View inventory', category: 'Inventory', scope: 'organization', risk: 'low', description: 'Read stock summaries, lots, and movements.' },
  { key: 'inventory.receive', label: 'Receive inventory', category: 'Inventory', scope: 'organization', risk: 'medium', description: 'Create receipt movements and approved lots.' },
  { key: 'inventory.adjust', label: 'Adjust inventory', category: 'Inventory', scope: 'organization', risk: 'high', description: 'Create manual stock adjustments.' },
  { key: 'inventory.commitLabUsage', label: 'Commit lab usage', category: 'Inventory', scope: 'organization', risk: 'high', description: 'Consume stock through lab usage movements.' },
  { key: 'inventory.reverseLabUsage', label: 'Reverse lab usage', category: 'Inventory', scope: 'organization', risk: 'high', description: 'Compensate previously committed lab usage movements.' },
  { key: 'documents.view', label: 'View documents', category: 'Documents', scope: 'organization', risk: 'low', description: 'Read document metadata.' },
  { key: 'documents.download', label: 'Download documents', category: 'Documents', scope: 'organization', risk: 'high', description: 'Generate signed document download URLs.' },
  { key: 'documents.manage', label: 'Manage documents', category: 'Documents', scope: 'organization', risk: 'medium', description: 'Attach, version, or manage tenant documents.' },
  { key: 'production.view', label: 'View production', category: 'Production', scope: 'organization', risk: 'low', description: 'Read production batch records.' },
  { key: 'production.consume', label: 'Consume production stock', category: 'Production', scope: 'organization', risk: 'high', description: 'Consume stock for production batches.' },
  { key: 'production.qc', label: 'Record production QC', category: 'Production', scope: 'organization', risk: 'medium', description: 'Record QC state and production evidence.' },
  { key: 'procurement.view', label: 'View procurement', category: 'Procurement', scope: 'organization', risk: 'low', description: 'Read suppliers and purchase orders.' },
  { key: 'procurement.manage', label: 'Manage procurement', category: 'Procurement', scope: 'organization', risk: 'medium', description: 'Create and receive purchase orders.' },
  { key: 'commerce.view', label: 'View catalog', category: 'Commerce', scope: 'organization', risk: 'low', description: 'Read commercial SKU and customer-facing catalog data.' },
  { key: 'commerce.manage', label: 'Manage catalog', category: 'Commerce', scope: 'organization', risk: 'medium', description: 'Edit SKUs, price lists, and customer catalog settings.' },
  { key: 'orders.view', label: 'View orders', category: 'Orders', scope: 'organization', risk: 'low', description: 'Read customer orders.' },
  { key: 'orders.reserve', label: 'Reserve stock', category: 'Orders', scope: 'organization', risk: 'medium', description: 'Create stock reservations without inventory movement.' },
  { key: 'orders.fulfill', label: 'Fulfill orders', category: 'Orders', scope: 'organization', risk: 'high', description: 'Create shipment consumption movements.' },
  { key: 'costing.view', label: 'View costing', category: 'Costing', scope: 'organization', risk: 'medium', description: 'Read formula and SKU cost summaries.' },
  { key: 'finance.viewMargin', label: 'View margin', category: 'Costing', scope: 'organization', risk: 'high', description: 'Read sensitive margin and finance data.' },
  { key: 'analytics.view', label: 'View analytics', category: 'Analytics', scope: 'organization', risk: 'low', description: 'Read tenant dashboards and analytics.' },
  { key: 'billing.manage', label: 'Manage billing', category: 'Billing', scope: 'organization', risk: 'critical', description: 'Manage plans, invoices, seats, and payment state.' },
  { key: 'platform.tenants.manage', label: 'Manage platform tenants', category: 'Platform Admin', scope: 'platform', risk: 'critical', description: 'Provision, suspend, and lock tenants as operator.' },
  { key: 'platform.flags.manage', label: 'Manage platform flags', category: 'Platform Admin', scope: 'platform', risk: 'critical', description: 'Change global feature flags and rollout cohorts.' },
  { key: 'platform.impersonation.audit', label: 'Audit impersonation', category: 'Platform Admin', scope: 'platform', risk: 'critical', description: 'Review support impersonation and operator actions.' },
]

function organizationPermissions(...categories: string[]) {
  const categorySet = new Set(categories)
  return permissionCatalog
    .filter((permission) => permission.scope === 'organization' && categorySet.has(permission.category))
    .map((permission) => permission.key)
}

const allOrganizationPermissions = permissionCatalog
  .filter((permission) => permission.scope === 'organization')
  .map((permission) => permission.key)

export const rolePolicies: RolePolicy[] = [
  {
    role: 'Owner',
    scope: 'organization',
    mfaRequired: true,
    permissions: allOrganizationPermissions,
  },
  {
    role: 'Admin',
    scope: 'organization',
    mfaRequired: true,
    permissions: [
      ...organizationPermissions('Platform', 'Audit', 'Security', 'Customization', 'Materials', 'Formulas', 'Inventory', 'Documents', 'Production', 'Procurement', 'Commerce', 'Orders', 'Costing', 'Analytics'),
      'audit.export',
    ].filter((permission) => !['billing.manage', 'security.sso.manage', 'security.apiKeys.manage'].includes(permission)),
  },
  {
    role: 'Lab Manager',
    scope: 'organization',
    mfaRequired: false,
    permissions: [
      'materials.view',
      'materials.create',
      'materials.update',
      'formulas.view',
      'documents.download',
      'documents.view',
      'formulas.viewSensitive',
      'inventory.view',
      'inventory.adjust',
      'inventory.commitLabUsage',
      'inventory.receive',
      'inventory.reverseLabUsage',
      'production.view',
      'production.consume',
      'production.qc',
      'analytics.view',
    ],
  },
  {
    role: 'Perfumer',
    scope: 'organization',
    mfaRequired: false,
    permissions: [
      'materials.view',
      'formulas.view',
      'formulas.viewSensitive',
      'formulas.export',
      'documents.view',
      'documents.download',
      'costing.view',
      'analytics.view',
    ],
  },
  {
    role: 'Inventory Manager',
    scope: 'organization',
    mfaRequired: false,
    permissions: [
      'materials.view',
      'inventory.view',
      'inventory.receive',
      'inventory.adjust',
      'inventory.commitLabUsage',
      'inventory.reverseLabUsage',
      'documents.view',
      'documents.download',
      'production.view',
      'analytics.view',
    ],
  },
  {
    role: 'Procurement',
    scope: 'organization',
    mfaRequired: false,
    permissions: [
      'materials.view',
      'inventory.view',
      'procurement.view',
      'procurement.manage',
      'documents.view',
      'documents.download',
      'costing.view',
      'analytics.view',
    ],
  },
  {
    role: 'Commercial',
    scope: 'organization',
    mfaRequired: false,
    permissions: [
      'commerce.view',
      'commerce.manage',
      'orders.view',
      'orders.reserve',
      'materials.view',
      'formulas.view',
      'documents.view',
      'analytics.view',
    ],
  },
  {
    role: 'Finance',
    scope: 'organization',
    mfaRequired: true,
    permissions: [
      'billing.manage',
      'costing.view',
      'finance.viewMargin',
      'procurement.view',
      'commerce.view',
      'orders.view',
      'audit.view',
      'analytics.view',
    ],
  },
  {
    role: 'Viewer',
    scope: 'organization',
    mfaRequired: false,
    permissions: [
      'platform.view',
      'materials.view',
      'formulas.view',
      'inventory.view',
      'documents.view',
      'production.view',
      'procurement.view',
      'commerce.view',
      'orders.view',
      'analytics.view',
    ],
  },
  {
    role: 'Platform Admin',
    scope: 'platform',
    mfaRequired: true,
    permissions: ['platform.tenants.manage', 'platform.flags.manage', 'platform.impersonation.audit'],
  },
]

export const tenantSecurityPolicy: TenantSecurityPolicy = {
  organizationId: 'org-nxl',
  mfaRequiredForOwnerAdmin: true,
  sessionTimeoutMinutes: 60,
  idleTimeoutMinutes: 15,
  absoluteSessionMinutes: 480,
  concurrentSessionLimit: 2,
  newDeviceAlertEnabled: true,
  ipAllowlist: ['203.0.113.0/24'],
  passwordPolicy: 'min-14-with-breach-check',
}

export const tenantSettings: TenantSettingsRecord = {
  organizationId: 'org-nxl',
  locale: 'en-US',
  timezone: 'Asia/Bangkok',
  currency: 'USD',
  defaultUnit: 'g',
  defaultDilutionPercent: 10,
}

export const authSessions: AuthSession[] = [
  {
    id: 'SES-0001',
    userId: 'usr-owner',
    email: 'owner@noxel.is',
    organizationId: 'org-nxl',
    brandId: 'brand-nxl',
    role: 'Owner',
    issuedAt: '2026-07-03T07:44:00.000Z',
    lastSeenAt: '2026-07-03T07:58:00.000Z',
    idleExpiresAt: '2026-07-10T08:13:00.000Z',
    expiresAt: '2026-07-10T15:44:00.000Z',
    status: 'ACTIVE',
    mfaVerified: true,
    ipAddress: '203.0.113.18',
    userAgent: 'Codex Desktop / Chrome',
    deviceId: 'dev-owner-codex',
    location: 'Bangkok, TH',
  },
  {
    id: 'SES-0002',
    userId: 'usr-lab',
    email: 'lab@noxel.is',
    organizationId: 'org-nxl',
    brandId: 'brand-nxl',
    role: 'Lab Manager',
    issuedAt: '2026-07-03T06:31:00.000Z',
    lastSeenAt: '2026-07-03T06:48:00.000Z',
    idleExpiresAt: '2026-07-10T07:03:00.000Z',
    expiresAt: '2026-07-10T14:31:00.000Z',
    status: 'ACTIVE',
    mfaVerified: true,
    ipAddress: '203.0.113.42',
    userAgent: 'Windows Lab Terminal',
    deviceId: 'dev-lab-terminal',
    location: 'Bangkok Lab',
  },
]

export const featureFlags: FeatureFlagRecord[] = [
  { key: 'formulaCostVisibility', label: 'Hide costing for perfumer role', enabled: true, phase: 3 },
  { key: 'sdsIngestionReviewOnly', label: 'SDS AI extract requires human approval', enabled: true, phase: 4 },
  { key: 'enterpriseAuditExport', label: 'Tenant audit export', enabled: true, phase: 15 },
]

export const numberingSequences: NumberingSequenceRecord[] = [
  { key: 'formula', pattern: 'FRM-####', nextValue: 422, scope: 'brand' },
  { key: 'batch', pattern: 'BTH-YYYY-###', nextValue: 119, scope: 'brand' },
  { key: 'purchaseOrder', pattern: 'PO-YYYY-###', nextValue: 15, scope: 'organization' },
  { key: 'salesOrder', pattern: 'SO-YYYY-###', nextValue: 93, scope: 'organization' },
]

export const customFields: CustomFieldDefinition[] = [
  {
    id: 'CF-MAT-ODOUR-FAMILY',
    entity: 'material',
    key: 'odorFamily',
    label: 'Odor family',
    fieldType: 'select',
    required: true,
    options: ['citrus', 'floral', 'woody', 'amber', 'musk'],
    status: 'ACTIVE',
  },
  {
    id: 'CF-FRM-BRIEF',
    entity: 'formula',
    key: 'creativeBrief',
    label: 'Creative brief',
    fieldType: 'text',
    required: false,
    options: [],
    status: 'ACTIVE',
  },
  {
    id: 'CF-LOT-QC-DATE',
    entity: 'lot',
    key: 'qcReleaseDate',
    label: 'QC release date',
    fieldType: 'date',
    required: false,
    options: [],
    status: 'ACTIVE',
  },
]

export const brandingConfig: BrandingConfig = {
  organizationId: 'org-nxl',
  displayName: 'NOXELIS Lab',
  accentColor: '#4d9bff',
  documentFooter: 'Confidential formula and inventory record - NOXELIS',
  labelTemplate: 'NOX-{brand}-{sequence}',
  logoMode: 'wordmark',
}

export const productionBatches: ProductionBatchRecord[] = [
  {
    id: 'BTH-2025-118',
    formulaId: 'frm-0421',
    formulaCode: 'FRM-0421',
    status: 'WEIGHING',
    targetGrams: 25,
    consumedGrams: 0,
    qcStatus: 'PENDING',
    owner: 'Manufacturing',
  },
]

export const suppliers: SupplierRecord[] = [
  {
    id: 'SUP-003',
    name: 'Aroma Supplier EU',
    status: 'stable',
    country: 'FR',
    leadTimeDays: 21,
    contactEmail: 'orders@aroma-supplier.eu',
    paymentTerms: 'Net 30',
    preferredMaterialIds: ['mat-ambroxan', 'mat-bergamot', 'mat-hedione'],
  },
  {
    id: 'SUP-007',
    name: 'Citrus Naturals Lab',
    status: 'review',
    country: 'IT',
    leadTimeDays: 14,
    contactEmail: 'sourcing@citrusnaturals.example',
    paymentTerms: '50% deposit / net 15',
    preferredMaterialIds: ['mat-bergamot', 'mat-ethanol'],
  },
]

export const purchaseOrders: PurchaseOrderRecord[] = [
  {
    id: 'PO-2026-014',
    supplierId: 'SUP-003',
    materialId: 'mat-bergamot',
    quantityGrams: 100,
    receivedGrams: 0,
    status: 'SENT',
    expectedDate: '2026-07-18',
    unitCost: 0.18,
    currency: 'USD',
    createdAt: '2026-07-01T10:15:00.000Z',
  },
]

export const priceHistory: PriceHistoryRecord[] = [
  {
    id: 'PRICE-2026-041',
    materialId: 'mat-bergamot',
    supplierId: 'SUP-003',
    purchaseOrderId: 'PO-2026-014',
    unitCost: 0.18,
    currency: 'USD',
    quantityGrams: 100,
    capturedAt: '2026-07-01T10:15:00.000Z',
    source: 'QUOTE',
  },
  {
    id: 'PRICE-2026-028',
    materialId: 'mat-ambroxan',
    supplierId: 'SUP-003',
    purchaseOrderId: 'PO-2026-006',
    unitCost: 0.84,
    currency: 'USD',
    quantityGrams: 50,
    capturedAt: '2026-06-12T09:30:00.000Z',
    source: 'PO_RECEIPT',
  },
]

export const commercialSkus: CommercialSkuRecord[] = [
  {
    id: 'SKU-ISO-050',
    materialId: 'mat-iso',
    name: 'Iso E Super 50g',
    description: 'White-label aroma material pack for studio trials',
    packSizeGrams: 50,
    price: 18,
    currency: 'USD',
    tier: 'Studio',
    status: 'ACTIVE',
    moqPacks: 1,
    labelTemplate: 'NOXELIS Neutral 50g',
  },
  {
    id: 'SKU-BER-025',
    materialId: 'mat-bergamot',
    name: 'Bergamot FCF 25g',
    description: 'Citrus top-note sample pack with tenant label',
    packSizeGrams: 25,
    price: 16,
    currency: 'USD',
    tier: 'Studio',
    status: 'ACTIVE',
    moqPacks: 1,
    labelTemplate: 'NOXELIS Neutral 25g',
  },
]

export const priceLists: PriceListRecord[] = [
  {
    id: 'PL-STUDIO',
    name: 'Studio Pack List',
    customerGroup: 'Studio',
    currency: 'USD',
    multiplier: 1,
    sampleEligible: true,
    status: 'ACTIVE',
  },
  {
    id: 'PL-LAB',
    name: 'Lab Volume List',
    customerGroup: 'Lab',
    currency: 'USD',
    multiplier: 0.88,
    sampleEligible: true,
    status: 'ACTIVE',
  },
  {
    id: 'PL-BULK',
    name: 'Bulk Commercial List',
    customerGroup: 'Bulk',
    currency: 'USD',
    multiplier: 0.74,
    sampleEligible: false,
    status: 'DRAFT',
  },
]

export const quotes: QuoteRecord[] = [
  {
    id: 'QTE-2026-033',
    skuId: 'SKU-ISO-050',
    customer: 'Studio Sample Desk',
    customerGroup: 'Studio',
    quantityPacks: 4,
    unitPrice: 18,
    total: 72,
    currency: 'USD',
    status: 'SENT',
    createdAt: '2026-07-02T08:00:00.000Z',
  },
]

export const sampleRequests: SampleRequestRecord[] = [
  {
    id: 'SMP-2026-017',
    skuId: 'SKU-BER-025',
    customer: 'Atelier Preview',
    packs: 1,
    status: 'APPROVED',
    createdAt: '2026-07-02T10:45:00.000Z',
  },
]

export const salesOrders: SalesOrderRecord[] = [
  {
    id: 'SO-2026-092',
    skuId: 'SKU-ISO-050',
    customer: 'Maison Trial Studio',
    quantity: 1,
    reservedGrams: 0,
    fulfilledGrams: 0,
    status: 'DRAFT',
  },
]

export const billingPlan: BillingPlanRecord = {
  id: 'PLAN-GROWTH',
  name: 'Growth',
  seats: 12,
  storageGb: 100,
  apiQuota: 25000,
  monthlyPrice: 249,
}

export const ssoConfig: SsoConfigRecord = {
  id: 'SSO-NXL',
  provider: 'OIDC',
  domain: 'noxel.is',
  status: 'verified',
  roleMapping: {
    'noxel-admins': 'Owner',
    'noxel-lab': 'Lab Manager',
    'noxel-viewers': 'Viewer',
  },
}

export const apiKeys: ApiKeyRecord[] = [
  {
    id: 'KEY-PRIMARY',
    label: 'Production integration',
    lastFour: '9AF2',
    scopes: ['materials.read', 'orders.write', 'webhooks.read'],
    rotatedAt: '2026-06-18T09:00:00Z',
    status: 'active',
  },
]

export const webhooks: WebhookRecord[] = [
  {
    id: 'WH-ORDERS',
    url: 'https://ops.noxel.is/hooks/orders',
    events: ['order.reserved', 'order.fulfilled', 'document.downloaded'],
    status: 'active',
    lastDelivery: '2026-06-30T08:44:00Z',
  },
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

export function formatGrams(value: number) {
  return `${value.toFixed(value >= 10 ? 1 : 2)}g`
}

export function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`
}

export function roleHasPermission(role: string, permission: string) {
  return rolePolicies.some((policy) => policy.role === role && policy.permissions.includes(permission))
}

export function tenantScopeAllows(sessionOrganizationId: string, resourceOrganizationId: string) {
  return sessionOrganizationId === resourceOrganizationId
}

export function formatSequenceValue(sequence: NumberingSequenceRecord, value = sequence.nextValue) {
  const padded = String(value).padStart(4, '0')
  if (sequence.pattern.includes('YYYY')) {
    return sequence.pattern.replace('YYYY', '2026').replace('###', String(value).padStart(3, '0'))
  }
  return sequence.pattern.replace('####', padded)
}

export function skuAvailability(
  skus: CommercialSkuRecord[],
  lots: InventoryLot[] = initialLots,
  materialCatalog: Material[] = materials,
) {
  const summary = stockSummary(lots, materialCatalog)
  return skus.map((sku) => {
    const stock = summary.find((item) => item.material.id === sku.materialId)
    return {
      ...sku,
      availableGrams: stock?.available ?? 0,
      canSellPacks: Math.floor((stock?.available ?? 0) / sku.packSizeGrams),
    }
  })
}

export function orderRequiredGrams(order: SalesOrderRecord, skus: CommercialSkuRecord[] = commercialSkus) {
  const sku = skus.find((item) => item.id === order.skuId)
  return sku ? sku.packSizeGrams * order.quantity : 0
}

export const documentSignedUrlTtlSeconds = 300

export function documentRequiredPermissions(document: DocumentRecord) {
  const permissions = ['documents.download']
  if (document.sensitivity === 'Highly Confidential') {
    permissions.push('formulas.viewSensitive')
  }
  return permissions
}

export function canDownloadDocument(document: DocumentRecord, permissions: string[]) {
  const permissionSet = new Set(permissions)
  return documentRequiredPermissions(document).every((permission) => permissionSet.has(permission))
}

export function createSignedDocumentUrl(
  document: DocumentRecord,
  now = new Date(),
  ttlSeconds = documentSignedUrlTtlSeconds,
): SignedDocumentUrl {
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)
  const expires = Math.floor(expiresAt.getTime() / 1000)
  const signature = `${document.id}-${document.version}-${expires}`.toLowerCase().replace(/[^a-z0-9]/g, '')

  return {
    url: `https://files.olfactoryops.local/private/${encodeURIComponent(document.id)}?expires=${expires}&signature=${signature}`,
    expiresAt: expiresAt.toISOString(),
    ttlSeconds,
    method: 'GET',
  }
}

export function createDocumentShareLink(
  document: DocumentRecord,
  recipient: string,
  now = new Date(),
  ttlSeconds = 7 * 24 * 60 * 60,
): DocumentShareLink {
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)
  const expires = Math.floor(expiresAt.getTime() / 1000)
  const normalizedRecipient = recipient.trim().toLowerCase()
  const token = `${document.id}-${document.version}-${normalizedRecipient}-${expires}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  return {
    url: `https://share.olfactoryops.local/documents/${encodeURIComponent(document.id)}?recipient=${encodeURIComponent(normalizedRecipient)}&expires=${expires}&token=${token}`,
    recipient: normalizedRecipient,
    expiresAt: expiresAt.toISOString(),
    ttlSeconds,
    permission: 'external-view',
  }
}

const complianceAsOfDate = '2026-07-03'

function daysUntil(date: string, asOfDate = complianceAsOfDate) {
  const dayMs = 24 * 60 * 60 * 1000
  return Math.ceil((new Date(`${date}T00:00:00Z`).getTime() - new Date(`${asOfDate}T00:00:00Z`).getTime()) / dayMs)
}

function documentRequirementStatus(
  document: DocumentRecord | undefined,
  asOfDate = complianceAsOfDate,
): DocumentComplianceRequirement['status'] {
  if (!document) {
    return 'missing'
  }
  if (document.status === 'REVIEW_REQUIRED') {
    return 'review'
  }
  if (document.status === 'EXPIRED' || (document.expiresAt && daysUntil(document.expiresAt, asOfDate) < 0)) {
    return 'missing'
  }
  if (document.status === 'EXPIRING' || (document.expiresAt && daysUntil(document.expiresAt, asOfDate) <= 90)) {
    return 'expiring'
  }
  return 'met'
}

export function documentComplianceDashboard(
  documentCatalog: DocumentRecord[] = documents,
  materialCatalog: Material[] = materials,
  lotCatalog: InventoryLot[] = initialLots,
  formulaCatalog: Formula[] = formulas,
  asOfDate = complianceAsOfDate,
): DocumentComplianceDashboard {
  const requirements: DocumentComplianceRequirement[] = []

  materialCatalog.forEach((material) => {
    const document = documentCatalog.find((item) => item.linkedTo === material.id && item.type === 'SDS')
    requirements.push({
      id: `REQ-SDS-${material.id}`,
      scope: 'material',
      linkedTo: material.id,
      label: `${material.name} SDS`,
      requiredType: 'SDS',
      status: documentRequirementStatus(document, asOfDate),
      documentId: document?.id,
      dueDate: document?.expiresAt,
    })
  })

  lotCatalog
    .filter((lot) => lot.qualityStatus !== 'REJECTED')
    .forEach((lot) => {
      const document = documentCatalog.find((item) => item.linkedTo === lot.id && item.type === 'CoA')
      requirements.push({
        id: `REQ-COA-${lot.id}`,
        scope: 'lot',
        linkedTo: lot.id,
        label: `${lot.lotNumber} CoA`,
        requiredType: 'CoA',
        status: documentRequirementStatus(document, asOfDate),
        documentId: document?.id,
        dueDate: document?.expiresAt,
      })
    })

  formulaCatalog
    .filter((formula) => formula.status === 'active' || formula.status === 'stable')
    .forEach((formula) => {
      const document = documentCatalog.find(
        (item) => item.linkedTo === formula.id && (item.type === 'Formula Export' || item.type === 'Formula Spec Sheet'),
      )
      requirements.push({
        id: `REQ-FORMULA-${formula.id}`,
        scope: 'formula',
        linkedTo: formula.id,
        label: `${formula.code} formula export`,
        requiredType: 'Formula Export',
        status: documentRequirementStatus(document, asOfDate),
        documentId: document?.id,
        dueDate: document?.expiresAt,
      })
    })

  const missingCount = requirements.filter((requirement) => requirement.status === 'missing').length
  const expiringCount = requirements.filter((requirement) => requirement.status === 'expiring').length
  const reviewCount = requirements.filter((requirement) => requirement.status === 'review').length
  const metCount = requirements.length - missingCount
  const expiringDocuments = documentCatalog.filter(
    (document) =>
      document.expiresAt !== undefined &&
      (document.status === 'EXPIRING' || daysUntil(document.expiresAt, asOfDate) <= 90),
  )

  return {
    coveragePercent: requirements.length === 0 ? 100 : Math.round((metCount / requirements.length) * 100),
    totalRequired: requirements.length,
    metCount,
    missingCount,
    expiringCount,
    reviewCount,
    generatedCount: documentCatalog.filter((document) => document.generatedFrom).length,
    requirements,
    expiringDocuments,
    invariant: 'compliance coverage is derived from linked private documents, not public file paths',
  }
}

export function resolveFormulaWithCatalog(
  formulaId: string,
  formulaCatalog: Formula[] = formulas,
  materialCatalog: Material[] = materials,
): ResolvedLeaf[] {
  const formulaLookup = new Map(formulaCatalog.map((formula) => [formula.id, formula]))
  const materialLookup = new Map(materialCatalog.map((material) => [material.id, material]))
  const root = formulaLookup.get(formulaId)
  if (!root) {
    return []
  }
  const rootFormula = root

  const leaves: ResolvedLeaf[] = []

  function walk(formula: Formula, scale: number, path: string[], trail: Set<string>) {
    if (trail.has(formula.id)) {
      return
    }
    const nextTrail = new Set(trail).add(formula.id)

    formula.lines.forEach((line) => {
      const lineGrams = line.grams * scale
      if (line.materialId) {
        const material = materialLookup.get(line.materialId)
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
        const child = formulaLookup.get(line.childFormulaId)
        if (!child) {
          return
        }
        walk(child, lineGrams / child.targetGrams, [...path, line.label], nextTrail)
      }
    })
  }

  walk(root, 1, [root.code], new Set<string>())

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

export function resolveFormula(formulaId: string): ResolvedLeaf[] {
  return resolveFormulaWithCatalog(formulaId, formulas)
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

export const inventoryAsOfDate = '2026-07-03'

export function lotIsExpired(lot: InventoryLot, asOfDate = inventoryAsOfDate) {
  return lot.qualityStatus === 'EXPIRED' || lot.expiryDate < asOfDate
}

export function isLotEligibleForInventory(lot: InventoryLot, asOfDate = inventoryAsOfDate) {
  return lot.qualityStatus === 'APPROVED' && !lotIsExpired(lot, asOfDate)
}

export function stockSummary(lots: InventoryLot[], materialCatalog: Material[] = materials) {
  return materialCatalog.map((material) => {
    const materialLots = lots.filter((lot) => lot.materialId === material.id)
    const current = materialLots.reduce((sum, lot) => sum + lot.quantityGrams, 0)
    const reserved = materialLots.reduce((sum, lot) => sum + lot.reservedGrams, 0)
    const available = materialLots
      .filter((lot) => isLotEligibleForInventory(lot))
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
      .filter((lot) => lot.materialId === leaf.materialId && isLotEligibleForInventory(lot))
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
