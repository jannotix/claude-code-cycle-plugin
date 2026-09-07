import { isSupported } from "../intel/languages.js";
import { impactOf } from "../intel/query.js";
import { graphSize, incomingCounts, indexedPaths, nodesInFiles } from "../store/graph.js";
const MAX_REACHED = 200;
const MAX_REACHED_PROPORTION = 0.1;
const DEPTH = 2;
export function reachOf(database, projectId, changedPaths) {
    const modelled = changedPaths.filter((path) => isSupported(path));
    const outside = changedPaths.filter((path) => !isSupported(path));
    const unknown = (reason) => ({
        confidence: "unresolved",
        hubs: [],
        outside,
        paths: [],
        reason,
        truncated: false,
    });
    const size = graphSize(database, projectId);
    if (size.files === 0) {
        return unknown("this project has never been indexed, so what the change reaches is unknown. Run " +
            "/cycle:index to resolve it.");
    }
    const indexed = new Set(indexedPaths(database, projectId, modelled));
    const missing = modelled.filter((path) => !indexed.has(path));
    if (missing.length > 0) {
        return unknown(`the index does not hold ${missing.length} of the changed files, so what they reach is ` +
            `unknown: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}. Run ` +
            "/cycle:index to resolve it.");
    }
    const touched = new Set(changedPaths);
    const paths = [
        ...new Set(impactOf(database, projectId, changedPaths, DEPTH).map((node) => node.path)),
    ]
        .filter((path) => !touched.has(path))
        .sort();
    const ceiling = Math.max(MAX_REACHED, Math.floor(size.files * MAX_REACHED_PROPORTION));
    if (paths.length > ceiling) {
        return {
            confidence: "resolved",
            hubs: hubsOf(database, projectId, changedPaths),
            outside,
            paths: [],
            reason: null,
            truncated: true,
        };
    }
    return { confidence: "resolved", hubs: [], outside, paths, reason: null, truncated: false };
}
function hubsOf(database, projectId, changedPaths) {
    const seeds = nodesInFiles(database, projectId, changedPaths);
    const counts = incomingCounts(database, seeds.map((node) => node.id));
    return seeds
        .map((node) => ({ consumers: counts.get(node.id) ?? 0, name: node.name, path: node.path }))
        .filter((hub) => hub.consumers > 0)
        .sort((left, right) => right.consumers - left.consumers)
        .slice(0, 10);
}
