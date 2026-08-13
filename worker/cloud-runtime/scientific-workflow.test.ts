import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  inputs: new Map<string, Record<string, unknown>>(),
  reads: [] as Array<{ organizationId: string; key: string }>,
  writes: [] as Array<{ organizationId: string; artifactRef: string; key: string }>,
  completions: [] as Array<{ organizationId: string; jobId: string; resultArtifactRef: string }>,
  containerRequests: [] as Array<Record<string, unknown>>,
  containerBindings: [] as unknown[],
}))

vi.mock('cloudflare:workers', () => ({
  WorkflowEntrypoint: class {
    protected readonly env: unknown

    constructor(_ctx: unknown, env: unknown) {
      this.env = env
    }
  },
}))

vi.mock('@cloudflare/containers', () => ({
  getRandom: vi.fn(async (binding: { stub: DurableObjectStub }) => {
    state.containerBindings.push(binding)
    return binding.stub
  }),
}))

vi.mock('./artifact-store.js', () => ({
  PrivateArtifactStore: class {
    async get(organizationId: string, key: string) {
      state.reads.push({ organizationId, key })
      const input = state.inputs.get(key)
      if (!input) throw new Error('MISSING_TEST_INPUT')
      return { text: async () => JSON.stringify(input) }
    }

    async put(manifest: { organizationId: string; artifactRef: string }) {
      const key = `v2/${manifest.organizationId}/scientific/${manifest.artifactRef}`
      state.writes.push({ organizationId: manifest.organizationId, artifactRef: manifest.artifactRef, key })
      return { key, version: 'test', etag: 'test' }
    }
  },
}))

vi.mock('./hyperdrive.js', () => ({ createHyperdrivePrisma: vi.fn(() => ({ $disconnect: vi.fn() })) }))

vi.mock('./job-ledger.js', () => ({
  CloudJobLedger: class {
    async complete(job: { organizationId: string; jobId: string }, resultArtifactRef: string) {
      state.completions.push({ organizationId: job.organizationId, jobId: job.jobId, resultArtifactRef })
    }

    async workflowFailed(_job: unknown, error: unknown) {
      throw error
    }
  },
}))

vi.mock('./scientific-input.js', () => ({
  loadPrivateScientificInput: vi.fn(async (job: { artifactRef: string }) => state.inputs.get(job.artifactRef)),
  sha256: vi.fn(async () => 'a'.repeat(64)),
}))

vi.mock('../../services/scientific/src/cloud-completion.js', () => ({ completeCloudScientificFeature: vi.fn(async () => undefined) }))

describe('ScientificJobWorkflow container pool tenancy', () => {
  it('keeps two tenant inputs, artifacts, and completions scoped while jobs share bounded container lanes', async () => {
    const { ScientificJobWorkflow } = await import('./scientific-workflow.js')
    const featureContainer = {
      stub: {
        runScientificJob: async (request: Record<string, unknown>) => {
          state.containerRequests.push(request)
          return { status: 200, body: JSON.stringify({ payload: { jobId: request.jobId }, runtimeVersion: 'scientific-test/1', componentVersions: {} }) }
        },
      } as unknown as DurableObjectStub,
    }
    const modelContainer = {
      stub: {
        runScientificJob: async (request: Record<string, unknown>) => {
          state.containerRequests.push(request)
          return { status: 200, body: JSON.stringify({ payload: { evidenceStatus: 'NOT_CONFIGURED', jobId: request.jobId }, runtimeVersion: 'model-test/1', componentVersions: {} }) }
        },
      } as unknown as DurableObjectStub,
    }
    const env = {
      SCIENTIFIC_FEATURE_CONTAINER: featureContainer,
      SCIENTIFIC_MODEL_CONTAINER: modelContainer,
      HYPERDRIVE: {},
      R2_ARTIFACTS: {},
      SCIENTIFIC_CONTAINER_SHARED_SECRET: 'test-secret',
      RELEASE_GIT_SHA: 'a'.repeat(40),
    }
    const feature = {
      protocolVersion: 'cloud-runtime/v1' as const,
      jobId: 'feature_job_a',
      organizationId: 'org_a',
      actorUserId: 'user_a',
      correlationId: 'corr_a',
      idempotencyKey: 'feature-idempotency-key-a',
      jobType: 'SCIENTIFIC_FEATURE' as const,
      artifactRef: 'v2/org_a/scientific/input-a',
      inputHash: 'a'.repeat(64),
      createdAt: '2026-08-13T00:00:00.000Z',
    }
    const model = {
      ...feature,
      jobId: 'model_job_b',
      organizationId: 'org_b',
      actorUserId: 'user_b',
      correlationId: 'corr_b',
      idempotencyKey: 'model-idempotency-key-b',
      jobType: 'SCIENTIFIC_MODEL' as const,
      artifactRef: 'v2/org_b/scientific/input-b',
      inputHash: 'b'.repeat(64),
    }
    state.inputs.set(feature.artifactRef, { canonicalSmiles: 'CCO', featureKinds: ['ECFP'] })
    state.inputs.set(model.artifactRef, { requestKind: 'MODEL_SMOKE', modelVersion: 'model/1' })
    const step = { do: async (_name: string, _options: unknown, operation?: () => Promise<unknown>) => {
      const callback = typeof _options === 'function' ? _options : operation
      return callback?.()
    } }

    await Promise.all([
      new ScientificJobWorkflow({} as never, env as never).run({ payload: feature } as never, step as never),
      new ScientificJobWorkflow({} as never, env as never).run({ payload: model } as never, step as never),
    ])

    expect(state.reads).toEqual([
      { organizationId: 'org_a', key: feature.artifactRef },
      { organizationId: 'org_b', key: model.artifactRef },
    ])
    expect(state.writes.map((item) => item.organizationId).sort()).toEqual(['org_a', 'org_b'])
    expect(state.writes.every((item) => item.key.startsWith(`v2/${item.organizationId}/`))).toBe(true)
    expect(state.completions.map((item) => item.organizationId).sort()).toEqual(['org_a', 'org_b'])
    expect(state.containerBindings).toEqual(expect.arrayContaining([featureContainer, modelContainer]))
    expect(state.containerRequests.every((item) => !('organizationId' in item))).toBe(true)
  })
})
