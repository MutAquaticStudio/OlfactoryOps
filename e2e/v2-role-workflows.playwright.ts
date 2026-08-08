import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

type Role = 'Owner' | 'Admin' | 'Lab Manager' | 'Perfumer' | 'R&D Scientist' | 'Lab Technician' | 'Procurement' | 'Sensory Panelist' | 'Brand' | 'Supplier' | 'Finance' | 'Viewer'
type Manifest = { organizationId: string; hostname: string; otherHostname: string; statePaths: Record<Role, string> }
const roles: Role[] = ['Owner', 'Admin', 'Lab Manager', 'Perfumer', 'R&D Scientist', 'Lab Technician', 'Procurement', 'Sensory Panelist', 'Brand', 'Supplier', 'Finance', 'Viewer']
const manifest = JSON.parse(await readFile('.qa/v2-role-fixtures/manifest.json', 'utf8')) as Manifest
const expected: Record<Role, { required: string[]; forbidden: string[] }> = {
  Owner: { required: ['tenant.view', 'members.view', 'members.invite', 'billing.capabilities', 'observability.view', 'privacy.export.self'], forbidden: [] },
  Admin: { required: ['tenant.view', 'members.view', 'members.invite', 'billing.capabilities', 'privacy.export.self'], forbidden: ['observability.view'] },
  'Lab Manager': { required: ['tenant.view', 'members.view', 'inventory.view', 'notifications.view'], forbidden: ['billing.capabilities', 'observability.view'] },
  Perfumer: { required: ['tenant.view', 'formula.view', 'formula.edit', 'trials.view'], forbidden: ['members.view', 'billing.capabilities', 'observability.view'] },
  'R&D Scientist': { required: ['tenant.view', 'formula.view', 'scientific_ai.use', 'rag.view'], forbidden: ['members.view', 'billing.capabilities', 'observability.view'] },
  'Lab Technician': { required: ['tenant.view', 'inventory.view', 'trials.view', 'sensory.evaluate'], forbidden: ['members.view', 'billing.capabilities', 'observability.view'] },
  Procurement: { required: ['tenant.view', 'suppliers.view', 'procurement.create'], forbidden: ['members.view', 'billing.capabilities', 'observability.view'] },
  'Sensory Panelist': { required: ['tenant.view', 'trials.view', 'sensory.evaluate'], forbidden: ['members.view', 'billing.capabilities', 'observability.view'] },
  Brand: { required: ['tenant.view', 'trials.view', 'sensory.view'], forbidden: ['members.view', 'materials.viewSensitive', 'billing.capabilities', 'observability.view'] },
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

      await page.goto('/v2/workspace')
      await expect(page.locator('[data-testid="v2-workspace"]')).toBeVisible()
      await expect(page.locator('.v2-workspace-nav button')).not.toHaveCount(0)
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

      for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }, { width: 1440, height: 960 }]) {
        await page.setViewportSize(viewport)
        expect(await page.locator('body').evaluate((element) => element.scrollWidth <= element.clientWidth + 1), `${role} has horizontal overflow at ${viewport.width}px`).toBe(true)
      }
    } finally {
      await context.close()
    }
  })
}
