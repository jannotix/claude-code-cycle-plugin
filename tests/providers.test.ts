import assert from "node:assert/strict"
import { test } from "node:test"

import { readConfiguration } from "../src/config.ts"
import { describeProviders } from "../src/providers.ts"

const option = (values: Record<string, string>): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [`CLAUDE_PLUGIN_OPTION_${key}`, value]))

const paths = (options: Record<string, string>, environment: NodeJS.ProcessEnv = {}) =>
  describeProviders(readConfiguration(option(options)), environment)

const GATEWAY = { ANTHROPIC_BASE_URL: "http://127.0.0.1:4000" }

test("with no gateway every role rides the session credential", () => {
  const report = paths({}, {})

  assert.equal(report.gateway, false)
  assert.equal(report.endpoint, null)
  assert.equal(report.credentialMode, "subscription-or-default")
  assert.equal(report.distinctProviders, 1)
  assert.equal(report.roles.arbiter.provider, "session")
  assert.equal(report.roles.arbiter.resolved, "session model")
  assert.equal(report.roles.arbiter.billing, "subscription")
  assert.deepEqual(report.unroutable, [])
})

test("the Anthropic endpoint itself is not a gateway", () => {
  const report = paths({}, { ANTHROPIC_BASE_URL: "https://api.anthropic.com" })

  assert.equal(report.gateway, false)
  assert.equal(report.endpoint, "api.anthropic.com")
})

// Certification 11.3: five roles, five providers, asserted rather than assumed.
test("a provider named per role resolves to five distinct provider paths", () => {
  const report = paths(
    {
      ARCHITECT_MODEL: "anthropic/claude-opus-5",
      EXECUTOR_MODEL: "openai/gpt-5.6-codex",
      FUNCTIONAL_REVIEWER_MODEL: "google/gemini-3-pro",
      SECURITY_REVIEWER_MODEL: "xai/grok-5",
      ARBITER_MODEL: "minimax/minimax-m3",
    },
    GATEWAY,
  )

  assert.equal(report.distinctProviders, 5)
  assert.equal(report.roles.executor.provider, "openai")
  assert.equal(report.roles.executor.resolved, "openai/gpt-5.6-codex")
  assert.equal(report.roles.security_reviewer.provider, "xai")
})

// D-007: only the base URL is set, so the saved login is forwarded and Anthropic-routed work stays
// on the subscription. Everything else is paid for by a credential the gateway holds.
test("billing follows the provider the role actually routes to", () => {
  const report = paths(
    { ARCHITECT_MODEL: "anthropic/claude-opus-5", EXECUTOR_MODEL: "openai/gpt-5.6-codex" },
    GATEWAY,
  )

  assert.equal(report.roles.architect.billing, "subscription")
  assert.equal(report.roles.executor.billing, "gateway-held")
})

// Certification 11.9.
test("a credential in the environment bills every role per token, whichever variable holds it", () => {
  for (const variable of ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"]) {
    const report = paths({ ARCHITECT_MODEL: "anthropic/claude-opus-5" }, { ...GATEWAY, [variable]: "sk-test" })

    assert.equal(report.credentialVariable, variable)
    assert.equal(report.credentialMode, "gateway-credential")
    assert.equal(report.roles.architect.billing, "gateway-credential")
    assert.equal(report.roles.arbiter.billing, "gateway-credential")
  }
})

test("a blank credential variable is not a credential", () => {
  assert.equal(paths({}, { ANTHROPIC_AUTH_TOKEN: "  " }).credentialVariable, null)
})

test("an unprefixed model behind a gateway is routed by the gateway, and the plugin says so", () => {
  const report = paths({ ARBITER_MODEL: "claude-opus-5" }, GATEWAY)

  assert.equal(report.roles.arbiter.provider, "gateway")
  assert.equal(report.roles.architect.provider, "session")
})

// Certification 11.8.
test("a provider-prefixed model with no gateway to route it is reported as unroutable", () => {
  const report = paths({ ARBITER_MODEL: "openai/gpt-5.6", EXECUTOR_MODEL: "openai/gpt-5.6" }, {})

  assert.deepEqual(report.unroutable, ["openai/gpt-5.6"])
  assert.equal(report.roles.arbiter.provider, "openai")
})

test("a trailing or leading slash is a model name, not a provider", () => {
  const report = paths({ ARBITER_MODEL: "weird/", EXECUTOR_MODEL: "/weird" }, {})

  assert.equal(report.roles.arbiter.provider, "anthropic")
  assert.equal(report.roles.executor.provider, "anthropic")
})

// The bug this caught: a foreign model name with no gateway was reported as provider "anthropic"
// and nothing else, which reads as a working setup for a call that cannot succeed.
test("an unprefixed model the Anthropic API does not have is reported as unroutable", () => {
  const report = paths({ ARBITER_MODEL: "gpt-5.6-sol", ARCHITECT_MODEL: "claude-opus-5" }, {})

  assert.deepEqual(report.unroutable, ["gpt-5.6-sol"])
})

test("the Anthropic aliases and dated names are routable without a gateway", () => {
  const report = paths(
    {
      ARCHITECT_MODEL: "opusplan",
      EXECUTOR_MODEL: "sonnet[1m]",
      FUNCTIONAL_REVIEWER_MODEL: "claude-opus-5",
      SECURITY_REVIEWER_MODEL: "haiku",
      ARBITER_MODEL: "fable",
    },
    {},
  )

  assert.deepEqual(report.unroutable, [])
})

// Certification 11.7: the gateway is optional, and its absence is not a failure.
test("the operator default is reported like any other role", () => {
  const report = paths({}, {})

  assert.equal(report.roles.operator.configured, "haiku")
  assert.equal(report.roles.operator.provider, "anthropic")
  assert.equal(report.roles.operator.billing, "subscription")
  assert.equal(report.roles.operator.effort, "low")
})
