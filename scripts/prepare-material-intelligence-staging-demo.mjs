import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const API = "https://api-beta.labofscents.org/api/v1";
const DOMAIN = "api-beta.labofscents.org";
const SAFE_ID = /^[a-zA-Z0-9_-]{1,160}$/;
const SAFE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

async function post(fetchImpl, path, origin, body) {
  try {
    const response = await fetchImpl(API + path, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json().catch(() => undefined),
    };
  } catch {
    throw new Error("MATERIAL_DEMO_API_UNAVAILABLE");
  }
}

function contextFrom(body, expectedHostname) {
  const userId = body?.user?.id;
  const organizationId = body?.membership?.organizationId;
  const hostname = body?.hostname?.hostname;
  if (!SAFE_ID.test(userId ?? "") || !SAFE_ID.test(organizationId ?? ""))
    throw new Error("MATERIAL_DEMO_AUTH_PROJECTION_INVALID");
  if (
    body?.membership?.status !== "ACTIVE" ||
    body?.membership?.role !== "Owner"
  )
    throw new Error("MATERIAL_DEMO_OWNER_CONTEXT_INVALID");
  if (hostname !== expectedHostname)
    throw new Error("MATERIAL_DEMO_HOSTNAME_INVALID");
  return { userId, organizationId, hostname };
}

export async function prepareMaterialIntelligenceStagingDemo({
  fetchImpl = fetch,
  env = process.env,
  writeOutput = async (name, value) =>
    appendFile(env.GITHUB_OUTPUT, `${name}=${value}\n`, "utf8"),
} = {}) {
  if (
    env.V2_STAGING_API_ORIGIN !== API ||
    env.V2_STAGING_WORKSPACE_BASE_DOMAIN !== DOMAIN
  )
    throw new Error("MATERIAL_DEMO_STAGING_ORIGIN_INVALID");
  const {
    MATERIAL_DEMO_TENANT_SLUG: slug,
    MATERIAL_DEMO_LOGIN_EMAIL: email,
    MATERIAL_DEMO_LOGIN_PASSWORD: password,
  } = env;
  if (
    !SAFE_SLUG.test(slug ?? "") ||
    !email?.includes("@") ||
    (password?.length ?? 0) < 24
  )
    throw new Error("MATERIAL_DEMO_PROTECTED_INPUTS_REQUIRED");

  const hostname = `${slug}.${DOMAIN}`;
  const origin = `https://${hostname}`;
  const login = { email, password };
  let result = await post(fetchImpl, "/v2/platform/auth/login", origin, login);
  let disposition = "REUSED";
  if (result.status !== 200) {
    if (![401, 403, 404].includes(result.status))
      throw new Error("MATERIAL_DEMO_LOGIN_UNEXPECTED_STATUS");
    result = await post(fetchImpl, "/v2/platform/auth/signup", origin, {
      organizationName: "Material Intelligence VC Demo",
      workspaceSlug: slug,
      displayName: "Material Intelligence Demo Owner",
      email,
      password,
    });
    disposition = "CREATED";
    if (result.status === 409) {
      result = await post(fetchImpl, "/v2/platform/auth/login", origin, login);
      disposition = "REUSED";
      if (result.status !== 200)
        throw new Error("MATERIAL_DEMO_IDENTITY_CONFLICT");
    } else if (![200, 201].includes(result.status)) {
      throw new Error("MATERIAL_DEMO_SIGNUP_FAILED");
    }
  }

  const context = contextFrom(result.body, hostname);
  await writeOutput("organization_id", context.organizationId);
  await writeOutput("actor_user_id", context.userId);
  await writeOutput("tenant_hostname", context.hostname);
  await writeOutput("tenant_slug", slug);
  return { ...context, slug, disposition };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  prepareMaterialIntelligenceStagingDemo()
    .then((result) => {
      console.log("MATERIAL_DEMO_TENANT=PASS");
      console.log(`MATERIAL_DEMO_TENANT_DISPOSITION=${result.disposition}`);
    })
    .catch((error) => {
      console.error(
        error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
          ? error.message
          : "MATERIAL_DEMO_PREPARATION_FAILED",
      );
      process.exitCode = 1;
    });
}
