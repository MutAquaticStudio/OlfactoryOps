import { z } from 'zod'
import { FormulaService } from '../../formula/src/formula-service.js'
import { LabOperationsService } from '../../lab-ops/src/service.js'
import { ProductionService } from '../../production/src/production-service.js'
import { MaterialEvidenceService } from '../../rag/src/material-evidence-service.js'
import { TrialSensoryService } from '../../trials-sensory/src/service.js'
import type { PlatformContext } from '../../platform/src/types.js'
import { PlatformError, PlatformService } from '../../platform/src/service.js'
import { BUILTIN_AGENT_TOOLS } from './builtin-agent-catalog.js'
import { buildBoundedAgentContext } from './context-safety.js'
import type { AgentToolAdapter, AgentToolExecutionContext } from './tool-registry.js'

/**
 * The agent never receives a database client. This is its complete domain
 * boundary: each adapter may call a public V2 service method, which owns RLS,
 * authorization, audit and its own aggregate-specific projections.
 */
export interface AgentDomainTools {
  searchMaterials(context: PlatformContext, input: AgentToolInput): Promise<Record<string, unknown>>
  getMaterial(context: PlatformContext, input: AgentToolInput): Promise<Record<string, unknown>>
  retrieveEvidence(context: PlatformContext, input: AgentToolInput): Promise<Record<string, unknown>>
  inventoryVisibility(context: PlatformContext): Promise<Record<string, unknown>>
  sensoryMemory(context: PlatformContext, input: AgentToolInput): Promise<Record<string, unknown>>
  productionStatus(context: PlatformContext, input: AgentToolInput): Promise<Record<string, unknown>>
  commerceStatus(context: PlatformContext, input: AgentToolInput): Promise<Record<string, unknown>>
  traceability(context: PlatformContext, input: AgentToolInput): Promise<Record<string, unknown>>
  verifyCandidateReference(context: PlatformContext, candidateId: string, formulaProjectId: string): Promise<Readonly<{ candidateId: string; formulaProjectId: string }>>
  saveCandidateDraft(context: PlatformContext, candidateId: string, formulaProjectId: string, idempotencyKey: string): Promise<Record<string, unknown>>
}

const nullableId = z.string().trim().min(1).max(160).optional()
export const agentToolInputSchema = z.object({
  query: z.string().trim().min(1).max(500).optional(),
  materialId: nullableId,
  designProjectId: nullableId,
  candidateId: nullableId,
  formulaProjectId: nullableId,
  formulaVersionId: nullableId,
  trialId: nullableId,
  productionOrderId: nullableId,
  finishedGoodLotId: nullableId,
}).strict()
export type AgentToolInput = z.infer<typeof agentToolInputSchema>

const agentToolOutputSchema = z.record(z.string(), z.unknown())
const safeString = (value: unknown, maximum = 240) => typeof value === 'string' ? value.slice(0, maximum) : undefined
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

function checkAbort(context: AgentToolExecutionContext) {
  if (context.signal.aborted) throw new PlatformError('AGENT_TOOL_CANCELLED', 'The agent tool was cancelled before it completed.', 409)
}

function actorContext(context: AgentToolExecutionContext): PlatformContext {
  // The adapter context intentionally carries the full authenticated session
  // projection. Refuse to synthesize a role, hostname, or session ID from an
  // agent request: domain services rely on all of them for authorization.
  const source = context as AgentToolExecutionContext & Partial<PlatformContext>
  if (!source.sessionId || !source.role || !source.hostname) {
    throw new PlatformError('AGENT_CONTEXT_INVALID', 'The durable agent is missing authenticated workspace context.', 500)
  }
  return {
    organizationId: context.organizationId,
    userId: context.actorUserId,
    sessionId: source.sessionId,
    role: source.role,
    hostname: source.hostname,
  }
}

/** Safe default adapters for V2 services already present in the repository. */
export class DefaultAgentDomainTools implements AgentDomainTools {
  private readonly lab: LabOperationsService
  private readonly evidence: MaterialEvidenceService
  private readonly formula: FormulaService
  private readonly trials: TrialSensoryService
  private readonly production: ProductionService

  constructor(client: ConstructorParameters<typeof LabOperationsService>[0], platform: PlatformService) {
    this.lab = new LabOperationsService(client, platform)
    this.evidence = new MaterialEvidenceService(client, platform)
    this.formula = new FormulaService(client, platform)
    this.trials = new TrialSensoryService(client, platform, this.lab)
    this.production = new ProductionService(client, platform, this.lab)
  }

  async searchMaterials(context: PlatformContext, input: AgentToolInput) {
    const query = input.query?.toLocaleLowerCase() ?? ''
    const materials = await this.lab.listMaterials(context)
    const results = materials
      .filter((material) => {
        const name = safeString(material.name)?.toLocaleLowerCase() ?? ''
        const code = safeString(material.internalCode)?.toLocaleLowerCase() ?? ''
        return !query || name.includes(query) || code.includes(query)
      })
      .slice(0, 20)
      .map((material) => ({
        id: safeString(material.id, 160),
        name: safeString(material.name),
        internalCode: safeString(material.internalCode),
        status: safeString(material.status, 40),
      }))
    return { state: results.length ? 'FOUND' : 'NOT_ENOUGH_EVIDENCE', resultCount: results.length, results }
  }

  async getMaterial(context: PlatformContext, input: AgentToolInput) {
    if (!input.materialId) return { state: 'NOT_REQUESTED', reason: 'No material reference was selected.' }
    const materials = await this.lab.listMaterials(context)
    const material = materials.find((entry) => entry.id === input.materialId)
    if (!material) throw new PlatformError('MATERIAL_NOT_FOUND', 'The selected material is not available in this workspace.', 404)
    return {
      state: 'FOUND',
      material: {
        id: safeString(material.id, 160), name: safeString(material.name), internalCode: safeString(material.internalCode),
        description: safeString(material.description, 600), status: safeString(material.status, 40),
      },
    }
  }

  async retrieveEvidence(context: PlatformContext, input: AgentToolInput) {
    if (!input.materialId || !input.query) return { state: 'NOT_REQUESTED', citations: [] }
    const evidence = await this.evidence.retrieve(context, { materialId: input.materialId, query: input.query, limit: 8 })
    // Evidence prose is untrusted source material. Project it through the
    // context boundary before the tool result can become an artifact.
    const safeContext = buildBoundedAgentContext(context.organizationId, evidence.citations.map((citation) => ({
      organizationId: context.organizationId,
      sourceType: citation.sourceKind,
      sourceId: citation.sourceId,
      excerpt: citation.excerpt,
      citation: { sourceType: citation.sourceKind, sourceId: citation.sourceId, version: citation.version },
      trusted: false,
    })))
    return {
      state: evidence.evidenceStatus,
      materialId: evidence.materialId,
      citations: evidence.citations.map((citation, index) => ({
        sourceId: citation.sourceId, sourceKind: citation.sourceKind, sourceRef: citation.sourceRef,
        version: citation.version, excerptHash: citation.excerptHash, relevance: citation.relevance,
        excerpt: safeContext.items[index]?.excerpt,
        contextTrust: safeContext.items[index]?.trust,
        contextFlags: safeContext.items[index]?.flags,
      })),
    }
  }

  async inventoryVisibility(context: PlatformContext) {
    const summary = await this.lab.inventorySummary(context)
    return {
      state: summary.availableGrams > 0 ? 'AVAILABLE' : 'NOT_EVALUATED',
      lotCount: summary.lotCount, availableGrams: summary.availableGrams,
      reservedGrams: summary.reservedGrams, quarantineLots: summary.quarantineLots,
    }
  }

  async sensoryMemory(context: PlatformContext, input: AgentToolInput) {
    if (!input.formulaVersionId) return { state: 'NOT_REQUESTED', reason: 'A formula version is required for private sensory memory.' }
    const selected = await this.trials.retrieveTrialMemory(context, input.formulaVersionId)
    return {
      state: selected.length ? 'VERIFIED' : 'NOT_ENOUGH_EVIDENCE',
      evidenceCount: selected.length,
      memories: selected.slice(0, 20).map((memory) => ({
        trialId: safeString(memory.trialId, 160), decision: safeString(memory.decision, 40), generatedAt: safeString(memory.generatedAt, 80),
        provenance: asRecord(memory.provenance),
      })),
    }
  }

  async productionStatus(context: PlatformContext, input: AgentToolInput) {
    const orders = await this.production.listOrders(context)
    const selected = input.productionOrderId ? orders.filter((order) => order.id === input.productionOrderId) : orders.slice(0, 20)
    return {
      state: selected.length ? 'VERIFIED' : 'NOT_ENOUGH_EVIDENCE',
      orders: selected.map((order) => {
        const row = asRecord(order)
        return { id: safeString(row.id, 160), orderNumber: safeString(row.orderNumber, 100), status: safeString(row.status, 40), dueAt: safeString(row.dueAt, 80) }
      }),
    }
  }

  async commerceStatus(_context: PlatformContext, _input: AgentToolInput) {
    // Phase 10 owns Commerce. The assistant produces a truthful state, rather
    // than inventing an order result or falling through to a generic database tool.
    return { state: 'NOT_CONFIGURED', reason: 'Commerce records are not available in this phase.' }
  }

  async traceability(context: PlatformContext, input: AgentToolInput) {
    if (input.finishedGoodLotId) {
      const genealogy = await this.production.finishedGoodGenealogy(context, input.finishedGoodLotId)
      return {
        state: 'VERIFIED', lotId: input.finishedGoodLotId, edgeCount: genealogy.edges.length,
        edges: genealogy.edges.map((edge) => ({
          edgeType: edge.edgeType, fromEntityType: edge.fromEntityType, toEntityType: edge.toEntityType, createdAt: edge.createdAt,
        })),
      }
    }
    const lots = await this.production.listFinishedGoodLots(context)
    return {
      state: lots.length ? 'VERIFIED' : 'NOT_ENOUGH_EVIDENCE',
      lotCount: lots.length,
      lots: lots.slice(0, 20).map((lot) => ({ id: safeString(lot.id, 160), lotNumber: safeString(lot.lotNumber, 100), status: safeString(lot.status, 40) })),
    }
  }

  async verifyCandidateReference(context: PlatformContext, candidateId: string, formulaProjectId: string) {
    const binding = await this.formula.verifyCandidateDraftBinding(context, candidateId, formulaProjectId)
    // saveCandidateAsDraft repeats this bound candidate-to-Design-Project-to-
    // Formula-Project check, state, material eligibility and exact composition
    // immediately before the domain write.
    return Object.freeze(binding)
  }

  async saveCandidateDraft(context: PlatformContext, candidateId: string, formulaProjectId: string, idempotencyKey: string) {
    return this.formula.saveCandidateAsDraft(context, candidateId, formulaProjectId, idempotencyKey)
  }
}

function adapter(
  toolKey: keyof typeof BUILTIN_AGENT_TOOLS,
  execute: (context: AgentToolExecutionContext, input: AgentToolInput) => Promise<Record<string, unknown>>,
): AgentToolAdapter {
  return {
    definition: BUILTIN_AGENT_TOOLS[toolKey],
    // The generic registry accepts unknown at its outer boundary. Parse again
    // here so every domain adapter receives the exact closed input shape.
    inputSchema: agentToolInputSchema as unknown as z.ZodType<unknown>,
    outputSchema: agentToolOutputSchema as unknown as z.ZodType<unknown>,
    maxInputBytes: 8 * 1024, maxOutputBytes: 24 * 1024,
    execute: async (context, input) => {
      const parsed = agentToolInputSchema.parse(input)
      checkAbort(context)
      const result = await execute(context, parsed)
      checkAbort(context)
      return result
    },
  }
}

/** Builds the fixed safe adapter set. There is intentionally no generic DB/HTTP adapter. */
export function builtinAgentToolAdapters(domain: AgentDomainTools): readonly AgentToolAdapter[] {
  return Object.freeze([
    adapter('material.search', (context, input) => domain.searchMaterials(actorContext(context), input)),
    adapter('material.get', (context, input) => domain.getMaterial(actorContext(context), input)),
    adapter('evidence.search', (context, input) => domain.retrieveEvidence(actorContext(context), input)),
    adapter('inventory.visibility', (context) => domain.inventoryVisibility(actorContext(context))),
    adapter('sensory.memory.search', (context, input) => domain.sensoryMemory(actorContext(context), input)),
    adapter('production.status', (context, input) => domain.productionStatus(actorContext(context), input)),
    adapter('commerce.status', (context, input) => domain.commerceStatus(actorContext(context), input)),
    adapter('qa.traceability', (context, input) => domain.traceability(actorContext(context), input)),
    // The registry must know this mutation exists, but pipeline execution never
    // invokes it. DurableAgentService does so only after a scoped confirmation.
    adapter('formula.candidate_save_draft', async () => {
      throw new PlatformError('AGENT_CONFIRMATION_REQUIRED', 'Saving a candidate draft requires an explicit confirmation.', 409)
    }),
  ])
}
