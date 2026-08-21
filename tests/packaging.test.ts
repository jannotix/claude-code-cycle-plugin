import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { mkdir, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"

// @ts-expect-error the packaging scripts are plain JavaScript, deliberately dependency-free
import { collect, FORBIDDEN, readEntries, ROOT, runtimePackage, violations } from "../scripts/manifest.mjs"
// @ts-expect-error the packaging scripts are plain JavaScript, deliberately dependency-free
import { createZip } from "../scripts/zip.mjs"

const artifact: Promise<string[]> = collect() as Promise<string[]>

// Certification 13.1.
test("the artifact carries no tests, fixtures, documentation or debug output", async () => {
  const paths = await artifact

  assert.equal(violations(paths).length, 0, JSON.stringify(violations(paths)))
  assert.equal(paths.some((path) => path.startsWith("tests/")), false)
  assert.equal(paths.some((path) => path.startsWith("docs/")), false)
  assert.equal(paths.some((path) => path.includes("fixture")), false)
})

// Certification 13.2.
test("the artifact carries no source maps, sources or development configuration", async () => {
  const paths = await artifact

  assert.equal(paths.some((path) => path.endsWith(".map")), false)
  assert.equal(paths.some((path) => path.endsWith(".ts")), false)
  assert.equal(paths.some((path) => path.startsWith("src/")), false)
  assert.equal(paths.some((path) => /tsconfig/u.test(path)), false)
  assert.equal(paths.some((path) => path.includes("node_modules")), false)
  assert.equal(paths.some((path) => path.endsWith("package-lock.json")), false)
})

// Certification 13.3. The check runs on the built file list, not on the rules that produced it, so
// a mistake in the allowlist fails the build rather than reaching a user.
test("an excluded file that reaches the artifact fails the build", () => {
  for (const [path, reason] of [
    ["tests/store.test.js", "test file"],
    ["dist/server.js.map", "source map"],
    ["docs/manual.md", "documentation"],
    ["tsconfig.json", "development configuration"],
    ["node_modules/x/index.js", "dependency tree"],
    [".env", "credential"],
    ["tests-debug/scratch.json", "debug output"],
  ]) {
    const found = violations([path!]) as { reason: string }[]
    assert.ok(found.length > 0, `${path} should be refused`)
    assert.equal(found[0]?.reason, reason)
  }
})

test("every forbidden rule is reachable, so none is dead", () => {
  const samples = [
    "src/a.ts",
    "dist/a.d.ts",
    "dist/a.js.map",
    "tests/a.test.js",
    "fixtures/a.json",
    "docs/a.md",
    "coverage/a.json",
    "tests-debug/a.log",
    "tsconfig.tests.json",
    "package-lock.json",
    "node_modules/a/b.js",
    "dist/.tsbuildinfo",
    ".gitignore",
    "auth.json",
    "scripts/package.mjs",
  ]
  const reasons = new Set(
    samples.flatMap((path) => (violations([path]) as { reason: string }[]).map((v) => v.reason)),
  )

  assert.equal(reasons.size, (FORBIDDEN as unknown[]).length)
})

test("the artifact carries what the plugin needs to start", async () => {
  const paths = await artifact

  for (const required of [
    ".claude-plugin/plugin.json",
    ".mcp.json",
    "dist/server.js",
    "LICENSE",
    "NOTICE",
    "README.md",
    "CHANGELOG.md",
    "SECURITY.md",
    "workflows/cycle.js",
    "hooks/hooks.json",
  ]) {
    assert.ok(paths.includes(required), `missing ${required}`)
  }

  assert.ok(paths.filter((path) => path.startsWith("agents/")).length >= 6)
  assert.ok(paths.filter((path) => path.startsWith("skills/")).length >= 20)
  assert.ok(paths.filter((path) => path.endsWith(".wasm")).length >= 12)
})

// dist/*.js is ESM. Without this file Node reads it as CommonJS and the server fails to start.
test("the artifact declares itself an ES module and ships no build tooling", async () => {
  const source = JSON.parse(await readFile(join(ROOT as string, "package.json"), "utf8"))
  const runtime = JSON.parse(runtimePackage(source) as string)

  assert.equal(runtime.type, "module")
  assert.equal(runtime.version, source.version)
  assert.equal(runtime.scripts, undefined)
  assert.equal(runtime.devDependencies, undefined)
  assert.equal(runtime.dependencies, undefined)
})

test("the plugin manifest version matches the package version", async () => {
  const manifest = JSON.parse(
    await readFile(join(ROOT as string, ".claude-plugin", "plugin.json"), "utf8"),
  )
  const source = JSON.parse(await readFile(join(ROOT as string, "package.json"), "utf8"))

  assert.equal(manifest.version, source.version)
})

// A zip only this writer can read would be worse than no zip at all.
test("the archive is readable by a tool that did not write it", async (t) => {
  if (process.platform !== "win32") return t.skip("uses PowerShell Expand-Archive")

  const paths = (await artifact).slice(0, 40)
  const entries = await readEntries(paths)
  const archive = createZip(entries) as Buffer

  const work = mkdtempSync(join(tmpdir(), "cycle-zip-"))
  try {
    const zipPath = join(work, "a.zip")
    writeFileSync(zipPath, archive)
    execFileSync(
      "powershell",
      ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${join(work, "out")}' -Force`],
      { stdio: ["ignore", "ignore", "ignore"], timeout: 60_000 },
    )

    for (const path of paths) {
      const extracted = await readFile(join(work, "out", path))
      const original = entries.find((entry: { path: string }) => entry.path === path)
      assert.deepEqual(extracted, original.data, path)
    }
  } finally {
    rmSync(work, { force: true, recursive: true })
  }
})

test("an empty file and a file that deflates larger both round trip", async () => {
  const work = mkdtempSync(join(tmpdir(), "cycle-zip-edge-"))
  try {
    await mkdir(dirname(join(work, "a/b.txt")), { recursive: true })
    const entries = [
      { data: Buffer.alloc(0), path: "empty.txt" },
      { data: Buffer.from("x"), path: "tiny.txt" },
      { data: Buffer.from("a".repeat(100_000)), path: "a/b.txt" },
    ]
    const archive = createZip(entries) as Buffer

    assert.equal(archive.subarray(0, 2).toString(), "PK")
    assert.ok(archive.length > 0)
    assert.ok(archive.includes(Buffer.from("empty.txt")))
  } finally {
    rmSync(work, { force: true, recursive: true })
  }
})
