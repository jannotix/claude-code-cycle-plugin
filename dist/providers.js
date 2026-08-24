import { INHERIT, ROLES } from "./config.js";
const ANTHROPIC_DEFAULT_HOST = "api.anthropic.com";
const JUDGING = [
    "architect",
    "executor",
    "functional_reviewer",
    "security_reviewer",
    "arbiter",
];
export function describeProviders(configuration, environment = process.env) {
    const endpoint = hostOf(environment["ANTHROPIC_BASE_URL"]);
    const gateway = endpoint !== null && endpoint !== ANTHROPIC_DEFAULT_HOST;
    const credentialVariable = credential(environment);
    const roles = {};
    for (const role of ROLES) {
        const { effort, model } = configuration.roles[role];
        const provider = providerOf(model, gateway);
        roles[role] = {
            billing: billingOf(provider, credentialVariable !== null, gateway),
            configured: model,
            effort,
            provider,
            resolved: model === INHERIT ? "session model" : model,
        };
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
            : [...new Set(JUDGING.map((role) => roles[role].configured))]
                .filter((model) => model !== INHERIT && !servedByAnthropic(model))
                .sort(),
    };
}
function providerOf(model, gateway) {
    if (model === INHERIT)
        return "session";
    if (prefixed(model))
        return model.slice(0, model.indexOf("/")).toLowerCase();
    return gateway ? "gateway" : "anthropic";
}
function billingOf(provider, credentialSet, gateway) {
    if (credentialSet)
        return "gateway-credential";
    if (!gateway)
        return "subscription";
    return provider === "session" || provider === "anthropic" ? "subscription" : "gateway-held";
}
const ANTHROPIC_FAMILIES = ["claude", "opus", "sonnet", "haiku", "fable"];
function servedByAnthropic(model) {
    const name = model.toLowerCase();
    return ANTHROPIC_FAMILIES.some((family) => name.startsWith(family));
}
function prefixed(model) {
    const slash = model.indexOf("/");
    return slash > 0 && slash < model.length - 1;
}
function credential(environment) {
    for (const key of ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"]) {
        if (environment[key]?.trim())
            return key;
    }
    return null;
}
function hostOf(value) {
    const raw = value?.trim();
    if (!raw)
        return null;
    try {
        return new URL(raw).host;
    }
    catch {
        return raw.slice(0, 64);
    }
}
