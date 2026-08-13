import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cloudflareApiBase = "https://api.cloudflare.com/client/v4";

function tokenKind(token) {
  if (token.startsWith("cfut_")) return "USER_API_TOKEN";
  if (token.startsWith("cfat_")) return "ACCOUNT_API_TOKEN";
  if (token.startsWith("cfk_")) return "UNSUPPORTED_GLOBAL_API_KEY";
  return "LEGACY_UNPREFIXED_API_TOKEN";
}

function safeFailure(responseStatus, body) {
  const state =
    typeof body?.result?.status === "string"
      ? body.result.status.toLowerCase()
      : "";
  if (state === "disabled") return "CLOUDFLARE_TOKEN_DISABLED";
  if (state === "expired") return "CLOUDFLARE_TOKEN_EXPIRED";
  if (
    state === "not yet active" ||
    state === "not_yet_active" ||
    state === "pending"
  )
    return "CLOUDFLARE_TOKEN_NOT_YET_ACTIVE";
  if (responseStatus === 401) return "CLOUDFLARE_TOKEN_REVOKED_OR_INVALID";
  return "CLOUDFLARE_TOKEN_VERIFY_ENDPOINT_UNAVAILABLE";
}

async function readResponseSafely(response) {
  const directory = mkdtempSync(join(tmpdir(), "olfactoryops-cf-token-"));
  const responsePath = join(directory, "response.json");
  try {
    chmodSync(directory, 0o700);
    writeFileSync(responsePath, await response.text(), {
      encoding: "utf8",
      mode: 0o600,
    });
    chmodSync(responsePath, 0o600);
    try {
      return JSON.parse(readFileSync(responsePath, "utf8"));
    } catch {
      return undefined;
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function verifyEndpoint(fetchImpl, token, path) {
  try {
    const response = await fetchImpl(`${cloudflareApiBase}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await readResponseSafely(response);
    const active =
      response.status === 200 &&
      body?.success === true &&
      body?.result?.status === "active";
    return {
      active,
      status: response.status,
      failure: active ? undefined : safeFailure(response.status, body),
    };
  } catch {
    return {
      active: false,
      status: 0,
      failure: "CLOUDFLARE_TOKEN_VERIFY_ENDPOINT_UNAVAILABLE",
    };
  }
}

function aggregateFailure(results) {
  if (results.length && results.every((result) => result.status === 401))
    return "CLOUDFLARE_TOKEN_REVOKED_OR_INVALID";
  return (
    results
      .map((result) => result.failure)
      .find(
        (failure) =>
          failure && failure !== "CLOUDFLARE_TOKEN_REVOKED_OR_INVALID",
      ) ?? "CLOUDFLARE_TOKEN_REVOKED_OR_INVALID"
  );
}

async function verifyToken(fetchImpl, token, accountId) {
  const kind = tokenKind(token);
  if (kind === "UNSUPPORTED_GLOBAL_API_KEY") {
    return {
      kind,
      active: false,
      failure: "CLOUDFLARE_TOKEN_TYPE_UNSUPPORTED",
      user: { state: "NOT_APPLICABLE" },
      account: { state: "NOT_APPLICABLE" },
    };
  }

  const userPath = "/user/tokens/verify";
  const accountPath = `/accounts/${encodeURIComponent(accountId)}/tokens/verify`;
  if (kind === "USER_API_TOKEN") {
    const user = await verifyEndpoint(fetchImpl, token, userPath);
    return {
      kind,
      active: user.active,
      failure: user.failure,
      user: { state: user.active ? "PASS" : "FAIL" },
      account: { state: "NOT_APPLICABLE" },
    };
  }
  if (kind === "ACCOUNT_API_TOKEN") {
    const account = await verifyEndpoint(fetchImpl, token, accountPath);
    return {
      kind,
      active: account.active,
      failure: account.failure,
      user: { state: "NOT_APPLICABLE" },
      account: { state: account.active ? "PASS" : "FAIL" },
    };
  }

  const [user, account] = await Promise.all([
    verifyEndpoint(fetchImpl, token, userPath),
    verifyEndpoint(fetchImpl, token, accountPath),
  ]);
  const activeCount = [user, account].filter((result) => result.active).length;
  return {
    kind,
    active: activeCount === 1,
    failure: activeCount === 1 ? undefined : aggregateFailure([user, account]),
    user: { state: user.active ? "PASS" : "FAIL" },
    account: { state: account.active ? "PASS" : "FAIL" },
  };
}

async function verifyReadSurface(fetchImpl, token, path) {
  try {
    const response = await fetchImpl(`${cloudflareApiBase}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await readResponseSafely(response);
    return {
      pass:
        response.status >= 200 &&
        response.status < 300 &&
        body?.success === true,
      status: response.status,
    };
  } catch {
    return { pass: false, status: 0 };
  }
}

async function verifyAccountScope(fetchImpl, token, accountId) {
  const [account, workers, pages, containers] = await Promise.all([
    verifyReadSurface(
      fetchImpl,
      token,
      `/accounts/${encodeURIComponent(accountId)}`,
    ),
    verifyReadSurface(
      fetchImpl,
      token,
      `/accounts/${encodeURIComponent(accountId)}/workers/scripts?per_page=1`,
    ),
    verifyReadSurface(
      fetchImpl,
      token,
      `/accounts/${encodeURIComponent(accountId)}/pages/projects?per_page=1`,
    ),
    verifyReadSurface(
      fetchImpl,
      token,
      `/accounts/${encodeURIComponent(accountId)}/containers/applications?per_page=1`,
    ),
  ]);
  const surfaces = { account, workers, pages, containers };
  const pass = Object.values(surfaces).every((surface) => surface.pass);
  const insufficientScope = Object.values(surfaces).some(
    (surface) => surface.status === 403,
  );
  return { pass, insufficientScope, surfaces };
}

export async function verifyProductionCloudflareToken({
  token,
  accountId,
  fetchImpl = fetch,
}) {
  const tokenResult = await verifyToken(fetchImpl, token, accountId);
  const lines = [
    `CLOUDFLARE_TOKEN_KIND=${tokenResult.kind}`,
    `CLOUDFLARE_USER_TOKEN_VERIFY=${tokenResult.user.state}`,
    `CLOUDFLARE_ACCOUNT_TOKEN_VERIFY=${tokenResult.account.state}`,
  ];
  if (!tokenResult.active) {
    lines.push("PRODUCTION_CLOUDFLARE_TOKEN_ACTIVE=FAIL");
    lines.push(`PRODUCTION_CLOUDFLARE_AUTH=${tokenResult.failure}`);
    return { pass: false, lines };
  }

  const scope = await verifyAccountScope(fetchImpl, token, accountId);
  lines.push("PRODUCTION_CLOUDFLARE_TOKEN_ACTIVE=PASS");
  lines.push(
    `PRODUCTION_CLOUDFLARE_ACCOUNT_SCOPE=${scope.surfaces.account.pass ? "PASS" : "FAIL"}`,
  );
  lines.push(
    `PRODUCTION_CLOUDFLARE_WORKERS_READ=${scope.surfaces.workers.pass ? "PASS" : "FAIL"}`,
  );
  lines.push(
    `PRODUCTION_CLOUDFLARE_PAGES_READ=${scope.surfaces.pages.pass ? "PASS" : "FAIL"}`,
  );
  lines.push(
    `PRODUCTION_CLOUDFLARE_CONTAINERS_READ=${scope.surfaces.containers.pass ? "PASS" : "FAIL"}`,
  );
  lines.push(
    `PRODUCTION_CLOUDFLARE_AUTH=${scope.pass ? "PASS" : scope.insufficientScope ? "FAIL_INSUFFICIENT_SCOPE" : "FAIL_CLOUDFLARE_READ_VERIFICATION"}`,
  );
  return { pass: scope.pass, lines };
}

async function main() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    console.log("CLOUDFLARE_TOKEN_KIND=LEGACY_UNPREFIXED_API_TOKEN");
    console.log("PRODUCTION_CLOUDFLARE_TOKEN_ACTIVE=FAIL");
    console.log(
      "PRODUCTION_CLOUDFLARE_AUTH=CLOUDFLARE_TOKEN_REVOKED_OR_INVALID",
    );
    process.exitCode = 1;
    return;
  }
  const result = await verifyProductionCloudflareToken({ token, accountId });
  for (const line of result.lines) console.log(line);
  if (!result.pass) process.exitCode = 1;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
)
  await main();
