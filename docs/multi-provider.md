# Per-role providers

Cycle names a model for each role. What answers is your infrastructure. This page is a placeholder
guide: it contains no endpoint, no key and no personal configuration, and it never will.

> Cycle never reads, stores or transmits a provider credential. Nothing on this page asks you to
> give one to the plugin, because there is nowhere in the plugin for one to go.

## What is possible without any of this

Nothing here is required. Unconfigured, every role inherits the session model and Cycle works. You
can also assign **different models on the session's own provider** — that alone makes the two
reviewers and the arbiter three genuinely separate opinions instead of one model agreeing with
itself three times.

A gateway buys exactly one further thing: roles on **different providers**.

## Why a gateway is the only way

Claude Code subagents inherit the session provider. There is no per-subagent provider selection, so
five roles on five providers requires something that speaks the Anthropic Messages API and routes by
model name. That is an LLM gateway, it runs on your machine or your network, and it is yours: Cycle
does not configure it, start it, or know its address beyond what the session already tells it.

## The credential path

Set **only** the base URL:

```
ANTHROPIC_BASE_URL=https://<your-gateway-host>:<port>
```

Do **not** set `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` for the session. Either one replaces
your saved claude.ai login for every request, and each request is then billed per token to that
credential instead of to your subscription. With only the base URL set, the saved login stays the
active credential and is forwarded to the gateway — provided the gateway propagates the OAuth
capability in the `anthropic-beta` header. That propagation is the fragile point of this whole
arrangement, so verify it before connecting anything else (see below).

`/cycle:doctor` reports which variable is set and what each role is billed to. If it says
`env credential`, the subscription is not paying.

## Naming a provider per role

Gateways route by model identifier, conventionally `provider/model`. Set the role options in the
plugin's configuration to names **your** gateway routes:

| Role | Option | Example shape |
| --- | --- | --- |
| architect | Architect model | `<provider>/<model>` |
| executor | Executor model | `<provider>/<model>` |
| functional reviewer | Functional reviewer model | `<provider>/<model>` |
| security reviewer | Security reviewer model | `<provider>/<model>` |
| arbiter | Arbiter model | `<provider>/<model>` |
| operator | Operator model | a small, fast model |

`inherit` keeps a role on the session model. A provider-prefixed name with no gateway configured
goes to the Anthropic API, which does not serve it; doctor reports that as `models.unroutable`
rather than letting the run fail somewhere less obvious.

`/cycle:models` shows what each role resolved to, and how many distinct providers the five roles
actually reach. Believing five judgements are independent when one model produced all five is worse
than knowing they are correlated.

## Keep it out of the repository

Gateway configuration, credential shims and keys belong in a directory that is not part of any
project you run Cycle on. `cycle-local/`, `.env*`, `*.key`, `*.pem`, `auth.json` and
`credentials.json` are already ignored here, and Cycle's own secret scanner runs on the changed
content of every candidate — including this repository's.

## Verifying it, before trusting it

These four checks need your gateway and your provider accounts, so they are run by hand and their
results recorded. They are certification rows 11.1, 11.2, 11.5 and 11.6.

1. **The subscription still pays for Anthropic-routed work.** With the base URL set and no
   credential variable, run one cycle with every role on `inherit`. Confirm the usage lands on the
   claude.ai subscription and that the gateway's own billing log shows no per-token charge for it.
   If it does not, the OAuth capability is not being propagated: stop here and use a second profile
   with the gateway active only during Cycle runs, rather than changing the credential variable.
2. **A second provider is billed to its own plan.** Assign one non-critical role — the operator or
   the executor — to a second provider and confirm the charge appears on that provider's plan and
   nowhere else.
3. **Structured output survives translation.** Run a full cycle with the reviewers and the arbiter
   on different providers. Every verdict is validated strictly; a provider whose translation drops
   or reshapes fields produces a rejected verdict and a retry, which is visible in the run.
4. **Effort reaches the provider.** Set one role's effort to `max` and confirm the gateway forwards
   it, or that it reports the parameter as unsupported. A silently dropped effort is a role thinking
   less than the configuration says.

Record each result with the date, the platform and the plugin version. A check with no recorded
result is not a passed check.

## When the provider stops answering

A role whose provider goes away mid-cycle produces no answer. Cycle does not read that as a
rejection: it pauses the workflow at that boundary, records `provider unavailable` with the role
that lost it, and spends no repair cycle. `/cycle:status` and `/cycle:resume` report the reason, and
`/cycle:resume` continues from exactly there once the provider is back.
