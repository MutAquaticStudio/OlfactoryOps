import { createHash, randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import {
  scientificFeatureRequestSchema,
  scientificRuntimeResponseSchema,
  structureNormalizeRequestSchema,
  type ScientificFeatureRequest,
  type ScientificRuntimeResponse,
  type StructureNormalizeRequest,
} from '../../../packages/contracts/src/scientific.js'
import { PlatformError, PlatformService } from '../../platform/src/service.js'
import type { PlatformContext } from '../../platform/src/types.js'
import type { CloudScientificDispatcher } from './cloud-dispatch.js'

type Transaction = Prisma.TransactionClient
type JsonRecord = Record<string, unknown>
type IdempotencyRow = { requestHash: string; response: unknown }
type MaterialRow = { id: string; molecularIdentityId: string | null }
type IdentityRow = { id: string; canonicalSmiles: string; structureHash: string; rdkitVersion: string; standardizationVersion: string }
type CloudScientificJobRow = {
  id: string
  materialId: string
  correlationId: string
  requestHash: string
  cloudInput: { canonicalSmiles: string; featureKinds: ScientificFeatureRequest['featureKinds'] } | null
}

export interface ScientificRuntime {
  normalize(input: StructureNormalizeRequest): Promise<ScientificRuntimeResponse>
  generateFeatures(input: { canonicalSmiles: string; featureKinds: ScientificFeatureRequest['featureKinds'] }): Promise<ScientificRuntimeResponse>
}

export class ScientificRuntimeUnavailable implements ScientificRuntime {
  async normalize(): Promise<ScientificRuntimeResponse> { throw new Error('SCIENTIFIC_RUNTIME_NOT_CONFIGURED') }
  async generateFeatures(): Promise<ScientificRuntimeResponse> { throw new Error('SCIENTIFIC_RUNTIME_NOT_CONFIGURED') }
}

/**
 * The Osmordred pin is built against RDKit 2023.09.3 while BCFP and MolFTP
 * are built against RDKit 2026. Keep those binary ABIs out of one process and
 * combine only validated, immutable feature artifacts at this boundary.
 */
export class CompositeScientificRuntime implements ScientificRuntime {
  constructor(
    private readonly primary: ScientificRuntime,
    private readonly osmordred?: ScientificRuntime,
  ) {}

  async normalize(input: StructureNormalizeRequest) {
    return this.primary.normalize(input)
  }

  async generateFeatures(input: { canonicalSmiles: string; featureKinds: ScientificFeatureRequest['featureKinds'] }) {
    const wantsOsmordred = input.featureKinds.includes('OSMORDRED')
    if (!wantsOsmordred) return this.primary.generateFeatures(input)

    const primaryKinds = input.featureKinds.filter((kind) => kind !== 'OSMORDRED') as ScientificFeatureRequest['featureKinds']
    const primaryResult = primaryKinds.length
      ? await this.primary.generateFeatures({ canonicalSmiles: input.canonicalSmiles, featureKinds: primaryKinds })
      : undefined
    const osmordredRuntime = this.osmordred ?? this.primary
    const osmordredResult = await osmordredRuntime.generateFeatures({ canonicalSmiles: input.canonicalSmiles, featureKinds: ['OSMORDRED'] })

    if (primaryResult && primaryResult.structure.structureHash !== osmordredResult.structure.structureHash) {
      throw new Error('SCIENTIFIC_RUNTIME_STRUCTURE_MISMATCH')
    }

    return {
      runtimeVersion: `olfactoryops-scientific-composite/${primaryResult?.runtimeVersion ?? 'isolated'}+${osmordredResult.runtimeVersion}`,
      structure: primaryResult?.structure ?? osmordredResult.structure,
      artifacts: [...(primaryResult?.artifacts ?? []), ...osmordredResult.artifacts],
    }
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as JsonRecord).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value: unknown) { return createHash('sha256').update(stableJson(value)).digest('hex') }
function identifier(prefix: string) { return `${prefix}_${randomUUID().replaceAll('-', '')}` }
function iso(value: Date | null | undefined) { return value?.toISOString() ?? null }

function runtimeFailureCode(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('NOT_CONFIGURED')) return 'SCIENTIFIC_RUNTIME_NOT_CONFIGURED'
  if (message.includes('INVALID_SMILES')) return 'INVALID_MOLECULAR_STRUCTURE'
  if (message.includes('TIMEOUT')) return 'SCIENTIFIC_RUNTIME_TIMEOUT'
  return 'SCIENTIFIC_RUNTIME_FAILED'
}

/**
 * Phase 3 persistence boundary. The API owns tenant resolution, permissions,
 * idempotency and audit; the isolated scientific runtime only receives bounded
 * chemistry input and can never select an organization or mutate business data.
 */
export class ScientificFeatureService {
  constructor(
    private readonly client: PrismaClient,
    private readonly platform: PlatformService,
    private readonly runtime: ScientificRuntime = new ScientificRuntimeUnavailable(),
    private readonly cloudDispatcher?: CloudScientificDispatcher,
  ) {}

  private async scoped<T>(context: PlatformContext, action: (tx: Transaction) => Promise<T>) {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true), set_config('app.user_id', ${context.userId}, true)`
      return action(tx)
    })
  }

  private async audit(tx: Transaction, context: PlatformContext, action: string, outcome: 'allowed' | 'blocked', subjectType: string, subjectId: string, payload?: unknown) {
    await tx.$executeRaw`
      INSERT INTO v2_audit_events (id, organization_id, actor_user_id, action, outcome, subject_type, subject_id, correlation_id, payload_hash)
      VALUES (${identifier('audit')}, ${context.organizationId}, ${context.userId}, ${action}, ${outcome}, ${subjectType}, ${subjectId}, ${identifier('corr')}, ${payload === undefined ? null : digest(payload)})
    `
  }

  private async require(context: PlatformContext) {
    await this.platform.requirePermission(context, 'materials.viewSensitive')
    await this.platform.requirePermission(context, 'scientific_ai.use')
  }

  private async material(tx: Transaction, context: PlatformContext, materialId: string): Promise<MaterialRow> {
    const rows = await tx.$queryRaw<MaterialRow[]>`
      SELECT id, molecular_identity_id AS "molecularIdentityId"
      FROM v2_materials WHERE id = ${materialId} AND organization_id = ${context.organizationId}
    `
    const material = rows[0]
    if (!material) throw new PlatformError('MATERIAL_NOT_FOUND', 'The requested material is not available in this workspace.', 404)
    return material
  }

  private async idempotent<T extends JsonRecord>(context: PlatformContext, route: string, key: string | undefined, request: unknown, action: (tx: Transaction) => Promise<T>) {
    if (!key || key.length < 12 || key.length > 200) throw new PlatformError('IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key for this operation.', 428)
    const requestHash = digest(request)
    return this.scoped(context, async (tx) => {
      const existing = await tx.$queryRaw<IdempotencyRow[]>`
        SELECT request_hash AS "requestHash", response FROM v2_operation_idempotency
        WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}
      `
      if (existing.length) {
        if (existing[0].requestHash !== requestHash) throw new PlatformError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request.', 409)
        if (!existing[0].response) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
        return existing[0].response as T
      }
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO v2_operation_idempotency (id, organization_id, actor_user_id, route, idempotency_key, request_hash)
        VALUES (${identifier('idem')}, ${context.organizationId}, ${context.userId}, ${route}, ${key}, ${requestHash})
        ON CONFLICT (organization_id, actor_user_id, route, idempotency_key) DO NOTHING
        RETURNING id
      `
      if (!inserted.length) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
      const result = await action(tx)
      await tx.$executeRaw`
        UPDATE v2_operation_idempotency SET response = ${JSON.stringify(result)}::jsonb
        WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}
      `
      return result
    })
  }

  private async createJob(tx: Transaction, context: PlatformContext, materialId: string, operation: 'STRUCTURE_NORMALIZE' | 'FEATURE_GENERATE', requestHash: string, idempotencyKey: string) {
    const id = identifier('sciencejob')
    const pin = await tx.$queryRaw<Array<{ manifestHash: string }>>`SELECT manifest_hash AS "manifestHash" FROM v2_scientific_component_pins WHERE component_key = 'RDKIT'`
    await tx.$executeRaw`
      INSERT INTO v2_scientific_jobs (id, organization_id, material_id, requested_by, operation, status, request_hash, idempotency_key, component_manifest_hash, correlation_id, started_at)
      VALUES (${id}, ${context.organizationId}, ${materialId}, ${context.userId}, ${operation}, 'RUNNING', ${requestHash}, ${idempotencyKey}, ${pin[0]?.manifestHash ?? digest('missing-pin')}, ${identifier('corr')}, now())
    `
    return id
  }

  private async saveArtifact(tx: Transaction, context: PlatformContext, jobId: string, materialId: string, artifact: { kind: 'STRUCTURE' | 'ECFP' | 'BCFP' | 'MOLFTP' | 'OSMORDRED'; status: string; schemaVersion: string; componentKey: string; componentVersion: string; inputHash: string; contentHash: string; payload: JsonRecord; provenance: unknown[] }) {
    await tx.$executeRaw`
      INSERT INTO v2_scientific_artifacts (id, organization_id, material_id, job_id, artifact_kind, evidence_status, schema_version, component_key, component_version, input_hash, content_hash, payload, provenance)
      VALUES (${identifier('scienceartifact')}, ${context.organizationId}, ${materialId}, ${jobId}, ${artifact.kind}, ${artifact.status}, ${artifact.schemaVersion}, ${artifact.componentKey}, ${artifact.componentVersion}, ${artifact.inputHash}, ${artifact.contentHash}, ${JSON.stringify(artifact.payload)}::jsonb, ${JSON.stringify(artifact.provenance)}::jsonb)
      ON CONFLICT (job_id, artifact_kind) DO NOTHING
    `
  }

  private jobProjection(jobId: string, materialId: string, operation: 'STRUCTURE_NORMALIZE' | 'FEATURE_GENERATE', requestHash: string, status: 'QUEUED' | 'SUCCEEDED' | 'FAILED', failureCode?: string) {
    return { id: jobId, materialId, operation, status, requestHash, failureCode: failureCode ?? null }
  }

  private async reserveCloudFeatureJob(context: PlatformContext, materialId: string, input: ScientificFeatureRequest, idempotencyKey: string) {
    const route = 'scientific.features.generate'
    const request = { materialId, ...input }
    const requestHash = digest(request)
    return this.scoped(context, async (tx) => {
      const material = await this.material(tx, context, materialId)
      if (!material.molecularIdentityId) throw new PlatformError('MOLECULAR_IDENTITY_REQUIRED', 'Normalize a molecular structure before generating features.', 409)
      const identityRows = await tx.$queryRaw<IdentityRow[]>`
        SELECT id, canonical_smiles AS "canonicalSmiles", structure_hash AS "structureHash", rdkit_version AS "rdkitVersion", standardization_version AS "standardizationVersion"
        FROM v2_molecular_identities WHERE id = ${material.molecularIdentityId} AND organization_id = ${context.organizationId} AND resolution_status = 'RESOLVED'
      `
      const identity = identityRows[0]
      if (!identity) throw new PlatformError('MOLECULAR_IDENTITY_REQUIRED', 'Normalize a molecular structure before generating features.', 409)

      const existing = await tx.$queryRaw<IdempotencyRow[]>`
        SELECT request_hash AS "requestHash", response FROM v2_operation_idempotency
        WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${idempotencyKey}
      `
      if (existing[0]) {
        if (existing[0].requestHash !== requestHash) throw new PlatformError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request.', 409)
        const jobs = await tx.$queryRaw<CloudScientificJobRow[]>`
          SELECT id, material_id AS "materialId", correlation_id AS "correlationId", request_hash AS "requestHash", cloud_input AS "cloudInput"
          FROM v2_scientific_jobs
          WHERE organization_id = ${context.organizationId} AND requested_by = ${context.userId} AND operation = 'FEATURE_GENERATE' AND idempotency_key = ${idempotencyKey}
        `
        const job = jobs[0]
        if (!job?.cloudInput) throw new PlatformError('SCIENTIFIC_JOB_NOT_FOUND', 'The queued scientific job is not available in this workspace.', 404)
        return { job, response: existing[0].response as JsonRecord | null }
      }

      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO v2_operation_idempotency (id, organization_id, actor_user_id, route, idempotency_key, request_hash)
        VALUES (${identifier('idem')}, ${context.organizationId}, ${context.userId}, ${route}, ${idempotencyKey}, ${requestHash})
        ON CONFLICT (organization_id, actor_user_id, route, idempotency_key) DO NOTHING
        RETURNING id
      `
      if (!inserted[0]) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
      const pins = await tx.$queryRaw<Array<{ manifestHash: string }>>`SELECT manifest_hash AS "manifestHash" FROM v2_scientific_component_pins WHERE component_key = 'RDKIT'`
      const job: CloudScientificJobRow = {
        id: identifier('sciencejob'), materialId, correlationId: identifier('corr'), requestHash,
        cloudInput: { canonicalSmiles: identity.canonicalSmiles, featureKinds: input.featureKinds },
      }
      await tx.$executeRaw`
        INSERT INTO v2_scientific_jobs (id, organization_id, material_id, requested_by, operation, status, request_hash, idempotency_key, component_manifest_hash, correlation_id, cloud_input)
        VALUES (${job.id}, ${context.organizationId}, ${materialId}, ${context.userId}, 'FEATURE_GENERATE', 'QUEUED', ${requestHash}, ${idempotencyKey}, ${pins[0]?.manifestHash ?? digest('missing-pin')}, ${job.correlationId}, ${JSON.stringify(job.cloudInput)}::jsonb)
      `
      await this.audit(tx, context, 'scientific.features.dispatch', 'allowed', 'scientific_job', job.id, { materialId, requestHash, featureKinds: input.featureKinds })
      return { job, response: null }
    })
  }

  private async persistCloudFeatureResponse(context: PlatformContext, idempotencyKey: string, requestHash: string, response: JsonRecord) {
    await this.scoped(context, async (tx) => {
      await tx.$executeRaw`
        UPDATE v2_operation_idempotency SET response = ${JSON.stringify(response)}::jsonb
        WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId}
          AND route = 'scientific.features.generate' AND idempotency_key = ${idempotencyKey} AND request_hash = ${requestHash}
      `
    })
  }

  private async enqueueCloudFeatures(context: PlatformContext, materialId: string, input: ScientificFeatureRequest, idempotencyKey: string) {
    const reserved = await this.reserveCloudFeatureJob(context, materialId, input, idempotencyKey)
    if (reserved.response) return reserved.response
    const job = reserved.job
    const dispatch = await this.cloudDispatcher!.dispatchFeatures({
      jobId: job.id,
      organizationId: context.organizationId,
      actorUserId: context.userId,
      correlationId: job.correlationId,
      idempotencyKey,
      canonicalSmiles: job.cloudInput!.canonicalSmiles,
      featureKinds: job.cloudInput!.featureKinds,
    }).catch((error: unknown) => {
      const code = runtimeFailureCode(error)
      throw new PlatformError(code, 'The private scientific runtime is temporarily unavailable. Retry with the same idempotency key.', code === 'SCIENTIFIC_RUNTIME_NOT_CONFIGURED' ? 503 : 502)
    })
    const response = {
      ...this.jobProjection(job.id, job.materialId, 'FEATURE_GENERATE', job.requestHash, 'QUEUED'),
      dispatch: { id: dispatch.dispatchId, queued: dispatch.queued },
    }
    await this.persistCloudFeatureResponse(context, idempotencyKey, job.requestHash, response)
    return response
  }

  async normalizeMaterial(context: PlatformContext, materialId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context)
    const input = structureNormalizeRequestSchema.safeParse(rawInput)
    if (!input.success) throw new PlatformError('INVALID_INPUT', 'Provide a valid, bounded SMILES string.', 422)
    return this.idempotent(context, 'scientific.structure.normalize', idempotencyKey, { materialId, ...input.data }, async (tx) => {
      await this.material(tx, context, materialId)
      const requestHash = digest({ materialId, ...input.data })
      const jobId = await this.createJob(tx, context, materialId, 'STRUCTURE_NORMALIZE', requestHash, idempotencyKey!)
      try {
        const runtime = scientificRuntimeResponseSchema.parse(await this.runtime.normalize(input.data))
        const structure = runtime.structure
        const identityId = identifier('molid')
        await tx.$executeRaw`
          INSERT INTO v2_molecular_identities (id, organization_id, resolution_status, canonical_smiles, inchi, inchikey, structure_hash, input_hash, output_hash, canonicalization_version, standardization_version, rdkit_version, molecular_graph, provenance, created_by, updated_at)
          VALUES (${identityId}, ${context.organizationId}, 'RESOLVED', ${structure.canonicalSmiles}, ${structure.inchi}, ${structure.inchiKey}, ${structure.structureHash}, ${structure.inputHash}, ${structure.outputHash}, ${structure.standardizationVersion}, ${structure.standardizationVersion}, ${structure.rdkitVersion}, ${JSON.stringify(structure.molecularGraph)}::jsonb, ${JSON.stringify([{ kind: 'component', id: 'RDKIT', version: structure.rdkitVersion }])}::jsonb, ${context.userId}, now())
        `
        await tx.$executeRaw`UPDATE v2_materials SET molecular_identity_id = ${identityId}, updated_at = now() WHERE id = ${materialId} AND organization_id = ${context.organizationId}`
        await this.saveArtifact(tx, context, jobId, materialId, {
          kind: 'STRUCTURE', status: 'VERIFIED', schemaVersion: 'structure/1.0.0', componentKey: 'RDKIT', componentVersion: structure.rdkitVersion,
          inputHash: structure.inputHash, contentHash: structure.outputHash, payload: { canonicalSmiles: structure.canonicalSmiles, inchi: structure.inchi, inchiKey: structure.inchiKey, graph: structure.molecularGraph },
          provenance: [{ kind: 'component', id: 'RDKIT', version: structure.rdkitVersion }],
        })
        await tx.$executeRaw`UPDATE v2_scientific_jobs SET status = 'SUCCEEDED', runtime_version = ${runtime.runtimeVersion}, completed_at = now() WHERE id = ${jobId} AND organization_id = ${context.organizationId}`
        await this.audit(tx, context, 'scientific.structure.normalize', 'allowed', 'scientific_job', jobId, { materialId, inputHash: structure.inputHash, outputHash: structure.outputHash })
        return { ...this.jobProjection(jobId, materialId, 'STRUCTURE_NORMALIZE', requestHash, 'SUCCEEDED'), structure: { canonicalSmiles: structure.canonicalSmiles, structureHash: structure.structureHash, rdkitVersion: structure.rdkitVersion } }
      } catch (error) {
        const failureCode = runtimeFailureCode(error)
        await tx.$executeRaw`UPDATE v2_scientific_jobs SET status = 'FAILED', failure_code = ${failureCode}, completed_at = now() WHERE id = ${jobId} AND organization_id = ${context.organizationId}`
        await this.audit(tx, context, 'scientific.structure.normalize', 'blocked', 'scientific_job', jobId, { materialId, failureCode })
        return this.jobProjection(jobId, materialId, 'STRUCTURE_NORMALIZE', requestHash, 'FAILED', failureCode)
      }
    })
  }

  async generateFeatures(context: PlatformContext, materialId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.require(context)
    const input = scientificFeatureRequestSchema.safeParse(rawInput)
    if (!input.success) throw new PlatformError('INVALID_INPUT', 'Choose one or more supported feature artifacts.', 422)
    if (this.cloudDispatcher) {
      if (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 200) throw new PlatformError('IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key for this operation.', 428)
      return this.enqueueCloudFeatures(context, materialId, input.data, idempotencyKey)
    }
    return this.idempotent(context, 'scientific.features.generate', idempotencyKey, { materialId, ...input.data }, async (tx) => {
      const material = await this.material(tx, context, materialId)
      if (!material.molecularIdentityId) throw new PlatformError('MOLECULAR_IDENTITY_REQUIRED', 'Normalize a molecular structure before generating features.', 409)
      const identities = await tx.$queryRaw<IdentityRow[]>`
        SELECT id, canonical_smiles AS "canonicalSmiles", structure_hash AS "structureHash", rdkit_version AS "rdkitVersion", standardization_version AS "standardizationVersion"
        FROM v2_molecular_identities WHERE id = ${material.molecularIdentityId} AND organization_id = ${context.organizationId} AND resolution_status = 'RESOLVED'
      `
      const identity = identities[0]
      if (!identity) throw new PlatformError('MOLECULAR_IDENTITY_REQUIRED', 'Normalize a molecular structure before generating features.', 409)
      const requestHash = digest({ materialId, structureHash: identity.structureHash, ...input.data })
      const jobId = await this.createJob(tx, context, materialId, 'FEATURE_GENERATE', requestHash, idempotencyKey!)
      try {
        const runtime = scientificRuntimeResponseSchema.parse(await this.runtime.generateFeatures({ canonicalSmiles: identity.canonicalSmiles, featureKinds: input.data.featureKinds }))
        if (runtime.structure.structureHash !== identity.structureHash) throw new Error('SCIENTIFIC_RUNTIME_STRUCTURE_MISMATCH')
        for (const artifact of runtime.artifacts) {
          await this.saveArtifact(tx, context, jobId, materialId, artifact)
        }
        await tx.$executeRaw`UPDATE v2_scientific_jobs SET status = 'SUCCEEDED', runtime_version = ${runtime.runtimeVersion}, completed_at = now() WHERE id = ${jobId} AND organization_id = ${context.organizationId}`
        await this.audit(tx, context, 'scientific.features.generate', 'allowed', 'scientific_job', jobId, { materialId, structureHash: identity.structureHash, featureKinds: input.data.featureKinds })
        return { ...this.jobProjection(jobId, materialId, 'FEATURE_GENERATE', requestHash, 'SUCCEEDED'), artifactCount: runtime.artifacts.length }
      } catch (error) {
        const failureCode = runtimeFailureCode(error)
        await tx.$executeRaw`UPDATE v2_scientific_jobs SET status = 'FAILED', failure_code = ${failureCode}, completed_at = now() WHERE id = ${jobId} AND organization_id = ${context.organizationId}`
        await this.audit(tx, context, 'scientific.features.generate', 'blocked', 'scientific_job', jobId, { materialId, failureCode })
        return this.jobProjection(jobId, materialId, 'FEATURE_GENERATE', requestHash, 'FAILED', failureCode)
      }
    })
  }

  async materialArtifacts(context: PlatformContext, materialId: string) {
    await this.require(context)
    return this.scoped(context, async (tx) => {
      await this.material(tx, context, materialId)
      const rows = await tx.$queryRaw<Array<{ id: string; artifactKind: string; evidenceStatus: string; schemaVersion: string; componentKey: string; componentVersion: string; inputHash: string; contentHash: string; payload: JsonRecord; provenance: unknown; createdAt: Date }>>`
        SELECT id, artifact_kind AS "artifactKind", evidence_status AS "evidenceStatus", schema_version AS "schemaVersion", component_key AS "componentKey", component_version AS "componentVersion", input_hash AS "inputHash", content_hash AS "contentHash", payload, provenance, created_at AS "createdAt"
        FROM v2_scientific_artifacts WHERE organization_id = ${context.organizationId} AND material_id = ${materialId}
        ORDER BY created_at DESC, id DESC
      `
      return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
    })
  }

  async job(context: PlatformContext, jobId: string) {
    await this.require(context)
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; materialId: string; operation: 'STRUCTURE_NORMALIZE' | 'FEATURE_GENERATE'; status: string; requestHash: string; failureCode: string | null; createdAt: Date; completedAt: Date | null }>>`
        SELECT id, material_id AS "materialId", operation, status, request_hash AS "requestHash", failure_code AS "failureCode", created_at AS "createdAt", completed_at AS "completedAt"
        FROM v2_scientific_jobs WHERE id = ${jobId} AND organization_id = ${context.organizationId}
      `
      const job = rows[0]
      if (!job) throw new PlatformError('SCIENTIFIC_JOB_NOT_FOUND', 'The requested scientific job is not available in this workspace.', 404)
      return { ...job, createdAt: job.createdAt.toISOString(), completedAt: iso(job.completedAt) }
    })
  }
}
