import { execFileSync } from 'node:child_process'

export default async function globalSetup() {
  execFileSync(process.execPath, ['scripts/create-v2-role-fixtures.mjs'], { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
}
