import { expect, test } from "vitest";

import {
  inspectActiveRouterDeployment,
  inspectActiveRouterVersion,
  routerIngressExpectation,
} from "./inspect-v2-production-candidate-router-ingress.mjs";

const versionId = "96a902d8-9477-4e4e-b732-228dd17d376b";

function deployment(versions) {
  return {
    success: true,
    result: { deployments: [{ strategy: "percentage", versions }] },
  };
}

function versionDetail(bindings) {
  return {
    success: true,
    result: { id: versionId, resources: { bindings } },
  };
}

function expectedBindings() {
  return [
    {
      name: "RELEASE_GIT_SHA",
      type: "plain_text",
      text: routerIngressExpectation.releaseSha,
    },
    {
      name: "PAGES_ORIGIN",
      type: "plain_text",
      text: routerIngressExpectation.pagesOrigin,
    },
    {
      name: "V2_WORKSPACE_BASE_DOMAIN",
      type: "plain_text",
      text: routerIngressExpectation.workspaceBaseDomain,
    },
    { name: "RELEASE_ENVIRONMENT", type: "plain_text", text: "production" },
    {
      name: "HYPERDRIVE",
      type: "hyperdrive",
      id: routerIngressExpectation.hyperdriveId,
    },
  ];
}

test("accepts only one current Router version with 100 percent traffic", () => {
  const result = inspectActiveRouterDeployment(
    deployment([{ version_id: versionId, percentage: 100 }]),
  );

  expect(result).toMatchObject({
    deploymentRead: true,
    singleVersion: true,
    activeTraffic: true,
    trafficSplit: "NOT_DETECTED",
    versionId,
  });
});

test("fails closed on a split, malformed, or non-success deployment response", () => {
  expect(
    inspectActiveRouterDeployment(
      deployment([
        { version_id: versionId, percentage: 50 },
        { version_id: "11111111-1111-4111-8111-111111111111", percentage: 50 },
      ]),
    ),
  ).toMatchObject({ activeTraffic: false, trafficSplit: "DETECTED" });
  expect(inspectActiveRouterDeployment({ success: false })).toMatchObject({
    deploymentRead: false,
    trafficSplit: "UNPROVEN",
  });
});

test("validates only the exact RC9 Router binding allowlist", () => {
  const result = inspectActiveRouterVersion(versionDetail(expectedBindings()), {
    versionId,
  });

  expect(result).toMatchObject({
    detailRead: true,
    versionIdMatch: true,
    releaseShaMatch: true,
    pagesOriginMatch: true,
    workspaceBaseDomainMatch: true,
    releaseEnvironmentMatch: true,
    hyperdriveMatch: true,
    bindingsComplete: true,
    configurationMatch: true,
  });
});

test("fails closed on duplicate, inherited, or mismatched required bindings", () => {
  const duplicateRelease = expectedBindings().concat({
    name: "RELEASE_GIT_SHA",
    type: "plain_text",
    text: "untrusted-value-not-emitted",
  });
  const duplicateResult = inspectActiveRouterVersion(
    versionDetail(duplicateRelease),
    {
      versionId,
    },
  );
  expect(duplicateResult).toMatchObject({
    releaseShaMatch: false,
    configurationMatch: false,
  });

  const inheritedHyperdrive = expectedBindings().map((binding) =>
    binding.name === "HYPERDRIVE"
      ? { name: "HYPERDRIVE", type: "inherit" }
      : binding,
  );
  const inheritedResult = inspectActiveRouterVersion(
    versionDetail(inheritedHyperdrive),
    { versionId },
  );
  expect(inheritedResult).toMatchObject({
    hyperdriveMatch: false,
    configurationMatch: false,
  });
});
