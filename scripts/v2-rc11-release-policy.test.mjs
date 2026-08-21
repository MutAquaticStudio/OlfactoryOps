import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { RC10_SHA, RC11_SOURCE_SHA, parseRc11Manifest, validateRc11Manifest, verifyRc11Source } from './v2-rc11-release-policy.mjs'

const paths = [
  'docs/v2/SCIENTIFIC_CREATIVE_SAAS_DESIGN_SYSTEM.md',
  'e2e/v2-platform-redesign.playwright.ts',
  'src/features/v2-agent-runtime/AgentRuntimeWorkspace.tsx',
  'src/features/v2-platform/V2PlatformApp.test.ts',
  'src/features/v2-platform/V2PlatformApp.tsx',
  'src/index.css',
  'src/styles/features.css',
]
const contents = Object.fromEntries(paths.map((path) => [path, `content:${path}`]))
const manifest = {
  schemaVersion: 1,
  release: { baseTag: 'v2-production-rc10', baseSha: RC10_SHA, sourceBranch: 'codex/v2-production-rc11', sourceSha: RC11_SOURCE_SHA, sourceTag: 'v2-production-rc11', liveTag: 'v2-production-live-rc11' },
  approvedFiles: paths.map((path) => ({ path, sha256: createHash('sha256').update(contents[path]).digest('hex') })),
  invariants: { databaseMutation: false, migrationDelta: false, routePolicyChange: false, apiContractChange: false, workerSourceChange: false, dependencyChange: false },
}

describe('RC11 release policy', () => {
  it('accepts only the fixed RC10 base and ordered seven-file manifest', () => {
    expect(validateRc11Manifest(manifest)).toEqual({ pass: true, state: 'READY' })
    expect(parseRc11Manifest(JSON.stringify(manifest)).pass).toBe(true)
  })

  it('fails closed for a non-UI path, tag rewrite, or scope invariant', () => {
    expect(validateRc11Manifest({ ...manifest, release: { ...manifest.release, sourceTag: 'v2-production-rc12' } }).pass).toBe(false)
    expect(validateRc11Manifest({ ...manifest, approvedFiles: [...manifest.approvedFiles, { path: 'package.json', sha256: 'a'.repeat(64) }] }).pass).toBe(false)
    expect(validateRc11Manifest({ ...manifest, invariants: { ...manifest.invariants, dependencyChange: true } }).pass).toBe(false)
  })

  it('rejects source paths, hashes, and revisions that differ from the manifest', () => {
    expect(verifyRc11Source({ manifest, sourceSha: RC11_SOURCE_SHA, baseSha: RC10_SHA, changedPaths: paths, fileContents: contents })).toEqual({ pass: true, state: 'READY' })
    expect(verifyRc11Source({ manifest, sourceSha: RC11_SOURCE_SHA, baseSha: RC10_SHA, changedPaths: [...paths, 'worker/v2-api-worker.ts'], fileContents: contents }).pass).toBe(false)
    expect(verifyRc11Source({ manifest, sourceSha: RC11_SOURCE_SHA, baseSha: RC10_SHA, changedPaths: paths, fileContents: { ...contents, 'src/index.css': 'altered' } }).pass).toBe(false)
  })
})
