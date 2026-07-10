import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const distRoot = path.resolve('dist')
const forbiddenPatterns = [
  { label: 'DATABASE_URL', pattern: /DATABASE_URL/i },
  { label: 'Postgres connection string', pattern: /postgres(?:ql)?:\/\//i },
  { label: 'Database connection string', pattern: /\b(?:mysql|mongodb|redis):\/\//i },
  { label: 'Prisma client code', pattern: /(?:PrismaClient|@prisma\/client)/i },
  { label: 'Previous local DB credential', pattern: /olfactoryops:olfactoryops/i },
  { label: 'Previous tenant email seed', pattern: /(?:owner|lab|viewer|finance|inventory)@noxel\.is/i },
  { label: 'Previous API key seed', pattern: /(?:KEY-PRIMARY|Production integration)/i },
  { label: 'Previous order/customer seed', pattern: /(?:CUS-MAISON|SO-2026-092)/i },
]

function listFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry)
    return statSync(fullPath).isDirectory() ? listFiles(fullPath) : [fullPath]
  })
}

if (!existsSync(distRoot)) {
  console.error('dist directory is missing. Run vite build before scanning the client bundle.')
  process.exit(1)
}

const findings = []
for (const filePath of listFiles(distRoot)) {
  const content = readFileSync(filePath, 'utf8')
  for (const { label, pattern } of forbiddenPatterns) {
    if (pattern.test(content)) {
      findings.push(`${label}: ${path.relative(process.cwd(), filePath)}`)
    }
  }
}

if (findings.length > 0) {
  console.error('Client bundle secret scan failed:')
  for (const finding of findings) {
    console.error(`- ${finding}`)
  }
  process.exit(1)
}

console.log('Client bundle secret scan passed.')
