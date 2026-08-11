import { readFileSync } from 'node:fs'

const logPath = process.argv[2]
if (!logPath) throw new Error('WORKER_TAIL_DIAGNOSTIC=FAIL a tail log path is required')

const contents = readFileSync(logPath, 'utf8')
const codes = [...contents.matchAll(/"event"\s*:\s*"v2_platform_runtime_failure"\s*,\s*"code"\s*:\s*"([A-Z0-9_]{3,96})"/g)]
  .map((match) => match[1])

console.log(JSON.stringify({
  workerTailDiagnostic: codes.length ? 'PASS' : 'NO_SAFE_RUNTIME_CODE',
  platformRuntimeFailureCodes: [...new Set(codes)],
}))
