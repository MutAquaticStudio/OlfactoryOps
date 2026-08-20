import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const platformOwnerReadinessSql = `
  SELECT
    count(*)::int AS active_owners,
    COALESCE(bool_and(mfa_required), false) AS all_mfa_required,
    COALESCE(bool_and(role_key = 'PLATFORM_OWNER'), false) AS all_platform_owner_roles,
    COALESCE(bool_and(status = 'ACTIVE'), false) AS all_active,
    COALESCE(bool_or(EXISTS (
      SELECT 1
      FROM v2_platform_audit_events AS audit
      WHERE audit.actor_user_id = operator.user_id
        AND audit.subject_id = operator.user_id
        AND audit.actor_role = 'PLATFORM_OWNER'
        AND audit.action = 'platform.owner.bootstrap'
        AND audit.outcome = 'ALLOWED'
        AND audit.subject_type = 'platform_operator'
    )), false) AS bootstrap_audit_present
  FROM v2_platform_operators AS operator
  WHERE operator.role_key = 'PLATFORM_OWNER'
    AND operator.status = 'ACTIVE'
`;

function countClass(value) {
  if (value === 0) return "ZERO";
  if (value === 1) return "ONE";
  return "MULTIPLE";
}

export function summarizePlatformOwnerReadiness(row) {
  const activeOwnerCount = Number.isInteger(row?.active_owners)
    ? row.active_owners
    : -1;
  const activeOwnerClass =
    activeOwnerCount >= 0 ? countClass(activeOwnerCount) : "UNPROVEN";
  const ready =
    activeOwnerCount === 1 &&
    row?.all_platform_owner_roles === true &&
    row?.all_active === true &&
    row?.all_mfa_required === true &&
    row?.bootstrap_audit_present === true;

  return [
    `ACTIVE_PLATFORM_OWNER_COUNT=${activeOwnerClass}`,
    `PLATFORM_OWNER_ROLE=${
      activeOwnerCount === 1 && row?.all_platform_owner_roles === true
        ? "PASS"
        : "FAIL"
    }`,
    `PLATFORM_OWNER_STATUS_ACTIVE=${
      activeOwnerCount === 1 && row?.all_active === true ? "PASS" : "FAIL"
    }`,
    `PLATFORM_OWNER_MFA_REQUIRED=${
      activeOwnerCount === 1 && row?.all_mfa_required === true ? "PASS" : "FAIL"
    }`,
    `PLATFORM_OWNER_AUDIT_EVENT=${
      activeOwnerCount === 1 && row?.bootstrap_audit_present === true
        ? "PASS"
        : "FAIL"
    }`,
    `PLATFORM_OWNER_READY=${ready ? "PASS" : "UNPROVEN"}`,
  ];
}

export function unprovenPlatformOwnerReadiness() {
  return [
    "ACTIVE_PLATFORM_OWNER_COUNT=UNPROVEN",
    "PLATFORM_OWNER_ROLE=UNPROVEN",
    "PLATFORM_OWNER_STATUS_ACTIVE=UNPROVEN",
    "PLATFORM_OWNER_MFA_REQUIRED=UNPROVEN",
    "PLATFORM_OWNER_AUDIT_EVENT=UNPROVEN",
    "PLATFORM_OWNER_READY=UNPROVEN",
  ];
}

export async function verifyPlatformOwnerReadiness({
  environment = process.env,
  pgModule,
  emit = console.log,
} = {}) {
  const releaseRoot = environment.RELEASE_WORKTREE || process.cwd();
  const pg = pgModule ?? createRequire(`${releaseRoot}/package.json`)("pg");
  let client;
  try {
    client = new pg.Client({
      connectionString: environment.PRODUCTION_DATABASE_URL,
      connectionTimeoutMillis: 15_000,
      query_timeout: 15_000,
      statement_timeout: 15_000,
    });
    await client.connect();
    const result = await client.query(platformOwnerReadinessSql);
    const report = summarizePlatformOwnerReadiness(result.rows?.[0]);
    report.forEach(emit);
    return report.at(-1) === "PLATFORM_OWNER_READY=PASS" ? 0 : 1;
  } catch {
    unprovenPlatformOwnerReadiness().forEach(emit);
    return 1;
  } finally {
    await client?.end().catch(() => undefined);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await verifyPlatformOwnerReadiness();
}
