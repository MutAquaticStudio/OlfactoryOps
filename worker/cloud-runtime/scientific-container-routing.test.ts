import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { getRandom, type Container } from '@cloudflare/containers'
import { scientificContainerFor, scientificContainerPoolSize } from './scientific-container-routing.js'

vi.mock('@cloudflare/containers', () => ({ getRandom: vi.fn() }))

describe('scientific container routing', () => {
  it('load-balances each stateless runtime across only the declared capacity pool', async () => {
    const binding = {} as DurableObjectNamespace<Container>
    const stub = {} as DurableObjectStub<Container>
    vi.mocked(getRandom).mockResolvedValueOnce(stub)

    await expect(scientificContainerFor(binding)).resolves.toBe(stub)

    expect(scientificContainerPoolSize).toBe(2)
    expect(getRandom).toHaveBeenCalledWith(binding, scientificContainerPoolSize)
  })

  it('keeps both deployable Cloud Runtime templates aligned with the bounded pool', () => {
    for (const path of [
      'wrangler.v2-cloud-runtime.example.toml',
      'wrangler.v2-cloud-runtime-production.example.toml',
    ]) {
      const config = readFileSync(path, 'utf8')
      expect([...config.matchAll(/^max_instances\s*=\s*(\d+)$/gm)].map((match) => Number(match[1]))).toEqual([
        scientificContainerPoolSize,
        scientificContainerPoolSize,
      ])
    }
  })
})
