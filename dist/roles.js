import { INHERIT } from "./config.js";
export const ROLE_AGENT = {
    architect: "cycle:architect",
    executor: "cycle:executor",
    functional_reviewer: "cycle:functional-reviewer",
    security_reviewer: "cycle:security-reviewer",
    arbiter: "cycle:arbiter",
    operator: "cycle:operator",
};
export const CONSULTATION = {
    architect: "architect",
    executor: "executor",
    judge: "arbiter",
    review: "functional_reviewer",
    security: "security_reviewer",
};
const CONSULTATION_AGENT = {
    executor: "cycle:executor-advisor",
};
const SUBAGENT_MODELS = ["fable", "haiku", "opus", "sonnet"];
export function subagentModelFor(model) {
    if (model === null)
        return null;
    const name = model.toLowerCase();
    return SUBAGENT_MODELS.find((family) => name === family || name.includes(family)) ?? null;
}
export function resolveRole(configuration, role) {
    const configured = configuration.roles[role];
    const inherits = configured.model === INHERIT;
    const model = inherits ? null : configured.model;
    return {
        agent: ROLE_AGENT[role],
        effort: configured.effort,
        inherits,
        model,
        role,
        subagentModel: subagentModelFor(model),
    };
}
export function resolveConsultation(configuration, consultation) {
    const role = CONSULTATION[consultation];
    if (role === undefined) {
        throw new Error(`unknown consultation: ${consultation}`);
    }
    const resolved = resolveRole(configuration, role);
    const agent = CONSULTATION_AGENT[consultation];
    return agent === undefined ? resolved : { ...resolved, agent };
}
export function resolveCouncil(configuration) {
    const architect = resolveRole(configuration, "architect");
    const { chairman, members, size } = configuration.council;
    const seat = (id, model) => ({
        agent: ROLE_AGENT.architect,
        id,
        inherits: model === null,
        model,
        subagentModel: subagentModelFor(model),
    });
    const roster = members.length > 0
        ? members.map((model, index) => seat(`member-${index + 1}`, model))
        : Array.from({ length: size }, (_, index) => seat(`member-${index + 1}`, architect.model));
    const distinct = new Set(roster.map((member) => member.model ?? "inherit"));
    const spread = distinct.size > 1 ? "models" : "repeated";
    const unreachable = roster
        .filter((member) => member.model !== null && member.subagentModel === null)
        .map((member) => member.model);
    const warnings = [];
    if (spread === "repeated") {
        warnings.push(`every seat runs the same model, so the answers are independent but the blind spots are not: ` +
            `agreement between them is not corroboration. Set council_models to a comma-separated list ` +
            `to change that.`);
    }
    if (unreachable.length > 0) {
        warnings.push(`the subagent tool accepts a model family, not an identifier, and nothing it accepts matches ` +
            `${unreachable.join(", ")}; ${unreachable.length === 1 ? "that seat runs" : "those seats run"} ` +
            `on the session model instead. The gateway path in docs/multi-provider.md is what makes a ` +
            `third-party model reachable.`);
    }
    return {
        chairman: seat("chairman", chairman ?? architect.model),
        effort: architect.effort,
        members: roster,
        spread,
        warning: warnings.length === 0 ? null : warnings.join(" "),
    };
}
const READ_ONLY_TOOLS = [
    "Write",
    "Edit",
    "NotebookEdit",
    "Bash",
    "Agent",
    "Task",
];
export const BOUNDARIES = [
    {
        cannot: READ_ONLY_TOOLS,
        may: "read the repository and produce a plan; it never implements and never approves",
        role: "architect",
        writes: false,
    },
    {
        cannot: ["Agent", "Task"],
        may: "modify files inside the write scopes of its assigned task, and run verification commands; " +
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
        may: "read the frozen candidate and its evidence, and submit a proof the control plane runs in a " +
            "disposable copy; it cannot report a vulnerability it did not demonstrate, and it cannot " +
            "approve",
        role: "security_reviewer",
        writes: false,
    },
    {
        cannot: READ_ONLY_TOOLS,
        may: "judge the frozen candidate against the immutable original request and vote to approve; the " +
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
];
