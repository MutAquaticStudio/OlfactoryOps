import { describe, expect, it } from 'vitest'
import { ScientificContainerStartup } from './scientific-container-startup.js'

function deferred() {
  let resolve: (() => void) | undefined
  let reject: ((error: Error) => void) | undefined
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve: () => resolve?.(), reject: (error: Error) => reject?.(error) }
}

describe('ScientificContainerStartup', () => {
  it('shares one cold-start allocation across concurrent requests for a pool lane', async () => {
    const startup = new ScientificContainerStartup()
    const inFlight = deferred()
    let calls = 0
    const start = () => {
      calls += 1
      return inFlight.promise
    }

    const requests = [startup.ensure(start), startup.ensure(start), startup.ensure(start)]
    await Promise.resolve()
    expect(calls).toBe(1)
    inFlight.resolve()
    await expect(Promise.all(requests)).resolves.toEqual([undefined, undefined, undefined])
  })

  it('allows a later allocation after a failed start or a stopped instance', async () => {
    const startup = new ScientificContainerStartup()
    await expect(startup.ensure(async () => { throw new Error('cold-start-failed') })).rejects.toThrow('cold-start-failed')
    await expect(startup.ensure(async () => undefined)).resolves.toBeUndefined()
    startup.reset()
    await expect(startup.ensure(async () => undefined)).resolves.toBeUndefined()
  })
})
