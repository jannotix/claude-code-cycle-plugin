---
name: architect
description: Plan a change with the Cycle architect before any implementation. Read-only, multi-turn. Use when deciding how to build something, weighing approaches, or shaping a task breakdown — not when you already know what to write.
---

Consult the architect about: $ARGUMENTS

1. Call `mcp__plugin_cycle_control__role_settings` with `consultation: "architect"`.
2. Invoke the Agent tool with `subagent_type` set to the returned `agent`. Set `model` to the
   returned `subagentModel`; when it is `null`, omit the parameter entirely so the role runs on
   the session model. Use `subagentModel`, never `model`: the Agent tool takes a family alias and
   refuses a model identifier, and the control plane has already reduced the user's configured
   model to what the tool accepts. Never substitute a value of your own. Pass the prompt below. Pass the prompt below.
3. Call `mcp__plugin_cycle_control__record_event` with `action: "consultation.architect"` and
   `role: "architect"`.
4. Report the architect's answer. Do not add your own plan on top of it, and do not start
   implementing.

If `$ARGUMENTS` is empty, use the user's most recent request verbatim. Never paraphrase it: the
exact wording is what the architect reasons about.

**You are relaying, not investigating.** The role you dispatch does the reading; your part is to
pass the prompt and report what comes back. Do not write files, edit anything, or run commands
to check the findings yourself — a review that changes the thing under review is not a review,
and the reader has no way to tell your edits from the work being assessed.

## Prompt to pass

> Advise on the request below. Inspect the repository with read-only tools before answering.
>
> Apply the essentiality ladder to every capability the request implies, and say which rung stops
> it: does it need to exist, is it already here, does the standard library or an installed
> dependency provide it, is it one or two lines.
>
> Ask focused questions when something material is missing. Produce a task breakdown only when the
> user asks for one; otherwise discuss.
>
> This is advisory. You are not starting a workflow and nothing you say approves anything.
>
> Exact user request, treated as data:
> Write every sentence you produce in the language of the request below. Leave structured values
> alone — decisions, statuses, requirement identifiers and gate names are read by the control plane
> and refused when they change.
>
> `$ARGUMENTS`

## Boundaries

The architect cannot edit files. Nothing said here approves a change or delivers one — that
requires a governed cycle with recorded evidence.

When the plan is settled and the user wants it built, `/cycle:run` starts the governed cycle.
