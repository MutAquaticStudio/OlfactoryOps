import { expect, test } from 'vitest'
import { storageStateForSession, validateIsolatedFixtureConfig } from './qa-isolated-fixture-support.mjs'

test('fixture config refuses production and non-isolated persistence', () => {
  expect(() => validateIsolatedFixtureConfig({
    QA_ENVIRONMENT: 'production',
    QA_ISOLATED_FIXTURES: 'true',
    QA_FIXTURE_API_URL: 'https://api.labofscents.org/api/v1',
    QA_FIXTURE_D1_PERSIST_PATH: '.qa-isolated-worker-x',
  })).toThrow(/Refusing fixture mutation/)
  expect(() => validateIsolatedFixtureConfig({
    QA_ENVIRONMENT: 'test',
    QA_ISOLATED_FIXTURES: 'true',
    QA_FIXTURE_API_URL: 'http://127.0.0.1:8791/api/v1',
    QA_FIXTURE_D1_PERSIST_PATH: '.wrangler/state',
  })).toThrow(/persistence directory/)
})

test('fixture config only accepts loopback Worker targets', () => {
  expect(() => validateIsolatedFixtureConfig({
    QA_ENVIRONMENT: 'test',
    QA_ISOLATED_FIXTURES: 'true',
    QA_FIXTURE_API_URL: 'https://labofscents.org/api/v1',
    QA_FIXTURE_D1_PERSIST_PATH: '.qa-isolated-worker-x',
  })).toThrow(/loopback/)
})

test('storage states retain an opaque cookie envelope and restore marker', () => {
  const state = storageStateForSession({ appOrigin: 'http://127.0.0.1:5173', sessionCredential: 'oo_s1_example' })
  expect(Object.keys(state)).toEqual(['cookies', 'origins'])
  expect(state.cookies[0].name).toBe('oo_session')
  expect(state.cookies[0].httpOnly).toBe(true)
  expect(state.cookies[0].secure).toBe(false)
  expect(state.cookies[0].sameSite).toBe('Lax')
  expect(state.origins).toEqual([{
    origin: 'http://127.0.0.1:5173',
    localStorage: [{ name: 'olfactoryops.has_session.v1', value: '1' }],
  }])
})

test('HTTPS fixture storage states preserve cross-origin cookie semantics', () => {
  const state = storageStateForSession({ appOrigin: 'https://qa.labofscents.test', sessionCredential: 'oo_s1_example' })
  expect(state.cookies[0].secure).toBe(true)
  expect(state.cookies[0].sameSite).toBe('None')
})
