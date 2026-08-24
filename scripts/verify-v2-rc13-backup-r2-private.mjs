import { pathToFileURL } from "node:url";

const API_BASE = "https://api.cloudflare.com/client/v4";
const MAX_BUCKET_PAGES = 20;

export class R2BackupError extends Error {
  constructor(
    operation,
    {
      httpStatus = "0",
      cfErrorCode = "NONE",
      failureClass = "UNCLASSIFIED",
      bucketCreated = "UNPROVEN",
    } = {},
  ) {
    super();
    this.operation = operation;
    this.httpStatus = httpStatus;
    this.cfErrorCode = cfErrorCode;
    this.failureClass = failureClass;
    this.bucketCreated = bucketCreated;
  }
}

export async function runR2BackupPreflight({
  environment = process.env,
  fetchImpl = fetch,
  emit = console.log,
} = {}) {
  const token = required(
    environment,
    "CLOUDFLARE_R2_BACKUP_TOKEN",
    "LIST_BUCKETS",
  );
  const account = required(
    environment,
    "CLOUDFLARE_ACCOUNT_ID",
    "LIST_BUCKETS",
  );
  const bucket = required(environment, "BACKUP_BUCKET", "LIST_BUCKETS");

  const listed = await listBuckets(account, token, fetchImpl);
  emit("R2_BACKUP_TOKEN_PRESENT=PASS");
  emit("R2_BACKUP_TOKEN_LIST_ACCESS=PASS");
  emit(`R2_BACKUP_API_HTTP_STATUS=${listed.httpStatus}`);
  emit(`R2_BACKUP_API_CF_ERROR_CODE=${listed.cfErrorCode}`);

  const exact = listed.buckets.filter((item) => item?.name === bucket);
  if (exact.length > 1) {
    throw new R2BackupError("LIST_BUCKETS", {
      httpStatus: listed.httpStatus,
      cfErrorCode: listed.cfErrorCode,
      failureClass: "BUCKET_CONFLICT",
    });
  }

  const bucketCreated = exact.length === 0 ? "YES" : "NO";
  if (bucketCreated === "YES") {
    await createBucket(account, token, bucket, fetchImpl);
  }

  try {
    await verifyBucketPrivate(account, token, bucket, fetchImpl);
  } catch (error) {
    if (error instanceof R2BackupError) error.bucketCreated = bucketCreated;
    throw error;
  }
  emit(`BACKUP_BUCKET_CREATED=${bucketCreated}`);
  emit("BACKUP_BUCKET=PASS");
  emit("BACKUP_BUCKET_PRIVATE=PASS");
  emit("BACKUP_BUCKET_R2DEV=DISABLED");
  emit("BACKUP_BUCKET_CUSTOM_DOMAINS=ZERO");
}

async function listBuckets(account, token, fetchImpl) {
  const buckets = [];
  let cursor = "";
  let firstResponse;

  for (let page = 0; page < MAX_BUCKET_PAGES; page += 1) {
    const suffix = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const response = await request(
      account,
      token,
      `/accounts/${encodeURIComponent(account)}/r2/buckets?per_page=100${suffix}`,
      "LIST_BUCKETS",
      {},
      fetchImpl,
    );
    firstResponse ??= response;
    const rows = response.body?.result?.buckets;
    if (!Array.isArray(rows)) {
      throw new R2BackupError("LIST_BUCKETS", {
        httpStatus: response.httpStatus,
        cfErrorCode: response.cfErrorCode,
        failureClass: "API_VALIDATION",
      });
    }
    buckets.push(...rows);

    const next = response.body?.result_info?.cursor;
    if (next === undefined || next === null || next === "") {
      return {
        buckets,
        httpStatus: firstResponse.httpStatus,
        cfErrorCode: firstResponse.cfErrorCode,
      };
    }
    if (typeof next !== "string" || next === cursor) {
      throw new R2BackupError("LIST_BUCKETS", {
        httpStatus: response.httpStatus,
        cfErrorCode: response.cfErrorCode,
        failureClass: "API_VALIDATION",
      });
    }
    cursor = next;
  }

  throw new R2BackupError("LIST_BUCKETS", { failureClass: "API_VALIDATION" });
}

async function createBucket(account, token, bucket, fetchImpl) {
  const response = await request(
    account,
    token,
    `/accounts/${encodeURIComponent(account)}/r2/buckets`,
    "BUCKET_CREATE",
    { method: "POST", body: JSON.stringify({ name: bucket }) },
    fetchImpl,
  );
  if (response.body?.result?.name !== bucket) {
    throw new R2BackupError("BUCKET_CREATE", {
      httpStatus: response.httpStatus,
      cfErrorCode: response.cfErrorCode,
      failureClass: "API_VALIDATION",
    });
  }
}

async function verifyBucketPrivate(account, token, bucket, fetchImpl) {
  const managed = await request(
    account,
    token,
    `/accounts/${encodeURIComponent(account)}/r2/buckets/${encodeURIComponent(bucket)}/domains/managed`,
    "R2_DEV_STATUS",
    {},
    fetchImpl,
  );
  if (managed.body?.result?.enabled !== false) {
    throw new R2BackupError("R2_DEV_STATUS", {
      httpStatus: managed.httpStatus,
      cfErrorCode: managed.cfErrorCode,
      failureClass: "API_VALIDATION",
    });
  }

  const custom = await request(
    account,
    token,
    `/accounts/${encodeURIComponent(account)}/r2/buckets/${encodeURIComponent(bucket)}/domains/custom`,
    "CUSTOM_DOMAINS",
    {},
    fetchImpl,
  );
  if (
    !Array.isArray(custom.body?.result?.domains) ||
    custom.body.result.domains.length
  ) {
    throw new R2BackupError("CUSTOM_DOMAINS", {
      httpStatus: custom.httpStatus,
      cfErrorCode: custom.cfErrorCode,
      failureClass: "API_VALIDATION",
    });
  }
}

async function request(account, token, path, operation, options, fetchImpl) {
  const headers = { authorization: `Bearer ${token}` };
  if (options.body) headers["content-type"] = "application/json";

  let response;
  try {
    response = await fetchImpl(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body,
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new R2BackupError(operation, { failureClass: "NETWORK" });
  }

  const httpStatus = safeHttpStatus(response.status);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new R2BackupError(operation, {
      httpStatus,
      failureClass: response.ok ? "API_VALIDATION" : failureClass(httpStatus),
    });
  }

  const cfErrorCode = safeCloudflareErrorCode(body);
  if (!response.ok || body?.success !== true) {
    throw new R2BackupError(operation, {
      httpStatus,
      cfErrorCode,
      failureClass: failureClass(httpStatus),
    });
  }
  return { body, httpStatus, cfErrorCode };
}

function required(environment, name, operation) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new R2BackupError(operation, { failureClass: "AUTHENTICATION" });
  }
  return value;
}

function safeHttpStatus(status) {
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? String(status)
    : "0";
}

function safeCloudflareErrorCode(body) {
  const errors = body?.errors;
  if (!Array.isArray(errors)) return "NONE";
  const code = errors.find(
    (item) => Number.isSafeInteger(item?.code) && item.code >= 1000,
  )?.code;
  return code === undefined ? "NONE" : String(code);
}

function failureClass(httpStatus) {
  if (httpStatus === "401") return "AUTHENTICATION";
  if (httpStatus === "403") return "AUTHORIZATION";
  if (httpStatus === "404") return "ACCOUNT_SCOPE";
  if (httpStatus === "409") return "BUCKET_CONFLICT";
  if (httpStatus === "0") return "NETWORK";
  if (Number(httpStatus) >= 400 && Number(httpStatus) < 500)
    return "API_VALIDATION";
  return "UNCLASSIFIED";
}

export function emitR2BackupFailure(
  error,
  emit = console.log,
  environment = process.env,
) {
  const safe =
    error instanceof R2BackupError ? error : new R2BackupError("UNPROVEN");
  const tokenPresent = Boolean(environment.CLOUDFLARE_R2_BACKUP_TOKEN?.trim());
  emit(`R2_BACKUP_TOKEN_PRESENT=${tokenPresent ? "PASS" : "FAIL"}`);
  emit(
    `R2_BACKUP_TOKEN_LIST_ACCESS=${safe.operation === "LIST_BUCKETS" ? "FAIL" : "PASS"}`,
  );
  emit(
    `R2_BACKUP_API_HTTP_STATUS=${safe.operation === "LIST_BUCKETS" ? safe.httpStatus : "200"}`,
  );
  emit(
    `R2_BACKUP_API_CF_ERROR_CODE=${safe.operation === "LIST_BUCKETS" ? safe.cfErrorCode : "NONE"}`,
  );
  emit(`BACKUP_BUCKET_CREATED=${safe.bucketCreated}`);
  emit("BACKUP_BUCKET=UNPROVEN");
  emit("BACKUP_BUCKET_PRIVATE=UNPROVEN");
  emit(`BACKUP_R2_API_OPERATION=${safe.operation}`);
  emit(`BACKUP_R2_API_HTTP_STATUS=${safe.httpStatus}`);
  emit(`BACKUP_R2_API_CF_ERROR_CODE=${safe.cfErrorCode}`);
  emit(`BACKUP_R2_FAILURE_CLASS=${safe.failureClass}`);
}

async function main() {
  try {
    await runR2BackupPreflight();
  } catch (error) {
    emitR2BackupFailure(error, console.log, process.env);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
