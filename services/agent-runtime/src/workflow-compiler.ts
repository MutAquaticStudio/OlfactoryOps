import { createHash } from 'node:crypto'
import {
  AGENT_RUNTIME_LIMITS,
  assertPublishedAgentVersion,
  type AgentDefinitionRecord,
  type AgentPolicyRecord,
  type AgentVersionRecord,
  type AgentWorkflowNode,
} from '../contracts.js'
import type { CompiledAgentToolRegistry } from './tool-registry.js'
import { PlatformError } from '../../platform/src/service.js'

export type CompiledWorkflowNode = Readonly<{
  key: string
  kind: AgentWorkflowNode['kind']
  dependsOn: readonly string[]
  toolKey?: string
  toolVersion?: string
  providerKey?: string
  artifactType?: string
  confirmationIntent?: 'CANDIDATE_SAVE_DRAFT'
  conditionKey?: string
  inputSchemaVersion: string
  outputSchemaVersion: string
  timeoutMs: number
  maxAttempts: number
}>

export type CompiledAgentWorkflow = Readonly<{
  definition: Readonly<Pick<AgentDefinitionRecord, 'id' | 'key' | 'policyVersion' | 'defaultVersion'>>
  version: Readonly<{
    id: string
    version: string
    policyVersion: string
    providerKey?: string | null
  }>
  policy: Readonly<{
    id: string
    version: string
    allowedToolKeys: readonly string[]
    allowedProviderKeys: readonly string[]
    maxRunsPerActor: number
    maxRunsPerTenant: number
  }>
  workflowKey: string
  workflowSchemaVersion: string
  nodes: readonly CompiledWorkflowNode[]
  hash: string
}>

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  return JSON.stringify(value)
}

function topologicalNodes(nodes: readonly AgentWorkflowNode[]): AgentWorkflowNode[] {
  const byKey = new Map(nodes.map((node) => [node.key, node]))
  const resolved = new Set<string>()
  const ordered: AgentWorkflowNode[] = []
  while (ordered.length < nodes.length) {
    const next = nodes.find((node) => !resolved.has(node.key) && node.dependsOn.every((dependency) => resolved.has(dependency)))
    if (!next) throw new PlatformError('AGENT_WORKFLOW_CYCLE', 'The agent workflow cannot be compiled because its dependencies are cyclic.', 422)
    if (!byKey.has(next.key)) throw new PlatformError('AGENT_WORKFLOW_INVALID', 'The agent workflow cannot be compiled.', 422)
    resolved.add(next.key)
    ordered.push(next)
  }
  return ordered
}

/**
 * Resolves only published configuration and creates an immutable run snapshot.
 * The service persists this exact compiled payload at run creation and never
 * re-resolves mutable definition or policy records during a later execution.
 */
export function compileAgentWorkflow(input: Readonly<{
  definition: AgentDefinitionRecord
  version: AgentVersionRecord
  policy: AgentPolicyRecord
  registry: CompiledAgentToolRegistry
}>): CompiledAgentWorkflow {
  const { definition, version, policy, registry } = input
  assertPublishedAgentVersion(definition, version, policy)
  const ordered = topologicalNodes(version.workflow.nodes)
  if (ordered.length > AGENT_RUNTIME_LIMITS.maxNodesPerRun) throw new PlatformError('AGENT_WORKFLOW_NODE_LIMIT', 'The selected agent workflow exceeds its node limit.', 422)
  const compiledNodes = ordered.map<CompiledWorkflowNode>((node) => {
    if (node.kind === 'TOOL') {
      const manifest = version.toolManifest.find((tool) => tool.name === node.toolKey)
      if (!manifest || !node.toolKey || !registry.has(node.toolKey, manifest.version)) {
        throw new PlatformError('AGENT_TOOL_VERSION_UNAVAILABLE', 'A published tool version is unavailable for this agent workflow.', 409)
      }
      return Object.freeze({ ...node, dependsOn: Object.freeze([...node.dependsOn]), toolVersion: manifest.version })
    }
    return Object.freeze({ ...node, dependsOn: Object.freeze([...node.dependsOn]) })
  })
  const snapshot = {
    definition: Object.freeze({ id: definition.id, key: definition.key, policyVersion: definition.policyVersion, defaultVersion: definition.defaultVersion }),
    version: Object.freeze({ id: version.id, version: version.version, policyVersion: version.policyVersion, providerKey: version.providerKey ?? null }),
    policy: Object.freeze({
      id: policy.id, version: policy.version, allowedToolKeys: Object.freeze([...policy.allowedToolKeys].sort()), allowedProviderKeys: Object.freeze([...policy.allowedProviderKeys].sort()),
      maxRunsPerActor: policy.maxRunsPerActor, maxRunsPerTenant: policy.maxRunsPerTenant,
    }),
    workflowKey: version.workflow.workflowKey,
    workflowSchemaVersion: version.workflow.schemaVersion,
    nodes: compiledNodes,
  }
  return Object.freeze({ ...snapshot, nodes: Object.freeze(compiledNodes), hash: createHash('sha256').update(stableJson(snapshot)).digest('hex') })
}

export function runnableWorkflowNodes(workflow: CompiledAgentWorkflow, nodeStatuses: ReadonlyMap<string, string>) {
  return workflow.nodes.filter((node) => {
    const status = nodeStatuses.get(node.key)
    if (status && status !== 'PENDING') return false
    return node.dependsOn.every((dependency) => nodeStatuses.get(dependency) === 'SUCCEEDED')
  })
}
