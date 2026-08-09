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
const agentPermissions = ['agent.execute', 'agent.view', 'agent.observe', 'agent.evaluate', 'agent.confirmWrite', 'agent.manageTools'] as const
type AgentPermission = (typeof agentPermissions)[number]
const agentAllowed: Record<Role, readonly AgentPermission[]> = {
  Owner: agentPermissions,
  Admin: agentPermissions,
  'Lab Manager': ['agent.view', 'agent.execute'],
  Perfumer: ['agent.view', 'agent.execute', 'agent.confirmWrite'],
  'R&D Scientist': ['agent.view', 'agent.execute', 'agent.evaluate'],
  'Lab Technician': ['agent.view', 'agent.execute'],
  Procurement: ['agent.view', 'agent.execute'],
  'Sensory Panelist': [],
  Brand: [],
  Supplier: [],
  Finance: ['agent.view', 'agent.execute'],
  Viewer: ['agent.view'],
}
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
      for (const permission of agentPermissions) expect(payload.capabilities[permission], `${role} agent capability ${permission}`).toBe(agentAllowed[role].includes(permission))

      const canViewProduction = productionAllowed[role].includes('production.view')
      const production = await page.request.get('/api/v1/v2/production')
      expect(production.status(), `${role} production order projection`).toBe(canViewProduction ? 200 : 403)

      await page.goto('/v2/workspace')
      await expect(page.locator('[data-testid="v2-workspace"]')).toBeVisible()
      await expect(page.locator('.v2-workspace-nav button')).not.toHaveCount(0)
      const csrfToken = await page.evaluate(() => window.localStorage.getItem('oo_v2_csrf'))
      if (!csrfToken) throw new Error(`${role} fixture is missing its V2 CSRF token.`)
      const agentProbeId = `p9-role-probe-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      const agentHeaders = (label: string) => ({
        Origin: 'http://127.0.0.1:4173',
        'X-CSRF-Token': csrfToken,
        'Idempotency-Key': `p9-role-boundary-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${label}`,
      })
      const expectAgentProbe = (response: { status(): number }, permission: AgentPermission, label: string, permitted: readonly number[]) => {
        // Probe IDs and bodies are deliberately invalid/non-persistent. A role
        // denied the capability must be rejected before runtime validation.
        const allowed = payload.capabilities[permission] === true
        if (allowed) expect(permitted, `${role} ${label} permitted probe response`).toContain(response.status())
        else expect(response.status(), `${role} ${label} authorization-before-validation boundary`).toBe(403)
      }
      const agentDefinitions = await page.request.get('/api/v1/v2/agent-runtime/definitions')
      expectAgentProbe(agentDefinitions, 'agent.view', 'list definitions', [200])
      const agentDefinition = await page.request.get(`/api/v1/v2/agent-runtime/definitions/${agentProbeId}`)
      expectAgentProbe(agentDefinition, 'agent.view', 'definition detail', [404])
      const agentDefinitionVersions = await page.request.get(`/api/v1/v2/agent-runtime/definitions/${agentProbeId}/versions`)
      // This is a collection endpoint: an unknown definition returns its
      // empty version collection (200), whereas detail/policy are 404.
      expectAgentProbe(agentDefinitionVersions, 'agent.view', 'definition versions', [200])
      if (payload.capabilities['agent.view']) {
        const versionsPayload = await agentDefinitionVersions.json() as { versions?: unknown }
        expect(versionsPayload.versions, `${role} unknown definition version collection`).toEqual([])
      }
      const agentDefinitionPolicy = await page.request.get(`/api/v1/v2/agent-runtime/definitions/${agentProbeId}/policy`)
      expectAgentProbe(agentDefinitionPolicy, 'agent.view', 'definition policy', [404])
      const agentRuns = await page.request.get('/api/v1/v2/agent-runs')
      expectAgentProbe(agentRuns, 'agent.view', 'list runs', [200])
      const agentRun = await page.request.get(`/api/v1/v2/agent-runs/${agentProbeId}`)
      expectAgentProbe(agentRun, 'agent.view', 'run detail', [404])
      const agentEvents = await page.request.get(`/api/v1/v2/agent-runs/${agentProbeId}/events?afterSequence=0&limit=1`)
      expectAgentProbe(agentEvents, 'agent.view', 'persisted event replay', [404])
      const agentEvidence = await page.request.get(`/api/v1/v2/agent-runs/${agentProbeId}/evidence`)
      expectAgentProbe(agentEvidence, 'agent.view', 'run evidence', [404])
      const confirmationPreview = await page.request.get(`/api/v1/v2/agent-runs/${agentProbeId}/confirmations/${agentProbeId}-confirmation/preview`)
      const canInspectConfirmationPreview = payload.capabilities['agent.confirmWrite'] === true && payload.capabilities['formula.viewSensitive'] === true
      expect(confirmationPreview.status(), `${role} bounded confirmation preview authorization boundary`).toBe(canInspectConfirmationPreview ? 404 : 403)
      const createDefinition = await page.request.post('/api/v1/v2/agent-runtime/definitions', { data: {}, headers: agentHeaders('create-definition') })
      expectAgentProbe(createDefinition, 'agent.manageTools', 'create definition', [422])
      const createDefinitionVersion = await page.request.post(`/api/v1/v2/agent-runtime/definitions/${agentProbeId}/versions`, { data: {}, headers: agentHeaders('create-definition-version') })
      expectAgentProbe(createDefinitionVersion, 'agent.manageTools', 'create definition version', [422])
      const updateDefinitionPolicy = await page.request.put(`/api/v1/v2/agent-runtime/definitions/${agentProbeId}/policy`, { data: {}, headers: agentHeaders('update-definition-policy') })
      expectAgentProbe(updateDefinitionPolicy, 'agent.manageTools', 'update definition policy', [422])
      const startAgentRun = await page.request.post('/api/v1/v2/agent-runs', { data: {}, headers: agentHeaders('start-run') })
      expectAgentProbe(startAgentRun, 'agent.execute', 'start run', [422])
      const executeAgentRun = await page.request.post(`/api/v1/v2/agent-runs/${agentProbeId}/execute`, { headers: agentHeaders('execute-run') })
      expectAgentProbe(executeAgentRun, 'agent.execute', 'execute run', [404])
      const retryAgentRun = await page.request.post(`/api/v1/v2/agent-runs/${agentProbeId}/retry`, { headers: agentHeaders('retry-run') })
      expectAgentProbe(retryAgentRun, 'agent.execute', 'retry run', [409])
      const cancelAgentRun = await page.request.delete(`/api/v1/v2/agent-runs/${agentProbeId}`, { headers: agentHeaders('cancel-run') })
      expectAgentProbe(cancelAgentRun, 'agent.execute', 'cancel run', [409])
      const confirmAgentRun = await page.request.post(`/api/v1/v2/agent-runs/${agentProbeId}/confirmations/${agentProbeId}-confirmation`, { data: {}, headers: agentHeaders('confirm-run') })
      expectAgentProbe(confirmAgentRun, 'agent.confirmWrite', 'confirm run write', [404])
      const evaluations = await page.request.get('/api/v1/v2/agent-runtime/evaluations')
      expectAgentProbe(evaluations, 'agent.evaluate', 'list evaluations', [200])
      const evaluation = await page.request.get(`/api/v1/v2/agent-runtime/evaluations/${agentProbeId}`)
      expectAgentProbe(evaluation, 'agent.evaluate', 'evaluation detail', [404])
      const createEvaluation = await page.request.post('/api/v1/v2/agent-runtime/evaluations', { data: {}, headers: agentHeaders('create-evaluation') })
      expectAgentProbe(createEvaluation, 'agent.evaluate', 'create evaluation', [422])
      const agentObservability = await page.request.get('/api/v1/v2/agent-runtime/observability')
      expectAgentProbe(agentObservability, 'agent.observe', 'agent observability', [200])
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
      const canAccessAgentConsole = agentAllowed[role].length > 0
      const agentNavigation = page.locator('.v2-workspace-nav').getByRole('button', { name: 'Agent Console', exact: true })
      if (canAccessAgentConsole) await expect(agentNavigation).toBeVisible()
      else await expect(agentNavigation).toHaveCount(0)
      await page.goto('/v2/workspace/agents')
      if (canAccessAgentConsole) await expect(page.getByTestId('v2-agent-runtime')).toBeVisible()
      else await expect(page.getByText('This section is not available for your role.')).toBeVisible()
      if (role === 'Owner') {
        // `commerce-assistant` is the fixture-safe Phase 9 path: it is
        // read-only and reports Commerce as NOT_CONFIGURED until Phase 10.
        await expect(page.locator('#agent-run-definition')).toBeVisible()
        await page.locator('#agent-run-definition').selectOption('commerce-assistant')
        await page.getByLabel('Run input JSON').fill('{}')
        await page.getByRole('button', { name: 'Start governed run' }).click()
        await expect(page.getByText('Run request recorded. Execution remains server-authoritative.')).toBeVisible()

        const commerceRuns = await page.request.get('/api/v1/v2/agent-runs?definitionKey=commerce-assistant&limit=1')
        expect(commerceRuns.status(), 'Owner can list the UI-created non-destructive run').toBe(200)
        const commercePayload = await commerceRuns.json() as { runs?: Array<{ id?: string; status?: string; definitionKey?: string }> }
        const commerceRun = commercePayload.runs?.[0]
        expect(commerceRun?.id, 'UI-created Commerce run has a durable id').toBeTruthy()
        expect(commerceRun?.definitionKey).toBe('commerce-assistant')
        expect(commerceRun?.status).toBe('QUEUED')

        const firstExecution = await page.request.post(`/api/v1/v2/agent-runs/${commerceRun!.id}/execute`, { headers: agentHeaders('commerce-execute-tool') })
        expect(firstExecution.status(), 'Owner can execute the registered read-only Commerce tool').toBe(201)
        expect((await firstExecution.json() as { run?: { status?: string } }).run?.status).toBe('RUNNING')
        const secondExecution = await page.request.post(`/api/v1/v2/agent-runs/${commerceRun!.id}/execute`, { headers: agentHeaders('commerce-execute-artifact') })
        expect(secondExecution.status(), 'Owner can complete the non-provider artifact step').toBe(201)
        expect((await secondExecution.json() as { run?: { status?: string } }).run?.status).toBe('SUCCEEDED')

        const commerceDetail = await page.request.get(`/api/v1/v2/agent-runs/${commerceRun!.id}?afterSequence=0`)
        expect(commerceDetail.status(), 'Owner can replay the completed non-destructive run').toBe(200)
        const detailPayload = await commerceDetail.json() as { run?: { status?: string }; events?: Array<{ type?: string }>; toolCalls?: Array<{ toolKey?: string; status?: string }> }
        expect(detailPayload.run?.status).toBe('SUCCEEDED')
        expect(detailPayload.toolCalls).toEqual(expect.arrayContaining([expect.objectContaining({ toolKey: 'commerce.status', status: 'SUCCEEDED' })]))
        expect(detailPayload.events?.map((event) => event.type)).toEqual(expect.arrayContaining(['tool.requested', 'tool.completed', 'artifact.created', 'run.completed']))
      }
      for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }, { width: 1440, height: 960 }]) {
        await page.setViewportSize(viewport)
        expect(await page.locator('body').evaluate((element) => element.scrollWidth <= element.clientWidth + 1), `${role} agent console route has horizontal overflow at ${viewport.width}px`).toBe(true)
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
