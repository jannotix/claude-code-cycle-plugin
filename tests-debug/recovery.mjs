// Kills the session part way through a governed cycle and checks that the next one reattaches at
// the right stage rather than starting again or losing the work.
//
//   node tests-debug/recovery.mjs <path to the installed dist/server.js>
//
// Certification 4.7.
//
// Manual in the matrix because it spends model calls, but nothing about it needs a person: closing
// the application mid-cycle is a kill, and reopening it is another process. Both are scriptable, and
// scripting them is what makes the difference between "we tried it once" and a claim that can be
// re-checked. The kill is deliberately hard — the process tree, no signal handling, no chance to
// finish writing — because a recovery that only survives a polite shutdown is not one.
//
// Permissions: set CYCLE_PERMISSION_ARGS as for full-cycle.mjs. Under root the CLI refuses a
// permissive mode, and Workflow and Skill must be in the allowed list or /cycle:run cannot start.

import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const SERVER = process.argv[2]
if (!SERVER || !existsSync(SERVER)) {
  console.error('usage: node tests-debug/recovery.mjs <path to the installed dist/server.js>')
  process.exit(2)
}

const PLUGIN = resolve(dirname(dirname(SERVER)))
const PERMISSION_ARGS = (process.env.CYCLE_PERMISSION_ARGS ?? '--permission-mode bypassPermissions')
  .split(' ')
  .filter(Boolean)

/** How long to let the cycle get going before killing it, and how often to look. */
const START_TIMEOUT_MS = 8 * 60 * 1000
const POLL_MS = 10_000

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

function claudeCli() {
  const explicit = process.env.CLAUDE_CLI
  if (explicit && existsSync(explicit)) return explicit
  const candidates =
    process.platform === 'win32'
      ? [join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')]
      : [join(process.env.HOME ?? '', '.local', 'bin', 'claude'), '/usr/local/bin/claude']
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  try {
    return execFileSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' })
      .split('\n')[0]
      .trim()
  } catch {
    return null
  }
}

const cli = claudeCli()
ensure('the Claude Code CLI is available', cli !== null, 'set CLAUDE_CLI to its path')
if (cli === null) {
  console.log('\n1 failed')
  process.exit(1)
}

// ---------------------------------------------------------------- the fixture

const FILES = {
  'package.json': '{\n  "name": "user-store",\n  "private": true,\n  "type": "module",\n  "scripts": { "test": "node --test" }\n}\n',
  'src/store.js': `const users = new Map()

export function createUser(name, email) {
  const id = String(users.size + 1)
  users.set(id, { email, id, name })
  return id
}

export function findUser(id) {
  return users.get(id)
}
`,
  'test/store.test.js': `import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createUser, findUser } from '../src/store.js'

test('a created user can be found by its id', () => {
  const id = createUser('Ada', 'ada@example.invalid')
  assert.equal(findUser(id).name, 'Ada')
})
`,
}

const project = mkdtempSync(join(tmpdir(), 'cycle-recovery-'))
const git = (...args) => execFileSync('git', args, { cwd: project, encoding: 'utf8' }).trim()

for (const [path, content] of Object.entries(FILES)) {
  mkdirSync(dirname(join(project, path)), { recursive: true })
  writeFileSync(join(project, path), content, 'utf8')
}
git('init', '--quiet')
git('config', 'user.email', 'fixture@example.invalid')
git('config', 'user.name', 'fixture')
mkdirSync(join(project, '.githooks-empty'), { recursive: true })
git('config', 'core.hooksPath', join(project, '.githooks-empty'))
git('add', '-A')
git('commit', '--quiet', '-m', 'baseline')
const baseline = git('rev-parse', 'HEAD')

// ---------------------------------------------------------------- reading the plane

function control(name, args) {
  const initialize = JSON.stringify({
    id: 0,
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      capabilities: {},
      clientInfo: { name: 'recovery', version: '0' },
      protocolVersion: '2025-06-18',
    },
  })
  const call = JSON.stringify({
    id: 1,
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { arguments: args, name },
  })
  const outcome = spawnSync(process.execPath, [SERVER], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    input: `${initialize}\n${call}\n`,
    timeout: 120_000,
  })
  for (const line of (outcome.stdout ?? '').split('\n').reverse()) {
    if (!line.trim().startsWith('{')) continue
    try {
      const message = JSON.parse(line)
      if (message.id !== 1) continue
      return JSON.parse(message.result.content[0].text)
    } catch {
      continue
    }
  }
  return null
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** Kills the process and everything it started: closing an application does not ask politely. */
function killTree(child) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}

// ---------------------------------------------------------------- the run, and the kill

console.log(`fixture ${project}`)
console.log(`artifact ${PLUGIN}`)
console.log(`baseline ${baseline.slice(0, 7)}\n`)

const request = 'add a listUsers function to the user store that returns every user sorted by name'
const child = spawn(
  cli,
  ['-p', `/cycle:run full ${request}`, ...PERMISSION_ARGS, '--output-format', 'json'],
  { cwd: project, detached: process.platform !== 'win32', stdio: 'ignore' },
)

let started = null
const deadline = Date.now() + START_TIMEOUT_MS
while (Date.now() < deadline) {
  await sleep(POLL_MS)
  const status = control('workflow', { operation: 'status' })
  if (status?.found === true) {
    started = status
    break
  }
}

ensure('the cycle got far enough to register a workflow', started !== null, 'nothing was recorded within the timeout')
if (started === null) {
  killTree(child)
  rmSync(project, { force: true, recursive: true })
  console.log('\n1 failed')
  process.exit(1)
}

console.log(`  reached: ${started.summary}`)
ensure('and it had not finished when we killed it', started.terminal !== true, String(started.state))

killTree(child)
console.log(`\nkilled the session at state ${started.state}\n`)
await sleep(5_000)

// ---------------------------------------------------------------- what survived the kill

console.log('after the kill')

const afterKill = control('workflow', { operation: 'status' })
ensure('the plane still answers for the project', afterKill?.found === true, JSON.stringify(afterKill))
check('and it is the same workflow, not a new one', afterKill?.workflowId ?? null, started.workflowId)
ensure(
  'the original request survived verbatim',
  afterKill?.originalRequest === request,
  String(afterKill?.originalRequest).slice(0, 120),
)

const history = control('workflow', { limit: 40, operation: 'history' })
ensure('the history chain is readable', Array.isArray(history?.entries), JSON.stringify(history).slice(0, 200))
ensure(
  'and it records the workflow starting',
  (history?.entries ?? []).some((entry) => entry.action === 'workflow.started'),
  (history?.entries ?? []).map((entry) => entry.action).join(', '),
)

// ---------------------------------------------------------------- reopening

console.log('\nreopening')

const resumed = spawnSync(
  cli,
  [
    '-p',
    'Run /cycle:resume for this project and report, in plain text, the workflow id, the state it ' +
      'reattached at, and what it says happens next. Do not start a new cycle.',
    ...PERMISSION_ARGS,
    '--output-format',
    'json',
  ],
  { cwd: project, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 1_800_000 },
)
const line = (resumed.stdout ?? '').split('\n').find((text) => text.trim().startsWith('{'))
let answer = { is_error: true, result: `${resumed.stdout ?? ''}${resumed.stderr ?? ''}`.slice(0, 300) }
try {
  answer = JSON.parse(line)
} catch {
  // answer keeps the failure shape, which the assertions below will report.
}
const text = String(answer.result ?? '')
console.log(`  resume: ${answer.is_error ? 'error' : 'ok'}, ${(answer.total_cost_usd ?? 0).toFixed(2)} USD`)

ensure('the resume session answered', answer.is_error !== true, text.slice(0, 200))
ensure(
  'and it named the workflow that was already there',
  text.includes(String(started.workflowId).slice(0, 8)),
  text.slice(0, 300),
)

const afterResume = control('workflow', { operation: 'status' })
check('the plane still holds one workflow, the same one', afterResume?.workflowId ?? null, started.workflowId)
ensure(
  'the request is still the one the user wrote',
  afterResume?.originalRequest === request,
  String(afterResume?.originalRequest).slice(0, 120),
)
ensure(
  'and the record only grew across the kill',
  (control('workflow', { limit: 60, operation: 'history' })?.entries ?? []).length >=
    (history?.entries ?? []).length,
  'the append-only record lost entries across a kill',
)

console.log(`  now: ${afterResume?.summary}`)

// Leave nothing running: this row is about recovery, not about finishing.
control('workflow', { confirm: true, operation: 'cancel' })

console.log('')
if (failures.length > 0) {
  console.log(`${failures.length} failed — the fixture is kept at ${project}`)
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(1)
}

rmSync(project, { force: true, recursive: true })
console.log(`killed at ${started.state} and reattached to the same workflow, for ${(answer.total_cost_usd ?? 0).toFixed(2)} USD`)
