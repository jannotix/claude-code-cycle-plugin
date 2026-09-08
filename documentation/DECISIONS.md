# Decision Log

Decisions taken during planning, with the reasoning that produced them. Each entry records what was
considered and why the alternative was rejected, so a future reader does not relitigate a settled
question or reverse one without knowing its cost.

---

## D-001 — Control plane in TypeScript, no native modules

**Decision.** The control plane is a plugin MCP server written in TypeScript, using `node:sqlite`
with FTS5. No native addons, no compiled binaries, no per-platform packages.

**Rejected.** Porting the predecessor's Rust crates. They are written and tested, but they impose
four platform packages, a cross-compilation pipeline, and they do not run in cloud sessions.

**Cost accepted.** Lower raw throughput than Rust. Measurement in Phase 12 decides whether an
optional native accelerator is worth adding later; the plugin must remain fully functional without
it.

---

## D-002 — One end-to-end workflow, not a chain of per-phase workflows

**Decision.** `/cycle:run` executes architecture, execution, verification, review, arbitration and
delivery in a single dynamic workflow.

**Rejected.** Separate `/cycle:plan`, `/cycle:build`, `/cycle:verify` commands with human sign-off
between phases. More control, but far more friction, and the product's value is the automatic
gate — not the manual one.

**Consequence.** The workflow runtime allows no mid-run user input and is resumable only within one
session. Durable state therefore lives in the control plane, not in the script, and `/cycle:resume`
reattaches from the persisted stage.

---

## D-003 — Full v1 scope

**Decision.** All twenty capabilities ship in v1, including memory, Goal Mode, design gates,
security proof gates and the complete semantic graph.

**Considered and overridden.** A narrower v1 limited to what prevents a false "done", deferring
memory, Goal Mode, design gates and security proofs to v1.1. The argument was time to a working
release; the predecessor product implements only the narrow core and is still unreleased after 113
commits.

**Owner's decision.** Everything in v1. Recorded, not relitigated.

---

## D-004 — Complete semantic graph, not a context cache

**Decision.** Build the full incremental semantic graph: nodes, typed edges, confidence and
provenance, multi-language.

**Rejected.** A digest-keyed context cache with LSP and ripgrep for point queries, which would have
solved the stated problem — repeated scans and token burn — at a fraction of the cost.

**Consequence.** This is the largest subsystem in the project.

---

## D-005 — tree-sitter via WASM, not native bindings

**Decision.** `web-tree-sitter` with a worker pool.

**Reasoning.** Native bindings are roughly three to five times faster but reintroduce per-platform
compiled artifacts, contradicting D-001 and the product requirement that installation be trivial for
inexperienced users. The parsing cost is paid once: the first index runs in the background and is
resumable, and subsequent runs touch only files whose digest changed. Installation cost is paid by
every user forever.

**Revisit if.** Phase 12 measurement on a 500,000-file corpus shows the first index is unacceptable
even in the background. The remedy is an optional accelerator, never a required one.

---

## D-006 — Per-role models yes, per-role providers only through a gateway

**Finding.** Claude Code subagents inherit the session provider. The documentation is explicit:
there is no per-subagent provider selection.

**Decision.** The plugin exposes a model and effort slot per role, defaulting to `inherit`. True
per-role provider independence requires an LLM gateway speaking the Anthropic Messages API,
configured by the user outside the plugin.

**Boundary.** The plugin never holds a credential, never configures a gateway, never reads an API
key. It names a model per role; the user's infrastructure decides what answers.

**Reported.** `/cycle:doctor` surfaces `CLAUDE_CODE_SUBAGENT_MODEL` overrides, `availableModels`
substitutions, and reviewer/arbiter model correlation.

---

## D-007 — Anthropic credential path preserves the subscription

**Decision.** Set `ANTHROPIC_BASE_URL` only. Do not set a gateway credential variable.

**Reasoning.** A gateway credential replaces the claude.ai subscription login for the session and
bills every request per token. With only the base URL set, the saved login remains the active
credential and is forwarded to the gateway, provided the gateway propagates the OAuth capability in
the `anthropic-beta` header.

**Risk.** OAuth propagation is the most fragile point in the local configuration. Phase 13 begins
with an isolated spike verifying that an Anthropic-routed request is billed to the subscription,
before any other provider is connected. Fallback if it fails: a switchable second profile with the
gateway active only during Cycle runs.

---

## D-008 — Personal multi-provider configuration lives outside the repository

**Decision.** Gateway configuration, credential shims and API keys live in a local directory that is
not part of the repository and never enters version control. The repository ships only a
placeholder setup guide.

**Enforcement.** Strict ignore rules, plus the product's own secret scanner running on the changed
content of every candidate.

---

## D-009 — Standalone roles are advisory and cannot approve

**Decision.** Each of the five roles is invocable alone, read-only, incapable of approval or
delivery. `/cycle:executor` performs feasibility analysis and never writes.

**Rejected.** Allowing a standalone executor to implement, or a standalone arbiter to approve.

**Reasoning.** If a standalone role could approve, invoking it directly would bypass the entire
product within weeks of release. The governed cycle with recorded evidence is the only path to
approval. This invariant is not configurable.

---

## D-010 — Native Claude Code capabilities are never reimplemented

**Decision.** Subagent isolation, workflow orchestration, worktree isolation, the permission system,
the Browser pane, LSP servers, per-agent memory scope, `/goal` and code search are consumed, never
rebuilt.

**Effect.** Two subsystems present in the predecessor disappear entirely: the browser automation
layer, and the autonomous completion loop. Design gates consume the native accessibility tree at
zero model cost.

---

## D-011 — Concepts are reimplemented; code is never copied

**Context.** Sixteen existing projects were reviewed for functionality worth incorporating. They
carry MIT and Apache 2.0 licenses, which require preserving copyright and license notices in any
copied code — incompatible with shipping the work as original.

**Decision.** Implement concepts from first principles. Never copy code. A concept such as "check
whether the code needs to exist before writing it" is not protected expression; the implementation
of it is.

**Adopted as concepts.** Pre-write essentiality ladder; action-first output discipline; deterministic
local extraction with delta-only reindexing; two-level memory retrieval; proof-validated security
findings; deterministic no-model design detectors.

**Rejected.** Competing orchestrators, model routers, self-improving frameworks, spaced-repetition
learning, pre-commit review gates, productivity applications. Each either duplicates a native
capability, duplicates the workflow runtime, or addresses a different problem.

---

## D-012 — Windows and WSL certified before publication

**Decision.** Nothing is pushed to the public repository until the full certification matrix passes
on both Windows and WSL: installation, uninstallation, every command, complete autonomous cycles,
evidence rejection cases, integrity and recovery.

**Known platform obstacle.** `npm`, `bun`, `pnpm` and `yarn` are `.cmd` shims on Windows and cannot
be executed by a no-shell exec call. Falling back to a shell would reopen the command injection that
the argument allowlist exists to close. Resolution through `PATHEXT` and an explicit shim allowlist
is a required Phase 7 deliverable.

---

## D-013 — Licensing and naming

**Decision.** FSL-1.1-MIT, converting to MIT on the second anniversary of each version's release.
Copyright Gianluca Iannotta. Repository `github.com/jannotix/claude-code-cycle-plugin`.

**Consequence.** FSL is not OSI-approved open source during the initial period, so the plugin may not
be accepted into the community marketplace. Distribution through a marketplace in the project's own
repository is unaffected.

**Required.** A non-affiliation notice in the README, since the name contains a third-party product
name.

---

## D-014 — SDD for the plugin, configurable patterns for generated code

**Decision.** The plugin itself is developed specification-first: this document set precedes
implementation. Enterprise patterns for the code the workflow generates — domain modelling,
layering, boundary design — live in the reviewer rubrics and are configurable per project, not
imposed by the plugin.

**Reasoning.** A delivery-governance tool that dictates one architecture to every project it touches
is wrong about its own scope.

---

## D-015 — Windows script runners are resolved, never shelled

**Decision.** The gate runner resolves an executable through `PATHEXT`, and when the result is a
`.cmd` or `.bat` shim it looks the name up in an explicit allowlist — `npm`, `npx`, `pnpm`, `pnpx`,
`yarn` — and runs the real script the shim wraps under this process's own Node. A shim that is not
on the list is reported unavailable and its gate is recorded as skipped.

**Rejected.** `shell: true` on Windows. It would execute the whole command string through `cmd.exe`,
which reintroduces the injection that the argument allowlist and the shell-operator rejection exist
to close, for the convenience of one platform.

**Consequence.** A project whose verification depends on an unlisted Windows shim gets a recorded
skip rather than a silent pass. That is the correct failure: the list grows when a real project
needs it. Closes the obstacle recorded in D-012.

---

## D-016 — The essentiality gate is a graph detector, not a model call

**Decision.** The essentiality gate reads the code graph built in Phase 5. A top-level definition in
a file the candidate added, whose name has exactly one other definition elsewhere in the project, is
recorded as a finding for the functional reviewer to score.

**Rejected.** Asking a model whether the change reimplements something. It costs tokens, it is not
reproducible, and the project already has an exact index of what it defines and where.

**Deliberately narrow.** Methods are excluded, names shorter than four characters are excluded, a
common-name list is excluded, and a name matching several existing definitions produces nothing.
Precision over recall: a detector that fires on `render` is one people learn to ignore.

**Not mandatory.** Reuse is a judgement about the change, and the reviewer makes it. The gate
supplies the evidence, not the verdict.

---

## D-017 — An unknown or empty candidate fails verification

**Decision.** When the change set cannot be read — git absent, or the project is not a repository —
the candidate integrity gate fails. When the change set is empty, it also fails.

**Reasoning.** Both cases would otherwise pass every gate trivially: no changed file means no
required layer, no secret to find and nothing to compare. An executor that changed nothing and a
candidate nobody can describe are exactly the false "done" the product exists to refuse.

---

## D-018 — Gate strictness is encoded per evidence row, not applied at arbitration

**Decision.** Each evidence row records whether that gate had to pass. `standard` records a gate
that could not run at all as skipped and non-blocking; `strict` records it as blocking; `advisory`
records a required-missing gate as a warning and non-blocking.

**Reasoning.** Approval reads the evidence table directly, so the strictness in force when the gates
ran must survive in what was recorded. Re-deriving it at arbitration would let a configuration
change between verification and approval alter a verdict about work that was already judged.


---

## D-019 — Design detectors are arithmetic, and they report rather than block

**Decision.** Every design rule reads bytes and reports a file, a line, a rule identifier and a
severity. Contrast is the WCAG ratio computed from two literal colours; the rest are narrow pattern
rules over changed interface files. The gate is not mandatory: its findings go to the functional
reviewer, who decides what they mean for this change.

**Rejected.** Asking a model to review the design. It costs tokens on every candidate, it is not
reproducible between two runs, and it produces opinions where the product needs evidence.

**Rejected.** Making the gate mandatory. A project's taste is its own; a delivery blocked by a
detector nobody agreed with is a detector that gets switched off.

**Deliberately narrow.** A rule that cannot resolve its inputs — a colour behind a custom property,
an element the matcher does not track — reports nothing. Precision over recall, for the same reason
as the essentiality gate: a detector that fires on ordinary code trains people to ignore it.

---

## D-020 — The accessibility tree is captured by the host and inspected here

**Decision.** The executor drives the affected flow in the native Browser pane and returns the
accessibility tree with its result. The control plane validates that tree as strictly as a plan or a
verdict, runs deterministic detectors over it, and records two pieces of evidence: that the flow was
driven, and that the tree was inspected.

**Reasoning.** D-010 forbids rebuilding browser control, which Claude Code already has. What the
plugin owns is the judgement: a capture is not proof until something inspects it.

**Consequence.** A control with no accessible name fails the accessibility gate, because a control
a screen reader cannot announce is not shipped work. A missing landmark or a gap in the heading
outline is recorded in the same evidence and blocks nothing.

**Consequence.** An interface change with no captured flow has no proof, so the required-missing
gate of section 7.3 fails it. That is the mechanism, not an obstacle.

---

## D-021 — A demonstrated proof is a failing mandatory gate

**Decision.** `run_proof` executes one proof against a disposable copy and records the result as
evidence. A proof that exits 0 demonstrated the vulnerability and is recorded as a **mandatory gate
that failed**; a proof that did not demonstrate anything is recorded and blocks nothing.

**Reasoning.** Arbitration already reads the evidence table to decide whether an approval is
permitted. Recording a demonstrated vulnerability there means the refusal happens even if every
reviewer and the arbiter approve: nobody has to remember. The mechanism that already exists does the
work, and no new rule is needed.

**Convention.** Exit code 0 means demonstrated. Stated in the tool description and in the security
reviewer's prompt, because a proof script has no other way to say what it found.

**Corollary.** The security reviewer cannot write files, so it supplies the proof's source and the
control plane writes it inside the copy. The separation of powers is not weakened to make proofs
possible.

---

## D-022 — Proof containment is enforced where it can be, and recorded exactly

**Decision.** A proof runs against a disposable copy of what git tracks, with a hard 60 second
timeout, an argument allowlist that refuses installation, download and publication, no shell, and
proxy variables pointing at a closed loopback port. Every one of those lines is recorded in the
evidence with the proof.

**Known ceiling.** The network denial is environmental. It stops every client that honours proxy
settings, which is what a demonstrative proof uses; a proof opening a raw socket would still reach
the network. An OS sandbox — AppContainer on Windows, a namespace on Linux — is the upgrade, and it
is worth taking when proofs stop being demonstrative and start being hostile.

**Why recorded rather than claimed.** A reader of the evidence must be able to see what containment
actually applied. "Network denied" as a bare claim would be read as more than it is.


---

## D-023 — Delivery commits the approved bytes

**Decision.** Promotion compares the working tree against the approved manifest, writes every
candidate file from the bytes recorded at freeze, verifies each digest again, and then commits
exactly those paths. The commit subject is the user's original request; its trailers carry the base
revision, the candidate digest and the workflow identifier.

**Considered and overridden.** Leaving the commit to the user, on the grounds that section 6.2
defines `deliver` as "promotion re-verified" and that committing is an outward-facing action. The
owner's decision is that a governed cycle that stops one step short of the commit leaves the
delivery unrecorded in the only history the project itself keeps. Recorded, not relitigated.

**Hooks disabled.** The commit runs with an empty `core.hooksPath` and `commit.gpgsign=false`, as
section 17 already specifies for control-plane commits. A pre-commit hook that reformats would
change the bytes an arbiter approved *after* they were verified, which is the single thing delivery
exists to prevent. The project's own hooks run when the developer pushes, against a tree they can
see.

**Only the candidate's paths.** `git commit --only` over the manifest's paths. Delivery has already
refused any change outside the candidate, so this commits the approved change and nothing else.

**Idempotent.** If those paths are already committed there is nothing to commit, and the existing
revision is returned. A delivery recovered after a crash does not produce a second commit.

**Failure is reported, not swallowed.** If the commit cannot be made — no configured identity, a
repository that cannot be read — the delivery aborts with the reason. The approved bytes are already
on disk and verified by then, so nothing is lost; the workflow stays in `delivery` and
`/cycle:resume` finishes it once the cause is fixed.

---

## D-024 — A candidate that moved is refused; a candidate that vanished is restored

**Decision.** Before the first write, delivery compares every changed path against the approved
manifest. A file whose bytes differ, or a file that changed and is not in the manifest, aborts the
delivery. A manifest file that is missing from disk is written back from the approved bytes.

**Reasoning.** Those are different events. Different bytes mean somebody edited the file after the
approval, and overwriting their edit with older approved bytes would be worse than stopping. A
missing file means the change was lost — a revert, a stash, a closed application — and delivering it
is exactly what the approval authorised.

**Cost accepted.** Candidate bytes are kept in the store: 2 MiB per file, 64 MiB per candidate. A
file above the cap is bound by digest only, and delivery verifies it rather than restoring it,
saying so in the result.

---

## D-025 — Freeze refuses a repository it cannot describe

**Decision.** Freezing requires a resolvable `HEAD`, no merge, rebase, cherry-pick, revert or bisect
in progress, and no unmerged paths. Any of those refuses the freeze with the reason.

**Reasoning.** "Freeze requires a clean worktree" in section 8 cannot mean "no uncommitted changes"
here, because the uncommitted changes *are* the candidate. What it has to mean is that the
repository has one unambiguous answer to "what is this candidate, and what does it sit on". A
repository mid-rebase does not, and a manifest that claims otherwise is a manifest nobody can use
to return to that state.

---

## D-026 — The chain is signed on a cadence and at every terminal state

**Decision.** An Ed25519 checkpoint is written at history sequence 0 and every hundred entries after
it, and again whenever a workflow reaches a terminal state — delivered or cancelled. The key is
generated on first use in `${CLAUDE_PLUGIN_DATA}/keys/`, mode 0600 on POSIX and an ACL granting the
current user alone on Windows.

**Rejected.** Signing every entry. Ed25519 is fast, but a signature per entry buys nothing a chain
of hashes anchored at intervals does not already give, and it makes every history write a key
operation.

**Consequence.** `/cycle:doctor` verifies the chain and the signatures at startup and reports a
failure as an error, because a history nobody verifies is a history nobody can rely on. It also
refuses a data directory inside the project: the store and the signing key would otherwise become
part of every candidate the project verifies, and the secret scanner would find the key exactly
where it should never be.


---

## D-027 — Memory is written by the control plane from completed work, never by a role

**Decision.** Three things are remembered, all of them facts the control plane observed: what was
delivered and on which gates (`approval`, `verified`), which gates actually verify this project
(`command`, `verified`, superseded on each delivery), and what ran out of repair cycles
(`failed_approach`, `inferred`).

**Rejected.** Letting a role write memories — an architect recording its own conclusions, a reviewer
recording its own opinion. A role that can write to the project's long-term memory can convince the
next cycle of something no evidence supports, and the product's whole claim is that an agent's
assertion is not evidence.

**Consequence.** `verified` is honest by construction: it is only ever written with evidence
identifiers from gates that passed, which is exactly what section 10 requires of it. `inferred` is
used for the one case where the fact (this blocked) and the reason (why) are different things.

---

## D-028 — Retrieval is two-level, and the second level is never fetched speculatively

**Decision.** A search returns identifier, kind, confidence, title, scope and evidence count.
Detail is a second call, for the identifiers the caller chose. Both the architect and the executor
receive the index in their prompt and fetch detail themselves.

**Reasoning.** Memory that is expensive to consult is memory nobody consults. The index costs tens
of tokens per entry, so a dozen entries can be offered on every request without anybody deciding
whether it is worth it.

**Scope retrieval needs a scope.** A search with no paths returns only text matches. Answering
"what applies here" with everything, when there is no "here", would put the entire project memory in
front of a role that asked about one word.

---

## D-029 — A memory is revoked, never deleted

**Decision.** `forget` sets an entry to `revoked`: it stops being retrieved and stays in the store,
with its supersession chain intact and queryable. Revocation requires explicit confirmation and is
refused without it.

**Reasoning.** The memory is linked to evidence and to a candidate that is itself part of an
append-only history. Deleting the entry would leave those references pointing at nothing, and would
make "what did this project believe last March" unanswerable — which is most of what a project
memory is for.


---

## D-030 — A goal governs workflows; it never becomes one

**Decision.** A milestone is an ordinary evidence-gated workflow, and the milestone's state is read
from that workflow every time it is asked for, never from a column somebody could set. A goal owns
an objective, plan versions, milestones and a continuation budget, and implements nothing.

**Rejected.** A goal-level executor that plans and implements across milestones. It would need its
own verification, its own reviews and its own arbiter, which is the governed cycle again, one level
up and without the evidence.

**Consequence.** The completion gate is not a policy the goal enforces on itself: it is a query
against the workflows, and a workflow that is not `completed` refuses the goal that links it.

---

## D-031 — A goal without success criteria is refused

**Decision.** `new` requires at least one success criterion. Completion returns them, and the
approval is asked for against them.

**Reasoning.** The objective says what to do; the criteria say how anybody knows it happened. A goal
with no criteria completes by nobody disagreeing, which is exactly the failure this product exists
to make impossible one level down.

**Consequence.** The skill asks the user rather than inventing criteria. An invented criterion is
one the plugin can satisfy on its own terms.

---

## D-032 — Continuations bound the automatic half, and exhausting them blocks

**Decision.** Delivering a milestone continues its goal and spends one continuation; five by
default. Exhausting the budget moves the goal to `blocked`, which preserves everything and is
extended deliberately.

**Reasoning.** The same shape as the repair budget, for the same reason and with the same
vocabulary: autonomy that cannot run out is autonomy nobody is supervising. Reusing the shape means
one thing to learn instead of two.

---

## D-033 — Completion is requested, then approved, and the gate is checked twice

**Decision.** `complete` moves a goal to `completing` only when every milestone is complete and at
least one exists. `approve` requires explicit confirmation, and re-checks the milestones before it
completes anything: a milestone reopened while somebody was deciding refuses the approval and
returns the goal to `active`.

**Reasoning.** The two steps exist so a person sees the success criteria next to what was delivered
before saying yes. The second check exists because between the request and the answer is exactly
where a state changes, and a gate that trusts a check from a moment ago is not a gate.


---

## D-034 — Admission defers with a reason; it never blocks and never queues

**Decision.** A workflow asks for a slot and is answered immediately: a lease with an expiry, or a
refusal that names what would have to change. There is no queue and nothing waits.

**Reasoning.** The control plane runs inside an MCP call. A call that blocks holds a session hostage
to a machine condition it cannot see, and a queue is a promise the control plane cannot keep across
a restart. A reason and a retry interval are things the caller can act on.

**Consequence.** The skill reports the reason and stops. Retrying in a loop, or raising the limits
to get past a deferral, is turning off the measurement rather than answering it.

---

## D-035 — A metric that could not be read defers

**Decision.** Memory, disk and CPU are each measured. If any of them cannot be read, admission is
deferred with "metrics are unavailable" rather than granted.

**Reasoning.** The alternative is treating unknown as healthy, which is how a machine gets driven
into swap by something that was certain it had room. The failure mode of deferring is a delay; the
failure mode of assuming is the user's machine.

**CPU is sampled, not borrowed from `loadavg`.** `os.loadavg()` returns zero on Windows. A metric
that silently reads healthy on one of the two certified platforms is worse than no metric, so
utilisation is computed from the difference between two snapshots of the kernel's own counters.

---

## D-036 — Fair share instead of a rotation queue

**Decision.** Every project holding a lease counts as a contender, plus the one asking if it holds
none. A project may hold at most `maxActive / contenders` slots, at least one.

**Rejected.** A round-robin queue of waiters. It needs durable queue state, an ordering that
survives restarts, and a way to evict a waiter whose session died — three problems, for a property
this arithmetic already has: a project arriving at a busy control plane is always owed a slot, and
no project can hold every slot while another is contending.

**Consequence.** A project working alone uses every slot, which is the common case and the one that
should not be slowed down to be fair to nobody.

---

## D-037 — The index asks the filesystem before it reads the file

**Decision.** `index_state` records each file's size and last-write time alongside its digest. A
file whose size and mtime still match is counted unchanged without being opened. The digest remains
authoritative whenever either differs, and a file whose mtime is not strictly older than its own
`indexed_at` is re-hashed, closing the race where a file is written in the tick it was indexed in.

**Why it exists.** The Phase 12 measurement found it. Before this, noticing that nothing had changed
cost a full read and hash of every file in the project: 12.5 seconds for two thousand files on the
measurement machine, and proportional to the corpus rather than to the change. Reading is roughly
eleven times more expensive than asking for the metadata.

**Measured effect.** On the same corpus, a no-change delta went from 12.5 s to 0.6 s, and a
one-file delta from 8.2 s to 1.0 s.

**Known ceiling.** The stat sweep is still proportional to the number of files. At the top of the
supported range that is a sweep of the whole corpus per delta, which the measurement records rather
than hides. Watch-based invalidation is the upgrade if that ever becomes the constraint in
practice; it is a subsystem, and this is one column and one comparison.


---

## D-038 — A measurement describes the code that produced it

**Decision.** The 500,000-file result in `MEASUREMENTS.md` was recorded against the code as it stood
when the run finished. An improvement identified by that run — loading the file catalogue once
instead of twice per delta — was written down rather than applied, so that the recorded number is
not describing a build nobody measured.

**Reasoning.** The whole product exists to insist that a claim is worth what the evidence behind it
is worth. A benchmark quietly improved after the fact is exactly the kind of unverified claim it
refuses everywhere else.

**Consequence.** The improvement is taken in a later phase, and re-measured then.

---

## D-039 — The provider path is derived from what is observable, never asked for

**Decision.** A role's provider is read from three things the plugin can already see: the session
endpoint, whether a credential variable is set, and the model identifier the user named. A name of
the form `provider/model` names its provider. An unprefixed name behind a gateway is reported as
routed by the gateway, not attributed to a provider.

**Rejected.** Probing the gateway for its routing table, or inferring a provider from a model
name's shape. The first needs a credential and an endpoint the plugin has no business calling; the
second is a guess that would be wrong the first time somebody self-hosts a model under their own
name — and a confident wrong attribution is worse than "the gateway decides".

**Consequence.** Certification 11.3 became automatable. What is asserted is that the derivation is
correct; that a live gateway then routes as reported stays manual, because only the user's own
accounts can show what was billed.

**Also.** `ANTHROPIC_API_KEY` is now checked alongside `ANTHROPIC_AUTH_TOKEN`. Either replaces the
saved login for the whole session, and reporting only one of them meant a subscription could stop
paying without the report noticing.

---

## D-040 — A role that says nothing has not rejected anything

**Decision.** A role whose provider is unreachable produces no answer after the runtime has already
retried. The run pauses the workflow at that boundary, records `provider unavailable` with the role
in the chain, and spends no repair cycle. `/cycle:status` and `/cycle:resume` report the reason.

**Rejected.** Submitting the empty answer to the control plane. A missing plan is a plan that fails
validation, and a missing verdict is a rejection — so a network outage would have consumed the
repair budget five times and blocked a candidate nobody had judged.

**Reasoning.** The repair budget is the product's scarcest resource: it is what stops a cycle
running forever, and it exists to count *disagreements*. Spending it on silence would make an
unreachable provider indistinguishable from five reviewers who all found the same defect.

**Consequence.** `control` carries an optional reason, kept with the operation in the hash chain, so
the classification survives the session that noticed it — which is the only way `/cycle:resume`
after a restart can say why the workflow is standing still.

---

## D-041 — `/cycle:models` reports configuration and never writes it

**Decision.** The command reports what each role resolved to, which provider carries it and what
pays. To change an assignment it names the option to set and what setting it does. It does not
write plugin configuration, does not edit a settings file, and never asks for a key.

**Rejected.** Writing the user's plugin configuration from inside the plugin. Role models live in
`userConfig`, which Claude Code owns, and cert 1.11 already forbids writing into the Claude Code
installation. A plugin that edits the host's configuration to make its own report come out right is
the same category of mistake as a role approving its own work.

**Consequence.** The command is read-only, like `/cycle:doctor` and `/cycle:limits`, and the
spec's "inspect or assign" is honoured as inspect-and-instruct.

---

## D-042 — The matrix is executed, and an unevidenced row fails it

**Decision.** `tests-debug/certify.mjs` reads `CERTIFICATION.md`, matches every row against a
`Certification <row>` reference in a test or a harness, runs the suites, and refuses to call a row
green unless something actually claims it. A manual row needs a recorded result for that platform
in `certification-results.json`.

**Why it exists.** The matrix said 118 rows were automated. The first run of the auditor found that
86 of them had nothing behind them: some were tested and never labelled, and some were not tested at
all. A matrix nobody executes is a list of intentions, and this product exists to refuse exactly
that substitution everywhere else.

**Consequence.** Adding a row to the matrix now costs something: either a test that claims it or a
recorded manual result. That is the intended price.

---

## D-043 — The three enforcement layers now all exist

**Finding.** Section 5.2 declared three independent layers. Two of them were not built: there was no
`PreToolUse` hook, and the manifest had no `hooks` key at all, so the runtime layer did not exist;
and `reportTask` recorded what the executor said it did without ever reading the worktree, so the
reconciliation layer did not exist either. Only the declaration layer was real, which means the
separation of powers had one layer and claimed three.

**Decision.** `hooks/guard.mjs` denies a write by a read-only role, a subtask by any role, and a git
invocation by the executor that would move HEAD, rewrite history or destroy the candidate.
`reportTask` reads the worktree with git and rejects a task whose changed paths fall outside the
write scopes the plan authorized.

**Fails open on an unidentifiable payload.** A hook that denied what it could not identify would
deny the user's own session and take the application down with it. That is tolerable precisely
because there are three layers: the declaration layer does not depend on this process running, and
reconciliation reads the filesystem rather than the payload.

**Found by the first run.** The reconciliation layer immediately rejected the end-to-end harness's
own fixture, whose plan authorized `src` while the executor also wrote the verification scripts it
was told to run. The fixture's plan was under-specified, which is exactly the defect the layer is
for.

---

## D-044 — Scope comparison is one function, and it knows the platform

**Decision.** `src/workflow/scopes.ts` holds the single comparison used both by plan validation,
where two tasks writing the same area need an ordering, and by reconciliation, where a changed path
is either authorized or the task is rejected. It folds case on Windows and macOS and does not on
Linux.

**Reasoning.** Two implementations of "is this path inside that scope" eventually disagree, and the
disagreement is the boundary quietly opening. Case matters because on Windows `SRC/Auth.ts` and
`src/auth.ts` are one file: a comparison that did not know that would refuse a legitimate write for
the case somebody happened to type.

**Ceiling.** Reconciliation authorizes against the union of the scopes of the task being reported
and of every task already completed, rather than attributing each path to the task that wrote it.
Per-task attribution needs a worktree snapshot per task; the union still catches the boundary that
matters — a path no task in the plan was allowed to touch — with no snapshot to keep in step.

---

## D-045 — Execution can fail before there is a candidate

**Finding.** Reporting a task the executor could not finish asked the state machine for `reject`,
which only arbitration allows and which requires a frozen candidate. The call threw an invalid
transition instead of consuming a repair cycle. It had been that way since the state machine was
written and no test exercised it.

**Decision.** A distinct `execution_failed` command, valid from `execution` and `quick_execution`,
requiring no candidate, consuming a repair cycle exactly as a rejection does. Both a blocked task
and a scope violation use it.

**Why not relax `reject`.** `reject` means a candidate was judged and refused. Widening it to cover
"there is no candidate" would have made the two indistinguishable in the history, and the history is
the thing this product asks people to trust.

---

## D-046 — The standalone executor is a different agent

**Finding.** `/cycle:executor` is documented as analysis that "does not write files, and there is no
flag that changes that". It invoked `cycle:executor`, the agent that must be able to write. The
claim was enforced by asking the prompt nicely.

**Decision.** `cycle:executor-advisor` is a separate agent declaring `Write`, `Edit`,
`NotebookEdit`, `Bash` and `Task` as disallowed, and the executor consultation resolves to it. It
keeps the executor's configured model and effort, because it is the same judgement without the
authority.

**Consequence.** Seven agents ship rather than six, and certification 1.4 counts seven.

---

## D-047 — The signing key restriction happens before the process can exit

**Finding.** On Windows the key's ACL was set with an asynchronous `execFile` and an empty callback.
Nothing waited for it and nothing checked it. On the certification run the key kept the temp
directory's inherited ACL: eight principals, five of them with Modify. A second defect sat behind
it — the domain-qualified account name was built with a broken template escape, so even when the
call did run it named an account that does not exist.

**Decision.** `execFileSync` with a timeout, and a separate `keyPermissions()` that reads what the
file actually carries now. `/cycle:doctor` reports a key that is not restricted to this account as
an error, not a warning: anyone who can read the key can forge a checkpoint signature, and a forged
checkpoint makes a tampered history verify.

**Reasoning for reading rather than remembering.** A key restricted at creation can be loosened
afterwards. What creation attempted is not evidence about what the file carries today.

---

## D-048 — Every git invocation carries `core.longpaths`

**Finding.** The plugin delegates its ignore policy and its change set to git — deliberately, so
there is no second implementation of `.gitignore` semantics. On Windows without `core.longpaths`,
git cannot open a directory past 260 characters and reports it as unreadable. The index parsed
nothing, and the candidate would have silently omitted every file under it.

**Decision.** `src/git.ts` builds the arguments for every git invocation the plugin makes, with
`-c core.longpaths=true` in front. Set per invocation, never written into the user's configuration.

**Reasoning.** A candidate quietly missing a file is the one failure this product cannot tolerate:
every gate would run, every review would pass, and the thing reviewed would not be the thing on
disk. Four copies of the same git helper had grown up separately, which is why the fix is one
function rather than four edits.

---

## D-049 — The WSL runtime is pinned to what Windows recorded, not to the minimum

**Decision.** `tests-debug/wsl-node.sh` takes its Node version from `certification-win.json` — the
version the recorded Windows run actually used — and falls back to a pinned minimum only when no
Windows run has been recorded yet.

**Reasoning.** Certification 12.9 is parity between the two platforms, not "22 or later". An
installer that satisfied the documented minimum would put WSL on 22 while Windows ran 26, pass every
other row on both, and then fail the one row whose entire job is to notice that. Making parity the
default costs four lines; remembering to keep two machines in step costs somebody a confusing
afternoon eventually.

**Boundary.** It installs into `$HOME`, without sudo, without a package manager, and without
touching any profile: it prints the `PATH` line rather than writing it. What the plugin needs from a
machine is a supported runtime, not a claim on how that machine is administered.

---

## D-050 — Options are delivered to the control plane explicitly, and a test proves it

**Decision.** `.mcp.json` declares one `env` entry per `userConfig` option, mapping
`CLAUDE_PLUGIN_OPTION_<KEY>` to `${user_config.KEY}`, and `tests/config.test.ts` asserts the two
directions of that mapping: every declared option reaches the server, and every variable the server
is handed is one it reads.

**Reasoning.** The host injects `CLAUDE_PLUGIN_OPTION_*` into hook processes automatically, and the
control plane was written on the assumption that MCP servers were treated the same way. They are
not: an MCP server receives an option only if its own `env` block asks for it. The result was the
worst shape a configuration bug can take — the host accepted the values, persisted them, showed them
back in settings, and the plugin ran on defaults. Nothing failed; the arbiter simply was not the
model the user had chosen. An assumption that produces silence when it is wrong has to be replaced
by a check that produces a failure.

**Cost.** Thirteen lines of `.mcp.json` that must grow with the manifest, which is exactly what the
test enforces. The doctor also reports the delivered count, so the same fault is visible from a
running install rather than only from the source.

---

## D-051 — A model the endpoint cannot serve is a finding, not a provider label

**Decision.** With no gateway configured, any role model that is not `inherit` and does not begin
with one of Anthropic's family names is reported as unroutable.

**Reasoning.** The provider column was literally correct — with no gateway the request does go to
`api.anthropic.com` — and practically misleading: a foreign model name appeared beside the provider
`anthropic` and billed to `subscription`, which reads as a working configuration for a call that
cannot succeed. The diagnostic exists to catch a broken setup before a workflow does.

**Boundary.** The rule matches Anthropic's own naming rather than cataloguing other providers', so
it does not rot as they rename their models. A future Anthropic model outside those families would
produce a spurious warning, never a block — the failure mode is deliberately the harmless one.

---

## D-052 — Starting a workflow is idempotent per request

**Decision.** `startWorkflow` looks for a non-terminal workflow in this project carrying the same
request digest and returns it, marked `resumed`, instead of creating a second one.

**Reasoning.** The first complete cycle run on an installed artifact forked into three workflows for
one request. The `start` call is relayed to the control plane by the operator agent, that relay lost
the `workflowId` from a response, and the driver did the reasonable thing and sent the call again.
Nothing refused it. Two orphaned workflows were left sitting in `quick_execution`, and each of them
looked perfectly healthy in isolation — which is the dangerous part: a forked run has no symptom
until someone counts.

The request digest was already computed and already stored on every start. The guard is a lookup,
not new state.

**Boundary.** Terminal workflows are excluded, so the same request can be deliberately run again
after the first one finishes. A different request in the same project still starts its own workflow;
this refuses duplicates, not concurrency.

---

## D-053 — The control plane, not the reply, says what stage a workflow is in

**Decision.** Every mutating control-plane call is followed by a `status` read, and the stage that
read reports replaces whatever the reply claimed.

**Reasoning.** A workflow script cannot call an MCP tool; only an agent can, so each control-plane
call is relayed by one. A model on the return path is not a transport: replies came back missing a
field, carrying a state the plane was never in, and double-encoded. Hardening the relay is the wrong
move, because the relay is not the authority — the store is. Reading the stage back from the plane
costs one cheap, repeatable call and makes the relay's accuracy irrelevant to correctness.

**What this buys.** A reply lost entirely is recovered when the call in fact succeeded, and still
reads as a stage that has not moved when it did not. Combined with D-052's idempotent start and
D-055's fail-closed returns, no single garbled reply can move the run to a stage the plane is not in.

---

## D-054 — A refusal names which of two failures it is

**Decision.** When reconciliation refuses a task report, it distinguishes a path no task in the plan
authorizes from a path another task authorizes but that has not been reported yet, and names that
task.

**Reasoning.** The first full-route run reported a task while a second task's files were already in
the working tree. The refusal said the paths were "outside every write scope the plan authorized".
That was false — they were inside the plan, in a task not yet reported — and the caller did the
thing a false diagnosis invites: it moved the files aside with `git stash` and reported again. The
guard was correct and was circumvented anyway, because its message described a different problem
than the one it had found.

**Boundary.** The report still fails in both cases and the repair cycle is still consumed; strictness
is unchanged. Only the diagnosis differs, and it says explicitly not to move the changes aside,
because that is the workaround the wrong message produced.

---

## D-055 — A failed relay must arrive as a missing answer, not as an exception

**Decision.** `control()` and `governor()` retry once and then return `null`; `role()` returns `null`
on failure without retrying. Neither throws.

**Reasoning.** Five consecutive full-route runs died, each to a different operator failure: a dropped
field, an invented terminal state, a double-encoded payload, turn exhaustion, and a `ToolSearch`
loop. The script was not missing its defences — every call site already tests for the state it wants
(`=== 'execution'`, `mandatoryPassed !== true`, `state === 'delivery'`), and every role dispatch
already ends in `if (!plan) return providerUnavailable(...)`. That handling was simply unreachable,
because the failure arrived as an exception and killed the run before anything could read it. It was
dead code that looked live.

**Why null is safe here, and only here.** Every test is positive: it asks whether the thing it wants
is present, never whether an obstacle is absent. A missing answer therefore reads as not verified,
not approved, not delivered, and the run stops or repairs. Adding a `null` return to a call site
that tested for absence would invert exactly this, so the property has to be re-checked whenever a
call site is added.

**Which calls are retried, corrected after the first attempt at this got it wrong.** Only `start`,
`status` and `recall`. The first version retried every control-plane call on the reasoning that a
transition already applied is refused rather than applied twice — true about safety, wrong about
outcome. The refusal comes back as an error, the caller sees a state that does not match, and the
run stops. Retrying a mutating call therefore converts a recoverable relay hiccup into an aborted
run: exactly the failure this decision exists to prevent, reintroduced by the fix for it. The first
run under that version died re-sending `submit_plan`. `start` is retryable only because D-052 made
it idempotent; `admit` takes a lease, and asking twice would take two.

**Why roles are not retried.** An executor that already wrote part of its task has no protection at
all: re-running it would be a second, unbudgeted attempt at work the plan authorized once. The
workflow pauses instead, and `/cycle:resume` continues it deliberately.

**What this does not fix.** The operator is still a language model relaying exact JSON, which is the
wrong component for the job and remains so because the workflow runtime gives a script no other way
to reach an MCP tool. This makes its failures survivable, not rare.

---

## D-056 — Durable state lives where the application cannot remove it

**Decision.** The data directory resolves to the platform's own per-user location —
`%LOCALAPPDATA%\Cycle`, `~/Library/Application Support/Cycle`, `$XDG_DATA_HOME/cycle` — and never to
`CLAUDE_PLUGIN_DATA`.

**Reasoning.** The host offers `CLAUDE_PLUGIN_DATA` and removes that directory whole when the plugin
is uninstalled. That is right for a plugin's cache and fatal here: the directory holds a signed,
append-only record of a project's delivered work, its memory and its code index. Uninstalling the
plugin destroyed the history the product exists to keep, and reinstalling did not bring it back.
Section 1.9 promises that the user removes this directory deliberately, not that anything else
removes it for them.

**Verified.** With the fix in place, `claude plugin uninstall` leaves the store byte-identical and a
reinstall reads it back.

**Cost.** The location is no longer one the host knows about, so it is reported by the doctor and
named in the README rather than discoverable from the plugin directory. `data_dir` still overrides
it for anyone who wants the state somewhere specific.

---

## D-057 — A delta reads the index once

**Decision.** `affected()` and `resolveEdges()` share one read of `index_state` instead of each
loading it.

**Reasoning.** Both walked the whole table and JSON-parsed every reference list, independently, on
every delta. On the 500,000-file corpus that meant paying for the corpus twice before touching the
one file that had changed. Passing the map that was already in memory removes one of the two passes
outright.

**Boundary.** Change detection still stats every path, because finding out what changed without a
resident daemon means asking the filesystem about everything. That part is inherent; the duplicated
read was not.

---

## D-058 — What a subagent actually runs on, said out loud

**Decision.** `role_settings` returns `subagentModel` — the family alias the host's Agent tool
accepts — beside the configured `model`, and the doctor names both the roles that collapse onto one
alias and the roles the tool cannot express at all.

**Reasoning.** The Agent tool takes `sonnet`, `opus`, `haiku` or `fable` and refuses a model
identifier. Every advisory command dispatches through it, so a role configured as `claude-opus-4-7`
could not be honoured. The caller improvised: one run dropped the model and used the session
default, another reduced it to `opus`. Nothing recorded either choice.

The worst case is the one the product exists to prevent. Two reviewers configured to
`claude-opus-4-7` and `claude-opus-4-8` reach that tool as the same alias, so their verdicts stop
being independent while the configuration still reads as five distinct models.

**Measured on a real configuration.** Architect `claude-fable-5`, executor `claude-sonnet-5`,
functional reviewer `claude-opus-4-7`, security reviewer `claude-opus-4-8`, arbiter
`claude-opus-5` reduce to `fable`, `sonnet`, `opus`, `opus`, `opus`. Three of the five judging
voices become one. Four aliases is the ceiling on how many distinct models the advisory commands can
reach at all, and the roles that most need to differ are the ones that share a family.

**What is still not known, and is stated as unknown rather than assumed.** The governed cycle
dispatches through the workflow runtime instead, with the identifier as configured. A run with a
deliberately invalid identifier produced a plan anyway and raised nothing, so that runtime accepts
what it does not recognise. It follows that a model which was never applied is indistinguishable
from one that was — the plugin cannot tell, and neither can the user. Saying so is the only honest
position available until the runtime reports which model answered.


## D-059 — The plane states the role configuration; it is not told it

D-058 closed with the honest position that the governed cycle could not tell whether a configured
model had been applied. It can now, and the answer was that none of them had been.

**What the record shows.** A run on a real project, with five distinct models configured, produced
eleven subagents. Every one of their metadata records carries an agent type and a spawn depth and
no model field at all. The executor's transcript, configured to `claude-sonnet-5`, was answered
109 times by `claude-opus-5` — the session model. Nothing was overridden: nothing was ever sent.

**The fault.** The run took its models from an argument the launching skill was told to assemble:
call `role_settings` once per role, build a map, pass it. When that preamble does not happen the map
arrives empty, and the dispatch reads `models[name] ? { model: models[name] } : {}` — so an absent
map is indistinguishable from a user who chose to inherit. Five configured models silently became
one, and no log, warning or diagnostic said so. The same argument carried the per-role efforts, so
those were lost with them, including the low effort the operator relay is meant to run at.

**A second fault was proposed and disproved.** `role_settings` returns both the configured
identifier and the model family a subagent can be given, and the skill pointed at the identifier;
the reading was that the identifier would be refused. The dispatch harness contradicted it. The
governed run dispatches through the workflow runtime, which takes the identifier as configured, and
that is what keeps `openai/gpt-5.6-codex` or `minimax/minimax-m3` reachable at all. Collapsing to
the family is correct only for the advisory commands, which go through a tool that accepts nothing
else. Acting on the unproved reading would have removed third-party model support entirely; it was
caught because the harness runs the real dispatch rather than describing it.

**The rule this restates.** An absent value must never be read as a permissive default. The
configuration is held by the control plane, so the control plane states it: `start` now returns
each role's effort, configured identifier and usable family, and the launching skill assembles
nothing. The configuration fills what the caller left unsaid rather than replacing what it said, so
a deliberate one-off model for a single run still works. `status` reports the same map, so which
model a role runs on is a question the plane answers rather than one the user reconstructs from a
transcript. The run logs the assignment as it is made, and a role with no configured model is
logged as inheriting rather than passed over in silence.

**Why the tests were green.** The map was built outside the code under test, by a model following
prose. Nothing asserted that a configured model reaches the role that needs it. The dispatch
harness now opens a control plane with five distinct third-party models configured, runs the real
workflow script with no models passed in at all, and checks what each role was dispatched with.
Against the previous dispatch every one of those checks returns null — the same null the run
transcript showed.

## D-060 — Routing reads the request it was given

Routing scored a request against English keywords and against a list of affected paths that no
caller ever supplied. Both halves failed quietly.

The path rules — migrations, packaging, deployment, dependencies, CI — could only ever be tested
against an empty array, so a guard the documentation presents as armed had never once fired. The
breadth rule had the same shape. Routing happens before anything is planned, so the caller genuinely
has no file list to offer; the one place a path is already known is where the person wrote it, and
paths named in the request are now extracted and scored.

The keyword half was worse for being partly true. A cycle that answers in the language of the
request has to route on it too. A payment change described in Italian, Spanish, French, German or
Portuguese scored zero critical signals and took the quick route — no independent review, no
arbitration against the original request, and a rationale that read "no critical signal in the
request", which was true only of a scan that could not read it. Markers are now matched as stems so
one entry covers a family, and the narrowness that keeps the quick route useful is preserved.


## D-061 — A capability that runs code is granted, not inherited

The security reviewer may execute a proof against a disposable copy of the candidate. The copy, the
timeout and the refused programs were real containment; three things were not.

The proof ran with the whole of `process.env` inherited, so every token the user happened to have
exported was readable by a script whose source is written by a model that has just read the
repository. The interpreters offered — node, python, ruby, perl, php — are general purpose, so the
list of refused programs constrains nothing: a script reaches the filesystem and the network through
its own standard library. And the output was recorded as evidence and returned to the reviewer
verbatim, so anything a proof printed was published twice.

The environment is now an allowlist of what an interpreter needs to start, and the output is passed
through the same redaction the history already uses. Neither is a sandbox. The honest position is
that a proof runs real code with the user's privileges, and a plugin installation is not how someone
should acquire that: `security_proofs` is off unless the user turns it on. With it off the reviewer
states the vulnerability and the existing rule applies — an undemonstrated critical is downgraded,
not discarded — so the gate degrades into something already designed for rather than into silence.

## D-062 — The party being judged does not write the evidence

The interface layer requires a user flow that was actually driven. The capture arrived as a JSON
object returned by the executor, was validated for shape, and was recorded as the mandatory gate
passing with the words "driven at". Nothing distinguished a tree that was captured from one that was
written, so the party whose work the gate exists to check supplied the proof that cleared it. That
is the single thing this product exists to prevent, in the one place nobody looked.

Provenance is now recorded. A capture from a reviewer is evidence and satisfies the layer. A capture
from the executor is recorded under its own gate names, carries no mandatory weight, and says on its
face that it is self-reported — and unstated provenance is read as the executor, because the weaker
reading is the safe one. A project with its own end-to-end suite already satisfies the layer through
that suite and is untouched; a project with neither has an unproven layer, which section 7.3 already
says is a failure rather than a silence.

## D-063 — Three unknowns that were being read as answers

Found by an external review of the source, verified against the code, and fixed together because
they are one mistake wearing three coats.

**A base revision recorded and never compared.** The manifest carries the revision the candidate was
built and arbitrated on, and the delivered commit states it in a trailer. Promotion compared only
the working tree, so a commit landing between approval and promotion left every candidate file
identical while moving the base, and the trailer then named a parent that was not the parent.
Promotion now reads HEAD and refuses when it has moved.

**A digest that could not be computed, compared to another that could not be computed.** Files above
a hashing cap were recorded with a null digest, and the integrity gate found `null !== null` false
and reported that everything matched the bytes recorded at freeze. The cap is gone: hashing streams,
so size is no longer a reason for a candidate file to go unbound. A null digest now means the file
could not be read, which is drift and never a match. In the same area the secret scanner skipped
content it could not read and then reported the total number of changed files as the number
scanned — a file nobody looked at was counted among the files that came back clean. It now counts
what it scanned, names what it could not, and fails, because its stated precondition is that
everything was scanned.

**A change set that could not be read, treated as an empty one.** `changedFiles` returns null when
git cannot be reached, and its own comment says why: an unknown candidate must never verify as a
clean one. The engine honoured that. The task-reporting path flattened it with `?? []`, so a
transient git failure let a task with out-of-scope writes report as completed with the scope gate
never running. The null now reaches the layer that knows the rule, and that layer refuses the report
rather than guessing.

The rule underneath all three, and underneath D-059 and D-060: **an absent or unknown value must
never be read as a permissive default.** It is the failure this codebase keeps producing, and it is
never loud when it happens.
