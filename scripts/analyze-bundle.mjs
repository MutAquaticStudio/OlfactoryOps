import { gzipSync } from 'node:zlib'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'

const root = process.cwd()
const directory = resolve(root, 'dist/assets')
const files = (await readdir(directory)).filter((file) => file.endsWith('.js') || file.endsWith('.css'))
const entries = await Promise.all(files.map(async (file) => {
  const body = await readFile(resolve(directory, file))
  return { file, bytes: body.byteLength, gzipBytes: gzipSync(body).byteLength }
}))
entries.sort((left, right) => right.bytes - left.bytes)
const report = {
  generatedAtUtc: new Date().toISOString(),
  totals: { bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0), gzipBytes: entries.reduce((sum, entry) => sum + entry.gzipBytes, 0) },
  assets: entries,
  note: 'This artifact report does not claim route-level loading behavior. Route code splitting requires authenticated E2E verification.',
}
const output = resolve(root, 'reports/bundle-analysis-latest.json')
await mkdir(resolve(root, 'reports'), { recursive: true })
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(`Wrote ${relative(root, output)}`)
