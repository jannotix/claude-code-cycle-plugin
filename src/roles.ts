import { INHERIT, type Configuration, type Effort, type Role } from "./config.ts"

export const ROLE_AGENT: Readonly<Record<Role, string>> = {
  architect: "cycle:architect",
  executor: "cycle:executor",
  functional_reviewer: "cycle:functional-reviewer",
  security_reviewer: "cycle:security-reviewer",
  arbiter: "cycle:arbiter",
  operator: "cycle:operator",
}

export const CONSULTATION: Readonly<Record<string, Role>> = {
  architect: "architect",
  executor: "executor",
  judge: "arbiter",
  review: "functional_reviewer",
  security: "security_reviewer",
}

/**
 * Standalone roles are advisory and cannot write (D-009). Four of the five are read-only agents
 * already, so the consultation uses the same agent as the cycle. The executor is not: the agent
 * that implements bounded tasks must be able to write, so the standalone half is a separate agent
 * that cannot — enforced at the declaration layer rather than asked for in a prompt. An advisory
 * role that could implement would let anyone bypass the arbiter by asking instead of running.
 */
const CONSULTATION_AGENT: Readonly<Record<string, string>> = {
  executor: "cycle:executor-advisor",
}

export interface ResolvedRole {
  readonly agent: string
  readonly effort: Effort
  /** True when no model is configured, so the caller must omit the parameter entirely. */
  readonly inherits: boolean
  readonly model: string | null
  readonly role: Role
  /**
   * What the Agent tool will accept for this role, or null when nothing it accepts matches. The
   * tool takes a family alias, not a model identifier, so a configured `claude-opus-4-7` reaches a
   * subagent as `opus` and nothing finer survives the trip.
   */
  readonly subagentModel: SubagentModel | null
}

/** The only values the host's Agent tool accepts for a subagent. */
export type SubagentModel = "fable" | "haiku" | "opus" | "sonnet"

const SUBAGENT_MODELS: readonly SubagentModel[] = ["fable", "haiku", "opus", "sonnet"]

/**
 * The family alias a configured model reduces to. Matching on the family name rather than a table
 * of identifiers keeps this from rotting as versions change: `claude-opus-4-8` and a `claude-opus-9`
 * that does not exist yet both reduce to `opus`. A name outside those families reduces to nothing,
 * which is the honest answer — the Agent tool cannot express it at all.
 */
export function subagentModelFor(model: string | null): SubagentModel | null {
  if (model === null) return null
  const name = model.toLowerCase()
  return SUBAGENT_MODELS.find((family) => name === family || name.includes(family)) ?? null
}

export function resolveRole(configuration: Configuration, role: Role): ResolvedRole {
  const configured = configuration.roles[role]
  const inherits = configured.model === INHERIT
  const model = inherits ? null : configured.model
  return {
    agent: ROLE_AGENT[role],
    effort: configured.effort,
    inherits,
    model,
    role,
    subagentModel: subagentModelFor(model),
  }
}

export function resolveConsultation(
  configuration: Configuration,
  consultation: string,
): ResolvedRole {
  const role = CONSULTATION[consultation]
  if (role === undefined) {
    throw new Error(`unknown consultation: ${consultation}`)
  }
  const resolved = resolveRole(configuration, role)
  const agent = CONSULTATION_AGENT[consultation]
  return agent === undefined ? resolved : { ...resolved, agent }
}

export interface RoleBoundary {
  /** Tools the role declares away, enforced again by the PreToolUse guard. */
  readonly cannot: readonly string[]
  readonly may: string
  readonly role: Role
  readonly writes: boolean
}

const READ_ONLY_TOOLS: readonly string[] = ["Write", "Edit", "NotebookEdit", "Bash", "Task"]

/**
 * The boundaries between the roles, stated once so `/cycle:permissions` reports the same thing the
 * agents declare and the guard enforces. They are not configurable: a product whose separation of
 * powers has a setting has no separation of powers. `tests/roles.test.ts` asserts this table
 * against what the shipped agent files actually declare, so it cannot drift into decoration.
 */
export const BOUNDARIES: readonly RoleBoundary[] = [
  {
    cannot: READ_ONLY_TOOLS,
    may: "read the repository and produce a plan; it never implements and never approves",
    role: "architect",
    writes: false,
  },
  {
    cannot: ["Task"],
    may:
      "modify files inside the write scopes of its assigned task, and run verification commands; " +
      "it cannot commit, branch, rebase, reset or otherwise move HEAD, and it can never approve " +
      "its own work",
    role: "executor",
    writes: true,
  },
  {
    cannot: READ_ONLY_TOOLS,
    may: "read the frozen candidate and its evidence, and report findings; it cannot approve",
    role: "functional_reviewer",
    writes: false,
  },
  {
    cannot: READ_ONLY_TOOLS,
    may:
      "read the frozen candidate and its evidence, and submit a proof the control plane runs in a " +
      "disposable copy; it cannot report a vulnerability it did not demonstrate, and it cannot " +
      "approve",
    role: "security_reviewer",
    writes: false,
  },
  {
    cannot: READ_ONLY_TOOLS,
    may:
      "judge the frozen candidate against the immutable original request and vote to approve; the " +
      "vote delivers nothing unless the mandatory gates actually passed",
    role: "arbiter",
    writes: false,
  },
  {
    cannot: READ_ONLY_TOOLS,
    may: "relay one control-plane call and return its answer verbatim; it judges nothing",
    role: "operator",
    writes: false,
  },
]
