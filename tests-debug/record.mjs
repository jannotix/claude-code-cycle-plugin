// Records one manual certification result, bound to a row, a platform and a version.
//
//   node tests-debug/record.mjs <row> <win|wsl> <version> <pass|fail> <evidence file>
//
// The matrix binds an attestation to a version, so a result recorded against the wrong one is
// worse than none: it says a row was proved on a build that was never tested. This refuses to
// overwrite an existing entry for the same row, platform and version, and refuses a version that
// does not match the manifest unless `--version-override` is given deliberately.
//
// The evidence is read from a file rather than typed on a command line: it is a paragraph, it is
// what a reader will judge the row by, and a shell that eats a backslash out of it is a way to
// record something nobody wrote.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const RECORDS = join(ROOT, 'documentation', 'certification-results.json')
const MANIFEST = join(ROOT, '.claude-plugin', 'plugin.json')

const [row, platform, version, result, evidencePath, ...flags] = process.argv.slice(2)

if (!row || !platform || !version || !result || !evidencePath) {
  console.error('usage: node tests-debug/record.mjs <row> <win|wsl> <version> <pass|fail> <evidence file>')
  process.exit(2)
}
if (!['win', 'wsl'].includes(platform)) {
  console.error(`platform must be win or wsl, not ${platform}`)
  process.exit(2)
}
if (!['pass', 'fail'].includes(result)) {
  console.error(`result must be pass or fail, not ${result}`)
  process.exit(2)
}
if (!/^\d+\.\d+$/u.test(row)) {
  console.error(`${row} is not a row identifier`)
  process.exit(2)
}

const manifestVersion = JSON.parse(readFileSync(MANIFEST, 'utf8')).version
if (version !== manifestVersion && !flags.includes('--version-override')) {
  console.error(
    `this tree is ${manifestVersion} and you are recording ${version}. If the run really was ` +
      'against that build, pass --version-override; otherwise re-run it against this one.',
  )
  process.exit(1)
}

const evidence = readFileSync(evidencePath, 'utf8').trim()
if (evidence.length < 80) {
  console.error('the evidence is shorter than eighty characters: say what was run and what it showed')
  process.exit(1)
}

const file = JSON.parse(readFileSync(RECORDS, 'utf8'))
const clash = file.results.find(
  (entry) => entry.row === row && entry.platform === platform && entry.version === version,
)
if (clash && !flags.includes('--alongside')) {
  console.error(
    `${row} on ${platform} is already recorded for ${version}, dated ${clash.date}. ` +
      'Pass --alongside to add a second, independent result next to it.',
  )
  process.exit(1)
}
// A row can legitimately hold two results for one version when they are different evidence for the
// same claim - an operator who watched the application, and a bench that drove the same property
// headlessly. Both are kept. `certify.mjs` reads the last one, so the later and stronger record
// governs while the earlier one stays in the file rather than being overwritten by it.

file.results.push({
  date: new Date().toISOString().slice(0, 10),
  evidence,
  platform,
  result,
  row,
  version,
})
writeFileSync(RECORDS, `${JSON.stringify(file, null, 2)}\n`)
console.log(`recorded ${row} ${result} on ${platform}/${version}; the file now holds ${file.results.length}`)
