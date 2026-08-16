// @ts-nocheck
// This file is copied into the exact RC9 checkout by the protected workflow.
// It intentionally imports RC9's repository and service implementations rather
// than reimplementing their billing queries in the operations repository.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPlatformRepository } from "../services/platform/src/prisma-repository.js";
import { PlatformService } from "../services/platform/src/service.js";
import type { PlatformContext } from "../services/platform/src/types.js";

const tokenHeader = "x-olfactoryops-exact-billing-diagnostic";
const safeClasses = new Set([
  "PRISMA_KNOWN_REQUEST_ERROR",
  "PRISMA_UNKNOWN_REQUEST_ERROR",
  "PRISMA_CLIENT_VALIDATION_ERROR",
  "PRISMA_INITIALIZATION_ERROR",
  "POSTGRES_RLS_DENIED",
  "POSTGRES_PERMISSION_DENIED",
  "POSTGRES_CONNECTION_ERROR",
  "POSTGRES_TRANSACTION_ERROR",
  "TYPE_ERROR",
  "RANGE_ERROR",
  "REPOSITORY_TRANSACTION_ERROR",
  "ROLE_PERMISSION_PATH_ERROR",
  "BILLING_PROJECTION_ERROR",
  "JSON_SERIALIZATION_ERROR",
  "WORKER_ADAPTER_ERROR",
  "UNCLASSIFIED",
]);

type SafeClass =
  | "NONE"
  | "PRISMA_KNOWN_REQUEST_ERROR"
  | "PRISMA_UNKNOWN_REQUEST_ERROR"
  | "PRISMA_CLIENT_VALIDATION_ERROR"
  | "PRISMA_INITIALIZATION_ERROR"
  | "POSTGRES_RLS_DENIED"
  | "POSTGRES_PERMISSION_DENIED"
  | "POSTGRES_CONNECTION_ERROR"
  | "POSTGRES_TRANSACTION_ERROR"
  | "TYPE_ERROR"
  | "RANGE_ERROR"
  | "REPOSITORY_TRANSACTION_ERROR"
  | "ROLE_PERMISSION_PATH_ERROR"
  | "BILLING_PROJECTION_ERROR"
  | "JSON_SERIALIZATION_ERROR"
  | "WORKER_ADAPTER_ERROR"
  | "UNCLASSIFIED";

type Probe = { status: "PASS" | "FAIL" | "NOT_RUN"; safeClass: SafeClass };

type DiagnosticPrisma = {
  subscription: {
    findFirst: (input: unknown) => Promise<{
      status?: string;
      planId?: string | null;
    } | null>;
  };
  entitlement: {
    findMany: (input: unknown) => Promise<Array<{ capability: string; enabled: boolean }>>;
  };
  usageLimit: {
    findMany: (input: unknown) => Promise<Array<{ key: string; value: unknown }>>;
  };
  rolePolicy: {
    findUnique: (input: unknown) => Promise<{ permissions?: unknown } | null>;
  };
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1)
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function structuredCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const value = error as { code?: unknown; meta?: { code?: unknown }; cause?: unknown };
  if (typeof value.code === "string") return value.code;
  if (typeof value.meta?.code === "string") return value.meta.code;
  if (value.cause && typeof value.cause === "object" && typeof (value.cause as { code?: unknown }).code === "string")
    return (value.cause as { code: string }).code;
  return "";
}

export function safeErrorClass(error: unknown, fallback: SafeClass = "UNCLASSIFIED"): SafeClass {
  const code = structuredCode(error);
  if (/^P\d{4}$/.test(code)) return code === "P2025" ? "PRISMA_KNOWN_REQUEST_ERROR" : "PRISMA_UNKNOWN_REQUEST_ERROR";
  if (code === "42501") return "POSTGRES_PERMISSION_DENIED";
  if (/^08\d{3}$/.test(code)) return "POSTGRES_CONNECTION_ERROR";
  if (code === "25P02") return "POSTGRES_TRANSACTION_ERROR";
  if (code === "42P01" || code === "42703") return "PRISMA_KNOWN_REQUEST_ERROR";
  if (error instanceof TypeError) return "TYPE_ERROR";
  if (error instanceof RangeError) return "RANGE_ERROR";
  return safeClasses.has(fallback) ? fallback : "UNCLASSIFIED";
}

async function runProbe(operation: () => Promise<unknown>, fallback?: SafeClass): Promise<Probe> {
  try {
    await operation();
    return { status: "PASS", safeClass: "NONE" };
  } catch (error) {
    return { status: "FAIL", safeClass: safeErrorClass(error, fallback) };
  }
}

function billingProjection(
  subscription: { status?: string } | null,
  entitlements: Array<{ capability: string; enabled: boolean }>,
  limits: Array<{ key: string; value: unknown }>,
) {
  return {
    mode: "MANAGED_BETA",
    status: subscription?.status === "MANAGED_BETA" ? "ACTIVE" : "NOT_CONFIGURED",
    capabilities: Object.fromEntries(entitlements.map((item) => [item.capability, item.enabled])),
    limits: Object.fromEntries(limits.map((item) => [item.key, item.value])),
  };
}

async function serialize(value: unknown): Promise<Probe> {
  try {
    JSON.stringify(value);
    return { status: "PASS", safeClass: "NONE" };
  } catch (error) {
    return { status: "FAIL", safeClass: safeErrorClass(error, "JSON_SERIALIZATION_ERROR") };
  }
}

function safeOrg(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value) ? value : undefined;
}

function safeUser(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value) ? value : undefined;
}

async function runExactDiagnostic(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  hostname: string,
  config: {
    sessionPepper: string;
    passwordPepper: string;
    invitationEncryptionKey: string;
  },
) {
  const repository = new PrismaPlatformRepository(prisma);
  const unscopedResult: { probe: Probe; value?: unknown } = { probe: { status: "FAIL", safeClass: "UNCLASSIFIED" } };
  try {
    const value = await repository.getBilling(organizationId);
    unscopedResult.probe = { status: "PASS", safeClass: "NONE" };
    unscopedResult.value = value;
  } catch (error) {
    unscopedResult.probe = { status: "FAIL", safeClass: safeErrorClass(error) };
  }

  const scopedResult: { probe: Probe; value?: unknown } = { probe: { status: "FAIL", safeClass: "UNCLASSIFIED" } };
  try {
    const value = await repository.transaction(
      (tx) => tx.getBilling(organizationId),
      { organizationId, userId },
    );
    scopedResult.probe = { status: "PASS", safeClass: "NONE" };
    scopedResult.value = value;
  } catch (error) {
    scopedResult.probe = { status: "FAIL", safeClass: safeErrorClass(error, "REPOSITORY_TRANSACTION_ERROR") };
  }

  let substeps: Record<string, Probe> = {
    subscriptionInclude: { status: "NOT_RUN", safeClass: "NONE" },
    entitlements: { status: "NOT_RUN", safeClass: "NONE" },
    usageLimits: { status: "NOT_RUN", safeClass: "NONE" },
    projection: { status: "NOT_RUN", safeClass: "NONE" },
    serialization: { status: "NOT_RUN", safeClass: "NONE" },
  };
  if (unscopedResult.probe.status === "PASS" && scopedResult.probe.status === "FAIL") {
    try {
      const values = await repository.transaction(async (tx) => {
        // PrismaPlatformRepository.transaction returns another exact repository
        // backed by the same interactive Prisma transaction. Its private client
        // is intentionally accessed structurally only for these read-only probes.
        const client = (tx as unknown as { client: DiagnosticPrisma }).client;
        const subscription = await client.subscription.findFirst({
          where: { organizationId },
          include: { plan: true },
        });
        const entitlements = await client.entitlement.findMany({ where: { organizationId } });
        const limits = await client.usageLimit.findMany({ where: { organizationId } });
        const projection = billingProjection(subscription, entitlements, limits);
        return { subscription, entitlements, limits, projection };
      }, { organizationId, userId });
      substeps = {
        subscriptionInclude: { status: "PASS", safeClass: "NONE" },
        entitlements: { status: "PASS", safeClass: "NONE" },
        usageLimits: { status: "PASS", safeClass: "NONE" },
        projection: { status: "PASS", safeClass: "NONE" },
        serialization: await serialize(values.projection),
      };
    } catch (error) {
      const safeClass = safeErrorClass(error, "REPOSITORY_TRANSACTION_ERROR");
      substeps = {
        subscriptionInclude: { status: "FAIL", safeClass },
        entitlements: { status: "FAIL", safeClass },
        usageLimits: { status: "FAIL", safeClass },
        projection: { status: "FAIL", safeClass },
        serialization: { status: "FAIL", safeClass },
      };
    }
  }

  let service: Probe = { status: "FAIL", safeClass: "UNCLASSIFIED" };
  let serviceValue: unknown;
  if (scopedResult.probe.status === "PASS") {
    try {
      const platform = new PlatformService(repository, {
        baseDomain: "next.labofscents.org",
        publicHostnames: ["api-next.labofscents.org", "admin-next.labofscents.org"],
        sessionPepper: config.sessionPepper,
        passwordPepper: config.passwordPepper,
        invitationEncryptionKey: config.invitationEncryptionKey,
      });
      const context: PlatformContext = {
        userId,
        organizationId,
        sessionId: "diagnostic-session",
        role: "Owner",
        hostname,
      };
      serviceValue = await platform.billing(context);
      service = { status: "PASS", safeClass: "NONE" };
    } catch (error) {
      service = { status: "FAIL", safeClass: safeErrorClass(error, "ROLE_PERMISSION_PATH_ERROR") };
    }
  }

  let rolePolicy: { exists: "YES" | "NO" | "UNPROVEN"; hasBilling: "YES" | "NO" | "UNPROVEN"; query: "PASS" | "FAIL" } = {
    exists: "UNPROVEN",
    hasBilling: "UNPROVEN",
    query: "FAIL",
  };
  if (scopedResult.probe.status === "PASS" && service.status === "FAIL") {
    try {
      const result = await repository.transaction(async (tx) => {
        const client = (tx as unknown as { client: DiagnosticPrisma }).client;
        const row = await client.rolePolicy.findUnique({ where: { organizationId_roleKey: { organizationId, roleKey: "Owner" } } });
        const permissions = Array.isArray(row?.permissions) ? row.permissions.filter((item): item is string => typeof item === "string") : [];
        return { exists: Boolean(row), hasBilling: permissions.includes("billing.capabilities") };
      }, { organizationId, userId });
      rolePolicy = { exists: result.exists ? "YES" : "NO", hasBilling: result.hasBilling ? "YES" : "NO", query: "PASS" };
    } catch {
      rolePolicy = { exists: "UNPROVEN", hasBilling: "UNPROVEN", query: "FAIL" };
    }
  }

  let responseSerialization: Probe = { status: "NOT_RUN", safeClass: "NONE" };
  let responseConstruction: Probe = { status: "NOT_RUN", safeClass: "NONE" };
  if (service.status === "PASS") {
    responseSerialization = await serialize(serviceValue);
    try {
      JSON.stringify({ billingRuntimeDiagnostic: "MATRIX", billing: serviceValue });
      responseConstruction = { status: "PASS", safeClass: "NONE" };
    } catch (error) {
      responseConstruction = { status: "FAIL", safeClass: safeErrorClass(error, "JSON_SERIALIZATION_ERROR") };
    }
  }

  return {
    unscoped: unscopedResult.probe,
    unscopedSerialization: unscopedResult.probe.status === "PASS" ? await serialize(unscopedResult.value) : { status: "NOT_RUN", safeClass: "NONE" as SafeClass },
    scoped: scopedResult.probe,
    scopedSerialization: scopedResult.probe.status === "PASS" ? await serialize(scopedResult.value) : { status: "NOT_RUN", safeClass: "NONE" as SafeClass },
    substeps,
    service,
    serviceValue,
    rolePolicy,
    responseSerialization,
    responseConstruction,
  };
}

export type ExactBillingDiagnosticEnv = {
  HYPERDRIVE: { connectionString: string };
  EXACT_BILLING_DIAGNOSTIC_TOKEN: string;
  V2_SESSION_PEPPER: string;
  V2_PASSWORD_PEPPER: string;
  V2_INVITATION_ENCRYPTION_KEY: string;
};

export default {
  async fetch(request: Request, env: ExactBillingDiagnosticEnv): Promise<Response> {
    const url = new URL(request.url);
    if (!secureEqual(request.headers.get(tokenHeader) ?? "", env.EXACT_BILLING_DIAGNOSTIC_TOKEN ?? "")) return response(404, { exactBillingPathDiagnostic: "NOT_FOUND" });
    if (request.method === "GET" && url.pathname === "/ready") return response(200, { exactBillingPathDiagnostic: "READY" });
    if (request.method !== "POST" || url.pathname !== "/probe") return response(404, { exactBillingPathDiagnostic: "NOT_FOUND" });
    let input: { organizationId?: unknown; userId?: unknown; hostname?: unknown };
    try { input = await request.json() as typeof input; } catch { return response(404, { exactBillingPathDiagnostic: "NOT_FOUND" }); }
    const organizationId = safeOrg(input.organizationId);
    const userId = safeUser(input.userId);
    const hostname = typeof input.hostname === "string" && /^[a-z0-9.-]{1,253}$/.test(input.hostname) ? input.hostname : undefined;
    if (!organizationId || !userId || !hostname) return response(404, { exactBillingPathDiagnostic: "NOT_FOUND" });
    let prisma: PrismaClient | undefined;
    try {
      prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.HYPERDRIVE.connectionString }) });
      const result = await runExactDiagnostic(prisma, organizationId, userId, hostname, {
        sessionPepper: env.V2_SESSION_PEPPER,
        passwordPepper: env.V2_PASSWORD_PEPPER,
        invitationEncryptionKey: env.V2_INVITATION_ENCRYPTION_KEY,
      });
      return response(200, {
        exactBillingPathDiagnostic: "MATRIX",
        exactGetBillingUnscoped: result.unscoped,
        exactGetBillingUnscopedSerialization: result.unscopedSerialization,
        exactGetBillingScoped: result.scoped,
        exactGetBillingScopedSerialization: result.scopedSerialization,
        scopedSubscriptionInclude: result.substeps.subscriptionInclude,
        scopedEntitlements: result.substeps.entitlements,
        scopedUsageLimits: result.substeps.usageLimits,
        scopedBillingProjection: result.substeps.projection,
        scopedBillingSerialization: result.substeps.serialization,
        exactPlatformServiceBilling: result.service,
        ownerRolePolicyExists: result.rolePolicy.exists,
        ownerHasBillingCapabilities: result.rolePolicy.hasBilling,
        rolePermissionQuery: result.rolePolicy.query,
        platformBillingJsonSerialization: result.responseSerialization,
        platformBillingResponseConstruction: result.responseConstruction,
        billingRlsRuntimeEffect: [result.unscoped, result.scoped, result.service, result.substeps.subscriptionInclude, result.substeps.entitlements, result.substeps.usageLimits].some((item) => item.safeClass === "POSTGRES_RLS_DENIED") ? "DENIED" : "NONE",
      });
    } catch {
      return response(503, { exactBillingPathDiagnostic: "UNAVAILABLE", safeClass: "WORKER_ADAPTER_ERROR" });
    } finally {
      await prisma?.$disconnect().catch(() => undefined);
    }
  },
} satisfies ExportedHandler<ExactBillingDiagnosticEnv>;
