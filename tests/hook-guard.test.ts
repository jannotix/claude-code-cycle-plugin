import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

// @ts-expect-error the hook is plain JavaScript: it runs under whatever node the host provides.
import { decide } from "../hooks/guard.mjs"

const GUARD = join(dirname(dirname(fileURLToPath(import.meta.url))), "hooks", "guard.mjs")

interface Decision {
  readonly permissionDecision?: string
  readonly permissionDecisionReason?: string
}

const ask = (payload: Record<string, unknown>): Decision | null =>
  (decide(payload) as { hookSpecificOutput: Decision } | null)?.hookSpecificOutput ?? null

const bash = (role: string, command: string) => ({
  agent_type: `cycle:${role}`,
  tool_input: { command },
  tool_name: "Bash",
})

const denied = (decision: Decision | null): string => {
  assert.equal(decision?.permissionDecision, "deny")
  return decision?.permissionDecisionReason ?? ""
}

// Certification 6.1, 6.2 and 6.3: the roles that judge cannot write, at the runtime layer and not
// only by declaration.
test("a read-only role is denied every writing tool", () => {
  for (const role of ["architect", "functional-reviewer", "security-reviewer", "arbiter"]) {
    for (const tool of ["Write", "Edit", "MultiEdit", "NotebookEdit"]) {
      assert.match(denied(ask({ agent_type: `cycle:${role}`, tool_input: {}, tool_name: tool })), /read-only/u)
    }
    assert.match(denied(ask(bash(role, "npm test"))), /may not run commands/u)
  }
})

// Certification 6.6.
test("no role may spawn a subtask", () => {
  for (const role of ["architect", "executor", "arbiter", "operator"]) {
    const reason = denied(
      ask({ agent_type: `cycle:${role}`, tool_input: { prompt: "do it" }, tool_name: "Task" }),
    )
    assert.match(reason, /subtask/u)
  }
})

test("the executor writes and runs commands, because that is its job", () => {
  assert.equal(ask({ agent_type: "cycle:executor", tool_input: {}, tool_name: "Write" }), null)
  assert.equal(ask(bash("executor", "npm test -- --run")), null)
  assert.equal(ask(bash("executor", "git status --porcelain")), null)
  assert.equal(ask(bash("executor", "git diff HEAD")), null)
  assert.equal(ask(bash("executor", "git log --oneline -5")), null)
})

// Certification 6.5.
test("the executor cannot move HEAD, rewrite history or destroy the candidate", () => {
  const forbidden = [
    "git commit -m wip",
    "git branch feature",
    "git rebase -i HEAD~2",
    "git reset --hard HEAD",
    "git checkout main",
    "git switch main",
    "git push origin main",
    "git tag v1",
    "git clean -fdx",
    "git stash",
    "git restore src/app.ts",
    "git cherry-pick abc123",
    "git revert HEAD",
    "git merge main",
    "git worktree add ../side",
    "git filter-branch --all",
  ]
  for (const command of forbidden) {
    assert.match(denied(ask(bash("executor", command))), /may not run/u, command)
  }
})

test("a forbidden git call is found however it is dressed up", () => {
  const disguised = [
    "npm test && git commit -m done",
    "echo hi; git   reset --hard",
    "git -C /tmp/project commit -m x",
    "git --git-dir=.git --work-tree=. push",
    "git -c user.name=x commit -m x",
    "GIT_AUTHOR_NAME=x git commit -m x",
    '"git" commit -m x',
    "/usr/bin/git commit -m x",
    '"C:\\\\Program Files\\\\Git\\\\bin\\\\git.exe" commit -m x',
    "cat file | git commit -F -",
  ]
  for (const command of disguised) {
    assert.equal(ask(bash("executor", command))?.permissionDecision, "deny", command)
  }
})

test("a call that only mentions git is not a git call", () => {
  assert.equal(ask(bash("executor", "echo 'git commit is not allowed here'")), null)
  assert.equal(ask(bash("executor", "node scripts/git-report.mjs")), null)
  assert.equal(ask(bash("executor", "npm run commit-lint")), null)
  assert.equal(ask(bash("executor", "gitk --all")), null)
})

// The user's own session carries no role, and a hook that denied what it could not identify would
// take the application down with it.
test("a payload with no Cycle role is left alone", () => {
  assert.equal(ask({ tool_input: {}, tool_name: "Write" }), null)
  assert.equal(ask({ agent_type: "some-other-plugin:agent", tool_input: {}, tool_name: "Bash" }), null)
  assert.equal(ask({ agent_type: "cycle:executor", tool_name: "Read" }), null)
})

/** One spawn, because the wiring is what the application actually runs. */
const run = (input: string) =>
  spawnSync(process.execPath, [GUARD], { encoding: "utf8", input, shell: false })

test("the hook answers on stdin and never fails the call", () => {
  const refused = run(JSON.stringify({ agent_type: "cycle:arbiter", tool_input: {}, tool_name: "Edit" }))
  assert.equal(refused.status, 0)
  assert.equal(
    (JSON.parse(refused.stdout) as { hookSpecificOutput: Decision }).hookSpecificOutput
      .permissionDecision,
    "deny",
  )

  const allowed = run(JSON.stringify({ tool_input: {}, tool_name: "Edit" }))
  assert.equal(allowed.status, 0)
  assert.equal(allowed.stdout.trim(), "")

  const malformed = run("{not json")
  assert.equal(malformed.status, 0)
  assert.equal(malformed.stdout.trim(), "")
})
