import { INHERIT, ROLES, type Configuration, type Effort, type Role } from "./config.ts"

const ANTHROPIC_DEFAULT_HOST = "api.anthropic.com"

/** The five roles that do the work. The operator only relays control-plane calls. */
const JUDGING: readonly Role[] = [
  "architect",
  "executor",
  "functional_reviewer",
  "security_reviewer",
  "arbiter",
]

/**
 * What pays for the request, as far as anything observable from outside can say.
 *
 * `subscription` is the saved claude.ai login being forwarded. `gateway-credential` is a token in
 * the environment, which replaces that login and bills per token. `gateway-held` is a credential
 * the user's gateway holds for another provider: the plugin never sees it and never guesses at it.
 */
export type Billing = "gateway-credential" | "gateway-held" | "subscription"

export interface RoleProvider {
  readonly billing: Billing
  readonly configured: string
  readonly effort: Effort
  readonly provider: string
  readonly resolved: string
}

export interface ProviderPaths {
  readonly credentialMode: "gateway-credential" | "subscription-or-default"
  readonly credentialVariable: string | null
  readonly distinctProviders: number
  readonly endpoint: string | null
  readonly gateway: boolean
  readonly roles: Readonly<Record<Role, RoleProvider>>
  /** Provider-prefixed models configured with no gateway to route them. */
  readonly unroutable: readonly string[]
}

/**
 * Claude Code has one session endpoint and one credential, so per-role provider independence is
 * expressed in the model identifier and resolved by the user's gateway. This reads exactly that,
 * and nothing it cannot see: what the user named, where the session points, and which variable —
 * if any — has replaced the subscription login.
 */
export function describeProviders(
  configuration: Configuration,
  environment: NodeJS.ProcessEnv = process.env,
): ProviderPaths {
  const endpoint = hostOf(environment["ANTHROPIC_BASE_URL"])
  const gateway = endpoint !== null && endpoint !== ANTHROPIC_DEFAULT_HOST
  const credentialVariable = credential(environment)

  const roles = {} as Record<Role, RoleProvider>
  for (const role of ROLES) {
    const { effort, model } = configuration.roles[role]
    const provider = providerOf(model, gateway)
    roles[role] = {
      billing: billingOf(provider, credentialVariable !== null, gateway),
      configured: model,
      effort,
      provider,
      resolved: model === INHERIT ? "session model" : model,
    }
  }

  return {
    credentialMode: credentialVariable === null ? "subscription-or-default" : "gateway-credential",
    credentialVariable,
    distinctProviders: new Set(JUDGING.map((role) => roles[role].provider)).size,
    endpoint,
    gateway,
    roles,
    unroutable: gateway
      ? []
      : [...new Set(JUDGING.map((role) => roles[role].configured))].filter(prefixed).sort(),
  }
}

/**
 * A gateway routes by model identifier, and the convention every Anthropic-compatible gateway
 * shares is `provider/model`. An unprefixed name behind a gateway is routed by the gateway's own
 * rules, which the plugin cannot read and therefore does not pretend to know.
 */
function providerOf(model: string, gateway: boolean): string {
  if (model === INHERIT) return "session"
  if (prefixed(model)) return model.slice(0, model.indexOf("/")).toLowerCase()
  return gateway ? "gateway" : "anthropic"
}

function billingOf(provider: string, credentialSet: boolean, gateway: boolean): Billing {
  if (credentialSet) return "gateway-credential"
  if (!gateway) return "subscription"
  // D-007: with only the base URL set, the saved login is forwarded, so an Anthropic-routed
  // request through the gateway stays on the subscription. Anything else is paid for by a
  // credential the gateway holds.
  return provider === "session" || provider === "anthropic" ? "subscription" : "gateway-held"
}

function prefixed(model: string): boolean {
  const slash = model.indexOf("/")
  return slash > 0 && slash < model.length - 1
}

/** Either variable replaces the subscription login for the whole session. */
function credential(environment: NodeJS.ProcessEnv): string | null {
  for (const key of ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"]) {
    if (environment[key]?.trim()) return key
  }
  return null
}

function hostOf(value: string | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  try {
    return new URL(raw).host
  } catch {
    return raw.slice(0, 64)
  }
}
