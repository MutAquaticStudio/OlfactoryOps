import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('scientific Container lane lifecycle', () => {
  const source = readFileSync('worker/cloud-runtime/scientific-containers.ts', 'utf8')

  it('exposes only a typed workflow RPC that buffers and validates a bounded response before cleanup', () => {
    expect(source).toContain('async runScientificJob(input: ScientificContainerRequest, sharedSecret: string)')
    expect(source).toContain('scientificContainerRequestSchema.parse(input)')
    expect(source).toContain('const body = await readBoundedBody(response)')
    expect(source).toContain('scientificContainerResponseSchema.parse(JSON.parse(body))')
    expect(source).toContain('scientificContainerMaximumResponseBytes = 1_000_000')
    expect(source).toContain('this.lane.run(async () =>')
    expect(source).toContain('return this.invokeContainer(request)')
    expect(source).toContain('await this.startup.ensure(async () =>')
  })

  it('keeps automatic expiry as a fallback while drained lanes own explicit one-stop/one-destroy cleanup', () => {
    expect(source).toContain("event: 'scientific_container_idle_expired'")
    expect(source).toContain('await this.stop()')
    const lane = readFileSync('worker/cloud-runtime/scientific-container-lane.ts', 'utf8')
    expect(lane).toContain('await this.lifecycle.stop()')
    expect(lane).toContain('await this.lifecycle.destroy()')
    expect(lane).toContain('SCIENTIFIC_CONTAINER_LANE_TERMINATION_TIMEOUT')
    expect(lane).not.toContain('while (true)')
  })
})
