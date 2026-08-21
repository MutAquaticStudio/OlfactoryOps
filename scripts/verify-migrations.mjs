import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const migrationsDirectory = resolve(root, 'migrations')
const files = (await readdir(migrationsDirectory)).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort()
if (files.length === 0) throw new Error('No D1 migrations found in migrations/')

const source = await readFile(resolve(root, 'src/data/release.ts'), 'utf8')
const migrationHead = source.match(/migrationHead:\s*'([^']+)'/)?.[1]
const actualHead = files.at(-1)?.slice(0, 4)
if (!migrationHead || migrationHead !== actualHead) {
  throw new Error(`Release migration head ${migrationHead ?? 'missing'} does not match repository head ${actualHead ?? 'missing'}`)
}

const numbers = files.map((file) => Number(file.slice(0, 4)))
for (let index = 1; index < numbers.length; index += 1) {
  if (numbers[index] !== numbers[index - 1] + 1) throw new Error(`D1 migration sequence has a gap before ${files[index]}`)
}
const contents = await Promise.all(files.map((file) => readFile(resolve(migrationsDirectory, file))))
const inventoryHash = createHash('sha256').update(Buffer.concat(contents)).digest('hex')
console.log(JSON.stringify({ migrationHead, count: files.length, inventoryHash, status: 'valid' }))
