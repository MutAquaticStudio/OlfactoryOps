import { cloudJobEnvelopeSchema, type CloudJobEnvelope } from './contracts.js'
import { CloudJobLedger } from './job-ledger.js'

type CloudQueues = {
  SCIENTIFIC_JOBS: Queue<CloudJobEnvelope>
  RAG_INGESTION_JOBS: Queue<CloudJobEnvelope>
  NOTIFICATION_DELIVERY_JOBS: Queue<CloudJobEnvelope>
}

export class CloudQueueDispatcher {
  constructor(private readonly ledger: CloudJobLedger, private readonly queues: CloudQueues) {}

  async dispatch(input: CloudJobEnvelope): Promise<{ jobId: string; queued: boolean }> {
    const job = cloudJobEnvelopeSchema.parse(input)
    const persisted = await this.ledger.submit(job)
    if (!persisted.enqueue) return { jobId: persisted.jobId, queued: false }
    const queue = job.jobType === 'RAG_INGESTION'
      ? this.queues.RAG_INGESTION_JOBS
      : job.jobType === 'NOTIFICATION_DELIVERY'
        ? this.queues.NOTIFICATION_DELIVERY_JOBS
        : this.queues.SCIENTIFIC_JOBS
    await queue.send(job)
    return { jobId: persisted.jobId, queued: true }
  }
}
