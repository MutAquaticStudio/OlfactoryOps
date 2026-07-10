import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '../shared/http-error.js'
import {
  auditEvents,
  apiKeys,
  analyticsBurnRate,
  analyticsDashboardReport,
  authSessions,
  billingInvoices,
  billingPlan,
  billingSubscription,
  brandingConfig,
  brands,
  batchCostReport,
  canDownloadDocument,
  commercialSkus,
  costRanking,
  costingOverview,
  createDocumentShareLink,
  customFields,
  customers,
  createSignedDocumentUrl,
  documentComplianceDashboard,
  documentRequiredPermissions,
  documents,
  domains,
  expiryRisk,
  featureFlags,
  formulaCostReport,
  formatSequenceValue,
  formulaTotals,
  formulaVersions,
  formulas as initialFormulas,
  formatGrams,
  initialLots,
  initialMovements,
  inventoryAnalytics,
  inventoryValuationReport,
  isLotEligibleForInventory,
  lowStockForecast,
  materials,
  memberships,
  moleculeComponents,
  numberingSequences,
  organizations,
  orderDocuments,
  orderRequiredGrams,
  permissionCatalog,
  phases,
  planLabUsage,
  priceLists,
  priceHistory,
  productionBatches,
  purchaseOrders,
  quotes,
  resolveFormulaWithCatalog,
  rolePolicies,
  sampleRequests,
  salesOrders,
  scheduledReports,
  shipments,
  skuMarginReports,
  skuAvailability,
  ssoConfig,
  stockTakeRecords,
  stockSummary,
  storageLocations,
  suppliers,
  tenantScopeAllows,
  tenantSecurityPolicy,
  tenantSettings,
  webhooks,
  webhookDeliveries,
  type Allocation,
  type AuditEvent,
  type AuthSession,
  type BillingActionResponse,
  type BillingConsoleResponse,
  type BillingInvoiceRecord,
  type BillingLimitCheck,
  type BillingPlanRecord,
  type BillingSubscriptionRecord,
  type BillingUsageMeterRecord,
  type BrandRecord,
  type BrandingConfig,
  type CommercialSkuRecord,
  type CustomerAddress,
  type CustomerRecord,
  type CustomFieldDefinition,
  type DocumentRecord,
  type DocumentShareLink,
  type DocumentType,
  type FeatureFlagRecord,
  type Formula,
  type FormulaLine,
  type FormulaVersionRecord,
  type InventoryLot,
  type InventoryMovement,
  type InventoryReorderSuggestion,
  type LabUsagePurpose,
  type LabUsageRecord,
  type LabWeighingSession,
  type LotLabelPayload,
  type LotQualityStatus,
  type Material,
  type MaterialIngestionRecord,
  type MaterialProvenance,
  type MembershipRecord,
  type MoleculeComponent,
  type NumberingSequenceRecord,
  type OrganizationRecord,
  type PriceHistoryRecord,
  type PriceListRecord,
  type ProductionBatchRecord,
  type PurchaseOrderRecord,
  type QuoteRecord,
  type RolePolicy,
  type SampleRequestRecord,
  type SalesOrderRecord,
  type ScheduledReportRecord,
  type ShipmentRecord,
  type OrderDocumentRecord,
  type StockTakeRecord,
  type StorageLocation,
  type SupplierRecord,
  type TenantSettingsRecord,
  type WebhookDeliveryRecord,
} from '../../../src/data/northStar.js'

type WeighingActualInput = {
  materialId?: string
  lotId: string
  actualGrams: number
}

type LabWeighingOptions = {
  actuals?: WeighingActualInput[]
  tolerancePercent?: number
  operator?: string
  purpose?: LabUsagePurpose
  projectCode?: string
  sampleCode?: string
  qcLink?: string
}

type LabUsageReverseOptions = {
  reason?: string
  actor?: string
}

type GenerateDocumentBody = {
  type?: DocumentType | string
  linkedTo?: string
  actor?: string
}

type SignupBody = {
  organizationName?: string
  workspaceSlug?: string
  email?: string
  name?: string
}

type CreatePurchaseOrderBody = {
  supplierId?: string
  materialId?: string
  quantityGrams?: number
  unitCost?: number
  currency?: string
  expectedDate?: string
}

type CreateSupplierBody = {
  name?: string
  country?: string
  leadTimeDays?: number
  contactEmail?: string
  paymentTerms?: string
  preferredMaterialIds?: string[]
}

type CreateCatalogSkuBody = {
  materialId?: string
  name?: string
  description?: string
  packSizeGrams?: number
  price?: number
  currency?: string
  tier?: CommercialSkuRecord['tier']
  moqPacks?: number
  labelTemplate?: string
}

type CreatePriceListBody = {
  name?: string
  customerGroup?: PriceListRecord['customerGroup']
  currency?: string
  multiplier?: number
  sampleEligible?: boolean
}

type CreateQuoteBody = {
  skuId?: string
  customer?: string
  customerGroup?: PriceListRecord['customerGroup']
  quantityPacks?: number
}

type CreateSampleRequestBody = {
  skuId?: string
  customer?: string
  packs?: number
}

type CreateCustomerBody = {
  name?: string
  group?: PriceListRecord['customerGroup']
  creditLimit?: number
  paymentTerms?: CustomerRecord['paymentTerms']
  contactEmail?: string
  billingAddress?: Partial<CustomerAddress>
  shippingAddress?: Partial<CustomerAddress>
}

type CreateSalesOrderBody = {
  skuId?: string
  customerId?: string
  quantity?: number
  discountPercent?: number
  taxPercent?: number
  shippingCost?: number
  currency?: string
}

type PackOrderBody = {
  weightGrams?: number
}

type ShipOrderBody = {
  carrier?: ShipmentRecord['carrier']
  trackingNumber?: string
}

type BillingLimitKey = keyof BillingPlanRecord['limits']

const productionLifecycleStatuses: ProductionBatchRecord['status'][] = [
  'PLANNED',
  'WEIGHING',
  'MACERATION',
  'FILTRATION',
  'QC',
  'BOTTLING',
  'RELEASED',
  'HOLD',
]

type RolePermissionMatrix = {
  role: string
  scope: RolePolicy['scope']
  mfaRequired: boolean
  allowedPermissions: string[]
  deniedPermissions: string[]
  highRiskPermissions: string[]
}

type SessionRevokeReason =
  | 'ADMIN_REVOKE'
  | 'AUTH_LOGOUT'
  | 'CONCURRENT_LIMIT'
  | 'IDLE_TIMEOUT'
  | 'ABSOLUTE_TIMEOUT'
  | 'MEMBERSHIP_DEACTIVATED'
  | 'REVOKE_ALL'

type MaterialMutationBody = Partial<Omit<Material, 'id' | 'provenance'>> & {
  source?: string
  version?: string
}

type MaterialNumericFields = Partial<
  Pick<Material, 'density' | 'vaporPressure' | 'mw' | 'logP' | 'ifraLimit' | 'costPerGram'>
>

type MaterialIngestionBody = {
  documentType?: 'SDS' | 'CoA'
  source?: string
  version?: string
  approved?: boolean
  fields?: MaterialNumericFields
  odor?: string[]
}

type FormulaLineMutationBody = {
  materialId?: string
  childFormulaId?: string
  grams?: number
  label?: string
}

@Injectable()
export class NorthStarService {
  private materialRecords: Material[] = structuredClone(materials)
  private moleculeRecords: MoleculeComponent[] = structuredClone(moleculeComponents)
  private lots: InventoryLot[] = structuredClone(initialLots)
  private movements: InventoryMovement[] = structuredClone(initialMovements)
  private locationRecords: StorageLocation[] = structuredClone(storageLocations)
  private stockTakeRecords: StockTakeRecord[] = structuredClone(stockTakeRecords)
  private formulaRecords: Formula[] = structuredClone(initialFormulas)
  private formulaVersionRecords: FormulaVersionRecord[] = structuredClone(formulaVersions)
  private usageHistory: LabUsageRecord[] = []
  private documentRecords: DocumentRecord[] = structuredClone(documents)
  private auditEvents: AuditEvent[] = structuredClone(auditEvents)
  private organizationRecords: OrganizationRecord[] = structuredClone(organizations)
  private brandRecords: BrandRecord[] = structuredClone(brands)
  private membershipRecords: MembershipRecord[] = structuredClone(memberships)
  private sessions: AuthSession[] = structuredClone(authSessions)
  private rolePolicyRecords: RolePolicy[] = structuredClone(rolePolicies)
  private settingsRecord: TenantSettingsRecord = structuredClone(tenantSettings)
  private flagRecords: FeatureFlagRecord[] = structuredClone(featureFlags)
  private sequences: NumberingSequenceRecord[] = structuredClone(numberingSequences)
  private customFieldRecords: CustomFieldDefinition[] = structuredClone(customFields)
  private brandingRecord: BrandingConfig = structuredClone(brandingConfig)
  private productionBatchRecords: ProductionBatchRecord[] = structuredClone(productionBatches)
  private supplierRecords: SupplierRecord[] = structuredClone(suppliers)
  private purchaseOrderRecords: PurchaseOrderRecord[] = structuredClone(purchaseOrders)
  private priceHistoryRecords: PriceHistoryRecord[] = structuredClone(priceHistory)
  private commercialSkuRecords: CommercialSkuRecord[] = structuredClone(commercialSkus)
  private priceListRecords: PriceListRecord[] = structuredClone(priceLists)
  private quoteRecords: QuoteRecord[] = structuredClone(quotes)
  private sampleRequestRecords: SampleRequestRecord[] = structuredClone(sampleRequests)
  private customerRecords: CustomerRecord[] = structuredClone(customers)
  private salesOrderRecords: SalesOrderRecord[] = structuredClone(salesOrders)
  private shipmentRecords: ShipmentRecord[] = structuredClone(shipments)
  private orderDocumentRecords: OrderDocumentRecord[] = structuredClone(orderDocuments)
  private scheduledReportRecords: ScheduledReportRecord[] = structuredClone(scheduledReports)
  private subscriptionRecord: BillingSubscriptionRecord = structuredClone(billingSubscription)
  private invoiceRecords: BillingInvoiceRecord[] = structuredClone(billingInvoices)
  private webhookDeliveryRecords: WebhookDeliveryRecord[] = structuredClone(webhookDeliveries)
  private auditCounter = auditEvents.length

  phases() {
    return { data: phases }
  }

  domains() {
    return { data: domains }
  }

  materials() {
    return { data: this.materialRecords }
  }

  materialDedupe(cas = '') {
    const normalizedCas = cas.trim().toLowerCase()
    const matches = normalizedCas
      ? this.materialRecords.filter((material) => material.cas.toLowerCase() === normalizedCas)
      : []
    return {
      data: {
        cas,
        matches,
        duplicate: matches.length > 0,
        invariant: 'CAS duplicate checks run before material creation',
      },
    }
  }

  createMaterial(body: MaterialMutationBody) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'materials.create')
    const name = body.name?.trim()
    const cas = body.cas?.trim()
    if (!name) {
      throw new UnprocessableEntityException('Material name is required')
    }
    if (!cas || !/^[0-9-]+$/.test(cas)) {
      throw new UnprocessableEntityException('CAS must contain digits and hyphens')
    }
    if (this.materialRecords.some((material) => material.cas.toLowerCase() === cas.toLowerCase())) {
      throw new UnprocessableEntityException('Material CAS already exists')
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `material-${Date.now()}`
    const material: Material = {
      id: `mat-${slug}`,
      name,
      cas,
      family: body.family?.trim() || 'Unclassified',
      tier: body.tier === 'Top' || body.tier === 'Heart' || body.tier === 'Base' ? body.tier : 'Base',
      vaporPressure: this.safeMaterialNumber(body.vaporPressure, 0.01),
      density: this.safeMaterialNumber(body.density, 1),
      mw: this.safeMaterialNumber(body.mw, 100),
      logP: this.safeMaterialNumber(body.logP, 1),
      substantivityHours: this.safeMaterialNumber(body.substantivityHours, 24),
      ifraLimit: this.safeMaterialNumber(body.ifraLimit, 100),
      costPerGram: this.safeMaterialNumber(body.costPerGram, 0.05),
      odor: body.odor?.filter(Boolean) ?? [],
      provenance: [
        {
          field: 'Material',
          source: body.source?.trim() || 'Manual material create',
          version: body.version?.trim() || 'v1',
          date: new Date().toISOString().slice(0, 10),
        },
      ],
    }
    this.materialRecords = [material, ...this.materialRecords]
    const audit = this.recordAudit('material.create', material.id, session.userId, 'allowed')
    return { data: { material, audit, invariant: 'material master create does not create stock' } }
  }

  formulas() {
    return { data: this.formulaRecords }
  }

  createFormulaDraft(body: { name?: string; targetGrams?: number; owner?: string }) {
    const targetGrams = Number(body.targetGrams ?? 100)
    if (!Number.isFinite(targetGrams) || targetGrams <= 0) {
      throw new UnprocessableEntityException('Formula targetGrams must be greater than 0')
    }

    const sequence = this.nextNumber('formula').data
    const formula: Formula = {
      id: sequence.value.toLowerCase(),
      code: sequence.value,
      name: body.name?.trim() || 'Untitled Formula',
      version: 'v1',
      status: 'draft',
      targetGrams,
      owner: body.owner?.trim() || 'Thuan Le Minh',
      lines: [],
    }

    this.formulaRecords = [formula, ...this.formulaRecords]
    this.recordAudit('formula.create', formula.code, formula.owner, 'allowed')
    return { data: { formula, invariant: 'formula draft creation does not create inventory movement' } }
  }

  addFormulaLine(
    id: string,
    body: FormulaLineMutationBody,
  ) {
    const formula = this.formulaRecords.find((item) => item.id === id)
    if (!formula) {
      throw new NotFoundException(`Formula ${id} was not found`)
    }

    const { grams, material, childFormula } = this.validateFormulaLineMutation(id, body)

    const line: FormulaLine = {
      id: `${id}-line-${formula.lines.length + 1}-${Date.now()}`,
      label: body.label?.trim() || material?.name || childFormula?.name || 'Formula line',
      grams,
      ...(material ? { materialId: material.id } : {}),
      ...(childFormula ? { childFormulaId: childFormula.id } : {}),
    }
    const updatedFormula = { ...formula, lines: [...formula.lines, line] }
    this.formulaRecords = this.formulaRecords.map((item) => (item.id === id ? updatedFormula : item))
    const leaves = resolveFormulaWithCatalog(id, this.formulaRecords, this.materialRecords)

    this.recordAudit('formula.line.create', updatedFormula.code, 'api:perfumer', 'allowed')
    return {
      data: {
        formula: updatedFormula,
        line,
        leaves,
        totals: formulaTotals(leaves),
        invariant: 'formula line save does not create inventory movement',
      },
    }
  }

  updateFormulaLine(id: string, lineId: string, body: FormulaLineMutationBody) {
    const formula = this.formulaRecords.find((item) => item.id === id)
    if (!formula) {
      throw new NotFoundException(`Formula ${id} was not found`)
    }
    const line = formula.lines.find((item) => item.id === lineId)
    if (!line) {
      throw new NotFoundException(`Formula line ${lineId} was not found`)
    }

    const mutationBody: FormulaLineMutationBody = {
      grams: body.grams ?? line.grams,
      label: body.label ?? line.label,
      materialId: body.materialId ?? (body.childFormulaId ? undefined : line.materialId),
      childFormulaId: body.childFormulaId ?? (body.materialId ? undefined : line.childFormulaId),
    }
    const { grams, material, childFormula } = this.validateFormulaLineMutation(id, mutationBody)
    const updatedLine: FormulaLine = {
      id: line.id,
      label: mutationBody.label?.trim() || material?.name || childFormula?.name || line.label,
      grams,
      ...(material ? { materialId: material.id } : {}),
      ...(childFormula ? { childFormulaId: childFormula.id } : {}),
      ...(line.dilution ? { dilution: line.dilution } : {}),
    }
    const updatedFormula = {
      ...formula,
      status: formula.status === 'stable' ? ('review' as const) : formula.status,
      lines: formula.lines.map((item) => (item.id === lineId ? updatedLine : item)),
    }
    this.formulaRecords = this.formulaRecords.map((item) => (item.id === id ? updatedFormula : item))
    const leaves = resolveFormulaWithCatalog(id, this.formulaRecords, this.materialRecords)
    const audit = this.recordAudit('formula.line.update', updatedFormula.code, 'api:perfumer', 'allowed')
    return {
      data: {
        formula: updatedFormula,
        line: updatedLine,
        leaves,
        totals: formulaTotals(leaves),
        audit,
        invariant: 'formula line update does not create inventory movement',
      },
    }
  }

  deleteFormulaLine(id: string, lineId: string) {
    const formula = this.formulaRecords.find((item) => item.id === id)
    if (!formula) {
      throw new NotFoundException(`Formula ${id} was not found`)
    }
    if (!formula.lines.some((line) => line.id === lineId)) {
      throw new NotFoundException(`Formula line ${lineId} was not found`)
    }

    const updatedFormula = {
      ...formula,
      status: formula.status === 'stable' ? ('review' as const) : formula.status,
      lines: formula.lines.filter((line) => line.id !== lineId),
    }
    this.formulaRecords = this.formulaRecords.map((item) => (item.id === id ? updatedFormula : item))
    const leaves = resolveFormulaWithCatalog(id, this.formulaRecords, this.materialRecords)
    const audit = this.recordAudit('formula.line.delete', updatedFormula.code, 'api:perfumer', 'allowed')
    return {
      data: {
        formula: updatedFormula,
        leaves,
        totals: formulaTotals(leaves),
        audit,
        invariant: 'formula line delete does not create inventory movement',
      },
    }
  }

  moveFormulaLine(id: string, lineId: string, body: { direction?: 'up' | 'down' }) {
    const formula = this.formulaRecords.find((item) => item.id === id)
    if (!formula) {
      throw new NotFoundException(`Formula ${id} was not found`)
    }
    const index = formula.lines.findIndex((line) => line.id === lineId)
    if (index === -1) {
      throw new NotFoundException(`Formula line ${lineId} was not found`)
    }
    const direction = body.direction === 'down' ? 'down' : 'up'
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= formula.lines.length) {
      return {
        data: {
          formula,
          invariant: 'formula line order unchanged at boundary and no inventory movement was created',
        },
      }
    }

    const lines = [...formula.lines]
    const currentLine = lines[index]
    const swapLine = lines[swapIndex]
    if (!currentLine || !swapLine) {
      throw new NotFoundException(`Formula line ${lineId} was not found`)
    }
    lines[index] = swapLine
    lines[swapIndex] = currentLine
    const updatedFormula = {
      ...formula,
      status: formula.status === 'stable' ? ('review' as const) : formula.status,
      lines,
    }
    this.formulaRecords = this.formulaRecords.map((item) => (item.id === id ? updatedFormula : item))
    const audit = this.recordAudit('formula.line.reorder', updatedFormula.code, 'api:perfumer', 'allowed')
    return {
      data: {
        formula: updatedFormula,
        audit,
        invariant: 'formula line reorder does not create inventory movement',
      },
    }
  }

  material(id: string) {
    const material = this.materialRecords.find((item) => item.id === id)
    if (!material) {
      throw new NotFoundException(`Material ${id} was not found`)
    }
    const summary = stockSummary(this.lots, this.materialRecords).find((item) => item.material.id === id)
    return { data: { ...material, stock: summary } }
  }

  updateMaterial(id: string, body: MaterialMutationBody) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'materials.update')
    const material = this.materialRecords.find((item) => item.id === id)
    if (!material) {
      throw new NotFoundException(`Material ${id} was not found`)
    }
    const updated = this.mergeMaterial(material, body, body.source?.trim() || 'Manual material update', body.version?.trim() || 'v1')
    this.materialRecords = this.materialRecords.map((item) => (item.id === id ? updated : item))
    const audit = this.recordAudit('material.update', id, session.userId, 'allowed')
    return { data: { material: updated, audit, invariant: 'material edits preserve field provenance' } }
  }

  ingestMaterialDocument(id: string, body: MaterialIngestionBody) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'materials.update')
    const material = this.materialRecords.find((item) => item.id === id)
    if (!material) {
      throw new NotFoundException(`Material ${id} was not found`)
    }
    const documentType = body.documentType === 'CoA' ? 'CoA' : 'SDS'
    const source = body.source?.trim() || `${material.name} ${documentType}`
    const version = body.version?.trim() || 'v1'
    const fallbackFields =
      documentType === 'CoA'
        ? { costPerGram: Number((material.costPerGram * 0.98).toFixed(4)) }
        : {
            density: Number((material.density + 0.01).toFixed(3)),
            vaporPressure: Number((material.vaporPressure * 1.08).toFixed(4)),
            mw: material.mw,
            logP: Number((material.logP + 0.05).toFixed(2)),
          }
    const fields = this.sanitizeMaterialFields({ ...fallbackFields, ...body.fields })
    const ingestion: MaterialIngestionRecord = {
      id: `ING-${String(this.auditCounter + 1).padStart(5, '0')}`,
      materialId: id,
      documentType,
      source,
      version,
      status: body.approved === true ? 'APPROVED' : 'REVIEW_REQUIRED',
      extractedFields: Object.keys(fields),
    }
    const audit = this.recordAudit(
      body.approved === true ? 'material.ingest.approve' : 'material.ingest.review',
      id,
      session.userId,
      body.approved === true ? 'allowed' : 'review',
    )

    if (body.approved !== true) {
      return {
        data: {
          material,
          ingestion,
          audit,
          invariant: 'SDS/CoA extraction is staged for human review before write',
        },
      }
    }

    const updated = this.mergeMaterial(
      material,
      { ...fields, odor: body.odor },
      `${source} ${documentType} review`,
      version,
    )
    this.materialRecords = this.materialRecords.map((item) => (item.id === id ? updated : item))
    return {
      data: {
        material: updated,
        ingestion,
        audit,
        invariant: 'SDS/CoA ingestion writes only after explicit approval',
      },
    }
  }

  pubchemFill(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'materials.update')
    const material = this.materialRecords.find((item) => item.id === id)
    if (!material) {
      throw new NotFoundException(`Material ${id} was not found`)
    }
    const profile = this.pubchemProfile(material)
    const updated = this.mergeMaterial(material, profile.fields, 'PubChem curated fill', '2026-07')
    const nextMolecules = profile.molecules.map((molecule, index) => ({
      ...molecule,
      id: `mol-${id}-${index + 1}`,
      materialId: id,
      source: 'PubChem curated fill',
      status: 'REVIEW' as const,
    }))
    this.materialRecords = this.materialRecords.map((item) => (item.id === id ? updated : item))
    this.moleculeRecords = [
      ...nextMolecules,
      ...this.moleculeRecords.filter((molecule) => molecule.materialId !== id || molecule.status === 'VERIFIED'),
    ]
    const audit = this.recordAudit('material.pubchemFill', id, session.userId, 'allowed')
    return {
      data: {
        material: updated,
        molecules: this.moleculeRecords.filter((molecule) => molecule.materialId === id),
        audit,
        invariant: 'PubChem fill is curated tenant data, not tenant-crossing scraping',
      },
    }
  }

  materialMolecules(id: string) {
    if (!this.materialRecords.some((item) => item.id === id)) {
      throw new NotFoundException(`Material ${id} was not found`)
    }
    const molecules = this.moleculeRecords.filter((molecule) => molecule.materialId === id)
    return {
      data: {
        materialId: id,
        molecules,
        totalPercent: molecules.reduce((sum, molecule) => sum + molecule.percent, 0),
        invariant: 'molecule split is linked to a tenant material record',
      },
    }
  }

  materialProvenance(id: string) {
    const material = this.materialRecords.find((item) => item.id === id)
    if (!material) {
      throw new NotFoundException(`Material ${id} was not found`)
    }
    return {
      data: {
        materialId: id,
        provenance: material.provenance,
        documents: this.documentRecords.filter((document) => document.linkedTo === id),
        invariant: 'every sourced material field keeps provenance evidence',
      },
    }
  }

  resolveFormula(id: string) {
    const formula = this.formulaRecords.find((item) => item.id === id)
    if (!formula) {
      throw new NotFoundException(`Formula ${id} was not found`)
    }
    const leaves = resolveFormulaWithCatalog(id, this.formulaRecords, this.materialRecords)
    return {
      data: {
        formula,
        leaves,
        totals: formulaTotals(leaves),
        invariant: 'resolve before compute',
      },
    }
  }

  formulaCost(id: string) {
    const resolved = this.resolveFormula(id).data
    return {
      data: {
        formula: resolved.formula,
        totals: resolved.totals,
        invariant: 'cost is derived from resolved formula leaves',
      },
    }
  }

  formulaVersions(id: string) {
    const formula = this.formulaRecords.find((item) => item.id === id)
    if (!formula) {
      throw new NotFoundException(`Formula ${id} was not found`)
    }
    return {
      data: {
        formula,
        versions: this.formulaVersionRecords.filter((version) => version.formulaId === id),
        invariant: 'version history is immutable snapshot evidence for formula approval',
      },
    }
  }

  createFormulaVersion(id: string, body: { note?: string; actor?: string } = {}) {
    const formula = this.formulaRecords.find((item) => item.id === id)
    if (!formula) {
      throw new NotFoundException(`Formula ${id} was not found`)
    }
    if (formula.lines.length === 0) {
      throw new UnprocessableEntityException('Formula must have at least one line before snapshot')
    }

    const version = this.nextFormulaVersionValue(formula.version)
    const updatedFormula = { ...formula, version, status: 'review' as const }
    const leaves = resolveFormulaWithCatalog(id, this.formulaRecords, this.materialRecords)
    const totals = formulaTotals(leaves)
    const snapshot: FormulaVersionRecord = {
      id: `${updatedFormula.code}-${version}`,
      formulaId: id,
      formulaCode: updatedFormula.code,
      version,
      status: 'SNAPSHOT',
      createdAt: new Date().toISOString(),
      createdBy: body.actor?.trim() || updatedFormula.owner,
      note: body.note?.trim() || `Snapshot ${updatedFormula.code} ${version}`,
      lineCount: updatedFormula.lines.length,
      totalGrams: totals.totalGrams,
      totalCost: totals.totalCost,
      checksum: this.formulaVersionChecksum(updatedFormula),
      lines: structuredClone(updatedFormula.lines),
    }

    this.formulaRecords = this.formulaRecords.map((item) => (item.id === id ? updatedFormula : item))
    this.formulaVersionRecords = [
      snapshot,
      ...this.formulaVersionRecords.filter((item) => item.id !== snapshot.id),
    ]
    const audit = this.recordAudit('formula.version.snapshot', updatedFormula.code, snapshot.createdBy, 'allowed')
    return {
      data: {
        formula: updatedFormula,
        version: snapshot,
        audit,
        invariant: 'formula version snapshot does not create inventory movement',
      },
    }
  }

  approveFormula(id: string, body: { actor?: string } = {}) {
    const formula = this.formulaRecords.find((item) => item.id === id)
    if (!formula) {
      throw new NotFoundException(`Formula ${id} was not found`)
    }
    const version = this.formulaVersionRecords.find(
      (item) => item.formulaId === id && item.version === formula.version,
    )
    if (!version) {
      throw new UnprocessableEntityException('Formula must have a version snapshot before approval')
    }

    const approvedVersion = { ...version, status: 'APPROVED' as const }
    const approvedFormula = { ...formula, status: 'stable' as const }
    const actor = body.actor?.trim() || formula.owner
    this.formulaRecords = this.formulaRecords.map((item) => (item.id === id ? approvedFormula : item))
    this.formulaVersionRecords = this.formulaVersionRecords.map((item) =>
      item.id === version.id ? approvedVersion : item,
    )
    const audit = this.recordAudit('formula.approve', approvedFormula.code, actor, 'allowed')
    return {
      data: {
        formula: approvedFormula,
        version: approvedVersion,
        audit,
        invariant: 'formula approval changes review state but does not consume stock',
      },
    }
  }

  exportFormula(id: string, body: { actor?: string } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.export')
    const formula = this.formulaRecords.find((item) => item.id === id)
    if (!formula) {
      throw new NotFoundException(`Formula ${id} was not found`)
    }
    if (formula.lines.length === 0) {
      throw new UnprocessableEntityException('Formula must have at least one line before export')
    }

    const actor = body.actor?.trim() || session.userId
    const document: DocumentRecord = {
      id: `DOC-FRM-${formula.code.replace(/[^A-Z0-9]/g, '')}-${formula.version.toUpperCase()}`,
      type: 'Formula Export',
      title: `${formula.code} ${formula.version} Export`,
      linkedTo: formula.id,
      version: formula.version,
      sensitivity: 'Highly Confidential',
      status: 'APPROVED',
      issueDate: new Date().toISOString().slice(0, 10),
      lastAccessed: new Date().toISOString(),
      downloads: 0,
      storageKey: `org-nxl/formulas/${formula.id}/export-${formula.version}.pdf`,
      mimeType: 'application/pdf',
      sizeKb: Math.max(32, Math.round(JSON.stringify(formula.lines).length / 8)),
      checksum: this.formulaVersionChecksum(formula),
      owner: 'Compliance',
    }
    this.documentRecords = [
      document,
      ...this.documentRecords.filter((item) => item.id !== document.id),
    ]
    const audit = this.recordAudit('formula.export', formula.code, actor, 'allowed')
    return {
      data: {
        formula,
        document,
        audit,
        invariant: 'formula export is audited and creates no inventory movement',
      },
    }
  }

  lotsList() {
    return { data: this.lots }
  }

  inventorySummary() {
    return { data: stockSummary(this.lots, this.materialRecords) }
  }

  inventoryMovements() {
    return { data: this.movements }
  }

  inventoryConsole() {
    return {
      data: {
        lots: this.lots,
        movements: this.movements,
        locations: this.locationRecords,
        stockTakes: this.stockTakeRecords,
        summary: stockSummary(this.lots, this.materialRecords),
        reorderSuggestions: this.inventoryReorderSuggestions().data.suggestions,
        invariant: 'inventory console reads lots, locations, stock takes, and immutable movement evidence together',
      },
    }
  }

  storageLocationsList() {
    return { data: this.locationRecords }
  }

  createStorageLocation(body: {
    name?: string
    zone?: string
    condition?: string
    capacityGrams?: number
    parentId?: string
    kind?: StorageLocation['kind']
    light?: StorageLocation['light']
    temperatureRange?: string
  }) {
    const name = body.name?.trim()
    if (!name) {
      throw new UnprocessableEntityException('Storage location name is required')
    }
    if (this.locationRecords.some((location) => location.name.toLowerCase() === name.toLowerCase())) {
      throw new UnprocessableEntityException(`Storage location ${name} already exists`)
    }

    const capacityGrams = Number(body.capacityGrams ?? 0)
    if (!Number.isFinite(capacityGrams) || capacityGrams <= 0) {
      throw new UnprocessableEntityException('Storage location capacityGrams must be greater than 0')
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `loc-${Date.now()}`
    const location: StorageLocation = {
      id: `loc-${slug}`,
      name,
      zone: body.zone?.trim() || 'Warehouse',
      condition: body.condition?.trim() || 'Controlled ambient',
      capacityGrams,
      parentId: body.parentId?.trim() || undefined,
      kind: body.kind ?? 'Bin',
      light: body.light ?? 'Ambient',
      temperatureRange: body.temperatureRange?.trim() || '18-22C',
      status: 'ACTIVE',
    }

    this.locationRecords = [location, ...this.locationRecords]
    this.recordAudit('inventory.location.create', location.name, 'api:inventory', 'allowed')
    return {
      data: {
        location,
        invariant: 'storage location creation changes master data only, not stock quantity',
      },
    }
  }

  inventoryReorderSuggestions() {
    const reorderPoints = new Map<string, number>([
      ['mat-iso', 180],
      ['mat-hedione', 120],
      ['mat-bergamot', 60],
      ['mat-ambroxan', 45],
      ['mat-muscenone', 20],
      ['mat-roseoxide', 18],
      ['mat-vanillin', 100],
      ['mat-ethanol', 1500],
    ])
    const suggestions: InventoryReorderSuggestion[] = stockSummary(this.lots, this.materialRecords)
      .flatMap((item) => {
        const reorderPointGrams = reorderPoints.get(item.material.id) ?? 0
        if (reorderPointGrams <= 0 || item.available >= reorderPointGrams) {
          return []
        }
        return [
          {
            materialId: item.material.id,
            materialName: item.material.name,
            availableGrams: item.available,
            reorderPointGrams,
            suggestedOrderGrams: Math.max(25, Math.ceil((reorderPointGrams * 1.6 - item.available) / 5) * 5),
            reason: `${formatGrams(item.available)} available is below ${formatGrams(reorderPointGrams)} reorder point`,
          },
        ]
      })
      .sort((a, b) => a.availableGrams - b.availableGrams)

    return {
      data: {
        suggestions,
        invariant: 'shopping list is generated from available approved non-expired stock without reserving or moving inventory',
      },
    }
  }

  changeLotQuality(id: string, body: { qualityStatus?: LotQualityStatus; reason?: string }) {
    const lot = this.lots.find((item) => item.id === id)
    if (!lot) {
      throw new NotFoundException(`Lot ${id} was not found`)
    }

    const qualityStatus = body.qualityStatus
    if (!this.isLotQualityStatus(qualityStatus)) {
      throw new UnprocessableEntityException('Lot qualityStatus must be APPROVED, QUARANTINE, ON_HOLD, REJECTED, or EXPIRED')
    }

    const updatedLot: InventoryLot = { ...lot, qualityStatus }
    const movementCount = this.movements.length
    this.lots = this.lots.map((item) => (item.id === lot.id ? updatedLot : item))
    const audit = this.recordAudit(
      'inventory.quality.update',
      `${lot.lotNumber}:${qualityStatus}`,
      'api:qc',
      qualityStatus === 'APPROVED' ? 'allowed' : 'review',
    )

    return {
      data: {
        lot: updatedLot,
        audit,
        summary: stockSummary(this.lots, this.materialRecords).find((item) => item.material.id === lot.materialId),
        movementCount,
        reason: body.reason?.trim() || 'QC status workflow',
        invariant: 'quality status changes lot eligibility but creates no inventory movement',
      },
    }
  }

  performStockTake(body: {
    lotId?: string
    countedGrams?: number
    reason?: string
    actor?: string
  }) {
    const lot = this.lots.find((item) => item.id === body.lotId)
    if (!lot) {
      throw new NotFoundException(`Lot ${body.lotId} was not found`)
    }

    const countedGrams = Number(body.countedGrams ?? Number.NaN)
    if (!Number.isFinite(countedGrams) || countedGrams < 0) {
      throw new UnprocessableEntityException('Stock take countedGrams must be 0 or greater')
    }
    if (countedGrams < lot.reservedGrams) {
      throw new UnprocessableEntityException({
        message: 'Stock take count cannot be lower than reserved stock',
        lotId: lot.id,
        reservedGrams: lot.reservedGrams,
        countedGrams,
      })
    }

    const expectedGrams = lot.quantityGrams
    const varianceGrams = Number((countedGrams - expectedGrams).toFixed(3))
    const timestamp = new Date().toISOString()
    const actor = body.actor?.trim() || 'api:inventory'
    let movement: InventoryMovement | undefined
    let updatedLot = lot

    if (Math.abs(varianceGrams) > 0.0001) {
      updatedLot = { ...lot, quantityGrams: countedGrams }
      movement = {
        id: `MOV-STK-${String(this.movements.length + 1029).padStart(4, '0')}`,
        at: timestamp,
        type: 'ADJUSTMENT',
        direction: varianceGrams > 0 ? 'IN' : 'OUT',
        materialId: lot.materialId,
        lotId: lot.id,
        quantityGrams: Math.abs(varianceGrams),
        balanceAfter: countedGrams,
        ref: body.reason?.trim() || 'Stock take variance',
        actor,
      }
      this.lots = this.lots.map((item) => (item.id === lot.id ? updatedLot : item))
      this.movements = [movement, ...this.movements]
    }

    const record: StockTakeRecord = {
      id: `STK-${new Date().getFullYear()}-${String(this.stockTakeRecords.length + 22).padStart(3, '0')}`,
      at: timestamp,
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      expectedGrams,
      countedGrams,
      varianceGrams,
      reason: body.reason?.trim() || 'Cycle count',
      actor,
      status: movement ? 'ADJUSTED' : 'MATCHED',
      movementId: movement?.id,
    }

    this.stockTakeRecords = [record, ...this.stockTakeRecords]
    this.recordAudit('inventory.stockTake', lot.lotNumber, actor, movement ? 'review' : 'allowed')
    return {
      data: {
        lot: updatedLot,
        movement,
        stockTake: record,
        summary: stockSummary(this.lots, this.materialRecords).find((item) => item.material.id === lot.materialId),
        invariant: movement
          ? 'stock take variance updates stock through immutable ADJUSTMENT movement'
          : 'stock take match records evidence without changing stock quantity',
      },
    }
  }

  lotLabel(id: string) {
    const lot = this.lots.find((item) => item.id === id)
    if (!lot) {
      throw new NotFoundException(`Lot ${id} was not found`)
    }
    const material = this.materialRecords.find((item) => item.id === lot.materialId)
    if (!material) {
      throw new NotFoundException(`Material ${lot.materialId} was not found`)
    }

    const label: LotLabelPayload = {
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      materialName: material.name,
      storageText: `${lot.location} / ${lot.container ?? 'container not set'}`,
      qualityStatus: lot.qualityStatus,
      expiryDate: lot.expiryDate,
      qrValue: `OLFOPS|LOT|${lot.id}|${lot.lotNumber}|${lot.qualityStatus}|${lot.expiryDate}`,
    }

    return {
      data: {
        label,
        invariant: 'lot label generation is read-only and does not create stock movement',
      },
    }
  }

  lotGenealogy(id: string) {
    const lot = this.lots.find((item) => item.id === id)
    if (!lot) {
      throw new NotFoundException(`Lot ${id} was not found`)
    }
    const material = this.materialRecords.find((item) => item.id === lot.materialId)
    if (!material) {
      throw new NotFoundException(`Material ${lot.materialId} was not found`)
    }

    const receivedAt = new Date(`${lot.receivedDate}T00:00:00.000Z`).getTime()
    const agingDays = Math.max(0, Math.round((Date.now() - receivedAt) / 86_400_000))
    const movements = this.movements.filter((movement) => movement.lotId === lot.id)
    const documents = this.documentRecords.filter((document) => document.linkedTo === lot.id || document.linkedTo === lot.materialId)
    const downstreamRefs = movements
      .filter((movement) => movement.direction === 'OUT' || movement.direction === 'MOVE')
      .map((movement) => ({
        ref: movement.ref,
        type: movement.type,
        quantityGrams: movement.quantityGrams,
        at: movement.at,
      }))

    return {
      data: {
        lot,
        material,
        agingDays,
        movements,
        documents,
        downstreamRefs,
        eligibility: isLotEligibleForInventory(lot) ? 'ELIGIBLE' : 'BLOCKED',
        invariant: 'lot genealogy is reconstructed from movement ledger, documents, and lot metadata',
      },
    }
  }

  adjustInventory(body: {
    lotId?: string
    direction?: 'IN' | 'OUT'
    quantityGrams?: number
    reason?: string
  }) {
    const lot = this.lots.find((item) => item.id === body.lotId)
    if (!lot) {
      throw new NotFoundException(`Lot ${body.lotId} was not found`)
    }

    const quantityGrams = Number(body.quantityGrams ?? 0)
    if (!Number.isFinite(quantityGrams) || quantityGrams <= 0) {
      throw new UnprocessableEntityException('Adjustment quantityGrams must be greater than 0')
    }

    const direction = body.direction ?? 'OUT'
    if (direction !== 'IN' && direction !== 'OUT') {
      throw new UnprocessableEntityException('Adjustment direction must be IN or OUT')
    }

    const nextQuantity =
      direction === 'IN' ? lot.quantityGrams + quantityGrams : lot.quantityGrams - quantityGrams
    if (nextQuantity < lot.reservedGrams) {
      throw new UnprocessableEntityException({
        message: 'Adjustment would create negative available stock',
        lotId: lot.id,
        reservedGrams: lot.reservedGrams,
        requestedQuantityGrams: quantityGrams,
      })
    }

    const timestamp = new Date().toISOString()
    const updatedLot = { ...lot, quantityGrams: nextQuantity }
    const movement: InventoryMovement = {
      id: `MOV-ADJ-${String(this.movements.length + 1029).padStart(4, '0')}`,
      at: timestamp,
      type: 'ADJUSTMENT',
      direction,
      materialId: lot.materialId,
      lotId: lot.id,
      quantityGrams,
      balanceAfter: nextQuantity,
      ref: body.reason?.trim() || 'Cycle count adjustment',
      actor: 'api:inventory',
    }

    this.lots = this.lots.map((item) => (item.id === lot.id ? updatedLot : item))
    this.movements = [movement, ...this.movements]
    this.recordAudit('inventory.adjust', lot.lotNumber, 'api:inventory', 'allowed')

    return {
      data: {
        lot: updatedLot,
        movement,
        summary: stockSummary(this.lots, this.materialRecords).find((item) => item.material.id === lot.materialId),
        invariant: 'inventory adjustment changes stock only through immutable movement',
      },
    }
  }

  transferInventory(body: { lotId?: string; toLocation?: string }) {
    const lot = this.lots.find((item) => item.id === body.lotId)
    if (!lot) {
      throw new NotFoundException(`Lot ${body.lotId} was not found`)
    }

    const toLocation = body.toLocation?.trim()
    if (!toLocation) {
      throw new UnprocessableEntityException('Transfer toLocation is required')
    }
    if (toLocation === lot.location) {
      throw new UnprocessableEntityException('Transfer target location must be different from current location')
    }

    const timestamp = new Date().toISOString()
    const updatedLot = { ...lot, location: toLocation }
    const movement: InventoryMovement = {
      id: `MOV-XFER-${String(this.movements.length + 1029).padStart(4, '0')}`,
      at: timestamp,
      type: 'TRANSFER',
      direction: 'MOVE',
      materialId: lot.materialId,
      lotId: lot.id,
      quantityGrams: lot.quantityGrams,
      balanceAfter: lot.quantityGrams,
      ref: `${lot.location} -> ${toLocation}`,
      actor: 'api:inventory',
    }

    this.lots = this.lots.map((item) => (item.id === lot.id ? updatedLot : item))
    this.movements = [movement, ...this.movements]
    this.recordAudit('inventory.transfer', lot.lotNumber, 'api:inventory', 'allowed')

    return {
      data: {
        lot: updatedLot,
        movement,
        summary: stockSummary(this.lots, this.materialRecords).find((item) => item.material.id === lot.materialId),
        invariant: 'inventory transfer records movement evidence without changing stock quantity',
      },
    }
  }

  receiveInventoryReceipt(body: {
    materialId?: string
    lotNumber?: string
    quantityGrams?: number
    expiryDate?: string
    qualityStatus?: LotQualityStatus
    location?: string
    supplierLotRef?: string
    currency?: string
    retestDate?: string
    openedDate?: string
    shelfLifeAfterOpeningDays?: number
    container?: string
    packaging?: string
  }) {
    const materialId = body.materialId ?? this.materialRecords[0]?.id
    const material = this.materialRecords.find((item) => item.id === materialId)
    if (!material) {
      throw new NotFoundException(`Material ${materialId} was not found`)
    }

    const quantityGrams = Number(body.quantityGrams ?? 0)
    if (!Number.isFinite(quantityGrams) || quantityGrams <= 0) {
      throw new UnprocessableEntityException('Inventory receipt quantityGrams must be greater than 0')
    }
    const qualityStatus = this.isLotQualityStatus(body.qualityStatus) ? body.qualityStatus : 'APPROVED'

    const timestamp = new Date().toISOString()
    const lot: InventoryLot = {
      id: `lot-api-${Date.now()}`,
      materialId: material.id,
      lotNumber: body.lotNumber?.trim() || `L-${material.cas.replaceAll('-', '')}`,
      quantityGrams,
      reservedGrams: 0,
      receivedDate: timestamp.slice(0, 10),
      expiryDate: body.expiryDate ?? '2028-12-31',
      qualityStatus,
      location: body.location?.trim() || 'Receiving Bay',
      unitCost: material.costPerGram,
      supplierLotRef: body.supplierLotRef?.trim() || undefined,
      currency: body.currency?.trim() || 'USD',
      retestDate: body.retestDate?.trim() || undefined,
      openedDate: body.openedDate?.trim() || undefined,
      shelfLifeAfterOpeningDays: Number.isFinite(Number(body.shelfLifeAfterOpeningDays))
        ? Number(body.shelfLifeAfterOpeningDays)
        : undefined,
      container: body.container?.trim() || 'Receiving container',
      packaging: body.packaging?.trim() || undefined,
    }
    const movement: InventoryMovement = {
      id: `MOV-REC-${String(this.movements.length + 1029).padStart(4, '0')}`,
      at: timestamp,
      type: 'RECEIPT',
      direction: 'IN',
      materialId: material.id,
      lotId: lot.id,
      quantityGrams,
      balanceAfter: lot.quantityGrams,
      ref: `GR-API-${String(this.lots.length + 42).padStart(3, '0')}`,
      actor: 'api:inventory',
    }

    this.lots = [lot, ...this.lots]
    this.movements = [movement, ...this.movements]
    this.recordAudit('inventory.receive', lot.lotNumber, 'api:inventory', 'allowed')

    return {
      data: {
        lot,
        movement,
        summary: stockSummary(this.lots, this.materialRecords).find((item) => item.material.id === material.id),
        invariant: 'inventory receipt creates lot and immutable IN movement',
      },
    }
  }

  login(email = 'owner@example.test') {
    const normalizedEmail = email.trim().toLowerCase()
    const membership = this.membershipRecords.find((item) => item.email.toLowerCase() === normalizedEmail)
    if (!membership || membership.status !== 'ACTIVE') {
      this.recordAudit('auth.login', normalizedEmail, 'api:auth', 'blocked')
      throw new ForbiddenException('Tenant membership must be active before login')
    }
    const brandId = membership.brandIds[0]
    if (!brandId) {
      throw new UnprocessableEntityException('Membership must include at least one brand scope')
    }

    const issuedAt = new Date()
    const idleExpiresAt = new Date(issuedAt.getTime() + tenantSecurityPolicy.idleTimeoutMinutes * 60_000)
    const expiresAt = new Date(issuedAt.getTime() + tenantSecurityPolicy.absoluteSessionMinutes * 60_000)
    const deviceId = normalizedEmail === 'owner@example.test' ? 'dev-owner-codex' : `dev-${membership.userId}`
    const knownDevice = this.sessions.some(
      (item) => item.email.toLowerCase() === normalizedEmail && item.deviceId === deviceId,
    )
    const session: AuthSession = {
      id: `SES-${String(this.sessions.length + 1).padStart(4, '0')}`,
      userId: membership.userId,
      email: membership.email,
      organizationId: membership.organizationId,
      brandId,
      role: membership.role,
      issuedAt: issuedAt.toISOString(),
      lastSeenAt: issuedAt.toISOString(),
      idleExpiresAt: idleExpiresAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'ACTIVE',
      mfaVerified: membership.mfaEnabled,
      ipAddress: '203.0.113.24',
      userAgent: 'API Client',
      deviceId,
      location: 'Bangkok, TH',
    }
    this.sessions = [session, ...this.sessions]
    const revokedForLimit = this.enforceConcurrentSessionLimit(session.email, session.id)
    this.membershipRecords = this.membershipRecords.map((item) =>
      item.id === membership.id ? { ...item, lastActiveAt: issuedAt.toISOString() } : item,
    )
    this.recordAudit('auth.login', session.userId, 'api:auth', 'allowed')
    const newDeviceAudit =
      tenantSecurityPolicy.newDeviceAlertEnabled && !knownDevice
        ? this.recordAudit('auth.newDevice', session.deviceId, session.userId, 'review')
        : null
    return {
      data: {
        session,
        revokedForLimit,
        newDeviceAlert: Boolean(newDeviceAudit),
        securityPolicy: tenantSecurityPolicy,
        invariant: 'login creates bounded idle and absolute session windows',
      },
    }
  }

  signup(body: SignupBody = {}) {
    const email = body.email?.trim().toLowerCase()
    const organizationName = body.organizationName?.trim() || 'New Fragrance Lab'
    const workspaceSlug = this.slugify(body.workspaceSlug || organizationName)
    const name = body.name?.trim() || 'Workspace Owner'
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new UnprocessableEntityException('A valid signup email is required')
    }
    if (this.membershipRecords.some((membership) => membership.email.toLowerCase() === email)) {
      throw new UnprocessableEntityException('A member with this email already exists')
    }
    if (this.organizationRecords.some((organization) => organization.slug === workspaceSlug)) {
      throw new UnprocessableEntityException('Workspace slug is already taken')
    }

    const createdAt = new Date().toISOString()
    const organizationId = `org-${workspaceSlug}`
    const brandId = `brand-${workspaceSlug}`
    const userId = `usr-${workspaceSlug}-owner`
    const organization: OrganizationRecord = {
      id: organizationId,
      name: organizationName,
      slug: workspaceSlug,
      plan: 'Team',
      status: 'ACTIVE',
      primaryContact: email,
      createdAt,
    }
    const brand: BrandRecord = {
      id: brandId,
      organizationId,
      name: organizationName,
      status: 'ACTIVE',
      defaultCurrency: this.settingsRecord.currency,
    }
    const membership: MembershipRecord = {
      id: `MBR-${workspaceSlug.toUpperCase().slice(0, 12)}`,
      userId,
      email,
      name,
      organizationId,
      brandIds: [brandId],
      role: 'Owner',
      status: 'ACTIVE',
      mfaEnabled: false,
      lastActiveAt: createdAt,
      invitedAt: createdAt,
    }

    this.organizationRecords = [organization, ...this.organizationRecords]
    this.brandRecords = [brand, ...this.brandRecords]
    this.membershipRecords = [membership, ...this.membershipRecords]
    const session = this.login(email).data.session
    const audit = this.recordAudit('auth.signup', organization.id, session.userId, 'allowed')

    return {
      data: {
        organization,
        brand,
        membership,
        session,
        audit,
        invariant: 'signup provisions an isolated tenant and owner session before app access',
      },
    }
  }

  me() {
    const session = this.currentSession()
    return {
      data: {
        session,
        permissions: this.permissionsForRole(session.role),
        securityPolicy: tenantSecurityPolicy,
      },
    }
  }

  auditLogs() {
    return { data: this.auditEvents }
  }

  securityPolicy() {
    return { data: tenantSecurityPolicy }
  }

  tenantConsole() {
    const session = this.currentSession()
    const organization = this.organizationRecords.find((item) => item.id === session.organizationId)
    if (!organization) {
      throw new NotFoundException(`Organization ${session.organizationId} was not found`)
    }

    return {
      data: {
        organization,
        brands: this.brandRecords.filter((item) => item.organizationId === session.organizationId),
        memberships: this.membershipRecords.filter((item) => item.organizationId === session.organizationId),
        sessions: this.sessions.filter((item) => item.organizationId === session.organizationId),
        rolePolicies: this.organizationRolePolicies(),
        permissionCatalog: this.organizationPermissionCatalog(),
        permissionMatrix: this.buildPermissionMatrix(this.organizationRolePolicies()),
        securityPolicy: tenantSecurityPolicy,
        audit: this.auditEvents
          .filter((event) =>
            ['auth.login', 'auth.logout', 'auth.newDevice', 'membership.invite', 'membership.status.update', 'session.revoke', 'session.revokeAll', 'session.touch', 'session.expire', 'security.tenantProbe', 'security.permissionProbe', 'role.permissions.update'].includes(
              event.action,
            ),
          )
          .slice(0, 8),
        invariant: 'tenant console reads only the organization bound to the active session',
      },
    }
  }

  inviteMember(body: { email?: string; name?: string; role?: string; brandIds?: string[] }) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.manageUsers')
    const email = body.email?.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new UnprocessableEntityException('Invite email must be valid')
    }

    const role = body.role?.trim() || 'Viewer'
    const rolePolicy = this.rolePolicyRecords.find((item) => item.role === role && item.scope === 'organization')
    if (!rolePolicy) {
      throw new UnprocessableEntityException('Invite role must be an organization role')
    }

    const existing = this.membershipRecords.find(
      (item) => item.organizationId === session.organizationId && item.email.toLowerCase() === email,
    )
    if (existing && existing.status !== 'DEACTIVATED') {
      throw new UnprocessableEntityException('Member is already active or invited in this tenant')
    }

    const tenantBrandIds = new Set(
      this.brandRecords.filter((item) => item.organizationId === session.organizationId).map((item) => item.id),
    )
    const brandIds = body.brandIds?.length ? body.brandIds : [session.brandId]
    if (brandIds.some((brandId) => !tenantBrandIds.has(brandId))) {
      throw new ForbiddenException('Invite cannot grant access to another tenant brand')
    }

    const timestamp = new Date().toISOString()
    const membership: MembershipRecord = {
      id: `MBR-${String(this.membershipRecords.length + 1).padStart(4, '0')}`,
      userId: `usr-${email.split('@')[0].replace(/[^a-z0-9-]/gi, '').toLowerCase()}`,
      email,
      name: body.name?.trim() || email,
      organizationId: session.organizationId,
      brandIds,
      role,
      status: 'INVITED',
      mfaEnabled: false,
      lastActiveAt: 'never',
      invitedAt: timestamp,
    }

    this.membershipRecords = existing
      ? this.membershipRecords.map((item) => (item.id === existing.id ? membership : item))
      : [membership, ...this.membershipRecords]
    const audit = this.recordAudit('membership.invite', email, session.userId, 'allowed')
    return {
      data: {
        membership,
        audit,
        invariant: 'admin invite creates membership only; invitee sets password and MFA later',
      },
    }
  }

  setMembershipStatus(id: string, status: MembershipRecord['status']) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.manageUsers')
    if (status !== 'ACTIVE' && status !== 'DEACTIVATED') {
      throw new UnprocessableEntityException('Membership status can only be ACTIVE or DEACTIVATED here')
    }

    const membership = this.membershipRecords.find(
      (item) => item.id === id && item.organizationId === session.organizationId,
    )
    if (!membership) {
      throw new NotFoundException(`Membership ${id} was not found`)
    }
    if (membership.role === 'Owner' && status === 'DEACTIVATED') {
      const activeOwners = this.membershipRecords.filter(
        (item) =>
          item.organizationId === session.organizationId &&
          item.role === 'Owner' &&
          item.status === 'ACTIVE' &&
          item.id !== membership.id,
      )
      if (activeOwners.length === 0) {
        throw new UnprocessableEntityException('Cannot deactivate the last active Owner')
      }
    }

    const updatedMembership = { ...membership, status }
    this.membershipRecords = this.membershipRecords.map((item) =>
      item.id === id ? updatedMembership : item,
    )
    let revokedSessions: AuthSession[] = []
    if (status === 'DEACTIVATED') {
      revokedSessions = this.revokeSessionsForEmail(membership.email)
    }
    const audit = this.recordAudit('membership.status.update', membership.email, session.userId, 'allowed')

    return {
      data: {
        membership: updatedMembership,
        revokedSessions,
        audit,
        invariant: 'deactivated memberships revoke active sessions inside the same tenant',
      },
    }
  }

  revokeSession(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.manageUsers')
    const target = this.sessions.find((item) => item.id === id && item.organizationId === session.organizationId)
    if (!target) {
      throw new NotFoundException(`Session ${id} was not found`)
    }
    const revoked = this.revokeSessionRecord(target, 'ADMIN_REVOKE')
    const audit = this.recordAudit('session.revoke', target.userId, session.userId, 'allowed')

    return {
      data: {
        session: revoked,
        audit,
        invariant: 'session revocation is tenant-scoped and audited',
      },
    }
  }

  revokeAllSessions(body: { email?: string; keepCurrent?: boolean } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.manageUsers')
    const email = body.email?.trim().toLowerCase()
    if (!email) {
      throw new UnprocessableEntityException('Email is required for revoke-all')
    }
    const keepCurrent = body.keepCurrent ?? true
    const revokedSessions: AuthSession[] = []
    this.sessions = this.sessions.map((item) => {
      const shouldKeepCurrent = keepCurrent && item.id === session.id
      if (
        item.organizationId !== session.organizationId ||
        item.email.toLowerCase() !== email ||
        item.status !== 'ACTIVE' ||
        shouldKeepCurrent
      ) {
        return item
      }
      const revoked = this.revokeSessionShape(item, 'REVOKE_ALL')
      revokedSessions.push(revoked)
      return revoked
    })
    const audit = this.recordAudit('session.revokeAll', email, session.userId, 'allowed')
    return {
      data: {
        revokedSessions,
        audit,
        invariant: 'revoke-all is tenant-scoped and can keep the current admin session active',
      },
    }
  }

  touchSession(id: string) {
    const session = this.currentSession()
    const target = this.sessions.find((item) => item.id === id && item.organizationId === session.organizationId)
    if (!target) {
      throw new NotFoundException(`Session ${id} was not found`)
    }
    if (target.email !== session.email) {
      this.requirePermission(session.role, 'security.sessions.manage')
    }
    if (target.status !== 'ACTIVE') {
      throw new UnprocessableEntityException('Only active sessions can extend idle timeout')
    }

    const now = new Date()
    const touched = {
      ...target,
      lastSeenAt: now.toISOString(),
      idleExpiresAt: new Date(now.getTime() + tenantSecurityPolicy.idleTimeoutMinutes * 60_000).toISOString(),
    }
    this.sessions = this.sessions.map((item) => (item.id === id ? touched : item))
    const audit = this.recordAudit('session.touch', target.userId, session.userId, 'allowed')
    return {
      data: {
        session: touched,
        audit,
        invariant: 'session activity only extends idle timeout, never absolute expiry',
      },
    }
  }

  logout() {
    const session = this.currentSession()
    const revoked = this.revokeSessionRecord(session, 'AUTH_LOGOUT')
    const audit = this.recordAudit('auth.logout', session.userId, 'api:auth', 'allowed')
    return {
      data: {
        session: revoked,
        audit,
        invariant: 'logout revokes the current active session',
      },
    }
  }

  permissionMatrix() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.manageUsers')
    const rolePolicyRows = this.organizationRolePolicies()
    return {
      data: {
        permissionCatalog: this.organizationPermissionCatalog(),
        rolePolicies: rolePolicyRows,
        matrix: this.buildPermissionMatrix(rolePolicyRows),
        invariant: 'permission decisions are evaluated server-side from role policy records',
      },
    }
  }

  setRolePermissions(role: string, permissions: string[]) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.manageUsers')
    const normalizedRole = decodeURIComponent(role).trim()
    const target = this.rolePolicyRecords.find(
      (item) => item.role === normalizedRole && item.scope === 'organization',
    )
    if (!target) {
      throw new NotFoundException(`Role ${normalizedRole} was not found`)
    }

    const allowedPermissionKeys = new Set(this.organizationPermissionCatalog().map((permission) => permission.key))
    const requested = new Set(permissions)
    const unknownPermissions = [...requested].filter((permission) => !allowedPermissionKeys.has(permission))
    if (unknownPermissions.length > 0) {
      throw new UnprocessableEntityException(`Unknown organization permissions: ${unknownPermissions.join(', ')}`)
    }

    const mandatoryOwnerPermissions = ['security.manageUsers', 'security.viewAuditLog', 'security.sessions.manage']
    if (target.role === 'Owner' && mandatoryOwnerPermissions.some((permission) => !requested.has(permission))) {
      throw new UnprocessableEntityException('Owner role must keep core security administration permissions')
    }
    if (target.role === session.role && !requested.has('security.manageUsers')) {
      throw new UnprocessableEntityException('Current administrator cannot remove their own manage-users permission')
    }

    const orderedPermissions = this.organizationPermissionCatalog()
      .map((permission) => permission.key)
      .filter((permission) => requested.has(permission))
    const updatedPolicy = { ...target, permissions: orderedPermissions }
    this.rolePolicyRecords = this.rolePolicyRecords.map((policy) =>
      policy.role === target.role && policy.scope === target.scope ? updatedPolicy : policy,
    )
    const audit = this.recordAudit('role.permissions.update', target.role, session.userId, 'allowed')

    return {
      data: {
        rolePolicy: updatedPolicy,
        permissionCatalog: this.organizationPermissionCatalog(),
        matrix: this.buildPermissionMatrix(this.organizationRolePolicies()),
        audit,
        invariant: 'role permission updates are tenant-scoped, validated against catalog, and audited',
      },
    }
  }

  tenantProbe(resourceOrganizationId: string) {
    const session = this.currentSession()
    const allowed = tenantScopeAllows(session.organizationId, resourceOrganizationId)
    this.recordAudit('security.tenantProbe', resourceOrganizationId, session.userId, allowed ? 'allowed' : 'blocked')
    if (!allowed) {
      throw new ForbiddenException('Tenant guard blocked cross-organization access')
    }
    return { data: { allowed, organizationId: session.organizationId, resourceOrganizationId } }
  }

  permissionProbe(permission: string, role = 'Viewer') {
    const decision = this.permissionDecision(role, permission)
    this.recordAudit('security.permissionProbe', permission, role, decision.allowed ? 'allowed' : 'blocked')
    if (!decision.knownRole) {
      throw new NotFoundException(`Role ${role} was not found`)
    }
    if (!decision.knownPermission) {
      throw new UnprocessableEntityException(`Permission ${permission} is not in the catalog`)
    }
    if (!decision.allowed) {
      throw new ForbiddenException(`Role ${role} cannot perform ${permission}`)
    }
    return { data: decision }
  }

  settings() {
    return { data: this.settingsRecord }
  }

  updateSettings(patch: Partial<TenantSettingsRecord>) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'customization.manage')
    this.settingsRecord = {
      ...this.settingsRecord,
      ...patch,
      organizationId: this.settingsRecord.organizationId,
    }
    const audit = this.recordAudit('customization.settings.update', this.settingsRecord.organizationId, session.userId, 'allowed')
    return { data: { settings: this.settingsRecord, audit, invariant: 'tenant settings update by config, not forked code' } }
  }

  customizationConsole() {
    return {
      data: {
        settings: this.settingsRecord,
        featureFlags: this.flagRecords,
        numberingSequences: this.sequences,
        customFields: this.customFieldRecords,
        branding: this.brandingRecord,
        audit: this.auditEvents
          .filter((event) => event.action.startsWith('customization.'))
          .slice(0, 8),
        invariant: 'tenant customization is config-driven and audit logged',
      },
    }
  }

  updateFeatureFlag(key: string, enabled: boolean) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'customization.manage')
    const flag = this.flagRecords.find((item) => item.key === key)
    if (!flag) {
      throw new NotFoundException(`Feature flag ${key} was not found`)
    }
    const updated = { ...flag, enabled }
    this.flagRecords = this.flagRecords.map((item) => (item.key === key ? updated : item))
    const audit = this.recordAudit('customization.featureFlag.update', key, session.userId, 'allowed')
    return { data: { featureFlag: updated, audit, invariant: 'feature flags change tenant behavior without code forks' } }
  }

  updateNumberingSequence(key: string, patch: Partial<NumberingSequenceRecord>) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'customization.manage')
    const sequence = this.sequences.find((item) => item.key === key)
    if (!sequence) {
      throw new NotFoundException(`Numbering sequence ${key} was not found`)
    }
    const pattern = typeof patch.pattern === 'string' && patch.pattern.trim() ? patch.pattern.trim() : sequence.pattern
    if (!pattern.includes('#')) {
      throw new UnprocessableEntityException('Numbering pattern must include at least one # placeholder')
    }
    const nextValue = Number.isFinite(Number(patch.nextValue)) ? Number(patch.nextValue) : sequence.nextValue
    if (nextValue < sequence.nextValue) {
      throw new UnprocessableEntityException('Numbering next value cannot move backwards')
    }
    const updated = {
      ...sequence,
      pattern,
      nextValue: Math.floor(nextValue),
      scope: patch.scope === 'organization' || patch.scope === 'brand' ? patch.scope : sequence.scope,
    }
    this.sequences = this.sequences.map((item) => (item.key === key ? updated : item))
    const audit = this.recordAudit('customization.sequence.update', key, session.userId, 'allowed')
    return {
      data: {
        sequence: updated,
        preview: formatSequenceValue(updated),
        audit,
        invariant: 'numbering sequence updates preserve monotonic next values',
      },
    }
  }

  previewNumber(key: string) {
    const sequence = this.sequences.find((item) => item.key === key)
    if (!sequence) {
      throw new NotFoundException(`Numbering sequence ${key} was not found`)
    }
    return { data: { key, value: formatSequenceValue(sequence), nextValue: sequence.nextValue } }
  }

  createCustomField(body: Partial<CustomFieldDefinition>) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'customization.manage')
    const entity = body.entity ?? 'material'
    if (!['material', 'formula', 'lot', 'document', 'supplier', 'order'].includes(entity)) {
      throw new UnprocessableEntityException('Custom field entity is not supported')
    }
    const label = body.label?.trim()
    if (!label) {
      throw new UnprocessableEntityException('Custom field label is required')
    }
    const key = (body.key?.trim() || label)
      .replace(/[^a-z0-9 ]/gi, '')
      .trim()
      .replace(/\s+/g, '_')
      .toLowerCase()
    if (!key) {
      throw new UnprocessableEntityException('Custom field key is required')
    }
    const duplicate = this.customFieldRecords.some(
      (item) => item.entity === entity && item.key.toLowerCase() === key.toLowerCase(),
    )
    if (duplicate) {
      throw new UnprocessableEntityException('Custom field key already exists on this entity')
    }
    const fieldType = ['text', 'number', 'select', 'date', 'boolean'].includes(body.fieldType ?? '')
      ? body.fieldType!
      : 'text'
    const field: CustomFieldDefinition = {
      id: `CF-${entity.toUpperCase()}-${String(this.customFieldRecords.length + 1).padStart(4, '0')}`,
      entity,
      key,
      label,
      fieldType,
      required: Boolean(body.required),
      options: fieldType === 'select' ? body.options?.filter(Boolean) ?? [] : [],
      status: 'ACTIVE',
    }
    this.customFieldRecords = [field, ...this.customFieldRecords]
    const audit = this.recordAudit('customization.customField.create', field.id, session.userId, 'allowed')
    return { data: { customField: field, audit, invariant: 'custom fields extend tenant data without schema forks' } }
  }

  updateBranding(patch: Partial<BrandingConfig>) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'customization.manage')
    const accentColor = patch.accentColor?.trim() ?? this.brandingRecord.accentColor
    if (!/^#[0-9a-f]{6}$/i.test(accentColor)) {
      throw new UnprocessableEntityException('Accent color must be a hex color like #4d9bff')
    }
    this.brandingRecord = {
      ...this.brandingRecord,
      ...patch,
      organizationId: this.brandingRecord.organizationId,
      accentColor,
      logoMode: patch.logoMode === 'monogram' || patch.logoMode === 'wordmark' ? patch.logoMode : this.brandingRecord.logoMode,
    }
    const audit = this.recordAudit('customization.branding.update', this.brandingRecord.organizationId, session.userId, 'allowed')
    return { data: { branding: this.brandingRecord, audit, invariant: 'branding changes are tenant config only' } }
  }

  featureFlags() {
    return { data: this.flagRecords }
  }

  numberingSequences() {
    return { data: this.sequences }
  }

  nextNumber(key: string) {
    const sequence = this.sequences.find((item) => item.key === key)
    if (!sequence) {
      throw new NotFoundException(`Numbering sequence ${key} was not found`)
    }
    const value = formatSequenceValue(sequence)
    this.sequences = this.sequences.map((item) =>
      item.key === key ? { ...item, nextValue: item.nextValue + 1 } : item,
    )
    this.recordAudit('customization.sequence.next', key, 'api:owner', 'allowed')
    return { data: { key, value, invariant: 'numbering increments through a single sequence service' } }
  }

  documents() {
    return { data: this.documentRecords }
  }

  documentComplianceDashboard() {
    return {
      data: documentComplianceDashboard(
        this.documentRecords,
        this.materialRecords,
        this.lots,
        this.formulaRecords,
      ),
    }
  }

  generateDocument(body: GenerateDocumentBody) {
    const type = this.normalizeGeneratedDocumentType(body.type)
    const linkedTo = body.linkedTo?.trim()
    if (!linkedTo) {
      throw new UnprocessableEntityException('Document linkedTo target is required')
    }

    const target = this.documentGenerationTarget(type, linkedTo)
    const existingCount = this.documentRecords.filter(
      (document) => document.type === type && document.linkedTo === linkedTo,
    ).length
    const timestamp = new Date()
    const issueDate = timestamp.toISOString().slice(0, 10)
    const expiresAt =
      type === 'CoA' || type === 'Finished Product SDS'
        ? new Date(timestamp.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : undefined
    const id = `DOC-GEN-${String(this.documentRecords.length + existingCount + 1).padStart(4, '0')}`
    const storageType = type.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const document: DocumentRecord = {
      id,
      type,
      title: `${target.label} ${type}`,
      linkedTo,
      version: `v${existingCount + 1}`,
      sensitivity: target.sensitivity,
      status: 'REVIEW_REQUIRED',
      issueDate,
      expiresAt,
      lastAccessed: timestamp.toISOString(),
      downloads: 0,
      storageKey: `org-nxl/generated/${target.scope}/${linkedTo}/${storageType}-v${existingCount + 1}.pdf`,
      mimeType: 'application/pdf',
      sizeKb: target.sizeKb,
      checksum: this.documentChecksum(`${type}:${linkedTo}:${existingCount + 1}:${issueDate}`),
      owner: 'Compliance',
      generatedFrom: target.generatedFrom,
    }
    this.documentRecords = [document, ...this.documentRecords]
    const audit = this.recordAudit('document.generate', document.id, body.actor?.trim() || 'api:compliance', 'review')

    return {
      data: {
        document,
        audit,
        dashboard: documentComplianceDashboard(
          this.documentRecords,
          this.materialRecords,
          this.lots,
          this.formulaRecords,
        ),
        invariant: 'generated documents enter review and stay in the private document workflow',
      },
    }
  }

  approveDocument(id: string, body: { actor?: string; note?: string } = {}) {
    const document = this.documentRecords.find((item) => item.id === id)
    if (!document) {
      throw new NotFoundException(`Document ${id} was not found`)
    }
    if (document.status !== 'REVIEW_REQUIRED') {
      throw new UnprocessableEntityException('Only review-required documents can be approved')
    }

    const approvedDocument: DocumentRecord = {
      ...document,
      status: 'APPROVED',
      lastAccessed: new Date().toISOString(),
    }
    this.documentRecords = this.documentRecords.map((item) => (item.id === id ? approvedDocument : item))
    const audit = this.recordAudit('document.approve', id, body.actor?.trim() || 'api:compliance', 'allowed')

    return {
      data: {
        document: approvedDocument,
        audit,
        dashboard: documentComplianceDashboard(
          this.documentRecords,
          this.materialRecords,
          this.lots,
          this.formulaRecords,
        ),
        invariant: 'approval moves generated documents out of review before external share',
      },
    }
  }

  shareDocument(id: string, body: { recipient?: string; actor?: string } = {}) {
    const document = this.documentRecords.find((item) => item.id === id)
    if (!document) {
      throw new NotFoundException(`Document ${id} was not found`)
    }
    if (document.status === 'REVIEW_REQUIRED') {
      throw new UnprocessableEntityException('Review-required documents must be approved before external sharing')
    }
    const recipient = body.recipient?.trim().toLowerCase()
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      throw new UnprocessableEntityException('A valid external recipient email is required')
    }

    const shareLink: DocumentShareLink = createDocumentShareLink(document, recipient)
    const sharedDocument: DocumentRecord = {
      ...document,
      status: 'SHARED',
      lastAccessed: new Date().toISOString(),
    }
    this.documentRecords = this.documentRecords.map((item) => (item.id === id ? sharedDocument : item))
    const audit = this.recordAudit('document.externalShare', id, body.actor?.trim() || 'api:compliance', 'review')

    return {
      data: {
        document: sharedDocument,
        shareLink,
        audit,
        dashboard: documentComplianceDashboard(
          this.documentRecords,
          this.materialRecords,
          this.lots,
          this.formulaRecords,
        ),
        invariant: 'external share link is tenant-scoped, time-boxed, and audit-reviewed',
      },
    }
  }

  documentDownloadAudit() {
    return {
      data: this.auditEvents.filter((event) =>
        ['document.download', 'document.generate', 'document.approve', 'document.externalShare'].includes(event.action),
      ),
    }
  }

  requestDocumentSignedUrl(
    id: string,
    context: { actor?: string; permissions?: string[]; ip?: string } = {},
  ) {
    const document = this.documentRecords.find((item) => item.id === id)
    if (!document) {
      throw new NotFoundException(`Document ${id} was not found`)
    }

    const actor = context.actor ?? 'api:compliance'
    const permissions = context.permissions ?? ['documents.download']
    const allowed = canDownloadDocument(document, permissions)
    const audit = this.recordDocumentDownloadAudit(document, actor, allowed ? 'allowed' : 'blocked')

    if (!allowed) {
      throw new ForbiddenException({
        message: 'Document download permission denied',
        requiredPermissions: documentRequiredPermissions(document),
        audit,
      })
    }

    const signedUrl = createSignedDocumentUrl(document)
    const updatedDocument = {
      ...document,
      downloads: document.downloads + 1,
      lastAccessed: new Date().toISOString(),
    }
    this.documentRecords = this.documentRecords.map((item) => (item.id === id ? updatedDocument : item))

    return {
      data: {
        document: updatedDocument,
        signedUrl,
        audit,
        invariant: 'permission checked before signing; private object URL never exposed',
      },
    }
  }

  labUsagePlan(formulaId: string, grams: number) {
    const formula = this.formulaRecords.find((item) => item.id === formulaId)
    if (!formula) {
      throw new NotFoundException(`Formula ${formulaId} was not found`)
    }
    if (!Number.isFinite(grams) || grams <= 0) {
      throw new UnprocessableEntityException('Lab usage grams must be greater than 0')
    }
    const leaves = resolveFormulaWithCatalog(formulaId, this.formulaRecords, this.materialRecords)
    const plan = planLabUsage(leaves, this.lots, grams, formula.targetGrams)
    return {
      data: {
        formulaId,
        formulaCode: formula.code,
        grams,
        allocations: plan.allocations,
        shortfalls: plan.shortfalls,
        canCommit: plan.shortfalls.length === 0,
      },
    }
  }

  labUsageHistory() {
    return {
      data: {
        usages: this.usageHistory,
        invariant: 'lab usage history links formula, actual weighing evidence, lots, movements, and reversal evidence',
      },
    }
  }

  labUsageDetail(id: string) {
    const usage = this.usageHistory.find((item) => item.id === id)
    if (!usage) {
      throw new NotFoundException(`Lab usage ${id} was not found`)
    }

    return {
      data: {
        usage,
        movements: this.movements.filter((movement) => movement.ref === usage.id),
        invariant: 'lab usage detail is audit-critical and keeps original OUT movements visible after reversal',
      },
    }
  }

  recordLabWeighingSession(formulaId: string, grams: number, options: LabWeighingOptions = {}) {
    const formula = this.formulaRecords.find((item) => item.id === formulaId)
    if (!formula) {
      throw new NotFoundException(`Formula ${formulaId} was not found`)
    }
    const plan = this.labUsagePlan(formulaId, grams).data
    if (!plan.canCommit) {
      throw new UnprocessableEntityException({
        message: 'Lab usage cannot be committed while shortfalls exist',
        shortfalls: plan.shortfalls,
      })
    }

    const tolerancePercent = Number(options.tolerancePercent ?? 2)
    if (!Number.isFinite(tolerancePercent) || tolerancePercent < 0) {
      throw new UnprocessableEntityException('Weighing tolerancePercent must be 0 or greater')
    }

    const remainingAvailableByLot = new Map(
      this.lots.map((lot) => [lot.id, Math.max(0, lot.quantityGrams - lot.reservedGrams)]),
    )
    const timestamp = new Date().toISOString()
    const lines = plan.allocations.map((allocation) => {
      const actualInput = options.actuals?.find(
        (item) =>
          item.lotId === allocation.lotId &&
          (item.materialId === undefined || item.materialId === allocation.materialId),
      )
      const actualGrams = Number(actualInput?.actualGrams ?? allocation.allocatedGrams)
      if (!Number.isFinite(actualGrams) || actualGrams <= 0) {
        throw new UnprocessableEntityException('Actual weighed grams must be greater than 0')
      }

      const available = remainingAvailableByLot.get(allocation.lotId) ?? 0
      if (actualGrams - available > 0.0001) {
        throw new UnprocessableEntityException({
          message: 'Actual weighed grams exceed available lot stock',
          lotId: allocation.lotId,
          availableGrams: available,
          actualGrams,
        })
      }
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
        withinTolerance: deviationPercent <= tolerancePercent + 0.0001,
      }
    })
    const weighingSession: LabWeighingSession = {
      id: `WGH-API-${String(this.usageHistory.length + 1).padStart(4, '0')}`,
      formulaId,
      formulaCode: formula.code,
      targetBatchGrams: grams,
      tolerancePercent,
      operator: options.operator?.trim() || 'api:perfumer',
      status: lines.every((line) => line.withinTolerance) ? 'READY' : 'NEEDS_REVIEW',
      lines,
      createdAt: timestamp,
    }

    return {
      data: {
        weighingSession,
        canCommit: weighingSession.status === 'READY',
        invariant: 'weighing session validates actual grams before movement creation',
      },
    }
  }

  commitLabUsage(formulaId: string, grams: number, options: LabWeighingOptions = {}) {
    const formula = this.formulaRecords.find((item) => item.id === formulaId)
    if (!formula) {
      throw new NotFoundException(`Formula ${formulaId} was not found`)
    }
    const plan = this.labUsagePlan(formulaId, grams).data
    const weighingSession = this.recordLabWeighingSession(formulaId, grams, options).data.weighingSession
    if (weighingSession.status !== 'READY') {
      throw new UnprocessableEntityException({
        message: 'Lab usage cannot be committed while actual weights need review',
        weighingSession,
      })
    }

    const usageId = `LAB-API-${String(this.usageHistory.length + 1).padStart(4, '0')}`
    const timestamp = new Date().toISOString()
    const lotMap = new Map(this.lots.map((lot) => [lot.id, { ...lot }]))
    const createdMovements: InventoryMovement[] = []
    const actualAllocations: Allocation[] = []

    plan.allocations.forEach((allocation, index) => {
      const lot = lotMap.get(allocation.lotId)
      const line = weighingSession.lines[index]
      if (!lot) {
        return
      }
      const actualGrams = line?.actualGrams ?? allocation.allocatedGrams
      lot.quantityGrams = Math.max(0, lot.quantityGrams - actualGrams)
      actualAllocations.push({
        ...allocation,
        allocatedGrams: actualGrams,
        balanceAfter: lot.quantityGrams,
      })
      createdMovements.push({
        id: `MOV-API-${usageId}-${index + 1}`,
        at: timestamp,
        type: 'LAB_CONSUMPTION',
        direction: 'OUT',
        materialId: allocation.materialId,
        lotId: allocation.lotId,
        quantityGrams: actualGrams,
        balanceAfter: lot.quantityGrams,
        ref: usageId,
        actor: weighingSession.operator,
      })
    })

    this.lots = Array.from(lotMap.values())
    this.movements = [...createdMovements, ...this.movements]
    const usage: LabUsageRecord = {
      id: usageId,
      formulaId,
      formulaCode: formula.code,
      grams,
      batchGrams: grams,
      status: 'COMMITTED',
      purpose: this.normalizeLabUsagePurpose(options.purpose),
      projectCode: options.projectCode?.trim() || undefined,
      sampleCode: options.sampleCode?.trim() || undefined,
      qcLink: options.qcLink?.trim() || undefined,
      allocations: actualAllocations,
      weighingSession: { ...weighingSession, id: `WGH-${usageId}`, createdAt: timestamp },
      createdAt: timestamp,
    }
    this.usageHistory = [usage, ...this.usageHistory]

    return {
      data: {
        usage,
        movements: createdMovements,
        lots: this.lots,
        usageHistory: this.usageHistory,
        message: `${usageId} committed ${formatGrams(
          weighingSession.lines.reduce((sum, line) => sum + line.actualGrams, 0),
        )} actual lab usage using immutable OUT movements`,
        invariant: 'commit creates immutable OUT movements and stores actual weighing evidence',
      },
    }
  }

  reverseLabUsage(id: string, options: LabUsageReverseOptions = {}) {
    const usage = this.usageHistory.find((item) => item.id === id)
    if (!usage) {
      throw new NotFoundException(`Lab usage ${id} was not found`)
    }
    if (usage.status === 'REVERSED') {
      throw new UnprocessableEntityException(`Lab usage ${id} is already reversed`)
    }

    const timestamp = new Date().toISOString()
    const actor = options.actor?.trim() || 'api:lab-manager'
    const reason = options.reason?.trim() || 'Compensation reversal'
    const lotMap = new Map(this.lots.map((lot) => [lot.id, { ...lot }]))
    const reversals: InventoryMovement[] = []

    usage.allocations.forEach((allocation, index) => {
      const lot = lotMap.get(allocation.lotId)
      if (!lot) {
        return
      }
      lot.quantityGrams += allocation.allocatedGrams
      reversals.push({
        id: `MOV-API-REV-${usage.id}-${index + 1}`,
        at: timestamp,
        type: 'REVERSAL',
        direction: 'IN',
        materialId: allocation.materialId,
        lotId: allocation.lotId,
        quantityGrams: allocation.allocatedGrams,
        balanceAfter: lot.quantityGrams,
        ref: usage.id,
        actor,
      })
    })

    this.lots = Array.from(lotMap.values())
    this.movements = [...reversals, ...this.movements]
    let reversedUsage: LabUsageRecord | undefined
    this.usageHistory = this.usageHistory.map((item) =>
      item.id === usage.id
        ? (reversedUsage = {
            ...item,
            status: 'REVERSED',
            reversedAt: timestamp,
            reversalMovements: reversals,
          })
        : item,
    )

    return {
      data: {
        usageId: usage.id,
        usage: reversedUsage ?? { ...usage, status: 'REVERSED', reversedAt: timestamp, reversalMovements: reversals },
        movements: reversals,
        lots: this.lots,
        usageHistory: this.usageHistory,
        reason,
        invariant: 'reverse by compensation; original OUT remains',
      },
    }
  }

  reverseLatestLabUsage(options: LabUsageReverseOptions = {}) {
    const usage = this.usageHistory.find((item) => item.status === 'COMMITTED')
    if (!usage) {
      throw new UnprocessableEntityException('No committed lab usage exists to reverse')
    }

    return this.reverseLabUsage(usage.id, options)
  }

  productionBatches() {
    return { data: this.productionBatchRecords }
  }

  createProductionBatch(formulaId = 'frm-0421', targetGrams = 25) {
    const formula = this.formulaRecords.find((item) => item.id === formulaId)
    if (!formula) {
      throw new NotFoundException(`Formula ${formulaId} was not found`)
    }
    const approvedVersion = this.formulaVersionRecords.some(
      (version) => version.formulaId === formulaId && version.status === 'APPROVED',
    )
    if (!approvedVersion) {
      throw new UnprocessableEntityException(`Formula ${formula.code} must be approved before production`)
    }
    const id = this.nextNumber('batch').data.value
    const batch: ProductionBatchRecord = {
      id,
      formulaId,
      formulaCode: formula.code,
      status: 'WEIGHING',
      targetGrams,
      consumedGrams: 0,
      qcStatus: 'PENDING',
      owner: 'Manufacturing',
    }
    this.productionBatchRecords = [batch, ...this.productionBatchRecords]
    this.recordAudit('production.batch.create', id, 'api:manufacturing', 'allowed')
    return { data: batch }
  }

  consumeProductionBatch(id: string) {
    const batch = this.productionBatchRecords.find((item) => item.id === id)
    if (!batch) {
      throw new NotFoundException(`Production batch ${id} was not found`)
    }
    if (batch.consumedGrams > 0) {
      throw new UnprocessableEntityException(`Production batch ${id} has already consumed inventory`)
    }
    const formula = this.formulaRecords.find((item) => item.id === batch.formulaId)
    if (!formula) {
      throw new NotFoundException(`Formula ${batch.formulaId} was not found`)
    }
    const leaves = resolveFormulaWithCatalog(batch.formulaId, this.formulaRecords, this.materialRecords)
    const plan = planLabUsage(leaves, this.lots, batch.targetGrams, formula.targetGrams)
    if (plan.shortfalls.length > 0) {
      throw new UnprocessableEntityException({ message: 'Production cannot consume while shortfalls exist', shortfalls: plan.shortfalls })
    }

    const lotMap = new Map(this.lots.map((lot) => [lot.id, { ...lot }]))
    const timestamp = new Date().toISOString()
    const movements = plan.allocations.map((allocation, index) => {
      const lot = lotMap.get(allocation.lotId)
      if (!lot) {
        throw new NotFoundException(`Lot ${allocation.lotId} was not found`)
      }
      lot.quantityGrams = Math.max(0, lot.quantityGrams - allocation.allocatedGrams)
      return {
        id: `MOV-PROD-${id}-${index + 1}`,
        at: timestamp,
        type: 'PRODUCTION_CONSUMPTION' as const,
        direction: 'OUT' as const,
        materialId: allocation.materialId,
        lotId: allocation.lotId,
        quantityGrams: allocation.allocatedGrams,
        balanceAfter: lot.quantityGrams,
        ref: id,
        actor: 'api:manufacturing',
      }
    })

    this.lots = Array.from(lotMap.values())
    this.movements = [...movements, ...this.movements]
    this.productionBatchRecords = this.productionBatchRecords.map((item) =>
      item.id === id ? { ...item, consumedGrams: batch.targetGrams, status: 'MACERATION' } : item,
    )
    this.recordAudit('production.batch.consume', id, 'api:manufacturing', 'allowed')
    return { data: { batchId: id, movements, invariant: 'production consumption is separate from lab usage' } }
  }

  qcProductionBatch(id: string, result: 'PASSED' | 'FAILED' = 'PASSED') {
    const batch = this.productionBatchRecords.find((item) => item.id === id)
    if (!batch) {
      throw new NotFoundException(`Production batch ${id} was not found`)
    }
    if (batch.consumedGrams <= 0) {
      throw new UnprocessableEntityException(`Production batch ${id} must consume inventory before QC`)
    }
    const status = result === 'PASSED' ? 'BOTTLING' : 'HOLD'
    this.productionBatchRecords = this.productionBatchRecords.map((item) =>
      item.id === id ? { ...item, qcStatus: result, status } : item,
    )
    this.recordAudit('production.batch.qc', id, 'api:qc', result === 'PASSED' ? 'allowed' : 'review')
    return { data: this.productionBatchRecords.find((item) => item.id === id)! }
  }

  updateProductionBatchStatus(id: string, status: ProductionBatchRecord['status']) {
    const batch = this.productionBatchRecords.find((item) => item.id === id)
    if (!batch) {
      throw new NotFoundException(`Production batch ${id} was not found`)
    }
    if (!productionLifecycleStatuses.includes(status)) {
      throw new UnprocessableEntityException(`Production batch status ${status} is not supported`)
    }
    if (['FILTRATION', 'QC', 'BOTTLING', 'RELEASED'].includes(status) && batch.consumedGrams <= 0) {
      throw new UnprocessableEntityException(`Production batch ${id} must consume inventory before ${status}`)
    }
    if (status === 'RELEASED' && batch.qcStatus !== 'PASSED') {
      throw new UnprocessableEntityException(`Production batch ${id} must pass QC before release`)
    }
    if (status === 'WEIGHING' && batch.consumedGrams > 0) {
      throw new UnprocessableEntityException(`Production batch ${id} cannot return to weighing after consumption`)
    }

    this.productionBatchRecords = this.productionBatchRecords.map((item) =>
      item.id === id ? { ...item, status } : item,
    )
    this.recordAudit('production.batch.status', id, 'api:manufacturing', status === 'HOLD' ? 'review' : 'allowed')
    return {
      data: {
        batch: this.productionBatchRecords.find((item) => item.id === id)!,
        invariant: 'production lifecycle transitions are audited and gated by consumption and QC state',
      },
    }
  }

  suppliers() {
    return { data: this.supplierRecords }
  }

  createSupplier(body: CreateSupplierBody = {}) {
    const name = body.name?.trim()
    const country = body.country?.trim().toUpperCase()
    const contactEmail = body.contactEmail?.trim().toLowerCase()

    if (!name) {
      throw new UnprocessableEntityException('Supplier name is required')
    }
    if (!country || country.length !== 2) {
      throw new UnprocessableEntityException('Supplier country must be a two-letter code')
    }
    if (!contactEmail || !contactEmail.includes('@')) {
      throw new UnprocessableEntityException('Supplier contactEmail is required')
    }
    if (this.supplierRecords.some((supplier) => supplier.name.toLowerCase() === name.toLowerCase())) {
      throw new UnprocessableEntityException(`Supplier ${name} already exists`)
    }
    const leadTimeDays = Math.round(Number(body.leadTimeDays ?? 14))
    if (!Number.isFinite(leadTimeDays) || leadTimeDays <= 0) {
      throw new UnprocessableEntityException('Supplier leadTimeDays must be greater than 0')
    }

    const supplier: SupplierRecord = {
      id: `SUP-${String(this.supplierRecords.length + 8).padStart(3, '0')}`,
      name,
      status: 'review',
      country,
      leadTimeDays,
      contactEmail,
      paymentTerms: body.paymentTerms?.trim() || 'Net 30',
      preferredMaterialIds: (body.preferredMaterialIds ?? []).filter((materialId) =>
        this.materialRecords.some((material) => material.id === materialId),
      ),
    }

    this.supplierRecords = [supplier, ...this.supplierRecords]
    const audit = this.recordAudit('procurement.supplier.create', supplier.id, 'api:procurement', 'allowed')
    return {
      data: {
        supplier,
        audit,
        invariant: 'supplier master changes are audited and do not create inventory movement',
      },
    }
  }

  purchaseOrders() {
    return { data: this.purchaseOrderRecords }
  }

  createPurchaseOrder(body: CreatePurchaseOrderBody = {}) {
    const supplier = this.supplierRecords.find((item) => item.id === body.supplierId)
    if (!supplier) {
      throw new NotFoundException(`Supplier ${body.supplierId ?? 'unknown'} was not found`)
    }
    const material = this.materialRecords.find((item) => item.id === body.materialId)
    if (!material) {
      throw new NotFoundException(`Material ${body.materialId ?? 'unknown'} was not found`)
    }
    const quantityGrams = Number(body.quantityGrams ?? 0)
    if (!Number.isFinite(quantityGrams) || quantityGrams <= 0) {
      throw new UnprocessableEntityException('Purchase order quantityGrams must be greater than 0')
    }
    const unitCost = Number(body.unitCost ?? material.costPerGram)
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      throw new UnprocessableEntityException('Purchase order unitCost must be greater than 0')
    }

    const id = this.nextNumber('purchaseOrder').data.value
    const expectedDate =
      body.expectedDate?.trim() ||
      new Date(Date.now() + supplier.leadTimeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const purchaseOrder: PurchaseOrderRecord = {
      id,
      supplierId: supplier.id,
      materialId: material.id,
      quantityGrams,
      receivedGrams: 0,
      status: 'DRAFT',
      expectedDate,
      unitCost,
      currency: body.currency?.trim().toUpperCase() || 'USD',
      createdAt: new Date().toISOString(),
    }

    this.purchaseOrderRecords = [purchaseOrder, ...this.purchaseOrderRecords]
    const audit = this.recordAudit('procurement.po.create', id, 'api:procurement', 'allowed')
    return {
      data: {
        purchaseOrder,
        audit,
        invariant: 'purchase order draft creation does not reserve or move inventory',
      },
    }
  }

  updatePurchaseOrderStatus(id: string, status: PurchaseOrderRecord['status'] = 'SENT') {
    const order = this.purchaseOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Purchase order ${id} was not found`)
    }
    if (!['DRAFT', 'SENT', 'PARTIAL', 'RECEIVED'].includes(status)) {
      throw new UnprocessableEntityException(`Purchase order status ${status} is not supported`)
    }
    if (order.status === 'RECEIVED' && status !== 'RECEIVED') {
      throw new UnprocessableEntityException(`Purchase order ${id} is already received`)
    }
    if (status === 'RECEIVED' && order.receivedGrams < order.quantityGrams) {
      throw new UnprocessableEntityException(`Purchase order ${id} must be fully received through goods receipt`)
    }
    if (status === 'DRAFT' && order.receivedGrams > 0) {
      throw new UnprocessableEntityException(`Purchase order ${id} cannot return to draft after receipt`)
    }

    this.purchaseOrderRecords = this.purchaseOrderRecords.map((item) => (item.id === id ? { ...item, status } : item))
    const audit = this.recordAudit('procurement.po.status', id, 'api:procurement', status === 'PARTIAL' ? 'review' : 'allowed')
    return {
      data: {
        purchaseOrder: this.purchaseOrderRecords.find((item) => item.id === id)!,
        audit,
        invariant: 'purchase order state transitions are audited and separated from stock receipt',
      },
    }
  }

  receivePurchaseOrder(id: string, body: { receivedGrams?: number } = {}) {
    const order = this.purchaseOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Purchase order ${id} was not found`)
    }
    const material = this.materialRecords.find((item) => item.id === order.materialId)
    if (!material) {
      throw new NotFoundException(`Material ${order.materialId} was not found`)
    }
    if (order.status === 'RECEIVED') {
      throw new UnprocessableEntityException(`Purchase order ${id} has already been received`)
    }
    if (order.status === 'DRAFT') {
      throw new UnprocessableEntityException(`Purchase order ${id} must be sent before receiving goods`)
    }
    const remainingGrams = order.quantityGrams - order.receivedGrams
    const receivedGrams = Number(body.receivedGrams ?? remainingGrams)
    if (!Number.isFinite(receivedGrams) || receivedGrams <= 0) {
      throw new UnprocessableEntityException('receivedGrams must be greater than 0')
    }
    if (receivedGrams > remainingGrams) {
      throw new UnprocessableEntityException(`receivedGrams exceeds remaining quantity for ${id}`)
    }

    const totalReceived = order.receivedGrams + receivedGrams
    const receiptIndex = this.movements.filter((movement) => movement.ref === id && movement.type === 'RECEIPT').length + 1
    const lot: InventoryLot = {
      id: `lot-${order.id.toLowerCase()}-${receiptIndex}`,
      materialId: order.materialId,
      lotNumber: `L-${order.id}-${String(receiptIndex).padStart(2, '0')}`,
      quantityGrams: receivedGrams,
      reservedGrams: 0,
      receivedDate: new Date().toISOString().slice(0, 10),
      expiryDate: '2028-12-31',
      qualityStatus: 'APPROVED',
      location: 'Receiving Bay',
      unitCost: order.unitCost,
      supplierLotRef: order.id,
      currency: order.currency,
    }
    const movement: InventoryMovement = {
      id: `MOV-PO-${id}-${receiptIndex}`,
      at: new Date().toISOString(),
      type: 'RECEIPT',
      direction: 'IN',
      materialId: order.materialId,
      lotId: lot.id,
      quantityGrams: receivedGrams,
      balanceAfter: lot.quantityGrams,
      ref: id,
      actor: 'api:procurement',
    }
    const priceSnapshot: PriceHistoryRecord = {
      id: `PRICE-${id}-${receiptIndex}`,
      materialId: order.materialId,
      supplierId: order.supplierId,
      purchaseOrderId: id,
      unitCost: order.unitCost,
      currency: order.currency,
      quantityGrams: receivedGrams,
      capturedAt: movement.at,
      source: 'PO_RECEIPT',
    }
    this.lots = [lot, ...this.lots]
    this.movements = [movement, ...this.movements]
    this.priceHistoryRecords = [priceSnapshot, ...this.priceHistoryRecords]
    this.purchaseOrderRecords = this.purchaseOrderRecords.map((item) =>
      item.id === id
        ? {
            ...item,
            receivedGrams: totalReceived,
            status: totalReceived >= item.quantityGrams ? 'RECEIVED' : 'PARTIAL',
          }
        : item,
    )
    const audit = this.recordAudit('procurement.po.receive', id, 'api:procurement', 'allowed')
    return {
      data: {
        lot,
        movement,
        purchaseOrder: this.purchaseOrderRecords.find((item) => item.id === id)!,
        priceHistory: priceSnapshot,
        audit,
        invariant: 'goods receipt creates lot and IN movement plus immutable price history snapshot',
      },
    }
  }

  materialPriceHistory(materialId: string) {
    if (!this.materialRecords.some((material) => material.id === materialId)) {
      throw new NotFoundException(`Material ${materialId} was not found`)
    }
    return {
      data: this.priceHistoryRecords.filter((record) => record.materialId === materialId),
    }
  }

  catalogSkus() {
    return {
      data: skuAvailability(this.commercialSkuRecords, this.lots, this.materialRecords),
    }
  }

  createCatalogSku(body: CreateCatalogSkuBody = {}) {
    const material = this.materialRecords.find((item) => item.id === body.materialId)
    if (!material) {
      throw new NotFoundException(`Material ${body.materialId ?? 'unknown'} was not found`)
    }
    const name = body.name?.trim()
    if (!name) {
      throw new UnprocessableEntityException('SKU name is required')
    }
    if (this.commercialSkuRecords.some((sku) => sku.name.toLowerCase() === name.toLowerCase())) {
      throw new UnprocessableEntityException(`SKU ${name} already exists`)
    }
    const packSizeGrams = Number(body.packSizeGrams ?? 0)
    if (!Number.isFinite(packSizeGrams) || packSizeGrams <= 0) {
      throw new UnprocessableEntityException('SKU packSizeGrams must be greater than 0')
    }
    const price = Number(body.price ?? 0)
    if (!Number.isFinite(price) || price <= 0) {
      throw new UnprocessableEntityException('SKU price must be greater than 0')
    }
    const moqPacks = Math.round(Number(body.moqPacks ?? 1))
    if (!Number.isFinite(moqPacks) || moqPacks <= 0) {
      throw new UnprocessableEntityException('SKU moqPacks must be greater than 0')
    }
    const tier = body.tier ?? 'Studio'
    if (!['Studio', 'Lab', 'Bulk'].includes(tier)) {
      throw new UnprocessableEntityException(`SKU tier ${tier} is not supported`)
    }

    const sku: CommercialSkuRecord = {
      id: `SKU-${material.id.replace('mat-', '').slice(0, 3).toUpperCase()}-${String(this.commercialSkuRecords.length + 51).padStart(3, '0')}`,
      materialId: material.id,
      name,
      description: body.description?.trim() || `${material.name} commercial pack`,
      packSizeGrams,
      price,
      currency: body.currency?.trim().toUpperCase() || 'USD',
      tier,
      status: 'ACTIVE',
      moqPacks,
      labelTemplate: body.labelTemplate?.trim() || `${this.brandingRecord.displayName} Neutral Pack`,
    }
    this.commercialSkuRecords = [sku, ...this.commercialSkuRecords]
    const audit = this.recordAudit('commerce.sku.create', sku.id, 'api:commerce', 'allowed')
    return {
      data: {
        sku: skuAvailability([sku], this.lots, this.materialRecords)[0],
        audit,
        invariant: 'commerce SKU creation stores no stock; availability is derived from Inventory lots',
      },
    }
  }

  priceLists() {
    return { data: this.priceListRecords }
  }

  createPriceList(body: CreatePriceListBody = {}) {
    const name = body.name?.trim()
    if (!name) {
      throw new UnprocessableEntityException('Price list name is required')
    }
    const customerGroup = body.customerGroup ?? 'Studio'
    if (!['Studio', 'Lab', 'Bulk', 'Contract'].includes(customerGroup)) {
      throw new UnprocessableEntityException(`Customer group ${customerGroup} is not supported`)
    }
    const multiplier = Number(body.multiplier ?? 1)
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new UnprocessableEntityException('Price list multiplier must be greater than 0')
    }

    const priceList: PriceListRecord = {
      id: `PL-${customerGroup.toUpperCase()}-${String(this.priceListRecords.length + 1).padStart(3, '0')}`,
      name,
      customerGroup,
      currency: body.currency?.trim().toUpperCase() || 'USD',
      multiplier,
      sampleEligible: body.sampleEligible ?? customerGroup !== 'Bulk',
      status: 'ACTIVE',
    }
    this.priceListRecords = [priceList, ...this.priceListRecords]
    const audit = this.recordAudit('commerce.price-list.create', priceList.id, 'api:commerce', 'allowed')
    return {
      data: {
        priceList,
        audit,
        invariant: 'price list changes affect quote pricing without mutating inventory',
      },
    }
  }

  quotes() {
    return { data: this.quoteRecords }
  }

  createQuote(body: CreateQuoteBody = {}) {
    const sku = this.commercialSkuRecords.find((item) => item.id === body.skuId)
    if (!sku) {
      throw new NotFoundException(`SKU ${body.skuId ?? 'unknown'} was not found`)
    }
    const customer = body.customer?.trim()
    if (!customer) {
      throw new UnprocessableEntityException('Quote customer is required')
    }
    const customerGroup = body.customerGroup ?? sku.tier
    const priceList =
      this.priceListRecords.find((item) => item.customerGroup === customerGroup && item.status === 'ACTIVE') ??
      this.priceListRecords.find((item) => item.customerGroup === sku.tier && item.status === 'ACTIVE')
    if (!priceList) {
      throw new NotFoundException(`Active price list for ${customerGroup} was not found`)
    }
    const quantityPacks = Math.round(Number(body.quantityPacks ?? 1))
    if (!Number.isFinite(quantityPacks) || quantityPacks <= 0) {
      throw new UnprocessableEntityException('Quote quantityPacks must be greater than 0')
    }
    const availability = skuAvailability([sku], this.lots, this.materialRecords)[0]
    const unitPrice = Number((sku.price * priceList.multiplier).toFixed(2))
    const quote: QuoteRecord = {
      id: `QTE-2026-${String(this.quoteRecords.length + 34).padStart(3, '0')}`,
      skuId: sku.id,
      customer,
      customerGroup,
      quantityPacks,
      unitPrice,
      total: Number((unitPrice * quantityPacks).toFixed(2)),
      currency: priceList.currency,
      status: quantityPacks <= availability.canSellPacks ? 'SENT' : 'REVIEW',
      createdAt: new Date().toISOString(),
    }
    this.quoteRecords = [quote, ...this.quoteRecords]
    const audit = this.recordAudit('commerce.quote.create', quote.id, 'api:commerce', quote.status === 'REVIEW' ? 'review' : 'allowed')
    return {
      data: {
        quote,
        availability,
        audit,
        invariant: 'quote creation reads SKU availability from inventory and creates no reservation or movement',
      },
    }
  }

  samples() {
    return { data: this.sampleRequestRecords }
  }

  requestSample(body: CreateSampleRequestBody = {}) {
    const sku = this.commercialSkuRecords.find((item) => item.id === body.skuId)
    if (!sku) {
      throw new NotFoundException(`SKU ${body.skuId ?? 'unknown'} was not found`)
    }
    const customer = body.customer?.trim()
    if (!customer) {
      throw new UnprocessableEntityException('Sample customer is required')
    }
    const packs = Math.round(Number(body.packs ?? 1))
    if (!Number.isFinite(packs) || packs <= 0 || packs > 2) {
      throw new UnprocessableEntityException('Sample packs must be between 1 and 2')
    }
    const priceList = this.priceListRecords.find((item) => item.customerGroup === sku.tier && item.status === 'ACTIVE')
    if (priceList && !priceList.sampleEligible) {
      throw new UnprocessableEntityException(`Samples are not enabled for ${sku.tier} price list`)
    }
    const availability = skuAvailability([sku], this.lots, this.materialRecords)[0]
    if (packs > availability.canSellPacks) {
      throw new UnprocessableEntityException(`Sample request exceeds available packs for ${sku.id}`)
    }

    const sample: SampleRequestRecord = {
      id: `SMP-2026-${String(this.sampleRequestRecords.length + 18).padStart(3, '0')}`,
      skuId: sku.id,
      customer,
      packs,
      status: 'REQUESTED',
      createdAt: new Date().toISOString(),
    }
    this.sampleRequestRecords = [sample, ...this.sampleRequestRecords]
    const audit = this.recordAudit('commerce.sample.request', sample.id, 'api:commerce', 'allowed')
    return {
      data: {
        sample,
        availability,
        audit,
        invariant: 'sample request validates inventory-derived availability but does not reserve or move stock',
      },
    }
  }

  orders() {
    return { data: this.salesOrderRecords }
  }

  customers() {
    return { data: this.customerRecords }
  }

  createCustomer(body: CreateCustomerBody = {}) {
    const name = body.name?.trim()
    if (!name) {
      throw new UnprocessableEntityException('Customer name is required')
    }
    const group = body.group ?? 'Studio'
    if (!['Studio', 'Lab', 'Bulk', 'Contract'].includes(group)) {
      throw new UnprocessableEntityException(`Customer group ${group} is not supported`)
    }
    const creditLimit = Number(body.creditLimit ?? 250)
    if (!Number.isFinite(creditLimit) || creditLimit < 0) {
      throw new UnprocessableEntityException('Customer creditLimit must be zero or greater')
    }
    const paymentTerms = body.paymentTerms ?? 'NET_15'
    if (!['NET_15', 'NET_30', 'PREPAID'].includes(paymentTerms)) {
      throw new UnprocessableEntityException(`Payment terms ${paymentTerms} are not supported`)
    }

    const id = `CUS-${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 18).toUpperCase()}`
    const billingAddress: CustomerAddress = {
      id: `ADDR-${id}-BILL`,
      label: body.billingAddress?.label?.trim() || 'Billing',
      line1: body.billingAddress?.line1?.trim() || 'Billing address pending',
      city: body.billingAddress?.city?.trim() || 'TBD',
      country: body.billingAddress?.country?.trim().toUpperCase() || 'US',
    }
    const shippingAddress: CustomerAddress = {
      id: `ADDR-${id}-SHIP`,
      label: body.shippingAddress?.label?.trim() || 'Shipping',
      line1: body.shippingAddress?.line1?.trim() || billingAddress.line1,
      city: body.shippingAddress?.city?.trim() || billingAddress.city,
      country: body.shippingAddress?.country?.trim().toUpperCase() || billingAddress.country,
    }
    const customer: CustomerRecord = {
      id: this.customerRecords.some((record) => record.id === id) ? `${id}-${this.customerRecords.length + 1}` : id,
      name,
      group,
      creditLimit,
      paymentTerms,
      contactEmail: body.contactEmail?.trim() || `orders+${id.toLowerCase()}@example.com`,
      billingAddress,
      shippingAddress,
      status: 'ACTIVE',
    }
    this.customerRecords = [customer, ...this.customerRecords]
    const audit = this.recordAudit('orders.customer.create', customer.id, 'api:fulfillment', 'allowed')
    return {
      data: {
        customer,
        audit,
        invariant: 'customer profile stores credit, terms, addresses, and contacts without touching inventory',
      },
    }
  }

  createOrder(body: CreateSalesOrderBody = {}) {
    const sku = this.commercialSkuRecords.find((item) => item.id === body.skuId)
    if (!sku) {
      throw new NotFoundException(`SKU ${body.skuId ?? 'unknown'} was not found`)
    }
    if (sku.status !== 'ACTIVE') {
      throw new UnprocessableEntityException(`SKU ${sku.id} is not active`)
    }
    const customer = this.customerRecords.find((item) => item.id === body.customerId)
    if (!customer) {
      throw new NotFoundException(`Customer ${body.customerId ?? 'unknown'} was not found`)
    }
    const quantity = Math.round(Number(body.quantity ?? 1))
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new UnprocessableEntityException('Order quantity must be greater than 0')
    }
    const discountPercent = Math.max(0, Math.min(90, Number(body.discountPercent ?? 0)))
    const taxPercent = Math.max(0, Math.min(30, Number(body.taxPercent ?? 0)))
    const shippingCost = Math.max(0, Number(body.shippingCost ?? 0))
    const priceList = this.priceListRecords.find(
      (item) => item.customerGroup === customer.group && item.status === 'ACTIVE',
    )
    const unitPrice = Number((sku.price * (priceList?.multiplier ?? 1)).toFixed(2))
    const subtotal = unitPrice * quantity
    const discounted = subtotal * (1 - discountPercent / 100)
    const taxed = discounted * (1 + taxPercent / 100)
    const total = Number((taxed + shippingCost).toFixed(2))
    const order: SalesOrderRecord = {
      id: `SO-2026-${String(this.salesOrderRecords.length + 93).padStart(3, '0')}`,
      skuId: sku.id,
      customerId: customer.id,
      customer: customer.name,
      quantity,
      unitPrice,
      discountPercent,
      taxPercent,
      shippingCost,
      total,
      currency: body.currency?.trim().toUpperCase() || priceList?.currency || sku.currency,
      reservedGrams: 0,
      fulfilledGrams: 0,
      status: customer.status === 'CREDIT_HOLD' || total > customer.creditLimit ? 'HOLD' : 'CONFIRMED',
      reservationAllocations: [],
      documentIds: [],
      createdAt: new Date().toISOString(),
    }
    this.salesOrderRecords = [order, ...this.salesOrderRecords]
    const audit = this.recordAudit('orders.create', order.id, 'api:fulfillment', order.status === 'HOLD' ? 'review' : 'allowed')
    return {
      data: {
        order,
        audit,
        invariant: 'order creation prices SKU packs and performs credit hold checks without reserving or moving stock',
      },
    }
  }

  reserveOrder(id: string) {
    const order = this.salesOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Sales order ${id} was not found`)
    }
    if (!['DRAFT', 'CONFIRMED', 'BACKORDER'].includes(order.status)) {
      throw new UnprocessableEntityException(`Sales order ${id} cannot be reserved from ${order.status}`)
    }
    const sku = this.commercialSkuRecords.find((item) => item.id === order.skuId)
    if (!sku) {
      throw new NotFoundException(`SKU ${order.skuId} was not found`)
    }
    const requiredGrams = orderRequiredGrams(order, this.commercialSkuRecords)
    const allocations = this.pickLotsForMaterial(sku.materialId, requiredGrams)
    const lotMap = new Map(this.lots.map((lot) => [lot.id, { ...lot }]))
    allocations.forEach((allocation) => {
      const lot = lotMap.get(allocation.lotId)
      if (lot) {
        lot.reservedGrams += allocation.allocatedGrams
      }
    })
    this.lots = Array.from(lotMap.values())
    const pickList = this.createOrderDocument(id, 'PICK_LIST', 'READY')
    this.salesOrderRecords = this.salesOrderRecords.map((item) =>
      item.id === id
        ? {
            ...item,
            reservedGrams: requiredGrams,
            status: 'RESERVED',
            reservationAllocations: allocations,
            documentIds: [...(item.documentIds ?? []), pickList.id],
          }
        : item,
    )
    this.recordAudit('orders.reserve', id, 'api:fulfillment', 'allowed')
    return {
      data: {
        orderId: id,
        allocations,
        document: pickList,
        invariant: 'reservation changes reserved stock but creates no InventoryMovement',
      },
    }
  }

  cancelOrder(id: string) {
    const order = this.salesOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Sales order ${id} was not found`)
    }
    if (['FULFILLED', 'SHIPPED', 'DELIVERED', 'INVOICED', 'CLOSED'].includes(order.status)) {
      throw new UnprocessableEntityException(`Sales order ${id} cannot be cancelled from ${order.status}`)
    }
    const allocations = order.reservationAllocations ?? []
    if (allocations.length > 0) {
      const lotMap = new Map(this.lots.map((lot) => [lot.id, { ...lot }]))
      allocations.forEach((allocation) => {
        const lot = lotMap.get(allocation.lotId)
        if (lot) {
          lot.reservedGrams = Math.max(0, lot.reservedGrams - allocation.allocatedGrams)
        }
      })
      this.lots = Array.from(lotMap.values())
    }
    this.salesOrderRecords = this.salesOrderRecords.map((item) =>
      item.id === id
        ? {
            ...item,
            reservedGrams: 0,
            status: 'CANCELLED',
            reservationAllocations: [],
          }
        : item,
    )
    const audit = this.recordAudit('orders.cancel', id, 'api:fulfillment', 'allowed')
    return {
      data: {
        orderId: id,
        releasedAllocations: allocations,
        audit,
        invariant: 'cancellation releases reservation without creating InventoryMovement',
      },
    }
  }

  packOrder(id: string, body: PackOrderBody = {}) {
    const order = this.salesOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Sales order ${id} was not found`)
    }
    if (order.status !== 'RESERVED') {
      throw new UnprocessableEntityException(`Sales order ${id} must be reserved before pack`)
    }
    const allocations = order.reservationAllocations ?? []
    if (allocations.length === 0) {
      throw new UnprocessableEntityException(`Sales order ${id} has no reservation allocation trace`)
    }
    const packingSlip = this.createOrderDocument(id, 'PACKING_SLIP', 'READY')
    const shipment: ShipmentRecord = {
      id: `SHP-2026-${String(this.shipmentRecords.length + 41).padStart(3, '0')}`,
      orderId: id,
      carrier: order.carrier ?? 'DHL',
      trackingNumber: order.trackingNumber ?? 'Pending',
      status: 'PACKED',
      weightGrams: Number(body.weightGrams ?? order.reservedGrams),
      allocations,
    }
    this.shipmentRecords = [shipment, ...this.shipmentRecords]
    this.salesOrderRecords = this.salesOrderRecords.map((item) =>
      item.id === id
        ? {
            ...item,
            status: 'PACKED',
            shipmentId: shipment.id,
            documentIds: [...(item.documentIds ?? []), packingSlip.id],
          }
        : item,
    )
    const audit = this.recordAudit('orders.pack', id, 'api:fulfillment', 'allowed')
    return {
      data: {
        orderId: id,
        shipment,
        document: packingSlip,
        audit,
        invariant: 'pack creates shipment trace and packing slip without moving stock',
      },
    }
  }

  shipOrder(id: string, body: ShipOrderBody = {}) {
    const order = this.salesOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Sales order ${id} was not found`)
    }
    if (order.status !== 'PACKED') {
      throw new UnprocessableEntityException(`Sales order ${id} must be packed before ship`)
    }
    const carrier = body.carrier ?? order.carrier ?? 'DHL'
    if (!['DHL', 'FedEx', 'UPS', 'Pickup'].includes(carrier)) {
      throw new UnprocessableEntityException(`Carrier ${carrier} is not supported`)
    }
    const trackingNumber = body.trackingNumber?.trim() || `${carrier.toUpperCase()}-${id.replace(/\W/g, '')}`
    const shippedAt = new Date().toISOString()
    this.shipmentRecords = this.shipmentRecords.map((shipment) =>
      shipment.id === order.shipmentId
        ? {
            ...shipment,
            carrier,
            trackingNumber,
            status: 'SHIPPED',
            shippedAt,
          }
        : shipment,
    )
    this.salesOrderRecords = this.salesOrderRecords.map((item) =>
      item.id === id
        ? {
            ...item,
            status: 'SHIPPED',
            carrier,
            trackingNumber,
          }
        : item,
    )
    const audit = this.recordAudit('orders.ship', id, 'api:fulfillment', 'allowed')
    return {
      data: {
        orderId: id,
        shipment: this.shipmentRecords.find((shipment) => shipment.id === order.shipmentId),
        audit,
        invariant: 'shipment records carrier and tracking while reserved stock remains untouched until fulfillment',
      },
    }
  }

  fulfillOrder(id: string) {
    const order = this.salesOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Sales order ${id} was not found`)
    }
    if (!['RESERVED', 'PACKED', 'SHIPPED'].includes(order.status)) {
      throw new UnprocessableEntityException(`Sales order ${id} must be reserved before fulfillment`)
    }
    const sku = this.commercialSkuRecords.find((item) => item.id === order.skuId)
    if (!sku) {
      throw new NotFoundException(`SKU ${order.skuId} was not found`)
    }
    const allocations =
      order.reservationAllocations && order.reservationAllocations.length > 0
        ? order.reservationAllocations
        : this.pickLotsForMaterial(sku.materialId, order.reservedGrams, true)
    const lotMap = new Map(this.lots.map((lot) => [lot.id, { ...lot }]))
    const movements: InventoryMovement[] = allocations.map((allocation, index) => {
      const lot = lotMap.get(allocation.lotId)
      if (!lot) {
        throw new NotFoundException(`Lot ${allocation.lotId} was not found`)
      }
      if (lot.reservedGrams + 0.0001 < allocation.allocatedGrams) {
        throw new UnprocessableEntityException(`Lot ${allocation.lotNumber} reservation is below fulfillment allocation`)
      }
      lot.quantityGrams = Math.max(0, lot.quantityGrams - allocation.allocatedGrams)
      lot.reservedGrams = Math.max(0, lot.reservedGrams - allocation.allocatedGrams)
      return {
        id: `MOV-FUL-${id}-${index + 1}`,
        at: new Date().toISOString(),
        type: 'FULFILLMENT',
        direction: 'OUT',
        materialId: allocation.materialId,
        lotId: allocation.lotId,
        quantityGrams: allocation.allocatedGrams,
        balanceAfter: lot.quantityGrams,
        ref: id,
        actor: 'api:fulfillment',
      }
    })
    this.lots = Array.from(lotMap.values())
    this.movements = [...movements, ...this.movements]
    const invoice = this.createOrderDocument(id, 'INVOICE', 'READY')
    const coa = this.createOrderDocument(id, 'COA', 'READY')
    if (order.shipmentId) {
      this.shipmentRecords = this.shipmentRecords.map((shipment) =>
        shipment.id === order.shipmentId
          ? {
              ...shipment,
              status: 'SHIPPED',
              shippedAt: shipment.shippedAt ?? new Date().toISOString(),
              allocations,
            }
          : shipment,
      )
    }
    this.salesOrderRecords = this.salesOrderRecords.map((item) =>
      item.id === id
        ? {
            ...item,
            fulfilledGrams: order.reservedGrams,
            reservedGrams: 0,
            status: 'FULFILLED',
            reservationAllocations: allocations,
            documentIds: [...(item.documentIds ?? []), invoice.id, coa.id],
          }
        : item,
    )
    this.recordAudit('orders.fulfill', id, 'api:fulfillment', 'allowed')
    return {
      data: {
        orderId: id,
        movements,
        documents: [invoice, coa],
        shipment: order.shipmentId ? this.shipmentRecords.find((shipment) => shipment.id === order.shipmentId) : undefined,
        invariant: 'fulfillment creates OUT movement after reservation and preserves lot traceability on shipment',
      },
    }
  }

  shipments() {
    return { data: this.shipmentRecords }
  }

  orderDocuments() {
    return { data: this.orderDocumentRecords }
  }

  costingOverview() {
    return {
      data: costingOverview(
        'frm-0421',
        this.lots,
        this.movements,
        this.formulaRecords,
        this.materialRecords,
        this.commercialSkuRecords,
        this.priceHistoryRecords,
      ),
    }
  }

  costingFormula(id: string) {
    if (!this.formulaRecords.some((formula) => formula.id === id)) {
      throw new NotFoundException(`Formula ${id} was not found`)
    }
    return {
      data: formulaCostReport(id, this.formulaRecords, this.materialRecords, this.lots, this.priceHistoryRecords),
    }
  }

  costingBatch(id: string) {
    if (!this.productionBatchRecords.some((batch) => batch.id === id)) {
      throw new NotFoundException(`Production batch ${id} was not found`)
    }
    return {
      data: batchCostReport(
        id,
        this.productionBatchRecords,
        this.formulaRecords,
        this.materialRecords,
        this.lots,
        this.priceHistoryRecords,
      ),
    }
  }

  costingSku(id: string) {
    const report = skuMarginReports(
      this.commercialSkuRecords,
      this.materialRecords,
      this.lots,
      this.priceHistoryRecords,
    ).find((item) => item.skuId === id)
    if (!report) {
      throw new NotFoundException(`SKU ${id} was not found`)
    }
    return { data: report }
  }

  costingValuation() {
    return { data: inventoryValuationReport(this.lots, this.materialRecords, this.priceHistoryRecords) }
  }

  analyticsDashboard() {
    return {
      data: analyticsDashboardReport(
        this.lots,
        this.movements,
        this.materialRecords,
        this.priceHistoryRecords,
        this.scheduledReportRecords,
      ),
    }
  }

  analyticsBurnRate() {
    return { data: analyticsBurnRate(this.movements, this.materialRecords) }
  }

  analyticsLowStockForecast() {
    return { data: lowStockForecast(this.lots, this.movements, this.materialRecords) }
  }

  analyticsExpiryRisk() {
    return { data: expiryRisk(this.lots, this.materialRecords) }
  }

  analyticsCostRanking() {
    return { data: costRanking(this.movements, this.lots, this.materialRecords, this.priceHistoryRecords) }
  }

  analyticsInventory() {
    return { data: inventoryAnalytics(this.lots, this.movements, this.materialRecords, this.priceHistoryRecords) }
  }

  analyticsReports() {
    return { data: this.scheduledReportRecords }
  }

  runAnalyticsReport(id: string) {
    const report = this.scheduledReportRecords.find((item) => item.id === id)
    if (!report) {
      throw new NotFoundException(`Scheduled report ${id} was not found`)
    }
    const nextReport: ScheduledReportRecord = {
      ...report,
      lastRunAt: new Date().toISOString(),
    }
    this.scheduledReportRecords = this.scheduledReportRecords.map((item) =>
      item.id === id ? nextReport : item,
    )
    const audit = this.recordAudit('analytics.report.run', id, 'api:insights', 'allowed')
    return {
      data: {
        report: nextReport,
        audit,
        invariant: 'scheduled analytics report run updates report evidence only and does not mutate inventory or orders',
      },
    }
  }

  billingPlan() {
    return { data: billingPlan }
  }

  billingConsole(): { data: BillingConsoleResponse } {
    const usage = this.billingUsageRecord()
    const limitChecks = this.billingLimitChecks(usage)
    return {
      data: {
        plan: billingPlan,
        subscription: this.subscriptionRecord,
        usage,
        limitChecks,
        invoices: this.invoiceRecords,
        sso: ssoConfig,
        apiKeys,
        webhooks,
        webhookDeliveries: this.webhookDeliveryRecords,
        readiness: this.commercialReadinessChecks(limitChecks),
        invariant: 'subscription status and plan limits are enforced server-side before commercial writes',
      },
    }
  }

  billingSubscription() {
    return { data: this.subscriptionRecord }
  }

  billingUsage() {
    return { data: this.billingUsageRecord() }
  }

  billingInvoices() {
    return { data: this.invoiceRecords }
  }

  startBillingCheckout(body: { planId?: string; mode?: 'checkout' | 'manual_sales' } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'billing.manage')
    const mode = body.mode === 'checkout' ? 'checkout' : 'manual_sales'
    const planId = body.planId?.trim() || billingPlan.id
    if (planId !== billingPlan.id) {
      throw new UnprocessableEntityException(`Plan ${planId} is not available for this tenant`)
    }
    const audit = this.recordAudit('billing.checkout.start', planId, session.userId, 'allowed')
    const response: BillingActionResponse = {
      id: `BILL-ACT-${audit.id}`,
      mode,
      status: 'ready',
      url:
        mode === 'checkout'
          ? `https://billing.labofscents.org/checkout/${this.subscriptionRecord.id}`
          : `mailto:sales@labofscents.org?subject=OlfactoryOps%20${encodeURIComponent(billingPlan.name)}%20plan`,
      audit,
      invariant: 'checkout intent is tenant-scoped and auditable; payment provider webhooks must be idempotent',
    }
    return { data: response }
  }

  openBillingPortal() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'billing.manage')
    const audit = this.recordAudit('billing.portal.open', this.subscriptionRecord.id, session.userId, 'allowed')
    const response: BillingActionResponse = {
      id: `BILL-ACT-${audit.id}`,
      mode: 'portal',
      status: 'ready',
      url: `https://billing.labofscents.org/portal/${this.subscriptionRecord.id}`,
      audit,
      invariant: 'billing portal action never trusts tenant identity from the browser',
    }
    return { data: response }
  }

  freezeSubscription(body: { reason?: string } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'billing.manage')
    const reason = body.reason?.trim() || 'Manual billing freeze'
    this.subscriptionRecord = {
      ...this.subscriptionRecord,
      status: 'frozen',
      canWrite: false,
      canExport: true,
      freezeReason: reason,
      updatedAt: new Date().toISOString(),
    }
    const audit = this.recordAudit('billing.subscription.freeze', this.subscriptionRecord.id, session.userId, 'allowed')
    return {
      data: {
        id: `BILL-ACT-${audit.id}`,
        mode: 'freeze',
        status: 'completed',
        audit,
        invariant: 'frozen tenants keep read and export access but cannot create commercial writes',
      } satisfies BillingActionResponse,
    }
  }

  reactivateSubscription() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'billing.manage')
    this.subscriptionRecord = {
      ...this.subscriptionRecord,
      status: 'active',
      canWrite: true,
      canExport: true,
      freezeReason: undefined,
      graceEndsAt: undefined,
      updatedAt: new Date().toISOString(),
    }
    const audit = this.recordAudit('billing.subscription.reactivate', this.subscriptionRecord.id, session.userId, 'allowed')
    return {
      data: {
        id: `BILL-ACT-${audit.id}`,
        mode: 'reactivate',
        status: 'completed',
        audit,
        invariant: 'reactivation restores write access only after an audited billing action',
      } satisfies BillingActionResponse,
    }
  }

  retryWebhookDelivery(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.apiKeys.manage')
    const delivery = this.webhookDeliveryRecords.find((item) => item.id === id)
    if (!delivery) {
      throw new NotFoundException(`Webhook delivery ${id} was not found`)
    }
    const nextDelivery: WebhookDeliveryRecord = {
      ...delivery,
      status: 'delivered',
      attempts: delivery.attempts + 1,
      lastAttemptAt: new Date().toISOString(),
      nextRetryAt: undefined,
      responseCode: 200,
    }
    this.webhookDeliveryRecords = this.webhookDeliveryRecords.map((item) => (item.id === id ? nextDelivery : item))
    const audit = this.recordAudit('webhook.delivery.retry', id, session.userId, 'allowed')
    return {
      data: {
        delivery: nextDelivery,
        audit,
        invariant: 'webhook retry preserves idempotency key and appends audit evidence',
      },
    }
  }

  assertCommercialWriteAllowed(action = 'commercial.write') {
    if (!this.subscriptionRecord.canWrite || this.subscriptionRecord.status === 'frozen' || this.subscriptionRecord.status === 'canceled') {
      throw new ForbiddenException({
        message: 'Tenant writes are frozen by subscription state',
        action,
        subscriptionStatus: this.subscriptionRecord.status,
        freezeReason: this.subscriptionRecord.freezeReason,
      })
    }
  }

  assertPlanCapacity(limitKey: BillingLimitKey, increment = 1) {
    const usage = this.billingUsageRecord()
    const current = this.usageValueForLimit(usage, limitKey)
    const limit = billingPlan.limits[limitKey]
    if (current + increment > limit) {
      throw new UnprocessableEntityException({
        message: `Plan limit exceeded for ${limitKey}`,
        limitKey,
        current,
        increment,
        limit,
      })
    }
  }

  ssoConfig() {
    return { data: ssoConfig }
  }

  apiKeys() {
    return { data: apiKeys }
  }

  webhooks() {
    return { data: webhooks }
  }

  auditExport() {
    const audit = this.recordAudit('audit.export', 'ORG-NXL', 'api:owner', 'allowed')
    return {
      data: {
        id: `AUD-EXP-${audit.id}`,
        format: 'JSON',
        status: 'QUEUED',
        scope: 'ORG-NXL',
        audit,
      },
    }
  }

  private billingUsageRecord(): BillingUsageMeterRecord {
    const documentStorageGb =
      this.documentRecords.reduce((total, document) => total + document.sizeKb, 0) / 1024 / 1024
    return {
      id: `USG-${this.subscriptionRecord.organizationId}-${this.subscriptionRecord.currentPeriodStart.slice(0, 7)}`,
      organizationId: this.subscriptionRecord.organizationId,
      periodStart: this.subscriptionRecord.currentPeriodStart,
      periodEnd: this.subscriptionRecord.currentPeriodEnd,
      activeSeats: this.membershipRecords.filter((membership) => membership.status === 'ACTIVE').length,
      materials: this.materialRecords.length,
      formulas: this.formulaRecords.length,
      lots: this.lots.length,
      documents: this.documentRecords.length,
      storageGb: Number(documentStorageGb.toFixed(6)),
      apiCalls: this.auditEvents.length,
      webhooks: webhooks.filter((webhook) => webhook.status === 'active').length,
      auditEvents: this.auditEvents.length,
      lastCalculatedAt: new Date().toISOString(),
    }
  }

  private billingLimitChecks(usage: BillingUsageMeterRecord): BillingLimitCheck[] {
    const rows: { key: BillingLimitKey; label: string; used: number }[] = [
      { key: 'seats', label: 'Active seats', used: usage.activeSeats },
      { key: 'materials', label: 'Materials', used: usage.materials },
      { key: 'formulas', label: 'Formulas', used: usage.formulas },
      { key: 'lots', label: 'Lots', used: usage.lots },
      { key: 'documents', label: 'Documents', used: usage.documents },
      { key: 'storageGb', label: 'Document storage GB', used: usage.storageGb },
      { key: 'apiCalls', label: 'Audited API activity', used: usage.apiCalls },
      { key: 'webhooks', label: 'Active webhooks', used: usage.webhooks },
    ]

    return rows.map(({ key, label, used }) => {
      const limit = billingPlan.limits[key]
      const percent = limit === 0 ? 100 : Math.round((used / limit) * 100)
      return {
        key,
        label,
        used,
        limit,
        percent,
        status: used > limit ? 'blocked' : percent >= 80 ? 'warning' : 'pass',
      }
    })
  }

  private commercialReadinessChecks(limitChecks: BillingLimitCheck[]) {
    const hasBlockedLimit = limitChecks.some((check) => check.status === 'blocked')
    const retryingDelivery = this.webhookDeliveryRecords.some((delivery) => delivery.status === 'retrying')
    return [
      {
        key: 'subscription-state',
        label: 'Subscription state gates writes',
        status: this.subscriptionRecord.canWrite ? 'pass' : 'blocked',
        detail: `${this.subscriptionRecord.status} subscription; write access is ${this.subscriptionRecord.canWrite ? 'enabled' : 'frozen'}`,
      },
      {
        key: 'plan-limit-enforcement',
        label: 'Plan limits enforced server-side',
        status: hasBlockedLimit ? 'blocked' : 'pass',
        detail: hasBlockedLimit ? 'At least one limit is exceeded' : 'All tracked usage is within plan limits',
      },
      {
        key: 'invoice-lifecycle',
        label: 'Invoice lifecycle present',
        status: this.invoiceRecords.length > 0 ? 'pass' : 'warning',
        detail: `${this.invoiceRecords.length} invoice record(s) linked to subscription ${this.subscriptionRecord.id}`,
      },
      {
        key: 'webhook-idempotency',
        label: 'Webhook retry/idempotency evidence',
        status: retryingDelivery ? 'warning' : 'pass',
        detail: retryingDelivery ? 'A delivery is retrying with preserved idempotency key' : 'Webhook deliveries are healthy',
      },
      {
        key: 'enterprise-identity',
        label: 'SSO/SCIM readiness',
        status: ssoConfig.status === 'verified' ? 'pass' : 'warning',
        detail: `${ssoConfig.provider} configuration for ${ssoConfig.domain} is ${ssoConfig.status}`,
      },
    ] satisfies BillingConsoleResponse['readiness']
  }

  private usageValueForLimit(usage: BillingUsageMeterRecord, limitKey: BillingLimitKey) {
    if (limitKey === 'seats') return usage.activeSeats
    if (limitKey === 'apiCalls') return usage.apiCalls
    if (limitKey === 'storageGb') return usage.storageGb
    if (limitKey === 'auditRetentionDays') return 0
    return usage[limitKey]
  }

  private recordDocumentDownloadAudit(
    document: DocumentRecord,
    actor: string,
    outcome: AuditEvent['outcome'],
  ) {
    this.auditCounter += 1
    const event: AuditEvent = {
      id: `AUD-DOC-${String(this.auditCounter).padStart(4, '0')}`,
      at: new Date().toISOString(),
      actor,
      action: 'document.download',
      entity: document.id,
      requestId: `req_doc_${String(this.auditCounter).padStart(4, '0')}`,
      outcome,
    }
    this.auditEvents = [event, ...this.auditEvents]
    return event
  }

  private currentSession() {
    this.refreshSessionStates()
    const activeAdminSession = this.sessions.find(
      (item) => item.status === 'ACTIVE' && this.roleHasPermission(item.role, 'security.manageUsers'),
    )
    if (activeAdminSession) {
      return activeAdminSession
    }
    return this.login().data.session
  }

  private requirePermission(role: string, permission: string) {
    if (!this.roleHasPermission(role, permission)) {
      throw new ForbiddenException(`Role ${role} cannot perform ${permission}`)
    }
  }

  private roleHasPermission(role: string, permission: string) {
    return this.rolePolicyRecords.some(
      (policy) => policy.role === role && policy.permissions.includes(permission),
    )
  }

  private organizationRolePolicies() {
    return this.rolePolicyRecords.filter((item) => item.scope === 'organization')
  }

  private organizationPermissionCatalog() {
    return permissionCatalog.filter((permission) => permission.scope === 'organization')
  }

  private buildPermissionMatrix(rolePolicyRows: RolePolicy[]): RolePermissionMatrix[] {
    const catalog = this.organizationPermissionCatalog()
    const highRiskPermissionKeys = new Set(
      catalog
        .filter((permission) => permission.risk === 'high' || permission.risk === 'critical')
        .map((permission) => permission.key),
    )

    return rolePolicyRows.map((policy) => {
      const allowedSet = new Set(policy.permissions)
      const allowedPermissions = catalog
        .map((permission) => permission.key)
        .filter((permission) => allowedSet.has(permission))
      return {
        role: policy.role,
        scope: policy.scope,
        mfaRequired: policy.mfaRequired,
        allowedPermissions,
        deniedPermissions: catalog
          .map((permission) => permission.key)
          .filter((permission) => !allowedSet.has(permission)),
        highRiskPermissions: allowedPermissions.filter((permission) => highRiskPermissionKeys.has(permission)),
      }
    })
  }

  private permissionDecision(role: string, permission: string) {
    const rolePolicy = this.rolePolicyRecords.find((policy) => policy.role === role)
    const permissionDefinition = permissionCatalog.find((item) => item.key === permission)
    const allowed = Boolean(rolePolicy?.permissions.includes(permission))
    return {
      allowed,
      role,
      permission,
      knownRole: Boolean(rolePolicy),
      knownPermission: Boolean(permissionDefinition),
      mfaRequired: Boolean(rolePolicy?.mfaRequired),
      risk: permissionDefinition?.risk ?? 'medium',
      category: permissionDefinition?.category ?? 'Unknown',
      reason: allowed
        ? `${role} includes ${permission} in the server-side role policy`
        : `${role} does not include ${permission} in the server-side role policy`,
    }
  }

  private revokeSessionsForEmail(email: string) {
    const normalizedEmail = email.toLowerCase()
    const revokedSessions: AuthSession[] = []
    this.sessions = this.sessions.map((session) => {
      if (session.email.toLowerCase() !== normalizedEmail || session.status !== 'ACTIVE') {
        return session
      }
      const revoked = this.revokeSessionShape(session, 'MEMBERSHIP_DEACTIVATED')
      revokedSessions.push(revoked)
      return revoked
    })
    return revokedSessions
  }

  private revokeSessionRecord(session: AuthSession, reason: SessionRevokeReason) {
    const revoked = this.revokeSessionShape(session, reason)
    this.sessions = this.sessions.map((item) => (item.id === session.id ? revoked : item))
    return revoked
  }

  private revokeSessionShape(session: AuthSession, reason: SessionRevokeReason) {
    const now = new Date().toISOString()
    return {
      ...session,
      status: 'REVOKED' as const,
      revokedAt: now,
      revokedReason: reason,
    }
  }

  private enforceConcurrentSessionLimit(email: string, currentSessionId: string) {
    const normalizedEmail = email.toLowerCase()
    const activeSessions = this.sessions
      .filter((session) => session.email.toLowerCase() === normalizedEmail && session.status === 'ACTIVE')
      .sort((left, right) => new Date(left.issuedAt).getTime() - new Date(right.issuedAt).getTime())
    const overflow = activeSessions.length - tenantSecurityPolicy.concurrentSessionLimit
    if (overflow <= 0) {
      return []
    }

    const revokedSessions: AuthSession[] = []
    const revokeIds = new Set(
      activeSessions
        .filter((session) => session.id !== currentSessionId)
        .slice(0, overflow)
        .map((session) => session.id),
    )
    this.sessions = this.sessions.map((session) => {
      if (!revokeIds.has(session.id)) {
        return session
      }
      const revoked = this.revokeSessionShape(session, 'CONCURRENT_LIMIT')
      revokedSessions.push(revoked)
      this.recordAudit('session.revoke', session.userId, 'api:auth', 'review')
      return revoked
    })
    return revokedSessions
  }

  private refreshSessionStates(now = new Date()) {
    this.sessions = this.sessions.map((session) => {
      if (session.status !== 'ACTIVE') {
        return session
      }
      const absoluteExpired = new Date(session.expiresAt).getTime() <= now.getTime()
      const idleExpired = new Date(session.idleExpiresAt).getTime() <= now.getTime()
      if (!absoluteExpired && !idleExpired) {
        return session
      }
      this.recordAudit('session.expire', session.userId, 'api:auth', 'review')
      return {
        ...session,
        status: 'EXPIRED' as const,
        revokedAt: now.toISOString(),
        revokedReason: absoluteExpired ? 'ABSOLUTE_TIMEOUT' : 'IDLE_TIMEOUT',
      }
    })
  }

  private permissionsForRole(role: string) {
    return this.rolePolicyRecords.find((policy) => policy.role === role)?.permissions ?? []
  }

  private safeMaterialNumber(value: unknown, fallback: number) {
    const next = Number(value)
    return Number.isFinite(next) && next >= 0 ? next : fallback
  }

  private isLotQualityStatus(value: unknown): value is LotQualityStatus {
    return (
      value === 'APPROVED' ||
      value === 'QUARANTINE' ||
      value === 'ON_HOLD' ||
      value === 'REJECTED' ||
      value === 'EXPIRED'
    )
  }

  private sanitizeMaterialFields(fields: MaterialNumericFields = {}): MaterialNumericFields {
    return Object.fromEntries(
      Object.entries(fields)
        .map(([field, value]) => [field, Number(value)] as const)
        .filter(([, value]) => Number.isFinite(value) && value >= 0),
    ) as MaterialNumericFields
  }

  private mergeMaterial(material: Material, body: MaterialMutationBody, source: string, version: string): Material {
    const date = new Date().toISOString().slice(0, 10)
    const next: Material = {
      ...material,
      name: body.name?.trim() || material.name,
      family: body.family?.trim() || material.family,
      tier: body.tier === 'Top' || body.tier === 'Heart' || body.tier === 'Base' ? body.tier : material.tier,
      vaporPressure:
        body.vaporPressure === undefined ? material.vaporPressure : this.safeMaterialNumber(body.vaporPressure, material.vaporPressure),
      density: body.density === undefined ? material.density : this.safeMaterialNumber(body.density, material.density),
      mw: body.mw === undefined ? material.mw : this.safeMaterialNumber(body.mw, material.mw),
      logP: body.logP === undefined ? material.logP : this.safeMaterialNumber(body.logP, material.logP),
      substantivityHours:
        body.substantivityHours === undefined
          ? material.substantivityHours
          : this.safeMaterialNumber(body.substantivityHours, material.substantivityHours),
      ifraLimit: body.ifraLimit === undefined ? material.ifraLimit : this.safeMaterialNumber(body.ifraLimit, material.ifraLimit),
      costPerGram:
        body.costPerGram === undefined ? material.costPerGram : this.safeMaterialNumber(body.costPerGram, material.costPerGram),
      odor: body.odor ? body.odor.filter(Boolean) : material.odor,
    }
    const trackedFields = [
      'name',
      'family',
      'tier',
      'vaporPressure',
      'density',
      'mw',
      'logP',
      'substantivityHours',
      'ifraLimit',
      'costPerGram',
      'odor',
    ] as const
    const provenance: MaterialProvenance[] = trackedFields
      .filter((field) => body[field] !== undefined && JSON.stringify(next[field]) !== JSON.stringify(material[field]))
      .map((field) => ({ field: String(field), source, version, date }))
    return {
      ...next,
      provenance: [...provenance, ...material.provenance],
    }
  }

  private pubchemProfile(material: Material) {
    if (material.cas === '54464-57-2') {
      return {
        fields: { mw: 234.38, logP: 4.72, vaporPressure: 0.0049 },
        molecules: [
          { name: 'Iso E Super isomer A', cas: '54464-57-2', percent: 72 },
          { name: 'Iso E Super isomer B', cas: '54464-59-4', percent: 28 },
        ],
      }
    }
    if (material.cas === '24851-98-7') {
      return {
        fields: { mw: 226.31, logP: 3.12, vaporPressure: 0.011 },
        molecules: [{ name: 'Methyl dihydrojasmonate', cas: '24851-98-7', percent: 94 }],
      }
    }
    return {
      fields: { mw: material.mw, logP: material.logP, vaporPressure: material.vaporPressure },
      molecules: [{ name: `${material.name} primary component`, cas: material.cas, percent: 100 }],
    }
  }

  private validateFormulaLineMutation(formulaId: string, body: FormulaLineMutationBody) {
    const grams = Number(body.grams ?? 0)
    if (!Number.isFinite(grams) || grams <= 0) {
      throw new UnprocessableEntityException('Formula line grams must be greater than 0')
    }

    const materialId = body.materialId?.trim()
    const childFormulaId = body.childFormulaId?.trim()
    if (Boolean(materialId) === Boolean(childFormulaId)) {
      throw new UnprocessableEntityException('Formula line must reference exactly one material or child formula')
    }

    const material = materialId ? this.materialRecords.find((item) => item.id === materialId) : undefined
    if (materialId && !material) {
      throw new NotFoundException(`Material ${materialId} was not found`)
    }

    const childFormula = childFormulaId
      ? this.formulaRecords.find((item) => item.id === childFormulaId)
      : undefined
    if (childFormulaId && !childFormula) {
      throw new NotFoundException(`Child formula ${childFormulaId} was not found`)
    }
    if (childFormulaId === formulaId || (childFormulaId && this.formulaContainsFormula(childFormulaId, formulaId))) {
      throw new UnprocessableEntityException('Nested formula would create a cycle')
    }

    return { grams, material, childFormula }
  }

  private formulaContainsFormula(rootFormulaId: string, targetFormulaId: string, trail = new Set<string>()): boolean {
    if (rootFormulaId === targetFormulaId) {
      return true
    }
    if (trail.has(rootFormulaId)) {
      return false
    }
    const formula = this.formulaRecords.find((item) => item.id === rootFormulaId)
    if (!formula) {
      return false
    }
    const nextTrail = new Set(trail).add(rootFormulaId)
    return formula.lines.some((line) => {
      if (!line.childFormulaId) {
        return false
      }
      return (
        line.childFormulaId === targetFormulaId ||
        this.formulaContainsFormula(line.childFormulaId, targetFormulaId, nextTrail)
      )
    })
  }

  private nextFormulaVersionValue(version: string) {
    const match = /^v(\d+)$/i.exec(version.trim())
    const current = match ? Number(match[1]) : 0
    return `v${current + 1}`
  }

  private formulaVersionChecksum(formula: Formula) {
    const payload = `${formula.id}:${formula.version}:${formula.lines
      .map((line) => `${line.id}:${line.materialId ?? line.childFormulaId}:${line.grams}`)
      .join('|')}`
    let hash = 0
    for (let index = 0; index < payload.length; index += 1) {
      hash = (hash * 31 + payload.charCodeAt(index)) >>> 0
    }
    return `sha256:${hash.toString(16).padStart(8, '0')}`
  }

  private pickLotsForMaterial(materialId: string, requiredGrams: number, reservedOnly = false) {
    const material = this.materialRecords.find((item) => item.id === materialId)
    if (!material) {
      throw new NotFoundException(`Material ${materialId} was not found`)
    }
    const allocations: Allocation[] = []
    let remaining = requiredGrams
    const eligibleLots = this.lots
      .filter((lot) => lot.materialId === materialId && lot.qualityStatus === 'APPROVED')
      .sort((a, b) => {
        const expirySort = a.expiryDate.localeCompare(b.expiryDate)
        return expirySort || a.receivedDate.localeCompare(b.receivedDate)
      })

    eligibleLots.forEach((lot) => {
      if (remaining <= 0) {
        return
      }
      const available = reservedOnly ? lot.reservedGrams : Math.max(0, lot.quantityGrams - lot.reservedGrams)
      const allocatedGrams = Math.min(available, remaining)
      if (allocatedGrams <= 0) {
        return
      }
      remaining -= allocatedGrams
      allocations.push({
        materialId,
        materialName: material.name,
        requiredGrams,
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        allocatedGrams,
        balanceAfter: lot.quantityGrams - allocatedGrams,
      })
    })

    if (remaining > 0.0001) {
      throw new UnprocessableEntityException({
        message: 'Insufficient eligible inventory',
        materialId,
        requiredGrams,
        availableGrams: requiredGrams - remaining,
      })
    }

    return allocations
  }

  private createOrderDocument(
    orderId: string,
    type: OrderDocumentRecord['type'],
    status: OrderDocumentRecord['status'] = 'READY',
  ) {
    const existing = this.orderDocumentRecords.find((document) => document.orderId === orderId && document.type === type)
    if (existing) {
      return existing
    }
    const document: OrderDocumentRecord = {
      id: `ORD-DOC-${String(this.orderDocumentRecords.length + 1).padStart(3, '0')}`,
      orderId,
      type,
      status,
      url: `/documents/orders/${orderId}/${type.toLowerCase().replace('_', '-')}.pdf`,
      createdAt: new Date().toISOString(),
    }
    this.orderDocumentRecords = [document, ...this.orderDocumentRecords]
    return document
  }

  private normalizeLabUsagePurpose(value?: LabUsagePurpose): LabUsagePurpose {
    if (value === 'sample' || value === 'production-prep' || value === 'qc' || value === 'waste') {
      return value
    }
    return 'trial'
  }

  private normalizeGeneratedDocumentType(value?: DocumentType | string): DocumentType {
    if (
      value === 'CoA' ||
      value === 'Allergen Declaration' ||
      value === 'GHS Label' ||
      value === 'Formula Spec Sheet' ||
      value === 'Finished Product SDS' ||
      value === 'Invoice'
    ) {
      return value
    }
    throw new UnprocessableEntityException('Unsupported generated document type')
  }

  private documentGenerationTarget(type: DocumentType, linkedTo: string) {
    if (type === 'CoA') {
      const lot = this.lots.find((item) => item.id === linkedTo)
      if (!lot) {
        throw new NotFoundException(`Lot ${linkedTo} was not found`)
      }
      const material = this.materialRecords.find((item) => item.id === lot.materialId)
      return {
        label: `${lot.lotNumber} ${material?.name ?? 'Lot'}`,
        scope: 'lots',
        sensitivity: 'Confidential' as const,
        sizeKb: 168,
        generatedFrom: `lot:${lot.id}`,
      }
    }

    if (type === 'Invoice') {
      const order = this.salesOrderRecords.find((item) => item.id === linkedTo)
      if (!order) {
        throw new NotFoundException(`Sales order ${linkedTo} was not found`)
      }
      return {
        label: order.id,
        scope: 'orders',
        sensitivity: 'Confidential' as const,
        sizeKb: 144,
        generatedFrom: `sales-order:${order.id}`,
      }
    }

    const formula = this.formulaRecords.find((item) => item.id === linkedTo)
    if (!formula) {
      throw new NotFoundException(`Formula ${linkedTo} was not found`)
    }
    return {
      label: `${formula.code} ${formula.version}`,
      scope: 'formulas',
      sensitivity: type === 'Formula Spec Sheet' || type === 'Finished Product SDS' ? ('Highly Confidential' as const) : ('Confidential' as const),
      sizeKb: type === 'Finished Product SDS' ? 320 : 128,
      generatedFrom: `formula:${formula.id}:${formula.version}`,
    }
  }

  private documentChecksum(value: string) {
    let hash = 0
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 33 + value.charCodeAt(index)) >>> 0
    }
    return `sha256:${hash.toString(16).padStart(8, '0')}`
  }

  private slugify(value: string) {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    return slug || `tenant-${Date.now()}`
  }

  private recordAudit(
    action: string,
    entity: string,
    actor: string,
    outcome: AuditEvent['outcome'],
  ) {
    this.auditCounter += 1
    const event: AuditEvent = {
      id: `AUD-GEN-${String(this.auditCounter).padStart(4, '0')}`,
      at: new Date().toISOString(),
      actor,
      action,
      entity,
      requestId: `req_gen_${String(this.auditCounter).padStart(4, '0')}`,
      outcome,
    }
    this.auditEvents = [event, ...this.auditEvents]
    return event
  }
}
