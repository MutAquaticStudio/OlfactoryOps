import { createHash } from "node:crypto";

export const FIRST_RELEASE_BASELINE_SCHEMA =
  "olfactoryops/first-release-route-baseline/v1";
export const FIRST_RELEASE_BASELINE_VARIABLE =
  "PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE";
export const PRODUCTION_ZONE = "labofscents.org";
export const PRODUCTION_SERVICES = {
  cloudRuntime: "olfactoryops-v2-cloud-runtime-production",
  api: "olfactoryops-v2-api-production",
  router: "olfactoryops-v2-tenant-router-production",
};
export const PUBLIC_ROUTE_SPECS = [
  {
    key: "api",
    pattern: "api.labofscents.org/*",
    replacementService: PRODUCTION_SERVICES.api,
  },
  {
    key: "tenantRouter",
    pattern: "*.labofscents.org/*",
    replacementService: PRODUCTION_SERVICES.router,
  },
];

const apiBase = "https://api.cloudflare.com/client/v4";
const scriptName = /^[a-z0-9][a-z0-9-_]{0,63}$/;
const opaqueIdentifier = /^[A-Za-z0-9_-]{8,128}$/;
const exactSha = /^[0-9a-f]{40}$/;

export async function captureFirstReleaseRouteBaseline({
  account,
  token,
  releaseSha,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
}) {
  if (!validAccount(account) || !exactSha.test(releaseSha ?? "")) {
    return failure("INVALID_RELEASE_CONTEXT");
  }

  const zone = await readProductionZone({ account, token, fetchImpl });
  if (!zone) return failure("ZONE_UNPROVEN");
  const routeResponse = await cloudflareRequest({
    account,
    token,
    fetchImpl,
    path: "/zones/" + encodeURIComponent(zone.id) + "/workers/routes",
  });
  if (!routeResponse.ok || !Array.isArray(routeResponse.result)) {
    return failure("ROUTE_INVENTORY_UNPROVEN");
  }

  const routes = [];
  for (const specification of PUBLIC_ROUTE_SPECS) {
    const matches = routeResponse.result.filter(
      (route) => route?.pattern === specification.pattern,
    );
    if (matches.length !== 1) {
      return failure(
        matches.length === 0 ? "ROUTE_MISSING" : "ROUTE_AMBIGUOUS",
      );
    }
    const current = matches[0];
    if (
      !opaqueIdentifier.test(current?.id ?? "") ||
      !scriptName.test(current?.script ?? "") ||
      current.script === specification.replacementService
    ) {
      return failure("ROUTE_TARGET_UNEXPECTED");
    }
    const targetVersionId = await activeWorkerVersionId({
      account,
      token,
      service: current.script,
      fetchImpl,
    });
    if (!targetVersionId) return failure("PREVIOUS_TARGET_UNPROVEN");
    routes.push({
      key: specification.key,
      pattern: specification.pattern,
      id: current.id,
      script: current.script,
      versionId: targetVersionId,
    });
  }

  for (const service of Object.values(PRODUCTION_SERVICES)) {
    const absent = await workerAbsentWithNoCustomDomain({
      account,
      token,
      service,
      fetchImpl,
    });
    if (!absent) return failure("RC10_RESOURCE_BASELINE_UNPROVEN");
  }

  const manifest = {
    schema: FIRST_RELEASE_BASELINE_SCHEMA,
    releaseSha,
    capturedAt: now(),
    zoneId: zone.id,
    routes,
    absentServices: Object.values(PRODUCTION_SERVICES),
  };
  if (!validManifest(manifest)) return failure("BASELINE_INVALID");
  return { pass: true, manifest, fingerprint: fingerprint(manifest) };
}

export function serializeBaseline(manifest) {
  if (!validManifest(manifest))
    throw new Error("FIRST_RELEASE_BASELINE_INVALID");
  return Buffer.from(JSON.stringify(manifest), "utf8").toString("base64url");
}

export function parseBaseline(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 16_384
  ) {
    return undefined;
  }
  try {
    const manifest = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    return validManifest(manifest) ? manifest : undefined;
  } catch {
    return undefined;
  }
}

export function fingerprint(manifest) {
  const stable = JSON.stringify({
    schema: manifest.schema,
    releaseSha: manifest.releaseSha,
    zoneId: manifest.zoneId,
    routes: manifest.routes,
    absentServices: manifest.absentServices,
  });
  return createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

export function sameBaseline(left, right) {
  return Boolean(
    validManifest(left) &&
    validManifest(right) &&
    fingerprint(left) === fingerprint(right),
  );
}

export async function verifyCurrentRouteBaseline({
  account,
  token,
  baseline,
  fetchImpl = fetch,
}) {
  if (!validAccount(account) || !validManifest(baseline)) {
    return { pass: false, state: "BASELINE_INVALID" };
  }
  const zone = await readProductionZone({ account, token, fetchImpl });
  if (!zone || zone.id !== baseline.zoneId) {
    return { pass: false, state: "ZONE_DRIFT" };
  }
  const response = await cloudflareRequest({
    account,
    token,
    fetchImpl,
    path: "/zones/" + encodeURIComponent(zone.id) + "/workers/routes",
  });
  if (!response.ok || !Array.isArray(response.result)) {
    return { pass: false, state: "ROUTE_INVENTORY_UNPROVEN" };
  }
  for (const route of baseline.routes) {
    const matches = response.result.filter(
      (current) => current?.pattern === route.pattern,
    );
    if (
      matches.length !== 1 ||
      matches[0]?.id !== route.id ||
      matches[0]?.script !== route.script
    ) {
      return { pass: false, state: "CUTOVER_ROUTE_BASELINE_DRIFT" };
    }
    if (
      (await activeWorkerVersionId({
        account,
        token,
        service: route.script,
        fetchImpl,
      })) !== route.versionId
    ) {
      return { pass: false, state: "PREVIOUS_TARGET_UNPROVEN" };
    }
  }
  return { pass: true, state: "READY" };
}

export async function handoffApprovedRoutes({
  account,
  token,
  baseline,
  releaseSha,
  expectedHyperdriveId,
  tenantHostname,
  fetchImpl = fetch,
  healthAttempts = 6,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  if (!validTenantHostname(tenantHostname)) {
    return { pass: false, state: "SMOKE_TENANT_UNPROVEN" };
  }
  const baselineState = await verifyCurrentRouteBaseline({
    account,
    token,
    baseline,
    fetchImpl,
  });
  if (!baselineState.pass) return baselineState;

  for (const specification of PUBLIC_ROUTE_SPECS) {
    if (
      !(await exactRc10WorkerVersion({
        account,
        token,
        service: specification.replacementService,
        releaseSha,
        expectedHyperdriveId,
        fetchImpl,
      }))
    ) {
      return { pass: false, state: "RC10_TARGET_UNPROVEN" };
    }
  }

  for (const route of baseline.routes) {
    const replacement = PUBLIC_ROUTE_SPECS.find(
      (item) => item.key === route.key,
    );
    const update = await cloudflareRequest({
      account,
      token,
      fetchImpl,
      method: "PUT",
      path:
        "/zones/" +
        encodeURIComponent(baseline.zoneId) +
        "/workers/routes/" +
        encodeURIComponent(route.id),
      body: {
        id: route.id,
        pattern: route.pattern,
        script: replacement.replacementService,
      },
    });
    if (!update.ok) {
      return handoffFailure({
        state: "ROUTE_HANDOFF_FAILED",
        account,
        token,
        baseline,
        fetchImpl,
      });
    }
    const verified = await verifyRouteTarget({
      account,
      token,
      baseline,
      route,
      expectedScript: replacement.replacementService,
      fetchImpl,
    });
    if (!verified) {
      return handoffFailure({
        state: "ROUTE_HANDOFF_VERIFICATION_FAILED",
        account,
        token,
        baseline,
        fetchImpl,
      });
    }
    const health = await publicHealthProbe({
      routeKey: replacement.key,
      tenantHostname,
      releaseSha,
      fetchImpl,
      attempts: healthAttempts,
      sleep,
    });
    if (!health.pass) {
      return handoffFailure({
        state: health.state,
        account,
        token,
        baseline,
        fetchImpl,
      });
    }
  }
  return { pass: true, state: "READY" };
}

export async function restoreApprovedRoutes({
  account,
  token,
  baseline,
  fetchImpl = fetch,
}) {
  if (!validAccount(account) || !validManifest(baseline)) {
    return { pass: false, state: "BASELINE_INVALID" };
  }
  for (const route of baseline.routes) {
    if (
      (await activeWorkerVersionId({
        account,
        token,
        service: route.script,
        fetchImpl,
      })) !== route.versionId
    ) {
      return { pass: false, state: "PREVIOUS_TARGET_UNPROVEN" };
    }
  }
  for (const route of baseline.routes) {
    const update = await cloudflareRequest({
      account,
      token,
      fetchImpl,
      method: "PUT",
      path:
        "/zones/" +
        encodeURIComponent(baseline.zoneId) +
        "/workers/routes/" +
        encodeURIComponent(route.id),
      body: { id: route.id, pattern: route.pattern, script: route.script },
    });
    if (!update.ok) return { pass: false, state: "ROUTE_RESTORE_FAILED" };
  }
  for (const route of baseline.routes) {
    if (
      !(await verifyRouteTarget({
        account,
        token,
        baseline,
        route,
        expectedScript: route.script,
        fetchImpl,
      }))
    ) {
      return { pass: false, state: "ROUTE_RESTORE_VERIFICATION_FAILED" };
    }
  }
  return { pass: true, state: "READY" };
}

export async function deleteFirstReleaseWorkers({
  account,
  token,
  baseline,
  routeRestored,
  fetchImpl = fetch,
}) {
  if (!routeRestored || !validAccount(account) || !validManifest(baseline)) {
    return { pass: false, state: "CLEANUP_PRECONDITION_FAILED" };
  }
  const current = await verifyCurrentRouteBaseline({
    account,
    token,
    baseline,
    fetchImpl,
  });
  if (!current.pass)
    return { pass: false, state: "ROUTE_RESTORATION_UNPROVEN" };

  const routeResponse = await cloudflareRequest({
    account,
    token,
    fetchImpl,
    path: "/zones/" + encodeURIComponent(baseline.zoneId) + "/workers/routes",
  });
  if (!routeResponse.ok || !Array.isArray(routeResponse.result)) {
    return { pass: false, state: "ROUTE_INVENTORY_UNPROVEN" };
  }
  for (const service of baseline.absentServices) {
    if (routeResponse.result.some((route) => route?.script === service)) {
      return { pass: false, state: "RC10_ROUTE_STILL_ATTACHED" };
    }
    const domains = await cloudflareRequest({
      account,
      token,
      fetchImpl,
      path: "/accounts/" + encodeURIComponent(account) + "/workers/domains",
    });
    if (
      !domains.ok ||
      !Array.isArray(domains.result) ||
      domains.result.some((domain) => domain?.service === service)
    ) {
      return { pass: false, state: "RC10_CUSTOM_DOMAIN_UNPROVEN" };
    }
  }
  for (const service of baseline.absentServices) {
    const deletion = await cloudflareRequest({
      account,
      token,
      fetchImpl,
      method: "DELETE",
      path:
        "/accounts/" +
        encodeURIComponent(account) +
        "/workers/scripts/" +
        encodeURIComponent(service),
    });
    if (!deletion.ok) return { pass: false, state: "RC10_DELETE_FAILED" };
  }
  return { pass: true, state: "READY" };
}

export function validManifest(value) {
  return Boolean(
    value &&
    value.schema === FIRST_RELEASE_BASELINE_SCHEMA &&
    exactSha.test(value.releaseSha ?? "") &&
    typeof value.capturedAt === "string" &&
    !Number.isNaN(Date.parse(value.capturedAt)) &&
    opaqueIdentifier.test(value.zoneId ?? "") &&
    Array.isArray(value.routes) &&
    value.routes.length === PUBLIC_ROUTE_SPECS.length &&
    new Set(value.routes.map((route) => route?.id)).size ===
      PUBLIC_ROUTE_SPECS.length &&
    Array.isArray(value.absentServices) &&
    value.absentServices.length === Object.keys(PRODUCTION_SERVICES).length &&
    new Set(value.absentServices).size ===
      Object.keys(PRODUCTION_SERVICES).length &&
    PUBLIC_ROUTE_SPECS.every((specification) => {
      const route = value.routes.find(
        (item) => item?.key === specification.key,
      );
      return (
        route?.pattern === specification.pattern &&
        opaqueIdentifier.test(route?.id ?? "") &&
        scriptName.test(route?.script ?? "") &&
        opaqueIdentifier.test(route?.versionId ?? "") &&
        route.script !== specification.replacementService
      );
    }) &&
    Object.values(PRODUCTION_SERVICES).every((service) =>
      value.absentServices.includes(service),
    ),
  );
}

async function workerAbsentWithNoCustomDomain({
  account,
  token,
  service,
  fetchImpl,
}) {
  const deployments = await cloudflareRequest({
    account,
    token,
    fetchImpl,
    path:
      "/accounts/" +
      encodeURIComponent(account) +
      "/workers/scripts/" +
      encodeURIComponent(service) +
      "/deployments",
  });
  const absent =
    deployments.status === "404" &&
    deployments.cfErrorCode === "10007" &&
    !deployments.ok;
  if (!absent) return false;
  const domains = await cloudflareRequest({
    account,
    token,
    fetchImpl,
    path: "/accounts/" + encodeURIComponent(account) + "/workers/domains",
  });
  return (
    domains.ok &&
    Array.isArray(domains.result) &&
    !domains.result.some((domain) => domain?.service === service)
  );
}

async function readProductionZone({ account, token, fetchImpl }) {
  const zones = await cloudflareRequest({
    account,
    token,
    fetchImpl,
    path: "/zones",
    query: { name: PRODUCTION_ZONE, "account.id": account, per_page: "20" },
  });
  if (!zones.ok || !Array.isArray(zones.result)) return undefined;
  const matches = zones.result.filter(
    (zone) =>
      zone?.name === PRODUCTION_ZONE && opaqueIdentifier.test(zone?.id ?? ""),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

async function exactRc10WorkerVersion({
  account,
  token,
  service,
  releaseSha,
  expectedHyperdriveId,
  fetchImpl,
}) {
  if (
    !exactSha.test(releaseSha ?? "") ||
    !opaqueIdentifier.test(expectedHyperdriveId ?? "")
  ) {
    return false;
  }
  const versionId = await activeWorkerVersionId({
    account,
    token,
    service,
    fetchImpl,
  });
  if (!versionId) return false;
  const response = await cloudflareRequest({
    token,
    fetchImpl,
    path:
      "/accounts/" +
      encodeURIComponent(account) +
      "/workers/scripts/" +
      encodeURIComponent(service) +
      "/versions/" +
      encodeURIComponent(versionId),
  });
  const bindings = response.result?.resources?.bindings;
  const required = requiredRc10Bindings({ service, releaseSha });
  return Boolean(
    response.ok &&
    response.result?.id === versionId &&
    Array.isArray(bindings) &&
    required.every(({ name, text }) =>
      exactPlainTextBinding(bindings, name, text),
    ) &&
    exactHyperdriveBinding(bindings, expectedHyperdriveId) &&
    (service !== PRODUCTION_SERVICES.router ||
      exactRouterPagesOriginBinding(bindings)),
  );
}

async function activeWorkerVersionId({ account, token, service, fetchImpl }) {
  const response = await cloudflareRequest({
    account,
    token,
    fetchImpl,
    path:
      "/accounts/" +
      encodeURIComponent(account) +
      "/workers/scripts/" +
      encodeURIComponent(service) +
      "/deployments",
  });
  if (!response.ok || !Array.isArray(response.result?.deployments)) {
    return undefined;
  }
  const deployment = response.result.deployments[0];
  const versions = Array.isArray(deployment?.versions)
    ? deployment.versions
    : [];
  const active = versions[0];
  return deployment?.strategy === "percentage" &&
    versions.length === 1 &&
    active?.percentage === 100 &&
    opaqueIdentifier.test(active?.version_id ?? "")
    ? active.version_id
    : undefined;
}

function requiredRc10Bindings({ service, releaseSha }) {
  const common = [
    { name: "RELEASE_GIT_SHA", text: releaseSha },
    { name: "RELEASE_ENVIRONMENT", text: "production" },
  ];
  if (service === PRODUCTION_SERVICES.api) {
    return common.concat([
      { name: "V2_API_PUBLIC_HOSTNAME", text: "api.labofscents.org" },
      { name: "V2_PUBLIC_PAGES_HOSTNAME", text: "labofscents.org" },
      { name: "V2_PLATFORM_ADMIN_HOSTNAME", text: "admin.labofscents.org" },
      { name: "V2_WORKSPACE_BASE_DOMAIN", text: "labofscents.org" },
    ]);
  }
  if (service === PRODUCTION_SERVICES.router) {
    return common.concat([
      { name: "V2_WORKSPACE_BASE_DOMAIN", text: "labofscents.org" },
    ]);
  }
  return [];
}

function exactPlainTextBinding(bindings, name, text) {
  const matches = bindings.filter(
    (binding) => binding?.name === name && binding?.type === "plain_text",
  );
  return matches.length === 1 && matches[0].text === text;
}

function exactHyperdriveBinding(bindings, expectedHyperdriveId) {
  const matches = bindings.filter(
    (binding) =>
      binding?.name === "HYPERDRIVE" && binding?.type === "hyperdrive",
  );
  return matches.length === 1 && matches[0].id === expectedHyperdriveId;
}

function exactRouterPagesOriginBinding(bindings) {
  const matches = bindings.filter(
    (binding) =>
      binding?.name === "PAGES_ORIGIN" && binding?.type === "plain_text",
  );
  return (
    matches.length === 1 &&
    typeof matches[0].text === "string" &&
    /^https:\/\/[a-z0-9-]+\.olfactoryops-v2-production\.pages\.dev$/.test(
      matches[0].text,
    )
  );
}

async function verifyRouteTarget({
  account,
  token,
  baseline,
  route,
  expectedScript,
  fetchImpl,
}) {
  const response = await cloudflareRequest({
    account,
    token,
    fetchImpl,
    path:
      "/zones/" +
      encodeURIComponent(baseline.zoneId) +
      "/workers/routes/" +
      encodeURIComponent(route.id),
  });
  return Boolean(
    response.ok &&
    response.result?.id === route.id &&
    response.result?.pattern === route.pattern &&
    response.result?.script === expectedScript,
  );
}

async function cloudflareRequest({
  token,
  fetchImpl,
  path,
  method = "GET",
  query,
  body,
}) {
  try {
    const url = new URL(apiBase + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (typeof value === "string") url.searchParams.set(key, value);
    }
    const response = await fetchImpl(url, {
      method,
      headers: {
        authorization: "Bearer " + token,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    const status = safeHttpStatus(response?.status);
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    return {
      ok: Boolean(response?.ok && payload?.success === true),
      result: payload?.result,
      status,
      cfErrorCode: safeCloudflareErrorCode(payload),
    };
  } catch {
    return { ok: false, result: undefined, status: "0", cfErrorCode: "NONE" };
  }
}

async function publicHealthProbe({
  routeKey,
  tenantHostname,
  releaseSha,
  fetchImpl,
  attempts,
  sleep,
}) {
  const url =
    routeKey === "api"
      ? "https://api.labofscents.org/health"
      : "https://" + tenantHostname + "/";
  let identityUnproven = false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await singlePublicHealthProbe({
      routeKey,
      url,
      releaseSha,
      fetchImpl,
    });
    if (result.pass) return { pass: true, state: "READY" };
    identityUnproven ||= result.identityUnproven;
    if (attempt + 1 < attempts) await sleep(5_000);
  }
  return {
    pass: false,
    state:
      routeKey === "api"
        ? identityUnproven
          ? "API_EDGE_RELEASE_IDENTITY_UNPROVEN"
          : "API_EDGE_NOT_READY"
        : identityUnproven
          ? "TENANT_ROUTER_EDGE_RELEASE_IDENTITY_UNPROVEN"
          : "TENANT_ROUTER_EDGE_NOT_READY",
  };
}

async function singlePublicHealthProbe({
  routeKey,
  url,
  releaseSha,
  fetchImpl,
}) {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      headers: { "cache-control": "no-cache", pragma: "no-cache" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!(response?.status >= 200 && response?.status < 300)) {
      return { pass: false, identityUnproven: false };
    }
    if (routeKey === "api") {
      let body;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      return {
        pass: body?.releaseGitSha === releaseSha,
        identityUnproven: true,
      };
    }
    return {
      pass: response.headers?.get("x-olfactoryops-release-sha") === releaseSha,
      identityUnproven: true,
    };
  } catch {
    return { pass: false, identityUnproven: false };
  }
}

async function handoffFailure({ state, account, token, baseline, fetchImpl }) {
  const rollback = await restoreApprovedRoutes({
    account,
    token,
    baseline,
    fetchImpl,
  });
  return {
    pass: false,
    state,
    rollback: rollback.pass ? "PASS" : "FAIL",
  };
}

function safeHttpStatus(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599
    ? String(value)
    : "0";
}

function safeCloudflareErrorCode(payload) {
  if (!Array.isArray(payload?.errors)) return "NONE";
  const error = payload.errors.find(
    (item) => Number.isSafeInteger(item?.code) && item.code >= 1000,
  );
  return error ? String(error.code) : "NONE";
}

function validAccount(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

function validTenantHostname(value) {
  const match =
    typeof value === "string"
      ? /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.labofscents\.org$/.exec(
          value,
        )
      : null;
  return Boolean(match) && !new Set(["api", "admin", "next", "www"]).has(match[1]);
}

function failure(state) {
  return { pass: false, state };
}
