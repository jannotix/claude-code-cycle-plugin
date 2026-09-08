// Checks that a freshly migrated store carries the schema the control plane assumes, and that the
// three immutability rules are enforced by the database itself rather than by the code above it.
//
//   node tests-debug/schema-check.mjs
//
// Claims no certification row. It used to print the schema and exit zero whatever it found, which
// made it a suite that could not fail — the A1 problem — while `certify.mjs` counted it as passed.
// It now asserts, and a trigger that stops refusing fails this run.

import { Database } from '../dist/store/database.js'

const failures = []
const ensure = (label, condition, detail = '') => {
  if (!condition) failures.push(`${label}${detail ? `: ${detail}` : ''}`)
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${label}${condition ? '' : `  ${detail}`}`)
}

/** Runs `write` and returns the abort message, or null if the database allowed it through. */
const refused = (database, write) => {
  try {
    write()
    return null
  } catch (error) {
    return String(error?.message ?? error)
  }
}

const db = new Database({ path: ':memory:' })
const objects = db.all(
  "select name, type from sqlite_master where name not like 'sqlite_%' order by type, name",
)
const named = (type) => objects.filter((row) => row.type === type).map((row) => row.name)
const tables = new Set(named('table'))
const triggers = new Set(named('trigger'))

// ---------------------------------------------------------------- the tables the plane assumes

console.log('tables')

const REQUIRED_TABLES = [
  'arbitrations',
  'candidate_files',
  'candidates',
  'capture_capabilities',
  'checkpoints',
  'deliveries',
  'evidence',
  'goal_milestones',
  'goal_plans',
  'goals',
  'graph_edges',
  'graph_nodes',
  'history',
  'index_state',
  'leases',
  'memory',
  'memory_provenance',
  'requests',
  'reviews',
  'tasks',
  'workflows',
]

for (const table of REQUIRED_TABLES) ensure(`table ${table}`, tables.has(table))
ensure('the memory index is a full-text table', tables.has('memory_fts'))
ensure('indexes exist', named('index').length >= 10, `${named('index').length} found`)

// ---------------------------------------------------------------- what the database refuses

console.log('')
console.log('immutability')

for (const name of [
  'goals_objective_is_immutable',
  'history_is_append_only_delete',
  'history_is_append_only_update',
  'requests_original_is_immutable',
]) {
  ensure(`trigger ${name}`, triggers.has(name))
}

const now = Date.now()

db.run(
  'insert into history (sequence, project_id, actor, action, event, recorded_at, hash) ' +
    "values (1, 'p', 'operator', 'workflow.started', '{}', ?, 'h1')",
  now,
)

ensure(
  'a recorded history entry cannot be rewritten',
  (refused(db, () => db.run("update history set action = 'tampered' where sequence = 1")) ?? '').includes(
    'append-only',
  ),
  'the update was allowed through',
)
ensure(
  'a recorded history entry cannot be deleted',
  (refused(db, () => db.run('delete from history where sequence = 1')) ?? '').includes('append-only'),
  'the delete was allowed through',
)
ensure(
  'the entry is still there afterwards',
  db.all('select action from history where sequence = 1')[0]?.action === 'workflow.started',
)

db.run(
  'insert into workflows (id, project_id, state, max_repair_cycles, created_at, updated_at) ' +
    "values ('w1', 'p', 'planning', 5, ?, ?)",
  now,
  now,
)
db.run(
  'insert into requests (workflow_id, original_text, digest, created_at) ' +
    "values ('w1', 'the original ask', 'd1', ?)",
  now,
)

ensure(
  'the original request cannot be rewritten',
  (
    refused(db, () => db.run("update requests set original_text = 'something else' where workflow_id = 'w1'")) ??
    ''
  ).includes('immutable'),
  'the update was allowed through',
)
ensure(
  'its digest cannot be rewritten either',
  (refused(db, () => db.run("update requests set digest = 'd2' where workflow_id = 'w1'")) ?? '').includes(
    'immutable',
  ),
  'the update was allowed through',
)
ensure(
  'an amendment beside it is still allowed',
  refused(db, () => db.run("update requests set amendments = '[\"later\"]' where workflow_id = 'w1'")) === null,
  'a legitimate write was refused',
)

db.run(
  'insert into goals (id, project_id, objective, objective_digest, state, max_continuations, created_at, updated_at) ' +
    "values ('g1', 'p', 'ship it', 'gd1', 'active', 3, ?, ?)",
  now,
  now,
)

ensure(
  'a goal objective cannot be rewritten',
  (refused(db, () => db.run("update goals set objective = 'ship something else' where id = 'g1'")) ?? '').includes(
    'immutable',
  ),
  'the update was allowed through',
)
ensure(
  'the goal state can still move',
  refused(db, () => db.run("update goals set state = 'paused' where id = 'g1'")) === null,
  'a legitimate write was refused',
)

db.close()

console.log('')
if (failures.length > 0) {
  console.log(`${failures.length} failed`)
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(1)
}
console.log(`all ${objects.length} schema objects present, every immutability rule enforced`)
