import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

type Role = 'Owner' | 'Admin' | 'Lab Manager' | 'Perfumer' | 'R&D Scientist' | 'Lab Technician' | 'Procurement' | 'Sensory Panelist' | 'Brand' | 'Supplier' | 'Finance' | 'Viewer'
type Manifest = { organizationId: string; hostname: string; otherHostname: string; statePaths: Record<Role, string> }
const roles: Role[] = ['Owner', 'Admin', 'Lab Manager', 'Perfumer', 'R&D Scientist', 'Lab Technician', 'Procurement', 'Sensory Panelist', 'Brand', 'Supplier', 'Finance', 'Viewer']
const manifest = JSON.parse(await readFile('.qa/v2-role-fixtures/manifest.json', 'utf8')) as Manifest
const productionPermissions = [
  'production.view',
  'production.create',
  'production.plan',
  'production.allocate',
  'production.weigh',
  'production.process',
  'production.qc',
  'production.qc.record',
  'production.qc.approve',
  'production.deviation.manage',
  'production.release',
  'production.cancel',
  'production.close',
  'production.finishedGoods.view',
  'production.documents.view',
  'production.documents.manage',
] as const
type ProductionPermission = (typeof productionPermissions)[number]
const productionAllowed: Record<Role, readonly ProductionPermission[]> = {
  Owner: productionPermissions,
  Admin: productionPermissions,
  'Lab Manager': ['production.view', 'production.create', 'production.plan', 'production.allocate', 'production.weigh', 'production.process', 'production.qc', 'production.qc.record', 'production.qc.approve', 'production.deviation.manage', 'production.cancel', 'production.close', 'production.finishedGoods.view', 'production.documents.view', 'production.documents.manage'],
  Perfumer: ['production.view', 'production.documents.view'],
  'R&D Scientist': [],
  'Lab Technician': ['production.view', 'production.weigh', 'production.process', 'production.qc.record', 'production.finishedGoods.view', 'production.documents.view'],
  Procurement: [],
  'Sensory Panelist': [],
  Brand: [],
  Supplier: [],
  Finance: [],
  Viewer: [],
}
const expected: Record<Role, { required: string[]; forbidden: string[] }> = {
  Owner: { required: ['tenant.view', 'members.view', 'members.invite', 'billing.capabilities', 'observability.view', 'privacy.export.self', 'trials.viewAll'], forbidden: [] },
  Admin: { required: ['tenant.view', 'members.view', 'members.invite', 'billing.capabilities', 'privacy.export.self', 'trials.viewAll'], forbidden: ['observability.view'] },
  'Lab Manager': { required: ['tenant.view', 'members.view', 'inventory.view', 'inventory.transfer', 'notifications.view', 'trials.viewAll', 'sensory.manage'], forbidden: ['billing.capabilities', 'observability.view'] },
  Perfumer: { required: ['tenant.view', 'formula.view', 'formula.edit', 'trials.viewAll'], forbidden: ['members.view', 'billing.capabilities', 'observability.view'] },
  'R&D Scientist': { required: ['tenant.view', 'formula.view', 'scientific_ai.use', 'rag.view'], forbidden: ['members.view', 'billing.capabilities', 'observability.view'] },
  'Lab Technician': { required: ['tenant.view', 'inventory.view', 'trials.viewAll', 'sensory.evaluate'], forbidden: ['members.view', 'billing.capabilities', 'observability.view'] },
  Procurement: { required: ['tenant.view', 'suppliers.view', 'procurement.create'], forbidden: ['members.view', 'billing.capabilities', 'observability.view'] },
  'Sensory Panelist': { required: ['tenant.view', 'trials.viewAssigned', 'sensory.evaluate'], forbidden: ['members.view', 'billing.capabilities', 'observability.view', 'trials.viewAll'] },
  Brand: { required: ['tenant.view'], forbidden: ['members.view', 'materials.viewSensitive', 'billing.capabilities', 'observability.view', 'trials.view', 'trials.viewAll', 'trials.viewAssigned', 'sensory.view', 'sensory.evaluate'] },
  Supplier: { required: ['tenant.view', 'suppliers.view', 'procurement.view'], forbidden: ['members.view', 'billing.capabilities', 'observability.view'] },
  Finance: { required: ['tenant.view', 'billing.capabilities', 'costing.view'], forbidden: ['members.view', 'observability.view'] },
  Viewer: { required: ['tenant.view', 'materials.view', 'inventory.view', 'formula.view'], forbidden: ['members.view', 'billing.capabilities', 'observability.view'] },
}

for (const role of roles) {
  test(`V2 role matrix: ${role}`, async ({ browser }) => {
    const state = JSON.parse(await readFile(manifest.statePaths[role], 'utf8'))
    const context = await browser.newContext({ storageState: state })
    const page = await context.newPage()
    try {
      const me = await page.request.get('/api/v1/v2/platform/me')
      expect(me.ok(), `${role} session must resolve`).toBeTruthy()
      const payload = await me.json() as { user: { verified: boolean }; membership: { role: string; organizationId: string }; capabilities: Record<string, boolean> }
      expect(payload.membership.role).toBe(role)
      expect(payload.membership.organizationId).toBe(manifest.organizationId)
      expect(payload.user.verified).toBe(true)
      for (const permission of expected[role].required) expect(payload.capabilities[permission], `${role} must receive ${permission}`).toBe(true)
      for (const permission of expected[role].forbidden) expect(payload.capabilities[permission], `${role} must not receive ${permission}`).toBe(false)
      for (const permission of productionPermissions) expect(payload.capabilities[permission], `${role} production capability ${permission}`).toBe(productionAllowed[role].includes(permission))

      const canViewProduction = productionAllowed[role].includes('production.view')
      const production = await page.request.get('/api/v1/v2/production')
      expect(production.status(), `${role} production order projection`).toBe(canViewProduction ? 200 : 403)

      await page.goto('/v2/workspace')
      await expect(page.locator('[data-testid="v2-workspace"]')).toBeVisible()
      await expect(page.locator('.v2-workspace-nav button')).not.toHaveCount(0)
      const csrfToken = await page.evaluate(() => window.localStorage.getItem('oo_v2_csrf'))
      if (!csrfToken) throw new Error(`${role} fixture is missing its V2 CSRF token.`)
      const probeId = `p8-role-probe-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      const mutationProbes = [
        { label: 'create', permissions: ['production.create'], path: '' },
        { label: 'record QC', permissions: ['production.qc.record'], path: `/${probeId}/qc/results` },
        { label: 'approve QC', permissions: ['production.qc.approve'], path: `/${probeId}/qc/results/${probeId}-result/approve` },
        { label: 'release', permissions: ['production.release', 'production.qc.approve'], path: `/${probeId}/release` },
        { label: 'cancel', permissions: ['production.cancel'], path: `/${probeId}/cancel` },
        { label: 'close', permissions: ['production.close'], path: `/${probeId}/close` },
      ] as const
      for (const probe of mutationProbes) {
        const response = await page.request.post(`/api/v1/v2/production${probe.path}`, {
          data: {},
          headers: {
            Origin: 'http://127.0.0.1:4173',
            'X-CSRF-Token': csrfToken,
            'Idempotency-Key': `p8-role-boundary-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${probe.label.replace(/[^a-z0-9]+/gi, '-')}`,
          },
        })
        const permitted = probe.permissions.every((permission) => payload.capabilities[permission] === true)
        // Empty payloads are rejected only after authorization, so no probe can
        // create or mutate a production record in the isolated fixture.
        expect(response.status(), `${role} ${probe.label} authorization boundary`).toBe(permitted ? 422 : 403)
      }
      const genealogy = await page.request.get(`/api/v1/v2/production/finished-goods/${probeId}/genealogy`)
      const canViewFinishedGoodGenealogy = payload.capabilities['production.finishedGoods.view'] === true && payload.capabilities['production.documents.view'] === true
      expect(genealogy.status(), `${role} finished-good genealogy authorization boundary`).toBe(canViewFinishedGoodGenealogy ? 404 : 403)
      const productionNavigation = page.locator('.v2-workspace-nav').getByRole('button', { name: 'Production', exact: true })
      if (canViewProduction) await expect(productionNavigation).toBeVisible()
      else await expect(productionNavigation).toHaveCount(0)
      await page.goto('/v2/workspace/observability')
      if (role === 'Owner') await expect(page.locator('h2', { hasText: 'Observability' })).toBeVisible()
      else await expect(page.getByText('This section is not available for your role.')).toBeVisible()

      await page.goto('/v2/workspace/members')
      if (payload.capabilities['members.view']) await expect(page.locator('h2', { hasText: 'Members' })).toBeVisible()
      else await expect(page.getByText('This section is not available for your role.')).toBeVisible()

      const denied = await page.request.get('/api/v1/v2/platform/workspace/observability')
      expect(denied.status()).toBe(role === 'Owner' ? 200 : 403)
      const crossTenant = await page.request.get('/api/v1/v2/platform/me', { headers: { 'x-forwarded-host': manifest.otherHostname } })
      expect(crossTenant.status()).toBe(403)

      const materials = await page.request.get('/api/v1/v2/lab/materials')
      expect(materials.status(), `${role} material projection`).toBe(payload.capabilities['materials.view'] ? 200 : 403)
      const lots = await page.request.get('/api/v1/v2/lab/inventory/lots')
      expect(lots.status(), `${role} inventory projection`).toBe(payload.capabilities['inventory.view'] ? 200 : 403)
      const suppliers = await page.request.get('/api/v1/v2/lab/suppliers')
      expect(suppliers.status(), `${role} supplier projection`).toBe(payload.capabilities['suppliers.view'] ? 200 : 403)
      const procurement = await page.request.get('/api/v1/v2/lab/procurement/overview')
      expect(procurement.status(), `${role} procurement projection`).toBe(payload.capabilities['procurement.view'] ? 200 : 403)
      const trials = await page.request.get('/api/v1/v2/trials')
      const canReadTrials = payload.capabilities['trials.viewAll'] || payload.capabilities['trials.viewAssigned']
      expect(trials.status(), `${role} Trial projection`).toBe(canReadTrials ? 200 : 403)
      await page.goto('/v2/workspace/trials')
      if (canReadTrials) await expect(page.getByTestId('v2-trials-dashboard')).toBeVisible()
      else await expect(page.getByText('This section is not available for your role.')).toBeVisible()

      await page.goto('/v2/workspace/production')
      if (canViewProduction) await expect(page.getByTestId('v2-production-dashboard')).toBeVisible()
      else await expect(page.getByText('This section is not available for your role.')).toBeVisible()
      for (const viewport of [{ width: 320, height: 720 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }, { width: 1440, height: 960 }]) {
        await page.setViewportSize(viewport)
        expect(await page.locator('body').evaluate((element) => element.scrollWidth <= element.clientWidth + 1), `${role} production route has horizontal overflow at ${viewport.width}px`).toBe(true)
      }
      if (role === 'Owner') {
        await page.goto('/v2/workspace/materials')
        await expect(page.getByTestId('v2-materials')).toBeVisible()
        await page.getByLabel('Material name').fill('Role E2E material')
        await page.getByLabel('Internal code').fill('ROLE-E2E')
        await page.getByRole('button', { name: 'Create draft material' }).click()
        await expect(page.getByText('Material created as a draft. Review it before operational use.')).toBeVisible()
        await page.goto('/v2/workspace/suppliers')
        await expect(page.getByTestId('v2-suppliers')).toBeVisible()
        await page.getByLabel('Legal supplier name').fill('Role E2E supplier')
        await page.getByRole('button', { name: 'Create draft supplier' }).click()
        await expect(page.getByText('Supplier profile created as a draft for review.')).toBeVisible()
        await page.goto('/v2/workspace/formulas')
        await expect(page.getByTestId('v2-formulas')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Create formula project' })).toBeVisible()
        await page.goto('/v2/workspace/design-studio')
        await expect(page.getByTestId('v2-design-studio')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Save research brief' })).toBeVisible()
      }

      for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }, { width: 1440, height: 960 }]) {
        await page.setViewportSize(viewport)
        expect(await page.locator('body').evaluate((element) => element.scrollWidth <= element.clientWidth + 1), `${role} has horizontal overflow at ${viewport.width}px`).toBe(true)
      }
    } finally {
      await context.close()
    }
  })
}
