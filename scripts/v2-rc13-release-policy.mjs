import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const RC12_SHA = '331c1a6054fe1420b063a2e1fe9e5cef4f043ff8'
export const RC13_SHA = '09e96feacb9db03325683ee329fb269206a21880'
export const RC13_TAG = 'v2-production-rc13'
export const RC13_SOURCE_BRANCH = 'codex/v2-production-rc13'

const shaPattern = /^[0-9a-f]{40}$/
const sha256Pattern = /^[0-9a-f]{64}$/
const classifications = new Set(['PRODUCT_RUNTIME', 'FRONTEND_RUNTIME', 'RELEASE_TOOLING', 'TEST_ONLY', 'DOCUMENTATION', 'UNRELATED'])
const expectedInvariants = {
  databaseSchemaChange: true,
  migrationDelta: true,
  productionRouteMutation: false,
  productionDeployment: false,
  candidateDeployment: false,
  unrelatedRuntimeChangeCount: 0,
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sameObject(left, right) {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key])
}

function runtimePath(path) {
  return path === 'package.json' || path === 'package-lock.json' || /^(?:src|worker|server|services|infra\/postgres)\//.test(path)
}

export function parseRc13Manifest(serialized) {
  try {
    const manifest = JSON.parse(serialized)
    return plainObject(manifest) ? { pass: true, manifest } : { pass: false, state: 'MANIFEST_INVALID' }
  } catch {
    return { pass: false, state: 'MANIFEST_INVALID' }
  }
}

export function validateRc13Manifest(manifest) {
  if (!plainObject(manifest) || manifest.schemaVersion !== 1 || !plainObject(manifest.release) || !Array.isArray(manifest.includedPullRequests) || !plainObject(manifest.classificationCounts) || !Array.isArray(manifest.changedFiles) || !plainObject(manifest.invariants)) return { pass: false, state: 'MANIFEST_INVALID' }
  const { release } = manifest
  if (release.sourceBranch !== RC13_SOURCE_BRANCH || release.sourceSha !== RC13_SHA || release.sourceTag !== RC13_TAG || release.previousReleaseTag !== 'v2-production-rc12' || release.previousReleaseSha !== RC12_SHA || !shaPattern.test(release.sourceSha) || !shaPattern.test(release.previousReleaseSha)) return { pass: false, state: 'RELEASE_IDENTITY_INVALID' }
  if (!sameObject(manifest.invariants, expectedInvariants)) return { pass: false, state: 'RELEASE_INVARIANTS_INVALID' }
  if (!manifest.includedPullRequests.length || !manifest.includedPullRequests.every(Number.isSafeInteger) || new Set(manifest.includedPullRequests).size !== manifest.includedPullRequests.length || manifest.includedPullRequests.some((value, index, values) => value <= 0 || (index > 0 && values[index - 1] >= value))) return { pass: false, state: 'PULL_REQUEST_MANIFEST_INVALID' }
  const paths = new Set()
  const counts = Object.fromEntries([...classifications].map((classification) => [classification, 0]))
  for (const file of manifest.changedFiles) {
    if (!plainObject(file) || typeof file.path !== 'string' || !file.path || paths.has(file.path) || !classifications.has(file.classification) || !shaPattern.test(file.provenance) || !sha256Pattern.test(file.sha256)) return { pass: false, state: 'FILE_MANIFEST_INVALID' }
    paths.add(file.path)
    counts[file.classification] += 1
  }
  if (!manifest.changedFiles.length || !sameObject(manifest.classificationCounts, counts)) return { pass: false, state: 'CLASSIFICATION_MANIFEST_INVALID' }
  const unrelatedRuntimeChangeCount = manifest.changedFiles.filter((file) => file.classification === 'UNRELATED' && runtimePath(file.path)).length
  return unrelatedRuntimeChangeCount === 0 ? { pass: true, state: 'READY' } : { pass: false, state: 'UNRELATED_RUNTIME_CHANGE_DETECTED' }
}

export function verifyRc13Source({ manifest, sourceSha, previousSha, changedPaths, fileContents }) {
  const validation = validateRc13Manifest(manifest)
  if (!validation.pass) return validation
  if (sourceSha !== RC13_SHA || previousSha !== RC12_SHA) return { pass: false, state: 'SOURCE_REVISION_INVALID' }
  const declared = manifest.changedFiles.map((file) => file.path).sort()
  const actual = [...changedPaths].sort()
  if (declared.length !== actual.length || declared.some((path, index) => path !== actual[index])) return { pass: false, state: 'SOURCE_SCOPE_INVALID' }
  for (const file of manifest.changedFiles) {
    const content = fileContents?.[file.path]
    if (!(content instanceof Uint8Array) || createHash('sha256').update(content).digest('hex') !== file.sha256) return { pass: false, state: 'SOURCE_CONTENT_INVALID' }
  }
  return { pass: true, state: 'READY' }
}

function git(repository, args, { encoding = 'utf8', trim = true } = {}) {
  const result = spawnSync('git', ['-C', repository, ...args], { encoding, stdio: ['ignore', 'pipe', 'ignore'] })
  if (result.status !== 0) return null
  return typeof result.stdout === 'string' && trim ? result.stdout.trim() : result.stdout
}

export function verifyRc13SourceCheckout({ manifest, repository, tagRequired = true }) {
  const sourceSha = git(repository, ['rev-parse', 'HEAD'])
  const previousSha = git(repository, ['rev-parse', 'v2-production-rc12^{commit}'])
  const tagSha = git(repository, ['rev-parse', 'v2-production-rc13^{commit}'])
  const changed = git(repository, ['diff', '--name-only', `${RC12_SHA}..${RC13_SHA}`])
  if (!sourceSha || !previousSha || changed === null) return { pass: false, state: 'SOURCE_READ_UNAVAILABLE' }
  if ((tagRequired && !tagSha) || (tagSha && tagSha !== RC13_SHA)) return { pass: false, state: 'SOURCE_TAG_INVALID' }
  const fileContents = Object.fromEntries(manifest.changedFiles.map(({ path }) => [path, git(repository, ['show', `${RC13_SHA}:${path}`], { encoding: null, trim: false })]))
  return verifyRc13Source({ manifest, sourceSha, previousSha, changedPaths: changed ? changed.split('\n').filter(Boolean) : [], fileContents })
}

export function runRc13ReleasePolicy({ environment = process.env, readFile = readFileSync, emit = (line) => console.log(line) } = {}) {
  const path = environment.RC13_RELEASE_MANIFEST_PATH?.trim()
  const repository = environment.RC13_SOURCE_WORKTREE?.trim()
  const tagRequired = environment.RC13_SOURCE_TAG_REQUIRED?.trim() !== 'false'
  let result = { pass: false, state: 'MANIFEST_UNAVAILABLE' }
  if (path && repository) {
    try {
      const parsed = parseRc13Manifest(readFile(path, 'utf8'))
      result = parsed.pass ? verifyRc13SourceCheckout({ manifest: parsed.manifest, repository, tagRequired }) : parsed
    } catch {
      result = { pass: false, state: 'MANIFEST_UNAVAILABLE' }
    }
  }
  emit(`RC13_RELEASE_MANIFEST=${result.pass ? 'PASS' : 'FAIL'}`)
  emit(`RC13_SOURCE_SCOPE=${result.pass ? 'PASS' : 'FAIL'}`)
  emit(`UNRELATED_RUNTIME_CHANGE_COUNT=${result.pass ? '0' : 'UNPROVEN'}`)
  emit(`RC13_SOURCE_STATE=${result.state}`)
  return result
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = runRc13ReleasePolicy()
  if (!result.pass) process.exitCode = 1
}
