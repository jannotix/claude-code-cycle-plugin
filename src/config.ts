export type Role =
  | "architect"
  | "executor"
  | "functional_reviewer"
  | "security_reviewer"
  | "arbiter"
  | "operator"

export type Effort = "low" | "medium" | "high" | "xhigh" | "max"
export type GateStrictness = "advisory" | "standard" | "strict"

export const ROLES: readonly Role[] = [
  "architect",
  "executor",
  "functional_reviewer",
  "security_reviewer",
  "arbiter",
  "operator",
]

export const INHERIT = "inherit"

export interface RoleSettings {
  readonly effort: Effort
  readonly model: string
}

export interface Configuration {
  readonly dataDirectory: string | undefined
  readonly gateStrictness: GateStrictness
  readonly invalid: readonly string[]
  readonly maxRepairCycles: number
  readonly roles: Readonly<Record<Role, RoleSettings>>
  /**
   * Whether the security reviewer may execute a proof against a copy of the candidate. Off unless
   * the user turns it on: a proof runs real code, written by a model that has read the repository,
   * with the user's own privileges and no OS sandbox. That is a capability to grant deliberately,
   * not one to inherit by installing a plugin. With it off an undemonstrated critical is
   * downgraded rather than deleted, which the gate rules already provide for.
   */
  readonly securityProofs: boolean
  /** Options that were set but that this build does not read, so they change nothing. */
  readonly unknown: readonly string[]
  /** How many option variables the host actually delivered to this process. */
  readonly delivered: number
}

const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"]
const STRICTNESS: readonly GateStrictness[] = ["advisory", "standard", "strict"]

const DEFAULT_EFFORT: Readonly<Record<Role, Effort>> = {
  architect: "high",
  executor: "high",
  functional_reviewer: "high",
  security_reviewer: "high",
  arbiter: "high",
  operator: "low",
}

const DEFAULT_MODEL: Readonly<Record<Role, string>> = {
  architect: INHERIT,
  executor: INHERIT,
  functional_reviewer: INHERIT,
  security_reviewer: INHERIT,
  arbiter: INHERIT,
  operator: "haiku",
}

// Both reviewers share one effort option; the rest map one to one.
const EFFORT_OPTION: Readonly<Record<Role, string>> = {
  architect: "ARCHITECT_EFFORT",
  executor: "EXECUTOR_EFFORT",
  functional_reviewer: "REVIEWER_EFFORT",
  security_reviewer: "REVIEWER_EFFORT",
  arbiter: "ARBITER_EFFORT",
  operator: "OPERATOR_EFFORT",
}

const PREFIX = "CLAUDE_PLUGIN_OPTION_"

export function readConfiguration(environment: NodeJS.ProcessEnv = process.env): Configuration {
  const invalid: string[] = []
  const roles = {} as Record<Role, RoleSettings>
  const known = new Set(["DATA_DIR", "GATE_STRICTNESS", "MAX_REPAIR_CYCLES", "SECURITY_PROOFS"])

  for (const role of ROLES) {
    const modelKey = `${role.toUpperCase()}_MODEL`
    known.add(modelKey).add(EFFORT_OPTION[role])
    roles[role] = {
      effort: readEffort(environment, EFFORT_OPTION[role], DEFAULT_EFFORT[role], invalid),
      model: readModel(environment, modelKey, DEFAULT_MODEL[role], invalid),
    }
  }

  const delivered = Object.keys(environment).filter((key) => key.startsWith(PREFIX)).length

  return {
    dataDirectory: option(environment, "DATA_DIR") || undefined,
    delivered,
    gateStrictness: readStrictness(environment, invalid),
    invalid,
    maxRepairCycles: readRepairCycles(environment, invalid),
    roles,
    securityProofs: readSecurityProofs(environment, invalid),
    unknown: Object.keys(environment)
      .filter((key) => key.startsWith(PREFIX) && !known.has(key.slice(PREFIX.length)))
      .map((key) => key.slice(PREFIX.length))
      .sort(),
  }
}

/** Anything that is not an explicit "on" leaves proofs off, including a value nobody recognises. */
function readSecurityProofs(environment: NodeJS.ProcessEnv, invalid: string[]): boolean {
  const raw = option(environment, "SECURITY_PROOFS").toLowerCase()
  if (raw === "") return false
  if (raw === "on" || raw === "off") return raw === "on"
  invalid.push(`SECURITY_PROOFS=${raw} is not on or off; proofs stay off`)
  return false
}

function option(environment: NodeJS.ProcessEnv, key: string): string {
  return (environment[`${PREFIX}${key}`] ?? "").trim()
}

function readModel(
  environment: NodeJS.ProcessEnv,
  key: string,
  fallback: string,
  invalid: string[],
): string {
  const value = option(environment, key)
  if (!value) return fallback
  if (value.length > 128 || /\s/u.test(value)) {
    invalid.push(`${key} is not a valid model identifier`)
    return fallback
  }
  return value
}

function readEffort(
  environment: NodeJS.ProcessEnv,
  key: string,
  fallback: Effort,
  invalid: string[],
): Effort {
  const value = option(environment, key).toLowerCase()
  if (!value) return fallback
  if (!EFFORTS.includes(value as Effort)) {
    invalid.push(`${key} must be one of ${EFFORTS.join(", ")}`)
    return fallback
  }
  return value as Effort
}

function readStrictness(environment: NodeJS.ProcessEnv, invalid: string[]): GateStrictness {
  const value = option(environment, "GATE_STRICTNESS").toLowerCase()
  if (!value) return "standard"
  if (!STRICTNESS.includes(value as GateStrictness)) {
    invalid.push(`GATE_STRICTNESS must be one of ${STRICTNESS.join(", ")}`)
    return "standard"
  }
  return value as GateStrictness
}

function readRepairCycles(environment: NodeJS.ProcessEnv, invalid: string[]): number {
  const value = option(environment, "MAX_REPAIR_CYCLES")
  if (!value) return 5
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
    invalid.push("MAX_REPAIR_CYCLES must be an integer between 1 and 20")
    return 5
  }
  return parsed
}
