# Commit-pinned forensic similarity matrix

> Technical evidence document. This is not a legal conclusion and does not allege infringement as a fact. Its purpose is to distinguish (a) chronological priority and access-compatible timing, (b) similarity of ideas/methods, (c) similarity of structure and selection/arrangement, and (d) copying of protectable expression or code.

## 1. Frozen comparison set

This comparison deliberately ignores later edits and compares only the earliest relevant snapshots.

### Cycle baseline

Repository: `jannotix/claude-code-cycle-plugin`

Commit: `10f193068b84c50ed89e41f37f780abfccfa3bdf`

Timestamp: **2026-08-21 23:02:29 UTC**

Files examined at this commit:

- `README.md`
- `agents/arbiter.md`
- `agents/functional-reviewer.md`
- `skills/review/SKILL.md`
- `skills/judge/SKILL.md`
- `skills/evidence/SKILL.md`
- `src/workflow/service.ts`
- Cycle's FSL-1.1-MIT licensing position as preserved in the repository

### verify-agent baseline

Repository: `DarioFontanel/verify-agent`

Initial commit: `529872bf264d33f8b19f567e6489324602bc0f8a`

Timestamp: **2026-08-23 15:13:28 UTC**

Files examined at this commit:

- `README.md`
- `skills/verify-agent/SKILL.md`
- `LICENSE`

### Timing result

The Cycle baseline predates the initial verify-agent commit by about **40 hours**. This proves priority of the examined Cycle material. Timing alone does not prove access or copying, but it is consistent with the possibility of access.

---

## 2. Rating scale

Each correspondence below is classified using this scale.

| Rating | Meaning |
| --- | --- |
| **G — Generic** | Common software-review idea or ordinary terminology; little evidentiary weight by itself. |
| **S — Structural** | Similar choice, sequencing or role separation, but expressed/implemented differently. |
| **H — High structural similarity** | A relatively specific combination of mechanisms appears in both works in substantially the same relationship. |
| **E — Expressive similarity** | Similarity in wording, prompt formulation, concrete presentation or other potentially protectable expression. |
| **C — Code copying indicator** | Identical or near-identical implementation code, distinctive identifiers, comments or data structures. |

No item is classified **C** in the material examined below.

---

## 3. Detailed correspondence matrix

### M01 — The original request/brief is the authoritative verification target

**Cycle, 2026-08-21**

Cycle's README says the final arbiter judges the candidate against the user's original request rather than an architect summary. `agents/arbiter.md` makes this a defining rule: the original request controls over the plan, reviewer interpretation and executor summary. `skills/judge/SKILL.md` repeats the same rule for readiness checks.

**verify-agent, 2026-08-23**

The skill requires a `brief` that acts as the contract against which the artifact is verified. It prioritizes recovering the original specification/request and freezes that brief before review. The README likewise describes verification against the original request.

**Classification: H — High structural similarity.**

**Why it matters:** This is more specific than generic code review. Both systems deliberately prevent intermediate agent summaries from becoming the acceptance standard and instead preserve an earlier user/specification artifact as the authoritative contract.

**Why it is not enough by itself:** “Check work against requirements” is an underlying method and can be independently implemented.

---

### M02 — Reviewer and final judge are separated roles

**Cycle**

Cycle separates independent reviewers from a final arbiter. The functional reviewer explicitly cannot approve a release; its verdict is merely an input to the arbiter. The control plane has distinct `independent_reviews` and `arbitration` states.

**verify-agent**

verify-agent defines two fixed roles: an external reviewer and Claude acting as arbiter. The reviewer attacks the work; the arbiter independently tests each finding before deciding how it affects the final result.

**Classification: H — High structural similarity.**

**Why it matters:** The separation is not cosmetic. In both designs it is an anti-self-approval mechanism and is central to the trust model.

---

### M03 — The reviewer is deliberately read-only

**Cycle**

`agents/functional-reviewer.md` is read-only and removes writing tools. The review skill says to inspect and rerun non-destructive checks but not edit. Cycle's README describes enforcement of role boundaries.

**verify-agent**

The external reviewer is explicitly read-only/sandboxed and is not the component that edits the artifact.

**Classification: S — Structural similarity.**

**Weight:** Moderate. Read-only review agents are a natural design choice and are not distinctive enough alone to establish copying.

---

### M04 — Mechanical evidence is privileged over model opinion

**Cycle**

Cycle is described as “evidence-gated delivery”. Real gates execute before approval, and a mandatory gate that has not passed prevents delivery regardless of model votes. Reviewer instructions forbid inferring success from command output that was never captured. Evidence is recorded against the frozen candidate and reviewers/arbiter may cite recorded evidence identifiers.

**verify-agent**

The second phase is explicitly “Check meccanici”, performed before asking an LLM for an opinion. Failed checks become findings without needing reviewer judgment. Reviewer findings must include exact evidence plus a reproducible mechanical verification step, and the arbiter mechanically tests claims before accepting them.

**Classification: H — High structural similarity.**

**Why it matters:** The combination “LLM review is subordinate to independently executed evidence” is a core mechanism in both systems, not just documentation style.

**Difference:** Cycle implements evidence as a control-plane gate system tied to a candidate, while verify-agent implements the concept operationally through files, commands and the conversational agent.

---

### M05 — A reviewer finding is not accepted as truth merely because a reviewer produced it

**Cycle**

Cycle's final arbiter receives reviews plus raw evidence and decides whether the candidate meets requirements. The implementation rejects automatic trust in reviewer output and enforces separate arbitration.

**verify-agent**

A finding is explicitly treated as a claim; Claude must mechanically verify it and mark it accepted or refuted.

**Classification: H — High structural similarity.**

**Observation:** The exact accepted/refuted per-finding protocol is more explicit in verify-agent. Cycle's baseline performs review verdict validation and final arbitration at the candidate/requirement level rather than using verify-agent's exact per-finding round log.

---

### M06 — The artifact/candidate is pinned before review

**Cycle**

Cycle freezes a candidate byte-for-byte before verification. `src/workflow/service.ts` records a candidate ID, base revision, diff digest, candidate digest and file count. Reviews and evidence are bound to that current frozen candidate.

**verify-agent**

The first phase pins the artifact and brief to disk in a task directory before review, including a manifest/diff description.

**Classification: H — High structural similarity.**

**Important difference:** Cycle's freeze is an integrity/security mechanism enforced by code and digests. verify-agent's pin is a simpler filesystem/document convention. The implementations are materially different even though the purpose and workflow position are similar.

---

### M07 — The workflow order places deterministic checks before independent review, and review before arbitration

**Cycle**

The baseline state machine/control plane exposes the sequence around a frozen candidate as:

`verification → independent_reviews → arbitration → delivery/repair`

Mandatory evidence is checked before the candidate can progress through review and arbitration.

**verify-agent**

The initial skill orders the process as:

`pin brief/artifact → mechanical checks → adversarial review → finding verification/arbitration → verdict`

**Classification: H — High structural similarity.**

**Why it matters:** The sequencing and division of responsibilities are similar at a level more specific than “run tests and review code”.

**Difference:** Cycle additionally contains architecture, execution, security review, delivery integrity, resource governance and persistence not reproduced by verify-agent.

---

### M08 — Rejection produces a repair loop rather than a terminal answer

**Cycle**

The README states that a rejected candidate returns for repair, with a bounded repair-cycle budget. The control plane has `repair`, `blocked` and re-execution/replanning transitions.

**verify-agent**

Accepted findings are corrected and the updated work is returned to the reviewer. The same reviewer session may continue until PASS or the three-round limit is reached.

**Classification: H — High structural similarity.**

**Important difference:** The loop semantics differ. Cycle repairs a governed candidate through its workflow/state machine and may route to architecture or execution. verify-agent loops reviewer findings in a single verification skill and sets a maximum of three rounds.

---

### M09 — Bounded convergence prevents infinite reviewer/repair ping-pong

**Cycle**

Cycle's README states a maximum repair budget (five cycles in the baseline description) and the workflow can become blocked when that budget is exhausted.

**verify-agent**

The initial design caps the reviewer loop at three rounds and then produces a verdict with unresolved findings.

**Classification: S — Structural similarity.**

**Weight:** Moderate. Bounded retries are common engineering practice. The specific limits differ.

---

### M10 — Independent model families are used to reduce correlated blind spots

**Cycle**

The README explains model independence and says assigning different models to reviewers and arbiter creates genuinely independent verdicts rather than a model agreeing with itself.

**verify-agent**

The opening principle is cross-model review: the producing model should not grade itself, so a different model family is used to attack the work.

**Classification: H — High structural similarity.**

**Expression check:** The phrasing is different. No sustained verbatim copying was observed in the examined text.

---

### M11 — Review is adversarial rather than approval-seeking

**Cycle**

Cycle's reviewer roles exist to find completeness, regressions, security/architecture problems and to prevent unverified completion. The baseline functional reviewer is instructed to identify concrete incomplete layers, regressions and missing evidence.

**verify-agent**

The reviewer is explicitly prompted to try to disprove compliance with the brief and to avoid polite approval behavior.

**Classification: S/H — Structural similarity, relatively strong.**

**Difference:** verify-agent's “attack” framing and explicit anti-sycophancy wording are more pronounced than Cycle's baseline functional reviewer wording. This is not a close textual match.

---

### M12 — Missing evidence is treated as failure/uncertainty rather than silently assumed success

**Cycle**

The review instructions state that success must not be inferred from command output that was not captured, and the judge treats missing evidence as a blocker. Mandatory gates that do not pass cannot be overridden by approval.

**verify-agent**

Mechanical checks are mandatory inputs, findings must include verifiable evidence, and the arbiter must test claims rather than trust them.

**Classification: H — High structural similarity.**

---

### M13 — Final verdict is produced only after evidence and independent review

**Cycle**

A release approval is only possible inside a governed cycle after verification evidence and independent reviews; advisory review/judge commands cannot approve. `src/workflow/service.ts` prevents an arbiter approval when an independent reviewer rejected the candidate and separately refuses delivery if mandatory gates failed.

**verify-agent**

The final verdict occurs after mechanical checks, adversarial review and arbitration of findings.

**Classification: H — High structural similarity.**

**Difference:** verify-agent's verdict categories (`VERIFICATO`, `VERIFICATO CON RISERVE`, `BOCCIATO`) are its own presentation and do not mirror Cycle's output schema.

---

### M14 — Findings require severity plus evidence

**Cycle**

Cycle's reviewer/arbiter verdict schema contains severity, summary and evidence identifiers. Reviewers decide requirements and cite evidence supplied by the control plane.

**verify-agent**

The adversarial reviewer prompt requires severity, exact evidence and a reproducible verification step for each finding.

**Classification: S — Structural similarity.**

**Weight:** Moderate. Severity + evidence is conventional review tooling, though its combination with the other mechanisms strengthens the overall pattern.

---

### M15 — Functional review specifically searches for a layer that was implemented on one side but not completed end-to-end

**Cycle**

The functional reviewer gives concrete recurring examples: backend without interface, migration not actually run, mock-only test while the real integration remains broken, and a flow that renders but does not finish.

**verify-agent**

The adversarial reviewer attacks missing/partial requirements, demonstrable errors and effects outside scope. It is broader and does not reproduce Cycle's distinctive list of end-to-end examples in the same form.

**Classification: G/S — Generic-to-structural, not expressive copying.**

**Finding:** No meaningful line-for-line reuse of Cycle's distinctive end-to-end example list was found in the initial verify-agent skill.

---

## 4. Expression-level comparison

The strongest legal distinction in this technical review is between **similar method/architecture** and **copied expression/code**.

### 4.1 Wording

The inspected material contains many semantically corresponding statements, but they are generally phrased differently and often in different languages.

Examples of concepts expressed differently:

- Cycle makes the user's original request authoritative; verify-agent calls the brief a contract.
- Cycle describes independent reviewers plus a final arbiter; verify-agent describes a reviewer attacking and Claude arbitrating.
- Cycle says unseen command output cannot prove success; verify-agent requires mechanical verification before accepting a claim.

The comparison did **not** identify a long, distinctive passage copied verbatim from Cycle into verify-agent.

### 4.2 Prompt structure

There is substantial overlap in purpose and selection/arrangement:

1. preserve the original requirement;
2. preserve/pin the work being judged;
3. execute non-LLM checks;
4. send the artifact to an independent/read-only reviewer;
5. require concrete findings/evidence;
6. independently adjudicate findings/verdicts;
7. repair and repeat under a finite budget;
8. issue a final verdict.

This eight-part sequence is a **strong structural correspondence**. Whether that selection/arrangement is legally protectable, scènes à faire, or an unprotectable method is a legal question outside this technical report.

### 4.3 Code and identifiers

No copied TypeScript implementation was identified in verify-agent because the initial verify-agent repository does not contain a corresponding TypeScript control plane. It is primarily a Markdown skill plus documentation.

No shared blob hashes were observed among the examined first-party files.

No distinctive Cycle implementation identifiers such as its workflow state names, MCP operation names, evidence IDs, candidate digests, database schema or control-plane functions appear as copied implementation code in the initial verify-agent material examined.

**Code-copying conclusion: no positive indicator found in the inspected baseline.**

---

## 5. Major differences that must be preserved in any fair assessment

These differences are material and weigh against describing verify-agent as a literal clone of the Cycle codebase.

### Cycle baseline contains substantial machinery absent from verify-agent

- architect and executor roles;
- separate functional and security reviewers;
- a persisted workflow/state machine;
- frozen candidate digests and exact-byte delivery;
- mandatory evidence gates enforced by code;
- repair routing to architecture or execution;
- evidence records tied to candidate IDs;
- code graph/indexing;
- persistent memory/history;
- resource governance;
- hooks/tool restrictions;
- packaging and tests;
- delivery/promotion logic.

### verify-agent baseline differs materially

- one Markdown skill is the main implementation;
- it invokes an external reviewer CLI/model;
- Claude itself verifies and fixes findings;
- artifacts/logs are stored under `./tmp/verify/`;
- it has a three-round reviewer-session loop;
- it is presented as usable beyond code (documents, data, configuration);
- it offers Codex/Gemini/OpenRouter/Ollama backends directly;
- it does not reproduce Cycle's control plane or delivery mechanism.

---

## 6. License observations

### Cycle

The Cycle repository identifies Gianluca Iannotta as copyright holder and uses FSL-1.1-MIT for the covered release/version, with an MIT future license after two years.

The FSL redistribution provision applies its terms to copies, modifications and derivatives of the covered Software and requires the FSL terms/link and copyright notices to accompany redistribution.

### verify-agent

The initial verify-agent repository declares MIT and attributes copyright to Dario Fontanel.

### Technical significance

If protectable Cycle expression or code were proven to have been copied into verify-agent, the license mismatch would become relevant because a covered FSL copy/derivative could not simply be relicensed as an independently authored MIT work while omitting the applicable FSL/copyright notice.

However, **the FSL does not by itself convert similarity of ideas, workflow methods or product functionality into proof that the Software was copied.** Establishing that threshold remains necessary.

---

## 7. Evidence assessment

### Strongly established

1. **Priority:** the examined Cycle material existed first.
2. **Temporal proximity:** verify-agent's initial commit followed roughly 40 hours later.
3. **High structural similarity:** the projects share an unusually dense combination of requirement anchoring, role separation, read-only independent review, evidence-first verification, arbitration, bounded repair and final verdict.
4. **Same broad environment:** both are Claude Code-oriented agent verification/workflow tooling.

### Not established by the inspected public repository material

1. Direct access by the verify-agent author to Cycle before implementation.
2. Copy/paste of Cycle TypeScript source.
3. Sustained verbatim copying of Cycle prompts/documentation.
4. Reuse of distinctive Cycle identifiers or implementation data structures.
5. A technical basis to state as fact that verify-agent is a derivative work under copyright law.

---

## 8. Forensic conclusion

The frozen-commit comparison supports the following technically cautious conclusion:

> **verify-agent shows strong chronological and structural correspondence with mechanisms already present in Cycle before verify-agent's first commit. The density and ordering of those correspondences make “influenced by / designed with similar architecture” a reasonable hypothesis to investigate. The inspected public baseline does not, however, provide a clear code-copying indicator or sustained verbatim-text indicator. Therefore this record is substantially stronger as evidence of priority and structural similarity than as standalone proof of copyright infringement.**

This distinction should be preserved in any communication with GitHub, counsel, the other author or the public.

---

## 9. What evidence would materially change the conclusion

Evidence in the following categories would significantly strengthen a derivative-work claim if authentic and properly preserved:

1. an earlier private/public version of verify-agent containing text later rewritten after Cycle was published;
2. commit diffs showing Cycle wording or identifiers introduced and subsequently paraphrased;
3. messages/posts in which the author identifies Cycle as source material or discusses adapting it;
4. copied comments, prompts, function names, schemas or unusual error strings;
5. matching implementation defects or distinctive non-obvious design choices with no independent explanation;
6. distribution of actual Cycle files/binaries or modified Cycle files under verify-agent's MIT notice;
7. commercial materials expressly describing verify-agent as a modification/fork/adaptation of Cycle.

Evidence that would weaken a derivative-work hypothesis includes dated private drafts predating Cycle that already contain the same specific workflow, or a documented independent design history showing how the same architecture was reached without using Cycle.

---

## 10. Preservation checklist

Preserve, without editing or rewriting the originals:

- Cycle commit `10f193068b84c50ed89e41f37f780abfccfa3bdf`;
- verify-agent commit `529872bf264d33f8b19f567e6489324602bc0f8a`;
- repository creation timestamps;
- current and historical license files;
- any public announcement/post timestamps for both projects;
- screenshots/PDF captures only as secondary evidence, while retaining commit SHAs/URLs as primary technical references;
- any evidence of commercial distribution separately from the public GitHub repository.

Do not rewrite history or force-push the forensic branch. The evidentiary value comes from stable commit-pinned references, not from later narrative changes.
