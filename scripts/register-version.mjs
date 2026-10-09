import fs from 'node:fs'
import path from 'node:path'

function argsFrom(argv) {
  const result = {}

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]

    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(`Argumento inválido cerca de ${key ?? 'fin'}`)
    }

    result[key.slice(2)] = value
  }

  return result
}

const args = argsFrom(process.argv.slice(2))
const required = ['project', 'code', 'date', 'title', 'summary', 'commit', 'files', 'changes']

for (const key of required) {
  if (!args[key]?.trim()) throw new Error(`Falta --${key}`)
}

const target = path.join(
  path.resolve(args.project),
  'src',
  'admin',
  'versionHistory.ts',
)

let source = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n')
const marker = '  // VERSION_HISTORY_ENTRIES'

if (!source.includes(marker)) {
  throw new Error('No se encontró VERSION_HISTORY_ENTRIES')
}

const duplicate = new RegExp(`code:\\s*['"]${args.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`)
if (duplicate.test(source)) {
  throw new Error(`La versión ${args.code} ya está registrada.`)
}

const split = (value) =>
  value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)

const entry = {
  code: args.code,
  date: args.date,
  title: args.title,
  summary: args.summary,
  commit: args.commit,
  files: split(args.files),
  changes: split(args.changes),
}

const serialized = JSON.stringify(entry, null, 2)
  .split('\n')
  .map((line) => `  ${line}`)
  .join('\n')

source = source.replace(
  marker,
  `${marker}\n${serialized},`,
)

fs.writeFileSync(target, source, 'utf8')

console.log(`Versión ${args.code} registrada sobre ${args.commit.slice(0, 8)}.`)
