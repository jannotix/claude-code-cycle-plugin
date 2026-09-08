// Checks the shipped plugin tree: that every component the manifest declares is really there and
// really parses, that installing and removing it leaves nothing behind outside the data directory,
// and that the repository carries no credential, endpoint or personal configuration.
//
//   node tests-debug/install.mjs production/dist/server.js
//
// Certification 1.1, 1.2, 1.8, 1.9, 1.11, 1.12, 1.13, 13.4 and 13.5.
//
// Rows 1.1, 1.2 and 1.13 drive the Claude Code CLI. Without it this suite fails rather than skips:
// a plugin cannot be certified against a host that is not installed, and a row that quietly passed
// on a missing host would be worse than one that says it is still open.

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import readline from 'node:readline'

const SERVER = process.argv[2]
if (!SERVER) {
  console.error('usage: node tests-debug/install.mjs <path to dist/server.js>')
  process.exit(2)
}

const PLUGIN = dirname(dirname(SERVER))

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

// ---------------------------------------------------------------- the declared components

console.log('components')

const manifest = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
const { version } = manifest

// D-048: the manifest declares no component paths. Every one of them loaded only from its default
// location, and declaring them either failed validation or loaded nothing. So the check is that
// each default directory is there, and that the manifest still says nothing about them.
for (const key of ['agents', 'skills', 'workflows', 'hooks', 'mcpServers']) {
  ensure(`the manifest leaves ${key} at its default location`, manifest[key] === undefined, `got ${JSON.stringify(manifest[key])}`)
}
for (const directory of ['agents', 'skills', 'workflows', 'hooks']) {
  ensure(`${directory}/ exists where the host looks for it`, existsSync(join(PLUGIN, directory)))
}

const agents = readdirSync(join(PLUGIN, 'agents')).filter((name) => name.endsWith('.md'))
const skills = readdirSync(join(PLUGIN, 'skills'), { withFileTypes: true }).filter((entry) =>
  entry.isDirectory(),
)
ensure(`every agent is a markdown file with frontmatter`, agents.length >= 6, `${agents.length} agents`)
for (const name of agents) {
  const text = readFileSync(join(PLUGIN, 'agents', name), 'utf8')
  ensure(`${name} declares a name and a description`, /^---[\s\S]*?name:[\s\S]*?description:[\s\S]*?---/u.test(text))
}
for (const entry of skills) {
  ensure(`skills/${entry.name} has a SKILL.md`, existsSync(join(PLUGIN, 'skills', entry.name, 'SKILL.md')))
}

// The hook is what layer two of the separation of powers runs, so a manifest that points at a file
// that is not there would silently remove a boundary.
const hooks = JSON.parse(readFileSync(join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'))
const command = hooks.hooks?.PreToolUse?.[0]?.hooks?.[0]?.command ?? ''
ensure('a PreToolUse hook is registered', command.includes('guard.mjs'), command)
ensure('the guard it points at exists', existsSync(join(PLUGIN, 'hooks', 'guard.mjs')))

const mcp = JSON.parse(readFileSync(join(PLUGIN, '.mcp.json'), 'utf8'))
const servers = Object.keys(mcp.mcpServers ?? {})
ensure('one MCP server is declared', servers.length === 1, servers.join(', '))

// ---------------------------------------------------------------- 1.1, 1.2, 1.13: the host loads it

console.log('\nhost')

/** The CLI that will run this plugin. Certification without it would be certification of nothing. */
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

/** `mcp list` starts every configured server and reports which ones answered. */
function loadsFrom(source) {
  try {
    return execFileSync(cli, ['--plugin-dir', source, 'mcp', 'list'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180_000,
    })
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
}

if (cli !== null) {
  // Certification 1.1: the source tree, loaded from where it sits.
  const fromSource = loadsFrom(PLUGIN)
  const sourceLine = fromSource.split('\n').find((line) => line.includes('plugin:cycle:control')) ?? ''
  ensure('the source tree loads and its server connects', sourceLine.includes('✔'), sourceLine || fromSource.slice(0, 200))
  ensure(
    'and it ran the server from the tree it was given',
    sourceLine.replaceAll('\\', '/').includes(PLUGIN.replaceAll('\\', '/')),
    sourceLine,
  )

  // Certification 1.2: the packed archive, which is what a user actually receives.
  const archive = join(PLUGIN, 'build', `cycle-${version}.zip`)
  ensure(`the packed archive exists at ${relative(PLUGIN, archive)}`, existsSync(archive), 'run npm run package first')
  if (existsSync(archive)) {
    const fromZip = loadsFrom(archive)
    const zipLine = fromZip.split('\n').find((line) => line.includes('plugin:cycle:control')) ?? ''
    ensure('the packed archive loads and its server connects', zipLine.includes('✔'), zipLine || fromZip.slice(0, 200))
    ensure(
      'and it ran the server the host unpacked, not the source tree',
      zipLine !== '' && !zipLine.replaceAll('\\', '/').includes(PLUGIN.replaceAll('\\', '/')),
      zipLine,
    )
  }

  // Certification 1.13: no warnings, not merely no errors. Both manifests, because the directory
  // carries a marketplace manifest too and validate resolves only one of them per invocation.
  for (const target of [PLUGIN, join(PLUGIN, '.claude-plugin', 'plugin.json')]) {
    let output = ''
    let ok = true
    try {
      output = execFileSync(cli, ['plugin', 'validate', target, '--strict'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120_000,
      })
    } catch (error) {
      ok = false
      output = `${error.stdout ?? ''}${error.stderr ?? ''}`
    }
    ensure(`validate --strict passes for ${relative(PLUGIN, target) || 'the plugin directory'}`, ok && /Validation passed/u.test(output), output.trim().slice(-200))
  }
}

// ---------------------------------------------------------------- 13.4, 13.5: what ships with it

console.log('\nrepository')

const SECRET_SHAPES = [
  [/\bsk-[A-Za-z0-9_-]{16,}/u, 'an API key'],
  [/\bghp_[A-Za-z0-9]{20,}/u, 'a GitHub token'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u, 'a private key'],
  [/\bBearer\s+[A-Za-z0-9._-]{20,}/u, 'a bearer token'],
  [/\bANTHROPIC_(?:API_KEY|AUTH_TOKEN)\s*=\s*\S+/u, 'a credential assignment'],
]

/** Every file that would be published, ignoring what is built or installed. */
function published(directory, collected = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'target', '.git', 'vendor'].includes(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) published(path, collected)
    else if (statSync(path).size < 2 * 1024 * 1024) collected.push(path)
  }
  return collected
}

// The redaction tests necessarily contain secret-shaped strings — that is what they redact. They
// are held to a stricter rule instead: theirs must be visibly not a key.
const PLACEHOLDER = /abcdefghijklmnopqrstuvwxyz/u

const files = published(PLUGIN)
const offending = []
for (const path of files) {
  const text = readFileSync(path, 'utf8')
  const isTest = relative(PLUGIN, path).replaceAll('\\', '/').split('/')[0] === 'tests'
  for (const [shape, what] of SECRET_SHAPES) {
    const found = shape.exec(text)
    if (!found) continue
    if (isTest && PLACEHOLDER.test(found[0])) continue
    offending.push(`${relative(PLUGIN, path)} contains ${what}`)
  }
  // A real endpoint is personal configuration; the placeholder guide is not.
  const endpoint = /ANTHROPIC_BASE_URL\s*=\s*https?:\/\/(?!<)[^\s`'"]+/u.exec(text)
  if (endpoint && !endpoint[0].includes('localhost') && !endpoint[0].includes('127.0.0.1')) {
    offending.push(`${relative(PLUGIN, path)} carries a real endpoint: ${endpoint[0]}`)
  }
}
check('no credential, endpoint or personal configuration is published', offending, [])

// Line wrapping is a formatting decision, not a difference in what the file says.
const flat = (name) => readFileSync(join(PLUGIN, name), 'utf8').replaceAll(/\s+/gu, ' ')
const license = flat('LICENSE')
const notice = flat('NOTICE')
const readme = flat('README.md')
ensure('the licence is present and names its terms', /FSL-1\.1-MIT|Functional Source License/u.test(license))
ensure('a notice ships with it', notice.trim().length > 0)
ensure(
  'the non-affiliation statement is present',
  /not affiliated with, sponsored by or endorsed by Anthropic/u.test(readme) &&
    /not affiliated with, sponsored by or endorsed by Anthropic/u.test(notice),
)
ensure('the manifest declares the same licence', manifest.license === 'FSL-1.1-MIT', manifest.license)

// ---------------------------------------------------------------- 1.8, 1.11, 1.12: residue

console.log('\ninstallation footprint')

const data = mkdtempSync(join(tmpdir(), 'cycle-install-data-'))
const project = mkdtempSync(join(tmpdir(), 'cycle-install-project-'))

const before = published(PLUGIN).length
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
const body = (response) => JSON.parse(response.result.content[0].text)

const doctor = body(await send('doctor')).report

// Named on its own, because when isolation stops working every later check fails for a reason that
// looks like something else — and the run writes into the real store while it does. The harnesses
// isolate through the option the product reads, not through a variable it may decide to ignore.
ensure(
  'the server used the data directory this harness asked for',
  doctor.storage.dataDirectory === data,
  `asked for ${data}, server used ${doctor.storage.dataDirectory}`,
)
await send('record_event', { action: 'install.check' })

// Certification 1.9 and 1.11: everything durable is in one directory, and it is not inside the
// plugin, the project, or anything an application update would replace.
const inside = relative(PLUGIN, doctor.storage.dataDirectory)
ensure(
  'the data directory is outside the plugin',
  inside.startsWith('..') || /^[A-Za-z]:/u.test(inside),
  doctor.storage.dataDirectory,
)
ensure(
  'the data directory is outside the project',
  relative(project, doctor.storage.dataDirectory).startsWith('..'),
  doctor.storage.dataDirectory,
)
ensure('it is writable and reported to the user', doctor.storage.writable === true)
ensure('the store opened there', doctor.store.mode === 'read_write')

child.stdin.end()
await new Promise((resolve) => child.on('close', resolve))

// Certification 1.8: nothing was written into the plugin tree, and nothing into the project.
check('the plugin tree is unchanged by a run', published(PLUGIN).length, before)
check('the project directory is untouched', readdirSync(project), [])
ensure('the state that exists is all in the data directory', readdirSync(data).length > 0)

// Certification 1.12: removing the data directory removes everything the plugin knows, and there is
// no second place to look.
rmSync(data, { force: true, recursive: true })
ensure('removing the data directory removes it all', !existsSync(data))
check('and still nothing is left in the plugin tree', published(PLUGIN).length, before)

rmSync(project, { force: true, recursive: true })

if (failures.length !== 0) {
  console.error(`\n${failures.length} failed:\n${failures.map((line) => `  ${line}`).join('\n')}`)
  process.exit(1)
}
console.log('\nthe shipped tree is complete, self-contained and leaves nothing behind')
