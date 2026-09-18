import { inScope, normalizeScope } from "./scopes.ts"
import type { Plan } from "./plan.ts"

/**
 * What two architects, working from the same request and unable to see each other, disagreed about.
 *
 * This exists because of what a disagreement between independent readers actually means. When two
 * plans touch the same parts of the repository, the request was understood the same way twice, and
 * a second opinion has bought nothing but confidence. When one plan writes somewhere the other never
 * considered, they did not read the same request — and the honest reading of that is not that one
 * architect is better, it is that the request admits more than one meaning. Picking a winner would
 * throw away the only measurement here and replace it with a preference.
 *
 * Deliberately computed from write scopes and nothing else. Requirement statements are prose written
 * independently; comparing them means comparing wording, and two correct plans phrased differently
 * would read as disagreement every time. A write scope is a path: it either covers the same ground
 * or it does not, and the answer is the same on every machine that asks.
 *
 * The comparison is containment rather than equality, because `src/auth` and `src/auth/session.ts`
 * are the same area described at two resolutions. What counts as divergence is a scope in one plan
 * that overlaps nothing at all in the other: a place one architect thinks the change reaches and the
 * other never named.
 */
export interface Divergence {
  /** True when at least one scope on either side is reached by nothing on the other. */
  readonly diverged: boolean
  /** Scopes the first plan claims that the second covers nowhere. */
  readonly onlyInFirst: readonly string[]
  /** Scopes the second plan claims that the first covers nowhere. */
  readonly onlyInSecond: readonly string[]
  /** One line, for the record and for the person who has to decide what it means. */
  readonly summary: string
  /** Scope counts, so a report can say how much of each plan agreed rather than only that it did. */
  readonly totals: { readonly first: number; readonly second: number; readonly shared: number }
}

const scopesOf = (plan: Plan): string[] => [
  ...new Set(plan.tasks.flatMap((task) => task.writeScopes).map(normalizeScope).filter(Boolean)),
]

/** Scopes on the left that nothing on the right reaches, at either resolution. */
function unreached(left: readonly string[], right: readonly string[]): string[] {
  return left
    .filter((scope) => !right.some((other) => inScope(scope, other) || inScope(other, scope)))
    .sort()
}

export function comparePlans(first: Plan, second: Plan): Divergence {
  const left = scopesOf(first)
  const right = scopesOf(second)

  const onlyInFirst = unreached(left, right)
  const onlyInSecond = unreached(right, left)
  const diverged = onlyInFirst.length > 0 || onlyInSecond.length > 0

  const totals = {
    first: left.length,
    second: right.length,
    shared: left.length - onlyInFirst.length,
  }

  return {
    diverged,
    onlyInFirst,
    onlyInSecond,
    summary: diverged
      ? `two independent plans disagree about what this change touches: ` +
        `${describe(onlyInFirst, "the first")}${
          onlyInFirst.length > 0 && onlyInSecond.length > 0 ? ", and " : ""
        }${describe(onlyInSecond, "the second")}. ` +
        `They agree on ${totals.shared} of ${totals.first} and ${totals.second}. ` +
        `A disagreement here usually means the request admits more than one reading, ` +
        `which is a question for the person who wrote it rather than a plan to choose between.`
      : `two independent plans touch the same ${totals.shared} areas; nothing either one claims is ` +
        `unreached by the other. That is agreement about scope, not proof that either plan is right.`,
    totals,
  }
}

function describe(scopes: readonly string[], side: string): string {
  if (scopes.length === 0) return ""
  return `${side} writes ${scopes.join(", ")}, which ${side === "the first" ? "the second" : "the first"} never names`
}
