import { describe, expect, it } from "vitest";

import {
  candidateCloudRuntime,
  handoffCloudRuntimeQueueConsumers,
  inspectCloudRuntimeTriggerPreflight,
  productionCloudRuntime,
  verifyCloudRuntimeTriggerPostflight,
} from "./handoff-v2-production-cloud-runtime-queue-consumers.mjs";

const releaseSha = "f".repeat(40);
const account = "a".repeat(32);
const hyperdrive = "b".repeat(32);
const queueNames = [
  [
    "olfactoryops-v2-scientific-production",
    "olfactoryops-v2-scientific-dlq-production",
  ],
  ["olfactoryops-v2-rag-production", "olfactoryops-v2-rag-dlq-production"],
  [
    "olfactoryops-v2-notifications-production",
    "olfactoryops-v2-notifications-dlq-production",
  ],
];

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status });
}

function createControlPlane({
  production = "present",
  workflowOwner = "production",
  failProductionAdd = false,
} = {}) {
  const state = {
    workflowOwner,
    failProductionAdd,
    methods: [],
    queues: new Map(
      queueNames.map(([name, deadLetterQueue], index) => [
        name,
        {
          id: `${index + 1}`.repeat(32),
          deadLetterQueue,
          owner: candidateCloudRuntime,
          consumerId: `${index + 4}`.repeat(32),
          settings: {
            batch_size: 10,
            max_retries: 3,
            max_wait_time_ms: 10_000,
            retry_delay: 0,
          },
        },
      ]),
    ),
  };
  const serviceVersion = (service) =>
    `${service === productionCloudRuntime ? "c" : "d"}`.repeat(32);
  const bindings = () => [
    { type: "plain_text", name: "RELEASE_GIT_SHA", text: releaseSha },
    { type: "plain_text", name: "RELEASE_ENVIRONMENT", text: "production" },
    { type: "hyperdrive", name: "HYPERDRIVE", id: hyperdrive },
    { type: "queue", name: "SCIENTIFIC_JOBS" },
    { type: "queue", name: "RAG_INGESTION_JOBS" },
    { type: "queue", name: "NOTIFICATION_DELIVERY_JOBS" },
    { type: "workflow", name: "SCIENTIFIC_WORKFLOW" },
  ];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    const path = url.pathname;
    state.methods.push(init.method ?? "GET");
    if (path === `/client/v4/accounts/${account}/queues`) {
      return response({
        success: true,
        result: [...state.queues.entries()].map(([queue_name, queue]) => ({
          queue_name,
          queue_id: queue.id,
        })),
      });
    }
    const queueMatch = path.match(
      new RegExp(
        `/client/v4/accounts/${account}/queues/([^/]+)/consumers(?:/([^/]+))?$`,
      ),
    );
    if (queueMatch) {
      const queue = [...state.queues.values()].find(
        (item) => item.id === queueMatch[1],
      );
      if (!queue)
        return response({ success: false, errors: [{ code: 10000 }] }, 404);
      if ((init.method ?? "GET") === "GET") {
        const result = queue.owner
          ? [
              {
                type: "worker",
                script_name: queue.owner,
                consumer_id: queue.consumerId,
                dead_letter_queue: queue.deadLetterQueue,
                settings: queue.settings,
              },
            ]
          : [];
        return response({ success: true, result });
      }
      if ((init.method ?? "GET") === "DELETE") {
        queue.owner = undefined;
        queue.consumerId = undefined;
        return response({ success: true, result: {} });
      }
      if ((init.method ?? "GET") === "POST") {
        const body = JSON.parse(init.body);
        if (
          body.script_name === productionCloudRuntime &&
          state.failProductionAdd
        ) {
          return response(
            {
              success: false,
              errors: [{ code: 9999, message: "redacted test error" }],
            },
            409,
          );
        }
        queue.owner = body.script_name;
        queue.deadLetterQueue = body.dead_letter_queue;
        queue.settings = body.settings;
        queue.consumerId =
          `${queue.id[0]}${body.script_name === productionCloudRuntime ? "e" : "f"}`.repeat(
            16,
          );
        return response({ success: true, result: {} });
      }
    }
    if (path === `/client/v4/accounts/${account}/workflows`) {
      return response({
        success: true,
        result: [
          {
            name: "olfactoryops-v2-scientific-production",
            script_name:
              state.workflowOwner === "production"
                ? productionCloudRuntime
                : candidateCloudRuntime,
          },
        ],
      });
    }
    const deploymentMatch = path.match(
      new RegExp(
        `/client/v4/accounts/${account}/workers/scripts/([^/]+)/deployments$`,
      ),
    );
    if (deploymentMatch) {
      const service = decodeURIComponent(deploymentMatch[1]);
      if (service === productionCloudRuntime && production === "absent") {
        return response({ success: false, errors: [{ code: 10007 }] }, 404);
      }
      return response({
        success: true,
        result: {
          deployments: [
            {
              strategy: "percentage",
              versions: [
                { version_id: serviceVersion(service), percentage: 100 },
              ],
            },
          ],
        },
      });
    }
    const versionMatch = path.match(
      new RegExp(
        `/client/v4/accounts/${account}/workers/scripts/([^/]+)/versions/([^/]+)$`,
      ),
    );
    if (versionMatch) {
      return response({
        success: true,
        result: { id: versionMatch[2], resources: { bindings: bindings() } },
      });
    }
    if (path === `/client/v4/accounts/${account}/workers/domains`) {
      return response({ success: true, result: [] });
    }
    if (path === "/client/v4/zones") {
      return response({
        success: true,
        result: [{ id: "z".repeat(32), name: "labofscents.org" }],
      });
    }
    if (path === `/client/v4/zones/${"z".repeat(32)}/workers/routes`) {
      return response({ success: true, result: [] });
    }
    throw new Error("unexpected mock request");
  };
  return { state, fetchImpl };
}

function environment() {
  return {
    CLOUDFLARE_ACCOUNT_ID: account,
    CLOUDFLARE_API_TOKEN: "diagnostic-token-not-emitted",
    RELEASE_SHA: releaseSha,
    PRODUCTION_HYPERDRIVE_ID: hyperdrive,
  };
}

describe("RC10 Cloud Runtime queue consumer handoff", () => {
  it("recognizes the existing partial deployment without exposing opaque state", async () => {
    const { fetchImpl } = createControlPlane();
    const output = [];

    const result = await inspectCloudRuntimeTriggerPreflight({
      environment: environment(),
      fetchImpl,
      emit: (...args) => output.push(args),
    });

    expect(result).toMatchObject({
      pass: true,
      productionState: "PRESENT",
      initialWorkflowOwner: "PRODUCTION",
    });
    expect(output).toEqual([
      ["CLOUD_RUNTIME_TRIGGER_PREFLIGHT=PASS"],
      ["CLOUD_RUNTIME_PRODUCTION_RUNTIME=PRESENT"],
      ["CLOUD_RUNTIME_INITIAL_WORKFLOW_OWNER=PRODUCTION"],
    ]);
    expect(JSON.stringify(output)).not.toContain(
      "diagnostic-token-not-emitted",
    );
    expect(JSON.stringify(output)).not.toContain(account);
  });

  it("moves each exact candidate consumer to production and preserves its settings", async () => {
    const { fetchImpl, state } = createControlPlane();
    const output = [];

    const result = await handoffCloudRuntimeQueueConsumers({
      environment: environment(),
      fetchImpl,
      emit: (line) => output.push(line),
    });

    expect(result).toEqual({ pass: true });
    expect(
      [...state.queues.values()].every(
        (queue) => queue.owner === productionCloudRuntime,
      ),
    ).toBe(true);
    expect(output).toEqual([
      "CLOUD_RUNTIME_QUEUE_HANDOFF=PASS",
      "CLOUD_RUNTIME_QUEUE_HANDOFF_RECOVERY=NOT_NEEDED",
    ]);
    const postflight = await verifyCloudRuntimeTriggerPostflight({
      environment: environment(),
      fetchImpl,
      emit: (line) => output.push(line),
    });
    expect(postflight).toEqual({ pass: true });
    expect(output.at(-1)).toBe("CLOUD_RUNTIME_TRIGGER_POSTFLIGHT=PASS");
  });

  it("restores every candidate consumer if an attach fails", async () => {
    const { fetchImpl, state } = createControlPlane({
      failProductionAdd: true,
    });
    const output = [];

    const result = await handoffCloudRuntimeQueueConsumers({
      environment: environment(),
      fetchImpl,
      emit: (line) => output.push(line),
    });

    expect(result).toEqual({ pass: false, recovered: true });
    expect(
      [...state.queues.values()].every(
        (queue) => queue.owner === candidateCloudRuntime,
      ),
    ).toBe(true);
    expect(output).toEqual([
      "CLOUD_RUNTIME_QUEUE_HANDOFF=FAIL",
      "CLOUD_RUNTIME_QUEUE_HANDOFF_RECOVERY=PASS",
    ]);
    expect(JSON.stringify(output)).not.toContain("redacted test error");
  });

  it("fails closed before queue mutation when the production runtime is not exact", async () => {
    const { fetchImpl, state } = createControlPlane({ production: "absent" });
    const output = [];

    const result = await handoffCloudRuntimeQueueConsumers({
      environment: environment(),
      fetchImpl,
      emit: (line) => output.push(line),
    });

    expect(result).toEqual({ pass: false });
    expect(state.methods.filter((method) => method !== "GET")).toEqual([]);
    expect(output).toEqual([
      "CLOUD_RUNTIME_QUEUE_HANDOFF=FAIL",
      "CLOUD_RUNTIME_QUEUE_HANDOFF_RECOVERY=NOT_ATTEMPTED",
    ]);
  });
});
