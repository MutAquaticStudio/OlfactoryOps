import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { RC12_SHA, RC13_SHA, RC13_SOURCE_BRANCH, RC13_TAG, validateRc13Manifest, verifyRc13Source } from './v2-rc13-release-policy.mjs'

const content = new TextEncoder().encode('verified RC13 file')
const manifest = {
  schemaVersion: 1,
  release: { sourceBranch: RC13_SOURCE_BRANCH, sourceSha: RC13_SHA, sourceTag: RC13_TAG, previousReleaseTag: 'v2-production-rc12', previousReleaseSha: RC12_SHA },
  includedPullRequests: [184],
  classificationCounts: { PRODUCT_RUNTIME: 1, FRONTEND_RUNTIME: 0, RELEASE_TOOLING: 0, TEST_ONLY: 0, DOCUMENTATION: 0, UNRELATED: 0 },
  changedFiles: [{ path: 'worker/v2-api/transport.ts', classification: 'PRODUCT_RUNTIME', provenance: RC13_SHA, sha256: createHash('sha256').update(content).digest('hex') }],
  invariants: { databaseSchemaChange: true, migrationDelta: true, productionRouteMutation: false, productionDeployment: false, candidateDeployment: false, unrelatedRuntimeChangeCount: 0 },
}

test('RC13 policy accepts only the exact RC12-based source manifest and content', () => {
  expect(validateRc13Manifest(manifest)).toEqual({ pass: true, state: 'READY' })
  expect(verifyRc13Source({ manifest, sourceSha: RC13_SHA, previousSha: RC12_SHA, changedPaths: ['worker/v2-api/transport.ts'], fileContents: { 'worker/v2-api/transport.ts': content } })).toEqual({ pass: true, state: 'READY' })
})

test('RC13 policy rejects unrelated runtime files, a different base, and content drift', () => {
  const unrelated = structuredClone(manifest)
  unrelated.changedFiles[0].classification = 'UNRELATED'
  unrelated.classificationCounts = { PRODUCT_RUNTIME: 0, FRONTEND_RUNTIME: 0, RELEASE_TOOLING: 0, TEST_ONLY: 0, DOCUMENTATION: 0, UNRELATED: 1 }
  expect(validateRc13Manifest(unrelated).state).toBe('UNRELATED_RUNTIME_CHANGE_DETECTED')
  expect(verifyRc13Source({ manifest, sourceSha: RC13_SHA, previousSha: RC13_SHA, changedPaths: ['worker/v2-api/transport.ts'], fileContents: { 'worker/v2-api/transport.ts': content } }).state).toBe('SOURCE_REVISION_INVALID')
  expect(verifyRc13Source({ manifest, sourceSha: RC13_SHA, previousSha: RC12_SHA, changedPaths: ['worker/v2-api/transport.ts'], fileContents: { 'worker/v2-api/transport.ts': new Uint8Array() } }).state).toBe('SOURCE_CONTENT_INVALID')
})

test('RC13 policy requires the reviewed source pull request in its immutable manifest', () => {
  const missingPullRequest = structuredClone(manifest)
  missingPullRequest.includedPullRequests = []
  expect(validateRc13Manifest(missingPullRequest)).toEqual({ pass: false, state: 'PULL_REQUEST_MANIFEST_INVALID' })
})
