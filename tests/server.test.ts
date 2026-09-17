import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"

import { CURRENT_SCHEMA_VERSION } from "../src/store/migrations.ts"
import { byId, call, exchange, payload } from "./mcp-client.ts"

test("the server completes an MCP handshake and echoes the client protocol version", async () => {
  const [initialize] = await exchange([
    {
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: { capabilities: {}, protocolVersion: "2025-06-18" },
    },
  ])

  assert.equal(initialize?.result?.["protocolVersion"], "2025-06-18")
  assert.deepEqual(initialize?.result?.["capabilities"], { tools: {} })
})

test("every tool is advertised with a schema", async () => {
  const [listed] = await exchange([{ id: 1, jsonrpc: "2.0", method: "tools/list" }])

  const tools = listed?.result?.["tools"] as { inputSchema: unknown; name: string }[]
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    [
      "doctor",
      "goal",
      "graph_query",
      "index_project",
      "limits",
      "memory",
      "permissions",
      "record_event",
      "role_settings",
      "workflow",
    ],
  )
  assert.ok(tools.every((tool) => typeof tool.inputSchema === "object"))
})

test("a notification never produces a response", async () => {
  const responses = await exchange([
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { id: 2, jsonrpc: "2.0", method: "ping" },
  ])

  assert.equal(responses.length, 1)
  assert.equal(responses[0]?.id, 2)
})

test("doctor returns a structured report and a rendered summary", async () => {
  const [response] = await exchange([call(1, "doctor")])

  const result = payload<{
    report: { findings: unknown[]; runtime: { node: string }; store: { schemaVersion: number } }
    summary: string
  }>(response)

  assert.equal(result.report.runtime.node, process.versions.node)
  assert.equal(result.report.store.schemaVersion, CURRENT_SCHEMA_VERSION)
  // Read, not written: the literal that used to sit here went stale across three releases while
  // the assertion kept passing.
  const manifest = JSON.parse(
    await readFile(join(import.meta.dirname, "..", ".claude-plugin", "plugin.json"), "utf8"),
  ) as { version: string }
  assert.ok(result.summary.includes(`Cycle ${manifest.version}`))
  assert.ok(result.report.findings.length > 0)
})

test("an unknown tool is refused instead of answered", async () => {
  const [response] = await exchange([call(1, "does-not-exist")])

  assert.equal(response?.error?.code, -32601)
})

test("malformed input does not terminate the server", async () => {
  const responses = await exchange(["not json", { id: 7, jsonrpc: "2.0", method: "ping" }])

  // Correlated by id, not by position: the server answers each line independently.
  assert.ok(byId(responses, 7) !== undefined, "the request after the malformed line was answered")
  assert.ok(responses.some((response) => response.error !== undefined))
})

/**
 * Valid JSON is not a valid request, and the gap between the two was a way to end the session from
 * one line. `null`, a number, a string and an array all parse, so they cleared the try/catch above
 * and were then destructured — which throws, unhandled, and takes every later request down with it.
 * The test that existed covered only text that is not JSON at all, so the whole class sat behind a
 * green assertion.
 */
test("valid JSON that is not a request is refused, and the session survives it", async () => {
  for (const frame of ["null", "42", '"text"', "[]", "true"]) {
    const responses = await exchange([frame, { id: 9, jsonrpc: "2.0", method: "ping" }])

    assert.ok(
      byId(responses, 9) !== undefined,
      `the request after ${frame} was answered, so the server was still alive`,
    )
    assert.ok(
      responses.some((response) => response.error?.code === -32_600),
      `${frame} was answered with invalid request`,
    )
  }
})
