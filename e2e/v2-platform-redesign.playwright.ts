import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const session = {
  user: { email: 'ui-review@example.test', displayName: 'UI Review', verified: true },
  membership: { organizationName: 'Aster R&D', organizationSlug: 'aster-rd', role: 'Lab Manager' },
  capabilities: {
    'tenant.view': true,
    'materials.view': true,
    'materials.edit': true,
    'formula.view': true,
    'formula.edit': true,
    'inventory.view': true,
    'suppliers.view': true,
    'procurement.view': true,
    'agent.view': true,
    'observability.view': true,
    'domains.view': true,
    'members.view': true,
    'security.sessions.view': true,
  },
}

async function mockWorkspaceApi(page: Page, options: { research?: boolean } = {}) {
  await page.route('**/api/v1/v2/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const respond = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
    if (pathname.endsWith('/platform/auth/csrf/bootstrap')) return respond({ csrfToken: 'test-csrf' })
    if (pathname.endsWith('/platform/me')) return respond(options.research ? { ...session, capabilities: { ...session.capabilities, 'scientific_ai.predict': true } } : session)
    if (pathname.endsWith('/lab/materials')) return respond({ materials: [{ id: 'mat-1', name: 'Bergamot fraction', internalCode: 'MAT-014', status: 'ACTIVE', scope: 'TENANT' }, { id: 'mat-2', name: 'Cedarwood atlas', internalCode: 'MAT-022', status: 'DRAFT', scope: 'TENANT' }] })
    if (options.research && pathname.endsWith('/model-dataset/models/research-ready')) return respond({ models: [{ id: 'model-version-1', name: 'Osmo Dravnieks Transformer-CNN', version: 'osmo-dravnieks-transformer-cnn/1.0.0', stage: 'RESEARCH', trainingMode: 'FINE_TUNE_FROZEN_PRETRAINED_ENCODER', datasetVersion: '5aa9d2cd-d560c47e' }] })
    if (options.research && pathname.endsWith('/olfactory-intelligence/materials/mat-1/odor-predictions')) return respond({ prediction: { id: 'prediction-1', status: 'SUCCESS', modelName: 'Osmo Dravnieks Transformer-CNN', modelVersionId: 'model-version-1', modelStage: 'RESEARCH', trainingMode: 'FINE_TUNE_FROZEN_PRETRAINED_ENCODER', datasetVersion: '5aa9d2cd-d560c47e', canonicalSmiles: 'CCOC(=O)C1=CC=CC=C1', inputStructureHash: 'a'.repeat(64), predictions: [{ descriptor: 'Citrus', targetKey: 'regression_citrus', score: 0.412, scale: 'dataset descriptor response score, source range 0-1; not a probability', uncertainty: 0.071, uncertaintyMethod: 'per-target validation residual RMSE' }], provenance: { upstreamCommit: '4db725b5e549af7697215d8cc7a6e8a2a952dca5', checkpointSha256: 'b'.repeat(64), evaluationHash: 'c'.repeat(64) }, evidenceStatus: 'EVALUATED_RESEARCH', runtimeVersion: 'olfactoryops-osmo-research-runtime/1.0.0' } })
    if (pathname.endsWith('/lab/inventory/lots')) return respond({ lots: [{ id: 'lot-1', materialId: 'mat-1', status: 'AVAILABLE', qualityStatus: 'RELEASED', location: 'Lab A', projection: { onHandGrams: 120, reservedGrams: 0, availableGrams: 120 } }] })
    if (pathname.endsWith('/formula-intelligence/projects')) return respond({ projects: [{ id: 'formula-1', name: 'Citrus study', formulaType: 'FINE_FRAGRANCE', status: 'DRAFT', latestVersion: 0 }] })
    if (pathname.endsWith('/formula-intelligence/design-projects')) return respond({ projects: [] })
    if (pathname.endsWith('/lab/suppliers')) return respond({ suppliers: [] })
    if (pathname.endsWith('/lab/procurement/overview')) return respond({ requests: [], orders: [], shipments: [] })
    if (pathname.endsWith('/platform/workspace/observability')) return respond({ observability: {} })
    return respond({})
  })
}

test('renders the governed workspace shell without raw transport language', async ({ page }, testInfo) => {
  await mockWorkspaceApi(page)
  await page.goto('/v2/workspace')
  await expect(page.getByTestId('v2-workspace-home')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'R&D workspace' })).toBeVisible()
  await expect(page.getByText('Live reads only')).toBeVisible()
  await expect(page.getByText('Material records')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Failed to fetch')
  await expect(page.getByRole('button', { name: 'Trials & Sensory' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('workspace-home.png'), fullPage: true })
})

test('keeps the workspace overview accessible to automated audit', async ({ page }) => {
  await mockWorkspaceApi(page)
  await page.goto('/v2/workspace')
  await expect(page.getByTestId('v2-workspace-home')).toBeVisible()
  const audit = await new AxeBuilder({ page }).analyze()
  expect(audit.violations).toEqual([])
})

test('keeps the material library scannable and horizontally safe', async ({ page }, testInfo) => {
  await mockWorkspaceApi(page)
  await page.goto('/v2/workspace/materials')
  await expect(page.getByTestId('v2-materials')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Olfactive family' })).toBeVisible()
  await expect(page.getByText('Bergamot fraction')).toBeVisible()
  await expect(page.getByText('Not captured').first()).toBeVisible()
  await expect(page.getByText('Tenant library')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('materials-library.png'), fullPage: true })
})

test('shows bounded research odor evidence without probability language', async ({ page }) => {
  await mockWorkspaceApi(page, { research: true })
  await page.goto('/v2/workspace/materials')
  await page.getByRole('button', { name: /Bergamot fraction/ }).click()
  await expect(page.getByRole('heading', { name: 'Research odor profile' })).toBeVisible()
  await page.getByRole('button', { name: 'Predict research profile' }).click()
  await expect(page.getByText('Evaluated research', { exact: true })).toBeVisible()
  await expect(page.getByText('Score on source 0-1 response scale, not probability. Estimated uncertainty ±0.071.')).toBeVisible()
  await expect(page.getByText('Not a safety, regulatory, IFRA, supplier, or formula-approval decision.')).toBeVisible()
  await expect(page.locator('.v2-olfactory-result')).not.toContainText('%')
})

test('keeps a usable mobile navigation trigger', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375', 'This interaction is specific to the phone navigation breakpoint.')
  await mockWorkspaceApi(page)
  await page.goto('/v2/workspace')
  await page.getByRole('button', { name: 'Toggle navigation' }).click()
  await expect(page.locator('.v2-workspace-nav').getByRole('button', { name: 'Materials' })).toBeVisible()
})

test('renders the formula, design, and governed-agent P0 surfaces', async ({ page }, testInfo) => {
  await mockWorkspaceApi(page)
  await page.goto('/v2/workspace/formulas')
  await expect(page.getByTestId('v2-formulas')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Composition with reviewable math' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('formula-workbench.png'), fullPage: true })

  await page.goto('/v2/workspace/design-studio')
  await expect(page.getByTestId('v2-design-studio')).toBeVisible()
  await expect(page.getByTestId('v2-design-studio').getByText('Creative research', { exact: true })).toBeVisible()
  await expect(page.getByText('No research brief exists yet. Start with the creative question, then make its constraints explicit.')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('design-studio.png'), fullPage: true })

  await page.goto('/v2/workspace/agents')
  await expect(page.getByTestId('v2-agent-runtime')).toBeVisible()
  await expect(page.getByTestId('v2-agent-runtime').getByRole('heading', { name: 'Governed runtime' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Failed to fetch')
  await page.screenshot({ path: testInfo.outputPath('agent-console.png'), fullPage: true })
})
