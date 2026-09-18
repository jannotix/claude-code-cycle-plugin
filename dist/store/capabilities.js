import { randomBytes } from "node:crypto";
import { DIGEST_DOMAIN, digest } from "./ids.js";
export const CAPTURING_ROLES = ["functional_reviewer", "security_reviewer"];
export function issueCaptureCapabilities(database, workflowId, candidateId, now, roles = CAPTURING_ROLES) {
    const issued = [];
    for (const role of roles) {
        const existing = database.get("select digest from capture_capabilities where candidate_id = ? and role = ?", candidateId, role);
        if (existing !== undefined)
            continue;
        const token = randomBytes(24).toString("base64url");
        database.run(`insert into capture_capabilities (digest, workflow_id, candidate_id, role, issued_at)
       values (?, ?, ?, ?, ?)`, digest(DIGEST_DOMAIN.captureCapability, token), workflowId, candidateId, role, now);
        issued.push({ role, token });
    }
    return issued;
}
export function reissueCaptureCapabilities(database, workflowId, candidateId, now, roles = CAPTURING_ROLES) {
    for (const role of roles) {
        database.run("delete from capture_capabilities where candidate_id = ? and role = ?", candidateId, role);
    }
    return issueCaptureCapabilities(database, workflowId, candidateId, now, roles);
}
export function spentCaptureRoles(database, candidateId) {
    return database
        .all("select role from capture_capabilities where candidate_id = ? and consumed_at is not null", candidateId)
        .map((row) => row["role"]);
}
export function redeemCaptureCapability(database, candidateId, token, now) {
    const row = database.get("select candidate_id, consumed_at, role from capture_capabilities where digest = ?", digest(DIGEST_DOMAIN.captureCapability, token));
    if (row === undefined)
        return { reason: "unknown", role: null };
    if (String(row["candidate_id"]) !== candidateId)
        return { reason: "wrong_candidate", role: null };
    if (row["consumed_at"] !== null)
        return { reason: "consumed", role: null };
    database.run("update capture_capabilities set consumed_at = ? where digest = ?", now, digest(DIGEST_DOMAIN.captureCapability, token));
    return { reason: null, role: row["role"] };
}
export function issueReviewCapabilities(database, workflowId, candidateId, now, roles = CAPTURING_ROLES) {
    const issued = [];
    for (const role of roles) {
        const existing = database.get("select digest from review_capabilities where candidate_id = ? and role = ?", candidateId, role);
        if (existing !== undefined)
            continue;
        const token = randomBytes(24).toString("base64url");
        database.run(`insert into review_capabilities (digest, workflow_id, candidate_id, role, issued_at)
       values (?, ?, ?, ?, ?)`, digest(DIGEST_DOMAIN.reviewCapability, token), workflowId, candidateId, role, now);
        issued.push({ role, token });
    }
    return issued;
}
export function lookupReviewCapability(database, candidateId, token) {
    const row = database.get("select candidate_id, consumed_at, role from review_capabilities where digest = ?", digest(DIGEST_DOMAIN.reviewCapability, token));
    if (row === undefined)
        return { reason: "unknown", role: null };
    if (String(row["candidate_id"]) !== candidateId)
        return { reason: "wrong_candidate", role: null };
    if (row["consumed_at"] !== null)
        return { reason: "consumed", role: null };
    return { reason: null, role: row["role"] };
}
export function reissueReviewCapabilities(database, workflowId, candidateId, now, roles = CAPTURING_ROLES) {
    for (const role of roles) {
        database.run("delete from review_capabilities where candidate_id = ? and role = ?", candidateId, role);
    }
    return issueReviewCapabilities(database, workflowId, candidateId, now, roles);
}
export function consumeReviewCapability(database, token, now) {
    database.run("update review_capabilities set consumed_at = ? where digest = ?", now, digest(DIGEST_DOMAIN.reviewCapability, token));
}
