# Cycle

Evidence-gated delivery for Claude Code.

Cycle replaces the single agent that plans, implements and then approves its own work with five
separated roles: an architect, an executor, two independent reviewers in isolated sessions, and a
final arbiter that judges against **your original request** — not the architect's summary of it.
A candidate is delivered only when the arbiter approves it. A rejected candidate goes back for
repair, up to five cycles.

> **Status: in development.** Version 1.0.0 is not released. Installation is not supported until the
> Windows and WSL certification matrix passes.

## The problem

A coding agent that plans, writes and reviews inside one context inherits the same blind spots at
every step, and then decides for itself that the work is done. The result is familiar:

- an endpoint with no interface that reaches it
- a migration written but never run against a real database
- tests that cover a mock while the real integration stays broken
- a control implemented on one path and bypassed on another
- a package that passes its tests but cannot be installed

Cycle does not make a model smarter. It makes an unverified claim of completion fail.

## How it works

```
your request  ──▶  architect      plan, task graph, write scopes
                   executor       one bounded task at a time
                   verification   the project's real gates, plus the ones it is missing
                   reviewers      completeness · security, independently, in separate sessions
                   arbiter        judges the frozen candidate against your original request
                   delivery       the exact approved bytes, re-verified
```

Change the UI with no browser flow to prove it works, add a dependency with no vulnerability audit,
add a migration with no real database test — the gate is missing, so the gate fails. That is the
mechanism.

Interface changes are also inspected by detectors that read bytes: contrast ratios, type size, focus
visibility, keyboard reachability, motion, breakpoints, element nesting, missing error states, and
the accessibility tree of the flow that was actually driven. No model is involved, so they cost
nothing and say the same thing twice in a row.

A security reviewer cannot report a vulnerability it did not demonstrate. It writes a proof, the
control plane runs it against a disposable copy of the candidate with no network and a hard timeout,
and the copy is deleted. A proof that works is recorded as a failing gate, and no approval by
anybody can deliver past it. A suspicion nobody proved is recorded as a suspicion.

## What is delivered

A candidate is frozen byte for byte before the gates run: the commit it sits on, every changed path
with the digest of its bytes, and those bytes themselves. Delivery compares the working tree against
that record, writes the approved bytes back, verifies every digest again, and commits exactly those
paths. A file somebody edited after the approval stops the delivery; a file that was lost is
restored. Every step goes through a journal, so a delivery interrupted by a crash is finished rather
than guessed at, and never committed twice.

The commit subject is your request, in your words. Its trailers carry the base revision, the
candidate digest and the workflow, so a year later the commit still says what it was approved on.
Repository hooks are disabled for it: a hook that reformats would change the bytes an arbiter
approved, after they were verified. Your hooks run when you push.

## Separation of powers, three times

The executor is the only role that modifies files, and only inside the write scopes its task
declares. That is enforced three times, independently: each read-only role declares the writing
tools away; a `PreToolUse` hook denies a write, a subtask or a history-rewriting git call at
runtime; and after every task the control plane reads the worktree itself and rejects the task if
anything changed outside what the plan authorized. The executor's account of what it did is never
the record of what it did.

`/cycle:permissions` reports the boundaries. There is no setting that relaxes them.

## The record

Every decision is appended to a hash chain, and checkpoints are signed with a key that never leaves
your machine. `/cycle:history verify` re-validates the chain and every signature; `/cycle:doctor`
does it at startup. If the record was altered, it says so and names the entry.

## Work that spans more than one change

A goal holds an objective across sessions. The objective is immutable once set — a clarification is
appended, never substituted — and it needs success criteria, because a goal nobody can judge
completes by nobody disagreeing.

Each milestone is an ordinary governed cycle. Running one while a goal is focused links it
automatically, and delivering it continues the goal; five continuations by default, after which the
goal blocks and waits for you rather than running on. Completion is two steps: Cycle refuses to even
request it while any milestone is unfinished, and then asks you, against your own criteria. It
checks again when you answer.

## What the project learns

Delivering teaches Cycle three things about your project: what shipped and on which gates, which
commands actually verify it, and which approaches ran out of repair cycles. Nothing else is written,
and no role writes any of it — a role that could write to long-term memory could convince the next
cycle of something no evidence supports.

The architect and the executor are handed a compact index on every run: identifier, kind,
confidence, scope. They fetch the detail of the few entries that bear on the change, and none of the
rest. An entry marked `verified` names the gates that earned it. `/cycle:memory` searches it, and
revokes an entry when it stops being true — revokes, never deletes, so what the project used to
believe stays answerable.

## Model independence

Every role reads its model from your configuration. Defaults inherit the session model, so Cycle
works unconfigured, and you differentiate only when you want to. Assigning distinct models to the
reviewers and the arbiter makes three verdicts genuinely independent instead of one model agreeing
with itself three times.

Different **providers** per role need an LLM gateway of your own, because Claude Code subagents
inherit the session provider. Cycle names a model per role; what answers is your infrastructure.
`/cycle:models` reports what each role resolved to, which provider path carries it and what is
billed — subscription or a credential — so five verdicts are never assumed to be independent when
one model produced all five. [docs/multi-provider.md](docs/multi-provider.md) is a placeholder guide
to setting that up.

Cycle never reads, stores or transmits a provider credential. It never configures a gateway, and it
never asks for a key.

## Commands

Every operation runs automatically when its preconditions are met. These exist for inspection,
control and recovery.

| Command | Purpose |
| --- | --- |
| `/cycle:doctor` | Installation, storage, store, role models, and anything that silently changes how the workflow runs |
| `/cycle:architect` | Plan a change with the architect. Read-only, multi-turn |
| `/cycle:executor` | Feasibility analysis: scopes, dependencies, verification needs. Never writes |
| `/cycle:review` | Independent functional review of work already done |
| `/cycle:security` | Independent security and architecture review |
| `/cycle:judge` | Readiness assessment against your original request |
| `/cycle:index` | Build, refresh or query the code graph. Local, no model calls |
| `/cycle:run` | Run the governed cycle on a change |
| `/cycle:resume` | Reconcile after a restart: where the workflow stopped, and what happens next |
| `/cycle:history` | Read the append-only record, or verify its chain and signatures |
| `/cycle:memory` | What this project learned from delivered work, and what it stopped believing |
| `/cycle:goal` | A persistent objective across several cycles, with a completion gate |
| `/cycle:limits` | What Cycle may take from this machine, and why something is waiting |
| `/cycle:models` | What each role actually runs on, which provider carries it, and what pays |
| `/cycle:permissions` | The immutable boundaries between the roles |
| `/cycle:status` | Where the run is, and why it is standing still if it is |
| `/cycle:tasks` | The task breakdown and the scopes each task may touch |
| `/cycle:evidence` | The gates recorded against the frozen candidate |
| `/cycle:pause` · `/cycle:retry` · `/cycle:cancel` | Stop at a safe boundary, extend a spent repair budget, or abandon the run |
| `/cycle:setup` · `/cycle:help` | First-run check, and the complete command reference |
| `/cycle:export` | Export state, history or evidence. Asks first |

The five role commands are **advisory**. None of them can approve or deliver: that happens only
inside a governed cycle, with a frozen candidate, real evidence and an independent arbiter. If a
readiness check could approve, calling it directly would bypass the product.

Every command is documented in [docs/manual.md](docs/manual.md).

## Code graph

Cycle builds an incremental semantic graph of the project with tree-sitter, entirely locally. No
model is involved in parsing, and a file whose bytes have not changed is never reparsed.

Twelve grammars ship with the plugin: TypeScript, TSX, JavaScript, Python, Go, Rust, Java, C#, C and
C++, Ruby, PHP, CSS. A file in any other language is still tracked by digest, so changes to it are
noticed; it simply contributes no symbols.

Every edge carries its confidence. `extracted` was read from the syntax tree or a resolved import.
`inferred` means a name matched a single definition with no import to confirm it. A call whose name
matches several unrelated files produces no edge at all: precision over recall, because a call graph
that links every same-named symbol is noise.

## What it takes from your machine

Cycle governs how many workflows are active at once and leases each one a slot for fifteen seconds
at a time. A session that dies renews nothing, so its slot comes back on its own.

Memory below 1 GiB free, disk below 2 GiB free or CPU above 85 % defers new work — and so does a
metric that could not be read at all, because unknown must never be treated as healthy. Two projects
contending for four slots get two each; one project working alone gets all four. After a pressured
reading the machine is left to recover rather than immediately refilled.

Indexing is background work and verification is not: a candidate waiting on its gates gets the
machine, and the index continues from exactly where it stopped.

## Requirements

- Claude Code
- Node 22 or later
- Git
- The project's own build, test and verification tools

## License

Copyright 2026 Gianluca Iannotta.

Each released version is licensed under FSL-1.1-MIT and becomes available under the MIT License on
the second anniversary of that version's release date. This is Fair Source software and is not
OSI-approved open source during the initial two-year period. See [LICENSE](LICENSE).

Cycle is an independent integration. It is not affiliated with, sponsored by or endorsed by
Anthropic.
