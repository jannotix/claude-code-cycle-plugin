// Installs this version from its own marketplace manifest into a throwaway configuration
// directory, and checks that what arrives is what the source tree declares.
//
//   node tests-debug/marketplace.mjs production/dist/server.js
//
// Certification 1.3, 1.4, 1.5, 1.14 and 2.10.
//
// These three rows were manual until 1.0.23, and were re-closed by hand after every one of the four
// releases before it, because the matrix binds an attestation to a version. Nothing about them
// needed a human: the procedure was `marketplace add`, `install`, then read the component inventory
// back. That is this file, with assertions and a non-zero exit, per the A1 lesson.
//
// It needs the CLI and the network, and it fails rather than skips without them: a row that quietly
// passed on a host that was never asked would be worse than one that says it is still open. It also
// needs this version's archive to be *published*, because the marketplace manifest pins a release
// URL and a digest — so before a release it fails, correctly, saying the version cannot be
// installed from the marketplace yet.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const SERVER = process.argv[2]
if (!SERVER) {
  console.error('usage: node tests-debug/marketplace.mjs <path to dist/server.js>')
  process.exit(2)
}

const PLUGIN = resolve(dirname(dirname(SERVER)))

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
ensure('the Claude Code CLI is available to certify against', cli !== null, 'set CLAUDE_CLI to its path')
if (cli === null) {
  console.log('\n1 failed')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
const marketplace = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'marketplace.json'), 'utf8'))
const version = manifest.version
const reference = `${marketplace.plugins[0].name}@${marketplace.name}`

// The configuration directory is a fresh temporary one, so nothing here touches the machine's own
// installation and the row is a statement about a clean install rather than about this machine.
const config = mkdtempSync(join(tmpdir(), 'cycle-marketplace-'))
const run = (args, timeout = 600_000) => {
  try {
    return {
      ok: true,
      output: execFileSync(cli, args, {
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_CONFIG_DIR: config },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout,
      }),
    }
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}
const settings = () => {
  const path = join(config, 'settings.json')
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
}

try {
  // ---------------------------------------------------------------- 1.3: it installs

  console.log(`\nmarketplace (${reference} ${version}, config ${config})`)

  const added = run(['plugin', 'marketplace', 'add', PLUGIN])
  ensure('the marketplace is added from the source tree', added.ok, added.output.trim().slice(-300))
  ensure(
    'and the isolated configuration records it',
    settings().extraKnownMarketplaces?.[marketplace.name] !== undefined,
    JSON.stringify(settings().extraKnownMarketplaces ?? null),
  )

  // Installed with two options, because "installs" and "installs configured" are different claims
  // and only the second says the user's settings survive the install that wrote them.
  const installed = run([
    'plugin',
    'install',
    reference,
    '--config',
    'gate_strictness=strict',
    '--config',
    'architect_effort=max',
  ])
  ensure(
    `${reference} installs from the marketplace`,
    installed.ok,
    installed.output.trim().slice(-300) ||
      `is the archive for ${version} published, with the digest the manifest pins?`,
  )

  const record = existsSync(join(config, 'plugins', 'installed_plugins.json'))
    ? JSON.parse(readFileSync(join(config, 'plugins', 'installed_plugins.json'), 'utf8'))
    : { plugins: {} }
  const entry = record.plugins?.[reference]?.[0] ?? null

  ensure('the install is recorded', entry !== null, JSON.stringify(record.plugins ?? {}))
  check('and the version installed is the one this tree declares', entry?.version ?? null, version)
  ensure(
    'and it was unpacked inside the isolated configuration, not anywhere else',
    typeof entry?.installPath === 'string' &&
      entry.installPath.replaceAll('\\', '/').startsWith(config.replaceAll('\\', '/')),
    String(entry?.installPath),
  )
  ensure('and the plugin is enabled', settings().enabledPlugins?.[reference] === true)
  check(
    'and the options given at install are persisted',
    settings().pluginConfigs?.[reference]?.options ?? null,
    { gate_strictness: 'strict', architect_effort: 'max' },
  )

  // ---------------------------------------------------------------- 1.4, 1.5: what arrived

  console.log('\ncomponent inventory')

  const details = run(['plugin', 'details', reference], 300_000)
  ensure('the host reports the installed plugin', details.ok, details.output.trim().slice(-300))

  // Read from the source tree rather than written here: a count in two places is a count that
  // drifts, and the row is "every component is there", not "twenty-four things are there".
  const declared = (kind, extension) =>
    readdirSync(join(PLUGIN, kind), { withFileTypes: true })
      .filter((item) => (extension === null ? item.isDirectory() : item.name.endsWith(extension)))
      .map((item) => (extension === null ? item.name : item.name.slice(0, -extension.length)))
      .sort()

  /** `  Skills (24)  a, b, c` — the count and the names the host actually resolved. */
  const inventory = (label) => {
    const line = details.output.split('\n').find((text) => text.trim().startsWith(`${label} (`))
    if (line === undefined) return null
    const count = Number(line.match(/\((\d+)\)/u)?.[1] ?? -1)
    const names = (line.split(')').slice(1).join(')') ?? '')
      .split(',')
      .map((name) => name.trim().split('  ')[0].trim())
      .filter(Boolean)
      .sort()
    return { count, names }
  }

  const skills = inventory('Skills')
  const agents = inventory('Agents')

  ensure('the inventory lists skills', skills !== null, details.output.trim().slice(0, 300))
  ensure('the inventory lists agents', agents !== null, details.output.trim().slice(0, 300))

  if (skills !== null) {
    const declaredSkills = declared('skills', null)
    check('every skill in the tree appears under the plugin namespace', skills.names, declaredSkills)
    check('and the host counts the same number', skills.count, declaredSkills.length)
  }
  if (agents !== null) {
    const declaredAgents = declared('agents', '.md')
    check('every agent in the tree appears as a custom agent', agents.names, declaredAgents)
    check('and the host counts the same number', agents.count, declaredAgents.length)
  }

  // ---------------------------------------------------------------- 1.14, 2.10: what a person saw

  // These two rows exist because 1.6 and 2.2 are manual, and half of each is not manual at all.
  // What no process can do is look at the `/plugin` errors tab or watch a prompt appear on enable;
  // what any process can do is start the installed plugin and read the configuration back after the
  // one that wrote it has exited. Splitting the checkable half out means a version bump reopens less
  // of what a human has to redo, and the human rows keep only the part that genuinely needs eyes.
  console.log('\nthe installed plugin, from a separate process')

  const health = run(['mcp', 'list'], 300_000)
  const line = health.output.split('\n').find((text) => text.includes('plugin:cycle:control')) ?? ''
  ensure('the installed plugin starts its server and it answers', line.includes('✔'), line || health.output.slice(0, 300))
  ensure(
    'and the server it started is the installed one, not the source tree',
    line.replaceAll('\\', '/').includes(config.replaceAll('\\', '/')),
    line,
  )

  // A component the host cannot load is what puts an entry in the errors tab, and --strict makes a
  // warning a failure too. Run against the unpacked copy rather than the tree it was built from.
  const unpacked = String(entry?.installPath ?? '')
  const validated = run(['plugin', 'validate', unpacked, '--strict'], 300_000)
  ensure(
    'every component of the installed copy validates, with no warning either',
    validated.ok && /Validation passed/u.test(validated.output),
    validated.output.trim().slice(-300),
  )

  // The install process has exited; this is a new one reading what it left behind.
  // Compared as sorted pairs: the host writes them in the order they were given, and a record that
  // failed on key order would be asserting something nobody promised.
  const persisted = Object.entries(settings().pluginConfigs?.[reference]?.options ?? {}).sort()
  check('the configured values are still there for a later process', persisted, [
    ['architect_effort', 'max'],
    ['gate_strictness', 'strict'],
  ])
  ensure(
    'and the plugin is still enabled for it',
    settings().enabledPlugins?.[reference] === true,
    JSON.stringify(settings().enabledPlugins ?? null),
  )
} finally {
  rmSync(config, { force: true, recursive: true })
}

console.log('')
if (failures.length > 0) {
  console.log(`${failures.length} failed`)
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(1)
}
console.log(`${reference} ${version} installs from its marketplace with every component present`)
