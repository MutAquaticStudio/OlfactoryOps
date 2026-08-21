import { execFileSync } from 'node:child_process'

export default async function globalTeardown() {
  try { execFileSync(process.execPath, ['scripts/cleanup-v2-role-fixtures.mjs'], { cwd: process.cwd(), env: process.env, stdio: 'inherit' }) } catch (error) { console.error('V2 QA fixture cleanup failed; inspect the disposable database before reuse.'); if (process.env.V2_QA_STRICT_CLEANUP === 'true') throw error }
}
