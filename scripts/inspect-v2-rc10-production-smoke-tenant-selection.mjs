import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const maxSmokeTenantCandidates = 20

const smokeHostnamePattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.next\.labofscents\.org$/

export const productionSmokeTenantSelectionSql = `
  SELECT
    hostname.hostname,
    count(*) OVER ()::int AS candidate_count
  FROM public.v2_workspace_hostnames AS hostname
  INNER JOIN public.v2_organizations AS organization ON organization.id = hostname.organization_id
  WHERE hostname.hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.next\\.labofscents\\.org$'
    AND hostname.status = 'ACTIVE'
    AND organization.status = 'ACTIVE'
  ORDER BY hostname.hostname ASC
  LIMIT 21
`

function unprovenReport() {
  return [
    'SMOKE_TENANT_SELECTION_REQUIRED=NO',
    'SMOKE_TENANT_CANDIDATE_COUNT=UNPROVEN',
  ]
}

export function summarizeProductionSmokeTenantCandidates(rows) {
  if (!Array.isArray(rows)) return unprovenReport()
  if (rows.length === 0) {
    return [
      'SMOKE_TENANT_SELECTION_REQUIRED=NO',
      'SMOKE_TENANT_CANDIDATE_COUNT=0',
    ]
  }

  const candidateCount = rows[0]?.candidate_count
  if (!Number.isSafeInteger(candidateCount) || candidateCount < 1) {
    return unprovenReport()
  }
  if (candidateCount > maxSmokeTenantCandidates || rows.length !== candidateCount) {
    return unprovenReport()
  }

  const hostnames = rows.map((row) => row?.hostname)
  if (
    hostnames.some((hostname) => typeof hostname !== 'string' || !smokeHostnamePattern.test(hostname)) ||
    new Set(hostnames).size !== hostnames.length
  ) {
    return unprovenReport()
  }

  const report = [
    'SMOKE_TENANT_SELECTION_REQUIRED=YES',
    `SMOKE_TENANT_CANDIDATE_COUNT=${candidateCount}`,
  ]
  hostnames.sort((left, right) => left.localeCompare(right)).forEach((hostname, index) => {
    report.push(`SMOKE_TENANT_CANDIDATE_${index + 1}=${hostname}`)
  })
  return report
}

export async function inspectProductionSmokeTenantCandidates({
  environment = process.env,
  pgModule,
  emit = console.log,
} = {}) {
  let client
  let transactionOpen = false

  try {
    const releaseRoot = environment.RELEASE_WORKTREE || process.cwd()
    const pg = pgModule ?? createRequire(`${releaseRoot}/package.json`)('pg')
    client = new pg.Client({
      connectionString: environment.PRODUCTION_DATABASE_URL,
      connectionTimeoutMillis: 15_000,
      query_timeout: 15_000,
      statement_timeout: 15_000,
    })
    await client.connect()
    await client.query('BEGIN READ ONLY')
    transactionOpen = true
    const result = await client.query(productionSmokeTenantSelectionSql)
    await client.query('COMMIT')
    transactionOpen = false

    const report = summarizeProductionSmokeTenantCandidates(result.rows)
    const pass = !report.includes('SMOKE_TENANT_CANDIDATE_COUNT=UNPROVEN')
    report.forEach(emit)
    return { pass, report }
  } catch {
    const report = unprovenReport()
    report.forEach(emit)
    return { pass: false, report }
  } finally {
    if (transactionOpen) {
      try {
        await client?.query?.('ROLLBACK')
      } catch {}
    }
    try {
      await client?.end?.()
    } catch {}
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await inspectProductionSmokeTenantCandidates()
  if (!result.pass) process.exitCode = 1
}
