# Certification Matrix

Every row must pass on **Windows x64** and **WSL** before anything is pushed to the public
repository. A row that cannot be automated is executed manually and its result recorded with date,
platform and plugin version.

Legend: `A` automated in CI, `M` manual, `—` not applicable to that platform.

---

## 1. Installation and removal

| # | Check | Win | WSL |
| --- | --- | --- | --- |
| 1.1 | Loads with `--plugin-dir` against the source tree | A | A |
| 1.2 | Loads from a packed `.zip` archive | A | A |
| 1.3 | Installs from a local marketplace | A | A |
| 1.4 | Every agent in the tree is resolved as a custom agent | A | A |
| 1.5 | Every skill in the tree is resolved under the plugin namespace | A | A |
| 1.6 | No entries for Cycle in the `/plugin` errors tab, seen in the application | M | M |
| 1.7 | `/reload-plugins` applies component changes without restart | M | M |
| 1.8 | Uninstall removes all components; no residue outside the data directory | A | A |
| 1.9 | Data directory documented and removable by the user | A | A |
| 1.10 | Reinstall over an existing data directory preserves state | A | A |
| 1.11 | Nothing written inside the Claude Code installation directory | A | A |
| 1.12 | State survives a simulated Claude Code version change | A | A |
| 1.13 | `claude plugin validate` passes with no warnings | A | A |
| 1.14 | The installed copy starts its server and every component validates strictly | A | A |

1.8, 1.9, 1.11 and 1.12 are automated in `tests-debug/install.mjs`, which also checks that every
component the manifest declares exists and parses.

1.1, 1.2 and 1.13 need the Claude Code CLI and a packaged artifact. Neither exists yet: packaging is
Phase 15. They are left open rather than approximated, because a structural check that passed
without ever loading the plugin would be a green row that proves nothing.

## 2. Configuration

| # | Check | Win | WSL |
| --- | --- | --- | --- |
| 2.1 | Plugin works with no configuration; every role inherits the session model | A | A |
| 2.2 | `userConfig` prompts for its values on enable, seen in the application | M | M |
| 2.3 | Per-role model assignment is honoured by the workflow | A | A |
| 2.4 | Per-role effort is honoured | A | A |
| 2.5 | Changing the session model does not change role assignments | A | A |
| 2.6 | `CLAUDE_CODE_SUBAGENT_MODEL` override is detected and reported | A | A |
| 2.7 | `availableModels` substitution is detected and reported | A | A |
| 2.8 | Reviewer/arbiter model correlation warning fires | A | A |
| 2.9 | Invalid model string is rejected with an actionable message | A | A |
| 2.10 | Configured values outlive the process that wrote them | A | A |

## 3. Commands

Each command is exercised on the happy path, on its error path, and with missing preconditions.

| # | Command group | Win | WSL |
| --- | --- | --- | --- |
| 3.1 | `setup`, `doctor`, `help` | A | A |
| 3.2 | `run` in `auto`, `quick`, `full` | A | A |
| 3.3 | `status`, `tasks`, `evidence` | A | A |
| 3.4 | `pause`, `resume`, `cancel --confirm`, `retry` | A | A |
| 3.5 | `architect`, `executor`, `review`, `security`, `judge` | M | M |
| 3.6 | `goal` — new, list, focus, plan, link, status, complete | A | A |
| 3.7 | `history`, `history verify` | A | A |
| 3.8 | `memory` — search, explain, remove --confirm | A | A |
| 3.9 | `index` — status, rebuild | A | A |
| 3.10 | `models`, `permissions`, `limits` | A | A |
| 3.11 | `export --confirm` | A | A |
| 3.12 | Confirmation-gated commands refuse without confirmation | A | A |
| 3.13 | Every command in the manual exists; every command exists in the manual | A | A |

## 4. Complete autonomous cycles

Run against fixture projects, one per ecosystem.

| # | Scenario | Expected | Win | WSL |
| --- | --- | --- | --- | --- |
| 4.1 | Quick cycle, localised change | delivered, evidence recorded | A | A |
| 4.2 | Full cycle, cross-layer change | delivered after both reviews and arbitration | A | A |
| 4.3 | Arbiter rejects, executor repairs, second cycle passes | delivered, two cycles recorded | A | A |
| 4.4 | Five consecutive rejections | blocked, state preserved, resumable | A | A |
| 4.5 | Architecture defect during execution | replans, does not consume the execution budget twice | A | A |
| 4.6 | Cancel mid-execution | role sessions aborted, no partial delivery | A | A |
| 4.7 | Application closed mid-cycle, reopened | `/cycle:resume` reattaches at the correct stage | M | M |
| 4.8 | Goal with two milestones | both workflows linked, completion gate enforced | A | A |
| 4.9 | Goal completion attempted with an incomplete workflow | refused | A | A |
| 4.10 | Concurrent workflows in two projects | both governed, no state crossover | A | A |

## 5. Evidence engine

The rejection cases are the product. Each must fail closed.

| # | Scenario | Expected | Win | WSL |
| --- | --- | --- | --- | --- |
| 5.1 | UI change, no browser flow available | rejected: `browser:affected-user-flow` | A | A |
| 5.2 | UI change, no accessibility check | rejected: `accessibility:affected-user-flow` | A | A |
| 5.3 | Dependency change, no vulnerability audit | rejected: `security:dependency-vulnerability` | A | A |
| 5.4 | Dependency change, no license check | rejected: `security:dependency-license` | A | A |
| 5.5 | Migration added, no real database test | rejected: `database:real-integration` | A | A |
| 5.6 | Packaging change, no artifact check | rejected: `package:production-artifact` | A | A |
| 5.7 | Secret introduced in changed content | rejected by secret scan | A | A |
| 5.8 | Gate discovery, Node project | scripts detected, correct package manager | A | A |
| 5.9 | Gate discovery, Rust project | fmt, clippy, test detected | A | A |
| 5.10 | Gate discovery, Python project | pytest, ruff, mypy detected | A | A |
| 5.11 | Gate discovery, Go project | build, vet, test detected | A | A |
| 5.12 | Command containing a shell operator | rejected at plan validation | A | A |
| 5.13 | Blocked program in a verification command | rejected at plan validation | A | A |
| 5.14 | `npm`/`bun` shim resolution without a shell | executes correctly | A | — |
| 5.15 | Gate exceeding its timeout | terminated, recorded as failed | A | A |
| 5.16 | Output beyond the retention cap | truncated, digest covers full output | A | A |
| 5.17 | `advisory` strictness downgrades required-missing gates | warning, not failure | A | A |
| 5.18 | Essentiality gate flags a reimplemented existing capability | finding raised | A | A |
| 5.19 | Design detectors run without model calls | zero tokens consumed | A | A |
| 5.20 | Security finding without an executed proof | reported as info, not critical | A | A |
| 5.21 | Security proof runs contained; artifacts discarded | proof recorded, never promoted | A | A |
| 5.22 | A layer the change reaches but does not touch | that layer's gate is inserted | A | A |
| 5.23 | Reach that cannot be resolved | recorded as evidence; mandatory only under `strict` | A | A |
| 5.24 | Change to a symbol with many consumers | reported as a finding, not expanded into gates | A | A |

## 6. Separation of powers

| # | Scenario | Expected | Win | WSL |
| --- | --- | --- | --- | --- |
| 6.1 | Architect attempts a write | denied at the hook layer | A | A |
| 6.2 | Reviewer attempts a write | denied at the hook layer | A | A |
| 6.3 | Arbiter attempts a write | denied at the hook layer | A | A |
| 6.4 | Executor writes outside its declared scope | task rejected at reconciliation | A | A |
| 6.5 | Executor attempts a commit, branch change or reset | denied | A | A |
| 6.6 | Any role attempts to spawn a subtask | denied | A | A |
| 6.7 | Standalone judge attempts to approve | refused; readiness report only | A | A |
| 6.8 | Standalone executor attempts to write | refused; feasibility only | A | A |
| 6.9 | Reviewer output referencing an unknown evidence id | rejected, retried | A | A |
| 6.10 | Arbiter verdict missing a requirement | rejected, retried | A | A |
| 6.11 | Arbiter verdict deciding a requirement twice | rejected, retried | A | A |
| 6.12 | Arbiter receives the original request, not the architect summary | asserted in the prompt payload | A | A |

6.1, 6.2, 6.3, 6.5 and 6.6 are the runtime layer, automated in `tests/hook-guard.test.ts` against
the shipped `hooks/guard.mjs`. 6.4 is the reconciliation layer, in `tests/workflow-service.test.ts`
and end to end through the real server in `tests-debug/cycle-e2e.mjs`. 6.8 is the declaration layer:
the standalone executor is a separate agent that declares the writing tools away, asserted in
`tests/roles.test.ts` against the agent file that actually ships.

## 7. Integrity, history and recovery

| # | Scenario | Expected | Win | WSL |
| --- | --- | --- | --- | --- |
| 7.1 | Candidate mutated between freeze and verification | aborted: candidate changed | A | A |
| 7.2 | Candidate mutated between approval and delivery | aborted before promotion | A | A |
| 7.3 | Delivered bytes match approved bytes exactly | asserted | A | A |
| 7.4 | Control plane killed mid-delivery | journal recovers, no partial write | A | A |
| 7.5 | History chain verifies after a hard kill | chain and signatures valid | A | A |
| 7.6 | Tampered history entry | verification fails at the correct sequence | A | A |
| 7.7 | Signing key permissions restricted | asserted (ACL on Windows) | A | A |
| 7.8 | Secrets redacted before history and memory writes | asserted | A | A |
| 7.9 | Store newer than the plugin | opens read-only, safe mode reported | A | A |
| 7.10 | Attribution recorded for every workflow action | actor, timestamp, role, files | A | A |

## 8. Code intelligence

| # | Scenario | Expected | Win | WSL |
| --- | --- | --- | --- | --- |
| 8.1 | First index on a fixture repository | completes, resumable if interrupted | A | A |
| 8.2 | Reindex after one file changes | only that file reparsed | A | A |
| 8.3 | Ignored paths never parsed | asserted | A | A |
| 8.4 | Scoped query returns a budgeted bundle | truncation reported | A | A |
| 8.5 | Edge confidence recorded as extracted or inferred | asserted | A | A |
| 8.6 | Indexing yields while verification is pending | asserted | A | A |
| 8.7 | 500,000-file corpus | first index completes in background; delta reindex bounded | M | M |
| 8.8 | Git refuses to list the project | index refused with the reason; the existing graph survives | A | A |

## 9. Memory

| # | Scenario | Expected | Win | WSL |
| --- | --- | --- | --- | --- |
| 9.1 | Memory requires a source event and a scope | rejected otherwise | A | A |
| 9.2 | `verified` confidence requires passed-gate evidence | rejected otherwise | A | A |
| 9.3 | Two-level retrieval returns a compact index first | token cost bounded | A | A |
| 9.4 | Superseding preserves the previous entry | chain queryable | A | A |
| 9.5 | Secret-bearing content rejected | asserted | A | A |

## 10. Resource governance

| # | Scenario | Expected | Win | WSL |
| --- | --- | --- | --- | --- |
| 10.1 | 100 registered workflows across projects | all governed, state intact | A | A |
| 10.2 | Memory below reserve | admission deferred | A | A |
| 10.3 | Disk below reserve | admission deferred | A | A |
| 10.4 | CPU above ceiling | admission deferred | A | A |
| 10.5 | Metrics unavailable | admission deferred, never assumed healthy | A | A |
| 10.6 | Fair rotation across projects | no project starves | A | A |
| 10.7 | Lease expiry releases the slot | asserted | A | A |
| 10.8 | Store usage and pruning | bytes of finished candidates released; every record and digest kept | A | A |

## 11. Multi-provider

| # | Scenario | Expected | Win | WSL |
| --- | --- | --- | --- | --- |
| 11.1 | Anthropic request through the gateway | billed to the subscription, not an API credential | — | — |
| 11.2 | Codex-routed request | billed to the ChatGPT plan | — | — |
| 11.3 | Each of five roles resolves to a distinct provider | asserted by doctor | A | A |
| 11.4 | Provider unreachable mid-cycle | classified failure, workflow recoverable | A | A |
| 11.5 | Structured output survives cross-provider translation | verdicts validate | — | — |
| 11.6 | Effort parameter reaches non-Anthropic providers | asserted or reported unsupported | — | — |
| 11.7 | Gateway absent | plugin works on the session model, no error | A | A |
| 11.8 | Provider-prefixed model with no gateway | reported as unroutable, not left to fail later | A | A |
| 11.9 | Credential variable set | reported: the subscription is not paying | A | A |

Rows 11.1, 11.2, 11.5 and 11.6 are out of scope for this release. They exercise a gateway routing
several providers, which is infrastructure the user supplies and the project deliberately never
owns: it holds no credential, configures no endpoint, and has nothing to test against. What the
plugin itself contributes to that arrangement — naming a provider per role, reporting what each role
resolved to and what pays, refusing a model no configured endpoint can serve, and working correctly
with no gateway at all — is covered by 11.3, 11.4, 11.7, 11.8 and 11.9, all automated and passing.

11.3, 11.7, 11.8 and 11.9 are automated in `tests/providers.test.ts` and `tests/diagnostics.test.ts`:
what is asserted is that doctor derives and reports the provider path correctly. Confirming that a
live gateway then routes and bills as reported is 11.1, 11.2, 11.5 and 11.6, which remain manual
because only the user's own accounts can show what was billed.

11.4 is automated in `tests/workflow-service.test.ts` for the control plane and in
`tests-debug/provider-failure.mjs` for the run itself, which drives the real workflow script against
the real control plane with one role's provider taken away.

## 12. Platform specifics

| # | Check | Win | WSL |
| --- | --- | --- | --- |
| 12.1 | Paths containing spaces | A | A |
| 12.2 | Paths exceeding 260 characters | A | — |
| 12.3 | Case-insensitive scope matching | A | — |
| 12.4 | `core.autocrlf` does not alter diff digests | A | A |
| 12.5 | Signing key ACL restriction | A | — |
| 12.6 | POSIX permission restriction | — | A |
| 12.7 | Worktree on a Windows-mounted path | documented as discouraged, still correct | — | A |
| 12.8 | Independent installation from the Windows one | A | A |
| 12.9 | Node version parity between platforms | A | A |

## 13. Packaging

| # | Check | Win | WSL |
| --- | --- | --- | --- |
| 13.1 | Artifact contains no tests, fixtures, docs or debug output | A | A |
| 13.2 | Artifact contains no source maps or development configuration | A | A |
| 13.3 | Excluded pattern present in artifact fails the build | A | A |
| 13.4 | No credential, endpoint or personal configuration in the repository | A | A |
| 13.5 | License, notice and non-affiliation statement present | A | A |
| 13.6 | Installed artifact runs a complete cycle, full route | M | M |

13.4 and 13.5 are automated in `tests-debug/install.mjs`. 13.1, 13.2, 13.3 and 13.6 describe a
packaged artifact that does not exist until Phase 15, and are open until it does.

---

## Running it

```
node tests-debug/certify.mjs           # execute the matrix on this platform
node tests-debug/certify.mjs --audit   # map rows to evidence without running anything
bash tests-debug/wsl-certify.sh        # the same, from WSL, installing a matching Node if needed
```

Every automated row must be claimed by a `Certification <row>` reference in a test or a harness. A
row that claims automation with nothing behind it fails the run: the point of a matrix is defeated
by a row nobody can trace to a check. Each run records its result in
`documentation/certification-<platform>.json`, which is also what the other platform's run compares
against for 12.9.

Manual results are recorded in `documentation/certification-results.json`, one entry per row per
platform, with the date and the plugin version.

---

## Sign-off

Publication requires every row passing on both platforms, recorded with plugin version, date and
platform. A manual row without a recorded result blocks release exactly like a failing automated
row.
