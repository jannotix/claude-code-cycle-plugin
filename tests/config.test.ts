import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
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

/**
 * The host injects CLAUDE_PLUGIN_OPTION_* into hooks, not into MCP servers: an MCP server only
 * receives what its own env block asks for, through ${user_config.KEY}. Without this test an
 * option can be declared, saved by the host and silently never applied — which is what happened.
 */
test("every declared option is wired to the server and read by it", async () => {
  const root = join(import.meta.dirname, "..")
  const manifest = JSON.parse(
    await readFile(join(root, ".claude-plugin", "plugin.json"), "utf8"),
  ) as { userConfig: Record<string, unknown> }
  const mcp = JSON.parse(await readFile(join(root, ".mcp.json"), "utf8")) as {
    mcpServers: Record<string, { env?: Record<string, string> }>
  }

  const environment: NodeJS.ProcessEnv = {}
  for (const server of Object.values(mcp.mcpServers)) {
    for (const [name, value] of Object.entries(server.env ?? {})) environment[name] = value
  }

  for (const key of Object.keys(manifest.userConfig)) {
    assert.equal(
      environment[`CLAUDE_PLUGIN_OPTION_${key.toUpperCase()}`],
      `\${user_config.${key}}`,
      `${key} is declared but never reaches the server`,
    )
  }

  // The other direction: a variable the server is handed but does not read changes nothing.
  assert.deepEqual(readConfiguration(environment).unknown, [])
  assert.equal(readConfiguration(environment).delivered, Object.keys(manifest.userConfig).length)
})

// A proof executes code the reviewer wrote, with this account's privileges and no operating-system
// sandbox. Installing a plugin must not be how someone acquires that.
test("executing security proofs is off until it is turned on", () => {
  assert.equal(readConfiguration({}).securityProofs, false)
  assert.equal(
    readConfiguration({ CLAUDE_PLUGIN_OPTION_SECURITY_PROOFS: "on" }).securityProofs,
    true,
  )
  assert.equal(
    readConfiguration({ CLAUDE_PLUGIN_OPTION_SECURITY_PROOFS: "off" }).securityProofs,
    false,
  )

  // A value nobody recognises leaves the capability off and says so, rather than guessing.
  const odd = readConfiguration({ CLAUDE_PLUGIN_OPTION_SECURITY_PROOFS: "yes" })
  assert.equal(odd.securityProofs, false)
  assert.ok(odd.invalid.some((entry) => entry.includes("SECURITY_PROOFS")))
})
