// Drives one complete governed cycle through the real MCP server against a throwaway git
// repository: routing, architecture, execution, a byte-exact candidate freeze, a captured browser
// flow, deterministic design and accessibility detectors, a failed verification, repairs, both
// independent reviews, a contained security proof that refuses the delivery it was approved for,
// a final approved cycle, promotion of the exact approved bytes, and reconciliation afterwards.
//
//   node tests-debug/cycle-e2e.mjs production/dist/server.js
//
// Certification 4.2, 4.3, 4.7, 5.1, 5.2, 5.19, 5.20, 5.21, 6.4, 7.2, 7.3 and 7.5.

import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import readline from 'node:readline'

const SERVER = process.argv[2]
if (!SERVER) {
  console.error('usage: node tests-debug/cycle-e2e.mjs <path to dist/server.js>')
  process.exit(2)
}

// ---------------------------------------------------------------- a throwaway candidate

const root = mkdtempSync(join(tmpdir(), 'cycle-e2e-'))
const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' })
const write = (path, content) => {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), content)
}
const read = (path) => {
  try {
    return readFileSync(join(root, path), 'utf8')
  } catch {
    return null
  }
}

git('init', '--quiet')
git('config', 'user.email', 'fixture@example.invalid')
git('config', 'user.name', 'fixture')
// A machine-wide core.hooksPath would run the developer's own hooks inside the fixture.
mkdirSync(join(root, '.githooks-empty'), { recursive: true })
git('config', 'core.hooksPath', join(root, '.githooks-empty'))
write('README.md', '# fixture\n')
git('add', '-A')
git('commit', '--quiet', '-m', 'baseline')

// ---------------------------------------------------------------- the control plane

// Outside the repository: the store and the signing key must never be part of a candidate.
const data = mkdtempSync(join(tmpdir(), 'cycle-e2e-data-'))
const env = { ...process.env, CLAUDE_PROJECT_DIR: root }
for (const key of Object.keys(env)) {
  if (key.startsWith('CLAUDE_PLUGIN_OPTION_')) delete env[key]
}
// Set after the inherited options are stripped, or the strip removes the isolation with them.
env.CLAUDE_PLUGIN_OPTION_DATA_DIR = data
// A proof runs code the reviewer wrote with this account's privileges, so it is off unless somebody
// turns it on. Certification 5.20 and 5.21 are about what happens when it is on and what containment
// applies, so this harness turns it on deliberately, against a throwaway repository and an isolated
// store. Without it the proof is refused and the run never reaches the refusal it exists to show.
env.CLAUDE_PLUGIN_OPTION_SECURITY_PROOFS = 'on'

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
  if (response.error) return { _error: response.error }
  const text = response.result?.content?.[0]?.text
  try {
    return JSON.parse(text)
  } catch {
    return { _raw: text }
  }
}
const wf = (args) => send('workflow', args).then(body)

// ---------------------------------------------------------------- what this harness asserts
//
// Every step below states what it expected, and a step that did not get it fails the run. Without
// this the harness printed its results and exited zero whatever happened, which is how twelve
// certification rows stayed green while the cycle stopped delivering: `body()` turns a refusal into
// an object with no `state`, and `refused.refusal ?? 'approved'` then printed an error as an
// approval. A harness that cannot fail certifies nothing.

const failures = []
const ensure = (label, condition, detail = '') => {
  if (!condition) failures.push(`${label}${detail ? `: ${detail}` : ''}`)
  console.log(`     ${condition ? 'ok  ' : 'FAIL'} ${label}${condition ? '' : `  ${detail}`}`)
}
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  console.log(`     ${ok ? 'ok  ' : 'FAIL'} ${label}`)
}
/** What refused a call: `_raw` is the tool's own error, `_error` the transport's. */
const refusedBy = (reply) => reply?._error ?? reply?._raw ?? null
const accepted = (label, reply) =>
  ensure(label, refusedBy(reply) === null, JSON.stringify(refusedBy(reply)))

// ---------------------------------------------------------------- fixtures

const node = (role, name, children = [], level = null) => ({ children, level, name, role })
const capture = (button) => ({
  capturedFlow: 'sign in and reach the dashboard',
  url: 'http://localhost:3000/login',
  nodes: [node('main', 'Dashboard', [node('heading', 'Sign in', [], 1), button])],
})

const plan = {
  requirements: [
    { id: 'R1', statement: 'the login screen authenticates', acceptance_criteria: ['a valid user signs in'] },
  ],
  tasks: [
    {
      key: 'T1',
      title: 'add sign-in',
      objective: 'implement the flow',
      requirement_ids: ['R1'],
      // Layer three reconciles the worktree against these, so a plan has to authorize everything
      // the executor writes — including the scripts its own verification commands run.
      write_scopes: ['src', 'check.mjs', 'security-scan.mjs'],
      dependencies: [],
      acceptance_criteria: ['the flow completes'],
      verification_commands: ['node check.mjs', 'node security-scan.mjs'],
    },
  ],
  assumptions: [],
  risks: [],
  integration_checks: ['sign in end to end'],
}

const approvalFor = (evidence) => ({
  decision: 'approved',
  repair_target: null,
  findings: [],
  requirements: [
    {
      requirement_id: 'R1',
      status: 'satisfied',
      evidence_ids: evidence.filter((item) => item.status === 'passed').map((item) => item.id).slice(0, 1),
    },
  ],
})

async function verifiedCandidate(workflowId, button) {
  await wf({ operation: 'report_task', workflowId, taskKey: 'T1', status: 'completed', summary: 'attempt' })
  const froze = await wf({ operation: 'freeze_candidate', workflowId })

  // The interface layer is proved by a flow somebody drove, and the party a gate exists to check
  // cannot be the party that clears it. Freezing mints one single-use secret per reviewing role;
  // spending one is what lets the plane read the role from the record instead of from the caller.
  // Submitting without it is the executor reporting on its own work, which carries no weight — and
  // is why this harness stopped reaching delivery when that rule arrived, without ever saying so.
  const capability = (froze.captureCapabilities ?? []).find((entry) => entry.role === 'functional_reviewer')
  ensure(
    'freezing issued a capture capability to the functional reviewer',
    typeof capability?.token === 'string' && capability.token !== '',
    JSON.stringify(froze.captureCapabilities ?? froze),
  )

  const submitted = await wf({
    operation: 'submit_browser_evidence',
    workflowId,
    captureToken: capability?.token,
    snapshot: capture(button),
  })
  const verified = await wf({ operation: 'verify', workflowId })
  return { submitted, verified }
}

// ---------------------------------------------------------------- the cycle

const goal = await send('goal', {
  operation: 'new',
  objective: 'let people sign in with their own identity provider',
  successCriteria: ['a user signs in with oauth and reaches the dashboard'],
  maxContinuations: 3,
}).then(body)
console.log('0  goal             ', goal.state, '| focused', goal.focused)
accepted('the goal was created', goal)
check('it starts as a draft', goal.state, 'draft')
check('and it is the focused goal for this project', goal.focused, true)

const started = await wf({
  operation: 'start',
  request: 'add a login screen with oauth',
  preference: 'auto',
})
const workflowId = started.workflowId
console.log('1  route            ', started.mode, '|', started.rationale, '| goal', started.goalId === goal.goalId)
accepted('the workflow started', started)
ensure('it came back with an identifier', typeof workflowId === 'string' && workflowId !== '')
check('login and oauth route it to the full cycle', started.mode, 'full')
check('and the focused goal adopted it as a milestone', started.goalId, goal.goalId)

const planned = await wf({ operation: 'submit_plan', workflowId, plan })
accepted('the plan was accepted', planned)
check('which opens execution', planned.state, 'execution')

// Layer three through the real server: the control plane reads the worktree itself, so a path no
// scope authorized sends the task back before anything is frozen.
write('scripts/deploy.sh', 'echo deploying\n')
const trespass = await wf({
  operation: 'report_task',
  workflowId,
  taskKey: 'T1',
  status: 'completed',
  summary: 'also wrote a deploy script',
})
console.log('1a scope violation  ', trespass.state, '|', (trespass.outOfScope ?? []).join(', '))
accepted('the task report was read', trespass)
check('the path no scope authorized is named', trespass.outOfScope, ['scripts/deploy.sh'])
check('and the task is sent back rather than completed', trespass.state, 'repair')
rmSync(join(root, 'scripts'), { force: true, recursive: true })
await wf({ operation: 'control', workflowId, controlOperation: 'repair' })

write('src/auth/Login.tsx', 'export const Login = () => <div onClick={submit}>Sign in</div>\n')
write('src/auth/login.css', '.hint { color: #999999; background-color: #ffffff }\n.f:focus { outline: none }\n')
write('check.mjs', 'process.exit(0)\n')
write('security-scan.mjs', 'process.exit(0)\n')

const first = await verifiedCandidate(workflowId, node('button', ''))
const frozen = await wf({ operation: 'status', workflowId })
console.log('2  accessibility    ', JSON.stringify(first.submitted.accessibility))
console.log('3  verify           ', first.verified.mandatoryPassed, '|', first.verified.reason)
accepted('the capture was recorded', first.submitted)
accepted('and the candidate was verified', first.verified)
// The party a gate exists to check cannot be the party that clears it. A capture submitted without
// the capability the freeze issued is the executor reporting on its own work, and it proves nothing.
check('the capture counts as a reviewer driving the flow', first.submitted.capturedBy, 'functional_reviewer')
ensure(
  'a control with no accessible name is a high finding',
  (first.submitted.accessibility ?? []).some(
    (finding) => finding.severity === 'high' && finding.rule === 'a11y/unnamed-control',
  ),
  JSON.stringify(first.submitted.accessibility),
)
check('so this candidate does not pass its mandatory gates', first.verified.mandatoryPassed, false)
ensure(
  'and it is the accessibility gate that refused it',
  String(first.verified.reason).includes('accessibility:affected-user-flow'),
  String(first.verified.reason),
)
// Read after the verification, so this is where a failed candidate has landed.
check('a failed verification sends the workflow to repair', frozen.state, 'repair')
check('and it costs a repair cycle, as the scope violation did', frozen.repair.used, 2)

// The repair loop: back to execution, name the control, freeze and capture again.
await wf({ operation: 'control', workflowId, controlOperation: 'repair' })
const second = await verifiedCandidate(workflowId, node('button', 'Sign in'))
console.log('4  verify           ', second.verified.mandatoryPassed, '|', second.verified.reason)
accepted('the repaired candidate was verified', second.verified)
check('a named control clears the interface layer', second.verified.mandatoryPassed, true)

const recorded = await wf({ operation: 'evidence', workflowId })
accepted('the recorded evidence can be read', recorded)
for (const item of recorded.evidence ?? []) {
  console.log(`     ${item.status.padEnd(8)} ${item.mandatory ? 'M' : ' '} ${item.gate}`)
}
const gates = new Map((recorded.evidence ?? []).map((item) => [item.gate, item.status]))
check('the affected flow was driven', gates.get('browser:affected-user-flow'), 'passed')
check('its accessibility tree was inspected', gates.get('accessibility:affected-user-flow'), 'passed')
check('the candidate still matches the bytes it was frozen on', gates.get('integrity:candidate'), 'passed')
check('and its changed content carries no secret', gates.get('security:changed-content-secrets'), 'passed')

const approval = approvalFor(recorded.evidence ?? [])
await wf({ operation: 'submit_review', workflowId, role: 'functional_reviewer', verdict: approval })

// The security reviewer cannot write files, so it sends the proof's source. The control plane runs
// it inside a disposable copy and deletes the copy afterwards.
const proof = await wf({
  operation: 'run_proof',
  workflowId,
  vulnerabilityClass: 'sql-injection',
  interpreter: 'node',
  script: [
    "import { existsSync, writeFileSync } from 'node:fs'",
    "writeFileSync('OWNED.txt', 'x')",
    "process.exit(existsSync('src/auth/Login.tsx') ? 0 : 1)",
  ].join('\n'),
  rationale: 'the login query concatenates the username',
})
console.log('5  proof            ', proof.demonstrated ? 'DEMONSTRATED' : 'inconclusive', '|', proof.gate)
for (const line of proof.containment ?? []) console.log('     containment:', line)
accepted('the proof ran', proof)
check('it demonstrated the class it claimed', proof.demonstrated, true)
check('under the gate name its class earns', proof.gate, 'security:proof:sql-injection')
check('and a demonstrated proof is recorded as a failing gate', proof.status, 'failed')
ensure('with the containment it actually had stated', (proof.containment ?? []).length > 0)

const dirty = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })
console.log('6  repository clean ', !dirty.includes('OWNED.txt') && !dirty.includes('.cycle-proof'))
ensure('nothing the proof wrote reached the repository', !dirty.includes('OWNED.txt'), dirty)
ensure('and the disposable copy left nothing behind', !dirty.includes('.cycle-proof'), dirty)

// An unproven high is recorded as unproven info, so it does not block this reviewer's own approval.
await wf({
  operation: 'submit_review',
  workflowId,
  role: 'security_reviewer',
  verdict: {
    ...approval,
    findings: [{ severity: 'high', summary: 'maybe an open redirect', evidence_ids: [] }],
  },
})

// Both reviewers approved and the arbiter approves — and the demonstrated proof still refuses it.
const refused = await wf({ operation: 'arbitrate', workflowId, verdict: approval })
console.log('7  arbitration      ', refused.state, '|', refused.refusal ?? 'approved')
accepted('the arbitration was recorded', refused)
check('the arbiter voted to approve', refused.decision, 'approved')
ensure(
  'and the demonstrated proof refused the approval anyway',
  typeof refused.refusal === 'string' && refused.refusal !== '',
  JSON.stringify(refused.refusal),
)
check('so the workflow goes back to repair, not to delivery', refused.state, 'repair')

// The last cycle: the executor fixes what the proof demonstrated, and the new candidate carries no
// demonstrated proof against it.
await wf({ operation: 'control', workflowId, controlOperation: 'repair' })
write('src/auth/query.ts', 'export const byName = (name) => db.prepare("select * from u where n = ?").get(name)\n')
const third = await verifiedCandidate(workflowId, node('button', 'Sign in'))
console.log('8  verify           ', third.verified.mandatoryPassed, '|', third.verified.reason)
accepted('the third candidate was verified', third.verified)
check('with no demonstrated proof against it, the gates pass', third.verified.mandatoryPassed, true)

const final = await wf({ operation: 'evidence', workflowId })
const finalApproval = approvalFor(final.evidence ?? [])
await wf({ operation: 'submit_review', workflowId, role: 'functional_reviewer', verdict: finalApproval })
await wf({ operation: 'submit_review', workflowId, role: 'security_reviewer', verdict: finalApproval })
const arbitrated = await wf({ operation: 'arbitrate', workflowId, verdict: finalApproval })
console.log('9  arbitration      ', arbitrated.state, '|', arbitrated.refusal ?? 'approved')
accepted('the final arbitration was recorded', arbitrated)
check('nothing refuses it this time', arbitrated.refusal, null)
check('so the workflow moves to delivery', arbitrated.state, 'delivery')

const delivered = await wf({ operation: 'deliver', workflowId })
console.log('10 delivery         ', delivered.state, '|', delivered.reason ?? delivered.aborted)
console.log('     bytes intact:  ', read('src/auth/Login.tsx')?.includes('onClick') === true)
const after = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).trim()
const subject = execFileSync('git', ['-C', root, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
console.log('     worktree clean:', after === '', '| commit:', JSON.stringify(subject))
accepted('the delivery ran', delivered)
check('and it completed', delivered.state, 'completed')
ensure('the approved bytes are the bytes on disk', read('src/auth/Login.tsx')?.includes('onClick') === true)
check('the worktree is clean once it committed', after, '')
check('and the commit subject is the request the user wrote', subject, 'add a login screen with oauth')
// The sentence between the subject and the trailers is what a reader a year from now uses to know
// what this commit rested on. It said "on 0 recorded gates" for every commit Cycle ever delivered,
// because it was built from the manifest frozen before verification. Certification row 13.6 on
// 1.0.18 read it and noticed.
const finalGates = (final.evidence ?? []).length
const deliveredBody = execFileSync('git', ['-C', root, 'log', '-1', '--format=%B'], { encoding: 'utf8' })
const gateSentence = /on (\d+) recorded gates/u.exec(deliveredBody)
ensure('the delivered commit states how many gates it rests on', gateSentence !== null, deliveredBody)
check('and that number is the number recorded, not zero', Number(gateSentence?.[1]), finalGates)

const reconciled = await wf({ operation: 'reconcile', workflowId })
console.log('11 reconcile        ', reconciled.state, '| chain', reconciled.chain, '|', reconciled.next)
accepted('reconciliation ran', reconciled)
check('it finds a completed workflow with nothing to finish', reconciled.state, 'completed')
check('and the chain still verifies', reconciled.chain, true)

// What the project learned from this delivery, and what a new request would recall.
const learned = await send('memory', { operation: 'search', query: 'login oauth', paths: ['src/auth'] }).then(body)
console.log('12 memory           ', `${learned.memories.length} recalled`)
for (const item of learned.memories) {
  console.log(`     ${item.confidence.padEnd(13)} ${item.kind.padEnd(16)} ${item.title} [${item.evidenceCount} evidence]`)
}
accepted('memory can be searched', learned)
ensure(
  'the delivery taught the project something',
  (learned.memories ?? []).length > 0,
  JSON.stringify(learned.memories),
)
ensure(
  'and what it learned is backed by gates that passed',
  (learned.memories ?? []).some((item) => item.confidence === 'verified' && item.evidenceCount > 0),
  JSON.stringify(learned.memories),
)

// The goal advanced on the delivered milestone, and completion is a gate, not a formality.
const afterDelivery = await send('goal', { operation: 'status', goalId: goal.goalId }).then(body)
console.log('13 goal             ', afterDelivery.state, '| continuations', JSON.stringify(afterDelivery.continuations), '| milestones', afterDelivery.milestones.map((m) => `${m.name}=${m.state}`).join(', '))
accepted('the goal reports its state', afterDelivery)
check('the delivered workflow completed its milestone', afterDelivery.milestones.map((m) => m.state), ['completed'])
check('and delivering it spent one continuation', afterDelivery.continuations.used, 1)

const requested = await send('goal', { operation: 'complete', goalId: goal.goalId }).then(body)
console.log('14 completion       ', requested.state, '| judge against:', JSON.stringify(requested.judgeAgainst))
accepted('completion can be requested once every milestone is complete', requested)
check('which moves the goal to completing, not to completed', requested.state, 'completing')
check('and hands back the criteria to judge it against', requested.judgeAgainst, goal.successCriteria)

const unapproved = await send('goal', { operation: 'approve', goalId: goal.goalId }).then(body)
console.log('15 without confirm  ', JSON.stringify(unapproved._raw ?? unapproved.state))
ensure(
  'approving without an explicit confirmation is refused',
  String(unapproved._raw ?? '').includes('confirmation'),
  JSON.stringify(unapproved),
)
const approved = await send('goal', { operation: 'approve', goalId: goal.goalId, confirm: true }).then(body)
console.log('16 approved         ', approved.state)
accepted('and with one the goal completes', approved)
check('reaching completed', approved.state, 'completed')

const history = await wf({ operation: 'history', limit: 200 })
console.log(
  '17 history          ',
  `${history.entries.length} entries, chain ${history.chain.valid}, signatures ${history.signatures.valid},`,
  `checkpoint at ${history.checkpoint?.sequence ?? 'none'}`,
)
accepted('the history can be read', history)
check('the hash chain verifies', history.chain.valid, true)
check('every checkpoint signature verifies', history.signatures.valid, true)
ensure('and the record is not empty', (history.entries ?? []).length > 0)
ensure('a delivery anchored the chain with a signed checkpoint', history.checkpoint !== null)

child.stdin.end()
await new Promise((resolve) => child.on('close', resolve))
rmSync(root, { force: true, recursive: true })
rmSync(data, { force: true, recursive: true })

if (failures.length !== 0) {
  console.error(`\n${failures.length} failed:\n${failures.map((line) => `  ${line}`).join('\n')}`)
  process.exit(1)
}
console.log('\none governed cycle: routed, refused, repaired, proved, approved and delivered')
