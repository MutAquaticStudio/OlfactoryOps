import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const [deployment, readme, releaseSource, packageJson] = await Promise.all([
  readFile(resolve(root, 'docs/deployment.md'), 'utf8'),
  readFile(resolve(root, 'README.md'), 'utf8'),
  readFile(resolve(root, 'src/data/release.ts'), 'utf8'),
  readFile(resolve(root, 'package.json'), 'utf8'),
])
const migrationHead = releaseSource.match(/migrationHead:\s*'([^']+)'/)?.[1]
const version = JSON.parse(packageJson).version

for (const [name, content] of [['docs/deployment.md', deployment], ['README.md', readme]]) {
  if (!content.includes(migrationHead)) throw new Error(`${name} does not mention migration head ${migrationHead}`)
  if (!content.includes(version)) throw new Error(`${name} does not mention release candidate ${version}`)
}
if (!deployment.includes('does not require MFA')) throw new Error('Deployment docs must state the current formula approval MFA policy')
for (const script of ['release:manifest:generate', 'release:manifest:validate', 'release:provenance:verify', 'release:migrations:verify']) {
  if (!deployment.includes(script)) throw new Error(`Deployment docs do not mention ${script}`)
}
console.log(JSON.stringify({ documentation: 'valid', version, migrationHead }))
