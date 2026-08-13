import pg from "pg";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const healthQuery = "SELECT 1";

function failureClass(error, phase) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (code === "ETIMEDOUT" || code === "ETIME") {
    return "DATABASE_CONNECTION_TIMEOUT";
  }
  if (
    [
      "ENOTFOUND",
      "EAI_AGAIN",
      "ECONNREFUSED",
      "ECONNRESET",
      "EHOSTUNREACH",
      "ENETUNREACH",
    ].includes(code)
  ) {
    return "DATABASE_DNS_OR_NETWORK_FAILURE";
  }
  if (
    [
      "28P01",
      "28000",
      "CERT_HAS_EXPIRED",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "SELF_SIGNED_CERT_IN_CHAIN",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "ERR_TLS_CERT_ALTNAME_INVALID",
    ].includes(code)
  ) {
    return "DATABASE_TLS_OR_AUTH_FAILURE";
  }
  if (phase === "query") return "DATABASE_QUERY_FAILURE";
  return "DATABASE_FAILURE_UNCLASSIFIED";
}

export async function verifyProductionDatabaseConnectivity({
  connectionString = process.env.PRODUCTION_DATABASE_URL,
  pgModule = pg,
  output = console.log,
} = {}) {
  let client;
  let phase = "connect";
  try {
    client = new pgModule.Client({
      connectionString,
      connectionTimeoutMillis: 15_000,
      query_timeout: 15_000,
      statement_timeout: 15_000,
    });
    await client.connect();
    phase = "query";
    await client.query(healthQuery);
    output("PRODUCTION_DATABASE_DRIVER=PASS");
    output("PRODUCTION_DATABASE_CONNECTIVITY=PASS");
    return { pass: true };
  } catch (error) {
    const classification = failureClass(error, phase);
    output("PRODUCTION_DATABASE_CONNECTIVITY=FAIL");
    output(`PRODUCTION_DATABASE_FAILURE_CLASS=${classification}`);
    return { pass: false, classification };
  } finally {
    await client?.end().catch(() => undefined);
  }
}

async function main() {
  const result = await verifyProductionDatabaseConnectivity();
  if (!result.pass) process.exitCode = 1;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await main();
}
