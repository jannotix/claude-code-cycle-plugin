import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { diagnose, type DoctorReport } from "../src/diagnostics.ts"
import { renderDoctor } from "../src/report.ts"
import { Runtime } from "../src/runtime.ts"

const VERSION = "1.0.0"

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
