---
name: index
description: Build, refresh or query the project's code graph. Use to see what a change can reach, find where a symbol is defined, or check index freshness. Runs locally with no model calls.
---

Operation requested: $ARGUMENTS

Pick the matching call, run it, and report the result. Do not summarise the graph in prose; report
the numbers and the named symbols.

| Ask | Call |
| --- | --- |
| build, refresh, rebuild, reindex, or `$ARGUMENTS` empty | `mcp__plugin_cycle_control__index_project` |
| status, size, how fresh | `graph_query` with `operation: "status"` |
| where is X defined | `graph_query` with `operation: "symbol"`, `name: "X"` |
| what calls X, what does X use | `graph_query` with `operation: "neighbours"`, `name: "X"` |
| what breaks if I change these files | `graph_query` with `operation: "impact"`, `paths: [...]` |
| give me context for these files | `graph_query` with `operation: "scope"`, `paths: [...]` |

## What the numbers mean

Indexing is incremental by content digest. `unchanged` files were not reparsed — on a large
repository that is the whole point, and a second run reporting `updated: 0` is correct, not a
failure.

`refused`, when present, means nothing was indexed at all — see below.

`skipped` counts files in a language with no bundled grammar, or larger than the parse limit. They
are still tracked by digest, so they are not invisible; they just contribute no symbols.

## Confidence

Every edge is labelled. `extracted` means the relationship was read from the syntax tree or from a
resolved import. `inferred` means a name matched a single definition elsewhere with no import to
confirm it.

Say which one you are relying on when it matters. An `inferred` edge is a lead, not a fact.

## Boundaries

Read-only. This never modifies the project, and it makes no model calls — parsing runs locally.

## When indexing is refused

`refused` in the report means git would not list the project, and nothing was indexed: git's own
list is the ignore policy, and there is no second one to fall back on. The graph you can query is
the one from before — it was left untouched rather than emptied, because a refusal is not an empty
repository.

Report the reason verbatim and stop. It is a repository problem, not an index problem, and the
usual causes are a directory that is not a repository, a `safe.directory` that excludes it, or a
git that is not on PATH. Fix it and run the same call again.
