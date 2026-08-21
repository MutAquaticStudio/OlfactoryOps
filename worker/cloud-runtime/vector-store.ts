import { vectorQuerySchema, vectorWriteSchema, type VectorQuery, type VectorWrite } from './contracts.js'

type VectorBindings = {
  MATERIAL_EVIDENCE_VECTORS: Vectorize
}

function indexFor(env: VectorBindings, space: VectorWrite['space']): Vectorize {
  if (space !== 'MATERIAL_EVIDENCE') throw new Error('VECTOR_SPACE_NOT_CONFIGURED')
  return env.MATERIAL_EVIDENCE_VECTORS
}

/**
 * Staging exposes only the explicitly approved BGE-M3 Material Evidence
 * index. Molecular serving dimensionality and odor retrieval remain
 * unconfigured research work, so no request can select an undeployed index.
 */
export class TenantVectorStore {
  constructor(private readonly env: VectorBindings) {}

  async upsert(input: VectorWrite): Promise<{ mutationId: string }> {
    const vector = vectorWriteSchema.parse(input)
    const result = await indexFor(this.env, vector.space).upsert([{
      id: vector.vectorId,
      values: vector.values,
      metadata: {
        organizationId: vector.organizationId,
        artifactRef: vector.artifactRef,
        embeddingVersion: vector.embeddingVersion,
        modelVersion: vector.modelVersion,
        sourceKind: vector.sourceKind,
        status: vector.status,
      },
    }])
    return { mutationId: result.mutationId }
  }

  async query(input: VectorQuery) {
    const request = vectorQuerySchema.parse(input)
    const result = await indexFor(this.env, request.space).query(request.values, {
      topK: request.limit,
      returnMetadata: 'indexed',
      filter: {
        organizationId: request.organizationId,
        embeddingVersion: request.embeddingVersion,
        modelVersion: request.modelVersion,
        status: 'READY',
      },
    })
    return result.matches.filter((match) => {
      const metadata = match.metadata ?? {}
      return metadata.organizationId === request.organizationId
        && metadata.embeddingVersion === request.embeddingVersion
        && metadata.modelVersion === request.modelVersion
        && metadata.status === 'READY'
    })
  }
}
