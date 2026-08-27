# Security

## Reporting a vulnerability

Report privately through GitHub's security advisory form on this repository. Do not open a public
issue for a vulnerability.

Include what you did, what happened, and what you expected. A proof of concept helps and is not
required to report.

## What this plugin can reach

Cycle runs entirely on the machine it is installed on.

- **Credentials.** The plugin never reads, stores or transmits a provider credential. Model
  authentication belongs to Claude Code. A user routing roles through their own gateway configures
  that gateway outside the plugin.
- **Network.** The plugin makes no outbound requests of its own. Parsing, indexing and gate
  execution are local. A verification command may reach the network if the project's own tooling
  does.
- **State.** Workflow state, history, memory and the code index are written under the plugin data
  directory, never inside the Claude Code installation.
- **Execution.** Verification gates run without a shell, from an argument vector, against an
  allowlist. Security proofs are off unless the user turns them on, because a proof runs code the
  reviewer wrote with this account's privileges and no operating-system sandbox. What containment
  there is, stated exactly: a disposable copy deleted afterwards, a hard timeout, an environment
  reduced to what an interpreter needs to start, output redacted for secret shapes, and proxy
  variables that deny the network to every client honouring them. A proof opening a raw socket
  still reaches the network, and a proof can read any path this account can read. Enable them only
  where that is acceptable.

## Trust boundaries

Repository content, tool output and web content are treated as data in every role prompt, never as
instructions. A role that is not the executor cannot write, and the executor can write only inside
the scopes its task declared — enforced by the agent definition, by a hook that refuses the call,
and again by reconciling the diff after the task.

Content matching the secret scanner is redacted before it reaches project history and rejected
before it reaches memory.

## Supported versions

Version 1.0.10 is the current release. The current minor version receives security fixes.
