import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

export const RC10_SHA = 'fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd'
export const RC11_SOURCE_SHA = '98cfac77853ffb0b6b69235bb3483117dc3b6961'
export const RC11_SOURCE_BRANCH = 'codex/v2-production-rc11'
export const RC11_SOURCE_TAG = 'v2-production-rc11'
export const RC11_LIVE_TAG = 'v2-production-live-rc11'

const shaPattern = /^[0-9a-f]{40}$/
const sha256Pattern = /^[0-9a-f]{64}$/
const approvedPaths = [
  'docs/v2/SCIENTIFIC_CREATIVE_SAAS_DESIGN_SYSTEM.md',
  'e2e/v2-platform-redesign.playwright.ts',
  'src/features/v2-agent-runtime/AgentRuntimeWorkspace.tsx',
  'src/features/v2-platform/V2PlatformApp.test.ts',
  'src/features/v2-platform/V2PlatformApp.tsx',
  'src/index.css',
  'src/styles/features.css',
]

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function equalStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function parseRc11Manifest(serialized) {
  try {
    const manifest = JSON.parse(serialized)
    return isPlainObject(manifest) ? { pass: true, manifest } : { pass: false, state: 'MANIFEST_INVALID' }
  } catch {
    return { pass: false, state: 'MANIFEST_INVALID' }
  }
}

export function validateRc11Manifest(manifest) {
  if (!isPlainObject(manifest) || manifest.schemaVersion !== 1 || !isPlainObject(manifest.release) || !Array.isArray(manifest.approvedFiles) || !isPlainObject(manifest.invariants)) return { pass: false, state: 'MANIFEST_INVALID' }
  const release = manifest.release
  if (release.baseTag !== 'v2-production-rc10' || release.baseSha !== RC10_SHA || release.sourceBranch !== RC11_SOURCE_BRANCH || release.sourceSha !== RC11_SOURCE_SHA || release.sourceTag !== RC11_SOURCE_TAG || release.liveTag !== RC11_LIVE_TAG) return { pass: false, state: 'RELEASE_IDENTITY_INVALID' }
  if (!shaPattern.test(release.baseSha) || !shaPattern.test(release.sourceSha)) return { pass: false, state: 'RELEASE_IDENTITY_INVALID' }
  const paths = manifest.approvedFiles.map((file) => file?.path)
  if (!equalStrings(paths, approvedPaths) || new Set(paths).size !== approvedPaths.length || manifest.approvedFiles.some((file) => !isPlainObject(file) || !sha256Pattern.test(file.sha256))) return { pass: false, state: 'APPROVED_FILE_MANIFEST_INVALID' }
  const requiredInvariants = ['databaseMutation', 'migrationDelta', 'routePolicyChange', 'apiContractChange', 'workerSourceChange', 'dependencyChange']
  if (!equalStrings(Object.keys(manifest.invariants).sort(), requiredInvariants.sort()) || requiredInvariants.some((key) => manifest.invariants[key] !== false)) return { pass: false, state: 'RELEASE_SCOPE_INVALID' }
  return { pass: true, state: 'READY' }
}

export function verifyRc11Source({ manifest, sourceSha, baseSha, changedPaths, fileContents }) {
  const manifestResult = validateRc11Manifest(manifest)
  if (!manifestResult.pass) return manifestResult
  if (sourceSha !== RC11_SOURCE_SHA || baseSha !== RC10_SHA) return { pass: false, state: 'SOURCE_REVISION_INVALID' }
  if (!equalStrings([...changedPaths].sort(), approvedPaths.slice().sort())) return { pass: false, state: 'SOURCE_SCOPE_INVALID' }
  for (const file of manifest.approvedFiles) {
    const content = fileContents?.[file.path]
    if (typeof content !== 'string' || createHash('sha256').update(content).digest('hex') !== file.sha256) return { pass: false, state: 'SOURCE_CONTENT_INVALID' }
  }
  return { pass: true, state: 'READY' }
}

function git(repository, args, { trim = true } = {}) {
  const result = spawnSync('git', ['-C', repository, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  if (result.status !== 0) return null
  return trim ? result.stdout.trim() : result.stdout
}

export function verifyRc11SourceCheckout({ manifest, repository }) {
  const sourceSha = git(repository, ['rev-parse', 'HEAD'])
  const baseSha = git(repository, ['rev-parse', 'v2-production-rc10^{commit}'])
  const changed = git(repository, ['diff', '--name-only', `${RC10_SHA}..${RC11_SOURCE_SHA}`])
  if (!sourceSha || !baseSha || changed === null) return { pass: false, state: 'SOURCE_READ_UNAVAILABLE' }
  const fileContents = Object.fromEntries(manifest.approvedFiles.map(({ path }) => [path, git(repository, ['show', `${RC11_SOURCE_SHA}:${path}`], { trim: false })]))
  return verifyRc11Source({ manifest, sourceSha, baseSha, changedPaths: changed ? changed.split('\n').filter(Boolean) : [], fileContents })
}

export function runRc11ReleasePolicy({ environment = process.env, readFile = readFileSync, emit = (line) => console.log(line) } = {}) {
  const path = environment.RC11_RELEASE_MANIFEST_PATH?.trim()
  const repository = environment.RC11_SOURCE_WORKTREE?.trim()
  let result = { pass: false, state: 'MANIFEST_UNAVAILABLE' }
  if (path && repository) {
    try {
      const parsed = parseRc11Manifest(readFile(path, 'utf8'))
      result = parsed.pass ? verifyRc11SourceCheckout({ manifest: parsed.manifest, repository }) : parsed
    } catch {
      result = { pass: false, state: 'MANIFEST_UNAVAILABLE' }
    }
  }
  emit(`RC11_RELEASE_MANIFEST=${result.pass ? 'PASS' : 'FAIL'}`)
  emit(`RC11_RELEASE_SOURCE=${result.pass ? 'PASS' : 'FAIL'}`)
  emit(`RC11_RELEASE_SOURCE_STATE=${result.state}`)
  return result
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = runRc11ReleasePolicy()
  if (!result.pass) process.exitCode = 1
}
