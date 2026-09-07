const TERMINAL = ["cancelled", "completed"];
const PRUNABLE = `
  select f.rowid as row_id, f.candidate_id as candidate_id, c.workflow_id as workflow_id,
         length(f.payload) as bytes
  from candidate_files f
  join candidates c on c.id = f.candidate_id
  join workflows w on w.id = c.workflow_id
  where f.payload is not null and w.project_id = ? and w.state in ('cancelled', 'completed')
`;
export function storeUsage(database, projectId) {
    const retained = database.get(`select coalesce(sum(length(f.payload)), 0) as bytes, count(*) as files
     from candidate_files f
     join candidates c on c.id = f.candidate_id
     join workflows w on w.id = c.workflow_id
     where f.payload is not null and w.project_id = ?`, projectId);
    const rows = database.all(PRUNABLE, projectId);
    const counts = database.get(`select count(distinct w.id) as workflows, count(distinct c.id) as candidates
     from workflows w left join candidates c on c.workflow_id = w.id
     where w.project_id = ?`, projectId);
    const history = database.get("select count(*) as entries from history where project_id = ?", projectId);
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
    };
}
export function pruneCandidateBytes(database, projectId) {
    const before = storeUsage(database, projectId).prunable;
    database.transaction(() => {
        database.run(`update candidate_files set payload = null
       where payload is not null and candidate_id in (
         select c.id from candidates c
         join workflows w on w.id = c.workflow_id
         where w.project_id = ? and w.state in (${TERMINAL.map(() => "?").join(", ")})
       )`, projectId, ...TERMINAL);
    });
    return { bytes: before.bytes, files: before.files };
}
