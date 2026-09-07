import assert from "node:assert/strict"
import { test } from "node:test"

import type { ChangedFile } from "../src/evidence/changes.ts"
import { DEFAULT_TIMEOUT_SECONDS, type Gate } from "../src/evidence/gates.ts"
import { requiredMissingGates } from "../src/evidence/required.ts"

const changed = (...paths: string[]): ChangedFile[] =>
  paths.map((path) => ({ digest: "d", kind: "modified", path }))

const projectGate = (name: string, invocation: string): Gate => ({
  executor: { kind: "unavailable", reason: "not run in this test" },
  invocation,
  kind: "test",
  mandatory: true,
  name,
  precondition: "declared by the project",
  timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
})

const names = (gates: readonly Gate[]): string[] => gates.map((gate) => gate.name).sort()

test("a UI change with no browser gate demands one, and an accessibility check with it", () => {
  const gates = requiredMissingGates(changed("src/components/Banner.tsx"), [], "standard")

  assert.deepEqual(names(gates), ["accessibility:affected-user-flow", "browser:affected-user-flow"])
  assert.ok(gates.every((gate) => gate.mandatory))
})

test("a project that already drives the browser is not asked for a second one", () => {
  const gates = requiredMissingGates(
    changed("src/pages/Checkout.tsx"),
    [projectGate("test:npx playwright test", "npx playwright test")],
    "standard",
  )

  assert.deepEqual(names(gates), ["accessibility:affected-user-flow"])
})

// Certification 5.5.
test("a migration demands a real database gate", () => {
  const gates = requiredMissingGates(changed("db/migrations/0007_add_users.sql"), [], "standard")

  assert.deepEqual(names(gates), ["database:real-integration"])
})

// Certification 5.3, 5.4.
test("a dependency change demands both a vulnerability audit and a licence check", () => {
  const gates = requiredMissingGates(changed("package-lock.json"), [], "standard")

  assert.deepEqual(names(gates), [
    "security:dependency-license",
    "security:dependency-vulnerability",
  ])
})

// Certification 5.4.
test("an audit script satisfies the vulnerability gate but not the licence one", () => {
  const gates = requiredMissingGates(
    changed("Cargo.lock"),
    [projectGate("security:npm audit", "npm audit")],
    "standard",
  )

  assert.deepEqual(names(gates), ["security:dependency-license"])
})

// Certification 5.6.
test("a packaging change demands a production artifact gate", () => {
  const gates = requiredMissingGates(changed("packaging/Dockerfile"), [], "standard")

  assert.ok(names(gates).includes("package:production-artifact"))
})

test("a change to the security surface demands an executed proof", () => {
  const gates = requiredMissingGates(changed("src/auth/session.ts"), [], "standard")

  assert.deepEqual(names(gates), ["security:executed-proof"])
})

// A rule that fires on any word containing "auth" would demand a security proof of every change and
// train people to run in advisory mode.
test("ordinary paths demand nothing", () => {
  const gates = requiredMissingGates(
    changed("docs/authorship.md", "src/consolidate.ts", "README.md"),
    [],
    "standard",
  )

  assert.deepEqual(gates, [])
})

// A login screen is both an interface and a security surface, so it collects both sets.
test("one change can require proofs from more than one layer", () => {
  const gates = requiredMissingGates(changed("src/components/Login.tsx"), [], "standard")

  assert.deepEqual(names(gates), [
    "accessibility:affected-user-flow",
    "browser:affected-user-flow",
    "security:executed-proof",
  ])
})

// Certification 5.17.
test("advisory records the missing proof without blocking on it", () => {
  const gates = requiredMissingGates(changed("src/components/Banner.tsx"), [], "advisory")

  assert.equal(gates.length, 2)
  assert.ok(gates.every((gate) => !gate.mandatory))
})

// Certification 5.22.
/**
 * D1. The rules are matched against what the change reaches as well as what it touches. A change to
 * a configuration loader that nothing under `auth` mentions still requires the security proof, once
 * the graph says a session module imports it — which is the whole point of reading the reach at the
 * evidence layer rather than at the routing layer.
 */
test("a file the change reaches, but does not touch, inserts the gate its layer requires", () => {
  const touchedOnly = requiredMissingGates(changed("src/config/loader.ts"), [], "standard")
  assert.deepEqual(touchedOnly.map((gate) => gate.name), [])

  const withReach = requiredMissingGates(changed("src/config/loader.ts"), [], "standard", [], [
    "src/auth/session.ts",
  ])

  assert.deepEqual(withReach.map((gate) => gate.name), ["security:executed-proof"])
  assert.ok(withReach[0]?.precondition.includes("src/auth/session.ts"))
})

/** Promote-only by construction: reach can add a gate, and has no way to remove one. */
test("reached paths never remove a gate the touched paths required", () => {
  const touched = requiredMissingGates(changed("src/auth/session.ts"), [], "standard")
  const reaching = requiredMissingGates(changed("src/auth/session.ts"), [], "standard", [], [
    "docs/README.md",
    "src/unrelated.ts",
  ])

  assert.ok(touched.length > 0)
  for (const gate of touched) assert.ok(reaching.some((other) => other.name === gate.name))
  assert.ok(reaching.length >= touched.length)
})
