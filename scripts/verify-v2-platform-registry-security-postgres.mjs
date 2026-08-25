import { readFile, readdir } from 'node:fs/promises'
import pg from 'pg'
import {
  V2_PLATFORM_REGISTRY_CLIENT_ROLES,
  V2_PLATFORM_REGISTRY_TABLES,
  assertV2PlatformRegistryClientGrants,
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
if (migrationFiles.at(-1) !== '0028_harden_v2_plans_and_component_pins_rls.sql') {
  throw new Error('V2_PLATFORM_REGISTRY_SECURITY=FAIL migration 0028 is not the repository head')
}

const client = new Client({ connectionString: databaseUrl })

const privileges = `
  has_table_privilege(role_name, format('public.%I', table_name), 'SELECT') AS "canSelect",
  has_table_privilege(role_name, format('public.%I', table_name), 'INSERT') AS "canInsert",
  has_table_privilege(role_name, format('public.%I', table_name), 'UPDATE') AS "canUpdate",
  has_table_privilege(role_name, format('public.%I', table_name), 'DELETE') AS "canDelete",
  has_table_privilege(role_name, format('public.%I', table_name), 'TRUNCATE') AS "canTruncate",
  has_table_privilege(role_name, format('public.%I', table_name), 'REFERENCES') AS "canReferences",
  has_table_privilege(role_name, format('public.%I', table_name), 'TRIGGER') AS "canTrigger"
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
      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'v2_app'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION', role_name);
        ELSE
          EXECUTE format('ALTER ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION', role_name);
        END IF;
      END LOOP;
    END $$;
  `)
  await client.query('GRANT USAGE ON SCHEMA public TO anon, authenticated, v2_app')

  for (const migrationFile of migrationFiles.slice(0, -1)) {
    await client.query(await readFile(`${migrationDirectory}/${migrationFile}`, 'utf8'))
  }

  await client.query(`
    GRANT ALL PRIVILEGES ON TABLE
      v2_plans,
      v2_scientific_component_pins,
      v2_model_component_pins
    TO anon, authenticated, v2_app
  `)
  await client.query(await readFile(`${migrationDirectory}/${migrationFiles.at(-1)}`, 'utf8'))

  const { rows: rlsRows } = await client.query(`
    SELECT c.relname AS "tableName", c.relrowsecurity AS "rlsEnabled", c.relforcerowsecurity AS "rlsForced"
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
  `, [V2_PLATFORM_REGISTRY_CLIENT_ROLES, V2_PLATFORM_REGISTRY_TABLES])
  const { rows: runtimeGrantRows } = await client.query(`
    SELECT table_name AS "tableName", ${privileges.replaceAll('role_name', '$1')}
    FROM unnest($2::text[]) AS table_name
  `, ['v2_app', V2_PLATFORM_REGISTRY_TABLES])
  assertV2PlatformRegistryRlsContract({ rlsRows, policyRows })
  assertV2PlatformRegistryClientGrants(clientGrantRows)
  assertV2PlatformRegistryRuntimeGrants(runtimeGrantRows)

  for (const role of [...V2_PLATFORM_REGISTRY_CLIENT_ROLES, 'v2_app']) {
    for (const table of V2_PLATFORM_REGISTRY_TABLES) {
      for (const operation of ['insert', 'update', 'delete']) {
        if (!await expectDenied(role, mutationProbes[table][operation])) {
          throw new Error(`V2_PLATFORM_REGISTRY_SECURITY=FAIL ${role} ${operation} unexpectedly succeeded on ${table}`)
        }
      }
    }
  }

  await client.query('BEGIN')
  try {
    const organizationId = 'org_registry_security_test'
    await client.query(`INSERT INTO v2_organizations (id, slug, name) VALUES ($1, 'registry-security-test', 'Registry security test')`, [organizationId])
    await client.query(`INSERT INTO v2_subscriptions (id, organization_id, plan_id) VALUES ('sub_registry_security_test', $1, 'managed_beta')`, [organizationId])
    await client.query('SET LOCAL ROLE v2_app')
    await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId])
    const planRead = await client.query(`SELECT s.id FROM v2_subscriptions s JOIN v2_plans p ON p.id = s.plan_id WHERE s.organization_id = $1`, [organizationId])
    const scientificRead = await client.query(`SELECT component_key FROM v2_scientific_component_pins ORDER BY component_key`)
    const modelRead = await client.query(`SELECT component_key FROM v2_model_component_pins ORDER BY component_key`)
    if (planRead.rowCount !== 1 || scientificRead.rowCount === 0 || modelRead.rowCount === 0) {
      throw new Error('V2_PLATFORM_REGISTRY_SECURITY=FAIL runtime read regression')
    }
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
  }

  await client.query('BEGIN')
  try {
    await client.query(`UPDATE v2_plans SET active = active WHERE id = 'managed_beta'`)
    await client.query(`INSERT INTO v2_scientific_component_pins (component_key, repository, license, upstream_ref, upstream_commit, adapter_version, runtime_version, patch_status, compatibility_test, manifest_hash) SELECT component_key, repository, license, upstream_ref, upstream_commit, adapter_version, runtime_version, patch_status, compatibility_test, manifest_hash FROM v2_scientific_component_pins WHERE component_key = 'RDKIT' ON CONFLICT (component_key) DO UPDATE SET manifest_hash = EXCLUDED.manifest_hash`)
    await client.query(`INSERT INTO v2_model_component_pins (component_key, repository, license, license_evidence_status, upstream_ref, upstream_commit, adapter_version, patch_status, compatibility_test, manifest_hash) SELECT component_key, repository, license, license_evidence_status, upstream_ref, upstream_commit, adapter_version, patch_status, compatibility_test, manifest_hash FROM v2_model_component_pins WHERE component_key = 'KGCNN_KERAS_UNLOCKED' ON CONFLICT (component_key) DO UPDATE SET manifest_hash = EXCLUDED.manifest_hash`)
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
  }

  console.log(JSON.stringify({
    blockerTableNegativeSecurityTests: 'PASS',
    serverSidePositiveTests: 'PASS',
    scientificPinProvenanceClientMutation: 'BLOCKED',
    planReadRegression: 'PASS',
    stagingDatabaseWrites: 0,
    productionDatabaseWrites: 0,
    matrix: runtimeGrantRows.map((row) => ({
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
