var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/staging-feature-recovery.ts
var RECOVERY_PATH = "/recover";
var RECOVERY_WAIT_MS = 12e4;
var RECOVERY_POLL_MS = 5e3;
var TARGETS = [
  {
    name: "sciencejob_cdcc54472dad4869ac5ced448aa2d8f9",
    fullId: "a81ce16d83a0dc49ff25fc8befb815b1a587bbdf2013eb436ccde39abb67f94e"
  },
  {
    name: "sciencejob_b97a60d3aaab405f8e4612efb12e38bd",
    fullId: "d93296bfdb9e18b246708de0303f9b157e611855750e27dba4adbc4884ce699d"
  }
];
function safeJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
__name(safeJson, "safeJson");
function hiddenNotFound() {
  return safeJson({ code: "NOT_FOUND" }, 404);
}
__name(hiddenNotFound, "hiddenNotFound");
function isTerminal(state) {
  return state === "stopped" || state === "stopped_with_code";
}
__name(isTerminal, "isTerminal");
function isRecoverable(state) {
  return state === "running" || state === "healthy";
}
__name(isRecoverable, "isRecoverable");
function targetStub(env, target) {
  try {
    const named = env.SCIENTIFIC_FEATURE_CONTAINER.idFromName(target.name);
    const parsed = env.SCIENTIFIC_FEATURE_CONTAINER.idFromString(target.fullId);
    const identityMatch = named.toString() === target.fullId && named.equals(parsed);
    return identityMatch ? { identityMatch, control: env.SCIENTIFIC_FEATURE_CONTAINER.get(parsed) } : { identityMatch };
  } catch {
    return { identityMatch: false };
  }
}
__name(targetStub, "targetStub");
async function readState(env, target) {
  const stub = targetStub(env, target);
  if (!stub.identityMatch || !stub.control) return "unknown";
  try {
    return (await stub.control.getState()).status;
  } catch {
    const replacement = targetStub(env, target);
    if (!replacement.identityMatch || !replacement.control) return "unknown";
    try {
      return (await replacement.control.getState()).status;
    } catch {
      return "unknown";
    }
  }
}
__name(readState, "readState");
async function waitForTerminalState(env, target) {
  const deadline = Date.now() + RECOVERY_WAIT_MS;
  let state = await readState(env, target);
  while (!isTerminal(state) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, RECOVERY_POLL_MS));
    state = await readState(env, target);
  }
  return state;
}
__name(waitForTerminalState, "waitForTerminalState");
async function recoverTarget(env, target) {
  const initial = targetStub(env, target);
  const result = {
    identityMatch: initial.identityMatch,
    beforeState: "unknown",
    stopSent: false,
    destroySent: false,
    afterState: "unknown"
  };
  if (!initial.identityMatch || !initial.control) return result;
  result.beforeState = await readState(env, target);
  if (isTerminal(result.beforeState)) {
    result.afterState = result.beforeState;
    return result;
  }
  if (!isRecoverable(result.beforeState)) return result;
  try {
    await initial.control.stop();
    result.stopSent = true;
  } catch {
    result.afterState = await readState(env, target);
    return result;
  }
  result.afterState = await waitForTerminalState(env, target);
  if (isTerminal(result.afterState) || !isRecoverable(result.afterState)) return result;
  const escalation = targetStub(env, target);
  if (!escalation.identityMatch || !escalation.control) {
    result.afterState = "unknown";
    return result;
  }
  try {
    await escalation.control.destroy();
    result.destroySent = true;
  } catch {
    result.afterState = await readState(env, target);
    return result;
  }
  result.afterState = await waitForTerminalState(env, target);
  return result;
}
__name(recoverTarget, "recoverTarget");
function recoveryTargets() {
  return TARGETS;
}
__name(recoveryTargets, "recoveryTargets");
var staging_feature_recovery_default = {
  async fetch(request, env) {
    if (request.method !== "POST" || new URL(request.url).pathname !== RECOVERY_PATH) return hiddenNotFound();
    if (!env.RECOVERY_TOKEN || request.headers.get("authorization") !== `Bearer ${env.RECOVERY_TOKEN}`) return hiddenNotFound();
    const first = await recoverTarget(env, TARGETS[0]);
    const second = isTerminal(first.afterState) ? await recoverTarget(env, TARGETS[1]) : {
      identityMatch: false,
      beforeState: "not_attempted",
      stopSent: false,
      destroySent: false,
      afterState: "not_attempted"
    };
    return safeJson({
      target1IdentityMatch: first.identityMatch,
      target1BeforeState: first.beforeState,
      target1StopSent: first.stopSent,
      target1DestroySent: first.destroySent,
      target1AfterState: first.afterState,
      target2IdentityMatch: second.identityMatch,
      target2BeforeState: second.beforeState,
      target2StopSent: second.stopSent,
      target2DestroySent: second.destroySent,
      target2AfterState: second.afterState
    });
  }
};
export {
  staging_feature_recovery_default as default,
  recoveryTargets
};
//# sourceMappingURL=staging-feature-recovery.js.map
