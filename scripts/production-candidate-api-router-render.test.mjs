import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { expect, test } from 'vitest'

const workflow = readFileSync('.github/workflows/v2-production-candidate-dispatch.yml', 'utf8')
const immutableRc2Sha = '5985834a0e14728c81c8c028a72122ded544bd6b'
const hyperdriveId = 'a'.repeat(32)
const candidateWorkspaceBaseDomain = 'next.labofscents.org'
const candidateFixtureHostname = 'release-test.next.labofscents.org'

function isCandidateFixtureHostname(hostname) {
  const suffix = `.${candidateWorkspaceBaseDomain}`
  return hostname.endsWith(suffix) && hostname.slice(0, -suffix.length).split('.').length === 1
}

function rendererFor(jobName) {
  const jobStart = workflow.indexOf(`  ${jobName}:`)
  const marker = "node --input-type=module <<'EOF'"
  const start = workflow.indexOf(marker, jobStart)
  const end = workflow.indexOf('\n          EOF', start)
  if (jobStart < 0 || start < 0 || end < 0) throw new Error(`${jobName} renderer is missing from the protected dispatcher`)
  return workflow.slice(start + marker.length, end).trim()
}

function withWorkspace(action) {
  const directory = mkdtempSync(join(process.cwd(), '.candidate-api-router-render-'))
  try {
    return action(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function runRenderer(directory, renderer, environment) {
  return execFileSync(process.execPath, ['--input-type=module', '--eval', renderer], {
    cwd: directory,
    encoding: 'utf8',
    stdio: 'pipe',
    env: {
      ...process.env,
      RELEASE_SHA: immutableRc2Sha,
      PRODUCTION_HYPERDRIVE_ID: hyperdriveId,
      PRODUCTION_CANDIDATE_PAGES_PROJECT: 'candidate-pages',
      CANDIDATE_WORKSPACE_BASE_DOMAIN: candidateWorkspaceBaseDomain,
      CANDIDATE_FIXTURE_HOSTNAME: candidateFixtureHostname,
      ...environment,
    },
  })
}

function entrypoint(configPath, config) {
  const main = config.match(/^main\s*=\s*"([^"]+)"\s*$/m)?.[1]
  if (!main) throw new Error('candidate config is missing main')
  return { main, path: resolve(dirname(configPath), main) }
}

test('candidate API renderer keeps its config at root and resolves the immutable RC2 entrypoint', () => {
  withWorkspace((directory) => {
    mkdirSync(join(directory, 'worker', 'v2-api'), { recursive: true })
    writeFileSync(join(directory, 'worker', 'v2-api', 'index.ts'), 'export default { fetch() { return new Response("ok") } }\n')
    writeFileSync(join(directory, 'wrangler.v2-api-production.example.toml'), `name = "olfactoryops-v2-api-production"\nmain = "worker/v2-api/index.ts"\nroutes = [{ pattern = "api.labofscents.org/*", zone_name = "labofscents.org" }]\n[vars]\nRELEASE_GIT_SHA = "REPLACE_WITH_VERIFIED_RELEASE_SHA"\nV2_API_PUBLIC_HOSTNAME = "api.labofscents.org"\nV2_PUBLIC_PAGES_HOSTNAME = "labofscents.org"\nV2_PLATFORM_ADMIN_HOSTNAME = "admin.labofscents.org"\nV2_WORKSPACE_BASE_DOMAIN = "labofscents.org"\n[[hyperdrive]]\nbinding = "HYPERDRIVE"\nid = "REPLACE_WITH_PRODUCTION_HYPERDRIVE_ID"\n[[services]]\nbinding = "CLOUD_RUNTIME"\nservice = "olfactoryops-v2-cloud-runtime-production"\n`)

    const output = runRenderer(directory, rendererFor('deploy-candidate-api'), {})
    const configPath = join(directory, 'wrangler.v2-api-production-candidate.toml')
    const config = readFileSync(configPath, 'utf8')
    const resolved = entrypoint(configPath, config)
    const relocated = resolve(directory, '.qa', resolved.main)

    expect(existsSync(resolved.path)).toBe(true)
    expect(existsSync(relocated)).toBe(false)
    expect(relative(directory, resolved.path).replaceAll('\\', '/')).toBe('worker/v2-api/index.ts')
    expect(output).toContain('CANDIDATE_ENTRYPOINT_RESOLUTION=PASS')
    expect(config).toContain('name = "olfactoryops-v2-api-production-candidate"')
    expect(config).toContain('api-next.labofscents.org/*')
    expect(config).not.toContain('api.labofscents.org/*')
    expect(config).toContain(`V2_WORKSPACE_BASE_DOMAIN = "${candidateWorkspaceBaseDomain}"`)
    expect(config).not.toContain('V2_WORKSPACE_BASE_DOMAIN = "labofscents.org"')
    expect(config).not.toContain('REPLACE_WITH_')
  })
})

test('candidate tenant router renderer keeps its config at root and resolves the immutable RC2 entrypoint', () => {
  withWorkspace((directory) => {
    mkdirSync(join(directory, 'worker'), { recursive: true })
    writeFileSync(join(directory, 'worker', 'v2-tenant-router.ts'), 'export default { fetch() { return new Response("ok") } }\n')
    writeFileSync(join(directory, 'wrangler.v2-tenant-router-production.example.toml'), `name = "olfactoryops-v2-tenant-router-production"\nmain = "worker/v2-tenant-router.ts"\nroutes = [{ pattern = "*.labofscents.org/*", zone_name = "labofscents.org" }]\n[vars]\nPAGES_ORIGIN = "https://REPLACE_WITH_PRODUCTION_PAGES_ORIGIN"\nRELEASE_GIT_SHA = "REPLACE_WITH_VERIFIED_RELEASE_SHA"\nV2_WORKSPACE_BASE_DOMAIN = "labofscents.org"\n[[hyperdrive]]\nbinding = "HYPERDRIVE"\nid = "REPLACE_WITH_PRODUCTION_HYPERDRIVE_ID"\n`)

    const output = runRenderer(directory, rendererFor('deploy-candidate-tenant-router'), {
      CANDIDATE_PAGES_ORIGIN: 'https://production-candidate.candidate-pages.pages.dev',
    })
    const configPath = join(directory, 'wrangler.v2-tenant-router-production-candidate.toml')
    const config = readFileSync(configPath, 'utf8')
    const resolved = entrypoint(configPath, config)
    const relocated = resolve(directory, '.qa', resolved.main)

    expect(existsSync(resolved.path)).toBe(true)
    expect(existsSync(relocated)).toBe(false)
    expect(relative(directory, resolved.path).replaceAll('\\', '/')).toBe('worker/v2-tenant-router.ts')
    expect(output).toContain('CANDIDATE_ENTRYPOINT_RESOLUTION=PASS')
    expect(config).toContain('name = "olfactoryops-v2-tenant-router-production-candidate"')
    expect(config).toContain(`pattern = "${candidateFixtureHostname}"`)
    expect(config).toContain('custom_domain = true')
    expect(config).not.toContain('*.labofscents.org/*')
    expect(config).not.toContain('*.next.labofscents.org/*')
    expect(config).toContain(`V2_WORKSPACE_BASE_DOMAIN = "${candidateWorkspaceBaseDomain}"`)
    expect(config).not.toContain('V2_WORKSPACE_BASE_DOMAIN = "labofscents.org"')
    expect(config).not.toContain('REPLACE_WITH_')
  })
})

test('candidate namespace is valid, coherent, and binds only one fixture Custom Domain', () => {
  const apiJob = workflow.slice(workflow.indexOf('  deploy-candidate-api:'), workflow.indexOf('  deploy-candidate-tenant-router:'))
  const routerJob = workflow.slice(workflow.indexOf('  deploy-candidate-tenant-router:'), workflow.indexOf('  smoke-candidate:'))

  expect(apiJob).toContain('wrangler.v2-api-production-candidate.toml')
  expect(apiJob).not.toContain('.qa/wrangler.v2-api-production-candidate.toml')
  expect(apiJob).toContain('api-next.labofscents.org/*')
  expect(apiJob).not.toMatch(/routes\s*=\s*\[\{ pattern = "api\.labofscents\.org\/\*"/)
  expect(apiJob).toContain('V2_WORKSPACE_BASE_DOMAIN = "${process.env.CANDIDATE_WORKSPACE_BASE_DOMAIN}"')
  expect(routerJob).toContain('wrangler.v2-tenant-router-production-candidate.toml')
  expect(routerJob).not.toContain('.qa/wrangler.v2-tenant-router-production-candidate.toml')
  expect(routerJob).toContain('CANDIDATE_FIXTURE_HOSTNAME')
  expect(routerJob).toContain('custom_domain = true')
  expect(routerJob).toContain('V2_WORKSPACE_BASE_DOMAIN = "${process.env.CANDIDATE_WORKSPACE_BASE_DOMAIN}"')
  expect(workflow).toContain('CANDIDATE_WORKSPACE_BASE_DOMAIN: next.labofscents.org')
  expect(workflow).toContain('VITE_V2_WORKSPACE_BASE_DOMAIN: next.labofscents.org')
  expect(workflow).toContain('candidate_fixture_hostname:')
  expect(workflow).not.toContain('workspace-*-next.labofscents.org/*')
  expect(workflow).toContain('node scripts/verify-v2-production-candidate-acceptance.mjs --validate-only')
  expect(isCandidateFixtureHostname(candidateFixtureHostname)).toBe(true)
  expect(isCandidateFixtureHostname('api-next.labofscents.org')).toBe(false)
  expect(isCandidateFixtureHostname('release-test.labofscents.org')).toBe(false)
})
