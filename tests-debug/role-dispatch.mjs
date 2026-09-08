// Runs the real /cycle:run workflow script against the real control plane and records what each
// role was actually dispatched with — its agent, its model, its effort, and the prompt it received.
//
//   node tests-debug/role-dispatch.mjs production/dist/server.js
//
// Certification 2.3, 2.4, 2.5, 3.2, 4.1 and 6.12.
//
// The roles are stubbed and the control plane is not: what is under test is the dispatch, which is
// the one part of the product that lives in the workflow script rather than in the control plane.
// Admission is stubbed too — whether this machine has room is section 10's question, not this one.

import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import readline from 'node:readline'

const SERVER = process.argv[2]
if (!SERVER) {
  console.error('usage: node tests-debug/role-dispatch.mjs <path to dist/server.js>')
  process.exit(2)
}

const SCRIPT = join(dirname(dirname(SERVER)), 'workflows', 'cycle.js')

// ---------------------------------------------------------------- a throwaway project

const root = mkdtempSync(join(tmpdir(), 'cycle-dispatch-'))
const data = mkdtempSync(join(tmpdir(), 'cycle-dispatch-data-'))
const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' })
const write = (path, content) => {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), content)
}

git('init', '--quiet')
git('config', 'user.email', 'fixture@example.invalid')
git('config', 'user.name', 'fixture')
mkdirSync(join(root, '.githooks-empty'), { recursive: true })
git('config', 'core.hooksPath', join(root, '.githooks-empty'))
write('README.md', '# fixture\n')
git('add', '-A')
git('commit', '--quiet', '-m', 'baseline')

// ---------------------------------------------------------------- the control plane

/**
 * One control plane, isolated. The options are what the plugin would receive from `userConfig`, so
 * a plane opened with models configured is the only way to test the path the product actually
 * takes: the run asks the plane what each role is set to, rather than being told by its caller.
 */
function openPlane(options = {}) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: root }
  for (const key of Object.keys(env)) {
    if (key.startsWith('CLAUDE_PLUGIN_OPTION_')) delete env[key]
  }
  // Set after the inherited options are stripped, or the strip removes the isolation with them.
  env.CLAUDE_PLUGIN_OPTION_DATA_DIR = mkdtempSync(join(tmpdir(), 'cycle-dispatch-data-'))
  for (const [key, value] of Object.entries(options)) env[`CLAUDE_PLUGIN_OPTION_${key}`] = value

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
  const send = (name, args) => {
    id += 1
    child.stdin.write(
      `${JSON.stringify({ id, jsonrpc: '2.0', method: 'tools/call', params: { arguments: args, name } })}
`,
    )
    return new Promise((resolve) => {
      if (queue.length) resolve(queue.shift())
      else waiters.push(resolve)
    })
  }
  const body = (response) => {
    if (response?.error) throw new Error(`control plane refused: ${response.error.message}`)
    const text = response?.result?.content?.[0]?.text
    if (text === undefined) throw new Error(`no content: ${JSON.stringify(response)}`)
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`control plane refused: ${text}`)
    }
  }

  const close = async () => {
    child.stdin.end()
    await new Promise((resolve) => child.on('close', resolve))
    try {
      rmSync(env.CLAUDE_PLUGIN_OPTION_DATA_DIR, { force: true, recursive: true })
    } catch {
      console.warn(`  note: could not remove ${env.CLAUDE_PLUGIN_OPTION_DATA_DIR}`)
    }
  }

  return { body, close, send }
}

const unconfigured = openPlane()

// ---------------------------------------------------------------- what the roles answer

const PLAN = {
  assumptions: [],
  integration_checks: ['the helper is used'],
  requirements: [
    { acceptance_criteria: ['the helper exists'], id: 'R1', statement: 'add a date helper' },
  ],
  risks: [],
  tasks: [
    {
      acceptance_criteria: ['the helper exists'],
      dependencies: [],
      key: 'task-1',
      objective: 'add the helper',
      requirement_ids: ['R1'],
      title: 'Date helper',
      // The subject here is dispatch, not gates: a command that cannot depend on the fixture
      // keeps a failure meaningful.
      verification_commands: ['node --version'],
      write_scopes: ['src'],
    },
  ],
}

const approval = (requirementIds) => ({
  decision: 'approved',
  findings: [],
  repair_target: null,
  requirements: requirementIds.map((requirement_id) => ({
    evidence_ids: [],
    requirement_id,
    status: 'satisfied',
  })),
})

let written = 0
// A verdict has to decide every requirement the plan declared, exactly once. The quick route has
// no plan, so there is nothing to decide.
let requirements = []

/** The canned answer for one role, and the side effect the executor would really have. */
function answer(role) {
  if (role === 'architect') {
    requirements = PLAN.requirements.map((entry) => entry.id)
    return PLAN
  }
  if (role === 'executor-advisor') {
    // The read-only role that names the boundary before anything is written. It answers with
    // the paths the executor below will actually touch: a scope that does not cover the work
    // is the failure this step exists to catch, not a detail of the stub.
    return { paths: ['src/'] }
  }
  if (role === 'executor') {
    written += 1
    write(`src/helper-${written}.ts`, `export const value = ${written}\n`)
    return { browser: null, status: 'completed', summary: 'added the helper' }
  }
  return approval(requirements)
}

// ---------------------------------------------------------------- the workflow runtime, stubbed

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
const source = readFileSync(SCRIPT, 'utf8').replace('export const meta', 'const meta')
const compiled = new AsyncFunction('agent', 'parallel', 'pipeline', 'log', 'phase', 'args', source)

async function run(args, plane) {
  const dispatched = []
  const messages = []
  requirements = []

  const agent = async (prompt, options) => {
    if (options.agentType === 'cycle:operator') {
      // Admission is not this harness's subject, and this machine's free memory is not a fact
      // about the plugin.
      if (prompt.includes('__limits')) return { admitted: true, reason: 'stubbed' }
      const line = prompt.slice(prompt.indexOf('\n') + 1)
      const answer = plane.body(await plane.send('workflow', JSON.parse(line)))
      // The real relay is an agent producing structured output, so what it returns is shaped by the
      // schema it was given. A stub that hands back the plane's object directly tests a transport
      // nobody has: it cannot see a field the schema would have dropped, which is how three fixes
      // shipped inert. When `shaped` is set, only the declared fields survive — exactly what a
      // field-enumerating schema does.
      // A relay that produced nothing: the agent failed and the reply never came back. The run used
      // to read that as a candidate with no evidence at all and send a judge in with empty hands.
      const asked = JSON.parse(line).operation
      // Once: the reply goes missing and the retry recovers it. Always: no attempt ever comes back,
      // which is when the run has to stop rather than judge with an empty list.
      if (plane.silenceOnce?.has(asked)) {
        plane.silenceOnce.delete(asked)
        return null
      }
      if (plane.silenceAlways?.has(asked)) return null
      if (plane.shaped && answer && typeof answer === 'object') {
        const kept = {}
        for (const field of plane.shaped) if (field in answer) kept[field] = answer[field]
        return kept
      }
      // One reply loses the field, not every reply: a relay that dropped a field on every call
      // would be a broken transport, and the observed failure was a single lossy answer.
      if (plane.drop?.size && answer && typeof answer === 'object') {
        for (const field of plane.drop) delete answer[field]
        plane.drop.clear()
      }
      // And one reply invents a state the plane has never been in, which is what a real relay did:
      // it answered `state: "workflow_started"` with mode gone, and the run read that as a quick
      // route restarting at execution with the reviewers out of reach.
      if (plane.corrupt && answer && typeof answer === 'object' && answer.workflowId) {
        const spoiled = { ...answer, state: 'workflow_started' }
        delete spoiled.mode
        plane.corrupt = false
        return spoiled
      }
      return answer
    }
    const role = options.agentType.replace('cycle:', '')
    dispatched.push({ effort: options.effort ?? null, model: options.model ?? null, prompt, role })
    return answer(role)
  }

  const parallel = async (thunks) =>
    Promise.all(thunks.map((thunk) => Promise.resolve().then(thunk).catch(() => null)))

  const result = await compiled(
    agent,
    parallel,
    async () => [],
    (message) => messages.push(message),
    () => {},
    args,
  )
  return { dispatched, messages, result }
}

// ---------------------------------------------------------------- checks

const failures = []
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`)
}
const ensure = (label, condition) => check(label, Boolean(condition), true)

// ---------------------------------------------------------------- 1. the quick route, unconfigured

const QUICK_REQUEST = 'rename a helper in the date utilities'
const quick = await run({ preference: 'quick', request: QUICK_REQUEST }, unconfigured)

console.log('\nquick route, no model configuration')
check('the architect is never dispatched on the quick route', quick.dispatched.some((call) => call.role === 'architect'), false)
check('neither reviewer is dispatched on the quick route', quick.dispatched.filter((call) => call.role.endsWith('reviewer')).length, 0)
// The quick route names its boundary first: a read-only role states the paths, the plane
// records them, and only then does the executor write. Without that step reconciliation had
// nothing to compare the worktree against and every path passed.
check(
  'the scope is named before anything is written',
  quick.dispatched.map((call) => call.role),
  ['executor-advisor', 'executor', 'arbiter'],
)
// Certification 2.5: a role left on `inherit` is dispatched with no model at all, so it runs on
// whatever the session is on — and the plugin never reads or records that.
check('no model is passed when the role is set to inherit', quick.dispatched.every((call) => call.model === null), true)
// Effort has no inherit: the plugin defines one per role, and a default that never reaches the
// role it was written for is a setting that does not exist.
// The advisor is the executor's read-only half, so it carries the executor's effort. Keyed under
// its own name it carried none and ran on whatever the session was set to.
check('the configured effort reaches every role', quick.dispatched.map((call) => call.effort), ['high', 'high', 'high'])
// Certification 4.1.
ensure('the quick cycle is delivered', quick.result?.outcome?.state === 'completed')

// ---------------------------------------------------------------- 2. the full route, configured

const FULL_REQUEST = 'add oauth login to the dashboard and make sure the session survives a reload'
const models = {
  arbiter: 'minimax/minimax-m3',
  architect: 'anthropic/claude-opus-5',
  executor: 'openai/gpt-5.6-codex',
  'functional-reviewer': 'google/gemini-3-pro',
  'security-reviewer': 'xai/grok-5',
}
const efforts = { arbiter: 'max', architect: 'xhigh', executor: 'high' }

const full = await run({ efforts, models, preference: 'full', request: FULL_REQUEST }, unconfigured)

console.log('\nfull route, one model per role')
if (process.env['CYCLE_DEBUG']) {
  console.log('  messages:', JSON.stringify(full.messages))
  console.log('  result:', JSON.stringify(full.result))
}
check('every role runs, in order', full.dispatched.map((call) => call.role), [
  'architect',
  'executor',
  'functional-reviewer',
  'security-reviewer',
  'arbiter',
])
// Certification 2.3.
for (const [role, model] of Object.entries(models)) {
  check(`the ${role} is dispatched on ${model}`, full.dispatched.find((call) => call.role === role)?.model, model)
}
// Certification 2.4.
check('the arbiter carries its configured effort', full.dispatched.find((call) => call.role === 'arbiter')?.effort, 'max')
check('the architect carries its own', full.dispatched.find((call) => call.role === 'architect')?.effort, 'xhigh')
// The caller named no effort for this one, so the configured default is what it runs on.
check('a role the caller said nothing about carries its configured effort', full.dispatched.find((call) => call.role === 'security-reviewer')?.effort, 'high')

// Certification 6.12: the arbiter judges the sentence the user wrote, not the plan's account of it.
const arbiter = full.dispatched.find((call) => call.role === 'arbiter')
ensure('the arbiter receives the original request verbatim', arbiter?.prompt.includes(FULL_REQUEST))
ensure('the arbiter is not handed the architect summary', !arbiter?.prompt.includes(PLAN.tasks[0].objective))
ensure('the architect received the same original request', full.dispatched[0]?.prompt.includes(FULL_REQUEST))

// ------------------------------------------- 3. the configured plane, with nothing passed in

// The regression this exists to catch. Every role once took its model from a map the launching
// skill was told to assemble; when that step did not happen the map arrived empty, the dispatch
// read an absent entry as a deliberate `inherit`, and five configured models silently became the
// one the session was already on. Nothing failed, and nothing said so. The run now asks the plane.
const configured = openPlane({
  ARBITER_MODEL: 'minimax/minimax-m3',
  ARCHITECT_MODEL: 'anthropic/claude-opus-5',
  ARBITER_EFFORT: 'max',
  EXECUTOR_MODEL: 'openai/gpt-5.6-codex',
  FUNCTIONAL_REVIEWER_MODEL: 'google/gemini-3-pro',
  SECURITY_REVIEWER_MODEL: 'xai/grok-5',
})
const declared = await run({ preference: 'full', request: FULL_REQUEST }, configured)

console.log('\nconfigured plane, no models passed by the caller')
const on = (role) => declared.dispatched.find((call) => call.role === role)?.model ?? null
check('the architect runs on what the plane says', on('architect'), 'anthropic/claude-opus-5')
check('the executor runs on what the plane says', on('executor'), 'openai/gpt-5.6-codex')
check('the functional reviewer runs on what the plane says', on('functional-reviewer'), 'google/gemini-3-pro')
// Two reviewers configured differently have to stay different, or the second opinion is the first.
check('the security reviewer runs on what the plane says', on('security-reviewer'), 'xai/grok-5')
check('the arbiter runs on what the plane says', on('arbiter'), 'minimax/minimax-m3')
check('the configured effort arrives with it', declared.dispatched.find((call) => call.role === 'arbiter')?.effort, 'max')
// The one line that makes the failure visible if it ever returns.
ensure(
  'the run states which model each role was given',
  declared.messages.some((message) => message.includes('executor: openai/gpt-5.6-codex')),
)

await configured.close()

// ---------------------------- 4. a start reply that lost the workflow id on the way back

// The relay is a model, not a transport, and DECISIONS records that replies have come back missing
// a field. Losing workflowId stops the run at its first line: the plane holds a workflow nobody is
// driving, and the caller is left to make its own sense of the silence. That is what every attempt
// to certify a complete cycle actually hit. The run now reads the id back from the plane, which is
// the strategy already recorded for the relay's unreliability, applied to the one reply that had
// been exempt from it.
const lossy = await run(
  { preference: 'quick', request: 'rename a helper in the string utilities' },
  { ...unconfigured, drop: new Set(['workflowId']) },
)

console.log('\nstart reply that lost the workflow id')
ensure('the run does not stop at the first reply', (lossy.result?.error ?? null) === null)
ensure(
  'it says the id was read back rather than passing it over in silence',
  lossy.messages.some((message) => message.includes('read it back from the plane')),
)
ensure('the cycle still delivers', lossy.result?.outcome?.state === 'completed')

// ------------------- 5. a start reply carrying a state the plane has never been in

// The relay answered `{"state": "workflow_started"}` with no mode. RANK has no such stage, so the
// run restarted at execution against tasks already completed, and `full` read as false so the two
// independent reviewers were never dispatched. Both fields now come from the plane.
const spoiled = await run(
  { preference: 'full', request: FULL_REQUEST, models, efforts },
  { ...unconfigured, corrupt: true },
)

console.log('\nstart reply carrying a state the plane has never been in')
check('every role still runs, in order', spoiled.dispatched.map((call) => call.role), [
  'architect',
  'executor',
  'functional-reviewer',
  'security-reviewer',
  'arbiter',
])
ensure('the run says the plane disagreed with the reply', spoiled.messages.some((m) => m.includes('the plane says')))
ensure('the cycle still delivers', spoiled.result?.outcome?.state === 'completed')

// -------------------------- 6. a relay whose schema never learned the newer fields

// The relay used to be handed a schema listing the fields a reply might carry, and a schema that
// lists fields is a filter: everything the plane learned to return afterwards was dropped on the
// way back. The per-role models, the capture capabilities and the summary line all arrived after
// that list was written, so three fixes that passed their tests did nothing in a real run. This
// keeps only what the old list declared and checks the run still gets what it needs.
const OLD_SCHEMA_FIELDS = new Set([
  'state', 'workflowId', 'delivered', 'aborted', 'mode', 'decision', 'refusal', 'mandatoryPassed',
  'reason', 'reviewsReady', 'candidate', 'evidence', 'remaining', 'admitted', 'tasks', 'memories',
  'requirements', 'lastRefusal', 'repair',
])

const filtered = await run(
  { preference: 'full', request: FULL_REQUEST, models, efforts },
  { ...unconfigured, shaped: OLD_SCHEMA_FIELDS },
)

console.log('\nrelay shaped by a schema that never learned the newer fields')
check('every role still runs, in order', filtered.dispatched.map((call) => call.role), [
  'architect',
  'executor',
  'functional-reviewer',
  'security-reviewer',
  'arbiter',
])
ensure('the cycle still delivers', filtered.result?.outcome?.state === 'completed')

// -------------------------------- 7. the recorded evidence could not be read

// The reply carrying the evidence and the requirement identifiers went missing, and an empty list
// is what the run passed on. The arbiter said so itself — "no recorded evidence or reviews were
// supplied" — approved work a reviewer had rejected, and had its verdict refused for citing no
// requirements. Reading it is a pure read, so a lost reply is retried; a read that never comes back
// stops the run, because a judge with nothing in front of it does not judge.
const lostOnce = await run(
  { preference: 'full', request: FULL_REQUEST, models, efforts },
  { ...unconfigured, silenceOnce: new Set(['evidence']) },
)

console.log('\nthe evidence read is lost once')
ensure('the retry recovers it', lostOnce.result?.outcome?.state === 'completed')
ensure('the arbiter still judges', lostOnce.dispatched.some((call) => call.role === 'arbiter'))

const lostAlways = await run(
  { preference: 'full', request: FULL_REQUEST, models, efforts },
  { ...unconfigured, silenceAlways: new Set(['evidence']) },
)

console.log('\nthe evidence read never comes back')
ensure('no arbiter is dispatched', !lostAlways.dispatched.some((call) => call.role === 'arbiter'))
ensure('the run stops at the evidence it could not read', lostAlways.result?.stoppedAt === 'evidence')
ensure(
  'it says why rather than judging anyway',
  lostAlways.messages.some((message) => message.includes('could not be read')),
)

// ---------------------------------------------------------------- done

await unconfigured.close()
for (const directory of [root]) {
  try {
    rmSync(directory, { force: true, recursive: true })
  } catch {
    console.warn(`  note: could not remove ${directory}`)
  }
}

if (failures.length !== 0) {
  console.error(`\n${failures.length} failed:\n${failures.map((line) => `  ${line}`).join('\n')}`)
  process.exit(1)
}
console.log('\nrole dispatch matches configuration on both routes')
