---
name: setup
description: First-run check and guided configuration for Cycle — what the installation needs, what is missing, and which settings are worth changing before the first run. Use after installing, after an upgrade, or when Cycle is behaving unexpectedly on a new machine.
---

Set up Cycle in this project: $ARGUMENTS

1. Call `mcp__plugin_cycle_control__doctor` and print the `summary` field exactly as returned,
   inside a fenced block.
2. If any finding is marked `FAIL`, stop there. State that Cycle cannot run a governed workflow
   until it is fixed, and give the one concrete step that fixes the first failure. Do not continue
   to the configuration advice: a plugin that cannot open its store has nothing to configure.
3. If everything passes, say so in one line, then give **at most three** suggestions, drawn only
   from what the report actually shows:
   - reviewers and the arbiter on one model → assigning distinct models makes three verdicts
     independent instead of one model agreeing with itself three times (`/cycle:models`)
   - `gate strictness` at `standard` → what `strict` and `advisory` change, if the user asks
   - a data directory the user has not seen before → say where state lives and that removing that
     directory removes everything Cycle knows
4. Say what to try first: `/cycle:run` on a small, real change. Cycle is not worth judging on a
   toy request, because the evidence gates have nothing to find in one.

## What setup does not do

It does not write configuration. Role models, efforts, strictness, the repair budget and whether
security proofs may execute live in the plugin's own `userConfig`, which Claude Code owns; Cycle
names the option and the user sets it.

`security_proofs` is off unless the user turns it on. With it on, the security reviewer can have the
control plane execute a proof it wrote against a throwaway copy of the candidate — real code, this
account's privileges, no operating-system sandbox. Name that plainly if the user asks about it, and
do not recommend turning it on.
It does not create a gateway, read a credential or contact anything.

There is no initialisation step to run: the store, the signing key and the code graph are created on
first use, outside the Claude Code installation, so an application update cannot destroy them.

## Language

Report in the language the user is writing in. Values the control plane produced — model names,
paths, gate names, state names, finding codes and the numbers — stay exactly as they are: they are
identifiers, and a translated identifier is a wrong one.

Where an instruction above says to state something verbatim, quote it verbatim and then say what it
means in the user's language. The rule exists so a diagnosis cannot be softened into something
milder, not to make it unreadable.
