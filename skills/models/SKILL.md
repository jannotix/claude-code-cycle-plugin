---
name: models
description: Which model and which provider each Cycle role actually runs on, what pays for each request, and how independent the five verdicts really are. Use before trusting a review, after changing model configuration, or when setting up a gateway for per-role providers.
---

Role models and provider paths: $ARGUMENTS

1. Call `mcp__plugin_cycle_control__doctor`.
2. Report `report.models.roles` as a table: role, configured model, resolved model, effort,
   provider, and what is billed. One row per role, no prose between rows.
3. Then report, in one line each:
   - `report.models.distinctProviders` out of five, and `report.models.distinctRoleModels`
   - the endpoint from `report.models.baseUrlHost`, or that the session is on the default Anthropic
     API when it is null
4. State every finding whose code starts with `models.` verbatim. Add nothing to them.

If `$ARGUMENTS` names a role, report that role's row and its findings only.

## What independence means here

Five roles running on one model are one opinion recorded five times. The structure still holds — the
executor cannot approve its own work — but correlated errors are far more likely than three separate
verdicts suggest. `distinctProviders` is the honest number: providers, not model names, because two
names served by the same model behind a gateway are not two providers.

The plugin names a model per role. What answers is the user's own infrastructure.

## Assigning a model

Cycle **cannot** change this configuration, and does not try: role models come from the plugin's own
`userConfig`, which Claude Code owns. To change one, the user opens the plugin's configuration and
sets the option for that role:

| Role | Option |
| --- | --- |
| architect | Architect model |
| executor | Executor model |
| functional reviewer | Functional reviewer model |
| security reviewer | Security reviewer model |
| arbiter | Arbiter model |
| operator | Operator model |

`inherit` follows the session model. Any other value is passed to the role as its model.

For a **provider other than the session's**, the value must be a name the user's gateway routes,
conventionally `provider/model` — and `ANTHROPIC_BASE_URL` must point at that gateway. Without a
gateway the request goes to the Anthropic API, which does not serve those names; doctor reports that
as `models.unroutable`.

Say what to set and why. Do not offer to set it, do not edit any settings file, and never ask for a
key: Cycle never reads, stores or transmits a provider credential.

## Boundaries

Read-only. This command reports configuration and never changes it, never starts a workflow, and
never recommends a specific commercial model — the user decides what answers.
