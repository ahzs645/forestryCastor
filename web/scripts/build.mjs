#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const forkRoot = path.dirname(webRoot)
const args = new Set(process.argv.slice(2))
for (const arg of args) if (!['--verify-only', '--prepare-only', '--skip-install', '--preview'].includes(arg)) throw new Error(`Unknown option ${arg}`)
const source = JSON.parse(await readFile(path.join(webRoot, 'source.json'), 'utf8'))
if (source.schema !== 'forestry-castor-browser-source-v1' || source.repository !== 'ahzs645/PGMaps' || !/^[a-f0-9]{40}$/.test(source.revision)) throw new Error('web/source.json must identify the reviewed PGMaps repository and exact commit SHA.')
if (!Array.isArray(source.files) || source.files.length === 0) throw new Error('The source lock must list every editable web/src file and its SHA-256.')

const allowedPath = (value) => typeof value === 'string' && !value.split('/').includes('..') && /^(src\/features\/forestry-castor\/[^\\]+|src\/pages\/forestry-castor\/[^\\]+|src\/pages\/DevForestryCastor\.tsx)$/.test(value)
async function listFiles(directory, prefix) {
  const output = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}/${entry.name}`
    if (entry.isSymbolicLink()) throw new Error(`Source mirrors must be ordinary files: ${relative}`)
    if (entry.isDirectory()) output.push(...await listFiles(path.join(directory, entry.name), relative))
    else if (entry.isFile()) output.push(relative)
  }
  return output.sort()
}
const mirrored = await listFiles(path.join(webRoot, 'src'), 'src')
const lockedPaths = source.files.map((file) => file.path).sort()
if (JSON.stringify(mirrored) !== JSON.stringify(lockedPaths)) throw new Error('web/src and source.json list different files. Review and update the source lock before building.')
for (const file of source.files) {
  if (!allowedPath(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error(`Invalid source-lock entry: ${file.path}`)
  const input = path.resolve(webRoot, file.path)
  if (!(await lstat(input)).isFile()) throw new Error(`Expected a regular source file: ${file.path}`)
  const bytes = await readFile(input)
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Source checksum differs for ${file.path}. Record the reviewed change in source.json.`)
}
console.log(`Verified ${source.files.length} editable source files against web/source.json.`)

function run(command, argv, cwd, capture = false) {
  const result = spawnSync(command, argv, { cwd, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', env: process.env })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${argv.join(' ')} failed${capture ? `: ${result.stderr}` : ''}`)
  return capture ? result.stdout.trim() : ''
}

if (args.has('--verify-only')) process.exit(0)
const suppliedHost = process.env.CASTOR_PGMAPS_CHECKOUT
const host = path.resolve(suppliedHost || path.join(webRoot, '.cache/PGMaps'))
if (!suppliedHost) {
  await mkdir(path.dirname(host), { recursive: true })
  let exists = true
  try { await lstat(host) } catch (error) { if (error.code === 'ENOENT') exists = false; else throw error }
  if (!exists) {
    run('git', ['clone', '--filter=blob:none', '--no-checkout', `https://github.com/${source.repository}.git`, host], webRoot)
    run('git', ['fetch', '--depth=1', 'origin', source.revision], host)
    run('git', ['checkout', '--detach', source.revision], host)
  }
}
const revision = run('git', ['rev-parse', 'HEAD'], host, true)
if (revision !== source.revision) throw new Error(`The PGMaps checkout is ${revision}; source.json requires ${source.revision}. Prepare the exact revision in a separate checkout.`)
if (path.resolve(run('git', ['rev-parse', '--show-toplevel'], host, true)) !== host) throw new Error('CASTOR_PGMAPS_CHECKOUT must be the root of its own PGMaps checkout.')
run('git', ['submodule', 'update', '--init', 'packages/geo-toolkit'], host)
if (!args.has('--skip-install')) run('npm', ['ci', '--ignore-scripts'], host)
run('npm', ['run', 'toolkit:build'], host)
for (const file of source.files) {
  const destination = path.resolve(host, file.path)
  if (!destination.startsWith(host + path.sep)) throw new Error('Source overlay escapes the PGMaps checkout.')
  await mkdir(path.dirname(destination), { recursive: true })
  await cp(path.join(webRoot, file.path), destination)
}
console.log(`Prepared the full browser workbench in ${host} at PGMaps ${revision}.`)
if (args.has('--prepare-only')) process.exit(0)

run('npx', ['tsc', '--noEmit', '-p', 'standalone/forestry-castor/tsconfig.json'], host)
run('npx', ['vite', 'build', '--config', 'vite.castor.config.ts', '--base', '/forestryCastor/'], host)
run('node', ['standalone/forestry-castor/verify-build.mjs', '/forestryCastor/'], host)
const built = path.join(host, 'standalone/forestry-castor/dist')
const manifestPath = path.join(built, 'source-manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
let forkRevision = null
try {
  if (path.resolve(run('git', ['rev-parse', '--show-toplevel'], forkRoot, true)) === forkRoot) forkRevision = run('git', ['rev-parse', 'HEAD'], forkRoot, true)
} catch { /* A downloaded source archive has no Git history. */ }
manifest.fork = { repository: 'https://github.com/ahzs645/forestryCastor', revision: forkRevision, overlayFiles: source.files, upstream: source.upstream }
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
await rm(path.join(webRoot, 'dist'), { recursive: true, force: true })
await cp(built, path.join(webRoot, 'dist'), { recursive: true, force: true })
console.log(`Built full forestryCastor browser application in ${path.join(webRoot, 'dist')}.`)
if (args.has('--preview')) run('npx', ['vite', 'preview', '--config', 'vite.castor.config.ts', '--base', '/forestryCastor/', '--host', '127.0.0.1', '--port', '42179'], host)
