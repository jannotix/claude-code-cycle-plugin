const CRITICAL_MARKERS = [
    ["authentication", ["authentication", "login", "sign-in", "sign in", "oauth", "sso"]],
    ["authorization", ["authorization", "permission", "rbac", "access control"]],
    ["cryptography", ["cryptography", "encryption", "encrypt", "cipher", "hashing password"]],
    ["secrets", ["secret", "credential", "api key", "private key", "token store"]],
    ["persistence", ["database migration", "schema migration", "data migration"]],
    ["payments", ["payment", "billing", "invoice", "checkout", "subscription"]],
    ["personal-data", ["personal data", "gdpr", "pii"]],
    ["release", ["release", "deployment", "deploy", "publish the package"]],
    ["rewrite", ["rewrite", "large refactor", "migrate the whole", "re-architect"]],
];
const CRITICAL_PATHS = [
    ["persistence", /(^|\/)(migrations?|schema)(\/|$)|\.sql$/iu],
    ["packaging", /(^|\/)(installer|packaging|release|docker(file)?)(\/|$)/iu],
    ["deployment", /(^|\/)(deploy|k8s|helm|terraform)(\/|$)/iu],
    ["dependencies", /(^|\/)(package\.json|.*\.lock|Cargo\.toml|go\.mod|pyproject\.toml|requirements\.txt)$/iu],
    ["ci", /(^|\/)\.github\/workflows(\/|$)/iu],
];
const LARGE_CHANGE = 10;
export function route(request, affectedPaths, preference) {
    if (preference === "full") {
        return {
            critical: [],
            mode: "full",
            rationale: "the full cycle was requested explicitly",
            userPromoted: true,
        };
    }
    const critical = new Set();
    const normalized = request.toLowerCase();
    for (const [category, markers] of CRITICAL_MARKERS) {
        if (markers.some((marker) => normalized.includes(marker)))
            critical.add(category);
    }
    for (const path of affectedPaths) {
        for (const [category, pattern] of CRITICAL_PATHS) {
            if (pattern.test(path))
                critical.add(category);
        }
    }
    if (affectedPaths.length > LARGE_CHANGE)
        critical.add("breadth");
    if (preference === "quick") {
        return {
            critical: [...critical],
            mode: "quick",
            rationale: critical.size === 0
                ? "the quick route was requested and no critical signal was found"
                : `the quick route was requested despite ${[...critical].join(", ")}`,
            userPromoted: false,
        };
    }
    return {
        critical: [...critical],
        mode: critical.size === 0 ? "quick" : "full",
        rationale: critical.size === 0
            ? "no critical signal in the request or the affected paths"
            : `critical signals: ${[...critical].join(", ")}`,
        userPromoted: false,
    };
}
