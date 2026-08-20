import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const productionCloudRuntime =
  "olfactoryops-v2-cloud-runtime-production";
export const candidateCloudRuntime =
  "olfactoryops-v2-cloud-runtime-production-candidate";

const productionZone = "labofscents.org";
const workflowName = "olfactoryops-v2-scientific-production";
const queueSpecs = [
  {
    queue: "olfactoryops-v2-scientific-production",
    deadLetterQueue: "olfactoryops-v2-scientific-dlq-production",
  },
  {
    queue: "olfactoryops-v2-rag-production",
    deadLetterQueue: "olfactoryops-v2-rag-dlq-production",
  },
  {
    queue: "olfactoryops-v2-notifications-production",
    deadLetterQueue: "olfactoryops-v2-notifications-dlq-production",
  },
];
const queueBindings = [
  "SCIENTIFIC_JOBS",
  "RAG_INGESTION_JOBS",
  "NOTIFICATION_DELIVERY_JOBS",
];
const apiBase = "https://api.cloudflare.com/client/v4";
const opaqueIdentifier = /^[A-Za-z0-9_-]{8,128}$/;
const exactSha = /^[0-9a-f]{40}$/;
const settingKeys = [
  "batch_size",
  "max_retries",
  "max_wait_time_ms",
  "max_concurrency",
  "retry_delay",
];

function safeOutput(line, emit) {
  emit(line);
}

function writeOutput(name, value, environment) {
  if (!/^[a-z_]+$/.test(name) || !/^[A-Z_]+$/.test(value)) return;
  const output = environment.GITHUB_OUTPUT;
  if (typeof output !== "string" || output.length === 0) return;
  appendFileSync(output, `${name}=${value}\n`, "utf8");
}

function validContext(environment) {
  return Boolean(
    opaqueIdentifier.test(environment.CLOUDFLARE_ACCOUNT_ID ?? "") &&
    typeof environment.CLOUDFLARE_API_TOKEN === "string" &&
    environment.CLOUDFLARE_API_TOKEN.length > 0 &&
    exactSha.test(environment.RELEASE_SHA ?? "") &&
    opaqueIdentifier.test(environment.PRODUCTION_HYPERDRIVE_ID ?? ""),
  );
}

function safeStatus(status) {
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : 0;
}

function safeErrorCode(payload) {
  if (!Array.isArray(payload?.errors)) return "NONE";
  const error = payload.errors.find(
    (item) => Number.isSafeInteger(item?.code) && item.code >= 1000,
  );
  return error ? String(error.code) : "NONE";
}

async function request({ token, path, method = "GET", body, fetchImpl }) {
  try {
    const response = await fetchImpl(`${apiBase}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    return {
      ok: Boolean(response?.ok && payload?.success === true),
      result: payload?.result,
      status: safeStatus(response?.status),
      cfErrorCode: safeErrorCode(payload),
    };
  } catch {
    return { ok: false, result: undefined, status: 0, cfErrorCode: "NONE" };
  }
}

function expectedPlainText(bindings, name, text) {
  const matches = bindings.filter(
    (binding) => binding?.type === "plain_text" && binding?.name === name,
  );
  return matches.length === 1 && matches[0]?.text === text;
}

function expectedBinding(bindings, name, type) {
  return (
    bindings.filter(
      (binding) => binding?.type === type && binding?.name === name,
    ).length === 1
  );
}

async function readWorker({
  account,
  token,
  service,
  releaseSha,
  hyperdriveId,
  fetchImpl,
}) {
  const deployments = await request({
    account,
    token,
    fetchImpl,
    path: `/accounts/${encodeURIComponent(account)}/workers/scripts/${encodeURIComponent(service)}/deployments`,
  });
  if (!deployments.ok || !Array.isArray(deployments.result?.deployments)) {
    return {
      state:
        deployments.status === 404 && deployments.cfErrorCode === "10007"
          ? "ABSENT"
          : "UNPROVEN",
    };
  }
  const deployment = deployments.result.deployments[0];
  const versions = Array.isArray(deployment?.versions)
    ? deployment.versions
    : [];
  const active =
    deployment?.strategy === "percentage" &&
    versions.length === 1 &&
    versions[0]?.percentage === 100 &&
    opaqueIdentifier.test(versions[0]?.version_id ?? "")
      ? versions[0].version_id
      : undefined;
  if (!active) return { state: "ACTIVE_VERSION_UNPROVEN" };
  const version = await request({
    account,
    token,
    fetchImpl,
    path: `/accounts/${encodeURIComponent(account)}/workers/scripts/${encodeURIComponent(service)}/versions/${encodeURIComponent(active)}`,
  });
  const bindings = Array.isArray(version.result?.resources?.bindings)
    ? version.result.resources.bindings
    : undefined;
  if (!version.ok || version.result?.id !== active || !bindings) {
    return { state: "VERSION_UNPROVEN" };
  }
  const exact =
    expectedPlainText(bindings, "RELEASE_GIT_SHA", releaseSha) &&
    expectedPlainText(bindings, "RELEASE_ENVIRONMENT", "production") &&
    bindings.filter(
      (binding) =>
        binding?.type === "hyperdrive" &&
        binding?.name === "HYPERDRIVE" &&
        binding?.id === hyperdriveId,
    ).length === 1 &&
    queueBindings.every((binding) =>
      expectedBinding(bindings, binding, "queue"),
    ) &&
    expectedBinding(bindings, "SCIENTIFIC_WORKFLOW", "workflow");
  return { state: exact ? "EXACT" : "CONFIGURATION_UNPROVEN" };
}

async function readWorkflowOwner({ account, token, fetchImpl }) {
  const response = await request({
    account,
    token,
    fetchImpl,
    path: `/accounts/${encodeURIComponent(account)}/workflows?search=${encodeURIComponent(workflowName)}&per_page=20&page=1`,
  });
  if (!response.ok || !Array.isArray(response.result)) return "UNPROVEN";
  const matches = response.result.filter(
    (workflow) => workflow?.name === workflowName,
  );
  if (matches.length === 0) return "NONE";
  if (matches.length !== 1) return "AMBIGUOUS";
  if (matches[0]?.script_name === candidateCloudRuntime) return "CANDIDATE";
  if (matches[0]?.script_name === productionCloudRuntime) return "PRODUCTION";
  return "OTHER";
}

function snapshotSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const settings = {};
  for (const key of settingKeys) {
    if (!(key in value)) continue;
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) return undefined;
    settings[key] = value[key];
  }
  return Number.isSafeInteger(settings.batch_size) &&
    Number.isSafeInteger(settings.max_retries)
    ? settings
    : undefined;
}

function workerName(consumer) {
  const value = consumer?.script_name ?? consumer?.script ?? consumer?.service;
  return value === productionCloudRuntime || value === candidateCloudRuntime
    ? value
    : undefined;
}

function sameSettings(left, right) {
  return settingKeys.every((key) => left?.[key] === right?.[key]);
}

function validSnapshot(snapshot) {
  return Boolean(
    snapshot &&
    opaqueIdentifier.test(snapshot.queueId ?? "") &&
    opaqueIdentifier.test(snapshot.consumerId ?? "") &&
    queueSpecs.some(
      (specification) => specification.queue === snapshot.queue,
    ) &&
    queueSpecs.some(
      (specification) =>
        specification.queue === snapshot.queue &&
        specification.deadLetterQueue === snapshot.deadLetterQueue,
    ) &&
    snapshotSettings(snapshot.settings),
  );
}

async function readQueueSnapshots({
  account,
  token,
  expectedOwner,
  fetchImpl,
}) {
  const queues = await request({
    account,
    token,
    fetchImpl,
    path: `/accounts/${encodeURIComponent(account)}/queues?per_page=100`,
  });
  if (!queues.ok || !Array.isArray(queues.result)) return undefined;
  const snapshots = [];
  for (const specification of queueSpecs) {
    const queue = queues.result.filter(
      (item) =>
        item?.queue_name === specification.queue &&
        opaqueIdentifier.test(item?.queue_id ?? ""),
    );
    if (queue.length !== 1) return undefined;
    const consumers = await request({
      account,
      token,
      fetchImpl,
      path: `/accounts/${encodeURIComponent(account)}/queues/${encodeURIComponent(queue[0].queue_id)}/consumers`,
    });
    if (
      !consumers.ok ||
      !Array.isArray(consumers.result) ||
      consumers.result.length !== 1
    ) {
      return undefined;
    }
    const consumer = consumers.result[0];
    const snapshot = {
      queue: specification.queue,
      queueId: queue[0].queue_id,
      consumerId: consumer?.consumer_id,
      owner: workerName(consumer),
      deadLetterQueue: consumer?.dead_letter_queue,
      settings: snapshotSettings(consumer?.settings),
    };
    if (
      !validSnapshot(snapshot) ||
      consumer?.type !== "worker" ||
      snapshot.owner !== expectedOwner ||
      snapshot.deadLetterQueue !== specification.deadLetterQueue
    ) {
      return undefined;
    }
    snapshots.push(snapshot);
  }
  return snapshots.length === queueSpecs.length ? snapshots : undefined;
}

async function readQueueState({ account, token, snapshot, fetchImpl }) {
  const consumers = await request({
    account,
    token,
    fetchImpl,
    path: `/accounts/${encodeURIComponent(account)}/queues/${encodeURIComponent(snapshot.queueId)}/consumers`,
  });
  if (!consumers.ok || !Array.isArray(consumers.result))
    return { state: "UNPROVEN" };
  if (consumers.result.length === 0) return { state: "ABSENT" };
  if (consumers.result.length !== 1) return { state: "AMBIGUOUS" };
  const consumer = consumers.result[0];
  const settings = snapshotSettings(consumer?.settings);
  const owner = workerName(consumer);
  if (!settings || !owner || consumer?.type !== "worker")
    return { state: "UNPROVEN" };
  return {
    state: owner === candidateCloudRuntime ? "CANDIDATE" : "PRODUCTION",
    consumerId: consumer?.consumer_id,
    owner,
    deadLetterQueue: consumer?.dead_letter_queue,
    settings,
  };
}

function matchesSnapshot(state, snapshot, owner) {
  return Boolean(
    state?.state ===
      (owner === candidateCloudRuntime ? "CANDIDATE" : "PRODUCTION") &&
    state.owner === owner &&
    state.deadLetterQueue === snapshot.deadLetterQueue &&
    sameSettings(state.settings, snapshot.settings),
  );
}

async function deleteConsumer({
  account,
  token,
  snapshot,
  consumerId,
  fetchImpl,
}) {
  await request({
    account,
    token,
    fetchImpl,
    method: "DELETE",
    path: `/accounts/${encodeURIComponent(account)}/queues/${encodeURIComponent(snapshot.queueId)}/consumers/${encodeURIComponent(consumerId)}`,
  });
  const state = await readQueueState({ account, token, snapshot, fetchImpl });
  return state.state === "ABSENT";
}

async function createConsumer({ account, token, snapshot, owner, fetchImpl }) {
  await request({
    account,
    token,
    fetchImpl,
    method: "POST",
    path: `/accounts/${encodeURIComponent(account)}/queues/${encodeURIComponent(snapshot.queueId)}/consumers`,
    body: {
      type: "worker",
      script_name: owner,
      dead_letter_queue: snapshot.deadLetterQueue,
      settings: snapshot.settings,
    },
  });
  const state = await readQueueState({ account, token, snapshot, fetchImpl });
  return matchesSnapshot(state, snapshot, owner);
}

async function restoreCandidateQueues({
  account,
  token,
  snapshots,
  fetchImpl,
}) {
  for (const snapshot of snapshots) {
    const current = await readQueueState({
      account,
      token,
      snapshot,
      fetchImpl,
    });
    if (matchesSnapshot(current, snapshot, candidateCloudRuntime)) continue;
    if (matchesSnapshot(current, snapshot, productionCloudRuntime)) {
      if (!opaqueIdentifier.test(current.consumerId ?? "")) return false;
      if (
        !(await deleteConsumer({
          account,
          token,
          snapshot,
          consumerId: current.consumerId,
          fetchImpl,
        }))
      ) {
        return false;
      }
    } else if (current.state !== "ABSENT") {
      return false;
    }
    if (
      !(await createConsumer({
        account,
        token,
        snapshot,
        owner: candidateCloudRuntime,
        fetchImpl,
      }))
    ) {
      return false;
    }
  }
  const restored = await readQueueSnapshots({
    account,
    token,
    expectedOwner: candidateCloudRuntime,
    fetchImpl,
  });
  return Boolean(
    restored &&
    restored.length === snapshots.length &&
    restored.every(
      (snapshot, index) =>
        snapshot.queue === snapshots[index].queue &&
        snapshot.deadLetterQueue === snapshots[index].deadLetterQueue &&
        sameSettings(snapshot.settings, snapshots[index].settings),
    ),
  );
}

async function privateProductionRuntime({ account, token, fetchImpl }) {
  const domains = await request({
    account,
    token,
    fetchImpl,
    path: `/accounts/${encodeURIComponent(account)}/workers/domains`,
  });
  if (!domains.ok || !Array.isArray(domains.result)) return false;
  if (
    domains.result.some((domain) => domain?.service === productionCloudRuntime)
  )
    return false;
  const zones = await request({
    account,
    token,
    fetchImpl,
    path: `/zones?name=${encodeURIComponent(productionZone)}&account.id=${encodeURIComponent(account)}&per_page=20`,
  });
  if (!zones.ok || !Array.isArray(zones.result)) return false;
  const zone = zones.result.filter(
    (item) =>
      item?.name === productionZone && opaqueIdentifier.test(item?.id ?? ""),
  );
  if (zone.length !== 1) return false;
  const routes = await request({
    account,
    token,
    fetchImpl,
    path: `/zones/${encodeURIComponent(zone[0].id)}/workers/routes`,
  });
  return Boolean(
    routes.ok &&
    Array.isArray(routes.result) &&
    !routes.result.some((route) => route?.script === productionCloudRuntime),
  );
}

async function collectState({ environment, fetchImpl }) {
  const account = environment.CLOUDFLARE_ACCOUNT_ID;
  const token = environment.CLOUDFLARE_API_TOKEN;
  const releaseSha = environment.RELEASE_SHA;
  const hyperdriveId = environment.PRODUCTION_HYPERDRIVE_ID;
  const [
    production,
    candidate,
    workflowOwner,
    candidateQueues,
    privateRuntime,
  ] = await Promise.all([
    readWorker({
      account,
      token,
      service: productionCloudRuntime,
      releaseSha,
      hyperdriveId,
      fetchImpl,
    }),
    readWorker({
      account,
      token,
      service: candidateCloudRuntime,
      releaseSha,
      hyperdriveId,
      fetchImpl,
    }),
    readWorkflowOwner({ account, token, fetchImpl }),
    readQueueSnapshots({
      account,
      token,
      expectedOwner: candidateCloudRuntime,
      fetchImpl,
    }),
    privateProductionRuntime({ account, token, fetchImpl }),
  ]);
  return {
    production,
    candidate,
    workflowOwner,
    candidateQueues,
    privateRuntime,
  };
}

function preflightPass(state) {
  return Boolean(
    state.candidate.state === "EXACT" &&
    (state.production.state === "ABSENT" ||
      state.production.state === "EXACT") &&
    (state.workflowOwner === "CANDIDATE" ||
      state.workflowOwner === "PRODUCTION") &&
    Array.isArray(state.candidateQueues) &&
    state.privateRuntime,
  );
}

function emitPreflight(state, environment, emit) {
  const productionState =
    state.production.state === "ABSENT" ? "ABSENT" : "PRESENT";
  const initialWorkflowOwner = state.workflowOwner;
  if (preflightPass(state)) {
    safeOutput("CLOUD_RUNTIME_TRIGGER_PREFLIGHT=PASS", emit);
    safeOutput(`CLOUD_RUNTIME_PRODUCTION_RUNTIME=${productionState}`, emit);
    safeOutput(
      `CLOUD_RUNTIME_INITIAL_WORKFLOW_OWNER=${initialWorkflowOwner}`,
      emit,
    );
    return { pass: true, productionState, initialWorkflowOwner };
  }
  safeOutput("CLOUD_RUNTIME_TRIGGER_PREFLIGHT=FAIL", emit);
  safeOutput("CLOUD_RUNTIME_TRIGGER_FAILURE=STATE_UNPROVEN", emit);
  return {
    pass: false,
    productionState: "UNPROVEN",
    initialWorkflowOwner: "UNPROVEN",
  };
}

export async function inspectCloudRuntimeTriggerPreflight({
  environment = process.env,
  fetchImpl = fetch,
  emit = (line) => console.log(line),
} = {}) {
  if (!validContext(environment)) {
    safeOutput("CLOUD_RUNTIME_TRIGGER_PREFLIGHT=FAIL", emit);
    safeOutput("CLOUD_RUNTIME_TRIGGER_FAILURE=CONTEXT_INVALID", emit);
    return { pass: false };
  }
  return emitPreflight(
    await collectState({ environment, fetchImpl }),
    environment,
    emit,
  );
}

export async function handoffCloudRuntimeQueueConsumers({
  environment = process.env,
  fetchImpl = fetch,
  emit = (line) => console.log(line),
} = {}) {
  if (!validContext(environment)) {
    safeOutput("CLOUD_RUNTIME_QUEUE_HANDOFF=FAIL", emit);
    safeOutput("CLOUD_RUNTIME_QUEUE_HANDOFF_RECOVERY=NOT_ATTEMPTED", emit);
    return { pass: false };
  }
  const state = await collectState({ environment, fetchImpl });
  if (
    state.production.state !== "EXACT" ||
    state.candidate.state !== "EXACT" ||
    state.workflowOwner !== "PRODUCTION" ||
    !state.privateRuntime ||
    !Array.isArray(state.candidateQueues)
  ) {
    safeOutput("CLOUD_RUNTIME_QUEUE_HANDOFF=FAIL", emit);
    safeOutput("CLOUD_RUNTIME_QUEUE_HANDOFF_RECOVERY=NOT_ATTEMPTED", emit);
    return { pass: false };
  }
  const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } =
    environment;
  const snapshots = state.candidateQueues;
  for (const snapshot of snapshots) {
    if (
      !(await deleteConsumer({
        account,
        token,
        snapshot,
        consumerId: snapshot.consumerId,
        fetchImpl,
      }))
    ) {
      const recovered = await restoreCandidateQueues({
        account,
        token,
        snapshots,
        fetchImpl,
      });
      safeOutput("CLOUD_RUNTIME_QUEUE_HANDOFF=FAIL", emit);
      safeOutput(
        `CLOUD_RUNTIME_QUEUE_HANDOFF_RECOVERY=${recovered ? "PASS" : "FAIL"}`,
        emit,
      );
      return { pass: false, recovered };
    }
    if (
      !(await createConsumer({
        account,
        token,
        snapshot,
        owner: productionCloudRuntime,
        fetchImpl,
      }))
    ) {
      const recovered = await restoreCandidateQueues({
        account,
        token,
        snapshots,
        fetchImpl,
      });
      safeOutput("CLOUD_RUNTIME_QUEUE_HANDOFF=FAIL", emit);
      safeOutput(
        `CLOUD_RUNTIME_QUEUE_HANDOFF_RECOVERY=${recovered ? "PASS" : "FAIL"}`,
        emit,
      );
      return { pass: false, recovered };
    }
  }
  const finalState = await collectState({ environment, fetchImpl });
  const productionQueues = await readQueueSnapshots({
    account,
    token,
    expectedOwner: productionCloudRuntime,
    fetchImpl,
  });
  const handoffPass = Boolean(
    finalState.production.state === "EXACT" &&
    finalState.candidate.state === "EXACT" &&
    finalState.workflowOwner === "PRODUCTION" &&
    finalState.privateRuntime &&
    productionQueues &&
    productionQueues.every(
      (snapshot, index) =>
        snapshot.queue === snapshots[index].queue &&
        snapshot.deadLetterQueue === snapshots[index].deadLetterQueue &&
        sameSettings(snapshot.settings, snapshots[index].settings),
    ),
  );
  if (!handoffPass) {
    const recovered = await restoreCandidateQueues({
      account,
      token,
      snapshots,
      fetchImpl,
    });
    safeOutput("CLOUD_RUNTIME_QUEUE_HANDOFF=FAIL", emit);
    safeOutput(
      `CLOUD_RUNTIME_QUEUE_HANDOFF_RECOVERY=${recovered ? "PASS" : "FAIL"}`,
      emit,
    );
    return { pass: false, recovered };
  }
  safeOutput("CLOUD_RUNTIME_QUEUE_HANDOFF=PASS", emit);
  safeOutput("CLOUD_RUNTIME_QUEUE_HANDOFF_RECOVERY=NOT_NEEDED", emit);
  return { pass: true };
}

export async function verifyCloudRuntimeTriggerPostflight({
  environment = process.env,
  fetchImpl = fetch,
  emit = (line) => console.log(line),
  expectedWorkflowOwner = "PRODUCTION",
  expectedQueueOwner = productionCloudRuntime,
} = {}) {
  if (!validContext(environment)) {
    safeOutput("CLOUD_RUNTIME_TRIGGER_POSTFLIGHT=FAIL", emit);
    return { pass: false };
  }
  const state = await collectState({ environment, fetchImpl });
  const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } =
    environment;
  const queues = await readQueueSnapshots({
    account,
    token,
    expectedOwner: expectedQueueOwner,
    fetchImpl,
  });
  const pass = Boolean(
    state.production.state === "EXACT" &&
    state.candidate.state === "EXACT" &&
    state.workflowOwner === expectedWorkflowOwner &&
    state.privateRuntime &&
    queues,
  );
  safeOutput(
    `CLOUD_RUNTIME_TRIGGER_POSTFLIGHT=${pass ? "PASS" : "FAIL"}`,
    emit,
  );
  return { pass };
}

async function main() {
  const [mode] = process.argv.slice(2);
  let result;
  if (mode === "preflight") {
    result = await inspectCloudRuntimeTriggerPreflight();
    if (result.pass) {
      writeOutput(
        "production_runtime_state",
        result.productionState,
        process.env,
      );
      writeOutput(
        "initial_workflow_owner",
        result.initialWorkflowOwner,
        process.env,
      );
    }
  } else if (mode === "handoff") {
    result = await handoffCloudRuntimeQueueConsumers();
  } else if (mode === "postflight") {
    result = await verifyCloudRuntimeTriggerPostflight();
  } else if (mode === "candidate-recovery") {
    result = await verifyCloudRuntimeTriggerPostflight({
      expectedWorkflowOwner: "CANDIDATE",
      expectedQueueOwner: candidateCloudRuntime,
    });
  } else {
    safeOutput("CLOUD_RUNTIME_TRIGGER_OPERATION=FAIL", (line) =>
      console.log(line),
    );
    result = { pass: false };
  }
  if (!result.pass) process.exitCode = 1;
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
