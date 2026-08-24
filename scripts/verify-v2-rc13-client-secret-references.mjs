import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const forbiddenClientReference = /(?:VITE|PUBLIC)_[A-Z0-9_]*(?:PEPPER|SECRET|DATABASE|TOKEN)/

export function isClientBuildInput(path) {
  const normalized = path.replaceAll('\\', '/')
  return normalized === 'index.html'
    || normalized === 'vite.config.ts'
    || normalized === '.env'
    || normalized === '.env.production'
    || normalized.startsWith('src/')
    || normalized.startsWith('public/')
}

export function inspectClientReferences(entries) {
  return entries
    .filter(({ path }) => isClientBuildInput(path))
    .filter(({ content }) => forbiddenClientReference.test(content))
    .map(({ path }) => path)
}

function trackedClientEntries(root) {
  const tracked = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter(isClientBuildInput)

  return tracked.map((path) => ({ path, content: readFileSync(resolve(root, path), 'utf8') }))
}

export function verifyClientSecretReferences(root) {
  if (!isAbsolute(root) || !existsSync(root)) throw new Error('RC13_CLIENT_SOURCE_ROOT_INVALID')
  const findings = inspectClientReferences(trackedClientEntries(root))
  if (findings.length > 0) throw new Error('RC13_CLIENT_SECRET_REFERENCE_FOUND')
  return { inspectedPaths: 'CLIENT_BUILD_INPUTS_ONLY', result: 'PASS' }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyClientSecretReferences(process.argv[2] ?? '')
    console.log(`PRODUCTION_CLIENT_SOURCE_SCOPE=${result.inspectedPaths}`)
    console.log('PRODUCTION_CLIENT_SECRET_REFERENCE=PASS')
  } catch {
    console.log('PRODUCTION_CLIENT_SECRET_REFERENCE=FAIL')
    process.exitCode = 1
  }
}
