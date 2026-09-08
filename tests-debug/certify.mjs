// Executes the certification matrix and reports what is actually green.
//
//   node tests-debug/certify.mjs [--audit] [--json <path>]
//
// Every row in CERTIFICATION.md is matched against evidence: an automated row must be claimed by a
// `Certification <row>` reference in a test or a harness, and the suite holding it must pass; a
// manual row must have a recorded result for this platform in certification-results.json. A row
// that claims to be automated with nothing behind it is the whole reason this exists, so it blocks
// the run rather than being counted as tested.
//
//   --audit          map rows to evidence without running anything
//   --json <path>    write the verdicts as JSON

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The repository root: this file lives in tests-debug/ inside it. Both are the same directory
// now that the benches and the matrix are versioned alongside what they certify.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PRODUCTION = ROOT
const MATRIX = join(ROOT, 'documentation', 'CERTIFICATION.md')
const RECORDS = join(ROOT, 'documentation', 'certification-results.json')

const audit = process.argv.includes('--audit')
const jsonAt = process.argv.indexOf('--json')

// ---------------------------------------------------------------- the platform this run describes

const wsl =
  process.platform === 'linux' &&
  (() => {
    try {
      return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')
    } catch {
      return false
    }
  })()

const platform = process.platform === 'win32' ? 'win' : wsl ? 'wsl' : process.platform
const version = JSON.parse(
  readFileSync(join(PRODUCTION, '.claude-plugin', 'plugin.json'), 'utf8'),
).version

// ---------------------------------------------------------------- the matrix

/** Rows are `| id | … | win | wsl |`; the columns between differ per section and are joined. */
function readMatrix() {
  const rows = []
  let section = ''
  for (const line of readFileSync(MATRIX, 'utf8').split('\n')) {
    const heading = /^## (\d+)\. (.+)$/u.exec(line.trim())
    if (heading) section = `${heading[1]}. ${heading[2]}`
    const cells = line.split('|').map((cell) => cell.trim())
    if (cells.length < 5 || !/^\d+\.\d+$/u.test(cells[1] ?? '')) continue
    const body = cells.slice(1, -1)
    rows.push({
      check: body.slice(1, -2).join(' — '),
      id: body[0],
      section,
      win: body.at(-2),
      wsl: body.at(-1),
    })
  }
  return rows
}

// ---------------------------------------------------------------- what claims each row

const REFERENCE = /[Cc]ertification\s+(?:rows?\s+)?((?:\d+\.\d+)(?:\s*(?:,|and)\s*\d+\.\d+)*)/gu

function readEvidence() {
  const evidence = new Map()
  const sources = [
    ...readdirSync(join(PRODUCTION, 'tests')).map((name) => ['tests', join(PRODUCTION, 'tests', name)]),
    ...readdirSync(join(ROOT, 'tests-debug'))
      .filter((name) => name.endsWith('.mjs') && name !== 'certify.mjs')
      .map((name) => ['tests-debug', join(ROOT, 'tests-debug', name)]),
  ]

  for (const [kind, path] of sources) {
    const label = `${kind}/${path.split(/[\\/]/u).at(-1)}`
    for (const match of readFileSync(path, 'utf8').matchAll(REFERENCE)) {
      for (const id of match[1].match(/\d+\.\d+/gu) ?? []) {
        if (!evidence.has(id)) evidence.set(id, new Set())
        evidence.get(id).add(label)
      }
    }
  }
  return evidence
}

// ---------------------------------------------------------------- recorded manual results

function readRecords() {
  if (!existsSync(RECORDS)) return []
  return JSON.parse(readFileSync(RECORDS, 'utf8')).results ?? []
}

// ---------------------------------------------------------------- the automated suites

const server = join(PRODUCTION, 'dist', 'server.js')
const harness = (name) => [process.execPath, [join(ROOT, 'tests-debug', name), server], ROOT]

const SUITES = [
  { command: [process.execPath, ['--test', 'tests/*.test.ts'], PRODUCTION], name: 'node --test' },
  { command: harness('cycle-e2e.mjs'), name: 'cycle-e2e' },
  { command: harness('provider-failure.mjs'), name: 'provider-failure' },
  { command: harness('install.mjs'), name: 'install' },
  { command: harness('marketplace.mjs'), name: 'marketplace' },
  { command: harness('platform.mjs'), name: 'platform' },
  { command: harness('role-dispatch.mjs'), name: 'role-dispatch' },
  { command: harness('schema-check.mjs'), name: 'schema-check' },
]

function runSuites() {
  const results = {}
  for (const suite of SUITES) {
    const [program, args, cwd] = suite.command
    if (!existsSync(args[0]) && args[0] !== '--test') {
      results[suite.name] = { ok: false, output: `${args[0]} does not exist` }
      console.log(`  ${suite.name.padEnd(18)} MISSING`)
      continue
    }
    process.stdout.write(`  ${suite.name.padEnd(18)}`)
    const outcome = spawnSync(program, args, { cwd, encoding: 'utf8', shell: false })
    const ok = outcome.status === 0
    results[suite.name] = { ok, output: `${outcome.stdout ?? ''}${outcome.stderr ?? ''}` }
    console.log(ok ? 'ok' : `FAILED (exit ${outcome.status})`)
  }
  return results
}

// ---------------------------------------------------------------- the other platform's run

const RESULT_FILE = (name) => join(ROOT, 'documentation', `certification-${name}.json`)

/**
 * Certification 12.9 is a claim about two platforms and cannot be made from one. This reads the
 * other platform's recorded run, if there is one, and compares the runtime it was made on.
 */
function parity() {
  const other = platform === 'win' ? 'wsl' : 'win'
  const path = RESULT_FILE(other)
  if (!existsSync(path)) {
    return { state: 'unrecorded', why: `no recorded run on ${other} to compare against` }
  }
  const previous = JSON.parse(readFileSync(path, 'utf8'))
  const here = process.versions.node.split('.')[0]
  const there = String(previous.node ?? '').split('.')[0]
  return here === there
    ? { state: 'pass', why: `node ${process.versions.node} here, ${previous.node} on ${other}` }
    : {
        state: 'fail',
        why: `node ${process.versions.node} here but ${previous.node} on ${other}: the two installations are not the same runtime`,
      }
}

// ---------------------------------------------------------------- verdict per row

const matrix = readMatrix()
const evidence = readEvidence()
const records = readRecords()

console.log(`Cycle ${version} — certification on ${platform} (node ${process.versions.node})`)
console.log(`${matrix.length} rows\n`)

const suites = audit ? null : runSuites()
const suitesGreen = suites === null || Object.values(suites).every((result) => result.ok)
if (suites !== null) console.log()

const verdicts = matrix.map((row) => {
  const applicability = platform === 'wsl' ? row.wsl : row.win
  const claimed = [...(evidence.get(row.id) ?? [])].sort()

  if (applicability === '—') {
    return { ...row, claimed, state: 'n/a', why: 'not applicable to this platform' }
  }

  if (applicability === 'M') {
    const record = records.findLast((entry) => entry.row === row.id && entry.platform === platform)
    if (record === undefined) {
      return { ...row, claimed, state: 'unrecorded', why: 'manual, no recorded result' }
    }
    if (record.result !== 'pass') {
      return { ...row, claimed, state: 'fail', why: `manual: ${record.note ?? record.result}` }
    }
    // Sign-off requires the result to name the version it was taken on. Nothing checked that, so an
    // attestation made once rode along under every release that followed it — which is how eleven
    // rows recorded against 1.0.0 kept reporting green ten versions later. A result from another
    // version is not a result for this one.
    if (record.version !== version) {
      return {
        ...row,
        claimed,
        state: 'unrecorded',
        why: `manual, last recorded on ${record.version}: sign-off needs a result for ${version}`,
      }
    }
    return { ...row, claimed, state: 'pass', why: `manual, recorded ${record.date} on ${record.version}` }
  }

  if (row.id === '12.9') return { ...row, claimed, ...parity() }

  if (claimed.length === 0) {
    return { ...row, claimed, state: 'unevidenced', why: 'claims automation, nothing references it' }
  }
  if (audit) return { ...row, claimed, state: 'evidenced', why: claimed.join(', ') }
  return suitesGreen
    ? { ...row, claimed, state: 'pass', why: claimed.join(', ') }
    : { ...row, claimed, state: 'fail', why: 'a suite this row depends on failed' }
})

const MARK = {
  evidenced: ' ok ',
  fail: 'FAIL',
  'n/a': ' -- ',
  pass: ' ok ',
  unevidenced: 'GAP ',
  unrecorded: 'OPEN',
}

let section = ''
for (const verdict of verdicts) {
  if (verdict.section !== section) {
    section = verdict.section
    console.log(`\n${section}`)
  }
  const quiet = verdict.state === 'pass' || verdict.state === 'evidenced' || verdict.state === 'n/a'
  console.log(
    `  [${MARK[verdict.state]}] ${verdict.id.padEnd(5)} ${verdict.check.slice(0, 60).padEnd(60)}` +
      (quiet ? '' : `  ${verdict.why}`),
  )
}

const tally = {}
for (const verdict of verdicts) tally[verdict.state] = (tally[verdict.state] ?? 0) + 1
console.log(`\n${Object.entries(tally).map(([state, count]) => `${state}: ${count}`).join('  ·  ')}`)

// Always recorded per platform, because that is what the other platform's run compares against.
if (!audit) {
  writeFileSync(
    RESULT_FILE(platform),
    `${JSON.stringify(
      {
        node: process.versions.node,
        platform,
        tally,
        version,
        rows: verdicts.map(({ id, state, why }) => ({ id, state, why })),
      },
      null,
      2,
    )}\n`,
  )
  console.log(`recorded in ${RESULT_FILE(platform)}`)
}

if (jsonAt !== -1) {
  writeFileSync(
    process.argv[jsonAt + 1],
    `${JSON.stringify(
      {
        node: process.versions.node,
        platform,
        rows: verdicts,
        suites:
          suites === null
            ? null
            : Object.fromEntries(Object.entries(suites).map(([name, result]) => [name, result.ok])),
        tally,
        version,
      },
      null,
      2,
    )}\n`,
  )
  console.log(`written to ${process.argv[jsonAt + 1]}`)
}

const blocking = verdicts.filter(
  (verdict) => verdict.state === 'fail' || verdict.state === 'unevidenced' || verdict.state === 'unrecorded',
)
if (blocking.length !== 0) {
  console.log(`\n${blocking.length} rows block release on ${platform}.`)
  process.exit(1)
}
console.log(`\nEvery row applicable to ${platform} is green.`)
