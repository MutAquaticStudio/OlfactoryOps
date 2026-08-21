import { execFileSync } from 'node:child_process'

const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('npm_execpath is required to run the V2 role harness without a shell wrapper.')

const env = {
  ...process.env,
  NODE_ENV: 'test',
  V2_QA_ENVIRONMENT: 'test',
  V2_QA_DATABASE_URL: process.env.V2_QA_DATABASE_URL || 'postgresql://olfactoryops:olfactoryops@127.0.0.1:5432/olfactoryops',
  DATABASE_URL: process.env.V2_QA_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://olfactoryops:olfactoryops@127.0.0.1:5432/olfactoryops',
  V2_DATABASE_URL: process.env.V2_QA_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://olfactoryops:olfactoryops@127.0.0.1:5432/olfactoryops',
  PORT: '4000',
  HOST: '127.0.0.1',
  CORS_ORIGINS: 'http://127.0.0.1:4173',
  V2_E2E_API_PROXY: 'http://127.0.0.1:4000',
  VITE_API_BASE_URL: '/api/v1',
  V2_WORKSPACE_BASE_DOMAIN: 'olfactoryops.com',
  V2_SESSION_PEPPER: process.env.V2_SESSION_PEPPER || 'v2-e2e-session',
  V2_PASSWORD_PEPPER: process.env.V2_PASSWORD_PEPPER || 'v2-e2e-password',
  V2_QA_STRICT_CLEANUP: 'true',
}

const options = { cwd: process.cwd(), env, stdio: 'inherit' }
const runNpm = (args) => execFileSync(process.execPath, [npmCli, ...args], options)
runNpm(['run', 'build:api'])
runNpm(['run', 'build'])
runNpm(['run', 'v2:postgres:verify'])
runNpm(['exec', '--', 'playwright', 'test', '--config', 'playwright.v2.config.ts'])
