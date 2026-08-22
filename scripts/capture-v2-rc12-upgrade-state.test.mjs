import assert from "node:assert/strict";
import { expect, it } from "vitest";

import {
  RC10_SHA,
  RC12_SHA,
  inspectActiveDeployment,
  inspectPagesProductionDeployment,
  inspectUploadedVersion,
  inspectVersionIdentity,
} from "./capture-v2-rc12-upgrade-state.mjs";

const activeId = "11111111-1111-4111-8111-111111111111";

it("accepts only one 100 percent active Worker version", () => {
  const pass = inspectActiveDeployment({
    success: true,
    result: { deployments: [{ versions: [{ version_id: activeId, percentage: 100 }] }] },
  });
  expect(pass.pass).toBe(true);
  expect(pass.versionId).toBe(activeId);
  assert.equal(
    inspectActiveDeployment({
      success: true,
      result: { deployments: [{ versions: [{ version_id: activeId, percentage: 50 }] }] },
    }).pass,
    false,
  );
});

it("requires exact release binding and safe production Pages identity", () => {
  assert.equal(
    inspectVersionIdentity(
      { success: true, result: { id: activeId, resources: { bindings: [{ type: "plain_text", name: "RELEASE_GIT_SHA", text: RC10_SHA }] } } },
      activeId,
      RC10_SHA,
    ).pass,
    true,
  );
  const pages = inspectPagesProductionDeployment(
    { success: true, result: [{ id: "opaque_pages_deployment", environment: "production", latest_stage: { name: "success" }, deployment_trigger: { metadata: { commit_hash: RC12_SHA } } }] },
    RC12_SHA,
  );
  expect(pages.pass).toBe(true);
  assert.equal(
    inspectPagesProductionDeployment({ success: true, result: [] }, RC12_SHA).state,
    "PRODUCTION_DEPLOYMENT_UNPROVEN",
  );
});

it("selects a unique tagged inactive upload and does not serialize provider sentinels", () => {
  const result = inspectUploadedVersion([{ id: activeId, tag: `rc12-${RC12_SHA.slice(0, 12)}` }]);
  expect(result.pass).toBe(true);
  assert.equal(
    inspectUploadedVersion([{ id: activeId, tag: "other" }]).state,
    "UPLOADED_VERSION_UNPROVEN",
  );
  expect(JSON.stringify(inspectActiveDeployment({ success: false, secret: "never-print" }))).not.toContain("never-print");
});
