const baseUrl = process.env.STATUS_BENCHMARK_API_URL?.replace(/\/$/, '')
const samples = Number(process.env.STATUS_BENCHMARK_SAMPLES ?? 50)
if (!baseUrl) throw new Error('STATUS_BENCHMARK_API_URL is required; use an approved read-only API origin.')
if (!Number.isInteger(samples) || samples < 5 || samples > 200) throw new Error('STATUS_BENCHMARK_SAMPLES must be an integer from 5 to 200')

for (const path of ['/health', '/status']) {
  const measurements = []
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now()
    const response = await fetch(`${baseUrl}${path}`, { headers: { Accept: 'application/json' } })
    await response.arrayBuffer()
    if (!response.ok) throw new Error(`${path} returned ${response.status}`)
    measurements.push(performance.now() - started)
  }
  measurements.sort((left, right) => left - right)
  console.log(JSON.stringify({ path, samples, p50: percentile(measurements, 0.5), p95: percentile(measurements, 0.95), p99: percentile(measurements, 0.99), max: measurements.at(-1) }))
}

function percentile(values, fraction) {
  return Number(values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)].toFixed(2))
}
