import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { runMaterialIntelligenceBulkImport } from "./material-intelligence-bulk-import.js";

const { Client } = pg;
const RUNTIME_ROLE = "hyperdrive_user";
const APPROVAL = "BRIDGE_STAGING_RUNTIME_ROLE";
const SAFE_ROLE = /^[a-z_][a-z0-9_]{0,62}$/;

type QueryResult<Row = Record<string, unknown>> = { rows: Row[] };
type BridgeClient = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<Row = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
};
type BridgeDependencies = {
  clientFactory?: (databaseUrl: string) => BridgeClient;
  markerPath?: string;
  readMarker?: (path: string) => Promise<string>;
  writeMarker?: (path: string, value: string) => Promise<void>;
  removeMarker?: (path: string) => Promise<void>;
};

type RoleBridgeMarker = {
  version: 2;
  bridgeChanged: boolean;
  grantorMembership: boolean;
};

function quoteIdentifier(value: string) {
  if (!SAFE_ROLE.test(value))
    throw new Error("STAGING_ROLE_BRIDGE_ROLE_INVALID");
  return `"${value}"`;
}

function stagingDatabaseUrl(env: NodeJS.ProcessEnv) {
  if (env.V2_STAGING_ROLE_BRIDGE_APPROVED !== APPROVAL)
    throw new Error("STAGING_ROLE_BRIDGE_APPROVAL_REQUIRED");
  if (env.V2_RUNTIME_DB_ROLE !== RUNTIME_ROLE)
    throw new Error("STAGING_ROLE_BRIDGE_RUNTIME_ROLE_INVALID");
  const value = env.STAGING_DATABASE_URL;
  if (!value) throw new Error("STAGING_ROLE_BRIDGE_DATABASE_REQUIRED");
  const parsed = new URL(value);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol))
    throw new Error("STAGING_ROLE_BRIDGE_POSTGRES_REQUIRED");
  if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname))
    throw new Error("STAGING_ROLE_BRIDGE_REMOTE_STAGING_REQUIRED");
  return value;
}

function roleBridgeMarkerPath(env: NodeJS.ProcessEnv, override?: string) {
  if (override) return override;
  if (!env.RUNNER_TEMP)
    throw new Error("STAGING_ROLE_BRIDGE_RUNNER_TEMP_REQUIRED");
  return join(env.RUNNER_TEMP, "material-intelligence-role-bridge.json");
}

async function sessionRole(client: BridgeClient) {
  const result = await client.query<{ sessionRole: string }>(
    'SELECT current_user::text AS "sessionRole"',
  );
  const role = result.rows[0]?.sessionRole;
  if (!role || !SAFE_ROLE.test(role))
    throw new Error("STAGING_ROLE_BRIDGE_SESSION_ROLE_INVALID");
  return role;
}

async function assertRuntimeRole(client: BridgeClient) {
  const result = await client.query<{
    canLogin: boolean;
    superuser: boolean;
    createDb: boolean;
    createRole: boolean;
    inherit: boolean;
    bypassRls: boolean;
    replication: boolean;
  }>(
    'SELECT rolcanlogin AS "canLogin", rolsuper AS superuser, rolcreatedb AS "createDb", rolcreaterole AS "createRole", rolinherit AS inherit, rolbypassrls AS "bypassRls", rolreplication AS replication FROM pg_roles WHERE rolname = $1',
    [RUNTIME_ROLE],
  );
  const role = result.rows[0];
  if (
    !role?.canLogin ||
    role.superuser ||
    role.createDb ||
    role.createRole ||
    role.inherit ||
    role.bypassRls ||
    role.replication
  )
    throw new Error("STAGING_ROLE_BRIDGE_RUNTIME_ROLE_UNSAFE");
}

async function canSetRuntimeRole(client: BridgeClient, role: string) {
  const result = await client.query<{ canSet: boolean }>(
    "SELECT pg_has_role($1, $2, 'SET') AS \"canSet\"",
    [role, RUNTIME_ROLE],
  );
  return result.rows[0]?.canSet === true;
}

async function hasGrantorMembership(client: BridgeClient, role: string) {
  const result = await client.query<{ setOption: boolean }>(
    'SELECT membership.set_option AS "setOption" FROM pg_auth_members membership JOIN pg_roles parent ON parent.oid = membership.roleid JOIN pg_roles member ON member.oid = membership.member JOIN pg_roles grantor ON grantor.oid = membership.grantor WHERE parent.rolname = $1 AND member.rolname = $2 AND grantor.rolname = current_user',
    [RUNTIME_ROLE, role],
  );
  return result.rows.length === 1;
}

export async function prepareStagingRuntimeRoleBridge(
  env: NodeJS.ProcessEnv,
  dependencies: BridgeDependencies = {},
) {
  const databaseUrl = stagingDatabaseUrl(env);
  const path = roleBridgeMarkerPath(env, dependencies.markerPath);
  const createClient =
    dependencies.clientFactory ??
    ((url: string) => new Client({ connectionString: url }) as BridgeClient);
  const write =
    dependencies.writeMarker ??
    ((target: string, value: string) => writeFile(target, value, "utf8"));
  const client = createClient(databaseUrl);
  await client.connect();
  try {
    const role = await sessionRole(client);
    await assertRuntimeRole(client);
    if (role === RUNTIME_ROLE) {
      await write(
        path,
        JSON.stringify({
          version: 2,
          bridgeChanged: false,
          grantorMembership: false,
        } satisfies RoleBridgeMarker),
      );
      return;
    }
    const grantorMembership = await hasGrantorMembership(client, role);
    if (await canSetRuntimeRole(client, role)) {
      await write(
        path,
        JSON.stringify({
          version: 2,
          bridgeChanged: false,
          grantorMembership,
        } satisfies RoleBridgeMarker),
      );
      return;
    }
    await write(
      path,
      JSON.stringify({
        version: 2,
        bridgeChanged: true,
        grantorMembership,
      } satisfies RoleBridgeMarker),
    );
    await client.query(
      grantorMembership
        ? `GRANT ${quoteIdentifier(RUNTIME_ROLE)} TO ${quoteIdentifier(role)} WITH SET TRUE GRANTED BY CURRENT_USER`
        : `GRANT ${quoteIdentifier(RUNTIME_ROLE)} TO ${quoteIdentifier(role)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER`,
    );
    if (!(await canSetRuntimeRole(client, role)))
      throw new Error("STAGING_ROLE_BRIDGE_GRANT_UNPROVEN");
  } finally {
    await client.end();
  }
}

export async function cleanupStagingRuntimeRoleBridge(
  env: NodeJS.ProcessEnv,
  dependencies: BridgeDependencies = {},
) {
  const databaseUrl = stagingDatabaseUrl(env);
  const path = roleBridgeMarkerPath(env, dependencies.markerPath);
  const read =
    dependencies.readMarker ?? ((target: string) => readFile(target, "utf8"));
  const remove =
    dependencies.removeMarker ??
    ((target: string) => rm(target, { force: true }));
  let marker: Partial<RoleBridgeMarker>;
  try {
    marker = JSON.parse(await read(path)) as typeof marker;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new Error("STAGING_ROLE_BRIDGE_MARKER_INVALID");
  }
  if (
    marker.version !== 2 ||
    typeof marker.bridgeChanged !== "boolean" ||
    typeof marker.grantorMembership !== "boolean"
  )
    throw new Error("STAGING_ROLE_BRIDGE_MARKER_INVALID");
  if (!marker.bridgeChanged) {
    await remove(path);
    return;
  }
  const createClient =
    dependencies.clientFactory ??
    ((url: string) => new Client({ connectionString: url }) as BridgeClient);
  const client = createClient(databaseUrl);
  await client.connect();
  try {
    const role = await sessionRole(client);
    await assertRuntimeRole(client);
    if (role !== RUNTIME_ROLE) {
      if (marker.grantorMembership) {
        await client.query(
          `GRANT ${quoteIdentifier(RUNTIME_ROLE)} TO ${quoteIdentifier(role)} WITH SET FALSE GRANTED BY CURRENT_USER`,
        );
      } else {
        await client.query(
          `REVOKE ${quoteIdentifier(RUNTIME_ROLE)} FROM ${quoteIdentifier(role)} GRANTED BY CURRENT_USER`,
        );
      }
    }
    if (
      role !== RUNTIME_ROLE &&
      ((await canSetRuntimeRole(client, role)) ||
        (await hasGrantorMembership(client, role)) !== marker.grantorMembership)
    )
      throw new Error("STAGING_ROLE_BRIDGE_REVOKE_UNPROVEN");
    await remove(path);
  } finally {
    await client.end();
  }
}

export async function runStagingMaterialIntelligenceBulk(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  dependencies: BridgeDependencies & {
    runImport?: typeof runMaterialIntelligenceBulkImport;
  } = {},
) {
  try {
    await prepareStagingRuntimeRoleBridge(env, dependencies);
    return await (dependencies.runImport ?? runMaterialIntelligenceBulkImport)(
      args,
    );
  } finally {
    await cleanupStagingRuntimeRoleBridge(env, dependencies);
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const [command, ...args] = process.argv.slice(2);
  const operation =
    command === "cleanup"
      ? cleanupStagingRuntimeRoleBridge(process.env).then(() => ({
          cleanup: "PASS",
        }))
      : command === "run"
        ? runStagingMaterialIntelligenceBulk(args)
        : Promise.reject(new Error("STAGING_ROLE_BRIDGE_COMMAND_INVALID"));
  operation
    .then((report) => process.stdout.write(JSON.stringify(report) + "\n"))
    .catch((error) => {
      process.stderr.write(
        (error instanceof Error
          ? error.message
          : "STAGING_ROLE_BRIDGE_FAILED") + "\n",
      );
      process.exitCode = 1;
    });
}
