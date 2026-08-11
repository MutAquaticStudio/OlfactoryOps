import { cloudJobEnvelopeSchema, safeCloudError, type CloudJobEnvelope } from './contracts.js'
import { createHyperdrivePrisma } from './hyperdrive.js'
import { CloudJobLedger } from './job-ledger.js'
import { CloudQueueDispatcher } from './queue-dispatcher.js'
import { ScientificFeatureContainer, ScientificModelContainer } from './scientific-containers.js'
import { ScientificJobWorkflow, type CloudScientificEnv } from './scientific-workflow.js'

export { ScientificFeatureContainer, ScientificJobWorkflow, ScientificModelContainer }

export interface CloudRuntimeEnv extends CloudScientificEnv {
  SCIENTIFIC_JOBS: Queue<CloudJobEnvelope>
  RAG_INGESTION_JOBS: Queue<CloudJobEnvelope>
  NOTIFICATION_DELIVERY_JOBS: Queue<CloudJobEnvelope>
  SCIENTIFIC_WORKFLOW: Workflow<CloudJobEnvelope>
  RELEASE_ENVIRONMENT?: string
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

async function handleQueue(env: CloudRuntimeEnv, message: Message<CloudJobEnvelope>): Promise<void> {
  const job = cloudJobEnvelopeSchema.parse(message.body)
  const ledger = new CloudJobLedger(createHyperdrivePrisma(env))
  const reservation = await ledger.reserveWorkflow(job)
  if (!reservation.shouldCreate) {
    message.ack()
    return
  }
  if (job.jobType !== 'SCIENTIFIC_FEATURE' && job.jobType !== 'SCIENTIFIC_MODEL') {
    await ledger.fail(job, new Error('CLOUD_JOB_HANDLER_NOT_CONFIGURED'))
    message.retry({ delaySeconds: 30 })
    return
  }
  try {
    const instance = await env.SCIENTIFIC_WORKFLOW.create({ id: reservation.workflowInstanceId, params: job })
    await ledger.attachWorkflow(job, instance.id)
    message.ack()
  } catch (error) {
    if (isExistingWorkflow(error)) {
      message.ack()
      return
    }
    await ledger.fail(job, error)
    message.retry({ delaySeconds: 30 })
  }
}

function isExistingWorkflow(error: unknown): boolean {
  return error instanceof Error && /already exists|duplicate/i.test(error.message)
}

export default {
  async fetch(request: Request, env: CloudRuntimeEnv): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') {
      try {
        const prisma = createHyperdrivePrisma(env)
        await prisma.$queryRawUnsafe('SELECT 1')
        await prisma.$disconnect()
        return json(200, { status: 'ok', runtime: 'cloud-runtime/v1', database: 'hyperdrive', environment: env.RELEASE_ENVIRONMENT ?? 'unconfigured' })
      } catch {
        return json(503, { status: 'blocked', code: 'HYPERDRIVE_NOT_CONFIGURED' })
      }
    }
    if (request.method === 'POST' && url.pathname === '/internal/scientific-dispatch') {
      if (env.RELEASE_ENVIRONMENT !== 'staging' || request.headers.get('x-olfactoryops-internal-dispatch') !== 'cloud-runtime/v1') {
        return json(403, { code: 'INTERNAL_DISPATCH_DENIED' })
      }
      try {
        const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
        if (!contentType.includes('application/json')) return json(415, { code: 'INVALID_CONTENT_TYPE' })
        const body = await request.text()
        if (body.length > 16_384) return json(413, { code: 'DISPATCH_TOO_LARGE' })
        const job = cloudJobEnvelopeSchema.parse(JSON.parse(body))
        if (job.jobType !== 'SCIENTIFIC_FEATURE' && job.jobType !== 'SCIENTIFIC_MODEL') return json(422, { code: 'CLOUD_JOB_HANDLER_NOT_CONFIGURED' })
        const result = await new CloudQueueDispatcher(new CloudJobLedger(createHyperdrivePrisma(env)), env).dispatch(job)
        return json(202, result)
      } catch (error) {
        return json(500, { code: safeCloudError(error) })
      }
    }
    return json(404, { code: 'NOT_FOUND' })
  },
  async queue(batch: MessageBatch<unknown>, env: CloudRuntimeEnv): Promise<void> {
    for (const message of batch.messages) {
      try {
        await handleQueue(env, message as Message<CloudJobEnvelope>)
      } catch (error) {
        message.retry({ delaySeconds: 30 })
        console.log(JSON.stringify({ event: 'cloud_job_retried', code: safeCloudError(error) }))
      }
    }
  },
} satisfies ExportedHandler<CloudRuntimeEnv>
