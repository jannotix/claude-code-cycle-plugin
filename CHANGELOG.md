# Changelog

All notable changes to this project are recorded here. Versions follow
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.5] — 2026-08-26

### Added

- The report says how long the answering process has been up. The configuration reaches a server
  once, in the environment it is given at spawn, so a process older than the last change to that
  configuration is reporting what was true when it started — correctly, and misleadingly.

  The row is a value — minutes — and the judgement is a finding that fires only when the settings
  file is newer than the process. A caller reading the first draft said the sentence in the value
  column "reads like injected text riding along in the tool output", which is the same objection
  that removed the `instruction` field in 1.0.1, and it was right twice.

  The version had been standing in for this. It was read as proof of a stale process while it was
  itself stale, and then, once it was accurate, as proof the process was fresh. Two opposite
  conclusions from a field that answers which build is running and nothing about when. Both times
  the reader went looking for a delivery bug on a machine where delivery was working.

## [1.0.3] — 2026-08-26

### Fixed

- The doctor reported the version from a literal in the server, and three releases bumped the
  manifest without it. It said `Cycle 1.0.0` while 1.0.2 was running — and that was read as proof
  that a stale process was answering, which sent the reader looking for a configuration-delivery
  bug that did not exist. The version is now read from the manifest, and reports `unknown` rather
  than a number it cannot confirm. A test compares the two, because the assertion that should have
  caught this was pinned to the same stale literal.

## [1.0.2] — 2026-08-26

### Fixed

- The code graph was built, exposed as a tool and documented, and no role was ever told it exists.
  Nothing failed: the architect planned, the executor wrote and both reviewers judged by reading
  files they could have asked about, and a capability that ships with twelve grammars sat
  unreachable from inside the cycle. All four now carry the query surface, each with the question
  its own role asks — what already exists before building it, what the paths about to be written
  reach, what a change to the candidate breaks, and where a trust boundary actually sits.

  They are told to call `status` first. A project that was never indexed answers zero, and a role
  that trusted an empty answer would read nothing into it and call it nothing there.

## [1.0.1] — 2026-08-26

### Fixed

- The advisory commands could not honour a per-role model. They dispatch through the host's Agent
  tool, which takes a family alias — `sonnet`, `opus`, `haiku`, `fable` — and refuses a model
  identifier, so the caller improvised: one run dropped the model and used the session default,
  another reduced it. `role_settings` now returns the alias the tool accepts, and the skills pass
  that rather than inventing one.
- `role_settings` returned an `instruction` field reading "Invoke the agent with model X". An
  imperative sentence inside tool output is indistinguishable from an injection riding in data, and
  a caller that guards against that refused it — discarding the model beside it and running the role
  on the session default without a trace. The tool returns data only; the skills hold the
  instruction.

### Known limitation

Four aliases is the ceiling on how many distinct models the advisory commands can reach, and models
in one family cannot be told apart. A configuration of `claude-opus-4-7`, `claude-opus-4-8` and
`claude-opus-5` for the two reviewers and the arbiter reaches the Agent tool as `opus` three times:
three of the five judging voices become one. `/cycle:doctor` now names this rather than reporting
five distinct models and leaving it to be discovered.

`/cycle:run` dispatches through the workflow runtime with the identifier as configured. Whether that
runtime honours it is not established: a deliberately invalid identifier produced a plan and raised
nothing, so a model that was never applied cannot be told from one that was.

## [1.0.0] — 2026-08-25

First release. Every certification row applicable to Windows 11 and to Ubuntu 24.04 under WSL2
passes, including the rows that can only be checked by hand.

### Added

- Five separated roles — architect, executor, functional reviewer, security reviewer, arbiter —
  with separation of powers enforced at three independent layers.
- The immutable original request, carried intact to the arbiter and held by a database trigger that
  refuses to rewrite it.
- Evidence engine: gates discovered from the project, and mandatory gates inserted where a change
  touches a layer that has no proof for it.
- Deterministic design gates and a security gate that requires an executed proof.
- Byte-exact candidate freeze and re-verified delivery.
- Incremental semantic code graph over twelve languages, built locally with no model calls.
- Evidence-linked project memory with two-level retrieval.
- Append-only project history with a hash chain and signed checkpoints.
- Multi-milestone Goal Mode with completion gates.
- Admission control with memory, CPU and disk monitoring.
- Per-role model and effort configuration, defaulting to the session model.

### Verified

Certification runs on Windows 11 and Ubuntu 24.04 under WSL2, against the installed artifact rather
than the source tree. The governed cycle was exercised end to end with five distinct models, one per
role, all on the Anthropic API:

| Role | Model |
| --- | --- |
| architect | `claude-opus-5` |
| executor | `claude-sonnet-5` |
| functional reviewer | `claude-opus-4-7` |
| security reviewer | `claude-opus-4-8` |
| arbiter | `claude-fable-5` |
| operator | `haiku` |

On Windows the two reviewers reached different verdicts on the same frozen candidate — the
functional reviewer approved, the security reviewer refused — and the arbiter upheld the refusal.
One repair cycle later both approved and the change was delivered, taking a fixture from one passing
test to six. That disagreement is the reason the roles are separated, and it is unlikely to occur
when one model fills them all.

On WSL the same request was delivered without spending a repair cycle: both reviewers approved, the
arbiter approved, and the fixture went from one passing test to eight.

Scale was measured on a generated 500,000-file corpus: a first index of 1,000,000 nodes and 500,000
edges, and a delta after one changed file that reparses exactly that file.

### Not verified

**Per-role providers.** Naming a different provider for each role requires an LLM gateway that the
user runs, holds credentials for, and configures. The project deliberately owns none of that: it
holds no credential, configures no endpoint, and has nothing of its own to test against. The four
certification rows covering gateway-routed billing, cross-provider structured output and effort
propagation are therefore out of scope for this release, and the first person to exercise that path
will be the first to exercise it.

What the plugin itself contributes to the arrangement is verified: naming a provider per role,
reporting what each role resolved to and what pays for it, refusing a model no configured endpoint
can serve, and working correctly with no gateway at all.

[docs/multi-provider.md](docs/multi-provider.md) works a concrete LiteLLM setup through, with
placeholders only.
