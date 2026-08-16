import { describe, expect, it } from "vitest";
import {
  classifyExactBillingPath,
  classifyNonRc9PlanControl,
  readExactBillingMatrix,
} from "./diagnose-v2-production-candidate-exact-billing-path.mjs";

const probe = (status = "PASS", safeClass = "NONE") => ({ status, safeClass });
function body(overrides = {}) {
  const base = {
    exactBillingPathDiagnostic: "MATRIX",
    exactGetBillingUnscoped: probe(),
    exactGetBillingUnscopedSerialization: probe(),
    exactGetBillingScoped: probe(),
    exactGetBillingScopedSerialization: probe(),
    scopedSubscriptionInclude: probe(),
    scopedEntitlements: probe(),
    scopedUsageLimits: probe(),
    scopedBillingProjection: probe(),
    scopedBillingSerialization: probe(),
    exactPlatformServiceBilling: probe(),
    platformBillingJsonSerialization: probe(),
    platformBillingResponseConstruction: probe(),
    ownerRolePolicyExists: "YES",
    ownerHasBillingCapabilities: "YES",
    rolePermissionQuery: "PASS",
    billingRlsRuntimeEffect: "NONE",
  };
  return { ...base, ...overrides };
}

describe("exact RC9 billing path classification", () => {
  it("does not use the non-RC9 plan control", () => {
    const matrix = readExactBillingMatrix(body({ nonRc9PlanDirectControl: { status: "FAIL", safeClass: "UNCLASSIFIED" } }));
    expect(classifyNonRc9PlanControl()).toBe("NON_RC9_PLAN_DIRECT_CONTROL_NOT_USED");
    expect(classifyExactBillingPath({ matrix, candidateEndpoint: { status: 500 }, versionStable: "YES" }).rootCause).toBe("CANDIDATE_API_TRANSPORT_OR_BUNDLE_RUNTIME_PATH");
  });
  it("separates scoped transaction failure from the unscoped RC9 method", () => {
    const matrix = readExactBillingMatrix(body({ exactGetBillingScoped: probe("FAIL", "POSTGRES_RLS_DENIED") }));
    expect(classifyExactBillingPath({ matrix, candidateEndpoint: { status: 500 }, versionStable: "YES" }).rootCause).toBe("SCOPED_TRANSACTION_OR_TENANT_CONTEXT_PATH");
  });
  it("separates service and response paths", () => {
    const serviceFail = readExactBillingMatrix(body({ exactPlatformServiceBilling: probe("FAIL", "ROLE_PERMISSION_PATH_ERROR") }));
    expect(classifyExactBillingPath({ matrix: serviceFail, candidateEndpoint: { status: 500 }, versionStable: "YES" }).rootCause).toBe("PLATFORM_SERVICE_PERMISSION_OR_SERVICE_PATH");
    const responseFail = readExactBillingMatrix(body({ platformBillingResponseConstruction: probe("FAIL", "JSON_SERIALIZATION_ERROR") }));
    expect(classifyExactBillingPath({ matrix: responseFail, candidateEndpoint: { status: 200 }, versionStable: "YES" }).rootCause).toBe("BILLING_RESPONSE_SERIALIZATION_PATH");
  });
  it("fails closed when the active version is unstable", () => {
    const matrix = readExactBillingMatrix(body());
    expect(classifyExactBillingPath({ matrix, candidateEndpoint: { status: 500 }, versionStable: "NO" }).rootCause).toBe("UNPROVEN");
  });
});
