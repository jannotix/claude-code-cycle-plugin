import { inspectAccessibility } from "./accessibility.js";
import { renderFindings } from "./engine.js";
import { DEFAULT_TIMEOUT_SECONDS, evidenceFor } from "./gates.js";
const FLOW = {
    executor: { kind: "design" },
    invocation: "",
    kind: "browser",
    mandatory: true,
    name: "browser:affected-user-flow",
    precondition: "the affected user flow was driven in the browser and its tree captured",
    timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
};
const ACCESSIBILITY = {
    executor: { kind: "design" },
    invocation: "",
    kind: "browser",
    mandatory: true,
    name: "accessibility:affected-user-flow",
    precondition: "the captured accessibility tree was inspected by deterministic detectors",
    timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
};
export function browserEvidence(snapshot, now = Date.now()) {
    const findings = inspectAccessibility(snapshot);
    const blocking = findings.filter((finding) => finding.severity === "high");
    const nodes = countNodes(snapshot);
    return {
        evidence: [
            evidenceFor(FLOW, now, "passed", {
                output: `flow "${snapshot.capturedFlow}" driven at ${snapshot.url}, ${nodes} accessibility nodes captured`,
            }),
            evidenceFor(ACCESSIBILITY, now, blocking.length === 0 ? "passed" : "failed", {
                output: renderFindings(`${nodes} accessibility nodes inspected`, findings),
            }),
        ],
        findings,
    };
}
function countNodes(snapshot) {
    const count = (nodes) => nodes.reduce((total, node) => total + 1 + count(node.children), 0);
    return count(snapshot.nodes);
}
