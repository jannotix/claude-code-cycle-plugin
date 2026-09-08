# Cycle for Claude Code — v1 Specification

Status: approved for implementation
Version: 1.0.0-spec.1
Author: Gianluca Iannotta
Repository: https://github.com/jannotix/claude-code-cycle-plugin

---

## 1. Identity

Cycle for Claude Code is a native Claude Code plugin for evidence-gated software delivery.

It coordinates an architect, an executor, two independent reviewers and an independent final
arbiter. The arbiter evaluates the immutable original user request, the exact candidate, raw
verification evidence and both final reviews before approval. The agent that implements a change
can never approve it.

The plugin is model-independent. Every role reads its model from user configuration; the shipped
defaults inherit the session model, so the plugin works unconfigured and differentiates only when
the user asks for it.

The plugin never introduces a standalone interface, dashboard, account or network service. It never
writes durable state into the Claude Code installation directory, so application updates cannot
destroy workflow state, configuration, history, memory or index data.

**License.** Each released version is licensed under FSL-1.1-MIT and becomes available under the MIT
License on the second anniversary of that version's release date. This is Fair Source software and
is not OSI-approved open source during the initial two-year period.

**Independence.** Cycle for Claude Code is an independent integration. It is not affiliated with,
sponsored by or endorsed by Anthropic.

---

## 2. Problem

Single-agent coding sessions share one context across interpretation, implementation, review and
completion. Planning, execution and approval inherit the same blind spots, and the agent that wrote
the code decides whether the code is finished.

The observable failure modes are consistent:

- a backend endpoint shipped without the frontend flow that reaches it
- a database migration generated but never executed against a real database
- tests that cover a mock while the production integration stays broken
- a UI that renders but does not complete the user journey
- a security control implemented on one path and bypassed on another
- a package that passes source tests but cannot be installed or started
- a summary that quietly narrows the user's original request

Cycle changes the delivery structure rather than the model. It preserves the exact request,
separates the powers that decide, requires real verification evidence, freezes the candidate before
review, and lets only an independent arbiter approve.

This does not make software automatically correct. It makes missing evidence, self-approval,
requirement drift and incomplete cross-layer work materially harder to hide.

---

## 3. Scope

### 3.1 In scope for v1

Governance

1. Five roles with separation of powers enforced at three independent layers
2. Immutable original request carried intact to the arbiter
3. Decomposition into small, independently verifiable tasks
4. Five repair cycles, then a recoverable blocked state
5. Deterministic quick/full routing
6. Standalone advisory roles that cannot approve
7. Full cycle control including resume

Proof

8. Evidence engine with required-missing gates
9. Essentiality gate
10. Deterministic design gates, no model calls
11. Security gate requiring an executed proof of concept
12. Byte-exact candidate freeze and re-verified delivery

Knowledge

13. Complete incremental semantic code graph, multi-language
14. Evidence-linked memory with two-level retrieval
15. Append-only project history with hash chain and signed checkpoints

Scale and control

16. Multi-milestone Goal Mode with completion gates
17. Admission control with RAM, CPU and disk monitoring
18. Multi-provider model configuration, one provider per role
19. Every operation automatic when its preconditions are met, every command documented
20. Windows and WSL certification before publication

### 3.2 Out of scope — provided natively by Claude Code

The plugin must not reimplement any of the following. Each line is a subsystem the OpenCode
predecessor had to build and this product does not.

| Capability | Native mechanism |
| --- | --- |
| Isolated role sessions with separate context | subagents |
| Deterministic multi-agent orchestration | dynamic workflows |
| Parallel agent execution, scheduling, caching | workflow runtime |
| Git worktree isolation | `isolation: worktree` |
| Permission prompts, allowlists, sandboxing | permission system |
| Browser control, console, network, accessibility tree | Browser pane |
| Language intelligence | LSP servers |
| Turn-loop with completion condition | `/goal` |
| Per-agent memory scope | `memory:` frontmatter |
| Code search | ripgrep, Grep, Glob |

### 3.3 Deferred to v2

Nothing in the approved v1 list is deferred. v2 revisits only performance work that measurement in
Phase 12 proves necessary, such as an optional native parsing accelerator.

---

## 4. Architecture

### 4.1 Component map

| Concern | Claude Code primitive | Location |
| --- | --- | --- |
| Role definitions | subagents | `agents/*.md` |
| Cycle orchestration | dynamic workflow | `workflows/cycle.js` |
| User commands | skills | `skills/*/SKILL.md` |
| Enforcement and audit | hooks | `hooks/hooks.json` |
| Control plane | MCP server | `.mcp.json` + `src/` |
| User configuration | manifest userConfig | `.claude-plugin/plugin.json` |

### 4.2 Process model

Two processes. Claude Code loads the plugin in-process; the control plane runs as a plugin MCP
server started automatically when the plugin is enabled.

The workflow script is sandboxed: no filesystem, no shell, no `import()`. Control-plane operations
are therefore issued by a dedicated `cycle:operator` agent — cheap model, low effort, tools
restricted to the Cycle MCP surface — so the script stays deterministic while the runtime performs
the side effects.

```
skill  ──▶ workflow script ──▶ agent(role)          ──▶ role work
                           └─▶ agent(cycle:operator)  ──▶ MCP control plane ──▶ store
hooks ─────────────────────────────────────────────────▶ MCP control plane ──▶ store
```

### 4.3 Data locations

| Data | Location |
| --- | --- |
| Durable state, history, memory, graph | `${CLAUDE_PLUGIN_DATA}` |
| Non-sensitive user configuration | `~/.claude/settings.json` → `pluginConfigs[<id>].options` |
| Sensitive user configuration | OS keychain, or `~/.claude/.credentials.json` |
| Managed worktrees | `${CLAUDE_PLUGIN_DATA}/worktrees/` |
| Provider credentials | never held by the plugin |

Nothing is written inside the Claude Code installation directory.

---

## 5. Roles

### 5.1 Contracts

| Role | Agent | Writes | Responsibility |
| --- | --- | --- | --- |
| Architect | `cycle:architect` | no | requirement matrix, risk analysis, acyclic task graph with write scopes and verification commands |
| Executor | `cycle:executor` | yes | one bounded task inside its authorized scope, real verification, exact evidence |
| Functional reviewer | `cycle:functional-reviewer` | no | completeness, end-to-end behaviour, regressions, user-visible paths |
| Security reviewer | `cycle:security-reviewer` | no | trust boundaries, dependency risk, architecture, resource behaviour |
| Arbiter | `cycle:arbiter` | no | final verdict against the immutable request, candidate, evidence and both reviews |
| Operator | `cycle:operator` | no | deterministic control-plane calls only |

The executor is the only role permitted to modify files, and only inside the write scopes of its
assigned task.

### 5.2 Enforcement layers

Separation of powers is enforced three times, independently. Any single layer failing does not open
the boundary.

1. **Declaration.** Read-only roles declare `disallowedTools: [Write, Edit, Bash, NotebookEdit]`.
   Every role declares `disallowedTools: [Task]`.
2. **Runtime.** A `PreToolUse` hook reads the role from the hook payload and returns
   `permissionDecision: "deny"` with a reason for a write attempt by a read-only role, a subtask by
   any role, and a git invocation by the executor that would move HEAD, rewrite history or destroy
   the candidate. A payload carrying no Cycle role is the user's own session and is left alone: a
   hook that denied what it could not identify would take the application down with it, and the
   other two layers do not depend on this process running.
3. **Reconciliation.** After each executor task the control plane reads the worktree with git —
   never the executor's own account of what it did — and rejects the task if any changed path falls
   outside the write scopes the plan authorized. The rejection costs a repair cycle and names the
   paths. Authorization is the union of the scopes of the task being reported and of every task
   already completed, so a later task does not reconcile against files an earlier one legitimately
   wrote.

### 5.3 Advisory mode

Each role is invocable alone. Standalone invocations are advisory, read-only, and cannot approve or
deliver.

| Command | Behaviour |
| --- | --- |
| `/cycle:architect` | multi-turn planning conversation; may save a reviewed plan for later use by a run |
| `/cycle:executor` | feasibility analysis: likely scopes, dependencies, verification needs; never writes |
| `/cycle:review` | advisory functional findings |
| `/cycle:security` | advisory security findings |
| `/cycle:judge` | readiness assessment against the exact request; lists blockers; never approves |

**Invariant.** Approval and delivery exist only inside a governed cycle with recorded evidence. If a
standalone role could approve, invoking it directly would bypass the product.

---

## 6. Workflow

### 6.1 States

```
intake → routing → { quick_execution | architecture } → execution → verification
       → independent_reviews → arbitration → delivery → completed

repair · paused · blocked · cancelled
```

`quick` routes verification directly to arbitration and omits independent reviews.
`full` runs the complete path.

### 6.2 Transitions

| Command | From | To | Guard |
| --- | --- | --- | --- |
| `complete_intake` | intake | routing | request captured and digested |
| `route(mode)` | routing | quick_execution / architecture | routing decision recorded |
| `architecture_accepted` | architecture | execution | plan validated, DAG acyclic |
| `candidate_ready` | execution | verification | worktree clean, scopes respected |
| `verification_passed` | verification | independent_reviews / arbitration | all mandatory gates passed |
| `verification_failed` | verification | repair / blocked | consumes a repair cycle |
| `reviews_ready` | independent_reviews | arbitration | both verdicts submitted |
| `approve` | arbitration | delivery | mandatory gates passed |
| `deliver` | delivery | completed | promotion re-verified |
| `reject(target)` | arbitration | repair / blocked | consumes a repair cycle |
| `execution_failed(target)` | execution / quick_execution | repair / blocked | consumes a repair cycle; requires no candidate |
| `begin_repair` | repair | execution / architecture | repair target set |
| `pause` / `resume` | most states | paused / previous | not during verification or delivery |
| `cancel` | non-terminal | cancelled | explicit confirmation |

### 6.3 Routing

`auto` selects the mode from deterministic risk signals. `quick` and `full` are explicit.

Risk signals derive from the request text and from the affected paths. Critical categories force
`full`. A user may force `quick` on critical work only with a recorded downgrade approval.

Routing must not degenerate: markers are narrow, weighted against real path signals, and a change
touching few files in one layer with no critical category routes to `quick`. The routing decision,
its categories and its rationale are recorded in project history.

### 6.4 Repair budget

Five cycles by default, configurable between 1 and 20. Exhausting the budget moves the workflow to
`blocked`, which preserves all state and can be resumed with an extended budget.

---

## 7. Evidence engine

The evidence engine is the mechanism that distinguishes this product from prompt engineering. An
agent's claim of success is not evidence. A recorded, reproducible gate result is.

### 7.1 Gate model

```
Gate {
  id           uuid
  name         string          # namespaced, e.g. "test:bun test"
  kind         build | test | lint | security | database | browser | package | inspection | command
  executor     Command | SecretScan | CandidateIntegrity | DesignDetector | SecurityProof | Unavailable
  mandatory    boolean
  precondition string
  timeout      seconds, 1..7200
}
```

Every gate produces an evidence record with invocation, exit code, start and finish timestamps,
status, output digest and bounded output. Evidence identifiers are the only citations reviewers and
the arbiter may use.

### 7.2 Discovery

Gates come from three sources, deduplicated by normalised invocation:

1. Verification commands declared by the architect for each task.
2. Project scripts, detected per ecosystem:

| Ecosystem | Detection |
| --- | --- |
| Node | `package.json` scripts against a fixed name list; package manager from lockfile |
| Rust | `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`, `cargo test --all-features` |
| Python | `pyproject.toml`, `tox.ini`; `pytest`, `ruff`, `mypy` |
| Go | `go build ./...`, `go vet ./...`, `go test ./...` |
| Generic | `Makefile` targets matching the known verbs |

3. Two internal gates, always mandatory: changed-content secret scan, and candidate byte integrity.

### 7.3 Required-missing gates

When a change touches a layer that requires proof and no project-native gate supplies it, the engine
inserts a mandatory gate that fails by construction. This closes the failure modes in section 2.

| Scope touched | Required gate |
| --- | --- |
| `.sql`, `migrations/`, `db/`, `schema` | `database:real-integration` |
| `.tsx .jsx .vue .svelte .css .html`, `components/`, `pages/`, `frontend/` | `browser:affected-user-flow` and `accessibility:affected-user-flow` |
| dependency manifest or lockfile | `security:dependency-vulnerability` and `security:dependency-license` |
| `installer/`, `packaging/`, `Dockerfile`, `release/` | `package:production-artifact` |
| authentication, authorization, input handling, secrets | `security:executed-proof` |

Strictness is configurable. `standard` fails the gate, `strict` additionally fails on any skipped
gate, `advisory` downgrades required-missing gates to warnings for immature codebases. The default is
`standard`.

### 7.4 Reach: what the change touches, and what it can affect

The table above is matched against the union of the files a change touches and the files the code
graph says consume them. A line in a configuration loader imported by `src/auth/session.ts` requires
`security:executed-proof`, without anyone having edited anything under `auth`.

The reach is read here and nowhere else. Routing stays deterministic and based on the request and
the touched paths, so a run stays cheap and predictable; the reach lives in the evidence layer,
where it can only widen a proof surface. This is promote-only by construction: adding paths to the
set can insert a gate and has no way to remove one, so a wrong reach costs a proof that was not
needed rather than a proof that was.

Reach carries a confidence, and it is claimed narrowly.

| Situation | Recorded |
| --- | --- |
| The graph covers every changed file the model holds | `impact:unresolved` passes, naming what is reached |
| The project was never indexed, or a changed source file is not in the index | `impact:unresolved` fails, naming the reason and `/cycle:index` |
| The reached set exceeds the threshold — the larger of 200 files or a tenth of the index | `impact:high-fan-in` warns, naming the hub symbols and their consumer counts |

An unresolved reach is a warning under `standard` and `advisory` and mandatory under `strict`: the
existing strictness knob decides, rather than a second one. A project that has never been indexed is
not blocked on its first cycle, but the gap is in the record and the reviewers read it.

A changed file in a language the graph has no grammar for is reported as *outside the model* rather
than as missing coverage. The two are different claims, and conflating them would put the same
warning on a README as on unindexed source.

"Nothing is affected" and "I cannot tell what is affected" are different answers. The design prefers
one more unknown to one wrong resolved: the worst failure is not "I don't know", it is "I know", and
being wrong.

### 7.5 Execution model


Gates run without a shell. Commands are parsed into program and argument vector and executed
directly.

- Blocked programs: `sh`, `bash`, `cmd`, `powershell`, `pwsh`, `git`, `rm`, `del`, `shutdown`
- Blocked arguments: `deploy`, `publish`, `push`, `reset`, `drop`, `destroy`
- Rejected characters in any argument: NUL, CR, LF
- Rejected shell operators as arguments: `&&`, `||`, `;`, `|`, `<`, `>`
- Output retained: 1 MiB, digested in full
- Default timeout: 600 s

**Windows.** `npm`, `bun`, `pnpm` and `yarn` are `.cmd` shims and cannot be executed by a
no-shell exec call. The runner resolves script runners to their real entry point through `PATHEXT`
resolution and an explicit shim allowlist, and never falls back to a shell. This is a required
Phase 7 deliverable, not an afterthought.

### 7.6 Essentiality gate

Before writing code, the architect and executor apply a decision ladder and record the outcome:

```
Does this need to exist?
  → Already present in this codebase?
    → Provided by the standard library?
      → Provided by a native platform feature?
        → Provided by an already installed dependency?
          → Expressible in one or two lines?
            → Only then: the minimum implementation that works
```

The functional reviewer scores the result. Added code that a reviewer maps to an existing capability
is a finding. Removing security, accessibility or error-handling behaviour is never a valid
simplification.

### 7.7 Design gates

Deterministic detectors over changed UI files and the accessibility tree captured from the native
Browser pane. No model calls, no API key, no token cost.

Detector families: contrast and colour, typography, spacing and layout, focus and keyboard
reachability, motion and easing, responsive breakpoints, component nesting, loading and error states.

A detector produces a finding with file, line, rule identifier and severity. Findings are evidence,
citable by reviewers and the arbiter.

### 7.8 Security proof gate

The security reviewer may not report a vulnerability class as present without an executed proof.
Static suspicion produces an `info` finding; an executed proof produces a `high` or `critical`
finding with the proof recorded as evidence.

Proof execution uses a stricter profile than ordinary gates:

- disposable worktree copy, discarded after the run
- network denied except loopback
- hard timeout, lower than the gate default
- no destructive arguments, no package installation, no outbound publication
- the proof and its output are recorded; the proof is never promoted

---

## 8. Candidate integrity

A candidate is frozen before verification and re-verified before delivery.

```
CandidateManifest {
  candidate_id
  base_revision
  files[]                    { path, kind, digest }
  diff_digest                # binary diff, base..HEAD
  dependency_state_digest
  configuration_digest
  environment_digest
  evidence_ids[]
}
```

Freeze requires a clean worktree, resolves and validates the base revision, and captures the exact
binary diff. Before gates run, the engine re-freezes and compares byte for byte; a mismatch aborts
with `candidate changed after freeze`. The same comparison runs immediately before promotion.

Promotion applies the exact approved bytes to the source repository through a delivery journal that
survives a crash, then verifies the result again. The bytes that were approved are the bytes that
are delivered.

---

## 9. Code intelligence

A complete incremental semantic graph, built locally with no model calls.

### 9.1 Model

```
Node   { id, kind, name, path, span, language, digest }
Edge   { from, to, kind, confidence, provenance }
```

Node kinds: module, class, interface, function, method, type, constant, route, table, component.
Edge kinds: imports, calls, inherits, implements, references, defines, exports.
Confidence: `extracted` for relationships read directly from the syntax tree, `inferred` for
relationships derived from resolution heuristics. Every edge records how it was obtained.

### 9.2 Implementation

- `web-tree-sitter` (WASM) with a worker pool. Native bindings are rejected: they would break
  zero-dependency installation, which is a product requirement.
- First index runs in the background and is resumable.
- Subsequent indexing processes only files whose content digest changed.
- Grammar set covers the languages the certification fixtures exercise, extensible by configuration.
- Files excluded by `.gitignore` and by an ignore policy are never parsed.

### 9.3 Queries

Scoped queries only. The engine never returns the whole graph to a model context.

| Query | Use |
| --- | --- |
| `neighbors(node, depth)` | local structure for a task |
| `impact(paths)` | what a change can reach |
| `path(from, to)` | how two symbols connect |
| `scope(paths, budget)` | bounded context bundle for a role prompt |

Context bundles are budgeted in bytes and truncated deterministically, with truncation reported to
the caller.

### 9.4 Scale

Target: 500,000 files. The metric that matters is not first-index duration but that a full re-scan
never happens again. Indexing is subject to admission control and yields to verification.

---

## 10. Memory

Project knowledge derived from completed work, linked to the evidence that justifies it.

```
Memory {
  id, project_id
  kind        approval | architecture_decision | bug_fix | command | constraint | convention | failed_approach
  confidence  inferred | user_asserted | verified
  title, summary, detail
  scope[]                              # paths or subsystems it applies to
  provenance  { candidate_id, evidence_ids[], revision, source_event_ids[] }
  state       current | superseded | revoked
}
```

Rules:

- A memory requires at least one source event and one applicability scope.
- `verified` requires evidence identifiers from passed gates.
- Secrets are redacted before storage; content matching the secret scanner is rejected.
- A memory is never silently overwritten; it is superseded, and the chain is queryable.

**Two-level retrieval.** A search returns a compact index — identifier, kind, confidence, title,
scope, counts — at roughly 50–100 tokens per entry. Full detail is fetched only for the entries the
caller selects. This keeps retrieval cost proportional to what is actually used.

---

## 11. Project history

Append-only record of who did what, when, with which tools and permissions, against which files and
candidates, with which outcome.

- Each entry is hashed: `H(domain ‖ sequence ‖ previous_hash ‖ length ‖ canonical_event)`.
- Checkpoints are signed with Ed25519. The key lives in `${CLAUDE_PLUGIN_DATA}/keys/` with
  restricted permissions; on Windows, restricted through ACL.
- `/cycle:history verify` re-validates the chain and every signature.
- Verification also runs at control-plane startup.
- Secrets are redacted before an entry is written, never after.
- Actions performed outside Cycle are attributed only where reliable OS or git metadata exists.

Recorded actors: user, role agents identified by role and session, control plane, external.

---

## 12. Goal Mode

A goal sits above individual workflows and survives sessions.

```
Goal {
  id, objective (immutable), amendments[]
  constraints[], non_goals[], success_criteria[]
  plan_versions[]
  milestones[]            { name, workflow_id, state }
  continuations           { used, maximum }
  state  draft | planning | ready | active | paused | blocked | completing | completed | aborted
}
```

Rules:

- The objective is immutable. Clarifications are appended as sequenced amendments.
- Each implementation milestone is a normal evidence-gated workflow.
- A goal cannot reach `completed` while any linked workflow is incomplete.
- Completion requires `request_completion` followed by explicit user `approve_completion`.
- Default maximum continuations: five.

This is distinct from the native `/goal` command, which is a turn loop with a completion condition
scoped to one session. Both may be used; they do not interact.

---

## 13. Resource governance

The control plane governs concurrent workflows; it does not execute them. Claude Code's workflow
runtime executes at most 16 concurrent agents per session and 1,000 agents per run. Concurrency
across projects is a function of how many sessions the user runs, which no plugin controls.

What the control plane provides:

- Registration and durable state for 100 or more workflows across projects
- Lease-based admission with fair round-robin rotation per project
- Deferral under resource pressure: available memory below reserve, available disk below reserve,
  CPU above threshold, or metrics unavailable
- Indexing yields to pending verification
- Backpressure after a pressured tick, limiting admissions per tick during recovery

Defaults: memory reserve 1 GiB, disk reserve 2 GiB, CPU ceiling 85 %, lease 15 s renewed every 5 s,
maximum active derived from logical CPUs and clamped.

---

## 14. Store and provenance

Six subsystems persist. They share one store, one schema and one migration sequence.

Engine: `node:sqlite` with FTS5. No native modules.

### 14.1 Tables

```
workflows        (id, project_id, state, mode, candidate_id, repair_cycles, max_repair_cycles, …)
requests         (workflow_id, original_text, digest, attachment_digests, amendments)
tasks            (id, workflow_id, key, title, objective, state, write_scopes, deps, revision)
candidates       (id, workflow_id, manifest, diff_digest, frozen_at)
candidate_files  (candidate_id, path, kind, digest, payload)
evidence         (id, candidate_id, gate_name, kind, status, invocation, exit_code,
                  started_at, finished_at, output_digest, output)
reviews          (id, workflow_id, candidate_id, role, verdict, submitted_at)
arbitrations     (id, workflow_id, candidate_id, decision, receipt, receipt_digest)
goals            (id, project_id, objective, state, continuations, …)
goal_plans       (goal_id, version, content, source_session_id)
goal_milestones  (goal_id, name, workflow_id, state)
history          (sequence, project_id, event, hash, previous_hash)
checkpoints      (sequence, signature, public_key)
memory           (id, project_id, kind, confidence, title, summary, detail, scope, state)
memory_fts       (FTS5 over title, summary, detail)
memory_prov      (memory_id, candidate_id, evidence_id, revision, event_id)
graph_nodes      (id, project_id, kind, name, path, span, language, digest)
graph_edges      (from_id, to_id, kind, confidence, provenance)
index_state      (project_id, path, digest, indexed_at)
leases           (workflow_id, project_id, expires_at)
```

### 14.2 Provenance model

A graph node, a memory entry and a history event all reference the same identifiers: candidate,
evidence, revision, session, role. This is defined once and used everywhere. Any subsystem that
invents its own provenance shape is a defect.

### 14.3 Compatibility

Schema version is recorded. A store newer than the running plugin opens read-only and the plugin
reports safe mode rather than migrating downward. Migrations are forward-only and additive.

---

## 15. Command surface

Every operation runs automatically when its preconditions are met. Every command below exists for
inspection, control, recovery and expert use, and is documented in the user manual.

| Command | Purpose | Automatic equivalent |
| --- | --- | --- |
| `/cycle:setup` | guided configuration and compatibility check | first-run initialisation |
| `/cycle:doctor` | read-only diagnostics: environment, models, providers, store, index | startup health check |
| `/cycle:run [auto\|quick\|full]` | run the governed cycle | explicit implementation intent |
| `/cycle:status` | workflow state, mode, candidate, repair budget | native status reporting |
| `/cycle:tasks` | task identifiers and states | scheduler operations |
| `/cycle:evidence` | recorded gates and outcomes | verification pipeline |
| `/cycle:pause` | pause at the next safe boundary | resource pressure |
| `/cycle:resume` | reconcile and continue from persisted state | recovery |
| `/cycle:cancel --confirm` | cancel authorised work safely | user interruption |
| `/cycle:retry` | retry a classified failure or blocked cycle | transient retry policy |
| `/cycle:architect` | advisory planning conversation | — |
| `/cycle:executor` | advisory feasibility analysis | — |
| `/cycle:review` | advisory functional review | — |
| `/cycle:security` | advisory security review | — |
| `/cycle:judge` | advisory readiness assessment | — |
| `/cycle:goal new\|list\|focus\|plan\|link\|status\|complete` | goal lifecycle | milestone linking |
| `/cycle:history [verify]` | query history, verify chain and signatures | continuous capture |
| `/cycle:memory search\|explain\|remove --confirm` | project knowledge | progressive retrieval |
| `/cycle:index [status\|rebuild]` | code graph state | incremental indexing |
| `/cycle:models [role] [model]` | inspect or assign role models | active-model inheritance |
| `/cycle:permissions` | inspect immutable role boundaries | balanced defaults |
| `/cycle:limits` | inspect admission and repair limits | adaptive defaults |
| `/cycle:export --confirm` | export state, history or evidence | never automatic |
| `/cycle:help` | complete command reference | first-use guidance |

Cancellation, memory removal and export require explicit confirmation.

---

## 16. Model configuration

### 16.1 Per role

`userConfig` declares a model and an effort slot for each role. Defaults are `inherit`, so the
plugin works unconfigured.

```
architect_model            executor_model
functional_reviewer_model  security_reviewer_model
arbiter_model              operator_model
architect_effort           executor_effort
reviewer_effort            arbiter_effort
```

Values reach a component only where that component asks for them. The host injects
`CLAUDE_PLUGIN_OPTION_<KEY>` into hook processes automatically; it does not do so for MCP servers,
which receive an option only through a `${user_config.KEY}` entry in their own `env` block in
`.mcp.json`. The control plane therefore declares one entry per option, and a test asserts that
every declared option is both wired there and read by `readConfiguration`, in both directions.

Values reach the workflow through the invoking skill, which reads them from the control plane with
`role_settings` and passes a model map as workflow `args`. The workflow applies them per `agent()`
call. The control plane is the single source, so a role's model is resolved the same way whether it
is asked for by a skill, a workflow or the doctor.

Resolution order, highest first: `CLAUDE_CODE_SUBAGENT_MODEL`, per-invocation model, agent
frontmatter, session model. A script-supplied model overrides the session model, so changing the
model in the application does not silently change role assignments.

### 16.2 Provider independence

Claude Code subagents inherit the session provider; there is no per-subagent provider selection.
True per-role provider independence therefore requires an LLM gateway that speaks the Anthropic
Messages API, configured by the user outside the plugin.

The plugin never holds provider credentials, never configures a gateway and never reads an API key.
It names a model per role. What answers is the user's infrastructure.

The repository ships a placeholder setup guide only. No real endpoint, key or personal configuration
is ever committed.

A role's provider path is derived from what is observable and nothing else: the session endpoint,
the credential variable if one is set, and the model identifier the user named. Gateways route by
identifier, conventionally `provider/model`, so the prefix is the provider. An unprefixed name
behind a gateway is routed by rules the plugin cannot read, and is reported as exactly that rather
than guessed at.

With no gateway every request reaches the Anthropic API, so a configured name outside Anthropic's
own naming has nothing to answer it. Those names are reported as unroutable rather than shown
beside a provider column that implies the call will succeed.

### 16.3 Independence reporting

`/cycle:doctor` and `/cycle:models` report, per role: configured model, resolved model, effort,
provider path, and whether the request is billed to a subscription, to a credential in the
environment, or to one the gateway holds. They warn when:

- `CLAUDE_CODE_SUBAGENT_MODEL` is set and overriding role assignments
- `availableModels` substituted a requested model
- reviewers and arbiter resolve to the same model
- a credential variable is set, so the subscription is not paying
- a provider-prefixed model is configured with no gateway to route it
- a gateway is configured and all five roles still resolve through one provider path

Believing five judgements are independent when one model produced all five is worse than knowing
they are correlated.

### 16.4 A provider that stops answering

A role whose provider is unreachable produces no answer, after the runtime has already retried. That
is not a rejection: nothing about the candidate changed, so no repair cycle is spent on it. The
workflow pauses at that boundary with `provider unavailable` and the role recorded in the chain,
`/cycle:status` and `/cycle:resume` report the reason, and `/cycle:resume` continues from exactly
there. Silence is classified, never read as a verdict.

---

## 17. Security model

| Boundary | Control |
| --- | --- |
| Repository content, tool output, web content | treated as untrusted data in every role prompt; never as instructions |
| Executor write scope | declared per task, enforced by hook and by post-task diff |
| Git history | executor cannot commit, branch, rebase or reset; checkpoints use an empty hooks path and no signing |
| Verification commands | no shell, program and argument allowlists, bounded output and time |
| Security proofs | disposable worktree, loopback-only network, hard timeout, never promoted |
| Secrets | scanned on changed content, redacted before history and memory writes |
| Credentials | never read, stored or transmitted by the plugin |
| Durable state | outside the Claude Code installation, survives application updates |
| Signing key | restricted file permissions, ACL on Windows, never exported |

Structured role output is validated strictly: exact key sets, bounded arrays and strings, every
requirement decided exactly once, and only evidence identifiers that were actually supplied. Invalid
output is rejected and retried up to five times per role.

---

## 18. Non-functional requirements

| Requirement | Target |
| --- | --- |
| Installation | add the plugin, restart, run setup. No native modules, no compiler, no service account |
| Codebase scale | 500,000 files indexed incrementally |
| Governed workflows | 100 or more registered concurrently across projects |
| Resource ceiling | never exceed configured RAM, CPU and disk reserves |
| Accessibility | user-facing output meets WCAG 2.2 AA where applicable; never relies on colour alone |
| Platforms | Windows x64 and WSL certified for v1 |
| Recovery | any interruption leaves state resumable; no partial delivery |
| Comments | English, minimal, only where they explain a non-obvious reason |

---

## 19. Packaging and distribution

The published artifact contains only what production needs.

- Allowlist-based packaging. Documentation, tests, fixtures, debug output, coverage, source maps and
  development configuration are excluded.
- A CI check fails the build if any excluded pattern appears in the artifact.
- `claude plugin validate` must pass with no warnings before release.
- Distribution through a marketplace in the project's own repository.
- Version pinned in `plugin.json`; the version is the update cache key.

Repository layout:

```
production/                   published repository root
  .claude-plugin/plugin.json
  agents/ workflows/ skills/ hooks/ .mcp.json
  src/ scripts/ bin/
  tests/ docs/
  README.md LICENSE NOTICE CHANGELOG.md SECURITY.md
documentation/                working specifications, never published
tests-debug/                  scratch and artifacts, never committed
```

---

## 20. Phases

| # | Phase | Exit criterion | Status |
| --- | --- | --- | --- |
| 1 | Specification | this document, decision log and certification matrix on disk | done |
| 2 | Skeleton | plugin loads, six agents visible, `/cycle:doctor` reports environment and models | done |
| 3 | Store and provenance | schema, migrations, FTS, provenance model, round-trip tests | done |
| 4 | Advisory roles | five advisory commands working against real models | done |
| 5 | Code intelligence | incremental graph, scoped queries, resumable first index | done |
| 6 | Orchestration | `/cycle:run` end to end, strictly validated structured output | done |
| 7 | Evidence engine | required-missing gates reject; Windows shim resolution solved; essentiality gate active | done |
| 8 | Design and security gates | deterministic detectors; contained proof execution | done |
| 9 | Integrity and history | freeze, delivery, signed chain, `/cycle:resume` after application restart | done |
| 10 | Memory | two-level retrieval, provenance-linked, redaction enforced | done |
| 11 | Goal Mode | milestones, continuations, completion gate | done |
| 12 | Scale | admission control, resource monitoring, 500k-file measurement | done |
| 13 | Multi-provider | gateway integration, credential-path verification, per-role independence confirmed | built · manual rows open |
| 14 | Certification | full matrix green on Windows and WSL | automated rows green on both · manual rows open |
| 15 | Publication | validate, marketplace, README, CHANGELOG | done · published since 1.0.0 |

The plan said nothing would be pushed to the public repository before Phase 14 was green on both
platforms. That is not what happened: the repository has been public since 1.0.0 and twenty releases
have gone out with manual certification rows open, each release recording in its changelog what it
was and was not certified on. The rule is recorded here as it was written, and so is the fact that
it was not followed, because a plan quietly edited to match what happened stops being able to tell
anyone anything.

Where the gate actually stands is `documentation/RELEASE-READINESS.md`, which is regenerated against
the published version rather than describing an intention.

Phase 14 is executed by `tests-debug/certify.mjs`, which refuses to call a row green unless a test
or a harness claims it by number. Seven rows describe a packaged artifact or the Claude Code CLI and
cannot close before Phase 15 builds one; they are recorded as open rather than approximated.

Measured results for the rows that cannot be automated are recorded in `MEASUREMENTS.md`.
