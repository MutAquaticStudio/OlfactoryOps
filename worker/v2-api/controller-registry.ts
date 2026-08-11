import { V2AgentRuntimeCatalogController, V2AgentRuntimeController } from '../../server/src/routes/v2-agent-runtime.worker.js'
import { V2ConsumerIntelligenceController } from '../../server/src/routes/v2-consumer-intelligence.worker.js'
import { V2FormulaIntelligenceController } from '../../server/src/routes/v2-formula-intelligence.worker.js'
import { V2LabOperationsController } from '../../server/src/routes/v2-lab-operations.worker.js'
import { V2MaterialEvidenceController } from '../../server/src/routes/v2-material-evidence.worker.js'
import { V2ModelDatasetController } from '../../server/src/routes/v2-model-dataset.worker.js'
import { V2OlfactoryIntelligenceController } from '../../server/src/routes/v2-olfactory-intelligence.worker.js'
import { V2PlatformController } from '../../server/src/routes/v2-platform.worker.js'
import { V2PlatformAdminController } from '../../server/src/routes/v2-platform-admin.worker.js'
import { V2ScientificController } from '../../server/src/routes/v2-scientific.worker.js'
import { generatedRouteSpecs } from './generated-route-specs.js'
import type { V2ApiServices } from './service-container.js'

export type ControllerMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type ParameterSource = 'REQUEST' | 'RESPONSE' | 'BODY' | 'QUERY' | 'PARAM' | 'HEADER'
export type ControllerParameter = { index: number; source: ParameterSource; name?: string; passthrough?: boolean }
export type ControllerRoute = {
  method: ControllerMethod
  path: string
  controller: object
  handler: string
  parameters: ControllerParameter[]
}

/**
 * This is deliberately metadata-derived rather than a hand-maintained mirror
 * of Nest controller paths. Adding a Phase 1-6 controller handler changes the
 * Worker transport and generated route matrix together.
 */
export function v2ControllerRoutes(services: V2ApiServices): ControllerRoute[] {
  const instances: Record<string, object> = {
    platform: new V2PlatformController(services.platform, services.databaseHealth),
    platformAdmin: new V2PlatformAdminController(services.platformAdmin, services.platform),
    lab: new V2LabOperationsController(services.platform, services.lab),
    scientific: new V2ScientificController(services.platform, services.scientific),
    modelDataset: new V2ModelDatasetController(services.platform, services.modelDataset),
    olfactory: new V2OlfactoryIntelligenceController(services.platform, services.olfactory),
    consumer: new V2ConsumerIntelligenceController(services.platform, services.consumer),
    formula: new V2FormulaIntelligenceController(services.platform, services.formula),
    evidence: new V2MaterialEvidenceController(services.platform, services.evidence),
    agentRuns: new V2AgentRuntimeController(services.platform, services.agent),
    agentCatalog: new V2AgentRuntimeCatalogController(services.platform, services.agent),
  }
  return generatedRouteSpecs.map((route) => ({
    method: route.method as ControllerMethod,
    path: route.path,
    controller: instances[route.controller]!,
    handler: route.handler,
    parameters: route.parameters as ControllerParameter[],
  }))
}
