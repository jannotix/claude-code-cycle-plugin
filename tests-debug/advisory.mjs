// Runs the five advisory commands against a published archive and asserts the property they exist
// to have: they advise, and they never implement.
//
//   node tests-debug/advisory.mjs <plugin url or installed dist/server.js>
//
// Certification 3.5.
//
// Manual in the matrix because it spends real money — about eight dollars for the five — but the
// procedure never needed a person: a fixture, five sessions, and a check that the tree did not move.
// That was written by hand five times across five releases, so this is it once, with assertions.
//
// Permissions: the default allowed-tools list is explicit rather than a permissive mode, because
// the CLI refuses `bypassPermissions` under root and because a run that could write anything proves
// less about a read-only role than one that could not. Override with CYCLE_ADVISORY_TOOLS.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const TARGET = process.argv[2]
if (!TARGET) {
  console.error('usage: node tests-debug/advisory.mjs <plugin url or installed dist/server.js>')
  process.exit(2)
}

const TOOLS =
  process.env.CYCLE_ADVISORY_TOOLS ??
  [
    'mcp__plugin_cycle_control__role_settings',
    'mcp__plugin_cycle_control__record_event',
    'mcp__plugin_cycle_control__graph_query',
    'mcp__plugin_cycle_control__workflow',
    'Agent',
    'Task',
    'Read',
    'Glob',
    'Grep',
  ].join(',')

const failures = []
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
  'package.json': '{\n  "name": "cart",\n  "private": true,\n  "type": "module"\n}\n',
  'src/cart.js': `const items = []

export function addItem(name, price, quantity) {
  items.push({ name, price, quantity })
}

export function total() {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}
`,
}

const project = mkdtempSync(join(tmpdir(), 'cycle-advisory-'))
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

// ---------------------------------------------------------------- the five consultations

/**
 * Each of the five, with what it must not do and one thing it must say. The boundary pattern is
 * deliberately loose about wording and strict about meaning: the answer has to state that it is
 * advice, because a reader who takes an advisory answer for an approval is the failure mode.
 */
const COMMANDS = [
  {
    boundary: /advisory|not approved|nothing (is|was) (approved|implemented)|cycle:run/iu,
    name: 'architect',
    prompt: 'I want to add a discount code to the cart. What would that involve?',
  },
  {
    boundary: /advisory|nothing (is|was) (implemented|modified|written)|read-only|cycle:run/iu,
    name: 'executor',
    prompt: 'Is it feasible to make total() apply a percentage discount, and what would it touch?',
  },
  {
    boundary: /advisory|not a release (approval|gate)|read-only|nothing was (edited|written)/iu,
    name: 'review',
    prompt: 'Review src/cart.js for correctness and completeness.',
  },
  {
    boundary: /advisory|not a release (approval|gate)|read-only|nothing was (edited|written)/iu,
    name: 'security',
    prompt: 'Review src/cart.js for security and trust-boundary problems.',
  },
  {
    boundary: /not an approval|approval only|not ready|governed cycle/iu,
    name: 'judge',
    prompt: 'Is this ready to release?',
  },
]

const usingUrl = /^https?:\/\//u.test(TARGET)
const pluginArgs = usingUrl ? ['--plugin-url', TARGET] : []

console.log(`fixture ${project}`)
console.log(`target  ${TARGET}`)
console.log(`baseline ${baseline.slice(0, 7)}\n`)

let spent = 0
try {
  for (const command of COMMANDS) {
    const outcome = spawnSync(
      cli,
      ['-p', `/cycle:${command.name} ${command.prompt}`, ...pluginArgs, '--allowedTools', TOOLS, '--output-format', 'json'],
      { cwd: project, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 1_800_000 },
    )
    const line = (outcome.stdout ?? '').split('\n').find((text) => text.trim().startsWith('{'))
    let answer = { is_error: true, result: `${outcome.stdout ?? ''}${outcome.stderr ?? ''}`.slice(0, 300) }
    try {
      answer = JSON.parse(line)
    } catch {
      // answer stays as the failure shape above, which is what the assertions will report.
    }
    spent += answer.total_cost_usd ?? 0
    const text = String(answer.result ?? '')

    console.log(`/cycle:${command.name}  ${(answer.total_cost_usd ?? 0).toFixed(2)} USD, ${text.length} chars`)
    ensure(`  ${command.name} answered`, answer.is_error !== true, text.slice(0, 200))
    ensure(`  ${command.name} said something substantial`, text.length > 400, `${text.length} chars`)
    ensure(`  ${command.name} stated its advisory boundary`, command.boundary.test(text), text.slice(-250))

    // The property the row exists for, checked after every single one rather than once at the end:
    // an advisory command that writes has already broken the boundary, and knowing which one it was
    // is the difference between a finding and a mystery.
    ensure(`  ${command.name} left the worktree clean`, git('status', '--porcelain') === '', git('status', '--porcelain'))
    ensure(`  ${command.name} left HEAD where it was`, git('rev-parse', 'HEAD') === baseline)
  }

  console.log(`\ntotal ${spent.toFixed(2)} USD`)
} finally {
  if (failures.length === 0) rmSync(project, { force: true, recursive: true })
}

console.log('')
if (failures.length > 0) {
  console.log(`${failures.length} failed — the fixture is kept at ${project}`)
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(1)
}
console.log(`five advisory commands, ${spent.toFixed(2)} USD, nothing implemented`)
