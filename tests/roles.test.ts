import assert from "node:assert/strict"
import { test } from "node:test"

import { readConfiguration } from "../src/config.ts"
import { identifyProject } from "../src/project.ts"
import { CONSULTATION, ROLE_AGENT, resolveConsultation, resolveRole } from "../src/roles.ts"

const option = (values: Record<string, string>): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [`CLAUDE_PLUGIN_OPTION_${key}`, value]))

test("every role maps to a namespaced plugin agent", () => {
  for (const agent of Object.values(ROLE_AGENT)) {
    assert.match(agent, /^cycle:[a-z-]+$/u)
  }
  assert.equal(new Set(Object.values(ROLE_AGENT)).size, Object.keys(ROLE_AGENT).length)
})

test("every consultation maps to a role that exists", () => {
  const configuration = readConfiguration({})

  for (const name of Object.keys(CONSULTATION)) {
    assert.doesNotThrow(() => resolveConsultation(configuration, name))
  }
})

// Certification 2.1.
test("an unconfigured role signals inheritance instead of a model", () => {
  const resolved = resolveRole(readConfiguration({}), "architect")

  assert.equal(resolved.inherits, true)
  assert.equal(resolved.model, null)
})

// Certification 2.3, 2.4.
test("a configured role carries its model and effort", () => {
  const configuration = readConfiguration(
    option({ REVIEWER_EFFORT: "max", SECURITY_REVIEWER_MODEL: "glm-5.3-max" }),
  )
  const resolved = resolveRole(configuration, "security_reviewer")

  assert.equal(resolved.inherits, false)
  assert.equal(resolved.model, "glm-5.3-max")
  assert.equal(resolved.effort, "max")
  assert.equal(resolved.agent, "cycle:security-reviewer")
})

// A per-reviewer effort option does not exist. Accepting the name silently would let a user believe
// they had tuned one reviewer when nothing changed.
test("an option this build does not read is reported rather than ignored", () => {
  const configuration = readConfiguration(option({ SECURITY_REVIEWER_EFFORT: "max" }))

  assert.deepEqual(configuration.unknown, ["SECURITY_REVIEWER_EFFORT"])
  assert.equal(configuration.roles.security_reviewer.effort, "high")
})

test("a fully valid configuration reports nothing unknown", () => {
  const configuration = readConfiguration(
    option({ ARBITER_MODEL: "gpt-5.6-sol", GATE_STRICTNESS: "strict", REVIEWER_EFFORT: "xhigh" }),
  )

  assert.deepEqual(configuration.unknown, [])
  assert.deepEqual(configuration.invalid, [])
})

// Certification 2.4.
test("the reviewer effort option applies to both reviewers", () => {
  const configuration = readConfiguration(option({ REVIEWER_EFFORT: "xhigh" }))

  assert.equal(resolveRole(configuration, "functional_reviewer").effort, "xhigh")
  assert.equal(resolveRole(configuration, "security_reviewer").effort, "xhigh")
})

test("an unknown consultation throws rather than defaulting to a role", () => {
  assert.throws(() => resolveConsultation(readConfiguration({}), "chief"), /unknown consultation/u)
})

test("project identity is stable for the same path and differs across projects", () => {
  const first = identifyProject("/work/alpha", {})
  const again = identifyProject("/work/alpha", {})
  const other = identifyProject("/work/beta", {})

  assert.equal(first.id, again.id)
  assert.notEqual(first.id, other.id)
  assert.match(first.id, /^[0-9a-f]{32}$/u)
})

test("project identity falls back to the Claude project directory", () => {
  const identified = identifyProject(undefined, { CLAUDE_PROJECT_DIR: "/work/gamma" })

  assert.equal(identified.id, identifyProject("/work/gamma", {}).id)
})

// Certification 6.8: the standalone executor is a different agent from the one that implements,
// and it is the declaration that stops it writing, not the prompt asking it not to.
test("the executor consultation resolves to the advisory agent, not the implementing one", () => {
  const configuration = readConfiguration({})

  assert.equal(resolveConsultation(configuration, "executor").agent, "cycle:executor-advisor")
  assert.equal(resolveRole(configuration, "executor").agent, "cycle:executor")
})

test("the advisory executor keeps the executor's own model and effort", () => {
  const configuration = readConfiguration({
    CLAUDE_PLUGIN_OPTION_EXECUTOR_MODEL: "openai/gpt-5.6-codex",
    CLAUDE_PLUGIN_OPTION_EXECUTOR_EFFORT: "max",
  })
  const advisory = resolveConsultation(configuration, "executor")

  assert.equal(advisory.model, "openai/gpt-5.6-codex")
  assert.equal(advisory.effort, "max")
  assert.equal(advisory.role, "executor")
})

test("every other consultation uses the same read-only agent as the cycle", () => {
  const configuration = readConfiguration({})

  for (const [consultation, role] of Object.entries(CONSULTATION)) {
    if (consultation === "executor") continue
    assert.equal(
      resolveConsultation(configuration, consultation).agent,
      resolveRole(configuration, role).agent,
    )
  }
})

// Certification 6.8, at the declaration layer: the file that ships has to say it too.
test("every advisory agent declares away the tools that could change anything", async () => {
  const { readFile } = await import("node:fs/promises")
  const { dirname, join } = await import("node:path")
  const { fileURLToPath } = await import("node:url")
  const agents = join(dirname(dirname(fileURLToPath(import.meta.url))), "agents")

  for (const name of ["architect", "arbiter", "functional-reviewer", "security-reviewer", "executor-advisor", "operator"]) {
    const frontmatter = (await readFile(join(agents, `${name}.md`), "utf8")).split("---")[1] ?? ""
    const declared = /disallowedTools:\s*\[([^\]]*)\]/u.exec(frontmatter)?.[1] ?? ""
    for (const tool of ["Write", "Edit", "NotebookEdit", "Bash", "Task"]) {
      assert.ok(declared.includes(tool), `${name} must declare ${tool} as disallowed`)
    }
  }
})
