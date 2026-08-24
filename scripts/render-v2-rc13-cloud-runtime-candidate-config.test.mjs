import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CANDIDATE_WORKER_NAME,
  CANDIDATE_WORKFLOW_NAME,
  PRODUCTION_QUEUE_NAMES,
  PRODUCTION_WORKFLOW_NAME,
  RC13_SHA,
  renderRc13CandidateCloudRuntimeConfig,
  validateRc13CandidateCloudRuntimeConfig,
} from "./render-v2-rc13-cloud-runtime-candidate-config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const template = `${readFileSync(join(root, "wrangler.v2-cloud-runtime-production.example.toml"), "utf8").trimEnd()}\nPASSWORD_RESET_DELIVERY_ENABLED = "true"\n`;
const values = {
  releaseSha: RC13_SHA,
  hyperdriveId: "candidate-test-hyperdrive",
  featureImage: "registry.example/feature@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  modelImage: "registry.example/model@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  featureImageDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  modelImageDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
};

describe("RC13 Cloud Runtime candidate isolation renderer", () => {
  it("renders a unique Worker and Workflow without production queue ownership", () => {
    const rendered = renderRc13CandidateCloudRuntimeConfig(template, values);
    const report = validateRc13CandidateCloudRuntimeConfig(rendered, values);

    expect(rendered).toContain('name = "' + CANDIDATE_WORKER_NAME + '"');
    expect(rendered).toContain('name = "' + CANDIDATE_WORKFLOW_NAME + '"');
    expect(rendered).not.toContain('name = "' + PRODUCTION_WORKFLOW_NAME + '"');
    expect(rendered).not.toMatch(/\[\[queues\.(?:producers|consumers)\]\]/);
    for (const queueName of PRODUCTION_QUEUE_NAMES) expect(rendered).not.toMatch(new RegExp('^(?:queue|dead_letter_queue) = "' + queueName + '"$', "m"));
    expect(report).toEqual(expect.arrayContaining([
      "CANDIDATE_WORKER_NAME_ISOLATED=PASS",
      "CANDIDATE_WORKFLOW_NAME_ISOLATED=PASS",
      "PRODUCTION_WORKFLOW_NAME_ABSENT_FROM_CANDIDATE_OWNERSHIP=PASS",
      "PRODUCTION_QUEUE_CONSUMERS_ABSENT=PASS",
      "PUBLIC_ROUTES_ABSENT=PASS",
      "PUBLIC_CUSTOM_DOMAINS_ABSENT=PASS",
      "RC13_SHA_UNCHANGED=PASS",
      "CANDIDATE_PASSWORD_RESET_DELIVERY_DISABLED=PASS",
    ]));
  });

  it("rejects a config that could reassign production Workflow ownership", () => {
    const rendered = renderRc13CandidateCloudRuntimeConfig(template, values).replace(
      CANDIDATE_WORKFLOW_NAME,
      PRODUCTION_WORKFLOW_NAME,
    );

    expect(() => validateRc13CandidateCloudRuntimeConfig(rendered, values)).toThrow(
      /candidate Workflow name is not isolated|production Workflow ownership/,
    );
  });

  it("rejects a config that retains a production queue consumer", () => {
    const rendered = renderRc13CandidateCloudRuntimeConfig(template, values)
      + '\n[[queues.consumers]]\nqueue = "' + PRODUCTION_QUEUE_NAMES[0] + '"\n';

    expect(() => validateRc13CandidateCloudRuntimeConfig(rendered, values)).toThrow(/queue declarations/);
  });

  it("rejects public route or custom-domain declarations", () => {
    const rendered = renderRc13CandidateCloudRuntimeConfig(template, values);

    expect(() => validateRc13CandidateCloudRuntimeConfig(rendered + '\nroutes = [{ pattern = "example.org/*" }]\n', values)).toThrow(/public routes/);
    expect(() => validateRc13CandidateCloudRuntimeConfig(rendered + '\ncustom_domain = true\n', values)).toThrow(/public custom domains/);
  });

  it("rejects a release other than immutable RC13", () => {
    expect(() => renderRc13CandidateCloudRuntimeConfig(template, { ...values, releaseSha: "fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd" })).toThrow(/immutable RC13/);
  });
});
