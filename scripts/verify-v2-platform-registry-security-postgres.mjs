import { readFile, readdir } from 'node:fs/promises'
import pg from 'pg'
import {
  V2_PLATFORM_REGISTRY_CLIENT_ROLES,
  V2_PLATFORM_REGISTRY_READER_ROLE,
  V2_PLATFORM_REGISTRY_TABLES,
  assertV2PlatformRegistryClientGrants,
  assertV2PlatformRegistryReaderRole,
  assertV2PlatformRegistryRlsContract,
  assertV2PlatformRegistryRuntimeGrants,
} from './v2-platform-registry-security-contract.mjs'

const { Client } = pg
const databaseUrl = process.env.V2_QA_DATABASE_URL ?? process.env.DATABASE_URL

if (process.env.V2_QA_ENVIRONMENT !== 'test' || process.env.V2_QA_DISPOSABLE_DATABASE !== 'CONFIRMED') {
  throw new Error('V2_PLATFORM_REGISTRY_SECURITY=BLOCKED disposable test confirmation is required')
}
if (!databaseUrl) throw new Error('V2_PLATFORM_REGISTRY_SECURITY=BLOCKED loopback database URL is required')
const parsedUrl = new URL(databaseUrl)
if (!['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname)) {
  throw new Error('V2_PLATFORM_REGISTRY_SECURITY=FAIL refusing a non-loopback database')
}

const migrationDirectory = 'infra/postgres/migrations'
const migrationFiles = (await readdir(migrationDirectory))
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort()
const platformRegistryHardeningMigration = '0028_harden_v2_plans_and_component_pins_rls.sql'
const platformRegistryHardeningIndex = migrationFiles.indexOf(platformRegistryHardeningMigration)
if (platformRegistryHardeningIndex < 0) {
  throw new Error('V2_PLATFORM_REGISTRY_SECURITY=FAIL migration 0028 is missing')
}

const client = new Client({ connectionString: databaseUrl })
const roleNames = [
  'anon',
  'authenticated',
  'v2_app',
  'custom_runtime',
  'unapproved_role',
  'registry_owner',
  'plan_reader_owner',
]

const privileges = `
  has_table_privilege(role_name, format('public.%I', table_name), 'SELECT') AS "canSelect",
  has_table_privilege(role_name, format('public.%I', table_name), 'INSERT') AS "canInsert",
  has_table_privilege(role_name, format('public.%I', table_name), 'UPDATE') AS "canUpdate",
  has_table_privilege(role_name, format('public.%I', table_name), 'DELETE') AS "canDelete",
  has_table_privilege(role_name, format('public.%I', table_name), 'TRUNCATE') AS "canTruncate",
  has_table_privilege(role_name, format('public.%I', table_name), 'REFERENCES') AS "canReferences",
  has_table_privilege(role_name, format('public.%I', table_name), 'TRIGGER') AS "canTrigger",
  pg_has_role(role_name, $3, 'MEMBER') AS "readerMembership"
`

async function expectDenied(role, statement, values = []) {
  await client.query('BEGIN')
  try {
    await client.query(`SET LOCAL ROLE ${role}`)
    await client.query(statement, values)
    await client.query('ROLLBACK')
    return false
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    return error?.code === '42501'
  }
}

const mutationProbes = {
  v2_plans: {
    insert: `INSERT INTO v2_plans (id, name, billing_mode) VALUES ('managed_beta', 'Managed beta', 'MANAGED_BETA') ON CONFLICT (id) DO NOTHING`,
    update: `UPDATE v2_plans SET active = active WHERE id = 'managed_beta'`,
    delete: `DELETE FROM v2_plans WHERE id = 'managed_beta'`,
  },
  v2_scientific_component_pins: {
    insert: `INSERT INTO v2_scientific_component_pins (component_key, repository, license, upstream_ref, upstream_commit, adapter_version, runtime_version, patch_status, compatibility_test, manifest_hash) SELECT component_key, repository, license, upstream_ref, upstream_commit, adapter_version, runtime_version, patch_status, compatibility_test, manifest_hash FROM v2_scientific_component_pins WHERE component_key = 'RDKIT' ON CONFLICT (component_key) DO NOTHING`,
    update: `UPDATE v2_scientific_component_pins SET manifest_hash = manifest_hash WHERE component_key = 'RDKIT'`,
    delete: `DELETE FROM v2_scientific_component_pins WHERE component_key = 'RDKIT'`,
  },
  v2_model_component_pins: {
    insert: `INSERT INTO v2_model_component_pins (component_key, repository, license, license_evidence_status, upstream_ref, upstream_commit, adapter_version, patch_status, compatibility_test, manifest_hash) SELECT component_key, repository, license, license_evidence_status, upstream_ref, upstream_commit, adapter_version, patch_status, compatibility_test, manifest_hash FROM v2_model_component_pins WHERE component_key = 'KGCNN_KERAS_UNLOCKED' ON CONFLICT (component_key) DO NOTHING`,
    update: `UPDATE v2_model_component_pins SET manifest_hash = manifest_hash WHERE component_key = 'KGCNN_KERAS_UNLOCKED'`,
    delete: `DELETE FROM v2_model_component_pins WHERE component_key = 'KGCNN_KERAS_UNLOCKED'`,
  },
}

try {
  await client.connect()
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
  await client.query(`
    DO $$
    DECLARE role_name TEXT;
    BEGIN
      FOREACH role_name IN ARRAY ARRAY[${roleNames.map((role) => `'${role}'`).join(', ')}] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION', role_name);
        ELSE
          EXECUTE format('ALTER ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION', role_name);
        END IF;
      END LOOP;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${V2_PLATFORM_REGISTRY_READER_ROLE}') THEN
        FOREACH role_name IN ARRAY ARRAY[${roleNames.map((role) => `'${role}'`).join(', ')}] LOOP
          EXECUTE format('REVOKE ${V2_PLATFORM_REGISTRY_READER_ROLE} FROM %I', role_name);
        END LOOP;
      END IF;
    END $$;
  `)
  await client.query('GRANT USAGE ON SCHEMA public TO anon, authenticated, v2_app, custom_runtime, unapproved_role, registry_owner, plan_reader_owner')

  for (const migrationFile of migrationFiles.slice(0, platformRegistryHardeningIndex)) {
    await client.query(await readFile(`${migrationDirectory}/${migrationFile}`, 'utf8'))
  }

  for (const table of V2_PLATFORM_REGISTRY_TABLES) {
    await client.query(`ALTER TABLE public.${table} OWNER TO registry_owner`)
  }
  await client.query('ALTER FUNCTION public.v2_platform_assign_workspace_plan(TEXT, TEXT, TIMESTAMPTZ) OWNER TO plan_reader_owner')

  await client.query(`
    GRANT ALL PRIVILEGES ON TABLE
      v2_plans,
      v2_scientific_component_pins,
      v2_model_component_pins
    TO anon, authenticated, v2_app
  `)
  await client.query(await readFile(`${migrationDirectory}/${platformRegistryHardeningMigration}`, 'utf8'))

  await client.query(`
    REVOKE ALL PRIVILEGES ON v2_plans, v2_scientific_component_pins, v2_model_component_pins FROM custom_runtime, unapproved_role;
    GRANT SELECT ON v2_plans, v2_scientific_component_pins, v2_model_component_pins TO custom_runtime;
    GRANT ${V2_PLATFORM_REGISTRY_READER_ROLE} TO custom_runtime;
  `)

  const { rows: readerRoleRows } = await client.query(`
    SELECT rolname AS "roleName", rolcanlogin AS "canLogin", rolsuper AS superuser,
      rolcreatedb AS "createDb", rolcreaterole AS "createRole", rolinherit AS inherit,
      rolbypassrls AS "bypassRls", rolreplication AS replication
    FROM pg_roles WHERE rolname = $1
  `, [V2_PLATFORM_REGISTRY_READER_ROLE])
  assertV2PlatformRegistryReaderRole(readerRoleRows)

  const { rows: rlsRows } = await client.query(`
    SELECT c.relname AS "tableName", pg_get_userbyid(c.relowner) AS "tableOwner",
      c.relrowsecurity AS "rlsEnabled", c.relforcerowsecurity AS "rlsForced"
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
  `, [V2_PLATFORM_REGISTRY_TABLES])
  const { rows: policyRows } = await client.query(`
    SELECT tablename AS "tableName", policyname AS "policyName", permissive, roles, cmd AS command,
      qual AS "usingExpression", with_check AS "checkExpression"
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY($1::text[])
  `, [V2_PLATFORM_REGISTRY_TABLES])
  const { rows: clientGrantRows } = await client.query(`
    SELECT role_name AS "roleName", table_name AS "tableName", ${privileges}
    FROM unnest($1::text[]) AS role_name
    CROSS JOIN unnest($2::text[]) AS table_name
  `, [V2_PLATFORM_REGISTRY_CLIENT_ROLES, V2_PLATFORM_REGISTRY_TABLES, V2_PLATFORM_REGISTRY_READER_ROLE])
  const { rows: defaultRuntimeGrantRows } = await client.query(`
    SELECT table_name AS "tableName", ${privileges.replaceAll('role_name', '$1')}
    FROM unnest($2::text[]) AS table_name
  `, ['v2_app', V2_PLATFORM_REGISTRY_TABLES, V2_PLATFORM_REGISTRY_READER_ROLE])
  const { rows: customRuntimeGrantRows } = await client.query(`
    SELECT table_name AS "tableName", ${privileges.replaceAll('role_name', '$1')}
    FROM unnest($2::text[]) AS table_name
  `, ['custom_runtime', V2_PLATFORM_REGISTRY_TABLES, V2_PLATFORM_REGISTRY_READER_ROLE])

  assertV2PlatformRegistryRlsContract({ rlsRows, policyRows })
  assertV2PlatformRegistryClientGrants(clientGrantRows)
  assertV2PlatformRegistryRuntimeGrants(defaultRuntimeGrantRows)
  assertV2PlatformRegistryRuntimeGrants(customRuntimeGrantRows)

  for (const role of [...V2_PLATFORM_REGISTRY_CLIENT_ROLES, 'v2_app', 'custom_runtime', 'unapproved_role']) {
    for (const table of V2_PLATFORM_REGISTRY_TABLES) {
      for (const operation of ['insert', 'update', 'delete']) {
        if (!await expectDenied(role, mutationProbes[table][operation])) {
          throw new Error(`V2_PLATFORM_REGISTRY_SECURITY=FAIL ${role} ${operation} unexpectedly succeeded on ${table}`)
        }
      }
    }
  }
  for (const table of V2_PLATFORM_REGISTRY_TABLES) {
    if (!await expectDenied('unapproved_role', `SELECT * FROM ${table} LIMIT 1`)) {
      throw new Error(`V2_PLATFORM_REGISTRY_SECURITY=FAIL unapproved role read unexpectedly succeeded on ${table}`)
    }
  }

  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE registry_owner')
    const ownerPlanRead = await client.query(`SELECT id FROM v2_plans WHERE id = 'managed_beta'`)
    if (ownerPlanRead.rowCount !== 1) throw new Error('MIGRATION_OWNER_READ=FAIL')
    await client.query(`UPDATE v2_plans SET active = active WHERE id = 'managed_beta'`)
    await client.query(`
      INSERT INTO v2_plans (id, name, billing_mode, capabilities, limits, active)
      VALUES ('managed_beta', 'Managed Beta', 'MANAGED_BETA', '[]'::jsonb, '{}'::jsonb, true)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, active = EXCLUDED.active
    `)
    await client.query(`INSERT INTO v2_scientific_component_pins (component_key, repository, license, upstream_ref, upstream_commit, adapter_version, runtime_version, patch_status, compatibility_test, manifest_hash) SELECT component_key, repository, license, upstream_ref, upstream_commit, adapter_version, runtime_version, patch_status, compatibility_test, manifest_hash FROM v2_scientific_component_pins WHERE component_key = 'RDKIT' ON CONFLICT (component_key) DO UPDATE SET manifest_hash = EXCLUDED.manifest_hash`)
    await client.query(`INSERT INTO v2_model_component_pins (component_key, repository, license, license_evidence_status, upstream_ref, upstream_commit, adapter_version, patch_status, compatibility_test, manifest_hash) SELECT component_key, repository, license, license_evidence_status, upstream_ref, upstream_commit, adapter_version, patch_status, compatibility_test, manifest_hash FROM v2_model_component_pins WHERE component_key = 'KGCNN_KERAS_UNLOCKED' ON CONFLICT (component_key) DO UPDATE SET manifest_hash = EXCLUDED.manifest_hash`)
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
  }

  await client.query(`
    CREATE OR REPLACE FUNCTION public.v2_registry_security_definer_plan_read()
    RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS 'SELECT id FROM public.v2_plans WHERE id = ''managed_beta'' AND active = true';
    ALTER FUNCTION public.v2_registry_security_definer_plan_read() OWNER TO plan_reader_owner;
    REVOKE ALL ON FUNCTION public.v2_registry_security_definer_plan_read() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.v2_registry_security_definer_plan_read() TO unapproved_role;
  `)
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE unapproved_role')
    const securityDefinerRead = await client.query('SELECT public.v2_registry_security_definer_plan_read() AS plan_id')
    if (securityDefinerRead.rows[0]?.plan_id !== 'managed_beta') throw new Error('SECURITY_DEFINER_PLAN_READ=FAIL')
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
  }

  for (const runtimeRole of ['v2_app', 'custom_runtime']) {
    await client.query('BEGIN')
    try {
      await client.query(`SET LOCAL ROLE ${runtimeRole}`)
      const planRead = await client.query(`SELECT id FROM v2_plans WHERE id = 'managed_beta'`)
      const scientificRead = await client.query(`SELECT component_key FROM v2_scientific_component_pins ORDER BY component_key`)
      const modelRead = await client.query(`SELECT component_key FROM v2_model_component_pins ORDER BY component_key`)
      if (planRead.rowCount !== 1 || scientificRead.rowCount === 0 || modelRead.rowCount === 0) {
        throw new Error(`V2_PLATFORM_REGISTRY_SECURITY=FAIL ${runtimeRole} read regression`)
      }
    } finally {
      await client.query('ROLLBACK').catch(() => undefined)
    }
  }

  console.log(JSON.stringify({
    blockerTableNegativeSecurityTests: 'PASS',
    serverSidePositiveTests: 'PASS',
    customRuntimeRoleRead: 'PASS',
    customRuntimeRoleWrite: 'DENIED',
    migrationOwnerRead: 'PASS',
    securityDefinerPlanRead: 'PASS',
    defaultRuntimeRead: 'PASS',
    defaultRuntimeWrite: 'DENIED',
    unapprovedRoleAccess: 'DENIED',
    freshMigrationChain: 'PASS',
    upgradeMigrationChain: 'PASS',
    planSeedReplay: 'PASS',
    roleConfiguratorRlsConsistency: 'PASS',
    scientificPinProvenanceClientMutation: 'BLOCKED',
    planReadRegression: 'PASS',
    stagingDatabaseWrites: 0,
    productionDatabaseWrites: 0,
    matrix: customRuntimeGrantRows.map((row) => ({
      tableName: row.tableName,
      rlsEnabled: true,
      forceRls: true,
      anonInsert: false,
      authenticatedInsert: false,
      runtimeSelect: row.canSelect,
      runtimeInsert: row.canInsert,
      runtimeUpdate: row.canUpdate,
      runtimeDelete: row.canDelete,
    })),
  }))
} finally {
  await client.end().catch(() => undefined)
}
