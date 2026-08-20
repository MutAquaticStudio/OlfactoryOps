const base = "https://api.cloudflare.com/client/v4";

class R2PrivacyError extends Error {
  constructor(
    safeCode,
    {
      operation = "UNPROVEN",
      httpStatus = "UNPROVEN",
      cfErrorCode = "NONE",
    } = {},
  ) {
    super();
    this.safeCode = safeCode;
    this.operation = operation;
    this.httpStatus = httpStatus;
    this.cfErrorCode = cfErrorCode;
  }
}

try {
  const account = required("CLOUDFLARE_ACCOUNT_ID");
  const token = required("CLOUDFLARE_API_TOKEN");
  const bucket = required("BACKUP_BUCKET");
  const buckets = await listBuckets(account, token);
  const exact = buckets.filter((item) => item?.name === bucket);
  if (exact.length === 0) {
    console.log("BACKUP_BUCKET_MISSING=YES");
    process.exitCode = 10;
  } else if (exact.length !== 1) {
    fail("AMBIGUOUS");
  } else {
    const managed = await get(
      account,
      token,
      `/accounts/${encodeURIComponent(account)}/r2/buckets/${encodeURIComponent(bucket)}/domains/managed`,
      "R2_DEV_STATUS",
    );
    if (managed?.result?.enabled !== false) fail("R2DEV_NOT_PRIVATE");
    const custom = await get(
      account,
      token,
      `/accounts/${encodeURIComponent(account)}/r2/buckets/${encodeURIComponent(bucket)}/domains/custom`,
      "CUSTOM_DOMAINS",
    );
    const domains = custom?.result?.domains;
    if (!Array.isArray(domains) || domains.length !== 0)
      fail("CUSTOM_DOMAIN_PRESENT");
    console.log("BACKUP_BUCKET=PASS");
    console.log("BACKUP_BUCKET_PRIVATE=PASS");
    console.log("BACKUP_BUCKET_R2DEV=DISABLED");
    console.log("BACKUP_BUCKET_CUSTOM_DOMAINS=ZERO");
  }
} catch (error) {
  const safe =
    error instanceof R2PrivacyError ? error : new R2PrivacyError("UNPROVEN");
  console.log(`BACKUP_BUCKET_PRIVATE=${safe.safeCode}`);
  console.log(`BACKUP_R2_API_OPERATION=${safe.operation}`);
  console.log(`BACKUP_R2_API_HTTP_STATUS=${safe.httpStatus}`);
  console.log(`BACKUP_R2_API_CF_ERROR_CODE=${safe.cfErrorCode}`);
  process.exitCode = 1;
}

async function listBuckets(account, token) {
  const rows = [];
  let cursor = "";
  for (let page = 0; page < 20; page += 1) {
    const suffix = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const response = await get(
      account,
      token,
      `/accounts/${encodeURIComponent(account)}/r2/buckets?per_page=100${suffix}`,
      "BUCKET_LIST",
    );
    const pageRows = response?.result?.buckets;
    if (!Array.isArray(pageRows)) throw new R2PrivacyError("UNPROVEN");
    rows.push(...pageRows);
    const next = response?.result_info?.cursor;
    if (typeof next !== "string" || next.length === 0) return rows;
    if (next === cursor) throw new R2PrivacyError("UNPROVEN");
    cursor = next;
  }
  throw new R2PrivacyError("UNPROVEN");
}

async function get(account, token, path, operation) {
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new R2PrivacyError("UNPROVEN", { operation, httpStatus: "0" });
  }
  const httpStatus = safeHttpStatus(response.status);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new R2PrivacyError("UNPROVEN", { operation, httpStatus });
  }
  const cfErrorCode = safeCloudflareErrorCode(body);
  if (!response.ok || body?.success !== true) {
    throw new R2PrivacyError("UNPROVEN", {
      operation,
      httpStatus,
      cfErrorCode,
    });
  }
  return body;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new R2PrivacyError("UNPROVEN");
  return value;
}

function fail(code) {
  throw new R2PrivacyError(code);
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
