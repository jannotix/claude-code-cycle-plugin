# Cycle — user manual

Every operation runs automatically when its preconditions are met. The commands below exist for
inspection, control, recovery and expert use. None of them is required to use the product.

Each command is listed once here and exists once as a skill; a check in the test suite fails if the
two ever disagree.

---

## The one command that matters

### `/cycle:run [auto|quick|full]`

Runs the governed cycle on a change: an architect plans it, an executor implements it one bounded
task at a time, the evidence engine verifies it, two independent reviewers examine it in separate
sessions, and an arbiter judges the frozen candidate against **your original request** — not against
the architect's summary of it.

Your request is carried through verbatim. The arbiter reads the sentence you wrote.

`auto` picks the route from deterministic risk signals; `quick` skips architecture and the
independent reviews; `full` runs everything. A change to a critical area is promoted to `full` even
when `auto` would otherwise have chosen `quick`.

The run continues in the background. `/cycle:status` reports where it is.

### `/cycle:goal new|list|focus|plan|link|status|complete`

A persistent objective above individual cycles. The objective is immutable once set — a
clarification is appended, never substituted — and it needs success criteria, because a goal nobody
can judge completes by nobody disagreeing.

Each milestone is an ordinary governed cycle. Running one while a goal is focused links it
automatically. Completion is refused while any milestone is unfinished, and then asks you, against
your own criteria, and checks again when you answer.

---

## Watching a run

### `/cycle:status`

State, route, repair budget, task progress, and whether a candidate is frozen. If the workflow is
paused, it says why — a workflow paused because a provider stopped answering is waiting on the
provider, not on you.

### `/cycle:tasks`

The task breakdown: identifiers, states, titles, and the write scopes each task is authorized to
touch. The scopes are enforced, not suggested: after each task the control plane reads the worktree
itself and rejects the task if anything changed outside them.

### `/cycle:evidence`

The gates recorded against the frozen candidate — which ran, which passed, which are mandatory. A
mandatory gate that did not pass means no approval can deliver, whatever any role voted.

### `/cycle:history [verify]`

The append-only record of who did what and when. `verify` re-validates the hash chain and every
Ed25519 checkpoint signature. If the record was altered, it names the entry.

### `/cycle:memory search|explain|remove --confirm`

What the project learned from delivered work: what shipped and on which gates, which commands
actually verify it, and which approaches ran out of repair cycles. `remove` revokes an entry —
revokes, never deletes, so what the project used to believe stays answerable.

---

## Controlling a run

### `/cycle:pause`

Stops at the next safe boundary, keeping all state. Verification and delivery cannot be paused: a
gate interrupted half way proves nothing, and a delivery interrupted half way is the one state the
journal exists to finish rather than suspend.

A paused workflow holds no admission slot.

### `/cycle:resume`

Reconciles after a restart or an interruption: reports where the workflow stopped, finishes a
delivery a crash left half done, and says what happens next.

### `/cycle:retry`

Extends the repair budget of a blocked workflow by one cycle. A workflow blocks after its budget is
spent on the same candidate; all work is preserved.

### `/cycle:cancel --confirm`

Abandons the workflow. Terminal, and it asks first — the control plane refuses without an explicit
confirmation. Nothing in your working tree is reverted; the candidate was never promoted.

---

## Asking one role on its own

All five are advisory, read-only, and cannot approve or deliver. If a standalone role could approve,
invoking it directly would bypass the product.

| Command | What it does |
| --- | --- |
| `/cycle:architect` | Plans a change. Multi-turn, read-only |
| `/cycle:executor` | Feasibility: what a change would touch, what it depends on, what would verify it. A separate read-only agent — the standalone half cannot write, and there is no flag that changes that |
| `/cycle:review` | Independent functional review of work already done |
| `/cycle:security` | Independent security and architecture review |
| `/cycle:judge` | Readiness against your exact request, with the blockers. Never approves |

---

## Inspecting the installation

### `/cycle:setup`

First-run check and guided configuration: what the installation needs, what is missing, and which
settings are worth changing before the first run. It writes no configuration — it names the option
and you set it.

### `/cycle:doctor`

Runtime, storage, store schema, the code graph, per-role models, and anything that would silently
change how a workflow runs. It verifies the history chain and its signatures at the same time.

### `/cycle:models [role] [model]`

What each role actually resolved to, which provider path carries it, and whether the request is
billed to your subscription, to a credential in your environment, or to one your gateway holds.

Cycle names a model per role; what answers is your infrastructure. It never reads, stores or
transmits a credential. See `multi-provider.md` for per-role providers.

### `/cycle:permissions`

The immutable boundaries between the roles and the three layers that enforce them. There is no
setting that relaxes them.

### `/cycle:limits`

What Cycle may take from this machine, what the machine has right now, and why a workflow is waiting
instead of running.

### `/cycle:index [status|rebuild]`

The code graph: build, refresh or query it. Entirely local — no model is involved in parsing, and a
file whose bytes have not changed is never reparsed.

### `/cycle:export --confirm`

Exports the record — workflow state, the history with its chain verification, or the evidence
recorded against a candidate. Asks first, and is never automatic.

### `/cycle:help`

The complete command reference, one line each.

---

## Configuration

Role models, efforts, gate strictness and the repair budget live in the plugin's own configuration,
which Claude Code owns. Defaults inherit the session model, so Cycle works unconfigured.

| Setting | Default | What it changes |
| --- | --- | --- |
| Architect / executor / reviewer / arbiter / operator model | `inherit` (`haiku` for the operator) | which model that role runs on |
| Architect / executor / reviewer / arbiter effort | `high` (`low` for the operator) | how hard that role thinks |
| Gate strictness | `standard` | `strict` also fails on a skipped gate; `advisory` downgrades a missing required gate to a warning |
| Max repair cycles | `5` | how many rejections a workflow absorbs before it blocks |
| Data directory | platform default, outside the Claude Code installation | where the store, the signing key and the code graph live |

Assigning distinct models to the two reviewers and the arbiter is the single configuration change
worth making: three verdicts from one model are one opinion recorded three times.

---

## What Cycle never does

- It never reads, stores or transmits a provider credential, and never configures a gateway.
- It never writes durable state inside the Claude Code installation, so an application update
  cannot destroy your workflow state, history, memory or index.
- It never lets a role approve its own work, and no configuration changes that.
- It never delivers past a mandatory gate that did not pass, whatever any role voted.
- It never introduces an account, a dashboard or a network service.

## Removing it

Everything Cycle knows lives in one directory, reported by `/cycle:doctor` as the data directory.
Uninstalling the plugin removes its components; deleting that directory removes the rest. Nothing
is left anywhere else.
