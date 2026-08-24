---
name: resume
description: Continue a Cycle workflow that was interrupted, paused or left mid-stage — reconcile what is on disk, then put the run back where it stopped. Finishes a delivery a crash left half done.
---

Reconcile, then continue: $ARGUMENTS

1. Call `mcp__plugin_cycle_control__workflow` with `{"operation": "reconcile"}`. Pass
   `workflowId` only if `$ARGUMENTS` names one; otherwise the latest workflow in this project is
   reconciled.
2. Report the returned `state`, the repair budget, and the `next` line **verbatim**. It says what
   has to happen, and guessing something else is how a half-delivered candidate gets re-run.
3. If `recovered` is not null, say how many files a delivery interrupted by a crash finished
   writing.
4. If `pausedBecause` is not null, say it verbatim before anything else about the state. A workflow
   paused because a provider stopped answering is waiting on the provider, not on the user, and the
   reason names which role lost it.
5. If `chain` is false, say so plainly and **stop**: the project history no longer verifies, and
   nothing should be run against it until `/cycle:history verify` explains why.
6. Then continue the run, according to the state:
   - `paused` — call `workflow` with
     `{"operation":"control","controlOperation":"resume","workflowId":"<id>"}`, then go to step 7.
     A pause taken because a provider stopped answering will simply pause again if that provider is
     still silent; say so if it does, rather than resuming in a loop.
   - `repair`, or any other non-terminal stage — go to step 7 directly. The stage is persisted and
     the workflow picks up from it.
   - `completed`, `cancelled` — nothing to continue. Report and stop.
   - `delivery` — report and **stop**. A promotion that was interrupted and could not be finished
     needs a person to look at the working tree; re-running it risks delivering twice.
7. Run the `/cycle:run` workflow exactly as `/cycle:run` describes, passing `originalRequest` from
   the reconcile result verbatim as the `request`. Never retype it or write it from memory: the
   arbiter judges the delivered work against that text, and a word changed here is a requirement
   rewritten. Starting is idempotent — it rejoins the workflow already open for this request rather
   than opening a second one.

Never approve, deliver or edit anything yourself. Continuing a run means handing it back to the
governed cycle, not doing the cycle's work.

## What the states mean

| State | What happened |
| --- | --- |
| `completed` | The candidate was delivered and re-verified. Nothing to resume |
| `delivery` | Promotion was interrupted and could not be finished. The working tree needs a look |
| `repair` | A gate, a reviewer or the arbiter rejected the candidate. Continued from there |
| `blocked` | The repair budget ran out. All work is preserved; `/cycle:retry` extends it |
| `paused` | Stopped at a safe boundary — deliberately, or because a provider stopped answering. `pausedBecause` says which. Resumed and continued from there |
| anything else | The run stopped mid-stage. Continued from the persisted state |

## Boundaries

Reconciliation never approves, never delivers and never edits. It reads persisted state, finishes a
delivery that was already approved and interrupted, and says where the run is before continuing it.

Two states are reported and never continued: `delivery`, because a promotion that could not finish
needs a person to look at the tree, and a history that does not verify, because nothing should run
against a record that has been altered.
