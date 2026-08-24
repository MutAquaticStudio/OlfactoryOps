import { cloudJobEnvelopeSchema, isStagingDlqTerminalFailureProbe, type CloudJobEnvelope } from './contracts.js'
import { createHyperdrivePrisma } from './hyperdrive.js'
import { CloudJobLedger } from './job-ledger.js'
import { processPasswordResetDeliveries, type PasswordResetDeliveryEnv } from './password-reset-delivery.js'

export type CloudQueueConsumerEnv = PasswordResetDeliveryEnv & {
  SCIENTIFIC_WORKFLOW: Workflow<CloudJobEnvelope>
  RELEASE_ENVIRONMENT?: string
}

type QueueLedger = Pick<CloudJobLedger, 'recordStagingDlqProbeFailure' | 'reserveWorkflow' | 'claim' | 'complete' | 'fail' | 'attachWorkflow'>

export async function handleCloudQueueMessage(
  env: CloudQueueConsumerEnv,
  message: Message<CloudJobEnvelope>,
  ledgerFactory: () => QueueLedger = () => new CloudJobLedger(createHyperdrivePrisma(env)),
): Promise<void> {
  const job = cloudJobEnvelopeSchema.parse(message.body)
  const ledger = ledgerFactory()
  if (isStagingDlqTerminalFailureProbe(job)) {
    if (env.RELEASE_ENVIRONMENT !== 'staging') {
      // A privileged operator cannot turn this staging fixture into a
      // production delivery failure. It is deliberately ignored outside the
      // staging runtime before any database or business operation is touched.
      message.ack()
      console.log(JSON.stringify({ event: 'staging_dlq_probe_denied', jobId: job.jobId }))
      return
    }
    const result = await ledger.recordStagingDlqProbeFailure(job)
    console.log(JSON.stringify({ event: 'staging_dlq_probe_delivery_failed', jobId: job.jobId, correlationId: job.correlationId, attempts: result.attempts, recorded: result.recorded }))
    // Do not acknowledge. Cloudflare Queue owns retry/DLQ delivery semantics.
    message.retry({ delaySeconds: 5 })
    return
  }
  if (job.jobType === 'NOTIFICATION_DELIVERY') {
    const claimed = await ledger.claim(job)
    if (!claimed) {
      message.ack()
      return
    }
    try {
      const delivery = await processPasswordResetDeliveries(env, job.organizationId)
      if (delivery.retry) {
        await ledger.fail(job, new Error('PASSWORD_RESET_DELIVERY_RETRY'))
        message.retry({ delaySeconds: 30 })
        return
      }
      await ledger.complete(job, job.artifactRef)
      message.ack()
      return
    } catch {
      await ledger.fail(job, new Error('PASSWORD_RESET_DELIVERY_RETRY'))
      message.retry({ delaySeconds: 30 })
      return
    }
  }
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
