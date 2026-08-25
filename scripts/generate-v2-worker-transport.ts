import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import ts from 'typescript'

type SourceDefinition = { input: string; output: string; key: string; controller: string }
type Parameter = { index: number; source: 'REQUEST' | 'RESPONSE' | 'BODY' | 'QUERY' | 'PARAM' | 'HEADER'; name?: string }
type Route = { controller: string; handler: string; method: string; path: string; parameters: Parameter[] }

const root = process.cwd()
const routesDirectory = join(root, 'server', 'src', 'routes')
const outputManifest = join(root, 'worker', 'v2-api', 'generated-route-specs.ts')
const outputDocumentation = join(root, 'docs', 'v2', 'cloudflare', 'V2_WORKER_ROUTE_MATRIX.md')
const controllers: SourceDefinition[] = [
  { input: 'v2-platform.controller.ts', output: 'v2-platform.worker.ts', key: 'platform', controller: 'V2PlatformController' },
  { input: 'v2-platform-admin.controller.ts', output: 'v2-platform-admin.worker.ts', key: 'platformAdmin', controller: 'V2PlatformAdminController' },
  { input: 'v2-lab-operations.controller.ts', output: 'v2-lab-operations.worker.ts', key: 'lab', controller: 'V2LabOperationsController' },
  { input: 'v2-scientific.controller.ts', output: 'v2-scientific.worker.ts', key: 'scientific', controller: 'V2ScientificController' },
  { input: 'v2-material-intelligence.controller.ts', output: 'v2-material-intelligence.worker.ts', key: 'materialIntelligence', controller: 'V2MaterialIntelligenceController' },
  { input: 'v2-model-dataset.controller.ts', output: 'v2-model-dataset.worker.ts', key: 'modelDataset', controller: 'V2ModelDatasetController' },
  { input: 'v2-olfactory-intelligence.controller.ts', output: 'v2-olfactory-intelligence.worker.ts', key: 'olfactory', controller: 'V2OlfactoryIntelligenceController' },
  { input: 'v2-consumer-intelligence.controller.ts', output: 'v2-consumer-intelligence.worker.ts', key: 'consumer', controller: 'V2ConsumerIntelligenceController' },
  { input: 'v2-formula-intelligence.controller.ts', output: 'v2-formula-intelligence.worker.ts', key: 'formula', controller: 'V2FormulaIntelligenceController' },
  { input: 'v2-material-evidence.controller.ts', output: 'v2-material-evidence.worker.ts', key: 'evidence', controller: 'V2MaterialEvidenceController' },
  { input: 'v2-agent-runtime.controller.ts', output: 'v2-agent-runtime.worker.ts', key: 'agentRuns', controller: 'V2AgentRuntimeController' },
  { input: 'v2-agent-runtime.controller.ts', output: 'v2-agent-runtime.worker.ts', key: 'agentCatalog', controller: 'V2AgentRuntimeCatalogController' },
]

const methods = new Map([['Get', 'GET'], ['Post', 'POST'], ['Put', 'PUT'], ['Patch', 'PATCH'], ['Delete', 'DELETE']])
const parameterSources = new Map([
  ['Req', 'REQUEST'], ['Res', 'RESPONSE'], ['Body', 'BODY'], ['Query', 'QUERY'], ['Param', 'PARAM'], ['Headers', 'HEADER'],
] as const)

function decoratorsOf(node: ts.Node) {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : []
}

function callInfo(decorator: ts.Decorator) {
  const expression = decorator.expression
  if (!ts.isCallExpression(expression)) return undefined
  if (!ts.isIdentifier(expression.expression)) return undefined
  const first = expression.arguments[0]
  return { name: expression.expression.text, first: first && ts.isStringLiteral(first) ? first.text : undefined }
}

function routePath(base: string, local: string | undefined) {
  return '/' + [base, local ?? ''].flatMap((value) => value.split('/').filter(Boolean)).join('/')
}

function routesFrom(source: ts.SourceFile, definition: SourceDefinition): Route[] {
  const target = source.statements.find((statement): statement is ts.ClassDeclaration => ts.isClassDeclaration(statement) && statement.name?.text === definition.controller)
  if (!target) throw new Error(`Controller ${definition.controller} was not found in ${definition.input}.`)
  const base = decoratorsOf(target).map(callInfo).find((info) => info?.name === 'Controller')?.first
  if (!base) throw new Error(`Controller ${definition.controller} has no Controller decorator.`)
  return target.members.flatMap((member) => {
    if (!ts.isMethodDeclaration(member) || !member.name || !ts.isIdentifier(member.name)) return []
    const methodDecorator = decoratorsOf(member).map(callInfo).find((info) => info && methods.has(info.name))
    if (!methodDecorator) return []
    const parameters = member.parameters.flatMap((parameter, index) => {
      const sourceInfo = decoratorsOf(parameter).map(callInfo).find((info) => info && parameterSources.has(info.name))
      if (!sourceInfo) return []
      return [{ index, source: parameterSources.get(sourceInfo.name)!, ...(sourceInfo.first ? { name: sourceInfo.first } : {}) }]
    })
    const local = methodDecorator.first
    return [{ controller: definition.key, handler: member.name.text, method: methods.get(methodDecorator.name)!, path: routePath(base, local), parameters }]
  })
}

function workerControllerSource(source: string) {
  // Drop the Nest-only import and exception filters. The generated controller
  // remains a thin transport delegate whose original handler bodies still call
  // the shared Platform/domain services.
  let output = source.replace(/^import\s+\{[^\n]*\}\s+from\s+'@nestjs\/common'\r?\n/m, '')
  const sourceFile = ts.createSourceFile('controller.ts', output, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS)
  const ranges = sourceFile.statements
    .filter((statement): statement is ts.ClassDeclaration => ts.isClassDeclaration(statement) && Boolean(statement.name?.text.match(/ErrorFilter$/)))
    .map((statement) => {
      const decorators = decoratorsOf(statement)
      return { start: decorators[0]?.getFullStart() ?? statement.getFullStart(), end: statement.getEnd() }
    })
    .sort((left, right) => right.start - left.start)
  for (const range of ranges) output = output.slice(0, range.start) + output.slice(range.end)
  // All controller/parameter decorators are transport metadata only. Route
  // metadata is emitted separately below, so none needs to enter the Worker.
  output = output.replace(/@(Controller|UseFilters|Catch|Get|Post|Put|Patch|Delete|Req|Res|Body|Headers|Param|Query)\((?:[^()]|\([^()]*\))*\)\s*/g, '')
  return output.replace(/\n{3,}/g, '\n\n')
}

async function main() {
  const routeEntries: Route[] = []
  await mkdir(dirname(outputManifest), { recursive: true })
  const written = new Set<string>()
  for (const definition of controllers) {
    const input = join(routesDirectory, definition.input)
    const source = await readFile(input, 'utf8')
    const parsed = ts.createSourceFile(input, source, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS)
    routeEntries.push(...routesFrom(parsed, definition))
    if (!written.has(definition.output)) {
      const output = join(routesDirectory, definition.output)
      await writeFile(output, workerControllerSource(source), 'utf8')
      written.add(definition.output)
    }
  }
  const manifest = [
    "// Generated from the Phase 1-6 Nest controller metadata. Do not edit.",
    "export type GeneratedRouteSpec = { controller: string; handler: string; method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; parameters: Array<{ index: number; source: 'REQUEST' | 'RESPONSE' | 'BODY' | 'QUERY' | 'PARAM' | 'HEADER'; name?: string }> }",
    `export const generatedRouteSpecs: GeneratedRouteSpec[] = ${JSON.stringify(routeEntries, null, 2)} as const`,
    '',
  ].join('\n')
  await writeFile(outputManifest, manifest, 'utf8')
  const matrix = [
    '# V2 Staging Worker Route Matrix',
    '',
    'Generated from the active Phase 1-6 controller decorator metadata by `npm run generate:v2-worker-transport`.',
    'The Worker imports generated decorator-free controller delegates; all business logic remains in the shared V2 Platform and domain services.',
    '',
    '| Controller delegate | Method | Route |',
    '| --- | --- | --- |',
    ...routeEntries.map((route) => '| ' + route.controller + ' | ' + route.method + ' | `/api/v1' + route.path + '` |'),
    '',
    '## Deliberate exclusions',
    '',
    '- Agent event streaming is served by the Worker Web Streams transport. It replays the same persisted Agent events as the controller and does not create a second event store.',
    '- Phase 7+ Trial/Sensory, Production, Commerce, and Advanced routes remain outside the public staging cutover.',
    '- This matrix does not authorize a production deployment.',
    '',
  ].join('\n')
  await mkdir(dirname(outputDocumentation), { recursive: true })
  await writeFile(outputDocumentation, matrix, 'utf8')
  process.stdout.write(`V2 Worker transport generated: ${routeEntries.length} routes.\n`)
}

void main().catch(async (error) => {
  await rm(outputManifest, { force: true })
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
