import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { RC11_SHA, RC12_SHA, RC12_TAG, validateRc12Manifest, verifyRc12Source } from './v2-rc12-release-policy.mjs'

const content = new TextEncoder().encode('verified RC12 file')
const manifest = {
  schemaVersion: 1,
  release: { sourceBranch: 'main', sourceSha: RC12_SHA, sourceTag: RC12_TAG, previousReleaseTag: 'v2-production-rc11', previousReleaseSha: RC11_SHA },
  includedPullRequests: [160, 166],
  classificationCounts: { PRODUCT_RUNTIME: 1, FRONTEND_RUNTIME: 0, RELEASE_TOOLING: 0, TEST_ONLY: 0, DOCUMENTATION: 0, UNRELATED: 0 },
  changedFiles: [{ path: 'worker/v2-api/transport.ts', classification: 'PRODUCT_RUNTIME', provenance: RC12_SHA, sha256: createHash('sha256').update(content).digest('hex') }],
  invariants: { databaseSchemaChange: false, migrationDelta: false, productionRouteMutation: false, productionDeployment: false, candidateDeployment: false, unrelatedRuntimeChangeCount: 0 },
}

test('RC12 policy accepts only a complete exact source manifest and byte-identical source set', () => {
  expect(validateRc12Manifest(manifest)).toEqual({ pass: true, state: 'READY' })
  expect(verifyRc12Source({ manifest, sourceSha: RC12_SHA, previousSha: RC11_SHA, changedPaths: ['worker/v2-api/transport.ts'], fileContents: { 'worker/v2-api/transport.ts': content } })).toEqual({ pass: true, state: 'READY' })
})

test('RC12 policy rejects a mismatched file or an unrelated runtime change', () => {
  expect(verifyRc12Source({ manifest, sourceSha: RC12_SHA, previousSha: RC11_SHA, changedPaths: [], fileContents: {} }).state).toBe('SOURCE_SCOPE_INVALID')
  const unrelatedRuntimeManifest = structuredClone(manifest)
  unrelatedRuntimeManifest.changedFiles[0].classification = 'UNRELATED'
  unrelatedRuntimeManifest.classificationCounts = { PRODUCT_RUNTIME: 0, FRONTEND_RUNTIME: 0, RELEASE_TOOLING: 0, TEST_ONLY: 0, DOCUMENTATION: 0, UNRELATED: 1 }
  expect(validateRc12Manifest(unrelatedRuntimeManifest).state).toBe('UNRELATED_RUNTIME_CHANGE_DETECTED')
})

test('RC12 policy rejects an incorrect release identity and content fingerprint', () => {
  const wrongRelease = structuredClone(manifest)
  wrongRelease.release.sourceSha = RC11_SHA
  expect(validateRc12Manifest(wrongRelease).state).toBe('RELEASE_IDENTITY_INVALID')
  expect(verifyRc12Source({ manifest, sourceSha: RC12_SHA, previousSha: RC11_SHA, changedPaths: ['worker/v2-api/transport.ts'], fileContents: { 'worker/v2-api/transport.ts': new Uint8Array() } }).state).toBe('SOURCE_CONTENT_INVALID')
})
