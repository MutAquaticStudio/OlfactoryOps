import type { State } from '@cloudflare/containers'

export type ScientificContainerLaneCleanup = 'GRACEFUL_STOP' | 'DESTROY_FALLBACK'

export type ScientificContainerLaneLifecycle = {
  getState(): Promise<State>
  stop(): Promise<void>
  destroy(): Promise<void>
}

type ScientificContainerLaneOptions = {
  pollAttempts: number
  pollIntervalMs: number
  sleep?(milliseconds: number): Promise<void>
  onCleanup?(outcome: ScientificContainerLaneCleanup): void
}

function terminal(state: State): boolean {
  return state.status === 'stopped' || state.status === 'stopped_with_code'
}

/**
 * Serializes an entire job on one named Container lane. A later caller waits
 * through the preceding job's cleanup, so an idle stop cannot terminate it.
 */
export class ScientificContainerLane {
  private tail: Promise<void> = Promise.resolve()
  private queued = 0
  private readonly sleep: (milliseconds: number) => Promise<void>

  constructor(
    private readonly lifecycle: ScientificContainerLaneLifecycle,
    private readonly options: ScientificContainerLaneOptions,
  ) {
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    this.queued += 1
    const prior = this.tail
    let release: (() => void) | undefined
    this.tail = new Promise<void>((resolve) => { release = resolve })

    await prior
    try {
      return await operation()
    } finally {
      this.queued -= 1
      try {
        if (this.queued === 0) await this.stopDrainedLane()
      } finally {
        release?.()
      }
    }
  }

  private async stopDrainedLane(): Promise<void> {
    try {
      await this.lifecycle.stop()
    } catch {
      // A rejected graceful signal is still one bounded stop attempt. The
      // stateless lane may use its single destroy fallback below.
    }

    if (await this.waitForTerminalState()) {
      this.options.onCleanup?.('GRACEFUL_STOP')
      return
    }

    await this.lifecycle.destroy()
    if (await this.waitForTerminalState()) {
      this.options.onCleanup?.('DESTROY_FALLBACK')
      return
    }

    throw new Error('SCIENTIFIC_CONTAINER_LANE_TERMINATION_TIMEOUT')
  }

  private async waitForTerminalState(): Promise<boolean> {
    for (let attempt = 0; attempt < this.options.pollAttempts; attempt += 1) {
      if (terminal(await this.lifecycle.getState())) return true
      if (attempt + 1 < this.options.pollAttempts) await this.sleep(this.options.pollIntervalMs)
    }
    return false
  }
}
