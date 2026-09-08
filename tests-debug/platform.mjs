// The platform-specific rows: the things that behave differently on Windows and on WSL and would
// otherwise be discovered by a user rather than by a test.
//
//   node tests-debug/platform.mjs production/dist/server.js
//
// Certification 7.7, 12.1, 12.2, 12.4, 12.5, 12.6 and 12.7.

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import readline from 'node:readline'

const SERVER = process.argv[2]
if (!SERVER) {
  console.error('usage: node tests-debug/platform.mjs <path to dist/server.js>')
  process.exit(2)
}

const windows = process.platform === 'win32'
const wsl =
  process.platform === 'linux' &&
  (() => {
    try {
      return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')
    } catch {
      return false
    }
  })()

console.log(`platform: ${windows ? 'win32' : wsl ? 'wsl' : process.platform}\n`)

const failures = []
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`)
}
const ensure = (label, condition, detail = '') => {
  if (!condition) failures.push(`${label}${detail ? `: ${detail}` : ''}`)
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${label}${condition ? '' : `  ${detail}`}`)
}
const skip = (label, why) => console.log(` --   ${label}  (${why})`)

const cleanup = []
function fixture(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix))
  cleanup.push(root)
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' })
  git('init', '--quiet')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'fixture')
  mkdirSync(join(root, '.githooks-empty'), { recursive: true })
  git('config', 'core.hooksPath', join(root, '.githooks-empty'))
  return { git, root }
}

/** One control plane, on one project, answering one question at a time. */
async function server(root, data) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: root }
  for (const key of Object.keys(env)) {
    if (key.startsWith('CLAUDE_PLUGIN_OPTION_')) delete env[key]
  }
  // Set after the inherited options are stripped, or the strip removes the isolation with them.
  env.CLAUDE_PLUGIN_OPTION_DATA_DIR = data
  const child = spawn(process.execPath, [SERVER], { env, stdio: ['pipe', 'pipe', 'inherit'] })
  const lines = readline.createInterface({ input: child.stdout })
  const queue = []
  const waiters = []
  lines.on('line', (line) => {
    const parsed = JSON.parse(line)
    const waiter = waiters.shift()
    if (waiter) waiter(parsed)
    else queue.push(parsed)
  })

  let id = 0
  const send = (name, args = {}) => {
    id += 1
    child.stdin.write(
      `${JSON.stringify({ id, jsonrpc: '2.0', method: 'tools/call', params: { arguments: args, name } })}\n`,
    )
    return new Promise((resolve) => {
      if (queue.length) resolve(queue.shift())
      else waiters.push(resolve)
    })
  }
  const call = async (name, args) => {
    const response = await send(name, args)
    const content = response.result?.content?.[0]?.text
    if (response.result?.isError) throw new Error(`refused: ${content}`)
    return JSON.parse(content)
  }
  const close = async () => {
    child.stdin.end()
    await new Promise((resolve) => child.on('close', resolve))
  }
  return { call, close }
}

// ---------------------------------------------------------------- 12.1: spaces in every path

console.log('paths containing spaces')
{
  const { git, root } = fixture('cycle plat form ')
  const data = mkdtempSync(join(tmpdir(), 'cycle data dir '))
  cleanup.push(data)

  mkdirSync(join(root, 'src dir'), { recursive: true })
  writeFileSync(join(root, 'src dir', 'a file.ts'), 'export const value = 1\n')
  writeFileSync(join(root, 'README.md'), '# fixture\n')
  git('add', '-A')
  git('commit', '--quiet', '-m', 'baseline')

  const { call, close } = await server(root, data)
  const doctor = (await call('doctor')).report
  ensure('the store opens under a path with spaces', doctor.store.mode === 'read_write')
  ensure('the data directory with spaces is writable', doctor.storage.writable === true)

  const index = await call('index_project')
  ensure('a file in a directory with spaces is indexed', index.updated > 0, JSON.stringify(index))

  writeFileSync(join(root, 'src dir', 'a file.ts'), 'export const value = 2\n')
  const started = await call('workflow', { operation: 'start', request: 'change the helper' })
  const frozen = await call('workflow', { operation: 'freeze_candidate', workflowId: started.workflowId })
  ensure('a candidate freezes with spaces in its paths', frozen.state === 'verification', JSON.stringify(frozen))
  await close()
}

// ---------------------------------------------------------------- 12.2: beyond 260 characters

console.log('\nlong paths')
if (!windows) {
  skip('paths exceeding 260 characters', 'a Windows-only limit')
} else {
  const { git, root } = fixture('cycle-long-')
  const data = mkdtempSync(join(tmpdir(), 'cycle-long-data-'))
  cleanup.push(data)

  // Deep rather than one enormous segment: every filesystem caps a single name, and the row is
  // about the total length.
  const deep = join(...Array.from({ length: 12 }, (_, index) => `directory-segment-${index}-padding`))
  mkdirSync(join(root, deep), { recursive: true })
  const file = join(deep, 'module.ts')
  writeFileSync(join(root, file), 'export const deep = true\n')
  writeFileSync(join(root, 'README.md'), '# fixture\n')
  ensure('the fixture really exceeds 260 characters', join(root, file).length > 260, `${join(root, file).length}`)
  git('add', '-A')
  git('commit', '--quiet', '-m', 'baseline')

  const { call, close } = await server(root, data)
  const index = await call('index_project')
  // Only the module: markdown carries no grammar, so it is tracked by digest and not parsed.
  ensure('a file beyond 260 characters is indexed', index.updated === 1, JSON.stringify(index))

  writeFileSync(join(root, file), 'export const deep = false\n')
  const started = await call('workflow', { operation: 'start', request: 'touch the deep module' })
  const frozen = await call('workflow', { operation: 'freeze_candidate', workflowId: started.workflowId })
  ensure('a long path freezes into a candidate', frozen.state === 'verification', JSON.stringify(frozen))
  await close()
}

// ---------------------------------------------------------------- 12.4: autocrlf and the digest

console.log('\nline endings')
{
  // One repository and one baseline, with the setting flipped between two freezes: the base
  // revision is part of the manifest, so two separate fixtures would differ for a reason that has
  // nothing to do with line endings.
  const { git, root } = fixture('cycle-crlf-')
  const data = mkdtempSync(join(tmpdir(), 'cycle-crlf-data-'))
  cleanup.push(data)

  git('config', 'core.autocrlf', 'false')
  writeFileSync(join(root, 'README.md'), '# fixture\n')
  git('add', '-A')
  git('commit', '--quiet', '-m', 'baseline')
  writeFileSync(join(root, 'module.ts'), 'export const a = 1\nexport const b = 2\n')

  const { call, close } = await server(root, data)
  const frozen = []
  for (const autocrlf of ['false', 'true']) {
    git('config', 'core.autocrlf', autocrlf)
    const started = await call('workflow', {
      operation: 'start',
      request: `add two constants (${autocrlf})`,
    })
    const candidate = await call('workflow', {
      operation: 'freeze_candidate',
      workflowId: started.workflowId,
    })
    frozen.push(candidate)
    await call('workflow', {
      confirm: true,
      controlOperation: 'cancel',
      operation: 'control',
      workflowId: started.workflowId,
    })
  }
  await close()

  check('both freezes sit on the same base revision', frozen[0].baseRevision, frozen[1].baseRevision)
  check('core.autocrlf does not change the candidate digest', frozen[0].candidateDigest, frozen[1].candidateDigest)
}

// ---------------------------------------------------------------- 7.7, 12.5, 12.6: the signing key

console.log('\nsigning key')
{
  const { git, root } = fixture('cycle-key-')
  const data = mkdtempSync(join(tmpdir(), 'cycle-key-data-'))
  cleanup.push(data)
  writeFileSync(join(root, 'README.md'), '# fixture\n')
  git('add', '-A')
  git('commit', '--quiet', '-m', 'baseline')

  const { call, close } = await server(root, data)
  // Cancelling anchors the chain with a signed checkpoint, which is what creates the key.
  const started = await call('workflow', { operation: 'start', request: 'anchor the chain' })
  await call('workflow', {
    confirm: true,
    controlOperation: 'cancel',
    operation: 'control',
    workflowId: started.workflowId,
  })
  await close()

  const found = readdirSync(data, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /key/iu.test(entry.name))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
  ensure('a signing key was created', found.length === 1, found.join(', '))

  const key = found[0]
  if (key === undefined) {
    skip('key permissions', 'no key to inspect')
  } else if (windows) {
    // Certification 12.5: on Windows the restriction is an ACL, and icacls is what reads it.
    const acl = execFileSync('icacls', [key], { encoding: 'utf8' })
    const entries = acl
      .split('\n')
      .slice(0, -3)
      .flatMap((line) => [...line.matchAll(/([^\s:]+\\[^\s:]+|[A-Z ]+ [A-Z]+):\(/gu)].map((m) => m[1]))
    ensure('the key ACL grants nobody but this account', entries.length <= 1, acl.trim())
    ensure('no inherited access remains', !/\(I\)/u.test(acl), acl.trim())
  } else {
    // Certification 12.6.
    const mode = statSync(key).mode & 0o777
    check('the key is readable only by its owner', mode.toString(8), '600')
  }

  ensure('the key is inside the data directory and nowhere else', key?.startsWith(data) === true, key)
}

// ---------------------------------------------------------------- 12.7: a Windows-mounted worktree

console.log('\nworktree on a Windows-mounted path')
if (!wsl) {
  skip('worktree on a Windows-mounted path', 'only meaningful from WSL')
} else if (!existsSync('/mnt/c')) {
  skip('worktree on a Windows-mounted path', 'no Windows mount to test against')
} else {
  // Discouraged, and correct anyway: the 9p mount is slow and its metadata is not Linux's, so this
  // is the arrangement most likely to produce a candidate that does not match what is on disk.
  const mounted = mkdtempSync('/mnt/c/Users/Public/cycle-mounted-')
  cleanup.push(mounted)
  const data = mkdtempSync(join(tmpdir(), 'cycle-mounted-data-'))
  cleanup.push(data)

  const git = (...args) => execFileSync('git', ['-C', mounted, ...args], { stdio: 'ignore' })
  git('init', '--quiet')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'fixture')
  git('config', 'core.autocrlf', 'false')
  mkdirSync(join(mounted, '.githooks-empty'), { recursive: true })
  git('config', 'core.hooksPath', join(mounted, '.githooks-empty'))
  writeFileSync(join(mounted, 'README.md'), '# fixture\n')
  git('add', '-A')
  git('commit', '--quiet', '-m', 'baseline')

  const bytes = 'export const value = 1\nexport const other = 2\n'
  mkdirSync(join(mounted, 'src'), { recursive: true })
  writeFileSync(join(mounted, 'src', 'module.ts'), bytes)

  const { call, close } = await server(mounted, data)
  const doctor = (await call('doctor')).report
  ensure('the store opens against a mounted worktree', doctor.store.mode === 'read_write')

  const index = await call('index_project')
  ensure('a mounted worktree indexes', index.updated === 1, JSON.stringify(index))

  const started = await call('workflow', { operation: 'start', request: 'add two constants' })
  const frozen = await call('workflow', {
    operation: 'freeze_candidate',
    workflowId: started.workflowId,
  })
  ensure('a candidate freezes there', frozen.state === 'verification', JSON.stringify(frozen))
  ensure('and it holds exactly the one changed file', frozen.files === 1, JSON.stringify(frozen))

  // The bytes on the mount are the bytes the candidate recorded: a mount that translated line
  // endings under the plugin would show up here and nowhere else.
  check('the file on the mount is unchanged by any of it', readFileSync(join(mounted, 'src', 'module.ts'), 'utf8'), bytes)
  await close()

  console.log('  note: correct, and still discouraged — a 9p mount is slow enough to change how a run feels')
}

// ---------------------------------------------------------------- done

for (const directory of cleanup) {
  try {
    if (existsSync(directory)) rmSync(directory, { force: true, recursive: true })
  } catch {
    console.warn(`  note: could not remove ${directory}`)
  }
}

if (failures.length !== 0) {
  console.error(`\n${failures.length} failed:\n${failures.map((line) => `  ${line}`).join('\n')}`)
  process.exit(1)
}
console.log('\nplatform behaviour holds')
