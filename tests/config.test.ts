import assert from "node:assert/strict"
import { test } from "node:test"

import { readConfiguration } from "../src/config.ts"

const option = (values: Record<string, string>): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [`CLAUDE_PLUGIN_OPTION_${key}`, value]))

// Certification 2.1.
test("an unconfigured install inherits the session model for every judging role", () => {
  const config = readConfiguration({})

  assert.equal(config.roles.architect.model, "inherit")
  assert.equal(config.roles.arbiter.model, "inherit")
  assert.equal(config.roles.operator.model, "haiku")
  assert.equal(config.gateStrictness, "standard")
  assert.equal(config.maxRepairCycles, 5)
  assert.deepEqual(config.invalid, [])
})

test("role models and efforts come from user configuration", () => {
  const config = readConfiguration(
    option({
      ARBITER_MODEL: "gpt-5.6-sol",
      ARBITER_EFFORT: "xhigh",
      EXECUTOR_MODEL: "minimax-m3",
      REVIEWER_EFFORT: "max",
    }),
  )

  assert.equal(config.roles.arbiter.model, "gpt-5.6-sol")
  assert.equal(config.roles.arbiter.effort, "xhigh")
  assert.equal(config.roles.executor.model, "minimax-m3")
  assert.equal(config.roles.functional_reviewer.effort, "max")
  assert.equal(config.roles.security_reviewer.effort, "max")
})

// Certification 2.9.
test("an invalid value is reported and never silently applied", () => {
  const config = readConfiguration(
    option({ ARCHITECT_EFFORT: "extreme", MAX_REPAIR_CYCLES: "0", GATE_STRICTNESS: "loose" }),
  )

  assert.equal(config.roles.architect.effort, "high")
  assert.equal(config.maxRepairCycles, 5)
  assert.equal(config.gateStrictness, "standard")
  assert.equal(config.invalid.length, 3)
})

// Certification 2.9.
test("a model identifier containing whitespace is rejected", () => {
  const config = readConfiguration(option({ ARBITER_MODEL: "not a model" }))

  assert.equal(config.roles.arbiter.model, "inherit")
  assert.equal(config.invalid.length, 1)
})

test("repair cycles accept the documented range and reject outside it", () => {
  assert.equal(readConfiguration(option({ MAX_REPAIR_CYCLES: "20" })).maxRepairCycles, 20)
  assert.equal(readConfiguration(option({ MAX_REPAIR_CYCLES: "21" })).maxRepairCycles, 5)
  assert.equal(readConfiguration(option({ MAX_REPAIR_CYCLES: "2.5" })).maxRepairCycles, 5)
})
