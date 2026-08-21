import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const [packageSource, releaseSource, changelog] = await Promise.all([
  readFile(resolve(root, 'package.json'), 'utf8'),
  readFile(resolve(root, 'src/data/release.ts'), 'utf8'),
  readFile(resolve(root, 'CHANGELOG.md'), 'utf8'),
])
const packageVersion = JSON.parse(packageSource).version
const version = match(releaseSource, /applicationVersion:\s*'([^']+)'/)
const channel = match(releaseSource, /releaseChannel:\s*'([^']+)'/)
const migrationHead = match(releaseSource, /migrationHead:\s*'([^']+)'/)

if (!/^\d+\.\d+\.\d+(?:-(?:rc|beta)\.\d+)?$/.test(packageVersion) || packageVersion === '0.0.0') {
  throw new Error(`package.json version must be a non-zero semantic version, received ${packageVersion}`)
}
if (packageVersion !== version) throw new Error(`package.json (${packageVersion}) and release identity (${version}) differ`)
if (channel !== 'release-candidate') throw new Error(`Unsupported release channel: ${channel}`)
if (!/^\d{4}$/.test(migrationHead)) throw new Error(`Invalid migration head: ${migrationHead}`)
if (!changelog.includes(`## [${packageVersion}]`)) throw new Error(`CHANGELOG.md has no entry for ${packageVersion}`)

console.log(JSON.stringify({ version, channel, migrationHead, status: 'valid' }))

function match(source, expression) {
  const value = source.match(expression)?.[1]
  if (!value) throw new Error(`Release identity is missing ${expression}`)
  return value
}
