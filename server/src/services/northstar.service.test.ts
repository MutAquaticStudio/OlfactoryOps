import { describe, expect, it } from 'vitest'
import { ForbiddenException, UnprocessableEntityException } from '../shared/http-error'
import { NorthStarService } from './northstar.service'

describe('NorthStarService', () => {
  it('commits lab usage through OUT movements and reverses by compensation', () => {
    const service = new NorthStarService()
    const commit = service.commitLabUsage('frm-0421', 12.5).data

    expect(commit.usage.status).toBe('COMMITTED')
    expect(commit.usage.weighingSession?.status).toBe('READY')
    expect(commit.movements.length).toBeGreaterThan(0)
    expect(commit.movements.every((movement) => movement.direction === 'OUT')).toBe(true)

    const reverse = service.reverseLatestLabUsage().data

    expect(reverse.usageId).toBe(commit.usage.id)
    expect(reverse.usage.status).toBe('REVERSED')
    expect(reverse.movements.every((movement) => movement.direction === 'IN')).toBe(true)
    expect(reverse.invariant).toContain('reverse by compensation')
  })

  it('exposes lab usage history, detail, and reverse-by-id evidence', () => {
    const service = new NorthStarService()
    const commit = service.commitLabUsage('frm-0421', 12.5, {
      purpose: 'sample',
      projectCode: 'NXL-RD-0421',
      sampleCode: 'SMP-0421-A',
      operator: 'Bench Chemist',
    }).data

    const history = service.labUsageHistory().data
    expect(history.usages[0]?.id).toBe(commit.usage.id)
    expect(history.usages[0]?.purpose).toBe('sample')
    expect(history.invariant).toContain('usage history')

    const detail = service.labUsageDetail(commit.usage.id).data
    expect(detail.usage.sampleCode).toBe('SMP-0421-A')
    expect(detail.movements.length).toBe(commit.movements.length)

    const reverse = service.reverseLabUsage(commit.usage.id, {
      reason: 'Bench correction',
      actor: 'Lab Manager',
    }).data
    expect(reverse.usage.reversedAt).toBeDefined()
    expect(reverse.usage.reversalMovements?.length).toBe(commit.movements.length)
    expect(reverse.movements.every((movement) => movement.actor === 'Lab Manager')).toBe(true)
    expect(() => service.reverseLabUsage(commit.usage.id)).toThrow(UnprocessableEntityException)
  })

  it('records lab weighing sessions without creating inventory movements', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const plan = service.labUsagePlan('frm-0421', 12.5).data
    const actuals = plan.allocations.map((allocation, index) => ({
      materialId: allocation.materialId,
      lotId: allocation.lotId,
      actualGrams: index === 0 ? Number((allocation.allocatedGrams * 1.01).toFixed(4)) : allocation.allocatedGrams,
    }))

    const result = service.recordLabWeighingSession('frm-0421', 12.5, {
      actuals,
      tolerancePercent: 2,
      operator: 'Bench Chemist',
    }).data

    expect(result.weighingSession.status).toBe('READY')
    expect(result.weighingSession.operator).toBe('Bench Chemist')
    expect(result.weighingSession.lines[0]?.deviationPercent).toBeCloseTo(1)
    expect(result.invariant).toContain('before movement creation')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
  })

  it('commits lab usage with actual weighed quantities', () => {
    const service = new NorthStarService()
    const plan = service.labUsagePlan('frm-0421', 12.5).data
    const firstAllocation = plan.allocations[0]!
    const actualGrams = Number((firstAllocation.allocatedGrams * 0.99).toFixed(4))

    const commit = service.commitLabUsage('frm-0421', 12.5, {
      actuals: [
        {
          materialId: firstAllocation.materialId,
          lotId: firstAllocation.lotId,
          actualGrams,
        },
      ],
      tolerancePercent: 2,
      operator: 'Bench Chemist',
    }).data

    expect(commit.movements[0]?.quantityGrams).toBeCloseTo(actualGrams)
    expect(commit.movements[0]?.actor).toBe('Bench Chemist')
    expect(commit.usage.allocations[0]?.allocatedGrams).toBeCloseTo(actualGrams)
    expect(commit.usage.weighingSession?.lines[0]?.actualGrams).toBeCloseTo(actualGrams)
  })

  it('blocks out-of-tolerance lab weighing commits before inventory changes', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const plan = service.labUsagePlan('frm-0421', 12.5).data
    const firstAllocation = plan.allocations[0]!

    expect(() =>
      service.commitLabUsage('frm-0421', 12.5, {
        actuals: [
          {
            materialId: firstAllocation.materialId,
            lotId: firstAllocation.lotId,
            actualGrams: Number((firstAllocation.allocatedGrams * 1.25).toFixed(4)),
          },
        ],
        tolerancePercent: 2,
        operator: 'Bench Chemist',
      }),
    ).toThrow(UnprocessableEntityException)
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
  })

  it('issues short-lived document URLs only after permission check and logs access', () => {
    const service = new NorthStarService()
    const before = service.documents().data.find((document) => document.id === 'DOC-118')
    expect(before).toBeDefined()

    const result = service.requestDocumentSignedUrl('DOC-118').data

    expect(result.signedUrl.url).toContain('expires=')
    expect(result.signedUrl.ttlSeconds).toBe(300)
    expect(result.document.downloads).toBe(before!.downloads + 1)
    expect(result.audit.action).toBe('document.download')
    expect(result.audit.outcome).toBe('allowed')
    expect(service.documentDownloadAudit().data[0]?.entity).toBe('DOC-118')
  })

  it('blocks highly confidential document downloads without sensitive permission and keeps audit evidence', () => {
    const service = new NorthStarService()

    expect(() => service.requestDocumentSignedUrl('DOC-121')).toThrow(ForbiddenException)
    expect(() =>
      service.requestDocumentSignedUrl('DOC-121', {
        actor: 'api:viewer',
        permissions: ['documents.download'],
      }),
    ).toThrow(ForbiddenException)

    const latestAudit = service.documentDownloadAudit().data[0]
    expect(latestAudit?.entity).toBe('DOC-121')
    expect(latestAudit?.outcome).toBe('blocked')
  })

  it('reports compliance coverage and generates review-gated documents', () => {
    const service = new NorthStarService()
    const before = service.documentComplianceDashboard().data
    expect(before.missingCount).toBeGreaterThan(0)
    expect(before.expiringDocuments.some((document) => document.id === 'DOC-118')).toBe(true)

    const result = service.generateDocument({
      type: 'CoA',
      linkedTo: 'lot-iso-001',
      actor: 'Compliance Lead',
    }).data

    expect(result.document.type).toBe('CoA')
    expect(result.document.linkedTo).toBe('lot-iso-001')
    expect(result.document.status).toBe('REVIEW_REQUIRED')
    expect(result.document.generatedFrom).toBe('lot:lot-iso-001')
    expect(result.audit.action).toBe('document.generate')
    expect(result.audit.outcome).toBe('review')
    expect(result.dashboard.generatedCount).toBe(1)
    expect(result.dashboard.requirements.find((item) => item.id === 'REQ-COA-lot-iso-001')?.status).toBe('review')
  })

  it('approves generated documents before external sharing', () => {
    const service = new NorthStarService()
    const generated = service.generateDocument({ type: 'CoA', linkedTo: 'lot-iso-001' }).data.document

    expect(() => service.shareDocument(generated.id, { recipient: 'client@example.com' })).toThrow(
      UnprocessableEntityException,
    )

    const approved = service.approveDocument(generated.id, { actor: 'Compliance Lead' }).data
    const shared = service.shareDocument(generated.id, {
      recipient: 'client@example.com',
      actor: 'Compliance Lead',
    }).data

    expect(approved.document.status).toBe('APPROVED')
    expect(approved.audit.action).toBe('document.approve')
    expect(shared.document.status).toBe('SHARED')
    expect(shared.shareLink.recipient).toBe('client@example.com')
    expect(shared.shareLink.permission).toBe('external-view')
    expect(shared.audit.action).toBe('document.externalShare')
    expect(service.documentDownloadAudit().data.some((event) => event.action === 'document.externalShare')).toBe(true)
  })

  it('blocks cross-tenant and missing-permission probes', () => {
    const service = new NorthStarService()

    expect(service.tenantProbe('org-nxl').data.allowed).toBe(true)
    expect(() => service.tenantProbe('org-other')).toThrow(ForbiddenException)
    expect(() => service.permissionProbe('inventory.adjust', 'Viewer')).toThrow(ForbiddenException)
    expect(service.permissionProbe('inventory.adjust', 'Owner').data.allowed).toBe(true)
  })

  it('returns a server-side permission matrix for organization roles', () => {
    const service = new NorthStarService()
    const result = service.permissionMatrix().data
    const viewer = result.matrix.find((row) => row.role === 'Viewer')

    expect(result.permissionCatalog.some((permission) => permission.key === 'inventory.adjust')).toBe(true)
    expect(result.rolePolicies.some((policy) => policy.role === 'Admin')).toBe(true)
    expect(viewer?.allowedPermissions).toContain('inventory.view')
    expect(viewer?.deniedPermissions).toContain('inventory.adjust')
    expect(result.invariant).toContain('server-side')
  })

  it('updates role permissions and applies the new permission decision', () => {
    const service = new NorthStarService()
    const viewer = service.permissionMatrix().data.matrix.find((row) => row.role === 'Viewer')
    const updated = service.setRolePermissions('Viewer', [
      ...(viewer?.allowedPermissions ?? []),
      'inventory.adjust',
    ]).data

    expect(updated.rolePolicy.permissions).toContain('inventory.adjust')
    expect(updated.audit.action).toBe('role.permissions.update')
    expect(service.permissionProbe('inventory.adjust', 'Viewer').data.allowed).toBe(true)
  })

  it('blocks unknown permissions and unsafe Owner permission removal', () => {
    const service = new NorthStarService()
    const owner = service.permissionMatrix().data.matrix.find((row) => row.role === 'Owner')

    expect(() => service.setRolePermissions('Viewer', ['inventory.view', 'tenant.escape'])).toThrow(
      UnprocessableEntityException,
    )
    expect(() =>
      service.setRolePermissions(
        'Owner',
        (owner?.allowedPermissions ?? []).filter((permission) => permission !== 'security.manageUsers'),
      ),
    ).toThrow(UnprocessableEntityException)
  })

  it('scopes the tenant console to the active organization', () => {
    const service = new NorthStarService()
    const result = service.tenantConsole().data

    expect(result.organization.id).toBe('org-nxl')
    expect(result.brands.every((brand) => brand.organizationId === 'org-nxl')).toBe(true)
    expect(result.memberships.every((membership) => membership.organizationId === 'org-nxl')).toBe(true)
    expect(result.sessions.every((session) => session.organizationId === 'org-nxl')).toBe(true)
    expect(result.rolePolicies.some((policy) => policy.role === 'Owner')).toBe(true)
    expect(result.permissionMatrix.some((matrix) => matrix.role === 'Admin')).toBe(true)
    expect(result.invariant).toContain('active session')
  })

  it('invites tenant members without creating a usable credential', () => {
    const service = new NorthStarService()
    const result = service.inviteMember({
      email: 'new.viewer@example.test',
      name: 'New Viewer',
      role: 'Viewer',
      brandIds: ['brand-nxl'],
    }).data

    expect(result.membership.status).toBe('INVITED')
    expect(result.membership.organizationId).toBe('org-nxl')
    expect(result.audit.action).toBe('membership.invite')
    expect(result.invariant).toContain('invitee sets password')
    expect(() => service.login('new.viewer@example.test')).toThrow(ForbiddenException)
  })

  it('blocks cross-tenant brand grants during member invite', () => {
    const service = new NorthStarService()

    expect(() =>
      service.inviteMember({
        email: 'leaky.viewer@example.test',
        role: 'Viewer',
        brandIds: ['brand-other'],
      }),
    ).toThrow(ForbiddenException)
  })

  it('deactivates members by revoking their active sessions', () => {
    const service = new NorthStarService()
    const result = service.setMembershipStatus('MBR-LAB', 'DEACTIVATED').data
    const consoleState = service.tenantConsole().data

    expect(result.membership.status).toBe('DEACTIVATED')
    expect(result.revokedSessions.some((session) => session.id === 'SES-0002')).toBe(true)
    expect(consoleState.sessions.find((session) => session.id === 'SES-0002')?.status).toBe('REVOKED')
    expect(result.invariant).toContain('revoke active sessions')
    expect(() => service.login('lab@example.test')).toThrow(ForbiddenException)
  })

  it('prevents deactivating the last active Owner and audits session revocation', () => {
    const service = new NorthStarService()

    expect(() => service.setMembershipStatus('MBR-OWNER', 'DEACTIVATED')).toThrow(UnprocessableEntityException)

    const revoked = service.revokeSession('SES-0002').data
    expect(revoked.session.status).toBe('REVOKED')
    expect(revoked.audit.action).toBe('session.revoke')
    expect(revoked.invariant).toContain('tenant-scoped')
  })

  it('creates bounded login sessions and clamps concurrent sessions', () => {
    const service = new NorthStarService()
    const firstLogin = service.login('owner@example.test').data
    const secondLogin = service.login('owner@example.test').data
    const consoleState = service.tenantConsole().data
    const activeOwnerSessions = consoleState.sessions.filter(
      (session) => session.email === 'owner@example.test' && session.status === 'ACTIVE',
    )

    expect(firstLogin.session.idleExpiresAt).toBeTruthy()
    expect(firstLogin.session.expiresAt).not.toBe(firstLogin.session.idleExpiresAt)
    expect(secondLogin.revokedForLimit.length).toBeGreaterThanOrEqual(1)
    expect(activeOwnerSessions.length).toBeLessThanOrEqual(consoleState.securityPolicy.concurrentSessionLimit)
    expect(secondLogin.invariant).toContain('idle and absolute')
  })

  it('signs up a new tenant with an owner session', () => {
    const service = new NorthStarService()
    const result = service.signup({
      organizationName: 'Atelier Smoke Test',
      workspaceSlug: 'atelier-smoke',
      email: 'owner@atelier-smoke.test',
      name: 'Atelier Owner',
    }).data
    const consoleState = service.tenantConsole().data

    expect(result.organization.slug).toBe('atelier-smoke')
    expect(result.membership.role).toBe('Owner')
    expect(result.session.email).toBe('owner@atelier-smoke.test')
    expect(result.audit.action).toBe('auth.signup')
    expect(consoleState.organization.id).toBe(result.organization.id)
    expect(consoleState.memberships.some((membership) => membership.email === result.membership.email)).toBe(true)
  })

  it('touches active sessions without changing absolute expiry', () => {
    const service = new NorthStarService()
    const before = service.tenantConsole().data.sessions.find((session) => session.id === 'SES-0002')
    const touched = service.touchSession('SES-0002').data

    expect(touched.session.status).toBe('ACTIVE')
    expect(touched.session.expiresAt).toBe(before?.expiresAt)
    expect(touched.audit.action).toBe('session.touch')
    expect(touched.invariant).toContain('idle timeout')
  })

  it('revokes all active sessions for a tenant member while keeping current admin session', () => {
    const service = new NorthStarService()
    const revoked = service.revokeAllSessions({ email: 'lab@example.test' }).data
    const consoleState = service.tenantConsole().data
    const activeLabSessions = consoleState.sessions.filter(
      (session) => session.email === 'lab@example.test' && session.status === 'ACTIVE',
    )

    expect(revoked.revokedSessions.length).toBeGreaterThanOrEqual(1)
    expect(revoked.audit.action).toBe('session.revokeAll')
    expect(activeLabSessions).toHaveLength(0)
    expect(consoleState.sessions.some((session) => session.email === 'owner@example.test' && session.status === 'ACTIVE')).toBe(true)
  })

  it('logs out the current session with audit evidence', () => {
    const service = new NorthStarService()
    const result = service.logout().data

    expect(result.session.status).toBe('REVOKED')
    expect(result.session.revokedReason).toBe('AUTH_LOGOUT')
    expect(result.audit.action).toBe('auth.logout')
    expect(result.invariant).toContain('current active session')
  })

  it('updates customization settings and increments numbering through the sequence service', () => {
    const service = new NorthStarService()

    const settings = service.updateSettings({ currency: 'EUR', defaultDilutionPercent: 12 }).data
    const first = service.nextNumber('formula').data
    const second = service.nextNumber('formula').data

    expect(settings.settings.currency).toBe('EUR')
    expect(settings.settings.organizationId).toBe('org-nxl')
    expect(settings.audit.action).toBe('customization.settings.update')
    expect(first.value).toBe('FRM-0422')
    expect(second.value).toBe('FRM-0423')
  })

  it('manages customization console flags, fields, sequences, and branding with audit evidence', () => {
    const service = new NorthStarService()

    const consoleState = service.customizationConsole().data
    const flag = service.updateFeatureFlag('formulaCostVisibility', false).data
    const previewBefore = service.previewNumber('formula').data
    const sequence = service.updateNumberingSequence('formula', { pattern: 'FRM-YY-####', nextValue: 430 }).data
    const previewAfter = service.previewNumber('formula').data
    const field = service.createCustomField({
      entity: 'supplier',
      label: 'IFRA review date',
      fieldType: 'date',
      required: true,
    }).data
    const branding = service.updateBranding({ accentColor: '#37d6a0', displayName: 'NOXELIS Atelier' }).data

    expect(consoleState.customFields.length).toBeGreaterThan(0)
    expect(consoleState.branding.displayName).toBe('NOXELIS Lab')
    expect(flag.featureFlag.enabled).toBe(false)
    expect(flag.audit.action).toBe('customization.featureFlag.update')
    expect(previewBefore.value).toBe('FRM-0422')
    expect(sequence.sequence.nextValue).toBe(430)
    expect(sequence.preview).toBe('FRM-YY-0430')
    expect(previewAfter.value).toBe('FRM-YY-0430')
    expect(field.customField.key).toBe('ifra_review_date')
    expect(field.audit.action).toBe('customization.customField.create')
    expect(branding.branding.accentColor).toBe('#37d6a0')
    expect(branding.audit.action).toBe('customization.branding.update')
  })

  it('blocks unsafe customization changes', () => {
    const service = new NorthStarService()

    expect(() => service.updateNumberingSequence('formula', { pattern: 'FRM-YY', nextValue: 430 })).toThrow(
      UnprocessableEntityException,
    )
    expect(() => service.updateNumberingSequence('formula', { nextValue: 100 })).toThrow(UnprocessableEntityException)
    expect(() =>
      service.createCustomField({ entity: 'material', key: 'odorFamily', label: 'Odor family', fieldType: 'select' }),
    ).toThrow(UnprocessableEntityException)
    expect(() => service.updateBranding({ accentColor: 'blue' })).toThrow(UnprocessableEntityException)
  })

  it('creates materials with CAS duplicate guard and no stock side effect', () => {
    const service = new NorthStarService()
    const beforeStockRows = service.inventorySummary().data.length
    const result = service.createMaterial({
      name: 'Vetiveryl Acetate',
      cas: '68917-34-0',
      family: 'Woody vetiver',
      tier: 'Base',
      density: 0.99,
      vaporPressure: 0.002,
      mw: 254.37,
      logP: 4.8,
      source: 'Manual supplier onboarding',
    }).data
    const dedupe = service.materialDedupe('68917-34-0').data

    expect(result.material.id).toBe('mat-vetiveryl-acetate')
    expect(result.audit.action).toBe('material.create')
    expect(result.invariant).toContain('does not create stock')
    expect(dedupe.duplicate).toBe(true)
    expect(service.inventorySummary().data.length).toBe(beforeStockRows + 1)
    expect(() => service.createMaterial({ name: 'Duplicate Vetiver', cas: '68917-34-0' })).toThrow(
      UnprocessableEntityException,
    )
  })

  it('stages SDS extraction for review and only writes approved provenance fields', () => {
    const service = new NorthStarService()
    const review = service.ingestMaterialDocument('mat-iso', {
      source: 'Iso E Super SDS v4',
      version: 'v4',
      fields: { density: 0.97, vaporPressure: 0.0052 },
    }).data
    const beforeApproval = service.material('mat-iso').data
    const approved = service.ingestMaterialDocument('mat-iso', {
      source: 'Iso E Super SDS v4',
      version: 'v4',
      approved: true,
      fields: { density: 0.97, vaporPressure: 0.0052 },
      odor: ['cedar', 'amber', 'transparent'],
    }).data
    const provenance = service.materialProvenance('mat-iso').data

    expect(review.ingestion.status).toBe('REVIEW_REQUIRED')
    expect(review.audit.outcome).toBe('review')
    expect(beforeApproval.density).toBe(0.96)
    expect(approved.ingestion.status).toBe('APPROVED')
    expect(approved.material.density).toBe(0.97)
    expect(approved.material.provenance[0]?.source).toContain('Iso E Super SDS v4')
    expect(provenance.provenance.some((item) => item.field === 'vaporPressure' && item.version === 'v4')).toBe(true)
  })

  it('fills curated PubChem data and returns molecule split for a material', () => {
    const service = new NorthStarService()
    const filled = service.pubchemFill('mat-iso').data
    const molecules = service.materialMolecules('mat-iso').data

    expect(filled.material.logP).toBe(4.72)
    expect(filled.audit.action).toBe('material.pubchemFill')
    expect(filled.invariant).toContain('not tenant-crossing scraping')
    expect(molecules.molecules.length).toBeGreaterThanOrEqual(2)
    expect(molecules.totalPercent).toBeGreaterThanOrEqual(100)
  })

  it('creates formula drafts without consuming inventory', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const result = service.createFormulaDraft({ name: 'Midnight Vetiver', targetGrams: 50 }).data

    expect(result.formula.code).toBe('FRM-0422')
    expect(result.formula.status).toBe('draft')
    expect(result.invariant).toContain('does not create inventory movement')
    expect(service.formulas().data[0]?.id).toBe(result.formula.id)
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
  })

  it('adds formula ingredient lines and resolves draft cost without consuming inventory', () => {
    const service = new NorthStarService()
    const formula = service.createFormulaDraft({ name: 'Line Test Accord', targetGrams: 80 }).data.formula
    const beforeMovements = service.inventoryMovements().data.length
    const result = service.addFormulaLine(formula.id, { materialId: 'mat-hedione', grams: 16 }).data
    const resolved = service.resolveFormula(formula.id).data

    expect(result.line.label).toBe('Hedione')
    expect(result.formula.lines).toHaveLength(1)
    expect(result.leaves[0]?.materialId).toBe('mat-hedione')
    expect(result.totals.totalGrams).toBe(16)
    expect(resolved.leaves[0]?.effectivePercent).toBe(20)
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
    expect(result.invariant).toContain('does not create inventory movement')
  })

  it('edits, reorders, and deletes formula lines without consuming inventory', () => {
    const service = new NorthStarService()
    const formula = service.createFormulaDraft({ name: 'Editable Accord', targetGrams: 50 }).data.formula
    const firstLine = service.addFormulaLine(formula.id, { materialId: 'mat-hedione', grams: 12 }).data.line
    const secondLine = service.addFormulaLine(formula.id, { materialId: 'mat-iso', grams: 8 }).data.line
    const beforeMovements = service.inventoryMovements().data.length

    const updated = service.updateFormulaLine(formula.id, firstLine.id, { grams: 10, label: 'Hedione HC' }).data
    const moved = service.moveFormulaLine(formula.id, secondLine.id, { direction: 'up' }).data
    const deleted = service.deleteFormulaLine(formula.id, firstLine.id).data

    expect(updated.line.grams).toBe(10)
    expect(updated.line.label).toBe('Hedione HC')
    expect(moved.formula.lines[0]?.id).toBe(secondLine.id)
    expect(deleted.formula.lines).toHaveLength(1)
    expect(deleted.formula.lines[0]?.id).toBe(secondLine.id)
    expect(deleted.invariant).toContain('does not create inventory movement')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
  })

  it('resolves nested child formulas and blocks formula cycles', () => {
    const service = new NorthStarService()
    const parent = service.createFormulaDraft({ name: 'Nested Citrus Trial', targetGrams: 100 }).data.formula
    const nested = service.addFormulaLine(parent.id, {
      childFormulaId: 'frm-accord-citrus',
      grams: 25,
      label: 'Citrus top accord',
    }).data
    const resolved = service.resolveFormula(parent.id).data

    expect(nested.line.childFormulaId).toBe('frm-accord-citrus')
    expect(resolved.leaves.some((leaf) => leaf.materialId === 'mat-bergamot')).toBe(true)
    expect(resolved.leaves[0]?.sourcePath).toContain('Citrus top accord')
    expect(() =>
      service.addFormulaLine('frm-accord-citrus', { childFormulaId: parent.id, grams: 5 }),
    ).toThrow(UnprocessableEntityException)
  })

  it('snapshots, approves, and exports formula versions with audit but no stock movement', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const snapshot = service.createFormulaVersion('frm-0421', { note: 'Bench QA snapshot' }).data
    const approval = service.approveFormula('frm-0421').data
    const exported = service.exportFormula('frm-0421').data
    const versions = service.formulaVersions('frm-0421').data

    expect(snapshot.formula.version).toBe('v13')
    expect(snapshot.version.status).toBe('SNAPSHOT')
    expect(approval.formula.status).toBe('stable')
    expect(approval.version.status).toBe('APPROVED')
    expect(exported.document.type).toBe('Formula Export')
    expect(exported.document.sensitivity).toBe('Highly Confidential')
    expect(exported.audit.action).toBe('formula.export')
    expect(versions.versions[0]?.status).toBe('APPROVED')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
    expect(exported.invariant).toContain('creates no inventory movement')
  })

  it('receives direct inventory receipts through lot and IN movement', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const receipt = service.receiveInventoryReceipt({
      materialId: 'mat-iso',
      lotNumber: 'L-ISO-999',
      quantityGrams: 25,
      expiryDate: '2028-01-01',
    }).data

    expect(receipt.lot.lotNumber).toBe('L-ISO-999')
    expect(receipt.movement.direction).toBe('IN')
    expect(receipt.summary?.available).toBeGreaterThan(232)
    expect(receipt.invariant).toContain('immutable IN movement')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements + 1)
  })

  it('adjusts stock only through immutable adjustment movements and blocks negative availability', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const adjustment = service.adjustInventory({
      lotId: 'lot-hed-001',
      direction: 'OUT',
      quantityGrams: 6,
      reason: 'Cycle count variance',
    }).data

    expect(adjustment.lot.quantityGrams).toBe(180)
    expect(adjustment.movement.type).toBe('ADJUSTMENT')
    expect(adjustment.movement.direction).toBe('OUT')
    expect(adjustment.summary?.available).toBe(180)
    expect(adjustment.invariant).toContain('only through immutable movement')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements + 1)

    expect(() =>
      service.adjustInventory({
        lotId: 'lot-iso-001',
        direction: 'OUT',
        quantityGrams: 240,
        reason: 'Invalid write down',
      }),
    ).toThrow(UnprocessableEntityException)
  })

  it('transfers lots between storage locations without changing stock quantity', () => {
    const service = new NorthStarService()
    const beforeSummary = service.inventorySummary().data.find((item) => item.material.id === 'mat-ambroxan')
    const transfer = service.transferInventory({
      lotId: 'lot-amb-001',
      toLocation: 'Cold Room A',
    }).data
    const afterSummary = service.inventorySummary().data.find((item) => item.material.id === 'mat-ambroxan')

    expect(transfer.lot.location).toBe('Cold Room A')
    expect(transfer.movement.type).toBe('TRANSFER')
    expect(transfer.movement.direction).toBe('MOVE')
    expect(transfer.movement.balanceAfter).toBe(38)
    expect(afterSummary?.available).toBe(beforeSummary?.available)
    expect(afterSummary?.current).toBe(beforeSummary?.current)
    expect(transfer.invariant).toContain('without changing stock quantity')
  })

  it('changes lot quality eligibility without creating a stock movement', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const beforeSummary = service.inventorySummary().data.find((item) => item.material.id === 'mat-hedione')
    const quality = service.changeLotQuality('lot-hed-001', {
      qualityStatus: 'ON_HOLD',
      reason: 'Retest required',
    }).data
    const afterSummary = service.inventorySummary().data.find((item) => item.material.id === 'mat-hedione')

    expect(quality.lot.qualityStatus).toBe('ON_HOLD')
    expect(quality.movementCount).toBe(beforeMovements)
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
    expect(afterSummary?.available).toBeLessThan(beforeSummary?.available ?? 0)
    expect(quality.invariant).toContain('creates no inventory movement')
  })

  it('reconciles stock take variance through immutable adjustment movement', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const stockTake = service.performStockTake({
      lotId: 'lot-hed-001',
      countedGrams: 182.5,
      reason: 'Cycle count shelf A',
      actor: 'Inventory Manager',
    }).data

    expect(stockTake.lot.quantityGrams).toBe(182.5)
    expect(stockTake.stockTake.status).toBe('ADJUSTED')
    expect(stockTake.stockTake.varianceGrams).toBe(-3.5)
    expect(stockTake.movement?.type).toBe('ADJUSTMENT')
    expect(stockTake.movement?.direction).toBe('OUT')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements + 1)
    expect(stockTake.invariant).toContain('immutable ADJUSTMENT movement')

    expect(() =>
      service.performStockTake({
        lotId: 'lot-iso-001',
        countedGrams: 10,
        reason: 'Invalid cycle count',
      }),
    ).toThrow(UnprocessableEntityException)
  })

  it('records matched stock take without moving inventory', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const stockTake = service.performStockTake({
      lotId: 'lot-amb-001',
      countedGrams: 38,
      reason: 'Vault cycle count',
    }).data

    expect(stockTake.stockTake.status).toBe('MATCHED')
    expect(stockTake.movement).toBeUndefined()
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
    expect(stockTake.invariant).toContain('without changing stock quantity')
  })

  it('generates lot labels, genealogy, locations, and shopping list without stock movement', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const location = service.createStorageLocation({
      name: 'Retest Bin 1',
      zone: 'Quality',
      condition: 'Retest hold',
      capacityGrams: 600,
    }).data
    const label = service.lotLabel('lot-hed-001').data
    const genealogy = service.lotGenealogy('lot-hed-001').data
    const suggestions = service.inventoryReorderSuggestions().data

    expect(location.location.name).toBe('Retest Bin 1')
    expect(label.label.qrValue).toContain('OLFOPS|LOT|lot-hed-001')
    expect(genealogy.material.id).toBe('mat-hedione')
    expect(genealogy.documents.some((document) => document.id === 'DOC-119')).toBe(true)
    expect(suggestions.suggestions.length).toBeGreaterThan(0)
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
    expect(suggestions.invariant).toContain('without reserving or moving inventory')
  })

  it('runs production consumption separately from lab usage', () => {
    const service = new NorthStarService()
    const batch = service.createProductionBatch('frm-0421', 25).data
    const result = service.consumeProductionBatch(batch.id).data

    expect(result.batchId).toBe(batch.id)
    expect(result.movements.length).toBeGreaterThan(0)
    expect(result.movements.every((movement) => movement.type === 'PRODUCTION_CONSUMPTION')).toBe(true)
    expect(result.invariant).toContain('separate from lab usage')
  })

  it('gates production batches by approved formula, consumption, QC, and release state', () => {
    const service = new NorthStarService()
    const draft = service.createFormulaDraft({ name: 'Unapproved production test' }).data.formula

    expect(() => service.createProductionBatch(draft.id, 25)).toThrow(/must be approved/)

    const batch = service.createProductionBatch('frm-0421', 25).data
    expect(() => service.updateProductionBatchStatus(batch.id, 'RELEASED')).toThrow(/must consume inventory/)

    service.consumeProductionBatch(batch.id)
    const filtration = service.updateProductionBatchStatus(batch.id, 'FILTRATION').data
    expect(filtration.batch.status).toBe('FILTRATION')

    const qc = service.updateProductionBatchStatus(batch.id, 'QC').data
    expect(qc.batch.status).toBe('QC')

    const passed = service.qcProductionBatch(batch.id, 'PASSED').data
    expect(passed.status).toBe('BOTTLING')

    const released = service.updateProductionBatchStatus(batch.id, 'RELEASED').data
    expect(released.batch.status).toBe('RELEASED')
    expect(released.invariant).toContain('audited and gated')
  })

  it('receives purchase orders into inventory through lot and IN movement', () => {
    const service = new NorthStarService()
    const receipt = service.receivePurchaseOrder('PO-2026-014').data

    expect(receipt.lot.materialId).toBe('mat-bergamot')
    expect(receipt.movement.direction).toBe('IN')
    expect(receipt.priceHistory.source).toBe('PO_RECEIPT')
    expect(receipt.invariant).toContain('creates lot and IN movement')
  })

  it('runs procurement supplier, PO state, partial receipt, and price history workflow', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const supplier = service.createSupplier({
      name: 'North Aroma Cooperative',
      country: 'US',
      contactEmail: 'po@north-aroma.test',
      leadTimeDays: 10,
      preferredMaterialIds: ['mat-vanillin'],
    }).data

    expect(supplier.supplier.status).toBe('review')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)

    const draft = service.createPurchaseOrder({
      supplierId: supplier.supplier.id,
      materialId: 'mat-vanillin',
      quantityGrams: 80,
      unitCost: 0.12,
      expectedDate: '2026-07-22',
    }).data

    expect(draft.purchaseOrder.status).toBe('DRAFT')
    expect(draft.invariant).toContain('does not reserve or move inventory')
    expect(() => service.receivePurchaseOrder(draft.purchaseOrder.id, { receivedGrams: 20 })).toThrow(/must be sent/)

    const sent = service.updatePurchaseOrderStatus(draft.purchaseOrder.id, 'SENT').data
    expect(sent.purchaseOrder.status).toBe('SENT')

    const partial = service.receivePurchaseOrder(draft.purchaseOrder.id, { receivedGrams: 30 }).data
    expect(partial.purchaseOrder.status).toBe('PARTIAL')
    expect(partial.purchaseOrder.receivedGrams).toBe(30)
    expect(partial.priceHistory.unitCost).toBe(0.12)

    const finalReceipt = service.receivePurchaseOrder(draft.purchaseOrder.id).data
    expect(finalReceipt.purchaseOrder.status).toBe('RECEIVED')
    expect(finalReceipt.purchaseOrder.receivedGrams).toBe(80)

    const history = service.materialPriceHistory('mat-vanillin').data
    expect(history.filter((entry) => entry.purchaseOrderId === draft.purchaseOrder.id)).toHaveLength(2)
  })

  it('runs commerce SKU, price list, quote, and sample workflow without stock movement', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length

    const skuCreate = service.createCatalogSku({
      materialId: 'mat-hedione',
      name: 'Hedione HC 10g',
      description: 'High clarity hedione studio pack',
      packSizeGrams: 10,
      price: 9,
      tier: 'Studio',
      moqPacks: 1,
    }).data
    expect(skuCreate.invariant).toContain('stores no stock')
    expect(skuCreate.sku.canSellPacks).toBeGreaterThan(0)

    const priceList = service.createPriceList({
      name: 'Studio Loyalty',
      customerGroup: 'Studio',
      multiplier: 0.9,
      sampleEligible: true,
    }).data
    expect(priceList.invariant).toContain('without mutating inventory')

    const quote = service.createQuote({
      skuId: skuCreate.sku.id,
      customer: 'Maison Trial Studio',
      customerGroup: 'Studio',
      quantityPacks: 2,
    }).data
    expect(quote.quote.status).toBe('SENT')
    expect(quote.quote.total).toBe(16.2)
    expect(quote.invariant).toContain('creates no reservation or movement')

    const sample = service.requestSample({
      skuId: skuCreate.sku.id,
      customer: 'Maison Trial Studio',
      packs: 1,
    }).data
    expect(sample.sample.status).toBe('REQUESTED')
    expect(sample.invariant).toContain('does not reserve or move stock')
    expect(service.inventoryMovements().data).toHaveLength(beforeMovements)
  })

  it('runs order lifecycle through reserve, pack, ship, and fulfillment trace', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const order = service.createOrder({
      skuId: 'SKU-ISO-050',
      customerId: 'CUS-DEMO',
      quantity: 1,
      taxPercent: 8,
      shippingCost: 12,
    }).data.order
    expect(order.status).toBe('CONFIRMED')

    const reservation = service.reserveOrder(order.id).data
    const afterReserveMovements = service.inventoryMovements().data.length
    expect(() => service.reserveOrder(order.id)).toThrow(/cannot be reserved/)

    const pack = service.packOrder(order.id).data
    const ship = service.shipOrder(order.id, { carrier: 'DHL', trackingNumber: 'DHL-PHASE12' }).data
    const fulfillment = service.fulfillOrder(order.id).data

    expect(reservation.invariant).toContain('creates no InventoryMovement')
    expect(afterReserveMovements).toBe(beforeMovements)
    expect(pack.document.type).toBe('PACKING_SLIP')
    expect(ship.shipment?.trackingNumber).toBe('DHL-PHASE12')
    expect(fulfillment.movements.every((movement) => movement.direction === 'OUT')).toBe(true)
    expect(fulfillment.invariant).toContain('lot traceability')
    expect(service.orderDocuments().data.map((document) => document.type)).toEqual(
      expect.arrayContaining(['PICK_LIST', 'PACKING_SLIP', 'INVOICE', 'COA']),
    )
    expect(service.shipments().data[0]?.allocations.length).toBeGreaterThan(0)
  })

  it('cancels reserved orders by releasing reservation without movement', () => {
    const service = new NorthStarService()
    const order = service.createOrder({
      skuId: 'SKU-ISO-050',
      customerId: 'CUS-DEMO',
      quantity: 1,
    }).data.order
    const beforeMovements = service.inventoryMovements().data.length

    service.reserveOrder(order.id)
    const cancellation = service.cancelOrder(order.id).data

    expect(cancellation.invariant).toContain('without creating InventoryMovement')
    expect(cancellation.releasedAllocations.length).toBeGreaterThan(0)
    expect(service.inventoryMovements().data).toHaveLength(beforeMovements)
  })

  it('builds costing read models from formula, batch, SKU margin, valuation, and COGS', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const overview = service.costingOverview().data
    const formula = service.costingFormula('frm-0421').data
    const batch = service.costingBatch('BTH-2025-118').data
    const sku = service.costingSku('SKU-ISO-050').data
    const valuation = service.costingValuation().data

    expect(overview.formula.lines.length).toBeGreaterThan(0)
    expect(overview.methodPolicies.length).toBeGreaterThan(0)
    expect(overview.landedCosts.length).toBeGreaterThan(0)
    expect(overview.cogs.length).toBeGreaterThan(0)
    expect(formula.costPerGram).toBeGreaterThan(0)
    expect(formula.mostExpensiveMaterial).not.toBe('n/a')
    expect(batch.sourceFormulaCost.formulaId).toBe('frm-0421')
    expect(batch.totalCost).toBeGreaterThan(batch.materialCost)
    expect(sku.marginPercent).toBeGreaterThan(0)
    expect(valuation.totalValue).toBeGreaterThan(0)
    expect(valuation.invariant).toContain('reconciles')
    expect(service.inventoryMovements().data).toHaveLength(beforeMovements)
  })

  it('serves analytics read models and report runs without mutating the movement ledger', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const dashboard = service.analyticsDashboard().data
    const burnRate = service.analyticsBurnRate().data
    const forecast = service.analyticsLowStockForecast().data
    const expiry = service.analyticsExpiryRisk().data
    const ranking = service.analyticsCostRanking().data
    const inventory = service.analyticsInventory().data
    const reports = service.analyticsReports().data
    const run = service.runAnalyticsReport('RPT-FIN-WEEKLY').data

    expect(dashboard.invariant).toContain('read-only')
    expect(dashboard.roleWidgets.length).toBeGreaterThan(0)
    expect(burnRate.length).toBeGreaterThan(0)
    expect(forecast.length).toBeGreaterThan(0)
    expect(expiry.length).toBeGreaterThan(0)
    expect(ranking[0]?.rank).toBe(1)
    expect(inventory.length).toBeGreaterThan(0)
    expect(reports.some((report) => report.id === 'RPT-FIN-WEEKLY')).toBe(true)
    expect(run.report.lastRunAt).toBeDefined()
    expect(run.audit.action).toBe('analytics.report.run')
    expect(service.inventoryMovements().data).toHaveLength(beforeMovements)
  })

  it('queues enterprise audit export as a tenant-scoped control', () => {
    const service = new NorthStarService()
    const exportJob = service.auditExport().data

    expect(exportJob.status).toBe('QUEUED')
    expect(exportJob.scope).toBe('ORG-NXL')
    expect(exportJob.audit.action).toBe('audit.export')
  })
})
