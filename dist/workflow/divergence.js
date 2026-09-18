import { inScope, normalizeScope } from "./scopes.js";
const scopesOf = (plan) => [
    ...new Set(plan.tasks.flatMap((task) => task.writeScopes).map(normalizeScope).filter(Boolean)),
];
function unreached(left, right) {
    return left
        .filter((scope) => !right.some((other) => inScope(scope, other) || inScope(other, scope)))
        .sort();
}
export function comparePlans(first, second) {
    const left = scopesOf(first);
    const right = scopesOf(second);
    const onlyInFirst = unreached(left, right);
    const onlyInSecond = unreached(right, left);
    const diverged = onlyInFirst.length > 0 || onlyInSecond.length > 0;
    const totals = {
        first: left.length,
        second: right.length,
        shared: left.length - onlyInFirst.length,
    };
    return {
        diverged,
        onlyInFirst,
        onlyInSecond,
        summary: diverged
            ? `two independent plans disagree about what this change touches: ` +
                `${describe(onlyInFirst, "the first")}${onlyInFirst.length > 0 && onlyInSecond.length > 0 ? ", and " : ""}${describe(onlyInSecond, "the second")}. ` +
                `They agree on ${totals.shared} of ${totals.first} and ${totals.second}. ` +
                `A disagreement here usually means the request admits more than one reading, ` +
                `which is a question for the person who wrote it rather than a plan to choose between.`
            : `two independent plans touch the same ${totals.shared} areas; nothing either one claims is ` +
                `unreached by the other. That is agreement about scope, not proof that either plan is right.`,
        totals,
    };
}
function describe(scopes, side) {
    if (scopes.length === 0)
        return "";
    return `${side} writes ${scopes.join(", ")}, which ${side === "the first" ? "the second" : "the first"} never names`;
}
