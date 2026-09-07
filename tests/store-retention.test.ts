import assert from "node:assert/strict"
import { test } from "node:test"

import { Database } from "../src/store/database.ts"
import { pruneCandidateBytes, storeUsage } from "../src/store/retention.ts"

const PROJECT = "p1"

// Certification 10.8.
/** Two workflows, one finished and one still running, each with one candidate holding bytes. */
function seed(): Database {
  const database = new Database({ path: ":memory:" })
  const now = Date.now()

  for (const { id, state } of [
    { id: "w-done", state: "completed" },
    { id: "w-live", state: "verifying" },
  ]) {
    database.run(
      "insert into workflows (id, project_id, state, max_repair_cycles, created_at, updated_at) values (?, ?, ?, 5, ?, ?)",
      id,
      PROJECT,
      state,
      now,
      now,
    )
    database.run(
      "insert into candidates (id, workflow_id, manifest, diff_digest, candidate_digest, frozen_at) values (?, ?, '[]', 'dd', 'cd', ?)",
      `c-${id}`,
      id,
      now,
    )
    database.run(
      "insert into candidate_files (candidate_id, path, kind, digest, payload) values (?, 'src/a.ts', 'modified', ?, ?)",
      `c-${id}`,
      `digest-of-${id}`,
      new Uint8Array(1000),
    )
  }
  return database
}

test("usage counts only the bytes of finished workflows as prunable", () => {
  const database = seed()
  try {
    const usage = storeUsage(database, PROJECT)

    assert.equal(usage.retained.files, 2)
    assert.equal(usage.retained.bytes, 2000)
    assert.equal(usage.prunable.files, 1)
    assert.equal(usage.prunable.bytes, 1000)
    assert.equal(usage.prunable.workflows, 1)
    assert.equal(usage.counts.workflows, 2)
    assert.equal(usage.counts.candidates, 2)
  } finally {
    database.close()
  }
})

/**
 * The property that makes retention safe to run: bytes go, records do not. A candidate whose
 * payload was pruned is still a candidate, still carries the digest that says what the bytes were,
 * and is still named by the history entries and evidence that reference it.
 */
test("pruning drops the bytes and keeps every record and digest", () => {
  const database = seed()
  try {
    const freed = pruneCandidateBytes(database, PROJECT)
    assert.deepEqual(freed, { bytes: 1000, files: 1 })

    const rows = database.all<{ candidate_id: string; digest: string; payload: unknown }>(
      "select candidate_id, digest, payload from candidate_files order by candidate_id",
    )
    assert.equal(rows.length, 2, "no row was deleted")

    const done = rows.find((row) => row.candidate_id === "c-w-done")
    assert.equal(done?.payload, null, "the finished workflow gave its bytes back")
    assert.equal(done?.digest, "digest-of-w-done", "what the bytes were is still provable")

    const live = rows.find((row) => row.candidate_id === "c-w-live")
    assert.ok(live?.payload instanceof Uint8Array, "a running workflow keeps its bytes")

    assert.equal(database.all("select id from candidates").length, 2)
    assert.equal(storeUsage(database, PROJECT).prunable.bytes, 0, "nothing left to free")
  } finally {
    database.close()
  }
})

test("pruning a store with nothing to give back is not an error", () => {
  const database = new Database({ path: ":memory:" })
  try {
    assert.deepEqual(pruneCandidateBytes(database, PROJECT), { bytes: 0, files: 0 })
    assert.equal(storeUsage(database, PROJECT).retained.bytes, 0)
  } finally {
    database.close()
  }
})
