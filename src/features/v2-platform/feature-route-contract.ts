export type WorkspaceFeatureKey =
  | 'workspace'
  | 'materials'
  | 'formulas'
  | 'design-studio'
  | 'trials'
  | 'production'
  | 'commerce'
  | 'agents'
  | 'advanced'
  | 'suppliers'
  | 'inventory'
  | 'procurement'
  | 'security'
  | 'members'
  | 'domains'
  | 'billing'
  | 'notifications'
  | 'privacy'
  | 'observability'

export type ProductionFeatureClassification =
  | 'PRODUCTION_SUPPORTED'
  | 'INTENTIONALLY_NOT_PRODUCTION_READY'

export type WorkspaceFeatureRoute = {
  key: WorkspaceFeatureKey
  feature: string
  uiComponent: string
  navPath: string
  apiClient: string
  apiBase: string
  endpoints: readonly string[]
  httpMethods: readonly string[]
  workerRoutePresent: boolean
  controllerPresent: boolean
  servicePresent: boolean
  rbacCapabilities: readonly string[]
  productionRuntimeAvailable: boolean
  expectedProductionState: string
  classification: ProductionFeatureClassification
  publicAvailability: 'ENABLED' | 'DISABLED' | 'CLIENT_ONLY'
}

export const workspaceFeatureRouteContract: readonly WorkspaceFeatureRoute[] = [
  {
    key: 'workspace', feature: 'Protected workspace', uiComponent: 'WorkspaceView', navPath: '/v2/workspace',
    apiClient: 'request', apiBase: '/api/v1/v2/platform', endpoints: ['/auth/csrf/bootstrap', '/me'], httpMethods: ['POST', 'GET'],
    workerRoutePresent: true, controllerPresent: true, servicePresent: true, rbacCapabilities: ['tenant.view'], productionRuntimeAvailable: true,
    expectedProductionState: 'Authenticated tenant workspace is available.', classification: 'PRODUCTION_SUPPORTED', publicAvailability: 'ENABLED',
  },
  {
    key: 'materials', feature: 'Materials', uiComponent: 'LabOperationsPanel', navPath: '/v2/workspace/materials',
    apiClient: 'labRequest', apiBase: '/api/v1/v2/lab', endpoints: ['/materials'], httpMethods: ['GET', 'POST'],
    workerRoutePresent: true, controllerPresent: true, servicePresent: true, rbacCapabilities: ['materials.view'], productionRuntimeAvailable: true,
    expectedProductionState: 'Tenant-scoped lab operations are available.', classification: 'PRODUCTION_SUPPORTED', publicAvailability: 'ENABLED',
  },
  {
    key: 'formulas', feature: 'Formulas', uiComponent: 'FormulaIntelligencePanel', navPath: '/v2/workspace/formulas',
    apiClient: 'formulaRequest', apiBase: '/api/v1/v2/formula-intelligence', endpoints: ['/projects', '/drafts'], httpMethods: ['GET', 'POST', 'PUT'],
    workerRoutePresent: true, controllerPresent: true, servicePresent: true, rbacCapabilities: ['formula.view'], productionRuntimeAvailable: true,
    expectedProductionState: 'Formula project and draft workflows are available.', classification: 'PRODUCTION_SUPPORTED', publicAvailability: 'ENABLED',
  },
  {
    key: 'design-studio', feature: 'Design Studio', uiComponent: 'FormulaIntelligencePanel', navPath: '/v2/workspace/design-studio',
    apiClient: 'formulaRequest', apiBase: '/api/v1/v2/formula-intelligence', endpoints: ['/design-projects'], httpMethods: ['GET', 'POST'],
    workerRoutePresent: true, controllerPresent: true, servicePresent: true, rbacCapabilities: ['formula.edit'], productionRuntimeAvailable: true,
    expectedProductionState: 'Formula design workflows are available.', classification: 'PRODUCTION_SUPPORTED', publicAvailability: 'ENABLED',
  },
  {
    key: 'trials', feature: 'Trials & Sensory', uiComponent: 'TrialsSensoryWorkspace', navPath: '/v2/workspace/trials',
    apiClient: 'authenticatedTrialsRequest', apiBase: '/api/v1/v2/trials', endpoints: ['/'], httpMethods: ['GET', 'POST', 'PATCH'],
    workerRoutePresent: false, controllerPresent: true, servicePresent: true, rbacCapabilities: ['trials.viewAll', 'trials.viewAssigned'], productionRuntimeAvailable: false,
    expectedProductionState: 'Disabled until the public Worker runtime is explicitly extended.', classification: 'INTENTIONALLY_NOT_PRODUCTION_READY', publicAvailability: 'DISABLED',
  },
  {
    key: 'production', feature: 'Production', uiComponent: 'ProductionWorkspace', navPath: '/v2/workspace/production',
    apiClient: 'productionRequest', apiBase: '/api/v1/v2/production', endpoints: ['/'], httpMethods: ['GET', 'POST', 'PATCH'],
    workerRoutePresent: false, controllerPresent: true, servicePresent: true, rbacCapabilities: ['production.view'], productionRuntimeAvailable: false,
    expectedProductionState: 'Disabled until the public Worker runtime is explicitly extended.', classification: 'INTENTIONALLY_NOT_PRODUCTION_READY', publicAvailability: 'DISABLED',
  },
  {
    key: 'commerce', feature: 'Commerce', uiComponent: 'CommerceWorkspace', navPath: '/v2/workspace/commerce',
    apiClient: 'commerceRequest', apiBase: '/api/v1/v2/commerce', endpoints: ['/'], httpMethods: ['GET', 'POST', 'PATCH'],
    workerRoutePresent: false, controllerPresent: true, servicePresent: true, rbacCapabilities: ['commerce.view', 'orders.view'], productionRuntimeAvailable: false,
    expectedProductionState: 'Disabled until the public Worker runtime is explicitly extended.', classification: 'INTENTIONALLY_NOT_PRODUCTION_READY', publicAvailability: 'DISABLED',
  },
  {
    key: 'agents', feature: 'Agent Console', uiComponent: 'AgentRuntimeWorkspace', navPath: '/v2/workspace/agents',
    apiClient: 'agentRuntimeRequest', apiBase: '/api/v1/v2/agent-runtime', endpoints: ['/definitions', '/agent-runs'], httpMethods: ['GET', 'POST', 'PATCH'],
    workerRoutePresent: true, controllerPresent: true, servicePresent: true, rbacCapabilities: ['agent.view', 'agent.execute', 'agent.manageTools', 'agent.confirmWrite', 'agent.evaluate', 'agent.observe'], productionRuntimeAvailable: true,
    expectedProductionState: 'Agent run and catalog routes are available.', classification: 'PRODUCTION_SUPPORTED', publicAvailability: 'ENABLED',
  },
  {
    key: 'advanced', feature: 'Optimizer & DataOps', uiComponent: 'AdvancedWorkspace', navPath: '/v2/workspace/advanced',
    apiClient: 'advancedRequest', apiBase: '/api/v1/v2/advanced', endpoints: ['/'], httpMethods: ['GET', 'POST'],
    workerRoutePresent: false, controllerPresent: true, servicePresent: true, rbacCapabilities: ['optimizer.view', 'imports.view', 'dataops.view', 'bulk.preview'], productionRuntimeAvailable: false,
    expectedProductionState: 'Disabled until its runtime configuration and Worker routes are released.', classification: 'INTENTIONALLY_NOT_PRODUCTION_READY', publicAvailability: 'DISABLED',
  },
  {
    key: 'suppliers', feature: 'Suppliers', uiComponent: 'LabOperationsPanel', navPath: '/v2/workspace/suppliers',
    apiClient: 'labRequest', apiBase: '/api/v1/v2/lab', endpoints: ['/suppliers'], httpMethods: ['GET', 'POST'],
    workerRoutePresent: true, controllerPresent: true, servicePresent: true, rbacCapabilities: ['suppliers.view'], productionRuntimeAvailable: true,
    expectedProductionState: 'Tenant-scoped supplier operations are available.', classification: 'PRODUCTION_SUPPORTED', publicAvailability: 'ENABLED',
  },
  {
    key: 'inventory', feature: 'Inventory', uiComponent: 'LabOperationsPanel', navPath: '/v2/workspace/inventory',
    apiClient: 'labRequest', apiBase: '/api/v1/v2/lab', endpoints: ['/inventory/lots'], httpMethods: ['GET'],
    workerRoutePresent: true, controllerPresent: true, servicePresent: true, rbacCapabilities: ['inventory.view'], productionRuntimeAvailable: true,
    expectedProductionState: 'Tenant-scoped inventory reads are available.', classification: 'PRODUCTION_SUPPORTED', publicAvailability: 'ENABLED',
  },
  {
    key: 'procurement', feature: 'Procurement', uiComponent: 'LabOperationsPanel', navPath: '/v2/workspace/procurement',
    apiClient: 'labRequest', apiBase: '/api/v1/v2/lab', endpoints: ['/procurement/overview', '/materials'], httpMethods: ['GET', 'POST'],
    workerRoutePresent: true, controllerPresent: true, servicePresent: true, rbacCapabilities: ['procurement.view'], productionRuntimeAvailable: true,
    expectedProductionState: 'Tenant-scoped procurement workflows are available.', classification: 'PRODUCTION_SUPPORTED', publicAvailability: 'ENABLED',
  },
  {
    key: 'security', feature: 'Platform security', uiComponent: 'V2Section', navPath: '/v2/workspace/security',
    apiClient: 'request', apiBase: '/api/v1/v2/platform', endpoints: ['/security/password', '/security/email'], httpMethods: ['POST'],
    workerRoutePresent: true, controllerPresent: true, servicePresent: true, rbacCapabilities: ['security.sessions.view'], productionRuntimeAvailable: true,
    expectedProductionState: 'Credential-management actions retain server-side authorization.', classification: 'PRODUCTION_SUPPORTED', publicAvailability: 'ENABLED',
  },
  {
    key: 'members', feature: 'Members & roles', uiComponent: 'V2Section', navPath: '/v2/workspace/members',
    apiClient: 'request', apiBase: '/api/v1/v2/platform', endpoints: ['/workspace/members', '/workspace/invitations'], httpMethods: ['GET', 'POST'],
    workerRoutePresent: true, controllerPresent: true, servicePresent: true, rbacCapabilities: ['members.view'], productionRuntimeAvailable: true,
    expectedProductionState: 'Membership views and authorized invitation actions are available.', classification: 'PRODUCTION_SUPPORTED', publicAvailability: 'ENABLED',
  },
  {
    key: 'domains', feature: 'Workspace domains', uiComponent: 'V2Section', navPath: '/v2/workspace/domains',
    apiClient: 'client-only', apiBase: 'none', endpoints: [], httpMethods: [],
    workerRoutePresent: false, controllerPresent: false, servicePresent: false, rbacCapabilities: ['domains.view'], productionRuntimeAvailable: true,
    expectedProductionState: 'Informational system-hostname surface; customer domains are not self-service.', classification: 'PRODUCTION_SUPPORTED', publicAvailability: 'CLIENT_ONLY',
  },
  {
    key: 'billing', feature: 'Managed beta', uiComponent: 'V2Section', navPath: '/v2/workspace/billing',
    apiClient: 'client-only', apiBase: 'none', endpoints: [], httpMethods: [],
    workerRoutePresent: false, controllerPresent: false, servicePresent: false, rbacCapabilities: ['billing.capabilities'], productionRuntimeAvailable: true,
    expectedProductionState: 'Informational managed-beta surface; self-service billing is disabled.', classification: 'PRODUCTION_SUPPORTED', publicAvailability: 'CLIENT_ONLY',
  },
  {
    key: 'notifications', feature: 'Notifications', uiComponent: 'V2Section', navPath: '/v2/workspace/notifications',
    apiClient: 'client-only', apiBase: 'none', endpoints: [], httpMethods: [],
    workerRoutePresent: false, controllerPresent: false, servicePresent: false, rbacCapabilities: ['notifications.view'], productionRuntimeAvailable: true,
    expectedProductionState: 'Informational tenant-scoped preferences surface.', classification: 'PRODUCTION_SUPPORTED', publicAvailability: 'CLIENT_ONLY',
  },
  {
    key: 'privacy', feature: 'Privacy & exports', uiComponent: 'V2Section', navPath: '/v2/workspace/privacy',
    apiClient: 'request', apiBase: '/api/v1/v2/platform', endpoints: ['/workspace/exports/privacy', '/workspace/consents'], httpMethods: ['POST'],
    workerRoutePresent: true, controllerPresent: true, servicePresent: true, rbacCapabilities: ['security.profile.view'], productionRuntimeAvailable: true,
    expectedProductionState: 'Privacy actions retain server-side authorization.', classification: 'PRODUCTION_SUPPORTED', publicAvailability: 'ENABLED',
  },
  {
    key: 'observability', feature: 'Observability', uiComponent: 'ObservabilityPanel', navPath: '/v2/workspace/observability',
    apiClient: 'request', apiBase: '/api/v1/v2/platform', endpoints: ['/workspace/observability'], httpMethods: ['GET'],
    workerRoutePresent: true, controllerPresent: true, servicePresent: true, rbacCapabilities: ['observability.view'], productionRuntimeAvailable: true,
    expectedProductionState: 'Authorized tenant observability is available.', classification: 'PRODUCTION_SUPPORTED', publicAvailability: 'ENABLED',
  },
] as const

export const workspaceFeatureRouteByKey = new Map(workspaceFeatureRouteContract.map((feature) => [feature.key, feature]))

export function featureCapabilities(key: string) {
  return workspaceFeatureRouteByKey.get(key as WorkspaceFeatureKey)?.rbacCapabilities ?? []
}

export function isWorkspaceFeatureAvailableInPublicCutover(key: string, publicCutover: boolean) {
  const feature = workspaceFeatureRouteByKey.get(key as WorkspaceFeatureKey)
  if (!feature) return false
  return !publicCutover || feature.publicAvailability !== 'DISABLED'
}

export function productionVisibleDeadRouteCount() {
  return workspaceFeatureRouteContract.filter((feature) => feature.publicAvailability === 'ENABLED' && feature.apiClient !== 'client-only' && !feature.workerRoutePresent).length
}
