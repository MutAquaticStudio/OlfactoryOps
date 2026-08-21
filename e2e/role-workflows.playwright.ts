import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

type QaRole = 'Owner' | 'Admin' | 'Perfumer' | 'Lab Manager' | 'SENSORY_PANELIST' | 'Brand' | 'Finance' | 'Viewer'

type RoleStorageState = NonNullable<BrowserContextOptions['storageState']>
type RoleStorageStates = Partial<Record<QaRole, RoleStorageState>>

const roleRoutes: Record<QaRole, string> = {
  Owner: '/workspace/access',
  Admin: '/workspace/access',
  Perfumer: '/workspace/formulas',
  'Lab Manager': '/workspace/production',
  SENSORY_PANELIST: '/trials',
  // Brand users can enter the workspace shell to review explicitly shared
  // artifacts, but cannot open the formula editor route directly.
  Brand: '/workspace',
  Finance: '/workspace/costing',
  Viewer: '/workspace',
}

const roleExpectations: Record<QaRole, { requiredPermissions: string[]; forbiddenPermissions: string[]; visibleNav: string[] }> = {
  Owner: {
    requiredPermissions: ['materials.view', 'formulas.viewSensitive', 'inventory.view', 'trials.view', 'costing.view'],
    forbiddenPermissions: ['security.manageUsers', 'platform.tenants.manage'],
    visibleNav: ['Materials', 'Formulas', 'Inventory', 'Trials'],
  },
  Admin: {
    requiredPermissions: ['materials.view', 'formulas.viewSensitive', 'inventory.view', 'trials.view', 'costing.view', 'analytics.view'],
    forbiddenPermissions: ['platform.tenants.manage'],
    // Costing remains restricted to Finance and internal operators in the UI
    // even though Admin retains the underlying organization permission.
    visibleNav: ['Materials', 'Formulas', 'Inventory', 'Trials', 'Analytics'],
  },
  Perfumer: {
    requiredPermissions: ['materials.view', 'formulas.viewSensitive', 'formulas.edit', 'trials.view', 'costing.view'],
    forbiddenPermissions: ['inventory.view', 'production.consume'],
    visibleNav: ['Materials', 'Formulas', 'Trials'],
  },
  'Lab Manager': {
    requiredPermissions: ['materials.view', 'formulas.viewSensitive', 'inventory.view', 'production.view', 'production.qc', 'trials.view'],
    forbiddenPermissions: ['costing.view', 'finance.viewMargin'],
    visibleNav: ['Materials', 'Formulas', 'Inventory', 'Trials', 'Production'],
  },
  SENSORY_PANELIST: {
    requiredPermissions: ['trials.view', 'trials.evaluate'],
    forbiddenPermissions: ['materials.view', 'formulas.viewSensitive', 'inventory.view', 'costing.view'],
    visibleNav: ['Trials'],
  },
  Brand: {
    requiredPermissions: [],
    forbiddenPermissions: ['materials.view', 'formulas.viewSensitive', 'inventory.view', 'costing.view'],
    visibleNav: [],
  },
  Finance: {
    requiredPermissions: ['costing.view', 'finance.viewMargin', 'analytics.view'],
    forbiddenPermissions: ['formulas.viewSensitive', 'inventory.commitLabUsage'],
    visibleNav: ['Costing', 'Analytics'],
  },
  Viewer: {
    requiredPermissions: ['materials.view', 'formulas.view', 'inventory.view', 'analytics.view'],
    forbiddenPermissions: ['formulas.viewSensitive', 'inventory.commitLabUsage', 'costing.view'],
    visibleNav: ['Materials', 'Formulas', 'Inventory', 'Analytics'],
  },
}

const roleApiBaseUrl = process.env.QA_ROLE_API_URL?.trim() || process.env.VITE_API_BASE_URL?.trim() || 'http://127.0.0.1:8787/api/v1'

const roleStorageStates = parseRoleStorageStates(process.env.QA_ROLE_STORAGE_STATES)
const requireRoleE2e = process.env.QA_REQUIRE_ROLE_E2E === 'true'
const viewports = [
  { width: 320, height: 720 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1280, height: 900 },
  { width: 1440, height: 960 },
  { width: 1920, height: 1080 },
]

for (const role of Object.keys(roleRoutes) as QaRole[]) {
  test(`QA role walkthrough: ${role}`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'Role matrix controls its own viewport loop once per QA role.')
    const storageState = roleStorageStates[role]
    if (!storageState && requireRoleE2e) {
      throw new Error(`QA_ROLE_STORAGE_STATES must provide an isolated test storage state for ${role} when QA_REQUIRE_ROLE_E2E=true.`)
    }
    test.skip(!storageState, `QA_ROLE_STORAGE_STATES must provide an isolated test storage state for ${role}.`)

    const context = await authenticatedContext(browser, storageState!)
    const page = await context.newPage()
    try {
      const credential = await credentialFromStorageState(storageState!)
      const meResponse = await page.request.get(`${roleApiBaseUrl}/me`, {
        headers: credential ? { Authorization: `Bearer ${credential}` } : undefined,
      })
      expect(meResponse.ok(), `${role} session endpoint must be available`).toBeTruthy()
      const mePayload = await meResponse.json() as {
        data?: { session?: { role?: string; organizationId?: string }; permissions?: string[] }
      }
      expect(mePayload.data?.session?.role).toBe(role)
      expect(mePayload.data?.session?.organizationId).toMatch(/^org-/)
      const permissions = new Set(mePayload.data?.permissions ?? [])
      for (const permission of roleExpectations[role].requiredPermissions) {
        expect(permissions.has(permission), `${role} must retain ${permission}`).toBe(true)
      }
      for (const permission of roleExpectations[role].forbiddenPermissions) {
        expect(permissions.has(permission), `${role} must not receive ${permission}`).toBe(false)
      }

      // Authenticate and resolve the protected route once. Subsequent viewport
      // checks resize the same authenticated document so the local D1 session
      // is not churned by 64 redundant app bootstraps.
      await page.goto(roleRoutes[role])
      await expect(page, `${role} was redirected to login`).not.toHaveURL(/\/login(?:\?|$)/)
      await expect(page.locator('main.workspace')).toBeVisible()

      for (const viewport of viewports) {
        await page.setViewportSize(viewport)
        await expect(page.locator('main.workspace')).toBeVisible()
        await expectNoHorizontalOverflow(page)

        if (viewport.width === 1280) {
          if (roleExpectations[role].visibleNav.length > 0) {
            await expect(
              page.locator(`#primary-navigation .nav-item[title="${roleExpectations[role].visibleNav[0]}"]`),
            ).toHaveCount(1, { timeout: 10_000 })
          }
          const navLabels = await page.locator('#primary-navigation .nav-item').evaluateAll((buttons) =>
            buttons.map((button) => button.getAttribute('title') || button.textContent?.trim() || ''),
          )
          for (const label of roleExpectations[role].visibleNav) {
            expect(navLabels, `${role} navigation should expose ${label}`).toContain(label)
          }
        }

        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
        // Public UX/accessibility owns the full critical/serious WCAG gate.
        // Role E2E keeps a critical-only guard so role coverage is not blocked
        // by existing tenant copy contrast debt unrelated to authorization.
        const blocking = result.violations.filter((violation) => violation.impact === 'critical')
        expect(blocking, `${role} / ${viewport.width}px: ${blocking.map((item) => item.id).join(', ')}`).toEqual([])
      }

      // Exercise denied-route projection once after the responsive loop so a
      // legacy compatibility path cannot disturb the next viewport's session
      // restore. The route must remain a safe workspace surface and never
      // expose a removed V1 Formula Agent screen.
      const deniedRoute = await context.newPage()
      await deniedRoute.goto('/workspace/costing')
      await expect(deniedRoute.locator('main.workspace')).toBeVisible()
      if (!roleExpectations[role].visibleNav.includes('Costing')) {
        await expect(deniedRoute.locator('#primary-navigation .nav-item[title="Costing"]')).toHaveCount(0)
      }
      await deniedRoute.goto('/ai/formula-agent')
      await expect(deniedRoute.locator('body')).not.toContainText('Formula Agent')
      await deniedRoute.close()
    } finally {
      await context.close()
    }
  })
}

async function authenticatedContext(browser: Browser, storageState: RoleStorageState) {
  const credential = await credentialFromStorageState(storageState)
  return browser.newContext({
    storageState,
    // The isolated app preview and Worker use different loopback ports. Keep
    // the cookie in the state file, and add the same opaque session as a
    // bearer header so the browser transport cannot drop it cross-port.
    extraHTTPHeaders: credential ? { Authorization: `Bearer ${credential}` } : undefined,
  })
}

async function credentialFromStorageState(storageState: RoleStorageState) {
  const parsed = typeof storageState === 'string'
    ? JSON.parse(await readFile(storageState, 'utf8')) as { cookies?: Array<{ name?: string; value?: string }> }
    : storageState as { cookies?: Array<{ name?: string; value?: string }> }
  return parsed.cookies?.find((cookie) => cookie.name === 'oo_session')?.value
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(overflow.scrollWidth, `document width ${overflow.scrollWidth}px exceeds viewport ${overflow.clientWidth}px`).toBeLessThanOrEqual(overflow.clientWidth + 1)
}

function parseRoleStorageStates(value: string | undefined): RoleStorageStates {
  if (!value?.trim()) return {}
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).filter(([role, storageState]) => role in roleRoutes && validStorageState(storageState)),
    ) as RoleStorageStates
  } catch {
    throw new Error('QA_ROLE_STORAGE_STATES must be a JSON object of QA role names to Playwright storage-state paths.')
  }
}

function validStorageState(value: unknown): value is RoleStorageState {
  if (typeof value === 'string') return value.trim().length > 0
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { cookies?: unknown }).cookies) && Array.isArray((value as { origins?: unknown }).origins))
}
