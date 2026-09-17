import { randomBytes } from "node:crypto"

import type { Database, Row } from "./database.ts"
import { DIGEST_DOMAIN, digest } from "./ids.ts"

/** The roles that may prove the interface layer. The executor is not one of them, by construction. */
export const CAPTURING_ROLES = ["functional_reviewer", "security_reviewer"] as const

export type CapturingRole = (typeof CAPTURING_ROLES)[number]

export interface CaptureCapability {
  readonly role: CapturingRole
  /** Returned once, at issue. Only its digest is kept, so a stolen store yields nothing usable. */
  readonly token: string
}

/**
 * Mints one secret per reviewing role for this candidate. Over stdio the plane cannot tell who is
 * calling — it reads a line — so a submission that names its own role is a claim, and the party the
 * gate exists to check can make it. Holding a secret the plane issued to one role and delivered
 * only to that role is something the executor cannot do: the secrets are minted after its work is
 * frozen, and no agent can read another's prompt.
 *
 * Re-issuing for the same candidate returns nothing new: a capability that could be re-minted on
 * demand would be no capability at all.
 */
export function issueCaptureCapabilities(
  database: Database,
  workflowId: string,
  candidateId: string,
  now: number,
): CaptureCapability[] {
  const issued: CaptureCapability[] = []
  for (const role of CAPTURING_ROLES) {
    const existing = database.get<Row>(
      "select digest from capture_capabilities where candidate_id = ? and role = ?",
      candidateId,
      role,
    )
    if (existing !== undefined) continue

    const token = randomBytes(24).toString("base64url")
    database.run(
      `insert into capture_capabilities (digest, workflow_id, candidate_id, role, issued_at)
       values (?, ?, ?, ?, ?)`,
      digest(DIGEST_DOMAIN.captureCapability, token),
      workflowId,
      candidateId,
      role,
      now,
    )
    issued.push({ role, token })
  }
  return issued
}

export type Redemption =
  | { readonly reason: "consumed" | "unknown" | "wrong_candidate"; readonly role: null }
  | { readonly reason: null; readonly role: CapturingRole }

/**
 * Spends one capability and reports which role held it. The role is read from the record and never
 * from the caller, which is the whole point: a claim is not a credential.
 */
export function redeemCaptureCapability(
  database: Database,
  candidateId: string,
  token: string,
  now: number,
): Redemption {
  const row = database.get<Row>(
    "select candidate_id, consumed_at, role from capture_capabilities where digest = ?",
    digest(DIGEST_DOMAIN.captureCapability, token),
  )
  if (row === undefined) return { reason: "unknown", role: null }
  if (String(row["candidate_id"]) !== candidateId) return { reason: "wrong_candidate", role: null }
  if (row["consumed_at"] !== null) return { reason: "consumed", role: null }

  database.run(
    "update capture_capabilities set consumed_at = ? where digest = ?",
    now,
    digest(DIGEST_DOMAIN.captureCapability, token),
  )
  return { reason: null, role: row["role"] as CapturingRole }
}

/**
 * The same mechanism for the verdict itself, which is where it was missing.
 *
 * `submit_review` took the role as an argument. Over stdio the plane reads a line and cannot tell
 * who wrote it, so one client could send both verdicts naming a different role each time and the
 * plane would record two reviews that were never independent — the separation the whole design
 * rests on, defeated by a string. A secret minted per role at freeze and handed to that role alone
 * is something only that role holds.
 *
 * What this proves and what it does not, stated because the difference matters when the number is
 * quoted: holding the token proves possession of something the freeze returned and delivered to one
 * role. It closes impersonation by the executor, by another workflow, and by any session that never
 * received it. It does not prove authorship of the verdict — the orchestrator relays both, so the
 * plane cannot distinguish a relayed judgement from an invented one, and nothing carried over stdio
 * can. The same caveat already applies to the capture capability above.
 */
export function issueReviewCapabilities(
  database: Database,
  workflowId: string,
  candidateId: string,
  now: number,
): CaptureCapability[] {
  const issued: CaptureCapability[] = []
  for (const role of CAPTURING_ROLES) {
    const existing = database.get<Row>(
      "select digest from review_capabilities where candidate_id = ? and role = ?",
      candidateId,
      role,
    )
    if (existing !== undefined) continue

    const token = randomBytes(24).toString("base64url")
    database.run(
      `insert into review_capabilities (digest, workflow_id, candidate_id, role, issued_at)
       values (?, ?, ?, ?, ?)`,
      digest(DIGEST_DOMAIN.reviewCapability, token),
      workflowId,
      candidateId,
      role,
      now,
    )
    issued.push({ role, token })
  }
  return issued
}

/**
 * Reads which role holds this secret without spending it. Separate from consuming because the role
 * decides how the verdict is parsed — the security reviewer may not claim an undemonstrated
 * vulnerability — so it has to be known before parsing, while a verdict the plane refuses as
 * malformed must stay retryable with the same secret.
 */
export function lookupReviewCapability(
  database: Database,
  candidateId: string,
  token: string,
): Redemption {
  const row = database.get<Row>(
    "select candidate_id, consumed_at, role from review_capabilities where digest = ?",
    digest(DIGEST_DOMAIN.reviewCapability, token),
  )
  if (row === undefined) return { reason: "unknown", role: null }
  if (String(row["candidate_id"]) !== candidateId) return { reason: "wrong_candidate", role: null }
  if (row["consumed_at"] !== null) return { reason: "consumed", role: null }

  return { reason: null, role: row["role"] as CapturingRole }
}

/**
 * Mints a fresh set, invalidating whatever was issued before.
 *
 * A run that resumes after the application restarted never saw the freeze reply, so it holds no
 * secret and could not submit a review at all — which would have taken `/cycle:resume` away from
 * the full route entirely. The caller decides when this is allowed; what belongs here is that the
 * old rows are deleted, so a re-issue invalidates the previous tokens rather than adding a second
 * valid set.
 *
 * This is where the guarantee is at its weakest, and the weakness is deliberate rather than
 * overlooked: whoever can ask the plane at the right moment can obtain a capability. It still rules
 * out the executor, whose work is finished and frozen before reviews open, and every party that
 * cannot reach this plane at all. The caller records the re-issue in the history, so a reader can
 * see that it happened rather than infer it.
 */
export function reissueReviewCapabilities(
  database: Database,
  workflowId: string,
  candidateId: string,
  now: number,
): CaptureCapability[] {
  database.run("delete from review_capabilities where candidate_id = ?", candidateId)
  return issueReviewCapabilities(database, workflowId, candidateId, now)
}

/** Spends the secret. Called once the verdict has parsed, so a refusal costs nothing. */
export function consumeReviewCapability(database: Database, token: string, now: number): void {
  database.run(
    "update review_capabilities set consumed_at = ? where digest = ?",
    now,
    digest(DIGEST_DOMAIN.reviewCapability, token),
  )
}
