import { isSupported } from "../intel/languages.ts"
import { impactOf } from "../intel/query.ts"
import type { Database } from "../store/database.ts"
import { graphSize, incomingCounts, indexedPaths, nodesInFiles } from "../store/graph.ts"

/**
 * What a change can reach, and — the part that matters more — how sure of that we are.
 *
 * The reach feeds the evidence policy, never the routing: adding paths to the set the gate rules
 * are matched against can only insert gates, never remove one, so this is promote-only by
 * construction and a wrong answer costs a proof that was not needed rather than a proof that was.
 *
 * "Resolved" is claimed narrowly, because the failure this exists to avoid is not "I don't know" —
 * it is "I know", and being wrong. Every changed file the graph models must be one the index
 * actually holds, or the answer is `unresolved` with the reason named.
 */
export interface Reach {
  readonly confidence: "resolved" | "unresolved"
  /** Symbols the change touches that many other files consume, when the set was too wide to expand. */
  readonly hubs: readonly { readonly consumers: number; readonly name: string; readonly path: string }[]
  /**
   * Changed files in a language the graph has no grammar for. Not uncertainty in the same sense:
   * the model never covered them and says so, rather than a gap in coverage it should have had.
   */
  readonly outside: readonly string[]
  /** Files the change reaches but does not touch. Empty when unresolved or truncated. */
  readonly paths: readonly string[]
  /** Why the reach is unresolved, and what would resolve it. Null when it is resolved. */
  readonly reason: string | null
  /** True when the reached set was too wide to expand the evidence surface with. */
  readonly truncated: boolean
}

/**
 * How wide a reached set may get before it stops being information. Past this the answer is not
 * "each of these needs a proof" but "this change touches a hub", which is a finding for the
 * reviewers rather than several hundred gates. Whichever is larger: a small repository has no hubs
 * to speak of, and a large one should not be judged by an absolute count.
 */
const MAX_REACHED = 200
const MAX_REACHED_PROPORTION = 0.1

/** Depth 2: a direct consumer and its consumer. Past that the reached set is the repository. */
const DEPTH = 2

export function reachOf(
  database: Database,
  projectId: string,
  changedPaths: readonly string[],
): Reach {
  // Split first, because the two say different things and only one of them is a gap.
  const modelled = changedPaths.filter((path) => isSupported(path))
  const outside = changedPaths.filter((path) => !isSupported(path))
  const unknown = (reason: string): Reach => ({
    confidence: "unresolved",
    hubs: [],
    outside,
    paths: [],
    reason,
    truncated: false,
  })

  const size = graphSize(database, projectId)
  if (size.files === 0) {
    return unknown(
      "this project has never been indexed, so what the change reaches is unknown. Run " +
        "/cycle:index to resolve it.",
    )
  }

  const indexed = new Set(indexedPaths(database, projectId, modelled))
  const missing = modelled.filter((path) => !indexed.has(path))
  if (missing.length > 0) {
    return unknown(
      `the index does not hold ${missing.length} of the changed files, so what they reach is ` +
        `unknown: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}. Run ` +
        "/cycle:index to resolve it.",
    )
  }

  const touched = new Set(changedPaths)
  const paths = [
    ...new Set(impactOf(database, projectId, changedPaths, DEPTH).map((node) => node.path)),
  ]
    .filter((path) => !touched.has(path))
    .sort()

  const ceiling = Math.max(MAX_REACHED, Math.floor(size.files * MAX_REACHED_PROPORTION))
  if (paths.length > ceiling) {
    return {
      confidence: "resolved",
      hubs: hubsOf(database, projectId, changedPaths),
      outside,
      paths: [],
      reason: null,
      truncated: true,
    }
  }

  return { confidence: "resolved", hubs: [], outside, paths, reason: null, truncated: false }
}

/** The touched symbols with the most consumers, which is what "this is a hub" means concretely. */
function hubsOf(
  database: Database,
  projectId: string,
  changedPaths: readonly string[],
): Reach["hubs"] {
  const seeds = nodesInFiles(database, projectId, changedPaths)
  const counts = incomingCounts(
    database,
    seeds.map((node) => node.id),
  )
  return seeds
    .map((node) => ({ consumers: counts.get(node.id) ?? 0, name: node.name, path: node.path }))
    .filter((hub) => hub.consumers > 0)
    .sort((left, right) => right.consumers - left.consumers)
    .slice(0, 10)
}
