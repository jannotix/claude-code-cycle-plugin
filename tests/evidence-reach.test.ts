import assert from "node:assert/strict"
import { test } from "node:test"

import { reachOf } from "../src/evidence/reach.ts"
import { Database } from "../src/store/database.ts"
import { insertEdges, replaceFile } from "../src/store/graph.ts"
import { provenance } from "../src/store/provenance.ts"

const PROJECT = "p1"

/** One indexed file holding one function node, and the id that node was given. */
function indexed(database: Database, path: string, name: string): string {
  const ids = replaceFile(
    database,
    PROJECT,
    { digest: path, indexedAt: 1, language: "typescript", modifiedAt: 0, path, references: [], size: 1 },
    [
      {
        digest: path,
        endLine: 10,
        kind: "function",
        language: "typescript",
        name,
        path,
        startLine: 1,
      },
    ],
  )
  return ids.get(`function:${name}:1`)!
}

const calls = (from: string, to: string) => ({
  confidence: "extracted" as const,
  fromId: from,
  kind: "calls" as const,
  provenance: provenance({ sessionId: "reach-test" }),
  toId: to,
})

// Certification 5.23.
/**
 * D2. A project that has never been indexed does not produce a reach of zero files — it produces an
 * unknown, with the reason and the command that resolves it. The distinction is the entire point:
 * "nothing is affected" and "I cannot tell what is affected" are different claims, and reporting
 * the first when the second is true is the confidently-wrong failure this design exists to avoid.
 */
test("an unindexed project reports unknown reach, not empty reach", () => {
  const database = new Database({ path: ":memory:" })
  try {
    const reach = reachOf(database, PROJECT, ["src/a.ts"])

    assert.equal(reach.confidence, "unresolved")
    assert.deepEqual(reach.paths, [])
    assert.match(reach.reason ?? "", /never been indexed/u)
    assert.match(reach.reason ?? "", /cycle:index/u)
  } finally {
    database.close()
  }
})

test("a changed file the index does not hold makes the whole answer unknown", () => {
  const database = new Database({ path: ":memory:" })
  try {
    indexed(database, "src/a.ts", "alpha")

    const reach = reachOf(database, PROJECT, ["src/a.ts", "src/never-indexed.ts"])

    assert.equal(reach.confidence, "unresolved")
    assert.match(reach.reason ?? "", /src\/never-indexed\.ts/u)
    assert.deepEqual(reach.paths, [], "an unknown answer offers no reached paths to act on")
  } finally {
    database.close()
  }
})

/**
 * A README is not an unknown. The graph has no grammar for it and never claimed to, so it is
 * reported as outside the model rather than as coverage that went missing — otherwise every
 * documentation change would carry the same warning as unindexed source, and the number that
 * matters would drown in the one that does not.
 */
test("a changed file in an unmodelled language is reported as outside, not as unknown", () => {
  const database = new Database({ path: ":memory:" })
  try {
    indexed(database, "src/a.ts", "alpha")

    const reach = reachOf(database, PROJECT, ["src/a.ts", "README.md"])

    assert.equal(reach.confidence, "resolved")
    assert.deepEqual(reach.outside, ["README.md"])
    assert.equal(reach.reason, null)
  } finally {
    database.close()
  }
})

test("a resolved reach names the files the change reaches without touching them", () => {
  const database = new Database({ path: ":memory:" })
  try {
    const alpha = indexed(database, "src/a.ts", "alpha")
    const beta = indexed(database, "src/b.ts", "beta")
    // b calls a, so a change to a reaches b.
    insertEdges(database, PROJECT, [calls(beta, alpha)])

    const reach = reachOf(database, PROJECT, ["src/a.ts"])

    assert.equal(reach.confidence, "resolved")
    assert.deepEqual(reach.paths, ["src/b.ts"])
    assert.equal(reach.truncated, false)
    assert.deepEqual(reach.hubs, [])
  } finally {
    database.close()
  }
})

// Certification 5.24.
/**
 * D3. A shared logger has hundreds of consumers, and a change to it must not turn every cycle into
 * a maximal one. Past the threshold the reached set stops being information, so it is reported as a
 * finding naming the hubs and their consumer counts — the reviewers learn that the change touches a
 * hub without the evidence policy inserting a gate for every file in the repository.
 */
test("a change to a widely consumed symbol reports the hub instead of expanding", () => {
  const database = new Database({ path: ":memory:" })
  try {
    const logger = indexed(database, "src/logger.ts", "log")
    const edges = []
    for (let at = 0; at < 300; at += 1) {
      edges.push(calls(indexed(database, `src/consumer-${at}.ts`, `use${at}`), logger))
    }
    insertEdges(database, PROJECT, edges)

    const reach = reachOf(database, PROJECT, ["src/logger.ts"])

    assert.equal(reach.confidence, "resolved", "a hub is known, not unknown")
    assert.equal(reach.truncated, true)
    assert.deepEqual(reach.paths, [], "nothing is handed to the gate rules to expand with")
    assert.equal(reach.hubs.length, 1)
    assert.equal(reach.hubs[0]?.name, "log")
    assert.equal(reach.hubs[0]?.consumers, 300)
  } finally {
    database.close()
  }
})

test("a reach just under the threshold is still expanded", () => {
  const database = new Database({ path: ":memory:" })
  try {
    const logger = indexed(database, "src/logger.ts", "log")
    const edges = []
    for (let at = 0; at < 150; at += 1) {
      edges.push(calls(indexed(database, `src/consumer-${at}.ts`, `use${at}`), logger))
    }
    insertEdges(database, PROJECT, edges)

    const reach = reachOf(database, PROJECT, ["src/logger.ts"])

    assert.equal(reach.truncated, false)
    assert.equal(reach.paths.length, 150)
  } finally {
    database.close()
  }
})
