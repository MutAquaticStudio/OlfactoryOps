import { describe, expect, it } from 'vitest'
import recoveryWorker, { recoveryTargets } from './staging-feature-recovery.js'

type State = 'running' | 'healthy' | 'stopping' | 'stopped' | 'stopped_with_code'

function targetIds() {
  return new Map(recoveryTargets().map((target) => [target.fullId, target.name]))
}

function namespace(states: Map<string, State>, calls: string[], mismatch = false): DurableObjectNamespace<Rpc.DurableObjectBranded> {
  const ids = targetIds()
  const id = (value: string) => ({
    toString: () => mismatch ? `mismatch-${value}` : value,
    equals: (other: DurableObjectId) => other.toString() === (mismatch ? `mismatch-${value}` : value),
  }) as DurableObjectId
  return {
    idFromName(name) {
      const entry = [...ids.entries()].find(([, expectedName]) => expectedName === name)
      return id(entry?.[0] ?? name)
    },
    idFromString(value) { return id(value) },
    get(objectId) {
      const objectIdString = objectId.toString()
      return {
        id: objectId,
        async getState() { return { status: states.get(objectIdString) ?? 'stopped' } },
        async stop() { calls.push(`stop:${objectIdString}`); states.set(objectIdString, 'stopped') },
        async destroy() { calls.push(`destroy:${objectIdString}`); states.set(objectIdString, 'stopped') },
      } as unknown as DurableObjectStub
    },
  } as DurableObjectNamespace<Rpc.DurableObjectBranded>
}

function environment(states: Map<string, State>, calls: string[], mismatch = false): Parameters<typeof recoveryWorker.fetch>[1] {
  return { RECOVERY_TOKEN: 'ephemeral-test-token', SCIENTIFIC_FEATURE_CONTAINER: namespace(states, calls, mismatch) } as unknown as Parameters<typeof recoveryWorker.fetch>[1]
}

describe('staging feature recovery worker', () => {
  it('hides all unauthorized and non-recovery requests', async () => {
    const response = await recoveryWorker.fetch(new Request('https://recovery.workers.dev/recover', { method: 'POST' }), environment(new Map(), []))
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ code: 'NOT_FOUND' })
  })

  it('stops the two compiled-in targets sequentially after identity checks', async () => {
    const states = new Map(recoveryTargets().map((target) => [target.fullId, 'running' as State]))
    const calls: string[] = []
    const response = await recoveryWorker.fetch(new Request('https://recovery.workers.dev/recover', { method: 'POST', headers: { authorization: 'Bearer ephemeral-test-token' } }), environment(states, calls))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      target1IdentityMatch: true, target1BeforeState: 'running', target1StopSent: true, target1DestroySent: false, target1AfterState: 'stopped',
      target2IdentityMatch: true, target2BeforeState: 'running', target2StopSent: true, target2DestroySent: false, target2AfterState: 'stopped',
    })
    expect(calls).toEqual(recoveryTargets().map((target) => `stop:${target.fullId}`))
  })

  it('does not signal either target when the name and full id disagree', async () => {
    const calls: string[] = []
    const response = await recoveryWorker.fetch(new Request('https://recovery.workers.dev/recover', { method: 'POST', headers: { authorization: 'Bearer ephemeral-test-token' } }), environment(new Map(), calls, true))
    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, unknown>
    expect(body.target1IdentityMatch).toBe(false)
    expect(body.target2BeforeState).toBe('not_attempted')
    expect(calls).toEqual([])
  })
})
