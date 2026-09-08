// Runs the real /cycle:run workflow script against the real control plane with one role's provider
// taken away, and checks that the run classifies it rather than treating silence as a rejection.
//
//   node tests-debug/provider-failure.mjs production/dist/server.js
//
// Certification row 11.4.

import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import readline from 'node:readline'

const SERVER = process.argv[2]
if (!SERVER) {
  console.error('usage: node tests-debug/provider-failure.mjs <path to dist/server.js>')
  process.exit(2)
}

const SCRIPT = join(dirname(dirname(SERVER)), 'workflows', 'cycle.js')
const data = mkdtempSync(join(tmpdir(), 'cycle-provider-data-'))
const project = mkdtempSync(join(tmpdir(), 'cycle-provider-project-'))

const env = { ...process.env, CLAUDE_PROJECT_DIR: project }
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
const send = (name, args) => {
  id += 1
  child.stdin.write(
    JSON.stringify({ id, jsonrpc: '2.0', method: 'tools/call', params: { arguments: args, name } }) + '\n',
  )
  return new Promise((resolve) => {
    if (queue.length) resolve(queue.shift())
    else waiters.push(resolve)
  })
}
const body = (response) => {
  const text = response?.result?.content?.[0]?.text
  if (text === undefined) throw new Error(`no content: ${JSON.stringify(response)}`)
  return JSON.parse(text)
}

// ---------------------------------------------------------------- the workflow runtime, stubbed

const failures = []
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`)
}

/**
 * The operator relays one control-plane call verbatim, so the stub does exactly that: it reads the
 * arguments out of the prompt the script wrote and forwards them. Every other role is a provider,
 * and the one named in `dead` is the provider that went away — which the runtime reports as null,
 * after it has already retried.
 */
function runtime(dead) {
  return {
    agent: async (prompt, options) => {
      if (options.agentType === 'cycle:operator') {
        const line = prompt.slice(prompt.indexOf('\n') + 1)
        const tool = prompt.includes('__limits') ? 'limits' : 'workflow'
        return body(await send(tool, JSON.parse(line)))
      }
      const role = options.agentType.replace('cycle:', '')
      if (role === dead) return null
      throw new Error(`the harness has no canned answer for ${role}`)
    },
    parallel: async (thunks) =>
      Promise.all(thunks.map((thunk) => Promise.resolve().then(thunk).catch(() => null))),
    pipeline: async () => [],
  }
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
const source = readFileSync(SCRIPT, 'utf8').replace('export const meta', 'const meta')
const compiled = new AsyncFunction('agent', 'parallel', 'pipeline', 'log', 'phase', 'args', source)

// ---------------------------------------------------------------- the run

const messages = []
const stub = runtime('architect')
const result = await compiled(
  stub.agent,
  stub.parallel,
  stub.pipeline,
  (message) => messages.push(message),
  () => {},
  { preference: 'full', request: 'add oauth login to the dashboard' },
)

console.log()
check('the run is classified as a provider failure', result.failure, 'provider_unavailable')
check('the role that lost its provider is named', result.role, 'architect')
check('the run says it is recoverable', result.recoverable, true)
check('the workflow is paused, not blocked', result.state, 'paused')

const status = body(await send('workflow', { operation: 'status', workflowId: result.workflowId }))
check('status reports why it paused', status.pausedBecause, 'provider unavailable: the architect produced no answer')
check('no repair cycle was spent', status.repair.used, 0)

const resumed = body(
  await send('workflow', { controlOperation: 'resume', operation: 'control', workflowId: result.workflowId }),
)
check('resuming returns it to architecture', resumed.state, 'architecture')

const after = body(await send('workflow', { operation: 'status', workflowId: result.workflowId }))
check('the reason is cleared once it is running again', after.pausedBecause, null)
check('the history still verifies', body(await send('workflow', { operation: 'history' })).chain.valid, true)

console.log()
console.log(messages.map((message) => `  log: ${message}`).join('\n'))

child.stdin.end()
await new Promise((resolve) => child.on('close', resolve))
// The store is a file the server had open; on Windows it is released when the process is, not
// when the pipe is. A directory that will not go is left in the temp directory rather than
// failing a run that already answered the question it was asked.
for (const directory of [data, project]) {
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
console.log('\nprovider failure classified and recovered')
