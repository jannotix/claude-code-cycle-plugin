# Changelog

All notable changes to this project are recorded here. Versions follow
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.17] - 2026-08-29

### Fixed

- The quick route delivered without any check on where it landed. It has no architect and therefore
  no plan, and reconciliation returns early when a workflow has no task to reconcile against, so
  every path passed: the cheaper route was quietly the unchecked one. A read-only role now names the
  boundary before anything is written, the plane records it once and refuses to widen it, and a
  quick report that lands outside it is blocked exactly as it is on the full route.
- The advisor ran on the session model. Keyed under its own name it matched no configured role and
  was dispatched with no model or effort at all, while every other role obeyed the configuration.
- Continuous integration had never once succeeded. It ran every step in a `production/`
  subdirectory that does not exist in the published repository, so it failed in under thirty
  seconds without building or testing anything. Every step now runs at the root, the actions are
  pinned by digest rather than by a tag that moves, and a separate job loads the built runtime on
  the oldest Node the manifest declares.
- `engines` claimed Node 22, but the store is built on `node:sqlite`, which is unflagged only from
  22.13.0. The floor now says what the runtime actually needs, and the job above proves it.

### Changed

- The plugin is distributed as the packaged archive published with each release, verified by its
  SHA-256, rather than as a copy of the development repository. What the packaging check verifies
  and what an installation receives are now the same bytes.
- The README's links to the manual and the multi-provider guide are absolute. Documentation is
  deliberately kept out of the artifact, so relative links resolved to nothing for anyone reading
  the archive rather than the repository.
- The data directory option describes what the plugin does — a location outside anything the
  application manages, so a history of delivered work survives uninstalling it.
- The README installs the plugin as well as adding the marketplace, and states the platform
  guarantee that continuous integration actually proves.
- The security policy points at the changelog instead of naming a release that stops being current.

## [1.0.16] - 2026-08-29

### Fixed

- The counter behind that warning counted the option variables present, not the values in them. A
  host that resolves every option to an empty string therefore reported a full delivery, and the
  warning written to catch exactly this case stayed silent while five configured models were
  ignored. Delivery is now counted by the values that arrived, and the report distinguishes an
  install that was never configured from one whose values did not survive substitution, because the
  two need different remedies.
- The stale-configuration warning compared two figures that had both been rounded down to whole
  minutes, so during a server's first minute the comparison read `0 < 0` and the warning vanished
  at the moment a settings edit was freshest. It compares the instants now.

## [1.0.15] — 2026-08-28

### Added

- A run whose control plane received no plugin option at all says so, on the summary line every
  report quotes verbatim and in the run's own log. Five configured models were being ignored because
  the server serving that session had started before the options were set, and the only visible sign
  was `haiku` on the relay rows — which is that role's ordinary default, so it read as normal. Every
  role inheriting is a legitimate choice on an unconfigured install and a delivery failure on a
  configured one; the plane counts the options that reached it, so it can tell the two apart and now
  does, naming the remedy, which is a restart.

## [1.0.14] — 2026-08-28

### Fixed

- An arbiter was sent to judge with empty hands. The call that fetches the recorded evidence and the
  requirement identifiers is a pure read, but it was not among the retryable operations, so a lost
  reply became `[]` rather than a second attempt — and `recorded?.evidence ?? []` cannot tell a
  candidate with no evidence from a read that failed. The arbiter said so in its own finding, "no
  recorded evidence or reviews were supplied", approved work the security reviewer had rejected, and
  had its verdict refused for citing no requirements. The read is retried now, and a read that never
  comes back pauses the run instead of judging without it.

## [1.0.13] — 2026-08-28

### Fixed

- Every reply from the control plane was passing through a schema that listed the fields a reply
  might carry, and a schema that lists fields is a filter. Anything the plane learned to return after
  that list was written was dropped on the way back: the per-role models, the capture capabilities
  issued to reviewers, and the summary line. Three fixes that passed their tests therefore did
  nothing in a real run, because the tests stub the relay and never meet the schema. A relay now
  copies the plane's answer as one string and the run parses it, so no field can be filtered out and
  a copy that will not parse reads as a lost reply, which the run already knows how to survive.
- The dispatch harness stubbed the relay by handing back the plane's object directly, which is a
  transport nobody has. It can now shape a reply the way a schema does, so a field the relay would
  have dropped fails a test instead of shipping.

## [1.0.12] — 2026-08-28

### Fixed

- A resumed run restarted at execution with its reviewers unreachable. The reply to `start` reaches
  the run through a relay agent, and one came back saying `state: "workflow_started"` — a state the
  control plane has never been in — with `mode` missing altogether. `RANK` has no such stage, so the
  run resumed at execution against tasks already completed, and an absent `mode` read as "not the
  full route", so the two independent reviewers were never dispatched and a frozen, verified
  candidate sat in `independent_reviews` while the plane refused the duplicate task reports. The
  stage and the route are now read back from the plane, which is the rule this codebase already
  wrote down for the relay and had applied everywhere except the reply that decides both.
- A request that is really an argument list is refused. A caller passed
  `request="add a discount..." workflowId="..."` where the request belongs, which opened a second
  workflow on a mangled sentence, orphaned the real one, and would have had the arbiter judge the
  delivered work against the serialisation.

### Added

- A CycloneDX bill of materials, generated from what is really in `vendor/` rather than from a list
  kept beside it, shipped with the artifact and checked by `npm run check`. A grammar added without
  its attribution fails the build instead of shipping unlisted.
- A CI workflow that proves what can be proved without a Claude Code installation or model spend:
  types, suite, artifact, and that the artifact carries its licences and no tests.

## [1.0.11] — 2026-08-28

### Fixed

- A governed run stopped at its first line whenever the reply to `start` came back without the
  workflow identifier. The control plane had started the workflow and recorded it; the run refused
  to continue without an id, correctly, and ended — leaving a workflow nobody was driving and a
  caller with nothing to report but its own impression. Every attempt to certify a complete cycle
  hit this. The identifier is now read back from the plane when the reply lacks it, which is the
  strategy already recorded for the relay's unreliability, applied to the one reply that had been
  exempt from it.

### Added

- `status` returns a `summary` line built from the record — route, state, tasks completed, reviews,
  arbitrations, repair budget, and whether anything was delivered — and the reporting skills quote
  it verbatim. A run stopped in delivery on the quick route with no reviews had been reported as
  "completed, full cycle, seven agents"; the plane cannot stop a caller paraphrasing, but it can
  hand it a sentence that is either quoted exactly or visibly not quoted at all.
- The role guard counts whether it could attribute a role, and `/cycle:doctor` reports a long run of
  calls with none recognised. The second of the three separation layers reads fields the host
  supplies; if those are renamed it recognises nothing and stops being a boundary without failing.
  Two integers, no paths and no payload content, are enough to make that silence visible.

## [1.0.10] — 2026-08-27

### Fixed

- The interface layer's proof could be supplied by anyone who said they were a reviewer. The role
  was read from the submission's own arguments, and over stdio the control plane has no notion of
  who is calling, so the party a gate exists to check could clear it by naming a role it did not
  hold. Freezing a candidate now mints one single-use secret per reviewing role; the run hands each
  to that role alone, and the plane reads the role from the secret that was spent. A submission
  without one is recorded as a self-report and carries no weight.
- The published tool schema declared `additionalProperties: false` while the handler read a
  property the schema did not list, so a client validating strictly would have rejected the call
  the fix depended on.

### Changed

- `SECURITY.md` and `README.md` stated that security proofs run with the network denied. Environment
  variables deny it to every client that honours them and to nothing else, and there is no
  operating-system sandbox. Both now say what containment exists and what it does not cover.

## [1.0.9] — 2026-08-27

### Fixed

- A candidate could be delivered onto a base revision it was never judged against. Promotion
  compared the working tree alone, so a commit landing between approval and promotion left every
  file identical while moving the base, and the delivered commit's `Base-revision` trailer then
  named a revision that was not its parent.
- A file above the hashing cap was recorded with no digest, and the integrity gate compared two
  absent digests and called them a match. Hashing streams now, so size no longer leaves a candidate
  file unbound to its bytes.
- The secret scanner counted files it had skipped among the files it reported as scanned.
- A transient git failure was read as an empty change set, so a task with writes outside its
  authorized scopes could report as completed with the scope reconciliation never running.
- The executor's own browser capture satisfied the interface layer it was supposed to prove.

### Added

- `security_proofs`, off by default. A proof executes code with this account's privileges and no
  operating-system sandbox, so it is enabled deliberately rather than acquired by installing a
  plugin. With it off an undemonstrated critical is downgraded, as the gate rules already provided.
- A proof's environment is reduced to what an interpreter needs to start, and its output is redacted
  for secret shapes before it is recorded or returned.

## [1.0.8] — 2026-08-26

### Fixed

- No role ran on its configured model. The run took them from an argument the launching skill was
  told to assemble, and an absent map was indistinguishable from a user choosing to inherit, so
  every role silently used the session model. `start` now states each role's model and effort, and
  the run resolves from that answer.
- Routing scored paths against a list no caller ever supplied, so the migration, packaging,
  deployment, dependency and CI rules could never fire. Paths named in the request are read now.
- Critical markers were English only, so a payment or authentication change described in another
  language took the quick route with no independent review.

## [1.0.7] — 2026-08-26

### Fixed

- Every role answered in English whatever language the user wrote in. Nothing in the plugin named
  the user's language — not a skill, not a prompt, not an agent — so each role answered in the
  language of its own prompt, and a user writing Italian got an English plan, English findings and
  an English verdict.

  The request is the user's own words and says which language they read, so the five cycle roles and
  the five advisory ones are now told to write their prose in it. The contract is explicitly
  excluded: decisions, statuses, requirement identifiers, task keys, gate names and JSON field names
  are parsed by the control plane and refused when they change, so they stay as specified.

  The reporting skills report in the user's language too. Where one is told to state something
  verbatim it still quotes it verbatim and then says what it means — that rule exists so a diagnosis
  cannot be softened into something milder, not to make it unreadable.

## [1.0.6] — 2026-08-26

### Fixed

- A repair was never told what was wrong with the candidate it was repairing. The reviewers wrote
  findings, the control plane refused delivery over them — it refuses an approval outright while a
  reviewer has rejected — and then the workflow returned to execution and dispatched the executor
  with a prompt identical to its first attempt. The architect replanned the same way. Every repair
  cycle rediscovered the finding or missed it, and the budget paid for the rediscovery.

  `status` now carries what the last refusal said, by the role that said it, and both the executor
  and the architect receive it. Reviews that approved are left out: an approval names nothing to
  fix. It is handed over as data to address, not as instructions to follow, and a finding outside a
  task's write scopes still belongs to whichever task owns those paths.

  The arbiter still does not see the reviews. That is deliberate — its prompt says the original
  request is authoritative, "not the plan, not either review" — and the reviewers' veto is enforced
  by the control plane rather than by its deference.

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
