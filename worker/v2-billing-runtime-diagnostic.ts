const tokenHeader = "x-olfactoryops-billing-runtime-diagnostic";

type ProbeStatus = "PASS" | "FAIL";
type SafeErrorClass =
  | "NONE"
  | "PRISMA_Pxxxx"
  | "POSTGRES_RLS_DENIED"
  | "POSTGRES_PERMISSION_DENIED"
  | "POSTGRES_CONNECTION_FAILED"
  | "POSTGRES_TRANSACTION_FAILED"
  | "PRISMA_RELATION_INCLUDE_FAILURE"
  | "PRISMA_SERIALIZATION_FAILURE"
  | "ADAPTER_RUNTIME_FAILURE"
  | "UNCLASSIFIED";

export type BillingRuntimeDiagnosticEnv = {
  HYPERDRIVE: { connectionString: string };
  BILLING_RUNTIME_DIAGNOSTIC_TOKEN: string;
};

type Probe = { status: ProbeStatus; errorClass: SafeErrorClass };
type ProbeValue<T> = Probe & { value?: T };

export type BillingRuntimeMatrix = {
  subscriptionWithPlanInclude: Probe;
  subscriptionPlain: Probe;
  planDirect: Probe;
  entitlements: Probe;
  usageLimits: Probe;
  manualProjection: Probe;
  serialization: Probe;
  sequentialTransaction: Probe;
  failureSafeClass: SafeErrorClass;
};

type PrismaLike = {
  subscription: {
    findFirst: (query: unknown) => Promise<{ planId?: string | null } | null>;
  };
  plan: { findUnique: (query: unknown) => Promise<unknown> };
  entitlement: {
    findMany: (
      query: unknown,
    ) => Promise<Array<{ capability: string; enabled: unknown }>>;
  };
  usageLimit: {
    findMany: (
      query: unknown,
    ) => Promise<Array<{ key: string; value: unknown }>>;
  };
  $transaction: <T>(
    callback: (transaction: PrismaLike) => Promise<T>,
  ) => Promise<T>;
  $disconnect: () => Promise<void>;
};

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1)
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export function safeBillingErrorClass(error: unknown): SafeErrorClass {
  const code =
    error &&
    typeof error === "object" &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";
  if (/^P\d{4}$/.test(code)) return "PRISMA_Pxxxx";
  if (code === "42501") return "POSTGRES_PERMISSION_DENIED";
  if (/^08\d{3}$/.test(code)) return "POSTGRES_CONNECTION_FAILED";
  if (code === "25P02") return "POSTGRES_TRANSACTION_FAILED";
  return "UNCLASSIFIED";
}

async function probe<T>(operation: () => Promise<T>): Promise<ProbeValue<T>> {
  try {
    return { status: "PASS", errorClass: "NONE", value: await operation() };
  } catch (error) {
    return { status: "FAIL", errorClass: safeBillingErrorClass(error) };
  }
}

function unavailable(errorClass: SafeErrorClass = "UNCLASSIFIED"): Probe {
  return { status: "FAIL", errorClass };
}

function projection(
  entitlements: Array<{ capability: string; enabled: unknown }>,
  limits: Array<{ key: string; value: unknown }>,
) {
  return {
    mode: "MANAGED_BETA",
    capabilities: Object.fromEntries(
      entitlements.map((item) => [item.capability, item.enabled]),
    ),
    limits: Object.fromEntries(limits.map((item) => [item.key, item.value])),
  };
}

async function sequentialProbe(
  prisma: PrismaLike,
  organizationId: string,
): Promise<Probe> {
  try {
    await prisma.$transaction(async (transaction) => {
      const subscription = await transaction.subscription.findFirst({
        where: { organizationId },
      });
      if (!subscription?.planId)
        throw new Error("DIAGNOSTIC_PLAN_ID_UNAVAILABLE");
      await transaction.plan.findUnique({ where: { id: subscription.planId } });
      const entitlements = await transaction.entitlement.findMany({
        where: { organizationId },
      });
      const limits = await transaction.usageLimit.findMany({
        where: { organizationId },
      });
      JSON.stringify(projection(entitlements, limits));
    });
    return { status: "PASS", errorClass: "NONE" };
  } catch (error) {
    return { status: "FAIL", errorClass: safeBillingErrorClass(error) };
  }
}

export async function runBillingRuntimeMatrix(
  prisma: PrismaLike,
  organizationId: string,
): Promise<BillingRuntimeMatrix> {
  const subscriptionWithPlanInclude = await probe(() =>
    prisma.subscription.findFirst({
      where: { organizationId },
      include: { plan: true },
    }),
  );
  const subscriptionPlain = await probe(() =>
    prisma.subscription.findFirst({ where: { organizationId } }),
  );
  const planDirect = subscriptionPlain.value?.planId
    ? await probe(() =>
        prisma.plan.findUnique({
          where: { id: subscriptionPlain.value?.planId },
        }),
      )
    : unavailable();
  const entitlements = await probe(() =>
    prisma.entitlement.findMany({ where: { organizationId } }),
  );
  const usageLimits = await probe(() =>
    prisma.usageLimit.findMany({ where: { organizationId } }),
  );

  let manualProjection: Probe = unavailable();
  let serialization: Probe = unavailable();
  if (
    subscriptionPlain.status === "PASS" &&
    planDirect.status === "PASS" &&
    entitlements.status === "PASS" &&
    usageLimits.status === "PASS"
  ) {
    try {
      const value = projection(
        entitlements.value ?? [],
        usageLimits.value ?? [],
      );
      manualProjection = { status: "PASS", errorClass: "NONE" };
      try {
        JSON.stringify(value);
        serialization = { status: "PASS", errorClass: "NONE" };
      } catch {
        serialization = {
          status: "FAIL",
          errorClass: "PRISMA_SERIALIZATION_FAILURE",
        };
      }
    } catch {
      manualProjection = {
        status: "FAIL",
        errorClass: "PRISMA_SERIALIZATION_FAILURE",
      };
    }
  }
  const sequentialTransaction = await sequentialProbe(prisma, organizationId);
  const probes = [
    subscriptionWithPlanInclude,
    subscriptionPlain,
    planDirect,
    entitlements,
    usageLimits,
    manualProjection,
    serialization,
    sequentialTransaction,
  ];
  const safeProbe = ({ status, errorClass }: Probe): Probe => ({
    status,
    errorClass,
  });
  return {
    subscriptionWithPlanInclude: safeProbe(subscriptionWithPlanInclude),
    subscriptionPlain: safeProbe(subscriptionPlain),
    planDirect: safeProbe(planDirect),
    entitlements: safeProbe(entitlements),
    usageLimits: safeProbe(usageLimits),
    manualProjection: safeProbe(manualProjection),
    serialization: safeProbe(serialization),
    sequentialTransaction: safeProbe(sequentialTransaction),
    failureSafeClass:
      probes.find((item) => item.status === "FAIL")?.errorClass ?? "NONE",
  };
}

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function safeOrganizationId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value)
    ? value
    : undefined;
}

export default {
  async fetch(
    request: Request,
    env: BillingRuntimeDiagnosticEnv,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (
      !secureEqual(
        request.headers.get(tokenHeader) ?? "",
        env.BILLING_RUNTIME_DIAGNOSTIC_TOKEN ?? "",
      )
    )
      return response(404, { billingRuntimeDiagnostic: "NOT_FOUND" });
    if (request.method === "GET" && url.pathname === "/ready")
      return response(200, { billingRuntimeDiagnostic: "READY" });
    if (request.method !== "POST" || url.pathname !== "/probe")
      return response(404, { billingRuntimeDiagnostic: "NOT_FOUND" });

    let organizationId: string | undefined;
    try {
      const payload: unknown = await request.json();
      organizationId = safeOrganizationId(
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as { organizationId?: unknown }).organizationId
          : undefined,
      );
    } catch {
      return response(404, { billingRuntimeDiagnostic: "NOT_FOUND" });
    }
    if (!organizationId)
      return response(404, { billingRuntimeDiagnostic: "NOT_FOUND" });

    let prisma: PrismaLike | undefined;
    try {
      const [{ PrismaPg }, { PrismaClient }] = await Promise.all([
        import("@prisma/adapter-pg"),
        import("@prisma/client"),
      ]);
      prisma = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: env.HYPERDRIVE.connectionString,
        }),
      }) as unknown as PrismaLike;
      const matrix = await runBillingRuntimeMatrix(prisma, organizationId);
      return response(200, {
        billingRuntimeDiagnostic: "MATRIX",
        subscriptionWithPlanInclude: matrix.subscriptionWithPlanInclude,
        subscriptionPlain: matrix.subscriptionPlain,
        planDirect: matrix.planDirect,
        entitlements: matrix.entitlements,
        usageLimits: matrix.usageLimits,
        manualProjection: matrix.manualProjection,
        serialization: matrix.serialization,
        sequentialTransaction: matrix.sequentialTransaction,
        failureSafeClass: matrix.failureSafeClass,
      });
    } catch {
      return response(503, {
        billingRuntimeDiagnostic: "UNAVAILABLE",
        failureSafeClass: "ADAPTER_RUNTIME_FAILURE",
      });
    } finally {
      await prisma?.$disconnect().catch(() => undefined);
    }
  },
} satisfies ExportedHandler<BillingRuntimeDiagnosticEnv>;
