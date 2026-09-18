import assert from "node:assert/strict"
import { test } from "node:test"

import { comparePlans } from "../src/workflow/divergence.ts"
import { parsePlan, type Plan } from "../src/workflow/plan.ts"

/** A plan whose tasks write the given scopes, one task each, valid by every structural rule. */
function planWriting(scopes: readonly string[]): Plan {
  return parsePlan({
    assumptions: [],
    integration_checks: [],
    requirements: scopes.map((_, index) => ({
      acceptance_criteria: ["it works"],
      id: `REQ-${index + 1}`,
      statement: `requirement ${index + 1}`,
    })),
    risks: [],
    tasks: scopes.map((scope, index) => ({
      acceptance_criteria: ["it works"],
      dependencies: [],
      key: `task-${index + 1}`,
      objective: `write ${scope}`,
      requirement_ids: [`REQ-${index + 1}`],
      title: `Task ${index + 1}`,
      verification_commands: ["npm test"],
      write_scopes: [scope],
    })),
  })
}

test("two plans over the same areas do not diverge", () => {
  const divergence = comparePlans(
    planWriting(["src/auth", "src/session"]),
    planWriting(["src/session", "src/auth"]),
  )

  assert.equal(divergence.diverged, false)
  assert.deepEqual(divergence.onlyInFirst, [])
  assert.deepEqual(divergence.onlyInSecond, [])
})

/**
 * The comparison is containment, not equality. `src/auth` and `src/auth/session.ts` are the same
 * area described at two resolutions, and reporting that as disagreement would make every pair of
 * plans diverge — which is the same as reporting nothing.
 */
test("the same area at two resolutions is agreement, not divergence", () => {
  const divergence = comparePlans(planWriting(["src/auth"]), planWriting(["src/auth/session.ts"]))

  assert.equal(divergence.diverged, false)
})

/**
 * The case the gate exists for: one architect thinks the change reaches somewhere the other never
 * named. That is not one plan being better — it is the request admitting two readings.
 */
test("a scope one plan reaches and the other never names is divergence", () => {
  const divergence = comparePlans(
    planWriting(["src/auth", "src/billing"]),
    planWriting(["src/auth"]),
  )

  assert.equal(divergence.diverged, true)
  assert.deepEqual(divergence.onlyInFirst, ["src/billing"])
  assert.deepEqual(divergence.onlyInSecond, [])
  assert.match(divergence.summary, /src\/billing/u)
})

test("divergence is reported from both sides, not only the first", () => {
  const divergence = comparePlans(planWriting(["src/api"]), planWriting(["src/ui"]))

  assert.deepEqual(divergence.onlyInFirst, ["src/api"])
  assert.deepEqual(divergence.onlyInSecond, ["src/ui"])
  assert.equal(divergence.totals.shared, 0)
})

/**
 * Agreement about scope is not agreement about correctness, and the summary says so. Two architects
 * can read a request the same way and both be wrong about it; what this measures is whether the
 * request was read the same way twice, which is a different question and the only one write scopes
 * can answer.
 */
test("the summary never claims agreement proves a plan right", () => {
  const agreed = comparePlans(planWriting(["src/auth"]), planWriting(["src/auth"]))

  assert.match(agreed.summary, /not proof that either plan is right/u)
})

test("a trailing separator or a backslash is the same scope", () => {
  const divergence = comparePlans(planWriting(["src/auth/"]), planWriting(["src\\auth"]))

  assert.equal(divergence.diverged, false)
})
