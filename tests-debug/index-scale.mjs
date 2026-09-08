// Certification row 8.7, the manual one: a 500,000-file corpus indexes in the background and the
// delta reindex after a single change is bounded.
//
//   node --experimental-strip-types tests-debug/index-scale.mjs [files] [--keep]
//
// Defaults to 500000 files. Generation is the slow part and is reported separately from indexing.
// The corpus is a throwaway directory under the system temp folder, removed at the end unless
// --keep is passed.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { mkdir, writeFile, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { indexProject } from '../src/intel/indexer.ts'
import { ParsePool } from '../src/intel/pool.ts'
import { Database } from '../src/store/database.ts'

const total = Number(process.argv[2] ?? 500_000)
const keep = process.argv.includes('--keep')
if (!Number.isInteger(total) || total < 1) {
  console.error('usage: node tests-debug/index-scale.mjs [files] [--keep]')
  process.exit(2)
}

const PER_DIRECTORY = 500
const PROJECT = 'scale'

const seconds = (ms) => `${(ms / 1_000).toFixed(1)}s`
const rate = (count, ms) => `${Math.round(count / (ms / 1_000)).toLocaleString()} files/s`

// ---------------------------------------------------------------- corpus

const root = mkdtempSync(join(tmpdir(), 'cycle-scale-'))
console.log(`corpus: ${root}`)
console.log(`generating ${total.toLocaleString()} files...`)

const generateStarted = Date.now()
let written = 0
for (let start = 0; start < total; start += PER_DIRECTORY) {
  const directory = join(root, 'src', `p${String(Math.floor(start / PER_DIRECTORY)).padStart(5, '0')}`)
  await mkdir(directory, { recursive: true })

  const batch = []
  for (let index = start; index < Math.min(total, start + PER_DIRECTORY); index += 1) {
    batch.push(
      writeFile(
        join(directory, `m${index}.ts`),
        `export function symbol${index}(value: number): number {\n  return value + ${index}\n}\n`,
        'utf8',
      ),
    )
  }
  await Promise.all(batch)

  written += batch.length
  if (written % 25_000 === 0 || written === total) {
    const elapsed = Date.now() - generateStarted
    console.log(`  ${written.toLocaleString()} written  ${seconds(elapsed)}  ${rate(written, elapsed)}`)
  }
}
const generated = Date.now() - generateStarted
console.log(`generated in ${seconds(generated)} (${rate(total, generated)})`)

// The corpus is a git repository because Cycle indexes repositories and nothing else: since
// 1.0.23 a directory git will not answer for is refused rather than walked, and this bench found
// that the moment the fallback was removed - it reported zero files indexed and an unbounded delta
// against a corpus that was never a repository. Untracked files count, so nothing is committed:
// generating half a million files is already the slow part.
execFileSync('git', ['init', '--quiet'], { cwd: root, stdio: 'ignore' })
execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root, stdio: 'ignore' })

// ---------------------------------------------------------------- first index

const database = new Database({ path: join(root, '.cycle-scale.db') })
const pool = new ParsePool()

try {
  console.log('\nfirst index...')
  const firstStarted = Date.now()
  let reported = 0
  const first = await indexProject(database, PROJECT, root, {
    pool,
    onProgress: (done, count) => {
      if (done - reported < 25_000 && done !== count) return
      reported = done
      const elapsed = Date.now() - firstStarted
      console.log(`  ${done.toLocaleString()}/${count.toLocaleString()}  ${seconds(elapsed)}  ${rate(done, elapsed)}`)
    },
  })
  const firstElapsed = Date.now() - firstStarted
  console.log(
    `first index: ${first.files.toLocaleString()} files, ${first.nodes.toLocaleString()} nodes, ` +
      `${first.edges.toLocaleString()} edges in ${seconds(firstElapsed)} (${rate(first.files, firstElapsed)})`,
  )

  // ---------------------------------------------------------------- delta

  const touched = join(root, 'src', 'p00000', 'm0.ts')
  await writeFile(touched, 'export function symbol0(value: number): number {\n  return value + 1\n}\n', 'utf8')
  await utimes(touched, new Date(), new Date())

  console.log('\ndelta index after one changed file...')
  const deltaStarted = Date.now()
  const delta = await indexProject(database, PROJECT, root, { pool })
  const deltaElapsed = Date.now() - deltaStarted

  console.log(
    `delta index: ${delta.updated} reparsed, ${delta.unchanged.toLocaleString()} unchanged, ` +
      `in ${seconds(deltaElapsed)}`,
  )
  console.log(
    `  where it went: scan ${seconds(delta.spent.scan)} · parse ${seconds(delta.spent.parse)} ` +
      `· edges ${seconds(delta.spent.edges)}`,
  )
  console.log(
    `  first index went: scan ${seconds(first.spent.scan)} · parse ${seconds(first.spent.parse)} ` +
      `· edges ${seconds(first.spent.edges)}`,
  )

  // ---------------------------------------------------------------- verdict

  const bounded = delta.updated <= 2 && deltaElapsed < firstElapsed / 10
  console.log('\n--- certification 8.7 ---')
  console.log(`files indexed        ${first.files.toLocaleString()}`)
  console.log(`first index          ${seconds(firstElapsed)}`)
  console.log(`delta reindex        ${seconds(deltaElapsed)}  (${delta.updated} files reparsed)`)
  console.log(`delta is bounded     ${bounded}`)
  if (!bounded) process.exitCode = 1
} finally {
  database.close()
  await pool.dispose()
  if (keep) console.log(`\ncorpus kept at ${root}`)
  else {
    // Removing half a million files can exhaust Windows handles mid-way, and a cleanup that throws
    // would bury the result the run exists to report. Say it and leave the directory named.
    try {
      rmSync(root, { force: true, recursive: true })
    } catch (error) {
      console.log(`\ncorpus left at ${root}: ${String(error.message).slice(0, 140)}`)
    }
  }
}
