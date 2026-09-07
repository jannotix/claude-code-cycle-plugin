import type { Database } from "./database.ts"

/**
 * What the store holds and what of it can be given back. Nothing here deletes a record: a candidate
 * row, its manifest, its digests, the evidence against it and the history entries that name it all
 * stay exactly where they are. Only the retained *bytes* of a candidate's files go, and only for a
 * workflow that has finished — where those bytes are either in the repository, because the
 * candidate was delivered, or deliberately not, because it was cancelled.
 *
 * That is the whole of the policy, and the reason it is safe: `candidate_files.digest` survives the
 * pruning, so what the bytes were remains provable after they are gone. A retention that dropped
 * rows would break the chain this product exists to keep.
 */
export interface StoreUsage {
  /** Bytes of candidate payloads still retained, and how many rows carry them. */
  readonly retained: { readonly bytes: number; readonly files: number }
  /** The subset of those belonging to workflows that have reached a terminal state. */
  readonly prunable: {
    readonly bytes: number
    readonly candidates: number
    readonly files: number
    readonly workflows: number
  }
  readonly counts: {
    readonly candidates: number
    readonly historyEntries: number
    readonly workflows: number
  }
}

const TERMINAL = ["cancelled", "completed"]

/** Candidates of finished workflows, which is the only set retention touches. */
const PRUNABLE = `
  select f.rowid as row_id, f.candidate_id as candidate_id, c.workflow_id as workflow_id,
         length(f.payload) as bytes
  from candidate_files f
  join candidates c on c.id = f.candidate_id
  join workflows w on w.id = c.workflow_id
  where f.payload is not null and w.project_id = ? and w.state in ('cancelled', 'completed')
`

export function storeUsage(database: Database, projectId: string): StoreUsage {
  const retained = database.get<{ bytes: number | null; files: number }>(
    `select coalesce(sum(length(f.payload)), 0) as bytes, count(*) as files
     from candidate_files f
     join candidates c on c.id = f.candidate_id
     join workflows w on w.id = c.workflow_id
     where f.payload is not null and w.project_id = ?`,
    projectId,
  )

  const rows = database.all<{ bytes: number; candidate_id: string; workflow_id: string }>(
    PRUNABLE,
    projectId,
  )

  const counts = database.get<{ candidates: number; workflows: number }>(
    `select count(distinct w.id) as workflows, count(distinct c.id) as candidates
     from workflows w left join candidates c on c.workflow_id = w.id
     where w.project_id = ?`,
    projectId,
  )
  const history = database.get<{ entries: number }>(
    "select count(*) as entries from history where project_id = ?",
    projectId,
  )

  return {
    counts: {
      candidates: counts?.candidates ?? 0,
      historyEntries: history?.entries ?? 0,
      workflows: counts?.workflows ?? 0,
    },
    prunable: {
      bytes: rows.reduce((total, row) => total + (row.bytes ?? 0), 0),
      candidates: new Set(rows.map((row) => row.candidate_id)).size,
      files: rows.length,
      workflows: new Set(rows.map((row) => row.workflow_id)).size,
    },
    retained: { bytes: retained?.bytes ?? 0, files: retained?.files ?? 0 },
  }
}

/**
 * Drops the retained bytes of finished workflows' candidates and returns what was given back. The
 * rows stay, with their digests: the record of what was frozen is not what takes the room.
 */
export function pruneCandidateBytes(
  database: Database,
  projectId: string,
): { bytes: number; files: number } {
  const before = storeUsage(database, projectId).prunable

  database.transaction(() => {
    database.run(
      `update candidate_files set payload = null
       where payload is not null and candidate_id in (
         select c.id from candidates c
         join workflows w on w.id = c.workflow_id
         where w.project_id = ? and w.state in (${TERMINAL.map(() => "?").join(", ")})
       )`,
      projectId,
      ...TERMINAL,
    )
  })

  return { bytes: before.bytes, files: before.files }
}
