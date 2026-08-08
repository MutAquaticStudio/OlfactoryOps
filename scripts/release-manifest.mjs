import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'

const root = process.cwd()
const command = process.argv[2]
const reportsDirectory = resolve(root, 'reports/releases')
const manifestPath = process.env.RELEASE_MANIFEST_PATH || resolve(reportsDirectory, 'olfactoryops-current-manifest.json')

if (!['generate', 'validate', 'provenance', 'page-artifact'].includes(command)) {
  throw new Error('Usage: release-manifest.mjs generate|validate|provenance|page-artifact [directory]')
}

if (command === 'page-artifact') {
  const directory = resolve(root, process.argv[3] ?? 'dist')
  const metadata = await identity()
  await writeFile(resolve(directory, 'release.json'), `${JSON.stringify({
    ...metadata,
    artifact: 'pages',
    generatedAtUtc: new Date().toISOString(),
  }, null, 2)}\n`)
  console.log(`Wrote ${relative(root, resolve(directory, 'release.json'))}`)
  process.exit(0)
}

if (command === 'generate') {
  const metadata = await identity()
  const manifest = {
    schemaVersion: 1,
    ...metadata,
    gitTag: git(['tag', '--points-at', 'HEAD']).split(/\r?\n/).find(Boolean) ?? null,
    branch: git(['branch', '--show-current']) || null,
    worktreeClean: git(['status', '--porcelain']) === '',
    nodeVersion: process.version,
    npmVersion: gitNpmVersion(),
    wranglerVersion: optionalVersion(['npx.cmd', 'wrangler', '--version']),
    lockfileHash: await fileHash('package-lock.json'),
    migrationInventoryHash: await migrationHash(),
    artifacts: {
      frontend: await directoryHash('dist'),
      apiWorker: await directoryHash('dist-worker'),
      tenantRouter: await directoryHash('dist-tenant-router'),
    },
    deployments: {
      pagesProject: process.env.RELEASE_PAGES_PROJECT ?? null,
      pagesDeploymentId: process.env.RELEASE_PAGES_DEPLOYMENT_ID ?? null,
      apiWorkerName: process.env.RELEASE_API_WORKER_NAME ?? 'olfactoryops-api',
      apiWorkerDeploymentId: process.env.RELEASE_API_WORKER_DEPLOYMENT_ID ?? null,
      tenantRouterName: process.env.RELEASE_TENANT_ROUTER_NAME ?? 'olfactoryops-tenant-router',
      tenantRouterDeploymentId: process.env.RELEASE_TENANT_ROUTER_DEPLOYMENT_ID ?? null,
      testPagesDeploymentId: process.env.RELEASE_TEST_PAGES_DEPLOYMENT_ID ?? null,
      testWorkerDeploymentId: process.env.RELEASE_TEST_WORKER_DEPLOYMENT_ID ?? null,
      testRouterDeploymentId: process.env.RELEASE_TEST_ROUTER_DEPLOYMENT_ID ?? null,
      rollbackTarget: process.env.RELEASE_ROLLBACK_TARGET ?? null,
    },
    evidence: [
      'reports/release-remediation-baseline-2026-08-05.md',
      'reports/original-audit-closure-matrix-2026-08-05.md',
    ],
    releaseDecision: 'NOT_READY_FOR_RELEASE',
  }
  await mkdir(reportsDirectory, { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Wrote ${relative(root, manifestPath)}`)
  process.exit(0)
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
validateManifest(manifest, command === 'provenance')
console.log(JSON.stringify({ manifest: relative(root, manifestPath), status: 'valid', mode: command }))

async function identity() {
  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  const source = await readFile(resolve(root, 'src/data/release.ts'), 'utf8')
  const releaseChannel = source.match(/releaseChannel:\s*'([^']+)'/)?.[1]
  const migrationHead = source.match(/migrationHead:\s*'([^']+)'/)?.[1]
  return {
    applicationVersion: packageJson.version,
    releaseChannel,
    fullGitSha: process.env.RELEASE_GIT_SHA ?? git(['rev-parse', 'HEAD']),
    buildTimestampUtc: process.env.RELEASE_BUILD_TIMESTAMP_UTC ?? new Date().toISOString(),
    environment: process.env.RELEASE_ENVIRONMENT ?? 'local',
    migrationHead,
  }
}

function validateManifest(manifest, requireDeploymentProof) {
  const required = ['applicationVersion', 'releaseChannel', 'fullGitSha', 'buildTimestampUtc', 'migrationHead', 'lockfileHash', 'migrationInventoryHash']
  for (const field of required) if (!manifest[field] || manifest[field] === '0.0.0') throw new Error(`Manifest missing ${field}`)
  if (!/^[a-f0-9]{40}$/i.test(manifest.fullGitSha)) throw new Error('Manifest fullGitSha must be a full Git SHA')
  if (!/^\d+\.\d+\.\d+(?:-(?:rc|beta)\.\d+)?$/.test(manifest.applicationVersion)) throw new Error('Manifest applicationVersion is not semantic')
  if (!manifest.artifacts || Object.values(manifest.artifacts).some((value) => !value?.sha256 || value.sha256 === 'not-built')) {
    throw new Error('Manifest has incomplete artifact checksums')
  }
  if (requireDeploymentProof || process.env.RELEASE_MANIFEST_MODE === 'release') {
    if (!manifest.worktreeClean) throw new Error('Release-mode manifest requires a clean worktree')
    if (!manifest.gitTag || manifest.gitTag !== `v${manifest.applicationVersion}`) throw new Error('Release-mode manifest tag must match applicationVersion')
    for (const field of ['pagesDeploymentId', 'apiWorkerDeploymentId', 'tenantRouterDeploymentId', 'testPagesDeploymentId', 'testWorkerDeploymentId', 'testRouterDeploymentId', 'rollbackTarget']) {
      if (!manifest.deployments?.[field]) throw new Error(`Release-mode manifest missing deployments.${field}`)
    }
  }
}

async function migrationHash() {
  const directory = resolve(root, 'migrations')
  const files = (await readdir(directory)).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort()
  const contents = await Promise.all(files.map((file) => readFile(resolve(directory, file))))
  return createHash('sha256').update(Buffer.concat(contents)).digest('hex')
}

async function fileHash(file) {
  return createHash('sha256').update(await readFile(resolve(root, file))).digest('hex')
}

async function directoryHash(directory) {
  const target = resolve(root, directory)
  try {
    const files = await allFiles(target)
    const hash = createHash('sha256')
    for (const file of files.sort()) {
      hash.update(relative(target, file).split(sep).join('/'))
      hash.update(await readFile(file))
    }
    return { sha256: hash.digest('hex'), files: files.length }
  } catch (error) {
    if (error?.code === 'ENOENT') return { sha256: 'not-built', files: 0 }
    throw error
  }
}

async function allFiles(directory) {
  const entries = await readdir(directory)
  const files = []
  for (const entry of entries) {
    const candidate = resolve(directory, entry)
    if ((await stat(candidate)).isDirectory()) files.push(...await allFiles(candidate))
    else files.push(candidate)
  }
  return files
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function gitNpmVersion() {
  return optionalVersion(['npm.cmd', '--version'])
}

function optionalVersion(command) {
  try {
    return execFileSync(command[0], command.slice(1), { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return 'unavailable'
  }
}
