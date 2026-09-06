import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { mkdir, utimes, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { test } from "node:test"

import { belowMinimumNode, diagnose, type DoctorReport } from "../src/diagnostics.ts"
import { renderDoctor } from "../src/report.ts"
import { settingsPath } from "../src/paths.ts"
import { Runtime } from "../src/runtime.ts"

const VERSION = "1.0.0"

// The floor `engines` declares is a patch version because node:sqlite is unflagged only from
// 22.13.0. Comparing the major alone accepted every 22.x, so the doctor reported a healthy runtime
// on a Node where the store cannot open.
test("the node floor is compared to the patch, not to the major", () => {
  for (const version of ["22.0.0", "22.12.0", "22.12.9", "21.99.99", "20.11.0"]) {
    assert.equal(belowMinimumNode(version, "22.13.0"), true, `${version} must be refused`)
  }
  for (const version of ["22.13.0", "22.13.1", "22.14.0", "23.0.0", "26.3.0"]) {
    assert.equal(belowMinimumNode(version, "22.13.0"), false, `${version} must be accepted`)
  }
})

test("a version neither side can read is refused rather than assumed adequate", () => {
  assert.equal(belowMinimumNode("", "22.13.0"), true)
  assert.equal(belowMinimumNode("not-a-version", "22.13.0"), true)
  assert.equal(belowMinimumNode("22.13.0", ""), true)
})

// The check and the manifest must name the same floor: two declarations of it is what let them
// drift apart, with `engines` saying 22.13.0 while the doctor accepted 22.0.
test("the floor the doctor enforces is the one the manifest declares", async () => {
  const { readFile } = await import("node:fs/promises")
  const manifest = JSON.parse(
    await readFile(join(dirname(import.meta.dirname), "package.json"), "utf8"),
  )
  const declared = /\d+(?:\.\d+){0,2}/u.exec(String(manifest.engines?.node ?? ""))?.[0]

  assert.ok(declared, "package.json must declare an engines.node floor")
  // One below the declared floor is refused, the floor itself is not.
  const [major = 0, minor = 0] = declared.split(".").map(Number)
  assert.equal(belowMinimumNode(`${major}.${minor - 1}.99`, declared), true)
  assert.equal(belowMinimumNode(declared, declared), false)
  assert.equal(belowMinimumNode(process.versions.node, declared), false, "this runtime meets it")
})

interface Case {
  readonly close: () => void
  readonly environment: NodeJS.ProcessEnv
}

/**
 * The data directory is deliberately outside the project directory: diagnostics refuses the other
 * arrangement, and a test that tripped that refusal would be measuring the wrong thing.
 */
function isolated(options: Record<string, string> = {}, extra: NodeJS.ProcessEnv = {}): Case {
  const data = mkdtempSync(join(tmpdir(), "cycle-doctor-data-"))
  const project = mkdtempSync(join(tmpdir(), "cycle-doctor-project-"))
  const config = mkdtempSync(join(tmpdir(), "cycle-doctor-config-"))

  const environment: NodeJS.ProcessEnv = {
    CLAUDE_CONFIG_DIR: config,
    CLAUDE_PLUGIN_OPTION_DATA_DIR: data,
    CLAUDE_PROJECT_DIR: project,
    ...Object.fromEntries(
      Object.entries(options).map(([key, value]) => [`CLAUDE_PLUGIN_OPTION_${key}`, value]),
    ),
    ...extra,
  }

  return {
    close: () => {
      for (const directory of [data, project, config]) rmSync(directory, { force: true, recursive: true })
    },
    environment,
  }
}

async function report(subject: Case): Promise<DoctorReport> {
  const cycle = new Runtime(subject.environment)
  try {
    return await diagnose(cycle, VERSION, subject.environment)
  } finally {
    cycle.close()
  }
}

const codes = (result: DoctorReport): string[] => result.findings.map((finding) => finding.code)

// `/cycle:run` is a dynamic workflow, so the product's central command does not start when
// workflows are off. The README names the requirement; this is the doctor catching the two ways to
// turn them off that are visible from this machine.
test("workflows turned off by the environment variable are reported as a failure", async () => {
  const subject = isolated({}, { CLAUDE_CODE_DISABLE_WORKFLOWS: "1" })
  try {
    const result = await report(subject)
    const finding = result.findings.find((entry) => entry.code === "runtime.workflows")

    assert.ok(finding !== undefined, "the doctor must say the governed cycle cannot start")
    assert.equal(finding?.severity, "error")
    assert.ok(finding?.message.includes("CLAUDE_CODE_DISABLE_WORKFLOWS"))
    assert.equal(result.ok, false)
  } finally {
    subject.close()
  }
})

test("workflows turned off in the settings file are reported too", async () => {
  const subject = isolated()
  try {
    await writeFile(settingsPath(subject.environment), JSON.stringify({ disableWorkflows: true }))
    const result = await report(subject)
    const finding = result.findings.find((entry) => entry.code === "runtime.workflows")

    assert.ok(finding !== undefined)
    assert.ok(finding?.message.includes("disableWorkflows"))
  } finally {
    subject.close()
  }
})

// An absent finding means "nothing this process can read turns them off", never "available": a plan
// that does not include the feature is not visible from here, and saying otherwise would be the
// kind of claim this product exists to refuse.
test("a value that does not turn workflows off raises nothing", async () => {
  for (const value of ["", "0", "false"]) {
    const subject = isolated({}, { CLAUDE_CODE_DISABLE_WORKFLOWS: value })
    try {
      assert.equal(codes(await report(subject)).includes("runtime.workflows"), false, value)
    } finally {
      subject.close()
    }
  }
})

// The counter behind this finding used to count the variables present rather than the values in
// them, so a host that resolved every option to an empty string reported a full delivery and this
// warning never fired. Doctor now names which of the two shapes it found, because the remedies
// differ: one install was never configured, the other was configured and the values did not arrive.
test("options that arrive empty are reported as an undelivered configuration", async () => {
  const local = mkdtempSync(join(tmpdir(), "cycle-doctor-local-"))
  const subject = isolated(
    { ARBITER_MODEL: "", ARCHITECT_MODEL: "", EXECUTOR_MODEL: "" },
    { CLAUDE_PLUGIN_OPTION_DATA_DIR: "", LOCALAPPDATA: local },
  )
  try {
    const result = await report(subject)

    assert.ok(codes(result).includes("config.undelivered"))
    const finding = result.findings.find((entry) => entry.code === "config.undelivered")
    assert.ok(finding?.message.includes("reached this process empty"))
    assert.equal(result.configuration.delivered, 0)
    assert.equal(result.configuration.blank, 4)
    assert.ok(renderDoctor(result).includes("0 (4 arrived empty)"))
  } finally {
    subject.close()
    rmSync(local, { force: true, recursive: true })
  }
})

// Certification 11.7: no gateway, no configuration, nothing to fix.
test("an unconfigured install with no gateway reports no failure", async () => {
  const subject = isolated()
  try {
    const result = await report(subject)

    assert.equal(result.models.baseUrlHost, null)
    assert.equal(result.models.routedElsewhere, false)
    assert.equal(result.models.credentialMode, "subscription-or-default")
    assert.equal(result.models.roles.arbiter.resolved, "session model")
    assert.ok(!codes(result).includes("models.unroutable"))
    assert.ok(!codes(result).includes("models.providers"))
    assert.deepEqual(
      result.findings.filter((finding) => finding.severity === "error"),
      [],
    )
  } finally {
    subject.close()
  }
})

// Certification 2.6 and 2.8: an override and a correlation are both reported, not assumed away.
test("a subagent override and correlated judges are both reported", async () => {
  const subject = isolated({}, { CLAUDE_CODE_SUBAGENT_MODEL: "claude-haiku-4-5-20251001" })
  try {
    const result = await report(subject)

    assert.equal(result.models.subagentModelOverride, "claude-haiku-4-5-20251001")
    assert.ok(codes(result).includes("models.override"))
    assert.ok(codes(result).includes("models.correlation"))
  } finally {
    subject.close()
  }
})

// Certification 2.7: availableModels quietly substitutes, so doctor says it out loud.
test("a model the allowlist does not permit is reported as substituted", async () => {
  const subject = isolated({ ARBITER_MODEL: "openai/gpt-5.6" })
  try {
    writeFileSync(
      join(String(subject.environment["CLAUDE_CONFIG_DIR"]), "settings.json"),
      JSON.stringify({ availableModels: ["claude-opus-5"] }),
    )
    const result = await report(subject)

    assert.deepEqual(result.models.availableModelsAllowlist, ["claude-opus-5"])
    assert.ok(codes(result).includes("models.allowlist"))
  } finally {
    subject.close()
  }
})

// Certification 11.3, and specification 16.3: the per-role provider path is in the report a user
// reads, not only in the structure a program reads.
test("five distinct providers are reported per role and rendered in the summary", async () => {
  const subject = isolated(
    {
      ARCHITECT_MODEL: "anthropic/claude-opus-5",
      EXECUTOR_MODEL: "openai/gpt-5.6-codex",
      FUNCTIONAL_REVIEWER_MODEL: "google/gemini-3-pro",
      SECURITY_REVIEWER_MODEL: "xai/grok-5",
      ARBITER_MODEL: "minimax/minimax-m3",
    },
    { ANTHROPIC_BASE_URL: "http://127.0.0.1:4000" },
  )
  try {
    const result = await report(subject)

    assert.equal(result.models.distinctProviders, 5)
    assert.equal(result.models.routedElsewhere, true)
    assert.ok(!codes(result).includes("models.providers"))
    assert.ok(!codes(result).includes("models.correlation"))

    const summary = renderDoctor(result)
    assert.match(summary, /role\s+model\s+effort\s+provider\s+billed to/u)
    assert.match(summary, /executor\s+openai\/gpt-5\.6-codex\s+high\s+openai\s+gateway account/u)
    assert.match(summary, /architect\s+anthropic\/claude-opus-5\s+high\s+anthropic\s+subscription/u)
    assert.match(summary, /operator\s+haiku\s+low\s+gateway\s+gateway account/u)
    assert.match(summary, /distinct providers\s+5/u)
  } finally {
    subject.close()
  }
})

// A gateway that routes nothing differently is a gateway in name only.
test("a gateway with every role on one path is reported as no independence", async () => {
  const subject = isolated({}, { ANTHROPIC_BASE_URL: "http://127.0.0.1:4000" })
  try {
    const result = await report(subject)

    assert.equal(result.models.distinctProviders, 1)
    assert.ok(codes(result).includes("models.providers"))
  } finally {
    subject.close()
  }
})

// Two roles set to the same model is a decision. Warning about it trains the reader to skip
// warnings, and the one that matters — two models chosen to differ arriving as one — goes with it.
test("roles deliberately sharing one model are not reported as a collapse", async () => {
  const subject = isolated({
    ARBITER_MODEL: "claude-fable-5",
    ARCHITECT_MODEL: "claude-opus-5",
    EXECUTOR_MODEL: "claude-sonnet-5",
    FUNCTIONAL_REVIEWER_MODEL: "claude-sonnet-5",
    SECURITY_REVIEWER_MODEL: "claude-opus-5",
  })
  try {
    const result = await report(subject)

    assert.ok(!codes(result).includes("models.subagent_collapse"))
  } finally {
    subject.close()
  }
})

test("two judges whose distinct models reach one alias are reported", async () => {
  const subject = isolated({
    ARBITER_MODEL: "claude-fable-5",
    FUNCTIONAL_REVIEWER_MODEL: "claude-opus-4-7",
    SECURITY_REVIEWER_MODEL: "claude-opus-4-8",
  })
  try {
    const result = await report(subject)
    const finding = result.findings.find((entry) => entry.code === "models.subagent_collapse")

    assert.ok(finding !== undefined)
    assert.match(finding.message, /return verdicts from one model/u)
  } finally {
    subject.close()
  }
})

/**
 * The version was read as evidence of how fresh the answering process was — first as proof it was
 * stale, then as proof it was not, and wrong both times. It says which build is running and nothing
 * about when. This does.
 */
test("the report says how long the answering process has been up", async () => {
  const subject = isolated()
  try {
    const result = await report(subject)

    assert.equal(typeof result.runtime.startedMinutesAgo, "number")
    assert.ok(result.runtime.startedMinutesAgo >= 0)
  } finally {
    subject.close()
  }
})

// The judgement belongs in a finding that fires when it is true, not in the value column where it
// reads as commentary riding along in tool output — which is how a caller described it.
test("a server older than the settings it reports says so", async () => {
  const subject = isolated()
  try {
    const settings = settingsPath(subject.environment)
    await mkdir(dirname(settings), { recursive: true })
    await writeFile(settings, "{}", "utf8")

    // Written after this process started: the server is answering with the configuration as it
    // stood before the edit, which is the whole reason the finding exists.
    const stale = await report(subject)
    assert.ok(stale.findings.some((entry) => entry.code === "runtime.stale_configuration"))

    // A settings file older than the process is what a restarted server sees, and it must stay
    // quiet. Two days back keeps the case independent of how long the suite has been running.
    const before = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    await utimes(settings, before, before)

    const restarted = await report(subject)
    assert.equal(
      restarted.findings.find((entry) => entry.code === "runtime.stale_configuration"),
      undefined,
    )
  } finally {
    subject.close()
  }
})
