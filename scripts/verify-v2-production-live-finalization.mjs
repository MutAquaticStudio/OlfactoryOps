import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const acceptedWorkflow = 'V2 Production Public Acceptance'
const maximumAcceptanceAgeMs = 3 * 60 * 60 * 1000
const runIdPattern = /^[1-9][0-9]{5,14}$/

export function inspectPublicAcceptanceRun(run, { runId, now = Date.now() } = {}) {
  if (!runIdPattern.test(runId ?? '')) return { pass: false, state: 'RUN_ID_INVALID' }
  if (!run || Array.isArray(run) || typeof run !== 'object') return { pass: false, state: 'RUN_PAYLOAD_INVALID' }
  if (run.id !== Number(runId)) return { pass: false, state: 'RUN_ID_MISMATCH' }
  if (run.name !== acceptedWorkflow || run.event !== 'workflow_dispatch' || run.head_branch !== 'main') return { pass: false, state: 'RUN_IDENTITY_INVALID' }
  if (run.status !== 'completed' || run.conclusion !== 'success') return { pass: false, state: 'RUN_NOT_SUCCESSFUL' }
  const updatedAt = Date.parse(run.updated_at ?? '')
  if (!Number.isFinite(updatedAt) || updatedAt > now || now - updatedAt > maximumAcceptanceAgeMs) return { pass: false, state: 'RUN_STALE' }
  return { pass: true, state: 'READY' }
}

export function verifyProductionLiveFinalization({ environment = process.env, readFile = readFileSync, emit = (line) => console.log(line), now = Date.now() } = {}) {
  const runId = environment.PUBLIC_ACCEPTANCE_RUN_ID?.trim()
  const file = environment.PUBLIC_ACCEPTANCE_RUN_FILE?.trim()
  let result = { pass: false, state: 'RUN_FILE_UNAVAILABLE' }

  if (file) {
    try {
      result = inspectPublicAcceptanceRun(JSON.parse(readFile(file, 'utf8')), { runId, now })
    } catch {
      result = { pass: false, state: 'RUN_PAYLOAD_INVALID' }
    }
  }

  emit(`PUBLIC_ACCEPTANCE_RUN_VERIFIED=${result.pass ? 'PASS' : 'FAIL'}`)
  emit(`PUBLIC_ACCEPTANCE_RUN_STATE=${result.state}`)
  if (result.pass) emit(`PUBLIC_ACCEPTANCE_RUN_ID=${runId}`)
  return result
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = verifyProductionLiveFinalization()
  if (!result.pass) process.exitCode = 1
}
