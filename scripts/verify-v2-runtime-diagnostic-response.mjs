import { readFileSync } from "node:fs";

const safeBooleanKeys = [
  "databaseProbeCompleted",
  "hyperdriveConnectionReachable",
  "hyperdriveProductionDatabaseMatch",
  "runtimeCurrentUserMatchesExpected",
  "runtimeSessionUserMatchesExpected",
  "sessionContextProbeCompleted",
  "runtimeRequestHostnameContextPresent",
  "runtimeOrganizationContextPresent",
  "runtimeUserContextPresent",
  "rlsMetadataProbeCompleted",
  "workspaceHostnamesRls",
  "workspaceHostnamesForceRls",
  "organizationsRls",
  "organizationsForceRls",
  "resolverMetadataProbeCompleted",
  "resolverExists",
  "resolverSecurityDefiner",
  "functionOwnerOwnsWorkspaceHostnames",
  "functionOwnerOwnsOrganizations",
  "functionOwnerIsSuperuser",
  "functionOwnerBypassRls",
  "functionOwnerForceRlsConstrained",
  "resolverPrivilegeProbeCompleted",
  "runtimeExecuteGranted",
  "directHostnameProbeCompleted",
  "runtimeDirectHostnameVisible",
  "directOrganizationProbeCompleted",
  "runtimeDirectOrganizationVisible",
  "resolverInvocationProbeCompleted",
  "runtimeResolverResult",
  "runtimeResolverOrganizationMatch",
];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExactEnvelope(value, status) {
  return (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    value.candidateRuntimeDiagnostic === status
  );
}

function parseResponse() {
  const responseFile = process.env.RUNTIME_DIAGNOSTIC_RESPONSE_FILE;
  if (!responseFile) return null;

  try {
    return JSON.parse(readFileSync(responseFile, "utf8"));
  } catch {
    return null;
  }
}

function validateMatrix(value) {
  if (!isRecord(value) || value.candidateRuntimeDiagnostic !== "COMPLETE") {
    return null;
  }

  const expectedKeys = new Set([
    "candidateRuntimeDiagnostic",
    ...safeBooleanKeys,
  ]);
  if (
    Object.keys(value).length !== expectedKeys.size ||
    Object.keys(value).some((key) => !expectedKeys.has(key)) ||
    safeBooleanKeys.some((key) => typeof value[key] !== "boolean")
  ) {
    return null;
  }

  return value;
}

const mode = process.argv[2];
const body = parseResponse();

if (mode === "ready") {
  if (!isExactEnvelope(body, "READY")) process.exitCode = 1;
} else if (mode === "unavailable") {
  if (!isExactEnvelope(body, "UNAVAILABLE")) process.exitCode = 1;
} else if (mode === "matrix") {
  const matrix = validateMatrix(body);
  if (!matrix) {
    console.log("DIAGNOSTIC_SAFE_BOOLEAN_MATRIX=FAIL");
    process.exitCode = 1;
  } else {
    const runtimeDiagnosticExecution = [
      matrix.databaseProbeCompleted,
      matrix.hyperdriveConnectionReachable,
      matrix.hyperdriveProductionDatabaseMatch,
      matrix.runtimeCurrentUserMatchesExpected,
      matrix.runtimeSessionUserMatchesExpected,
    ].every(Boolean)
      ? "PASS"
      : "FAIL";
    const actualHyperdriveRuntimeResolver =
      !matrix.resolverInvocationProbeCompleted
        ? "UNPROVEN"
        : matrix.runtimeResolverResult &&
            matrix.runtimeResolverOrganizationMatch
          ? "PASS"
          : "FAIL";

    console.log("DIAGNOSTIC_SAFE_BOOLEAN_MATRIX=PASS");
    console.log(`RUNTIME_DIAGNOSTIC_EXECUTION=${runtimeDiagnosticExecution}`);
    console.log(
      `ACTUAL_HYPERDRIVE_RUNTIME_RESOLVER=${actualHyperdriveRuntimeResolver}`,
    );
    console.log(
      JSON.stringify(
        Object.fromEntries(safeBooleanKeys.map((key) => [key, matrix[key]])),
      ),
    );

    if (runtimeDiagnosticExecution !== "PASS") process.exitCode = 3;
    if (actualHyperdriveRuntimeResolver !== "PASS") process.exitCode = 4;
  }
} else {
  process.exitCode = 1;
}
