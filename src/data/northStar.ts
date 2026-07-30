export type DomainStatus = 'stable' | 'active' | 'testing' | 'review' | 'draft' | 'alert'

export type DomainKey =
  | 'dashboard'
  | 'platform'
  | 'identity'
  | 'customization'
  | 'materials'
  | 'formulas'
  | 'formulaAgent'
  | 'formulaDesignStudio'
  | 'reformulationOptimizer'
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
export type FormulaPyramidNote = 'Top' | 'Middle' | 'Base' | 'Solvent'
export type FormulaType = 'ACCORD' | 'FINE_FRAGRANCE'
export type FormulaConcentrationType = 'PARFUM' | 'EDP' | 'EDT' | 'EDC' | 'COLOGNE' | 'OTHER'
export type FormulaWorkflowStatus = 'DRAFT' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'ARCHIVED'

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
  organizationId?: string
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
  /** Curated sensory metadata. It is descriptive only and never compliance evidence. */
  olfactiveProfile?: MaterialOlfactiveProfile
  /** Supplier catalogue references are traceable sourcing metadata, not an approved supplier designation. */
  supplierCatalogueReferences?: MaterialSupplierCatalogueReference[]
  provenance: MaterialProvenance[]
}

export interface MaterialOlfactiveProfile {
  primaryFamily: string
  descriptors: string[]
  facets: string[]
  description: string
  strength: 'Soft' | 'Moderate' | 'Strong' | 'Very strong'
  diffusion: 'Low' | 'Moderate' | 'High' | 'Expansive'
  tenacity: 'Short' | 'Medium' | 'Long' | 'Very long'
  volatility: 'Low' | 'Medium' | 'High'
  formulaRole: string
  status: 'CURATED' | 'REVIEW_REQUIRED'
  source: string
  version: string
  reviewedAt: string
}

export interface MaterialSupplierCatalogueReference {
  supplier: string
  catalogue: string
  catalogueVersion: string
  category: 'Synthetic aroma chemical' | 'Natural aroma chemical' | 'Natural product' | 'Organic product'
  productName: string
  productCas: string
  einecs?: string
  fema?: string
  page: number
  match: 'EXACT_PRODUCT' | 'CAS_EQUIVALENT' | 'RELATED_VARIANT'
  note?: string
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

export type MaterialComplianceStatus = 'APPROVED' | 'REVIEW_REQUIRED' | 'BLOCKED'

export interface MaterialComplianceProfile {
  id: string
  organizationId?: string
  materialId: string
  status: MaterialComplianceStatus
  ifraCategoryLimits: Array<{ category: string; limitPercent: number }>
  allergens: Array<{ name: string; cas?: string; concentrationPercent?: number }>
  euUkFlags: string[]
  sourceDocumentId?: string
  source: string
  sourceVersion: string
  reviewedAt: string
  reviewedBy: string
  note?: string
}

export interface SupplierMaterialProfile {
  id: string
  organizationId?: string
  supplierId: string
  materialId: string
  status: 'APPROVED' | 'REVIEW_REQUIRED' | 'BLOCKED'
  leadTimeDays: number
  minimumOrderGrams: number
  unitCost: number
  currency: string
  supplierMaterialCode?: string
  reviewedAt: string
  reviewedBy: string
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
  concentration?: number
  pyramidNote?: FormulaPyramidNote
  odorType?: string
  accord?: string
  tags?: string[]
  notes?: string
  sourceLotId?: string
  sourceLotNumber?: string
  sourceLocation?: string
  sourceAvailableGrams?: number
  sourceSupplierLotRef?: string
  inventoryConsumptionMode?: 'LINKED' | 'CONSUMED'
  inventoryConsumedGrams?: number
}

export interface FormulaApprovalEvent {
  id: string
  action: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'FORKED'
  actor: string
  reviewer?: string
  comment?: string
  signature?: string
  at: string
}

export interface FormulaEvaluationRecord {
  id: string
  day: 1 | 7 | 30
  observation: string
  stability: 'PASS' | 'WATCH' | 'FAIL'
  rating: number
  evaluator: string
  evaluatedAt: string
}

export interface FormulaSnapshotMetadata {
  formulaType: FormulaType
  concentrationType: FormulaConcentrationType
  finalProductConcentrationPercent: number
  targetMarkets: string[]
  brief: string
  inspiration: string
  pyramidSummary: string
  tags: string[]
  project: string
  collection: string
  density: number
  bottleVolumeMl: number
  bottleCount: number
  ifraCategory: string
}

export interface FormulaIfraRow {
  materialId: string
  materialName: string
  activePercent: number
  finalProductPercent: number
  limitPercent: number
  usageOfLimit: number
  marginPercent: number
  sourcePath: string
  status: 'PASS' | 'NEAR_LIMIT' | 'BLOCKER' | 'NO_LIMIT'
}

export interface FormulaIfraEvaluation {
  formulaId: string
  category: string
  compositionReady: boolean
  finalProductConcentrationPercent: number
  blockerCount: number
  nearLimitCount: number
  rows: FormulaIfraRow[]
  label: string
}

export interface FormulaEvaporationPoint {
  hour: number
  materials: FormulaEvaporationMaterialPoint[]
}

export interface FormulaEvaporationMaterialPoint {
  materialId: string
  materialName: string
  tier: MaterialTier
  initialPercent: number
  remainingPercent: number
  vaporPressure: number
}

export interface FormulaScaleLine {
  lineId: string
  label: string
  targetGrams: number
  roundedGrams: number
  varianceGrams: number
}

export interface FormulaScalePlan {
  formulaId: string
  targetGrams: number
  targetVolumeMl: number
  bottleCount: number
  incrementGrams: number
  lines: FormulaScaleLine[]
  totalRoundedGrams: number
  varianceGrams: number
}

export interface FormulaVersionDiffLine {
  key: string
  label: string
  beforeGrams: number
  afterGrams: number
  deltaGrams: number
  beforeActiveGrams: number
  afterActiveGrams: number
  change: 'ADDED' | 'REMOVED' | 'CHANGED' | 'UNCHANGED'
}

export interface FormulaVersionDiff {
  formulaId: string
  beforeVersion: string
  afterVersion: string
  metadataChanges: Array<{
    field: keyof FormulaSnapshotMetadata
    before: FormulaSnapshotMetadata[keyof FormulaSnapshotMetadata]
    after: FormulaSnapshotMetadata[keyof FormulaSnapshotMetadata]
  }>
  lineChanges: FormulaVersionDiffLine[]
  totalGramsDelta: number
  totalCostDelta: number
  ifraBlockerDelta: number
  evaporationDelta: Record<MaterialTier, number>
}

export interface Formula {
  id: string
  code: string
  name: string
  formulaType: FormulaType
  organizationId: string
  brandId: string
  concentrationType: FormulaConcentrationType
  finalProductConcentrationPercent: number
  targetMarkets: string[]
  brief: string
  inspiration: string
  pyramidSummary: string
  tags: string[]
  project: string
  collection: string
  density: number
  bottleVolumeMl: number
  bottleCount: number
  ifraCategory: string
  workflowStatus: FormulaWorkflowStatus
  draftRevision: number
  updatedAt: string
  updatedBy: string
  lockedVersion?: string
  parentFormulaId?: string
  parentVersion?: string
  assignedReviewer?: string
  approvalHistory: FormulaApprovalEvent[]
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
  organizationId: string
  metadata: FormulaSnapshotMetadata
  evaluations: FormulaEvaluationRecord[]
  resolvedLeaves: ResolvedLeaf[]
  ifraEvaluation: FormulaIfraEvaluation
  evaporation: FormulaEvaporationPoint[]
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
  activeGrams: number
  activePercent: number
  tier: MaterialTier
  vaporPressure: number
  sourcePath: string
}

export type LotQualityStatus = 'APPROVED' | 'QUARANTINE' | 'ON_HOLD' | 'REJECTED' | 'EXPIRED'

export interface InventoryLot {
  id: string
  organizationId?: string
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
  inTransitFromLocation?: string
  inTransitToLocation?: string
  transferStartedAt?: string
  transferStartedBy?: string
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
    | 'WASTE'
    | 'RETURN_TO_SUPPLIER'
  direction: 'IN' | 'OUT' | 'MOVE'
  materialId: string
  lotId: string
  quantityGrams: number
  balanceAfter: number
  ref: string
  actor: string
}

export interface ProcurementReceiptLine {
  id: string
  materialId: string
  purchaseOrderLineId: string
  receivedGrams: number
  acceptedGrams: number
  rejectedGrams: number
  unitCost: number
  lotId: string
  landedUnitCost?: number
}

export interface ProcurementDiscrepancy {
  id: string
  type: 'SHORT' | 'DAMAGE' | 'QUALITY' | 'DOCUMENT' | 'OTHER'
  action: 'ACCEPT' | 'QUARANTINE' | 'RETURN'
  note: string
  status: 'OPEN' | 'RESOLVED'
  createdAt: string
  resolvedAt?: string
  resolvedBy?: string
}

export interface ProcurementReceiptRecord {
  id: string
  organizationId?: string
  purchaseOrderId: string
  supplierId: string
  status: 'QUARANTINE' | 'INSPECTED' | 'ACCEPTED' | 'RETURNED'
  receivedAt: string
  receivedBy: string
  lines: ProcurementReceiptLine[]
  discrepancies: ProcurementDiscrepancy[]
  documentIds: string[]
  inspectionNote?: string
  inspectedAt?: string
  inspectedBy?: string
}

export interface LandedCostAllocationRecord {
  id: string
  organizationId?: string
  receiptId: string
  currency: string
  freightCost: number
  dutyCost: number
  insuranceCost: number
  totalLandedCost: number
  allocationMethod: 'EXTENDED_VALUE'
  allocations: Array<{ receiptLineId: string; lotId: string; allocatedCost: number; landedUnitCost: number }>
  postedAt: string
  postedBy: string
}

export interface StorageLocation {
  id: string
  organizationId?: string
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

export interface InventoryAgingRecord {
  lotId: string
  lotNumber: string
  materialId: string
  materialName: string
  location: string
  quantityGrams: number
  value: number
  agingDays: number
  lastMovementAt?: string
  status: 'FRESH' | 'AGING' | 'DEAD_STOCK' | 'EXPIRED' | 'RETEST_DUE' | 'IN_TRANSIT'
  reason: string
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

export type DocumentStatus =
  | 'QUARANTINED'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'SHARED'
  | 'ARCHIVED'

export type DocumentScanStatus = 'PENDING' | 'CLEAN' | 'INFECTED' | 'ERROR' | 'NOT_REQUIRED'
export type DocumentOcrStatus = 'NOT_REQUESTED' | 'PENDING' | 'COMPLETE' | 'FAILED'

export interface DocumentRecord {
  id: string
  organizationId?: string
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
  fileName?: string
  versionGroupId?: string
  supersedesDocumentId?: string
  tags?: string[]
  scanStatus?: DocumentScanStatus
  scannedAt?: string
  scanProvider?: string
  ocrStatus?: DocumentOcrStatus
  extractedTextPreview?: string
  retentionUntil?: string
  archivedAt?: string
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
  /** Tenant events must carry an organization id. Platform events are redacted and never appear in a tenant feed. */
  organizationId?: string
  scope?: 'tenant' | 'platform'
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
  customDomain?: string
  plan: 'Free' | 'Pro' | 'Team' | 'Enterprise'
  status: 'ACTIVE' | 'FROZEN' | 'SUSPENDED'
  primaryContact: string
  createdAt: string
}

export type CustomDomainProvisioningStatus = 'pending_validation' | 'active' | 'failed'

export interface SaasCustomDomainRecord {
  id: string
  organizationId: string
  hostname: string
  providerId: string
  status: CustomDomainProvisioningStatus
  providerStatus?: string
  sslStatus?: string
  validation: Record<string, string>
  verificationErrors: string[]
  requestedBy: string
  createdAt: string
  updatedAt: string
  lastCheckedAt?: string
  activatedAt?: string
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
  /** Organization policies are scoped to one tenant; platform policies deliberately omit this value. */
  organizationId?: string
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
  csrfToken?: string
  revokedAt?: string
  revokedReason?: string
}

export interface UserSettingsRecord {
  userId: string
  organizationId: string
  email: string
  displayName: string
  preferredLanding: DomainKey
  uiDensity: 'comfortable' | 'compact'
  sidebarMode: 'expanded' | 'rail'
  reduceMotion: boolean
  emailDigest: 'off' | 'daily' | 'weekly'
  accentColor: string
  formulaWorkspace: FormulaWorkspacePreferences
  updatedAt: string
}

export interface FormulaWorkspacePreferences {
  library: boolean
  summary: boolean
  ifra: boolean
  evaporation: boolean
}

export function createDefaultFormulaWorkspacePreferences(): FormulaWorkspacePreferences {
  return {
    library: true,
    summary: true,
    ifra: true,
    evaporation: true,
  }
}

export function normalizeFormulaWorkspacePreferences(
  value: unknown,
  fallback: FormulaWorkspacePreferences = createDefaultFormulaWorkspacePreferences(),
): FormulaWorkspacePreferences {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null

  return {
    library: typeof candidate?.library === 'boolean' ? candidate.library : fallback.library,
    summary: typeof candidate?.summary === 'boolean' ? candidate.summary : fallback.summary,
    ifra: typeof candidate?.ifra === 'boolean' ? candidate.ifra : fallback.ifra,
    evaporation: typeof candidate?.evaporation === 'boolean' ? candidate.evaporation : fallback.evaporation,
  }
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
  organizationId?: string
  key: string
  label: string
  enabled: boolean
  phase: number
}

export interface NumberingSequenceRecord {
  organizationId?: string
  key: string
  pattern: string
  nextValue: number
  scope: 'organization' | 'brand'
}

export interface CustomFieldDefinition {
  organizationId?: string
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
  logoMode: 'wordmark' | 'monogram' | 'image'
  logoImageUrl?: string
}

export interface ProductionWorkOrderStep {
  id: string
  label: string
  status: 'PENDING' | 'READY' | 'DONE' | 'BLOCKED'
  equipment: string
  plannedMinutes: number
  evidence?: string
}

export interface ProductionQcCheck {
  id: string
  label: string
  result: 'PENDING' | 'PASSED' | 'FAILED'
  recordedAt?: string
  note?: string
}

export interface ProductionQcTemplateRecord {
  id: string
  organizationId?: string
  formulaId?: string
  name: string
  status: 'ACTIVE' | 'ARCHIVED'
  checks: Array<{
    id: string
    label: string
    kind: 'NUMERIC' | 'TEXT' | 'BOOLEAN'
    required: boolean
    min?: number
    max?: number
    expectedText?: string
    unit?: string
  }>
  updatedAt: string
  updatedBy: string
}

export interface ProductionQcResultRecord {
  id: string
  organizationId?: string
  batchId: string
  templateCheckId: string
  label: string
  status: 'PENDING' | 'PASSED' | 'FAILED' | 'NOT_APPLICABLE'
  observedValue?: string
  note?: string
  documentIds: string[]
  recordedAt: string
  recordedBy: string
  approvedAt?: string
  approvedBy?: string
}

export interface ProductionYieldRecord {
  id: string
  organizationId?: string
  batchId: string
  yieldGrams: number
  wasteGrams: number
  laborCost: number
  overheadCost: number
  currency: string
  status: 'RECORDED' | 'RECONCILED'
  recordedAt: string
  recordedBy: string
  reconciledAt?: string
  reconciledBy?: string
  note?: string
}

export interface ProductionOutputLot {
  id: string
  lotNumber: string
  formulaId: string
  quantityGrams: number
  qualityStatus: 'RELEASED' | 'HOLD'
  releasedAt?: string
}

export interface FinishedGoodLotRecord {
  id: string
  organizationId: string
  batchId: string
  formulaId: string
  formulaCode: string
  lotNumber: string
  quantityGrams: number
  reservedGrams: number
  qualityStatus: 'RELEASED' | 'HOLD'
  releasedAt: string
  costPerGram: number
  currency: string
  location: string
}

export interface FinishedGoodMovementRecord {
  id: string
  organizationId: string
  finishedGoodLotId: string
  batchId: string
  formulaId: string
  orderId?: string
  type: 'PRODUCTION_OUTPUT' | 'RESERVATION' | 'RESERVATION_RELEASE' | 'FULFILLMENT'
  direction: 'IN' | 'HOLD' | 'RELEASE' | 'OUT'
  quantityGrams: number
  balanceAfter: number
  costPerGram: number
  cogsAmount?: number
  at: string
  actor: string
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
  qcTemplateId?: string
  qcApprovedAt?: string
  qcApprovedBy?: string
  yieldRecordId?: string
  coaDocumentId?: string
  workOrder: {
    id: string
    scheduledStartAt: string
    dueAt: string
    equipment: string
    steps: ProductionWorkOrderStep[]
  }
  qcChecks: ProductionQcCheck[]
  yieldGrams?: number
  yieldVariancePercent?: number
  outputLot?: ProductionOutputLot
  genealogy: {
    inputLotIds: string[]
    inputMovementIds: string[]
    outputLotId?: string
  }
}

export interface SupplierRecord {
  id: string
  organizationId?: string
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
  organizationId?: string
  supplierId: string
  materialId: string
  quantityGrams: number
  receivedGrams: number
  status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED'
  expectedDate: string
  unitCost: number
  currency: string
  createdAt: string
  /** Legacy primary-line fields remain populated so existing purchase orders stay readable. */
  lines?: PurchaseOrderLineItem[]
}

export interface PurchaseOrderLineItem {
  id: string
  materialId: string
  quantityGrams: number
  receivedGrams: number
  unitCost: number
}

export interface PriceHistoryRecord {
  id: string
  organizationId?: string
  materialId: string
  supplierId: string
  purchaseOrderId: string
  unitCost: number
  currency: string
  quantityGrams: number
  capturedAt: string
  source: 'PO_RECEIPT' | 'QUOTE'
}

export interface RfqComparisonOption {
  supplierId: string
  supplierName: string
  country: string
  leadTimeDays: number
  unitCost: number
  currency: string
  totalCost: number
  source: 'PRICE_HISTORY' | 'MATERIAL_REFERENCE'
  isRecommended: boolean
}

export interface RfqComparison {
  materialId: string
  materialName: string
  quantityGrams: number
  options: RfqComparisonOption[]
  recommendedSupplierId?: string
  invariant: string
}

export type CostMethod = 'FIFO' | 'LIFO' | 'WEIGHTED_AVERAGE' | 'STANDARD'

export interface CostMethodPolicy {
  materialId: string
  method: CostMethod
  standardCost?: number
  overheadPercent: number
}

export interface LandedCostProfile {
  materialId: string
  freightPercent: number
  dutyPercent: number
  insurancePercent: number
}

export interface CostedFormulaLine {
  materialId: string
  materialName: string
  grams: number
  effectivePercent: number
  unitCost: number
  lineCost: number
  contributionPercent: number
  sourcePath: string
  costSource: string
}

export interface FormulaCostReport {
  formulaId: string
  formulaCode: string
  method: 'MIXED_POLICY'
  totalGrams: number
  totalCost: number
  costPerGram: number
  costPerBottle: number
  mostExpensiveMaterial: string
  lines: CostedFormulaLine[]
  trace: string[]
  invariant: string
}

export interface BatchCostReport {
  batchId: string
  formulaId: string
  targetGrams: number
  outputGrams: number
  yieldVariancePercent: number
  costingBasis: 'RELEASED_OUTPUT' | 'TARGET_ESTIMATE'
  materialCostBasis: 'ACTUAL_LOT_CONSUMPTION' | 'FORMULA_ESTIMATE'
  materialCost: number
  laborCost: number
  overheadCost: number
  totalCost: number
  costPerGram: number
  sourceFormulaCost: FormulaCostReport
  invariant: string
}

export interface SkuMarginReport {
  skuId: string
  skuName: string
  materialId: string
  packSizeGrams: number
  price: number
  currency: string
  unitCost: number
  packCost: number
  margin: number
  marginPercent: number
  recommendedPrice: number
  trace: string[]
}

export interface ValuationLine {
  materialId: string
  materialName: string
  currentGrams: number
  availableGrams: number
  reservedGrams: number
  unitCost: number
  value: number
  method: CostMethod
  locationBreakdown: {
    location: string
    grams: number
    value: number
  }[]
}

export interface InventoryValuationReport {
  asOf: string
  totalValue: number
  reservedValue: number
  availableValue: number
  lines: ValuationLine[]
  invariant: string
}

export interface CogsLine {
  ref: string
  movementId: string
  type: InventoryMovement['type']
  materialId: string
  materialName: string
  quantityGrams: number
  unitCost: number
  cogs: number
}

export interface CostingOverview {
  valuation: InventoryValuationReport
  formula: FormulaCostReport
  skuMargins: SkuMarginReport[]
  cogs: CogsLine[]
  methodPolicies: CostMethodPolicy[]
  landedCosts: LandedCostProfile[]
  invariant: string
}

export interface AnalyticsBurnRateRow {
  materialId: string
  materialName: string
  usageGrams: number
  dailyBurnGrams: number
  eventCount: number
  sourceMovementIds: string[]
}

export interface LowStockForecastRow {
  materialId: string
  materialName: string
  availableGrams: number
  dailyBurnGrams: number
  daysToStockout: number
  suggestedOrderGrams: number
  source: 'MOVEMENT_LEDGER'
}

export interface ExpiryRiskRow {
  lotId: string
  lotNumber: string
  materialId: string
  materialName: string
  expiryDate: string
  daysUntilExpiry: number
  gramsAtRisk: number
  riskScore: number
  status: 'LOW' | 'MEDIUM' | 'HIGH'
}

export interface CostRankingRow {
  materialId: string
  materialName: string
  usageGrams: number
  unitCost: number
  extendedCost: number
  rank: number
}

export interface InventoryAnalyticsRow {
  materialId: string
  materialName: string
  family: string
  currentGrams: number
  availableGrams: number
  inventoryValue: number
  turnoverRatio: number
  deadStock: boolean
  agingDays: number
}

export interface RoleDashboardWidget {
  id: string
  role: 'Perfumer' | 'Inventory' | 'Finance' | 'Owner'
  title: string
  value: string
  drilldown: string
}

export interface ScheduledReportRecord {
  id: string
  organizationId?: string
  name: string
  cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  audience: string
  format: 'PDF' | 'XLSX'
  status: 'ACTIVE' | 'PAUSED'
  lastRunAt?: string
}

export interface AnalyticsDashboardReport {
  burnRate: AnalyticsBurnRateRow[]
  lowStockForecast: LowStockForecastRow[]
  expiryRisk: ExpiryRiskRow[]
  costRanking: CostRankingRow[]
  inventoryAnalytics: InventoryAnalyticsRow[]
  roleWidgets: RoleDashboardWidget[]
  scheduledReports: ScheduledReportRecord[]
  invariant: string
}

export interface OperationalAnalyticsReport {
  quarantineLots: number
  openReceiptDiscrepancies: number
  qcFailures: number
  receiptsByStatus: Array<{ status: ProcurementReceiptRecord['status']; count: number }>
  supplierPerformance: Array<{ supplierId: string; receipts: number; accepted: number; returned: number; acceptanceRatePercent: number }>
  yieldVariance: Array<{ batchId: string; yieldVariancePercent: number; wasteGrams: number; status: ProductionYieldRecord['status'] }>
  landedCostVariance: Array<{ receiptId: string; totalLandedCost: number; materialValue: number; landedPercent: number }>
  actualBatchMargins: Array<{ batchId: string; formulaId: string; unitCost: number; price: number; marginPercent: number }>
  invariant: string
}

export interface CommercialSkuRecord {
  id: string
  organizationId?: string
  materialId: string
  formulaId?: string
  productKind?: 'MATERIAL' | 'FORMULA'
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
  organizationId?: string
  name: string
  customerGroup: 'Studio' | 'Lab' | 'Bulk' | 'Contract'
  currency: string
  multiplier: number
  sampleEligible: boolean
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
}

export interface QuoteRecord {
  id: string
  organizationId?: string
  skuId: string
  customer: string
  customerGroup: PriceListRecord['customerGroup']
  quantityPacks: number
  unitPrice: number
  total: number
  currency: string
  status: 'DRAFT' | 'REVIEW' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CONVERTED'
  createdAt: string
  lines?: QuoteLineItem[]
}

export interface QuoteLineItem {
  skuId: string
  quantityPacks: number
  unitPrice: number
  lineTotal: number
}

export interface SampleRequestRecord {
  id: string
  organizationId?: string
  skuId: string
  customer: string
  packs: number
  status: 'REQUESTED' | 'APPROVED' | 'DECLINED' | 'CONVERTED'
  createdAt: string
}

export interface CustomerAddress {
  id: string
  label: string
  line1: string
  city: string
  country: string
}

export interface CustomerRecord {
  id: string
  organizationId?: string
  name: string
  group: PriceListRecord['customerGroup']
  creditLimit: number
  paymentTerms: 'NET_15' | 'NET_30' | 'PREPAID'
  contactEmail: string
  billingAddress: CustomerAddress
  shippingAddress: CustomerAddress
  status: 'ACTIVE' | 'CREDIT_HOLD' | 'ARCHIVED'
}

export interface ShipmentRecord {
  id: string
  organizationId?: string
  orderId: string
  carrier: 'DHL' | 'FedEx' | 'UPS' | 'Pickup'
  trackingNumber: string
  status: 'PICKING' | 'PACKED' | 'SHIPPED' | 'DELIVERED'
  shippedAt?: string
  deliveredAt?: string
  weightGrams: number
  allocations: Allocation[]
}

export interface OrderDocumentRecord {
  id: string
  organizationId?: string
  orderId: string
  type: 'PICK_LIST' | 'PACKING_SLIP' | 'INVOICE' | 'COA'
  status: 'DRAFT' | 'READY' | 'SENT'
  url: string
  createdAt: string
}

export interface SalesOrderRecord {
  id: string
  organizationId?: string
  skuId: string
  customerId: string
  customer: string
  quantity: number
  unitPrice: number
  discountPercent: number
  taxPercent: number
  shippingCost: number
  total: number
  currency: string
  reservedGrams: number
  fulfilledGrams: number
  status:
    | 'DRAFT'
    | 'CONFIRMED'
    | 'RESERVED'
    | 'BACKORDER'
    | 'PICKING'
    | 'PACKED'
    | 'SHIPPED'
    | 'FULFILLED'
    | 'DELIVERED'
    | 'INVOICED'
    | 'CLOSED'
    | 'CANCELLED'
    | 'HOLD'
  carrier?: ShipmentRecord['carrier']
  trackingNumber?: string
  reservationAllocations?: Allocation[]
  shipmentId?: string
  documentIds?: string[]
  createdAt: string
  lines?: SalesOrderLineItem[]
}

export interface SalesOrderLineItem {
  skuId: string
  quantity: number
  unitPrice: number
  lineTotal: number
  reservedGrams?: number
  fulfilledGrams?: number
}

export interface BillingPlanRecord {
  id: string
  name: string
  seats: number
  storageGb: number
  apiQuota: number
  monthlyPrice: number
  currency: string
  limits: {
    seats: number
    materials: number
    formulas: number
    lots: number
    documents: number
    storageGb: number
    apiCalls: number
    webhooks: number
    auditRetentionDays: number
  }
  features: string[]
}

export interface BillingSubscriptionRecord {
  id: string
  organizationId: string
  planId: string
  provider: 'manual' | 'paddle' | 'stripe'
  collectionMode: 'manual_invoice' | 'hosted_checkout'
  status: 'trialing' | 'active' | 'past_due' | 'grace' | 'frozen' | 'canceled'
  currentPeriodStart: string
  currentPeriodEnd: string
  trialEndsAt?: string
  graceEndsAt?: string
  freezeReason?: string
  providerCustomerId?: string
  providerSubscriptionId?: string
  canWrite: boolean
  canExport: boolean
  nextInvoiceAt: string
  updatedAt: string
}

export interface BillingUsageMeterRecord {
  id: string
  organizationId: string
  periodStart: string
  periodEnd: string
  activeSeats: number
  materials: number
  formulas: number
  lots: number
  documents: number
  storageGb: number
  apiCalls: number
  webhooks: number
  auditEvents: number
  lastCalculatedAt: string
}

export interface BillingInvoiceRecord {
  id: string
  subscriptionId: string
  number: string
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  amountDue: number
  currency: string
  dueAt: string
  paidAt?: string
  hostedInvoiceUrl: string
  documentId?: string
  providerInvoiceId?: string
}

export interface BillingLimitCheck {
  key: keyof BillingPlanRecord['limits']
  label: string
  used: number
  limit: number
  percent: number
  status: 'pass' | 'warning' | 'blocked'
}

export interface WebhookDeliveryRecord {
  id: string
  webhookId: string
  event: string
  status: 'delivered' | 'retrying' | 'failed'
  attempts: number
  lastAttemptAt: string
  nextRetryAt?: string
  responseCode?: number
  idempotencyKey: string
}

export interface CommercialReadinessCheck {
  key: string
  label: string
  status: 'pass' | 'warning' | 'blocked'
  detail: string
}

export interface BillingActionResponse {
  id: string
  mode: 'checkout' | 'portal' | 'manual_sales' | 'plan_selected' | 'freeze' | 'reactivate' | 'webhook_retry'
  status: 'queued' | 'ready' | 'completed'
  url?: string
  audit: AuditEvent
  invariant: string
}

export type NotificationCategory = 'security' | 'billing' | 'inventory' | 'workspace' | 'system'
export type NotificationDeliveryStatus = 'in_app' | 'queued' | 'sent' | 'failed'

export type BillingMode = 'managed_beta' | 'self_service'

export type IntegrationReadinessStatus = 'ready' | 'not_configured' | 'blocked'

export interface IntegrationReadinessCheck {
  key: 'billing' | 'documents' | 'email' | 'cloudflare_saas' | 'beta_hostname'
  label: string
  status: IntegrationReadinessStatus
  detail: string
}

export interface IntegrationReadinessResponse {
  billingMode: BillingMode
  checks: IntegrationReadinessCheck[]
  checkedAt: string
  invariant: string
}

export interface AppNotificationRecord {
  id: string
  organizationId: string
  recipientEmail: string
  category: NotificationCategory
  title: string
  body: string
  href?: string
  createdAt: string
  readAt?: string
  emailStatus: NotificationDeliveryStatus
  emailError?: string
  emailAttempts?: number
  emailLastAttemptAt?: string
  emailNextAttemptAt?: string
  emailSentAt?: string
}

export interface DataImportIssue {
  row: number
  field?: string
  message: string
}

export interface DataImportJobRecord {
  id: string
  organizationId: string
  requestedBy: string
  entity: 'materials' | 'lots'
  fileName: string
  idempotencyKey: string
  status: 'DRAFT' | 'VALIDATED' | 'COMPLETED' | 'FAILED'
  totalRows: number
  validRows: number
  invalidRows: number
  errors: DataImportIssue[]
  rows: Array<Record<string, unknown>>
  createdAt: string
  committedAt?: string
}

export type LegalDocumentKind = 'terms' | 'privacy' | 'cookies'

export interface LegalAcceptanceRecord {
  id: string
  organizationId: string
  userId: string
  email: string
  document: LegalDocumentKind
  version: string
  acceptedAt: string
}

export interface PrivacyRequestRecord {
  id: string
  organizationId: string
  requestedBy: string
  subjectEmail: string
  type: 'EXPORT' | 'ERASURE'
  status: 'REQUESTED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED'
  createdAt: string
  completedAt?: string
}

export interface GlobalSearchResult {
  id: string
  kind: 'material' | 'formula' | 'lot' | 'document' | 'supplier'
  title: string
  subtitle: string
  href: string
}

export interface BillingConsoleResponse {
  billingMode: BillingMode
  plans: BillingPlanRecord[]
  plan: BillingPlanRecord
  subscription: BillingSubscriptionRecord
  usage: BillingUsageMeterRecord
  limitChecks: BillingLimitCheck[]
  invoices: BillingInvoiceRecord[]
  sso: SsoConfigRecord
  apiKeys: ApiKeyRecord[]
  webhooks: WebhookRecord[]
  webhookDeliveries: WebhookDeliveryRecord[]
  auditExports: AuditExportJobRecord[]
  readiness: CommercialReadinessCheck[]
  invariant: string
}

export interface SsoConfigRecord {
  id: string
  organizationId: string
  provider: 'OIDC' | 'SAML'
  domain: string
  status: 'draft' | 'verified' | 'enforced'
  issuerUrl: string
  metadataUrl?: string
  clientId?: string
  acsUrl: string
  entityId: string
  domainVerifiedAt?: string
  jitProvisioning: boolean
  enforceSso: boolean
  scim: {
    enabled: boolean
    baseUrl: string
    tokenLastFour?: string
    tokenRotatedAt?: string
    tokenHash?: string
    deprovisionAction: 'revoke_sessions' | 'disable_user'
    status: 'disabled' | 'enabled'
  }
  roleMapping: Record<string, string>
  updatedAt: string
}

export interface ApiKeyRecord {
  id: string
  organizationId: string
  label: string
  prefix: string
  lastFour: string
  scopes: string[]
  createdAt: string
  createdBy: string
  rotatedAt: string
  lastUsedAt?: string
  expiresAt?: string
  status: 'active' | 'revoked'
  secretHash?: string
}

export interface WebhookRecord {
  id: string
  organizationId: string
  url: string
  events: string[]
  status: 'active' | 'paused'
  lastDelivery: string
  createdAt: string
  owner: string
  signingSecretLastFour: string
  signingSecretRotatedAt: string
  failureCount: number
}

export interface AuditExportJobRecord {
  id: string
  organizationId: string
  requestedBy: string
  format: 'JSON' | 'CSV'
  scope: string
  status: 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED'
  eventCount: number
  checksum: string
  downloadUrl?: string
  createdAt: string
  completedAt?: string
  expiresAt: string
  auditEventId: string
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
  sourceType?: 'MATERIAL' | 'FINISHED_GOOD'
  formulaId?: string
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
  status: 'COMMITTED' | 'PARTIALLY_REVERSED' | 'REVERSED'
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
  active: { label: 'Active', color: '#0f766e' },
  stable: { label: 'Stable', color: '#15803d' },
  testing: { label: 'Testing', color: '#b45309' },
  review: { label: 'Review', color: '#9a6700' },
  draft: { label: 'Draft', color: 'rgba(110,118,132,0.72)' },
  alert: { label: 'Alert', color: '#b42318' },
}

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
    screens: ['Dashboard', 'Audit dashboard'],
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
    responsibility: 'Formula tree, accords, versions, resolve, IFRA, evaporation',
    status: 'active',
    health: 90,
    risk: 'Accord line editing, version snapshots, approval, export audit, resolve, and cost roll-up are live',
    owner: 'Perfumer Team',
    entities: ['Formula', 'FormulaLine', 'FormulaVersion', 'ReviewRecord'],
    features: ['Gram-first editor', 'Accord', 'Line edit/delete/reorder', 'Version snapshot', 'Approval state', 'Formula export audit', 'Cost roll-up', 'Evaporation curve'],
    invariants: ['INV-006 save non-consuming', 'INV-007 explicit consumption only', 'INV-013 resolve before compute'],
    apis: ['/api/v1/formulas', '/api/v1/formulas/:id/lines', '/api/v1/formulas/:id/lines/:lineId', '/api/v1/formulas/:id/versions', '/api/v1/formulas/:id/approve', '/api/v1/formulas/:id/export', '/api/v1/formulas/:id/resolve', '/api/v1/formulas/:id/cost'],
    permissions: ['formulas.view', 'formulas.viewSensitive', 'formulas.export'],
    screens: ['Formula table', 'Accord editor', 'Line controls', 'Resolve preview', 'Version history', 'Approval and export'],
    activity: 'FRM-0421 can snapshot, approve, export, and resolve accord leaves without stock movement',
  },
  {
    key: 'formulaAgent',
    phase: 'AI',
    name: 'Formula Research Agent',
    shortName: 'Formula Agent',
    responsibility: 'Tenant-scoped research workflow that produces structured, reviewable formula proposals',
    status: 'active',
    health: 84,
    risk: 'Mock mode is available by default; OpenAI mode remains unavailable until Worker secrets are configured',
    owner: 'Perfumer Team',
    entities: ['AgentRun', 'WorkflowNode', 'ToolCall', 'Artifact', 'Confirmation'],
    features: ['Brief analysis', 'Material search', 'Inventory advisory', 'Cost and IFRA preview', 'Explicit draft confirmation'],
    invariants: ['Agent tools inherit tenant permissions', 'No arbitrary SQL or tools', 'Draft save is non-consuming', 'Confirmation is idempotent'],
    apis: ['/api/v1/agent/runs', '/api/v1/agent/runs/:id/stream', '/api/v1/agent/runs/:id/confirmations/:confirmationId'],
    permissions: ['formulas.view'],
    screens: ['Formula research workspace', 'Workflow progress', 'Structured artifacts', 'Confirmation'],
    activity: 'Research runs are persisted, replayable, and require confirmation before an editable formula draft is saved',
  },
  {
    key: 'formulaDesignStudio',
    phase: 'AI Design',
    name: 'Formula Design Studio',
    shortName: 'Design Studio',
    responsibility: 'Brand briefs, deterministic fragrance directions, perfumer sharing, and explicit draft save',
    status: 'active',
    health: 88,
    risk: 'Deterministic mock mode is active; provider mode remains disabled until explicitly configured',
    owner: 'Perfumer Team',
    entities: ['DesignProject', 'CreativeBrief', 'Direction', 'BrandFeedback', 'AgentRun'],
    features: ['Structured brand brief', 'Availability-first ranking', 'Creative directions', 'Safe sharing', 'Feedback', 'Explicit draft confirmation'],
    invariants: ['Brand users cannot edit ratios or save formulas', 'Commercial evidence is capability-scoped', 'Draft save is non-consuming'],
    apis: ['/api/v1/formula-intelligence/design-projects', '/api/v1/agent/runs/:id'],
    permissions: ['formulas.view'],
    screens: ['Brand brief', 'Direction review', 'Perfumer handoff', 'Draft confirmation'],
    activity: 'Directions are generated from approved workspace materials and shared deliberately for brand review',
  },
  {
    key: 'reformulationOptimizer',
    phase: 'AI Optimize',
    name: 'Reformulation Optimizer',
    shortName: 'Optimizer',
    responsibility: 'Immutable baseline comparisons for compliance, feasibility, cost, and composition change',
    status: 'active',
    health: 88,
    risk: 'Candidate evidence is redacted without current cost or inventory permission',
    owner: 'Perfumer Team',
    entities: ['FormulaVersion', 'OptimizerRun', 'Candidate', 'Substitution', 'Confirmation'],
    features: ['Immutable baseline', 'Compliance alternatives', 'Inventory recovery', 'Cost recovery', 'Candidate comparison', 'Explicit draft confirmation'],
    invariants: ['No blocked materials in accepted candidates', 'Locked materials are preserved', 'No reservation or consumption on save'],
    apis: ['/api/v1/formula-intelligence/optimizer/runs', '/api/v1/agent/runs/:id'],
    permissions: ['formulas.viewSensitive'],
    screens: ['Baseline selector', 'Candidate comparison', 'Evidence summary', 'Draft confirmation'],
    activity: 'Candidates rank compliance feasibility, eligible availability, cost evidence, and composition change',
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
    status: 'active',
    health: 80,
    risk: 'Batch create, work order, consumption, QC protocol, output lot genealogy, and lifecycle controls are live; finished-goods inventory remains next gate',
    owner: 'Manufacturing',
    entities: ['ProductionBatch', 'BatchConsumption', 'QCRecord'],
    features: ['Scale batch', 'Work order', 'Consume lots', 'QC protocol', 'Output lot genealogy', 'Lifecycle state machine', 'Yield reconcile'],
    invariants: ['Production movement separated from lab usage', 'Batch records no hard-delete'],
    apis: ['/api/v1/production/batches', '/api/v1/production/batches/:id/consume', '/api/v1/production/batches/:id/qc', '/api/v1/production/batches/:id/status'],
    permissions: ['production.view', 'production.consume', 'production.qc'],
    screens: ['Batch timeline', 'Work order', 'QC protocol', 'Output genealogy', 'Batch cost'],
    activity: 'Production batches create work orders, consume input lots, record QC evidence, and release output lots with genealogy',
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
    status: 'active',
    health: 76,
    risk: 'Order lifecycle, reservation release, shipment trace, and docs are live; portal and AR depth remain next gate',
    owner: 'Fulfillment',
    entities: ['Customer', 'SalesOrder', 'OrderLine', 'StockReservation', 'Shipment', 'OrderDocument'],
    features: ['Customer profile', 'Order entry', 'Reserve stock', 'Cancel/release', 'Pack/ship trace', 'Fulfill OUT', 'Order docs'],
    invariants: ['INV-016 reservation != movement', 'No negative stock', 'Shipment keeps lot allocation trace'],
    apis: ['/api/v1/customers', '/api/v1/orders', '/api/v1/orders/:id/reserve', '/api/v1/orders/:id/cancel', '/api/v1/orders/:id/pack', '/api/v1/orders/:id/ship', '/api/v1/orders/:id/fulfill'],
    permissions: ['orders.view', 'orders.reserve', 'orders.fulfill'],
    screens: ['Order queue', 'Customer credit', 'Pick/pack/ship', 'Fulfillment evidence'],
    activity: 'Order reserve creates no movement; pack/ship records carrier trace; fulfill creates OUT movement with invoice/COA docs',
  },
  {
    key: 'costing',
    phase: '13',
    name: 'Costing & Finance',
    shortName: 'Costing',
    responsibility: 'Material, formula, batch, SKU cost, valuation, COGS, margin',
    status: 'active',
    health: 78,
    risk: 'Finance is read-model only; costing traces every source without posting accounting entries',
    owner: 'Finance',
    entities: ['CostSnapshot', 'FormulaCost', 'BatchCost', 'SKUCost', 'Valuation', 'COGS'],
    features: ['Cost methods', 'Landed cost', 'Formula cost breakdown', 'Batch cost', 'SKU margin', 'COGS ledger', 'Valuation report'],
    invariants: ['INV-012 costing reconciles', 'Resolve before compute', 'Finance read model does not mutate inventory'],
    apis: ['/api/v1/costing/overview', '/api/v1/costing/formulas/:id', '/api/v1/costing/batches/:id', '/api/v1/costing/skus/:id', '/api/v1/costing/valuation'],
    permissions: ['costing.view', 'finance.viewMargin'],
    screens: ['Formula cost', 'Cost method policy', 'Inventory valuation', 'SKU margin', 'COGS trace'],
    activity: 'FRM-0421 cost recalculated from lot snapshots with landed-cost and overhead policy trace',
  },
  {
    key: 'analytics',
    phase: '14',
    name: 'Analytics & Intelligence',
    shortName: 'Analytics',
    responsibility: 'Burn rate, low-stock forecast, expiry risk, cost ranking, role dashboards',
    status: 'active',
    health: 77,
    risk: 'Read-only widgets expose insights and scheduled reports without mutation entry points',
    owner: 'Insights',
    entities: ['ReadModel', 'Aggregate', 'Forecast', 'DashboardWidget', 'ScheduledReport'],
    features: ['Burn rate', 'Cost ranking', 'Expiry risk', 'Forecast PO suggestion', 'Inventory analytics', 'Role dashboards', 'Report delivery'],
    invariants: ['Dashboard read-only', 'Analytics reconciles movement ledger'],
    apis: ['/api/v1/analytics/dashboard', '/api/v1/analytics/burn-rate', '/api/v1/analytics/low-stock-forecast', '/api/v1/analytics/expiry-risk', '/api/v1/analytics/cost-ranking', '/api/v1/analytics/reports'],
    permissions: ['analytics.view'],
    screens: ['Analytics dashboard', 'Inventory analytics', 'Scheduled reports', 'Compare panel'],
    activity: 'Expiry risk, burn-rate and cost-ranking widgets reconcile from the movement ledger',
  },
  {
    key: 'saas',
    phase: '15',
    name: 'Commercial & Enterprise Readiness',
    shortName: 'SaaS',
    responsibility: 'Billing, plans, SSO, SCIM, API keys, webhooks, audit export, platform admin',
    status: 'active',
    health: 93,
    risk: 'SaaS health now aggregates subscription gates, usage metering, invoices, SSO/SCIM, API keys, webhooks, and audit export evidence',
    owner: 'Enterprise',
    entities: ['Plan', 'Subscription', 'UsageMeter', 'SSOConfig', 'SCIMToken', 'ApiKey', 'Webhook'],
    features: ['SaaS health engine', 'Plan limit enforcement', 'Subscription freeze/reactivate', 'Invoice lifecycle', 'SSO/SCIM', 'Webhook retry', 'Audit export', 'Platform admin'],
    invariants: ['Tenant admin never crosses org', 'Platform actions audited', 'Frozen tenant cannot perform commercial writes'],
    apis: ['/api/v1/billing/console', '/api/v1/billing/checkout', '/api/v1/billing/subscription/freeze', '/api/v1/sso-config', '/api/v1/audit/export', '/api/v1/platform/tenants'],
    permissions: ['billing.manage', 'security.sso.manage', 'audit.export'],
    screens: ['Billing', 'SSO/SCIM', 'API keys', 'Platform console'],
    activity: 'Commercial console scores SaaS health, enforces limits, queues invoices/actions, retries webhooks, and exports workspace-scoped evidence',
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
    organizationId: 'org-nxl',
    brandId: 'brand-nxl',
    concentrationType: 'OTHER',
    finalProductConcentrationPercent: 100,
    targetMarkets: ['GLOBAL'],
    brief: 'A bright, reusable citrus accord with a transparent floral lift.',
    inspiration: 'Fresh bergamot peel in cool morning air.',
    pyramidSummary: 'Top-led citrus with an airy floral and woody drydown.',
    tags: ['citrus', 'fresh', 'accord'],
    project: 'Core accords',
    collection: 'Lab foundations',
    density: 0.91,
    bottleVolumeMl: 50,
    bottleCount: 1,
    ifraCategory: '4',
    workflowStatus: 'APPROVED',
    draftRevision: 4,
    updatedAt: '2026-06-24T08:10:00.000Z',
    updatedBy: 'Thuan Le Minh',
    lockedVersion: 'v4',
    assignedReviewer: 'Lab Manager',
    approvalHistory: [
      { id: 'APR-ACC-0007', action: 'APPROVED', actor: 'Thuan Le Minh', reviewer: 'Lab Manager', comment: 'Reusable accord approved.', signature: 'Thuan Le Minh', at: '2026-06-24T08:10:00.000Z' },
    ],
    formulaType: 'ACCORD',
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
    organizationId: 'org-nxl',
    brandId: 'brand-nxl',
    concentrationType: 'EDP',
    finalProductConcentrationPercent: 20,
    targetMarkets: ['EU', 'US', 'UK'],
    brief: 'A luminous woody citrus fragrance with a soft musky trail.',
    inspiration: 'Blue hour over a rain-cooled city.',
    pyramidSummary: 'Citrus top, jasmine heart, amber-wood and musk base.',
    tags: ['woody', 'citrus', 'musk'],
    project: 'Nocturne',
    collection: 'Edition 01',
    density: 0.87,
    bottleVolumeMl: 50,
    bottleCount: 100,
    ifraCategory: '4',
    workflowStatus: 'DRAFT',
    draftRevision: 13,
    updatedAt: '2026-07-18T00:00:00.000Z',
    updatedBy: 'Thuan Le Minh',
    parentVersion: 'v12',
    assignedReviewer: 'Lab Manager',
    approvalHistory: [],
    formulaType: 'FINE_FRAGRANCE',
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
    organizationId: 'org-nxl',
    metadata: formulaSnapshotMetadata(formulas[1]!),
    evaluations: [],
    resolvedLeaves: resolveFormulaWithCatalog('frm-0421', formulas, materials),
    ifraEvaluation: evaluateFormulaIfra(formulas[1]!, resolveFormulaWithCatalog('frm-0421', formulas, materials)),
    evaporation: evaporationCurve(resolveFormulaWithCatalog('frm-0421', formulas, materials)),
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
    organizationId: 'org-nxl',
    metadata: formulaSnapshotMetadata(formulas[0]!),
    evaluations: [
      {
        id: 'EVAL-ACC-0007-D7',
        day: 7,
        observation: 'Citrus lift remains clear; no haze or sediment.',
        stability: 'PASS',
        rating: 4,
        evaluator: 'Lab Manager',
        evaluatedAt: '2026-06-23T08:10:00.000Z',
      },
    ],
    resolvedLeaves: resolveFormulaWithCatalog('frm-accord-citrus', formulas, materials),
    ifraEvaluation: evaluateFormulaIfra(formulas[0]!, resolveFormulaWithCatalog('frm-accord-citrus', formulas, materials)),
    evaporation: evaporationCurve(resolveFormulaWithCatalog('frm-accord-citrus', formulas, materials)),
    createdAt: '2026-06-24T08:10:00.000Z',
    createdBy: 'Thuan Le Minh',
    note: 'Citrus Lift Accord approved as reusable accord.',
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
  { id: 'MOV-1026', at: '2026-06-28 17:42', type: 'FULFILLMENT', direction: 'OUT', materialId: 'mat-vanillin', lotId: 'lot-van-001', quantityGrams: 12, balanceAfter: 80, ref: 'ORD-DEMO-092', actor: 'Fulfillment' },
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
    customDomain: 'example.test',
    plan: 'Team',
    status: 'ACTIVE',
    primaryContact: 'admin@labofscents.org',
    createdAt: '2026-01-08T03:20:00.000Z',
  },
  {
    id: 'org-other',
    name: 'External Demo Tenant',
    slug: 'external-demo',
    customDomain: 'external-demo.labofscents.org',
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
    id: 'MBR-ADMIN',
    userId: 'usr-admin',
    email: 'admin@labofscents.org',
    name: 'Thuan Le Minh',
    organizationId: 'org-nxl',
    brandIds: ['brand-nxl', 'brand-atelier'],
    role: 'Admin',
    status: 'ACTIVE',
    mfaEnabled: true,
    lastActiveAt: '2026-07-01T09:10:00.000Z',
  },
  {
    id: 'MBR-OWNER',
    userId: 'usr-owner',
    email: 'owner@example.test',
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
    email: 'lab@example.test',
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
    email: 'viewer@example.test',
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
  { key: 'platform.view', label: 'View platform shell', category: 'Platform', scope: 'organization', risk: 'low', description: 'Open the workspace-scoped OlfactoryOps console.' },
  { key: 'audit.view', label: 'View audit trail', category: 'Audit', scope: 'organization', risk: 'medium', description: 'Read tenant audit events and security evidence.' },
  { key: 'audit.export', label: 'Export audit evidence', category: 'Audit', scope: 'organization', risk: 'high', description: 'Export regulated tenant audit data.' },
  { key: 'security.viewMembers', label: 'View member summary', category: 'Security', scope: 'organization', risk: 'medium', description: 'View workspace member totals, role distribution, and active session count without member identities.' },
  { key: 'security.manageUsers', label: 'Manage members', category: 'Security', scope: 'organization', risk: 'critical', description: 'Invite, activate, deactivate, and assign tenant roles.' },
  { key: 'security.viewAuditLog', label: 'View security audit', category: 'Security', scope: 'organization', risk: 'high', description: 'Inspect security-sensitive tenant events.' },
  { key: 'security.policy.manage', label: 'Manage security policy', category: 'Security', scope: 'organization', risk: 'critical', description: 'Change MFA, session timeout, and IP allowlist policy.' },
  { key: 'security.sessions.manage', label: 'Manage sessions', category: 'Security', scope: 'organization', risk: 'high', description: 'Revoke active sessions for tenant members.' },
  { key: 'security.apiKeys.manage', label: 'Manage API keys', category: 'Security', scope: 'organization', risk: 'critical', description: 'Create, rotate, and revoke API credentials.' },
  { key: 'security.webhooks.manage', label: 'Manage webhooks', category: 'Security', scope: 'organization', risk: 'high', description: 'Create, rotate, pause, and remove signed tenant webhooks.' },
  { key: 'security.sso.manage', label: 'Manage SSO/SCIM', category: 'Security', scope: 'organization', risk: 'critical', description: 'Configure enterprise identity providers and provisioning.' },
  { key: 'customization.manage', label: 'Manage tenant config', category: 'Customization', scope: 'organization', risk: 'medium', description: 'Edit settings, flags, fields, numbering, and branding.' },
  { key: 'materials.view', label: 'View materials', category: 'Materials', scope: 'organization', risk: 'low', description: 'Read tenant material records.' },
  { key: 'materials.create', label: 'Create materials', category: 'Materials', scope: 'organization', risk: 'medium', description: 'Create new material records.' },
  { key: 'materials.update', label: 'Update materials', category: 'Materials', scope: 'organization', risk: 'medium', description: 'Edit material records and provenance.' },
  { key: 'formulas.view', label: 'View formulas', category: 'Formulas', scope: 'organization', risk: 'medium', description: 'Read formula records without sensitive export privileges.' },
  { key: 'formulas.viewSensitive', label: 'View sensitive formulas', category: 'Formulas', scope: 'organization', risk: 'high', description: 'View confidential ratios, accords, and sensitive composition.' },
  { key: 'formulas.edit', label: 'Edit formula drafts', category: 'Formulas', scope: 'organization', risk: 'high', description: 'Create, edit, fork, and submit formula drafts without consuming stock.' },
  { key: 'formulas.approve', label: 'Approve formulas', category: 'Formulas', scope: 'organization', risk: 'critical', description: 'Approve immutable formula versions after compliance review.' },
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

const allOrganizationPermissions = permissionCatalog
  .filter((permission) => permission.scope === 'organization')
  .map((permission) => permission.key)

const internalAdministrationPermissions = new Set([
  'platform.view',
  'audit.view',
  'audit.export',
  'security.manageUsers',
  'security.viewAuditLog',
  'security.policy.manage',
  'security.sessions.manage',
  'security.apiKeys.manage',
  'security.webhooks.manage',
  'security.sso.manage',
  'customization.manage',
])

const customerOwnerPermissions = allOrganizationPermissions.filter(
  (permission) => !internalAdministrationPermissions.has(permission),
)

export const rolePolicies: RolePolicy[] = [
  {
    role: 'Owner',
    scope: 'organization',
    mfaRequired: true,
    permissions: customerOwnerPermissions,
  },
  {
    role: 'Admin',
    scope: 'organization',
    mfaRequired: true,
    permissions: allOrganizationPermissions,
  },
  {
    role: 'Manager',
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
      'formulas.edit',
      'formulas.approve',
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
      'formulas.edit',
      'formulas.approve',
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
      'formulas.edit',
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
].map((policy) => {
  const typedPolicy = policy as RolePolicy
  return typedPolicy.scope === 'organization'
    ? { ...typedPolicy, organizationId: 'org-nxl' }
    : typedPolicy
})

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
    id: 'SES-0000',
    userId: 'usr-admin',
    email: 'admin@labofscents.org',
    organizationId: 'org-nxl',
    brandId: 'brand-nxl',
    role: 'Admin',
    issuedAt: '2026-07-03T08:10:00.000Z',
    lastSeenAt: '2026-07-03T08:18:00.000Z',
    idleExpiresAt: '2026-07-10T08:33:00.000Z',
    expiresAt: '2026-07-10T16:10:00.000Z',
    status: 'ACTIVE',
    mfaVerified: true,
    ipAddress: '203.0.113.18',
    userAgent: 'Codex Desktop / Chrome',
    deviceId: 'dev-admin-codex',
    location: 'Bangkok, TH',
  },
  {
    id: 'SES-0001',
    userId: 'usr-owner',
    email: 'owner@example.test',
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
    email: 'lab@example.test',
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

export const userSettings: UserSettingsRecord[] = [
  {
    userId: 'usr-admin',
    organizationId: 'org-nxl',
    email: 'admin@labofscents.org',
    displayName: 'Thuan Le Minh',
    preferredLanding: 'dashboard',
    uiDensity: 'comfortable',
    sidebarMode: 'expanded',
    reduceMotion: false,
    emailDigest: 'weekly',
    accentColor: '#0f766e',
    formulaWorkspace: createDefaultFormulaWorkspacePreferences(),
    updatedAt: '2026-07-10T00:00:00.000Z',
  },
  {
    userId: 'usr-owner',
    organizationId: 'org-nxl',
    email: 'owner@example.test',
    displayName: 'Thuan Le Minh',
    preferredLanding: 'dashboard',
    uiDensity: 'comfortable',
    sidebarMode: 'expanded',
    reduceMotion: false,
    emailDigest: 'weekly',
    accentColor: '#0f766e',
    formulaWorkspace: createDefaultFormulaWorkspacePreferences(),
    updatedAt: '2026-07-10T00:00:00.000Z',
  },
  {
    userId: 'usr-lab',
    organizationId: 'org-nxl',
    email: 'lab@example.test',
    displayName: 'Lab Manager',
    preferredLanding: 'labUsage',
    uiDensity: 'compact',
    sidebarMode: 'rail',
    reduceMotion: false,
    emailDigest: 'daily',
    accentColor: '#15803d',
    formulaWorkspace: createDefaultFormulaWorkspacePreferences(),
    updatedAt: '2026-07-10T00:00:00.000Z',
  },
]

export const featureFlags: FeatureFlagRecord[] = [
  { organizationId: 'org-nxl', key: 'formulaCostVisibility', label: 'Hide costing for perfumer role', enabled: true, phase: 3 },
  { organizationId: 'org-nxl', key: 'sdsIngestionReviewOnly', label: 'SDS AI extract requires human approval', enabled: true, phase: 4 },
  { organizationId: 'org-nxl', key: 'enterpriseAuditExport', label: 'Tenant audit export', enabled: true, phase: 15 },
]

export const numberingSequences: NumberingSequenceRecord[] = [
  { organizationId: 'org-nxl', key: 'formula', pattern: 'FRM-####', nextValue: 422, scope: 'brand' },
  { organizationId: 'org-nxl', key: 'batch', pattern: 'BTH-YYYY-###', nextValue: 119, scope: 'brand' },
  { organizationId: 'org-nxl', key: 'purchaseOrder', pattern: 'PO-YYYY-###', nextValue: 15, scope: 'organization' },
  { organizationId: 'org-nxl', key: 'salesOrder', pattern: 'SO-YYYY-###', nextValue: 93, scope: 'organization' },
]

export const customFields: CustomFieldDefinition[] = [
  {
    organizationId: 'org-nxl',
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
    organizationId: 'org-nxl',
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
    organizationId: 'org-nxl',
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
  accentColor: '#0f766e',
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
    workOrder: {
      id: 'WO-BTH-2025-118',
      scheduledStartAt: '2026-07-12T08:00:00.000Z',
      dueAt: '2026-07-16T17:00:00.000Z',
      equipment: 'Pilot kettle PK-02',
      steps: [
        {
          id: 'WO-BTH-2025-118-01',
          label: 'Weigh raw materials',
          status: 'READY',
          equipment: 'Balance A-12',
          plannedMinutes: 45,
        },
        {
          id: 'WO-BTH-2025-118-02',
          label: 'Maceration hold',
          status: 'PENDING',
          equipment: 'Amber vessel AV-04',
          plannedMinutes: 2880,
        },
        {
          id: 'WO-BTH-2025-118-03',
          label: 'Filter and bottle',
          status: 'PENDING',
          equipment: 'Filter skid FS-01',
          plannedMinutes: 90,
        },
      ],
    },
    qcChecks: [
      { id: 'QC-BTH-2025-118-ODOR', label: 'Organoleptic match', result: 'PENDING' },
      { id: 'QC-BTH-2025-118-CLARITY', label: 'Clarity after filtration', result: 'PENDING' },
      { id: 'QC-BTH-2025-118-DENSITY', label: 'Density check', result: 'PENDING' },
    ],
    genealogy: {
      inputLotIds: [],
      inputMovementIds: [],
    },
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

export const costMethodPolicies: CostMethodPolicy[] = [
  { materialId: 'mat-iso', method: 'WEIGHTED_AVERAGE', overheadPercent: 6 },
  { materialId: 'mat-bergamot', method: 'FIFO', overheadPercent: 8 },
  { materialId: 'mat-hedione', method: 'FIFO', overheadPercent: 5 },
  { materialId: 'mat-ambroxan', method: 'STANDARD', standardCost: 0.33, overheadPercent: 9 },
  { materialId: 'mat-vanillin', method: 'LIFO', overheadPercent: 4 },
]

export const landedCostProfiles: LandedCostProfile[] = [
  { materialId: 'mat-bergamot', freightPercent: 6, dutyPercent: 4, insurancePercent: 1 },
  { materialId: 'mat-ambroxan', freightPercent: 3, dutyPercent: 2, insurancePercent: 1 },
  { materialId: 'mat-muscenone', freightPercent: 4, dutyPercent: 3, insurancePercent: 1 },
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

export const customers: CustomerRecord[] = [
  {
    id: 'CUS-DEMO',
    name: 'Maison Trial Studio',
    group: 'Studio',
    creditLimit: 250,
    paymentTerms: 'NET_15',
    contactEmail: 'ops@maison-trial.example',
    billingAddress: {
      id: 'ADDR-MAISON-BILL',
      label: 'Billing',
      line1: '22 Rue des Accords',
      city: 'Paris',
      country: 'FR',
    },
    shippingAddress: {
      id: 'ADDR-MAISON-SHIP',
      label: 'Studio Receiving',
      line1: '18 Quai des Notes',
      city: 'Paris',
      country: 'FR',
    },
    status: 'ACTIVE',
  },
  {
    id: 'CUS-ATELIER',
    name: 'Atelier Preview',
    group: 'Lab',
    creditLimit: 500,
    paymentTerms: 'NET_30',
    contactEmail: 'orders@atelier-preview.example',
    billingAddress: {
      id: 'ADDR-ATELIER-BILL',
      label: 'Billing',
      line1: '104 Lab Row',
      city: 'Geneva',
      country: 'CH',
    },
    shippingAddress: {
      id: 'ADDR-ATELIER-SHIP',
      label: 'Pilot Lab',
      line1: '11 Formulation Lane',
      city: 'Geneva',
      country: 'CH',
    },
    status: 'ACTIVE',
  },
]

export const salesOrders: SalesOrderRecord[] = [
  {
    id: 'ORD-DEMO-092',
    skuId: 'SKU-ISO-050',
    customerId: 'CUS-DEMO',
    customer: 'Maison Trial Studio',
    quantity: 1,
    unitPrice: 18,
    discountPercent: 0,
    taxPercent: 8,
    shippingCost: 12,
    total: 31.44,
    currency: 'USD',
    reservedGrams: 0,
    fulfilledGrams: 0,
    status: 'CONFIRMED',
    documentIds: [],
    createdAt: '2026-07-03T09:20:00.000Z',
  },
]

export const shipments: ShipmentRecord[] = []

export const orderDocuments: OrderDocumentRecord[] = []

export const scheduledReports: ScheduledReportRecord[] = [
  {
    id: 'RPT-FIN-WEEKLY',
    name: 'Finance margin and valuation pack',
    cadence: 'WEEKLY',
    audience: 'finance@example.test',
    format: 'XLSX',
    status: 'ACTIVE',
    lastRunAt: '2026-07-01T08:00:00.000Z',
  },
  {
    id: 'RPT-INVENTORY-DAILY',
    name: 'Inventory risk digest',
    cadence: 'DAILY',
    audience: 'inventory@example.test',
    format: 'PDF',
    status: 'ACTIVE',
    lastRunAt: '2026-07-03T07:00:00.000Z',
  },
]

export const billingPlans: BillingPlanRecord[] = [
  {
    id: 'PLAN-APPRENTICE',
    name: 'Apprentice',
    seats: 1,
    storageGb: 1,
    apiQuota: 0,
    monthlyPrice: 0,
    currency: 'USD',
    limits: {
      seats: 1,
      materials: 25,
      formulas: 10,
      lots: 25,
      documents: 100,
      storageGb: 1,
      apiCalls: 0,
      webhooks: 0,
      auditRetentionDays: 30,
    },
    features: [
      'Material library and formula costing',
      'Inventory ledger and lab usage traceability',
      'CSV import within starter limits',
      '30 day audit retention',
    ],
  },
  {
    id: 'PLAN-ARTISAN',
    name: 'Artisan',
    seats: 2,
    storageGb: 10,
    apiQuota: 10000,
    monthlyPrice: 24,
    currency: 'USD',
    limits: {
      seats: 2,
      materials: 300,
      formulas: 1000,
      lots: 300,
      documents: 2500,
      storageGb: 10,
      apiCalls: 10000,
      webhooks: 2,
      auditRetentionDays: 365,
    },
    features: [
      'Full personal creative workflow',
      'Global search, costing, and basic analytics',
      'QR lot scan and signed document access',
      'Read API up to 10k calls per month',
    ],
  },
  {
    id: 'PLAN-ATELIER',
    name: 'Atelier',
    seats: 5,
    storageGb: 100,
    apiQuota: 100000,
    monthlyPrice: 99,
    currency: 'USD',
    limits: {
      seats: 5,
      materials: 3000,
      formulas: 10000,
      lots: 5000,
      documents: 25000,
      storageGb: 100,
      apiCalls: 100000,
      webhooks: 10,
      auditRetentionDays: 1095,
    },
    features: [
      'Production batch operations',
      'Procurement, purchase orders, and commerce',
      'Collaboration, custom roles, and approvals',
      'API keys, signed webhooks, and audit export',
    ],
  },
  {
    id: 'PLAN-MAISON',
    name: 'Maison',
    seats: 999,
    storageGb: 1000,
    apiQuota: 1000000,
    monthlyPrice: 600,
    currency: 'USD',
    limits: {
      seats: 999,
      materials: 999999,
      formulas: 999999,
      lots: 999999,
      documents: 999999,
      storageGb: 1000,
      apiCalls: 1000000,
      webhooks: 100,
      auditRetentionDays: 2555,
    },
    features: [
      'SSO, SCIM, dedicated tenant, and SLA path',
      'Data residency, IP policy, and enterprise audit',
      'Custom API limits and migration support',
      'AI credit packages and dedicated success support',
    ],
  },
]

export const billingPlan: BillingPlanRecord = billingPlans[2]!

export const billingSubscription: BillingSubscriptionRecord = {
  id: 'SUB-ATELIER-001',
  organizationId: 'org-nxl',
  planId: billingPlan.id,
  provider: 'manual',
  collectionMode: 'manual_invoice',
  status: 'active',
  currentPeriodStart: '2026-07-01T00:00:00.000Z',
  currentPeriodEnd: '2026-08-01T00:00:00.000Z',
  canWrite: true,
  canExport: true,
  nextInvoiceAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
}

export const billingSubscriptions: BillingSubscriptionRecord[] = [billingSubscription]

export const billingInvoices: BillingInvoiceRecord[] = [
  {
    id: 'INV-2026-0001',
    subscriptionId: billingSubscription.id,
    number: 'OO-2026-0001',
    status: 'open',
    amountDue: 249,
    currency: 'USD',
    dueAt: '2026-08-01T00:00:00.000Z',
    hostedInvoiceUrl: 'https://billing.labofscents.org/invoices/OO-2026-0001',
    documentId: 'DOC-INV-2026-0001',
    providerInvoiceId: 'manual:OO-2026-0001',
  },
]

export const ssoConfig: SsoConfigRecord = {
  id: 'SSO-NXL',
  organizationId: 'org-nxl',
  provider: 'OIDC',
  domain: 'example.test',
  status: 'verified',
  issuerUrl: 'https://idp.example.test/oauth2/default',
  metadataUrl: 'https://idp.example.test/.well-known/openid-configuration',
  clientId: 'olfactoryops-prod',
  acsUrl: 'https://api.labofscents.org/api/v1/auth/sso/callback',
  entityId: 'urn:olfactoryops:org-nxl',
  domainVerifiedAt: '2026-06-20T09:00:00Z',
  jitProvisioning: true,
  enforceSso: false,
  scim: {
    enabled: true,
    baseUrl: 'https://api.labofscents.org/api/v1/scim/v2/org-nxl',
    tokenLastFour: '7Q2A',
    tokenRotatedAt: '2026-06-21T09:00:00Z',
    deprovisionAction: 'revoke_sessions',
    status: 'enabled',
  },
  roleMapping: {
    'noxel-admins': 'Owner',
    'noxel-lab': 'Lab Manager',
    'noxel-viewers': 'Viewer',
  },
  updatedAt: '2026-06-21T09:00:00Z',
}

export const apiKeys: ApiKeyRecord[] = [
  {
    id: 'KEY-DEMO',
    organizationId: 'org-nxl',
    label: 'Demo integration',
    prefix: 'key_demo',
    lastFour: '9AF2',
    scopes: ['materials.read', 'orders.write', 'webhooks.read'],
    createdAt: '2026-06-18T09:00:00Z',
    createdBy: 'usr-owner',
    rotatedAt: '2026-06-18T09:00:00Z',
    lastUsedAt: '2026-06-30T08:44:00Z',
    status: 'active',
  },
]

export const webhooks: WebhookRecord[] = [
  {
    id: 'WH-ORDERS',
    organizationId: 'org-nxl',
    url: 'https://hooks.example.test/orders',
    events: ['order.reserved', 'order.fulfilled', 'document.downloaded'],
    status: 'active',
    lastDelivery: '2026-06-30T08:44:00Z',
    createdAt: '2026-06-18T09:15:00Z',
    owner: 'usr-owner',
    signingSecretLastFour: '40F2',
    signingSecretRotatedAt: '2026-06-18T09:15:00Z',
    failureCount: 0,
  },
]

export const auditExportJobs: AuditExportJobRecord[] = [
  {
    id: 'AUD-EXP-SEED-001',
    organizationId: 'org-nxl',
    requestedBy: 'usr-owner',
    format: 'JSON',
    scope: 'org-nxl',
    status: 'READY',
    eventCount: auditEvents.length,
    checksum: 'sha256:seeded-enterprise-evidence',
    downloadUrl: 'https://api.labofscents.org/api/v1/audit/exports/AUD-EXP-SEED-001/download',
    createdAt: '2026-06-30T09:05:00Z',
    completedAt: '2026-06-30T09:05:02Z',
    expiresAt: '2026-07-30T09:05:02Z',
    auditEventId: 'AUD-9143',
  },
]

export const webhookDeliveries: WebhookDeliveryRecord[] = [
  {
    id: 'WHD-0001',
    webhookId: 'WH-ORDERS',
    event: 'order.fulfilled',
    status: 'delivered',
    attempts: 1,
    lastAttemptAt: '2026-06-30T08:44:00Z',
    responseCode: 200,
    idempotencyKey: 'whd_order_fulfilled_ORD-DEMO-092',
  },
  {
    id: 'WHD-0002',
    webhookId: 'WH-ORDERS',
    event: 'document.downloaded',
    status: 'retrying',
    attempts: 2,
    lastAttemptAt: '2026-07-03T11:00:00Z',
    nextRetryAt: '2026-07-03T11:15:00Z',
    responseCode: 503,
    idempotencyKey: 'whd_document_downloaded_DOC-121',
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
  formulaAgent: [
    { id: 'AGENT-RUN', label: 'Formula research workflow', status: 'active', amount: 'Structured artifacts', owner: 'Perfumer' },
  ],
  formulaDesignStudio: [
    { id: 'DESIGN-BRIEF', label: 'Formula design project', status: 'active', amount: 'Brand to perfumer', owner: 'Perfumer' },
  ],
  reformulationOptimizer: [
    { id: 'OPT-RUN', label: 'Reformulation candidate run', status: 'active', amount: 'Immutable baseline', owner: 'Perfumer' },
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
    { id: 'ORD-DEMO-092', label: 'Discovery kit order', status: 'active', amount: 'Reserved', owner: 'Fulfillment' },
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
  const lines = order.lines?.length
    ? order.lines
    : [{ skuId: order.skuId, quantity: order.quantity, unitPrice: order.unitPrice, lineTotal: order.unitPrice * order.quantity }]
  return lines.reduce((total, line) => {
    const sku = skus.find((item) => item.id === line.skuId)
    return total + (sku ? sku.packSizeGrams * line.quantity : 0)
  }, 0)
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
  const contentReady = document.status !== 'QUARANTINED' && document.status !== 'ARCHIVED'
  return contentReady && documentRequiredPermissions(document).every((permission) => permissionSet.has(permission))
}

export function createSignedDocumentUrl(
  document: DocumentRecord,
  now = new Date(),
  ttlSeconds = documentSignedUrlTtlSeconds,
): SignedDocumentUrl {
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)
  const expires = Math.floor(expiresAt.getTime() / 1000)
  const nonce = createSignedDocumentNonce(now)
  const signature = `${document.id}-${document.version}-${expires}-${nonce}`.toLowerCase().replace(/[^a-z0-9]/g, '')

  return {
    url: `https://files.olfactoryops.local/private/${encodeURIComponent(document.id)}?expires=${expires}&nonce=${nonce}&signature=${signature}`,
    expiresAt: expiresAt.toISOString(),
    ttlSeconds,
    method: 'GET',
  }
}

function createSignedDocumentNonce(now: Date) {
  const randomUuid = globalThis.crypto?.randomUUID?.()
  if (randomUuid) {
    return randomUuid.replace(/-/g, '')
  }
  return `${now.getTime()}${Math.random().toString(36).slice(2, 14)}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
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
  if (document.status === 'QUARANTINED' || document.status === 'REVIEW_REQUIRED') {
    return 'review'
  }
  if (document.status === 'ARCHIVED' || document.status === 'EXPIRED' || (document.expiresAt && daysUntil(document.expiresAt, asOfDate) < 0)) {
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

  function walk(
    formula: Formula,
    physicalScale: number,
    activeScale: number,
    path: string[],
    trail: Set<string>,
  ) {
    if (trail.has(formula.id)) {
      return
    }
    const nextTrail = new Set(trail).add(formula.id)

    formula.lines.forEach((line) => {
      const concentrationFraction = Math.min(100, Math.max(0, Number(line.concentration ?? line.dilution ?? 100))) / 100
      const lineGrams = line.grams * physicalScale
      const activeGrams = line.grams * activeScale * concentrationFraction
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
          activeGrams,
          activePercent: (activeGrams / rootFormula.targetGrams) * 100,
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
        walk(
          child,
          lineGrams / child.targetGrams,
          activeGrams / child.targetGrams,
          [...path, line.label],
          nextTrail,
        )
      }
    })
  }

  walk(root, 1, 1, [root.code], new Set<string>())

  return Array.from(
    leaves.reduce((map, leaf) => {
      const existing = map.get(leaf.materialId)
      if (existing) {
        existing.grams += leaf.grams
        existing.effectivePercent += leaf.effectivePercent
        existing.cost += leaf.cost
        existing.activeGrams += leaf.activeGrams
        existing.activePercent += leaf.activePercent
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

export function formulaSnapshotMetadata(formula: Formula): FormulaSnapshotMetadata {
  return {
    formulaType: formula.formulaType,
    concentrationType: formula.concentrationType,
    finalProductConcentrationPercent: formula.finalProductConcentrationPercent,
    targetMarkets: [...formula.targetMarkets],
    brief: formula.brief,
    inspiration: formula.inspiration,
    pyramidSummary: formula.pyramidSummary,
    tags: [...formula.tags],
    project: formula.project,
    collection: formula.collection,
    density: formula.density,
    bottleVolumeMl: formula.bottleVolumeMl,
    bottleCount: formula.bottleCount,
    ifraCategory: formula.ifraCategory,
  }
}

export function formulaComposition(formula: Formula) {
  const totalGrams = formula.lines.reduce((sum, line) => sum + line.grams, 0)
  const percent = formula.targetGrams > 0 ? (totalGrams / formula.targetGrams) * 100 : 0
  const gapPercent = 100 - percent
  return {
    totalGrams,
    percent,
    gapPercent,
    ready: formula.lines.length > 0 && Math.abs(gapPercent) <= 0.05,
  }
}

export function evaluateFormulaIfra(
  formula: Formula,
  leaves: ResolvedLeaf[] = resolveFormulaWithCatalog(formula.id),
  materialCatalog: Material[] = materials,
): FormulaIfraEvaluation {
  const materialLookup = new Map(materialCatalog.map((material) => [material.id, material]))
  const composition = formulaComposition(formula)
  const finalConcentration = Math.min(100, Math.max(0, formula.finalProductConcentrationPercent))
  const rows = leaves
    .map((leaf): FormulaIfraRow | null => {
      const material = materialLookup.get(leaf.materialId)
      if (!material) {
        return null
      }
      const limitPercent = Math.max(0, material.ifraLimit)
      const finalProductPercent = leaf.activePercent * (finalConcentration / 100)
      const usageOfLimit = limitPercent > 0 ? (finalProductPercent / limitPercent) * 100 : 0
      const marginPercent = limitPercent - finalProductPercent
      const status: FormulaIfraRow['status'] =
        limitPercent <= 0
          ? 'NO_LIMIT'
          : marginPercent < -0.0001
            ? 'BLOCKER'
            : usageOfLimit >= 80
              ? 'NEAR_LIMIT'
              : 'PASS'
      return {
        materialId: material.id,
        materialName: material.name,
        activePercent: leaf.activePercent,
        finalProductPercent,
        limitPercent,
        usageOfLimit,
        marginPercent,
        sourcePath: leaf.sourcePath,
        status,
      }
    })
    .filter((row): row is FormulaIfraRow => Boolean(row))
    .sort((left, right) => {
      const order: Record<FormulaIfraRow['status'], number> = { BLOCKER: 0, NEAR_LIMIT: 1, PASS: 2, NO_LIMIT: 3 }
      return order[left.status] - order[right.status] || right.usageOfLimit - left.usageOfLimit
    })

  const blockerCount = rows.filter((row) => row.status === 'BLOCKER').length
  const nearLimitCount = rows.filter((row) => row.status === 'NEAR_LIMIT').length
  return {
    formulaId: formula.id,
    category: formula.ifraCategory,
    compositionReady: composition.ready,
    finalProductConcentrationPercent: finalConcentration,
    blockerCount,
    nearLimitCount,
    rows,
    label: !composition.ready
      ? 'Complete the formula to 100% before final-product IFRA evaluation.'
      : blockerCount > 0
        ? `${blockerCount} IFRA blocker${blockerCount === 1 ? '' : 's'}`
        : nearLimitCount > 0
          ? `${nearLimitCount} material${nearLimitCount === 1 ? '' : 's'} near the IFRA limit`
          : 'Final-product IFRA check passed',
  }
}

export function scaleFormula(formula: Formula, targetGrams: number, incrementGrams = 0.01): FormulaScalePlan {
  const safeTargetGrams = Math.max(0.01, targetGrams)
  const safeIncrement = Math.max(0.0001, incrementGrams)
  const scale = formula.targetGrams > 0 ? safeTargetGrams / formula.targetGrams : 0
  const lines = formula.lines.map((line) => {
    const targetLineGrams = line.grams * scale
    const roundedGrams = Math.round(targetLineGrams / safeIncrement) * safeIncrement
    return {
      lineId: line.id,
      label: line.label,
      targetGrams: targetLineGrams,
      roundedGrams,
      varianceGrams: roundedGrams - targetLineGrams,
    }
  })
  const totalRoundedGrams = lines.reduce((sum, line) => sum + line.roundedGrams, 0)
  const density = Math.max(0.01, formula.density)
  const targetVolumeMl = safeTargetGrams / density
  return {
    formulaId: formula.id,
    targetGrams: safeTargetGrams,
    targetVolumeMl,
    bottleCount: formula.bottleVolumeMl > 0 ? Math.floor(targetVolumeMl / formula.bottleVolumeMl) : 0,
    incrementGrams: safeIncrement,
    lines,
    totalRoundedGrams,
    varianceGrams: totalRoundedGrams - safeTargetGrams,
  }
}

function formulaVersionLineKey(line: FormulaLine) {
  return line.materialId ? `material:${line.materialId}` : line.childFormulaId ? `formula:${line.childFormulaId}` : `line:${line.id}`
}

export function diffFormulaVersions(before: FormulaVersionRecord, after: FormulaVersionRecord): FormulaVersionDiff {
  const metadataFields = Object.keys(before.metadata) as Array<keyof FormulaSnapshotMetadata>
  const metadataChanges = metadataFields
    .filter((field) => JSON.stringify(before.metadata[field]) !== JSON.stringify(after.metadata[field]))
    .map((field) => ({ field, before: before.metadata[field], after: after.metadata[field] }))
  const beforeLines = new Map(before.lines.map((line) => [formulaVersionLineKey(line), line]))
  const afterLines = new Map(after.lines.map((line) => [formulaVersionLineKey(line), line]))
  const lineKeys = Array.from(new Set([...beforeLines.keys(), ...afterLines.keys()]))
  const lineChanges = lineKeys.map((key): FormulaVersionDiffLine => {
    const beforeLine = beforeLines.get(key)
    const afterLine = afterLines.get(key)
    const beforeGrams = beforeLine?.grams ?? 0
    const afterGrams = afterLine?.grams ?? 0
    const beforeActiveGrams = beforeGrams * Math.min(100, Math.max(0, Number(beforeLine?.concentration ?? beforeLine?.dilution ?? 100))) / 100
    const afterActiveGrams = afterGrams * Math.min(100, Math.max(0, Number(afterLine?.concentration ?? afterLine?.dilution ?? 100))) / 100
    const change: FormulaVersionDiffLine['change'] = !beforeLine
      ? 'ADDED'
      : !afterLine
        ? 'REMOVED'
        : Math.abs(beforeGrams - afterGrams) > 0.0001 || Math.abs(beforeActiveGrams - afterActiveGrams) > 0.0001 || beforeLine.label !== afterLine.label
          ? 'CHANGED'
          : 'UNCHANGED'
    return {
      key,
      label: afterLine?.label ?? beforeLine?.label ?? key,
      beforeGrams,
      afterGrams,
      deltaGrams: afterGrams - beforeGrams,
      beforeActiveGrams,
      afterActiveGrams,
      change,
    }
  })
  const evaporationByTier = (point: FormulaEvaporationPoint | undefined): Record<MaterialTier, number> => {
    const totals: Record<MaterialTier, { initial: number; remaining: number }> = {
      Top: { initial: 0, remaining: 0 },
      Heart: { initial: 0, remaining: 0 },
      Base: { initial: 0, remaining: 0 },
    }
    point?.materials.forEach((material) => {
      totals[material.tier].initial += material.initialPercent
      totals[material.tier].remaining += material.initialPercent * material.remainingPercent
    })
    return {
      Top: totals.Top.initial ? Number((totals.Top.remaining / totals.Top.initial).toFixed(1)) : 0,
      Heart: totals.Heart.initial ? Number((totals.Heart.remaining / totals.Heart.initial).toFixed(1)) : 0,
      Base: totals.Base.initial ? Number((totals.Base.remaining / totals.Base.initial).toFixed(1)) : 0,
    }
  }
  const beforeEvaporation = evaporationByTier(before.evaporation[before.evaporation.length - 1])
  const afterEvaporation = evaporationByTier(after.evaporation[after.evaporation.length - 1])
  return {
    formulaId: after.formulaId,
    beforeVersion: before.version,
    afterVersion: after.version,
    metadataChanges,
    lineChanges,
    totalGramsDelta: after.totalGrams - before.totalGrams,
    totalCostDelta: after.totalCost - before.totalCost,
    ifraBlockerDelta: after.ifraEvaluation.blockerCount - before.ifraEvaluation.blockerCount,
    evaporationDelta: {
      Top: afterEvaporation.Top - beforeEvaporation.Top,
      Heart: afterEvaporation.Heart - beforeEvaporation.Heart,
      Base: afterEvaporation.Base - beforeEvaporation.Base,
    },
  }
}


export function formulaTotals(leaves: ResolvedLeaf[]) {
  const totalCost = leaves.reduce((sum, leaf) => sum + leaf.cost, 0)
  const totalGrams = leaves.reduce((sum, leaf) => sum + leaf.grams, 0)
  const costPerGram = totalGrams > 0 ? totalCost / totalGrams : 0
  const costPerBottle = costPerGram * 50
  return { totalCost, totalGrams, costPerGram, costPerBottle }
}

function costPolicyForMaterial(materialId: string, policies: CostMethodPolicy[] = costMethodPolicies) {
  return policies.find((policy) => policy.materialId === materialId) ?? {
    materialId,
    method: 'WEIGHTED_AVERAGE' as const,
    overheadPercent: 0,
  }
}

function landedCostForMaterial(materialId: string, profiles: LandedCostProfile[] = landedCostProfiles) {
  return profiles.find((profile) => profile.materialId === materialId) ?? {
    materialId,
    freightPercent: 0,
    dutyPercent: 0,
    insurancePercent: 0,
  }
}

function daysBetween(start: string, end: string) {
  const dayMs = 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((new Date(`${end.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${start.slice(0, 10)}T00:00:00Z`).getTime()) / dayMs))
}

export function materialUnitCost(
  material: Material,
  lots: InventoryLot[] = initialLots,
  history: PriceHistoryRecord[] = priceHistory,
  policies: CostMethodPolicy[] = costMethodPolicies,
  landedProfiles: LandedCostProfile[] = landedCostProfiles,
) {
  const policy = costPolicyForMaterial(material.id, policies)
  const landed = landedCostForMaterial(material.id, landedProfiles)
  const landedMultiplier = 1 + (landed.freightPercent + landed.dutyPercent + landed.insurancePercent) / 100
  const materialLots = lots.filter((lot) => lot.materialId === material.id && lot.quantityGrams > 0)
  const latestHistory = history
    .filter((record) => record.materialId === material.id)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0]
  let baseCost = latestHistory?.unitCost ?? material.costPerGram
  let source = latestHistory ? `${latestHistory.source}:${latestHistory.id}` : `MATERIAL:${material.id}`

  if (policy.method === 'STANDARD') {
    baseCost = policy.standardCost ?? material.costPerGram
    source = `STANDARD:${policy.materialId}`
  } else if (materialLots.length > 0) {
    if (policy.method === 'FIFO' || policy.method === 'LIFO') {
      const sortedLots = [...materialLots].sort((a, b) =>
        policy.method === 'FIFO'
          ? a.receivedDate.localeCompare(b.receivedDate)
          : b.receivedDate.localeCompare(a.receivedDate),
      )
      baseCost = sortedLots[0]?.unitCost ?? baseCost
      source = `${policy.method}:${sortedLots[0]?.lotNumber ?? material.id}`
    } else {
      const quantity = materialLots.reduce((sum, lot) => sum + lot.quantityGrams, 0)
      const weighted = materialLots.reduce((sum, lot) => sum + lot.quantityGrams * lot.unitCost, 0)
      baseCost = quantity > 0 ? weighted / quantity : baseCost
      source = `WEIGHTED_AVERAGE:${materialLots.length} lots`
    }
  }

  const unitCost = Number((baseCost * landedMultiplier * (1 + policy.overheadPercent / 100)).toFixed(4))
  return { unitCost, method: policy.method, source, policy, landed }
}

export function formulaCostReport(
  formulaId: string,
  formulaCatalog: Formula[] = formulas,
  materialCatalog: Material[] = materials,
  lots: InventoryLot[] = initialLots,
  history: PriceHistoryRecord[] = priceHistory,
  policies: CostMethodPolicy[] = costMethodPolicies,
  landedProfiles: LandedCostProfile[] = landedCostProfiles,
): FormulaCostReport {
  const formula = formulaCatalog.find((item) => item.id === formulaId)
  const leaves = resolveFormulaWithCatalog(formulaId, formulaCatalog, materialCatalog)
  const materialById = new Map(materialCatalog.map((material) => [material.id, material]))
  const linesWithoutContribution = leaves.map((leaf) => {
    const material = materialById.get(leaf.materialId)
    const unit = material
      ? materialUnitCost(material, lots, history, policies, landedProfiles)
      : { unitCost: 0, source: 'MISSING_MATERIAL', method: 'WEIGHTED_AVERAGE' as CostMethod }
    return {
      materialId: leaf.materialId,
      materialName: leaf.materialName,
      grams: leaf.grams,
      effectivePercent: leaf.effectivePercent,
      unitCost: unit.unitCost,
      lineCost: Number((leaf.grams * unit.unitCost).toFixed(4)),
      contributionPercent: 0,
      sourcePath: leaf.sourcePath,
      costSource: unit.source,
    }
  })
  const totalCost = linesWithoutContribution.reduce((sum, line) => sum + line.lineCost, 0)
  const totalGrams = linesWithoutContribution.reduce((sum, line) => sum + line.grams, 0)
  const lines = linesWithoutContribution
    .map((line) => ({
      ...line,
      contributionPercent: totalCost > 0 ? Number(((line.lineCost / totalCost) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.lineCost - a.lineCost)
  const costPerGram = totalGrams > 0 ? totalCost / totalGrams : 0

  return {
    formulaId,
    formulaCode: formula?.code ?? formulaId,
    method: 'MIXED_POLICY',
    totalGrams,
    totalCost: Number(totalCost.toFixed(4)),
    costPerGram: Number(costPerGram.toFixed(4)),
    costPerBottle: Number((costPerGram * 50).toFixed(4)),
    mostExpensiveMaterial: lines[0]?.materialName ?? 'n/a',
    lines,
    trace: lines.map((line) => `${line.materialName}: ${line.costSource}`),
    invariant: 'formula costing resolves leaves before applying material cost policy and landed cost',
  }
}

export function batchCostReport(
  batchId: string,
  batchCatalog: ProductionBatchRecord[] = productionBatches,
  formulaCatalog: Formula[] = formulas,
  materialCatalog: Material[] = materials,
  lots: InventoryLot[] = initialLots,
  history: PriceHistoryRecord[] = priceHistory,
  movements: InventoryMovement[] = initialMovements,
): BatchCostReport {
  const batch = batchCatalog.find((item) => item.id === batchId)
  const sourceFormulaCost = formulaCostReport(batch?.formulaId ?? formulaCatalog[0]?.id ?? '', formulaCatalog, materialCatalog, lots, history)
  const formula = formulaCatalog.find((item) => item.id === sourceFormulaCost.formulaId)
  const targetGrams = batch?.targetGrams ?? formula?.targetGrams ?? sourceFormulaCost.totalGrams
  const scale = formula && formula.targetGrams > 0 ? targetGrams / formula.targetGrams : 1
  const inputMovements = batch
    ? movements.filter((movement) => movement.type === 'PRODUCTION_CONSUMPTION' && movement.ref === batch.id)
    : []
  const materialById = new Map(materialCatalog.map((material) => [material.id, material]))
  const lotById = new Map(lots.map((lot) => [lot.id, lot]))
  const actualMaterialCost = inputMovements.reduce((sum, movement) => {
    const material = materialById.get(movement.materialId)
    const lot = lotById.get(movement.lotId)
    const policy = material ? costPolicyForMaterial(material.id) : undefined
    const landed = material ? landedCostForMaterial(material.id) : undefined
    const landedMultiplier = landed ? 1 + (landed.freightPercent + landed.dutyPercent + landed.insurancePercent) / 100 : 1
    const overheadMultiplier = policy ? 1 + policy.overheadPercent / 100 : 1
    const unitCost = lot?.unitCost ?? material?.costPerGram ?? 0
    return sum + movement.quantityGrams * unitCost * landedMultiplier * overheadMultiplier
  }, 0)
  const materialCostBasis = inputMovements.length > 0 ? 'ACTUAL_LOT_CONSUMPTION' as const : 'FORMULA_ESTIMATE' as const
  const materialCost = materialCostBasis === 'ACTUAL_LOT_CONSUMPTION' ? actualMaterialCost : sourceFormulaCost.totalCost * scale
  const laborCost = targetGrams * 0.018
  const overheadCost = materialCost * 0.12
  const totalCost = materialCost + laborCost + overheadCost
  const releasedOutput = batch?.status === 'RELEASED'
    ? batch.outputLot?.quantityGrams ?? batch.yieldGrams ?? targetGrams
    : targetGrams
  const costingBasis = batch?.status === 'RELEASED' && Boolean(batch.outputLot) ? 'RELEASED_OUTPUT' as const : 'TARGET_ESTIMATE' as const
  const roundedTotalCost = Number(totalCost.toFixed(2))
  return {
    batchId,
    formulaId: sourceFormulaCost.formulaId,
    targetGrams,
    outputGrams: Number(releasedOutput.toFixed(3)),
    yieldVariancePercent: Number((batch?.yieldVariancePercent ?? 0).toFixed(2)),
    costingBasis,
    materialCostBasis,
    materialCost: Number(materialCost.toFixed(2)),
    laborCost: Number(laborCost.toFixed(2)),
    overheadCost: Number(overheadCost.toFixed(2)),
    totalCost: roundedTotalCost,
    costPerGram: releasedOutput > 0 ? Number((roundedTotalCost / releasedOutput).toFixed(4)) : 0,
    sourceFormulaCost,
    invariant:
      costingBasis === 'RELEASED_OUTPUT'
        ? 'released cost sheet uses consumed lot costs and finished output yield without mutating production'
        : 'batch cost is a target estimate until the production batch is released',
  }
}

export function inventoryValuationReport(
  lots: InventoryLot[] = initialLots,
  materialCatalog: Material[] = materials,
  history: PriceHistoryRecord[] = priceHistory,
  asOf = inventoryAsOfDate,
): InventoryValuationReport {
  const lines = stockSummary(lots, materialCatalog).map((summary) => {
    const cost = materialUnitCost(summary.material, lots, history)
    const materialLots = lots.filter((lot) => lot.materialId === summary.material.id)
    const byLocation = Array.from(
      materialLots.reduce((map, lot) => {
        const current = map.get(lot.location) ?? { grams: 0, value: 0 }
        current.grams += lot.quantityGrams
        current.value += lot.quantityGrams * cost.unitCost
        map.set(lot.location, current)
        return map
      }, new Map<string, { grams: number; value: number }>()),
    ).map(([location, record]) => ({
      location,
      grams: Number(record.grams.toFixed(2)),
      value: Number(record.value.toFixed(2)),
    }))
    return {
      materialId: summary.material.id,
      materialName: summary.material.name,
      currentGrams: summary.current,
      availableGrams: summary.available,
      reservedGrams: summary.reserved,
      unitCost: cost.unitCost,
      value: Number((summary.current * cost.unitCost).toFixed(2)),
      method: cost.method,
      locationBreakdown: byLocation,
    }
  })
  const totalValue = lines.reduce((sum, line) => sum + line.value, 0)
  const reservedValue = lines.reduce((sum, line) => sum + line.reservedGrams * line.unitCost, 0)
  const availableValue = lines.reduce((sum, line) => sum + line.availableGrams * line.unitCost, 0)
  return {
    asOf,
    totalValue: Number(totalValue.toFixed(2)),
    reservedValue: Number(reservedValue.toFixed(2)),
    availableValue: Number(availableValue.toFixed(2)),
    lines: lines.sort((a, b) => b.value - a.value),
    invariant: 'valuation reconciles current grams from inventory lots with material cost policy',
  }
}

export function skuMarginReports(
  skus: CommercialSkuRecord[] = commercialSkus,
  materialCatalog: Material[] = materials,
  lots: InventoryLot[] = initialLots,
  history: PriceHistoryRecord[] = priceHistory,
): SkuMarginReport[] {
  const materialById = new Map(materialCatalog.map((material) => [material.id, material]))
  return skus.map((sku) => {
    const material = materialById.get(sku.materialId)
    const unit = material ? materialUnitCost(material, lots, history) : { unitCost: 0, source: 'MISSING_MATERIAL' }
    const packCost = Number((unit.unitCost * sku.packSizeGrams).toFixed(2))
    const margin = Number((sku.price - packCost).toFixed(2))
    return {
      skuId: sku.id,
      skuName: sku.name,
      materialId: sku.materialId,
      packSizeGrams: sku.packSizeGrams,
      price: sku.price,
      currency: sku.currency,
      unitCost: unit.unitCost,
      packCost,
      margin,
      marginPercent: sku.price > 0 ? Number(((margin / sku.price) * 100).toFixed(1)) : 0,
      recommendedPrice: Number((packCost / 0.42).toFixed(2)),
      trace: [unit.source, `pack ${sku.packSizeGrams}g`, `price ${sku.price} ${sku.currency}`],
    }
  })
}

export function cogsLines(
  movements: InventoryMovement[] = initialMovements,
  lots: InventoryLot[] = initialLots,
  materialCatalog: Material[] = materials,
  history: PriceHistoryRecord[] = priceHistory,
): CogsLine[] {
  const materialById = new Map(materialCatalog.map((material) => [material.id, material]))
  const lotById = new Map(lots.map((lot) => [lot.id, lot]))
  return movements
    .filter((movement) => movement.direction === 'OUT')
    .map((movement) => {
      const material = materialById.get(movement.materialId)
      const lot = lotById.get(movement.lotId)
      const unitCost = lot?.unitCost ?? (material ? materialUnitCost(material, lots, history).unitCost : 0)
      return {
        ref: movement.ref,
        movementId: movement.id,
        type: movement.type,
        materialId: movement.materialId,
        materialName: material?.name ?? movement.materialId,
        quantityGrams: movement.quantityGrams,
        unitCost,
        cogs: Number((movement.quantityGrams * unitCost).toFixed(2)),
      }
    })
}

export function costingOverview(
  formulaId = 'frm-0421',
  lots: InventoryLot[] = initialLots,
  movements: InventoryMovement[] = initialMovements,
  formulaCatalog: Formula[] = formulas,
  materialCatalog: Material[] = materials,
  skus: CommercialSkuRecord[] = commercialSkus,
  history: PriceHistoryRecord[] = priceHistory,
): CostingOverview {
  return {
    valuation: inventoryValuationReport(lots, materialCatalog, history),
    formula: formulaCostReport(formulaId, formulaCatalog, materialCatalog, lots, history),
    skuMargins: skuMarginReports(skus, materialCatalog, lots, history),
    cogs: cogsLines(movements, lots, materialCatalog, history),
    methodPolicies: costMethodPolicies,
    landedCosts: landedCostProfiles,
    invariant: 'costing read model reconciles formula resolve, inventory lots, COGS movements, and SKU prices',
  }
}

function movementDay(movement: InventoryMovement) {
  return movement.at.slice(0, 10)
}

export function analyticsBurnRate(
  movements: InventoryMovement[] = initialMovements,
  materialCatalog: Material[] = materials,
  windowDays = 30,
): AnalyticsBurnRateRow[] {
  const asOf = new Date(`${inventoryAsOfDate}T00:00:00.000Z`).getTime()
  const cutoff = asOf - windowDays * 24 * 60 * 60 * 1000
  const materialById = new Map(materialCatalog.map((material) => [material.id, material]))
  const outboundMovements = movements.filter((movement) => {
    const movedAt = new Date(`${movementDay(movement)}T00:00:00.000Z`).getTime()
    return movement.direction === 'OUT' && movement.type !== 'REVERSAL' && movedAt >= cutoff && movedAt <= asOf
  })

  return Array.from(
    outboundMovements.reduce((map, movement) => {
      const existing = map.get(movement.materialId) ?? {
        materialId: movement.materialId,
        usageGrams: 0,
        firstDay: movementDay(movement),
        eventCount: 0,
        sourceMovementIds: [] as string[],
      }
      existing.usageGrams += movement.quantityGrams
      existing.firstDay = existing.firstDay < movementDay(movement) ? existing.firstDay : movementDay(movement)
      existing.eventCount += 1
      existing.sourceMovementIds.push(movement.id)
      map.set(movement.materialId, existing)
      return map
    }, new Map<string, { materialId: string; usageGrams: number; firstDay: string; eventCount: number; sourceMovementIds: string[] }>())
      .values(),
  )
    .map((row) => {
      const observedDays = Math.max(1, Math.min(windowDays, daysBetween(row.firstDay, inventoryAsOfDate) + 1))
      return {
        materialId: row.materialId,
        materialName: materialById.get(row.materialId)?.name ?? row.materialId,
        usageGrams: Number(row.usageGrams.toFixed(3)),
        dailyBurnGrams: Number((row.usageGrams / observedDays).toFixed(3)),
        eventCount: row.eventCount,
        sourceMovementIds: row.sourceMovementIds,
      }
    })
    .sort((a, b) => b.usageGrams - a.usageGrams)
}

export function lowStockForecast(
  lots: InventoryLot[] = initialLots,
  movements: InventoryMovement[] = initialMovements,
  materialCatalog: Material[] = materials,
): LowStockForecastRow[] {
  const burnByMaterial = new Map(analyticsBurnRate(movements, materialCatalog).map((row) => [row.materialId, row]))
  return stockSummary(lots, materialCatalog)
    .map((summary) => {
      const burn = burnByMaterial.get(summary.material.id)
      const dailyBurnGrams = burn?.dailyBurnGrams ?? 0
      const daysToStockout = dailyBurnGrams > 0 ? Math.ceil(summary.available / dailyBurnGrams) : 999
      const targetCoverGrams = dailyBurnGrams * 30
      return {
        materialId: summary.material.id,
        materialName: summary.material.name,
        availableGrams: Number(summary.available.toFixed(2)),
        dailyBurnGrams,
        daysToStockout,
        suggestedOrderGrams: Number(Math.max(0, targetCoverGrams - summary.available).toFixed(2)),
        source: 'MOVEMENT_LEDGER' as const,
      }
    })
    .sort((a, b) => a.daysToStockout - b.daysToStockout || a.availableGrams - b.availableGrams)
}

export function expiryRisk(
  lots: InventoryLot[] = initialLots,
  materialCatalog: Material[] = materials,
  asOf = inventoryAsOfDate,
): ExpiryRiskRow[] {
  const materialById = new Map(materialCatalog.map((material) => [material.id, material]))
  return lots
    .filter((lot) => lot.quantityGrams > 0)
    .map((lot) => {
      const daysUntilExpiry = daysBetween(asOf, lot.expiryDate)
      const agePressure = Math.max(0, 90 - daysUntilExpiry)
      const stockPressure = Math.min(30, lot.quantityGrams / 10)
      const status: ExpiryRiskRow['status'] =
        lot.qualityStatus === 'EXPIRED' || daysUntilExpiry <= 30 ? 'HIGH' : daysUntilExpiry <= 90 ? 'MEDIUM' : 'LOW'
      return {
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        materialId: lot.materialId,
        materialName: materialById.get(lot.materialId)?.name ?? lot.materialId,
        expiryDate: lot.expiryDate,
        daysUntilExpiry,
        gramsAtRisk: Number(lot.quantityGrams.toFixed(2)),
        riskScore: Number(Math.min(100, agePressure + stockPressure).toFixed(1)),
        status,
      }
    })
    .sort((a, b) => b.riskScore - a.riskScore || a.daysUntilExpiry - b.daysUntilExpiry)
}

export function costRanking(
  movements: InventoryMovement[] = initialMovements,
  lots: InventoryLot[] = initialLots,
  materialCatalog: Material[] = materials,
  history: PriceHistoryRecord[] = priceHistory,
): CostRankingRow[] {
  return analyticsBurnRate(movements, materialCatalog)
    .map((burn) => {
      const material = materialCatalog.find((item) => item.id === burn.materialId)
      const unit = material ? materialUnitCost(material, lots, history) : { unitCost: 0 }
      return {
        materialId: burn.materialId,
        materialName: burn.materialName,
        usageGrams: burn.usageGrams,
        unitCost: unit.unitCost,
        extendedCost: Number((burn.usageGrams * unit.unitCost).toFixed(2)),
        rank: 0,
      }
    })
    .sort((a, b) => b.extendedCost - a.extendedCost)
    .map((row, index) => ({ ...row, rank: index + 1 }))
}

export function inventoryAnalytics(
  lots: InventoryLot[] = initialLots,
  movements: InventoryMovement[] = initialMovements,
  materialCatalog: Material[] = materials,
  history: PriceHistoryRecord[] = priceHistory,
): InventoryAnalyticsRow[] {
  const burnByMaterial = new Map(analyticsBurnRate(movements, materialCatalog).map((row) => [row.materialId, row]))
  return stockSummary(lots, materialCatalog)
    .map((summary) => {
      const cost = materialUnitCost(summary.material, lots, history)
      const materialLots = lots.filter((lot) => lot.materialId === summary.material.id)
      const weightedAge = materialLots.reduce((sum, lot) => {
        const age = daysBetween(lot.receivedDate, inventoryAsOfDate)
        return sum + age * Math.max(0, lot.quantityGrams)
      }, 0)
      const totalGrams = materialLots.reduce((sum, lot) => sum + Math.max(0, lot.quantityGrams), 0)
      const monthlyUsage = (burnByMaterial.get(summary.material.id)?.dailyBurnGrams ?? 0) * 30
      return {
        materialId: summary.material.id,
        materialName: summary.material.name,
        family: summary.material.family,
        currentGrams: Number(summary.current.toFixed(2)),
        availableGrams: Number(summary.available.toFixed(2)),
        inventoryValue: Number((summary.current * cost.unitCost).toFixed(2)),
        turnoverRatio: summary.current > 0 ? Number((monthlyUsage / summary.current).toFixed(2)) : 0,
        deadStock: summary.current > 0 && monthlyUsage === 0,
        agingDays: totalGrams > 0 ? Math.round(weightedAge / totalGrams) : 0,
      }
    })
    .sort((a, b) => b.inventoryValue - a.inventoryValue)
}

function roleDashboardWidgets(
  costing: CostingOverview,
  burnRate: AnalyticsBurnRateRow[],
  forecast: LowStockForecastRow[],
  risk: ExpiryRiskRow[],
  ranking: CostRankingRow[],
): RoleDashboardWidget[] {
  const highestRisk = risk[0]
  const urgentForecast = forecast.find((row) => row.daysToStockout < 90) ?? forecast[0]
  const topBurn = burnRate[0]
  const topCost = ranking[0]
  return [
    {
      id: 'W-PERF-BURN',
      role: 'Perfumer',
      title: 'Top lab usage',
      value: topBurn ? `${formatGrams(topBurn.usageGrams)} ${topBurn.materialName}` : 'No usage',
      drilldown: 'burn-rate',
    },
    {
      id: 'W-INV-FORECAST',
      role: 'Inventory',
      title: 'Earliest stockout',
      value: urgentForecast ? `${urgentForecast.materialName} ${urgentForecast.daysToStockout}d` : 'No forecast',
      drilldown: 'low-stock-forecast',
    },
    {
      id: 'W-FIN-VALUATION',
      role: 'Finance',
      title: 'Inventory valuation',
      value: formatCurrency(costing.valuation.totalValue),
      drilldown: 'valuation',
    },
    {
      id: 'W-FIN-COST',
      role: 'Finance',
      title: 'Top cost driver',
      value: topCost ? `${topCost.materialName} ${formatCurrency(topCost.extendedCost)}` : 'No COGS',
      drilldown: 'cost-ranking',
    },
    {
      id: 'W-OWNER-RISK',
      role: 'Owner',
      title: 'Expiry risk',
      value: highestRisk ? `${highestRisk.lotNumber} ${highestRisk.status}` : 'No risk',
      drilldown: 'expiry-risk',
    },
  ]
}

export function analyticsDashboardReport(
  lots: InventoryLot[] = initialLots,
  movements: InventoryMovement[] = initialMovements,
  materialCatalog: Material[] = materials,
  history: PriceHistoryRecord[] = priceHistory,
  reports: ScheduledReportRecord[] = scheduledReports,
): AnalyticsDashboardReport {
  const burnRate = analyticsBurnRate(movements, materialCatalog)
  const forecast = lowStockForecast(lots, movements, materialCatalog)
  const risk = expiryRisk(lots, materialCatalog)
  const ranking = costRanking(movements, lots, materialCatalog, history)
  const inventoryRows = inventoryAnalytics(lots, movements, materialCatalog, history)
  const costing = costingOverview('frm-0421', lots, movements, formulas, materialCatalog, commercialSkus, history)

  return {
    burnRate,
    lowStockForecast: forecast,
    expiryRisk: risk,
    costRanking: ranking,
    inventoryAnalytics: inventoryRows,
    roleWidgets: roleDashboardWidgets(costing, burnRate, forecast, risk, ranking),
    scheduledReports: reports,
    invariant: 'analytics dashboard is read-only and reconciles stock, movement ledger, costing, and report definitions',
  }
}

export function evaporationCurve(leaves: ResolvedLeaf[]) {
  const timepoints = [0, 1, 2, 4, 8, 12, 18, 24]
  const materialsById = new Map<string, Omit<FormulaEvaporationMaterialPoint, 'remainingPercent'>>()
  leaves.forEach((leaf) => {
    const existing = materialsById.get(leaf.materialId)
    materialsById.set(leaf.materialId, {
      materialId: leaf.materialId,
      materialName: leaf.materialName,
      tier: leaf.tier,
      initialPercent: Number(((existing?.initialPercent ?? 0) + leaf.activePercent).toFixed(4)),
      vaporPressure: leaf.vaporPressure,
    })
  })
  const materialSeries = Array.from(materialsById.values()).sort((left, right) => right.initialPercent - left.initialPercent)

  return timepoints.map((hour) => {
    return {
      hour,
      materials: materialSeries.map((material) => {
        const tau = Math.max(0.7, 7 / Math.sqrt(Math.max(material.vaporPressure, 0.0001)))
        return {
          ...material,
          remainingPercent: Number((100 * Math.exp(-hour / tau)).toFixed(1)),
        }
      }),
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
  const done = domains.filter((domain) => domain.status === 'stable' || domain.status === 'active').length
  const avgCoverage = Math.round(domains.reduce((sum, domain) => sum + domain.health, 0) / domains.length)
  const risks = domains.filter((domain) => domain.status === 'alert' || domain.health < 55).length
  return { done, avgCoverage, risks }
}
