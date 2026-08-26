---
name: doctor
description: Check the Cycle installation — runtime, storage, per-role model assignments, and anything that would silently change how the workflow runs. Read-only. Use when Cycle behaves unexpectedly, after changing model configuration, or before a first run.
---

Call `mcp__plugin_cycle_control__doctor` and print the `summary` field exactly as returned, inside a
fenced block.

Then act on the findings:

1. If any finding is marked `FAIL`, state that Cycle cannot run a governed workflow, and give the
   one concrete step that fixes the first failure.
2. If a warning concerns model independence, say plainly what it means: the roles are running on
   fewer distinct models than the structure implies, so correlated errors are more likely than three
   separate verdicts suggest.
3. If everything passes, say so in one line and stop.

Do not restate the table in prose. Do not add a summary after the findings. Do not speculate about
causes the report does not support.

## Language

Report in the language the user is writing in. Values the control plane produced — model names,
paths, gate names, state names, finding codes and the numbers — stay exactly as they are: they are
identifiers, and a translated identifier is a wrong one.

Where an instruction above says to state something verbatim, quote it verbatim and then say what it
means in the user's language. The rule exists so a diagnosis cannot be softened into something
milder, not to make it unreadable.
