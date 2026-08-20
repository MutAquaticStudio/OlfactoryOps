const base = "https://api.cloudflare.com/client/v4";

class R2PrivacyError extends Error {
  constructor(safeCode) {
    super();
    this.safeCode = safeCode;
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
    );
    if (managed?.result?.enabled !== false) fail("R2DEV_NOT_PRIVATE");
    const custom = await get(
      account,
      token,
      `/accounts/${encodeURIComponent(account)}/r2/buckets/${encodeURIComponent(bucket)}/domains/custom`,
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
  const safeCode =
    error instanceof R2PrivacyError ? error.safeCode : "UNPROVEN";
  console.log(`BACKUP_BUCKET_PRIVATE=${safeCode}`);
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

async function get(account, token, path) {
  const response = await fetch(`${base}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new R2PrivacyError("UNPROVEN");
  }
  if (!response.ok || body?.success !== true)
    throw new R2PrivacyError("UNPROVEN");
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
