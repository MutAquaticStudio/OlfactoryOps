import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

export const RC12_SHA = "331c1a6054fe1420b063a2e1fe9e5cef4f043ff8";
export const CANDIDATE_WORKER_NAME = "olfactoryops-v2-cloud-runtime-production-candidate";
export const CANDIDATE_WORKFLOW_NAME = "olfactoryops-v2-scientific-production-candidate";
export const PRODUCTION_WORKFLOW_NAME = "olfactoryops-v2-scientific-production";
export const PRODUCTION_QUEUE_NAMES = [
  "olfactoryops-v2-scientific-production",
  "olfactoryops-v2-rag-production",
  "olfactoryops-v2-notifications-production",
];

function requiredText(value, label) {
  assert.equal(typeof value, "string", label + " must be a string");
  assert.ok(value.length > 0, label + " must be non-empty");
  return value;
}

function requiredString(value, label) {
  const text = requiredText(value, label);
  assert.ok(!/[\r\n]/.test(text), label + " must be a single-line non-empty value");
  return text;
}

function replaceRequired(contents, before, after, label) {
  assert.ok(contents.includes(before), label + " source marker is missing");
  return contents.replace(before, after);
}

function removeQueueDeclarations(contents) {
  const result = [];
  let skipping = false;

  for (const line of contents.split(/\r?\n/)) {
    if (line.startsWith("[[")) {
      skipping = line === "[[queues.producers]]" || line === "[[queues.consumers]]";
    }
    if (!skipping) result.push(line);
  }

  return result.join("\n");
}

export function validateRc12CandidateCloudRuntimeConfig(contents, { releaseSha }) {
  const source = requiredText(contents, "candidate config");
  assert.equal(releaseSha, RC12_SHA, "candidate config must use the immutable RC12 source");
  assert.ok(!source.includes("REPLACE_WITH_"), "candidate config contains unresolved placeholders");
  assert.match(source, new RegExp('^name = "' + CANDIDATE_WORKER_NAME + '"$', "m"), "candidate Worker name is not isolated");
  assert.match(source, new RegExp('^name = "' + CANDIDATE_WORKFLOW_NAME + '"$', "m"), "candidate Workflow name is not isolated");
  assert.doesNotMatch(source, new RegExp('^name = "' + PRODUCTION_WORKFLOW_NAME + '"$', "m"), "candidate config retains production Workflow ownership");
  assert.ok(!/\[\[queues\.(?:producers|consumers)\]\]/.test(source), "candidate config retains queue declarations");
  for (const queueName of PRODUCTION_QUEUE_NAMES) {
    assert.doesNotMatch(source, new RegExp('^(?:queue|dead_letter_queue) = "' + queueName + '"$', "m"), "candidate config retains a production queue binding");
  }
  assert.match(source, /^workers_dev = false$/m, "candidate must not have a public workers.dev surface");
  assert.doesNotMatch(source, /^\s*routes?\s*=/m, "candidate config must not contain public routes");
  assert.doesNotMatch(source, /^\s*custom_domain\s*=/m, "candidate config must not contain public custom domains");
  assert.match(source, new RegExp('^RELEASE_GIT_SHA = "' + RC12_SHA + '"$', "m"), "candidate release SHA is not immutable RC12");
  for (const requiredBinding of [
    "HYPERDRIVE",
    "R2_ARTIFACTS",
    "MATERIAL_EVIDENCE_VECTORS",
    "ScientificFeatureContainer",
    "ScientificModelContainer",
  ]) {
    assert.ok(source.includes(requiredBinding), "candidate config is missing shared binding " + requiredBinding);
  }

  return [
    "CANDIDATE_WORKER_NAME_ISOLATED=PASS",
    "CANDIDATE_WORKFLOW_NAME_ISOLATED=PASS",
    "PRODUCTION_WORKFLOW_NAME_ABSENT_FROM_CANDIDATE_OWNERSHIP=PASS",
    "PRODUCTION_QUEUE_CONSUMERS_ABSENT=PASS",
    "PUBLIC_ROUTES_ABSENT=PASS",
    "PUBLIC_CUSTOM_DOMAINS_ABSENT=PASS",
    "RC12_SHA_UNCHANGED=PASS",
    "CLOUD_RUNTIME_CANDIDATE_ISOLATION=PASS",
  ];
}

export function renderRc12CandidateCloudRuntimeConfig(template, values) {
  const releaseSha = requiredString(values.releaseSha, "release SHA");
  assert.equal(releaseSha, RC12_SHA, "candidate render must use immutable RC12");

  let contents = requiredText(template, "Cloud Runtime template");
  contents = replaceRequired(
    contents,
    'name = "olfactoryops-v2-cloud-runtime-production"',
    'name = "' + CANDIDATE_WORKER_NAME + '"',
    "candidate Worker",
  );
  contents = replaceRequired(
    contents,
    'name = "' + PRODUCTION_WORKFLOW_NAME + '"',
    'name = "' + CANDIDATE_WORKFLOW_NAME + '"',
    "candidate Workflow",
  );
  contents = replaceRequired(contents, "REPLACE_WITH_GIT_SHA", releaseSha, "release SHA");
  contents = replaceRequired(contents, "REPLACE_WITH_HYPERDRIVE_ID", requiredString(values.hyperdriveId, "Hyperdrive ID"), "Hyperdrive ID");
  contents = replaceRequired(contents, "REPLACE_WITH_FEATURE_IMAGE_DIGEST", requiredString(values.featureImageDigest, "feature image digest"), "feature image digest");
  contents = replaceRequired(contents, "REPLACE_WITH_FEATURE_IMAGE", requiredString(values.featureImage, "feature image"), "feature image");
  contents = replaceRequired(contents, "REPLACE_WITH_MODEL_IMAGE", requiredString(values.modelImage, "model image"), "model image");
  contents = removeQueueDeclarations(contents);
  validateRc12CandidateCloudRuntimeConfig(contents, { releaseSha });
  return contents;
}

function optionValue(args, option) {
  const index = args.indexOf(option);
  return index === -1 ? undefined : args[index + 1];
}

function emit(lines) {
  for (const line of lines) console.log(line);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  const [mode, ...args] = process.argv.slice(2);
  const releaseSha = process.env.RELEASE_SHA;

  if (mode === "render") {
    const templatePath = optionValue(args, "--template");
    const outputPath = optionValue(args, "--output");
    assert.ok(templatePath && outputPath, "render requires --template and --output");
    const rendered = renderRc12CandidateCloudRuntimeConfig(readFileSync(templatePath, "utf8"), {
      releaseSha,
      hyperdriveId: process.env.PRODUCTION_HYPERDRIVE_ID,
      featureImage: process.env.PRODUCTION_SCIENTIFIC_FEATURE_IMAGE,
      modelImage: process.env.PRODUCTION_SCIENTIFIC_MODEL_IMAGE,
      featureImageDigest: process.env.PRODUCTION_SCIENTIFIC_FEATURE_IMAGE_DIGEST,
      modelImageDigest: process.env.PRODUCTION_SCIENTIFIC_MODEL_IMAGE_DIGEST,
    });
    writeFileSync(outputPath, rendered);
    emit(validateRc12CandidateCloudRuntimeConfig(rendered, { releaseSha }));
  } else if (mode === "verify") {
    const configPath = optionValue(args, "--config");
    assert.ok(configPath, "verify requires --config");
    emit(validateRc12CandidateCloudRuntimeConfig(readFileSync(configPath, "utf8"), { releaseSha }));
  } else {
    throw new Error("usage: render|verify --config path");
  }
}
