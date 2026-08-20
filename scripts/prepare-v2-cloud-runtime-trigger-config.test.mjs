import { describe, expect, it } from "vitest";

import { prepareCloudRuntimeTriggerConfig } from "./prepare-v2-cloud-runtime-trigger-config.mjs";

const template = `name = "olfactoryops-v2-cloud-runtime-production"
main = "../worker/cloud-runtime/index.ts"
workers_dev = false

[vars]
RELEASE_ENVIRONMENT = "production"

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "placeholder"

[[r2_buckets]]
binding = "R2_ARTIFACTS"
bucket_name = "artifacts"

[[vectorize]]
binding = "MATERIAL_EVIDENCE_VECTORS"
index_name = "vectors"

[[queues.producers]]
binding = "SCIENTIFIC_JOBS"
queue = "scientific"

[[queues.producers]]
binding = "RAG_INGESTION_JOBS"
queue = "rag"

[[queues.producers]]
binding = "NOTIFICATION_DELIVERY_JOBS"
queue = "notifications"

[[queues.consumers]]
queue = "scientific"
max_batch_size = 10

[[queues.consumers]]
queue = "rag"
max_batch_size = 10

[[queues.consumers]]
queue = "notifications"
max_batch_size = 10

[[workflows]]
name = "scientific"
binding = "SCIENTIFIC_WORKFLOW"
class_name = "ScientificJobWorkflow"

[[durable_objects.bindings]]
name = "SCIENTIFIC_FEATURE_CONTAINER"
class_name = "ScientificFeatureContainer"

[[durable_objects.bindings]]
name = "SCIENTIFIC_MODEL_CONTAINER"
class_name = "ScientificModelContainer"
`;

describe("Cloud Runtime trigger configuration", () => {
  it("creates a route-free bootstrap without global triggers", () => {
    const config = prepareCloudRuntimeTriggerConfig({
      content: template,
      mode: "bootstrap",
    });

    expect(config).not.toContain("[[queues.consumers]]");
    expect(config).not.toContain("[[workflows]]");
    expect(config).toContain(
      'name = "olfactoryops-v2-cloud-runtime-production"',
    );
    expect(config).toContain("SCIENTIFIC_JOBS");
    expect(config).toContain("workers_dev = false");
  });

  it("retains only the workflow trigger for the intentional handoff", () => {
    const config = prepareCloudRuntimeTriggerConfig({
      content: template,
      mode: "workflowHandoff",
    });

    expect(config).not.toContain("[[queues.consumers]]");
    expect(config).toContain("[[workflows]]");
    expect(config).toContain("SCIENTIFIC_WORKFLOW");
  });

  it("creates an exact candidate workflow recovery config without consumers", () => {
    const config = prepareCloudRuntimeTriggerConfig({
      content: template,
      mode: "candidateRecovery",
    });

    expect(config).toContain(
      'name = "olfactoryops-v2-cloud-runtime-production-candidate"',
    );
    expect(config).not.toContain("[[queues.consumers]]");
    expect(config).toContain("[[workflows]]");
  });

  it("rejects a public route or a missing trigger contract", () => {
    expect(() =>
      prepareCloudRuntimeTriggerConfig({
        content: `${template}\nroutes = [{ pattern = "api.labofscents.org/*" }]`,
        mode: "bootstrap",
      }),
    ).toThrow("CLOUD_RUNTIME_TRIGGER_CONFIG_ROUTE_INVALID");
    expect(() =>
      prepareCloudRuntimeTriggerConfig({
        content: template.replace("[[workflows]]", "[[workflow]]"),
        mode: "workflowHandoff",
      }),
    ).toThrow("CLOUD_RUNTIME_TRIGGER_CONFIG_TEMPLATE_INVALID");
  });
});
