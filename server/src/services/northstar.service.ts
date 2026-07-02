import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import {
  auditEvents,
  apiKeys,
  authSessions,
  billingPlan,
  brands,
  canDownloadDocument,
  commercialSkus,
  createSignedDocumentUrl,
  documentRequiredPermissions,
  documents,
  domains,
  featureFlags,
  formatSequenceValue,
  formulaTotals,
  formulas as initialFormulas,
  formatGrams,
  initialLots,
  initialMovements,
  materials,
  memberships,
  numberingSequences,
  organizations,
  orderRequiredGrams,
  permissionCatalog,
  phases,
  planLabUsage,
  productionBatches,
  purchaseOrders,
  resolveFormulaWithCatalog,
  rolePolicies,
  salesOrders,
  skuAvailability,
  ssoConfig,
  stockSummary,
  suppliers,
  tenantScopeAllows,
  tenantSecurityPolicy,
  tenantSettings,
  webhooks,
  type Allocation,
  type AuditEvent,
  type AuthSession,
  type BrandRecord,
  type DocumentRecord,
  type FeatureFlagRecord,
  type Formula,
  type FormulaLine,
  type InventoryLot,
  type InventoryMovement,
  type LabWeighingSession,
  type MembershipRecord,
  type NumberingSequenceRecord,
  type OrganizationRecord,
  type ProductionBatchRecord,
  type PurchaseOrderRecord,
  type RolePolicy,
  type SalesOrderRecord,
  type TenantSettingsRecord,
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
}

type UsageRecord = {
  id: string
  formulaId: string
  formulaCode: string
  grams: number
  status: 'COMMITTED' | 'REVERSED'
  allocations: Allocation[]
  weighingSession?: LabWeighingSession
  createdAt: string
}

type RolePermissionMatrix = {
  role: string
  scope: RolePolicy['scope']
  mfaRequired: boolean
  allowedPermissions: string[]
  deniedPermissions: string[]
  highRiskPermissions: string[]
}

@Injectable()
export class NorthStarService {
  private lots: InventoryLot[] = structuredClone(initialLots)
  private movements: InventoryMovement[] = structuredClone(initialMovements)
  private formulaRecords: Formula[] = structuredClone(initialFormulas)
  private usageHistory: UsageRecord[] = []
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
  private productionBatchRecords: ProductionBatchRecord[] = structuredClone(productionBatches)
  private purchaseOrderRecords: PurchaseOrderRecord[] = structuredClone(purchaseOrders)
  private salesOrderRecords: SalesOrderRecord[] = structuredClone(salesOrders)
  private auditCounter = auditEvents.length

  phases() {
    return { data: phases }
  }

  domains() {
    return { data: domains }
  }

  materials() {
    return { data: materials }
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
    body: { materialId?: string; childFormulaId?: string; grams?: number; label?: string },
  ) {
    const formula = this.formulaRecords.find((item) => item.id === id)
    if (!formula) {
      throw new NotFoundException(`Formula ${id} was not found`)
    }

    const grams = Number(body.grams ?? 0)
    if (!Number.isFinite(grams) || grams <= 0) {
      throw new UnprocessableEntityException('Formula line grams must be greater than 0')
    }
    if (Boolean(body.materialId) === Boolean(body.childFormulaId)) {
      throw new UnprocessableEntityException('Formula line must reference exactly one material or child formula')
    }

    const material = body.materialId ? materials.find((item) => item.id === body.materialId) : undefined
    if (body.materialId && !material) {
      throw new NotFoundException(`Material ${body.materialId} was not found`)
    }

    const childFormula = body.childFormulaId
      ? this.formulaRecords.find((item) => item.id === body.childFormulaId)
      : undefined
    if (body.childFormulaId && !childFormula) {
      throw new NotFoundException(`Child formula ${body.childFormulaId} was not found`)
    }
    if (body.childFormulaId === id) {
      throw new UnprocessableEntityException('Formula cannot contain itself as a child formula')
    }

    const line: FormulaLine = {
      id: `${id}-line-${formula.lines.length + 1}-${Date.now()}`,
      label: body.label?.trim() || material?.name || childFormula?.name || 'Formula line',
      grams,
      ...(material ? { materialId: material.id } : {}),
      ...(childFormula ? { childFormulaId: childFormula.id } : {}),
    }
    const updatedFormula = { ...formula, lines: [...formula.lines, line] }
    this.formulaRecords = this.formulaRecords.map((item) => (item.id === id ? updatedFormula : item))
    const leaves = resolveFormulaWithCatalog(id, this.formulaRecords)

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

  material(id: string) {
    const material = materials.find((item) => item.id === id)
    if (!material) {
      throw new NotFoundException(`Material ${id} was not found`)
    }
    const summary = stockSummary(this.lots).find((item) => item.material.id === id)
    return { data: { ...material, stock: summary } }
  }

  resolveFormula(id: string) {
    const formula = this.formulaRecords.find((item) => item.id === id)
    if (!formula) {
      throw new NotFoundException(`Formula ${id} was not found`)
    }
    const leaves = resolveFormulaWithCatalog(id, this.formulaRecords)
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

  lotsList() {
    return { data: this.lots }
  }

  inventorySummary() {
    return { data: stockSummary(this.lots) }
  }

  inventoryMovements() {
    return { data: this.movements }
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
        summary: stockSummary(this.lots).find((item) => item.material.id === lot.materialId),
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
        summary: stockSummary(this.lots).find((item) => item.material.id === lot.materialId),
        invariant: 'inventory transfer records movement evidence without changing stock quantity',
      },
    }
  }

  receiveInventoryReceipt(body: {
    materialId?: string
    lotNumber?: string
    quantityGrams?: number
    expiryDate?: string
  }) {
    const materialId = body.materialId ?? materials[0]?.id
    const material = materials.find((item) => item.id === materialId)
    if (!material) {
      throw new NotFoundException(`Material ${materialId} was not found`)
    }

    const quantityGrams = Number(body.quantityGrams ?? 0)
    if (!Number.isFinite(quantityGrams) || quantityGrams <= 0) {
      throw new UnprocessableEntityException('Inventory receipt quantityGrams must be greater than 0')
    }

    const timestamp = new Date().toISOString()
    const lot: InventoryLot = {
      id: `lot-api-${Date.now()}`,
      materialId: material.id,
      lotNumber: body.lotNumber?.trim() || `L-${material.cas.replaceAll('-', '')}`,
      quantityGrams,
      reservedGrams: 0,
      receivedDate: timestamp.slice(0, 10),
      expiryDate: body.expiryDate ?? '2028-12-31',
      qualityStatus: 'APPROVED',
      location: 'Receiving Bay',
      unitCost: material.costPerGram,
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
        summary: stockSummary(this.lots).find((item) => item.material.id === material.id),
        invariant: 'inventory receipt creates lot and immutable IN movement',
      },
    }
  }

  login(email = 'owner@noxel.is') {
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
    const session: AuthSession = {
      id: `SES-${String(this.sessions.length + 1).padStart(4, '0')}`,
      userId: membership.userId,
      email: membership.email,
      organizationId: membership.organizationId,
      brandId,
      role: membership.role,
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + tenantSecurityPolicy.sessionTimeoutMinutes * 60_000).toISOString(),
      status: 'ACTIVE',
      mfaVerified: membership.mfaEnabled,
      ipAddress: '203.0.113.24',
      userAgent: 'API Client',
    }
    this.sessions = [session, ...this.sessions]
    this.membershipRecords = this.membershipRecords.map((item) =>
      item.id === membership.id ? { ...item, lastActiveAt: issuedAt.toISOString() } : item,
    )
    this.recordAudit('auth.login', session.userId, 'api:auth', 'allowed')
    return { data: { session, securityPolicy: tenantSecurityPolicy } }
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
            ['auth.login', 'membership.invite', 'membership.status.update', 'session.revoke', 'security.tenantProbe', 'security.permissionProbe', 'role.permissions.update'].includes(
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
    const now = new Date().toISOString()
    const revoked = { ...target, status: 'REVOKED' as const, expiresAt: now }
    this.sessions = this.sessions.map((item) => (item.id === id ? revoked : item))
    const audit = this.recordAudit('session.revoke', target.userId, session.userId, 'allowed')

    return {
      data: {
        session: revoked,
        audit,
        invariant: 'session revocation is tenant-scoped and audited',
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
    this.settingsRecord = {
      ...this.settingsRecord,
      ...patch,
      organizationId: this.settingsRecord.organizationId,
    }
    this.recordAudit('customization.settings.update', this.settingsRecord.organizationId, 'api:owner', 'allowed')
    return { data: this.settingsRecord }
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

  documentDownloadAudit() {
    return { data: this.auditEvents.filter((event) => event.action === 'document.download') }
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
    const leaves = resolveFormulaWithCatalog(formulaId, this.formulaRecords)
    const plan = planLabUsage(leaves, this.lots, grams, formula.targetGrams)
    return {
      data: {
        formulaId,
        grams,
        allocations: plan.allocations,
        shortfalls: plan.shortfalls,
        canCommit: plan.shortfalls.length === 0,
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
    const usage: UsageRecord = {
      id: usageId,
      formulaId,
      formulaCode: formula.code,
      grams,
      status: 'COMMITTED',
      allocations: actualAllocations,
      weighingSession: { ...weighingSession, id: `WGH-${usageId}`, createdAt: timestamp },
      createdAt: timestamp,
    }
    this.usageHistory = [usage, ...this.usageHistory]

    return {
      data: {
        usage,
        movements: createdMovements,
        message: `${usageId} committed ${formatGrams(
          weighingSession.lines.reduce((sum, line) => sum + line.actualGrams, 0),
        )} actual lab usage using immutable OUT movements`,
      },
    }
  }

  reverseLatestLabUsage() {
    const usage = this.usageHistory.find((item) => item.status === 'COMMITTED')
    if (!usage) {
      throw new UnprocessableEntityException('No committed lab usage exists to reverse')
    }

    const timestamp = new Date().toISOString()
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
        actor: 'api:lab-manager',
      })
    })

    this.lots = Array.from(lotMap.values())
    this.movements = [...reversals, ...this.movements]
    this.usageHistory = this.usageHistory.map((item) =>
      item.id === usage.id ? { ...item, status: 'REVERSED' } : item,
    )

    return {
      data: {
        usageId: usage.id,
        movements: reversals,
        invariant: 'reverse by compensation; original OUT remains',
      },
    }
  }

  productionBatches() {
    return { data: this.productionBatchRecords }
  }

  createProductionBatch(formulaId = 'frm-0421', targetGrams = 25) {
    const formula = this.formulaRecords.find((item) => item.id === formulaId)
    if (!formula) {
      throw new NotFoundException(`Formula ${formulaId} was not found`)
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
    const leaves = resolveFormulaWithCatalog(batch.formulaId, this.formulaRecords)
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
    const status = result === 'PASSED' ? 'RELEASED' : 'QC'
    this.productionBatchRecords = this.productionBatchRecords.map((item) =>
      item.id === id ? { ...item, qcStatus: result, status } : item,
    )
    this.recordAudit('production.batch.qc', id, 'api:qc', result === 'PASSED' ? 'allowed' : 'review')
    return { data: this.productionBatchRecords.find((item) => item.id === id)! }
  }

  suppliers() {
    return { data: suppliers }
  }

  purchaseOrders() {
    return { data: this.purchaseOrderRecords }
  }

  receivePurchaseOrder(id: string) {
    const order = this.purchaseOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Purchase order ${id} was not found`)
    }
    const material = materials.find((item) => item.id === order.materialId)
    if (!material) {
      throw new NotFoundException(`Material ${order.materialId} was not found`)
    }
    if (order.status === 'RECEIVED') {
      throw new UnprocessableEntityException(`Purchase order ${id} has already been received`)
    }

    const lot: InventoryLot = {
      id: `lot-${order.id.toLowerCase()}`,
      materialId: order.materialId,
      lotNumber: `L-${order.id}`,
      quantityGrams: order.quantityGrams,
      reservedGrams: 0,
      receivedDate: new Date().toISOString().slice(0, 10),
      expiryDate: '2028-12-31',
      qualityStatus: 'APPROVED',
      location: 'Receiving Bay',
      unitCost: material.costPerGram,
    }
    const movement: InventoryMovement = {
      id: `MOV-PO-${id}`,
      at: new Date().toISOString(),
      type: 'RECEIPT',
      direction: 'IN',
      materialId: order.materialId,
      lotId: lot.id,
      quantityGrams: order.quantityGrams,
      balanceAfter: lot.quantityGrams,
      ref: id,
      actor: 'api:procurement',
    }
    this.lots = [lot, ...this.lots]
    this.movements = [movement, ...this.movements]
    this.purchaseOrderRecords = this.purchaseOrderRecords.map((item) =>
      item.id === id ? { ...item, receivedGrams: item.quantityGrams, status: 'RECEIVED' } : item,
    )
    this.recordAudit('procurement.po.receive', id, 'api:procurement', 'allowed')
    return { data: { lot, movement, invariant: 'goods receipt creates lot and IN movement' } }
  }

  catalogSkus() {
    return { data: skuAvailability(commercialSkus, this.lots) }
  }

  orders() {
    return { data: this.salesOrderRecords }
  }

  reserveOrder(id: string) {
    const order = this.salesOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Sales order ${id} was not found`)
    }
    const sku = commercialSkus.find((item) => item.id === order.skuId)
    if (!sku) {
      throw new NotFoundException(`SKU ${order.skuId} was not found`)
    }
    const requiredGrams = orderRequiredGrams(order)
    const allocations = this.pickLotsForMaterial(sku.materialId, requiredGrams)
    const lotMap = new Map(this.lots.map((lot) => [lot.id, { ...lot }]))
    allocations.forEach((allocation) => {
      const lot = lotMap.get(allocation.lotId)
      if (lot) {
        lot.reservedGrams += allocation.allocatedGrams
      }
    })
    this.lots = Array.from(lotMap.values())
    this.salesOrderRecords = this.salesOrderRecords.map((item) =>
      item.id === id ? { ...item, reservedGrams: requiredGrams, status: 'RESERVED' } : item,
    )
    this.recordAudit('orders.reserve', id, 'api:fulfillment', 'allowed')
    return { data: { orderId: id, allocations, invariant: 'reservation changes reserved stock but creates no InventoryMovement' } }
  }

  fulfillOrder(id: string) {
    const order = this.salesOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Sales order ${id} was not found`)
    }
    if (order.status !== 'RESERVED') {
      throw new UnprocessableEntityException(`Sales order ${id} must be reserved before fulfillment`)
    }
    const sku = commercialSkus.find((item) => item.id === order.skuId)
    if (!sku) {
      throw new NotFoundException(`SKU ${order.skuId} was not found`)
    }
    const allocations = this.pickLotsForMaterial(sku.materialId, order.reservedGrams, true)
    const lotMap = new Map(this.lots.map((lot) => [lot.id, { ...lot }]))
    const movements: InventoryMovement[] = allocations.map((allocation, index) => {
      const lot = lotMap.get(allocation.lotId)
      if (!lot) {
        throw new NotFoundException(`Lot ${allocation.lotId} was not found`)
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
    this.salesOrderRecords = this.salesOrderRecords.map((item) =>
      item.id === id ? { ...item, fulfilledGrams: order.reservedGrams, status: 'FULFILLED' } : item,
    )
    this.recordAudit('orders.fulfill', id, 'api:fulfillment', 'allowed')
    return { data: { orderId: id, movements, invariant: 'fulfillment creates OUT movement after reservation' } }
  }

  billingPlan() {
    return { data: billingPlan }
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
    const activeSession = this.sessions.find((item) => item.status === 'ACTIVE')
    if (activeSession) {
      return activeSession
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
    const now = new Date().toISOString()
    const revokedSessions: AuthSession[] = []
    this.sessions = this.sessions.map((session) => {
      if (session.email.toLowerCase() !== normalizedEmail || session.status !== 'ACTIVE') {
        return session
      }
      const revoked = { ...session, status: 'REVOKED' as const, expiresAt: now }
      revokedSessions.push(revoked)
      return revoked
    })
    return revokedSessions
  }

  private permissionsForRole(role: string) {
    return rolePolicies.find((policy) => policy.role === role)?.permissions ?? []
  }

  private pickLotsForMaterial(materialId: string, requiredGrams: number, reservedOnly = false) {
    const material = materials.find((item) => item.id === materialId)
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
