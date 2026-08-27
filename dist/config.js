export const ROLES = [
    "architect",
    "executor",
    "functional_reviewer",
    "security_reviewer",
    "arbiter",
    "operator",
];
export const INHERIT = "inherit";
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const STRICTNESS = ["advisory", "standard", "strict"];
const DEFAULT_EFFORT = {
    architect: "high",
    executor: "high",
    functional_reviewer: "high",
    security_reviewer: "high",
    arbiter: "high",
    operator: "low",
};
const DEFAULT_MODEL = {
    architect: INHERIT,
    executor: INHERIT,
    functional_reviewer: INHERIT,
    security_reviewer: INHERIT,
    arbiter: INHERIT,
    operator: "haiku",
};
const EFFORT_OPTION = {
    architect: "ARCHITECT_EFFORT",
    executor: "EXECUTOR_EFFORT",
    functional_reviewer: "REVIEWER_EFFORT",
    security_reviewer: "REVIEWER_EFFORT",
    arbiter: "ARBITER_EFFORT",
    operator: "OPERATOR_EFFORT",
};
const PREFIX = "CLAUDE_PLUGIN_OPTION_";
export function readConfiguration(environment = process.env) {
    const invalid = [];
    const roles = {};
    const known = new Set(["DATA_DIR", "GATE_STRICTNESS", "MAX_REPAIR_CYCLES", "SECURITY_PROOFS"]);
    for (const role of ROLES) {
        const modelKey = `${role.toUpperCase()}_MODEL`;
        known.add(modelKey).add(EFFORT_OPTION[role]);
        roles[role] = {
            effort: readEffort(environment, EFFORT_OPTION[role], DEFAULT_EFFORT[role], invalid),
            model: readModel(environment, modelKey, DEFAULT_MODEL[role], invalid),
        };
    }
    const delivered = Object.keys(environment).filter((key) => key.startsWith(PREFIX)).length;
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
    };
}
function readSecurityProofs(environment, invalid) {
    const raw = option(environment, "SECURITY_PROOFS").toLowerCase();
    if (raw === "")
        return false;
    if (raw === "on" || raw === "off")
        return raw === "on";
    invalid.push(`SECURITY_PROOFS=${raw} is not on or off; proofs stay off`);
    return false;
}
function option(environment, key) {
    return (environment[`${PREFIX}${key}`] ?? "").trim();
}
function readModel(environment, key, fallback, invalid) {
    const value = option(environment, key);
    if (!value)
        return fallback;
    if (value.length > 128 || /\s/u.test(value)) {
        invalid.push(`${key} is not a valid model identifier`);
        return fallback;
    }
    return value;
}
function readEffort(environment, key, fallback, invalid) {
    const value = option(environment, key).toLowerCase();
    if (!value)
        return fallback;
    if (!EFFORTS.includes(value)) {
        invalid.push(`${key} must be one of ${EFFORTS.join(", ")}`);
        return fallback;
    }
    return value;
}
function readStrictness(environment, invalid) {
    const value = option(environment, "GATE_STRICTNESS").toLowerCase();
    if (!value)
        return "standard";
    if (!STRICTNESS.includes(value)) {
        invalid.push(`GATE_STRICTNESS must be one of ${STRICTNESS.join(", ")}`);
        return "standard";
    }
    return value;
}
function readRepairCycles(environment, invalid) {
    const value = option(environment, "MAX_REPAIR_CYCLES");
    if (!value)
        return 5;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
        invalid.push("MAX_REPAIR_CYCLES must be an integer between 1 and 20");
        return 5;
    }
    return parsed;
}
