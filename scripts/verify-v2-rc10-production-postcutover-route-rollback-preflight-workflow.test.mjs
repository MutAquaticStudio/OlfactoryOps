import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const verifier = fileURLToPath(
  new URL(
    "./verify-v2-rc10-production-postcutover-route-rollback-preflight-workflow.mjs",
    import.meta.url,
  ),
);

describe("post-cutover route rollback preflight workflow contract", () => {
  it("requires a protected exact-RC10 read-only verification", () => {
    const output = execFileSync(process.execPath, [verifier], {
      encoding: "utf8",
    });

    expect(output).toBe(
      "RC10_POSTCUTOVER_ROUTE_ROLLBACK_PREFLIGHT_WORKFLOW=PASS\n",
    );
  });
});
