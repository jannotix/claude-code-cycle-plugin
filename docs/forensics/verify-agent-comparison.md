# Forensic comparison: Cycle vs `DarioFontanel/verify-agent`

> Purpose: preserve a neutral, commit-pinned technical comparison for later review. This document does **not** state a legal conclusion. It records chronology, observable similarities, material differences, and the evidence needed to distinguish independent implementation from a derivative work.

## Repositories

- Original project: `jannotix/claude-code-cycle-plugin`
- Compared project: `DarioFontanel/verify-agent`

## Commit-pinned chronology

### Cycle

- Repository created: 2026-08-21.
- Cycle 1.0.0 commit: `10f193068b84c50ed89e41f37f780abfccfa3bdf`
- Commit timestamp: 2026-08-21 23:02:29 UTC.
- Commit description already identifies five separated roles: architect, executor, two independent reviewers, and an arbiter, replacing a single agent that plans, implements and approves its own work.

Relevant files at this commit include:

- `agents/arbiter.md`
- `agents/functional-reviewer.md`
- `agents/security-reviewer.md`
- `skills/review/SKILL.md`
- `skills/judge/SKILL.md`
- `skills/run/SKILL.md`
- `skills/evidence/SKILL.md`
- workflow and evidence-control implementation under `src/` and `workflows/`

### verify-agent

- Repository created: 2026-08-23.
- Initial commit: `529872bf264d33f8b19f567e6489324602bc0f8a`
- Commit timestamp: 2026-08-23 15:13:28 UTC.
- Initial commit description states that an external read-only reviewer attacks work against a brief, Claude verifies each finding with mechanical evidence, the process loops until convergence, and a final verdict is produced.

The initial repository consists primarily of:

- `skills/verify-agent/SKILL.md`
- `skills/verify-agent/references/backends.md`
- `README.md`
- `LICENSE`

## Chronology conclusion

Cycle's public 1.0.0 implementation predates the first public `verify-agent` commit by roughly 40 hours.

This establishes priority of publication for the compared public implementations. It does not, by itself, prove copying.

## High-level structural comparison

| Concept | Cycle by 2026-08-21 | verify-agent by 2026-08-23 | Assessment |
| --- | --- | --- | --- |
| Avoid self-review | Separate executor/reviewers/arbiter | Different model reviews; Claude arbitrates | Strong conceptual overlap |
| Original request as authority | Arbiter judges immutable original request | Brief is treated as the contract | Strong conceptual overlap |
| Read-only reviewer | Functional/security reviewers are read-only | Reviewer explicitly read-only | Strong conceptual overlap |
| Mechanical evidence | Mandatory gates/evidence precede approval | Mechanical checks precede LLM opinion | Strong conceptual overlap |
| Findings must be evidenced | Findings cite evidence identifiers/gates | Findings require exact evidence + reproducible check | Strong conceptual overlap |
| Independent arbitration | Separate arbiter decides final readiness | Claude verifies each reviewer finding | Strong conceptual overlap |
| Repair/re-review loop | Rejected candidate returns for repair | Accepted findings are fixed and sent back to reviewer | Strong conceptual overlap |
| Bounded iteration | Cycle has a repair budget | verify-agent caps at 3 rounds | Similar mechanism |
| Final verdict | Arbiter approval/rejection governs delivery | VERIFIED / VERIFIED WITH RESERVATIONS / FAILED | Similar output concept |

## Specific pre-existing Cycle mechanisms

### 1. Original user request is authoritative

Cycle's arbiter states that the user's original request is authoritative, not the architect's plan, reviewers' interpretation, or executor summary. The arbiter must read the original request first and judge what the user would consider delivered.

The `judge` skill repeats the same control principle: readiness is measured against what the user actually asked for, not the plan or implementation summary.

### 2. Reviewer independence and read-only operation

Cycle's functional reviewer is explicitly isolated and read-only. It reviews the frozen candidate against the immutable original request and raw verification evidence and cannot approve a release.

### 3. Proof before opinion

Cycle's evidence system records gates against a frozen candidate. A mandatory gate that does not pass prevents delivery regardless of model opinion.

Cycle's reviewer instructions also state that success must not be inferred from command output that was not captured.

### 4. Separate review and arbitration

Cycle distinguishes advisory reviewer findings from the final independent arbiter. Reviewers are inputs to arbitration and cannot independently approve release.

## Corresponding verify-agent mechanisms

The initial `verify-agent` skill contains the following combined sequence:

1. Freeze/pin an artifact and a brief.
2. Treat the brief as the contract against which correctness is judged.
3. Run objective mechanical checks first.
4. Send the artifact to an external, read-only adversarial reviewer.
5. Require each finding to include severity, exact evidence, and a reproducible mechanical verification step.
6. Have Claude mechanically verify each finding.
7. Accept and fix confirmed findings; refute unsupported findings with counter-evidence.
8. Return the updated artifact to the same reviewer.
9. Repeat until PASS or a three-round cap.
10. Produce a final verdict.

## Material differences

The public repositories are not equivalent implementations.

Cycle is a substantially larger TypeScript plugin and control plane with, among other things:

- multiple agent roles;
- frozen candidates and integrity tracking;
- deterministic evidence gates;
- workflow state and repair routing;
- signed/history records;
- provider/model configuration;
- project memory;
- code graph/indexing;
- MCP/control-plane logic;
- tests, hooks, packaging, and delivery enforcement.

`verify-agent` is primarily a Claude Code skill/prompt workflow plus backend invocation documentation. It does not publicly contain Cycle's TypeScript control-plane implementation.

This difference matters when evaluating copyright: copying a general method or workflow concept is not the same as copying protected source code or protected expressive text.

## License comparison

### Cycle

Current Cycle releases are distributed under `FSL-1.1-MIT`, copyright 2026 Gianluca Iannotta.

The license states that its terms apply to copies, modifications, and derivatives, and that redistributed copies/modifications/derivatives must include the license terms and preserve copyright notices. It also excludes Competing Use during the FSL period.

### verify-agent

`verify-agent` declares the MIT License and identifies Dario Fontanel as copyright holder.

If any material in `verify-agent` were shown to be a copy, modification, or derivative of FSL-covered Cycle material, the licensing distinction would become relevant. The chronology and conceptual similarity alone are not sufficient to establish that conclusion.

## Evidence currently supporting a derivation hypothesis

- Clear priority of Cycle's public implementation.
- Very short interval between Cycle 1.0.0 and the first `verify-agent` commit.
- Unusually specific combination of mechanisms shared by both projects:
  - separate reviewer and arbiter;
  - read-only review;
  - original request/brief as governing contract;
  - mechanical proof before model judgment;
  - evidence-backed findings;
  - correction and re-review loop;
  - bounded iterations;
  - final verdict.

These facts support investigating derivation. They do not independently prove copyright infringement.

## Evidence still needed for a strong copyright/FSL claim

The strongest additional evidence would be one or more of the following:

1. Substantial verbatim or near-verbatim text shared between Cycle prompts/skills and `verify-agent`.
2. Non-trivial copied source code.
3. Identical unusual terminology, ordering, edge-case handling, output schemas, or mistakes that are not naturally dictated by the problem.
4. Git history showing a fork, copied blobs, or an intermediate state derived from Cycle.
5. Public/private statements acknowledging use of Cycle as source material.
6. Evidence that FSL-covered Cycle material was redistributed under MIT without the required FSL terms and notices.
7. Evidence of commercial distribution if a copied/derived FSL-covered implementation is being used in a competing product or service.

## Recommended preservation targets

Preserve immutable references to:

- Cycle commit `10f193068b84c50ed89e41f37f780abfccfa3bdf`
- verify-agent commit `529872bf264d33f8b19f567e6489324602bc0f8a`
- current Cycle `LICENSE`
- current verify-agent `LICENSE`
- Cycle files listed above at the pinned commit
- `verify-agent/skills/verify-agent/SKILL.md` at the pinned commit
- both repositories' creation timestamps and commit histories
- any public commercial offering, pricing page, course/member-area post, video, or announcement involving `verify-agent`

## Current technical conclusion

The public evidence supports a **strong hypothesis of conceptual/structural derivation** because Cycle was public first and the later project reproduces a highly specific verification architecture shortly afterward.

At the same time, the public comparison reviewed so far does **not yet establish substantial literal source-code copying** or sufficiently extensive near-verbatim copying to state, as a technical fact, that `verify-agent` is a derivative work under copyright law.

For a GitHub copyright/DMCA submission, the next step should therefore be a line-by-line comparison pinned to the two initial commits, identifying protected expression rather than relying only on architectural similarity.
