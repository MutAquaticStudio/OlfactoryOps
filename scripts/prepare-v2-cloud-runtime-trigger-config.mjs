import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const productionService = "olfactoryops-v2-cloud-runtime-production";
const candidateService = "olfactoryops-v2-cloud-runtime-production-candidate";
const consumerHeader = "[[queues.consumers]]";
const workflowHeader = "[[workflows]]";

const modes = {
  bootstrap: { remove: new Set([consumerHeader, workflowHeader]) },
  workflowHandoff: { remove: new Set([consumerHeader]) },
  candidateRecovery: {
    remove: new Set([consumerHeader]),
    targetService: candidateService,
  },
};

function headerAt(line) {
  const match = line.match(/^\s*(\[\[[^\]]+\]\]|\[[^\]]+\])\s*$/);
  return match?.[1];
}

function removeArrayBlocks(content, headers) {
  const output = [];
  let skippedHeader;
  for (const line of content.split(/\r?\n/)) {
    const header = headerAt(line);
    if (header && skippedHeader) skippedHeader = undefined;
    if (header && headers.has(header)) {
      skippedHeader = header;
      continue;
    }
    if (!skippedHeader) output.push(line);
  }
  return output.join("\n");
}

function count(content, literal) {
  return content.split(literal).length - 1;
}

function assertBaseConfig(content) {
  if (typeof content !== "string")
    throw new Error("CLOUD_RUNTIME_TRIGGER_CONFIG_INVALID");
  if (count(content, `name = "${productionService}"`) !== 1) {
    throw new Error("CLOUD_RUNTIME_TRIGGER_CONFIG_SERVICE_INVALID");
  }
  if (!content.includes("workers_dev = false")) {
    throw new Error("CLOUD_RUNTIME_TRIGGER_CONFIG_PUBLIC_SURFACE_INVALID");
  }
  if (
    count(content, consumerHeader) !== 3 ||
    count(content, workflowHeader) !== 1
  ) {
    throw new Error("CLOUD_RUNTIME_TRIGGER_CONFIG_TEMPLATE_INVALID");
  }
  for (const binding of [
    "HYPERDRIVE",
    "R2_ARTIFACTS",
    "MATERIAL_EVIDENCE_VECTORS",
    "SCIENTIFIC_JOBS",
    "RAG_INGESTION_JOBS",
    "NOTIFICATION_DELIVERY_JOBS",
    "SCIENTIFIC_FEATURE_CONTAINER",
    "SCIENTIFIC_MODEL_CONTAINER",
  ]) {
    if (!content.includes(binding))
      throw new Error("CLOUD_RUNTIME_TRIGGER_CONFIG_BINDING_INVALID");
  }
  if (/^\s*(routes\s*=|\[\[routes\]\])/m.test(content)) {
    throw new Error("CLOUD_RUNTIME_TRIGGER_CONFIG_ROUTE_INVALID");
  }
}

export function prepareCloudRuntimeTriggerConfig({ content, mode }) {
  const specification = modes[mode];
  if (!specification)
    throw new Error("CLOUD_RUNTIME_TRIGGER_CONFIG_MODE_INVALID");
  assertBaseConfig(content);

  let prepared = removeArrayBlocks(content, specification.remove);
  if (specification.targetService) {
    prepared = prepared.replace(
      `name = "${productionService}"`,
      `name = "${specification.targetService}"`,
    );
  }

  if (/^\s*(routes\s*=|\[\[routes\]\])/m.test(prepared)) {
    throw new Error("CLOUD_RUNTIME_TRIGGER_CONFIG_ROUTE_REMAINS");
  }
  if (mode === "bootstrap") {
    if (
      prepared.includes(consumerHeader) ||
      prepared.includes(workflowHeader)
    ) {
      throw new Error("CLOUD_RUNTIME_BOOTSTRAP_TRIGGER_REMAINS");
    }
  }
  if (mode === "workflowHandoff") {
    if (
      prepared.includes(consumerHeader) ||
      count(prepared, workflowHeader) !== 1
    ) {
      throw new Error("CLOUD_RUNTIME_WORKFLOW_HANDOFF_TRIGGER_INVALID");
    }
  }
  if (mode === "candidateRecovery") {
    if (
      count(prepared, `name = "${candidateService}"`) !== 1 ||
      prepared.includes(consumerHeader) ||
      count(prepared, workflowHeader) !== 1
    ) {
      throw new Error("CLOUD_RUNTIME_CANDIDATE_RECOVERY_CONFIG_INVALID");
    }
  }
  return prepared;
}

export function prepareCloudRuntimeTriggerConfigFile({ source, output, mode }) {
  const sourcePath = resolve(source);
  const outputPath = resolve(output);
  if (dirname(sourcePath) !== dirname(outputPath)) {
    throw new Error("CLOUD_RUNTIME_TRIGGER_CONFIG_OUTPUT_DIRECTORY_INVALID");
  }
  const prepared = prepareCloudRuntimeTriggerConfig({
    content: readFileSync(sourcePath, "utf8"),
    mode,
  });
  writeFileSync(outputPath, prepared, "utf8");
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const [source, output, mode] = process.argv.slice(2);
  prepareCloudRuntimeTriggerConfigFile({ source, output, mode });
  console.log("CLOUD_RUNTIME_TRIGGER_CONFIG=PASS");
}
