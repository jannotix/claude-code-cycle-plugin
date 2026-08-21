import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"

import { proofEvidence, proofGateName } from "../src/evidence/proof-evidence.ts"
import { ProofRefused, runProof, PROOF_TIMEOUT_SECONDS } from "../src/evidence/proof.ts"

function repository(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "cycle-proof-repo-"))
  const git = (...args: string[]): void => {
    execFileSync("git", ["-C", root, ...args], { stdio: "ignore" })
  }
  git("init", "--quiet")
  git("config", "user.email", "fixture@example.invalid")
  git("config", "user.name", "fixture")
  mkdirSync(join(root, ".githooks-empty"), { recursive: true })
  git("config", "core.hooksPath", join(root, ".githooks-empty"))

  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const proofsLeftBehind = (): string[] =>
  readdirSync(tmpdir()).filter((entry) => entry.startsWith("cycle-proof-"))

test("a proof that exits zero demonstrated the vulnerability", async () => {
  const root = repository({ "exploit.mjs": "process.exit(0)\n" })
  try {
    const result = await runProof(root, { command: "node exploit.mjs" })

    assert.equal(result.demonstrated, true)
    assert.equal(result.outcome.exitCode, 0)
    assert.ok(result.containment.some((line) => line.includes("disposable copy")))
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("a proof that exits non-zero demonstrated nothing", async () => {
  const root = repository({ "exploit.mjs": "process.exit(1)\n" })
  try {
    assert.equal((await runProof(root, { command: "node exploit.mjs" })).demonstrated, false)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

// The proof runs against a copy so that nothing it writes can ever reach the repository.
test("a proof cannot touch the repository it is proving against", async () => {
  const root = repository({
    "exploit.mjs":
      "import { writeFileSync } from 'node:fs'\nwriteFileSync('OWNED.txt', 'x')\nprocess.exit(0)\n",
    "src/app.js": "module.exports = 1\n",
  })
  try {
    const before = proofsLeftBehind().length
    const result = await runProof(root, { command: "node exploit.mjs" })

    assert.equal(result.demonstrated, true)
    assert.deepEqual(
      readdirSync(root).filter((entry) => entry === "OWNED.txt"),
      [],
      "the proof wrote into the real repository",
    )
    assert.equal(proofsLeftBehind().length, before, "the disposable copy was not deleted")
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("the disposable copy is deleted even when the proof fails to run", async () => {
  const root = repository({ "README.md": "x\n" })
  try {
    const before = proofsLeftBehind().length
    await runProof(root, { command: "definitely-not-a-real-program --go" })

    assert.equal(proofsLeftBehind().length, before)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("a proof that installs, fetches or publishes is refused before it runs", async () => {
  const root = repository({ "README.md": "x\n" })
  try {
    await assert.rejects(() => runProof(root, { command: "npm install left-pad" }), ProofRefused)
    await assert.rejects(() => runProof(root, { command: "curl http://example.invalid" }), ProofRefused)
    await assert.rejects(() => runProof(root, { command: "node script.mjs upload" }), ProofRefused)
    // The ordinary gate rules still apply on top of the proof rules.
    await assert.rejects(() => runProof(root, { command: "git reset --hard" }), ProofRefused)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("a proof outside a repository is refused rather than run in place", async () => {
  const loose = mkdtempSync(join(tmpdir(), "cycle-loose-"))
  try {
    await assert.rejects(() => runProof(loose, { command: "node --version" }), ProofRefused)
  } finally {
    rmSync(loose, { force: true, recursive: true })
  }
})

test("the proof timeout is shorter than an ordinary gate's", () => {
  assert.ok(PROOF_TIMEOUT_SECONDS < 600)
})

test("a vulnerability class becomes a stable gate name, or is refused", () => {
  assert.equal(proofGateName("SQL Injection"), "security:proof:sql-injection")
  assert.equal(proofGateName("xss"), "security:proof:xss")
  assert.throws(() => proofGateName("a"), /lowercase letters/u)
  assert.throws(() => proofGateName("../../etc"), /lowercase letters/u)
})

test("a demonstrated proof is a mandatory gate that failed", () => {
  const evidence = proofEvidence(
    "sql-injection",
    "the login query concatenates the username",
    {
      containment: ["disposable copy of 3 files, deleted after the run"],
      demonstrated: true,
      outcome: {
        exitCode: 0,
        invocation: "node exploit.mjs",
        output: "returned every row",
        outputDigest: "d",
        timedOut: false,
        unavailable: null,
      },
    },
    1,
  )

  assert.equal(evidence.status, "failed")
  assert.equal(evidence.gate.mandatory, true)
  assert.match(evidence.output, /DEMONSTRATED/u)
  assert.match(evidence.output, /containment applied/u)
})

// An inconclusive proof is a record, not an accusation: it must not block a delivery.
test("a proof that demonstrated nothing blocks nothing", () => {
  const evidence = proofEvidence(
    "xss",
    "the template interpolates user input",
    {
      containment: [],
      demonstrated: false,
      outcome: {
        exitCode: 1,
        invocation: "node exploit.mjs",
        output: "escaped",
        outputDigest: "d",
        timedOut: false,
        unavailable: null,
      },
    },
    1,
  )

  assert.equal(evidence.status, "passed")
  assert.equal(evidence.gate.mandatory, false)
  assert.match(evidence.output, /not demonstrated/u)
})

// The security reviewer cannot write files — that is the separation of powers. So it supplies the
// proof's source and the control plane writes it inside the copy, never into the repository.
test("a reviewer-supplied script runs inside the copy and nowhere else", async () => {
  const root = repository({ "src/app.js": "module.exports = 1\n" })
  try {
    const before = proofsLeftBehind().length
    const result = await runProof(root, {
      script: [
        "import { existsSync, writeFileSync } from 'node:fs'",
        "writeFileSync('OWNED.txt', 'x')",
        "process.exit(existsSync('src/app.js') ? 0 : 1)",
      ].join("\n"),
    })

    assert.equal(result.demonstrated, true, "the script did not see the copied candidate")
    assert.ok(result.containment.some((line) => line.includes(".cycle-proof/proof.mjs")))
    assert.deepEqual(readdirSync(root).filter((entry) => entry === "OWNED.txt"), [])
    assert.deepEqual(readdirSync(root).filter((entry) => entry === ".cycle-proof"), [])
    assert.equal(proofsLeftBehind().length, before)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("a proof with neither a script nor a command is refused", async () => {
  const root = repository({ "README.md": "x\n" })
  try {
    await assert.rejects(() => runProof(root, {}), ProofRefused)
    await assert.rejects(
      () => runProof(root, { interpreter: "bash", script: "echo hi" }),
      /not a proof interpreter/u,
    )
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})
