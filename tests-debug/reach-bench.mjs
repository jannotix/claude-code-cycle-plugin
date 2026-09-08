// The measurement bench for the impact model: does Cycle's reach agree with people, and — the
// question that actually matters — do its unknowns land where human evidence is also missing?
//
//   node tests-debug/reach-bench.mjs selftest
//   node tests-debug/reach-bench.mjs freeze <repo> <frozen.json> --purpose <distribution|taxonomy>
//                                          [--samples 20] [--skip 0]
//   node tests-debug/reach-bench.mjs template <frozen.json> <labeller> <labels.json>
//   node tests-debug/reach-bench.mjs score <frozen.json> <labels-a.json> <labels-b.json> [...]
//
// Block D4. It measures and changes nothing: no part of the product imports this.
//
// ## Why it is shaped this way
//
// The first draft of this protocol labelled each commit with a proxy — "was followed by a fix
// within K commits" — and compared the computed reach against that. The proxy is useful for
// seeding and is not the ground truth: a free-form label makes inter-rater agreement nearly
// meaningless, and it hides that a human often cannot say where a change reaches either.
//
// So there are three layers.
//
// 1. **The machine proposes, and the set is frozen.** For each change the bench produces the
//    candidate consumers — the computed reach plus the neighbours the hub truncation excluded — and
//    freezes them with a digest before anyone looks. From that point the question is no longer
//    "describe the reach" but a sequence of explicit decisions over fixed candidates.
// 2. **Independent labellers classify each candidate** without seeing each other's answers:
//    affected, not-affected, or can't-tell. The third is the most valuable of the three, because it
//    surfaces uncertainty in the reference and not only in Cycle's output: where a human cannot
//    tell either, the sensor is not the thing at fault.
// 3. **Disagreements are kept, not averaged.** They are more informative than easy agreement,
//    because they show exactly where the taxonomy, the candidate generation, or the notion of
//    "affected" is underspecified. Disagreement and high can't-tell rates are the next sampling
//    target.
//
// ## Sampling: two sets, never merged
//
// This is where a reviewer attacked first, and rightly — the protocol is worth exactly as much as
// the distribution it is handed. The first draft had one strategy: seed wide, then let disagreement
// drive the next round. That is wrong for one of the four measures, and the correction is the shape
// of this bench now.
//
// Disagreement-driven sampling builds a corpus of hard cases deliberately. A rate measured on it
// describes the difficulty that was selected for, not the changes Cycle meets in ordinary use. So
// there are two sets and they are never combined:
//
// - `--purpose distribution`, drawn at random from the kinds of change Cycle is expected to handle.
//   This is the only set an unknown rate may be quoted from, and it stays out of the tuning
//   entirely — not merely out of the final report. A set that was tuned on has been selected on.
// - `--purpose taxonomy`, drawn from the lowest-agreement candidates of an earlier round. It exists
//   to sharpen the notion of "affected", and `score` withholds the unknown share from it rather
//   than printing the number with a caveat beside it. A number with a warning attached gets
//   repeated without the warning.
//
// `freeze` demands the purpose and has no default, because which of the two a set was cannot be
// recovered afterwards. The frozen file carries it and `score` refuses to run without it.
//
// No threshold lives here. No unknown rate has been measured yet, and a figure chosen to sound
// reasonable would become a premise the moment it was written down: whether a rate is workable
// depends on the verification it triggers and the cost of resolving each unknown, neither of which
// this bench observes.
//
// ## The measures, in this order
//
// | Measure | What it says |
// | --- | --- |
// | Confidently wrong | reach called resolved, and a candidate outside it labelled affected. The worst way to fail, and the only one that must fall every iteration |
// | Unknown correlation | whether Cycle's unknowns coincide with the humans' can't-tells. If they do, the unknowns are honest; if they fall elsewhere, they are an excuse |
// | Per-candidate agreement | where the notion of "affected" holds and where it does not |
// | Unknown share | the number that decides whether D2 is honest or useless — from a random set only |
//
// A good system does not have to eliminate unknowns. It has to make its unknowns coincide with the
// points where a human has no evidence either. The worst failure is not "I don't know"; it is "I
// know", and being wrong.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const LABELS = ['affected', 'not-affected', "can't-tell"]

/**
 * Two sets, two purposes, and they are never merged into one number.
 *
 * The first draft of this bench had one sampling strategy: seed wide, then let disagreement drive
 * the next round. A reviewer took that apart, and was right. Disagreement-driven sampling builds a
 * corpus of hard cases on purpose, so a rate measured on it describes the difficulty that was
 * selected for and not the changes Cycle actually meets. Improving the taxonomy and estimating how
 * often the taxonomy is strained are different questions, and one corpus cannot answer both.
 *
 * So `freeze` demands a purpose, the frozen file carries it, and `score` refuses to report a
 * distribution number from anything but a random set. The random set also stays out of the tuning
 * entirely, not merely out of the final report: a set used to refine the taxonomy has been selected
 * on, whatever it was called when it was drawn.
 */
const PURPOSES = {
  distribution:
    'random: commits drawn without regard to how hard they look, from the kinds of change Cycle is ' +
    'expected to handle. This is the only set an unknown rate may be quoted from, and it is never ' +
    'used to refine the taxonomy — a set that was tuned on is a set that was selected on.',
  taxonomy:
    'disagreement-driven: commits whose candidates scored lowest on agreement in an earlier round. ' +
    'Deliberately a corpus of hard cases, which is what makes it useful for sharpening the notion ' +
    'of "affected" and useless for saying how often that notion is strained.',
}

const [command, ...rest] = process.argv.slice(2)

const failures = []
const ensure = (label, condition, detail = '') => {
  if (!condition) failures.push(`${label}${detail ? `: ${detail}` : ''}`)
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${label}${condition ? '' : `  ${detail}`}`)
}
const close = () => {
  console.log('')
  if (failures.length > 0) {
    console.log(`${failures.length} failed`)
    for (const failure of failures) console.log(`  - ${failure}`)
    process.exit(1)
  }
}

// ---------------------------------------------------------------- a generator that is not Cycle

/**
 * A second candidate list, built without touching the code graph.
 *
 * This exists because of the sharpest objection the protocol has received. If the only candidates on
 * the sheet are the ones Cycle proposed, a labeller can say affected, not affected or can't tell
 * about Cycle's suggestions and nothing else. Reach Cycle never proposes has no row, so the misses
 * that matter most cannot enter the data at all, and the reference inherits the blind spot of the
 * thing being measured. Agreement then says people apply the taxonomy consistently — never that the
 * taxonomy describes the software.
 *
 * So this list is produced from the repository text alone: files that mention a changed file by
 * path or by basename, and files that mention a symbol whose definition the change touched. It is
 * cruder than the graph on purpose. It resolves nothing, it over-proposes, and it will miss things
 * too — a second imperfect view is not ground truth, it is a second chance for an omission to
 * surface. It runs before Cycle's reach is consulted and never reads it.
 */
function independentCandidates(git, changed, revision) {
  const found = new Set()
  const needles = new Set()

  const search = (needle) => {
    if (needle.length < 4) return []
    try {
      // Against the frozen revision, not the working tree. Without the revision argument git grep
      // searches whatever is checked out, which happened to be right in the freeze flow — the
      // worktree is created at the commit — and wrong for any other caller. A probe caught it
      // proposing a consumer added by a *later* commit: terms read correctly from the past, searched
      // in the present. The `tree:` prefix on every hit is stripped below.
      const out = git('grep', '-l', '-I', '-F', needle, revision)
      return out
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => (line.startsWith(`${revision}:`) ? line.slice(revision.length + 1) : line))
    } catch {
      // git grep exits 1 when nothing matches, which is an answer and not a failure.
      return []
    }
  }

  /** A file as it stood at a revision, read through git so a deleted path still has a version. */
  const show = (rev, path) => {
    try {
      return git('show', `${rev}:${path}`)
    } catch {
      return ''
    }
  }

  /** Definitions this text declares. Its own patterns: nothing here comes from Cycle's extractor. */
  const definitions = (text) => {
    const names = new Set()
    for (const match of text.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gu)) {
      names.add(match[1])
    }
    for (const match of text.matchAll(/^\s*(?:def|func|fn|class|type|struct)\s+([A-Za-z_][\w]*)/gmu)) {
      names.add(match[1])
    }
    return names
  }

  for (const path of changed) {
    const base = path.split('/').pop() ?? path
    for (const needle of [path, base, base.replace(/\.[^.]+$/u, '')]) needles.add(needle)

    // Both revisions, not just the one after. A symbol the change deleted or renamed exists only
    // in the parent, and its consumers are exactly the ones most likely to break — reading only the
    // new tree lost them silently, which is the same shape of blind spot this generator exists to
    // avoid in the first place.
    for (const rev of [`${revision}^`, revision]) {
      for (const name of definitions(show(rev, path))) needles.add(name)
    }
  }

  // Configuration reached by key rather than by import. A consumer that selects a provider from
  // MODEL_PROVIDER never mentions the file that defines the default, so neither a path search nor a
  // symbol search can reach it — and this is the case the whole discussion started from. Taken from
  // the diff itself: the keys and quoted literals the change actually touched.
  // With context, not just the changed lines. A default and the key that names it usually sit on
  // different lines: change `DEFAULT_VALUE = "alpha"` to `"beta"` and the key `MODEL_PROVIDER` two
  // lines up never appears in the diff at all. Reading only `+` and `-` lines lost exactly the term
  // that gives the change its meaning — confirmed by probe before this was written, on a case where
  // the generator proposed nothing at all.
  let diff = ''
  try {
    diff = git('diff', `${revision}^`, revision, '--unified=6')
  } catch {
    diff = ''
  }
  for (const line of diff.split('\n')) {
    if (/^(?:diff |index |---|\+\+\+|@@)/u.test(line)) continue
    for (const match of line.matchAll(/\b([A-Z][A-Z0-9]{3,}(?:_[A-Z0-9]+)*)\b/gu)) needles.add(match[1])
    for (const match of line.matchAll(/["'`]([A-Za-z][\w.-]{3,})["'`]/gu)) needles.add(match[1])
  }

  // Bounded, because a large diff can produce hundreds of needles and each one is a repository-wide
  // grep. Sorted first so the bound is deterministic rather than dependent on iteration order.
  for (const needle of [...needles].sort().slice(0, 200)) {
    for (const hit of search(needle)) found.add(hit)
  }

  for (const path of changed) found.delete(path)
  return [...found].sort()
}

// ---------------------------------------------------------------- freezing candidate sets

/**
 * A worktree at the commit itself, in a temporary directory, so the user's own checkout is never
 * moved. At the commit and not at its parent, because that is where the product stands when it asks
 * this question: `verify` runs against the tree with the change applied, over an index of that
 * tree. Indexing the parent instead made every added file unresolved by construction — a property
 * of the measurement, not of the sensor, and exactly the kind of artefact that turns a bench into a
 * misleading number.
 */
async function freeze(repoPath, outPath, samples, skip, purpose) {
  const repo = resolve(repoPath)
  const { indexProject } = await import('../dist/intel/indexer.js')
  const { impactOf } = await import('../dist/intel/query.js')
  const { reachOf } = await import('../dist/evidence/reach.js')
  const { Database } = await import('../dist/store/database.js')
  const cycleVersion = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version

  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
  const commits = git('log', '--format=%H', `-n${samples}`, `--skip=${skip}`, '--no-merges').split('\n').filter(Boolean)

  const entries = []
  for (const [at, commit] of commits.entries()) {
    const changed = git('diff', '--name-only', `${commit}^`, commit).split('\n').filter(Boolean)
    if (changed.length === 0) continue

    const tree = mkdtempSync(join(tmpdir(), 'cycle-bench-'))
    const database = new Database({ path: ':memory:' })
    try {
      git('worktree', 'add', '--detach', '--quiet', tree, commit)
      const report = await indexProject(database, 'bench', tree)
      if (report.refused !== undefined) {
        console.log(`  ${at + 1}/${commits.length} ${commit.slice(0, 8)}  skipped: ${report.refused}`)
        continue
      }

      // The independent list first, and deliberately before anything reads the graph: it must not
      // be able to see what Cycle proposed, even by accident of ordering.
      const independent = independentCandidates(
        (...args) => execFileSync('git', ['-C', tree, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim(),
        changed,
        commit,
      )

      const computed = reachOf(database, 'bench', changed)
      // Cycle's own list is deliberately wider than what it would act on: the untruncated impact as
      // well. A candidate the hub truncation excluded is exactly the kind a labeller should be asked
      // about, because that is where the policy chose not to look.
      const untruncated = [...new Set(impactOf(database, 'bench', changed, 2).map((node) => node.path))]
      const fromCycle = [...new Set([...untruncated, ...computed.paths])].filter((path) => !changed.includes(path))

      // Union, with provenance kept beside the sheet and never on it. Which generator proposed a
      // candidate is exactly what a labeller must not know: told that Cycle found one and grep found
      // another, they are no longer answering a question about the software.
      const sources = {}
      for (const path of fromCycle) sources[path] = ['cycle']
      for (const path of independent) sources[path] = [...(sources[path] ?? []), 'independent']

      // Ordered by a digest of the path rather than alphabetically, so neither generator's habits
      // nor the order they ran in leaks through position on the sheet.
      const candidates = Object.keys(sources).sort((left, right) =>
        createHash('sha256').update(`${commit}:${left}`).digest('hex') <
        createHash('sha256').update(`${commit}:${right}`).digest('hex')
          ? -1
          : 1,
      )

      const onlyIndependent = candidates.filter((path) => !sources[path].includes('cycle')).length

      entries.push({
        candidates,
        changed,
        commit,
        computed: {
          confidence: computed.confidence,
          outside: computed.outside,
          paths: computed.paths,
          reason: computed.reason,
          truncated: computed.truncated,
        },
        id: `${commit.slice(0, 8)}`,
        indexedFiles: report.files,
        sources,
      })
      console.log(
        `  ${at + 1}/${commits.length} ${commit.slice(0, 8)}  ${changed.length} changed, ` +
          `${candidates.length} candidates (${onlyIndependent} only the independent generator found), ` +
          `${computed.confidence}${computed.truncated ? ' (truncated)' : ''}`,
      )
    } finally {
      database.close()
      try {
        git('worktree', 'remove', '--force', tree)
      } catch {
        rmSync(tree, { force: true, recursive: true })
      }
    }
  }

  // The digest is over the candidates only. It is what binds a label file to the set it was shown:
  // a frozen set that was regenerated after someone started labelling is a different experiment.
  const digest = createHash('sha256')
    .update(JSON.stringify(entries.map((entry) => [entry.id, entry.candidates])))
    .digest('hex')

  const frozen = {
    digest,
    frozenAt: new Date().toISOString(),
    // Enough to run this again and get the same file. A percentage quoted from a set nobody can
    // regenerate is a percentage nobody can check, and the first question about any number here
    // will be which build of Cycle produced it.
    manifest: {
      benchDigest: createHash('sha256').update(readFileSync(new URL(import.meta.url), 'utf8')).digest('hex').slice(0, 16),
      command: process.argv.slice(1).join(' '),
      commits: entries.map((entry) => entry.commit),
      cycleVersion,
      node: process.version,
      repositoryHead: (() => { try { return git('rev-parse', 'HEAD') } catch { return null } })(),
    },
    repository: repo,
    samples: entries,
    purpose,
    strategy: PURPOSES[purpose],
  }
  writeFileSync(outPath, `${JSON.stringify(frozen, null, 2)}\n`)

  ensure('at least one sample was frozen', entries.length > 0, `${commits.length} commits inspected`)
  ensure(
    'every sample carries candidates a person can decide on',
    entries.every((entry) => Array.isArray(entry.candidates)),
  )
  console.log(`\n${entries.length} samples, digest ${digest.slice(0, 16)}, written to ${outPath}`)
  close()
}

// ---------------------------------------------------------------- label files

/**
 * What a label sheet must not contain, checked against an allowlist of fields rather than by
 * searching for words that ought not to appear. A forbidden-word search passes the moment
 * provenance arrives under a name nobody thought to forbid; an allowlist fails on anything that was
 * not deliberately put there. A labeller needs the repository, the revisions, the diff and the
 * identity of the consumer; they must not have who proposed it, what Cycle predicted, or how sure
 * it was.
 */
const SHEET_FIELDS = new Set(['additions', 'changed', 'declaration', 'digest', 'labeller', 'labels', 'legend', 'question', 'writeIn'])

/**
 * The question the sheet actually asks. It was missing, and its absence was the quiet problem: a
 * labeller was handed paths and three words and left to decide privately what "affected" meant.
 *
 * "Does this file depend on the changed symbol?" and "can this change alter what this file does?"
 * are different questions, and a file can import a helper without touching the behaviour that
 * changed. Two people answering different questions agree or disagree about nothing.
 *
 * Behavioural, not structural, and bounded by a stated perimeter — because "affected" with no
 * perimeter invites a labeller to imagine a configuration in which anything reaches anything.
 */
const QUESTION = {
  ask:
    'Comparing these two revisions, can this change alter the observable behaviour of this ' +
    'consumer, under the conditions stated below?',
  conditions: [
    'Consumers inside this repository. Anything outside it is out of scope for this sheet.',
    'The configurations the repository ships with or documents; not a configuration you invent.',
    'Behaviour, not structure: importing something the change touched is not by itself an answer.',
    'If you cannot decide from the evidence available to you, that is what "can\'t-tell" is for. It ' +
      'is a real answer here, not a way of skipping the row.',
  ],
  note:
    'Say briefly what you relied on, or why you could not decide, next to the row in your own notes. ' +
    'A one-line reason is worth more to this study than a confident label with nothing behind it.',
}

function sheetLeaks(sheet) {
  const problems = []
  for (const key of Object.keys(sheet)) {
    if (!SHEET_FIELDS.has(key)) problems.push(`unexpected field ${key}`)
  }
  for (const [sampleId, entry] of Object.entries(sheet.labels ?? {})) {
    for (const [path, value] of Object.entries(entry)) {
      // A candidate row is a path and an empty answer. Anything else attached to it — a hint, a
      // score, a source — tells the labeller something about where it came from.
      if (value !== '') problems.push(`${sampleId}:${path} arrives with a value`)
    }
  }
  return problems
}


function template(frozenPath, labeller, outPath) {
  const frozen = JSON.parse(readFileSync(frozenPath, 'utf8'))
  const labels = {}
  const additions = {}
  for (const sample of frozen.samples) {
    labels[sample.id] = Object.fromEntries(sample.candidates.map((path) => [path, '']))
    additions[sample.id] = []
  }

  // Nothing here says which generator proposed a candidate, or what Cycle predicted. The sheet
  // carries the changed files and the candidate paths, and that is all a labeller should see.
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        additions,
        changed: Object.fromEntries(frozen.samples.map((sample) => [sample.id, sample.changed])),
        declaration: {
          // Answered by the labeller, and read by `score`. Agreement between two people who share a
          // rubric measures that they applied it the same way; it cannot measure whether the rubric
          // describes the software. At least one labeller must not have seen Cycle's model, and
          // whoever prepared the run must not be scored against it.
          authoredCycle: null,
          authoredTaxonomy: null,
          hasSeenCycleTaxonomy: null,
          knowsThisRepository: null,
          preparedThisRun: null,
        },
        digest: frozen.digest,
        labeller,
        labels,
        legend: LABELS,
        question: QUESTION,
        // The only place a real miss can surface. A consumer neither generator proposed has no row
        // above, so it is written in here — and it stays marked as an omission from both lists
        // rather than quietly joining the candidate set as if it had been found.
        writeIn: 'add any consumer you believe is affected that no row above offers, under additions',
      },
      null,
      2,
    )}\n`,
  )
  const total = Object.values(labels).reduce((sum, entry) => sum + Object.keys(entry).length, 0)
  // Blindness checked against an allowlist of fields, not by searching the JSON for words that
  // ought not to appear. A forbidden-word search passes the moment provenance arrives under a name
  // nobody thought to forbid; an allowlist fails on anything that was not deliberately put there.
  // What a labeller needs is the repository, the revisions, the diff and the identity of the
  // consumer. What they must not have is who proposed it, what Cycle predicted, and how sure it was.
  const sheet = JSON.parse(readFileSync(outPath, 'utf8'))
  const leaks = sheetLeaks(sheet)
  ensure('the sheet carries only the fields a labeller is meant to see', leaks.length === 0, leaks.join('; '))

  console.log(`${total} candidates to decide, in ${outPath}`)
  console.log(`fill each with one of: ${LABELS.join(', ')}`)
  console.log('answer the questions under "declaration" with true or false')
  console.log('and put anything the sheet failed to offer under "additions"')
}

// ---------------------------------------------------------------- the four measures

function score(frozenPath, labelPaths) {
  const frozen = JSON.parse(readFileSync(frozenPath, 'utf8'))
  const sheets = labelPaths.map((path) => JSON.parse(readFileSync(path, 'utf8')))

  const purpose = frozen.purpose ?? null

  console.log(`frozen ${frozen.digest.slice(0, 16)}, ${frozen.samples.length} samples, ${sheets.length} labellers`)
  console.log(`purpose ${purpose ?? '(none recorded)'}\n`)
  console.log(`sampling: ${frozen.strategy}\n`)

  // A set frozen before this bench carried a purpose cannot be scored, because nobody can now say
  // which of the two it was — and the whole point of the distinction is that it is not recoverable
  // after the fact. Freeze it again, saying what it is.
  ensure(
    'the frozen set says what it was drawn for',
    purpose !== null && Object.hasOwn(PURPOSES, purpose),
    `expected one of ${Object.keys(PURPOSES).join(', ')}, got ${JSON.stringify(purpose)}`,
  )
  ensure('at least two independent labellers', sheets.length >= 2, `${sheets.length} given`)

  // Independence of the panel, checked rather than assumed. Two people who share a rubric agree
  // because they share it; that is a consistency measure and it is not evidence that the rubric
  // describes the software. And whoever prepared the run must not be among the people the run is
  // scored against — being available is not a qualification for deciding the answers.
  const declared = (sheet) => sheet.declaration ?? {}
  ensure(
    'every labeller declared where they stand',
    sheets.every((sheet) =>
      ['authoredCycle', 'authoredTaxonomy', 'hasSeenCycleTaxonomy', 'preparedThisRun'].every(
        (field) => typeof declared(sheet)[field] === 'boolean',
      ),
    ),
    sheets.filter((sheet) => typeof declared(sheet).hasSeenCycleTaxonomy !== 'boolean').map((sheet) => sheet.labeller).join(', '),
  )
  ensure(
    'at least one labeller has not seen Cycle\'s taxonomy',
    sheets.some((sheet) => declared(sheet).hasSeenCycleTaxonomy === false),
    'a panel that all learned the rubric can only show it was applied consistently',
  )
  ensure(
    'nobody who prepared the run is scored against it',
    sheets.every((sheet) => declared(sheet).preparedThisRun !== true),
    sheets.filter((sheet) => declared(sheet).preparedThisRun === true).map((sheet) => sheet.labeller).join(', '),
  )
  // Preparing the run and having written the thing being measured are different disqualifications,
  // and excluding only the first leaves the second wide open: someone else runs the freeze and the
  // author labels anyway. Their judgements can be kept for analysis, in a separate panel, but they
  // do not belong in the scored set.
  ensure(
    'no author of Cycle or of the taxonomy is in the scored panel',
    sheets.every((sheet) => declared(sheet).authoredCycle !== true && declared(sheet).authoredTaxonomy !== true),
    sheets
      .filter((sheet) => declared(sheet).authoredCycle === true || declared(sheet).authoredTaxonomy === true)
      .map((sheet) => sheet.labeller)
      .join(', '),
  )
  for (const sheet of sheets) {
    ensure(
      `${sheet.labeller} labelled the set that was frozen`,
      sheet.digest === frozen.digest,
      'a label file bound to a different candidate set is a different experiment',
    )
  }
  for (const sheet of sheets) {
    // An empty row is not an invalid answer, it is the absence of one, and refusing the whole sheet
    // for it would make a partly-labelled experiment unscoreable. Something that is neither empty
    // nor one of the three is a different matter: it is a label nobody defined, and no measure can
    // read it. The unlabelled rows are counted as coverage further down instead.
    const bad = []
    for (const [sampleId, entries] of Object.entries(sheet.labels ?? {})) {
      for (const [path, value] of Object.entries(entries)) {
        if (value !== '' && !LABELS.includes(value)) bad.push(`${sampleId}:${path}=${value}`)
      }
    }
    ensure(`${sheet.labeller} used only the three labels`, bad.length === 0, bad.slice(0, 3).join(', '))
  }
  if (failures.length > 0) return

  let confidentlyWrong = 0
  let confidentlyRight = 0
  let agreed = 0
  let candidates = 0
  let unknownCandidates = 0
  const disagreements = []
  // Where the confidently-wrong calls came from. A miss on a candidate only the independent
  // generator proposed is one Cycle would never have been asked about under the old protocol, and
  // it is the class the reviewer's objection exists to make visible.
  const missedBy = { cycle: 0, independent: 0 }
  // The 2x2 behind the correlation: Cycle unknown against human can't-tell, per candidate.
  const table = { no: { no: 0, yes: 0 }, yes: { no: 0, yes: 0 } }

  for (const sample of frozen.samples) {
    const cycleUnknown = sample.computed.confidence === 'unresolved' || sample.computed.truncated
    const inReach = new Set(sample.computed.paths)

    for (const path of sample.candidates) {
      const given = sheets.map((sheet) => sheet.labels?.[sample.id]?.[path]).filter(Boolean)
      if (given.length === 0) continue
      candidates += 1

      const unanimous = given.every((value) => value === given[0])
      if (unanimous) agreed += 1
      else disagreements.push({ given, path, sample: sample.id })

      if (cycleUnknown) unknownCandidates += 1

      // A tie is not a majority. Resolving one by argument order would invent a reference label out
      // of a split the protocol exists to keep, so a contested candidate is excluded from the two
      // measures that need a reference and stays in the disagreement list, where it belongs.
      const tally = LABELS
        .map((label) => [label, given.filter((value) => value === label).length])
        .sort((left, right) => right[1] - left[1])
      const contested = tally[1][1] === tally[0][1]
      if (contested) continue
      const majority = tally[0][0]

      const humanCantTell = majority === "can't-tell"
      table[cycleUnknown ? 'yes' : 'no'][humanCantTell ? 'yes' : 'no'] += 1

      // The measure that must fall every iteration: Cycle was sure, and it was wrong.
      if (!cycleUnknown && majority === 'affected' && !inReach.has(path)) {
        confidentlyWrong += 1
        const proposedByCycle = (sample.sources?.[path] ?? ['cycle']).includes('cycle')
        missedBy[proposedByCycle ? 'cycle' : 'independent'] += 1
      }
      if (!cycleUnknown && majority === 'affected' && inReach.has(path)) confidentlyRight += 1
    }
  }

  // Phi over the 2x2. Positive means Cycle's unknowns fall where humans cannot tell either, which
  // is what an honest unknown looks like; near zero means they fall somewhere else.
  const { yes: { yes: a, no: b }, no: { yes: c, no: d } } = table
  const denominator = Math.sqrt((a + b) * (c + d) * (a + c) * (b + d))
  const phi = denominator === 0 ? null : (a * d - b * c) / denominator

  const percent = (part, whole) => (whole === 0 ? 'n/a' : `${((100 * part) / whole).toFixed(1)}%`)

  // Coverage first, and the four states kept apart. An unlabelled row is not a `not-affected`, and
  // it is not a `can't-tell` either: one is a judgement that the evidence was insufficient, the
  // other is the absence of a judgement. It comes before the measures rather than after them
  // because "0 of 0 confidently wrong" reads as good news, and a reader who stops at the first
  // number would take a sheet nobody filled in for a system that got everything right.
  const offered = frozen.samples.reduce((sum, sample) => sum + sample.candidates.length, 0)
  console.log('coverage')
  console.log(`   ${candidates} of ${offered} candidate rows carry at least one label (${percent(candidates, offered)})`)
  console.log('   unit: one row, per candidate per sample. Every denominator below is rows, not changes.')
  console.log("   Cycle's unknown is per change; a labeller's can't-tell is per row. Never the same count.\n")

  if (candidates === 0) {
    console.log('UNAVAILABLE. No row was labelled, so every measure that needs a judgement has no value —')
    console.log('not a zero, and not a pass. This is an experiment that has not been run yet.\n')
    return
  }

  console.log('1. confidently wrong')
  console.log(`   ${confidentlyWrong} of ${confidentlyRight + confidentlyWrong} confident affected calls (${percent(confidentlyWrong, confidentlyRight + confidentlyWrong)})`)
  console.log('   reach called resolved, candidate outside it, labelled affected')
  console.log(`   of those, ${missedBy.cycle} on candidates Cycle proposed and ${missedBy.independent} on candidates only the independent generator found`)
  console.log('   contested candidates are excluded here: a tie is not a reference label\n')

  console.log('2. unknown correlation')
  console.log(`   phi ${phi === null ? 'n/a' : phi.toFixed(3)}  (cycle-unknown x human-cant-tell)`)
  console.log(`   both ${a}, cycle only ${b}, human only ${c}, neither ${d}\n`)

  console.log('3. per-candidate consistency')
  console.log(`   ${agreed} of ${candidates} unanimous (${percent(agreed, candidates)}), ${disagreements.length} kept`)
  console.log('   this is agreement, not correctness: it says the labellers applied one notion of')
  console.log('   "affected" the same way, never that the notion describes the software\n')

  // Measure five, and the reason the sheet has a blank row at all. A consumer neither generator
  // proposed is the only kind of miss that can be established from outside Cycle's own view, so it
  // stays visible as an omission from both lists rather than being folded into the candidate set.
  const writeIns = []
  for (const sheet of sheets) {
    for (const [sampleId, paths] of Object.entries(sheet.additions ?? {})) {
      const sample = frozen.samples.find((entry) => entry.id === sampleId)
      for (const path of paths) {
        if (sample?.candidates.includes(path)) continue
        writeIns.push({ by: sheet.labeller, path, sample: sampleId })
      }
    }
  }

  console.log('5. omissions from both lists')
  if (writeIns.length === 0) {
    console.log('   none written in\n')
  } else {
    console.log(`   ${writeIns.length} consumers a labeller added that neither generator proposed:`)
    for (const item of writeIns.slice(0, 12)) console.log(`     ${item.sample}  ${item.path}  (${item.by})`)
    if (writeIns.length > 12) console.log(`     … and ${writeIns.length - 12} more`)
    console.log('   these are not results. They are candidates for a second, independent labelling')
    console.log('   pass: one person naming a file is a lead, and treating it as truth would rebuild')
    console.log('   the circularity this row exists to break, with a human generator instead of a machine.\n')
  }

  console.log('4. unknown share')
  if (purpose === 'distribution') {
    console.log(`   ${unknownCandidates} of ${candidates} candidates sit in a sample Cycle called unknown (${percent(unknownCandidates, candidates)})`)
    console.log('   quoted from a random set, so it estimates the changes Cycle meets\n')
  } else {
    // The measure is deliberately withheld rather than printed with a caveat beside it. A number
    // with a warning next to it gets repeated without the warning, and this is the number most
    // likely to end up in a sentence to someone who was not here.
    console.log(`   withheld: this set was drawn for ${purpose ?? 'an unrecorded purpose'}, not at random`)
    console.log(`   ${unknownCandidates} of ${candidates} candidates sit in an unknown sample, which measures`)
    console.log('   the difficulty this set was selected for and not any rate of ordinary change.')
    console.log('   Freeze a set with --purpose distribution to estimate that.\n')
  }

  // Nothing here decides whether a rate is workable. No threshold has been measured, and one that
  // was picked to sound reasonable would become a premise the moment it was written down: what an
  // unknown costs depends on the verification it triggers and on what resolving it takes, neither
  // of which this bench observes.

  if (disagreements.length > 0) {
    console.log('disagreements, kept rather than averaged — the next sampling target:')
    for (const item of disagreements.slice(0, 20)) {
      console.log(`   ${item.sample}  ${item.path}  ${item.given.join(' / ')}`)
    }
    if (disagreements.length > 20) console.log(`   … and ${disagreements.length - 20} more`)
    console.log('')
  }

}

// ---------------------------------------------------------------- the bench's own test

/**
 * The bench produces the number someone will repeat to an investor, so it has to be able to fail.
 * A synthetic frozen set with labels whose answers are known by construction: one confidently wrong
 * call, one disagreement, and unknowns that sit exactly where the can't-tells do.
 */
function selftest() {
  const directory = mkdtempSync(join(tmpdir(), 'cycle-bench-self-'))
  try {
    const samples = [
      {
        candidates: ['src/near.ts', 'src/far.ts'],
        changed: ['src/a.ts'],
        commit: 'a'.repeat(40),
        computed: { confidence: 'resolved', outside: [], paths: ['src/near.ts'], reason: null, truncated: false },
        id: 'sure',
        indexedFiles: 3,
        // far.ts is one only the independent generator proposed: under the old protocol it would
        // have had no row at all, and the miss below could not have been seen.
        sources: { 'src/far.ts': ['independent'], 'src/near.ts': ['cycle'] },
      },
      {
        candidates: ['src/murky.ts'],
        changed: ['src/b.ts'],
        commit: 'b'.repeat(40),
        computed: { confidence: 'unresolved', outside: [], paths: [], reason: 'never indexed', truncated: false },
        id: 'unsure',
        indexedFiles: 0,
        sources: { 'src/murky.ts': ['cycle', 'independent'] },
      },
    ]
    const digest = createHash('sha256')
      .update(JSON.stringify(samples.map((sample) => [sample.id, sample.candidates])))
      .digest('hex')

    const frozenPath = join(directory, 'frozen.json')
    const freezeAs = (purpose, path) =>
      writeFileSync(
        path,
        JSON.stringify({ digest, frozenAt: '', purpose, repository: '', samples, strategy: PURPOSES[purpose] }),
      )
    freezeAs('distribution', frozenPath)

    // src/far.ts is outside the computed reach and both call it affected: one confidently wrong.
    // src/near.ts is inside it and they disagree: one disagreement, kept.
    // src/murky.ts is where Cycle said unknown and both say can't-tell: an honest unknown.
    const sheet = (labeller, near, declaration = {}, additions = {}, blank = false) => {
      const path = join(directory, `labels-${labeller}.json`)
      writeFileSync(
        path,
        JSON.stringify({
          additions,
          declaration: {
            authoredCycle: false,
            authoredTaxonomy: false,
            hasSeenCycleTaxonomy: labeller !== 'bob',
            knowsThisRepository: true,
            preparedThisRun: false,
            ...declaration,
          },
          digest,
          labeller,
          labels: blank
            ? { sure: { 'src/far.ts': '', 'src/near.ts': '' }, unsure: { 'src/murky.ts': '' } }
            : {
                sure: { 'src/far.ts': 'affected', 'src/near.ts': near },
                unsure: { 'src/murky.ts': "can't-tell" },
              },
        }),
      )
      return path
    }

    const output = []
    const original = console.log
    console.log = (...parts) => output.push(parts.join(' '))
    score(frozenPath, [sheet('ada', 'affected'), sheet('bob', 'not-affected')])
    console.log = original
    const text = output.join('\n')

    ensure('it counts the confidently wrong call', /^\s+1 of 1 confident/mu.test(text), text.match(/^.*confident.*$/mu)?.[0] ?? '')
    ensure('it keeps the disagreement rather than averaging it', /2 of 3 unanimous/u.test(text), text.match(/^.*unanimous.*$/mu)?.[0] ?? '')
    ensure('it reports the unknown share', /1 of 3 candidates/u.test(text), text.match(/^.*candidates sit.*$/mu)?.[0] ?? '')
    ensure('it correlates the unknown with the human can-t-tell', /phi 1\.000/u.test(text), text.match(/^.*phi.*$/mu)?.[0] ?? '')
    ensure('it names the disagreement it kept', text.includes('src/near.ts'), '')
    ensure(
      'it quotes the unknown share from a random set',
      /1 of 3 candidates sit in a sample/u.test(text) && /quoted from a random set/u.test(text),
      text.match(/^.*(candidates sit|quoted from).*$/mu)?.[0] ?? '',
    )

    // The reviewer's correction, as a property the bench holds rather than a paragraph it contains:
    // the same labels over the same candidates, frozen for taxonomy instead of at random, must not
    // yield an unknown rate. A corpus of hard cases measures the difficulty it was selected for.
    const tuned = join(directory, 'frozen-taxonomy.json')
    freezeAs('taxonomy', tuned)
    const held = []
    console.log = (...parts) => held.push(parts.join(' '))
    score(tuned, [sheet('ada', 'affected'), sheet('bob', 'not-affected')])
    console.log = original
    const heldText = held.join('\n')

    ensure('it withholds the unknown share from a set selected for difficulty', /withheld: this set was drawn for taxonomy/u.test(heldText), heldText.match(/^.*withheld.*$/mu)?.[0] ?? '')
    ensure('and does not print the rate beside the refusal', !/quoted from a random set/u.test(heldText))
    ensure('while still reporting the three measures that survive selection', /confidently wrong/u.test(heldText) && /per-candidate consistency/u.test(heldText))

    // The reviewer's second objection, as three properties the bench holds.
    //
    // First: a miss on a candidate only the independent generator proposed must be counted and named
    // as such. Under the old protocol that candidate had no row at all, so the miss was unfindable
    // by construction — the reference inherited the blind spot of the thing it was measuring.
    ensure(
      'it says which generator proposed the candidate it was wrong about',
      /0 on candidates Cycle proposed and 1 on candidates only the independent generator found/u.test(text),
      text.match(/^.*only the independent generator.*$/mu)?.[0] ?? '',
    )

    // Second: a panel that has all seen the taxonomy can show it was applied consistently and
    // nothing more, and whoever prepared the run must not be scored against it.
    const refuses = (sheets, what) => {
      const noise = []
      console.log = (...parts) => noise.push(parts.join(' '))
      const at = failures.length
      score(frozenPath, sheets)
      console.log = original
      const raised = failures.splice(at, failures.length - at)
      ensure(what, raised.length > 0, noise.join('\n').slice(0, 160))
    }
    refuses(
      [sheet('ada', 'affected'), sheet('cara', 'affected', { hasSeenCycleTaxonomy: true })],
      'it refuses a panel where everyone has seen the taxonomy',
    )
    refuses(
      [sheet('ada', 'affected', { preparedThisRun: true }), sheet('bob', 'not-affected')],
      'it refuses to score whoever prepared the run',
    )
    refuses(
      [sheet('ada', 'affected', { hasSeenCycleTaxonomy: null }), sheet('bob', 'not-affected')],
      'it refuses a labeller who did not say where they stand',
    )
    refuses(
      [sheet('ada', 'affected', { authoredTaxonomy: true }), sheet('bob', 'not-affected')],
      'it refuses to score the author of the taxonomy, even when someone else prepared the run',
    )
    refuses(
      [sheet('ada', 'affected', { authoredCycle: true }), sheet('bob', 'not-affected')],
      'and the author of Cycle',
    )

    // Third: a consumer neither generator proposed is reported as an omission from both lists, and
    // explicitly not as a result. Folding it in would rebuild the circularity with a human
    // generator in place of a machine one.
    const written = []
    console.log = (...parts) => written.push(parts.join(' '))
    score(frozenPath, [
      sheet('ada', 'affected', {}, { sure: ['src/nobody-proposed.ts'] }),
      sheet('bob', 'not-affected'),
    ])
    console.log = original
    const writtenText = written.join('\n')
    ensure(
      'it reports a consumer neither generator proposed',
      /omissions from both lists/u.test(writtenText) && writtenText.includes('src/nobody-proposed.ts'),
      writtenText.match(/^.*omissions.*$/mu)?.[0] ?? '',
    )
    ensure(
      'and refuses to treat it as a result',
      /these are not results/u.test(writtenText) && /second, independent labelling/u.test(writtenText),
      '',
    )

    // ------------------------------------------------------------ the generator, on a real repo
    //
    // Two properties a reviewer asked for, and neither can be shown from the shape of the code.
    // A throwaway repository, three files, one commit that changes a default:
    //
    //   src/config.js   defines MODEL_PROVIDER, and the commit changes its value
    //   src/router.js   reads MODEL_PROVIDER — it never imports config.js, so no path or symbol
    //                   search can reach it, and neither can an import graph
    //   src/old.js      defines a symbol the commit deletes, so it exists only in the parent
    //   src/legacy.js   calls that deleted symbol
    //
    // If the generator only reads the tree after the change and only searches paths and exported
    // names, it finds neither router.js nor legacy.js. Both are the shape of miss this whole
    // exercise is about.
    const repo = mkdtempSync(join(tmpdir(), 'cycle-gen-'))
    const g = (...args) =>
      execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    try {
      writeFileSync(join(repo, 'x.txt'), '')
      g('init', '--quiet')
      g('config', 'user.email', 'b@example.invalid')
      g('config', 'user.name', 'bench')
      const write = (path, text) => writeFileSync(join(repo, path), text)
      execFileSync('mkdir', ['-p', join(repo, 'src')], { stdio: 'ignore' })

      write('src/config.js', 'export const MODEL_PROVIDER = "alpha"\n')
      write('src/router.js', 'import { settings } from "./settings.js"\nexport function pick() { return settings["MODEL_PROVIDER"] }\n')
      write('src/settings.js', 'export const settings = {}\n')
      write('src/old.js', 'export function retiredHelper() { return 1 }\n')
      write('src/legacy.js', 'import { retiredHelper } from "./old.js"\nexport const v = retiredHelper()\n')
      g('add', '-A')
      g('commit', '--quiet', '-m', 'baseline')

      write('src/config.js', 'export const MODEL_PROVIDER = "beta"\n')
      rmSync(join(repo, 'src/old.js'))
      g('add', '-A')
      g('commit', '--quiet', '-m', 'change the default and drop the helper')
      const head = g('rev-parse', 'HEAD')

      const proposed = independentCandidates(g, ['src/config.js', 'src/old.js'], head)

      ensure(
        'the generator proposes a consumer reached only through a configuration key',
        proposed.includes('src/router.js'),
        `proposed ${proposed.join(', ') || '(nothing)'}`,
      )
      ensure(
        'and one that used a symbol the change deleted, which exists only in the parent revision',
        proposed.includes('src/legacy.js'),
        `proposed ${proposed.join(', ') || '(nothing)'}`,
      )
      // Independence of the mechanism, asserted rather than asserted about: it is handed a git
      // command, a file list and a revision, and there is no database, graph or Cycle-derived
      // symbol list among them. Same inputs, same output, whatever the graph holds.
      ensure(
        'it takes nothing derived from Cycle, and repeats itself exactly',
        independentCandidates.length === 3 &&
          JSON.stringify(independentCandidates(g, ['src/config.js', 'src/old.js'], head)) === JSON.stringify(proposed),
      )

      // The key that gives a change its meaning often sits on a line the change did not touch:
      // `DEFAULT = "alpha"` becomes `"beta"` while `KEY = "MODEL_PROVIDER"` two lines up is
      // untouched. Reading only the + and - lines lost it, and a probe found the generator
      // proposing nothing at all for that shape of change.
      write('src/keyed.js', 'export const KEY = "ROUTING_TABLE"\nexport const DEFAULT_ROUTE = "alpha"\n')
      write('src/reader.js', 'export function route(env) { return env["ROUTING_TABLE"] }\n')
      g('add', '-A')
      g('commit', '--quiet', '-m', 'add a keyed default and its reader')
      write('src/keyed.js', 'export const KEY = "ROUTING_TABLE"\nexport const DEFAULT_ROUTE = "beta"\n')
      g('add', '-A')
      g('commit', '--quiet', '-m', 'change only the default')
      const keyed = g('rev-parse', 'HEAD')

      ensure(
        'it sees a configuration key that sits on a line the change did not touch',
        independentCandidates(g, ['src/keyed.js'], keyed).includes('src/reader.js'),
        independentCandidates(g, ['src/keyed.js'], keyed).join(', ') || '(nothing)',
      )

      // And it searches the frozen revision, not whatever the working tree happens to hold. This
      // was wrong and invisible: the freeze flow creates a worktree at the commit, so the two
      // coincided there and nowhere else. A probe caught it proposing a file added by a later
      // commit — terms read correctly from the past, searched in the present.
      write('src/afterwards.js', 'export const late = "ROUTING_TABLE"\n')
      g('add', '-A')
      g('commit', '--quiet', '-m', 'a consumer added after the frozen pair')

      const again = independentCandidates(g, ['src/keyed.js'], keyed)
      ensure(
        'and it searches the frozen revision, so a later commit changes nothing',
        !again.includes('src/afterwards.js') && again.includes('src/reader.js'),
        again.join(', ') || '(nothing)',
      )
    } finally {
      rmSync(repo, { force: true, recursive: true })
    }

    // A sheet nobody filled in must not read as a system that got everything right. The measures
    // are withheld and the run is named as one that has not happened, rather than reported as zero
    // omissions out of zero rows.
    const blank = []
    console.log = (...parts) => blank.push(parts.join(' '))
    score(frozenPath, [
      sheet('ada', '', {}, {}, true),
      sheet('bob', '', {}, {}, true),
    ])
    console.log = original
    const blankText = blank.join('\n')
    ensure(
      'an unlabelled sheet reports coverage and withholds every measure',
      /0 of \d+ candidate rows/u.test(blankText) && /UNAVAILABLE/u.test(blankText),
      blankText.match(/^.*candidate rows.*$/mu)?.[0] ?? '',
    )
    ensure(
      'and does not print a confidently-wrong count beside it',
      !/confidently wrong/u.test(blankText),
      blankText.match(/^.*confidently.*$/mu)?.[0] ?? '',
    )

    // Blindness, tested with decoys rather than by trusting the writer. Each of these is a way
    // provenance has actually leaked into a sheet in some other study: a field nobody thought to
    // forbid, and a hint attached to the row itself.
    ensure(
      'a clean sheet is reported as clean',
      sheetLeaks({ labels: { s: { 'a.ts': '' } }, labeller: 'x' }).length === 0,
    )
    ensure(
      'a field nobody allowed is caught, whatever it is called',
      sheetLeaks({ hint: { s: 'cycle found this' }, labels: {} }).some((problem) => problem.includes('hint')),
    )
    ensure(
      'and so is a value smuggled onto a candidate row',
      sheetLeaks({ labels: { s: { 'a.ts': 'likely' } } }).some((problem) => problem.includes('arrives with a value')),
    )

    // And it must refuse a label file bound to a different candidate set.
    const wrong = join(directory, 'labels-wrong.json')
    writeFileSync(wrong, JSON.stringify({ digest: 'not-the-same', labeller: 'eve', labels: {} }))
    const guard = []
    console.log = (...parts) => guard.push(parts.join(' '))
    const before = failures.length
    score(frozenPath, [sheet('ada', 'affected'), wrong])
    console.log = original

    // Taken out before the assertion below adds its own, so the count is exactly what score()
    // produced. The earlier version subtracted one from the range and left a deliberate failure in
    // the list, which made the selftest exit non-zero with every assertion passing — a suite that
    // could not pass, next to a suite that could not fail. Both are the same mistake.
    const deliberate = failures.splice(before, failures.length - before)

    ensure(
      'it refuses labels bound to a different frozen set',
      deliberate.length > 0,
      guard.join('\n').slice(0, 200),
    )
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
  close()
  console.log('the bench measures what it claims to, and fails when it should')
}

// ---------------------------------------------------------------- dispatch

const flag = (name, fallback) => {
  const at = rest.indexOf(`--${name}`)
  return at === -1 ? fallback : Number(rest[at + 1])
}

switch (command) {
  case 'selftest':
    selftest()
    break
  case 'freeze': {
    const [repo, out] = rest
    const at = rest.indexOf('--purpose')
    const purpose = at === -1 ? null : rest[at + 1]
    if (!repo || !out || !existsSync(repo)) {
      console.error('usage: reach-bench.mjs freeze <repo> <frozen.json> --purpose <distribution|taxonomy> [--samples N] [--skip N]')
      process.exit(2)
    }
    // No default. Which of the two a set is cannot be recovered afterwards, and a default would be
    // chosen once and then inherited by every set that followed it.
    if (purpose === null || !Object.hasOwn(PURPOSES, purpose)) {
      console.error('freeze needs --purpose distribution or --purpose taxonomy\n')
      for (const [name, text] of Object.entries(PURPOSES)) console.error(`  ${name}\n    ${text}\n`)
      process.exit(2)
    }
    await freeze(repo, out, flag('samples', 20), flag('skip', 0), purpose)
    break
  }
  case 'template': {
    const [frozen, labeller, out] = rest
    if (!frozen || !labeller || !out) {
      console.error('usage: reach-bench.mjs template <frozen.json> <labeller> <labels.json>')
      process.exit(2)
    }
    template(frozen, labeller, out)
    // The blindness checks inside template are assertions, so they have to be able to fail the run.
    close()
    break
  }
  case 'score': {
    const [frozen, ...labels] = rest
    if (!frozen || labels.length === 0) {
      console.error('usage: reach-bench.mjs score <frozen.json> <labels-a.json> <labels-b.json> [...]')
      process.exit(2)
    }
    score(frozen, labels)
    // close() lives here, not in score(): the selftest calls score several times, once expecting it
    // to fail, and an exit inside it used to take the assertions after it with it.
    close()
    break
  }
  default:
    console.error('usage: reach-bench.mjs <selftest|freeze|template|score> ...')
    process.exit(2)
}
