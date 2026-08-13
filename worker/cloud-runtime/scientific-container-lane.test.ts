import { describe, expect, it, vi } from 'vitest'
import { ScientificContainerLane } from './scientific-container-lane.js'

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined
  let reject: (reason?: unknown) => void = () => undefined
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject })
  return { promise, resolve, reject }
}

function lifecycle(states: Array<'healthy' | 'stopped' | 'stopped_with_code'> = ['healthy', 'stopped']) {
  let state = states[0]
  const getState = vi.fn(async () => ({ status: state, lastChange: Date.now() }) as never)
  const stop = vi.fn(async () => { state = states[1] ?? 'stopped' })
  const destroy = vi.fn(async () => { state = 'stopped' })
  return { getState, stop, destroy }
}

function lane(subject = lifecycle(), outcomes: string[] = []) {
  return {
    subject,
    lane: new ScientificContainerLane(subject, {
      pollAttempts: 2,
      pollIntervalMs: 0,
      sleep: async () => undefined,
      onCleanup: (outcome) => outcomes.push(outcome),
    }),
    outcomes,
  }
}

describe('ScientificContainerLane', () => {
  it('buffers one complete job before gracefully releasing its drained lane', async () => {
    const { lane: subject, subject: controls, outcomes } = lane()
    const events: string[] = []

    await expect(subject.run(async () => {
      events.push('response-buffered')
      return 'result'
    })).resolves.toBe('result')

    expect(events).toEqual(['response-buffered'])
    expect(controls.stop).toHaveBeenCalledTimes(1)
    expect(controls.destroy).not.toHaveBeenCalled()
    expect(outcomes).toEqual(['GRACEFUL_STOP'])
  })

  it('serializes two jobs on one lane and never stops between a queued successor', async () => {
    const { lane: subject, subject: controls } = lane()
    const first = deferred<void>()
    const events: string[] = []
    const firstJob = subject.run(async () => { events.push('first-start'); await first.promise; events.push('first-buffered') })
    const secondJob = subject.run(async () => { events.push('second-start'); events.push('second-buffered') })

    await Promise.resolve()
    expect(events).toEqual(['first-start'])
    expect(controls.stop).not.toHaveBeenCalled()
    first.resolve()
    await Promise.all([firstJob, secondJob])

    expect(events).toEqual(['first-start', 'first-buffered', 'second-start', 'second-buffered'])
    expect(controls.stop).toHaveBeenCalledTimes(1)
  })

  it('cleans up a lane after a failed job and permits a later stopped lane to restart', async () => {
    const { lane: subject, subject: controls } = lane()

    await expect(subject.run(async () => { throw new Error('CONTAINER_HTTP_FAILED') })).rejects.toThrow('CONTAINER_HTTP_FAILED')
    await expect(subject.run(async () => 'later-result')).resolves.toBe('later-result')

    expect(controls.stop).toHaveBeenCalledTimes(2)
    expect(controls.destroy).not.toHaveBeenCalled()
  })

  it('uses one destroy fallback after a graceful stop does not reach a terminal state', async () => {
    const controls = lifecycle(['healthy', 'healthy'])
    const { lane: subject, outcomes } = lane(controls)
    await expect(subject.run(async () => 'result')).resolves.toBe('result')

    expect(controls.stop).toHaveBeenCalledTimes(1)
    expect(controls.destroy).toHaveBeenCalledTimes(1)
    expect(outcomes).toEqual(['DESTROY_FALLBACK'])
  })

  it('does not destroy in a loop when terminal state cannot be confirmed', async () => {
    const controls = lifecycle(['healthy', 'healthy'])
    controls.destroy.mockImplementationOnce(async () => undefined)
    controls.getState.mockResolvedValue({ status: 'healthy', lastChange: Date.now() } as never)
    const { lane: subject } = lane(controls)

    await expect(subject.run(async () => 'result')).rejects.toThrow('SCIENTIFIC_CONTAINER_LANE_TERMINATION_TIMEOUT')
    expect(controls.stop).toHaveBeenCalledTimes(1)
    expect(controls.destroy).toHaveBeenCalledTimes(1)
  })

  it('allows two lanes to execute independently while each retains its own cleanup', async () => {
    const first = lane()
    const second = lane()
    const firstWork = deferred<void>()
    const secondWork = deferred<void>()
    const firstRun = first.lane.run(async () => firstWork.promise)
    const secondRun = second.lane.run(async () => secondWork.promise)

    await Promise.resolve()
    expect(first.subject.stop).not.toHaveBeenCalled()
    expect(second.subject.stop).not.toHaveBeenCalled()
    firstWork.resolve()
    secondWork.resolve()
    await Promise.all([firstRun, secondRun])

    expect(first.subject.stop).toHaveBeenCalledTimes(1)
    expect(second.subject.stop).toHaveBeenCalledTimes(1)
  })

  it('completes three concurrent jobs across two bounded lanes without cross-lane teardown', async () => {
    const first = lane()
    const second = lane()
    const firstWork = deferred<void>()
    const secondWork = deferred<void>()
    const observed: string[] = []

    const firstA = first.lane.run(async () => { observed.push('first-a'); await firstWork.promise })
    const firstB = first.lane.run(async () => { observed.push('first-b') })
    const secondA = second.lane.run(async () => { observed.push('second-a'); await secondWork.promise })
    await Promise.resolve()
    expect(observed).toEqual(expect.arrayContaining(['first-a', 'second-a']))
    expect(observed).not.toContain('first-b')
    firstWork.resolve()
    secondWork.resolve()
    await Promise.all([firstA, firstB, secondA])

    expect(observed).toEqual(['first-a', 'second-a', 'first-b'])
    expect(first.subject.stop).toHaveBeenCalledTimes(1)
    expect(second.subject.stop).toHaveBeenCalledTimes(1)
  })
})
