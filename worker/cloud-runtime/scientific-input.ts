import { scientificInputArtifactSchema, scientificModelInputArtifactSchema, type CloudJobEnvelope } from './contracts.js'

type PrivateInputObject = Pick<R2ObjectBody, 'text'>

/**
 * Validates the exact private R2 bytes that were bound to a queued science job.
 * The parsed structure is the only scientific payload passed to a Container.
 */
export async function loadPrivateScientificInput(job: CloudJobEnvelope, source: PrivateInputObject): Promise<Record<string, unknown>> {
  const rawInput = await source.text()
  if (await sha256(rawInput) !== job.inputHash) throw new Error('SCIENTIFIC_INPUT_HASH_MISMATCH')
  let parsed: unknown
  try {
    parsed = JSON.parse(rawInput)
  } catch {
    throw new Error('SCIENTIFIC_INPUT_INVALID')
  }
  return job.jobType === 'SCIENTIFIC_FEATURE'
    ? scientificInputArtifactSchema.parse(parsed)
    : scientificModelInputArtifactSchema.parse(parsed)
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('')
}
