import { expect, test } from 'vitest'

import { inspectClientReferences, isClientBuildInput } from './verify-v2-rc12-client-secret-references.mjs'

test('limits source inspection to browser build inputs', () => {
  expect(isClientBuildInput('src/App.tsx')).toBe(true)
  expect(isClientBuildInput('public/runtime.js')).toBe(true)
  expect(isClientBuildInput('.env.production')).toBe(true)
  expect(isClientBuildInput('.github/workflows/release.yml')).toBe(false)
  expect(isClientBuildInput('scripts/verify-release.mjs')).toBe(false)
})

test('does not classify operations-only database marker names as client exposure', () => {
  expect(inspectClientReferences([
    { path: '.github/workflows/release.yml', content: 'PUBLIC_ACCEPTANCE_DATABASE' },
    { path: 'scripts/verify-release.mjs', content: 'PUBLIC_ACCEPTANCE_DATABASE' },
    { path: 'src/App.tsx', content: 'import.meta.env.VITE_API_BASE_URL' },
  ])).toEqual([])
})

test.each([
  'import.meta.env.VITE_SESSION_PEPPER',
  'import.meta.env.VITE_DATABASE_URL',
  'globalThis.PUBLIC_AUTH_TOKEN',
])('rejects a forbidden client-side secret reference: %s', (content) => {
  expect(inspectClientReferences([{ path: 'src/runtime.ts', content }])).toEqual(['src/runtime.ts'])
})
