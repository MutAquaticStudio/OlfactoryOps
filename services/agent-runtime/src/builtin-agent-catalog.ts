import type { AgentVersionRecord, AgentWorkflow, ToolDefinition } from '../contracts.js'
import { AGENT_RUNTIME_LIMITS, agentWorkflowSchema, validateToolDefinition } from '../contracts.js'

export const BUILTIN_AGENT_KEYS = Object.freeze([
  'formula-research',
  'material-intelligence',
  'inventory-assistant',
  'sensory-analysis',
  'production-assistant',
  'commerce-assistant',
  'qa-traceability',
] as const)
export type BuiltinAgentKey = typeof BUILTIN_AGENT_KEYS[number]

const readTool = (name: string, description: string, permissions: string[]): ToolDefinition => validateToolDefinition({
  tool: { name, version: '1.0.0' }, description, mode: 'READ_ONLY',
  permissions: permissions.map((permissionKey) => ({ permissionKey, required: true })),
  input: { schemaVersion: 'tool/1', jsonSchema: { type: 'object' } },
  output: { schemaVersion: 'tool/1', jsonSchema: { type: 'object' } },
  timeout: { timeoutMs: 3_000 }, retry: { maxAttempts: 2, backoffMs: 250, retryableErrors: ['TIMEOUT', 'TRANSIENT'] },
  confirmation: { required: false }, auditEventType: 'agent.tool.called',
})

export const BUILTIN_AGENT_TOOLS = Object.freeze({
  'material.search': readTool('material.search', 'Search materials visible to the active workspace.', ['materials.view']),
  'material.get': readTool('material.get', 'Read an authorized material profile.', ['materials.view']),
  'evidence.search': readTool('evidence.search', 'Retrieve bounded approved evidence citations.', ['rag.view']),
  'inventory.visibility': readTool('inventory.visibility', 'Read safe inventory feasibility evidence.', ['inventory.view']),
  'sensory.memory.search': readTool('sensory.memory.search', 'Read tenant-private sensory memory evidence.', ['sensory.view', 'trials.viewAll']),
  'production.status': readTool('production.status', 'Read safe production status and blockers.', ['production.view']),
  'commerce.status': readTool('commerce.status', 'Read authorized commercial order status.', ['orders.view']),
  'qa.traceability': readTool('qa.traceability', 'Read authorized traceability evidence.', ['production.finishedGoods.view', 'production.documents.view']),
  'formula.candidate_save_draft': validateToolDefinition({
    tool: { name: 'formula.candidate_save_draft', version: '1.0.0' }, description: 'Save a reviewed Formula candidate as a draft after explicit confirmation.', mode: 'MUTATING',
    permissions: [{ permissionKey: 'formula.edit', required: true }, { permissionKey: 'agent.confirmWrite', required: true }],
    input: { schemaVersion: 'tool/1', jsonSchema: { type: 'object' } }, output: { schemaVersion: 'tool/1', jsonSchema: { type: 'object' } },
    timeout: { timeoutMs: 10_000 }, retry: { maxAttempts: 1, backoffMs: 0, retryableErrors: [] }, confirmation: { required: true, expiresInSeconds: 86_400 }, auditEventType: 'agent.tool.called',
  }),
})

export type BuiltinAgentTemplate = Readonly<{
  key: BuiltinAgentKey
  displayName: string
  description: string
  policyVersion: string
  version: string
  workflow: AgentWorkflow
  toolManifest: AgentVersionRecord['toolManifest']
  policy: Readonly<{
    allowedToolKeys: readonly string[]
    allowedProviderKeys: readonly string[]
    maxRunsPerActor: number
    maxRunsPerTenant: number
  }>
}>

function workflow(key: BuiltinAgentKey, nodes: AgentWorkflow['nodes']) {
  return agentWorkflowSchema.parse({ workflowKey: `${key}/1`, schemaVersion: 'workflow/1', nodes })
}

const artifactNode = (dependsOn: string[]) => ({ key: 'summary', kind: 'ARTIFACT' as const, artifactType: 'agent_summary', dependsOn, inputSchemaVersion: 'artifact/1', outputSchemaVersion: 'artifact/1', timeoutMs: 500, maxAttempts: 1 })
const toolNode = (key: string, toolKey: string, dependsOn: string[] = []) => ({ key, kind: 'TOOL' as const, toolKey, dependsOn, inputSchemaVersion: 'tool/1', outputSchemaVersion: 'tool/1', timeoutMs: BUILTIN_AGENT_TOOLS[toolKey as keyof typeof BUILTIN_AGENT_TOOLS].timeout.timeoutMs, maxAttempts: 1 })

const template = (key: BuiltinAgentKey, displayName: string, description: string, nodes: AgentWorkflow['nodes'], allowedToolKeys: string[]): BuiltinAgentTemplate => Object.freeze({
  key, displayName, description, policyVersion: 'policy/1', version: '1.0.0', workflow: workflow(key, nodes),
  toolManifest: allowedToolKeys.map((toolKey) => {
    const tool = BUILTIN_AGENT_TOOLS[toolKey as keyof typeof BUILTIN_AGENT_TOOLS].tool
    return { name: tool.name, version: tool.version }
  }),
  policy: Object.freeze({ allowedToolKeys: Object.freeze([...allowedToolKeys]), allowedProviderKeys: Object.freeze([]), maxRunsPerActor: 2, maxRunsPerTenant: 10 }),
})

export const BUILTIN_AGENT_CATALOG: Readonly<Record<BuiltinAgentKey, BuiltinAgentTemplate>> = Object.freeze({
  'formula-research': template('formula-research', 'Formula Research', 'Researches authorized materials and evidence for a reviewed creative brief.', [
    toolNode('search_materials', 'material.search'), toolNode('retrieve_evidence', 'evidence.search', ['search_materials']), artifactNode(['search_materials', 'retrieve_evidence']),
    { key: 'confirm_candidate_draft', kind: 'CONFIRMATION', confirmationIntent: 'CANDIDATE_SAVE_DRAFT', conditionKey: 'candidate_reference_present', dependsOn: ['summary'], inputSchemaVersion: 'confirmation/1', outputSchemaVersion: 'confirmation/1', timeoutMs: 500, maxAttempts: 1 },
  ], ['material.search', 'evidence.search', 'formula.candidate_save_draft']),
  'material-intelligence': template('material-intelligence', 'Material Intelligence', 'Finds authorized material profiles and cited evidence.', [
    toolNode('read_material', 'material.get'), toolNode('retrieve_evidence', 'evidence.search', ['read_material']), artifactNode(['read_material', 'retrieve_evidence']),
  ], ['material.get', 'evidence.search']),
  'inventory-assistant': template('inventory-assistant', 'Inventory Assistant', 'Explains authorized inventory feasibility without making stock changes.', [
    toolNode('review_inventory', 'inventory.visibility'), artifactNode(['review_inventory']),
  ], ['inventory.visibility']),
  'sensory-analysis': template('sensory-analysis', 'Sensory Analysis', 'Summarizes tenant-private sensory evidence without changing formulas.', [
    toolNode('retrieve_sensory_memory', 'sensory.memory.search'), artifactNode(['retrieve_sensory_memory']),
  ], ['sensory.memory.search']),
  'production-assistant': template('production-assistant', 'Production Assistant', 'Explains production stage status and blockers without changing a batch.', [
    toolNode('review_production', 'production.status'), artifactNode(['review_production']),
  ], ['production.status']),
  'commerce-assistant': template('commerce-assistant', 'Commerce Assistant', 'Explains authorized order and fulfillment state without changing an order.', [
    toolNode('review_commerce', 'commerce.status'), artifactNode(['review_commerce']),
  ], ['commerce.status']),
  'qa-traceability': template('qa-traceability', 'QA and Traceability Assistant', 'Summarizes authorized finished-good traceability evidence.', [
    toolNode('review_traceability', 'qa.traceability'), artifactNode(['review_traceability']),
  ], ['qa.traceability']),
})

export function builtinAgentTemplate(value: string): BuiltinAgentTemplate {
  if (!(BUILTIN_AGENT_KEYS as readonly string[]).includes(value)) throw new Error('The requested built-in agent is not registered.')
  return BUILTIN_AGENT_CATALOG[value as BuiltinAgentKey]
}

export function builtinAgentTemplates() {
  return BUILTIN_AGENT_KEYS.map((key) => BUILTIN_AGENT_CATALOG[key])
}

export function assertBuiltinCatalogBounds() {
  for (const item of builtinAgentTemplates()) {
    if (item.workflow.nodes.length > AGENT_RUNTIME_LIMITS.maxNodesPerRun) throw new Error(`Built-in workflow ${item.key} exceeds the node limit.`)
    const attempts = item.workflow.nodes.filter((node) => node.kind === 'TOOL').reduce((total, node) => total + node.maxAttempts, 0)
    if (attempts > AGENT_RUNTIME_LIMITS.maxToolCallsPerRun) throw new Error(`Built-in workflow ${item.key} exceeds the tool-call limit.`)
  }
  return true
}
