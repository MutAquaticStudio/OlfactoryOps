const RECOVERY_PATH = '/recover'
const RECOVERY_WAIT_MS = 120_000
const RECOVERY_POLL_MS = 5_000

const TARGETS = [
  {
    name: 'sciencejob_cdcc54472dad4869ac5ced448aa2d8f9',
    fullId: 'a81ce16d83a0dc49ff25fc8befb815b1a587bbdf2013eb436ccde39abb67f94e',
  },
  {
    name: 'sciencejob_b97a60d3aaab405f8e4612efb12e38bd',
    fullId: 'd93296bfdb9e18b246708de0303f9b157e611855750e27dba4adbc4884ce699d',
  },
] as const

type ContainerState = {
  status: 'running' | 'healthy' | 'stopping' | 'stopped' | 'stopped_with_code'
}

interface FeatureContainerControl extends Rpc.DurableObjectBranded {
  getState(): Promise<ContainerState>
  stop(): Promise<void>
  destroy(): Promise<void>
}

type RecoveryTarget = (typeof TARGETS)[number]
type SafeState = ContainerState['status'] | 'unknown' | 'not_attempted'

type TargetResult = {
  identityMatch: boolean
  beforeState: SafeState
  stopSent: boolean
  destroySent: boolean
  afterState: SafeState
}

type Env = {
  RECOVERY_TOKEN: string
  SCIENTIFIC_FEATURE_CONTAINER: DurableObjectNamespace<FeatureContainerControl>
}

function safeJson(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function hiddenNotFound(): Response {
  return safeJson({ code: 'NOT_FOUND' }, 404)
}

function isTerminal(state: SafeState): boolean {
  return state === 'stopped' || state === 'stopped_with_code'
}

function isRecoverable(state: SafeState): boolean {
  return state === 'running' || state === 'healthy'
}

function targetStub(env: Env, target: RecoveryTarget): { identityMatch: boolean; control?: FeatureContainerControl } {
  try {
    const named = env.SCIENTIFIC_FEATURE_CONTAINER.idFromName(target.name)
    const parsed = env.SCIENTIFIC_FEATURE_CONTAINER.idFromString(target.fullId)
    const identityMatch = named.toString() === target.fullId && named.equals(parsed)
    return identityMatch
      ? { identityMatch, control: env.SCIENTIFIC_FEATURE_CONTAINER.get(parsed) }
      : { identityMatch }
  } catch {
    return { identityMatch: false }
  }
}

async function readState(env: Env, target: RecoveryTarget): Promise<SafeState> {
  const stub = targetStub(env, target)
  if (!stub.identityMatch || !stub.control) return 'unknown'
  try {
    return (await stub.control.getState()).status
  } catch {
    // Recreate the stub once after an RPC exception, then fail closed.
    const replacement = targetStub(env, target)
    if (!replacement.identityMatch || !replacement.control) return 'unknown'
    try {
      return (await replacement.control.getState()).status
    } catch {
      return 'unknown'
    }
  }
}

async function waitForTerminalState(env: Env, target: RecoveryTarget): Promise<SafeState> {
  const deadline = Date.now() + RECOVERY_WAIT_MS
  let state = await readState(env, target)
  while (!isTerminal(state) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, RECOVERY_POLL_MS))
    state = await readState(env, target)
  }
  return state
}

async function recoverTarget(env: Env, target: RecoveryTarget): Promise<TargetResult> {
  const initial = targetStub(env, target)
  const result: TargetResult = {
    identityMatch: initial.identityMatch,
    beforeState: 'unknown',
    stopSent: false,
    destroySent: false,
    afterState: 'unknown',
  }
  if (!initial.identityMatch || !initial.control) return result

  result.beforeState = await readState(env, target)
  if (isTerminal(result.beforeState)) {
    result.afterState = result.beforeState
    return result
  }
  if (!isRecoverable(result.beforeState)) return result

  try {
    await initial.control.stop()
    result.stopSent = true
  } catch {
    result.afterState = await readState(env, target)
    return result
  }

  result.afterState = await waitForTerminalState(env, target)
  if (isTerminal(result.afterState) || !isRecoverable(result.afterState)) return result

  // A single destroy escalation is allowed only after the bounded graceful wait.
  const escalation = targetStub(env, target)
  if (!escalation.identityMatch || !escalation.control) {
    result.afterState = 'unknown'
    return result
  }
  try {
    await escalation.control.destroy()
    result.destroySent = true
  } catch {
    result.afterState = await readState(env, target)
    return result
  }
  result.afterState = await waitForTerminalState(env, target)
  return result
}

export function recoveryTargets(): readonly RecoveryTarget[] {
  return TARGETS
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST' || new URL(request.url).pathname !== RECOVERY_PATH) return hiddenNotFound()
    if (!env.RECOVERY_TOKEN || request.headers.get('authorization') !== `Bearer ${env.RECOVERY_TOKEN}`) return hiddenNotFound()

    const first = await recoverTarget(env, TARGETS[0])
    const second = isTerminal(first.afterState)
      ? await recoverTarget(env, TARGETS[1])
      : {
          identityMatch: false,
          beforeState: 'not_attempted' as const,
          stopSent: false,
          destroySent: false,
          afterState: 'not_attempted' as const,
        }

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
      target2AfterState: second.afterState,
    })
  },
} satisfies ExportedHandler<Env>
