import { describe, expect, it } from 'vitest'
import { safeScientificContainerError } from './scientific-container-error.js'

describe('safeScientificContainerError', () => {
  it('maps only known transport errors', async () => {
    await expect(safeScientificContainerError(new Response('ignored', { status: 401 }))).resolves.toBe('SCIENTIFIC_CONTAINER_AUTH_DENIED')
    await expect(safeScientificContainerError(new Response('ignored', { status: 422 }))).resolves.toBe('SCIENTIFIC_CONTAINER_INVALID_REQUEST')
  })

  it('allows only known runtime errors from a controlled JSON protocol', async () => {
    await expect(safeScientificContainerError(new Response(JSON.stringify({ error: 'SCIENTIFIC_RUNTIME_FAILED' }), { status: 500 }))).resolves.toBe('SCIENTIFIC_RUNTIME_FAILED')
    await expect(safeScientificContainerError(new Response(JSON.stringify({ error: 'internal trace: secret=never-log' }), { status: 500 }))).resolves.toBe('SCIENTIFIC_CONTAINER_HTTP_500')
  })

  it('does not parse opaque non-JSON error bodies', async () => {
    await expect(safeScientificContainerError(new Response('Failed to start container: opaque transport failure', { status: 500 }))).resolves.toBe('SCIENTIFIC_CONTAINER_START_FAILED')
    await expect(safeScientificContainerError(new Response('container startup details', { status: 500 }))).resolves.toBe('SCIENTIFIC_CONTAINER_HTTP_500')
  })

  it('returns only an HTTP status for unrecognized failures', async () => {
    await expect(safeScientificContainerError(new Response('upstream body is opaque', { status: 502 }))).resolves.toBe('SCIENTIFIC_CONTAINER_HTTP_502')
  })
})
