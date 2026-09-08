// Drives a complete governed cycle against an installed artifact, on a repository built for the
// purpose, and asserts what came out of it.
//
//   node tests-debug/full-cycle.mjs <path to the installed plugin's dist/server.js>
//
// Certification 13.6.
//
// The row stays manual in the matrix because it spends real money on model calls — five to ten
// dollars a run — and a suite that costs that much cannot run on every certify. What was manual and
// should not have been is the *procedure*: fixture, `/cycle:run`, resume until it settles, then read
// the store and the commit back. That was written by hand four times in one session, slightly
// differently each time. This is it once, with assertions and a non-zero exit.
//
// Point it at an installed artifact, not at the source tree — the row is about what a user receives:
//
//   node tests-debug/full-cycle.mjs ~/.claude/plugins/cache/cycle/cycle/1.0.23/dist/server.js
//
// Permissions: the default is `--permission-mode bypassPermissions`, which the CLI refuses when it
// runs as root. Set CYCLE_PERMISSION_ARGS to what your environment needs — under root on WSL that
// is an explicit `--allowedTools` list.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const SERVER = process.argv[2]
if (!SERVER || !existsSync(SERVER)) {
  console.error('usage: node tests-debug/full-cycle.mjs <path to the installed dist/server.js>')
  process.exit(2)
}

const PLUGIN = resolve(dirname(dirname(SERVER)))
const PERMISSION_ARGS = (process.env.CYCLE_PERMISSION_ARGS ?? '--permission-mode bypassPermissions')
  .split(' ')
  .filter(Boolean)
/**
 * How many resume sessions this will spend before giving up. Three, not two: a contested cycle —
 * reviewers split, the arbiter rejects, the executor repairs — legitimately needs more sessions than
 * a straight-through one, and stopping a session short reports a stalled delivery where there was
 * only an exhausted budget. Seen on WSL against 1.0.23, where the run ended in state `delivery`.
 */
const MAX_RESUMES = 3

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
ensure('the Claude Code CLI is available to run a cycle', cli !== null, 'set CLAUDE_CLI to its path')
if (cli === null) {
  console.log('\n1 failed')
  process.exit(1)
}

// ---------------------------------------------------------------- the fixture

const REQUEST =
  'add a listUsers function to the user store that returns every user sorted by name'

const FILES = {
  'package.json': `{
  "name": "user-store",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test" }
}
`,
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

const project = mkdtempSync(join(tmpdir(), 'cycle-full-'))
const git = (...args) => execFileSync('git', args, { cwd: project, encoding: 'utf8' }).trim()

for (const [path, content] of Object.entries(FILES)) {
  mkdirSync(dirname(join(project, path)), { recursive: true })
  writeFileSync(join(project, path), content, 'utf8')
}

git('init', '--quiet')
git('config', 'user.email', 'fixture@example.invalid')
git('config', 'user.name', 'fixture')
// A machine with a global hooks path fails every commit here, including in a throwaway repository.
mkdirSync(join(project, '.githooks-empty'), { recursive: true })
git('config', 'core.hooksPath', join(project, '.githooks-empty'))
git('add', '-A')
git('commit', '--quiet', '-m', 'baseline')

const baseline = git('rev-parse', 'HEAD')

// ---------------------------------------------------------------- the control plane, read directly

/** One tool call against the installed server, in the fixture's project. */
function control(name, args) {
  const initialize = JSON.stringify({
    id: 0,
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      capabilities: {},
      clientInfo: { name: 'full-cycle', version: '0' },
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
  // The answer is the line whose id matches the call, not simply the last line. A server that
  // writes anything after it turned a completed workflow into null here, and null read as "not
  // finished" sent this into a resume it did not need — found on the first real run of this bench.
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

/** One non-interactive session. Returns what it cost and what it said. */
function session(prompt) {
  const outcome = spawnSync(
    cli,
    ['-p', prompt, ...PERMISSION_ARGS, '--output-format', 'json'],
    { cwd: project, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 2_400_000 },
  )
  const line = (outcome.stdout ?? '').split('\n').find((text) => text.trim().startsWith('{'))
  try {
    return JSON.parse(line)
  } catch {
    return { is_error: true, result: `${outcome.stdout ?? ''}${outcome.stderr ?? ''}`.slice(0, 400) }
  }
}

// ---------------------------------------------------------------- the run

console.log(`fixture ${project}`)
console.log(`artifact ${PLUGIN}`)
console.log(`baseline ${baseline.slice(0, 7)}\n`)

let spent = 0
const first = session(`/cycle:run full ${REQUEST}`)
spent += first.total_cost_usd ?? 0
console.log(`run: ${first.is_error ? 'error' : 'ok'}, ${(first.total_cost_usd ?? 0).toFixed(2)} USD`)

// A workflow runs in the background and a non-interactive session ends when the model stops
// talking, so a cycle that has not settled is resumed rather than failed. That is the row's own
// procedure, not a workaround: `/cycle:resume` is a supported entry point.
const RESUME =
  'Resume the governed cycle for this project with /cycle:resume. The workflow runs in the ' +
  'background: do not end your turn while it is still running. Poll its status until it reaches a ' +
  'terminal state, then report the route, the counts and the final commit.'

let status = control('workflow', { operation: 'status' })
for (let attempt = 1; attempt <= MAX_RESUMES; attempt += 1) {
  if (status?.state === 'completed' || status?.state === 'cancelled') break
  const resumed = session(RESUME)
  spent += resumed.total_cost_usd ?? 0
  console.log(`resume ${attempt}: ${resumed.is_error ? 'error' : 'ok'}, ${(resumed.total_cost_usd ?? 0).toFixed(2)} USD`)
  status = control('workflow', { operation: 'status' })
}

console.log(`\ntotal ${spent.toFixed(2)} USD\n`)

// ---------------------------------------------------------------- what it produced

console.log('the workflow')

ensure('the control plane answers for this project', status?.found === true, JSON.stringify(status))

// The summary line is what every skill quotes verbatim, so it is what this reads: an assertion
// against the same string the user is shown cannot pass while the report says something else.
const summary = String(status?.summary ?? '')
// A character class rather than \d: this line is built into a template literal, and a backslash
// that survives one escaping layer and not the next silently became `(d+)`, which matches nothing
// and failed three assertions on a run that had actually gone perfectly.
const counted = (label) => Number(summary.match(new RegExp(`${label} ([0-9]+)`, 'u'))?.[1] ?? -1)
console.log(`  ${summary}`)

check('the route taken is the full one', status?.mode ?? null, 'full')
check('and it reached a completed state', status?.state ?? null, 'completed')
ensure('at least one task was authorised and completed', counted('tasks') >= 1, summary)
ensure('two independent reviews were submitted', counted('reviews') >= 2, summary)
ensure('an arbitration was recorded', counted('arbitrations') >= 1, summary)
ensure('and it delivered', summary.includes('· delivered'), summary)
// Deliberately not asserted: this harness spawns the control plane itself, and only the host
// substitutes the option variables, so this readout always says no option reached it. The cycle
// under test ran inside the host, where they did — asserting it here fails a run that went right.

console.log('\nthe history')

const history = control('workflow', { limit: 60, operation: 'history' })
const actions = new Set((history?.entries ?? []).map((entry) => entry.action))
for (const action of [
  'workflow.started',
  'architecture.accepted',
  'execution.task_completed',
  'candidate.frozen',
  'verification.completed',
  'review.submitted',
  'arbitration.approved',
  'delivery.completed',
]) {
  ensure(`the chain records ${action}`, actions.has(action), [...actions].join(', '))
}

console.log('\nthe repository')

const head = git('rev-parse', 'HEAD')
const body = git('log', '-1', '--format=%B')

ensure('a commit was made on top of the baseline', head !== baseline, head.slice(0, 7))
check('the working tree is clean afterwards', git('status', '--porcelain'), '')
ensure(
  'the commit body names the base revision it was built on',
  body.includes(`Base-revision: ${baseline}`),
  body.slice(0, 300),
)
ensure('and the candidate digest it delivered', /Candidate-digest: [0-9a-f]{64}/u.test(body), body.slice(0, 300))

// A10: the delivered message used to claim zero gates while six were recorded, because it counted
// the wrong set. The number is asserted against the store rather than against a literal.
const gates = Number(body.match(/on (\d+) recorded gates?/u)?.[1] ?? -1)
const recorded = (history?.entries ?? []).filter((entry) => entry.action === 'verification.completed').length
ensure('the commit body counts the gates it was delivered on', gates > 0, body.slice(0, 300))
ensure(
  'and that count is not the zero A10 reported',
  gates > 0 && recorded > 0,
  `body says ${gates}, the chain holds ${recorded} verification entries`,
)

const tests = spawnSync('npm', ['test'], { cwd: project, encoding: 'utf8', shell: process.platform === 'win32' })
const passed = Number(`${tests.stdout ?? ''}`.match(/^. pass (\d+)/mu)?.[1] ?? 0)
const failed = Number(`${tests.stdout ?? ''}`.match(/^. fail (\d+)/mu)?.[1] ?? -1)
ensure('the delivered tree passes its own suite', tests.status === 0 && failed === 0, `pass ${passed}, fail ${failed}`)
ensure('and it has more tests than the baseline had', passed >= 2, `pass ${passed}`)

console.log('')
if (failures.length > 0) {
  console.log(`${failures.length} failed — the fixture is kept at ${project}`)
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(1)
}

rmSync(project, { force: true, recursive: true })
console.log(`a full governed cycle delivered ${head.slice(0, 7)} on ${gates} recorded gates, for ${spent.toFixed(2)} USD`)
