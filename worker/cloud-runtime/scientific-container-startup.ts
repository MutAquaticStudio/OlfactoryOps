/**
 * A Container Durable Object can receive overlapping fetches while its image
 * is cold. Share one startup promise per object so concurrent requests for a
 * selected pool lane never race into separate Container instance allocation.
 */
export class ScientificContainerStartup {
  private pending: Promise<void> | undefined

  ensure(start: () => Promise<void>): Promise<void> {
    if (this.pending) return this.pending

    const pending = Promise.resolve().then(start)
    this.pending = pending
    void pending.catch(() => {
      if (this.pending === pending) this.pending = undefined
    })
    return pending
  }

  reset(): void {
    this.pending = undefined
  }
}
